import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// Simple in-memory cache for the Google Sheets OAuth access token
let cachedSheetsToken: string | null = null;

/**
 * Trigger Google OAuth popup with Google Sheets scope to acquire/verify access token
 */
export async function authenticateGoogleSheets(): Promise<string> {
  if (cachedSheetsToken) {
    return cachedSheetsToken;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  // Request full spreadsheets modify permission
  provider.addScope('https://www.googleapis.com/auth/spreadsheets');
  
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan access token dari Firebase Google Auth');
    }
    cachedSheetsToken = credential.accessToken;
    return cachedSheetsToken;
  } catch (error: any) {
    console.error('OAuth error for Google Sheets:', error);
    throw error;
  }
}

/**
 * Reset OAuth token cache
 */
export function clearSheetsTokenCache() {
  cachedSheetsToken = null;
}

interface ExportTransaction {
  id: string;
  description: string;
  amount: number;
  date: any;
  category?: string;
  createdByAdmin?: string;
  sourceRecipient?: string;
}

interface ExportVerifiedPayment {
  id: string;
  memberId: string;
  memberName: string;
  memberType: string;
  month: string;
  method: string;
  date: any;
  bank?: string;
  adminName?: string;
  amount: number;
}

interface ExportTotals {
  totalSaldoAwal: number;
  totalIuran: number;
  totalPemasukanLainnya: number;
  totalPengeluaran: number;
  totalSaldoAkhir: number;
}

const MONTH_NAMES_INDO: Record<string, string> = {
  Jan: 'Januari', Feb: 'Februari', Mar: 'Maret', Apr: 'April',
  May: 'Mei', Jun: 'Juni', Jul: 'Juli', Aug: 'Agustus',
  Sep: 'September', Oct: 'Oktober', Nov: 'November', Dec: 'Desember'
};

const formatReportDate = (timestamp: any): string => {
  if (!timestamp) return '-';
  try {
    let dateObj: Date;
    if (timestamp instanceof Date) {
      dateObj = timestamp;
    } else if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      dateObj = timestamp.toDate();
    } else if (typeof timestamp === 'object' && timestamp.seconds) {
      dateObj = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      dateObj = new Date(timestamp);
    } else {
      dateObj = new Date();
    }
    return dateObj.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    return '-';
  }
};

/**
 * Creates and formats a Google Spreadsheet with multiple tabs for summary and logs
 */
export async function createAndPopulateSpreadsheet(
  monthKey: string,
  year: string,
  transactions: ExportTransaction[],
  verifiedPayments: ExportVerifiedPayment[],
  totals: ExportTotals,
  onProgress?: (status: string) => void
): Promise<string> {
  const token = await authenticateGoogleSheets();
  const monthName = monthKey === 'all' ? 'Semua Bulan' : (MONTH_NAMES_INDO[monthKey] || monthKey);
  const yearName = year === 'all' ? 'Semua Tahun' : year;
  const title = `Laporan Keuangan Kas SNJ Logistik - ${monthName} ${yearName}`;

  let spreadsheetId = '';
  let spreadsheetUrl = '';
  let sData: any = null;

  try {
    const sheetsDocRef = doc(db, 'settings', 'google_sheets');
    const sheetsSnapshot = await getDoc(sheetsDocRef);
    if (sheetsSnapshot.exists()) {
      spreadsheetId = sheetsSnapshot.data().spreadsheetId || '';
    }
  } catch (err) {
    console.warn('Failed to read google_sheets settings in export worker:', err);
  }

  if (spreadsheetId) {
    if (onProgress) onProgress('Memeriksa lembar kerja yang ada di spreadsheet...');
    
    // Check if spreadsheet exists and fetch sheet titles
    const getResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!getResponse.ok) {
      console.warn(`Spreadsheet ID ${spreadsheetId} tidak ditemukan atau tidak dapat diakses. Membuat spreadsheet baru sebagai fallback...`);
      spreadsheetId = ''; // Reset so we create a new one
    } else {
      sData = await getResponse.json();
      spreadsheetUrl = sData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      
      // Determine what sheets we need to add
      const existingTitles = new Set(sData.sheets?.map((s: any) => s.properties?.title) || []);
      const sheetsToAdd = [];
      
      if (!existingTitles.has('Ringkasan Laporan')) {
        sheetsToAdd.push({
          addSheet: { properties: { title: 'Ringkasan Laporan', gridProperties: { columnCount: 10, rowCount: 100 } } }
        });
      }
      if (!existingTitles.has('Mutasi Kas Manual')) {
        sheetsToAdd.push({
          addSheet: { properties: { title: 'Mutasi Kas Manual', gridProperties: { columnCount: 10, rowCount: 1000 } } }
        });
      }
      if (!existingTitles.has('Penerimaan Iuran Anggota')) {
        sheetsToAdd.push({
          addSheet: { properties: { title: 'Penerimaan Iuran Anggota', gridProperties: { columnCount: 12, rowCount: 1500 } } }
        });
      }

      // If we need to add sheets, do a batchUpdate
      if (sheetsToAdd.length > 0) {
        if (onProgress) onProgress('Membuat tab lembar kerja yang belum ada...');
        const addSheetsResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ requests: sheetsToAdd })
        });
        
        if (addSheetsResponse.ok) {
          // Re-fetch spreadsheet metadata to get newborn sheetIds for styling
          const freshResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (freshResp.ok) {
            sData = await freshResp.json();
          }
        }
      }

      // Clear existing values to prevent leftover rows
      if (onProgress) onProgress('Membersihkan baris data sebelumnya...');
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ranges: [
            "'Ringkasan Laporan'!A1:Z100",
            "'Mutasi Kas Manual'!A1:Z5000",
            "'Penerimaan Iuran Anggota'!A1:Z5000"
          ]
        })
      });
    }
  }

  // If no spreadsheet ID was found or getResponse failed, CREATE a new one
  if (!spreadsheetId) {
    if (onProgress) onProgress('Membuat dokumen spreadsheet baru di akun Google Anda...');
    
    const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: title
        },
        sheets: [
          {
            properties: {
              title: 'Ringkasan Laporan',
              gridProperties: { columnCount: 10, rowCount: 100 }
            }
          },
          {
            properties: {
              title: 'Mutasi Kas Manual',
              gridProperties: { columnCount: 10, rowCount: 1000 }
            }
          },
          {
            properties: {
              title: 'Penerimaan Iuran Anggota',
              gridProperties: { columnCount: 12, rowCount: 1500 }
            }
          }
        ]
      })
    });

    if (!createResponse.ok) {
      const err = await createResponse.json();
      console.error('Create Spreadsheet API error:', err);
      throw new Error(err?.error?.message || 'Gagal membuat Google Spreadsheet.');
    }

    sData = await createResponse.json();
    spreadsheetId = sData.spreadsheetId;
    spreadsheetUrl = sData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    // Automatically save this new spreadsheetId to settings so next sync will target the same spreadsheet!
    try {
      const sheetsDocRef = doc(db, 'settings', 'google_sheets');
      await setDoc(sheetsDocRef, {
        spreadsheetId: spreadsheetId,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      console.log('Saved new automatic spreadsheetId:', spreadsheetId);
    } catch (dbErr) {
      console.warn('Failed to automatically record newborn spreadsheetId in Firestore settings:', dbErr);
    }
  }

  if (onProgress) onProgress('Menghitung data dan mengisi lembar kerja...');

  // 2. Prepare Data Packages
  const ringkasanValues = [
    ['LAPORAN RINGKASAN REKAPITULASI KAS - SNJ LOGISTIK'],
    [`Periode Laporan ke: ${monthName} ${yearName}`],
    [`Tanggal Ekspor: ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID')} WIB`],
    [],
    ['Uraian Transaksi', 'Nominal (Rupiah)', 'Presentase / Deskripsi'],
    ['Saldo Awal Periode', totals.totalSaldoAwal, 'Modal Awal Kas'],
    ['Total Penerimaan Iuran Anggota', totals.totalIuran, 'Hasil checklist bulanan'],
    ['Total Penerimaan Lain-Lain', totals.totalPemasukanLainnya, 'Pemasukan manual luar iuran'],
    ['Total Pengeluaran Kas', totals.totalPengeluaran, 'Pengeluaran kas operasional'],
    ['SALDO AKHIR REKAPITULASI', totals.totalSaldoAkhir, 'Saldo aktif kas bersih']
  ];

  const mutasiValues = [
    ['DAFTAR MUTASI KAS (MANUAL PEMASUKAN & PENGELUARAN)'],
    [`Periode: ${monthName} ${yearName}`],
    [],
    ['No', 'Tanggal', 'Kategori', 'Sumber / Penerima', 'Keterangan', 'Nominal', 'Admin Pencatat'],
    ...transactions.map((tx, idx) => [
      idx + 1,
      formatReportDate(tx.date),
      tx.category === 'pemasukan' ? 'Pemasukan' : tx.category === 'saldo_awal' ? 'Saldo Awal' : 'Pengeluaran',
      tx.sourceRecipient || '-',
      tx.description || '-',
      (tx.category === 'pemasukan' || tx.category === 'saldo_awal') ? tx.amount : -tx.amount,
      tx.createdByAdmin || '-'
    ])
  ];
  if (transactions.length === 0) {
    mutasiValues.push(['-', 'Tidak ada data transaksi mutasi kas manual.', '-', '-', '-', 0, '-']);
  }

  const iuranValues = [
    ['DAFTAR PENERIMAAN IURAN ANGGOTA (DARI METODE CHECKLIST)'],
    [`Periode: ${monthName} ${yearName}`],
    [],
    ['No', 'Tanggal Penerimaan', 'Nama Anggota', 'Tipe Anggota', 'Bulan Iuran', 'Metode Pembayaran', 'Bank/Detail', 'Nominal', 'Admin Verifikator'],
    ...verifiedPayments.map((p, idx) => [
      idx + 1,
      formatReportDate(p.date),
      p.memberName || '-',
      p.memberType === 'driver' ? 'Driver' : 'Helper',
      MONTH_NAMES_INDO[p.month] || p.month,
      p.method || '-',
      p.bank || '-',
      p.amount,
      p.adminName || '-'
    ])
  ];
  if (verifiedPayments.length === 0) {
    iuranValues.push(['-', 'Tidak ada data pembayaran iuran.', '-', '-', '-', '-', '-', 0, '-']);
  }

  // 3. Update values via batchUpdate
  const updateResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: "'Ringkasan Laporan'!A1",
          values: ringkasanValues
        },
        {
          range: "'Mutasi Kas Manual'!A1",
          values: mutasiValues
        },
        {
          range: "'Penerimaan Iuran Anggota'!A1",
          values: iuranValues
        }
      ]
    })
  });

  if (!updateResponse.ok) {
    const err = await updateResponse.json();
    console.error('Update Spreadsheet values error:', err);
    throw new Error(err?.error?.message || 'Gagal menulis data ke Google Sheets.');
  }

  if (onProgress) onProgress('Mempercantik baris dan format kolom...');

  // 4. Stylize spreadsheet format (Make it incredibly visual and clean!)
  try {
    const sheetId0 = sData?.sheets?.find((s: any) => s.properties?.title === 'Ringkasan Laporan')?.properties?.sheetId ?? sData?.sheets?.[0]?.properties?.sheetId ?? 0;
    const sheetId1 = sData?.sheets?.find((s: any) => s.properties?.title === 'Mutasi Kas Manual')?.properties?.sheetId ?? sData?.sheets?.[1]?.properties?.sheetId ?? 0;
    const sheetId2 = sData?.sheets?.find((s: any) => s.properties?.title === 'Penerimaan Iuran Anggota')?.properties?.sheetId ?? sData?.sheets?.[2]?.properties?.sheetId ?? 0;

    const formatReqBody = {
      requests: [
        // Bold title and enlarge on sheet 1
        {
          repeatCell: {
            range: { sheetId: sheetId0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 14, foregroundColor: { red: 0.05, green: 0.09, blue: 0.16 } }
              }
            },
            fields: 'userEnteredFormat.textFormat'
          }
        },
        // Bold table headers on sheet 1
        {
          repeatCell: {
            range: { sheetId: sheetId0, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 3 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 } },
                backgroundColor: { red: 0.09, green: 0.13, blue: 0.22 }, // Slate-900 / Navy
                horizontalAlignment: 'CENTER'
              }
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)'
          }
        },
        // Bold and format grand totals row on sheet 1
        {
          repeatCell: {
            range: { sheetId: sheetId0, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 3 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.1, green: 0.45, blue: 0.25 } },
                backgroundColor: { red: 0.9, green: 0.98, blue: 0.93 } // Soft Green
              }
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)'
          }
        },
        // Format rupiah column for Ringkasan (Col B)
        {
          repeatCell: {
            range: { sheetId: sheetId0, startRowIndex: 5, endRowIndex: 10, startColumnIndex: 1, endColumnIndex: 2 },
            cell: {
              userEnteredFormat: {
                numberFormat: { type: 'CURRENCY', pattern: '"Rp"#,##0' }
              }
            },
            fields: 'userEnteredFormat.numberFormat'
          }
        },


        // Sheet 2: Mutasi Kas Title Formatting
        {
          repeatCell: {
            range: { sheetId: sheetId1, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 13, foregroundColor: { red: 0.05, green: 0.09, blue: 0.16 } }
              }
            },
            fields: 'userEnteredFormat.textFormat'
          }
        },
        // Sheet 2: Headers
        {
          repeatCell: {
            range: { sheetId: sheetId1, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 7 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 9, foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 } },
                backgroundColor: { red: 0.09, green: 0.13, blue: 0.22 }, // Navy
                horizontalAlignment: 'CENTER'
              }
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)'
          }
        },
        // Sheet 2: Currency formatting (Col F)
        {
          repeatCell: {
            range: { sheetId: sheetId1, startRowIndex: 4, endRowIndex: 4 + Math.max(transactions.length, 1), startColumnIndex: 5, endColumnIndex: 6 },
            cell: {
              userEnteredFormat: {
                numberFormat: { type: 'CURRENCY', pattern: '"Rp"#,##0;"-Rp"#,##0' }
              }
            },
            fields: 'userEnteredFormat.numberFormat'
          }
        },


        // Sheet 3: Iuran Title Formatting
        {
          repeatCell: {
            range: { sheetId: sheetId2, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 13, foregroundColor: { red: 0.05, green: 0.09, blue: 0.16 } }
              }
            },
            fields: 'userEnteredFormat.textFormat'
          }
        },
        // Sheet 3: Headers
        {
          repeatCell: {
            range: { sheetId: sheetId2, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 9 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 9, foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 } },
                backgroundColor: { red: 0.09, green: 0.13, blue: 0.22 }, // Navy
                horizontalAlignment: 'CENTER'
              }
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)'
          }
        },
        // Sheet 3: Currency formatting (Col H)
        {
          repeatCell: {
            range: { sheetId: sheetId2, startRowIndex: 4, endRowIndex: 4 + Math.max(verifiedPayments.length, 1), startColumnIndex: 7, endColumnIndex: 8 },
            cell: {
              userEnteredFormat: {
                numberFormat: { type: 'CURRENCY', pattern: '"Rp"#,##0' }
              }
            },
            fields: 'userEnteredFormat.numberFormat'
          }
        },

        // Auto resize columns on all 3 sheets for pixel perfect width
        { autoResizeDimensions: { dimensions: { sheetId: sheetId0, dimension: 'COLUMNS', startIndex: 0, endIndex: 3 } } },
        { autoResizeDimensions: { dimensions: { sheetId: sheetId1, dimension: 'COLUMNS', startIndex: 0, endIndex: 7 } } },
        { autoResizeDimensions: { dimensions: { sheetId: sheetId2, dimension: 'COLUMNS', startIndex: 0, endIndex: 9 } } }
      ]
    };

    const formatResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formatReqBody)
    });

    if (!formatResponse.ok) {
      console.warn('Google Sheets formatting request returned minor errors, carrying on with payload creation.');
    }
  } catch (formatErr) {
    console.error('Exception applying sheet gorgeous custom styles:', formatErr);
  }

  return spreadsheetUrl;
}

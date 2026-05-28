import { jsPDF } from 'jspdf';

interface ReportTransaction {
  id: string;
  description: string;
  amount: number;
  date: any;
  category?: string;
  createdByAdmin?: string;
  sourceRecipient?: string;
}

interface VerifiedPayment {
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

// 1. CSV Download Function
export function downloadMonthlyReport(
  monthKey: string,
  year: string,
  transactions: ReportTransaction[],
  verifiedPayments: VerifiedPayment[],
  totals: {
    totalSaldoAwal: number;
    totalIuran: number;
    totalPemasukanLainnya: number;
    totalPengeluaran: number;
    totalSaldoAkhir: number;
  }
) {
  const monthName = monthKey === 'all' ? 'Semua Bulan' : (MONTH_NAMES_INDO[monthKey] || monthKey);
  const yearName = year === 'all' ? 'Semua Tahun' : year;
  const fileName = `Laporan_Keuangan_${monthName.replace(/\s+/g, '_')}_${yearName}.csv`;

  const rows: string[][] = [];

  // Title
  rows.push(['LAPORAN KEUANGAN BULANAN - KAS SNJ LOGISTIK']);
  rows.push([`Periode: ${monthName} ${yearName}`]);
  rows.push([`Tanggal Diunduh: ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID')} WIB`]);
  rows.push(['']);

  // Summary
  rows.push(['RINGKASAN LAPORAN KEUANGAN']);
  rows.push(['Uraian', 'Nominal']);
  rows.push(['Saldo Awal', `Rp ${totals.totalSaldoAwal.toLocaleString('id-ID')}`]);
  rows.push(['Total Penerimaan Iuran Anggota', `Rp ${totals.totalIuran.toLocaleString('id-ID')}`]);
  rows.push(['Total Penerimaan Lainnya', `Rp ${totals.totalPemasukanLainnya.toLocaleString('id-ID')}`]);
  rows.push(['Total Pengeluaran Kas', `Rp ${totals.totalPengeluaran.toLocaleString('id-ID')}`]);
  rows.push(['Saldo Akhir Bersih', `Rp ${totals.totalSaldoAkhir.toLocaleString('id-ID')}`]);
  rows.push(['']);

  // Transactions list
  rows.push(['MUTASI KAS (PEMASUKAN & PENGELUARAN MANUAL)']);
  rows.push(['No', 'Tanggal', 'Kategori', 'Sumber / Penerima', 'Keterangan', 'Nominal', 'Admin Pencatat']);

  let txIndex = 1;
  transactions.forEach((tx) => {
    const tDate = formatReportDate(tx.date);
    const catStr = tx.category === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran';
    const nominal = tx.category === 'pemasukan' ? tx.amount : -tx.amount;
    rows.push([
      txIndex.toString(),
      tDate,
      catStr,
      tx.sourceRecipient || '-',
      tx.description || '-',
      `Rp ${nominal.toLocaleString('id-ID')}`,
      tx.createdByAdmin || '-'
    ]);
    txIndex++;
  });
  if (transactions.length === 0) {
    rows.push(['-', 'Tidak ada data transaksi', '-', '-', '-', '-', '-']);
  }
  rows.push(['']);

  // Payments list
  rows.push(['PENERIMAAN IURAN CHECKLIST ANGGOTA (DIPOSKAN KE KAS)']);
  rows.push(['No', 'Tanggal Penerimaan', 'Nama Anggota', 'Pekerjaan/Tipe', 'Bulan Iuran', 'Metode Bayar', 'Bank/Detail', 'Nominal', 'Verifikator']);

  let payIndex = 1;
  verifiedPayments.forEach((p) => {
    const payDate = formatReportDate(p.date);
    const typeLabel = p.memberType === 'driver' ? 'Driver' : 'Helper';
    const duesMonth = MONTH_NAMES_INDO[p.month] || p.month;
    rows.push([
      payIndex.toString(),
      payDate,
      p.memberName || '-',
      typeLabel,
      duesMonth,
      p.method || '-',
      p.bank || '-',
      `Rp ${p.amount.toLocaleString('id-ID')}`,
      p.adminName || '-'
    ]);
    payIndex++;
  });
  if (verifiedPayments.length === 0) {
    rows.push(['-', 'Tidak ada data pembayaran iuran', '-', '-', '-', '-', '-', '-', '-']);
  }

  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cell === null || cell === undefined ? '' : String(cell);
          const escaped = text.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(';')
    )
    .join('\n');

  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// 2. PDF Download Function
export function downloadMonthlyReportPDF(
  monthKey: string,
  year: string,
  transactions: ReportTransaction[],
  verifiedPayments: VerifiedPayment[],
  totals: {
    totalSaldoAwal: number;
    totalIuran: number;
    totalPemasukanLainnya: number;
    totalPengeluaran: number;
    totalSaldoAkhir: number;
  }
) {
  const monthName = monthKey === 'all' ? 'Semua Bulan' : (MONTH_NAMES_INDO[monthKey] || monthKey);
  const yearName = year === 'all' ? 'Semua Tahun' : year;
  const fileName = `Laporan_Keuangan_${monthName.replace(/\s+/g, '_')}_${yearName}.pdf`;

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = 180;
  let y = 15;

  // Header and Footer drawer function
  const drawPageBorderAndFooter = (pageNum: number) => {
    doc.setPage(pageNum);
    // Draw thin line at the bottom
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, margin + contentWidth, pageHeight - 12);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Halaman ${pageNum}`, margin, pageHeight - 8);
    doc.text(
      'LAPORAN KAS SNJ LOGISTIK | VERIFIED & TRANSPARENT FINANCIAL REPORT',
      margin + contentWidth,
      pageHeight - 8,
      { align: 'right' }
    );
  };

  const checkNewPage = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 20) {
      doc.addPage();
      y = margin;
    }
  };

  // 1. Draw Title Header Block
  doc.setFillColor(15, 23, 42); // slate-900 (#0f172a)
  doc.rect(margin, y, contentWidth, 24, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('KAS KEUANGAN SNJ LOGISTIK', margin + 6, y + 9);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(
    `Laporan Keuangan Bulanan | Periode: ${monthName} ${yearName} | Unduh: ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID')} WIB`,
    margin + 6,
    y + 17
  );
  
  y += 30;

  // 2. Draw Financial Summary Box
  doc.setFillColor(248, 250, 252); // slate-50 (#f8fafc)
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, 42, 3, 3, 'FD');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('RINGKASAN KAS RUMAH TANGGA / OPERASIONAL', margin + 6, y + 7.5);
  
  doc.setDrawColor(226, 232, 240);
  doc.line(margin + 6, y + 11, margin + contentWidth - 6, y + 11);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text('Saldo Awal Bulan:', margin + 8, y + 17);
  doc.text('Total Penerimaan Iuran Anggota:', margin + 8, y + 23);
  doc.text('Total Pemasukan Lain-lain:', margin + 8, y + 29);
  doc.text('Total Pengeluaran Kas:', margin + 8, y + 35);
  
  doc.setTextColor(15, 23, 42);
  doc.text(`Rp ${totals.totalSaldoAwal.toLocaleString('id-ID')}`, margin + 65, y + 17);
  doc.setTextColor(16, 185, 129); // green-500
  doc.text(`Rp ${totals.totalIuran.toLocaleString('id-ID')}`, margin + 65, y + 23);
  doc.text(`Rp ${totals.totalPemasukanLainnya.toLocaleString('id-ID')}`, margin + 65, y + 29);
  doc.setTextColor(225, 29, 72); // rose-600
  doc.text(`- Rp ${totals.totalPengeluaran.toLocaleString('id-ID')}`, margin + 65, y + 35);
  
  // Clean Balance Badge on right
  doc.setFillColor(241, 245, 249); // slate-100
  doc.roundedRect(margin + 105, y + 13, 68, 23, 2, 2, 'F');
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('SALDO AKHIR REKAPITULASI', margin + 111, y + 19);
  
  doc.setTextColor(16, 185, 129); // green
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Rp ${totals.totalSaldoAkhir.toLocaleString('id-ID')}`, margin + 111, y + 28);
  
  y += 48;

  // Helper to truncate text safety
  const safeTruncate = (str: string, maxLen: number) => {
    if (!str) return '-';
    return str.length > maxLen ? str.slice(0, maxLen - 2) + '..' : str;
  };

  // 3. TABLE 1: MUTASI KAS (Pemasukan & Pengeluaran Manual)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('1. DAFTAR MUTASI KAS (MANUAL / LAINNYA)', margin, y);
  y += 4.5;
  
  // Headers Background Fill
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y + 7, margin + contentWidth, y + 7);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105); // slate-600
  
  let colX = margin;
  doc.text('No', colX + 2, y + 4.5); colX += 10;
  doc.text('Tanggal', colX + 2, y + 4.5); colX += 22;
  doc.text('Kategori', colX + 2, y + 4.5); colX += 22;
  doc.text('Sumber / Penerima', colX + 2, y + 4.5); colX += 36;
  doc.text('Keterangan', colX + 2, y + 4.5); colX += 48;
  doc.text('Nominal', margin + contentWidth - 2, y + 4.5, { align: 'right' });
  
  y += 7;

  let txNum = 1;
  transactions.forEach((tx) => {
    checkNewPage(8);
    
    // Alternating rows bg
    if (txNum % 2 === 0) {
      doc.setFillColor(252, 252, 253);
      doc.rect(margin, y, contentWidth, 7, 'F');
    }
    
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 7, margin + contentWidth, y + 7);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    
    let rX = margin;
    doc.text(txNum.toString(), rX + 2, y + 4.5); rX += 10;
    doc.text(formatReportDate(tx.date), rX + 2, y + 4.5); rX += 22;
    
    const isPemasukan = tx.category === 'pemasukan';
    doc.setFont('helvetica', 'bold');
    if (isPemasukan) {
      doc.setTextColor(16, 185, 129);
      doc.text('Pemasukan', rX + 2, y + 4.5);
    } else {
      doc.setTextColor(225, 29, 72);
      doc.text('Pengeluaran', rX + 2, y + 4.5);
    }
    rX += 22;
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(safeTruncate(tx.sourceRecipient || '-', 20), rX + 2, y + 4.5); rX += 36;
    doc.text(safeTruncate(tx.description || '-', 28), rX + 2, y + 4.5); rX += 48;
    
    doc.setFont('helvetica', 'bold');
    if (isPemasukan) {
      doc.setTextColor(16, 185, 129);
      doc.text(`+Rp ${tx.amount.toLocaleString('id-ID')}`, margin + contentWidth - 2, y + 4.5, { align: 'right' });
    } else {
      doc.setTextColor(225, 29, 72);
      doc.text(`-Rp ${tx.amount.toLocaleString('id-ID')}`, margin + contentWidth - 2, y + 4.5, { align: 'right' });
    }
    
    y += 7;
    txNum++;
  });

  if (transactions.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(148, 163, 184);
    doc.text('Tidak ada data transaksi mutasi kas manual.', margin + 4, y + 5);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 7, margin + contentWidth, y + 7);
    y += 7;
  }

  y += 8;

  // 4. TABLE 2: PENERIMAAN IURAN MEMBERS
  checkNewPage(24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('2. PENERIMAAN IURAN ANGGOTA (DARI METODE CHECKLIST)', margin, y);
  y += 4.5;

  // Headers bg
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y + 7, margin + contentWidth, y + 7);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  
  colX = margin;
  doc.text('No', colX + 2, y + 4.5); colX += 10;
  doc.text('Tanggal', colX + 2, y + 4.5); colX += 22;
  doc.text('Nama Anggota', colX + 2, y + 4.5); colX += 36;
  doc.text('Tipe', colX + 2, y + 4.5); colX += 18;
  doc.text('Bulan Iuran', colX + 2, y + 4.5); colX += 20;
  doc.text('Metode Pelunasan', colX + 2, y + 4.5); colX += 34;
  doc.text('Nominal', margin + contentWidth - 2, y + 4.5, { align: 'right' });

  y += 7;

  let payNum = 1;
  verifiedPayments.forEach((p) => {
    checkNewPage(8);
    
    if (payNum % 2 === 0) {
      doc.setFillColor(252, 252, 253);
      doc.rect(margin, y, contentWidth, 7, 'F');
    }
    
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 7, margin + contentWidth, y + 7);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    
    let rX = margin;
    doc.text(payNum.toString(), rX + 2, y + 4.5); rX += 10;
    doc.text(formatReportDate(p.date), rX + 2, y + 4.5); rX += 22;
    
    doc.setFont('helvetica', 'bold');
    doc.text(safeTruncate(p.memberName || '-', 18), rX + 2, y + 4.5); rX += 36;
    
    doc.setFont('helvetica', 'normal');
    doc.text(p.memberType === 'driver' ? 'Driver' : 'Helper', rX + 2, y + 4.5); rX += 18;
    doc.text(MONTH_NAMES_INDO[p.month] || p.month, rX + 2, y + 4.5); rX += 20;
    doc.text(`${p.method.toUpperCase()} ${p.bank ? `(${p.bank.toUpperCase()})` : ''}`, rX + 2, y + 4.5); rX += 34;
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129);
    doc.text(`+Rp ${p.amount.toLocaleString('id-ID')}`, margin + contentWidth - 2, y + 4.5, { align: 'right' });
    doc.setTextColor(15, 23, 42);
    
    y += 7;
    payNum++;
  });

  if (verifiedPayments.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(148, 163, 184);
    doc.text('Tidak ada data penerimaan iuran checklist pada periode ini.', margin + 4, y + 5);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 7, margin + contentWidth, y + 7);
    y += 7;
  }

  // 5. Draw Footers on all pages dynamically before saving
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    drawPageBorderAndFooter(i);
  }

  // Output save PDF
  doc.save(fileName);
}

export interface ReceiptData {
  id: string;
  memberName: string;
  type: string;
  months: string[];
  amount: number;
  method: string;
  date: any;
  adminName?: string;
  bank?: string;
}

const formatReceiptDate = (timestamp: any): string => {
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
    return dateObj.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' WIB';
  } catch (error) {
    return String(timestamp);
  }
};

const getMonthIndonesian = (monthKey: string): string => {
  const translations: Record<string, string> = {
    'jan': 'Januari', 'feb': 'Februari', 'mar': 'Maret', 'apr': 'April',
    'may': 'Mei', 'jun': 'Juni', 'jul': 'Juli', 'aug': 'Agustus',
    'sep': 'September', 'oct': 'Oktober', 'nov': 'November', 'dec': 'Desember',
    'january': 'Januari', 'february': 'Februari', 'march': 'Maret',
    'june': 'Juni', 'july': 'Juli', 'august': 'Agustus',
    'september': 'September', 'october': 'Oktober', 'november': 'November', 'december': 'Desember'
  };
  const key = monthKey.toLowerCase().trim();
  return translations[key] || monthKey;
};

// Canvas Text wrapping helper for centered multi-line strings
function wrapTextCentered(ctx: CanvasRenderingContext2D, text: string, centerX: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line.trim(), centerX, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), centerX, currentY);
  return currentY + lineHeight;
}

export function generateReceiptCanvas(receipt: ReceiptData): HTMLCanvasElement | null {
  try {
    // 1. Configuration & Crisp Scaling Support
    const scale = 2.5; // High definition output
    const width = 440; // Desktop/pos standard physical receipt width

    const noRek = `TRX-${(receipt.months[0] || 'PAY').toUpperCase()}-${receipt.id?.slice(0, 5).toUpperCase()}-${Math.floor((receipt.date instanceof Date ? receipt.date.getTime() : (receipt.date?.seconds ? receipt.date.seconds * 1000 : Date.now())) / 360000 % 100000)}`;
    const formattedDate = formatReceiptDate(receipt.date);

    // 2. We dynamically scale height based on months count and strings
    let h = 0;
    h += 35; // margin top
    h += 24; // KAS DELTA 8
    h += 16; // subtitle 1 (Struk ini dibuat otomatis)
    if (receipt.adminName) {
      h += 16; // subtitle 2 (Di verifikasi oleh ...)
    }
    h += 25; // divider
    h += 16; // DOCUMENT TITLE
    h += 25; // divider

    // Info rows block (4 rows x 22px)
    h += 4 * 22;
    h += 25; // divider

    // Detail Bulan List
    h += 20; // section header
    h += receipt.months.length * 24;
    h += 25; // divider

    // Total Bayar Banner
    h += 60; // Banner height
    h += 15; // gap bottom

    // Extra metadata rows (2 core payments fields + optionally verifikator)
    const detailRows = receipt.adminName ? 3 : 2;
    h += detailRows * 22;
    h += 25; // divider

    // Footer block
    h += 20; // title
    h += 4 * 14; // wrapped description lines
    h += 45; // safety clearance margin

    const height = h;

    // 3. Create Virtual Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(scale, scale);

    // 4. Fill plain white canvas background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Draw clean receipt container accent border
    ctx.strokeStyle = '#F1F5F9';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, width - 16, height - 16);

    // Draw double decorative dash lines on side
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(12, 12);
    ctx.lineTo(12, height - 12);
    ctx.moveTo(width - 12, 12);
    ctx.lineTo(width - 12, height - 12);
    ctx.stroke();

    // 5. Draw KAS DELTA 8 corporate identity
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.font = '900 18px "Inter", sans-serif';
    ctx.fillText('KAS DELTA 8', width / 2, 45);

    ctx.font = '500 11px "Inter", sans-serif';
    ctx.fillStyle = '#64748B';
    ctx.fillText('Struk ini dibuat otomatis', width / 2, 63);

    if (receipt.adminName) {
      ctx.fillText(`Di verifikasi oleh ${receipt.adminName}`, width / 2, 79);
    }

    // Divider line helper
    let currentY = receipt.adminName ? 92 : 76;
    const drawDivider = (char: string) => {
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(char.repeat(41), width / 2, currentY);
      currentY += 15;
    };

    drawDivider('-');

    // Document Title
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 10.5px "Inter", sans-serif';
    ctx.fillText('STRUK BUKTI PEMBAYARAN IURAN', width / 2, currentY);
    currentY += 14;

    drawDivider('-');

    // Row printing helper
    const drawRow = (label: string, value: string, isBig = false) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748B';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText(label, 26, currentY);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#0F172A';
      ctx.font = isBig ? '800 11.5px "Inter", sans-serif' : '700 11px "JetBrains Mono", monospace';
      ctx.fillText(value, width - 26, currentY);
      currentY += 22;
    };

    // 6. Draw Meta
    drawRow('NO. REK:', noRek);
    drawRow('TANGGAL:', formattedDate);
    drawRow('ANGGOTA:', receipt.memberName.toUpperCase(), true);
    drawRow('TIPE ENTY:', receipt.type === 'driver' ? 'DRIVER' : 'HELPER');

    drawDivider('=');

    // 7. Render Section header
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94A3B8';
    ctx.font = '800 9px "Inter", sans-serif';
    ctx.fillText('DETAIL BULAN:', 26, currentY);
    currentY += 18;

    // Render individual item listings
    receipt.months.forEach((m) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#334155';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillText(`Iuran Bulanan (${getMonthIndonesian(m)})`, 26, currentY);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#0F172A';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillText('Rp 25.000', width - 26, currentY);
      currentY += 24;
    });

    drawDivider('-');

    // 8. Total Payment Banner Block
    const bannerX = 24;
    const bannerWidth = width - 48;
    const bannerHeight = 44;

    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bannerX, currentY, bannerWidth, bannerHeight, 10);
    } else {
      ctx.rect(bannerX, currentY, bannerWidth, bannerHeight);
    }
    ctx.fill();

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748B';
    ctx.font = '800 9.5px "Inter", sans-serif';
    ctx.fillText('TOTAL BAYAR:', bannerX + 16, currentY + 26);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#10B981';
    ctx.font = '900 15px "Inter", sans-serif';
    ctx.fillText(`Rp ${receipt.amount.toLocaleString('id-ID')}`, bannerX + bannerWidth - 16, currentY + 28);

    currentY += bannerHeight + 20;

    // 9. Extra Rows
    drawRow('METODE:', `${receipt.method.toUpperCase()} ${receipt.bank ? `(${receipt.bank.toUpperCase()})` : ''}`, true);

    // Custom Status design (Green accent value)
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748B';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText('STATUS:', 26, currentY);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#10B981';
    ctx.font = '900 11.5px "Inter", sans-serif';
    ctx.fillText('LUNAS / VERIFIED', width - 26, currentY);
    currentY += 22;

    if (receipt.adminName) {
      drawRow('VERIFIKATOR:', receipt.adminName.toUpperCase(), true);
    }

    drawDivider('=');

    // 10. Footer Section
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 9px "Inter", sans-serif';
    ctx.fillText('BUKTI RESMI PEMBAYARAN', width / 2, currentY);
    currentY += 15;

    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 8.5px "Inter", sans-serif';
    wrapTextCentered(
      ctx, 
      'Terima kasih atas kontribusi Anda. Iuran wajib digunakan untuk kesejahteraan dan operasional bersama secara transparan.', 
      width / 2, 
      currentY, 
      width - 64, 
      13
    );

    return canvas;
  } catch (error) {
    console.error('Error in generating receipt canvas:', error);
    return null;
  }
}

export function downloadReceipt(receipt: ReceiptData) {
  const canvas = generateReceiptCanvas(receipt);
  if (!canvas) return;
  try {
    const dataUrl = canvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `Struk_Iuran_${receipt.memberName.replace(/\s+/g, '_')}_${receipt.months.join('_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Failed to convert canvas to data URL image:', error);
  }
}

export async function copyReceiptImageToClipboard(receipt: ReceiptData): Promise<boolean> {
  const canvas = generateReceiptCanvas(receipt);
  if (!canvas) return false;
  
  return new Promise((resolve) => {
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          resolve(false);
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          resolve(true);
        } catch (err) {
          console.error('Failed to copy image blob to clipboard:', err);
          resolve(false);
        }
      }, 'image/png', 1.0);
    } catch (error) {
      console.error('Error generating blob for clipboard:', error);
      resolve(false);
    }
  });
}

export function shareReceipt(receipt: ReceiptData) {
  const canvas = generateReceiptCanvas(receipt);
  if (!canvas) return;
  
  const shareFallback = (receiptData: ReceiptData) => {
    if (navigator.share) {
      navigator.share({
        title: 'Bukti Pembayaran Iuran',
        text: `Bukti Pembayaran Iuran KAS DELTA 8\n\nNama: ${receiptData.memberName}\nNo. Rek: TRX-${(receiptData.months[0] || 'PAY').toUpperCase()}-${receiptData.id?.slice(0, 5).toUpperCase()}\nBulan: ${receiptData.months.map(getMonthIndonesian).join(', ')}\nTotal: Rp ${receiptData.amount.toLocaleString('id-ID')}\nStatus: LUNAS`,
      }).catch(console.error);
    } else {
      alert('Browser Anda tidak mendukung fitur berbagi.');
    }
  };

  try {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        shareFallback(receipt);
        return;
      }
      
      const filename = `Struk_Iuran_${receipt.memberName.replace(/\s+/g, '_')}_${receipt.months.join('_')}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      // Check support of file sharing in Web Share API
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Bukti Pembayaran Iuran',
            text: `Bukti pembayaran iuran KAS DELTA 8 atas nama ${receipt.memberName}.`,
          });
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error('Error sharing image file:', err);
            shareFallback(receipt);
          }
        }
      } else {
        console.warn('File sharing not supported. Falling back to text sharing.');
        shareFallback(receipt);
      }
    }, 'image/png', 1.0);
  } catch (error) {
    console.error('Failed to convert canvas to blob for sharing:', error);
    shareFallback(receipt);
  }
}

interface WaReceiptData {
  memberPhone?: string;
  memberName: string;
  memberType: 'driver' | 'helper';
  months: string[];
  amount: number;
  method: string;
  bank?: string;
  adminName?: string;
}

export async function sendWaNotification(receipt: WaReceiptData) {
  if (!receipt.memberPhone) {
    console.log('WhatsApp Auto-dispatch skipped: Member has no registered phone number.');
    return { success: false, error: 'No phone number' };
  }

  try {
    const response = await fetch('/api/send-whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        memberPhone: receipt.memberPhone,
        memberName: receipt.memberName,
        memberType: receipt.memberType,
        months: receipt.months,
        amount: receipt.amount,
        method: receipt.method,
        bank: receipt.bank || '',
        adminName: receipt.adminName || 'Admin'
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.warn('WhatsApp Auto-dispatch Gateway Error:', data.error, data.details);
      return { success: false, error: data.error };
    }
    console.log('WhatsApp Auto-dispatch Success:', data);
    return { success: true };
  } catch (err) {
    console.error('Error triggering WhatsApp Auto-dispatch:', err);
    return { success: false, error: 'Network/Server Error' };
  }
}

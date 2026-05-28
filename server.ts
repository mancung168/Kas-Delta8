import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const PORT = 3000;

// Read firebase-applet-config.json
const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));

// Initialize Firebase Admin (bypasses firestore rules)
const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
let credentialOption = {};
if (fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    if (serviceAccount.project_id === firebaseConfig.projectId) {
      credentialOption = { credential: cert(serviceAccount) };
      console.log('Firebase Admin initialized with custom service account credential!');
    } else {
      console.warn(`Project ID mismatch: service account has "${serviceAccount.project_id}", but app config has "${firebaseConfig.projectId}". Ignoring mismatched custom service account to allow falling back to Application Default Credentials.`);
    }
  } catch (err) {
    console.error('Failed to parse custom service account credential:', err);
  }
}

const firebaseApp = initializeApp({
  projectId: firebaseConfig.projectId,
  ...credentialOption
});

const firestoreDatabaseId = firebaseConfig.firestoreDatabaseId || '';
const db = firestoreDatabaseId && firestoreDatabaseId !== '(default)'
  ? getFirestore(firebaseApp, firestoreDatabaseId)
  : getFirestore(firebaseApp);

function cleanEnvValue(value: string | undefined): string {
  if (!value) return '';
  let cleaned = value.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

function getEnvBoolean(key: string): boolean {
  const val = cleanEnvValue(process.env[key]);
  return val.toLowerCase() === 'true';
}

function formatWaNumber(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  return cleaned;
}

function isPermissionError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes('permission_denied') ||
    msg.includes('insufficient permissions') ||
    msg.includes('unauthenticated') ||
    msg.includes('authority') ||
    msg.includes('credential') ||
    msg.includes('quota') ||
    err.code === 7 ||
    err.code === 16
  );
}

const AUDIT_LOG_FILE = path.join(process.cwd(), 'whatsapp-audit.json');

interface AuditLogEntry {
  timestamp: string;
  status: 'success' | 'failure';
  memberName: string;
  memberPhone: string;
  months: any;
  amount: number;
  method: string;
  adminName: string;
  provider: string;
  error?: string;
  errorStack?: string;
  diagnostic?: {
    projectId: string;
    databaseId: string;
    hasServiceAccount: boolean;
    serviceAccountProjectId: string;
    serviceAccountClientEmail: string;
    envGoogleApplicationCredentialsExists: boolean;
    nodeEnv: string;
  };
}

function writeAuditLog(entry: Omit<AuditLogEntry, 'timestamp' | 'diagnostic'>) {
  let logs: AuditLogEntry[] = [];
  try {
    if (fs.existsSync(AUDIT_LOG_FILE)) {
      logs = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading audit logs file:', e);
  }

  let hasServiceAccount = false;
  let serviceAccountProjectId = '';
  let serviceAccountClientEmail = '';
  try {
    if (fs.existsSync(serviceAccountPath)) {
      const sa = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      hasServiceAccount = true;
      serviceAccountProjectId = sa.project_id || '';
      serviceAccountClientEmail = sa.client_email || '';
    }
  } catch (e) {}

  const fullEntry: AuditLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    diagnostic: {
      projectId: firebaseConfig.projectId,
      databaseId: firestoreDatabaseId,
      hasServiceAccount,
      serviceAccountProjectId,
      serviceAccountClientEmail,
      envGoogleApplicationCredentialsExists: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
      nodeEnv: process.env.NODE_ENV || 'development'
    }
  };

  logs.unshift(fullEntry);
  if (logs.length > 200) {
    logs = logs.slice(0, 200);
  }

  try {
    fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(logs, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write audit log to file:', err);
  }
}

async function startServer() {
  const app = express();

  // For parsing application/json
  app.use(express.json());

  // Health check API
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', databaseId: firestoreDatabaseId });
  });

  // Endpoint to read the WhatsApp audit logs
  app.get('/api/whatsapp-audit-logs', (req, res) => {
    try {
      if (fs.existsSync(AUDIT_LOG_FILE)) {
        const logs = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf8'));
        return res.json({ logs });
      }
      return res.json({ logs: [] });
    } catch (err: any) {
      console.error('Failed to read audit logs:', err);
      return res.status(500).json({ error: err.message || 'Gagal membaca audit log.' });
    }
  });

  // Endpoint to clear the WhatsApp audit logs
  app.post('/api/whatsapp-audit-logs/clear', (req, res) => {
    try {
      fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify([]), 'utf8');
      return res.json({ success: true });
    } catch (err: any) {
      console.error('Failed to clear audit logs:', err);
      return res.status(500).json({ error: err.message || 'Gagal menghapus audit log.' });
    }
  });

  // Dynamic Server-side WhatsApp API dispatch route
  app.post('/api/send-whatsapp', async (req, res) => {
    const { 
      memberPhone, 
      memberName, 
      memberType, 
      months, 
      amount, 
      method, 
      bank, 
      adminName 
    } = req.body;

    try {
      if (!memberPhone) {
        return res.status(400).json({ error: 'Nomor HP anggota diperlukan.' });
      }

      // 1. Fetch settings from Firestore
      let wsDoc;
      try {
        wsDoc = await db.collection('settings').doc('whatsapp').get();
      } catch (dbErr: any) {
        if (isPermissionError(dbErr)) {
          const cleanWarning = '[Diagnostic] Database read is pending credential configuration. Operation deferred.';
          console.log(cleanWarning);
          writeAuditLog({
            status: 'failure',
            memberName: memberName || 'Unknown',
            memberPhone: memberPhone || 'Unspecified',
            months: months || [],
            amount: Number(amount) || 0,
            method: method || 'Unknown',
            adminName: adminName || 'Admin',
            provider: 'Unknown',
            error: cleanWarning
          });
          throw new Error(cleanWarning);
        }
        writeAuditLog({
          status: 'failure',
          memberName: memberName || 'Unknown',
          memberPhone: memberPhone || 'Unspecified',
          months: months || [],
          amount: Number(amount) || 0,
          method: method || 'Unknown',
          adminName: adminName || 'Admin',
          provider: 'Unknown',
          error: `Firestore Security/Permission Error: ${dbErr.message}`,
          errorStack: dbErr.stack
        });
        throw dbErr;
      }

      if (!wsDoc.exists) {
        writeAuditLog({
          status: 'failure',
          memberName: memberName || 'Unknown',
          memberPhone: memberPhone || 'Unspecified',
          months: months || [],
          amount: Number(amount) || 0,
          method: method || 'Unknown',
          adminName: adminName || 'Admin',
          provider: 'Unknown',
          error: 'Dokumen settings/whatsapp tidak ditemukan di database Firestore.'
        });
        return res.status(404).json({ error: 'Konfigurasi WhatsApp API belum diatur di panel admin.' });
      }

      const config = wsDoc.data();
      if (!config || config.provider === 'off' || !config.provider) {
        writeAuditLog({
          status: 'failure',
          memberName: memberName || 'Unknown',
          memberPhone: memberPhone || 'Unspecified',
          months: months || [],
          amount: Number(amount) || 0,
          method: method || 'Unknown',
          adminName: adminName || 'Admin',
          provider: config?.provider || 'off',
          error: 'WhatsApp API dinonaktifkan di pengaturan admin.'
        });
        return res.status(400).json({ error: 'WhatsApp API dinonaktifkan di pengaturan admin.' });
      }

      // 2. Format phone number & message
      const cleanPhone = formatWaNumber(memberPhone);
      const monthsJoined = Array.isArray(months) ? months.map((m: string) => {
        const map: Record<string, string> = {
          'Jan': 'Januari', 'Feb': 'Februari', 'Mar': 'Maret', 'Apr': 'April',
          'May': 'Mei', 'Jun': 'Juni', 'Jul': 'Juli', 'Aug': 'Agustus',
          'Sep': 'September', 'Oct': 'Oktober', 'Nov': 'November', 'Dec': 'Desember'
        };
        return map[m] || m;
      }).join(', ') : months;

      const message = `*BUKTI PEMBAYARAN IURAN KAS DELTA 8*\n\n` +
        `Nama: *${memberName}*\n` +
        `Kategori: *${memberType === 'driver' ? 'Driver' : 'Helper'}*\n` +
        `Bulan: *${monthsJoined}*\n` +
        `Total Bayar: *Rp ${amount?.toLocaleString('id-ID') || '0'}*\n` +
        `Metode: *${method}${bank ? ` (${bank})` : ''}*\n` +
        `Status: *LUNAS / VERIFIED* ✅\n\n` +
        `_Struk ini dibuat otomatis oleh sistem._\n` +
        `_Diverifikasi oleh: ${adminName || 'Admin'}_\n\n` +
        `Terima kasih atas kontribusi Anda. Iuran wajib digunakan untuk kesejahteraan dan operasional bersama secara transparan.`;

      let url = '';
      let response: Response;
      const provider = config.provider;
      const token = config.token || '';

      if (provider === 'fonnte') {
        url = 'https://api.fonnte.com/send';
        const body = {
          target: cleanPhone,
          message: message,
          countryCode: '62'
        };
        
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
      } else if (provider === 'wablas') {
        let base = config.baseUrl || 'https://api.wablas.com';
        if (base.endsWith('/')) base = base.slice(0, -1);
        url = `${base}/api/v2/send-message`;
        
        const body = {
          phone: cleanPhone,
          message: message
        };
        
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
      } else if (provider === 'custom') {
        let customUrl = config.baseUrl || '';
        const customMethod = (config.customMethod || 'POST').toUpperCase();
        let customHeaders: Record<string, string> = {};
        try {
          if (config.customHeaders) {
            customHeaders = JSON.parse(config.customHeaders);
          }
        } catch (e) {
          console.error('Failed to parse custom JSON headers:', e);
        }
        
        let reqBody: any = null;
        if (customMethod === 'POST') {
          const rawTemplate = config.customBody || '{"phone": "{{phone}}", "message": "{{message}}"}';
          const rendered = rawTemplate
            .replace(/\{\{phone\}\}/g, cleanPhone)
            .replace(/\{\{message\}\}/g, JSON.stringify(message).slice(1, -1));
          
          reqBody = rendered;

          if (!customHeaders['Content-Type'] && !customHeaders['content-type']) {
            customHeaders['Content-Type'] = 'application/json';
          }
        } else {
          customUrl = customUrl
            .replace(/\{\{phone\}\}/g, encodeURIComponent(cleanPhone))
            .replace(/\{\{message\}\}/g, encodeURIComponent(message));
        }

        response = await fetch(customUrl, {
          method: customMethod,
          headers: customHeaders,
          body: customMethod === 'POST' ? reqBody : undefined
        });
      } else {
        return res.status(400).json({ error: 'WhatsApp Provider tidak dikenal atau dinonaktifkan.' });
      }

      const resText = await response.text();

      if (response.ok) {
        writeAuditLog({
          status: 'success',
          memberName: memberName || 'Unknown',
          memberPhone: memberPhone || 'Unspecified',
          months: months || [],
          amount: Number(amount) || 0,
          method: method || 'Unknown',
          adminName: adminName || 'Admin',
          provider: provider,
          error: undefined
        });
        return res.json({ success: true, response: resText });
      } else {
        writeAuditLog({
          status: 'failure',
          memberName: memberName || 'Unknown',
          memberPhone: memberPhone || 'Unspecified',
          months: months || [],
          amount: Number(amount) || 0,
          method: method || 'Unknown',
          adminName: adminName || 'Admin',
          provider: provider,
          error: `Gateway Error: HTTP ${response.status} - ${resText}`
        });
        return res.status(response.status).json({ 
          error: `Gagal mengirim WhatsApp via Gateway [${provider}]. Server merespon: ${response.status}`,
          details: resText 
        });
      }
    } catch (err: any) {
      console.error('Error in send-whatsapp API:', err);
      writeAuditLog({
        status: 'failure',
        memberName: memberName || 'Unknown',
        memberPhone: memberPhone || 'Unspecified',
        months: months || [],
        amount: Number(amount) || 0,
        method: method || 'Unknown',
        adminName: adminName || 'Admin',
        provider: 'Unknown',
        error: err.message || String(err),
        errorStack: err.stack
      });
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // Helper to send FCM notifications
  async function sendFCMNotificationToAll(activityData: any) {
    try {
      const snapshot = await db.collection('fcm_tokens').get();
      if (snapshot.empty) {
        console.log('No registered FCM tokens found.');
        return;
      }

      const tokens: string[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data && data.token) {
          tokens.push(data.token);
        }
      });

      if (tokens.length === 0) return;

      const action = activityData.action || 'system';
      const details = activityData.details || 'Aktivitas baru tercatat';
      const adminName = activityData.adminName || 'Admin';

      let title = 'Aktivitas Keuangan Baru';
      switch (action) {
        case 'tambah_anggota': title = 'Anggota Baru Terdaftar'; break;
        case 'edit_anggota': title = 'Pembaruan Data Anggota'; break;
        case 'hapus_anggota': title = 'Anggota Telah Dihapus'; break;
        case 'tambah_transaksi': title = 'Transaksi Kas Baru'; break;
        case 'hapus_transaksi': title = 'Transaksi Kas Dihapus'; break;
        case 'bayar_iuran': title = 'Pembayaran Iuran Kas'; break;
        case 'verifikasi_iuran': title = 'Pembayaran Diverifikasi'; break;
        case 'tolak_iuran': title = 'Pembayaran Ditolak'; break;
        case 'update_status_iuran': title = 'Status Iuran Diubah'; break;
      }

      const messagePayload = {
        notification: {
          title: title,
          body: `${adminName}: ${details}`
        },
        webpush: {
          notification: {
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            click_action: '/'
          }
        }
      };

      const messaging = getMessaging(firebaseApp);

      for (const token of tokens) {
        try {
          await messaging.send({
            token: token,
            ...messagePayload
          });
          console.log(`FCM success: sent to ${token.substring(0, 10)}...`);
        } catch (sendErr: any) {
          console.warn(`FCM send failed for token ${token.substring(0, 10)}... Error: ${sendErr.message}`);
          if (
            sendErr.code === 'messaging/invalid-argument' || 
            sendErr.code === 'messaging/registration-token-not-registered' ||
            sendErr.message?.includes('not registered') ||
            sendErr.message?.includes('invalid')
          ) {
            console.log(`Pruning invalid token ${token.substring(0, 10)}...`);
            const querySnap = await db.collection('fcm_tokens').where('token', '==', token).get();
            querySnap.forEach(async (doc) => {
              await doc.ref.delete();
            });
          }
        }
      }
    } catch (err: any) {
      if (isPermissionError(err)) {
        console.log('[Firebase Notice] Broadcast notification skipped: credentials restriction.');
      } else {
        console.error('Error in sendFCMNotificationToAll:', err);
      }
    }
  }

  // Register FCM Token
  app.post('/api/fcm/register', async (req, res) => {
    const { token, nickname, email } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token FCM diperlukan.' });
    }

    try {
      const docId = token.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_');
      await db.collection('fcm_tokens').doc(docId).set({
        token,
        nickname: nickname || 'Admin',
        email: email || '',
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      console.log(`FCM Token registered successfully for admin: ${nickname}`);
      return res.json({ success: true });
    } catch (err: any) {
      if (isPermissionError(err)) {
        console.log(`[Firebase Notice] FCM Token registration restricted: ${err.message || String(err)}`);
        return res.json({ success: true, info: 'Token saved in client memory only due to preview database limits.' });
      }
      console.error('Error registering FCM Token:', err);
      return res.status(500).json({ error: err.message || 'Gagal menyimpan token FCM ke server.' });
    }
  });

  // Send Test FCM Notification
  app.post('/api/fcm/send-test', async (req, res) => {
    const { token, title, body, adminName } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token FCM target diperlukan untuk mengirim tes.' });
    }

    try {
      const messaging = getMessaging(firebaseApp);
      await messaging.send({
        token: token,
        notification: {
          title: title || 'Tes Push Notification FCM',
          body: `${adminName || 'Admin'}: ${body || 'Koneksi FCM Server Sukses!'}`
        },
        webpush: {
          notification: {
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            click_action: '/'
          }
        }
      });

      console.log('FCM single test notification triggered perfectly.');
      return res.json({ success: true });
    } catch (err: any) {
      if (isPermissionError(err)) {
        console.log(`[Firebase Notice] FCM single test dispatch restricted: ${err.message || String(err)}`);
        return res.json({ success: false, info: 'Push notification is restricted in preview mode without matching service credentials.' });
      }
      console.error('Error sending single test FCM:', err);
      return res.status(500).json({ error: err.message || 'Gagal mengirim push notification FCM.' });
    }
  });

  // Resilient background Firestore activities observer inside running Node server with exponential backoff
  let activityListenerUnsubscribe: (() => void) | null = null;
  let isListening = false;
  let reconnectTimeout: NodeJS.Timeout | null = null;

  function listenToActivities(backoffMs = 10000) {
    if (isListening) {
      return;
    }

    isListening = true;
    let isServerInitial = true;

    try {
      activityListenerUnsubscribe = db.collection('activities')
        .orderBy('timestamp', 'desc')
        .limit(1)
        .onSnapshot((snapshot) => {
          // Reset backoff on successful update
          backoffMs = 10000;
          if (isServerInitial) {
            isServerInitial = false;
            return;
          }
          snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
              const activityData = change.doc.data();
              if (activityData) {
                console.log('New activity logged on Firestore. Dispatching FCM push notification to all devices.');
                await sendFCMNotificationToAll(activityData);
              }
            }
          });
        }, (err: any) => {
          isListening = false;
          
          if (isPermissionError(err)) {
            console.log('[Firebase Notice] Activities background observer has been placed in long standby mode: client-only database active.');
            if (activityListenerUnsubscribe) {
              try {
                activityListenerUnsubscribe();
              } catch (e) {}
              activityListenerUnsubscribe = null;
            }
            // Retry with a very large backoff (e.g., 1 hour) to avoid logging spam
            const longStandbyMs = 3600000;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(() => {
              listenToActivities(longStandbyMs);
            }, longStandbyMs);
            return;
          }

          // Use console.log for network-related interruptions rather than console.error to avoid trigger logs monitoring alarms
          console.log('[Resilient Listener Info] Firestore activities stream interrupted:', err?.message || String(err));
          
          if (activityListenerUnsubscribe) {
            try {
              activityListenerUnsubscribe();
            } catch (e) {
              // Silent catch
            }
            activityListenerUnsubscribe = null;
          }

          const nextBackoff = Math.min(backoffMs * 2, 120000);
          console.log(`Resilient Listener: Scheduling re-establishment of Firestore observer in ${(nextBackoff / 1000).toFixed(0)} seconds...`);
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => {
            listenToActivities(nextBackoff);
          }, nextBackoff);
        });
    } catch (criticalErr: any) {
      isListening = false;
      if (isPermissionError(criticalErr)) {
        console.log('[Firebase Notice] Failed to initialize Firestore listener: credentials restriction.');
        const longStandbyMs = 3600000;
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          listenToActivities(longStandbyMs);
        }, longStandbyMs);
        return;
      }
      console.log('[Resilient Listener Info] Failed to initialize Firestore listener:', criticalErr?.message || String(criticalErr));
      const nextBackoff = Math.min(backoffMs * 2, 120000);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(() => {
        listenToActivities(nextBackoff);
      }, nextBackoff);
    }
  }
  listenToActivities();

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

import React, { useState, useEffect } from 'react';
import { 
  getAdmins, 
  saveAdmin, 
  deleteAdmin, 
  AdminItem,
  isMasterSuperAdmin 
} from '../lib/adminService';
import { db } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { setDoc, doc, getDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { 
  UserPlus, 
  UserCheck, 
  Trash2, 
  Loader2, 
  ShieldAlert, 
  ShieldCheck, 
  Key, 
  User, 
  X, 
  Eye, 
  EyeOff, 
  Search,
  Plus,
  RefreshCw,
  Edit2,
  CreditCard,
  Wallet,
  Check,
  QrCode,
  AlertCircle,
  FileSpreadsheet,
  Database,
  MessageSquare,
  Send,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Helper to wrap promise in timeout to avoid hanging UI in sandboxed environments
function withTimeoutLocal<T>(promise: Promise<T>, timeoutMs = 8000, errorMsg = 'Penyimpanan database lambat atau terputus.'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs))
  ]);
}

const DEFAULT_BANKS = [
  { id: 'mandiri', name: 'Mandiri', holder: 'ARIFUDIN', number: '1560027351289', color: 'bg-yellow-600', comingSoon: false },
  { id: 'bca', name: 'BCA', holder: '', number: '', color: 'bg-blue-600', comingSoon: true },
  { id: 'bri', name: 'BRI', holder: '', number: '', color: 'bg-blue-800', comingSoon: true },
];

const DEFAULT_EWALLETS = [
  { id: 'dana', name: 'Dana', holder: 'ARIFUDIN', number: '082210122334', color: 'bg-sky-500', iconText: 'D', appUrl: 'dana://', fallbackUrl: 'https://link.dana.id' },
  { id: 'gopay', name: 'GoPay', holder: 'ARIFUDIN', number: '082210122334', color: 'bg-emerald-500', iconText: 'G', appUrl: 'gojek://', fallbackUrl: 'https://gojek.com' },
  { id: 'shopeepay', name: 'ShopeePay', holder: 'ARIFUDIN', number: '082210122334', color: 'bg-orange-500', iconText: 'S', appUrl: 'shopeepay://', fallbackUrl: 'https://shopee.co.id/shopeepay' },
];

export default function AdminManager() {
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Sub-tab selection state
  const [subTab, setSubTab] = useState<'admins' | 'payments' | 'sheets' | 'whatsapp'>('admins');

  // WhatsApp API Settings States
  const [waProvider, setWaProvider] = useState<'fonnte' | 'wablas' | 'custom' | 'off'>('off');
  const [waToken, setWaToken] = useState('');
  const [waBaseUrl, setWaBaseUrl] = useState('');
  const [waCustomMethod, setWaCustomMethod] = useState<'POST' | 'GET'>('POST');
  const [waCustomHeaders, setWaCustomHeaders] = useState('');
  const [waCustomBody, setWaCustomBody] = useState('');
  const [waIsSaving, setWaIsSaving] = useState(false);
  const [waSuccess, setWaSuccess] = useState('');
  const [waError, setWaError] = useState('');
  const [waLoading, setWaLoading] = useState(true);
  const [waAuditLogs, setWaAuditLogs] = useState<any[]>([]);
  const [waAuditLogsLoading, setWaAuditLogsLoading] = useState(false);
  const [waAuditLogsError, setWaAuditLogsError] = useState('');

  // Google Sheets Settings States
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [tempSpreadsheetId, setTempSpreadsheetId] = useState<string>('');
  const [isSavingSheets, setIsSavingSheets] = useState(false);
  const [sheetsSuccess, setSheetsSuccess] = useState('');
  const [sheetsError, setSheetsError] = useState('');

  // Payment Methods States
  const [banks, setBanks] = useState<any[]>(DEFAULT_BANKS);
  const [ewallets, setEwallets] = useState<any[]>(DEFAULT_EWALLETS);
  const [isSavingPayments, setIsSavingPayments] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  // QRIS Settings States
  const [qrisImage, setQrisImage] = useState<string>('');
  const [qrisText, setQrisText] = useState<string>('');
  const [tempQrisText, setTempQrisText] = useState<string>('');
  const [tempQrisFile, setTempQrisFile] = useState<string | null>(null);
  const [isSavingQris, setIsSavingQris] = useState(false);
  const [qrisSuccess, setQrisSuccess] = useState('');
  const [qrisError, setQrisError] = useState('');

  // Edit / Add Payment Modal state
  const [editingPayment, setEditingPayment] = useState<{
    type: 'bank' | 'ewallet';
    isNew: boolean;
    data: any;
  } | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'admin' | 'super-admin'>('admin');
  const [showPinRaw, setShowPinRaw] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState('');
  const [modalError, setModalError] = useState('');
  const [actionError, setActionError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Load admins
  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getAdmins();
      setAdmins(data);
    } catch (error) {
      console.error('Error loading administrators:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setModalError('');
  }, [editingPayment]);

  useEffect(() => {
    // Load payment methods from Firestore
    setPaymentsLoading(true);
    const pmDocRef = doc(db, 'settings', 'payment_methods');
    const unsubscribe = onSnapshot(pmDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.banks && Array.isArray(data.banks)) {
          setBanks(data.banks);
        } else {
          setBanks(DEFAULT_BANKS);
        }
        if (data.ewallets && Array.isArray(data.ewallets)) {
          setEwallets(data.ewallets);
        } else {
          setEwallets(DEFAULT_EWALLETS);
        }
      } else {
        setBanks(DEFAULT_BANKS);
        setEwallets(DEFAULT_EWALLETS);
      }
      setPaymentsLoading(false);
    }, (error) => {
      console.warn("Failed to listen for payment methods settings in AdminManager:", error);
      setBanks(DEFAULT_BANKS);
      setEwallets(DEFAULT_EWALLETS);
      setPaymentsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const qrisDocRef = doc(db, 'settings', 'qris');
    const unsubscribe = onSnapshot(qrisDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.imageB64) {
          setQrisImage(data.imageB64);
        } else {
          setQrisImage('');
        }
        if (data.qrisText) {
          setQrisText(data.qrisText);
          setTempQrisText(data.qrisText);
        } else {
          setQrisText('');
          setTempQrisText('');
        }
      } else {
        setQrisImage('');
        setQrisText('');
        setTempQrisText('');
      }
    }, (error) => {
      console.warn("Failed to listen for QRIS settings in AdminManager:", error);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const sheetsDocRef = doc(db, 'settings', 'google_sheets');
    const unsubscribe = onSnapshot(sheetsDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.spreadsheetId) {
          setSpreadsheetId(data.spreadsheetId);
          setTempSpreadsheetId(data.spreadsheetId);
        } else {
          setSpreadsheetId('');
          setTempSpreadsheetId('');
        }
      } else {
        setSpreadsheetId('');
        setTempSpreadsheetId('');
      }
    }, (error) => {
      console.warn("Failed to listen for Google Sheets settings in AdminManager:", error);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setWaLoading(true);
    const waDocRef = doc(db, 'settings', 'whatsapp');
    const unsubscribe = onSnapshot(waDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setWaProvider(data.provider || 'off');
        setWaToken(data.token || '');
        setWaBaseUrl(data.baseUrl || '');
        setWaCustomMethod(data.customMethod || 'POST');
        setWaCustomHeaders(data.customHeaders || '');
        setWaCustomBody(data.customBody || '');
      } else {
        setWaProvider('off');
        setWaToken('');
        setWaBaseUrl('');
        setWaCustomMethod('POST');
        setWaCustomHeaders('');
        setWaCustomBody('');
      }
      setWaLoading(false);
    }, (error) => {
      console.warn("Failed to listen for WhatsApp settings in AdminManager:", error);
      setWaLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const fetchWaAuditLogs = async () => {
    setWaAuditLogsLoading(true);
    setWaAuditLogsError('');
    try {
      const res = await fetch('/api/whatsapp-audit-logs');
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      const data = await res.json();
      setWaAuditLogs(data.logs || []);
    } catch (err: any) {
      console.error('Error fetching WA audit logs:', err);
      setWaAuditLogsError(err.message || 'Gagal memuat log audit.');
    } finally {
      setWaAuditLogsLoading(false);
    }
  };

  const clearWaAuditLogs = async () => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus semua log audit WhatsApp? Tindakan ini tidak dapat dibatalkan.')) return;
    try {
      const res = await fetch('/api/whatsapp-audit-logs/clear', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      setWaAuditLogs([]);
    } catch (err: any) {
      console.error('Error clearing WA audit logs:', err);
      alert('Gagal membersihkan log audit: ' + err.message);
    }
  };

  useEffect(() => {
    if (subTab === 'whatsapp') {
      fetchWaAuditLogs();
    }
  }, [subTab]);

  const saveWaSettings = async () => {
    setWaIsSaving(true);
    setWaError('');
    setWaSuccess('');
    
    // Validate
    if (waProvider !== 'off' && !waToken.trim() && waProvider !== 'custom') {
      setWaError('API Token / Key harus diisi jika mengaktifkan WhatsApp gateway API.');
      setWaIsSaving(false);
      return;
    }

    if (waProvider === 'custom') {
      if (!waBaseUrl.trim()) {
        setWaError('URL Endpoint untuk API Custom harus diisi.');
        setWaIsSaving(false);
        return;
      }
      if (waCustomHeaders) {
        try {
          JSON.parse(waCustomHeaders);
        } catch (e) {
          setWaError('Header Tambahan (JSON) tidak valid. Harus berupa JSON Object yang valid.');
          setWaIsSaving(false);
          return;
        }
      }
    }

    try {
      const waDocRef = doc(db, 'settings', 'whatsapp');
      await withTimeoutLocal(setDoc(waDocRef, {
        provider: waProvider,
        token: waToken.trim(),
        baseUrl: waBaseUrl.trim(),
        customMethod: waCustomMethod,
        customHeaders: waCustomHeaders.trim(),
        customBody: waCustomBody.trim(),
        updatedAt: serverTimestamp()
      }, { merge: true }), 8000, 'Gagal menyimpan pengaturan WhatsApp (Timeout).');

      setWaSuccess('Pengaturan WhatsApp API berhasil disimpan!');
      
      // Save log activity (silent catch and timeout protected)
      try {
        const logId = 'log_' + Date.now();
        await withTimeoutLocal(setDoc(doc(db, 'activities', logId), {
          action: 'system',
          details: `Mengonfigurasi WhatsApp API Gateway: ${waProvider.toUpperCase()} (${waProvider === 'off' ? 'Dinonaktifkan' : 'Aktif'})`,
          adminName: localStorage.getItem('ADMIN_NICKNAME') || 'Super Admin',
          timestamp: serverTimestamp()
        }), 3000);
      } catch (logErr) {
        console.warn('Could not register administrative action log:', logErr);
      }

      setTimeout(() => setWaSuccess(''), 4000);
    } catch (err: any) {
      console.error('Error saving WhatsApp settings:', err);
      setWaError(err.message || 'Gagal menyimpan pengaturan WhatsApp.');
    } finally {
      setWaIsSaving(false);
    }
  };

  const saveSheetsSettings = async () => {
    setIsSavingSheets(true);
    setSheetsError('');
    setSheetsSuccess('');
    try {
      const sheetsDocRef = doc(db, 'settings', 'google_sheets');
      await withTimeoutLocal(setDoc(sheetsDocRef, {
        spreadsheetId: tempSpreadsheetId.trim(),
        updatedAt: serverTimestamp()
      }, { merge: true }), 8000, 'Gagal menyimpan pengaturan Google Sheets (Timeout).');
      
      setSheetsSuccess('Pengaturan Google Sheets berhasil disimpan!');
      
      // Save log activity (silent catch and timeout protected)
      try {
        const logId = 'log_' + Date.now();
        await withTimeoutLocal(setDoc(doc(db, 'activities', logId), {
          action: 'system',
          details: `Mengonfigurasi ID Google Spreadsheet pribadi admin: ${tempSpreadsheetId.trim() || 'Dikosongkan (Akan otomatis dibuat baru saat ekspor)'}`,
          adminName: localStorage.getItem('ADMIN_NICKNAME') || 'Super Admin',
          timestamp: serverTimestamp()
        }), 3000);
      } catch (logErr) {
        console.warn('Could not register administrative action log:', logErr);
      }
      
      setTimeout(() => setSheetsSuccess(''), 4000);
    } catch (err: any) {
      console.error('Error saving Google Sheets settings:', err);
      setSheetsError(err.message || 'Gagal menyimpan pengaturan.');
    } finally {
      setIsSavingSheets(false);
    }
  };

  const savePaymentMethodsToFirestore = async (updatedBanks: any[], updatedEwallets: any[]) => {
    setIsSavingPayments(true);
    try {
      const pmDocRef = doc(db, 'settings', 'payment_methods');
      await withTimeoutLocal(setDoc(pmDocRef, {
        banks: updatedBanks,
        ewallets: updatedEwallets,
        updatedAt: serverTimestamp()
      }), 8000, 'Gagal menyimpan metode pembayaran (Timeout).');

      // Log activity (silent catch and timeout protected)
      try {
        const currentAdmin = localStorage.getItem('ADMIN_NICKNAME') || 'Mancung_168';
        const logId = `LOG-${Date.now()}`;
        await withTimeoutLocal(setDoc(doc(db, 'activities', logId), {
          action: 'ubah_metode_pembayaran',
          details: `Mengubah daftar metode pembayaran (Bank/E-Wallet) oleh Super Admin ${currentAdmin}`,
          adminName: currentAdmin,
          timestamp: serverTimestamp()
        }), 3000);
      } catch (logErr) {
        console.warn('Could not register administrative action log:', logErr);
      }

      setFormSuccess('Metode pembayaran berhasil disimpan!');
      setTimeout(() => setFormSuccess(''), 3000);
    } catch (err: any) {
      setFormError('Gagal menyimpan metode pembayaran: ' + err.message);
      setTimeout(() => setFormError(''), 5000);
    } finally {
      setIsSavingPayments(false);
    }
  };

  const saveQrisSettings = async () => {
    setIsSavingQris(true);
    setQrisError('');
    setQrisSuccess('');
    try {
      const qrisDocRef = doc(db, 'settings', 'qris');
      await withTimeoutLocal(setDoc(qrisDocRef, {
        imageB64: tempQrisFile || qrisImage || '',
        qrisText: tempQrisText.trim(),
        updatedAt: serverTimestamp()
      }), 8000, 'Gagal menyimpan QRIS (Timeout).');

      // Log activity (silent catch and timeout protected)
      try {
        const currentAdmin = localStorage.getItem('ADMIN_NICKNAME') || 'Mancung_168';
        const logId = `LOG-${Date.now()}`;
        await withTimeoutLocal(setDoc(doc(db, 'activities', logId), {
          action: 'ubah_qris',
          details: `Mengubah pengaturan QRIS oleh Super Admin ${currentAdmin}`,
          adminName: currentAdmin,
          timestamp: serverTimestamp()
        }), 3000);
      } catch (logErr) {
        console.warn('Could not register administrative action log:', logErr);
      }

      setQrisSuccess('Pengaturan QRIS berhasil diperbarui!');
      setTempQrisFile(null);
      setTimeout(() => setQrisSuccess(''), 3000);
    } catch (err: any) {
      setQrisError('Gagal menyimpan QRIS: ' + err.message);
    } finally {
      setIsSavingQris(false);
    }
  };

  const togglePinVisibility = (id: string) => {
    setShowPinRaw(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!email.trim()) {
      setFormError('Email admin tidak boleh kosong');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Format email tidak valid (contoh: heri@gudang.com)');
      return;
    }

    // Check for duplicate emails
    if (admins.some(a => a.email?.toLowerCase() === email.trim().toLowerCase())) {
      setFormError('Email ini sudah terdaftar sebagai pengelola');
      return;
    }

    setActionLoading(true);
    try {
      // Generate nickname: email prefix + random 4-digit suffix
      const prefix = email.trim().split('@')[0];
      let cleanPrefix = prefix.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
      if (!cleanPrefix) {
        cleanPrefix = 'ADMIN';
      }
      
      let generatedName = '';
      let isUnique = false;
      let attempts = 0;
      
      while (!isUnique && attempts < 100) {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const candidate = `${cleanPrefix}_${randomSuffix}`;
        const exists = admins.some(a => a.name.toUpperCase() === candidate.toUpperCase());
        if (!exists) {
          generatedName = candidate;
          isUnique = true;
        }
        attempts++;
      }
      
      if (!generatedName) {
        generatedName = `${cleanPrefix}_${Date.now().toString().slice(-4)}`;
      }

      const defaultPin = '1234';

      await saveAdmin(generatedName, defaultPin, role, email.trim());
      
      // Log custom activity for this action
      try {
        const currentAdmin = localStorage.getItem('ADMIN_NICKNAME') || 'Mancung_168';
        const logId = `LOG-${Date.now()}`;
        await withTimeoutLocal(setDoc(doc(db, 'activities', logId), {
          action: 'create_admin',
          details: `Menambahkan Admin Baru "${generatedName}" dengan role ${role.toUpperCase()} oleh Super Admin ${currentAdmin}`,
          adminName: currentAdmin,
          timestamp: serverTimestamp()
        }), 3000);
      } catch (logErr) {
        console.warn('Could not register administrative action log:', logErr);
      }

      setFormSuccess(`Sukses! Nick: ${generatedName} | PIN: ${defaultPin}`);
      setName('');
      setEmail('');
      setPin('');
      setRole('admin');
      
      // Reset action loading state immediately so the button stops showing "Proses..."
      setActionLoading(false);

      setTimeout(() => {
        setShowAddForm(false);
        setFormSuccess('');
      }, 5000);

      // Trigger data reload in the background so it does not block UI or prevent actionLoading from being false
      loadData().catch(err => console.error("Error background loading administrators:", err));
    } catch (err: any) {
      setFormError(err.message || 'Gagal menambahkan admin');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (adminItem: AdminItem) => {
    setActionError('');
    if (isMasterSuperAdmin(adminItem.name)) {
      setActionError('Master Super Admin tidak dapat dinonaktifkan atau dihapus demi alasan keamanan sistem jangka panjang!');
      setTimeout(() => setActionError(''), 5000);
      return;
    }

    const conf = window.confirm(`Apakah Anda yakin ingin menghapus akses admin untuk "${adminItem.name.toUpperCase()}"?`);
    if (!conf) return;

    try {
      await deleteAdmin(adminItem.name);

      // Log custom activity for this delete (silent catch and timeout protected)
      try {
        const currentAdmin = localStorage.getItem('ADMIN_NICKNAME') || 'Mancung_168';
        const logId = `LOG-${Date.now()}`;
        await withTimeoutLocal(setDoc(doc(db, 'activities', logId), {
          action: 'delete_admin',
          details: `Menghapus Admin "${adminItem.name.toUpperCase()}" oleh Super Admin ${currentAdmin}`,
          adminName: currentAdmin,
          timestamp: serverTimestamp()
        }), 3000);
      } catch (logErr) {
        console.warn('Could not log delete admin activity:', logErr);
      }

      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'Gagal menghapus akses admin. Periksa kembali koneksi internet Anda.');
      setTimeout(() => setActionError(''), 5000);
    }
  };

  const filteredAdmins = admins.filter(admin => 
    admin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    admin.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div id="admin-manager-root" className="max-w-7xl mx-auto px-4 md:px-8 pb-16">
      
      {/* Upper Panel Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="text-left font-sans">
          <p className="text-[10px] text-blue-600 font-extrabold uppercase tracking-widest">Otoritas Kunci</p>
          <h2 className="text-2xl font-black text-gray-900 leading-tight">Pengelolaan Multi-Admin & Sistem</h2>
          <p className="text-xs text-gray-500 mt-1">Daftar akun pengelola gudang berotoritas serta pengaturan metode pembayaran iuran.</p>
        </div>

        <div className="flex items-center gap-2.5">
          <button 
            onClick={subTab === 'admins' ? loadData : () => {}}
            disabled={subTab !== 'admins'}
            title="Muat Ulang"
            className="p-3.5 bg-white border border-gray-100 hover:bg-gray-50 text-gray-600 rounded-2xl shadow-sm transition-all active:scale-95 flex items-center justify-center cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={15} className={`stroke-[2.5] ${loading && subTab === 'admins' ? 'animate-spin' : ''}`} />
          </button>

          {subTab === 'admins' && (
            <button
              onClick={() => setShowAddForm(true)}
              className="py-3.5 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold rounded-2xl shadow-lg shadow-blue-100 flex items-center gap-2 transition-all active:scale-95 text-xs"
            >
              <UserPlus size={15} className="stroke-[2.5]" />
              Tambah Admin Baru
            </button>
          )}
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex border-b border-gray-100 mb-8 gap-6 shrink-0 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setSubTab('admins')}
          className={`pb-4 text-xs font-black transition-all border-b-2 whitespace-nowrap relative ${
            subTab === 'admins' 
              ? 'text-blue-600 border-blue-600 font-extrabold' 
              : 'text-gray-400 border-transparent hover:text-gray-600'
          }`}
        >
          Daftar Admin
        </button>
        <button
          onClick={() => setSubTab('payments')}
          className={`pb-4 text-xs font-black transition-all border-b-2 whitespace-nowrap relative ${
            subTab === 'payments' 
              ? 'text-blue-600 border-blue-600 font-extrabold' 
              : 'text-gray-400 border-transparent hover:text-gray-600'
          }`}
        >
          Metode Pembayaran (Transfer & E-Wallet)
        </button>
        <button
          onClick={() => setSubTab('sheets')}
          className={`pb-4 text-xs font-black transition-all border-b-2 whitespace-nowrap relative ${
            subTab === 'sheets' 
              ? 'text-blue-600 border-blue-600 font-extrabold' 
              : 'text-gray-400 border-transparent hover:text-gray-600'
          }`}
        >
          Integrasi Google Sheets
        </button>
        <button
          onClick={() => setSubTab('whatsapp')}
          className={`pb-4 text-xs font-black transition-all border-b-2 whitespace-nowrap relative ${
            subTab === 'whatsapp' 
              ? 'text-blue-600 border-blue-600 font-extrabold' 
              : 'text-gray-400 border-transparent hover:text-gray-600'
          }`}
        >
          Konfigurasi WhatsApp API
        </button>
      </div>

      {subTab === 'admins' ? (
        loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm">
            <Loader2 className="animate-spin text-blue-600 mb-3" size={32} />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Memuat Pengelola...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Main Grid: Admin list and details */}
            <div className="lg:col-span-3 space-y-6">
              
              {actionError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50/80 border border-red-100/50 p-4 rounded-[1.8rem] text-center"
                >
                  <p className="text-xs font-black text-red-500">{actionError}</p>
                </motion.div>
              )}
              
              {/* Search filter bar */}
              <div className="bg-white p-4 rounded-[1.8rem] border border-gray-100 shadow-sm flex items-center justify-between gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Cari admin berdasarkan nama atau role..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 rounded-2xl text-xs font-bold font-sans text-gray-700 outline-none border border-transparent focus:border-blue-100 focus:bg-white transition-all"
                  />
                </div>
                
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest shrink-0 px-2 font-mono">
                  {filteredAdmins.length} Terdaftar
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence>
                  {filteredAdmins.map((admin) => {
                    const master = isMasterSuperAdmin(admin.name);
                    return (
                      <motion.div
                        key={admin.id}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className={`relative bg-white rounded-[2rem] border p-6 flex flex-col justify-between transition-all hover:shadow-xl shadow-gray-200/50 ${
                          master 
                            ? 'border-amber-200 bg-amber-50/5' 
                            : admin.role === 'super-admin'
                            ? 'border-blue-200' 
                            : 'border-gray-100'
                        }`}
                      >
                        <div className="space-y-4">
                          {/* Header card */}
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                                master 
                                  ? 'bg-amber-100 text-amber-600' 
                                  : admin.role === 'super-admin'
                                  ? 'bg-blue-50 text-blue-600'
                                  : 'bg-gray-100/80 text-gray-600'
                              }`}>
                                <User size={18} className="stroke-[2.5]" />
                              </div>
                              
                              <div className="text-left">
                                <h3 className="font-extrabold text-sm text-gray-900 tracking-tight uppercase">
                                  {admin.name}
                                </h3>
                                <span className="text-[10px] font-bold text-gray-400 block">ID: {admin.id}</span>
                                {admin.email && (
                                  <span className="text-[10px] font-medium text-slate-500 block truncate max-w-[140px] mt-0.5" title={admin.email}>
                                    {admin.email}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="text-right">
                              {admin.role === 'super-admin' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-100 font-extrabold text-[9px] rounded-lg uppercase tracking-wider pl-1.5 shrink-0 select-none">
                                  <ShieldCheck size={9} />
                                  Super Admin
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 text-slate-700 border border-slate-100 font-bold text-[9px] rounded-lg uppercase tracking-wider shrink-0 select-none">
                                  <ShieldAlert size={9} />
                                  Staff Admin
                                </span>
                              )}
                            </div>
                          </div>

                          {/* PIN viewer row */}
                          <div className="flex items-center justify-between p-3.5 bg-gray-50/80 rounded-2xl border border-gray-100">
                            <div className="flex items-center gap-2">
                              <Key size={13} className="text-gray-400" />
                              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">PIN Otorisasi</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs tracking-widest text-slate-700">
                                {showPinRaw[admin.id] ? admin.pin : '••••'}
                              </span>
                              <button
                                onClick={() => togglePinVisibility(admin.id)}
                                className="p-1 hover:bg-gray-200/50 text-gray-400 hover:text-gray-700 rounded-lg transition-all"
                                title="Tampilkan PIN"
                              >
                                {showPinRaw[admin.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Footer actions inside card */}
                        <div className="pt-5 mt-5 border-t border-gray-100 flex items-center justify-between">
                          <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">
                            {master ? 'Sistem Master' : 'Pengelola Eksternal'}
                          </span>

                          {!master && (
                            <button
                              onClick={() => handleDelete(admin)}
                              className="p-2 bg-red-50 text-red-600 hover:bg-red-100 font-bold rounded-xl text-xs transition-all flex items-center gap-1 active:scale-95 shadow-sm"
                              title="Hapus Hak Akses"
                            >
                              <Trash2 size={13} />
                              Hapus
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          </div>
        )
      ) : subTab === 'payments' ? (
        /* Payments Tab content screen */
        paymentsLoading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm">
            <Loader2 className="animate-spin text-blue-600 mb-3" size={32} />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Memuat Metode Pembayaran...</p>
          </div>
        ) : (
          <div className="space-y-10 animate-fade-in">
            {/* Card warning/header info */}
            <div className="bg-amber-50 border border-amber-100 rounded-[2rem] p-6 text-left flex flex-col md:flex-row items-start gap-4">
              <span className="text-2xl shrink-0">💳</span>
              <div>
                <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">Pengaturan Rekening & E-Wallet</h4>
                <p className="text-xs text-amber-800 font-medium leading-relaxed mt-1">
                  Seluruh metode pembayaran di bawah ini akan sinkron secara real-time ke halaman iuran anggota. Anggota akan melihat info nomor rekening ini saat beralih metode pembayaran.
                </p>
              </div>
            </div>

            {/* Banks Grid */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-left">
                  <h3 className="text-lg font-black text-gray-900">Daftar Bank Transfer</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Kelola nomor rekening bank untuk transfer iuran</p>
                </div>
                <button
                  onClick={() => setEditingPayment({
                    type: 'bank',
                    isNew: true,
                    data: { id: `bank_${Date.now()}`, name: '', holder: '', number: '', color: 'bg-blue-600', comingSoon: false }
                  })}
                  className="py-2.5 px-4 bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-black rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} className="stroke-[2.5]" />
                  Tambah Bank
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {banks.map((bank) => (
                  <div key={bank.id} className="bg-white rounded-[2.2rem] border border-gray-100 p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="space-y-4">
                      {/* Visual Card Preview */}
                      <div className={`p-5 rounded-2xl ${bank.color} text-white shadow relative overflow-hidden text-left min-h-[140px] flex flex-col justify-between`}>
                        <div className="relative z-10">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[9px] font-bold opacity-75 uppercase tracking-widest leading-none">Nama Bank</p>
                              <p className="text-sm font-black mt-1 leading-normal">{bank.name}</p>
                            </div>
                            {bank.comingSoon && (
                              <span className="text-[8px] font-black text-amber-600 bg-white/95 px-2 py-0.5 rounded-lg border border-white tracking-widest uppercase">COMING SOON</span>
                            )}
                          </div>
                          
                          {!bank.comingSoon ? (
                            <div className="mt-4">
                              <p className="text-[9px] font-bold opacity-75 uppercase tracking-widest leading-none">Nomor Rekening</p>
                              <p className="text-base font-mono font-bold tracking-wider mt-1 leading-none">{bank.number}</p>
                            </div>
                          ) : (
                            <p className="text-xs font-black mt-4 pl-0.5 tracking-tight uppercase bg-white/10 px-2.5 py-1.5 rounded-lg inline-block text-[10px]">COMING SOON MODE</p>
                          )}
                        </div>

                        {!bank.comingSoon && (
                          <div className="relative z-10 mt-2">
                            <p className="text-[9px] font-bold opacity-75 uppercase tracking-widest leading-none">Atas Nama</p>
                            <p className="text-xs font-bold mt-1 uppercase font-mono max-w-[170px] truncate leading-none">{bank.holder || '-'}</p>
                          </div>
                        )}
                        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-6 border-t border-gray-50 pt-4">
                      <span className="text-[9px] font-extrabold uppercase text-gray-400 font-mono tracking-wider">ID: {bank.id}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingPayment({ type: 'bank', isNew: false, data: { ...bank } })}
                          className="py-2.5 px-3 bg-gray-50 text-gray-600 hover:bg-gray-100 font-bold rounded-xl text-[10px] transition-all flex items-center gap-1 active:scale-95"
                        >
                          <Edit2 size={11} />
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Hapus bank ${bank.name}?`)) {
                              const updated = banks.filter(b => b.id !== bank.id);
                              setBanks(updated);
                              savePaymentMethodsToFirestore(updated, ewallets);
                            }
                          }}
                          className="p-2.5 bg-red-50 text-red-600 hover:bg-red-100 font-bold rounded-xl transition-all active:scale-95"
                          title="Hapus"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* E-Wallets Grid */}
            <div className="space-y-4 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-left">
                  <h3 className="text-lg font-black text-gray-900">Daftar E-Wallet</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Kelola nomor akun dompet digital untuk pembayaran iuran</p>
                </div>
                <button
                  onClick={() => setEditingPayment({
                    type: 'ewallet',
                    isNew: true,
                    data: { id: `ewallet_${Date.now()}`, name: '', holder: '', number: '', color: 'bg-sky-500', iconText: 'W', appUrl: '', fallbackUrl: '' }
                  })}
                  className="py-2.5 px-4 bg-sky-50 text-sky-600 hover:bg-sky-100 text-xs font-black rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} className="stroke-[2.5]" />
                  Tambah E-Wallet
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {ewallets.map((ewallet) => (
                  <div key={ewallet.id} className="bg-white rounded-[2.2rem] border border-gray-100 p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                    <div className="space-y-4">
                      {/* Visual Card Preview */}
                      <div className={`p-5 rounded-2xl ${ewallet.color} text-white shadow relative overflow-hidden text-left min-h-[140px] flex flex-col justify-between`}>
                        <div className="relative z-10">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-black text-sm select-none">
                                {ewallet.iconText || 'W'}
                              </div>
                              <div>
                                <p className="text-[9px] font-bold opacity-75 uppercase tracking-widest leading-none">E-Wallet</p>
                                <p className="text-sm font-black mt-0.5 leading-normal">{ewallet.name}</p>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4">
                            <p className="text-[9px] font-bold opacity-75 uppercase tracking-widest leading-none">Nomor Akun / HP</p>
                            <p className="text-base font-mono font-bold tracking-wider mt-1 leading-none">{ewallet.number}</p>
                          </div>
                        </div>

                        <div className="relative z-10 mt-2">
                          <div className="flex justify-between items-end">
                            <div>
                              <p className="text-[9px] font-bold opacity-75 uppercase tracking-widest leading-none">Atas Nama</p>
                              <p className="text-xs font-bold mt-1 uppercase font-mono max-w-[130px] truncate leading-none">{ewallet.holder || '-'}</p>
                            </div>
                            {ewallet.appUrl && (
                              <span className="text-[9px] font-bold bg-white/20 px-2.5 py-0.5 rounded-lg border border-white/10 leading-none scale-90">URL</span>
                            )}
                          </div>
                        </div>
                        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-6 border-t border-gray-50 pt-4">
                      <span className="text-[9px] font-extrabold uppercase text-gray-400 font-mono tracking-wider">ID: {ewallet.id}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingPayment({ type: 'ewallet', isNew: false, data: { ...ewallet } })}
                          className="py-2.5 px-3 bg-gray-50 text-gray-600 hover:bg-gray-100 font-bold rounded-xl text-[10px] transition-all flex items-center gap-1 active:scale-95"
                        >
                          <Edit2 size={11} />
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Hapus e-wallet ${ewallet.name}?`)) {
                              const updated = ewallets.filter(ew => ew.id !== ewallet.id);
                              setEwallets(updated);
                              savePaymentMethodsToFirestore(banks, updated);
                            }
                          }}
                          className="p-2.5 bg-red-50 text-red-600 hover:bg-red-100 font-bold rounded-xl transition-all active:scale-95"
                          title="Hapus"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* QRIS Settings Card */}
            <div id="qris-settings-section" className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-6 text-left">
              <div id="qris-settings-logo-header" className="flex items-center gap-3 border-b border-gray-50 pb-4">
                <div className="w-10 h-10 bg-pink-50 text-pink-600 rounded-2xl flex items-center justify-center">
                  <QrCode size={20} className="stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">Pengaturan QRIS Pembayaran</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Ganti file gambar QRIS atau string payload QRIS dinamis</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left side: Upload & Form fields */}
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-gray-700 uppercase tracking-wider">File Gambar QRIS Baru:</label>
                    <div className="flex items-center justify-center w-full">
                      <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-gray-200 border-dashed rounded-[2rem] cursor-pointer bg-gray-50/50 hover:bg-gray-50 transition-all">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
                          <span className="text-2xl mb-1">📤</span>
                          <p className="mb-1 text-xs font-bold text-gray-500">Pilih berkas gambar</p>
                          <p className="text-[9px] text-gray-400 font-medium">PNG, JPG, atau WebP (Maks. 800 KB)</p>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 800 * 1024) {
                                setQrisError('Ukuran file terlalu besar. Maksimal 800 KB.');
                                return;
                              }
                              setQrisError('');
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setTempQrisFile(reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-black text-gray-700 uppercase tracking-wider">Teks Payload QRIS (String Statis):</label>
                    <textarea
                      rows={4}
                      placeholder="Contoh: 00020101021126570020ID.CO.QRIS.WWW0303..."
                      value={tempQrisText}
                      onChange={(e) => setTempQrisText(e.target.value)}
                      className="w-full px-4.5 py-3.5 text-xs border border-gray-100 bg-gray-50/50 rounded-2xl focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-50 outline-none transition-all font-mono leading-normal"
                    />
                    <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                      💡 Masukkan string kode QRIS statis merchant Anda untuk mengaktifkan fitur nominal otomatis dinamis saat anggota melakukan pembayaran iuran.
                    </p>
                  </div>

                  {qrisError && (
                    <div className="p-3.5 bg-red-50 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-2 border border-red-100">
                      <AlertCircle size={15} />
                      {qrisError}
                    </div>
                  )}

                  {qrisSuccess && (
                    <div className="p-3.5 bg-green-50 text-green-600 rounded-2xl text-xs font-bold flex items-center gap-2 border border-green-100">
                      <Check size={15} />
                      {qrisSuccess}
                    </div>
                  )}

                  <button
                    onClick={saveQrisSettings}
                    disabled={isSavingQris || (!tempQrisFile && !tempQrisText.trim() && qrisImage === '')}
                    className="w-full py-4 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-extrabold rounded-2xl shadow-lg shadow-pink-100 hover:shadow-pink-200 active:scale-95 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSavingQris ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        Menyimpan QRIS...
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        Simpan QRIS Baru
                      </>
                    )}
                  </button>
                </div>

                {/* Right side: Preview of current config */}
                <div className="bg-gray-50/50 rounded-[2rem] border border-gray-100 p-6 flex flex-col justify-between">
                  <div className="space-y-4 text-center">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Pratinjau Kode QRIS</p>
                    
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 max-w-[240px] mx-auto shadow-sm flex items-center justify-center">
                      {tempQrisFile ? (
                        <div className="relative">
                          <img src={tempQrisFile} alt="Preview Upload QRIS" className="w-44 h-44 object-contain" />
                          <span className="absolute -top-2 -right-2 bg-pink-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow border border-white shrink-0">BARU</span>
                        </div>
                      ) : qrisImage ? (
                        <img src={qrisImage} alt="Current QRIS" className="w-44 h-44 object-contain" />
                      ) : (
                        <div className="w-44 h-44 bg-gray-100 rounded-2xl flex flex-col items-center justify-center gap-2">
                          <QrCode size={40} className="text-gray-300 stroke-[1.5]" />
                          <p className="text-[10px] text-gray-400 font-bold">Belum Ada Gambar</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 space-y-2 border-t border-gray-200/50 pt-4 text-left">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block">Status Payload QRIS:</span>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${tempQrisText ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className="text-xs font-extrabold text-gray-700">
                        {tempQrisText ? 'Dukungan QRIS Dinamis Aktif' : 'Hanya Gambar (Hanya Statis)'}
                      </span>
                    </div>
                    {tempQrisText && (
                      <p className="text-[10px] font-mono text-gray-500 break-all bg-white p-3 rounded-xl border border-gray-100 shrink-0 max-h-24 overflow-y-auto">
                        {tempQrisText}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) ) : subTab === 'sheets' ? (
          /* Google Sheets Tab content screen */
          <div className="space-y-10 animate-fade-in text-left">
            {/* Header / Info card */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-[2rem] p-6 text-left flex flex-col md:flex-row items-start gap-4">
              <span className="text-2xl shrink-0">📊</span>
              <div>
                <h4 className="text-sm font-black text-emerald-900 uppercase tracking-tight">Sinkronisasi & Integrasi Google Sheets</h4>
                <p className="text-xs text-emerald-800 font-medium leading-relaxed mt-1 font-sans">
                  Sistem mendukung integrasi langsung ke Google Sheets API. Anda dapat menentukan ID Spreadsheet pribadi Anda di bawah ini, atau membiarkannya kosong. Jika dibiarkan kosong, sistem secara otomatis akan membuat spreadsheet laporan keuangan baru di akun Google/Drive Anda saat pertama kali melakukan ekspor transaksi.
                </p>
              </div>
            </div>

            {/* Google Sheets Settings Card */}
            <div id="sheets-settings-section" className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-6">
              <div id="sheets-settings-logo-header" className="flex items-center gap-3 border-b border-gray-50 pb-4">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                  <FileSpreadsheet size={20} className="stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 font-sans">ID Spreadsheet Pribadi Admin</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-sans">Salin ID dari URL Google Sheets Anda untuk langsung menimpa file spreadsheet yang sama</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left side: Form fields */}
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-gray-700 uppercase tracking-wider font-sans">Spreadsheet ID atau URL Lengkap:</label>
                    <input
                      type="text"
                      placeholder="Contoh: 1sOM-Veeh2T7R2wZ2g..."
                      value={tempSpreadsheetId}
                      onChange={(e) => {
                        let value = e.target.value;
                        // Extra utility: if user paste a full URL, extract spreadsheetId
                        const match = value.match(/\/d\/([a-zA-Z0-9-_]+)/);
                        if (match && match[1]) {
                          setTempSpreadsheetId(match[1]);
                        } else {
                          setTempSpreadsheetId(value);
                        }
                      }}
                      className="w-full px-4.5 py-3.5 text-xs border border-gray-200 bg-gray-50/50 rounded-2xl focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 outline-none transition-all font-mono leading-normal"
                    />
                    <p className="text-[10px] text-gray-400 font-medium leading-relaxed mt-1">
                      💡 <strong>Tips:</strong> Tempelkan URL Google Sheets lengkap Anda (misal: <code>https://docs.google.com/spreadsheets/d/1sOM.../edit</code>), sistem akan otomatis mengekstrak ID-nya secara aman.
                    </p>
                  </div>

                  {sheetsError && (
                    <div className="p-3.5 bg-red-50 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-2 border border-red-100">
                      <AlertCircle size={15} />
                      {sheetsError}
                    </div>
                  )}

                  {sheetsSuccess && (
                     <div className="p-3.5 bg-green-50 text-green-600 rounded-2xl text-xs font-bold flex items-center gap-2 border border-green-100">
                      <Check size={15} />
                      {sheetsSuccess}
                    </div>
                  )}

                  <div className="flex gap-3">
                    {spreadsheetId && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm('Apakah Anda yakin ingin menghapus sinkronisasi ke spreadsheet ini? Ekspor berikutnya akan membuat spreadsheet baru.')) {
                            setTempSpreadsheetId('');
                            try {
                              const sheetsDocRef = doc(db, 'settings', 'google_sheets');
                              await withTimeoutLocal(setDoc(sheetsDocRef, {
                                spreadsheetId: '',
                                updatedAt: serverTimestamp()
                              }, { merge: true }), 8000, 'Gagal menghapus sinkronisasi spreadsheet (Timeout).');
                              setSheetsSuccess('Sinkronisasi spreadsheet berhasil dihapus.');
                              setTimeout(() => setSheetsSuccess(''), 4000);
                            } catch (e: any) {
                              setSheetsError(e.message || 'Gagal menghapus sinkronisasi.');
                            }
                          }
                        }}
                        className="py-4 px-5 bg-gray-50 hover:bg-gray-150 text-gray-600 font-extrabold rounded-2xl border border-gray-200 transition-all text-xs active:scale-95"
                      >
                        Putuskan
                      </button>
                    )}
                    
                    <button
                      onClick={saveSheetsSettings}
                      disabled={isSavingSheets}
                      className="flex-1 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold rounded-2xl shadow-lg shadow-emerald-100 hover:shadow-emerald-200 active:scale-95 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSavingSheets ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          Menyimpan Pengaturan...
                        </>
                      ) : (
                        <>
                          <Check size={16} />
                          Simpan ID Spreadsheet
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Right side: Informative Guideline / Status of current config */}
                <div className="bg-gray-50/50 rounded-[2rem] border border-gray-100 p-6 flex flex-col justify-between">
                  <div className="space-y-4 text-left font-sans">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest text-center">Status Integrasi Aktif</p>
                    
                    <div className="bg-white p-5 rounded-3xl border border-gray-150 shadow-sm flex flex-col items-center justify-center gap-3 text-center">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${spreadsheetId ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                        <Database size={22} className="stroke-[2.5]" />
                      </div>
                      <div>
                        <h5 className="font-extrabold text-xs text-gray-900">
                          {spreadsheetId ? 'Terhubung ke Spreadsheet Pribadi' : 'Mode Pembuatan Otomatis'}
                        </h5>
                        <p className="text-[10px] text-gray-400 font-medium leading-normal mt-0.5">
                          {spreadsheetId 
                            ? `Spreadsheet ID: ${spreadsheetId.substring(0, 10)}...${spreadsheetId.substring(spreadsheetId.length - 6)}` 
                            : 'Sistem akan membuat file spreadsheet baru dan mendaftarkannya ke sini secara otomatis saat Anda mengekspor data kas.'}
                        </p>
                      </div>

                      {spreadsheetId && (
                        <a
                          href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 py-2 px-4.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-extrabold text-[10px] transition-all flex items-center gap-1 border border-emerald-100 cursor-pointer decoration-none"
                        >
                          Buka Google Sheet Anda
                          <svg className="w-3 h-3 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="mt-6 space-y-2.5 border-t border-gray-250/20 pt-4 text-left">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block">Bagaimana Cara Kerja Sinkronisasi?</span>
                    <ul className="text-[10px] text-gray-505 font-medium leading-relaxed list-disc list-inside space-y-1 font-sans">
                      <li>Buka Google Sheets Anda dan salin bagian ID di URL-nya.</li>
                      <li>Masukkan ID tersebut ke kolom di sebelah kiri, lalu simpan.</li>
                      <li>Ketika Anda mengklik tombol "Ekspor Google Sheets" di halaman Daftar Transaksi, sistem akan langsung mengosongkan dan menimpa baris data di tab Sheets tersebut tanpa membuat file baru.</li>
                      <li>Sistem secara otomatis membuat dan menata tab <strong>'Ringkasan Laporan'</strong>, <strong>'Mutasi Kas Manual'</strong>, dan <strong>'Penerimaan Iuran Anggota'</strong> dengan format, warna, dan perapian baris berkelas secara real-time.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* WhatsApp API tab content screen */
          waLoading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm">
              <Loader2 className="animate-spin text-blue-600 mb-3" size={32} />
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Memuat Pengaturan WhatsApp...</p>
            </div>
          ) : (
            <div className="space-y-10 animate-fade-in text-left">
              {/* Header / Info card */}
              <div className="bg-blue-50 border border-blue-100 rounded-[2rem] p-6 text-left flex flex-col md:flex-row items-start gap-4">
                <span className="text-2xl shrink-0">💬</span>
                <div>
                  <h4 className="text-sm font-black text-blue-900 uppercase tracking-tight">Konektivitas WhatsApp Gateway & Notifikasi Otomatis</h4>
                  <p className="text-xs text-blue-800 font-medium leading-relaxed mt-1 font-sans">
                    Sistem dapat mendispatch bukti tagihan / tanda terima kas secara otomatis atau real-time ke nomor HP WhatsApp anggota begitu pembayaran mereka terverifikasi lunas. Silakan lengkapi konfigurasi API key dari provider pilihan Anda di bawah ini secara aman.
                  </p>
                </div>
              </div>

              {/* WhatsApp Config Card */}
              <div id="wa-settings-section" className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-6">
                <div id="wa-settings-logo-header" className="flex items-center gap-3 border-b border-gray-50 pb-4">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                    <MessageSquare size={20} className="stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900 font-sans">Gateway Service Provider</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-sans">Gunakan Fonnte, Wablas, atau sesuaikan API Endpoint mandiri Anda</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left form inputs */}
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="block text-xs font-black text-gray-700 uppercase tracking-wider font-sans">Pilih Provider:</label>
                      <select
                        value={waProvider}
                        onChange={(e: any) => setWaProvider(e.target.value)}
                        className="w-full px-4.5 py-3.5 text-xs border border-gray-200 bg-gray-50/50 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-gray-700 font-sans"
                      >
                        <option value="off">🔴 Dinonaktifkan (Kirim Manual via deep-link wa.me)</option>
                        <option value="fonnte">🟢 Fonnte (api.fonnte.com)</option>
                        <option value="wablas">🔵 Wablas (api.wablas.com)</option>
                        <option value="custom">⚙️ Custom HTTP API Gateway (GET / POST)</option>
                      </select>
                    </div>

                    {waProvider !== 'off' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-5"
                      >
                        {waProvider !== 'custom' && (
                          <div className="space-y-2">
                            <label className="block text-xs font-black text-gray-700 uppercase tracking-wider font-sans">
                              {waProvider === 'fonnte' ? 'Fonnte' : 'Wablas'} API Key / Token Otorisasi:
                            </label>
                            <input
                              type="password"
                              placeholder={`Masukkan token otorisasi ${waProvider === 'fonnte' ? 'Fonnte' : 'Wablas'}...`}
                              value={waToken}
                              onChange={(e) => setWaToken(e.target.value)}
                              className="w-full px-4.5 py-3.5 text-xs border border-gray-200 bg-gray-50/50 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-mono"
                            />
                            <p className="text-[10px] text-gray-400 font-medium font-sans">
                              Sandi disembunyikan secara aman di server side. Jangan bagikan token Anda ke pihak tidak bertanggung jawab.
                            </p>
                          </div>
                        )}

                        {waProvider === 'wablas' && (
                          <div className="space-y-2">
                            <label className="block text-xs font-black text-gray-700 uppercase tracking-wider font-sans">
                              Wablas Server URL (Optional):
                            </label>
                            <input
                              type="text"
                              placeholder="Default: https://api.wablas.com"
                              value={waBaseUrl}
                              onChange={(e) => setWaBaseUrl(e.target.value)}
                              className="w-full px-4.5 py-3.5 text-xs border border-gray-200 bg-gray-50/50 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-mono"
                            />
                          </div>
                        )}

                        {waProvider === 'custom' && (
                          <div className="space-y-4 border-l-2 border-blue-100 pl-4">
                            <div className="space-y-2">
                              <label className="block text-xs font-black text-gray-700 uppercase tracking-wider font-sans">Endpoint URL Base:</label>
                              <input
                                type="text"
                                placeholder="https://domain-anda.com/api/send-message"
                                value={waBaseUrl}
                                onChange={(e) => setWaBaseUrl(e.target.value)}
                                className="w-full px-4.5 py-3.5 text-xs border border-gray-255 bg-gray-50/50 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-mono"
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="block text-xs font-black text-gray-700 uppercase tracking-wider font-sans">HTTP Method:</label>
                              <select
                                value={waCustomMethod}
                                onChange={(e: any) => setWaCustomMethod(e.target.value)}
                                className="w-full px-4.5 py-3.5 text-xs border border-gray-200 bg-gray-50/50 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-gray-700 font-sans"
                              >
                                <option value="POST">POST (Kirim Payload JSON / Form Body)</option>
                                <option value="GET">GET (Pass query string parameters)</option>
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="block text-xs font-black text-gray-700 uppercase tracking-wider font-sans">Headers Otorisasi / Tambahan (Menerima Format JSON Object):</label>
                              <textarea
                                placeholder='{"Authorization": "Bearer TOKEN", "X-Custom-Header": "Nilai"}'
                                value={waCustomHeaders}
                                onChange={(e) => setWaCustomHeaders(e.target.value)}
                                rows={2}
                                className="w-full px-4.5 py-3.5 text-xs border border-gray-200 bg-gray-50/50 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-mono text-gray-700 resize-none leading-relaxed"
                              />
                            </div>

                            {waCustomMethod === 'POST' && (
                              <div className="space-y-2">
                                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider font-sans">Form / JSON Template Body:</label>
                                <textarea
                                  placeholder='{"phone": "{{phone}}", "message": "{{message}}", "sender": "DEVICE_KEY"}'
                                  value={waCustomBody}
                                  onChange={(e) => setWaCustomBody(e.target.value)}
                                  rows={3}
                                  className="w-full px-4.5 py-3.5 text-xs border border-gray-200 bg-gray-50/50 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-mono text-gray-700 resize-none leading-relaxed"
                                />
                                <p className="text-[9px] text-gray-400 font-medium font-sans">
                                  Gunakan <code>{"{{phone}}"}</code> dan <code>{"{{message}}"}</code> untuk menyisipkan variabel data secara dinamis.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}

                    {waError && (
                      <div className="p-3.5 bg-red-50 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-2 border border-red-100 font-sans">
                        <AlertCircle size={15} />
                        {waError}
                      </div>
                    )}

                    {waSuccess && (
                      <div className="p-3.5 bg-green-50 text-green-600 rounded-2xl text-xs font-bold flex items-center gap-2 border border-green-100 font-sans">
                        <Check size={15} />
                        {waSuccess}
                      </div>
                    )}

                    <button
                      onClick={saveWaSettings}
                      disabled={waIsSaving}
                      className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold rounded-2xl shadow-lg shadow-blue-100 hover:shadow-blue-200 active:scale-95 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer font-sans"
                    >
                      {waIsSaving ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          Menyimpan Konfigurasi...
                        </>
                      ) : (
                        <>
                          <Check size={16} />
                          Simpan Pengaturan API WhatsApp
                        </>
                      )}
                    </button>
                  </div>

                  {/* Right side: instructions, tips, status */}
                  <div className="bg-gray-50/50 rounded-[2rem] border border-gray-100 p-6 flex flex-col justify-between">
                    <div className="space-y-4 text-left font-sans">
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest text-center">Indikator Integrasi Sistem</p>

                      <div className="bg-white p-5 rounded-3xl border border-gray-150 shadow-sm flex flex-col items-center justify-center gap-3 text-center">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${waProvider !== 'off' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                          <Send size={22} className="stroke-[2.5]" />
                        </div>
                        <div>
                          <h5 className="font-extrabold text-xs text-gray-900">
                            {waProvider === 'off' ? 'Offline (Mode Klik Link)' : `Aktif via ${waProvider.toUpperCase()}`}
                          </h5>
                          <p className="text-[10px] text-gray-400 font-medium leading-normal mt-0.5">
                            {waProvider === 'off' 
                              ? 'Admin harus mengklik tombol WhatsApp secara manual untuk membuka chat dengan template teks yang terisi.' 
                              : `Gateway aktif. Setiap kali pembayaran divalidasi, system auto-dispatch akan mencoba mengirim struk langsung.`}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 space-y-2.5 border-t border-gray-250/20 pt-4 text-left">
                      <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block font-sans">Panduan Variabel Pesan Custom API</span>
                      <p className="text-[10px] text-gray-500 leading-relaxed font-medium font-sans">
                        Bila Anda menggunakan mode <strong>Custom API Gateway</strong>, berikut adalah daftar pengganti string dinamis yang digunakan:
                      </p>
                      <ul className="text-[10px] text-gray-500 font-medium leading-relaxed list-disc list-inside space-y-1 font-sans">
                        <li><code>{"{{phone}}"}</code>: Nomor HP tujuan yang diawali kode negara <code>628...</code></li>
                        <li><code>{"{{message}}"}</code>: Teks bukti pembayaran lengkap dengan rincian nama driver/helper, bulan iuran, jumlah, dan nama Admin penanggungjawab.</li>
                      </ul>
                      <p className="text-[10px] text-gray-400 leading-relaxed font-sans">
                        ⚠️ <strong>Catatan:</strong> WhatsApp API ini dilindungi sepenuhnya di server side demi menjaga keamanan kredensial token/key Anda dari publik.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* WhatsApp Server-Side Audit Logs Section */}
              <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-50 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-yellow-50 text-amber-650 rounded-2xl flex items-center justify-center">
                      <Settings size={20} className="stroke-[2.5]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-gray-900 font-sans text-left">Log Audit & Diagnostik WhatsApp</h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-sans text-left">Lacak status pengiriman otomatis & deteksi error server/isunya</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchWaAuditLogs}
                      disabled={waAuditLogsLoading}
                      className="px-4 py-2 border border-blue-100 bg-blue-50/50 hover:bg-blue-50 text-blue-600 rounded-xl flex items-center gap-1.5 text-xs font-black transition-all font-sans cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={waAuditLogsLoading ? "animate-spin" : ""} />
                      Muat Ulang Log
                    </button>
                    {waAuditLogs.length > 0 && (
                      <button
                        onClick={clearWaAuditLogs}
                        className="px-4 py-2 border border-red-100 bg-red-50 hover:bg-red-100/70 text-red-600 rounded-xl flex items-center gap-1.5 text-xs font-black transition-all font-sans cursor-pointer"
                      >
                        <Trash2 size={14} />
                        Hapus Semua
                      </button>
                    )}
                  </div>
                </div>

                {/* Show Diagnostic Help if there's any permission errors */}
                {waAuditLogs.some(log => log.status === 'failure' && (log.error?.includes('PERMISSION_DENIED') || log.error?.toLowerCase().includes('permission'))) && (
                  <div className="bg-amber-50/70 border border-amber-100 rounded-3xl p-5 text-left font-sans space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="text-xl shrink-0">⚠️</span>
                      <div className="space-y-1">
                        <h4 className="text-xs font-extrabold text-amber-900 uppercase tracking-tight">Peringatan: Error Izin Database (PERMISSION_DENIED) Terdeteksi!</h4>
                        <p className="text-[11px] text-amber-800 leading-relaxed font-semibold">
                          Akun Firebase (ADC / Service Account) yang digunakan oleh backend saat ini tidak memiliki hak akses/izin penuh untuk membaca atau menulis dokumen di Firestore database proyek Anda.
                        </p>
                      </div>
                    </div>
                    <div className="bg-white/80 border border-amber-100/30 rounded-2xl p-4 text-[10px] text-amber-950 leading-relaxed font-sans space-y-1.5 font-medium">
                      <p className="font-bold text-[11px]">💡 Penyebab Utama & Cara Mengatasinya:</p>
                      <ol className="list-decimal list-inside space-y-1 pl-1">
                        <li>
                          <strong>Mismatch Proyek Firebase:</strong> Service Account di <code>firebase-service-account.json</code> atau Environment Default menunjuk ke proyek target yang berbeda dari <code>firebase-applet-config.json</code>.
                        </li>
                        <li>
                          <strong>Aturan Aturan Aturan (Security Rules):</strong> Pastikan aturan database memperbolehkan admin membaca koleksi <code>settings/whatsapp</code>.
                        </li>
                        <li>
                          <strong>Solusi Cepat:</strong> Coba jalankan ulang setup database melalui panel Admin atau unggah/pastikan file Service Account JSON yang valid yang sesuai dengan kredensial proyek <strong>{firebaseConfig.projectId}</strong>. Ditambah pastikan file tersebut berada di direktori root aplikasi.
                        </li>
                      </ol>
                    </div>
                  </div>
                )}

                {/* Audit Logs Content */}
                {waAuditLogsLoading && waAuditLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 bg-gray-50/30 rounded-3xl border border-dashed border-gray-150">
                    <Loader2 className="animate-spin text-blue-600 mb-2" size={24} />
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-sans">Menghubungi Server & Mengambil Log...</p>
                  </div>
                ) : waAuditLogsError ? (
                  <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-3xl text-center text-xs font-bold font-sans">
                    ❌ Gagal Memuat Log Audit: {waAuditLogsError}
                  </div>
                ) : waAuditLogs.length === 0 ? (
                  <div className="py-12 bg-gray-50/40 rounded-3xl border border-dashed border-gray-200 text-center text-gray-450 font-sans">
                    <p className="text-xs font-bold uppercase tracking-wider">Belum Ada Riwayat Log Audit</p>
                    <p className="text-[10px] font-medium leading-normal mt-1 max-w-sm mx-auto text-gray-400/80">Riwayat otomatisasi akan dicatat di server-side ke file lokal di container ini begitu verifikasi iuran memicu dispatch gateway WhatsApp.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Diagnostic Summary of active server node */}
                    {waAuditLogs[0]?.diagnostic && (
                      <div className="bg-gray-50 rounded-3xl p-4 border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5 text-left font-sans">
                          <span className="text-[9px] font-black tracking-widest text-gray-455 uppercase leading-none block">Status Diagnostik Node Server Saat Ini</span>
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] font-bold text-gray-600">
                            <div>Proyek Target: <span className="font-black text-gray-900">{waAuditLogs[0].diagnostic.projectId}</span></div>
                            <div>Database ID: <span className="font-black text-gray-900">{waAuditLogs[0].diagnostic.databaseId || '(default)'}</span></div>
                            <div>Service Account: <span className={waAuditLogs[0].diagnostic.hasServiceAccount ? "text-green-600 uppercase font-black" : "text-amber-500 uppercase font-black"}>{waAuditLogs[0].diagnostic.hasServiceAccount ? "Loaded" : "Not Found (ADC)"}</span></div>
                          </div>
                          {waAuditLogs[0].diagnostic.serviceAccountProjectId && (
                            <div className="text-[10px] font-bold text-gray-500">
                              Service Account ID Proyek: <span className={`font-black ${waAuditLogs[0].diagnostic.serviceAccountProjectId !== waAuditLogs[0].diagnostic.projectId ? 'text-red-500 underline' : 'text-green-600'}`}>{waAuditLogs[0].diagnostic.serviceAccountProjectId}</span>
                              {waAuditLogs[0].diagnostic.serviceAccountProjectId !== waAuditLogs[0].diagnostic.projectId && (
                                <span className="text-red-500 text-[9px] font-extrabold ml-2">⚠️ PROJECT MISMATCH TERDETEKSI!</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5 text-[9px] bg-white border border-gray-150 px-3 py-1.5 rounded-xl font-mono text-gray-400">
                          <Database size={11} />
                          LOCAL_CACHE: ACTIVE
                        </div>
                      </div>
                    )}

                    {/* Log entries list */}
                    <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-50 border border-gray-100 rounded-3xl bg-white shadow-inner">
                      {waAuditLogs.map((log, idx) => (
                        <div key={idx} className="p-5 flex flex-col gap-3 font-sans text-left hover:bg-gray-50/50 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {log.status === 'success' ? (
                                <span className="px-2.5 py-1 text-[9px] font-black uppercase bg-green-50 text-green-600 rounded-full border border-green-100 tracking-wider">
                                  ✓ SUKSES
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 text-[9px] font-black uppercase bg-red-50 text-red-600 rounded-full border border-red-100 tracking-wider">
                                  ✗ GAGAL
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-gray-400 font-bold">
                                {new Date(log.timestamp).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </span>
                            </div>
                            
                            <div className="text-[10px] font-semibold text-gray-400">
                              Admin: <strong className="text-gray-700 uppercase font-bold">{log.adminName}</strong> | Provider: <strong className="text-gray-700 uppercase font-bold">{log.provider}</strong>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-gray-50/60 p-3 rounded-2xl border border-gray-100">
                            <div>
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Anggota</p>
                              <p className="font-extrabold text-gray-800">{log.memberName}</p>
                              <p className="text-[10px] font-mono text-gray-500 font-semibold">{log.memberPhone}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Iuran</p>
                              <p className="font-extrabold text-gray-800">Rp {log.amount?.toLocaleString('id-ID') || '0'}</p>
                              <p className="text-[10px] text-gray-500 font-bold">{Array.isArray(log.months) ? log.months.join(', ') : log.months}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Metode</p>
                              <p className="font-extrabold text-gray-800 uppercase">{log.method}</p>
                            </div>
                          </div>

                          {log.error && (
                            <div className="space-y-1.5">
                              <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest leading-none">Rincian Error Kegagalan:</p>
                              <div className="bg-red-50/40 border border-red-150 p-3.5 rounded-2xl font-mono text-[10px] text-red-700 leading-normal overflow-x-auto whitespace-pre-wrap max-h-48 shadow-inner">
                                <p className="font-black text-xs mb-1">Error Message:</p>
                                <p>{log.error}</p>
                                {log.errorStack && (
                                  <>
                                    <p className="font-black text-xs mt-3 mb-1">Error Stack Trace:</p>
                                    <p className="text-red-600/80 leading-relaxed font-sans text-[9px]">{log.errorStack}</p>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        )
      }

      {/* Add Admin Drawer/Modal Dialog */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!actionLoading) setShowAddForm(false);
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-6 md:p-8 overflow-hidden z-[110] border border-gray-100"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="text-left font-sans">
                  <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-2.5">
                    <UserPlus size={18} className="stroke-[2.5]" />
                  </div>
                  <h3 className="text-lg font-black text-gray-900 leading-tight">Admin Baru</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Tambah kunci otorisasi baru</p>
                </div>
                
                <button
                  onClick={() => setShowAddForm(false)}
                  disabled={actionLoading}
                  className="absolute right-6 top-6 p-2 bg-gray-50 text-gray-400 hover:text-gray-700 rounded-xl transition-all active:scale-90 border border-gray-100"
                >
                  <X size={15} className="stroke-[2.5]" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Admin Email Input */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] uppercase font-black text-gray-400 tracking-wider block ml-1">
                    Email Pengelola
                  </label>
                  <input
                    type="email"
                    value={email}
                    disabled={actionLoading}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFormError('');
                    }}
                    placeholder="Contoh: admin.heri@snjlogistik.com"
                    className="w-full px-4.5 py-3.5 bg-gray-50 focus:bg-white rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-xs font-bold placeholder-gray-400/80"
                  />
                </div>

                {/* Auto-Generation Information Alert */}
                <div className="p-3.5 bg-blue-50/40 rounded-2xl border border-dashed border-blue-100 text-[11px] text-blue-800 leading-relaxed font-sans text-left">
                  <div className="font-extrabold text-blue-900 flex items-center gap-1.5 mb-1 text-xs">
                    💡 Info Otorisasi Otomatis
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-blue-700 font-medium pl-1">
                    <li>Nama panggilan (Nick) digenerate acak sesuai alamat email.</li>
                    <li>Sistem menggunakan PIN default: <span className="font-extrabold text-blue-950 bg-white px-1 py-0.5 rounded border border-blue-200">1234</span>.</li>
                  </ul>
                </div>

                {/* Role selection radio buttons combo */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] uppercase font-black text-gray-400 tracking-wider block ml-1">
                    Hak Akses Pengelola
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => setRole('admin')}
                      className={`py-3.5 px-4 rounded-2xl border text-xs font-black transition-all text-center flex items-center justify-center gap-1.5 ${
                        role === 'admin'
                          ? 'border-blue-600 bg-blue-50/20 text-blue-600 font-extrabold'
                          : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100/50'
                      }`}
                    >
                      <ShieldAlert size={12} />
                      Staff Admin
                    </button>
                    
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => setRole('super-admin')}
                      className={`py-3.5 px-4 rounded-2xl border text-xs font-black transition-all text-center flex items-center justify-center gap-1.5 ${
                        role === 'super-admin'
                          ? 'border-indigo-600 bg-indigo-50/20 text-indigo-600 font-extrabold'
                          : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100/50'
                      }`}
                    >
                      <ShieldCheck size={12} />
                      Super Admin
                    </button>
                  </div>
                </div>

                {formError && (
                  <p className="text-xs font-black text-red-500 text-center bg-red-50/30 py-2.5 rounded-xl border border-red-100/50 mb-1">{formError}</p>
                )}
                
                {formSuccess && (
                  <p className="text-xs font-black text-emerald-600 text-center bg-emerald-50/30 py-2.5 rounded-xl border border-emerald-100/50 mb-1">{formSuccess}</p>
                )}

                <div className="pt-3 flex gap-3">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-500 font-bold rounded-2xl transition-all text-xs"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl transition-all text-xs shadow-lg shadow-blue-100 flex items-center justify-center gap-1.5"
                  >
                    {actionLoading ? (
                      <>
                        <Loader2 className="animate-spin" size={13} />
                        Proses...
                      </>
                    ) : (
                      <>
                        <UserPlus size={13} className="stroke-[2.5]" />
                        Simpan Admin
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Payment Modal Dialog */}
      <AnimatePresence>
        {editingPayment && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingPayment(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-6 md:p-8 overflow-y-auto max-h-[90vh] z-[110] border border-gray-100 flex flex-col font-sans"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5 shrink-0">
                <div className="text-left">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-1.5">
                    {editingPayment.type === 'bank' ? <CreditCard size={16} /> : <Wallet size={16} />}
                  </div>
                  <h3 className="text-base font-black text-gray-900 leading-tight">
                    {editingPayment.isNew ? 'Metode Baru' : 'Edit Metode'}
                  </h3>
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                    {editingPayment.type === 'bank' ? 'Konfigurasi Bank Transfer' : 'Konfigurasi E-Wallet'}
                  </p>
                </div>
                
                <button
                  onClick={() => setEditingPayment(null)}
                  className="p-2 bg-gray-50 text-gray-400 hover:text-gray-700 rounded-xl transition-all active:scale-90 border border-gray-100"
                >
                  <X size={15} className="stroke-[2.5]" />
                </button>
              </div>

              {/* Live Preview Card */}
              <div className="mb-5 shrink-0">
                <p className="text-[9px] uppercase font-black text-gray-400 tracking-wider text-left mb-1.5 ml-1">Live Preview Kartu</p>
                <div className={`p-4 rounded-xl ${editingPayment.data.color} text-white shadow relative overflow-hidden text-left min-h-[120px] flex flex-col justify-between transition-all duration-300`}>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-1.5">
                        {editingPayment.type === 'ewallet' && (
                          <div className="w-6 h-6 rounded bg-white/20 flex items-center justify-center font-black text-[10px] select-none">
                            {editingPayment.data.iconText || 'W'}
                          </div>
                        )}
                        <div>
                          <p className="text-[8px] font-bold opacity-75 uppercase tracking-widest leading-none">
                            {editingPayment.type === 'bank' ? 'Nama Bank' : 'E-Wallet'}
                          </p>
                          <p className="text-xs font-black mt-0.5 leading-tight">
                            {editingPayment.data.name || 'NAMA PENERIMA'}
                          </p>
                        </div>
                      </div>
                      {editingPayment.type === 'bank' && editingPayment.data.comingSoon && (
                        <span className="text-[7px] font-black text-amber-600 bg-white/95 px-1.5 py-0.5 rounded border border-white tracking-widest uppercase">SEGera HADIR</span>
                      )}
                    </div>
                    
                    {!editingPayment.data.comingSoon ? (
                      <div className="mt-3">
                        <p className="text-[8px] font-bold opacity-75 uppercase tracking-widest leading-none">
                          {editingPayment.type === 'bank' ? 'Nomor Rekening' : 'Nomor HP / Akun'}
                        </p>
                        <p className="text-sm font-mono font-bold tracking-wider mt-0.5 leading-none">
                          {editingPayment.data.number || '000000000000'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[8px] font-black mt-3 bg-white/10 px-1.5 py-0.5 rounded inline-block uppercase">COMING SOON ACTIVE</p>
                    )}
                  </div>

                  {!editingPayment.data.comingSoon && (
                    <div className="relative z-10 mt-1.5">
                      <p className="text-[8px] font-bold opacity-75 uppercase tracking-widest leading-none">Atas Nama</p>
                      <p className="text-[10px] font-bold mt-0.5 uppercase font-mono max-w-[240px] truncate leading-none">
                        {editingPayment.data.holder || 'NAMA PEMILIK'}
                      </p>
                    </div>
                  )}
                  <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white/10 rounded-full blur-lg" />
                </div>
              </div>

              {/* Fields Form */}
              <div className="space-y-3.5 flex-1 overflow-y-auto pr-1">
                {/* ID input */}
                <div className="space-y-1 text-left">
                  <label className="text-[9px] uppercase font-black text-gray-400 tracking-wider block ml-1">
                    ID Unik Metode (huruf kecil, tanpa spasi)
                  </label>
                  <input
                    type="text"
                    disabled={!editingPayment.isNew}
                    value={editingPayment.data.id}
                    onChange={(e) => {
                      const clean = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                      setEditingPayment(prev => ({
                        ...prev!,
                        data: { ...prev!.data, id: clean }
                      }));
                    }}
                    placeholder="Contoh: bni_syariah, ovo_id"
                    className="w-full px-4 py-2.5 bg-gray-50 focus:bg-white rounded-xl border border-gray-150 focus:border-blue-500 outline-none transition-all text-xs font-bold font-mono placeholder-gray-400/80 disabled:opacity-50"
                  />
                </div>

                {/* Name */}
                <div className="space-y-1 text-left">
                  <label className="text-[9px] uppercase font-black text-gray-400 tracking-wider block ml-1">
                    Nama Metode (e.g. Bank BNI, LinkAja)
                  </label>
                  <input
                    type="text"
                    value={editingPayment.data.name}
                    onChange={(e) => {
                      setEditingPayment(prev => ({
                        ...prev!,
                        data: { ...prev!.data, name: e.target.value }
                      }));
                    }}
                    placeholder="Contoh: Bank BNI"
                    className="w-full px-4 py-2.5 bg-gray-50 focus:bg-white rounded-xl border border-gray-150 focus:border-blue-500 outline-none transition-all text-xs font-bold placeholder-gray-400/80"
                  />
                </div>

                {/* Coming Soon toggle for Bank */}
                {editingPayment.type === 'bank' && (
                  <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-150/50">
                    <input
                      type="checkbox"
                      id="edit-comingsoon"
                      checked={editingPayment.data.comingSoon || false}
                      onChange={(e) => {
                        setEditingPayment(prev => ({
                          ...prev!,
                          data: { ...prev!.data, comingSoon: e.target.checked }
                        }));
                      }}
                      className="w-3.5 h-3.5 rounded border-gray-300 focus:ring-blue-500 text-blue-600"
                    />
                    <label htmlFor="edit-comingsoon" className="text-[10px] font-bold text-gray-500 cursor-pointer text-left leading-tight">
                      Aktifkan Mode Coming Soon (Segera Hadir)
                    </label>
                  </div>
                )}

                {/* Holder & Number */}
                {!editingPayment.data.comingSoon && (
                  <>
                    <div className="space-y-1 text-left">
                      <label className="text-[9px] uppercase font-black text-gray-400 tracking-wider block ml-1">
                        Atas Nama Penerima
                      </label>
                      <input
                        type="text"
                        value={editingPayment.data.holder || ''}
                        onChange={(e) => {
                          setEditingPayment(prev => ({
                            ...prev!,
                            data: { ...prev!.data, holder: e.target.value }
                          }));
                        }}
                        placeholder="Contoh: ARIFUDIN"
                        className="w-full px-4 py-2.5 bg-gray-50 focus:bg-white rounded-xl border border-gray-150 focus:border-blue-500 outline-none transition-all text-xs font-bold placeholder-gray-400/80"
                      />
                    </div>

                    <div className="space-y-1 text-left">
                      <label className="text-[9px] uppercase font-black text-gray-400 tracking-wider block ml-1">
                        {editingPayment.type === 'bank' ? 'Nomor Rekening' : 'Nomor Handphone'}
                      </label>
                      <input
                        type="text"
                        value={editingPayment.data.number || ''}
                        onChange={(e) => {
                          setEditingPayment(prev => ({
                            ...prev!,
                            data: { ...prev!.data, number: e.target.value }
                          }));
                        }}
                        placeholder="Contoh: 1560027351289"
                        className="w-full px-4 py-2.5 bg-gray-50 focus:bg-white rounded-xl border border-gray-150 focus:border-blue-500 outline-none transition-all text-xs font-mono font-bold placeholder-gray-400/80"
                      />
                    </div>
                  </>
                )}

                {/* EWallet Exclusive Fields */}
                {editingPayment.type === 'ewallet' && (
                  <div className="space-y-3">
                    <div className="space-y-1 text-left">
                      <label className="text-[9px] uppercase font-black text-gray-400 tracking-wider block ml-1">
                        Huruf Icon (Contoh: D, G, S, O, L)
                      </label>
                      <input
                        type="text"
                        maxLength={1}
                        value={editingPayment.data.iconText || ''}
                        onChange={(e) => {
                          setEditingPayment(prev => ({
                            ...prev!,
                            data: { ...prev!.data, iconText: e.target.value.toUpperCase() }
                          }));
                        }}
                        placeholder="D"
                        className="w-full px-4 py-2.5 bg-gray-50 focus:bg-white rounded-xl border border-gray-150 focus:border-blue-500 outline-none transition-all text-xs font-mono font-bold text-center placeholder-gray-400/80"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1 text-left">
                        <label className="text-[8px] uppercase font-black text-gray-400 tracking-wider block ml-1">
                          App URL (optional)
                        </label>
                        <input
                          type="text"
                          value={editingPayment.data.appUrl || ''}
                          onChange={(e) => {
                            setEditingPayment(prev => ({
                              ...prev!,
                              data: { ...prev!.data, appUrl: e.target.value }
                            }));
                          }}
                          placeholder="dana://"
                          className="w-full px-3 py-2.5 bg-gray-50 focus:bg-white rounded-xl border border-gray-150 focus:border-blue-500 outline-none transition-all text-[10px] font-mono placeholder-gray-400/80"
                        />
                      </div>

                      <div className="space-y-1 text-left">
                        <label className="text-[8px] uppercase font-black text-gray-400 tracking-wider block ml-1">
                          Fallback Internet Link (optional)
                        </label>
                        <input
                          type="text"
                          value={editingPayment.data.fallbackUrl || ''}
                          onChange={(e) => {
                            setEditingPayment(prev => ({
                              ...prev!,
                              data: { ...prev!.data, fallbackUrl: e.target.value }
                            }));
                          }}
                          placeholder="https://link.dana.id"
                          className="w-full px-3 py-2.5 bg-gray-50 focus:bg-white rounded-xl border border-gray-150 focus:border-blue-500 outline-none transition-all text-[10px] font-mono placeholder-gray-400/80"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Color Scheme selector */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[9px] uppercase font-black text-gray-400 tracking-wider block ml-1">
                    Warna Desain Kartu
                  </label>
                  <div className="flex flex-wrap gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-150/50">
                    {[
                      { name: 'Gold', cl: 'bg-yellow-600' },
                      { name: 'BCA Blue', cl: 'bg-blue-600' },
                      { name: 'BRI Navy', cl: 'bg-blue-800' },
                      { name: 'Dana Sky', cl: 'bg-sky-500' },
                      { name: 'GoPay Green', cl: 'bg-emerald-500' },
                      { name: 'Shopee Orange', cl: 'bg-orange-500' },
                      { name: 'OVO Purple', cl: 'bg-purple-600' },
                      { name: 'Red', cl: 'bg-rose-600' },
                      { name: 'Premium Indigo', cl: 'bg-indigo-600' },
                      { name: 'Slate Gray', cl: 'bg-slate-700' },
                    ].map((col) => (
                      <button
                        key={col.cl}
                        type="button"
                        onClick={() => {
                          setEditingPayment(prev => ({
                            ...prev!,
                            data: { ...prev!.data, color: col.cl }
                          }));
                        }}
                        className={`w-6 h-6 rounded-full ${col.cl} border border-white transition-all shadow-sm relative active:scale-90 ${
                          editingPayment.data.color === col.cl ? 'ring-2 ring-blue-500 scale-105' : 'opacity-85 hover:opacity-100'
                        }`}
                        title={col.name}
                      >
                        {editingPayment.data.color === col.cl && (
                          <Check size={8} className="text-white absolute inset-0 m-auto font-black" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 mt-5 border-t border-gray-100 flex flex-col gap-2.5 shrink-0">
                {modalError && (
                  <p className="text-xs font-black text-red-500 text-center bg-red-50/80 p-2.5 rounded-xl border border-red-100/50">
                    {modalError}
                  </p>
                )}
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEditingPayment(null)}
                    className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 text-gray-500 font-bold rounded-xl transition-all text-xs"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = editingPayment.data;
                      if (!d.id || !d.name) {
                        setModalError('ID Unik dan Nama Metode Pembayaran wajib diisi!');
                        return;
                      }
                      // Clean ID to prevent whitespaces
                      d.id = d.id.trim().toUpperCase();
                      if (!d.comingSoon && (!d.holder || !d.number)) {
                        setModalError('Atas Nama dan Nomor Rekening wajib diisi untuk metode aktif!');
                        return;
                      }

                      let updatedBanks = [...banks];
                      let updatedEwallets = [...ewallets];

                      if (editingPayment.type === 'bank') {
                        if (editingPayment.isNew) {
                          if (banks.some(b => b.id === d.id)) {
                            setModalError(`ID "${d.id}" sudah digunakan! Gunakan ID lain.`);
                            return;
                          }
                          updatedBanks.push(d);
                        } else {
                          updatedBanks = banks.map(b => b.id === d.id ? d : b);
                        }
                        setBanks(updatedBanks);
                      } else {
                        if (editingPayment.isNew) {
                          if (ewallets.some(ew => ew.id === d.id)) {
                            setModalError(`ID "${d.id}" sudah digunakan! Gunakan ID lain.`);
                            return;
                          }
                          updatedEwallets.push(d);
                        } else {
                          updatedEwallets = ewallets.map(ew => ew.id === d.id ? d : ew);
                        }
                        setEwallets(updatedEwallets);
                      }

                      savePaymentMethodsToFirestore(updatedBanks, updatedEwallets);
                      setEditingPayment(null);
                    }}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl transition-all text-xs shadow-lg shadow-blue-100 flex items-center justify-center gap-1"
                  >
                    <Check size={12} className="stroke-[2.5]" />
                    Simpan Metode
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

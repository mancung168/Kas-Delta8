import React, { useState, useEffect } from 'react';
import { formatLogDetails } from '../lib/logger';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc,
  serverTimestamp, 
  query, 
  orderBy,
  Timestamp,
  deleteField
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Trash2, Plus, ReceiptText, Calendar, DollarSign, Loader2, Search, Filter, X, Lock, ShieldCheck, ChevronDown, Calculator, Wallet, TrendingDown, Users, Pencil, Printer, Download, Share2, QrCode, Phone, Copy } from 'lucide-react';
import { downloadReceipt, shareReceipt, copyReceiptImageToClipboard, generateReceiptCanvas } from '../lib/downloadReceipt';
import { downloadMonthlyReport, downloadMonthlyReportPDF } from '../lib/downloadReport';
import { createAndPopulateSpreadsheet } from '../lib/googleSheetsService';
import { verifyAdmin } from '../lib/adminService';
import { motion, AnimatePresence } from 'motion/react';
import { generateDynamicQRIS } from '../lib/qris';

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: Timestamp;
  category?: string;
  createdByAdmin?: string;
  sourceRecipient?: string;
}

const getCategoryBadge = (cat: string) => {
  switch (cat) {
    case 'saldo_awal':
      return (
        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-200 uppercase tracking-wide">
          Saldo Awal
        </span>
      );
    case 'iuran':
      return (
        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wide">
          Iuran
        </span>
      );
    case 'pengeluaran':
      return (
        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100 uppercase tracking-wide">
          Pengeluaran
        </span>
      );
    case 'pemasukan':
      return (
        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-100 uppercase tracking-wide">
          Pemasukan
        </span>
      );
    case 'lainnya':
    default:
      return (
        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wide">
          Lainnya
        </span>
      );
  }
};

const MONTH_MAP = [
  { key: 'Jan', nameIndo: 'Januari' },
  { key: 'Feb', nameIndo: 'Februari' },
  { key: 'Mar', nameIndo: 'Maret' },
  { key: 'Apr', nameIndo: 'April' },
  { key: 'May', nameIndo: 'Mei' },
  { key: 'Jun', nameIndo: 'Juni' },
  { key: 'Jul', nameIndo: 'Juli' },
  { key: 'Aug', nameIndo: 'Agustus' },
  { key: 'Sep', nameIndo: 'September' },
  { key: 'Oct', nameIndo: 'Oktober' },
  { key: 'Nov', nameIndo: 'November' },
  { key: 'Dec', nameIndo: 'Desember' }
];

const getMonthIndo = (monthKey: string) => {
  const found = MONTH_MAP.find(m => m.key === monthKey);
  return found ? found.nameIndo : monthKey;
};

const formatPaymentDate = (timestamp: any) => {
  if (!timestamp) return '-';
  try {
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
    if (timestamp instanceof Date) {
      return timestamp.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
    if (typeof timestamp === 'object' && timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
    const dateObj = new Date(timestamp);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
  } catch (e) {
    console.error(e);
  }
  return '-';
};

export default function TransactionList({ minimal = false }: { minimal?: boolean }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [desc, setDesc] = useState(() => {
    try {
      return localStorage.getItem('TX_DRAFT_DESC') || '';
    } catch {
      return '';
    }
  });
  const [amount, setAmount] = useState(() => {
    try {
      return localStorage.getItem('TX_DRAFT_AMOUNT') || '';
    } catch {
      return '';
    }
  });
  const [sourceRecipient, setSourceRecipient] = useState(() => {
    try {
      return localStorage.getItem('TX_DRAFT_SOURCE') || '';
    } catch {
      return '';
    }
  });
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Synchronize transaction form drafts to local storage in real-time
  useEffect(() => {
    try {
      if (desc) {
        localStorage.setItem('TX_DRAFT_DESC', desc);
      } else {
        localStorage.removeItem('TX_DRAFT_DESC');
      }
    } catch (e) {
      console.warn(e);
    }
  }, [desc]);

  useEffect(() => {
    try {
      if (amount) {
        localStorage.setItem('TX_DRAFT_AMOUNT', amount);
      } else {
        localStorage.removeItem('TX_DRAFT_AMOUNT');
      }
    } catch (e) {
      console.warn(e);
    }
  }, [amount]);

  useEffect(() => {
    try {
      if (sourceRecipient) {
        localStorage.setItem('TX_DRAFT_SOURCE', sourceRecipient);
      } else {
        localStorage.removeItem('TX_DRAFT_SOURCE');
      }
    } catch (e) {
      console.warn(e);
    }
  }, [sourceRecipient]);
  const [category, setCategory] = useState<'pemasukan' | 'pengeluaran'>('pengeluaran');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);

  // Google Sheets integration state
  const [sheetsExporting, setSheetsExporting] = useState(false);
  const [sheetsProgress, setSheetsProgress] = useState('');
  const [sheetsError, setSheetsError] = useState('');
  const [exportedSheetUrl, setExportedSheetUrl] = useState('');

  const handleExportToGoogleSheets = async () => {
    setSheetsError('');
    setSheetsProgress('Memulai autentikasi Google Sheets...');
    setSheetsExporting(true);
    setExportedSheetUrl('');
    
    try {
      const url = await createAndPopulateSpreadsheet(
        txMonth,
        txYear,
        filteredTransactions,
        filteredVerifiedPayments,
        {
          totalSaldoAwal,
          totalIuran,
          totalPemasukanLainnya: totalLainnya,
          totalPengeluaran,
          totalSaldoAkhir
        },
        (progress) => {
          setSheetsProgress(progress);
        }
      );
      setSheetsExporting(false);
      setExportedSheetUrl(url);
    } catch (err: any) {
      console.error('Error exporting to Google Sheets:', err);
      setSheetsError(err?.message || 'Terjadi kesalahan saat menyinkronkan data.');
    }
  };

  // Toast notifications state
  const [toasts, setToasts] = useState<{ id: string; description: string; amount: number; category: string; isEdit?: boolean }[]>([]);

  // Admin verification states for transaction
  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const [adminName, setAdminName] = useState(() => localStorage.getItem('ADMIN_NICKNAME') || '');
  const [adminPin, setAdminPin] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminTargetAction, setAdminTargetAction] = useState<{ type: 'edit_tx' | 'delete_tx' | 'delete_verified_payment'; tx?: Transaction; payment?: any } | null>(null);
  const [showGlobalAdminVerify, setShowGlobalAdminVerify] = useState(false);

  // QRIS settings sync states
  const [qrisText, setQrisText] = useState<string>('');
  const [showTxQRIS, setShowTxQRIS] = useState(false);

  useEffect(() => {
    const qrisDocRef = doc(db, 'settings', 'qris');
    const unsubscribe = onSnapshot(qrisDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.qrisText) {
          setQrisText(data.qrisText);
        }
      }
    }, (error) => {
      console.warn("Failed to listen for QRIS settings in TransactionList:", error);
    });
    return () => unsubscribe();
  }, []);

  // Receipt State
  const [showReceipt, setShowReceipt] = useState<{
    id?: string;
    memberName: string;
    type: 'driver' | 'helper';
    months: string[];
    amount: number;
    method: string;
    date: any;
    adminName?: string;
    bank?: string;
    memberPhone?: string;
  } | null>(null);
  const [copiedImage, setCopiedImage] = useState(false);

  const handleCopyReceiptImage = async () => {
    if (!showReceipt) return;
    const success = await copyReceiptImageToClipboard(showReceipt);
    if (success) {
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2000);
    } else {
      alert('Browser atau perangkat Anda tidak mendukung penyalinan gambar langsung dari clipboard. Silakan gunakan tombol "Download Struk" untuk menyimpan gambar.');
    }
  };

  const ADMIN_PIN = localStorage.getItem('ADMIN_PIN') || '1234';

  // Toggle open
  const handleOpenForm = () => {
    setDesc('');
    setAmount('');
    setSourceRecipient('');
    setDate(new Date().toISOString().split('T')[0]);
    setAdminName(localStorage.getItem('ADMIN_NICKNAME') || '');
    setAdminPin('');
    setAdminError('');
    setIsAdminVerified(false);
    setCategory('pengeluaran');
    setEditingTransactionId(null);
    setShowTxQRIS(false);
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (tx: Transaction) => {
    setDesc(tx.description || '');
    setAmount(tx.amount?.toString() || '');
    setSourceRecipient(tx.sourceRecipient || '');
    
    let dStr = new Date().toISOString().split('T')[0];
    if (tx.date) {
      const d = tx.date.toDate ? tx.date.toDate() : new Date(tx.date as any);
      dStr = d.toISOString().split('T')[0];
    }
    setDate(dStr);
    
    setAdminName(tx.createdByAdmin || '');
    setAdminPin('');
    setAdminError('');
    setIsAdminVerified(false);
    setCategory(tx.category === 'pemasukan' ? 'pemasukan' : 'pengeluaran');
    setEditingTransactionId(tx.id);
    setShowTxQRIS(false);
    setIsFormOpen(true);
  };
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [txMonth, setTxMonth] = useState('all');
  const [txYear, setTxYear] = useState('all');

  // Long press active states
  const [isPressingId, setIsPressingId] = useState<string | null>(null);
  const [pressProgress, setPressProgress] = useState<number>(0);
  const [activeLongPressTx, setActiveLongPressTx] = useState<Transaction | null>(null);

  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = React.useRef<number>(0);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const startLongPress = (id: string, e: React.MouseEvent | React.TouchEvent) => {
    if ('button' in e && e.button !== 0) return; // ignore right clicks
    setIsPressingId(id);
    setPressProgress(0);
    startTimeRef.current = Date.now();

    if ('touches' in e && e.touches[0]) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    } else {
      touchStartRef.current = null;
    }

    const delay = 950;
    const intervalTime = 16;
    const totalSteps = delay / intervalTime;
    let currentStep = 0;

    intervalRef.current = setInterval(() => {
      currentStep++;
      const currentProgress = Math.min((currentStep / totalSteps) * 100, 100);
      setPressProgress(currentProgress);
    }, intervalTime);

    timerRef.current = setTimeout(() => {
      const found = transactions.find(idx => idx.id === id);
      if (found) {
        setActiveLongPressTx(found);
      }
      endLongPress(false);
    }, delay);
  };

  const endLongPress = (shouldTriggerClick = true, id?: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timerRef.current = null;
    intervalRef.current = null;

    if (isPressingId && shouldTriggerClick && id) {
      const pressDuration = Date.now() - startTimeRef.current;
      if (pressDuration < 950) {
        const found = transactions.find(idx => idx.id === id);
        if (found) {
          setActiveLongPressTx(found);
        }
      }
    }

    setIsPressingId(null);
    setPressProgress(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || !e.touches[0]) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 10) { // cancel if scrolled or dragged
      endLongPress(false);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // States for verified member iuran history
  const [members, setMembers] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyMonth, setHistoryMonth] = useState('all');
  const [historyYear, setHistoryYear] = useState('all');

  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Transaction[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Transaction);
      });
      setTransactions(data);
      setLoading(false);
    }, (error: any) => {
      console.error("Firestore error loading transactions list inside TransactionList:", error);
      setLoading(false);
      if (error?.message?.includes('permission-denied') || error?.message?.includes('permissions') || error?.code === 'permission-denied') {
        window.dispatchEvent(new CustomEvent('firestore-permission-denied'));
      }
      handleFirestoreError(error, OperationType.GET, 'transactions');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'members'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setMembers(data);
    }, (error: any) => {
      console.error("Firestore error loading members in TransactionList:", error);
      if (error?.message?.includes('permission-denied') || error?.message?.includes('permissions') || error?.code === 'permission-denied') {
        window.dispatchEvent(new CustomEvent('firestore-permission-denied'));
      }
      handleFirestoreError(error, OperationType.GET, 'members');
    });
    return () => unsubscribe();
  }, []);

  // Compute verified payments from member data
  const verifiedPaymentsMap = new Map<string, any>();

  members.forEach(m => {
    // legacy or simple months tracking
    if (m.months) {
      Object.entries(m.months).forEach(([month, isPaid]) => {
        if (isPaid === true) {
          verifiedPaymentsMap.set(`${m.id}-${month}`, {
            id: `${m.id}-${month}`,
            memberId: m.id,
            memberName: m.name,
            memberType: m.type,
            month,
            method: m.paymentDetails?.[month]?.method || 'Tunai',
            date: m.paymentDetails?.[month]?.date || m.createdAt,
            bank: m.paymentDetails?.[month]?.bank,
            adminName: m.paymentDetails?.[month]?.adminName || 'Admin',
            amount: 25000
          });
        }
      });
    }

    // specific paymentDetails details
    if (m.paymentDetails) {
      Object.entries(m.paymentDetails).forEach(([month, detail]: [string, any]) => {
        if (detail && detail.status === 'verified') {
          verifiedPaymentsMap.set(`${m.id}-${month}`, {
            id: `${m.id}-${month}`,
            memberId: m.id,
            memberName: m.name,
            memberType: m.type,
            month,
            method: detail.method || 'Tunai',
            date: detail.date || m.createdAt,
            bank: detail.bank,
            adminName: detail.adminName || 'Admin',
            amount: 25000
          });
        }
      });
    }
  });

  const verifiedPayments = Array.from(verifiedPaymentsMap.values());

  // Filter Verified Payments
  const filteredVerifiedPayments = verifiedPayments.filter(p => {
    const matchesSearch = p.memberName.toLowerCase().includes(historySearch.toLowerCase());
    const matchesMonth = txMonth === 'all' || p.month === txMonth;
    const matchesYear = txYear === 'all' || (() => {
      const pDate = p.date ? (p.date.toDate ? p.date.toDate() : new Date(p.date)) : null;
      return pDate && pDate.getFullYear().toString() === txYear;
    })();

    return matchesSearch && matchesMonth && matchesYear;
  });

  // Sort verified payments chronologically by date descending
  filteredVerifiedPayments.sort((a, b) => {
    const dateA = a.date ? (a.date.toDate ? a.date.toDate() : new Date(a.date)) : new Date(0);
    const dateB = b.date ? (b.date.toDate ? b.date.toDate() : new Date(b.date)) : new Date(0);
    return dateB.getTime() - dateA.getTime();
  });

  const totalVerifiedAmount = filteredVerifiedPayments.reduce((sum, p) => sum + p.amount, 0);

  const handleVerifyAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminName.trim()) {
      setAdminError('Nama admin harus diisi!');
      return;
    }
    const isValidAdmin = await verifyAdmin(adminName, adminPin);
    if (!isValidAdmin) {
      setAdminError('Nama admin atau PIN salah!');
      return;
    }

    localStorage.setItem('ADMIN_NICKNAME', adminName.trim());
    setIsAdminVerified(true);
    setAdminError('');
  };

  const handleGlobalAdminVerifyTx = async () => {
    if (!adminName.trim()) {
      setAdminError('Nama admin harus diisi');
      return;
    }
    const isValidAdmin = await verifyAdmin(adminName, adminPin);
    if (!isValidAdmin) {
      setAdminError('Nama admin atau PIN salah');
      return;
    }

    localStorage.setItem('ADMIN_NICKNAME', adminName.trim());
    if (!adminTargetAction) return;

    if (adminTargetAction.type === 'edit_tx') {
      const tx = adminTargetAction.tx;
      setDesc(tx.description || '');
      setAmount(tx.amount?.toString() || '');
      setSourceRecipient(tx.sourceRecipient || '');
      
      let dStr = new Date().toISOString().split('T')[0];
      if (tx.date) {
        const d = tx.date.toDate ? tx.date.toDate() : new Date(tx.date as any);
        dStr = d.toISOString().split('T')[0];
      }
      setDate(dStr);
      
      setAdminName(adminName.trim());
      setAdminPin('');
      setAdminError('');
      setIsAdminVerified(true);
      setCategory(tx.category === 'pemasukan' ? 'pemasukan' : 'pengeluaran');
      setEditingTransactionId(tx.id);
      setIsFormOpen(true);

      setShowGlobalAdminVerify(false);
      setAdminTargetAction(null);
      setAdminPin('');
    } else if (adminTargetAction.type === 'delete_tx') {
      const tx = adminTargetAction.tx!;
      const path = `transactions/${tx.id}`;
      try {
        await deleteDoc(doc(db, 'transactions', tx.id));
        
        await setDoc(doc(collection(db, 'activities')), {
          action: 'hapus_transaksi',
          details: formatLogDetails(`[Hapus Transaksi] ${tx.category === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'} - ${tx.sourceRecipient || 'Kas'} - ${tx.description} (Rp ${tx.amount?.toLocaleString('id-ID')})`),
          adminName: adminName.trim(),
          timestamp: serverTimestamp()
        });

        setShowGlobalAdminVerify(false);
        setAdminTargetAction(null);
        setAdminPin('');
        setAdminError('');
      } catch (error) {
        console.error("Error deleting transaction:", error);
        setAdminError('Gagal menghapus transaksi dari database');
      }
    } else if (adminTargetAction.type === 'delete_verified_payment') {
      const payment = adminTargetAction.payment;
      try {
        await updateDoc(doc(db, 'members', payment.memberId), {
          [`months.${payment.month}`]: false,
          [`paymentDetails.${payment.month}`]: deleteField(),
          updatedAt: serverTimestamp()
        });

        await setDoc(doc(collection(db, 'activities')), {
          action: 'hapus_pembayaran_iuran',
          details: formatLogDetails(`[Hapus Pembayaran Iuran] Anggota: ${payment.memberName} - Bulan: ${payment.month} - Sebesar: Rp ${payment.amount.toLocaleString('id-ID')}`),
          adminName: adminName.trim(),
          timestamp: serverTimestamp()
        });

        setShowGlobalAdminVerify(false);
        setAdminTargetAction(null);
        setAdminPin('');
        setAdminError('');
      } catch (error) {
        console.error("Error deleting verified payment:", error);
        setAdminError('Gagal menghapus pembayaran iuran anggota dari database');
      }
    }
  };

  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim() || !amount || !sourceRecipient.trim() || !isAdminVerified || adding) return;

    setAdding(true);
    const id = Date.now().toString();
    const path = `transactions/${id}`;
    try {
      const txPromise = setDoc(doc(db, 'transactions', id), {
        description: desc.trim(),
        amount: Number(amount),
        date: Timestamp.fromDate(new Date(date)),
        createdAt: serverTimestamp(),
        createdByAdmin: adminName.trim(),
        category: category,
        sourceRecipient: sourceRecipient.trim(),
      });

      // Log transaction creation to activities collection
      const activityPromise = setDoc(doc(collection(db, 'activities')), {
        action: 'tambah_transaksi',
        details: formatLogDetails(`[Tambah Transaksi] ${category === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'} - ${sourceRecipient.trim()} - ${desc.trim()} (Rp ${Number(amount).toLocaleString('id-ID')})`),
        adminName: adminName.trim(),
        timestamp: serverTimestamp()
      });

      // Race with 1500ms timeout to prevent UI hang if Firestore network sync response is delayed.
      await Promise.race([
        Promise.all([txPromise, activityPromise]),
        new Promise((resolve) => setTimeout(resolve, 1500))
      ]);

      // Show temporary toast notification in the bottom-right corner
      const toastId = Math.random().toString(36).substring(2, 9);
      const newToast = {
        id: toastId,
        description: desc.trim(),
        amount: Number(amount),
        category: category
      };
      setToasts(prev => [...prev, newToast]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toastId));
      }, 4000);

      setDesc('');
      setAmount('');
      setSourceRecipient('');
      try {
        localStorage.removeItem('TX_DRAFT_DESC');
        localStorage.removeItem('TX_DRAFT_AMOUNT');
        localStorage.removeItem('TX_DRAFT_SOURCE');
      } catch (e) {
        console.warn(e);
      }
      setAdminName('');
      setAdminPin('');
      setIsAdminVerified(false);
      setIsFormOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setAdding(false);
    }
  };

  const updateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransactionId || !desc.trim() || !amount || !sourceRecipient.trim() || !isAdminVerified || adding) return;

    setAdding(true);
    const path = `transactions/${editingTransactionId}`;
    try {
      const tx = transactions.find(idx => idx.id === editingTransactionId);
      const originalCreatedAt = tx?.createdAt || serverTimestamp();

      const txPromise = setDoc(doc(db, 'transactions', editingTransactionId), {
        description: desc.trim(),
        amount: Number(amount),
        date: Timestamp.fromDate(new Date(date)),
        createdAt: originalCreatedAt,
        createdByAdmin: adminName.trim(),
        category: category,
        sourceRecipient: sourceRecipient.trim(),
      });

      // Log transaction update to activities collection
      const activityPromise = setDoc(doc(collection(db, 'activities')), {
        action: 'edit_transaksi',
        details: formatLogDetails(`[Edit Transaksi] ${category === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'} - ${tx?.sourceRecipient || 'Kas'} - ${tx?.description || ''} (Rp ${tx?.amount?.toLocaleString('id-ID')}) => ${sourceRecipient.trim()} - ${desc.trim()} (Rp ${Number(amount).toLocaleString('id-ID')})`),
        adminName: adminName.trim(),
        timestamp: serverTimestamp()
      });

      // Race with 1500ms timeout to prevent UI hang if Firestore network sync response is delayed.
      await Promise.race([
        Promise.all([txPromise, activityPromise]),
        new Promise((resolve) => setTimeout(resolve, 1500))
      ]);

      // Show temporary toast notification in the bottom-right corner for edited transaction
      const toastId = Math.random().toString(36).substring(2, 9);
      const newToast = {
        id: toastId,
        description: desc.trim(),
        amount: Number(amount),
        category: category,
        isEdit: true
      };
      setToasts(prev => [...prev, newToast]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toastId));
      }, 4000);

      setDesc('');
      setAmount('');
      setSourceRecipient('');
      try {
        localStorage.removeItem('TX_DRAFT_DESC');
        localStorage.removeItem('TX_DRAFT_AMOUNT');
        localStorage.removeItem('TX_DRAFT_SOURCE');
      } catch (e) {
        console.warn(e);
      }
      setAdminName('');
      setAdminPin('');
      setIsAdminVerified(false);
      setEditingTransactionId(null);
      setIsFormOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setAdding(false);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (window.confirm('Hapus transaksi ini?')) {
      try {
        const t = transactions.find(idx => idx.id === id);
        await deleteDoc(doc(db, 'transactions', id));
        
        if (t) {
          // Log transaction deletion to activities collection
          await setDoc(doc(collection(db, 'activities')), {
            action: 'hapus_transaksi',
            details: formatLogDetails(`[Hapus Transaksi] ${t.category === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'} - ${t.sourceRecipient || 'Kas'} - ${t.description} (Rp ${t.amount.toLocaleString('id-ID')})`),
            adminName: 'Admin',
            timestamp: serverTimestamp()
          });
        }
      } catch (error) {
        console.error("Error deleting transaction:", error);
      }
    }
  };

  const filteredTransactions = transactions.filter(t => {
    const descLower = (t.description || '').toLowerCase();
    const isIuran = t.category === 'iuran' || 
                    descLower.includes('iuran') || 
                    descLower.includes('ceklis') || 
                    descLower.includes('pembayaran');
    if (isIuran) return false;

    const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!t.date) return matchesSearch && txMonth === 'all' && txYear === 'all';
    
    const tDate = t.date.toDate();

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const matchesMonth = txMonth === 'all' || monthNames[tDate.getMonth()] === txMonth;
    const matchesYear = txYear === 'all' || tDate.getFullYear().toString() === txYear;
    
    return matchesSearch && matchesMonth && matchesYear;
  });

  // Calculate matching verified iuran amount for dashboard based on txMonth & txYear
  let dashboardVerifiedIuran = 0;
  verifiedPayments.forEach(p => {
    const matchesMonth = txMonth === 'all' || p.month === txMonth;
    const matchesYear = txYear === 'all' || (() => {
      const pDate = p.date ? (p.date.toDate ? p.date.toDate() : new Date(p.date)) : null;
      return pDate && pDate.getFullYear().toString() === txYear;
    })();
    if (matchesMonth && matchesYear) {
      dashboardVerifiedIuran += p.amount || 25000;
    }
  });

  // Compute finances classifications for summary dashboard based on txMonth & txYear
  let totalSaldoAwal = 0;
  let totalIuran = dashboardVerifiedIuran; // Initialize with matching verified checklist payments
  let totalPengeluaran = 0;
  let totalLainnya = 0;

  transactions.forEach((t) => {
    if (!t.date) return;
    const tDate = t.date.toDate();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const matchesMonth = txMonth === 'all' || monthNames[tDate.getMonth()] === txMonth;
    const matchesYear = txYear === 'all' || tDate.getFullYear().toString() === txYear;

    if (!matchesMonth || !matchesYear) return;

    const cat = t.category || (() => {
      const descLower = (t.description || '').toLowerCase();
      if (descLower.includes('saldo awal') || descLower.includes('awal') || descLower.includes('modal')) {
        return 'saldo_awal';
      }
      if (descLower.includes('iuran') || descLower.includes('ceklis') || descLower.includes('pembayaran')) {
        return 'iuran';
      }
      if (t.amount < 0) return 'pengeluaran';
      const expenseKeywords = [
        'beli', 'pengeluaran', 'bayar', 'gaji', 'bensin', 'service', 'servis', 
        'makan', 'operasional', 'ongkos', 'ban', 'perbaikan', 'sewa', 'kasbon', 'pembelian', 'snack'
      ];
      if (expenseKeywords.some(kw => descLower.includes(kw))) {
        return 'pengeluaran';
      }
      return 'lainnya';
    })();

    const tAmount = Math.abs(t.amount || 0);

    if (cat === 'saldo_awal') {
      totalSaldoAwal += tAmount;
    } else if (cat === 'iuran') {
      // Explicitly avoid double-counting any legacy or automatic iuran transactions.
      // Dues are fetched directly from the members collection (dashboardVerifiedIuran).
    } else if (cat === 'pengeluaran') {
      totalPengeluaran += tAmount;
    } else {
      totalLainnya += tAmount;
    }
  });

  const totalSaldoAkhir = totalSaldoAwal + totalIuran + totalLainnya - totalPengeluaran;

  const totalsByMethod = filteredVerifiedPayments.reduce((acc, p) => {
    const method = p.method || 'Tunai';
    acc[method] = (acc[method] || 0) + p.amount;
    return acc;
  }, {} as Record<string, number>);

  const totalAmount = filteredTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

  return (
    <div className="space-y-8 pb-10">
      {!minimal ? (
        <>
          {/* Header & Stats */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                Transaksi
              </h1>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full md:w-auto">
              <div className="grid grid-cols-2 gap-3 w-full sm:flex sm:w-auto">
                {/* Month Select for Transaction Page */}
                <div className="relative w-full sm:w-auto">
                  <select
                    value={txMonth}
                    onChange={(e) => setTxMonth(e.target.value)}
                    className="w-full appearance-none bg-white border border-gray-100 px-5 py-3.5 pr-11 rounded-2xl text-sm font-bold text-gray-700 shadow-sm focus:border-blue-500 hover:bg-gray-50 transition-all outline-none cursor-pointer"
                  >
                    <option value="all">Semua Bulan</option>
                    {MONTH_MAP.map((m) => (
                      <option key={m.key} value={m.key}>{m.nameIndo}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>

                {/* Year Select for Transaction Page */}
                <div className="relative w-full sm:w-auto">
                  <select
                    value={txYear}
                    onChange={(e) => setTxYear(e.target.value)}
                    className="w-full appearance-none bg-white border border-gray-100 px-5 py-3.5 pr-11 rounded-2xl text-sm font-bold text-gray-700 shadow-xs focus:border-blue-500 hover:bg-gray-50 transition-all outline-none cursor-pointer"
                  >
                    <option value="all">Semua Tahun</option>
                    {[2026, 2025, 2024, 2023].map((year) => (
                      <option key={year} value={year.toString()}>Tahun {year}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 w-full sm:flex sm:w-auto">
                {/* Dropdown Menu for Downloads */}
                <div className="relative w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3.5 rounded-2xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-100/50 active:scale-95 transition-all text-sm cursor-pointer select-none"
                    id="download-laporan-btn"
                  >
                    <Download size={18} className="stroke-[2.5]" />
                    <span>Download Laporan</span>
                    <ChevronDown size={14} className={`transform transition-transform ${isDownloadMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  <AnimatePresence>
                    {isDownloadMenuOpen && (
                      <>
                        {/* Invisible backdrop to close the dropdown on click outside */}
                        <div 
                          className="fixed inset-0 z-40 cursor-default" 
                          onClick={() => setIsDownloadMenuOpen(false)}
                        />
                        
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 mt-2.5 w-60 bg-white border border-gray-100/85 rounded-2xl shadow-2xl p-2 z-50 flex flex-col gap-1"
                          id="download-laporan-menu"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setIsDownloadMenuOpen(false);
                              downloadMonthlyReportPDF(
                                txMonth,
                                txYear,
                                filteredTransactions,
                                filteredVerifiedPayments,
                                {
                                  totalSaldoAwal,
                                  totalIuran,
                                  totalPemasukanLainnya: totalLainnya,
                                  totalPengeluaran,
                                  totalSaldoAkhir
                                }
                              );
                            }}
                            className="flex items-center gap-3 w-full px-4 py-3 text-left rounded-xl hover:bg-rose-50 text-rose-700 text-xs font-bold transition-colors cursor-pointer"
                          >
                            <span className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
                              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M11.363 2c3.433.011 6.145.412 8.137 2.007 2 1.595 2.5 4.3 2.5 7.993s-.5 6.398-2.5 7.993c-1.992 1.595-4.704 1.996-8.137 2.007h-.726c-3.433-.011-6.145-.412-8.137-2.007-2-1.595-2.5-4.3-2.5-7.993s.5-6.398 2.5-7.993C4.092 2.412 6.804 2.011 10.237 2h1.126zm.237 2h-.8c-3.238.01-5.642.368-7.237 1.642-1.6 1.277-2 3.593-2 6.858s.4 5.58 2 6.858C5.158 20.632 7.562 20.99 10.8 21h.8c3.238-.01 5.642-.368 7.237-1.642 1.6-1.277 2-3.593 2-6.858s-.4-5.58-2-6.858C17.242 4.368 14.838 4.01 11.6 4zM12 7a1 1 0 0 1 .993.883L13 8v3h3a1 1 0 0 1 .117 1.993L16 13h-3v3a1 1 0 0 1-1.993.117L11 16v-3H8a1 1 0 0 1-.117-1.993L8 11h3V8a1 1 0 0 1 1-1z"/>
                              </svg>
                            </span>
                            <div className="flex flex-col">
                              <span className="text-gray-900 leading-snug">Unduh PDF Resmi</span>
                              <span className="text-[10px] text-gray-400 font-normal">Format cetak & verifikasi</span>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsDownloadMenuOpen(false);
                              downloadMonthlyReport(
                                txMonth,
                                txYear,
                                filteredTransactions,
                                filteredVerifiedPayments,
                                {
                                  totalSaldoAwal,
                                  totalIuran,
                                  totalPemasukanLainnya: totalLainnya,
                                  totalPengeluaran,
                                  totalSaldoAkhir
                                }
                              );
                            }}
                            className="flex items-center gap-3 w-full px-4 py-3 text-left rounded-xl hover:bg-emerald-50 text-emerald-700 text-xs font-bold transition-colors cursor-pointer"
                          >
                            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                              </svg>
                            </span>
                            <div className="flex flex-col">
                              <span className="text-gray-900 leading-snug">Unduh Excel / CSV</span>
                              <span className="text-[10px] text-gray-400 font-normal">Format data mentah (.csv)</span>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsDownloadMenuOpen(false);
                              handleExportToGoogleSheets();
                            }}
                            className="flex items-center gap-3 w-full px-4 py-3 text-left rounded-xl hover:bg-emerald-50 text-emerald-700 text-xs font-bold transition-colors cursor-pointer"
                          >
                            <span className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg">
                              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-2h2v2zm0-4H7v-2h2v2zm0-4H7V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>
                              </svg>
                            </span>
                            <div className="flex flex-col">
                              <span className="text-gray-900 leading-snug">Ekspor ke Google Sheets</span>
                              <span className="text-[10px] text-emerald-600 font-bold">Sinkronisasi Instan</span>
                            </div>
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  onClick={handleOpenForm}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3.5 rounded-2xl font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100/50 active:scale-95 transition-all text-sm"
                >
                  <Plus size={18} className="stroke-[2.5]" />
                  Tambah Transaksi
                </button>
              </div>
            </div>
          </div>

          {/* New Payment Breakdown Section */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Total Pembayaran per Metode</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['Tunai', 'Transfer', 'E-Wallet', 'QRIS'].map((method) => (
                <div key={method} className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{method}</p>
                  <p className="text-md font-black text-gray-950 mt-1">
                    Rp {(totalsByMethod[method] || 0).toLocaleString('id-ID')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Dashboard Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* 1. Saldo Awal */}
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Saldo Awal</span>
                <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 border border-gray-100">
                  <Calculator size={14} className="stroke-[2.5]" />
                </div>
              </div>
              <div>
                <span className="text-lg font-black text-gray-950 block leading-tight">
                  Rp {totalSaldoAwal.toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] font-semibold text-gray-400 block mt-1">
                  Saldo Awal Kas
                </span>
              </div>
            </div>

            {/* 2. Iuran */}
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Iuran</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100/50">
                  <Users size={14} className="stroke-[2.5]" />
                </div>
              </div>
              <div>
                <span className="text-lg font-black text-emerald-600 block leading-tight">
                  Rp {totalIuran.toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] font-semibold text-gray-400 block mt-1">
                  Checklist + Manual
                </span>
              </div>
            </div>

            {/* 3. Pengeluaran */}
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Pengeluaran</span>
                <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 border border-rose-100/50">
                  <TrendingDown size={14} className="stroke-[2.5]" />
                </div>
              </div>
              <div>
                <span className="text-lg font-black text-rose-600 block leading-tight">
                  Rp {totalPengeluaran.toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] font-semibold text-gray-400 block mt-1">
                  Pengeluaran Kas
                </span>
              </div>
            </div>

            {/* 4. Lainnya */}
            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Lainnya</span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100/50">
                  <Plus size={14} className="stroke-[2.5]" />
                </div>
              </div>
              <div>
                <span className="text-lg font-black block leading-tight text-amber-600">
                  Rp {totalLainnya.toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] font-semibold text-gray-400 block mt-1">
                  Kas Masuk Lainnya
                </span>
              </div>
            </div>

            {/* 5. Saldo Akhir */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-1 bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-3xl text-white shadow-xl shadow-blue-500/15 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold opacity-80 uppercase tracking-wide">Saldo Akhir</span>
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white">
                  <Wallet size={14} className="stroke-[2.5]" />
                </div>
              </div>
              <div>
                <span className="text-lg font-black block leading-tight">
                  Rp {totalSaldoAkhir.toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] font-medium opacity-75 block mt-1">
                  Sisa Saldo Kas Aktif
                </span>
              </div>
            </div>
          </div>

          {/* Pop-up Transaction Form Modal */}
          <AnimatePresence>
            {isFormOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsFormOpen(false)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />

                {/* Modal Box */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 md:p-8 overflow-hidden z-10 border border-gray-100"
                >
                  <div className="flex items-center justify-between mb-6 pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2.5 text-left">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${!isAdminVerified ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                        {!isAdminVerified ? (
                          <Lock size={20} className="stroke-[2.5]" />
                        ) : (
                          <ReceiptText size={20} className="stroke-[2.5]" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-gray-900 leading-tight block">
                          {!isAdminVerified ? 'Verifikasi Admin' : (editingTransactionId ? 'Edit Transaksi' : 'Tambah Transaksi')}
                        </h3>
                        <p className="text-xs text-gray-400 font-medium block">
                          {!isAdminVerified ? 'Otorisasi admin diperlukan' : (editingTransactionId ? 'Ubah pencatatan transaksi kas' : 'Buat pencatatan transaksi kas baru')}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-all"
                    >
                      <X size={18} className="stroke-[2.5]" />
                    </button>
                  </div>

                  <form onSubmit={isAdminVerified ? (editingTransactionId ? updateTransaction : addTransaction) : handleVerifyAdmin} className="space-y-4">
                    {!isAdminVerified ? (
                      <>
                        <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100/50 text-[11px] text-amber-700 font-medium text-left leading-relaxed">
                          Lakukan otorisasi admin terlebih dahulu sebelum {editingTransactionId ? 'mengedit' : 'menginput'} transaksi kas baru.
                        </div>

                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1 flex items-center gap-1 font-mono">
                            Nama Admin
                          </label>
                          <input
                            type="text"
                            required
                            autoFocus
                            value={adminName}
                            onChange={(e) => {
                              setAdminName(e.target.value);
                              setAdminError('');
                            }}
                            placeholder="Nama penanggung jawab..."
                            className="w-full px-4 py-3.5 rounded-2xl border border-gray-100 focus:border-amber-500 focus:ring-4 focus:ring-amber-50 outline-none transition-all text-sm font-bold text-gray-800"
                          />
                          {['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) && (
                            <motion.div 
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="text-[10px] font-extrabold text-[#9a3412] bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5"
                            >
                              <span>🌟 Super Admin Terdaftar: Bebas PIN!</span>
                            </motion.div>
                          )}
                        </div>

                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1 font-mono">
                            PIN Admin
                          </label>
                          <input
                            type="password"
                            required={!['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase())}
                            maxLength={4}
                            value={['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) ? '1234' : adminPin}
                            onChange={(e) => {
                              setAdminPin(e.target.value);
                              setAdminError('');
                            }}
                            disabled={['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase())}
                            placeholder={['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) ? '✓✓✓✓' : '••••'}
                            className={`w-full px-4 py-3.5 rounded-2xl border border-gray-100 focus:border-amber-500 focus:ring-4 focus:ring-amber-50 outline-none transition-all text-center tracking-[0.5em] text-sm font-bold text-gray-800 ${['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) ? 'bg-amber-50/20 text-amber-500 border-dashed border-amber-200 cursor-not-allowed' : ''}`}
                          />
                        </div>

                        {adminError && (
                          <motion.p 
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-xs font-bold text-red-500 text-center"
                          >
                            {adminError}
                          </motion.p>
                        )}

                        <div className="pt-4 flex gap-3">
                          <button
                            type="button"
                            onClick={() => setIsFormOpen(false)}
                            className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-2xl transition-all font-bold text-sm"
                          >
                            Batal
                          </button>
                          <button
                            type="submit"
                            disabled={!adminName.trim() || (!['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) && adminPin.length < 4)}
                            className="flex-1 py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl transition-all font-bold text-sm shadow-lg shadow-amber-100/50 flex items-center justify-center gap-2 active:scale-95"
                          >
                            <ShieldCheck size={16} className="stroke-[2.5]" />
                            Mulai Verifikasi
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/50 text-[11px] text-emerald-700 font-medium text-left leading-relaxed flex items-center gap-2">
                          <ShieldCheck size={16} className="text-emerald-600 flex-shrink-0" />
                          <span>Sesi Diotorisasi oleh: <strong className="font-bold text-emerald-950 uppercase">{adminName}</strong></span>
                        </div>

                        {/* 1. Pilih Tanggal */}
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1 flex items-center gap-1">
                            <Calendar size={12} /> Pilih Tanggal
                          </label>
                          <input
                            type="date"
                            required
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-4 py-3.5 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold text-gray-800"
                          />
                        </div>

                        {/* 2. Kategori Transaksi Dropdown */}
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1 flex items-center gap-1 font-mono">
                            <ReceiptText size={12} /> Kategori Transaksi
                          </label>
                          <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value as any)}
                            className="w-full px-4 py-3.5 rounded-2xl border border-gray-100 bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold text-gray-800 cursor-pointer"
                          >
                            <option value="pengeluaran">Pengeluaran</option>
                            <option value="pemasukan">Pemasukan</option>
                          </select>
                        </div>

                        {/* 3. Sumber/Penerima */}
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1 flex items-center gap-1">
                            <Users size={12} /> Sumber / Penerima
                          </label>
                          <input
                            type="text"
                            required
                            value={sourceRecipient}
                            onChange={(e) => setSourceRecipient(e.target.value)}
                            placeholder="Contoh: Toko Berkah, Helper Budi, Driver Agus..."
                            className="w-full px-4 py-3.5 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold text-gray-800"
                          />
                        </div>

                        {/* 4. Nominal */}
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1 flex items-center gap-1">
                            <DollarSign size={12} /> Nominal (Rp)
                          </label>
                          <input
                            type="number"
                            required
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0"
                            className="w-full px-4 py-3.5 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold text-gray-800"
                          />
                        </div>

                        {/* Interactive dynamic QRIS segment */}
                        {parseFloat(amount) > 0 && (
                          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3">
                            <button
                              type="button"
                              onClick={() => setShowTxQRIS(!showTxQRIS)}
                              className="w-full flex items-center justify-between text-xs text-blue-600 hover:text-blue-700 font-bold transition-all focus:outline-none"
                            >
                              <span className="flex items-center gap-1.5">
                                <QrCode size={14} className="text-blue-600" />
                                {showTxQRIS ? 'Sembunyikan QRIS Dinamis' : 'Tampilkan QRIS Dinamis untuk Nominal ini'}
                              </span>
                              <ChevronDown size={14} className={`transform transition-transform ${showTxQRIS ? 'rotate-180' : ''}`} />
                            </button>

                            {showTxQRIS && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="flex flex-col items-center justify-center pt-2 space-y-2 border-t border-gray-200/50"
                              >
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest text-center">Scan QRIS Dinamis (Rp {parseFloat(amount).toLocaleString('id-ID')})</p>
                                <div className="w-56 h-56 bg-white p-2 rounded-xl border border-gray-100 shadow-inner flex items-center justify-center relative overflow-hidden shrink-0">
                                  <img 
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                                      generateDynamicQRIS(qrisText, parseFloat(amount))
                                    )}`} 
                                    alt="Dynamic transaction QRIS" 
                                    className="w-full h-full object-contain"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                                <div className="text-center px-4">
                                  <p className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full inline-block border border-emerald-100/60">
                                    Nominal QRIS Terintegrasi
                                  </p>
                                </div>
                              </motion.div>
                            )}
                          </div>
                        )}

                        {/* 5. Keterangan */}
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1 flex items-center gap-1">
                            <ReceiptText size={12} /> Keterangan
                          </label>
                          <input
                            type="text"
                            required
                            value={desc}
                            onChange={(e) => setDesc(e.target.value)}
                            placeholder="Contoh: Pembelian sparepart, Biaya tol, dll..."
                            className="w-full px-4 py-3.5 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold text-gray-800"
                          />
                        </div>

                        <div className="pt-4 flex gap-3">
                          <button
                            type="button"
                            onClick={() => setIsAdminVerified(false)}
                            className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-2xl transition-all font-bold text-sm"
                          >
                            Kembali
                          </button>
                          <button
                            type="submit"
                            disabled={!desc.trim() || !amount || !sourceRecipient.trim() || adding}
                            className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-2xl transition-all font-bold text-sm shadow-lg shadow-blue-100/50 flex items-center justify-center gap-2 active:scale-95"
                          >
                            {adding ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : editingTransactionId ? (
                              <Pencil size={16} className="stroke-[2.5]" />
                            ) : (
                              <Plus size={16} className="stroke-[2.5]" />
                            )}
                            {editingTransactionId ? 'Simpan Perubahan' : 'Simpan Transaksi'}
                          </button>
                        </div>
                      </>
                    )}
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* SEARCH & FILTERS */}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            <div className="flex-1 relative flex items-center">
              <Search className="absolute left-5 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Cari berdasarkan keterangan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-14 pr-6 py-4 rounded-[1.5rem] border border-gray-100 bg-white shadow-sm focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all text-sm font-medium"
              />
            </div>
            
            {/* Reset active filters button */}
            {(searchTerm || txMonth !== 'all' || txYear !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setTxMonth('all');
                  setTxYear('all');
                }}
                className="text-xs font-extrabold text-blue-600 hover:text-blue-700 hover:underline px-3 py-2 transition-all cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>

          <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-8 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap border border-gray-200">Tanggal</th>
                    <th className="px-8 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap border border-gray-200">Kategori</th>
                    <th className="px-8 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap border border-gray-200">Sumber / Penerima</th>
                    <th className="px-8 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap border border-gray-200">Keterangan</th>
                    <th className="px-8 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest text-right whitespace-nowrap border border-gray-200">Nominal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <AnimatePresence>
                    {filteredTransactions.map((t) => {
                      const isRowPressing = isPressingId === t.id;
                      return (
                        <motion.tr 
                          key={t.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onMouseDown={(e) => startLongPress(t.id, e)}
                          onMouseUp={() => endLongPress(true, t.id)}
                          onMouseLeave={() => endLongPress(false)}
                          onTouchStart={(e) => startLongPress(t.id, e)}
                          onTouchEnd={() => endLongPress(true, t.id)}
                          onTouchMove={handleTouchMove}
                          onTouchCancel={() => endLongPress(false)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                          }}
                          style={{
                            background: isRowPressing
                              ? `linear-gradient(to right, rgba(59, 130, 246, 0.08) ${pressProgress}%, rgb(249, 250, 251) ${pressProgress}%)`
                              : undefined
                          }}
                          className={`group transition-all select-none duration-150 relative cursor-pointer ${
                            isRowPressing ? 'bg-slate-50' : 'hover:bg-gray-50/30'
                          }`}
                        >
                          <td className="px-8 py-3 whitespace-nowrap border border-gray-200">
                            <span className="text-xs font-bold text-gray-900">
                              {t.date?.toDate().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </td>
                          <td className="px-8 py-3 whitespace-nowrap border border-gray-200">
                            {getCategoryBadge(t.category || (() => {
                              const descLower = (t.description || '').toLowerCase();
                              if (descLower.includes('saldo awal') || descLower.includes('awal') || descLower.includes('modal')) {
                                return 'saldo_awal';
                              }
                              if (descLower.includes('iuran') || descLower.includes('ceklis') || descLower.includes('pembayaran')) {
                                return 'iuran';
                              }
                              if (t.amount < 0) return 'pengeluaran';
                              const expenseKeywords = [
                                'beli', 'pengeluaran', 'bayar', 'gaji', 'bensin', 'service', 'servis', 
                                'makan', 'operasional', 'ongkos', 'ban', 'perbaikan', 'sewa', 'kasbon', 'pembelian', 'snack'
                              ];
                              if (expenseKeywords.some(kw => descLower.includes(kw))) {
                                return 'pengeluaran';
                              }
                              return 'lainnya';
                            })())}
                          </td>
                          <td className="px-8 py-3 text-xs font-bold text-gray-750 whitespace-nowrap overflow-hidden text-ellipsis max-w-[160px] border border-gray-200" title={t.sourceRecipient || '-'}>
                            {t.sourceRecipient || '-'}
                          </td>
                          <td className="px-8 py-3 text-left whitespace-nowrap overflow-hidden text-ellipsis max-w-[220px] border border-gray-200" title={t.description}>
                            <span className="text-xs font-medium text-gray-600 leading-tight">
                              {t.description}
                            </span>
                          </td>
                          <td className="px-8 py-3 text-right font-mono font-black text-blue-600 relative group-hover:pr-24 transition-all whitespace-nowrap border border-gray-200">
                            <span className="inline-block transition-opacity group-hover:opacity-40">
                              Rp {t.amount.toLocaleString('id-ID')}
                            </span>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAdminTargetAction({ type: 'edit_tx', tx: t });
                                  setShowGlobalAdminVerify(true);
                                  setAdminPin('');
                                  setAdminError('');
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                title="Edit Transaksi"
                              >
                                <Pencil size={18} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAdminTargetAction({ type: 'delete_tx', tx: t });
                                  setShowGlobalAdminVerify(true);
                                  setAdminPin('');
                                  setAdminError('');
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                title="Hapus Transaksi"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                  {filteredTransactions.length === 0 && !loading && (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center text-gray-400 italic">
                        {searchTerm || txMonth !== 'all' || txYear !== 'all' ? 'Tidak ada transaksi yang sesuai kriteria.' : 'Belum ada data transaksi.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* RIWAYAT PEMBAYARAN IURAN TERVERIFIKASI */
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <ReceiptText size={28} className="text-emerald-600" />
                Riwayat Pembayaran Iuran Anggota
              </h1>
              <p className="text-gray-500 mt-1">
                Daftar seluruh transaksi iuran bulanan yang telah berhasil diverifikasi oleh admin.
              </p>
            </div>
            
            <div className="bg-emerald-600 px-6 py-4 rounded-3xl text-white shadow-lg shadow-emerald-100 flex flex-col items-end">
               <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Total Pembayaran Lunas</span>
               <span className="text-xl font-black">Rp {totalVerifiedAmount.toLocaleString('id-ID')}</span>
            </div>
          </div>

          {/* Filters for Verified Payments */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-4 justify-between">
            {/* Search Member Name */}
            <div className="flex items-center bg-gray-50/50 hover:bg-gray-50 px-4 py-3.5 rounded-2xl border border-gray-100 flex-1 md:max-w-md transition-all">
              <Search className="text-gray-400 mr-2.5 flex-shrink-0" size={16} />
              <input
                type="text"
                placeholder="Cari nama anggota (e.g., Agus, Budi)..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full text-xs font-bold text-gray-800 placeholder-gray-400 outline-none bg-transparent"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Month Select */}
              <div className="relative flex-1 sm:flex-none">
                <select
                  value={historyMonth}
                  onChange={(e) => setHistoryMonth(e.target.value)}
                  className="appearance-none w-full bg-white border border-gray-100 px-5 py-3.5 pr-11 rounded-2xl text-xs font-bold text-gray-700 shadow-xs focus:border-blue-500 hover:bg-gray-50 transition-all outline-none cursor-pointer"
                >
                  <option value="all">Semua Bulan</option>
                  {MONTH_MAP.map((m) => (
                    <option key={m.key} value={m.key}>{m.nameIndo}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
              </div>

              {/* Year Select */}
              <div className="relative flex-1 sm:flex-none">
                <select
                  value={historyYear}
                  onChange={(e) => setHistoryYear(e.target.value)}
                  className="appearance-none w-full bg-white border border-gray-100 px-5 py-3.5 pr-11 rounded-2xl text-xs font-bold text-gray-700 shadow-xs focus:border-blue-500 hover:bg-gray-50 transition-all outline-none cursor-pointer"
                >
                  <option value="all">Semua Tahun</option>
                  {[2026, 2025, 2024].map((year) => (
                    <option key={year} value={year.toString()}>Tahun {year}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
              </div>

              {/* Reset Filters button */}
              {(historySearch || historyMonth !== 'all' || historyYear !== 'all') && (
                <button
                  onClick={() => {
                    setHistorySearch('');
                    setHistoryMonth('all');
                    setHistoryYear('all');
                  }}
                  className="text-xs font-extrabold text-emerald-600 hover:text-emerald-700 hover:underline px-3 py-2 transition-all"
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>

          {/* Verified Payments Table */}
          <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left grid-table">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-200">
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest">Tanggal</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest">Admin</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest w-[170px]">Aksi</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest">Nama</th>
                    <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredVerifiedPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/20 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-bold text-gray-850">
                          {formatPaymentDate(p.date)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-extrabold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-xl uppercase">
                          {p.adminName}
                        </span>
                      </td>
                        <td className="px-3 py-2 whitespace-nowrap w-[170px]">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              const mObj = members.find(m => m.id === p.memberId);
                              setShowReceipt({
                                id: p.memberId,
                                memberName: p.memberName,
                                type: p.memberType,
                                months: [p.month],
                                amount: p.amount,
                                method: p.method,
                                date: p.date ? (p.date.toDate ? p.date.toDate() : new Date(p.date)) : new Date(),
                                adminName: p.adminName,
                                bank: p.bank || undefined,
                                memberPhone: mObj?.phone || undefined
                              });
                            }}
                            className="px-2 py-1.5 rounded-lg text-[10px] font-black bg-slate-900 hover:bg-slate-800 text-white transition-all flex items-center gap-1 active:scale-95 shadow-xs font-sans tracking-tight cursor-pointer"
                            title="Unduh Struk"
                          >
                            <Download size={11} className="stroke-[2.5]" />
                            Unduh
                          </button>
                          <button
                            onClick={() => {
                              setAdminTargetAction({ type: 'delete_verified_payment', payment: p });
                              setShowGlobalAdminVerify(true);
                              setAdminPin('');
                              setAdminError('');
                            }}
                            className="px-2 py-1.5 rounded-lg text-[10px] font-black bg-red-50 hover:bg-red-100 text-red-650 transition-all flex items-center gap-1 active:scale-95 shadow-xs font-sans tracking-tight border border-red-100 cursor-pointer"
                            title="Hapus Pembayaran"
                          >
                            <Trash2 size={11} className="stroke-[2.5]" />
                            Hapus
                          </button>
                        </div>
                      </td>
                      <td className="px-8 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black text-gray-950">{p.memberName}</span>
                          <span className={`px-2 py-0.5 rounded-[10px] text-[9px] font-black uppercase tracking-wider ${
                            p.memberType === 'driver' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                          }`}>
                            {p.memberType}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-xs font-medium text-gray-700">
                          Iuran bulan <strong className="font-bold text-gray-900">{getMonthIndo(p.month)}</strong> sebesar <strong className="font-bold text-gray-900">Rp {p.amount.toLocaleString('id-ID')}</strong> ({p.method}{p.bank ? ` via BB-${p.bank}` : ''})
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredVerifiedPayments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center text-gray-400 italic text-sm">
                        Tidak ada riwayat pembayaran iuran yang sesuai kriteria filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Long Press Choice Menu Popup */}
      <AnimatePresence>
        {activeLongPressTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveLongPressTx(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 overflow-hidden z-20 border border-gray-100"
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <ReceiptText size={20} className="stroke-[2.5]" />
                </div>
                <h3 className="text-lg font-black text-gray-900 leading-tight">Detail & Aksi Transaksi</h3>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1.5">Info Lengkap Transaksi</p>
              </div>

              {/* Detail Transaksi */}
              <div className="bg-gray-50/60 rounded-2xl p-4 mb-6 space-y-3.5 text-xs text-left border border-gray-100">
                <div className="flex justify-between items-center border-b border-gray-100/50 pb-2">
                  <span className="text-gray-400 font-semibold uppercase tracking-wider">Keterangan</span>
                  <span className="text-gray-800 font-extrabold text-right max-w-[200px] break-words">{activeLongPressTx.description}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100/50 pb-2">
                  <span className="text-gray-400 font-semibold uppercase tracking-wider">Sumber / Penerima</span>
                  <span className="text-gray-800 font-extrabold">{activeLongPressTx.sourceRecipient || '-'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100/50 pb-2">
                  <span className="text-gray-400 font-semibold uppercase tracking-wider">Nominal</span>
                  <span className="text-blue-600 font-mono font-black text-sm">Rp {activeLongPressTx.amount?.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100/50 pb-2">
                  <span className="text-gray-400 font-semibold uppercase tracking-wider">Kategori</span>
                  <span>{getCategoryBadge(activeLongPressTx.category || 'lainnya')}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100/50 pb-2">
                  <span className="text-gray-400 font-semibold uppercase tracking-wider">Tanggal Transaksi</span>
                  <span className="text-gray-700 font-extrabold">{formatPaymentDate(activeLongPressTx.date)}</span>
                </div>
                {activeLongPressTx.createdByAdmin && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 font-semibold uppercase tracking-wider">Dicatat Oleh Admin</span>
                    <span className="text-emerald-700 font-black uppercase text-[10px] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">{activeLongPressTx.createdByAdmin}</span>
                  </div>
                )}
              </div>

              <div className="space-y-3 font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    const tx = activeLongPressTx;
                    setActiveLongPressTx(null);
                    setAdminTargetAction({ type: 'edit_tx', tx });
                    setShowGlobalAdminVerify(true);
                    setAdminPin('');
                    setAdminError('');
                  }}
                  className="w-full py-4 bg-blue-50/60 hover:bg-blue-100/80 text-blue-600 font-extrabold rounded-2xl transition-all text-sm active:scale-95 flex items-center justify-center gap-2 border border-blue-100/40"
                >
                  <Pencil size={18} />
                  Edit Transaksi Ini
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const tx = activeLongPressTx;
                    setActiveLongPressTx(null);
                    setAdminTargetAction({ type: 'delete_tx', tx });
                    setShowGlobalAdminVerify(true);
                    setAdminPin('');
                    setAdminError('');
                  }}
                  className="w-full py-4 bg-red-50 hover:bg-red-100 text-red-600 font-extrabold rounded-2xl transition-all text-sm active:scale-95 flex items-center justify-center gap-2 border border-red-100/50"
                >
                  <Trash2 size={18} />
                  Hapus Transaksi Ini
                </button>

                <button
                  type="button"
                  onClick={() => setActiveLongPressTx(null)}
                  className="w-full py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 font-bold rounded-2xl transition-all text-xs"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Admin Verification Modal for Edit & Delete Transactions */}
      <AnimatePresence>
        {showGlobalAdminVerify && adminTargetAction && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowGlobalAdminVerify(false);
                setAdminTargetAction(null);
                setAdminPin('');
                setAdminError('');
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 overflow-hidden z-[70] border border-gray-100"
            >
              <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-3">
                <h3 className="text-lg font-black text-gray-900 leading-tight">Otorisasi Admin</h3>
                <button 
                  type="button"
                  onClick={() => {
                    setShowGlobalAdminVerify(false);
                    setAdminTargetAction(null);
                    setAdminError('');
                    setAdminPin('');
                  }}
                  className="p-1 px-3 bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-xs font-bold rounded-xl transition-all"
                >
                  Batal
                </button>
              </div>

              <div className="space-y-4">
                <div className={`p-4 rounded-2xl border text-xs font-semibold leading-relaxed text-left ${
                  adminTargetAction.type === 'delete_verified_payment' || adminTargetAction.type === 'delete_tx'
                    ? 'bg-red-50/70 border-red-100 text-gray-600'
                    : 'bg-blue-50/70 border-blue-100 text-gray-600'
                }`}>
                  {adminTargetAction.type === 'delete_tx' ? (
                    <span>
                      Tindakan: <span className="font-extrabold text-red-700">Hapus Transaksi ({adminTargetAction.tx?.description})</span>. Diperlukan verifikasi admin untuk melanjutkan proses penghapusan permanen.
                    </span>
                  ) : adminTargetAction.type === 'delete_verified_payment' ? (
                    <span>
                      Tindakan: <span className="font-extrabold text-red-700">Hapus Transaksi ({adminTargetAction.payment?.memberName})</span>. Diperlukan verifikasi admin untuk melanjutkan proses penghapusan permanen.
                    </span>
                  ) : (
                    <span>
                      Tindakan: <span className="font-extrabold text-blue-700">Edit Transaksi ({adminTargetAction.tx?.description})</span>. Diperlukan verifikasi admin sebelum mengubah data transaksi.
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1">
                    Nama Admin
                  </label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={(e) => {
                      setAdminName(e.target.value);
                      setAdminError('');
                    }}
                    placeholder="Masukkan nama Anda..."
                    className="w-full px-4 py-3 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold animate-none"
                  />
                  {['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] font-extrabold text-amber-800 bg-amber-50 border border-amber-100 px-3 py-1 rounded-xl flex items-center p-2 mt-1 gap-1.5 animate-none"
                    >
                      <span>🌟 Super Admin Terdaftar: Bebas PIN!</span>
                    </motion.div>
                  )}
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1">
                    PIN Admin
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) ? '1234' : adminPin}
                    onChange={(e) => {
                      setAdminPin(e.target.value);
                      setAdminError('');
                    }}
                    disabled={['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase())}
                    placeholder={['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) ? '✓✓✓✓' : '••••'}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleGlobalAdminVerifyTx();
                      }
                    }}
                    className={`w-full px-4 py-3 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold text-center tracking-[0.5em] ${['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) ? 'bg-amber-50/20 text-amber-500 border-dashed border-amber-200 cursor-not-allowed' : ''}`}
                  />
                </div>

                {adminError && (
                  <motion.p 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs font-bold text-red-500 text-center"
                  >
                    {adminError}
                  </motion.p>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleGlobalAdminVerifyTx}
                    className={`w-full py-4 text-white font-bold rounded-2xl shadow-lg transition-all text-sm active:scale-95 ${
                      adminTargetAction.type === 'delete_tx' || adminTargetAction.type === 'delete_verified_payment'
                        ? 'bg-red-600 hover:bg-red-700 shadow-red-100'
                        : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
                    }`}
                  >
                    Konfirmasi Otorisasi
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receipt Modal Overlay (Print Friendly) */}
      <AnimatePresence>
        {showReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:absolute print:inset-0 print:bg-white print:p-0">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm print:hidden"
              onClick={() => setShowReceipt(null)}
            />
            
            {/* Receipt Paper Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="receipt-print-container relative w-full max-w-sm bg-white text-gray-800 rounded-3xl shadow-2xl p-6 md:p-8 border border-gray-100 font-mono text-sm overflow-hidden z-20 print:shadow-none print:border-none print:p-0 print:w-full print:max-w-none print:rounded-none"
            >
              {/* Thermal Receipt Jagged/Dashed Aesthetic Top */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-gray-200 via-transparent to-transparent bg-[length:12px_6px] bg-repeat-x print:hidden" />

              {/* Receipt Header */}
              <div className="text-center space-y-1 mb-6">
                <h3 className="text-lg font-black tracking-tight text-gray-900 font-sans">KAS DELTA 8</h3>
                <p className="text-[10px] text-gray-500 font-sans tracking-wide">Struk ini dibuat otomatis</p>
                {showReceipt.adminName && (
                  <p className="text-[10px] text-gray-500 font-sans tracking-wide">Di verifikasi oleh {showReceipt.adminName}</p>
                )}
                <div className="text-gray-300 py-1 text-xs select-none">
                  ----------------- DETAIL STRUK -----------------
                </div>
                <h4 className="text-[11px] font-black text-gray-900 tracking-wider">STRUK BUKTI PEMBAYARAN IURAN</h4>
                <div className="text-gray-300 text-xs select-none">
                  -----------------------------------------------
                </div>
              </div>

              {/* Receipt Body Info */}
              <div className="space-y-2 text-[11px] leading-relaxed text-left">
                <div className="flex justify-between">
                  <span className="text-gray-400">NO. REK:</span>
                  <span className="font-bold text-gray-900 font-mono">
                    TRX-{showReceipt.months[0]?.toUpperCase() || 'PAY'}-{showReceipt.id?.slice(0, 5).toUpperCase()}-{Math.floor(((showReceipt.date instanceof Date) ? showReceipt.date.getTime() : (showReceipt.date?.seconds ? showReceipt.date.seconds * 1000 : Date.now())) / 360000 % 100000)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">TANGGAL:</span>
                  <span className="font-bold text-gray-905 text-gray-900">
                    {showReceipt.date ? (
                      showReceipt.date instanceof Date 
                        ? showReceipt.date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : formatPaymentDate(showReceipt.date)
                    ) : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">ANGGOTA:</span>
                  <span className="font-black text-gray-900 uppercase font-sans tracking-tight">{showReceipt.memberName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">TIPE ENTY:</span>
                  <span className="font-bold text-gray-900">{showReceipt.type === 'driver' ? 'DRIVER' : 'HELPER'}</span>
                </div>
                <div className="text-gray-300 py-1.5 text-xs select-none">
                  ===============================================
                </div>

                {/* Billing details list */}
                <div className="space-y-1.5">
                  <div className="font-black text-[10px] text-gray-400 uppercase tracking-widest pl-0.5">DETAIL DISK:</div>
                  {showReceipt.months.map(m => (
                    <div key={m} className="flex justify-between items-center pl-1">
                      <span className="text-gray-700 font-semibold font-sans">Iuran Bulanan ({getMonthIndo(m)})</span>
                      <span className="text-gray-900 font-bold">Rp 25.000</span>
                    </div>
                  ))}
                </div>

                <div className="text-gray-300 py-1.5 text-xs select-none">
                  -----------------------------------------------
                </div>

                {/* Receipt Total */}
                <div className="flex justify-between items-center py-1.5 bg-gray-50/70 p-2.5 rounded-2xl print:bg-white print:p-0">
                  <span className="text-[10px] font-black text-gray-500">TOTAL BAYAR:</span>
                  <span className="text-sm font-black text-emerald-600">
                    Rp {showReceipt.amount.toLocaleString('id-ID')}
                  </span>
                </div>

                <div className="flex justify-between pt-1">
                  <span className="text-gray-400">METODE:</span>
                  <span className="font-black text-gray-950 uppercase">{showReceipt.method} {showReceipt.bank ? `(${showReceipt.bank})` : ''}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-400">STATUS:</span>
                  <span className="font-black text-emerald-600 tracking-wider">LUNAS / VERIFIED</span>
                </div>

                {showReceipt.adminName && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">VERIFIKATOR:</span>
                    <span className="font-black text-gray-900 uppercase">{showReceipt.adminName}</span>
                  </div>
                )}
                
                <div className="text-gray-300 py-2 text-xs select-none">
                  ===============================================
                </div>
              </div>

              {/* Receipt Footer message */}
              <div className="text-center space-y-1 mt-4">
                <p className="text-[9px] font-black tracking-wide text-gray-800 uppercase">BUKTI RESMI PEMBAYARAN</p>
                <p className="text-[8px] text-gray-400 font-sans leading-relaxed">Terima kasih atas kontribusi Anda. Iuran wajib digunakan untuk kesejahteraan dan operasional bersama secara transparan.</p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2.5 mt-8 print:hidden">
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => downloadReceipt(showReceipt)}
                    className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-2xl transition-all text-xs flex items-center justify-center gap-1.5 active:scale-95 shadow-lg shadow-slate-100/50"
                  >
                    <Download size={13} className="stroke-[2.5]" />
                    Download Struk
                  </button>
                  <button
                    type="button"
                    onClick={() => shareReceipt(showReceipt)}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl transition-all text-xs flex items-center justify-center gap-1.5 active:scale-95 shadow-lg shadow-blue-100/50"
                  >
                    <Share2 size={13} className="stroke-[2.5]" />
                    Bagikan
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReceipt(null)}
                  className="w-full py-3 bg-gray-50 hover:bg-gray-200 text-gray-600 border border-gray-100 font-extrabold rounded-2xl transition-all text-xs active:scale-95"
                >
                  Tutup Struk
                </button>
              </div>

              {/* Jagged bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-200 via-transparent to-transparent bg-[length:12px_6px] bg-repeat-x print:hidden" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Google Sheets Export Modal */}
      <AnimatePresence>
        {sheetsExporting && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full border border-gray-100 shadow-2xl space-y-5 text-center"
            >
              <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin stroke-[2.5]" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-extrabold text-gray-900 text-base">Sinkronisasi Google Sheets</h4>
                <p className="text-xs text-gray-400 font-medium">Harap tunggu, sistem sedang menyiapkan lembar iuran...</p>
              </div>
              
              <div className="bg-emerald-50/50 border border-dashed border-emerald-100 rounded-2xl p-4 text-xs font-bold text-emerald-800 font-sans leading-relaxed">
                {sheetsProgress || 'Menyambungkan akun Google...'}
              </div>
              
              {sheetsError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl p-3.5 leading-relaxed font-bold">
                  Gagal: {sheetsError}
                </div>
              )}
              
              {sheetsError && (
                <button
                  type="button"
                  onClick={() => setSheetsExporting(false)}
                  className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-2xl font-bold text-xs transition-colors cursor-pointer"
                >
                  Tutup Jendela
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Google Sheets Success Modal */}
      <AnimatePresence>
        {exportedSheetUrl && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full border border-gray-100 shadow-2xl space-y-5 text-center"
            >
              <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-1.5">
                <h4 className="font-extrabold text-gray-900 text-base">Berhasil Diekspor!</h4>
                <p className="text-xs text-gray-400 font-medium">Laporan keuangan telah dikonversi dan siap diakses di akun Google Sheets Anda.</p>
              </div>
              
              <div className="flex gap-2.5 pt-1.5">
                <button
                  type="button"
                  onClick={() => setExportedSheetUrl('')}
                  className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-100 rounded-2xl font-bold text-xs transition-colors cursor-pointer"
                >
                  Selesai
                </button>
                <a
                  href={exportedSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 decoration-none shadow-lg shadow-emerald-100"
                >
                  <span>Buka Sheets</span>
                  <Share2 size={13} className="stroke-[2.5]" />
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification Container in bottom-right corner */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 30, scale: 0.9, x: 20 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 20, transition: { duration: 0.2 } }}
              className="pointer-events-auto bg-white/95 backdrop-blur-md border border-gray-100/80 shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-4 rounded-2xl flex items-start gap-3 select-none"
            >
              <div className={`p-2 rounded-xl shrink-0 ${toast.isEdit ? 'bg-blue-50 text-blue-600' : (toast.category === 'pemasukan' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600')}`}>
                {toast.isEdit ? <Pencil size={18} className="stroke-[2.5]" /> : (toast.category === 'pemasukan' ? <ShieldCheck size={18} className="stroke-[2.5]" /> : <TrendingDown size={18} className="stroke-[2.5]" />)}
              </div>
              <div className="flex-1 min-w-0 pr-1.5 text-left font-sans">
                <p className={`text-[10px] font-extrabold uppercase tracking-widest block ${toast.isEdit ? 'text-blue-500' : 'text-gray-400'}`}>
                  {toast.isEdit ? 'Transaksi Diperbarui' : 'Transaksi Dicatat'}
                </p>
                <p className="text-xs font-extrabold text-gray-900 truncate mt-0.5 font-sans">{toast.description}</p>
                <p className="text-xs font-black text-gray-950 mt-1 font-sans">
                  {toast.category === 'pemasukan' ? '+' : '-'} Rp {toast.amount.toLocaleString('id-ID')}
                </p>
              </div>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="text-gray-400 hover:text-gray-600 p-0.5 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
              >
                <X size={14} className="stroke-[2.5]" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

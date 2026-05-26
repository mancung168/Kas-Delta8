import React, { useState, useEffect, useRef } from 'react';
import { formatLogDetails } from '../lib/logger';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  orderBy,
  runTransaction,
  deleteField
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Check, Trash2, Search, Banknote, Clock, Pencil, Save, X, Download, Share2, ChevronDown, AlertCircle, Loader2, Phone, Copy, Lock } from 'lucide-react';
import { downloadReceipt, shareReceipt, copyReceiptImageToClipboard, generateReceiptCanvas } from '../lib/downloadReceipt';
import { sendWaNotification } from '../lib/sendWaNotification';
import { verifyAdmin, isAdminSuper, getAdmins, AdminItem } from '../lib/adminService';
import { motion, AnimatePresence } from 'motion/react';
import MemberForm from './MemberForm';
import { generateDynamicQRIS } from '../lib/qris';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

interface Member {
  id: string;
  name: string;
  type: 'driver' | 'helper';
  months: Record<string, boolean | string>;
  paymentDetails?: Record<string, { method: string; date: any; status?: string }>;
  createdAt: any;
  phone?: string;
}

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Tunai', color: 'bg-orange-500' },
  { id: 'transfer', label: 'Transfer', color: 'bg-purple-500' },
  { id: 'qris', label: 'QRIS', color: 'bg-pink-500' },
  { id: 'ewallet', label: 'E-Wallet', color: 'bg-teal-500' },
];

const BANKS = [
  { id: 'mandiri', name: 'Mandiri', holder: 'ARIFUDIN', number: '1560027351289', color: 'bg-yellow-600' },
  { id: 'bca', name: 'BCA', holder: '', number: '', color: 'bg-blue-600', comingSoon: true },
  { id: 'bri', name: 'BRI', holder: '', number: '', color: 'bg-blue-800', comingSoon: true },
];

const EWALLETS = [
  { id: 'dana', name: 'Dana', holder: 'ARIFUDIN', number: '082210122334', color: 'bg-sky-500', iconText: 'D', appUrl: 'dana://', fallbackUrl: 'https://link.dana.id' },
  { id: 'gopay', name: 'GoPay', holder: 'ARIFUDIN', number: '082210122334', color: 'bg-emerald-500', iconText: 'G', appUrl: 'gojek://', fallbackUrl: 'https://gojek.com' },
  { id: 'shopeepay', name: 'ShopeePay', holder: 'ARIFUDIN', number: '082210122334', color: 'bg-orange-500', iconText: 'S', appUrl: 'shopeepay://', fallbackUrl: 'https://shopee.co.id/shopeepay' },
];

const formatDate = (timestamp: any) => {
  if (!timestamp) return '-';
  try {
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    if (timestamp instanceof Date) {
      return timestamp.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    if (typeof timestamp === 'object' && timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    const dateObj = new Date(timestamp);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  } catch (e) {
    console.error(e);
  }
  return '-';
};

interface LongPressWrapperProps {
  onLongPress: () => void;
  onClick?: () => void;
  children: (isPressing: boolean, progress: number) => React.ReactNode;
  delay?: number;
  className?: string;
  disabled?: boolean;
}

function LongPressWrapper({
  onLongPress,
  onClick,
  children,
  delay = 850,
  className = "",
  disabled = false,
}: LongPressWrapperProps) {
  const [isPressing, setIsPressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = React.useRef<number>(0);
  const touchStartPosRef = React.useRef<{ x: number; y: number } | null>(null);

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    if ('button' in e && e.button !== 0) return; // ignore right clicks
    setIsPressing(true);
    setProgress(0);
    startTimeRef.current = Date.now();

    // Store start coords
    if ('touches' in e && e.touches.length > 0) {
      touchStartPosRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    } else if ('clientX' in e) {
      touchStartPosRef.current = {
        x: (e as React.MouseEvent).clientX,
        y: (e as React.MouseEvent).clientY,
      };
    }

    const intervalTime = 16;
    const totalSteps = delay / intervalTime;
    let currentStep = 0;

    intervalRef.current = setInterval(() => {
      currentStep++;
      const currentProgress = Math.min((currentStep / totalSteps) * 100, 100);
      setProgress(currentProgress);
    }, intervalTime);

    timerRef.current = setTimeout(() => {
      onLongPress();
      end(false);
    }, delay);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isPressing || !startTimeRef.current || !touchStartPosRef.current) return;

    let currentX = 0;
    let currentY = 0;

    if ('touches' in e && e.touches.length > 0) {
      currentX = e.touches[0].clientX;
      currentY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      currentX = (e as React.MouseEvent).clientX;
      currentY = (e as React.MouseEvent).clientY;
    } else {
      return;
    }

    const diffX = Math.abs(currentX - touchStartPosRef.current.x);
    const diffY = Math.abs(currentY - touchStartPosRef.current.y);

    // If movement exceeds 8px (normal scroll/drag threshold), cancel the long-press interaction
    if (diffX > 8 || diffY > 8) {
      end(false);
    }
  };

  const end = (shouldTriggerClick = true) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timerRef.current = null;
    intervalRef.current = null;
    touchStartPosRef.current = null;

    if (isPressing) {
      setIsPressing(false);
      setProgress(0);
      const pressDuration = Date.now() - startTimeRef.current;
      startTimeRef.current = 0;
      if (shouldTriggerClick && pressDuration < delay && onClick) {
        onClick();
      }
    }
  };

  // Cancel long-press on any general scrolling event in the page
  useEffect(() => {
    if (!isPressing) return;

    const handleScroll = () => {
      end(false);
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [isPressing]);

  return (
    <div
      onMouseDown={start}
      onMouseMove={move}
      onMouseUp={() => end(true)}
      onMouseLeave={() => end(false)}
      onTouchStart={start}
      onTouchMove={move}
      onTouchEnd={() => end(true)}
      onTouchCancel={() => end(false)}
      onContextMenu={(e) => {
        e.preventDefault(); // prevent native copy paste/share dialogs during press
      }}
      className={`select-none ${className}`}
    >
      {children(isPressing, progress)}
    </div>
  );
}

export default function MemberList({ type }: { type: 'driver' | 'helper' }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [adminsList, setAdminsList] = useState<AdminItem[]>([]);
  
  useEffect(() => {
    getAdmins().then(setAdminsList).catch(console.error);
  }, []);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [paymentModal, setPaymentModal] = useState<{ id: string; name: string; months: Record<string, boolean> } | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [showMethodSelect, setShowMethodSelect] = useState(false);
  const [showAdminVerification, setShowAdminVerification] = useState(false);
  const [adminName, setAdminName] = useState(() => localStorage.getItem('ADMIN_NICKNAME') || '');
  const [adminPin, setAdminPin] = useState('');
  const [adminError, setAdminError] = useState('');
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState('');
  const [showQRIS, setShowQRIS] = useState(false);
  const [showBankSelect, setShowBankSelect] = useState(false);
  const [selectedBank, setSelectedBank] = useState<any>(null);
  const [showEWalletSelect, setShowEWalletSelect] = useState(false);
  const [selectedEWallet, setSelectedEWallet] = useState<any>(null);
  const [activeBanks, setActiveBanks] = useState<any[]>(BANKS);
  const [activeEWallets, setActiveEWallets] = useState<any[]>(EWALLETS);

  const handleClosePaymentModal = () => {
    setPaymentModal(null);
    setShowMethodSelect(false);
    setShowQRIS(false);
    setShowBankSelect(false);
    setShowEWalletSelect(false);
    setSelectedBank(null);
    setSelectedEWallet(null);
  };

  // QRIS Image management
  const [qrisImage, setQrisImage] = useState<string>('');
  const [qrisText, setQrisText] = useState<string>('');
  const [tempQrisText, setTempQrisText] = useState<string>('');
  const [showQrisUploader, setShowQrisUploader] = useState(false);
  const [tempQrisFile, setTempQrisFile] = useState<string | null>(null);
  const [qrisUploadPin, setQrisUploadPin] = useState('');
  const [qrisUploadError, setQrisUploadError] = useState('');
  const [qrisUploadSuccess, setQrisUploadSuccess] = useState('');
  const [isUploadingQris, setIsUploadingQris] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<{ id: string; month: string; name: string; method?: string } | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPhone, setEditingPhone] = useState('');
  const [editingType, setEditingType] = useState<'driver' | 'helper'>('driver');
  const [activeDetail, setActiveDetail] = useState<{ memberId: string; memberName: string; month: string; data: any } | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  // Long press action states
  const [activeLongPressMember, setActiveLongPressMember] = useState<{ id: string; name: string } | null>(null);
  const [longPressError, setLongPressError] = useState<string | null>(null);
  const [showGlobalAdminVerify, setShowGlobalAdminVerify] = useState(false);
  const [adminTargetAction, setAdminTargetAction] = useState<{ type: 'edit_name' | 'delete_member'; id: string; name: string } | null>(null);

  // Super Admin Status Change Verification States
  const [showStatusVerify, setShowStatusVerify] = useState(false);
  const [statusVerifyTarget, setStatusVerifyTarget] = useState<{ memberId: string; month: string; newStatus: 'verified' | 'pending' | 'unpaid' } | null>(null);
  const [statusVerifyName, setStatusVerifyName] = useState(() => localStorage.getItem('ADMIN_NICKNAME') || '');
  const [statusVerifyPin, setStatusVerifyPin] = useState('');
  const [statusVerifyError, setStatusVerifyError] = useState('');

  // Super Admin Status Change Custom Confirmation States (to bypass window.confirm sandbox iframe blocks)
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [statusConfirmTarget, setStatusConfirmTarget] = useState<{ memberId: string; month: string; newStatus: 'verified' | 'pending' | 'unpaid' } | null>(null);

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
  const [actionError, setActionError] = useState<string | null>(null);

  const loggedInName = localStorage.getItem('ADMIN_NICKNAME') || '';
  const loggedInRole = localStorage.getItem('ADMIN_ROLE') || '';
  const isCurrentlySuper = loggedInRole === 'super-admin' || 
    ['MANCUNG', 'MANCUNG_168', 'MANCUNG168', 'GPTSPAY_ADMIN', 'GPTSPAY'].includes(loggedInName.trim().toUpperCase());

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

  const TARIFF_PER_MONTH = 25000;
  const ADMIN_PIN = localStorage.getItem('ADMIN_PIN') || '1234'; // High-security PIN

  useEffect(() => {
    const q = query(
      collection(db, 'members')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const memberData: Member[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as Member;
        if (data.type === type) {
          memberData.push({ id: doc.id, ...data });
        }
      });
      memberData.sort((a, b) => {
        return (a.name || '').localeCompare(b.name || '', 'id');
      });
      setMembers(memberData);
      setLoading(false);
    }, (error: any) => {
      console.error("Firestore error loading members list inside MemberList:", error);
      setLoading(false);
      if (error?.message?.includes('permission-denied') || error?.message?.includes('permissions') || error?.code === 'permission-denied') {
        window.dispatchEvent(new CustomEvent('firestore-permission-denied'));
      }
      handleFirestoreError(error, OperationType.GET, 'members');
    });

    return () => unsubscribe();
  }, [type]);

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
      console.warn("Failed to listen for QRIS settings:", error);
      setQrisImage('');
      setQrisText('');
      setTempQrisText('');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const pmDocRef = doc(db, 'settings', 'payment_methods');
    const unsubscribe = onSnapshot(pmDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.banks && Array.isArray(data.banks)) {
          setActiveBanks(data.banks);
        } else {
          setActiveBanks(BANKS);
        }
        if (data.ewallets && Array.isArray(data.ewallets)) {
          setActiveEWallets(data.ewallets);
        } else {
          setActiveEWallets(EWALLETS);
        }
      } else {
        setActiveBanks(BANKS);
        setActiveEWallets(EWALLETS);
      }
    }, (error) => {
      console.warn("Failed to listen for payment methods settings:", error);
      setActiveBanks(BANKS);
      setActiveEWallets(EWALLETS);
    });
    return () => unsubscribe();
  }, []);

  const recordPayment = async (memberId: string, method: string, isVerifiedCash = false, isQRISConfirmed = false, bankInfo: any = null) => {
    if (isRecordingPayment) return;
    const path = `members/${memberId}`;
    const member = members.find(m => m.id === memberId);
    if (!member || selectedMonths.length === 0) return;

    // If QRIS and not yet confirmed
    if (method === 'QRIS' && !isQRISConfirmed) {
      setShowQRIS(true);
      return;
    }

    // If Transfer and no bank selected
    if (method === 'Transfer' && !bankInfo) {
      setShowBankSelect(true);
      return;
    }

    // If E-Wallet and no ewallet selected
    if (method === 'E-Wallet' && !bankInfo) {
      setShowEWalletSelect(true);
      return;
    }

    setIsRecordingPayment(true);
    try {
      const isVerified = method === 'Tunai' || isVerifiedCash;

      await runTransaction(db, async (t) => {
        const memberRef = doc(db, 'members', memberId);
        const activityRef = doc(collection(db, 'activities'));

        const updates: any = {
          updatedAt: serverTimestamp(),
        };

        selectedMonths.forEach(month => {
          updates[`months.${month}`] = isVerified;
          updates[`paymentDetails.${month}`] = {
            method,
            status: isVerified ? 'verified' : 'pending',
            date: serverTimestamp(),
            adminName: isVerified ? (adminName || 'Admin') : null,
            bank: bankInfo ? bankInfo.name : null
          };
        });

        t.update(memberRef, updates);

        t.set(activityRef, {
          action: 'bayar_iuran',
          details: formatLogDetails(`[Iuran] ${type === 'driver' ? 'Driver' : 'Helper'} - ${member.name} - ${selectedMonths.map(m => `${m}/${new Date().getFullYear()}`).join(', ')} - ${isVerified ? 'LUNAS / VERIFIED' : 'PENDING'}`),
          adminName: adminName || 'Admin',
          timestamp: serverTimestamp()
        });
      });

      handleClosePaymentModal();
      setAdminName('');
      setAdminPin('');

      // Trigger high fidelity receipt representation on successful verified cash payment
      if (isVerified && method === 'Tunai') {
        setShowReceipt({
          id: memberId,
          memberName: member.name,
          type: type,
          months: [...selectedMonths],
          amount: selectedMonths.length * TARIFF_PER_MONTH,
          method: 'Tunai',
          date: new Date(),
          adminName: adminName || 'Admin',
          memberPhone: member.phone || undefined,
        });
      }

      // Automatically dispatch WhatsApp notification if payment is verified and member has a phone number
      if (isVerified && member.phone) {
        sendWaNotification({
          memberPhone: member.phone,
          memberName: member.name,
          memberType: type,
          months: [...selectedMonths],
          amount: selectedMonths.length * TARIFF_PER_MONTH,
          method: method,
          bank: bankInfo ? bankInfo.name : undefined,
          adminName: adminName || 'Admin'
        });
      }

      setSelectedMonths([]);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, path);
      setAdminError(error?.message || 'Gagal menyimpan pembayaran ke sistem. Mohon coba lagi.');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleAdminVerify = async (overridePin?: string) => {
    if (!adminName.trim()) {
      setAdminError('Nama admin harus diisi');
      return;
    }
    const pinToVerify = overridePin !== undefined ? overridePin : adminPin;
    const isValid = await verifyAdmin(adminName.trim(), pinToVerify);
    if (!isValid) {
      setAdminError('Nama admin atau PIN salah');
      return;
    }

    if (pendingVerification) {
      performVerification(pendingVerification.id, pendingVerification.month);
    } else if (paymentModal) {
      recordPayment(paymentModal.id, pendingPaymentMethod, true);
    }
  };

  const handleGlobalAdminVerify = async (overridePin?: string) => {
    if (!adminName.trim()) {
      setAdminError('Nama admin harus diisi');
      return;
    }
    const pinToVerify = overridePin !== undefined ? overridePin : adminPin;
    const isValidAdmin = await verifyAdmin(adminName, pinToVerify);
    if (!isValidAdmin) {
      setAdminError('Nama admin atau PIN salah');
      return;
    }

    localStorage.setItem('ADMIN_NICKNAME', adminName.trim());
    if (!adminTargetAction) return;

    if (adminTargetAction.type === 'edit_name') {
      const foundMember = members.find(m => m.id === adminTargetAction.id);
      setEditingMemberId(adminTargetAction.id);
      setEditingName(adminTargetAction.name);
      setEditingPhone(foundMember?.phone || '');
      setEditingType(foundMember?.type || type);
      setShowGlobalAdminVerify(false);
      setAdminTargetAction(null);
      setAdminPin('');
      setAdminError('');
    } else if (adminTargetAction.type === 'delete_member') {
      setMemberToDelete({ id: adminTargetAction.id, name: adminTargetAction.name });
      setDeleteConfirmText('');
      setShowGlobalAdminVerify(false);
      setAdminTargetAction(null);
      setAdminPin('');
      setAdminError('');
    }
  };

  const performVerification = async (memberId: string, month: string) => {
    const path = `members/${memberId}`;
    try {
      await runTransaction(db, async (t) => {
        const memberRef = doc(db, 'members', memberId);
        const memberSnap = await t.get(memberRef);
        const currentData = memberSnap.data() || {};
        const currentFieldDetail = currentData.paymentDetails?.[month] || {};

        const newDetail = {
          ...currentFieldDetail,
          status: 'verified',
          adminName: adminName || currentFieldDetail.adminName || 'Admin',
          verifiedAt: serverTimestamp()
        };

        const activityRef = doc(collection(db, 'activities'));

        t.update(memberRef, {
          [`months.${month}`]: true,
          [`paymentDetails.${month}`]: newDetail,
          updatedAt: serverTimestamp(),
        });
        
        t.set(activityRef, {
          action: 'verifikasi_iuran',
          details: formatLogDetails(`[Iuran] ${type === 'driver' ? 'Driver' : 'Helper'} - ${currentData.name || 'Member'} - ${month}/${new Date().getFullYear()} - LUNAS / VERIFIED`),
          adminName: adminName || 'Admin',
          timestamp: serverTimestamp()
        });
      });

      setShowAdminVerification(false);
      setPendingVerification(null);

      // Trigger high fidelity receipt on verification success
      const member = members.find(m => m.id === memberId);
      if (member) {
        const detail = member.paymentDetails?.[month];
        setShowReceipt({
          id: memberId,
          memberName: member.name,
          type: type,
          months: [month],
          amount: TARIFF_PER_MONTH,
          method: detail?.method || 'Transfer/QRIS',
          date: new Date(),
          adminName: adminName,
          bank: detail?.bank || undefined,
          memberPhone: member.phone || undefined,
        });
      }

      setAdminName('');
      setAdminPin('');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, path);
      setActionError(error?.message || 'Gagal melakukan verifikasi pembayaran.');
    }
  };

  const verifyPayment = async (memberId: string, month: string) => {
    // This is now just a trigger for the UI
    const member = members.find(m => m.id === memberId);
    if (member) {
      const method = member.paymentDetails?.[month]?.method;
      setPendingVerification({ id: memberId, month, name: member.name, method });
      setShowAdminVerification(true);
    }
  };

  const updatePaymentStatus = async (memberId: string, month: string, newStatus: 'verified' | 'pending' | 'unpaid') => {
    const path = `members/${memberId}`;
    try {
      const isVerified = newStatus === 'verified';
      const isUnpaid = newStatus === 'unpaid';
      await runTransaction(db, async (t) => {
        const memberRef = doc(db, 'members', memberId);
        const memberSnap = await t.get(memberRef);
        const currentData = memberSnap.data() || {};

        const activityRef = doc(collection(db, 'activities'));
        
        const updates: any = {
          updatedAt: serverTimestamp(),
        };

        if (isUnpaid) {
          updates[`months.${month}`] = deleteField();
          updates[`paymentDetails.${month}`] = deleteField();
        } else {
          updates[`months.${month}`] = isVerified;
          const currentFieldDetail = currentData.paymentDetails?.[month] || {};
          const newDetail = {
            ...currentFieldDetail,
            status: newStatus,
            method: currentFieldDetail.method || 'Tunai',
            date: currentFieldDetail.date || serverTimestamp(),
            adminName: currentFieldDetail.adminName || adminName || 'Admin',
            verifiedAt: isVerified ? serverTimestamp() : null
          };
          updates[`paymentDetails.${month}`] = newDetail;
        }

        t.update(memberRef, updates);

        t.set(activityRef, {
          action: 'update_status_iuran',
          details: formatLogDetails(`[Iuran] ${type === 'driver' ? 'Driver' : 'Helper'} - ${currentData.name || 'Member'} - ${month}/${new Date().getFullYear()} - ${newStatus === 'verified' ? 'LUNAS / VERIFIED' : newStatus === 'pending' ? 'PENDING' : 'BELUM BAYAR / UNPAID'}`),
          adminName: adminName || 'Admin',
          timestamp: serverTimestamp()
        });
      });

      // Trigger high fidelity receipt representation when manually marked verified/lunas
      if (isVerified) {
        const member = members.find(m => m.id === memberId);
        if (member) {
          const detail = member.paymentDetails?.[month];
          setShowReceipt({
            id: memberId,
            memberName: member.name,
            type: type,
            months: [month],
            amount: TARIFF_PER_MONTH,
            method: detail?.method || 'Tunai',
            date: detail?.date ? (detail.date.toDate ? detail.date.toDate() : new Date(detail.date)) : new Date(),
            adminName: detail?.adminName || adminName || 'Admin',
            bank: detail?.bank || undefined,
            memberPhone: member.phone || undefined,
          });

          // Automatically dispatch WhatsApp notification when manually verified
          if (member.phone) {
            sendWaNotification({
              memberPhone: member.phone,
              memberName: member.name,
              memberType: type,
              months: [month],
              amount: TARIFF_PER_MONTH,
              method: detail?.method || 'Tunai',
              bank: detail?.bank || undefined,
              adminName: detail?.adminName || adminName || 'Admin'
            });
          }
        }
      }

      // Also update local activeDetail state if it's currently open
      if (activeDetail && activeDetail.memberId === memberId && activeDetail.month === month) {
        if (isUnpaid) {
          setActiveDetail(null);
        } else {
          setActiveDetail(prev => {
            if (!prev) return null;
            return {
              ...prev,
              data: {
                ...prev.data,
                status: newStatus,
                verifiedAt: isVerified ? new Date() : null
              }
            };
          });
        }
      }
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, path);
      setActionError(error?.message || 'Gagal mengubah status pembayaran.');
    }
  };

  const handleStatusChangeAttempt = async (targetMemberId: string, targetMonth: string, newStatus: 'verified' | 'pending' | 'unpaid') => {
    const rootAdminName = localStorage.getItem('ADMIN_NICKNAME') || '';
    
    // Always prompt for Admin Verification to verify name and PIN
    setStatusVerifyTarget({
      memberId: targetMemberId,
      month: targetMonth,
      newStatus
    });
    setStatusVerifyName(rootAdminName);
    setStatusVerifyPin('');
    setStatusVerifyError('');
    setShowStatusVerify(true);
  };

  const handleStatusVerifyConfirm = async (overridePin?: string) => {
    if (!statusVerifyName.trim()) {
      setStatusVerifyError('Nama admin harus diisi');
      return;
    }
    
    const pinToVerify = overridePin !== undefined ? overridePin : statusVerifyPin;
    const isValid = await verifyAdmin(statusVerifyName, pinToVerify);
    if (!isValid) {
      setStatusVerifyError('Nama admin atau PIN salah');
      return;
    }
    
    // Success: Save admin session
    localStorage.setItem('ADMIN_NICKNAME', statusVerifyName.trim());
    const isSuper = await isAdminSuper(statusVerifyName);
    localStorage.setItem('ADMIN_ROLE', isSuper ? 'super-admin' : 'admin');
    setAdminName(statusVerifyName.trim());
    
    if (statusVerifyTarget) {
      await updatePaymentStatus(statusVerifyTarget.memberId, statusVerifyTarget.month, statusVerifyTarget.newStatus);
    }
    
    setShowStatusVerify(false);
    setStatusVerifyTarget(null);
    setStatusVerifyPin('');
  };

  const updateMemberDetails = async (id: string) => {
    if (!editingName.trim()) return;
    const path = `members/${id}`;
    try {
      const memberRef = doc(db, 'members', id);
      const member = members.find(m => m.id === id);
      const oldName = member ? member.name : '';
      const oldType = member ? member.type : type;

      await updateDoc(memberRef, {
        name: editingName.trim(),
        phone: editingPhone.trim(),
        type: editingType,
        updatedAt: serverTimestamp(),
      });

      // Log member name modification to activities collection
      const categoryLabel = (t: string) => t === 'driver' ? 'Driver' : 'Helper';
      const logMsg = oldType !== editingType 
        ? `[Edit Anggota] ${categoryLabel(oldType)} => ${categoryLabel(editingType)} | Nama: ${oldName} => ${editingName.trim()}`
        : `[Edit Anggota] ${categoryLabel(editingType)} - ${oldName} => ${editingName.trim()}`;

      await setDoc(doc(collection(db, 'activities')), {
        action: 'edit_anggota',
        details: formatLogDetails(logMsg),
        adminName: adminName || 'Admin',
        timestamp: serverTimestamp()
      });

      setEditingMemberId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const deleteMember = async (id: string) => {
    if (deleteConfirmText !== 'DELETE') return;
    const path = `members/${id}`;
    try {
      const member = members.find(m => m.id === id);
      const memberName = member ? member.name : 'Anggota';

      await deleteDoc(doc(db, 'members', id));

      // Log member deletion to activities collection
      await setDoc(doc(collection(db, 'activities')), {
        action: 'hapus_anggota',
        details: formatLogDetails(`[Hapus Anggota] ${type === 'driver' ? 'Driver' : 'Helper'} - ${memberName}`),
        adminName: adminName || 'Admin',
        timestamp: serverTimestamp()
      });

      setMemberToDelete(null);
      setDeleteConfirmText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const filteredMembers = members.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesMonth = filterMonth === 'all' || (() => {
      return m.months?.[filterMonth] === true || m.paymentDetails?.[filterMonth]?.status === 'pending';
    })();
    
    const matchesYear = filterYear === 'all' || (() => {
      const regDate = m.createdAt ? (m.createdAt.toDate ? m.createdAt.toDate() : new Date(m.createdAt)) : null;
      if (regDate && regDate.getFullYear().toString() === filterYear) {
        return true;
      }
      if (m.paymentDetails) {
        return Object.values(m.paymentDetails).some((detail: any) => {
          const payDate = detail?.date ? (detail.date.toDate ? detail.date.toDate() : new Date(detail.date)) : null;
          return payDate && payDate.getFullYear().toString() === filterYear;
        });
      }
      return false;
    })();
    
    return matchesSearch && matchesMonth && matchesYear;
  });

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 md:px-8 pb-8 space-y-5 print:hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight capitalize">
            Daftar {type}
          </h1>
        </div>
      </div>

      {/* Button MemberForm */}
      <MemberForm defaultType={type} />

      {/* Searchbar & Total Aligned */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-100 w-full lg:max-w-xs xl:max-w-sm">
          <Search className="text-gray-400 mr-2.5 flex-shrink-0" size={18} />
          <input
            type="text"
            placeholder={`Cari ${type}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-sm font-bold text-gray-800 placeholder-gray-400 outline-none bg-transparent"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          {/* Pilih Tahun */}
          <div className="relative flex-1 sm:flex-none">
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="appearance-none w-full bg-white border border-gray-100 px-4 py-3 pr-10 rounded-2xl text-sm font-bold text-gray-700 shadow-sm focus:border-blue-500 hover:bg-gray-50/50 transition-all outline-none cursor-pointer"
            >
              <option value="all">Semua Tahun</option>
              {[2026, 2025, 2024].map((year) => (
                <option key={year} value={year.toString()}>Tahun {year}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
          </div>

          {/* Total Anggota */}
          <div className="bg-gray-50/50 hover:bg-gray-50 border border-gray-100 px-4 py-3 rounded-2xl flex items-center justify-between sm:justify-start gap-4 transition-all w-full sm:w-auto shadow-sm">
            <span className="text-sm font-semibold text-gray-500">Total {type}</span>
            <span className="text-gray-900 font-extrabold px-3 py-1 bg-white border border-gray-100 rounded-xl shadow-xs text-xs">
              {filteredMembers.length}
            </span>
          </div>

          {/* Reset Filters Option if active */}
          {(filterYear !== 'all') && (
            <button
              onClick={() => {
                setFilterMonth('all');
                setFilterYear('all');
              }}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline px-2 py-1 transition-all self-center text-center"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Table section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-auto max-h-[600px] relative">
          <table className="w-full text-left grid-table min-w-[1000px] relative border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-3 py-1.5 text-xs font-black text-gray-500 uppercase tracking-widest w-px whitespace-nowrap sticky top-0 left-0 z-30 bg-gray-50 border-r border-gray-100 shadow-[2px_0_5px_rgba(0,0,0,0.015)]">Data Anggota</th>
                {MONTHS.map(month => {
                  const isSelected = filterMonth === month;
                  return (
                    <th 
                      key={month} 
                      className={`px-1 py-1.5 text-center text-xs font-bold uppercase tracking-widest w-auto transition-colors duration-200 sticky top-0 z-20 border-b border-gray-100 ${
                        isSelected 
                          ? 'text-blue-600 bg-blue-50/95 font-extrabold border-x border-blue-100/50' 
                          : 'text-gray-400 bg-gray-50/95'
                      }`}
                    >
                      {month}
                    </th>
                  );
                })}
                <th className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-widest text-center sticky top-0 z-20 bg-gray-50/95 border-b border-gray-100">Status</th>
                <th className="px-2 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-center sticky top-0 z-20 bg-gray-50/95 border-b border-gray-100">Bayar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <AnimatePresence>
                {filteredMembers.map((member) => {
                  const paidCount = Object.values(member.months || {}).filter(v => v === true).length;
                  const hasPending = member.paymentDetails && Object.values(member.paymentDetails).some((d: any) => d.status === 'pending');
                  
                  return (
                    <motion.tr 
                      key={member.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="hover:bg-gray-50/30 transition-colors group relative"
                    >
                      <td className="px-3 py-1 align-middle sticky left-0 z-10 bg-white group-hover:bg-gray-50/90 transition-colors border-r border-gray-100 shadow-[2px_0_5px_rgba(0,0,0,0.015)] w-px whitespace-nowrap">
                        <LongPressWrapper
                          onLongPress={() => {
                            setActiveLongPressMember({ id: member.id, name: member.name });
                          }}
                          className="flex-1"
                        >
                            {(isPressing, progress) => (
                              <div className={`flex items-center justify-between gap-4 group/name py-1 px-1.5 rounded-lg transition-all cursor-pointer ${
                                isPressing
                                  ? 'bg-blue-50/75 border border-blue-200/50 scale-95 shadow-inner'
                                  : 'hover:bg-gray-50/40 border border-transparent'
                              }`}>
                                <div className="flex flex-col text-left select-none justify-center relative min-h-[22px] pr-2">
                                  <span className="font-bold text-gray-900 text-xs leading-none whitespace-nowrap">{member.name}</span>
                                  {isPressing ? (
                                    <span className="text-[9px] text-blue-500 font-extrabold tracking-wider animate-pulse absolute -bottom-3 left-0 whitespace-nowrap bg-white/90 px-1 rounded shadow-sm">
                                      TAHAN... {Math.round(progress)}%
                                    </span>
                                  ) : (
                                    <span className="text-[8px] text-gray-400 font-medium tracking-wide opacity-0 group-hover/name:opacity-100 transition-opacity absolute -bottom-3.5 left-0 whitespace-nowrap pointer-events-none">
                                      Tekan lama untuk opsi
                                    </span>
                                  )}
                                </div>
                                <div className="relative flex items-center justify-center w-5 h-5 select-none shrink-0">
                                  {isPressing ? (
                                    <svg className="w-5 h-5 -rotate-90">
                                      <circle
                                        cx="10"
                                        cy="10"
                                        r="7.5"
                                        stroke="#dbeafe"
                                        strokeWidth="2"
                                        fill="transparent"
                                      />
                                      <circle
                                        cx="10"
                                        cy="10"
                                        r="7.5"
                                        stroke="#2563eb"
                                        strokeWidth="2"
                                        fill="transparent"
                                        strokeDasharray={2 * Math.PI * 7.5}
                                        strokeDashoffset={2 * Math.PI * 7.5 * (1 - progress / 100)}
                                      />
                                    </svg>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setActiveLongPressMember({ id: member.id, name: member.name });
                                      }}
                                      className="p-1 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover/name:opacity-100"
                                      title="Tekan lama atau Klik untuk Opsi Tindakan"
                                    >
                                      <Pencil size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </LongPressWrapper>
                        </td>
                      {MONTHS.map(month => {
                        const isVerified = member.months?.[month] === true;
                        // Provide fallback detail for manual/verified records missing detail map in database
                        const detail = member.paymentDetails?.[month] || (isVerified ? { method: 'Manual', status: 'verified', date: member.updatedAt || member.createdAt || new Date() } : null);
                        const isPending = detail?.status === 'pending';
                        const isFailed = detail?.status === 'failed';
                        const isSelectedCol = filterMonth === month;
                        const isClickable = true;
                        const statusText = isVerified ? 'Lunas' : isPending ? 'Pending' : isFailed ? 'Batal' : 'Belum Bayar';
                        
                        return (
                          <td 
                            key={month} 
                            onClick={() => {
                              setActiveDetail({
                                memberId: member.id,
                                memberName: member.name,
                                month,
                                data: detail || { status: 'unpaid', method: '-', date: null }
                              });
                            }}
                            className={`px-1 py-1 relative group/td transition-colors duration-200 cursor-pointer hover:bg-blue-50/70 ${
                              isSelectedCol ? 'bg-blue-50/15 border-x border-blue-100/30' : ''
                            }`}
                            title={`Rincian Pembayaran Bulan ${month}: ${statusText}`}
                          >
                            <div className="flex justify-center relative">
                              <div 
                                className={`w-6 h-6 rounded-none flex items-center justify-center border-2 transition-all ${
                                  isVerified 
                                    ? 'bg-green-500 border-green-500 text-white shadow-sm hover:scale-110 active:scale-95' 
                                    : isPending 
                                      ? 'bg-amber-50 border-amber-200 text-amber-500 animate-pulse hover:border-amber-400 hover:scale-110 active:scale-95' 
                                      : 'bg-gray-50 border-gray-200 text-gray-300 hover:border-gray-300 hover:scale-110 active:scale-95'
                                }`}
                              >
                                {isVerified && <Check size={12} strokeWidth={4} />}
                                {isPending && <Clock size={10} strokeWidth={3} />}
                              </div>

                              {/* Hover Tooltip/Popup */}
                              {isClickable && detail && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/td:block z-30 w-52 bg-slate-900 text-white p-3 rounded-2xl text-left shadow-xl border border-slate-800 pointer-events-none">
                                  <div className="space-y-1 text-[11px]">
                                    <div className="flex justify-between items-center border-b border-slate-800 pb-1.5 mb-1.5">
                                      <span className="font-black text-[10px] tracking-wider uppercase text-blue-400">{month}</span>
                                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                        detail.status === 'verified' 
                                          ? 'bg-green-500/20 text-green-400' 
                                          : detail.status === 'failed'
                                            ? 'bg-red-500/20 text-red-400'
                                            : 'bg-amber-500/20 text-amber-400'
                                      }`}>
                                        {detail.status === 'verified' ? 'LUNAS' : detail.status === 'failed' ? 'GAGAL' : 'PENDING'}
                                      </span>
                                    </div>
                                    <p className="font-bold flex justify-between">
                                      <span className="text-slate-400">Metode:</span>
                                      <span className="text-white">{detail.method || 'Tunai'}</span>
                                    </p>
                                    {detail.bank && (
                                      <p className="font-semibold flex justify-between">
                                        <span className="text-slate-400">Bank:</span>
                                        <span className="text-white">{detail.bank}</span>
                                      </p>
                                    )}
                                    <p className="font-semibold flex flex-col pt-1 border-t border-slate-800/50">
                                      <span className="text-[9px] text-slate-400 uppercase tracking-widest">Waktu Bayar:</span>
                                      <span className="text-white text-[10px] leading-normal">{formatDate(detail.date)}</span>
                                    </p>
                                    {detail.adminName && (
                                      <p className="font-semibold flex flex-col pt-1 border-t border-slate-800/50">
                                        <span className="text-[9px] text-slate-400 uppercase tracking-widest">Admin Verifikasi:</span>
                                        <span className="text-white text-[10px] leading-normal">{detail.adminName}</span>
                                      </p>
                                    )}
                                  </div>
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-900" />
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-1 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            paidCount === MONTHS.length
                              ? 'bg-green-100 text-green-700'
                              : paidCount > 0
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-400'
                          }`}>
                            {paidCount}/{MONTHS.length}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-1 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setPaymentModal({ id: member.id, name: member.name, months: member.months as Record<string, boolean> });
                              setShowMethodSelect(false);
                              
                              // Find the first month that is not paid and not pending
                              const firstUnpaid = MONTHS.find(month => {
                                const isVerified = member.months?.[month] === true;
                                const isPending = member.paymentDetails?.[month]?.status === 'pending';
                                return !isVerified && !isPending;
                              }) || MONTHS[new Date().getMonth()];
                              
                              setSelectedMonths(firstUnpaid ? [firstUnpaid] : []);
                            }}
                            className={`relative group/btn inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold transition-all duration-300 shadow-xs overflow-hidden ${
                              hasPending
                                ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-100'
                                : paidCount === MONTHS.length
                                  ? 'bg-green-50 text-green-600 border border-green-100 hover:bg-green-100'
                                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100'
                            }`}
                          >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
                            <div className="relative flex items-center gap-2">
                               {hasPending ? <Clock size={14} className="animate-spin-slow" /> : <Banknote size={14} />}
                               <span>{hasPending ? 'Verifikasi / Bayar' : 'Bayar'}</span>
                            </div>
                            {hasPending && (
                              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-amber-500 animate-ping" />
                            )}
                          </button>


                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {filteredMembers.length === 0 && !loading && (
                <tr>
                  <td colSpan={15} className="px-6 py-20 text-center text-gray-400 italic">
                    Belum ada data anggota.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Payment Modal */}
      <AnimatePresence>
        {paymentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClosePaymentModal}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`relative w-full ${(showQRIS || showBankSelect || showEWalletSelect) ? 'max-w-lg min-h-[740px] md:min-h-[820px]' : 'max-w-md min-h-[600px]'} bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col transition-all duration-300`}
            >
              <div className="p-6 overflow-y-auto flex-1">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{paymentModal.name}</h2>
                    <p className="text-gray-500 text-xs font-medium">Rekaman Pembayaran Iuran</p>
                  </div>
                  <button 
                    onClick={handleClosePaymentModal}
                    className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <Check className="rotate-45" size={20} />
                  </button>
                </div>

                {!showMethodSelect ? (
                  <div className="space-y-4">
                    {/* Pending Verification Section */}
                    {(() => {
                      const currentMember = members.find(m => m.id === paymentModal.id);
                      if (!currentMember?.paymentDetails) return null;
                      
                      const pendingPayments = Object.entries(currentMember.paymentDetails)
                        .filter(([_, data]: [string, any]) => data.status === 'pending');
                        
                      if (pendingPayments.length === 0) return null;

                      return (
                        <div className="space-y-3">
                          <h3 className="text-xs font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2">
                            <Clock size={12} /> Perlu Verifikasi
                          </h3>
                          <div className="space-y-2">
                            {pendingPayments.map(([month, data]: [string, any]) => (
                                <div key={month} className="flex items-center justify-between p-3 bg-amber-50 rounded-2xl border border-amber-100 group">
                                  <div>
                                    <p className="text-xs font-bold text-amber-900">{month}</p>
                                    <p className="text-[10px] text-amber-600 font-medium">via {data.method}</p>
                                  </div>
                                  <button
                                    onClick={() => verifyPayment(paymentModal.id, month)}
                                    className="px-3 py-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-lg shadow-sm hover:bg-amber-600 transition-all active:scale-95"
                                  >
                                    Verifikasi
                                  </button>
                                </div>
                              ))}
                          </div>
                          <div className="border-t border-gray-100 my-4" />
                        </div>
                      );
                    })()}

                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pilih Bulan Pembayaran Baru</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {MONTHS.map(month => {
                        const isVerified = paymentModal.months?.[month] === true;
                        const isPending = members.find(m => m.id === paymentModal.id)?.paymentDetails?.[month]?.status === 'pending';
                        const isSelected = selectedMonths.includes(month);
                        
                        return (
                          <button
                            key={month}
                            onClick={() => {
                              if (isVerified || isPending) return;
                              setSelectedMonths(prev => 
                                prev.includes(month) 
                                  ? prev.filter(m => m !== month) 
                                  : [...prev, month]
                              );
                            }}
                            className={`py-3 rounded-xl text-xs font-bold transition-all border ${
                              isVerified
                                ? 'bg-green-50 text-green-600 border-green-100 opacity-50 cursor-not-allowed'
                                : isPending
                                  ? 'bg-amber-50 text-amber-600 border-amber-100 opacity-70 cursor-not-allowed'
                                  : isSelected
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100 scale-105'
                                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-transparent'
                            }`}
                            disabled={isVerified || isPending}
                          >
                            {month}
                          </button>
                        );
                      })}
                    </div>

                    <div className="pt-4 space-y-3">
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Bulan yang dibayar:</p>
                        <p className="text-xs font-bold text-blue-600">
                          {selectedMonths.length > 0 ? selectedMonths.join(', ') : '-'}
                        </p>
                      </div>
                      <div className="flex items-center justify-between px-2 text-sm">
                        <span className="text-gray-500 font-medium">{selectedMonths.length} Bulan terpilih</span>
                        <span className="text-gray-900 font-bold">Rp {(selectedMonths.length * TARIFF_PER_MONTH).toLocaleString('id-ID')}</span>
                      </div>
                      <button
                        onClick={() => setShowMethodSelect(true)}
                        disabled={selectedMonths.length === 0}
                        className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all text-sm"
                      >
                        Lanjutkan Pembayaran
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <button 
                        onClick={() => setShowMethodSelect(false)}
                        className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1"
                      >
                        &larr; Kembali ke Bulan
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">
                          Total: Rp {(selectedMonths.length * TARIFF_PER_MONTH).toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Metode Pembayaran</h3>
                      <div className="grid grid-cols-1 gap-2">
                        {PAYMENT_METHODS.map((method) => (
                          <button
                            key={method.id}
                            onClick={() => {
                              if (method.id === 'cash') {
                                setPendingPaymentMethod(method.label);
                                setShowAdminVerification(true);
                              } else {
                                recordPayment(paymentModal.id, method.label);
                              }
                            }}
                            className="w-full text-left px-5 py-4 rounded-2xl text-sm font-bold hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center justify-between border border-gray-100 hover:border-blue-200 group shadow-sm bg-white"
                          >
                            <span className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${method.color}`} />
                              {method.label}
                            </span>
                            <Check size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Admin Verification Overlay */}
              <AnimatePresence>
                {showAdminVerification && (
                  <motion.div
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    className="absolute inset-0 z-50 bg-white p-6 flex flex-col overflow-y-auto"
                  >
                    <div className="flex items-center justify-between mb-8 shrink-0">
                      <h3 className="text-lg font-bold text-gray-900">Verifikasi Admin</h3>
                      <button 
                        onClick={() => {
                          setShowAdminVerification(false);
                          setAdminError('');
                          setAdminPin('');
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        Batal
                      </button>
                    </div>

                    <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                      <div className={`${pendingVerification ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'} p-4 rounded-2xl border mb-4`}>
                        <div className={`flex justify-between text-xs font-bold ${pendingVerification ? 'text-blue-900' : 'text-orange-900'} mb-1`}>
                          <span className="uppercase">
                            VERIFIKASI {pendingVerification?.method || pendingPaymentMethod || 'PEMBAYARAN'}
                          </span>
                          <span>{pendingVerification ? '1 Bulan' : `${selectedMonths.length} Bulan`}</span>
                        </div>
                        <div className={`text-lg font-black ${pendingVerification ? 'text-blue-600' : 'text-orange-600'} mb-2`}>
                          Rp {(pendingVerification ? TARIFF_PER_MONTH : selectedMonths.length * TARIFF_PER_MONTH).toLocaleString('id-ID')}
                        </div>
                        <div className={`pt-2 border-t ${pendingVerification ? 'border-blue-100' : 'border-orange-100'}`}>
                          <p className={`text-[10px] font-bold ${pendingVerification ? 'text-blue-400' : 'text-orange-400'} uppercase tracking-widest mb-1`}>Detail:</p>
                          <p className={`text-xs font-bold ${pendingVerification ? 'text-blue-700' : 'text-orange-700'}`}>
                            {pendingVerification ? `${pendingVerification.name} - ${pendingVerification.month}` : selectedMonths.join(', ')}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-left">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Nama Admin</label>
                        <select
                          value={adminName}
                          onChange={(e) => {
                            setAdminName(e.target.value);
                            setAdminError('');
                          }}
                          className="w-full px-4 py-3 rounded-xl border border-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm font-bold bg-white text-gray-800"
                        >
                          <option value="">-- Pilih Pengelola --</option>
                          {adminsList.map((a) => (
                            <option key={a.id} value={a.name}>
                              {a.name} {a.email ? `(${a.email})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5 text-left">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">PIN Admin</label>
                        <input
                          type="password"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={4}
                          value={adminPin}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setAdminPin(val);
                            setAdminError('');
                            if (val.length === 4) {
                              handleAdminVerify(val);
                            }
                          }}
                          className="w-full px-4 py-3 rounded-xl border border-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm font-medium tracking-[0.5em] text-center"
                          placeholder="••••"
                        />
                      </div>

                      {adminError && (
                        <motion.p 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="text-xs font-bold text-red-500 text-center"
                        >
                          {adminError}
                        </motion.p>
                      )}
                    </div>

                      <button
                        onClick={handleAdminVerify}
                        disabled={isRecordingPayment}
                        className={`w-full py-4 ${pendingVerification ? 'bg-blue-600 shadow-blue-100' : 'bg-orange-600 shadow-orange-100'} text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all mt-auto flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isRecordingPayment ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Memproses...</span>
                          </>
                        ) : (
                          pendingVerification ? 'Konfirmasi Verifikasi' : 'Konfirmasi Tunai'
                        )}
                      </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* QRIS Popup Overlay */}
              <AnimatePresence>
                {showQRIS && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="absolute inset-0 z-50 bg-white p-6 flex flex-col items-center justify-start space-y-5 overflow-y-auto pb-10"
                  >
                    <div className="text-center pt-2 shrink-0">
                      <h3 className="text-xl font-bold text-gray-900">Pembayaran QRIS</h3>
                      <p className="text-gray-500 text-xs mt-1">Silakan scan kode QR di bawah ini</p>
                    </div>
                    
                    <div className="w-72 h-72 sm:w-80 sm:h-80 bg-white rounded-2xl border-4 border-gray-100 p-2 flex items-center justify-center relative overflow-hidden group shadow-md shadow-gray-100/50 shrink-0">
                      <img 
                        src={
                          qrisImage && qrisImage.trim().startsWith('data:image/')
                            ? qrisImage
                            : `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(
                                generateDynamicQRIS(qrisText, selectedMonths.length * TARIFF_PER_MONTH)
                              )}`
                        } 
                        alt="QRIS Code"
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/5 transition-colors pointer-events-none" />
                    </div>

                    <div className="w-full space-y-2">
                       <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                         <div className="flex justify-between text-xs font-bold text-blue-900 mb-2">
                           <span>TOTAL TAGIHAN</span>
                           <span>{selectedMonths.length} Bulan</span>
                         </div>
                         <div className="text-2xl font-black text-blue-600 mb-2">
                           Rp {(selectedMonths.length * TARIFF_PER_MONTH).toLocaleString('id-ID')}
                         </div>
                         <div className="pt-2 border-t border-blue-100">
                           <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Bulan:</p>
                           <p className="text-xs font-bold text-blue-700">{selectedMonths.join(', ')}</p>
                         </div>
                       </div>
                    </div>

                    <div className="flex flex-col w-full gap-2.5">
                      <button
                        onClick={() => recordPayment(paymentModal.id, 'QRIS', false, true)}
                        className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all text-sm"
                      >
                        Saya Sudah Bayar
                      </button>
                      <button
                        onClick={() => {
                          setShowQRIS(false);
                          setShowQrisUploader(false);
                          setTempQrisFile(null);
                          setQrisUploadPin('');
                        }}
                        className="w-full py-2.5 text-gray-400 font-bold hover:text-gray-600 transition-all text-xs"
                      >
                        Kembali
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bank Selection Overlay */}
              <AnimatePresence>
                {showBankSelect && (
                  <motion.div
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    className="absolute inset-0 z-50 bg-white p-6 flex flex-col overflow-y-auto"
                  >
                    {!selectedBank ? (
                      <div className="flex flex-col min-h-full">
                        <div className="flex items-center justify-between mb-8 shrink-0">
                          <h3 className="text-lg font-bold text-gray-900">Pilih Bank Transfer</h3>
                          <button 
                            onClick={() => setShowBankSelect(false)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Batal
                          </button>
                        </div>

                        <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                          {activeBanks.map((bank) => (
                            <button
                              key={bank.id}
                              disabled={bank.comingSoon}
                              onClick={() => !bank.comingSoon && setSelectedBank(bank)}
                              className={`w-full text-left px-5 py-4 rounded-2xl text-sm font-bold transition-all flex items-center justify-between border group shadow-sm bg-white ${
                                bank.comingSoon 
                                  ? 'opacity-50 cursor-not-allowed border-gray-100' 
                                  : 'hover:bg-gray-50 border-gray-100 active:scale-98'
                              }`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl ${bank.color} flex items-center justify-center text-white text-[10px] font-black`}>
                                  {bank.name}
                                </div>
                                <div className="text-left">
                                  <p className="text-gray-900">{bank.name}</p>
                                  <p className="text-[10px] text-gray-400 font-medium">
                                    {bank.comingSoon ? 'Segera hadir (Coming Soon)' : 'Klik untuk lihat rekening'}
                                  </p>
                                </div>
                              </div>
                              {!bank.comingSoon ? (
                                <Check size={16} className="text-blue-600 opacity-0 group-hover:opacity-100" />
                              ) : (
                                <span className="text-[9px] font-extrabold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100/50 tracking-wider">COMING SOON</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col h-full">
                        <div className="flex items-center justify-between mb-8">
                          <h3 className="text-lg font-bold text-gray-900">Detail Rekening</h3>
                          <button 
                            onClick={() => setSelectedBank(null)}
                            className="text-xs text-blue-600 font-bold hover:underline"
                          >
                            Ubah Bank
                          </button>
                        </div>

                        <div className="flex-1 space-y-6 overflow-y-auto pr-1">
                          <div className={`p-6 rounded-3xl ${selectedBank.color} text-white shadow-xl relative overflow-hidden`}>
                            <div className="relative z-10">
                              <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest mb-1">Nama Bank</p>
                              <p className="text-lg font-black mb-4">{selectedBank.name}</p>
                              
                              <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest mb-1">Nomor Rekening</p>
                              <p className="text-2xl font-mono font-bold tracking-wider mb-4">{selectedBank.number}</p>

                              <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest mb-1">Atas Nama</p>
                              <p className="text-sm font-bold">{selectedBank.holder}</p>
                            </div>
                            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                          </div>

                          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                             <div className="flex justify-between text-xs font-bold text-blue-900 mb-2">
                               <span>TOTAL TRANSFER</span>
                               <span>{selectedMonths.length} Bulan</span>
                             </div>
                             <div className="text-2xl font-black text-blue-600">
                               Rp {(selectedMonths.length * TARIFF_PER_MONTH).toLocaleString('id-ID')}
                             </div>
                             <p className="text-[10px] text-blue-400 font-bold mt-2 uppercase">Bulan: {selectedMonths.join(', ')}</p>
                          </div>
                        </div>

                        <div className="mt-auto space-y-3">
                          <button
                            onClick={() => recordPayment(paymentModal!.id, 'Transfer', false, false, selectedBank)}
                            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all"
                          >
                            Saya Sudah Transfer
                          </button>
                          <button
                            onClick={() => setShowBankSelect(false)}
                            className="w-full py-2 text-gray-400 font-bold hover:text-gray-600 transition-all text-xs"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* E-Wallet Selection Overlay */}
              <AnimatePresence>
                {showEWalletSelect && (
                  <motion.div
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    className="absolute inset-0 z-50 bg-white p-6 flex flex-col overflow-y-auto"
                  >
                    {!selectedEWallet ? (
                      <div className="flex flex-col min-h-full">
                        <div className="flex items-center justify-between mb-8 shrink-0">
                          <h3 className="text-lg font-bold text-gray-900">Pilih E-Wallet</h3>
                          <button 
                            onClick={() => setShowEWalletSelect(false)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Batal
                          </button>
                        </div>

                        <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                          {activeEWallets.map((ewallet) => (
                            <button
                              key={ewallet.id}
                              onClick={() => setSelectedEWallet(ewallet)}
                              className="w-full text-left px-5 py-4 rounded-2xl text-sm font-bold transition-all flex items-center justify-between border border-gray-100 group shadow-sm bg-white hover:bg-gray-50 active:scale-98"
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl ${ewallet.color} flex items-center justify-center text-white text-[14px] font-black`}>
                                  {ewallet.iconText}
                                </div>
                                <div className="text-left">
                                  <p className="text-gray-900">{ewallet.name}</p>
                                  <p className="text-[10px] text-gray-400 font-medium">Klik untuk detail E-Wallet</p>
                                </div>
                              </div>
                              <Check size={16} className="text-blue-600 opacity-0 group-hover:opacity-100" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col h-full">
                        <div className="flex items-center justify-between mb-8">
                          <h3 className="text-lg font-bold text-gray-900">Detail E-Wallet</h3>
                          <button 
                            onClick={() => setSelectedEWallet(null)}
                            className="text-xs text-blue-600 font-bold hover:underline"
                          >
                            Ubah E-Wallet
                          </button>
                        </div>

                        <div className="flex-1 space-y-6 overflow-y-auto pr-1">
                          <div className={`p-6 rounded-3xl ${selectedEWallet.color} text-white shadow-xl relative overflow-hidden`}>
                            <div className="relative z-10">
                              <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest mb-1">Metode E-Wallet</p>
                              <p className="text-lg font-black mb-4">{selectedEWallet.name}</p>
                              
                              <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest mb-1">Nomor Akun / HP</p>
                              <p className="text-sm font-mono font-bold tracking-wider mb-4 leading-normal bg-white/10 px-3 py-2 rounded-xl border border-white/10">{selectedEWallet.number}</p>

                              <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest mb-1">Atas Nama</p>
                              <p className="text-sm font-bold">{selectedEWallet.holder}</p>
                            </div>
                            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                          </div>

                          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                             <div className="flex justify-between text-xs font-bold text-blue-900 mb-2">
                               <span>TOTAL TRANSFER</span>
                               <span>{selectedMonths.length} Bulan</span>
                             </div>
                             <div className="text-2xl font-black text-blue-600">
                               Rp {(selectedMonths.length * TARIFF_PER_MONTH).toLocaleString('id-ID')}
                             </div>
                             <p className="text-[10px] text-blue-400 font-bold mt-2 uppercase">Bulan: {selectedMonths.join(', ')}</p>
                          </div>
                        </div>

                        <div className="mt-auto space-y-3">
                          <button
                            onClick={() => {
                              if (selectedEWallet) {
                                const url = selectedEWallet.appUrl || selectedEWallet.fallbackUrl;
                                if (url) {
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.target = '_blank';
                                  link.rel = 'noopener noreferrer';
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                }
                              }
                              recordPayment(paymentModal!.id, 'E-Wallet', false, false, selectedEWallet);
                            }}
                            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all text-sm flex items-center justify-center gap-2"
                          >
                            Bayar &amp; Buka Aplikasi {selectedEWallet.name}
                          </button>
                          <button
                            onClick={() => setShowEWalletSelect(false)}
                            className="w-full py-2 text-gray-400 font-bold hover:text-gray-600 transition-all text-xs"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Details info modal (onClick month indicator) */}
      <AnimatePresence>
        {activeDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveDetail(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900">{activeDetail.memberName}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Detail Pembayaran Bulan {activeDetail.month}</p>
                </div>
                <button
                  onClick={() => setActiveDetail(null)}
                  className="p-1 px-2.5 bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-xs font-bold rounded-lg transition-colors"
                >
                  Tutup
                </button>
              </div>

              <div className="space-y-3.5">
                <div className="flex justify-between items-center bg-gray-50 p-3 rounded-2xl border border-gray-100/50">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Status</span>
                  <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg ${
                    activeDetail.data.status === 'verified' 
                      ? 'bg-green-100 text-green-700' 
                      : activeDetail.data.status === 'failed'
                        ? 'bg-red-100 text-red-700 border border-red-200'
                        : activeDetail.data.status === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                  }`}>
                    {activeDetail.data.status === 'verified' 
                      ? 'LUNAS' 
                      : activeDetail.data.status === 'failed' 
                        ? 'GAGAL / REJECTED' 
                        : activeDetail.data.status === 'pending'
                          ? 'PENDING VERIFIKASI'
                          : 'BELUM BAYAR'}
                  </span>
                </div>

                {activeDetail.data.status === 'unpaid' ? (
                  <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/30 text-xs font-semibold text-blue-800 leading-relaxed text-left">
                    Anggota ini <strong className="text-blue-900">Belum Bayar</strong> untuk bulan {activeDetail.month}. Silakan klik tombol <strong className="text-blue-900">"Bayar/Verifikasi"</strong> di kolom aksi paling kanan untuk mencatatkan pembayaran baru.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm py-1 border-b border-gray-50">
                      <span className="text-gray-400 font-medium">Metode Pembayaran</span>
                      <span className="text-gray-900 font-bold">{activeDetail.data.method || 'Tunai'}</span>
                    </div>
                    {activeDetail.data.bank && (
                      <div className="flex justify-between text-sm py-1 border-b border-gray-50">
                        <span className="text-gray-400 font-medium">Bank Transfer</span>
                        <span className="text-gray-900 font-bold">{activeDetail.data.bank}</span>
                      </div>
                    )}
                    <div className="flex flex-col py-1.5 border-b border-gray-50">
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Waktu Pembayaran</span>
                      <span className="text-gray-900 font-bold text-sm">{formatDate(activeDetail.data.date)}</span>
                    </div>
                    {activeDetail.data.adminName && (
                      <div className="flex flex-col py-1.5 border-b border-gray-50">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Diverifikasi Oleh Admin</span>
                        <span className="text-gray-900 font-bold text-sm">{activeDetail.data.adminName}</span>
                      </div>
                    )}
                    {activeDetail.data.verifiedAt && (
                      <div className="flex flex-col py-1.5">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Waktu Verifikasi</span>
                        <span className="text-gray-900 font-bold text-sm">{formatDate(activeDetail.data.verifiedAt)}</span>
                      </div>
                    )}
                  </div>
                )}

                {activeDetail.data.status === 'verified' && (
                  <div className="pt-1 select-none">
                    <button
                      type="button"
                      onClick={() => {
                        const mObj = members.find(m => m.id === activeDetail.memberId);
                        setShowReceipt({
                          id: activeDetail.memberId,
                          memberName: activeDetail.memberName,
                          type: type,
                          months: [activeDetail.month],
                          amount: TARIFF_PER_MONTH,
                          method: activeDetail.data.method || 'Tunai',
                          date: activeDetail.data.date ? (activeDetail.data.date.toDate ? activeDetail.data.date.toDate() : new Date(activeDetail.data.date)) : new Date(),
                          adminName: activeDetail.data.adminName || undefined,
                          bank: activeDetail.data.bank || undefined,
                          memberPhone: mObj?.phone || undefined,
                        });
                        setActiveDetail(null);
                      }}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl shadow-md hover:shadow-lg shadow-emerald-100/50 hover:shadow-emerald-200/50 transition-all text-xs flex items-center justify-center gap-2 active:scale-95"
                    >
                      <Download size={14} className="stroke-[2.5]" />
                      Lihat / Download Struk Pembayaran
                    </button>
                  </div>
                )}

                {['verified', 'pending', 'failed'].includes(activeDetail.data.status) && (
                  <div className="pt-4 border-t border-gray-100 space-y-3">
                    <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Ubah Status Pembayaran</span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleStatusChangeAttempt(activeDetail.memberId, activeDetail.month, 'verified')}
                        disabled={activeDetail.data.status === 'verified'}
                        className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl border text-[11px] font-bold transition-all ${
                          activeDetail.data.status === 'verified'
                            ? 'bg-green-500 border-green-500 text-white shadow-lg shadow-green-100 pointer-events-none cursor-default'
                            : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Check size={14} className="mb-1" />
                        Lunas
                      </button>
                      
                      <button
                        onClick={() => handleStatusChangeAttempt(activeDetail.memberId, activeDetail.month, 'pending')}
                        disabled={activeDetail.data.status === 'pending'}
                        className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl border text-[11px] font-bold transition-all ${
                          activeDetail.data.status === 'pending'
                            ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-100 font-black pointer-events-none cursor-default'
                            : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50 hover:border-amber-200'
                        }`}
                      >
                        <Clock size={14} className="mb-1" />
                        Pending
                      </button>

                      <button
                        onClick={() => handleStatusChangeAttempt(activeDetail.memberId, activeDetail.month, 'unpaid')}
                        disabled={activeDetail.data.status === 'unpaid'}
                        className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl border text-[11px] font-bold transition-all ${
                          activeDetail.data.status === 'unpaid'
                            ? 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-100 font-black pointer-events-none cursor-default'
                            : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50 hover:border-red-200'
                        }`}
                      >
                        <X size={14} className="mb-1" />
                        Belum Bayar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detailed Member Delete Confirmation Dialog */}
      <AnimatePresence>
        {memberToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMemberToDelete(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 overflow-hidden z-10 border border-red-100"
            >
              <div className="flex items-center gap-3 text-red-600 mb-4">
                <div className="p-2 bg-red-100 rounded-full">
                  <Trash2 size={24} />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-black text-gray-900 leading-tight">Hapus Anggota?</h3>
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-0.5">Tindakan Sangat Berbahaya</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-red-50/50 p-4 rounded-2xl border border-red-100/30 text-sm font-medium text-gray-600 leading-relaxed text-left">
                  Apakah Anda yakin ingin menghapus <span className="font-extrabold text-red-700">{memberToDelete.name}</span> dari daftar? Semua rekaman kehadiran dan iuran untuk anggota ini akan dihapus secara permanen dari sistem dan tidak dapat dikembalikan.
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block text-left">
                    Ketik <span className="font-black text-red-600">DELETE</span> untuk mengonfirmasi
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Ketik DELETE..."
                    className="w-full px-5 py-3.5 rounded-2xl border border-gray-100 focus:ring-4 focus:ring-red-100 focus:border-red-500 bg-red-50/10 outline-none transition-all text-sm font-bold placeholder-gray-300 text-red-600 uppercase"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && deleteConfirmText === 'DELETE') {
                        deleteMember(memberToDelete.id);
                      }
                    }}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setMemberToDelete(null)}
                    className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 font-bold rounded-2xl transition-all text-sm active:scale-95"
                  >
                    Batal
                  </button>
                  <button
                    disabled={deleteConfirmText !== 'DELETE'}
                    onClick={() => deleteMember(memberToDelete.id)}
                    className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 disabled:bg-red-200 text-white font-bold rounded-2xl transition-all text-sm active:scale-95 shadow-lg disabled:shadow-none shadow-red-100 flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} />
                    Hapus
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Long Press Choice Menu Popup */}
      <AnimatePresence>
        {activeLongPressMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveLongPressMember(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 overflow-hidden z-10 border border-gray-100"
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Pencil size={20} className="stroke-[2.5]" />
                </div>
                <h3 className="text-lg font-black text-gray-900 leading-tight">Pilihan Aksi</h3>
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1">{activeLongPressMember.name}</p>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    const mObj = members.find(m => m.id === activeLongPressMember.id);
                    setEditingMemberId(activeLongPressMember.id);
                    setEditingName(activeLongPressMember.name);
                    setEditingPhone(mObj?.phone || '');
                    setActiveLongPressMember(null);
                    setLongPressError(null);
                  }}
                  className="w-full py-4 bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold rounded-2xl transition-all text-sm active:scale-95 flex items-center justify-center gap-2 border border-blue-100/50"
                >
                  <Pencil size={18} />
                  Ubah Data Anggota
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const isSuper = localStorage.getItem('ADMIN_ROLE') === 'super-admin';
                    if (isSuper) {
                      setMemberToDelete({ id: activeLongPressMember.id, name: activeLongPressMember.name });
                      setDeleteConfirmText('');
                      setActiveLongPressMember(null);
                      setLongPressError(null);
                    } else {
                      setLongPressError('Hanya Super Admin yang diizinkan untuk menghapus anggota!');
                    }
                  }}
                  className="w-full py-4 bg-red-50 hover:bg-red-100 text-red-600 font-extrabold rounded-2xl transition-all text-sm active:scale-95 flex items-center justify-center gap-2 border border-red-100/50"
                >
                  <Trash2 size={18} />
                  Hapus Anggota
                </button>

                {longPressError && (
                  <motion.p 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs font-bold text-red-500 mt-2 text-center bg-red-50 p-3 rounded-xl border border-red-100/50"
                  >
                    {longPressError}
                  </motion.p>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setActiveLongPressMember(null);
                    setLongPressError(null);
                  }}
                  className="w-full py-3 text-gray-400 font-bold hover:text-gray-600 transition-all text-xs"
                >
                  Batal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Admin Verification Modal for Edit & Delete */}
      <AnimatePresence>
        {showGlobalAdminVerify && adminTargetAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowGlobalAdminVerify(false);
                setAdminTargetAction(null);
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 overflow-hidden z-10 border border-gray-100"
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
                <div className={`p-4 rounded-2xl border text-sm font-medium leading-relaxed text-left ${
                  adminTargetAction.type === 'delete_member'
                    ? 'bg-red-50/70 border-red-100 text-gray-600'
                    : 'bg-blue-50/70 border-blue-100 text-gray-600'
                }`}>
                  {adminTargetAction.type === 'delete_member' ? (
                    <span>
                      Tindakan: <span className="font-extrabold text-red-700">Hapus {adminTargetAction.name}</span>. Diperlukan verifikasi admin untuk melanjutkan proses penghapusan permanen.
                    </span>
                  ) : (
                    <span>
                      Tindakan: <span className="font-extrabold text-blue-700">Ubah Nama {adminTargetAction.name}</span>. Diperlukan verifikasi admin sebelum mengubah data anggota.
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1">
                    Nama Admin
                  </label>
                  <select
                    value={adminName}
                    onChange={(e) => {
                      setAdminName(e.target.value);
                      setAdminError('');
                    }}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold bg-white text-gray-800"
                  >
                    <option value="">-- Pilih Pengelola --</option>
                    {adminsList.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name} {a.email ? `(${a.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1">
                    PIN Admin
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={adminPin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setAdminPin(val);
                      setAdminError('');
                      if (val.length === 4) {
                        handleGlobalAdminVerify(val);
                      }
                    }}
                    placeholder="••••"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleGlobalAdminVerify();
                      }
                    }}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold text-center tracking-[0.5em]"
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
                    onClick={handleGlobalAdminVerify}
                    className={`w-full py-4 text-white font-bold rounded-2xl shadow-lg transition-all text-sm active:scale-95 ${
                      adminTargetAction.type === 'delete_member'
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
      </div>

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
                  <span className="font-bold text-gray-900">
                    TRX-{showReceipt.months[0]?.toUpperCase() || 'PAY'}-{showReceipt.id?.slice(0, 5).toUpperCase()}-{Math.floor((showReceipt.date instanceof Date ? showReceipt.date.getTime() : (showReceipt.date?.seconds ? showReceipt.date.seconds * 1000 : Date.now())) / 360000 % 100000)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">TANGGAL:</span>
                  <span className="font-bold text-gray-900">
                    {showReceipt.date ? (
                      showReceipt.date instanceof Date 
                        ? showReceipt.date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : formatDate(showReceipt.date)
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
                      <span className="text-gray-700 font-semibold font-sans">Iuran Bulanan ({m})</span>
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

      {/* POPUP UNTUK EDIT DATA ANGGOTA */}
      <AnimatePresence>
        {editingMemberId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setEditingMemberId(null);
                setEditingName('');
                setEditingPhone('');
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 overflow-hidden z-10 border border-gray-100"
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Pencil size={20} className="stroke-[2.5]" />
                </div>
                <h3 className="text-lg font-black text-gray-900 leading-tight">Edit Data Anggota</h3>
                <p className="text-sm text-gray-500 font-semibold tracking-wide mt-1">Ubah atau lengkapi informasi anggota</p>
              </div>

              <div className="space-y-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1 font-mono">
                    Nama Anggota
                  </label>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    placeholder="Contoh: Muhammad Ali"
                    className="w-full bg-slate-50 border border-slate-100 focus:border-slate-300 px-4 py-3 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-slate-100 outline-none transition-all"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1 font-mono">
                    Nomor WhatsApp / HP
                  </label>
                  <input
                    type="tel"
                    value={editingPhone}
                    onChange={(e) => setEditingPhone(e.target.value)}
                    placeholder="Contoh: 08123456789"
                    className="w-full bg-slate-50 border border-slate-100 focus:border-slate-300 px-4 py-3 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-slate-100 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1 font-mono">
                    Kategori (Jabatan)
                  </label>
                  <select
                    value={editingType}
                    onChange={(e) => setEditingType(e.target.value as 'driver' | 'helper')}
                    className="w-full bg-slate-50 border border-slate-100 focus:border-slate-300 px-4 py-3.5 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-slate-100 outline-none transition-all cursor-pointer text-gray-800"
                  >
                    <option value="driver">Driver</option>
                    <option value="helper">Helper</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMemberId(null);
                      setEditingName('');
                      setEditingPhone('');
                    }}
                    className="flex-1 py-3 text-gray-500 bg-gray-50 hover:bg-gray-100 font-bold rounded-2xl transition-all text-xs active:scale-95"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateMemberDetails(editingMemberId);
                    }}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl transition-all text-xs active:scale-95 shadow-lg shadow-blue-100/40"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Super Admin Status Change Custom Confirmation Modal */}
      <AnimatePresence>
        {showStatusConfirm && statusConfirmTarget && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowStatusConfirm(false);
                setStatusConfirmTarget(null);
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm shadow-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 overflow-hidden border border-gray-100/50 z-10"
            >
              <div className="flex flex-col space-y-4 text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Check size={20} className="stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Konfirmasi Ubah Status</h3>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-0.5">Otorisasi Super Admin</p>
                  </div>
                </div>

                <div className="bg-blue-50/50 border border-blue-100/30 p-4 rounded-2xl text-xs font-semibold text-blue-800 leading-normal">
                  Apakah Anda yakin ingin mengubah status pembayaran bulan <strong className="text-blue-900">{statusConfirmTarget.month}</strong> menjadi <strong className="text-blue-900 uppercase">{statusConfirmTarget.newStatus === 'verified' ? 'Lunas' : statusConfirmTarget.newStatus === 'pending' ? 'Pending' : 'Belum Bayar'}</strong>?
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowStatusConfirm(false);
                      setStatusConfirmTarget(null);
                    }}
                    className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 text-gray-500 font-extrabold rounded-2xl transition-all text-xs active:scale-95 border border-gray-100"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const target = statusConfirmTarget;
                      setShowStatusConfirm(false);
                      setStatusConfirmTarget(null);
                      if (target) {
                        await updatePaymentStatus(target.memberId, target.month, target.newStatus);
                      }
                    }}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl transition-all text-xs active:scale-95 shadow-lg shadow-blue-105"
                  >
                    Ya, Ubah
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Status Verification Modal */}
      <AnimatePresence>
        {showStatusVerify && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowStatusVerify(false);
                setStatusVerifyTarget(null);
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm shadow-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 overflow-hidden border border-gray-100/50 z-10"
            >
              <div className="flex flex-col space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Lock size={20} className="stroke-[2.5]" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-gray-900">Ubah Status Pembayaran</h3>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mt-0.5">Otorisasi Admin</p>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100/50 p-4 rounded-2xl text-xs font-semibold text-amber-800 leading-normal text-left">
                  Anda mencoba mengubah status pembayaran bulan <strong className="text-amber-900">{statusVerifyTarget?.month}</strong> menjadi <strong className="text-amber-900 uppercase">{statusVerifyTarget?.newStatus === 'verified' ? 'Lunas' : statusVerifyTarget?.newStatus === 'pending' ? 'Pending' : 'Belum Bayar'}</strong>. Tindakan ini memerlukan otorisasi <strong className="text-amber-900">Admin</strong>.
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Nama Admin</label>
                    <select
                      value={statusVerifyName}
                      onChange={(e) => {
                        setStatusVerifyName(e.target.value);
                        setStatusVerifyError('');
                      }}
                      className="w-full px-4 py-3 rounded-xl border border-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-xs font-bold bg-white text-gray-800"
                    >
                      <option value="">-- Pilih Pengelola --</option>
                      {adminsList.map((a) => (
                        <option key={a.id} value={a.name}>
                          {a.name} {a.email ? `(${a.email})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">PIN Admin</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={statusVerifyPin}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setStatusVerifyPin(val);
                        setStatusVerifyError('');
                        if (val.length === 4) {
                          handleStatusVerifyConfirm(val);
                        }
                      }}
                      className="w-full px-4 py-3 rounded-xl border border-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-xs font-black tracking-[0.5em] text-center"
                      placeholder="••••"
                    />
                  </div>

                  {statusVerifyError && (
                    <motion.p 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-[10px] font-black text-red-500 mt-1 bg-red-50 p-2 rounded-xl text-center border border-red-100/40"
                    >
                      {statusVerifyError}
                    </motion.p>
                  )}
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowStatusVerify(false);
                      setStatusVerifyTarget(null);
                    }}
                    className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 text-gray-500 font-extrabold rounded-2xl transition-all text-xs active:scale-95 border border-gray-100"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleStatusVerifyConfirm}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl transition-all text-xs active:scale-95 shadow-lg shadow-blue-100/40"
                  >
                    Verifikasi
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Action Error Modal */}
      <AnimatePresence>
        {actionError && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActionError(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm shadow-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 overflow-hidden border border-red-100 z-10"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Gagal Memperbarui Ceklis</h3>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed font-semibold">
                    Terjadi kesalahan saat menyimpan perubahan status ceklis ke database. Periksa hak akses Anda atau koneksi internet.
                  </p>
                  {actionError !== 'true' && (
                    <p className="text-[10px] text-red-500 bg-red-50 p-2.5 rounded-xl font-mono mt-3 leading-snug break-all text-left font-bold">
                      {actionError}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-2xl shadow-md transition-all text-xs active:scale-95"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

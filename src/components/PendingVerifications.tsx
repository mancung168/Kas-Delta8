import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  setDoc,
  serverTimestamp, 
  query, 
  orderBy,
  deleteField
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { verifyAdmin } from '../lib/adminService';
import { 
  Check, 
  X, 
  Search, 
  Clock, 
  User, 
  Calendar, 
  CreditCard, 
  ShieldCheck, 
  AlertCircle, 
  Truck, 
  Users,
  ChevronDown,
  ThumbsDown,
  ThumbsUp,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { sendWaNotification } from '../lib/sendWaNotification';

interface Member {
  id: string;
  name: string;
  type: 'driver' | 'helper';
  phone?: string;
  months: Record<string, boolean | string>;
  paymentDetails?: Record<string, { method: string; date: any; status?: string; adminName?: string; verifiedAt?: any }>;
  createdAt: any;
}

interface PendingItem {
  id: string; // memberId + month to have a unique identifier
  memberId: string;
  memberName: string;
  memberType: 'driver' | 'helper';
  month: string;
  method: string;
  date: any;
  bank?: string;
  status: string;
}

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

export default function PendingVerifications() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterMethod, setFilterMethod] = useState<string>('all');
  
  // Admin Authorization flows
  const [adminName, setAdminName] = useState(() => localStorage.getItem('ADMIN_NICKNAME') || '');
  const [adminPin, setAdminPin] = useState('');
  const [adminError, setAdminError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyingItem, setVerifyingItem] = useState<{ item: PendingItem; actionType: 'verify' | 'reject' } | null>(null);

  const TARIFF_PER_MONTH = 25000;
  const ADMIN_PIN = localStorage.getItem('ADMIN_PIN') || '1234';

  useEffect(() => {
    const q = query(
      collection(db, 'members')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const memberData: Member[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as Member;
        memberData.push({ id: doc.id, ...data });
      });
      memberData.sort((a, b) => {
        const dateA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
        const dateB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      setMembers(memberData);
      setLoading(false);
    }, (error: any) => {
      console.error("Firestore error loading members in PendingVerifications:", error);
      setLoading(false);
      if (error?.message?.includes('permission-denied') || error?.message?.includes('permissions') || error?.code === 'permission-denied') {
        window.dispatchEvent(new CustomEvent('firestore-permission-denied'));
      }
      handleFirestoreError(error, OperationType.GET, 'members');
    });

    return () => unsubscribe();
  }, []);

  // Prepare and list all pending payment validations
  const pendingItems: PendingItem[] = [];
  members.forEach(m => {
    if (m.paymentDetails) {
      Object.entries(m.paymentDetails).forEach(([month, detail]: [string, any]) => {
        if (detail && detail.status === 'pending') {
          pendingItems.push({
            id: `${m.id}-${month}`,
            memberId: m.id,
            memberName: m.name,
            memberType: m.type,
            month,
            method: detail.method || 'Tunai',
            date: detail.date,
            bank: detail.bank || undefined,
            status: detail.status
          });
        }
      });
    }
  });

  // Filter pending data items
  const filteredItems = pendingItems.filter(item => {
    const matchesSearch = item.memberName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || item.memberType === filterType;
    const matchesMethod = filterMethod === 'all' || item.method.toLowerCase() === filterMethod.toLowerCase();
    return matchesSearch && matchesType && matchesMethod;
  });

  const handleAdminVerify = async () => {
    if (!verifyingItem || isVerifying) return;

    if (!adminName.trim()) {
      setAdminError('Nama admin tidak boleh kosong');
      return;
    }

    setIsVerifying(true);
    setAdminError('');

    try {
      // Check if admin is Super Admin with hardcoded free-pass
      const isSuperAdmin = ['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase());
      const effectivePin = isSuperAdmin ? '1234' : adminPin;

      const isValid = await verifyAdmin(adminName.trim(), effectivePin);
      if (!isValid) {
        setAdminError('Nama admin atau PIN salah');
        setIsVerifying(false);
        return;
      }

      // Persist ADMIN_NICKNAME
      localStorage.setItem('ADMIN_NICKNAME', adminName.trim());

      const { item, actionType } = verifyingItem;
      const path = `members/${item.memberId}`;

      const memberRef = doc(db, 'members', item.memberId);
      const isVerified = actionType === 'verify';

      const updates: any = isVerified ? {
        [`months.${item.month}`]: true,
        [`paymentDetails.${item.month}.status`]: 'verified',
        [`paymentDetails.${item.month}.adminName`]: adminName.trim(),
        [`paymentDetails.${item.month}.verifiedAt`]: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } : {
        [`months.${item.month}`]: false,
        [`paymentDetails.${item.month}`]: deleteField(),
        updatedAt: serverTimestamp(),
      };

      const memberPromise = updateDoc(memberRef, updates);

      // Log verified/rejected payment to activities collection
      const activityPromise = setDoc(doc(collection(db, 'activities')), {
        action: isVerified ? 'verifikasi_iuran' : 'tolak_iuran',
        details: `[Iuran] ${item.memberType === 'driver' ? 'Driver' : 'Helper'} - ${item.memberName} - ${item.month}/${new Date().getFullYear()} - ${isVerified ? 'LUNAS / VERIFIED' : 'DITOLAK / BELUM BAYAR'}`,
        adminName: adminName.trim(),
        timestamp: serverTimestamp()
      });

      // Race with 1500ms timeout to avoid UI freeze if Firestore network sync response is delayed.
      await Promise.race([
        Promise.all([memberPromise, activityPromise]),
        new Promise((resolve) => setTimeout(resolve, 1500))
      ]);

      // Clean up verification state
      setVerifyingItem(null);
      setAdminPin('');
      setAdminError('');

      // Automatically send WhatsApp payment receipt if transaction is verified
      if (isVerified) {
        const originalMember = members.find(m => m.id === item.memberId);
        if (originalMember && originalMember.phone) {
          const amount = item.memberType === 'driver' ? 25000 : 15000;
          sendWaNotification({
            memberPhone: originalMember.phone,
            memberName: item.memberName,
            memberType: item.memberType,
            months: [item.month],
            amount: amount,
            method: item.method,
            bank: item.bank || undefined,
            adminName: adminName.trim()
          });
        }
      }
    } catch (error) {
      console.error("Verifikasi gagal:", error);
      setAdminError('Terjadi kesalahan sistem, silakan coba lagi');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 pb-12 space-y-6">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            Persetujuan Iuran
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Verifikasi dan setujui bukti pembayaran iuran anggota (Driver &amp; Helper).
          </p>
        </div>

        {/* Counter Widget */}
        <div className="bg-amber-50 border border-amber-100/60 px-5 py-3 rounded-2xl flex items-center gap-3.5 self-start md:self-auto shadow-xs">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-white font-black animate-pulse">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-amber-500 tracking-wider">Menunggu</p>
            <p className="text-sm font-extrabold text-amber-900">{pendingItems.length} Pembayaran</p>
          </div>
        </div>
      </div>

      {/* Control Panel / Search Bar & Filters */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-4 justify-between">
        {/* Search */}
        <div className="flex items-center bg-gray-50 px-4 py-3 rounded-2xl border border-gray-100 flex-1 max-w-md">
          <Search className="text-gray-400 mr-2.5 flex-shrink-0" size={18} />
          <input
            type="text"
            placeholder="Cari nama anggota..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-sm font-bold text-gray-800 placeholder-gray-400 outline-none bg-transparent"
          />
        </div>

        {/* Multi-Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Filter Type */}
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="appearance-none bg-white border border-gray-100 px-4 py-3 pr-10 rounded-2xl text-sm font-bold text-gray-700 shadow-xs focus:border-blue-500 hover:bg-gray-50 transition-all outline-none cursor-pointer"
            >
              <option value="all">Semua Peran</option>
              <option value="driver">Driver</option>
              <option value="helper">Helper</option>
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
          </div>

          {/* Filter Method */}
          <div className="relative">
            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              className="appearance-none bg-white border border-gray-100 px-4 py-3 pr-10 rounded-2xl text-sm font-bold text-gray-700 shadow-xs focus:border-blue-500 hover:bg-gray-50 transition-all outline-none cursor-pointer"
            >
              <option value="all">Semua Metode</option>
              <option value="transfer">Transfer Bank</option>
              <option value="qris">QRIS</option>
              <option value="tunai">Tunai / Cash</option>
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
          </div>

          {/* Reset button only if any is selected */}
          {(searchTerm !== '' || filterType !== 'all' || filterMethod !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterType('all');
                setFilterMethod('all');
              }}
              className="px-4 py-3 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-2xl text-sm font-bold transition-all active:scale-95"
            >
              Semua Data
            </button>
          )}
        </div>
      </div>

      {/* Main Container List */}
      <AnimatePresence mode="wait">
        {loading ? (
          <div className="bg-white border border-gray-100 rounded-[2rem] p-12 text-center shadow-xs flex flex-col items-center justify-center">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-3 animate-spin">
              <Clock size={24} />
            </div>
            <p className="font-extrabold text-gray-900 text-lg">Memuat data iuran...</p>
            <p className="text-gray-400 text-sm mt-1">Sistem sedang sinkronisasi dengan database Firestore.</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-gray-100 rounded-[2rem] p-16 text-center shadow-xs flex flex-col items-center justify-center"
          >
            <div className="w-16 h-16 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-4">
              <Check className="stroke-[3]" size={32} />
            </div>
            <p className="font-black text-gray-900 text-xl">Selesai! Tidak Ada Pending</p>
            <p className="text-gray-400 text-sm mt-1 max-w-sm mx-auto">
              Semua bukti iuran anggota telah diperiksa dan disetujui. Hebat!
            </p>
            {(searchTerm !== '' || filterType !== 'all' || filterMethod !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterType('all');
                  setFilterMethod('all');
                }}
                className="mt-4 text-xs font-bold text-blue-600 hover:underline"
              >
                Reset filter pencarian
              </button>
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.05 }}
                className="bg-white border border-gray-100 rounded-3xl p-5 hover:border-amber-200/80 hover:shadow-lg hover:shadow-amber-900/5 transition-all flex flex-col justify-between group relative overflow-hidden"
              >
                {/* Visual Backdrop accent */}
                <span className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none group-hover:bg-amber-500/10 transition-colors" />

                <div className="space-y-4">
                  {/* Top: Header Card */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-black text-gray-900 text-lg tracking-tight group-hover:text-blue-600 transition-colors">
                        {item.memberName}
                      </h3>
                      {/* Member Type Badge */}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`px-2 py-0.5 rounded-[10px] text-[10px] font-black uppercase tracking-wider ${
                          item.memberType === 'driver' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                        }`}>
                          {item.memberType}
                        </span>
                        
                        <span className="text-gray-300">•</span>
                        
                        <span className="text-[10px] font-bold text-gray-500">
                          {formatDate(item.date)}
                        </span>
                      </div>
                    </div>

                    {/* Method Badge icon */}
                    <div className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 ${
                      item.method.toLowerCase() === 'transfer'
                        ? 'bg-purple-50 text-purple-700 border border-purple-100'
                        : item.method.toLowerCase() === 'qris'
                          ? 'bg-pink-50 text-pink-700 border border-pink-100'
                          : 'bg-orange-50 text-orange-700 border border-orange-100'
                    }`}>
                      <CreditCard size={12} className="opacity-80" />
                      {item.method}
                    </div>
                  </div>

                  <div className="bg-gray-50 border border-gray-100/60 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Bulan Tagihan</span>
                      <span className="text-base font-black text-gray-800 tracking-tight flex items-center gap-1.5">
                        <Calendar size={15} className="text-blue-500" />
                        {item.month}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block font-bold">Iuran Bulanan</span>
                      <span className="text-base font-black text-emerald-600 tracking-tight">
                        Rp {TARIFF_PER_MONTH.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>

                  {item.bank && (
                    <div className="text-xs bg-purple-500/5 text-purple-700 px-3 py-2 rounded-xl flex items-center gap-2 border border-purple-100/50">
                      <ShieldCheck size={13} />
                      <span>Bank Tujuan: <strong className="font-extrabold">{item.bank}</strong></span>
                    </div>
                  )}
                </div>

                {/* Bottom Card Actions */}
                <div className="mt-5 pt-4 border-t border-gray-50 flex items-center gap-3">
                  {/* Reject */}
                  <button
                    onClick={() => setVerifyingItem({ item, actionType: 'reject' })}
                    className="flex-1 py-3 bg-red-50 hover:bg-red-100 border border-red-100 text-red-700 font-extrabold rounded-2xl text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <ThumbsDown size={14} />
                    Tolak
                  </button>

                  {/* Accept */}
                  <button
                    onClick={() => setVerifyingItem({ item, actionType: 'verify' })}
                    className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl text-xs shadow-md shadow-blue-100/80 hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <ThumbsUp size={14} />
                    Setujui Pembayaran
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Verification Auth Modal */}
      <AnimatePresence>
        {verifyingItem && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md p-6 border border-gray-100 shadow-2xl space-y-5"
            >
              {/* Header inside verify modal */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-gray-900 leading-none">
                    Otoritas Verifikasi Admin
                  </h3>
                  <p className="text-gray-500 text-xs mt-1">
                    Silakan otorisasi tindakan Anda dengan akun admin terdaftar.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setVerifyingItem(null);
                    setAdminPin('');
                    setAdminError('');
                  }}
                  className="p-2 text-gray-400 hover:bg-gray-50 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Verified Action Alert Warning */}
              <div className={`p-4 rounded-3xl border text-xs leading-relaxed ${
                verifyingItem.actionType === 'verify'
                  ? 'bg-blue-50 border-blue-100 text-blue-900'
                  : 'bg-red-50 border-red-100 text-red-900'
              }`}>
                <div className="flex items-center gap-2 font-black uppercase mb-1.5">
                  <AlertCircle size={15} />
                  <span>Detail Konfirmasi Tindakan</span>
                </div>
                <p>
                  Anggota: <strong className="font-extrabold">{verifyingItem.item.memberName}</strong> ({verifyingItem.item.memberType}) <br />
                  Tagihan untuk: <strong className="font-extrabold">{verifyingItem.item.month}</strong> sebesar <strong className="font-extrabold">Rp {TARIFF_PER_MONTH.toLocaleString('id-ID')}</strong> <br />
                  Tindakan: {
                    verifyingItem.actionType === 'verify' 
                      ? <span className="text-emerald-700 font-extrabold uppercase">✓ LUNAS / VERIFIED</span> 
                      : <span className="text-red-700 font-extrabold uppercase">✗ DITOLAK / GAGAL</span>
                  }
                </p>
              </div>

              <div className="space-y-4">
                {/* Input Admin Name */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Nama Admin</label>
                  <input
                    type="text"
                    value={adminName}
                    disabled={isVerifying}
                    onChange={(e) => {
                      setAdminName(e.target.value);
                      setAdminError('');
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm font-medium disabled:opacity-50"
                    placeholder="Masukkan nama Anda"
                  />
                  {['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] font-extrabold text-[#9a3412] bg-amber-50 border border-amber-100 px-3 py-1 rounded-xl flex items-center gap-1.5"
                    >
                      <span>🌟 Super Admin Terdaftar: Bebas PIN!</span>
                    </motion.div>
                  )}
                </div>

                {/* Input Admin PIN */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">PIN Admin</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) ? '1234' : adminPin}
                    onChange={(e) => {
                      setAdminPin(e.target.value);
                      setAdminError('');
                    }}
                    disabled={isVerifying || ['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase())}
                    className={`w-full px-4 py-3 rounded-xl border border-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm font-medium tracking-[0.5em] text-center disabled:opacity-50 ${['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) ? 'bg-amber-50/20 text-amber-500 border-dashed border-amber-200 cursor-not-allowed' : ''}`}
                    placeholder={['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) ? '✓✓✓✓' : '••••'}
                  />
                </div>

                {/* Error feedback */}
                {adminError && (
                  <motion.p 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center text-xs text-red-500 font-extrabold mt-1"
                  >
                    {adminError}
                  </motion.p>
                )}

                {/* Action CTA Trigger */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      setVerifyingItem(null);
                      setAdminPin('');
                      setAdminError('');
                    }}
                    disabled={isVerifying}
                    className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-2xl transition-all font-bold text-sm text-center disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleAdminVerify}
                    disabled={isVerifying || !adminName.trim() || (!['MANCUNG', 'MANCUNG_168', 'MANCUNG168'].includes(adminName.trim().toUpperCase()) && adminPin.length !== 4)}
                    className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-2xl transition-all font-bold text-sm shadow-lg shadow-blue-100 flex items-center justify-center gap-2 active:scale-95 disabled:cursor-not-allowed"
                  >
                    {isVerifying ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={16} className="stroke-[2.5]" />
                    )}
                    {isVerifying ? 'Memproses...' : 'Konfirmasi Tindakan'}
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

import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp, collection } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { verifyAdmin } from '../lib/adminService';
import { UserPlus, Users, Plus, X, ChevronDown, Loader2, Lock, ShieldCheck, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export default function MemberForm({ defaultType = 'driver' }: { defaultType?: 'driver' | 'helper' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('MEMBER_FORM_DRAFT_NAME') || '';
    } catch {
      return '';
    }
  });
  const [type, setType] = useState<'driver' | 'helper'>(defaultType);
  const [phone, setPhone] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkProgressMessage, setBulkProgressMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Admin verification states - automatically verified because they are logged in via email
  const [isAdminVerified, setIsAdminVerified] = useState(true);
  const [adminName, setAdminName] = useState(() => localStorage.getItem('ADMIN_NICKNAME') || 'Admin');
  const [adminPin, setAdminPin] = useState('');
  const [adminError, setAdminError] = useState('');
  const [nameError, setNameError] = useState('');
  const [saveError, setSaveError] = useState('');

  // Save name layout draft in real-time for single mode
  React.useEffect(() => {
    try {
      if (name && addMode === 'single') {
        localStorage.setItem('MEMBER_FORM_DRAFT_NAME', name);
      } else {
        localStorage.removeItem('MEMBER_FORM_DRAFT_NAME');
      }
    } catch (e) {
      console.warn('LocalStorage is blocked or unavailable:', e);
    }
  }, [name, addMode]);

  const ADMIN_PIN = localStorage.getItem('ADMIN_PIN') || '1234';

  // Sync type with defaultType when modal is opened
  const handleOpen = () => {
    setType(defaultType);
    setAddMode('single');
    try {
      const draft = localStorage.getItem('MEMBER_FORM_DRAFT_NAME') || '';
      setName(draft);
    } catch {
      setName('');
    }
    setNameError('');
    setPhone('');
    setBulkText('');
    setBulkProgressMessage('');
    setSaveError('');
    setAdminName(localStorage.getItem('ADMIN_NICKNAME') || 'Admin');
    setAdminPin('');
    setAdminError('');
    setIsAdminVerified(true);
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addMode === 'single') {
      if (!name.trim()) {
        setNameError('Nama lengkap tidak boleh kosong!');
        return;
      }
      if (name.trim().length < 2) {
        setNameError('Nama anggota terlalu pendek!');
        return;
      }
      if (loading || !isAdminVerified) return;

      setLoading(true);
      setSaveError('');
      const id = Date.now().toString();
      const initialMonths: Record<string, boolean> = {};
      MONTHS.forEach(m => initialMonths[m] = false);

      const path = `members/${id}`;
      try {
        const memberPromise = setDoc(doc(db, 'members', id), {
          name: name.trim(),
          type: type,
          phone: phone.trim(),
          months: initialMonths,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdByAdmin: adminName.trim(),
        });

        // Log newly created member to activities collection
        const activityPromise = setDoc(doc(collection(db, 'activities')), {
          action: 'tambah_anggota',
          details: `[Tambah Anggota] ${type === 'driver' ? 'Driver' : 'Helper'} - ${name.trim()}`,
          adminName: adminName.trim(),
          timestamp: serverTimestamp()
        });

        // race against a 1500ms timeout to avoid UI freeze if Firestore network write response is delayed.
        await Promise.race([
          Promise.all([memberPromise, activityPromise]),
          new Promise((resolve) => setTimeout(resolve, 1500))
        ]);

        setName('');
        setPhone('');
        try {
          localStorage.removeItem('MEMBER_FORM_DRAFT_NAME');
        } catch (e) {
          console.warn(e);
        }
        setIsOpen(false); 
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
        setSaveError(error instanceof Error ? `Gagal menyimpan: ${error.message}` : "Gagal menyimpan data. Silakan coba lagi.");
      } finally {
        setLoading(false);
      }
    } else {
      // Bulk add mode
      const lines = bulkText.split('\n');
      const parsedMembers: { name: string; phone: string }[] = [];

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        
        const parts = trimmed.split(',');
        const parsedName = parts[0]?.trim();
        const parsedPhone = parts[1]?.trim() || '';
        
        if (parsedName && parsedName.length >= 2) {
          parsedMembers.push({
            name: parsedName,
            phone: parsedPhone
          });
        }
      });

      if (parsedMembers.length === 0) {
        setSaveError('Mohon masukkan setidaknya 1 nama anggota yang valid (minimal 2 karakter)!');
        return;
      }

      setLoading(true);
      setSaveError('');
      const initialMonths: Record<string, boolean> = {};
      MONTHS.forEach(m => initialMonths[m] = false);

      try {
        for (let i = 0; i < parsedMembers.length; i++) {
          const item = parsedMembers[i];
          setBulkProgressMessage(`Menyimpan ${i + 1} dari ${parsedMembers.length}: ${item.name}...`);
          
          // Generate unique sequential millisecond ID
          const id = (Date.now() + i).toString();
          
          await setDoc(doc(db, 'members', id), {
            name: item.name,
            type: type,
            phone: item.phone,
            months: initialMonths,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdByAdmin: adminName.trim(),
          });
        }

        // Single activity log entry for bulk import
        await setDoc(doc(collection(db, 'activities')), {
          action: 'tambah_anggota_masal',
          details: `[Tambah Anggota Masal] ${type === 'driver' ? 'Driver' : 'Helper'} - Berhasil mendaftarkan ${parsedMembers.length} anggota baru`,
          adminName: adminName.trim(),
          timestamp: serverTimestamp()
        });

        setBulkText('');
        setIsOpen(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'members');
        setSaveError(error instanceof Error ? `Gagal menyimpan masal: ${error.message}` : "Gagal menyimpan data masal. Silakan coba lagi.");
      } finally {
        setLoading(false);
        setBulkProgressMessage('');
      }
    }
  };

  return (
    <>
      <div className="flex justify-start w-full sm:w-auto">
        <button
          onClick={handleOpen}
          className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-2xl font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100/50 active:scale-95 transition-all animate-none"
        >
          <Plus size={18} className="stroke-[2.5]" />
          Tambah Anggota
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />

            {/* Modal Box with dynamic sizing transition */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`relative w-full ${addMode === 'bulk' ? 'max-w-lg' : 'max-w-md'} bg-white rounded-3xl shadow-2xl p-6 md:p-8 overflow-hidden z-10 border border-gray-100 transition-all duration-300`}
            >
              <div className="flex items-center justify-between mb-5 pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2.5 text-left">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600">
                    <UserPlus size={20} className="stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900 leading-tight">
                      Tambah Anggota
                    </h3>
                    <p className="text-xs text-gray-400 font-medium">
                      Pendaftaran anggota draf baru
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-xl transition-all cursor-pointer"
                >
                  <X size={18} className="stroke-[2.5]" />
                </button>
              </div>

              {/* Segmented Control Tabs */}
              <div className="flex bg-gray-100 p-1 rounded-2xl mb-5">
                <button
                  type="button"
                  onClick={() => {
                    setAddMode('single');
                    setSaveError('');
                  }}
                  className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    addMode === 'single'
                      ? 'bg-white text-blue-600 shadow-sm border border-gray-200/50'
                      : 'text-gray-500 hover:text-gray-900 border border-transparent'
                  }`}
                >
                  <UserPlus size={14} />
                  Daftar Satuan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddMode('bulk');
                    setSaveError('');
                  }}
                  className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    addMode === 'bulk'
                      ? 'bg-white text-blue-600 shadow-sm border border-gray-200/50'
                      : 'text-gray-500 hover:text-gray-900 border border-transparent'
                  }`}
                >
                  <Users size={14} />
                  Tambah Masal
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-emerald-50/50 p-3.5 rounded-2xl border border-emerald-100/50 text-[11px] text-emerald-700 font-medium text-left leading-relaxed flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-600 flex-shrink-0" />
                  <span>Sesi Diotorisasi oleh: <strong className="font-bold text-emerald-950 uppercase">{adminName}</strong></span>
                </div>

                {addMode === 'single' ? (
                  <>
                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1 flex items-center gap-1">
                        <UserPlus size={12} /> Nama Lengkap
                      </label>
                      <input
                        type="text"
                        required
                        autoFocus
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (nameError) setNameError('');
                        }}
                        placeholder="Masukkan nama lengkap..."
                        className="w-full px-4 py-3 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold text-gray-800"
                      />
                      {nameError && (
                        <motion.p 
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-xs font-bold text-red-500 mt-1 ml-1 text-left"
                        >
                          {nameError}
                        </motion.p>
                      )}
                    </div>

                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1 flex items-center gap-1">
                        <Phone size={12} /> No HP (WhatsApp)
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Contoh: 081234567890 (opsional)"
                        className="w-full px-4 py-3 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold text-gray-800"
                      />
                    </div>
                  </>
                ) : (
                  // Bulk add layout
                  <div className="space-y-2 text-left">
                    <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1 flex items-center gap-1">
                      <Users size={12} /> Daftar Anggota Masal
                    </label>
                    <textarea
                      required
                      rows={6}
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      placeholder="Contoh format:&#13;Ahmad Fauzi, 081234567890&#13;Budi Susanto&#13;Eko Prasetya, 089988776655"
                      className="w-full px-4 py-3 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold text-gray-800 font-mono"
                    />
                    <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                      * Satu baris untuk satu anggota. Format: <strong>Nama, Nomor HP</strong> (nomor HP bersifat opsional, pisahkan dengan koma).
                    </p>
                  </div>
                )}

                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1">
                    Kategori / Peran (Diterapkan ke Semua)
                  </label>
                  <div className="relative">
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as 'driver' | 'helper')}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold appearance-none bg-white pr-10 text-gray-800 cursor-pointer"
                    >
                      <option value="driver">Driver (Sopir)</option>
                      <option value="helper">Helper (Kernet)</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                  </div>
                </div>

                {bulkProgressMessage && (
                  <p className="text-xs font-bold text-blue-600 text-center animate-pulse">
                    {bulkProgressMessage}
                  </p>
                )}

                {saveError && (
                  <motion.p 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs font-bold text-red-500 text-center"
                  >
                    {saveError}
                  </motion.p>
                )}

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-2xl transition-all font-bold text-sm active:scale-95 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading || (addMode === 'single' ? !name.trim() : !bulkText.trim())}
                    className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-2xl transition-all font-bold text-sm shadow-lg shadow-blue-100/50 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                  >
                    {loading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Plus size={16} className="stroke-[2.5]" />
                    )}
                    {addMode === 'single' ? 'Simpan Anggota' : 'Proses Simpan Masal'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  Search, 
  ChevronDown, 
  Calendar, 
  ShieldAlert, 
  UserPlus, 
  UserMinus, 
  FileText, 
  CheckCircle, 
  Activity, 
  Pencil, 
  Trash2,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ActivityLog {
  id: string;
  action: string;
  details: string;
  adminName: string;
  timestamp: any;
}

const getActivityBadge = (action: string) => {
  switch (action) {
    case 'tambah_anggota':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wider">
          <UserPlus size={12} />
          Tambah Anggota
        </span>
      );
    case 'edit_anggota':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wider">
          <Pencil size={12} />
          Edit Anggota
        </span>
      );
    case 'hapus_anggota':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-100 uppercase tracking-wider">
          <UserMinus size={12} />
          Hapus Anggota
        </span>
      );
    case 'tambah_transaksi':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-purple-50 text-purple-700 border border-purple-100 uppercase tracking-wider">
          <FileText size={12} />
          Tambah Transaksi
        </span>
      );
    case 'hapus_transaksi':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-red-50 text-red-700 border border-red-100 uppercase tracking-wider">
          <Trash2 size={12} />
          Hapus Transaksi
        </span>
      );
    case 'bayar_iuran':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wider">
          <CheckCircle size={12} />
          Bayar Iuran
        </span>
      );
    case 'verifikasi_iuran':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-teal-50 text-teal-700 border border-teal-100 uppercase tracking-wider">
          <CheckCircle size={12} />
          Verifikasi Iuran
        </span>
      );
    case 'tolak_iuran':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-orange-50 text-orange-700 border border-orange-100 uppercase tracking-wider">
          <ShieldAlert size={12} />
          Tolak Iuran
        </span>
      );
    case 'update_status_iuran':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-slate-50 text-slate-700 border border-slate-200 uppercase tracking-wider">
          <Activity size={12} />
          Update Iuran
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-gray-50 text-gray-700 border border-gray-100 uppercase tracking-wider">
          <Activity size={12} />
          Aktivitas
        </span>
      );
  }
};

const formatTimestamp = (timestamp: any) => {
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
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('id-ID', {
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

export default function ActivityList() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());
  const isFirstLoad = React.useRef(true);

  useEffect(() => {
    const q = query(
      collection(db, 'activities'), 
      orderBy('timestamp', 'desc'),
      limit(250)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: ActivityLog[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as ActivityLog);
      });

      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        setActivities(data);
        setLoading(false);
      } else {
        // Identify newly added logs that were not in the previous set
        setActivities((prev) => {
          const prevIds = new Set(prev.map(item => item.id));
          const newIds: string[] = [];
          data.forEach(item => {
            if (!prevIds.has(item.id)) {
              newIds.push(item.id);
            }
          });

          if (newIds.length > 0) {
            setNewlyAddedIds(prevSet => {
              const current = new Set(prevSet);
              newIds.forEach(id => current.add(id));
              return current;
            });

            // Automatically remove highlight after 4 seconds
            setTimeout(() => {
              setNewlyAddedIds(prevSet => {
                const current = new Set(prevSet);
                newIds.forEach(id => current.delete(id));
                return current;
              });
            }, 4000);
          }
          return data;
        });
        setLoading(false);
      }
    }, (error: any) => {
      console.error("Firestore error loading activities:", error);
      setLoading(false);
      if (error?.message?.includes('permission-denied') || error?.message?.includes('permissions') || error?.code === 'permission-denied') {
        window.dispatchEvent(new CustomEvent('firestore-permission-denied'));
      }
      handleFirestoreError(error, OperationType.GET, 'activities');
    });

    return () => unsubscribe();
  }, []);

  const filtered = activities.filter(act => {
    const matchesSearch = 
      (act.details || '').toLowerCase().includes(search.toLowerCase()) ||
      (act.adminName || '').toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'all' || act.action === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2.5">
            <Activity size={28} className="text-blue-600 animate-pulse" />
            Riwayat Aktivitas
          </h1>
          <p className="text-gray-500 mt-1 text-sm font-medium">
            Log aktivitas seluruh pendaftaran anggota, edit, penghapusan, transaksi keuangan, serta pembayaran iuran.
          </p>
        </div>
        
        <div className="bg-blue-600 px-6 py-4 rounded-3xl text-white shadow-lg shadow-blue-100 flex flex-col items-end">
           <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Total Sesi Aktivitas</span>
           <span className="text-xl font-black">{activities.length} Log</span>
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-4 justify-between">
        <div className="flex items-center bg-gray-50 px-4 py-3.5 rounded-2xl border border-gray-100 flex-1 md:max-w-md">
          <Search className="text-gray-400 mr-2.5 flex-shrink-0" size={18} />
          <input
            type="text"
            placeholder="Cari aktivitas atau nama admin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs font-bold text-gray-800 placeholder-gray-400 outline-none bg-transparent"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="appearance-none bg-white border border-gray-100 px-5 py-3.5 pr-11 rounded-2xl text-xs font-bold text-gray-700 shadow-xs focus:border-blue-500 hover:bg-gray-50 transition-all outline-none cursor-pointer"
            >
              <option value="all">Semua Tipe Aktivitas</option>
              <option value="tambah_anggota">Tambah Anggota</option>
              <option value="edit_anggota">Edit Anggota</option>
              <option value="hapus_anggota">Hapus Anggota</option>
              <option value="tambah_transaksi">Tambah Transaksi</option>
              <option value="hapus_transaksi">Hapus Transaksi</option>
              <option value="bayar_iuran">Bayar Iuran</option>
              <option value="verifikasi_iuran">Verifikasi Iuran</option>
              <option value="tolak_iuran">Tolak Iuran</option>
              <option value="update_status_iuran">Update Iuran</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
          </div>

          {(search || filterType !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setFilterType('all');
              }}
              className="text-xs font-extrabold text-blue-600 hover:text-blue-700 hover:underline px-3 py-2 transition-all"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* ACTIVITIES TABLE */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left grid-table">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-widest w-[200px] text-center whitespace-nowrap">Waktu</th>
                <th className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-widest w-[180px] text-center whitespace-nowrap">Admin</th>
                <th className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-widest w-[180px] text-center whitespace-nowrap">Aksi</th>
                <th className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-widest text-center whitespace-nowrap">Detail Deskripsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <AnimatePresence>
                {filtered.map((log) => {
                  const isNew = newlyAddedIds.has(log.id);
                  return (
                    <motion.tr 
                      key={log.id} 
                      initial={isNew ? { opacity: 0, x: -15, scale: 0.98 } : { opacity: 0 }}
                      animate={isNew ? { opacity: 1, x: 0, scale: 1 } : { opacity: 1 }}
                      transition={{ type: "spring", stiffness: 100, damping: 15 }}
                      exit={{ opacity: 0 }}
                      className={`transition-all duration-700 ${
                        isNew 
                          ? 'bg-emerald-50 border border-emerald-200 shadow-sm' 
                          : 'hover:bg-gray-50/20'
                      }`}
                    >
                      <td className="px-4 py-2 whitespace-nowrap text-xs font-bold text-gray-500 relative">
                        <div className="flex items-center gap-2">
                          <Clock size={12} className="text-gray-400 shrink-0" />
                          <span>{formatTimestamp(log.timestamp)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="text-xs font-black text-blue-700 bg-blue-50/80 border border-blue-100/50 px-3 py-1.5 rounded-xl uppercase tracking-wider">
                          {log.adminName || 'Admin'}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getActivityBadge(log.action)}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-sm font-semibold text-gray-800 leading-relaxed whitespace-nowrap">
                        {(() => {
                          const cleanDetails = log.details.replace(/^\[.*?\]\s*/, '');
                          return (
                            <span title={cleanDetails}>
                              {cleanDetails}
                            </span>
                          );
                        })()}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center text-gray-400 italic text-sm">
                    {search || filterType !== 'all' ? 'Tidak ada log aktivitas yang sesuai kriteria.' : 'Belum ada rekaman aktivitas.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

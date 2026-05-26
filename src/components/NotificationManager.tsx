import { useEffect, useState, useRef } from 'react';
import { getToken } from 'firebase/messaging';
import { onAuthStateChanged, User } from 'firebase/auth';
import { messaging, db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UserPlus, 
  Pencil, 
  UserMinus, 
  FileText, 
  Trash2, 
  CheckCircle, 
  ShieldAlert, 
  Activity, 
  Bell, 
  X 
} from 'lucide-react';

interface Toast {
  id: string;
  action: string;
  details: string;
  adminName: string;
  timestamp: any;
}

const getToastConfig = (action: string) => {
  switch (action) {
    case 'tambah_anggota':
      return {
        icon: <UserPlus className="text-blue-600 animate-bounce" size={18} />,
        borderColor: 'border-blue-100',
        accentColor: 'bg-blue-600',
        title: 'Anggota Baru Terdaftar',
        textColor: 'text-blue-900',
        adminColor: 'text-blue-600'
      };
    case 'edit_anggota':
      return {
        icon: <Pencil className="text-amber-600 rotate-12" size={18} />,
        borderColor: 'border-amber-100',
        accentColor: 'bg-amber-500',
        title: 'Pembaruan Data Anggota',
        textColor: 'text-amber-900',
        adminColor: 'text-amber-600'
      };
    case 'hapus_anggota':
      return {
        icon: <UserMinus className="text-rose-600 animate-pulse" size={18} />,
        borderColor: 'border-rose-100',
        accentColor: 'bg-rose-600',
        title: 'Anggota Telah Dihapus',
        textColor: 'text-rose-900',
        adminColor: 'text-rose-600'
      };
    case 'tambah_transaksi':
      return {
        icon: <FileText className="text-purple-600" size={18} />,
        borderColor: 'border-purple-100',
        accentColor: 'bg-purple-600',
        title: 'Transaksi Kas Baru',
        textColor: 'text-purple-900',
        adminColor: 'text-purple-600'
      };
    case 'hapus_transaksi':
      return {
        icon: <Trash2 className="text-red-500" size={18} />,
        borderColor: 'border-red-100',
        accentColor: 'bg-red-500',
        title: 'Transaksi Kas Dihapus',
        textColor: 'text-red-900',
        adminColor: 'text-red-600'
      };
    case 'bayar_iuran':
      return {
        icon: <CheckCircle className="text-emerald-600" size={18} />,
        borderColor: 'border-emerald-100',
        accentColor: 'bg-emerald-600',
        title: 'Pembayaran Iuran',
        textColor: 'text-emerald-900',
        adminColor: 'text-emerald-600'
      };
    case 'verifikasi_iuran':
      return {
        icon: <CheckCircle className="text-teal-600" size={18} />,
        borderColor: 'border-teal-100',
        accentColor: 'bg-teal-500',
        title: 'Pembayaran Diverifikasi',
        textColor: 'text-teal-900',
        adminColor: 'text-teal-600'
      };
    case 'tolak_iuran':
      return {
        icon: <ShieldAlert className="text-orange-600" size={18} />,
        borderColor: 'border-orange-100',
        accentColor: 'bg-orange-500',
        title: 'Pembayaran Ditolak',
        textColor: 'text-orange-900',
        adminColor: 'text-orange-600'
      };
    case 'update_status_iuran':
      return {
        icon: <Activity className="text-slate-600" size={18} />,
        borderColor: 'border-slate-200',
        accentColor: 'bg-slate-500',
        title: 'Status Iuran Diubah',
        textColor: 'text-slate-900',
        adminColor: 'text-slate-600'
      };
    default:
      return {
        icon: <Bell className="text-blue-500" size={18} />,
        borderColor: 'border-gray-100',
        accentColor: 'bg-blue-500',
        title: 'Aktivitas Baru',
        textColor: 'text-gray-900',
        adminColor: 'text-blue-600'
      };
  }
};

const playFriendlyChime = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    
    // First high note
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    gain1.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.15);

    // Second sweet harmonic note
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.08); // A5
    gain2.gain.setValueAtTime(0.08, audioCtx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    osc2.start(audioCtx.currentTime + 0.08);
    osc2.stop(audioCtx.currentTime + 0.25);
  } catch (e) {
    // Audio engine blocked by user interaction constraints
    console.log('Audio pop prevented by browser autoplay policy.');
  }
};

interface NotificationManagerProps {
  user: User | null;
}

export default function NotificationManager({ user }: NotificationManagerProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notifiedIds = useRef(new Set<string>());

  useEffect(() => {
    // Register Service Worker explicitly for robust push notification support (required for mobile devices)
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((reg) => {
          console.log('Service Worker registered successfully for Web Push:', reg);
        })
        .catch((err) => {
          console.warn('Service Worker registration failed:', err);
        });
    }

    // 1. Ask for standard permissions
    async function requestPermission() {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        try {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            console.log('Notification permission granted.');
            try {
              if (messaging) {
                const token = await getToken(messaging);
                if (token) {
                  console.log('FCM Token generated successfully.');
                }
              } else {
                console.log('FCM Messaging is not supported or initialized in this environment.');
              }
            } catch (e) {
              console.warn('FCM token generation ignored or not configured:', e);
            }
          }
        } catch (error) {
          console.error('Error getting notification permission:', error);
        }
      }
    }
    requestPermission();
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isInitial = true;

    if (!user) {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      return;
    }

    // Listen to activities collection using query
    const q = query(
      collection(db, 'activities'),
      orderBy('timestamp', 'desc'),
      limit(5)
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
      if (isInitial) {
        // Skip historical logs on the first snapshot load to prevent spam
        snapshot.forEach((doc) => {
          notifiedIds.current.add(doc.id);
        });
        isInitial = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const activityId = change.doc.id;
          const data = change.doc.data();

          // Prevent double notification triggers for identical events
          if (notifiedIds.current.has(activityId)) return;
          notifiedIds.current.add(activityId);

          const action = data.action || 'system';
          const details = data.details || '';
          const adminName = data.adminName || 'Admin';

          // 1. Play synthesized premium sound
          playFriendlyChime();

          // 2. Add custom toast to screen state
          const newToast: Toast = {
            id: activityId,
            action,
            details,
            adminName,
            timestamp: data.timestamp
          };

          setToasts((prev) => [newToast, ...prev].slice(0, 5));

          // 3. Trigger native browser HTML5 alert if permitted
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              const config = getToastConfig(action);
              const title = config.title;
              const options = {
                body: `${adminName}: ${details}`,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                silent: false,
                vibration: [100, 50, 100],
              };

              // If serviceWorker is registered, prefer ServiceWorkerRegistration.showNotification (required for mobile Chrome / Android)
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then((reg) => {
                  reg.showNotification(title, options);
                }).catch((swErr) => {
                  console.warn('Service Worker notification failed, trying direct fallback:', swErr);
                  try {
                    new Notification(title, options);
                  } catch (err2) {
                    console.error('Direct Notification constructor failed:', err2);
                  }
                });
              } else {
                new Notification(title, options);
              }
            } catch (err) {
              console.warn('HTML5 Notification failed to trigger (expected inside frames):', err);
            }
          }

          // Auto remove after 5.5 seconds
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== activityId));
          }, 5500);
        }
      });
    }, (error: any) => {
      console.error('Notification Firestore Listener Error:', error);
      // Only show/trigger permission-denied modal if the user is actually supposed to be signed in
      if (auth.currentUser && user) {
        if (error?.message?.includes('permission-denied') || error?.message?.includes('permissions') || error?.code === 'permission-denied') {
          window.dispatchEvent(new CustomEvent('firestore-permission-denied'));
        }
        handleFirestoreError(error, OperationType.GET, 'activities');
      }
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user]);

  const handleCloseToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      <AnimatePresence>
        {toasts.map((toast) => {
          const config = getToastConfig(toast.action);
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 30, scale: 0.9, x: 20 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.85, x: 40, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className={`pointer-events-auto w-full bg-white rounded-2xl shadow-xl shadow-gray-200/50 border ${config.borderColor} overflow-hidden flex relative p-4 pr-11`}
            >
              {/* Colored status strip */}
              <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${config.accentColor}`} />
              
              <div className="flex gap-3.5 items-start pl-1 w-full">
                <div className="p-2.5 bg-gray-50 rounded-2xl shrink-0 flex items-center justify-center">
                  {config.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col">
                    <span className={`text-[10px] font-extrabold uppercase tracking-widest ${config.adminColor}`}>
                      Oleh: {toast.adminName}
                    </span>
                    <h4 className={`text-xs font-black tracking-tight ${config.textColor} mt-0.5`}>
                      {config.title}
                    </h4>
                  </div>
                  <p className="text-[11px] font-bold text-gray-500 mt-1.5 leading-relaxed break-words">
                    {toast.details}
                  </p>
                </div>
              </div>

              {/* Dismiss Button */}
              <button 
                onClick={() => handleCloseToast(toast.id)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-50 transition-colors pointer-events-auto cursor-pointer"
              >
                <X size={14} className="stroke-[2.5px]" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import { collection, query, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, messaging } from './lib/firebase';
import { isEmailRegistered, getAdminByEmail } from './lib/adminService';
import MemberList from './components/MemberList';
import TransactionList from './components/TransactionList';
import PendingVerifications from './components/PendingVerifications';
import ActivityList from './components/ActivityList';
import AdminManager from './components/AdminManager';
import TabButton from './components/TabButton';
import NotificationManager from './components/NotificationManager';
import { 
  LogIn, 
  Loader2, 
  Truck, 
  Users, 
  Receipt, 
  LogOut, 
  Plus, 
  Clock, 
  Activity, 
  Menu, 
  ChevronDown, 
  User as UserIcon, 
  Key, 
  Check, 
  Bell, 
  AlertCircle, 
  Info, 
  ShieldCheck, 
  X,
  Copy,
  Volume2,
  Smartphone,
  Sparkles,
  Laptop,
  Palette,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type TabType = 'driver' | 'helper' | 'transaction' | 'pending' | 'history' | 'admin_manager';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);
  const isSessionTerminatingRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const [isAdminSuperAdmin, setIsAdminSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('driver');
  const [loginError, setLoginError] = useState<{ code: string; message: string; isDomainError: boolean; isCancellation?: boolean } | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Menu and Modals state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showChangeNicknameModal, setShowChangeNicknameModal] = useState(false);
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showFcmModal, setShowFcmModal] = useState(false);
  const [fcmToken, setFcmToken] = useState(() => localStorage.getItem('fcm_token_cache') || '');
  const [fcmPermission, setFcmPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  const [fcmTestTitle, setFcmTestTitle] = useState('Tes Notifikasi Push');
  const [fcmTestBody, setFcmTestBody] = useState('Koneksi FCM Server Sukses!');
  const [sendingFcmTest, setSendingFcmTest] = useState(false);
  const [fcmTestResponse, setFcmTestResponse] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const [newNickname, setNewNickname] = useState('');
  const [nicknameError, setNicknameError] = useState('');

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');

  // Theme state
  type ThemeType = 'slate' | 'midnight' | 'forest' | 'sepia';
  const [theme, setTheme] = useState<ThemeType>(() => {
    return (localStorage.getItem('APP_THEME') as ThemeType) || 'slate';
  });

  const changeTheme = (newTheme: ThemeType) => {
    setTheme(newTheme);
    localStorage.setItem('APP_THEME', newTheme);
  };

  // Notification center state
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [pendingVerifications, setPendingVerifications] = useState<any[]>([]);
  const [showRulesAlert, setShowRulesAlert] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);
  
  // Frame breakaway state
  const [currentUrl, setCurrentUrl] = useState('');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentUrl(window.location.href);
    }
  }, []);
  
  // Real-time network monitor state
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Monitor connectivity state
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Global event listener to detect permission-denied errors across any component
  useEffect(() => {
    const handlePermissionDenied = () => {
      // ONLY show the rules alert if there is a fully validated, registered user session active,
      // and we are NOT in the middle of logging out or switching Google accounts.
      if (userRef.current && !isSessionTerminatingRef.current) {
        setShowRulesAlert(true);
      }
    };
    window.addEventListener('firestore-permission-denied', handlePermissionDenied);
    return () => {
      window.removeEventListener('firestore-permission-denied', handlePermissionDenied);
    };
  }, []);

  // Monitor FCM token loaded and update state dynamically
  useEffect(() => {
    const handleFcmTokenLoaded = (e: Event) => {
      const token = (e as CustomEvent).detail;
      setFcmToken(token);
    };
    window.addEventListener('fcm-token-loaded', handleFcmTokenLoaded);
    return () => {
      window.removeEventListener('fcm-token-loaded', handleFcmTokenLoaded);
    };
  }, []);

  const requestFcmPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        setFcmPermission(permission);
        if (permission === 'granted' && messaging) {
          const { getToken } = await import('firebase/messaging');
          const token = await getToken(messaging);
          if (token) {
            setFcmToken(token);
            localStorage.setItem('fcm_token_cache', token);
            
            // Sync with backend immediately
            await fetch('/api/fcm/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token: token,
                nickname: localStorage.getItem('ADMIN_NICKNAME') || 'Admin',
                email: user?.email || '',
              })
            });
            console.log('FCM single token synchronized on-the-fly.');
          }
        }
      } catch (err) {
        console.error('Failed to request or get FCM token:', err);
      }
    }
  };

  const sendFcmTest = async () => {
    if (!fcmToken) return;
    setSendingFcmTest(true);
    setFcmTestResponse(null);
    try {
      const response = await fetch('/api/fcm/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: fcmToken,
          title: fcmTestTitle,
          body: fcmTestBody,
          adminName: localStorage.getItem('ADMIN_NICKNAME') || 'Admin'
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setFcmTestResponse({ success: true, message: 'Tes notifikasi FCM berhasil antre! Periksa desktop/ponsel Anda.' });
      } else {
        setFcmTestResponse({ success: false, message: data.error || 'Gateway server FCM melaporkan kesalahan.' });
      }
    } catch (err: any) {
      setFcmTestResponse({ success: false, message: err.message || 'Gagal menghubungi server API.' });
    } finally {
      setSendingFcmTest(false);
    }
  };

  // Fetch pending verifications in real-time
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'members'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((doc) => {
        const m = doc.data();
        m.id = doc.id;
        if (m.paymentDetails) {
          Object.entries(m.paymentDetails).forEach(([month, detail]: [string, any]) => {
            if (detail && detail.status === 'pending') {
              items.push({
                memberId: doc.id,
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
      // Sort newest pending requests first if dates exist
      items.sort((a, b) => {
        const timeA = a.date ? (a.date.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime()) : 0;
        const timeB = b.date ? (b.date.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime()) : 0;
        return timeB - timeA;
      });
      setPendingVerifications(items);
    }, (error) => {
      console.error("Firestore error loading notifications in App:", error);
      if (error?.message?.includes('permission-denied') || error?.message?.includes('permissions') || error?.code === 'permission-denied') {
        window.dispatchEvent(new CustomEvent('firestore-permission-denied'));
      }
      handleFirestoreError(error, OperationType.GET, 'members');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        isSessionTerminatingRef.current = true; // Suspend permission-denied alerts during auth transitions/checks
        setLoading(true);
        try {
          const registered = await isEmailRegistered(currentUser.email);
          if (!registered) {
            isSessionTerminatingRef.current = true;
            await signOut(auth);
            setUser(null);
            setLoginError({
              code: 'unregistered-email',
              message: 'Email Anda (' + currentUser.email + ') tidak terdaftar sebagai pengelola (Admin) Kas SNJ Logistik. Silakan hubungi Super Admin untuk mendaftarkan email Anda.',
              isDomainError: false,
              isCancellation: false
            });
            setLoading(false);
            return;
          }

          isSessionTerminatingRef.current = false;
          setUser(currentUser);
          let isSuper = false;
          if (currentUser.email && (currentUser.email.toLowerCase() === 'mancung168@gmail.com' || currentUser.email.toLowerCase() === '4nonymous168@gmail.com')) {
            isSuper = true;
            localStorage.setItem('ADMIN_NICKNAME', currentUser.email.toLowerCase() === '4nonymous168@gmail.com' ? '4nonymous168' : 'Mancung_168');
          } else {
            const adminRecord = await getAdminByEmail(currentUser.email);
            if (adminRecord) {
              isSuper = adminRecord.role === 'super-admin';
              if (adminRecord.name) {
                localStorage.setItem('ADMIN_NICKNAME', adminRecord.name);
              }
            }
          }
          localStorage.setItem('ADMIN_EMAIL', currentUser.email || '');
          localStorage.setItem('ADMIN_ROLE', isSuper ? 'super-admin' : 'admin');
          setIsAdminSuperAdmin(isSuper);
        } catch (err) {
          console.error('Error verifying email registration state:', err);
          isSessionTerminatingRef.current = true;
          await signOut(auth);
          setUser(null);
          localStorage.removeItem('ADMIN_NICKNAME');
          localStorage.removeItem('ADMIN_EMAIL');
          localStorage.removeItem('ADMIN_ROLE');
          setIsAdminSuperAdmin(false);
        }
        setLoading(false);
      } else {
        isSessionTerminatingRef.current = true; // Suspend during signout/unmounting
        setUser(null);
        localStorage.removeItem('ADMIN_NICKNAME');
        localStorage.removeItem('ADMIN_EMAIL');
        localStorage.removeItem('ADMIN_ROLE');
        setIsAdminSuperAdmin(false);
        setLoading(false);
        isSessionTerminatingRef.current = false;
      }
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed:", error);
      const isDomainErr = error?.code === 'auth/unauthorized-domain' || error?.message?.includes('unauthorized-domain');
      const isCancellation = error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request';
      setLoginError({
        code: error?.code || 'unknown',
        message: isCancellation 
          ? 'Masuk dibatalkan.' 
          : (error?.message || 'Gagal masuk. Silakan coba lagi.'),
        isDomainError: isDomainErr,
        isCancellation: isCancellation
      });
    }
  };

  if (loading) {
    return (
      <div className={`theme-${theme} min-h-screen bg-[#FDFCFB] flex items-center justify-center`}>
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  if (!user) {
    const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
    const domainsToAuthorize = Array.from(new Set([
      currentDomain,
      'ais-dev-ujyd7sl7jdmkgrursvazdz-482896107737.asia-southeast1.run.app',
      'ais-pre-ujyd7sl7jdmkgrursvazdz-482896107737.asia-southeast1.run.app'
    ].filter(Boolean)));

    const handleCopy = (text: string, index: number) => {
      navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    };

    return (
      <div className={`theme-${theme} min-h-screen bg-[#FDFCFB] flex flex-col items-center justify-center p-4`}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg bg-white p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-blue-900/5 text-center space-y-8 border border-gray-100"
        >
          <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto">
            <LogIn className="text-blue-600" size={32} />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">Selamat Datang</h1>
            <p className="text-gray-500">Silakan masuk untuk mengelola daftar anggota Anda.</p>
          </div>

          {loginError && (
            <div className={`border rounded-2xl p-5 text-left space-y-4 ${
              loginError.isCancellation 
                ? 'bg-amber-50 border-amber-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start gap-3">
                {loginError.isCancellation ? (
                  <Info className="text-amber-600 shrink-0 mt-0.5" size={18} />
                ) : (
                  <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
                )}
                <div className="space-y-1">
                  <h4 className={`text-sm font-bold ${
                    loginError.isCancellation ? 'text-amber-900' : 'text-red-900'
                  }`}>
                    {loginError.isCancellation ? 'Masuk Dibatalkan' : 'Gagal Masuk (Autentikasi Ditolak)'}
                  </h4>
                  <p className={`text-xs ${
                    loginError.isCancellation ? 'text-amber-700' : 'text-red-700'
                  }`}>
                    {loginError.isCancellation 
                      ? 'Proses masuk ditutup atau dibatalkan. Silakan klik tombol di bawah untuk mencoba lagi.'
                      : (loginError.isDomainError 
                          ? "Domain aplikasi ini belum diizinkan di Firebase Authentication proyek Anda (Error: auth/unauthorized-domain)."
                          : loginError.message)}
                  </p>
                </div>
              </div>

              {loginError.isDomainError && (
                <div className="bg-white/90 p-3.5 rounded-xl border border-red-100 space-y-3 text-xs text-gray-700 font-sans">
                  <p className="font-semibold text-gray-900">Langkah penyelesaian:</p>
                  <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                    <li>Buka <a href="https://console.firebase.google.com/project/kas-logistik/authentication/settings" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-extrabold inline-flex items-center gap-1">Firebase Console <Info size={12} className="inline" /></a></li>
                    <li>Samping kanan tab, pilih tab <strong>Settings</strong> lalu klik submenu <strong>Authorized Domains</strong> (Domain Terotorisasi).</li>
                    <li>Klik <strong>Add domain</strong> (Tambahkan domain), lalu salin dan tambahkan domain di bawah ini:</li>
                  </ol>

                  <div className="space-y-1.5 mt-2.5">
                    {domainsToAuthorize.map((domain, index) => (
                      <div key={domain} className="flex items-center justify-between bg-gray-50 border border-gray-200 py-1.5 px-3 rounded-lg font-mono text-[11px] select-all">
                        <span className="truncate mr-2 font-medium">{domain}</span>
                        <button 
                          onClick={() => handleCopy(domain, index)}
                          className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-700 shrink-0"
                        >
                          {copiedIndex === index ? 'Disalin!' : 'Salin'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={login}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-200"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 bg-white rounded-full p-0.5" />
            Lanjut dengan Google
          </button>
        </motion.div>
      </div>
    );
  }

  const tabs: { id: TabType; label: string; icon: any }[] = [
    { id: 'driver', label: 'Driver', icon: Truck },
    { id: 'helper', label: 'Helper', icon: Users },
    { id: 'transaction', label: 'Transaksi', icon: Plus },
  ];

  return (
    <div className={`theme-${theme} min-h-screen bg-gray-50/50 flex flex-col transition-colors duration-300`}>
      <NotificationManager user={user} />
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-8">
              <h1 className="text-xl font-bold text-blue-600 tracking-tight hidden md:block">LogisticsManager</h1>
              <div className="flex items-center bg-gray-100/80 p-1 rounded-xl overflow-x-auto max-w-[calc(100vw-120px)] md:max-w-none no-scrollbar">
                {tabs.map((tab) => (
                  <TabButton
                    key={tab.id}
                    id={tab.id}
                    label={tab.label}
                    icon={tab.icon}
                    isActive={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    onLongPress={() => console.log('Long press on', tab.label)}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2.5 md:gap-3">
              {/* Exit Frame / Buka Tab Baru Button */}
              {currentUrl && (
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 hover:text-gray-950 font-bold rounded-2xl transition-all border border-gray-100 select-none active:scale-95 flex-shrink-0"
                  title="Buka Aplikasi di Tab Baru (Keluar dari Frame)"
                >
                  <ExternalLink size={17} className="text-gray-500" />
                  <span className="hidden sm:inline text-xs">Buka Tab Baru</span>
                </a>
              )}

              {/* Notification Button and Badge */}
              <div className="relative">
                <button
                  onClick={() => {
                    setIsNotificationsOpen(!isNotificationsOpen);
                    setIsMenuOpen(false);
                  }}
                  className={`relative flex items-center justify-center p-2.5 rounded-2xl transition-all border select-none active:scale-95 flex-shrink-0 ${
                    isNotificationsOpen 
                      ? 'bg-blue-50 border-blue-200 text-blue-600 ring-2 ring-blue-100' 
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-700 hover:text-gray-950 border-gray-100'
                  }`}
                  aria-label="Notification Center"
                >
                  <Bell size={18} className={pendingVerifications.length > 0 ? "animate-wiggle" : ""} />
                  {pendingVerifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white font-black text-[9px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 border-2 border-white">
                      {pendingVerifications.length}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {isNotificationsOpen && (
                    <>
                      {/* Backdrop to close notifications */}
                      <div className="fixed inset-0 z-10" onClick={() => setIsNotificationsOpen(false)} />
                      
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-3xl shadow-2xl shadow-gray-200/50 border border-gray-100 py-3.5 z-20"
                      >
                        <div className="px-4 pb-3 border-b border-gray-100 mb-2.5 flex items-center justify-between">
                          <div className="text-left font-sans">
                            <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest leading-none">Pemberitahuan</p>
                            <span className="text-[11px] text-gray-500 font-medium">Informasi dan persetujuan iuran</span>
                          </div>
                          {pendingVerifications.length > 0 && (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 font-black text-[9px] rounded-lg uppercase tracking-wider pl-1.5 flex items-center gap-1.5 select-none shrink-0 font-sans">
                              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
                              {pendingVerifications.length} Pending
                            </span>
                          )}
                        </div>

                        <div className="max-h-80 overflow-y-auto px-1">
                          {pendingVerifications.length === 0 ? (
                            <div className="py-8 px-4 text-center flex flex-col items-center justify-center">
                              <div className="w-11 h-11 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-2.5">
                                <Check size={18} className="stroke-[3]" />
                              </div>
                              <p className="text-sm font-extrabold text-gray-900 font-sans">TIDAK ADA PENDING</p>
                              <p className="text-xs text-gray-400 mt-1 font-sans">Semua bukti pembayaran iuran Anda lunas terverifikasi.</p>
                            </div>
                          ) : (
                            <div className="divide-y divide-gray-50">
                              {pendingVerifications.map((item) => (
                                <div 
                                  key={`${item.memberId}-${item.month}`} 
                                  className="p-3.5 hover:bg-gray-50/80 rounded-2xl transition-all text-left space-y-2 group"
                                >
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="space-y-0.5 text-left font-sans">
                                      <h4 className="font-extrabold text-sm text-gray-950 truncate max-w-[150px] md:max-w-[200px]">
                                        {item.memberName}
                                      </h4>
                                      <p className="text-[10px] uppercase font-black tracking-wide text-gray-400">
                                        {item.memberType === 'driver' ? 'Driver' : 'Helper'}
                                      </p>
                                    </div>
                                    <span className="text-[10px] font-black uppercase text-blue-700 bg-blue-50/80 px-2.5 py-1 rounded-xl shrink-0 font-sans border border-blue-100/50">
                                      Bulan {item.month}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between text-[11px] text-gray-500 bg-gray-50/85 p-2 rounded-xl border border-gray-100/50 font-sans">
                                    <span>Metode: <strong className="font-extrabold text-gray-700">{item.method}</strong></span>
                                    <span className="font-extrabold text-emerald-600">Rp 25.000</span>
                                  </div>

                                  <button
                                    onClick={() => {
                                      setActiveTab('pending');
                                      setIsNotificationsOpen(false);
                                    }}
                                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] rounded-xl tracking-wider uppercase transition-all flex items-center justify-center gap-1 active:scale-95 shadow-sm font-sans"
                                  >
                                    <Clock size={11} className="stroke-[2.5]" />
                                    Verifikasi Sekarang
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {pendingVerifications.length > 0 && (
                          <div className="px-3 pt-2.5 border-t border-gray-50 mt-2">
                            <button
                              onClick={() => {
                                setActiveTab('pending');
                                setIsNotificationsOpen(false);
                              }}
                              className="w-full text-center py-2 text-xs font-black text-blue-600 hover:text-blue-700 hover:underline bg-blue-50/30 rounded-xl font-sans"
                            >
                              Lihat Semua Persetujuan ({pendingVerifications.length})
                            </button>
                          </div>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Menu Admin dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setIsMenuOpen(!isMenuOpen);
                    setIsNotificationsOpen(false);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 hover:text-gray-950 font-bold rounded-2xl transition-all border border-gray-100 select-none active:scale-95 flex-shrink-0"
                >
                  <Menu size={18} />
                  <span className="hidden md:inline text-xs">Menu Admin</span>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`} />
                </button>

              <AnimatePresence>
                {isMenuOpen && (
                  <>
                    {/* Backdrop to close menu */}
                    <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)} />
                    
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="absolute right-0 mt-2 w-56 bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 py-2.5 z-20"
                    >
                      <div className="px-4 py-2 border-b border-gray-100 mb-2">
                        <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider">Opsi Pengelola</p>
                        <p className="text-xs text-gray-700 font-bold truncate mt-0.5">
                          {localStorage.getItem('ADMIN_NICKNAME') || 'Admin'}
                        </p>
                        {user?.email && (
                          <p className="text-[10px] text-gray-400 truncate mt-0.5 font-normal">
                            {user.email}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          setActiveTab('pending');
                          setIsMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition-all hover:bg-gray-50 text-gray-700 ${
                          activeTab === 'pending' ? 'text-blue-600 bg-blue-50/20 font-extrabold' : ''
                        }`}
                      >
                        <Clock size={16} className={activeTab === 'pending' ? 'text-blue-600' : 'text-gray-400'} />
                        Verifikasi pembayaran
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab('history');
                          setIsMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition-all hover:bg-gray-50 text-gray-700 ${
                          activeTab === 'history' ? 'text-blue-600 bg-blue-50/20 font-extrabold' : ''
                        }`}
                      >
                        <Activity size={16} className={activeTab === 'history' ? 'text-blue-600' : 'text-gray-400'} />
                        Riwayat aktivitas
                      </button>

                      {isAdminSuperAdmin && (
                        <button
                          onClick={() => {
                            setActiveTab('admin_manager');
                            setIsMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition-all hover:bg-emerald-50 text-gray-700 ${
                            activeTab === 'admin_manager' ? 'text-emerald-600 bg-emerald-50/20 font-extrabold' : ''
                          }`}
                        >
                          <ShieldCheck size={16} className={activeTab === 'admin_manager' ? 'text-emerald-600' : 'text-emerald-500'} />
                          Kelola Admin
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setShowChangeNicknameModal(true);
                          setIsMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition-all hover:bg-gray-50 text-gray-700"
                      >
                        <UserIcon size={16} className="text-gray-400" />
                        Ganti nickname
                      </button>

                      <button
                        onClick={() => {
                          setShowChangePinModal(true);
                          setIsMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition-all hover:bg-gray-50 text-gray-700"
                      >
                        <Key size={16} className="text-gray-400" />
                        Ganti pin
                      </button>

                      <button
                        onClick={() => {
                          setShowFcmModal(true);
                          setIsMenuOpen(false);
                          // Refresh current browser notification permission
                          if (typeof Notification !== 'undefined') {
                            setFcmPermission(Notification.permission);
                          }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition-all hover:bg-gray-50 text-gray-700"
                      >
                        <Bell size={16} className="text-gray-400" />
                        Pengaturan Push (FCM)
                      </button>

                      <div className="border-t border-gray-100 my-2" />

                      {/* Theme selection integrated inside Admin Menu */}
                      <div className="px-4 py-2 bg-gray-50/40 rounded-2xl mx-2 border border-gray-100/50">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Palette size={13} className="text-gray-400" />
                          <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-widest leading-none text-left font-sans">Pilih Tema</p>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {[
                            { id: 'slate', title: 'Slate', icon: '⚪' },
                            { id: 'midnight', title: 'Cosmic', icon: '🌌' },
                            { id: 'forest', title: 'Forest', icon: '🌿' },
                            { id: 'sepia', title: 'Sepia', icon: '🌅' },
                          ].map((t) => (
                            <button
                              key={t.id}
                              onClick={() => changeTheme(t.id as any)}
                              className={`flex flex-col items-center justify-center p-1.5 rounded-xl transition-all border select-none cursor-pointer active:scale-95 ${
                                theme === t.id 
                                  ? 'bg-blue-50 border-blue-200 text-blue-600 scale-105 shadow-xs' 
                                  : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-150'
                              }`}
                              title={t.title}
                            >
                              <span className="text-xs leading-none">{t.icon}</span>
                              <span className="text-[8px] font-bold mt-1 leading-none tracking-tight font-sans">{t.title}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-gray-100 my-2" />

                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          setShowLogoutModal(true);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-bold transition-all hover:bg-red-50 text-red-600"
                      >
                        <LogOut size={16} className="text-red-500" />
                        Logout
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </nav>

    {!isOnline && (
      <div className="bg-amber-500 text-white text-[11px] md:text-sm font-bold py-3.5 px-4 text-center flex items-center justify-center gap-2.5 shadow-md z-40 relative">
        <AlertCircle size={16} className="shrink-0 animate-pulse" />
        <span>Sinyal Internet Terputus (Mode Offline). Data iuran tetap aman tersimpan di HP Anda & otomatis sinkron saat sinyal kembali!</span>
      </div>
    )}

      {showRulesAlert && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6 w-full">
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 text-left space-y-4 shadow-sm relative overflow-hidden"
          >
            {/* Background design accents */}
            <div className="absolute right-0 top-0 w-24 h-24 bg-amber-100/30 rounded-full blur-xl -mr-6 -mt-6 pointer-events-none" />
            
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="text-amber-605 shrink-0 mt-1 text-amber-600" size={24} />
                <div className="space-y-1.5">
                  <h3 className="text-base font-extrabold text-amber-950 font-sans">Konfigurasi Aturan Firestore Diperlukan</h3>
                  <p className="text-xs text-amber-850 leading-relaxed font-sans max-w-4xl text-amber-800">
                    Kami mendeteksi adanya error <strong>"Missing or insufficient permissions"</strong>. Ini terjadi karena aturan keamanan Firestore pada proyek Firebase <strong>kas-logistik</strong> menolak akses baca/tulis.
                    Ikuti langkah di bawah ini untuk menerapkan aturan keamanan agar aplikasi dapat bekerja.
                  </p>
                </div>
              </div>
              
              <button 
                onClick={() => setShowRulesAlert(false)}
                className="text-amber-400 hover:text-amber-700 p-1.5 hover:bg-amber-100/50 rounded-full transition-all active:scale-95 shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-white/80 p-5 rounded-2xl border border-amber-100/50 space-y-3 text-xs leading-relaxed text-gray-700">
              <ol className="list-decimal list-inside space-y-2 font-sans font-medium text-gray-800">
                <li>Buka <a href="https://console.firebase.google.com/project/kas-logistik/firestore/rules" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-extrabold inline-flex items-center gap-1">Aturan Keamanan di Firebase Console <Info size={12} className="inline" /></a></li>
                <li>Hapus aturan yang ada di editor, lalu salin dan tempel aturan keamanan di bawah ini penuh:</li>
              </ol>

              <div className="relative group/code mt-3">
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl font-mono text-[11px] overflow-x-auto max-h-48 text-left leading-normal border border-gray-800 select-all">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function isSignedIn() {
      return request.auth != null;
    }
    
    function isValidId(id) {
      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$');
    }

    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    match /admins/{adminId} {
      allow read: if isSignedIn();
      allow create, update, delete: if isSignedIn();
    }

    match /members/{memberId} {
      allow read: if true;
      allow create: if isSignedIn();
      allow update: if isSignedIn();
      allow delete: if isSignedIn();
    }

    match /transactions/{transactionId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update: if isSignedIn();
      allow delete: if isSignedIn();
    }

    match /activities/{activityId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn() && isValidId(activityId);
      allow update, delete: if false;
    }

    match /settings/{settingId} {
      allow read: if isSignedIn();
      allow create, update: if isSignedIn() && isValidId(settingId);
      allow delete: if false;
    }
  }
}`}
                </pre>
                <button
                  onClick={() => {
                    const rulesText = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if false;\n    }\n\n    function isSignedIn() {\n      return request.auth != null;\n    }\n    \n    function isValidId(id) {\n      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$');\n    }\n\n    function incoming() {\n      return request.resource.data;\n    }\n\n    function existing() {\n      return resource.data;\n    }\n\n    match /admins/{adminId} {\n      allow read: if isSignedIn();\n      allow create, update, delete: if isSignedIn();\n    }\n\n    match /members/{memberId} {\n      allow read: if true;\n      allow create: if isSignedIn();\n      allow update: if isSignedIn();\n      allow delete: if isSignedIn();\n    }\n\n    match /transactions/{transactionId} {\n      allow read: if isSignedIn();\n      allow create: if isSignedIn();\n      allow update: if isSignedIn();\n      allow delete: if isSignedIn();\n    }\n\n    match /activities/{activityId} {\n      allow read: if isSignedIn();\n      allow create: if isSignedIn() && isValidId(activityId);\n      allow update, delete: if false;\n    }\n\n    match /settings/{settingId} {\n      allow read: if isSignedIn();\n      allow create, update: if isSignedIn() && isValidId(settingId);\n      allow delete: if false;\n    }\n  }\n}`;
                    navigator.clipboard.writeText(rulesText);
                    setCopiedRules(true);
                    setTimeout(() => setCopiedRules(false), 3000);
                  }}
                  className="absolute top-3 right-3 bg-gray-800 hover:bg-gray-700 text-white font-extrabold uppercase text-[10px] px-3 py-1.5 rounded-lg active:scale-95 shadow-md border border-gray-700 hover:border-gray-600 transition-all"
                >
                  {copiedRules ? 'Disalin!' : 'Salin Aturan'}
                </button>
              </div>

              <div className="flex items-center gap-2 text-[10px] text-amber-800 font-extrabold uppercase mt-1">
                <span className="w-1.5 h-1.5 bg-amber-600 rounded-full animate-ping shrink-0" />
                <span>Setelah menyalin, klik "Publish" di konsol Firebase untuk langsung mengaktifkannya!</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <main className="flex-1 w-full pt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'driver' && <MemberList type="driver" />}
            {activeTab === 'helper' && <MemberList type="helper" />}
            {activeTab === 'transaction' && <div className="max-w-7xl mx-auto px-4 md:px-8"><TransactionList minimal={false} /></div>}
            {activeTab === 'pending' && <PendingVerifications />}
            {activeTab === 'history' && <div className="max-w-7xl mx-auto px-4 md:px-8"><ActivityList /></div>}
            {activeTab === 'admin_manager' && <AdminManager />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogoutModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl p-6 overflow-hidden z-[110] border border-gray-100"
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <LogOut size={20} className="stroke-[2.5]" />
                </div>
                <h3 className="text-base font-bold text-gray-900 tracking-tight">Konfirmasi Logout</h3>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                  Apakah Anda yakin ingin keluar dari akun pengelola Kas SNJ Logistik? Anda perlu masuk kembali menggunakan akun Google terdaftar untuk mengakses panel admin.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogoutModal(false)}
                  className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold rounded-2xl transition-all text-xs border border-gray-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLogoutModal(false);
                    isSessionTerminatingRef.current = true;
                    auth.signOut();
                  }}
                  className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-all text-xs shadow-lg shadow-red-100 cursor-pointer"
                >
                  Ya, Logout
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Change Nickname Modal */}
      <AnimatePresence>
        {showChangeNicknameModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChangeNicknameModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl p-6 overflow-hidden z-[110] border border-gray-100"
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <UserIcon size={20} className="stroke-[2.5]" />
                </div>
                <h3 className="text-lg font-black text-gray-900 leading-tight">Ubah Nickname</h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1">Ganti Nama Panggilan Anda</p>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50/85 p-3.5 rounded-2xl border border-gray-100 text-xs text-left">
                  <span className="text-gray-400 font-semibold uppercase tracking-wider block">Nickname Saat Ini</span>
                  <span className="text-gray-800 font-extrabold block text-sm mt-0.5">
                    {localStorage.getItem('ADMIN_NICKNAME') || '(Belum diatur)'}
                  </span>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1">
                    Nickname Baru
                  </label>
                  <input
                    type="text"
                    value={newNickname}
                    onChange={(e) => {
                      setNewNickname(e.target.value);
                      setNicknameError('');
                    }}
                    placeholder="Masukkan nickname baru..."
                    className="w-full px-4 py-3 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold"
                  />
                  {nicknameError && (
                    <p className="text-xs font-bold text-red-500 mt-1 pl-1">{nicknameError}</p>
                  )}
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangeNicknameModal(false);
                      setNewNickname('');
                      setNicknameError('');
                    }}
                    className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 font-bold rounded-2xl transition-all text-xs"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newNickname.trim()) {
                        setNicknameError('Nickname tidak boleh kosong');
                        return;
                      }
                      localStorage.setItem('ADMIN_NICKNAME', newNickname.trim());
                      setShowChangeNicknameModal(false);
                      setNewNickname('');
                      setNicknameError('');
                    }}
                    className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all text-xs shadow-lg shadow-blue-100"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Change PIN Modal */}
      <AnimatePresence>
        {showChangePinModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowChangePinModal(false);
                setCurrentPin('');
                setNewPin('');
                setPinError('');
                setPinSuccess('');
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl p-6 overflow-hidden z-[110] border border-gray-100"
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Key size={20} className="stroke-[2.5]" />
                </div>
                <h3 className="text-lg font-black text-gray-900 leading-tight">Ganti PIN Admin</h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1">Keamanan Tambahan</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1">
                    PIN Saat Ini
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={currentPin}
                    onChange={(e) => {
                      setCurrentPin(e.target.value);
                      setPinError('');
                    }}
                    placeholder="••••"
                    className="w-full px-4 py-3 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold text-center tracking-[0.5em]"
                  />
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block ml-1">
                    PIN Baru (4 Digit)
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => {
                      setNewPin(e.target.value);
                      setPinError('');
                    }}
                    placeholder="••••"
                    className="w-full px-4 py-3 rounded-2xl border border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold text-center tracking-[0.5em]"
                  />
                </div>

                {pinError && (
                  <p className="text-xs font-bold text-red-500 text-center">{pinError}</p>
                )}
                {pinSuccess && (
                  <p className="text-xs font-bold text-green-600 text-center">{pinSuccess}</p>
                )}

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangePinModal(false);
                      setCurrentPin('');
                      setNewPin('');
                      setPinError('');
                      setPinSuccess('');
                    }}
                    className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 font-bold rounded-2xl transition-all text-xs"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const correctPin = localStorage.getItem('ADMIN_PIN') || '1234';
                      if (currentPin !== correctPin) {
                        setPinError('PIN saat ini salah');
                        return;
                      }
                      if (newPin.length !== 4 || isNaN(Number(newPin))) {
                        setPinError('PIN baru harus berupa 4 digit angka');
                        return;
                      }
                      
                      localStorage.setItem('ADMIN_PIN', newPin);
                      setPinSuccess('PIN berhasil diganti!');
                      setTimeout(() => {
                        setShowChangePinModal(false);
                        setCurrentPin('');
                        setNewPin('');
                        setPinError('');
                        setPinSuccess('');
                      }, 1000);
                    }}
                    className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all text-xs shadow-lg shadow-blue-100"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cloud Push Notification (FCM) Modal */}
      <AnimatePresence>
        {showFcmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowFcmModal(false);
                setFcmTestResponse(null);
                setCopiedToken(false);
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 md:p-8 overflow-hidden z-[110] border border-gray-100"
            >
              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3.5 relative">
                  <Bell size={24} className="stroke-[2.5]" />
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white animate-ping" />
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
                </div>
                <h3 className="text-xl font-black text-gray-950 leading-tight">Pengaturan Notifikasi Push</h3>
                <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest mt-1">Firebase Cloud Messaging</p>
              </div>

              {/* Status Section */}
              <div className="space-y-4 mb-6">
                <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100/50 space-y-3.5 text-left">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-bold shrink-0">Izin Notifikasi Browser:</span>
                    <span className={`px-2.5 py-1 rounded-xl font-black text-[10px] uppercase tracking-wider ${
                      fcmPermission === 'granted'
                        ? 'bg-green-50 text-green-700 border border-green-150'
                        : fcmPermission === 'denied'
                        ? 'bg-red-50 text-red-700 border border-red-150'
                        : 'bg-amber-50 text-amber-700 border border-amber-150'
                    }`}>
                      {fcmPermission === 'granted' ? 'Diizinkan ✅' : fcmPermission === 'denied' ? 'Ditolak ❌' : 'Ditanyakan ⚠️'}
                    </span>
                  </div>

                  {fcmPermission !== 'granted' && (
                    <div className="text-[11px] text-gray-400 leading-relaxed font-normal bg-white p-3 rounded-xl border border-gray-100/70">
                      {fcmPermission === 'denied' ? (
                        <span>
                          <strong>Izin Notifikasi Diblokir.</strong> Atur ulang izin notifikasi di setting browser Anda (klik ikon gembok di sebelah URL) agar dapat menerima pemberitahuan.
                        </span>
                      ) : (
                        <span>
                          Dapatkan pemberitahuan iuran kas real-time langsung di browser/ponsel Anda ketika ada aktivitas keuangan baru.
                        </span>
                      )}
                    </div>
                  )}

                  {fcmPermission !== 'granted' && (
                    <button
                      type="button"
                      onClick={requestFcmPermission}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-blue-105"
                    >
                      <Bell size={13} className="stroke-[2.5]" />
                      Berikan Izin Notifikasi
                    </button>
                  )}
                </div>

                {/* Integration Details / Token */}
                {fcmPermission === 'granted' && (
                  <div className="space-y-2 text-left">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-gray-500 font-bold">FCM Device Token Anda:</label>
                      {fcmToken && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(fcmToken);
                            setCopiedToken(true);
                            setTimeout(() => setCopiedToken(false), 2000);
                          }}
                          className="text-[10px] text-blue-600 hover:text-blue-700 font-black flex items-center gap-1.5 uppercase select-none active:scale-95 animate-fade-in"
                        >
                          <Copy size={11} className="stroke-[2.5]" />
                          {copiedToken ? 'Tersalin! ✅' : 'Salin Token'}
                        </button>
                      )}
                    </div>
                    {fcmToken ? (
                      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 font-mono text-[10px] text-gray-600 select-all leading-normal whitespace-normal break-all max-h-20 overflow-y-auto">
                        {fcmToken}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-xs text-gray-400 italic bg-gray-50 rounded-2xl border border-dashed border-gray-200 flex flex-col items-center justify-center gap-1.5 select-none">
                        <Loader2 size={16} className="animate-spin text-gray-400" />
                        Mengambil token FCM dari Google, lapor...
                      </div>
                    )}
                  </div>
                )}

                {/* Test Push Section */}
                {fcmPermission === 'granted' && fcmToken && (
                  <div className="border-t border-gray-100 pt-4 mt-2 space-y-3.5 text-left">
                    <span className="text-xs font-bold text-gray-900 block">Kirim Contoh Tes Notifikasi:</span>
                    
                    <div className="space-y-2.5">
                      <div>
                        <label className="text-[10px] uppercase font-black tracking-wide text-gray-400">Judul Pesan</label>
                        <input
                          type="text"
                          value={fcmTestTitle}
                          onChange={(e) => setFcmTestTitle(e.target.value)}
                          placeholder="Contoh: Pembayaran Iuran"
                          className="w-full bg-gray-50 border border-gray-150 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all font-semibold text-gray-800"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-black tracking-wide text-gray-400">Isi Notifikasi</label>
                        <input
                          type="text"
                          value={fcmTestBody}
                          onChange={(e) => setFcmTestBody(e.target.value)}
                          placeholder="Contoh: Iuran anggota Mancung berhasil dikonfirmasi"
                          className="w-full bg-gray-50 border border-gray-150 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all font-semibold text-gray-800"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={sendFcmTest}
                      disabled={sendingFcmTest || !fcmToken}
                      className="w-full py-3 bg-slate-900 hover:bg-slate-950 text-white font-black text-xs rounded-xl tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-md disabled:opacity-50"
                    >
                      {sendingFcmTest ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          Mengirim...
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} className="fill-white" />
                          Kirim Tes via Server
                        </>
                      )}
                    </button>

                    {fcmTestResponse && (
                      <div className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-2 ${
                        fcmTestResponse.success 
                          ? 'bg-green-50 text-green-800 border-green-100' 
                          : 'bg-red-50 text-red-800 border-red-100'
                      }`}>
                        <div className="mt-0.5 font-bold">
                          {fcmTestResponse.success ? '✓' : '⚠'}
                        </div>
                        <p className="font-semibold">{fcmTestResponse.message}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Close Footer */}
              <button
                type="button"
                onClick={() => {
                  setShowFcmModal(false);
                  setFcmTestResponse(null);
                  setCopiedToken(false);
                }}
                className="w-full py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-850 font-bold rounded-2xl transition-all text-xs"
              >
                Tutup Jendela
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

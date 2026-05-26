import { useState, useEffect, useRef } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import { collection, query, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, messaging, activeDatabaseId, configuredDatabaseId, isFirestorePermissionDenied } from './lib/firebase';
import firebaseConfig from '../firebase-applet-config.json';
import firestoreRulesText from '../firestore.rules?raw';
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
  const [isIframe, setIsIframe] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsIframe(window.self !== window.top);
    }
  }, []);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const [isAdminSuperAdmin, setIsAdminSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('driver');
  const [loginError, setLoginError] = useState<{ code: string; message: string; isDomainError: boolean; isConfigError?: boolean; isCancellation?: boolean; isPermissionError?: boolean } | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Menu and Modals state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showChangeNicknameModal, setShowChangeNicknameModal] = useState(false);
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

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
  const [databaseOverrideCleared, setDatabaseOverrideCleared] = useState(false);
  
  // Real-time network monitor state
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const databaseOverride = typeof localStorage !== 'undefined'
    ? localStorage.getItem('FIRESTORE_DATABASE_ID_OVERRIDE')
    : null;
  const hasDatabaseOverride = !!databaseOverride;
  const isUsingNonDefaultDatabase = activeDatabaseId !== '(default)';

  const clearDatabaseOverride = () => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem('FIRESTORE_DATABASE_ID_OVERRIDE');
    setDatabaseOverrideCleared(true);
  };

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
        console.log("onAuthStateChanged triggered for user:", {
          uid: currentUser.uid,
          email: currentUser.email,
          providerData: currentUser.providerData?.map(p => ({ providerId: p.providerId, email: p.email }))
        });
        isSessionTerminatingRef.current = true; // Suspend permission-denied alerts during auth transitions/checks
        setLoading(true);
        try {
          const userEmail = currentUser.email || currentUser.providerData?.[0]?.email || null;
          const registered = await isEmailRegistered(userEmail);
          if (!registered) {
            isSessionTerminatingRef.current = true;
            await signOut(auth);
            setUser(null);
            setLoginError({
              code: 'unregistered-email',
              message: 'Email Anda (' + (userEmail || 'tidak diketahui') + ') tidak terdaftar sebagai pengelola (Admin) Kas SNJ Logistik. Silakan hubungi Super Admin untuk mendaftarkan email Anda.',
              isDomainError: false,
              isCancellation: false
            });
            setLoading(false);
            return;
          }

          isSessionTerminatingRef.current = false;
          setUser(currentUser);
          let isSuper = false;
          const userEmailLower = userEmail ? userEmail.toLowerCase() : '';
          if (userEmailLower === 'mancung168@gmail.com' || userEmailLower === 'gptspay@gmail.com') {
            isSuper = true;
            localStorage.setItem('ADMIN_NICKNAME', userEmailLower === 'gptspay@gmail.com' ? 'GPTSPay_Admin' : 'Mancung_168');
          } else {
            const adminRecord = await getAdminByEmail(userEmail);
            if (adminRecord) {
              isSuper = adminRecord.role === 'super-admin';
              if (adminRecord.name) {
                localStorage.setItem('ADMIN_NICKNAME', adminRecord.name);
              }
            }
          }
          localStorage.setItem('ADMIN_EMAIL', userEmail || '');
          localStorage.setItem('ADMIN_ROLE', isSuper ? 'super-admin' : 'admin');
          setIsAdminSuperAdmin(isSuper);
        } catch (err) {
          console.error('Error verifying email registration state:', err);
          const isPermissionErr = isFirestorePermissionDenied(err);
          isSessionTerminatingRef.current = true;
          await signOut(auth);
          setUser(null);
          localStorage.removeItem('ADMIN_NICKNAME');
          localStorage.removeItem('ADMIN_EMAIL');
          localStorage.removeItem('ADMIN_ROLE');
          setIsAdminSuperAdmin(false);
          setLoginError({
            code: isPermissionErr ? 'firestore-permission-denied' : 'admin-verification-failed',
            message: isPermissionErr
              ? `Firestore menolak akses saat memverifikasi akun admin. Periksa Firestore Rules, koleksi admins/admins_by_email, dan database aktif "${activeDatabaseId}".`
              : 'Verifikasi akun admin gagal. Silakan coba lagi atau periksa konfigurasi Firebase Anda.',
            isDomainError: false,
            isCancellation: false,
            isPermissionError: isPermissionErr
          });
          if (isPermissionErr) {
            setShowRulesAlert(true);
          }
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
    if (isSigningIn) return;
    setIsSigningIn(true);
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed:", error);
      const isDomainErr = error?.code === 'auth/unauthorized-domain' || error?.message?.includes('unauthorized-domain');
      const isCancellation = error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request';
      const isConfigErr = error?.code === 'auth/configuration-not-found' || error?.message?.includes('configuration-not-found');
      setLoginError({
        code: error?.code || 'unknown',
        message: isCancellation 
          ? 'Masuk dibatalkan atau terblokir.' 
          : (error?.message || 'Gagal masuk. Silakan coba lagi.'),
        isDomainError: isDomainErr,
        isConfigError: isConfigErr,
        isCancellation: isCancellation
      });
    } finally {
      setIsSigningIn(false);
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
    
    // Dynamically derive dev and pre domains from the current hostname to make it match any instance.
    let devDomain = '';
    let preDomain = '';
    if (currentDomain.startsWith('ais-dev-')) {
      devDomain = currentDomain;
      preDomain = currentDomain.replace('ais-dev-', 'ais-pre-');
    } else if (currentDomain.startsWith('ais-pre-')) {
      preDomain = currentDomain;
      devDomain = currentDomain.replace('ais-pre-', 'ais-dev-');
    }

    const domainsToAuthorize = Array.from(new Set([
      currentDomain,
      devDomain,
      preDomain,
      'localhost'
    ].filter(Boolean)));

    const handleCopy = (text: string, index: number) => {
      navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    };

    return (
      <div className={`theme-${theme} min-h-screen bg-[#FDFCFB] flex flex-col items-center justify-center p-4 relative`}>
        {isIframe && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-lg mb-4 bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-center justify-between gap-3 text-left shadow-sm"
          >
            <div className="flex items-start gap-2.5">
              <Info className="text-blue-600 mt-0.5 shrink-0 animate-pulse" size={18} />
              <div className="space-y-0.5">
                <h4 className="text-xs font-black text-blue-900 uppercase tracking-wide">Aplikasi di dalam Frame (Iframe)</h4>
                <p className="text-[11px] text-blue-700 font-semibold leading-relaxed">
                  Login Google Auth & verifikasi nota berjalan lebih optimal luar frame (tab baru).
                </p>
              </div>
            </div>
            <a
              href={typeof window !== 'undefined' ? window.location.href : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 hover:text-gray-950 border border-gray-100 font-extrabold text-[11px] rounded-2xl flex items-center gap-1.5 active:scale-95 transition-all shrink-0 uppercase tracking-widest shadow-xs"
            >
              <ExternalLink size={14} />
              Buka Tab Baru
            </a>
          </motion.div>
        )}

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
                    {loginError.isCancellation 
                      ? 'Masuk Dibatalkan' 
                      : (loginError.isPermissionError
                          ? 'Izin Firestore Ditolak'
                          : (loginError.isConfigError 
                              ? 'Google Auth Belum Aktif' 
                              : 'Gagal Masuk (Autentikasi Ditolak)'))}
                  </h4>
                  <p className={`text-xs ${
                    loginError.isCancellation ? 'text-amber-700' : 'text-red-700'
                  }`}>
                    {loginError.isCancellation 
                      ? 'Proses masuk ditutup sebelum selesai, atau diblokir oleh sistem keamanan browser Anda.'
                      : (loginError.isPermissionError
                          ? loginError.message
                      : (loginError.isDomainError 
                          ? "Domain aplikasi ini belum diizinkan di Firebase Authentication proyek Anda (Error: auth/unauthorized-domain)."
                          : (loginError.isConfigError
                              ? "Metode login Google belum diaktifkan di Firebase Console proyek Anda (Error: auth/configuration-not-found)."
                              : loginError.message)))}
                  </p>
                </div>
              </div>

              {loginError.isPermissionError && (
                <div className="bg-white/90 p-3.5 rounded-xl border border-red-100 space-y-3 text-xs text-gray-700 font-sans">
                  <p className="font-semibold text-gray-900 text-left">Hal yang perlu dicek:</p>
                  <ol className="list-decimal list-inside space-y-2 leading-relaxed text-left">
                    <li>Publish Firestore Rules yang terbaru dari file <code>firestore.rules</code>.</li>
                    <li>Pastikan email Google Anda sudah ada di koleksi <code>admins_by_email</code> atau termasuk admin hardcoded.</li>
                    <li>Pastikan database Firestore aktif sesuai konfigurasi aplikasi: <strong>{activeDatabaseId}</strong>.</li>
                  </ol>
                </div>
              )}

              {loginError.isCancellation && (
                <div className="bg-white/90 p-3.5 rounded-xl border border-amber-100 space-y-3 text-xs text-gray-700 font-sans">
                  <p className="font-semibold text-gray-900 text-left">Tips dan Langkah Penyelesaian:</p>
                  <ol className="list-decimal list-inside space-y-2 leading-relaxed text-left">
                    <li>Jangan tutup jendela kecil Google Auth yang muncul sebelum Anda selesai memilih email Anda.</li>
                    <li>Periksa apakah browser Anda <strong>memblokir Popup</strong> (biasanya ada ikon peringatan di ujung kanan bilah pencarian/URL browser Anda). Jika ada, pilih **Izinkan selalu popup** untuk situs ini.</li>
                    <li>Sangat direkomendasikan untuk <strong>Membuka Aplikasi di Tab Baru</strong> dengan mengeklik tombol keluar di pojok kanan atas preview AI Studio. Hal ini menghindari batasan keamanan <em>sandbox iframe</em> yang sering memblokir popup Google Auth secara otomatis di beberapa browser (terutama Safari & Firefox).</li>
                  </ol>
                </div>
              )}

              {loginError.isDomainError && (
                <div className="bg-white/90 p-3.5 rounded-xl border border-red-100 space-y-3 text-xs text-gray-700 font-sans">
                  <p className="font-semibold text-gray-900 text-left">Langkah penyelesaian:</p>
                  <ol className="list-decimal list-inside space-y-2 leading-relaxed text-left">
                    <li>Buka <a href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-extrabold inline-flex items-center gap-1">Firebase Console <Info size={12} className="inline" /></a></li>
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

              {loginError.isConfigError && (
                <div className="bg-white/90 p-3.5 rounded-xl border border-red-100 space-y-3 text-xs text-gray-700 font-sans">
                  <p className="font-semibold text-gray-900 text-left">Langkah penyelesaian (Aktifkan Google Login):</p>
                  <ol className="list-decimal list-inside space-y-2 leading-relaxed text-left">
                    <li>Buka <a href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-extrabold inline-flex items-center gap-1">Firebase Console <Info size={12} className="inline" /></a></li>
                    <li>Klik tombol <strong>Get Started (Mulai)</strong> pada tab Authentication jika baru pertama kali membukanya.</li>
                    <li>Di bawah panel <strong>Sign-in method</strong>, klik tombol <strong>Add new provider</strong> lalu pilih <strong>Google</strong>.</li>
                    <li>Aktifkan sakelar <strong>Enable (Aktifkan)</strong> di kanan atas.</li>
                    <li>Pilih email dukungan proyek Anda (misal: <code className="bg-gray-100 px-1 rounded font-mono">mancung168@gmail.com</code> atau email pemilik akun) pada bagian <strong>Project support email</strong>.</li>
                    <li>Klik <strong>Save (Simpan)</strong>.</li>
                    <li>Kembali ke tab ini dan klik tombol <strong>Masuk dengan Google</strong> lagi!</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          <button
            onClick={login}
            disabled={isSigningIn}
            className={`w-full font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg ${
              isSigningIn 
                ? 'bg-blue-400 text-blue-100 cursor-not-allowed shadow-none' 
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
            }`}
          >
            {isSigningIn ? (
              <Loader2 className="animate-spin text-white" size={20} />
            ) : (
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 bg-white rounded-full p-0.5" />
            )}
            {isSigningIn ? 'Menghubungkan ke Google...' : 'Lanjut dengan Google'}
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
          <div className="flex items-center justify-between h-20 gap-4">
            <h1 className="text-xl font-bold text-blue-600 tracking-tight hidden md:block shrink-0">LogisticsManager</h1>
            <div className="flex-1 min-w-0 max-w-[280px] sm:max-w-md md:max-w-none flex items-center bg-gray-100/80 p-1 rounded-xl">
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
            <div className="flex items-center gap-2 max-w-fit shrink-0">
              {/* Breakout of iframe button if inside iframe */}
              {isIframe && (
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 p-2.5 sm:px-3.5 bg-gray-50 hover:bg-gray-100 text-gray-700 hover:text-gray-950 border border-gray-100 font-extrabold rounded-2xl transition-all select-none active:scale-95 flex-shrink-0 text-xs shadow-xs"
                  title="Keluarkan aplikasi dari frame (Buka di tab baru)"
                >
                  <ExternalLink size={18} />
                  <span className="hidden sm:inline">Keluarkan dari Frame</span>
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
                  className="flex items-center justify-center gap-2 p-2.5 md:px-4 bg-gray-50 hover:bg-gray-100 text-gray-700 hover:text-gray-950 font-bold rounded-2xl transition-all border border-gray-100 select-none active:scale-95 flex-shrink-0"
                >
                  <Menu size={18} />
                  <span className="hidden md:inline text-xs">Menu Admin</span>
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
                    Kami mendeteksi adanya error <strong>"Missing or insufficient permissions"</strong>. Ini terjadi karena aturan keamanan Firestore pada proyek Firebase <strong>{firebaseConfig.projectId}</strong> menolak akses baca/tulis.
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
                <li>Buka <a href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/rules`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-extrabold inline-flex items-center gap-1">Aturan Keamanan di Firebase Console <Info size={12} className="inline" /></a></li>
                <li>Hapus aturan yang ada di editor, lalu salin dan tempel aturan keamanan di bawah ini penuh:</li>
              </ol>

              <div className="bg-amber-100/60 border border-amber-200 rounded-xl p-3 space-y-2 text-[11px] text-amber-950 font-medium">
                <p><strong>Diagnostik Firestore:</strong> proyek aktif <code>{firebaseConfig.projectId}</code>, database terkonfigurasi <code>{configuredDatabaseId}</code>, database yang sedang dipakai app <code>{activeDatabaseId}</code>.</p>
                {isUsingNonDefaultDatabase && (
                  <p>Aplikasi ini sedang memakai database non-default. Pastikan rules dan koleksi admin diterapkan pada database tersebut, bukan hanya pada <code>(default)</code>.</p>
                )}
                {hasDatabaseOverride && (
                  <div className="space-y-2">
                    <p>Terdeteksi override database dari browser: <code>{databaseOverride}</code>. Ini bisa menyebabkan app menunjuk ke database yang salah.</p>
                    <button
                      type="button"
                      onClick={clearDatabaseOverride}
                      className="px-3 py-2 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 rounded-lg font-extrabold text-[10px] uppercase tracking-wide transition-all"
                    >
                      Hapus Override Database
                    </button>
                    {databaseOverrideCleared && (
                      <p className="text-emerald-700">Override dihapus. Muat ulang halaman untuk memakai database konfigurasi bawaan.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="relative group/code mt-3">
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl font-mono text-[11px] overflow-x-auto max-h-48 text-left leading-normal border border-gray-800 select-all">
{firestoreRulesText}
                </pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(firestoreRulesText);
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
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={currentPin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setCurrentPin(val);
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
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setNewPin(val);
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
    </div>
  );
}

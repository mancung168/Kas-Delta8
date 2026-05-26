import { db } from './firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query,
  where
} from 'firebase/firestore';

/**
 * Helper to wrap a promise with a timeout to prevent infinite hanging in sandbox/iframe environments.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs = 8000, errorMsg = 'Koneksi database Firestore lambat atau terputus. Silakan periksa jaringan dan coba lagi.'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs))
  ]);
}

export interface AdminItem {
  id: string; // normalized lowercased nickname
  name: string; // original casing for display
  email?: string; // admin email
  pin: string; // 4-digit pin code
  role: 'admin' | 'super-admin';
  createdAt?: any;
  updatedAt?: any;
}

/**
 * Checks if a specific email is registered as an admin.
 */
export async function isEmailRegistered(email: string | null): Promise<boolean> {
  if (!email) return false;
  const normalizedEmail = email.trim().toLowerCase();

  // Hardcoded admins are always registered/allowed
  if (
    normalizedEmail === 'mancung168@gmail.com' ||
    normalizedEmail === 'ncung.vu@gmail.com' ||
    normalizedEmail === 'mancung168.avk@gmail.com' ||
    normalizedEmail === 'gptspay@gmail.com'
  ) return true;

  try {
    // 1. Try direct lookup from admins_by_email using the lowercase email doc ID
    const docRef = doc(db, 'admins_by_email', normalizedEmail);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return true;
    }
  } catch (error) {
    console.warn('Error verifying email registration from admins_by_email:', error);
  }

  // 2. Fallback queries
  try {
    const q = query(collection(db, 'admins'), where('email', '==', email.trim()));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) return true;

    const qLower = query(collection(db, 'admins'), where('email', '==', normalizedEmail));
    const querySnapshotLower = await getDocs(qLower);
    return !querySnapshotLower.empty;
  } catch (error) {
    console.error('Error verifying email registration fallback:', error);
    return false;
  }
}

/**
 * Retrieves the admin record by email.
 */
export async function getAdminByEmail(email: string | null): Promise<AdminItem | null> {
  if (!email) return null;
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail === 'mancung168@gmail.com') {
    return {
      id: 'mancung_168',
      name: 'Mancung_168',
      pin: '1234',
      role: 'super-admin',
      email: 'mancung168@gmail.com'
    };
  }

  if (normalizedEmail === 'gptspay@gmail.com') {
    return {
      id: 'gptspay_admin',
      name: 'GPTSPay_Admin',
      pin: '1234',
      role: 'super-admin',
      email: 'gptspay@gmail.com'
    };
  }

  if (normalizedEmail === 'ncung.vu@gmail.com') {
    return {
      id: 'ncung_vu',
      name: 'ncung.vu',
      pin: '1234',
      role: 'admin',
      email: 'ncung.vu@gmail.com'
    };
  }

  if (normalizedEmail === 'mancung168.avk@gmail.com') {
    return {
      id: 'mancung_avk',
      name: 'mancung168_avk',
      pin: '1234',
      role: 'admin',
      email: 'mancung168.avk@gmail.com'
    };
  }

  try {
    // 1. Try direct document fetch from admins_by_email using lowercase email doc ID
    const emailDocRef = doc(db, 'admins_by_email', normalizedEmail);
    const emailDocSnap = await getDoc(emailDocRef);
    if (emailDocSnap.exists()) {
      const data = emailDocSnap.data();
      if (data && data.nickname) {
        const adminDocRef = doc(db, 'admins', data.nickname);
        const adminDocSnap = await getDoc(adminDocRef);
        if (adminDocSnap.exists()) {
          return { ...adminDocSnap.data() as AdminItem, id: adminDocSnap.id };
        }
      }
    }
  } catch (error) {
    console.warn('Error fetching admin by email lookup document:', error);
  }

  // 2. Fallbacks
  try {
    const q = query(collection(db, 'admins'), where('email', '==', email.trim()));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      return { ...docSnap.data() as AdminItem, id: docSnap.id };
    }

    const qLower = query(collection(db, 'admins'), where('email', '==', normalizedEmail));
    const querySnapshotLower = await getDocs(qLower);
    if (!querySnapshotLower.empty) {
      const docSnap = querySnapshotLower.docs[0];
      return { ...docSnap.data() as AdminItem, id: docSnap.id };
    }
  } catch (error) {
    console.error('Error fetching admin by email fallback query:', error);
  }
  return null;
}

// Normalize nickname for document ID and lookup
const normalizeName = (name: string): string => {
  return name.trim().toLowerCase();
};

/**
 * Checks if a nickname is the master super-admin.
 */
export function isMasterSuperAdmin(name: string): boolean {
  const norm = normalizeName(name);
  return norm === 'mancung_168' || norm === 'mancung' || norm === 'mancung168';
}

let masterSuperAdminSeeded = false;

/**
 * Seeds the default master super-admin if it doesn't exist in Firestore.
 */
async function ensureMasterSuperAdminExists() {
  if (masterSuperAdminSeeded) return;
  try {
    const docRef = doc(db, 'admins', 'mancung_168');
    const docSnap = await withTimeout(getDoc(docRef), 3000, 'Gagal mengambil data Master Super Admin (Timeout).');
    if (!docSnap.exists() || docSnap.data()?.email !== 'mancung168@gmail.com') {
      const existingData = docSnap.exists() ? docSnap.data() : {};
      await withTimeout(setDoc(docRef, {
        id: 'mancung_168',
        name: 'Mancung_168',
        pin: existingData.pin || '1234',
        role: 'super-admin',
        email: 'mancung168@gmail.com',
        createdAt: existingData.createdAt || new Date(),
        updatedAt: new Date()
      }), 3000);
      
      await withTimeout(setDoc(doc(db, 'admins_by_email', 'mancung168@gmail.com'), {
        nickname: 'mancung_168',
        email: 'mancung168@gmail.com',
        role: 'super-admin',
        updatedAt: new Date()
      }), 3000);
      console.log('Master Super Admin seeded/updated with email mancung168@gmail.com successfully.');
    }

    const devDocRef = doc(db, 'admins', 'gptspay_admin');
    const devDocSnap = await withTimeout(getDoc(devDocRef), 3000, 'Gagal mengambil data Developer Super Admin (Timeout).');
    if (!devDocSnap.exists() || devDocSnap.data()?.email !== 'gptspay@gmail.com') {
      await withTimeout(setDoc(devDocRef, {
        id: 'gptspay_admin',
        name: 'GPTSPay_Admin',
        pin: '1234',
        role: 'super-admin',
        email: 'gptspay@gmail.com',
        createdAt: new Date(),
        updatedAt: new Date()
      }), 3000);
      
      await withTimeout(setDoc(doc(db, 'admins_by_email', 'gptspay@gmail.com'), {
        nickname: 'gptspay_admin',
        email: 'gptspay@gmail.com',
        role: 'super-admin',
        updatedAt: new Date()
      }), 3000);
      console.log('Developer Super Admin seeded/updated with email gptspay@gmail.com successfully.');
    }
    masterSuperAdminSeeded = true;
  } catch (error) {
    console.warn('Could not seed Master/Developer Super Admin (probably rule restrictions or timeout):', error);
  }
}

/**
 * Verifies any admin name and pin.
 * Handles both the hardcoded master 'MANCUNG' (with auto-bypass/default pin)
 * and custom database-registered admins.
 */
export async function verifyAdmin(name: string, pin: string): Promise<boolean> {
  const norm = normalizeName(name);
  if (!norm) return false;

  // Map any master variations of the nickname to 'mancung_168'
  const lookupName = (norm === 'mancung' || norm === 'mancung168') ? 'mancung_168' : norm;

  try {
    // Check Firestore
    const docRef = doc(db, 'admins', lookupName);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as AdminItem;
      return data.pin === pin;
    } else if (lookupName === 'mancung_168') {
      // If the master admin document doesn't exist yet, we still check against the default '1234'
      return pin === '1234';
    }
  } catch (error) {
    console.error('Error verifying admin in Firestore:', error);
  }

  // Local fallback if firebase fails or if custom lookup fails, fallback to local default PIN
  const localDefaultPin = typeof localStorage !== 'undefined' ? (localStorage.getItem('ADMIN_PIN') || '1234') : '1234';
  if (pin === localDefaultPin) {
    return true;
  }

  return false;
}

/**
 * Checks if an admin is super-admin.
 */
export async function isAdminSuper(name: string): Promise<boolean> {
  const norm = normalizeName(name);
  if (!norm) return false;
  if (norm === 'mancung_168' || norm === 'mancung' || norm === 'mancung168' || norm === 'gptspay' || norm === 'gptspay_admin') return true;

  try {
    const docRef = doc(db, 'admins', norm);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as AdminItem;
      return data.role === 'super-admin';
    }
  } catch (error) {
    console.error('Error checking admin role:', error);
  }
  return false;
}

/**
 * Retrieves all admins in the system.
 */
export async function getAdmins(): Promise<AdminItem[]> {
  await ensureMasterSuperAdminExists();
  try {
    const querySnapshot = await getDocs(collection(db, 'admins'));
    const list: AdminItem[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as AdminItem;
      list.push({ ...data, id: doc.id });
    });
    
    // Ensure Mancung_168 represents in the list even if DB fetch returned empty
    if (!list.some(a => a.id === 'mancung_168')) {
      list.unshift({
        id: 'mancung_168',
        name: 'Mancung_168',
        pin: '1234',
        role: 'super-admin',
        email: 'mancung168@gmail.com'
      });
    }

    // Ensure GPTSPay_Admin represents in the list even if DB fetch returned empty
    if (!list.some(a => a.id === 'gptspay_admin')) {
      list.push({
        id: 'gptspay_admin',
        name: 'GPTSPay_Admin',
        pin: '1234',
        role: 'super-admin',
        email: 'gptspay@gmail.com'
      });
    }
    
    return list.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error fetching admins:', error);
    // Return Mancung_168 and GPTSPay_Admin as static fallback
    return [
      {
        id: 'mancung_168',
        name: 'Mancung_168',
        pin: '1234',
        role: 'super-admin',
        email: 'mancung168@gmail.com'
      },
      {
        id: 'gptspay_admin',
        name: 'GPTSPay_Admin',
        pin: '1234',
        role: 'super-admin',
        email: 'gptspay@gmail.com'
      }
    ];
  }
}

/**
 * Creates/Updates an admin record.
 */
export async function saveAdmin(name: string, pin: string, role: 'admin' | 'super-admin' = 'admin', email?: string): Promise<void> {
  const norm = normalizeName(name);
  if (!norm) throw new Error('Nama admin tidak boleh kosong.');
  if (pin.length !== 4 || isNaN(Number(pin))) {
    throw new Error('PIN harus berupa 4 digit angka.');
  }

  const docRef = doc(db, 'admins', norm);

  // Try to remove old email mapping if email is being changed
  try {
    const docSnap = await withTimeout(getDoc(docRef), 5000);
    if (docSnap.exists()) {
      const oldData = docSnap.data();
      if (oldData && oldData.email && oldData.email !== email) {
        const oldEmailNorm = oldData.email.trim().toLowerCase();
        const oldEmailRaw = oldData.email.trim();
        await withTimeout(deleteDoc(doc(db, 'admins_by_email', oldEmailNorm)), 5000);
        if (oldEmailNorm !== oldEmailRaw) {
          await withTimeout(deleteDoc(doc(db, 'admins_by_email', oldEmailRaw)), 5000);
        }
      }
    }
  } catch (err) {
    console.warn("Could not handle change email mapping:", err);
  }

  await withTimeout(setDoc(docRef, {
    id: norm,
    name: name.trim(),
    email: email ? email.trim() : '',
    pin: pin.trim(),
    role,
    createdAt: new Date(),
    updatedAt: new Date()
  }), 8000, 'Gagal menyimpan data pengelola utama ke Firestore (Timeout).');

  if (email && email.trim()) {
    const emailNorm = email.trim().toLowerCase();
    const emailRaw = email.trim();
    
    await withTimeout(setDoc(doc(db, 'admins_by_email', emailNorm), {
      nickname: norm,
      email: emailNorm,
      role,
      updatedAt: new Date()
    }), 5000, 'Gagal mengaitkan email pengelola ke Firestore (Timeout).');

    if (emailNorm !== emailRaw) {
      await withTimeout(setDoc(doc(db, 'admins_by_email', emailRaw), {
        nickname: norm,
        email: emailNorm,
        role,
        updatedAt: new Date()
      }), 5000);
    }
  }
}

/**
 * Deletes an admin record.
 */
export async function deleteAdmin(name: string): Promise<void> {
  const norm = normalizeName(name);
  if (norm === 'mancung_168' || norm === 'mancung' || norm === 'mancung168') {
    throw new Error('Tidak dapat menghapus Master Super Admin!');
  }
  const docRef = doc(db, 'admins', norm);

  try {
    const docSnap = await withTimeout(getDoc(docRef), 5000);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && data.email) {
        const emailNorm = data.email.trim().toLowerCase();
        const emailRaw = data.email.trim();
        await withTimeout(deleteDoc(doc(db, 'admins_by_email', emailNorm)), 5000);
        if (emailNorm !== emailRaw) {
          await withTimeout(deleteDoc(doc(db, 'admins_by_email', emailRaw)), 5000);
        }
      }
    }
  } catch (error) {
    console.warn("Could not delete from admins_by_email:", error);
  }

  await withTimeout(deleteDoc(docRef), 8000, 'Gagal menghapus data pengelola dari Firestore (Timeout).');
}

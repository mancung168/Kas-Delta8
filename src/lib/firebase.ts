import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getMessaging } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const firestoreDatabaseId = (firebaseConfig as any).firestoreDatabaseId;

// Initialize Firestore safely using initializeFirestore with experimentalForceLongPolling to avoid connection drops in sandbox iframes
const firestoreSettings = {
  experimentalForceLongPolling: true,
};

// Always initialize the default database
const defaultDbInstance = initializeFirestore(app, firestoreSettings);

// Safely initialize the custom database if one is defined in config
const customDbInstance = firestoreDatabaseId && firestoreDatabaseId !== '(default)'
  ? initializeFirestore(app, firestoreSettings, firestoreDatabaseId)
  : null;

// Determine active database based on localStorage override, defaulting to firestoreDatabaseId to connect to the custom instance
const getActiveDbId = () => {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('FIRESTORE_DATABASE_ID_OVERRIDE');
    if (saved) return saved;
  }
  return firestoreDatabaseId || '(default)';
};

export const activeDatabaseId = getActiveDbId();
export const configuredDatabaseId = firestoreDatabaseId || '(default)';

export const db = activeDatabaseId === '(default)' || !customDbInstance
  ? defaultDbInstance
  : customDbInstance;

export { defaultDbInstance as defaultDb, customDbInstance as customDb };

export const auth = getAuth();

let messagingInstance: any = null;
try {
  messagingInstance = getMessaging(app);
} catch (error) {
  console.warn('Firebase Messaging is not supported or was blocked in this environment:', error);
}

export const messaging = messagingInstance;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  code?: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isFirestorePermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { code?: string; message?: string };
  return maybeError.code === 'permission-denied' ||
    maybeError.message?.includes('Missing or insufficient permissions') === true ||
    maybeError.message?.includes('permission-denied') === true;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    code: typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : null,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
    })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error Detailed: ', errInfo);
}

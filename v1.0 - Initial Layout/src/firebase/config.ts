import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  Firestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseAppletConfig from '../../firebase-applet-config.json';

// Dynamic configuration prioritizing env variables with JSON config fallback
const firebaseConfig = {
  apiKey: (import.meta.env?.VITE_FIREBASE_API_KEY as string) || firebaseAppletConfig.apiKey,
  authDomain: (import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN as string) || firebaseAppletConfig.authDomain,
  projectId: (import.meta.env?.VITE_FIREBASE_PROJECT_ID as string) || firebaseAppletConfig.projectId,
  storageBucket: (import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET as string) || firebaseAppletConfig.storageBucket,
  messagingSenderId: (import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || firebaseAppletConfig.messagingSenderId,
  appId: (import.meta.env?.VITE_FIREBASE_APP_ID as string) || firebaseAppletConfig.appId,
  firestoreDatabaseId: (import.meta.env?.VITE_FIREBASE_DATABASE_ID as string) || firebaseAppletConfig.firestoreDatabaseId
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const storage = getStorage(app, firebaseConfig.storageBucket);

// Initialize Firestore online-first for perfect, instant real-time synchronization without local cache lag
const firestoreSettings = {};

// Lazy Firestore initialization
let dbInstance: Firestore | null = null;

export const getDb = () => {
  if (!dbInstance) {
    dbInstance = initializeFirestore(app, firestoreSettings, firebaseConfig.firestoreDatabaseId);
  }
  return dbInstance;
};

// For backward compatibility while migration occurs
export const db = initializeFirestore(app, firestoreSettings, firebaseConfig.firestoreDatabaseId);

// Error handling helpers
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
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

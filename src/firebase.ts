import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Safe Firebase initialization with Pure Localhost support
// If running in localhost without Firebase or if VITE_DISABLE_FIREBASE is set,
// this module exports null db and auth without throwing errors.
const isFirebaseDisabled = 
  import.meta.env.VITE_DISABLE_FIREBASE === 'true' ||
  (typeof window !== 'undefined' && window.localStorage.getItem('zuboc_disable_firebase') === 'true');

let app: any = null;
let db: any = null;
let auth: any = null;

if (!isFirebaseDisabled) {
  try {
    if (firebaseConfig && (firebaseConfig as any).projectId && !(firebaseConfig as any).projectId.includes('example')) {
      app = initializeApp(firebaseConfig);
      db = initializeFirestore(app, {
        experimentalForceLongPolling: true,
      }, (firebaseConfig as any).firestoreDatabaseId);
      auth = getAuth(app);
    }
  } catch (err) {
    console.warn('Firebase initialized in offline/localhost mode:', err);
  }
}

export { db, auth, isFirebaseDisabled };

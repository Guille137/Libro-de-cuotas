import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, reload, getIdToken } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { firebaseConfig } from '../config/firebase-config.js';

export function createFirebaseClient() {
  if (!firebaseConfig) return null;
  for (const key of ['apiKey', 'authDomain', 'projectId', 'appId']) {
    if (typeof firebaseConfig[key] !== 'string' || !firebaseConfig[key]) throw new Error(`Falta ${key} en la configuración de Firebase.`);
  }
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  auth.languageCode = 'es';
  // No dejar copias persistentes de comprobantes privados en equipos compartidos.
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  return {
    auth, db,
    async ready() { await auth.authStateReady(); return auth.currentUser; },
    async login() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return (await signInWithPopup(auth, provider)).user;
    },
    logout: () => signOut(auth),
    loginEmail: async (email, password) => (await signInWithEmailAndPassword(auth, email, password)).user,
    async register(email, password) {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(user);
      return user;
    },
    resetPassword: email => sendPasswordResetEmail(auth, email),
    resendVerification: () => sendEmailVerification(auth.currentUser),
    async refreshUser() {
      if (!auth.currentUser) throw new Error('Volvé a iniciar sesión.');
      await reload(auth.currentUser);
      await getIdToken(auth.currentUser, true);
      return auth.currentUser;
    },
    subscribe: callback => onAuthStateChanged(auth, callback),
  };
}

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';

/**
 * CONFIGURACIÓN — CRM LEADS
 * Todo se lee de .env (ver .env.example). Nada sensible queda en el código.
 * El panel no lee Firestore directo: habla con las funciones `leadsApi` y `leadScoring`,
 * que validan el login y el email autorizado del lado del servidor.
 */
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};

export const FUNCTIONS_BASE_URL = String(env.VITE_FUNCTIONS_BASE_URL || '').replace(/\/$/, '');

// Emails autorizados (separados por coma). El servidor vuelve a validarlo.
export const AUTHORIZED_ADMIN_EMAILS: string[] = String(env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
export const AUTHORIZED_ADMIN_EMAIL = AUTHORIZED_ADMIN_EMAILS.join(', ');

export function isAuthorizedEmail(email: string | null | undefined): boolean {
  return AUTHORIZED_ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase());
}

const REQUIRED: Record<string, string> = {
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId,
  VITE_FUNCTIONS_BASE_URL: FUNCTIONS_BASE_URL,
  VITE_ADMIN_EMAILS: AUTHORIZED_ADMIN_EMAIL,
};

export function getMissingEnvVars(): string[] {
  return Object.entries(REQUIRED).filter(([, v]) => !v).map(([k]) => k);
}

export function isFirebaseConfigured(): boolean {
  return getMissingEnvVars().length === 0;
}

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;

if (isFirebaseConfigured()) {
  try {
    appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    authInstance = getAuth(appInstance);
  } catch (err) {
    console.error('Error inicializando Firebase:', err);
  }
} else {
  console.error('Falta configurar .env: ' + getMissingEnvVars().join(', '));
}

export const app = appInstance;
export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

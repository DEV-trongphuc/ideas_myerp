// Persistent Auth Vault for iOS Safari / iPhone Home-Screen PWA & Desktop browsers.
// Mirrors session tokens + user profile across localStorage and IndexedDB so iOS WebKit
// localStorage evictions never force a re-login (backed by the 400-day server HttpOnly cookie `myerp_rt`).

const IDB_NAME = 'myerp_auth_vault_v1';
const IDB_STORE = 'session';
const IDB_KEY = 'active_session';

export interface PersistedSession {
  accessToken: string;
  refreshToken?: string | null;
  user: any;
  savedAt: number;
}

export function safeLocalStorageGet(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore Safari Private Mode / QuotaExceededError
  }
}

export function safeLocalStorageRemove(key: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage access errors
  }
}

function openVaultDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        } catch {
          // ignore
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeAuthVault(session: PersistedSession): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
      navigator.storage.persist().catch(() => {});
    }
  } catch {
    // ignore
  }

  const db = await openVaultDB();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(session, IDB_KEY);
      tx.oncomplete = () => {
        try { db.close(); } catch {}
        resolve();
      };
      tx.onerror = () => {
        try { db.close(); } catch {}
        resolve();
      };
      tx.onabort = () => {
        try { db.close(); } catch {}
        resolve();
      };
    } catch {
      try { db.close(); } catch {}
      resolve();
    }
  });
}

export async function readAuthVault(): Promise<PersistedSession | null> {
  const db = await openVaultDB();
  if (!db) return null;

  return new Promise<PersistedSession | null>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => {
        const val = req.result as PersistedSession | undefined;
        try { db.close(); } catch {}
        if (val && typeof val === 'object' && (val.accessToken || val.refreshToken)) {
          resolve(val);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        try { db.close(); } catch {}
        resolve(null);
      };
    } catch {
      try { db.close(); } catch {}
      resolve(null);
    }
  });
}

export async function clearAuthVault(): Promise<void> {
  const db = await openVaultDB();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.delete(IDB_KEY);
      tx.oncomplete = () => {
        try { db.close(); } catch {}
        resolve();
      };
      tx.onerror = () => {
        try { db.close(); } catch {}
        resolve();
      };
    } catch {
      try { db.close(); } catch {}
      resolve();
    }
  });
}

export function getJwtRemainingSeconds(token: string | null): number | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const payload = JSON.parse(json);
    if (typeof payload?.exp !== 'number') return null;
    return payload.exp - Math.floor(Date.now() / 1000);
  } catch {
    return null;
  }
}

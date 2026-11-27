import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import api, { refreshAccessToken, clearApiCache } from '../api/axios';
import { API_BASE } from '../config/env';
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
  safeLocalStorageRemove,
  writeAuthVault,
  readAuthVault,
  clearAuthVault,
  getJwtRemainingSeconds,
} from '../utils/authPersistence';
import { clearStreamTicketCache } from '../utils/streamTicket';

const isLocalHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const AUTH_API_BASE = isLocalHost ? '/backend' : API_BASE;

type User = {
  id?: number;
  username: string;
  name: string;
  full_name?: string;
  role: 'superadmin' | 'super_admin' | 'admin' | 'manager' | 'director' | 'assistant' | 'viewer' | 'sale' | 'hr' | 'accountant' | 'marketing' | 'academic';
  email?: string;
  consultant_id?: number;
  avatar?: string;
  avatar_url?: string;
  signature_url?: string | null;
  manager_behavior_mode?: string;
  attendance_exempt?: number;
  default_approver_id?: number | null;
  two_factor_enabled?: number;
  two_factor_type?: string;
  job_title?: string;
  address?: string;
  team_id?: number | null;
  erp_profile?: any;
  bio?: string | null;
};

interface AuthContextType {
  user: User | null;
  token: string | null;
  isRestoringSession: boolean;
  login: (token: string, user: User, refreshToken?: string) => void;
  logout: () => void;
  updateUser: (updatedUser: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const normalizeAuthUser = (u: any): User | null => {
  if (!u) return null;
  let role = u.role;
  if (role === 'sales') role = 'sale';
  if (role === 'super_admin') role = 'superadmin';
  let job_title = u.job_title || u.erp_profile?.job_title || u.title || u.position;
  if (!job_title && u.address) {
    try {
      const p = typeof u.address === 'string' ? JSON.parse(u.address) : u.address;
      if (p?.erp_profile?.job_title) job_title = p.erp_profile.job_title;
    } catch {}
  }
  return {
    ...u,
    username: u.username || (typeof u.email === 'string' ? u.email.split('@')[0] : '') || '',
    name: u.full_name || u.name || u.username || '',
    avatar: u.avatar || u.avatar_url || '',
    signature_url: u.signature_url !== undefined ? u.signature_url : (u.signature_img || null),
    job_title: job_title || u.job_title || '',
    role
  };
};

const readInitialUserFromLocal = (): User | null => {
  const storedUser = safeLocalStorageGet('Ideas_user');
  if (storedUser) {
    try {
      return normalizeAuthUser(JSON.parse(storedUser));
    } catch {}
  }
  try {
    const zustandRaw = safeLocalStorageGet('minth-auth');
    if (zustandRaw) {
      const parsed = JSON.parse(zustandRaw);
      if (parsed?.state?.user) {
        const norm = normalizeAuthUser(parsed.state.user);
        if (norm) safeLocalStorageSet('Ideas_user', JSON.stringify(norm));
        return norm;
      }
    }
  } catch {}
  return null;
};

const readInitialTokenFromLocal = (): string | null => {
  let t = safeLocalStorageGet('Ideas_token') || safeLocalStorageGet('access_token');
  if (!t) {
    try {
      const zustandRaw = safeLocalStorageGet('minth-auth');
      if (zustandRaw) {
        const parsed = JSON.parse(zustandRaw);
        if (parsed?.state?.accessToken) {
          t = String(parsed.state.accessToken);
        }
      }
    } catch {}
  }
  if (t) {
    safeLocalStorageSet('Ideas_token', t);
    safeLocalStorageSet('access_token', t);
  }
  return t;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => readInitialUserFromLocal());
  const [token, setToken] = useState<string | null>(() => readInitialTokenFromLocal());
  // Only show restoring state when localStorage is missing token or user (0ms instant open otherwise)
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(() => !(user && token));
  const lastSilentRefreshAtRef = useRef<number>(0);

  const persistSessionEverywhere = useCallback((newToken: string, normalized: User, refreshToken?: string | null) => {
    safeLocalStorageSet('Ideas_token', newToken);
    safeLocalStorageSet('access_token', newToken);
    safeLocalStorageSet('Ideas_user', JSON.stringify(normalized));
    const effectiveRefresh = refreshToken || safeLocalStorageGet('refresh_token') || null;
    if (effectiveRefresh) {
      safeLocalStorageSet('refresh_token', effectiveRefresh);
    }
    writeAuthVault({
      accessToken: newToken,
      refreshToken: effectiveRefresh,
      user: normalized,
      savedAt: Date.now(),
    }).catch(() => {});
  }, []);

  const login = useCallback((newToken: string, newUser: User, refreshToken?: string) => {
    const normalized = normalizeAuthUser(newUser);
    setToken(newToken);
    setUser(normalized);
    setIsRestoringSession(false);
    if (normalized) {
      persistSessionEverywhere(newToken, normalized, refreshToken || null);
      useAuthStore.getState().setAuth(normalized as any, newToken, refreshToken || safeLocalStorageGet('refresh_token') || '');
    }
  }, [persistSessionEverywhere]);

  const logout = useCallback(() => {
    const existingRefresh = safeLocalStorageGet('refresh_token') || '';
    // Revoke refresh token and clear server HttpOnly cookie `myerp_rt`
    axios.post(
      `${AUTH_API_BASE}/api.php?action=auth/logout`,
      { refresh_token: existingRefresh },
      { withCredentials: true, timeout: 6000 }
    ).catch(() => {});

    setToken(null);
    setUser(null);
    setIsRestoringSession(false);
    safeLocalStorageRemove('Ideas_token');
    safeLocalStorageRemove('access_token');
    safeLocalStorageRemove('refresh_token');
    safeLocalStorageRemove('Ideas_user');
    safeLocalStorageRemove('IDEAS_DEMO_MODE');
    clearAuthVault().catch(() => {});
    clearStreamTicketCache();
    clearApiCache();
    useAuthStore.getState().clearAuth();
    useChatStore.getState().resetChatState();
  }, []);

  const updateUser = useCallback((updatedUser: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      const merged = { ...prev, ...updatedUser };
      const normalized = normalizeAuthUser(merged);
      if (normalized) {
        safeLocalStorageSet('Ideas_user', JSON.stringify(normalized));
        const curToken = safeLocalStorageGet('Ideas_token') || safeLocalStorageGet('access_token') || '';
        if (curToken) {
          writeAuthVault({
            accessToken: curToken,
            refreshToken: safeLocalStorageGet('refresh_token') || null,
            user: normalized,
            savedAt: Date.now(),
          }).catch(() => {});
        }
      }
      return normalized;
    });
  }, []);

  // 1. On boot: if localStorage is already populated, mirror immediately to IndexedDB vault
  //    & roll forward server HttpOnly cookie if needed.
  //    If localStorage was wiped by iOS Safari / iPhone PWA, silently restore from IndexedDB
  //    and/or 400-day First-Party HttpOnly server cookie `myerp_rt` BEFORE redirecting to /login!
  React.useEffect(() => {
    let cancelled = false;

    const silentRefreshWithCookie = async (candidateRefresh?: string | null): Promise<boolean> => {
      try {
        const res = await refreshAccessToken(candidateRefresh);
        const newAccess = res?.accessToken;
        const newRefresh = res?.refreshToken || candidateRefresh || '';
        const serverUser = res?.user ? normalizeAuthUser(res.user) : null;
        if (!cancelled && newAccess) {
          lastSilentRefreshAtRef.current = Date.now();
          if (serverUser) {
            setToken(newAccess);
            setUser(serverUser);
            persistSessionEverywhere(newAccess, serverUser, newRefresh);
            useAuthStore.getState().setAuth(serverUser as any, newAccess, newRefresh);
            return true;
          }
          // Fallback if server didn't return user: fetch /auth/me using newAccess
          try {
            const meRes = await axios.get(`${AUTH_API_BASE}/api.php?action=auth/me`, {
              headers: { Authorization: `Bearer ${newAccess}` },
              withCredentials: true,
              timeout: 10000,
            });
            const meUser = normalizeAuthUser(meRes.data?.data || meRes.data);
            if (!cancelled && meUser) {
              setToken(newAccess);
              setUser(meUser);
              persistSessionEverywhere(newAccess, meUser, newRefresh);
              useAuthStore.getState().setAuth(meUser as any, newAccess, newRefresh);
              return true;
            }
          } catch {}
        }
      } catch {
        // Offline or no valid persistent cookie — do not crash
      }
      return false;
    };

    const runSessionBootstrap = async () => {
      // Case A: Already hydrated synchronously from localStorage
      if (user && token) {
        const existingRefresh = safeLocalStorageGet('refresh_token') || null;
        writeAuthVault({
          accessToken: token,
          refreshToken: existingRefresh,
          user,
          savedAt: Date.now(),
        }).catch(() => {});

        // Proactively renew session when 60-min JWT has < 10 minutes left OR HttpOnly cookie hasn't synced in 24h
        const remSec = getJwtRemainingSeconds(token);
        const lastCookieSync = Number(safeLocalStorageGet('myerp_rt_cookie_synced_at') || '0');
        const shouldRollCookie = (existingRefresh && (Date.now() - lastCookieSync > 24 * 60 * 60 * 1000)) || (remSec !== null && remSec < 600);
        if (shouldRollCookie && existingRefresh) {
          const ok = await silentRefreshWithCookie(existingRefresh);
          if (ok) {
            safeLocalStorageSet('myerp_rt_cookie_synced_at', String(Date.now()));
          }
        }
        return;
      }

      // Case B: localStorage missing token or user (typical iOS Safari 7-day ITP / PWA storage purge)
      try {
        let candidateRefresh = safeLocalStorageGet('refresh_token');
        const vault = await readAuthVault();

        if (!cancelled && vault?.accessToken && vault?.user) {
          const normVaultUser = normalizeAuthUser(vault.user);
          if (normVaultUser) {
            setToken(vault.accessToken);
            setUser(normVaultUser);
            persistSessionEverywhere(vault.accessToken, normVaultUser, vault.refreshToken || candidateRefresh);
            useAuthStore.getState().setAuth(normVaultUser as any, vault.accessToken, vault.refreshToken || candidateRefresh || '');
            setIsRestoringSession(false);
            // Roll forward token & server cookie in background only if < 10 minutes left
            const vaultRem = getJwtRemainingSeconds(vault.accessToken);
            if (vaultRem === null || vaultRem < 600) {
              silentRefreshWithCookie(vault.refreshToken || candidateRefresh).catch(() => {});
            }
            return;
          }
        }
        if (!candidateRefresh && vault?.refreshToken) {
          candidateRefresh = vault.refreshToken;
        }

        // Case C: Recover directly via 400-day First-Party HttpOnly cookie `myerp_rt` (or refresh_token)
        await silentRefreshWithCookie(candidateRefresh);
      } finally {
        if (!cancelled) {
          setIsRestoringSession(false);
        }
      }
    };

    runSessionBootstrap();

    // iOS Safari / PWA Wake-Up Keep-Alive: silently refresh when < 10 mins remain on 60-min JWT
    const handleResume = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      const curTok = safeLocalStorageGet('Ideas_token') || safeLocalStorageGet('access_token');
      const curRt = safeLocalStorageGet('refresh_token');
      if (!curTok && !curRt) return;
      const now = Date.now();
      const remSec = getJwtRemainingSeconds(curTok);
      if (now - lastSilentRefreshAtRef.current < 30 * 1000) {
        return;
      }
      if (remSec !== null && remSec > 600) {
        return;
      }
      silentRefreshWithCookie(curRt).catch(() => {});
    };

    const handleTokenSynced = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (!cancelled && detail?.accessToken) {
        setToken(detail.accessToken);
        const norm = detail.user ? normalizeAuthUser(detail.user) : null;
        if (norm) setUser(norm);
      }
    };

    const handleStorageSync = (ev: StorageEvent) => {
      if (ev.key === 'Ideas_token' && ev.newValue && !cancelled) {
        setToken(ev.newValue);
      }
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('pageshow', handleResume);
    window.addEventListener('myerp-auth-refreshed', handleTokenSynced);
    window.addEventListener('storage', handleStorageSync);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('pageshow', handleResume);
      window.removeEventListener('myerp-auth-refreshed', handleTokenSynced);
      window.removeEventListener('storage', handleStorageSync);
    };
    // Run once on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (user?.id) {
      const fetchLatestProfile = async () => {
        try {
          const res = await api.get(`/users/${user.id}`);
          if (res.data) {
            const data = res.data.data || res.data;
            const latestAvatar = data.avatar_url || data.avatar;
            const latestName = data.full_name || data.name;
            const latestSignatureUrl = data.signature_url !== undefined ? data.signature_url : (data.signature_img || user.signature_url);
            const latestJobTitle = data.job_title || (data.address ? (() => { try { return JSON.parse(data.address)?.erp_profile?.job_title; } catch(e) { return null; } })() : null) || data.title || data.position;
            const latestDepartment = data.department !== undefined ? data.department : (user as any).department;
            const latestTeamId = data.team_id !== undefined ? data.team_id : (user as any).team_id;
            const latestAttendanceExempt = data.attendance_exempt !== undefined ? Number(data.attendance_exempt) : Number((user as any).attendance_exempt || 0);
            const latestDefaultApproverId = data.default_approver_id !== undefined
              ? (data.default_approver_id ? Number(data.default_approver_id) : null)
              : ((user as any).default_approver_id ?? null);
            if (
              (latestAvatar && latestAvatar !== user.avatar) || 
              (latestName && latestName !== user.name) ||
              (latestJobTitle !== undefined && latestJobTitle !== user.job_title) ||
              (latestDepartment !== undefined && latestDepartment !== (user as any).department) ||
              (latestTeamId !== undefined && latestTeamId !== (user as any).team_id) ||
              (latestSignatureUrl !== undefined && latestSignatureUrl !== user.signature_url) ||
              latestAttendanceExempt !== Number((user as any).attendance_exempt || 0) ||
              latestDefaultApproverId !== ((user as any).default_approver_id ?? null)
            ) {
              updateUser({
                avatar: latestAvatar,
                name: latestName,
                job_title: latestJobTitle || '',
                department: latestDepartment || '',
                team_id: latestTeamId ?? null,
                signature_url: latestSignatureUrl,
                attendance_exempt: latestAttendanceExempt,
                default_approver_id: latestDefaultApproverId
              } as any);
            }
          }
        } catch (err) {
          console.error("Failed to sync user profile on mount:", err);
        }
      };
      fetchLatestProfile();
    }
  }, [user?.id, updateUser]);

  // Sync authenticated state into Zustand store — NEVER auto-wipe tokens during boot!
  React.useEffect(() => {
    if (user) {
      useAuthStore.getState().setUser(user as any);
      if (token) {
        useAuthStore.setState({ accessToken: token, isAuthenticated: true });
      }
    }
  }, [user, token]);

  const contextValue = React.useMemo(
    () => ({ user, token, isRestoringSession, login, logout, updateUser }),
    [user, token, isRestoringSession, login, logout, updateUser]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

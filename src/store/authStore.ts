import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearApiCache } from '../api/axios';
import { safeLocalStorageSet, safeLocalStorageRemove } from '../utils/authPersistence';

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  signature_url?: string | null;
  bio?: string | null;
  tenant_id: number;
  tenant_name: string;
  tenant_slug: string;
  manager_behavior_mode?: string | null;
  attendance_exempt?: number;
  default_approver_id?: number | null;
  two_factor_enabled?: number;
  two_factor_type?: string;
  team_id?: number | null;
}

interface AuthStore {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: AuthUser, access: string, refresh: string) => void;
  setUser: (user: AuthUser) => void;
  clearAuth: () => void;
}

const normalizeUser = (u: AuthUser | null): AuthUser | null => {
  if (!u) return null;
  let role = u.role;
  if (role === 'sales') role = 'sale';
  if (role === 'super_admin') role = 'superadmin';
  return {
    ...u,
    role
  };
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken) => {
        safeLocalStorageSet('access_token', accessToken);
        safeLocalStorageSet('Ideas_token', accessToken);
        if (refreshToken) safeLocalStorageSet('refresh_token', refreshToken);
        const normalized = normalizeUser(user);
        set({ user: normalized, accessToken, refreshToken, isAuthenticated: true });
      },
      setUser: (user) => {
        const normalized = normalizeUser(user);
        set({ user: normalized });
      },
      clearAuth: () => {
        safeLocalStorageRemove('access_token');
        safeLocalStorageRemove('refresh_token');
        clearApiCache();
        try {
          import('./chatStore').then((m) => m.useChatStore.getState().resetChatState()).catch(() => {});
        } catch {}
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
    }),
    { name: 'minth-auth', partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken, isAuthenticated: s.isAuthenticated }) }
  )
);

export const getModulePermissionScope = (
  user: any,
  module: string,
  action: 'read' | 'write' | 'delete'
): 'none' | 'own' | 'team' | 'all' => {
  if (!user) return 'none';
  const role = String(user.role || '').toLowerCase();
  if (role === 'admin' || role === 'superadmin' || role === 'super_admin') return 'all';
  if (role === 'sale_admin' || role === 'saleadmin') {
    if (['settings', 'hrm', 'attendance'].includes(module)) return 'none';
    return 'all';
  }
  
  let permissions: any = {};
  if (user.permissions_json) {
    try {
      permissions = typeof user.permissions_json === 'string' 
        ? JSON.parse(user.permissions_json) 
        : user.permissions_json;
    } catch (e) {
      console.error("Failed to parse permissions_json", e);
    }
  } else if (user.permissions) {
    permissions = user.permissions;
  }
  
  const val = permissions[module]?.[action];
  if (val === 'all' || val === 'team' || val === 'own' || val === 'none') {
    return val;
  }
  
  // Default fallbacks based on authoritative DB role / team_department_code (never untrusted job_title substrings)
  if (role === 'director') return 'all';
  
  if (role === 'hr') {
    if (['hrm', 'attendance', 'users', 'expenses'].includes(module)) {
      return 'all';
    }
    if (module === 'settings') {
      return 'none';
    }
    return 'own';
  }

  if (role === 'accountant') {
    if (['deposits', 'expenses', 'finance', 'invoices', 'quotes'].includes(module)) {
      return 'all';
    }
    if (module === 'settings') {
      return 'none';
    }
    return 'own';
  }

  const isMarketingRole = role === 'marketing' ||
    Number(user.team_id) === 3 ||
    String(user.department_code || '').toLowerCase() === 'marketing';

  if (isMarketingRole) {
    if (['leads', 'campaigns', 'projects', 'deals', 'tickets', 'gatekeeper', 'users', 'contacts', 'students', 'companies'].includes(module)) {
      return 'all';
    }
    if (module === 'settings') {
      return 'none';
    }
    return role === 'manager' ? (action === 'delete' ? 'none' : 'team') : 'own';
  }

  if (role === 'manager') return action === 'delete' ? 'none' : 'team';
  if (role === 'assistant') {
    if (module === 'leads') return action === 'delete' ? 'none' : 'all';
    if (module === 'deals') return 'all';
    return action === 'delete' ? 'none' : 'all';
  }
  if (role === 'sale' || role === 'sales') {
    if (module === 'projects') return action === 'read' ? 'all' : 'none';
    return action === 'delete' ? 'none' : 'own';
  }
  if (role === 'viewer') return action === 'read' ? 'all' : 'none';
  
  return 'none';
};

export const hasPermission = (
  user: any,
  module: string,
  action: 'read' | 'write' | 'delete'
): boolean => {
  const scope = getModulePermissionScope(user, module, action);
  return scope !== 'none';
};

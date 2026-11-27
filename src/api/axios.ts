import axios from 'axios';
import { API_BASE } from '../config/env';
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
  writeAuthVault,
  getJwtRemainingSeconds,
} from '../utils/authPersistence';

// Auto-detect: local dev uses Vite proxy, production uses real URL
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BASE_URL = isLocal ? '/backend' : API_BASE;

const apiInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
  withCredentials: true,
});

// --- CACHING & DEDUPLICATION LAYER ---
const CACHE_LIFETIME = 60 * 1000; // 60 seconds fast reference cache TTL
const cacheMap = new Map<string, { data: any; timestamp: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const invalidationGenMap = new Map<string, number>();
let cacheClearEpoch = 0;
const cacheInvalidateListeners = new Set<(endpoints: string[] | null) => void>();

export function onApiCacheInvalidate(listener: (endpoints: string[] | null) => void): () => void {
  cacheInvalidateListeners.add(listener);
  return () => {
    cacheInvalidateListeners.delete(listener);
  };
}

function getEndpointGeneration(endpoint: string): number {
  return invalidationGenMap.get(endpoint) || 0;
}

export function clearApiCache() {
  cacheClearEpoch += 1;
  cacheMap.clear();
  pendingRequests.clear();
  cacheInvalidateListeners.forEach((listener) => {
    try {
      listener(null);
    } catch {
      // ignore listener errors
    }
  });
}

function getActionFromConfig(config: any): string {
  const url = String(config.url || '');
  if (config.params?.action) {
    return String(config.params.action).split('?')[0].replace(/^\/+|\/+$/g, '');
  }
  if (url.includes('action=')) {
    const match = url.match(/[?&]action=([^&#]+)/);
    if (match) {
      return decodeURIComponent(match[1]).split('?')[0].replace(/^\/+|\/+$/g, '');
    }
  }
  const clean = url.split('?')[0].replace(/^\/+|\/+$/g, '');
  if (clean === 'api.php') {
    return '';
  }
  return clean;
}

const CACHEABLE_ENDPOINTS = new Set([
  'users',
  'projects',
  'marketing-campaigns',
  'teams',
  'tags',
  'pipeline-stages',
  'custom-fields',
  'file-categories',
  'departments',
  'branches',
  'suppliers',
  'products',
  'roles',
  'workflow_task_templates',
  'workflow-task-templates',
  'settings',
  'get_settings',
  'get_ticket_settings',
  'get_accounts',
  'get_consultants',
  'get_rounds',
  'get_connections',
  'get_unique_sources',
  'hrm/departments',
  'hrm/positions',
  'hrm/settings',
  'attendance_configs',
  'attendance/configs',
  'contacts/programs'
]);

function hasBypassCacheFlag(config: any): boolean {
  if (config.headers?.['x-bypass-cache']) return true;
  const p = config.params;
  if (p && (p._no_cache || p.refresh || p._t)) return true;
  const url = String(config.url || '');
  if (url.includes('?')) {
    const sp = new URLSearchParams(url.split('?')[1]);
    if (sp.has('_no_cache') || sp.has('refresh') || sp.has('_t')) return true;
  }
  return false;
}

function isCacheable(config: any): boolean {
  const method = (config.method || 'get').toLowerCase();
  if (method !== 'get') {
    return false;
  }
  if (hasBypassCacheFlag(config)) {
    return false;
  }
  const action = getActionFromConfig(config);
  return CACHEABLE_ENDPOINTS.has(action);
}

function getCacheKey(config: any): string {
  const action = getActionFromConfig(config);
  const rawParams: Record<string, any> = {};

  const url = String(config.url || '');
  if (url.includes('?')) {
    const qs = url.split('?')[1];
    const sp = new URLSearchParams(qs);
    sp.forEach((val, key) => {
      if (key !== 'action' && key !== 'token' && key !== '_method' && key !== '_t') {
        rawParams[key] = String(val);
      }
    });
  }

  if (config.params && typeof config.params === 'object') {
    Object.keys(config.params).forEach((key) => {
      if (key !== 'action' && key !== 'token' && key !== '_method' && key !== '_t') {
        const val = config.params[key];
        if (val !== undefined && val !== null) {
          rawParams[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
        }
      }
    });
  }

  const sortedParams: Record<string, string> = {};
  Object.keys(rawParams)
    .sort()
    .forEach((k) => {
      sortedParams[k] = rawParams[k];
    });

  return `${action}::${JSON.stringify(sortedParams)}`;
}

const MAX_CACHE_ENTRIES = 250;

function setCacheEntry(key: string, data: any) {
  if (cacheMap.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cacheMap.keys().next().value;
    if (oldestKey) {
      cacheMap.delete(oldestKey);
    }
  }
  cacheMap.set(key, { data, timestamp: Date.now() });
}

function attachAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    const abortErr: any = new Error('canceled');
    abortErr.name = 'CanceledError';
    abortErr.code = 'ERR_CANCELED';
    abortErr.__CANCEL__ = true;
    return Promise.reject(abortErr);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      const abortErr: any = new Error('canceled');
      abortErr.name = 'CanceledError';
      abortErr.code = 'ERR_CANCELED';
      abortErr.__CANCEL__ = true;
      reject(abortErr);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener('abort', onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

function invalidateEndpoints(endpoints: string[]) {
  if (endpoints.length === 0) return;
  for (const ep of endpoints) {
    invalidationGenMap.set(ep, (invalidationGenMap.get(ep) || 0) + 1);
  }

  const prefixes = endpoints.map((ep) => `${ep}::`);
  if (cacheMap.size > 0) {
    for (const key of Array.from(cacheMap.keys())) {
      if (prefixes.some((p) => key.startsWith(p))) {
        cacheMap.delete(key);
      }
    }
  }

  if (pendingRequests.size > 0) {
    const inflightPrefixes = endpoints.map((ep) => `GET_INFLIGHT::${ep}::`);
    for (const key of Array.from(pendingRequests.keys())) {
      if (prefixes.some((p) => key.startsWith(p)) || inflightPrefixes.some((p) => key.startsWith(p))) {
        pendingRequests.delete(key);
      }
    }
  }

  cacheInvalidateListeners.forEach((listener) => {
    try {
      listener(endpoints);
    } catch {
      // ignore listener errors
    }
  });
}

function isNonInvalidatingPost(action: string, config: any): boolean {
  const norm = action.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!norm) return false;

  if (
    /(^|\/)(presence-ping|presence-leave|ping)$/.test(norm) ||
    /^chat\/(typing|conversations\/[^/]+\/read)$/.test(norm) ||
    /^auth\/(stream-ticket|refresh|2fa-setup\/send-email-otp|forgot-password|reset-password|change-password|security-alerts\/test)$/.test(norm) ||
    norm === 'change_password' ||
    /^(preview_routing|evaluate_rules_ai|test_master_sync|test_email|batch_check_duplicates|check_sheet_duplicates|ai_chat|qwen-agent\/chat)$/.test(norm) ||
    /^hrm\/accounting-az\/(simulate-payroll|calculate-benefits)$/.test(norm) ||
    norm === 'inventory/export' ||
    /^(cloud-files\/(extract-id-document|extract-contract-info|auto-ocr-contact|auto-scan-suspects)|academic\/postpone\/[^/]+\/ocr)$/.test(norm) ||
    /^(notifications\/reminder|send_lead_reminder|send_quick_zalo_message|resend_confirm_email|resend_telegram_verify_|resend_zalo_verify_|academic\/onboarding-email\/send|academic\/subject-announcement\/send)/.test(norm) ||
    /^contacts\/[^/]+\/send-academic-email$/.test(norm) ||
    /^academic\/lecturer\/[^/]+\/send-invitation-email$/.test(norm)
  ) {
    return true;
  }

  if (norm === 'ai_training') {
    try {
      const body = typeof config?.data === 'string' ? JSON.parse(config.data) : config?.data;
      if (body?.action === 'list_docs' || body?.action === 'get_settings') {
        return true;
      }
    } catch {}
  }

  return false;
}

function invalidateCacheForMutation(action: string, config: any) {
  if (isNonInvalidatingPost(action, config)) {
    return;
  }

  const norm = action.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!norm) return;

  if (
    /^auth\/(login|verify-2fa|2fa-setup\/complete|logout)/.test(norm) ||
    /^login_google/.test(norm) ||
    /^tenant-config(\/|$)/.test(norm)
  ) {
    clearApiCache();
    return;
  }

  if (/^((v1\/)?settings(\/|$)|save_settings$|save_workspace_settings$|qwen-agent\/settings$)/.test(norm)) {
    invalidateEndpoints(['settings', 'get_settings', 'get_ticket_settings', 'hrm/settings', 'attendance_configs', 'attendance/configs']);
    return;
  }

  if (/^save_ticket_settings$/.test(norm)) {
    invalidateEndpoints(['get_ticket_settings', 'get_settings', 'settings']);
    return;
  }

  if (/^(users(\/|$)|auth\/profile$|add_account$|edit_account$|delete_account$|add_consultant$|edit_consultant$|delete_consultant$|update_profile$|update_consultant_self_profile$|toggle_consultant_vacation$|unlink_zalo$|unlink_telegram$|hrm\/profiles(\/|$)|rollback_admin_action$)/.test(norm)) {
    invalidateEndpoints(['users', 'get_accounts', 'get_consultants', 'get_rounds', 'teams']);
    return;
  }

  if (/^teams(\/|$)/.test(norm)) {
    invalidateEndpoints(['teams', 'users', 'get_consultants', 'get_rounds']);
    return;
  }

  if (/^roles(\/|$)/.test(norm)) {
    invalidateEndpoints(['roles', 'users']);
    return;
  }

  if (/^((hrm\/)?departments(\/|$))/.test(norm)) {
    invalidateEndpoints(['departments', 'hrm/departments', 'hrm/settings', 'users']);
    return;
  }

  if (/^branches(\/|$)/.test(norm)) {
    invalidateEndpoints(['branches', 'users']);
    return;
  }

  if (/^hrm\/positions(\/|$)/.test(norm)) {
    invalidateEndpoints(['hrm/positions', 'hrm/settings']);
    return;
  }

  if (/^hrm\/settings(\/|$)/.test(norm)) {
    invalidateEndpoints(['hrm/settings', 'attendance_configs', 'attendance/configs']);
    return;
  }

  if (/^attendance[_/]configs(\/|$)/.test(norm)) {
    invalidateEndpoints(['attendance_configs', 'attendance/configs', 'hrm/settings']);
    return;
  }

  if (/^((marketing-)?campaigns(\/|$)|projects(\/|$))/.test(norm)) {
    invalidateEndpoints(['projects', 'marketing-campaigns', 'contacts/programs']);
    return;
  }

  if (/^tags(\/|$)/.test(norm) || /^contacts\/([^/]+\/tags(\/|$)|bulk-tag$)/.test(norm)) {
    invalidateEndpoints(['tags']);
    return;
  }

  if (/^pipeline-stages(\/|$)/.test(norm)) {
    invalidateEndpoints(['pipeline-stages']);
    return;
  }

  if (/^custom-fields(\/|$)/.test(norm)) {
    invalidateEndpoints(['custom-fields']);
    return;
  }

  if (/^file-categories(\/|$)/.test(norm)) {
    invalidateEndpoints(['file-categories']);
    return;
  }

  if (/^workflow[-_]task[-_]templates(\/|$)/.test(norm)) {
    invalidateEndpoints(['workflow_task_templates', 'workflow-task-templates']);
    return;
  }

  if (/^suppliers(\/|$)/.test(norm)) {
    invalidateEndpoints(['suppliers']);
    return;
  }

  if (/^(products(\/|$)|product-categories(\/|$)|inventory\/(adjust|archive(\/|$))|purchase-orders\/[^/]+\/receive$|pos\/orders(\/|$)|sales-orders\/[^/]+\/convert-to-invoice$)/.test(norm)) {
    invalidateEndpoints(['products']);
    return;
  }

  if (/^(rounds(\/|$)|add_round$|edit_round$|delete_round$|toggle_round)/.test(norm)) {
    invalidateEndpoints(['get_rounds']);
    return;
  }

  if (/^(connections(\/|$)|(add|edit|delete)_(connection|mapping)$|toggle_(connection|require_both|notify_admin)$)/.test(norm)) {
    invalidateEndpoints(['get_connections', 'get_unique_sources']);
    return;
  }

  if (/^approve_held_lead$/.test(norm)) {
    invalidateEndpoints(['get_unique_sources']);
    return;
  }

  if (/^(contacts(\/|$)|manual_insert_lead$|batch_import_leads$|import\/process$|update_lead_fields$)/.test(norm)) {
    invalidateEndpoints(['get_unique_sources', 'contacts/programs']);
    return;
  }

  for (const ep of CACHEABLE_ENDPOINTS) {
    if (norm === ep || norm.startsWith(`${ep}/`)) {
      invalidateEndpoints([ep]);
      return;
    }
  }
}

const originalRequest = apiInstance.request.bind(apiInstance);

function customRequest(urlOrConfig: any, config?: any): Promise<any> {
  let finalConfig: any;
  if (typeof urlOrConfig === 'string') {
    finalConfig = { ...(config || {}), url: urlOrConfig };
  } else {
    finalConfig = { ...(urlOrConfig || {}) };
  }

  const method = (finalConfig.method || 'get').toLowerCase();

  // Targeted reference cache invalidation on mutating requests
  if (['post', 'put', 'delete', 'patch'].includes(method)) {
    invalidateCacheForMutation(getActionFromConfig(finalConfig), finalConfig);
    return originalRequest(finalConfig);
  }

  // Legacy GET-method mutations (action=delete_* / toggle_*)
  if (method === 'get') {
    const action = getActionFromConfig(finalConfig);
    if (/^(delete_(consultant|round|account|connection|mapping)|toggle_(connection|require_both|notify_admin))$/.test(action)) {
      invalidateCacheForMutation(action, finalConfig);
      return originalRequest(finalConfig);
    }
  }

  // 1. Fast Reference Data Cache (TTL 60s) + Shared In-Flight Deduplication
  if (isCacheable(finalConfig)) {
    const action = getActionFromConfig(finalConfig);
    const key = getCacheKey(finalConfig);
    const cached = cacheMap.get(key);

    if (cached && Date.now() - cached.timestamp < CACHE_LIFETIME) {
      cacheMap.delete(key);
      cacheMap.set(key, cached);
      return attachAbortSignal(Promise.resolve(cached.data), finalConfig.signal);
    }

    let pending = pendingRequests.get(key);
    if (!pending) {
      const startEpoch = cacheClearEpoch;
      const startGen = getEndpointGeneration(action);
      const sharedConfig = { ...finalConfig };
      delete sharedConfig.signal;
      pending = originalRequest(sharedConfig)
        .then((response) => {
          if (cacheClearEpoch === startEpoch && getEndpointGeneration(action) === startGen) {
            setCacheEntry(key, response);
          }
          if (pendingRequests.get(key) === pending) {
            pendingRequests.delete(key);
          }
          return response;
        })
        .catch((err) => {
          if (pendingRequests.get(key) === pending) {
            pendingRequests.delete(key);
          }
          throw err;
        });
      pendingRequests.set(key, pending);
    }
    return attachAbortSignal(pending, finalConfig.signal);
  }

  // 2. General In-Flight GET Request Deduplication (when no caller-specific AbortSignal or bypass flag)
  if (method === 'get' && !finalConfig.signal && !hasBypassCacheFlag(finalConfig) && !finalConfig.responseType) {
    const dedupKey = `GET_INFLIGHT::${getCacheKey(finalConfig)}`;
    let inFlight = pendingRequests.get(dedupKey);
    if (!inFlight) {
      inFlight = originalRequest(finalConfig).finally(() => {
        if (pendingRequests.get(dedupKey) === inFlight) {
          pendingRequests.delete(dedupKey);
        }
      });
      pendingRequests.set(dedupKey, inFlight);
    }
    return inFlight;
  }

  return originalRequest(finalConfig);
}

apiInstance.request = customRequest as any;
apiInstance.get = function (url: string, config?: any) {
  return customRequest({ ...(config || {}), method: 'get', url });
} as any;
apiInstance.delete = function (url: string, config?: any) {
  return customRequest({ ...(config || {}), method: 'delete', url });
} as any;
apiInstance.head = function (url: string, config?: any) {
  return customRequest({ ...(config || {}), method: 'head', url });
} as any;
apiInstance.options = function (url: string, config?: any) {
  return customRequest({ ...(config || {}), method: 'options', url });
} as any;
apiInstance.post = function (url: string, data?: any, config?: any) {
  return customRequest({ ...(config || {}), method: 'post', url, data });
} as any;
apiInstance.put = function (url: string, data?: any, config?: any) {
  return customRequest({ ...(config || {}), method: 'put', url, data });
} as any;
apiInstance.patch = function (url: string, data?: any, config?: any) {
  return customRequest({ ...(config || {}), method: 'patch', url, data });
} as any;

const api = new Proxy(apiInstance, {
  apply(_target, _thisArg, argArray) {
    return customRequest(argArray[0], argArray[1]);
  },
});
// -------------------------------------


// Attach access token
apiInstance.interceptors.request.use((config) => {
  // Remove Content-Type header for GET/HEAD requests to prevent 415 Unsupported Media Type errors on strict WAFs
  if (config.method && ['get', 'head'].includes(config.method.toLowerCase())) {
    if (config.headers) {
      delete config.headers['Content-Type'];
      if (typeof config.headers.delete === 'function') {
        config.headers.delete('Content-Type');
      }
    }
  }

  // Remove Content-Type header for FormData payloads to allow automatic boundary configuration
  if (config.data instanceof FormData) {
    if (config.headers) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
      if (typeof (config.headers as any).delete === 'function') {
        (config.headers as any).delete('Content-Type');
        (config.headers as any).delete('content-type');
      }
    }
  }

  // Translate PUT, PATCH, DELETE to POST with method override header/param to bypass server restrictions
  if (config.method && ['put', 'patch', 'delete'].includes(config.method.toLowerCase())) {
    const originalMethod = config.method.toUpperCase();
    config.params = config.params || {};
    config.params._method = originalMethod;
    config.method = 'post';
  }
  // Rewrite URL to api.php?action=... to bypass missing web server rewrite rules
  if (config.url && !config.url.startsWith('http')) {
    const cleanUrl = config.url.replace(/^\//, ''); // remove leading slash
    const qParts = cleanUrl.split('?');
    config.params = config.params || {};
    if (!cleanUrl.startsWith('api.php')) {
      config.params.action = qParts[0];
    }
    if (qParts[1]) {
      const searchParams = new URLSearchParams(qParts[1]);
      searchParams.forEach((val, key) => {
        if (config.params[key] === undefined) {
          config.params[key] = val;
        }
      });
    }
    config.url = 'api.php';
  }

  const token = safeLocalStorageGet('Ideas_token') || safeLocalStorageGet('access_token');
  if (token) {
    if (!safeLocalStorageGet('Ideas_token')) safeLocalStorageSet('Ideas_token', token);
    if (!safeLocalStorageGet('access_token')) safeLocalStorageSet('access_token', token);
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface RefreshedSessionResult {
  accessToken: string;
  refreshToken: string | null;
  user: any;
}

let refreshInFlightPromise: Promise<RefreshedSessionResult | null> | null = null;

export async function refreshAccessToken(
  overrideRefreshToken?: string | null,
  staleAccessToken?: string | null
): Promise<RefreshedSessionResult | null> {
  try {
    const lastRefreshTs = Number(safeLocalStorageGet('myerp_last_refresh_ts') || '0');
    const currentAccess = safeLocalStorageGet('Ideas_token') || safeLocalStorageGet('access_token');
    const currentRefresh = safeLocalStorageGet('refresh_token') || null;
    const remSec = getJwtRemainingSeconds(currentAccess);
    if (
      currentAccess &&
      Date.now() - lastRefreshTs < 5000 &&
      ((staleAccessToken && currentAccess !== staleAccessToken) || (remSec !== null && remSec > 600))
    ) {
      let currentUser: any = null;
      try {
        const rawU = safeLocalStorageGet('Ideas_user');
        if (rawU) currentUser = JSON.parse(rawU);
      } catch {}
      return { accessToken: currentAccess, refreshToken: currentRefresh, user: currentUser };
    }
  } catch {}

  if (!refreshInFlightPromise) {
    refreshInFlightPromise = (async () => {
      try {
        const refresh = (overrideRefreshToken ?? safeLocalStorageGet('refresh_token') ?? '').trim();
        // Always attempt refresh with credentials so iOS Safari's 400-day HttpOnly `myerp_rt`
        // cookie can seamlessly renew the session even if localStorage was evicted.
        const { data } = await axios.post(
          `${BASE_URL}/api.php?action=auth/refresh`,
          { refresh_token: refresh },
          { withCredentials: true, timeout: 12000 }
        );
        const newAccess = data?.data?.access_token;
        const newRefresh = data?.data?.refresh_token || null;
        const refreshedUser = data?.data?.user || null;
        if (newAccess) {
          safeLocalStorageSet('access_token', newAccess);
          safeLocalStorageSet('Ideas_token', newAccess);
          safeLocalStorageSet('myerp_last_refresh_ts', String(Date.now()));
          if (newRefresh) safeLocalStorageSet('refresh_token', newRefresh);
          if (refreshedUser) {
            try {
              safeLocalStorageSet('Ideas_user', JSON.stringify(refreshedUser));
            } catch {}
          }
          const storedUserRaw = safeLocalStorageGet('Ideas_user');
          let vaultUser = refreshedUser || null;
          if (!vaultUser && storedUserRaw) {
            try { vaultUser = JSON.parse(storedUserRaw); } catch {}
          }
          const finalRefresh = newRefresh || refresh || null;
          writeAuthVault({
            accessToken: newAccess,
            refreshToken: finalRefresh,
            user: vaultUser,
            savedAt: Date.now(),
          }).catch(() => {});
          try {
            const { useAuthStore } = await import('../store/authStore' as any);
            const s = useAuthStore.getState();
            if (s.user || refreshedUser) {
              useAuthStore.setState({
                accessToken: newAccess,
                refreshToken: finalRefresh || s.refreshToken,
                isAuthenticated: true,
              });
            }
          } catch {}
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('myerp-auth-refreshed', {
              detail: { accessToken: newAccess, refreshToken: finalRefresh, user: vaultUser },
            }));
          }
          return {
            accessToken: newAccess,
            refreshToken: finalRefresh,
            user: vaultUser,
          };
        }
        return null;
      } catch {
        return null;
      } finally {
        refreshInFlightPromise = null;
      }
    })();
  }
  return refreshInFlightPromise;
}

// Auto-refresh on 401 & Version Header Detection
apiInstance.interceptors.response.use(
  (r) => {
    const backendVer = r.headers?.['x-app-version'];
    if (backendVer && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app-backend-version', { detail: { version: String(backendVer) } }));
    }
    return r;
  },
  async (error) => {
    if (error.response?.headers?.['x-app-version'] && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app-backend-version', { detail: { version: String(error.response.headers['x-app-version']) } }));
    }
    const original = error.config;
    const url = String(original?.url || '');
    const action = String(original?.params?.action || '');
    
    // Comprehensive check for all auth endpoints
    const isAuthEndpoint = 
      url.includes('auth/login') ||
      url.includes('auth/refresh') ||
      url.includes('auth/verify-2fa') ||
      url.includes('auth/2fa-setup') ||
      url.includes('login_google') ||
      url.includes('auth/forgot-password') ||
      url.includes('auth/reset-password') ||
      action.includes('auth/login') ||
      action.includes('auth/refresh') ||
      action.includes('auth/verify-2fa') ||
      action.includes('auth/2fa-setup') ||
      action.includes('login_google') ||
      action.includes('auth/forgot-password') ||
      action.includes('auth/reset-password');

    // Don't intercept 401s from login or auth endpoints themselves
    if (
      error.response?.status === 401 &&
      !original?._retry &&
      !isAuthEndpoint
    ) {
      original._retry = true;
      try {
        const reqAuth = String(original?.headers?.Authorization || original?.headers?.authorization || '').replace(/^Bearer\s+/i, '');
        const refreshed = await refreshAccessToken(null, reqAuth || null);
        if (refreshed?.accessToken) {
          original.headers.Authorization = `Bearer ${refreshed.accessToken}`;
          return originalRequest(original);
        }
      } catch {
        // Tuyệt đối không tự động logout / xóa localStorage khi phiên đăng nhập của user vẫn tồn tại
      }
    }
    // Safe auto-retry for idempotent GET requests on temporary network loss / 502-504 gateway glitches
    const reqMethod = String(original?.method || 'get').toLowerCase();
    const isIdempotent = reqMethod === 'get' || reqMethod === 'head';
    const isNetworkOrGatewayError = !error.response || (error.response.status >= 502 && error.response.status <= 504);
    const isCanceled = axios.isCancel(error) || error.name === 'CanceledError' || error.code === 'ERR_CANCELED';

    if (isIdempotent && isNetworkOrGatewayError && !isCanceled && (!original?._netRetryCount || original._netRetryCount < 2)) {
      original._netRetryCount = (original._netRetryCount || 0) + 1;
      const backoffMs = original._netRetryCount * 600;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return originalRequest(original);
    }

    if (error.response?.status === 500) {
      console.error('SERVER ERROR:', error.response.data);
    }
    return Promise.reject(error);
  }
);

export default api;

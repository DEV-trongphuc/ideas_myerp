import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios';
import { useAuth } from './AuthContext';

export type TypedSettingsMap = Record<string, any>;

export interface SettingsBootstrapContextValue {
  settings: TypedSettingsMap;
  epoch: number;
  tenantId: number;
  loaded: boolean;
  loading: boolean;
  refreshSettings: (force?: boolean) => Promise<void>;
  getSetting: <T = any>(key: string, fallback: T) => T;
  getSubSetting: <T = any>(key: string, subKey: string, fallback: T) => T;
}

const BOOT_STORAGE_PREFIX = 'myerp_settings_boot_v1_';

function readCachedSettingsBoot(userId?: number): { settings: TypedSettingsMap; epoch: number; tenantId: number } | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = sessionStorage.getItem(BOOT_STORAGE_PREFIX + String(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.settings === 'object' && parsed.settings !== null) {
      return {
        settings: parsed.settings,
        epoch: Number(parsed.epoch || 1),
        tenantId: Number(parsed.tenant_id || 1),
      };
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

const defaultValue: SettingsBootstrapContextValue = {
  settings: {},
  epoch: 1,
  tenantId: 1,
  loaded: false,
  loading: false,
  refreshSettings: async () => {},
  getSetting: (_key, fallback) => fallback,
  getSubSetting: (_key, _subKey, fallback) => fallback,
};

const SettingsBootstrapContext = createContext<SettingsBootstrapContextValue>(defaultValue);

export const SettingsBootstrapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const [bootState] = useState(() => readCachedSettingsBoot(user?.id));
  const [settings, setSettings] = useState<TypedSettingsMap>(() => bootState?.settings || {});
  const [epoch, setEpoch] = useState<number>(() => bootState?.epoch || 1);
  const [tenantId, setTenantId] = useState<number>(() => bootState?.tenantId || 1);
  const [loaded, setLoaded] = useState<boolean>(() => Boolean(bootState));
  const [loading, setLoading] = useState<boolean>(false);
  const inFlightRef = useRef<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);
  const userIdRef = useRef<number | undefined>(user?.id);
  const tokenRef = useRef<string | null>(token);
  const fetchedForUserIdRef = useRef<number | null>(null);
  const initialHydratedUidRef = useRef<number | null>(bootState && user?.id ? user.id : null);
  const userId = user?.id;
  const hasUser = Boolean(user);
  const hasToken = Boolean(token);

  useEffect(() => {
    userIdRef.current = userId;
    tokenRef.current = token;
  }, [userId, token]);

  const refreshSettings = useCallback(async (force = false) => {
    const uid = userIdRef.current;
    const activeToken =
      tokenRef.current ||
      (typeof window !== 'undefined' &&
        (localStorage.getItem('Ideas_token') || localStorage.getItem('access_token')));
    if (!activeToken || !uid) {
      return;
    }
    if (inFlightRef.current && !force) {
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const res = await api.get('/v1/settings/bootstrap', {
        signal: controller.signal,
        params: force ? { _t: Date.now() } : undefined,
      });
      if (userIdRef.current !== uid) {
        return;
      }
      const payload = res?.data?.data ?? res?.data;
      if (payload && typeof payload.settings === 'object' && payload.settings !== null) {
        const nextSettings = payload.settings as TypedSettingsMap;
        const nextEpoch = Number(payload.epoch || 1);
        const nextTenantId = Number(payload.tenant_id || 1);
        setSettings(nextSettings);
        setEpoch(nextEpoch);
        setTenantId(nextTenantId);
        setLoaded(true);
        try {
          sessionStorage.setItem(
            BOOT_STORAGE_PREFIX + String(uid),
            JSON.stringify({ tenant_id: nextTenantId, epoch: nextEpoch, settings: nextSettings })
          );
        } catch {
          // ignore quota error
        }
      }
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
        if (abortRef.current === controller && userIdRef.current === uid) {
          fetchedForUserIdRef.current = null;
        }
        return;
      }
      // Graceful fallback when offline or pre-migration
    } finally {
      if (abortRef.current === controller) {
        inFlightRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (userId && hasToken) {
      if (fetchedForUserIdRef.current !== userId) {
        fetchedForUserIdRef.current = userId;
        if (initialHydratedUidRef.current === userId) {
          initialHydratedUidRef.current = null;
        } else {
          const cached = readCachedSettingsBoot(userId);
          if (cached) {
            setSettings(cached.settings);
            setEpoch(cached.epoch);
            setTenantId(cached.tenantId);
            setLoaded(true);
          } else {
            setSettings({});
            setEpoch(1);
            setTenantId(1);
            setLoaded(false);
          }
        }
        refreshSettings();
      }
    } else if (!hasUser) {
      fetchedForUserIdRef.current = null;
      initialHydratedUidRef.current = null;
      abortRef.current?.abort();
      inFlightRef.current = false;
      setSettings({});
      setLoaded(false);
      setEpoch(1);
      setTenantId(1);
    }
    return () => {
      if (abortRef.current) {
        if (inFlightRef.current) {
          fetchedForUserIdRef.current = null;
        }
        abortRef.current.abort();
        inFlightRef.current = false;
      }
    };
  }, [userId, hasUser, hasToken, refreshSettings]);

  useEffect(() => {
    const onUpdated = () => {
      refreshSettings(true);
    };
    window.addEventListener('tenant-config-updated', onUpdated);
    window.addEventListener('typed-settings-updated', onUpdated);
    return () => {
      window.removeEventListener('tenant-config-updated', onUpdated);
      window.removeEventListener('typed-settings-updated', onUpdated);
    };
  }, [refreshSettings]);

  const getSetting = useCallback(
    <T = any,>(key: string, fallback: T): T => {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        const v = settings[key];
        if (v !== undefined && v !== null) {
          return v as T;
        }
      }
      return fallback;
    },
    [settings]
  );

  const getSubSetting = useCallback(
    <T = any,>(key: string, subKey: string, fallback: T): T => {
      const obj = settings[key];
      if (obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, subKey)) {
        const v = obj[subKey];
        if (v !== undefined && v !== null && v !== '') {
          return v as T;
        }
      }
      return fallback;
    },
    [settings]
  );

  const value = useMemo<SettingsBootstrapContextValue>(
    () => ({
      settings,
      epoch,
      tenantId,
      loaded,
      loading,
      refreshSettings,
      getSetting,
      getSubSetting,
    }),
    [settings, epoch, tenantId, loaded, loading, refreshSettings, getSetting, getSubSetting]
  );

  return (
    <SettingsBootstrapContext.Provider value={value}>
      {children}
    </SettingsBootstrapContext.Provider>
  );
};

export function useSettingsBootstrap(): SettingsBootstrapContextValue {
  return useContext(SettingsBootstrapContext);
}

function serializeFallback(val: unknown): string {
  if (val === null || val === undefined || typeof val !== 'object') {
    return String(val);
  }
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

export function useTypedSetting<T = any>(key: string, fallback: T): T {
  const { getSetting } = useSettingsBootstrap();
  const fallbackSerialized = serializeFallback(fallback);
  const stableFallbackRef = useRef<{ sig: string; val: T }>({ sig: fallbackSerialized, val: fallback });
  if (stableFallbackRef.current.sig !== fallbackSerialized) {
    stableFallbackRef.current = { sig: fallbackSerialized, val: fallback };
  }
  const stableFallback = stableFallbackRef.current.val;
  return useMemo(() => getSetting<T>(key, stableFallback), [getSetting, key, stableFallback]);
}

export function useTypedSubSetting<T = any>(key: string, subKey: string, fallback: T): T {
  const { getSubSetting } = useSettingsBootstrap();
  const fallbackSerialized = serializeFallback(fallback);
  const stableFallbackRef = useRef<{ sig: string; val: T }>({ sig: fallbackSerialized, val: fallback });
  if (stableFallbackRef.current.sig !== fallbackSerialized) {
    stableFallbackRef.current = { sig: fallbackSerialized, val: fallback };
  }
  const stableFallback = stableFallbackRef.current.val;
  return useMemo(() => getSubSetting<T>(key, subKey, stableFallback), [getSubSetting, key, subKey, stableFallback]);
}

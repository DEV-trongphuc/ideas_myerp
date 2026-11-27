import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  SlidersHorizontal,
  KeyRound,
  History,
  ShieldCheck,
  Search,
  RefreshCw,
  Save,
  RotateCcw,
  X,
  ChevronDown,
  ChevronRight,
  Lock,
  Layers,
  Code2,
} from 'lucide-react';
import api from '../../api/axios';
import { useUIStore } from '../../store/uiStore';
import { useSettingsBootstrap } from '../../contexts/SettingsBootstrapContext';
import { useTenantConfig } from '../../contexts/TenantConfigContext';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { EmptyCard } from '../ui/EmptyCard';
import { Avatar } from '../ui/Avatar';
import { pushOverlay } from '../../utils/overlayStack';
import { ensureArray } from '../../utils/safeArray';

interface TypedSettingsRegistryPanelProps {
  canWrite: boolean;
  isSuperAdmin: boolean;
}

interface CatalogSettingItem {
  setting_key: string;
  domain: string;
  ui_group: string;
  label: string;
  description?: string | null;
  value_type: string;
  allowed_scopes: string[];
  default_value: any;
  value: any;
  validation_json?: string | null;
  is_secret: boolean;
  has_secret_value: boolean;
  is_public_boot: boolean;
  required_perm: string;
  resolved_scope: string;
  version: number;
  updated_at?: string | null;
}

interface CatalogStats {
  total_keys: number;
  active_overrides: number;
  configured_secrets: number;
  total_secrets: number;
  revisions_30d?: number;
  privileged_2fa_enforced?: boolean;
  schema_coverage_pct?: number;
}

interface RevisionRow {
  id: number;
  tenant_id: number;
  scope_type: string;
  scope_id: number;
  setting_key: string;
  old_value_masked: string | null;
  new_value_masked: string | null;
  is_secret: number;
  changed_by?: number | null;
  changed_by_name?: string;
  correlation_id?: string | null;
  ip_address?: string | null;
  changed_at: string;
}

const DOMAIN_TABS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'core', label: 'Core' },
  { id: 'auth', label: 'Auth' },
  { id: 'crm', label: 'CRM' },
  { id: 'finance', label: 'Tài chính' },
  { id: 'hrm', label: 'HRM' },
  { id: 'academic', label: 'Học vụ' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'ai', label: 'AI' },
  { id: 'ui', label: 'UI' },
  { id: 'audit', label: 'Audit' },
];

const CARD_STYLE: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
};

const KPI_LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.73rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: '#64748b',
  textTransform: 'uppercase',
};

const SECRET_SUBKEY_RE =
  /^(api_token|bot_token|app_secret|oa_token|access_token|refresh_token|link_ip_salt|gemini_key|groq_key|crm_gateway_key|gcp_tts_key|ses_password|smtp_pass|webhook_secret|api_key|secret_key|password)$/i;

const getCompletenessTone = (pct: number): string => {
  if (pct >= 80) return '#10b981';
  if (pct >= 50) return '#f59e0b';
  return '#ef4444';
};

const isAbortError = (err: any): boolean =>
  err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';

const safeStringify = (v: any): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

const formatDt = (raw?: string | null): string => {
  if (!raw) return '—';
  const d = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('vi-VN', { hour12: false });
};

export const TypedSettingsRegistryPanel: React.FC<TypedSettingsRegistryPanelProps> = ({
  canWrite,
  isSuperAdmin,
}) => {
  const addToast = useUIStore((s) => s.addToast);
  const showConfirm = useUIStore((s) => s.showConfirm);
  const { refreshSettings } = useSettingsBootstrap();
  const { refreshTenantConfig: fetchTenantConfig } = useTenantConfig();

  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyCustomized, setOnlyCustomized] = useState<boolean>(false);
  const [onlySecrets, setOnlySecrets] = useState<boolean>(false);

  const [items, setItems] = useState<CatalogSettingItem[]>([]);
  const [stats, setStats] = useState<CatalogStats>({
    total_keys: 0,
    active_overrides: 0,
    configured_secrets: 0,
    total_secrets: 0,
    revisions_30d: 0,
    privileged_2fa_enforced: true,
    schema_coverage_pct: 100,
  });
  const [tenantId, setTenantId] = useState<number>(1);
  const [epoch, setEpoch] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  const [draftValues, setDraftValues] = useState<Record<string, any>>({});
  const [rawJsonMode, setRawJsonMode] = useState<Record<string, boolean>>({});
  const [rawJsonBuffers, setRawJsonBuffers] = useState<Record<string, string>>({});
  const [rawJsonErrors, setRawJsonErrors] = useState<Record<string, string>>({});
  const [scopeOverrides, setScopeOverrides] = useState<Record<string, string>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [showDiffPreview, setShowDiffPreview] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Revision Drawer State (220ms synced Portal)
  const [revDrawerKey, setRevDrawerKey] = useState<string | null>(null);
  const [revDrawerMounted, setRevDrawerMounted] = useState<boolean>(false);
  const [revDrawerVisible, setRevDrawerVisible] = useState<boolean>(false);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [revLoading, setRevLoading] = useState<boolean>(false);
  const [rollingBackId, setRollingBackId] = useState<number | null>(null);

  const catalogAbortRef = useRef<AbortController | null>(null);
  const revAbortRef = useRef<AbortController | null>(null);
  const saveInFlightRef = useRef<boolean>(false);
  const rollbackInFlightRef = useRef<boolean>(false);
  const drawerTimerRef = useRef<number | null>(null);

  const loadCatalog = useCallback(async (domainFilter?: string) => {
    catalogAbortRef.current?.abort();
    const ctrl = new AbortController();
    catalogAbortRef.current = ctrl;
    setLoading(true);
    try {
      const targetDomain = domainFilter ?? selectedDomain;
      const res = await api.get('/v1/settings/catalog', {
        signal: ctrl.signal,
        params: targetDomain && targetDomain !== 'all' ? { domain: targetDomain } : undefined,
      });
      const data = res?.data?.data ?? res?.data ?? {};
      const nextItems = ensureArray<CatalogSettingItem>(data.items);
      setItems(nextItems);
      if (data.stats) setStats(data.stats);
      if (data.tenant_id) setTenantId(Number(data.tenant_id));
      if (data.epoch) setEpoch(Number(data.epoch));
      setDraftValues({});
      setRawJsonErrors({});
      setRawJsonBuffers({});
      setScopeOverrides({});
    } catch (err: any) {
      if (!isAbortError(err)) {
        addToast(err?.response?.data?.message || 'Không thể tải danh mục cấu hình hệ thống.', 'error');
      }
    } finally {
      if (catalogAbortRef.current === ctrl) {
        setLoading(false);
      }
    }
  }, [selectedDomain, addToast]);

  useEffect(() => {
    loadCatalog(selectedDomain);
    return () => {
      catalogAbortRef.current?.abort();
      revAbortRef.current?.abort();
      if (drawerTimerRef.current) window.clearTimeout(drawerTimerRef.current);
    };
  }, [selectedDomain, loadCatalog]);

  const closeRevisionDrawer = useCallback(() => {
    setRevDrawerVisible(false);
    if (drawerTimerRef.current) window.clearTimeout(drawerTimerRef.current);
    drawerTimerRef.current = window.setTimeout(() => {
      setRevDrawerMounted(false);
      setRevDrawerKey(null);
    }, 220);
  }, []);

  const openRevisionDrawer = useCallback(
    async (settingKey: string) => {
      if (drawerTimerRef.current) window.clearTimeout(drawerTimerRef.current);
      setRevDrawerKey(settingKey);
      setRevDrawerMounted(true);
      requestAnimationFrame(() => setRevDrawerVisible(true));

      revAbortRef.current?.abort();
      const ctrl = new AbortController();
      revAbortRef.current = ctrl;
      setRevLoading(true);
      try {
        const res = await api.get('/v1/settings/revisions', {
          signal: ctrl.signal,
          params: { setting_key: settingKey, limit: 50 },
        });
        const data = res?.data?.data ?? res?.data ?? {};
        setRevisions(ensureArray<RevisionRow>(data.items));
      } catch (err: any) {
        if (!isAbortError(err)) {
          addToast(err?.response?.data?.message || 'Không thể tải lịch sử thay đổi.', 'error');
        }
      } finally {
        if (revAbortRef.current === ctrl) {
          setRevLoading(false);
        }
      }
    },
    [addToast]
  );

  useEffect(() => {
    if (!revDrawerMounted) return;
    return pushOverlay('typed-settings-revision-drawer', closeRevisionDrawer, 2147483625);
  }, [revDrawerMounted, closeRevisionDrawer]);

  const dirtyKeys = useMemo(() => {
    const keys: string[] = [];
    for (const item of items) {
      if (Object.prototype.hasOwnProperty.call(draftValues, item.setting_key)) {
        const origStr = safeStringify(item.value);
        const curStr = safeStringify(draftValues[item.setting_key]);
        if (origStr !== curStr) {
          keys.push(item.setting_key);
        }
      }
    }
    return keys;
  }, [items, draftValues]);

  const hasRawJsonError = useMemo(
    () => Object.values(rawJsonErrors).some((e) => Boolean(e)),
    [rawJsonErrors]
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (onlyCustomized && item.resolved_scope === 'default') return false;
      if (onlySecrets && !item.is_secret) return false;
      if (!q) return true;
      return (
        item.setting_key.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.ui_group.toLowerCase().includes(q) ||
        String(item.description || '').toLowerCase().includes(q)
      );
    });
  }, [items, searchQuery, onlyCustomized, onlySecrets]);

  const groupedItems = useMemo(() => {
    const map = new Map<string, CatalogSettingItem[]>();
    for (const item of filteredItems) {
      const grp = item.ui_group || 'General';
      const arr = map.get(grp);
      if (arr) arr.push(item);
      else map.set(grp, [item]);
    }
    return Array.from(map.entries());
  }, [filteredItems]);

  const setKeyDraft = (item: CatalogSettingItem, nextVal: any) => {
    if (!canWrite) return;
    setDraftValues((prev) => ({ ...prev, [item.setting_key]: nextVal }));
  };

  const getEffectiveDraft = (item: CatalogSettingItem) =>
    Object.prototype.hasOwnProperty.call(draftValues, item.setting_key)
      ? draftValues[item.setting_key]
      : item.value;

  const handleSaveAllDirty = async () => {
    if (!canWrite || saveInFlightRef.current || dirtyKeys.length === 0 || hasRawJsonError) return;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      // Group dirty keys by (ui_group, scope_type) to call PATCH /v1/settings/groups/:uiGroup cleanly
      const batches = new Map<string, { uiGroup: string; scopeType: string; kv: Record<string, any> }>();
      for (const key of dirtyKeys) {
        const def = items.find((i) => i.setting_key === key);
        if (!def) continue;
        const chosenScope =
          scopeOverrides[key] ||
          (def.allowed_scopes.includes('tenant') ? 'tenant' : def.allowed_scopes[0] || 'tenant');
        const batchKey = `${def.ui_group}::${chosenScope}`;
        const existing = batches.get(batchKey) || {
          uiGroup: def.ui_group,
          scopeType: chosenScope,
          kv: {},
        };
        existing.kv[key] = draftValues[key];
        batches.set(batchKey, existing);
      }

      for (const batch of batches.values()) {
        await api.patch(`/v1/settings/groups/${encodeURIComponent(batch.uiGroup)}`, {
          scope_type: batch.scopeType,
          settings: batch.kv,
        });
      }

      addToast(`Đã lưu thành công ${dirtyKeys.length} cấu hình hệ thống.`, 'success');
      await Promise.all([loadCatalog(selectedDomain), refreshSettings(true), fetchTenantConfig()]);
      setShowDiffPreview(false);
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Lỗi khi lưu cấu hình. Vui lòng kiểm tra giá trị nhập.', 'error');
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const handleRollbackRevision = (rev: RevisionRow) => {
    if (!canWrite || rev.is_secret === 1 || rollbackInFlightRef.current) return;
    showConfirm(
      'Khôi phục phiên bản cấu hình?',
      `Bạn muốn khôi phục khóa "${rev.setting_key}" về giá trị trước thay đổi #${rev.id}?`,
      async () => {
        if (rollbackInFlightRef.current) return;
        rollbackInFlightRef.current = true;
        setRollingBackId(rev.id);
        try {
          await api.post(`/v1/settings/revisions/${rev.id}/rollback`);
          addToast(`Đã khôi phục cấu hình ${rev.setting_key}.`, 'success');
          await Promise.all([
            loadCatalog(selectedDomain),
            openRevisionDrawer(rev.setting_key),
            refreshSettings(true),
            fetchTenantConfig(),
          ]);
        } catch (err: any) {
          addToast(err?.response?.data?.message || 'Không thể khôi phục phiên bản này.', 'error');
        } finally {
          rollbackInFlightRef.current = false;
          setRollingBackId(null);
        }
      }
    );
  };

  const renderFieldEditor = (item: CatalogSettingItem) => {
    const val = getEffectiveDraft(item);
    const key = item.setting_key;
    const isJsonEditorOpen = Boolean(rawJsonMode[key]);

    if (item.value_type === 'bool' || item.value_type === 'boolean') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ToggleSwitch checked={Boolean(val)} onChange={(next) => setKeyDraft(item, next)} disabled={!canWrite} />
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
            {val ? 'Đang bật' : 'Đang tắt'}
          </span>
        </div>
      );
    }

    if (item.value_type === 'int' || item.value_type === 'float') {
      return (
        <input
          type="number"
          step={item.value_type === 'float' ? 'any' : '1'}
          disabled={!canWrite}
          value={val ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            setKeyDraft(item, raw === '' ? '' : item.value_type === 'int' ? parseInt(raw, 10) : parseFloat(raw));
          }}
          className="w-full px-3 py-2 text-sm border rounded-lg"
          style={{ borderColor: '#E2E8F0', background: canWrite ? '#FFFFFF' : '#F8FAFC', color: '#0F172A' }}
        />
      );
    }

    if (item.value_type === 'string_list') {
      const listArr = Array.isArray(val) ? val : [];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <input
            type="text"
            disabled={!canWrite}
            value={listArr.join(', ')}
            onChange={(e) =>
              setKeyDraft(
                item,
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            placeholder="Nhập các giá trị phân tách bởi dấu phẩy..."
            className="w-full px-3 py-2 text-sm border rounded-lg"
            style={{ borderColor: '#E2E8F0', background: canWrite ? '#FFFFFF' : '#F8FAFC', color: '#0F172A' }}
          />
          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{listArr.length} phần tử</span>
        </div>
      );
    }

    if (item.value_type === 'json') {
      const obj = val && typeof val === 'object' && !Array.isArray(val) ? val : null;
      const canInlineFields =
        !isJsonEditorOpen &&
        obj !== null &&
        Object.keys(obj).length > 0 &&
        Object.keys(obj).length <= 16 &&
        Object.values(obj).every((fv) => typeof fv !== 'object' || fv === null);

      if (canInlineFields) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {Object.entries(obj).map(([subK, subV]) => {
                const isSecretSub = SECRET_SUBKEY_RE.test(subK);
                return (
                  <div
                    key={subK}
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                      padding: '8px 10px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '4px',
                      }}
                    >
                      <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#334155', fontFamily: 'monospace' }}>
                        {subK}
                      </span>
                      {isSecretSub && <Lock size={12} color="#BD1D2D" />}
                    </div>
                    {typeof subV === 'boolean' ? (
                      <ToggleSwitch
                        small
                        checked={subV}
                        disabled={!canWrite}
                        onChange={(checked) => setKeyDraft(item, { ...obj, [subK]: checked })}
                      />
                    ) : typeof subV === 'number' ? (
                      <input
                        type="number"
                        step="any"
                        disabled={!canWrite}
                        value={subV}
                        onChange={(e) => {
                          const num = e.target.value === '' ? 0 : Number(e.target.value);
                          setKeyDraft(item, { ...obj, [subK]: Number.isNaN(num) ? 0 : num });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs border rounded-md"
                        style={{ borderColor: '#CBD5E1', background: '#FFFFFF', color: '#0F172A' }}
                      />
                    ) : (
                      <input
                        type={isSecretSub ? 'password' : 'text'}
                        disabled={!canWrite}
                        value={subV === null || subV === undefined ? '' : String(subV)}
                        placeholder={isSecretSub ? '******** (giữ nguyên nếu không đổi)' : ''}
                        onChange={(e) => setKeyDraft(item, { ...obj, [subK]: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs border rounded-md"
                        style={{ borderColor: '#CBD5E1', background: '#FFFFFF', color: '#0F172A' }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setRawJsonBuffers((p) => ({ ...p, [key]: safeStringify(val) }));
                setRawJsonMode((p) => ({ ...p, [key]: true }));
              }}
              style={{
                alignSelf: 'flex-start',
                fontSize: '0.74rem',
                fontWeight: 600,
                color: '#64748B',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Code2 size={13} /> Chỉnh sửa JSON nâng cao
            </button>
          </div>
        );
      }

      const textVal = Object.prototype.hasOwnProperty.call(rawJsonBuffers, key)
        ? rawJsonBuffers[key]
        : safeStringify(val);

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <textarea
            rows={4}
            disabled={!canWrite}
            value={textVal}
            onChange={(e) => {
              const raw = e.target.value;
              setRawJsonBuffers((p) => ({ ...p, [key]: raw }));
              try {
                const parsed = JSON.parse(raw);
                setRawJsonErrors((p) => ({ ...p, [key]: '' }));
                setKeyDraft(item, parsed);
              } catch (jsonErr: any) {
                setRawJsonErrors((p) => ({
                  ...p,
                  [key]: jsonErr?.message || 'JSON không hợp lệ',
                }));
              }
            }}
            className="w-full px-3 py-2 text-xs font-mono border rounded-lg"
            style={{
              borderColor: rawJsonErrors[key] ? '#BD1D2D' : '#E2E8F0',
              background: canWrite ? '#FFFFFF' : '#F8FAFC',
              color: '#0F172A',
            }}
          />
          {rawJsonErrors[key] && (
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#BD1D2D' }}>
              {rawJsonErrors[key]}
            </span>
          )}
          {obj && (
            <button
              type="button"
              onClick={() => setRawJsonMode((p) => ({ ...p, [key]: false }))}
              style={{ alignSelf: 'flex-start', fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}
            >
              Quay về giao diện trường
            </button>
          )}
        </div>
      );
    }

    return (
      <input
        type={item.is_secret ? 'password' : 'text'}
        disabled={!canWrite}
        value={val ?? ''}
        placeholder={item.is_secret ? '******** (giữ nguyên nếu không đổi)' : ''}
        onChange={(e) => setKeyDraft(item, e.target.value)}
        className="w-full px-3 py-2 text-sm border rounded-lg"
        style={{ borderColor: '#E2E8F0', background: canWrite ? '#FFFFFF' : '#F8FAFC', color: '#0F172A' }}
      />
    );
  };

  const coveragePct = Number(stats.schema_coverage_pct ?? 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Top 4 Chương V KPI Cards */}
      <div className="dashboard-kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card" style={{ ...CARD_STYLE, padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <span className="stat-label" style={KPI_LABEL_STYLE}>
              CẤU HÌNH ÁP DỤNG
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(189, 29, 45, 0.08)',
                color: '#BD1D2D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <SlidersHorizontal size={16} />
            </div>
          </div>
          <div
            className="stat-value"
            style={{
              fontSize: '1.85rem',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: '#0F172A',
              margin: '8px 0 6px',
            }}
          >
            {stats.active_overrides} / {stats.total_keys}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>
              • Ghi đè Tenant/Workspace: <strong style={{ color: '#0F172A' }}>{stats.active_overrides}</strong>
            </span>
            <span>
              • Cache Epoch: <strong style={{ color: '#0F172A' }}>v{epoch}</strong>
            </span>
          </div>
        </div>

        <div className="stat-card" style={{ ...CARD_STYLE, padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <span className="stat-label" style={KPI_LABEL_STYLE}>
              KHÓA BÍ MẬT & 2FA
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(189, 29, 45, 0.08)',
                color: '#BD1D2D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <KeyRound size={16} />
            </div>
          </div>
          <div
            className="stat-value"
            style={{
              fontSize: '1.85rem',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: '#BD1D2D',
              margin: '8px 0 6px',
            }}
          >
            {stats.configured_secrets} / {stats.total_secrets}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>
              • 2FA Đặc quyền:{' '}
              <strong style={{ color: '#0F172A' }}>
                {stats.privileged_2fa_enforced ? 'Đang ép buộc' : 'Tùy chọn'}
              </strong>
            </span>
            <span>
              • Mã hóa: <strong style={{ color: '#0F172A' }}>AES-256-GCM (Masked)</strong>
            </span>
          </div>
        </div>

        <div className="stat-card" style={{ ...CARD_STYLE, padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <span className="stat-label" style={KPI_LABEL_STYLE}>
              THAY ĐỔI 30 NGÀY
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.06)',
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <History size={16} />
            </div>
          </div>
          <div
            className="stat-value"
            style={{
              fontSize: '1.85rem',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: '#0F172A',
              margin: '8px 0 6px',
            }}
          >
            {stats.revisions_30d ?? 0}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>
              • Revision Log: <strong style={{ color: '#0F172A' }}>Bất biến theo khóa</strong>
            </span>
            <span>
              • Khôi phục: <strong style={{ color: '#0F172A' }}>1-Click Rollback</strong>
            </span>
          </div>
        </div>

        <div className="stat-card" style={{ ...CARD_STYLE, padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <span className="stat-label" style={KPI_LABEL_STYLE}>
              ĐỘ PHỦ MULTI-TENANT
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.06)',
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ShieldCheck size={16} />
            </div>
          </div>
          <div
            className="stat-value"
            style={{
              fontSize: '1.85rem',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: '#0F172A',
              margin: '8px 0 6px',
            }}
          >
            {coveragePct}%
          </div>
          <div style={{ height: '5px', width: '100%', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden', marginBottom: '6px' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, coveragePct))}%`,
                background: getCompletenessTone(coveragePct),
                borderRadius: '999px',
              }}
            />
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>
              • Đơn vị hiện tại: <strong style={{ color: '#0F172A' }}>Tenant #{tenantId}</strong>
            </span>
            <span>
              • Phân hệ: <strong style={{ color: '#0F172A' }}>10 Domain chuẩn hóa</strong>
            </span>
          </div>
        </div>
      </div>

      {!canWrite && (
        <div
          style={{
            ...CARD_STYLE,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#475569',
            fontSize: '0.84rem',
          }}
        >
          <Lock size={16} color="#BD1D2D" />
          <span>Bạn đang ở chế độ Chỉ xem (Read-Only). Liên hệ Admin / Director có quyền settings:write để cập nhật cấu hình.</span>
        </div>
      )}

      {/* Domain Segmented Control Tray & Search */}
      <div style={{ ...CARD_STYLE, padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div
            style={{
              display: 'inline-flex',
              flexWrap: 'wrap',
              padding: '3px',
              borderRadius: '10px',
              background: '#F1F5F9',
              border: '1px solid #E2E8F0',
              gap: '2px',
            }}
          >
            {DOMAIN_TABS.map((t) => {
              const active = selectedDomain === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedDomain(t.id)}
                  style={{
                    height: '32px',
                    padding: '0 12px',
                    borderRadius: '7px',
                    border: 'none',
                    background: active ? '#FFFFFF' : 'transparent',
                    color: active ? '#BD1D2D' : '#64748B',
                    fontWeight: active ? 700 : 600,
                    fontSize: '0.8rem',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative', minWidth: '230px' }}>
              <Search
                size={15}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã khóa, tên nhóm..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg"
                style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
              />
            </div>

            <button
              type="button"
              onClick={() => setOnlyCustomized((v) => !v)}
              style={{
                height: '34px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                background: onlyCustomized ? '#FEF2F2' : '#FFFFFF',
                color: onlyCustomized ? '#BD1D2D' : '#475569',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Đang ghi đè ({items.filter((i) => i.resolved_scope !== 'default').length})
            </button>

            <button
              type="button"
              onClick={() => setOnlySecrets((v) => !v)}
              style={{
                height: '34px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                background: onlySecrets ? '#FEF2F2' : '#FFFFFF',
                color: onlySecrets ? '#BD1D2D' : '#475569',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Khóa bí mật
            </button>

            <button
              type="button"
              onClick={() => loadCatalog(selectedDomain)}
              disabled={loading}
              style={{
                height: '34px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                color: '#334155',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Tải lại
            </button>
          </div>
        </div>
      </div>

      {/* Grouped Catalog Cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((idx) => (
            <div key={idx} className="animate-pulse" style={{ ...CARD_STYLE, padding: '20px', height: '140px' }} />
          ))}
        </div>
      ) : groupedItems.length === 0 ? (
        <div style={{ ...CARD_STYLE, padding: '24px' }}>
          <EmptyCard
            icon={<SlidersHorizontal size={28} />}
            title="Không tìm thấy cấu hình phù hợp"
            description="Thử thay đổi bộ lọc phân hệ hoặc từ khóa tìm kiếm."
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: dirtyKeys.length > 0 ? '88px' : '8px' }}>
          {groupedItems.map(([groupName, groupRows]) => {
            const isCollapsed = Boolean(collapsedGroups[groupName]);
            const dirtyInGroup = groupRows.filter((r) => dirtyKeys.includes(r.setting_key)).length;
            return (
              <div key={groupName} style={{ ...CARD_STYLE, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setCollapsedGroups((p) => ({ ...p, [groupName]: !p[groupName] }))}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#F8FAFC',
                    borderBottom: isCollapsed ? 'none' : '1px solid #E2E8F0',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isCollapsed ? <ChevronRight size={16} color="#64748B" /> : <ChevronDown size={16} color="#64748B" />}
                    <Layers size={15} color="#BD1D2D" />
                    <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0F172A' }}>{groupName}</span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: '#E2E8F0',
                        color: '#334155',
                      }}
                    >
                      {groupRows.length} khóa
                    </span>
                    {dirtyInGroup > 0 && (
                      <span
                        style={{
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: 'rgba(189, 29, 45, 0.1)',
                          color: '#BD1D2D',
                        }}
                      >
                        {dirtyInGroup} chưa lưu
                      </span>
                    )}
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-slate-100">
                    {groupRows.map((item) => {
                      const isDirty = dirtyKeys.includes(item.setting_key);
                      const writableScopes = item.allowed_scopes.filter((sc) =>
                        sc === 'global' ? isSuperAdmin : true
                      );
                      const chosenScope =
                        scopeOverrides[item.setting_key] ||
                        (writableScopes.includes('tenant') ? 'tenant' : writableScopes[0] || 'tenant');

                      return (
                        <div key={item.setting_key} style={{ padding: '16px 18px', background: isDirty ? '#FFFDFD' : '#FFFFFF' }}>
                          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>{item.label}</span>
                                <code
                                  style={{
                                    fontSize: '0.72rem',
                                    padding: '2px 6px',
                                    borderRadius: '5px',
                                    background: '#F1F5F9',
                                    color: '#334155',
                                  }}
                                >
                                  {item.setting_key}
                                </code>
                                <span
                                  style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    padding: '2px 7px',
                                    borderRadius: '5px',
                                    background: item.resolved_scope === 'default' ? '#F1F5F9' : 'rgba(189, 29, 45, 0.08)',
                                    color: item.resolved_scope === 'default' ? '#64748B' : '#BD1D2D',
                                  }}
                                >
                                  {item.resolved_scope === 'default' ? 'Mặc định' : `Scope: ${item.resolved_scope}`} • v{item.version}
                                </span>
                                {item.is_secret && (
                                  <span
                                    style={{
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      padding: '2px 7px',
                                      borderRadius: '5px',
                                      background: '#FEF2F2',
                                      color: '#BD1D2D',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                    }}
                                  >
                                    <Lock size={11} /> Secret
                                  </span>
                                )}
                              </div>
                              {item.description && (
                                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 6px' }}>{item.description}</p>
                              )}
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', fontSize: '0.74rem', color: '#64748B' }}>
                                <span>Kiểu: <strong>{item.value_type}</strong></span>
                                {item.updated_at && <span>Cập nhật: {formatDt(item.updated_at)}</span>}
                                {writableScopes.length > 1 && canWrite && (
                                  <select
                                    value={chosenScope}
                                    onChange={(e) =>
                                      setScopeOverrides((p) => ({ ...p, [item.setting_key]: e.target.value }))
                                    }
                                    style={{
                                      border: '1px solid #E2E8F0',
                                      borderRadius: '6px',
                                      padding: '2px 6px',
                                      fontSize: '0.73rem',
                                      color: '#334155',
                                      background: '#FFFFFF',
                                    }}
                                  >
                                    {writableScopes.map((sc) => (
                                      <option key={sc} value={sc}>
                                        Lưu ở scope: {sc}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openRevisionDrawer(item.setting_key)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: '#334155',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <History size={13} /> Lịch sử
                                </button>
                              </div>
                            </div>

                            <div style={{ flex: '1 1 360px', maxWidth: '560px', width: '100%' }}>
                              {renderFieldEditor(item)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky Diff-Before-Save Bar */}
      {canWrite && dirtyKeys.length > 0 && (
        <div
          style={{
            position: 'sticky',
            bottom: '12px',
            zIndex: 50,
            ...CARD_STYLE,
            padding: '14px 18px',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
          }}
        >
          {showDiffPreview && (
            <div
              style={{
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: '1px solid #E2E8F0',
                maxHeight: '220px',
                overflowY: 'auto',
              }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                Xem trước Diff trước khi áp dụng ({dirtyKeys.length} khóa)
              </div>
              <div className="space-y-2">
                {dirtyKeys.map((k) => {
                  const orig = items.find((i) => i.setting_key === k);
                  return (
                    <div
                      key={k}
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        fontSize: '0.76rem',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>{k}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <pre style={{ margin: 0, color: '#64748B', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          Trước: {orig?.is_secret ? '********' : safeStringify(orig?.value)}
                        </pre>
                        <pre style={{ margin: 0, color: '#BD1D2D', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          Sau: {orig?.is_secret ? '******** (cập nhật)' : safeStringify(draftValues[k])}
                        </pre>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#0F172A' }}>
              <span
                style={{
                  padding: '3px 9px',
                  borderRadius: '7px',
                  background: 'rgba(189, 29, 45, 0.1)',
                  color: '#BD1D2D',
                  fontWeight: 700,
                }}
              >
                {dirtyKeys.length} thay đổi chờ lưu
              </span>
              <button
                type="button"
                onClick={() => setShowDiffPreview((v) => !v)}
                style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', textDecoration: 'underline', cursor: 'pointer' }}
              >
                {showDiffPreview ? 'Ẩn Diff' : 'Xem Diff Before/After'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setDraftValues({});
                  setRawJsonBuffers({});
                  setRawJsonErrors({});
                  setShowDiffPreview(false);
                }}
                style={{
                  height: '36px',
                  padding: '0 14px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                Hủy thay đổi
              </button>
              <button
                type="button"
                disabled={saving || hasRawJsonError}
                onClick={handleSaveAllDirty}
                style={{
                  height: '36px',
                  padding: '0 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: hasRawJsonError ? '#94A3B8' : '#BD1D2D',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: hasRawJsonError ? 'not-allowed' : 'pointer',
                }}
              >
                <Save size={15} /> {saving ? 'Đang lưu...' : 'Áp dụng & Đồng bộ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal Revision History & Rollback Drawer (220ms cubic-bezier) */}
      {revDrawerMounted &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="drawer-backdrop"
              onClick={closeRevisionDrawer}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2147483620,
                background: 'rgba(15, 23, 42, 0.45)',
                opacity: revDrawerVisible ? 1 : 0,
                transition: 'opacity 220ms cubic-bezier(0.25, 0.1, 0.25, 1)',
              }}
            />
            <div
              className="drawer-panel"
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: 'min(540px, 100vw)',
                zIndex: 2147483625,
                background: '#FFFFFF',
                borderLeft: '1px solid #E2E8F0',
                boxShadow: '-12px 0 32px rgba(15, 23, 42, 0.16)',
                transform: revDrawerVisible ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 220ms cubic-bezier(0.25, 0.1, 0.25, 1)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  padding: '18px 20px',
                  borderBottom: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                    Lịch sử Revision cấu hình
                  </div>
                  <code style={{ fontSize: '0.75rem', color: '#BD1D2D' }}>{revDrawerKey}</code>
                </div>
                <button
                  type="button"
                  onClick={closeRevisionDrawer}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {revLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse h-24 rounded-xl bg-slate-100" />
                    ))}
                  </div>
                ) : revisions.length === 0 ? (
                  <EmptyCard
                    icon={<History size={28} />}
                    title="Chưa có lịch sử chỉnh sửa"
                    description="Khóa cấu hình này hiện đang sử dụng giá trị khởi tạo mặc định."
                  />
                ) : (
                  revisions.map((rev) => (
                    <div key={rev.id} style={{ ...CARD_STYLE, padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Avatar name={rev.changed_by_name || 'System'} size={26} />
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                              {rev.changed_by_name || 'Hệ thống'}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                              #{rev.id} • {formatDt(rev.changed_at)} • {rev.scope_type}
                            </div>
                          </div>
                        </div>

                        {canWrite && rev.is_secret === 0 && (
                          <button
                            type="button"
                            disabled={rollingBackId === rev.id}
                            onClick={() => handleRollbackRevision(rev)}
                            style={{
                              height: '30px',
                              padding: '0 10px',
                              borderRadius: '7px',
                              border: '1px solid #E2E8F0',
                              background: '#FFFFFF',
                              color: '#BD1D2D',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            <RotateCcw size={13} /> {rollingBackId === rev.id ? 'Đang khôi phục...' : 'Khôi phục'}
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-2 text-xs">
                        <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '8px', border: '1px solid #E2E8F0' }}>
                          <div style={{ fontWeight: 700, color: '#64748B', marginBottom: '2px' }}>Trước:</div>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#334155' }}>
                            {rev.is_secret === 1 ? '********' : rev.old_value_masked || '—'}
                          </pre>
                        </div>
                        <div style={{ background: '#FFFDFD', borderRadius: '8px', padding: '8px', border: '1px solid #E2E8F0' }}>
                          <div style={{ fontWeight: 700, color: '#BD1D2D', marginBottom: '2px' }}>Sau:</div>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#0F172A' }}>
                            {rev.is_secret === 1 ? '********' : rev.new_value_masked || '—'}
                          </pre>
                        </div>
                      </div>

                      {(rev.ip_address || rev.correlation_id) && (
                        <div style={{ marginTop: '6px', fontSize: '0.71rem', color: '#94A3B8' }}>
                          IP: {rev.ip_address || '—'} • Corr: {rev.correlation_id || '—'}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
};

export default TypedSettingsRegistryPanel;

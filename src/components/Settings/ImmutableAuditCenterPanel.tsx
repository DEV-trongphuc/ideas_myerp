import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  ShieldAlert,
  FileCog,
  CheckCircle2,
  AlertTriangle,
  Search,
  RefreshCw,
  Download,
  Eye,
  X,
  Link2,
  ShieldCheck,
} from 'lucide-react';
import api from '../../api/axios';
import { useUIStore } from '../../store/uiStore';
import { Avatar } from '../ui/Avatar';
import { EmptyCard } from '../ui/EmptyCard';
import { pushOverlay } from '../../utils/overlayStack';
import { ensureArray } from '../../utils/safeArray';

type AuditStream = 'admin' | 'activity' | 'security';

interface ImmutableAuditCenterPanelProps {
  canExport?: boolean;
  defaultStream?: AuditStream;
}

interface AuditLogRow {
  id: number;
  stream: AuditStream;
  tenant_id: number;
  correlation_id?: string | null;
  actor_id?: number | null;
  actor_name?: string | null;
  severity?: string | null;
  module?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | number | null;
  summary?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  prev_hash?: string | null;
  row_hash?: string | null;
  created_at: string;
}

interface ChainReport {
  verified: boolean;
  checked_count: number;
  legacy_unhashed?: number;
  broken_links?: Array<{ id: number; reason: string }>;
  latest_hash?: string | null;
}

interface AuditStats {
  total_events_24h: number;
  total_events_30d: number;
  high_critical_security_30d: number;
  rbac_and_settings_changes_30d: number;
  chain_verified: boolean;
  admin_chain?: ChainReport;
  security_chain?: ChainReport;
}

interface DiffPayload {
  stream: AuditStream;
  row: Record<string, any>;
  before: any;
  after: any;
  diff_keys: string[];
  correlated_events: Array<{
    id: number;
    stream: AuditStream;
    action: string;
    label: string;
    created_at: string;
  }>;
}

const STREAM_TABS: Array<{ id: AuditStream; label: string }> = [
  { id: 'admin', label: 'Nhật ký Quản trị (Admin)' },
  { id: 'activity', label: 'Hoạt động Người dùng (Activity)' },
  { id: 'security', label: 'Bảo mật & Xác thực (Security)' },
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

const isAbortError = (err: any): boolean =>
  err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';

const formatDt = (raw?: string | null): string => {
  if (!raw) return '—';
  const d = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('vi-VN', { hour12: false });
};

const formatJsonBlock = (val: any): string => {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
};

export const ImmutableAuditCenterPanel: React.FC<ImmutableAuditCenterPanelProps> = ({
  canExport = true,
  defaultStream = 'admin',
}) => {
  const addToast = useUIStore((s) => s.addToast);

  const [stream, setStream] = useState<AuditStream>(defaultStream);
  const [searchQ, setSearchQ] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [severity, setSeverity] = useState<string>('');
  const [correlationId, setCorrelationId] = useState<string>('');
  const [ipFilter, setIpFilter] = useState<string>('');

  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [verifyingChain, setVerifyingChain] = useState<boolean>(false);
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'jsonl' | null>(null);

  // Diff Drawer state (220ms synchronized Portal)
  const [diffMounted, setDiffMounted] = useState<boolean>(false);
  const [diffVisible, setDiffVisible] = useState<boolean>(false);
  const [diffLoading, setDiffLoading] = useState<boolean>(false);
  const [diffData, setDiffData] = useState<DiffPayload | null>(null);

  const listAbortRef = useRef<AbortController | null>(null);
  const diffAbortRef = useRef<AbortController | null>(null);
  const verifyInFlightRef = useRef<boolean>(false);
  const exportInFlightRef = useRef<boolean>(false);
  const drawerTimerRef = useRef<number | null>(null);

  const fetchLogs = useCallback(
    async (cursor?: number | null) => {
      const isAppend = Boolean(cursor);
      if (!isAppend) {
        listAbortRef.current?.abort();
      }
      const ctrl = new AbortController();
      if (!isAppend) listAbortRef.current = ctrl;

      if (isAppend) setLoadingMore(true);
      else setLoading(true);

      try {
        const res = await api.get('/v1/audit/logs', {
          signal: ctrl.signal,
          params: {
            stream,
            limit: 50,
            include_stats: isAppend ? undefined : 1,
            cursor_id: cursor || undefined,
            q: searchQ.trim() || undefined,
            from_date: fromDate || undefined,
            to_date: toDate || undefined,
            severity: stream === 'security' && severity ? severity : undefined,
            correlation_id: correlationId.trim() || undefined,
            ip_address: ipFilter.trim() || undefined,
          },
        });
        const data = res?.data?.data ?? res?.data ?? {};
        const rows = ensureArray<AuditLogRow>(data.items);
        setItems((prev) => (isAppend ? [...prev, ...rows] : rows));
        setNextCursor(data.next_cursor ?? null);
        if (data.stats) {
          setStats(data.stats);
        }
      } catch (err: any) {
        if (!isAbortError(err)) {
          addToast(err?.response?.data?.message || 'Không thể tải dữ liệu nhật ký kiểm toán.', 'error');
        }
      } finally {
        if (isAppend) setLoadingMore(false);
        else if (listAbortRef.current === ctrl) setLoading(false);
      }
    },
    [stream, searchQ, fromDate, toDate, severity, correlationId, ipFilter, addToast]
  );

  useEffect(() => {
    fetchLogs(null);
    return () => {
      listAbortRef.current?.abort();
      diffAbortRef.current?.abort();
      if (drawerTimerRef.current) window.clearTimeout(drawerTimerRef.current);
    };
  }, [fetchLogs]);

  const closeDiffDrawer = useCallback(() => {
    setDiffVisible(false);
    if (drawerTimerRef.current) window.clearTimeout(drawerTimerRef.current);
    drawerTimerRef.current = window.setTimeout(() => {
      setDiffMounted(false);
      setDiffData(null);
    }, 220);
  }, []);

  const openDiffDrawer = useCallback(
    async (targetStream: AuditStream, id: number) => {
      if (drawerTimerRef.current) window.clearTimeout(drawerTimerRef.current);
      setDiffMounted(true);
      requestAnimationFrame(() => setDiffVisible(true));

      diffAbortRef.current?.abort();
      const ctrl = new AbortController();
      diffAbortRef.current = ctrl;
      setDiffLoading(true);
      try {
        const res = await api.get(`/v1/audit/logs/${targetStream}/${id}/diff`, {
          signal: ctrl.signal,
        });
        const payload = (res?.data?.data ?? res?.data) as DiffPayload;
        setDiffData(payload);
      } catch (err: any) {
        if (!isAbortError(err)) {
          addToast(err?.response?.data?.message || 'Không thể tải chi tiết Diff.', 'error');
          closeDiffDrawer();
        }
      } finally {
        if (diffAbortRef.current === ctrl) {
          setDiffLoading(false);
        }
      }
    },
    [addToast, closeDiffDrawer]
  );

  useEffect(() => {
    if (!diffMounted) return;
    return pushOverlay('immutable-audit-diff-drawer', closeDiffDrawer, 2147483625);
  }, [diffMounted, closeDiffDrawer]);

  const handleVerifyIntegrity = async () => {
    if (verifyInFlightRef.current) return;
    verifyInFlightRef.current = true;
    setVerifyingChain(true);
    try {
      const res = await api.get('/v1/audit/integrity-check', { params: { limit: 1000 } });
      const data = res?.data?.data ?? res?.data ?? {};
      const ok = Boolean(data.all_verified);
      setStats((prev) =>
        prev
          ? {
              ...prev,
              chain_verified: ok,
              admin_chain: data.admin,
              security_chain: data.security,
            }
          : prev
      );
      if (ok) {
        addToast(
          `Chuỗi SHA-256 toàn vẹn 100% (Admin: ${data.admin?.checked_count ?? 0}, Security: ${data.security?.checked_count ?? 0}).`,
          'success'
        );
      } else {
        addToast('Cảnh báo: Phát hiện liên kết Hash bất thường trong chuỗi nhật ký!', 'error');
      }
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Lỗi kiểm chứng chuỗi Hash.', 'error');
    } finally {
      verifyInFlightRef.current = false;
      setVerifyingChain(false);
    }
  };

  const handleExport = async (format: 'csv' | 'jsonl') => {
    if (!canExport || exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setExportingFormat(format);
    try {
      const res = await api.get('/v1/audit/export', {
        responseType: 'blob',
        params: {
          stream,
          format,
          q: searchQ.trim() || undefined,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          severity: stream === 'security' && severity ? severity : undefined,
          correlation_id: correlationId.trim() || undefined,
          ip_address: ipFilter.trim() || undefined,
        },
      });
      const blob = new Blob([res.data], {
        type: format === 'jsonl' ? 'application/x-ndjson' : 'text/csv;charset=utf-8;',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `myerp_audit_${stream}_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      addToast(`Đã xuất nhật ký ${stream.toUpperCase()} (${format.toUpperCase()}).`, 'success');
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Xuất tệp nhật ký thất bại.', 'error');
    } finally {
      exportInFlightRef.current = false;
      setExportingFormat(null);
    }
  };

  const chainOk = stats?.chain_verified ?? true;
  const brokenTotal =
    (stats?.admin_chain?.broken_links?.length ?? 0) + (stats?.security_chain?.broken_links?.length ?? 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Top 4 Chương V KPI Cards */}
      <div className="dashboard-kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card" style={{ ...CARD_STYLE, padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <span className="stat-label" style={KPI_LABEL_STYLE}>
              SỰ KIỆN GHI NHẬN (24H)
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
              }}
            >
              <Activity size={16} />
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
            {(stats?.total_events_24h ?? 0).toLocaleString('vi-VN')}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>
              • Tổng 30 ngày: <strong style={{ color: '#0F172A' }}>{(stats?.total_events_30d ?? 0).toLocaleString('vi-VN')}</strong>
            </span>
            <span>
              • Cơ chế: <strong style={{ color: '#0F172A' }}>3-Stream Append-Only</strong>
            </span>
          </div>
        </div>

        <div className="stat-card" style={{ ...CARD_STYLE, padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <span className="stat-label" style={KPI_LABEL_STYLE}>
              CẢNH BÁO BẢO MẬT (30D)
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
              }}
            >
              <ShieldAlert size={16} />
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
            {(stats?.high_critical_security_30d ?? 0).toLocaleString('vi-VN')}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>
              • Mức độ: <strong style={{ color: '#0F172A' }}>High & Critical</strong>
            </span>
            <span>
              • Bao gồm: <strong style={{ color: '#0F172A' }}>RBAC Denied, 2FA, IP Block</strong>
            </span>
          </div>
        </div>

        <div className="stat-card" style={{ ...CARD_STYLE, padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <span className="stat-label" style={KPI_LABEL_STYLE}>
              THAY ĐỔI QUYỀN & CẤU HÌNH
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
              }}
            >
              <FileCog size={16} />
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
            {(stats?.rbac_and_settings_changes_30d ?? 0).toLocaleString('vi-VN')}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>
              • Admin Chain: <strong style={{ color: '#0F172A' }}>{stats?.admin_chain?.checked_count ?? 0} bản ghi</strong>
            </span>
            <span>
              • Security Chain: <strong style={{ color: '#0F172A' }}>{stats?.security_chain?.checked_count ?? 0} bản ghi</strong>
            </span>
          </div>
        </div>

        <div className="stat-card" style={{ ...CARD_STYLE, padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <span className="stat-label" style={KPI_LABEL_STYLE}>
              TOÀN VẸN SHA-256 CHAIN
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
              }}
            >
              {chainOk ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} color="#BD1D2D" />}
            </div>
          </div>
          <div
            className="stat-value"
            style={{
              fontSize: '1.55rem',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: '#0F172A',
              margin: '8px 0 6px',
            }}
          >
            {chainOk ? 'Hợp lệ 100%' : `${brokenTotal} Lỗi`}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span>
              • Liên kết hỏng: <strong style={{ color: brokenTotal > 0 ? '#BD1D2D' : '#0F172A' }}>{brokenTotal}</strong>
            </span>
            <button
              type="button"
              disabled={verifyingChain}
              onClick={handleVerifyIntegrity}
              style={{
                alignSelf: 'flex-start',
                color: '#BD1D2D',
                fontWeight: 700,
                fontSize: '0.76rem',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              {verifyingChain ? 'Đang đối soát SHA-256...' : 'Kiểm chứng chuỗi ngay'}
            </button>
          </div>
        </div>
      </div>

      {/* Stream Segmented Control & Filters */}
      <div style={{ ...CARD_STYLE, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
            {STREAM_TABS.map((t) => {
              const active = stream === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setStream(t.id);
                    setSeverity('');
                  }}
                  style={{
                    height: '32px',
                    padding: '0 14px',
                    borderRadius: '7px',
                    border: 'none',
                    background: active ? '#FFFFFF' : 'transparent',
                    color: active ? '#BD1D2D' : '#64748B',
                    fontWeight: active ? 700 : 600,
                    fontSize: '0.82rem',
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
            {canExport && (
              <>
                <button
                  type="button"
                  disabled={exportingFormat !== null}
                  onClick={() => handleExport('csv')}
                  style={{
                    height: '34px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    color: '#0F172A',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                  }}
                >
                  <Download size={14} /> {exportingFormat === 'csv' ? 'Đang xuất...' : 'Xuất CSV'}
                </button>
                <button
                  type="button"
                  disabled={exportingFormat !== null}
                  onClick={() => handleExport('jsonl')}
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
                  <Download size={14} /> {exportingFormat === 'jsonl' ? 'Đang xuất...' : 'JSONL'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => fetchLogs(null)}
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
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Làm mới
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}
            />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Hành động, module, mô tả..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg"
              style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
            />
          </div>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            aria-label="Từ ngày"
            className="w-full px-3 py-1.5 text-sm border rounded-lg"
            style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            aria-label="Đến ngày"
            className="w-full px-3 py-1.5 text-sm border rounded-lg"
            style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
          />
          <input
            type="text"
            value={ipFilter}
            onChange={(e) => setIpFilter(e.target.value)}
            placeholder="Lọc IP (vd: 103.)"
            className="w-full px-3 py-1.5 text-sm border rounded-lg"
            style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
          />
          {stream === 'security' ? (
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded-lg"
              style={{ borderColor: '#E2E8F0', color: '#0F172A', background: '#FFFFFF' }}
            >
              <option value="">Tất cả mức độ</option>
              <option value="info">Info</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          ) : (
            <input
              type="text"
              value={correlationId}
              onChange={(e) => setCorrelationId(e.target.value)}
              placeholder="Correlation ID..."
              className="w-full px-3 py-1.5 text-sm border rounded-lg"
              style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
            />
          )}
        </div>

        {(correlationId || fromDate || toDate || ipFilter || searchQ || severity) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748B' }}>
            <span>Đang lọc dữ liệu nhật ký bất biến</span>
            <button
              type="button"
              onClick={() => {
                setSearchQ('');
                setFromDate('');
                setToDate('');
                setSeverity('');
                setCorrelationId('');
                setIpFilter('');
              }}
              style={{ color: '#BD1D2D', fontWeight: 700, cursor: 'pointer' }}
            >
              Xóa bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* Immutable Audit Table */}
      <div style={{ ...CARD_STYLE, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '18px' }} className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse h-12 rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '24px' }}>
            <EmptyCard
              icon={<ShieldCheck size={28} />}
              title="Chưa có sự kiện kiểm toán nào"
              description="Nhật ký ghi nhận tự động theo thời gian thực khi có thao tác trên hệ thống."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" style={{ fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.73rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '11px 14px', fontWeight: 700 }}>Thời gian</th>
                  <th style={{ padding: '11px 14px', fontWeight: 700 }}>Tác nhân</th>
                  <th style={{ padding: '11px 14px', fontWeight: 700 }}>Hành động / Module</th>
                  <th style={{ padding: '11px 14px', fontWeight: 700 }}>Đối tượng / Tóm tắt</th>
                  <th style={{ padding: '11px 14px', fontWeight: 700 }}>IP / Correlation</th>
                  <th style={{ padding: '11px 14px', fontWeight: 700, textAlign: 'right' }}>Chi tiết Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row) => {
                  const isHighSec = row.severity === 'high' || row.severity === 'critical';
                  return (
                    <tr key={`${row.stream}-${row.id}`} className="hover:bg-slate-50/70">
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ fontWeight: 600 }}>{formatDt(row.created_at)}</div>
                        <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>#{row.id}</div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Avatar name={row.actor_name || 'System'} size={26} />
                          <div>
                            <div style={{ fontWeight: 600, color: '#0F172A' }}>{row.actor_name || 'Hệ thống'}</div>
                            {row.actor_id ? (
                              <div style={{ fontSize: '0.71rem', color: '#64748B' }}>UID #{row.actor_id}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              padding: '2px 7px',
                              borderRadius: '6px',
                              background: isHighSec ? 'rgba(189, 29, 45, 0.1)' : '#F1F5F9',
                              color: isHighSec ? '#BD1D2D' : '#0F172A',
                            }}
                          >
                            {row.action}
                          </span>
                          {row.module && (
                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{row.module}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', maxWidth: '300px' }}>
                        <div style={{ color: '#0F172A', fontWeight: 500, wordBreak: 'break-word' }}>
                          {row.entity_type ? `${row.entity_type}${row.entity_id ? ` #${row.entity_id}` : ''}` : '—'}
                        </div>
                        {row.summary && (
                          <div style={{ fontSize: '0.74rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.summary}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ fontSize: '0.76rem', color: '#334155', fontFamily: 'monospace' }}>
                          {row.ip_address || '—'}
                        </div>
                        {row.correlation_id && (
                          <button
                            type="button"
                            onClick={() => setCorrelationId(row.correlation_id || '')}
                            title="Lọc các sự kiện cùng Correlation ID"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '0.7rem',
                              color: '#64748B',
                              fontFamily: 'monospace',
                              cursor: 'pointer',
                            }}
                          >
                            <Link2 size={11} /> {row.correlation_id.slice(0, 12)}…
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => openDiffDrawer(row.stream, row.id)}
                          style={{
                            height: '30px',
                            padding: '0 10px',
                            borderRadius: '7px',
                            border: '1px solid #E2E8F0',
                            background: '#FFFFFF',
                            color: '#0F172A',
                            fontWeight: 600,
                            fontSize: '0.76rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                          }}
                        >
                          <Eye size={13} /> So sánh
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {nextCursor !== null && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => fetchLogs(nextCursor)}
              style={{
                height: '34px',
                padding: '0 16px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                color: '#0F172A',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              {loadingMore ? 'Đang tải thêm...' : 'Tải thêm bản ghi cũ hơn'}
            </button>
          </div>
        )}
      </div>

      {/* Portal Before/After JSON Diff Drawer (220ms) */}
      {diffMounted &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="drawer-backdrop"
              onClick={closeDiffDrawer}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2147483620,
                background: 'rgba(15, 23, 42, 0.45)',
                opacity: diffVisible ? 1 : 0,
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
                width: 'min(640px, 100vw)',
                zIndex: 2147483625,
                background: '#FFFFFF',
                borderLeft: '1px solid #E2E8F0',
                boxShadow: '-12px 0 32px rgba(15, 23, 42, 0.16)',
                transform: diffVisible ? 'translateX(0)' : 'translateX(100%)',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={18} color="#BD1D2D" />
                  <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                    Chi tiết Nhật ký Bất biến & JSON Diff
                  </span>
                </div>
                <button
                  type="button"
                  onClick={closeDiffDrawer}
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

              <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {diffLoading || !diffData ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse h-24 rounded-xl bg-slate-100" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div style={{ ...CARD_STYLE, padding: '14px', fontSize: '0.8rem' }}>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span style={{ color: '#64748B' }}>Stream: </span>
                          <strong style={{ color: '#0F172A' }}>{diffData.stream.toUpperCase()} #{diffData.row?.id}</strong>
                        </div>
                        <div>
                          <span style={{ color: '#64748B' }}>Thời gian: </span>
                          <strong style={{ color: '#0F172A' }}>{formatDt(diffData.row?.created_at)}</strong>
                        </div>
                        <div>
                          <span style={{ color: '#64748B' }}>IP: </span>
                          <code style={{ color: '#0F172A' }}>{diffData.row?.ip_address || '—'}</code>
                        </div>
                        <div>
                          <span style={{ color: '#64748B' }}>Correlation: </span>
                          <code style={{ color: '#0F172A' }}>{diffData.row?.correlation_id || '—'}</code>
                        </div>
                      </div>
                      {diffData.row?.row_hash && (
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #E2E8F0', fontSize: '0.71rem', color: '#64748B', wordBreak: 'break-all' }}>
                          SHA-256: <code style={{ color: '#0F172A' }}>{diffData.row.row_hash}</code>
                        </div>
                      )}
                    </div>

                    {ensureArray<string>(diffData.diff_keys).length > 0 && (
                      <div style={{ ...CARD_STYLE, padding: '12px 14px' }}>
                        <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748B', marginBottom: '6px' }}>
                          CÁC TRƯỜNG THAY ĐỔI
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {ensureArray<string>(diffData.diff_keys).map((k) => (
                            <code
                              key={k}
                              style={{
                                fontSize: '0.74rem',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: 'rgba(189, 29, 45, 0.08)',
                                color: '#BD1D2D',
                                fontWeight: 700,
                              }}
                            >
                              {k}
                            </code>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div style={{ ...CARD_STYLE, padding: '12px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', marginBottom: '6px' }}>
                          TRẠNG THÁI TRƯỚC (BEFORE)
                        </div>
                        <pre style={{ margin: 0, fontSize: '0.73rem', color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '280px', overflowY: 'auto' }}>
                          {formatJsonBlock(diffData.before)}
                        </pre>
                      </div>
                      <div style={{ ...CARD_STYLE, padding: '12px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#BD1D2D', marginBottom: '6px' }}>
                          TRẠNG THÁI SAU (AFTER)
                        </div>
                        <pre style={{ margin: 0, fontSize: '0.73rem', color: '#0F172A', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '280px', overflowY: 'auto' }}>
                          {formatJsonBlock(diffData.after)}
                        </pre>
                      </div>
                    </div>

                    {ensureArray(diffData.correlated_events).length > 1 && (
                      <div style={{ ...CARD_STYLE, padding: '14px' }}>
                        <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                          SỰ KIỆN CÙNG REQUEST (CORRELATION)
                        </div>
                        <div className="space-y-1.5">
                          {ensureArray(diffData.correlated_events).map((ce: any) => (
                            <div
                              key={`${ce.stream}-${ce.id}`}
                              onClick={() => openDiffDrawer(ce.stream, ce.id)}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                background: '#F8FAFC',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                            >
                              <span>
                                <strong>[{ce.stream}]</strong> {ce.action} ({ce.label})
                              </span>
                              <span style={{ color: '#64748B' }}>{formatDt(ce.created_at)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
};

export default ImmutableAuditCenterPanel;

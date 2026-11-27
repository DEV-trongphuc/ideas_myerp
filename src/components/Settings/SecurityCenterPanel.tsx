import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  MonitorSmartphone,
  Ban,
  BellRing,
  History,
  LogOut,
  RefreshCw,
  Unlock,
  Save,
  Send,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchAPI } from '../../utils/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { useUIStore } from '../../store/uiStore';

interface SecurityCenterPanelProps {
  isStrictAdmin: boolean;
}

type SubTabKey = 'sessions' | 'ip_blocks' | 'policy_alerts' | 'logs';

interface ActiveSessionRow {
  id: number;
  user_id: number;
  family_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at?: string;
  last_used_at?: string | null;
  expires_at?: string;
  full_name?: string;
  email?: string;
  role?: string;
  is_current?: boolean;
}

interface IpBlockRow {
  id: number;
  ip_address: string;
  reason: string;
  blocked_action: string;
  attempt_count: number;
  blocked_until: string;
  remaining_seconds: number;
  last_email?: string | null;
  user_agent?: string | null;
  updated_at?: string;
}

interface PrivilegedUserRow {
  id: number;
  full_name: string;
  email: string;
  role: string;
  two_factor_enabled: number;
  two_factor_type?: string;
  last_login_at?: string | null;
}

interface SecurityLogRow {
  id: number;
  action: string;
  resource?: string;
  new_data?: string | null;
  ip_address?: string | null;
  created_at: string;
  actor_name?: string | null;
  actor_email?: string | null;
}

const CARD_STYLE: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
};

const getCompletenessTone = (pct: number): string => {
  if (pct >= 80) return '#10b981';
  if (pct >= 50) return '#f59e0b';
  return '#ef4444';
};

const formatDateTime = (raw?: string | null): string => {
  if (!raw) return '—';
  const d = new Date(raw.replace(' ', 'T'));
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString('vi-VN');
};

const formatRemaining = (sec: number): string => {
  if (sec <= 0) return 'Đã hết hạn';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}g ${m}p` : `${m}p`;
};

const shortenUA = (ua?: string | null): string => {
  if (!ua) return 'Không rõ thiết bị';
  if (ua.includes('iPhone')) return 'iPhone / Safari';
  if (ua.includes('Android')) return 'Android Device';
  if (ua.includes('Edg/')) return 'Microsoft Edge';
  if (ua.includes('Chrome/')) return 'Google Chrome';
  if (ua.includes('Firefox/')) return 'Mozilla Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Apple Safari';
  return ua.slice(0, 48);
};

export const SecurityCenterPanel: React.FC<SecurityCenterPanelProps> = ({ isStrictAdmin }) => {
  const { t } = useLanguage();
  const showConfirm = useUIStore((s) => s.showConfirm);

  const [subTab, setSubTab] = useState<SubTabKey>('sessions');
  const [sessionScope, setSessionScope] = useState<'own' | 'all'>('own');
  const [loading, setLoading] = useState(true);

  const [sessions, setSessions] = useState<ActiveSessionRow[]>([]);
  const [ipBlocks, setIpBlocks] = useState<IpBlockRow[]>([]);
  const [showExpiredBlocks, setShowExpiredBlocks] = useState(false);

  const [kpis, setKpis] = useState({
    active_sessions: 0,
    active_ip_blocks: 0,
    privileged_total: 0,
    privileged_with_2fa: 0,
    privileged_2fa_pct: 100,
  });
  const [privilegedUsers, setPrivilegedUsers] = useState<PrivilegedUserRow[]>([]);
  const [recentLogs, setRecentLogs] = useState<SecurityLogRow[]>([]);

  const [enforce2FA, setEnforce2FA] = useState(true);
  const [alertZaloChatId, setAlertZaloChatId] = useState('');
  const [alertTelegramChatId, setAlertTelegramChatId] = useState('');
  const [alertEmails, setAlertEmails] = useState('');
  const [hasZaloBot, setHasZaloBot] = useState(false);
  const [hasTgBot, setHasTgBot] = useState(false);

  const [savingPolicy, setSavingPolicy] = useState(false);
  const [sendingTestAlert, setSendingTestAlert] = useState(false);
  const inFlightRef = useRef(false);

  const loadSessions = useCallback(async (scopeOverride?: 'own' | 'all') => {
    const scopeToUse = isStrictAdmin ? (scopeOverride || sessionScope) : 'own';
    const res = await fetchAPI(`auth/sessions?scope=${scopeToUse}`);
    const list = Array.isArray(res?.data) ? res.data : [];
    setSessions(list);
    return list;
  }, [isStrictAdmin, sessionScope]);

  const loadIpBlocks = useCallback(async (includeAll?: boolean) => {
    if (!isStrictAdmin) return;
    const flag = includeAll ?? showExpiredBlocks ? '1' : '0';
    const res = await fetchAPI(`auth/ip-blocks?all=${flag}`);
    setIpBlocks(Array.isArray(res?.data) ? res.data : []);
  }, [isStrictAdmin, showExpiredBlocks]);

  const loadSummary = useCallback(async () => {
    if (!isStrictAdmin) return;
    const res = await fetchAPI('auth/security-summary');
    const d = res?.data;
    if (!d) return;
    if (d.kpis) {
      setKpis({
        active_sessions: Number(d.kpis.active_sessions || 0),
        active_ip_blocks: Number(d.kpis.active_ip_blocks || 0),
        privileged_total: Number(d.kpis.privileged_total || 0),
        privileged_with_2fa: Number(d.kpis.privileged_with_2fa || 0),
        privileged_2fa_pct: Number(d.kpis.privileged_2fa_pct ?? 100),
      });
    }
    if (d.policy) {
      setEnforce2FA(Boolean(d.policy.enforce_privileged_2fa));
    }
    if (d.alert_settings) {
      setAlertZaloChatId(String(d.alert_settings.security_alert_zalo_chat_id || ''));
      setAlertTelegramChatId(String(d.alert_settings.security_alert_telegram_chat_id || ''));
      setAlertEmails(String(d.alert_settings.security_alert_emails || ''));
      setHasZaloBot(Boolean(d.alert_settings.has_zalo_bot_token));
      setHasTgBot(Boolean(d.alert_settings.has_telegram_bot_token));
    }
    setPrivilegedUsers(Array.isArray(d.privileged_users) ? d.privileged_users : []);
    setRecentLogs(Array.isArray(d.recent_security_logs) ? d.recent_security_logs : []);
  }, [isStrictAdmin]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const tasks: Promise<any>[] = [loadSessions()];
      if (isStrictAdmin) {
        tasks.push(loadSummary(), loadIpBlocks());
      }
      await Promise.all(tasks);
    } catch (err: any) {
      toast.error(err?.message || t('Không thể tải dữ liệu Trung tâm Bảo mật'));
    } finally {
      setLoading(false);
    }
  }, [isStrictAdmin, loadIpBlocks, loadSessions, loadSummary, t]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRevokeSession = async (sessionId: number, isCurrent?: boolean) => {
    if (inFlightRef.current) return;
    if (isCurrent) {
      showConfirm({
        title: t('Thu hồi phiên hiện tại?'),
        message: t('Đây là phiên bạn đang sử dụng. Nếu thu hồi, bạn sẽ cần đăng nhập lại trên trình duyệt này.'),
        isDanger: true,
        confirmText: t('Thu hồi'),
        onConfirm: async () => {
          inFlightRef.current = true;
          try {
            const res = await fetchAPI('auth/sessions/revoke', {
              method: 'POST',
              body: JSON.stringify({ session_id: sessionId }),
            });
            toast.success(res?.message || t('Đã thu hồi phiên đăng nhập'));
            await loadAll();
          } catch (err: any) {
            toast.error(err?.message || t('Không thể thu hồi phiên'));
          } finally {
            inFlightRef.current = false;
          }
        },
      });
      return;
    }
    inFlightRef.current = true;
    try {
      const res = await fetchAPI('auth/sessions/revoke', {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId }),
      });
      toast.success(res?.message || t('Đã thu hồi phiên đăng nhập'));
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message || t('Không thể thu hồi phiên'));
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleRevokeOtherSessions = () => {
    if (inFlightRef.current) return;
    showConfirm({
      title: t('Đăng xuất khỏi tất cả thiết bị khác?'),
      message: t('Toàn bộ Refresh Token trên các thiết bị/trình duyệt khác của bạn sẽ bị vô hiệu hóa ngay lập tức (giữ lại phiên hiện tại nếu đang dùng cookie xác thực).'),
      isDanger: true,
      confirmText: t('Xác nhận đăng xuất thiết bị khác'),
      onConfirm: async () => {
        inFlightRef.current = true;
        try {
          const curRt = localStorage.getItem('refresh_token') || '';
          const res = await fetchAPI('auth/sessions/revoke-all', {
            method: 'POST',
            body: JSON.stringify({ keep_current: true, refresh_token: curRt }),
          });
          toast.success(res?.message || t('Đã thu hồi các phiên khác'));
          await loadAll();
        } catch (err: any) {
          toast.error(err?.message || t('Lỗi khi thu hồi phiên'));
        } finally {
          inFlightRef.current = false;
        }
      },
    });
  };

  const handleUnblockIp = async (ip: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await fetchAPI('auth/ip-blocks/unblock', {
        method: 'POST',
        body: JSON.stringify({ ip_address: ip }),
      });
      toast.success(res?.message || `Đã mở khóa IP ${ip}`);
      await Promise.all([loadIpBlocks(), loadSummary()]);
    } catch (err: any) {
      toast.error(err?.message || t('Không thể mở khóa IP'));
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleSaveSecurityPolicy = async () => {
    if (inFlightRef.current || savingPolicy) return;
    inFlightRef.current = true;
    setSavingPolicy(true);
    try {
      const res = await fetchAPI('auth/security-settings', {
        method: 'PUT',
        body: JSON.stringify({
          enforce_privileged_2fa: enforce2FA ? '1' : '0',
          security_alert_zalo_chat_id: alertZaloChatId.trim(),
          security_alert_telegram_chat_id: alertTelegramChatId.trim(),
          security_alert_emails: alertEmails.trim(),
        }),
      });
      toast.success(res?.message || t('Đã lưu chính sách bảo mật & kênh cảnh báo'));
      await loadSummary();
    } catch (err: any) {
      toast.error(err?.message || t('Không thể lưu cấu hình bảo mật'));
    } finally {
      inFlightRef.current = false;
      setSavingPolicy(false);
    }
  };

  const handleSendTestAlert = async () => {
    if (inFlightRef.current || sendingTestAlert) return;
    inFlightRef.current = true;
    setSendingTestAlert(true);
    try {
      const res = await fetchAPI('auth/security-alerts/test', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const ch = res?.data?.channels || {};
      const parts: string[] = [];
      if (ch.in_app_bell?.ok) parts.push(`Chuông (${ch.in_app_bell.recipients || 0})`);
      if (ch.email?.ok) parts.push(`Email (${ch.email.sent || 0})`);
      if (ch.zalo?.ok) parts.push('Zalo');
      if (ch.telegram?.ok) parts.push('Telegram');
      toast.success(parts.length > 0 ? `Đã gửi thử thành công: ${parts.join(', ')}` : (res?.message || 'Đã chạy kiểm thử cảnh báo'));
      await loadSummary();
    } catch (err: any) {
      toast.error(err?.message || t('Lỗi gửi cảnh báo thử'));
    } finally {
      inFlightRef.current = false;
      setSendingTestAlert(false);
    }
  };

  if (loading && sessions.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="animate-pulse" style={{ ...CARD_STYLE, height: '132px', background: '#f8fafc' }} />
          ))}
        </div>
        <div className="animate-pulse" style={{ ...CARD_STYLE, height: '280px', background: '#f8fafc' }} />
      </div>
    );
  }

  const pct2fa = isStrictAdmin ? kpis.privileged_2fa_pct : 100;
  const tone2fa = getCompletenessTone(pct2fa);
  const myActiveCount = sessions.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Banner */}
      <div style={{ ...CARD_STYLE, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a' }}>
              {t('Trung tâm Bảo mật Zero-Trust & Quản lý Phiên')}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
              {t('Refresh Token xoay vòng chống đánh cắp, bắt buộc 2FA nhóm đặc quyền, kiểm soát IP khóa 24h & cảnh báo đa kênh.')}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn outline sm"
          onClick={loadAll}
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          {t('Làm mới')}
        </button>
      </div>

      {/* 4 Standardized KPI Cards (AGENTS.md Chương V DNA) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {/* Card 1 */}
        <div style={CARD_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 700, letterSpacing: '0.04em', color: '#64748b', textTransform: 'uppercase' }}>
              {isStrictAdmin ? t('Phiên đang hoạt động') : t('Phiên của bạn')}
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MonitorSmartphone size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#0f172a', lineHeight: 1.15 }}>
            {isStrictAdmin ? kpis.active_sessions : myActiveCount}
          </div>
          <div style={{ marginTop: '0.65rem', fontSize: '0.775rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div>• {t('Access JWT')}: <strong style={{ color: '#0f172a' }}>60 phút</strong></div>
            <div>• {t('Refresh Token')}: <strong style={{ color: '#0f172a' }}>Xoay vòng 90 ngày</strong></div>
          </div>
        </div>

        {/* Card 2 */}
        <div style={CARD_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 700, letterSpacing: '0.04em', color: '#64748b', textTransform: 'uppercase' }}>
              {t('IP đang bị khóa 24h')}
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ban size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#BD1D2D', lineHeight: 1.15 }}>
            {isStrictAdmin ? kpis.active_ip_blocks : '—'}
          </div>
          <div style={{ marginTop: '0.65rem', fontSize: '0.775rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div>• {t('Cơ chế')}: <strong style={{ color: '#0f172a' }}>Auto-Lock 24 giờ</strong></div>
            <div>• {t('Bảo vệ')}: <strong style={{ color: '#0f172a' }}>reCAPTCHA v2 + Rate Limit</strong></div>
          </div>
        </div>

        {/* Card 3 */}
        <div style={CARD_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 700, letterSpacing: '0.04em', color: '#64748b', textTransform: 'uppercase' }}>
              {t('Phủ sóng 2FA Đặc quyền')}
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#0f172a', lineHeight: 1.15 }}>
            {isStrictAdmin ? `${pct2fa}%` : t('Đang bảo vệ')}
          </div>
          <div style={{ marginTop: '0.65rem', fontSize: '0.775rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div>• {t('Đã bật 2FA')}: <strong style={{ color: '#0f172a' }}>{isStrictAdmin ? `${kpis.privileged_with_2fa}/${kpis.privileged_total}` : 'Theo tài khoản'}</strong></div>
            <div>• {t('Chính sách')}: <strong style={{ color: '#0f172a' }}>{enforce2FA ? 'Bắt buộc khi đăng nhập' : 'Tùy chọn'}</strong></div>
          </div>
        </div>

        {/* Card 4 */}
        <div style={CARD_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 700, letterSpacing: '0.04em', color: '#64748b', textTransform: 'uppercase' }}>
              {t('Cảnh báo Đa kênh')}
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BellRing size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#0f172a', lineHeight: 1.15 }}>
            {isStrictAdmin ? recentLogs.length : 1}
          </div>
          <div style={{ marginTop: '0.65rem', fontSize: '0.775rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div>• {t('Zalo Lead Group')}: <strong style={{ color: '#0f172a' }}>Đã tách ly hoàn toàn</strong></div>
            <div>• {t('Kênh hoạt động')}: <strong style={{ color: '#0f172a' }}>Chuông + Email{alertZaloChatId ? ' + Zalo' : ''}{hasTgBot && alertTelegramChatId ? ' + TG' : ''}</strong></div>
          </div>
        </div>
      </div>

      {/* Segmented Control Subtabs (AGENTS.md Chương V DNA) */}
      <div>
        <div style={{ display: 'inline-flex', padding: '3px', borderRadius: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', gap: '2px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSubTab('sessions')}
            style={{
              height: '32px', padding: '0 14px', borderRadius: '7px', border: 'none', cursor: 'pointer',
              background: subTab === 'sessions' ? '#ffffff' : 'transparent',
              color: subTab === 'sessions' ? '#BD1D2D' : '#64748b',
              fontWeight: subTab === 'sessions' ? 700 : 600,
              fontSize: '0.8125rem',
              boxShadow: subTab === 'sessions' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'inline-flex', alignItems: 'center', gap: '6px'
            }}
          >
            <MonitorSmartphone size={14} />
            {t('Phiên đăng nhập')}
          </button>

          {isStrictAdmin && (
            <>
              <button
                type="button"
                onClick={() => setSubTab('ip_blocks')}
                style={{
                  height: '32px', padding: '0 14px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                  background: subTab === 'ip_blocks' ? '#ffffff' : 'transparent',
                  color: subTab === 'ip_blocks' ? '#BD1D2D' : '#64748b',
                  fontWeight: subTab === 'ip_blocks' ? 700 : 600,
                  fontSize: '0.8125rem',
                  boxShadow: subTab === 'ip_blocks' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'inline-flex', alignItems: 'center', gap: '6px'
                }}
              >
                <Ban size={14} />
                {t('IP bị khóa 24h')} ({kpis.active_ip_blocks})
              </button>

              <button
                type="button"
                onClick={() => setSubTab('policy_alerts')}
                style={{
                  height: '32px', padding: '0 14px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                  background: subTab === 'policy_alerts' ? '#ffffff' : 'transparent',
                  color: subTab === 'policy_alerts' ? '#BD1D2D' : '#64748b',
                  fontWeight: subTab === 'policy_alerts' ? 700 : 600,
                  fontSize: '0.8125rem',
                  boxShadow: subTab === 'policy_alerts' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'inline-flex', alignItems: 'center', gap: '6px'
                }}
              >
                <BellRing size={14} />
                {t('Chính sách 2FA & Cảnh báo')}
              </button>

              <button
                type="button"
                onClick={() => setSubTab('logs')}
                style={{
                  height: '32px', padding: '0 14px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                  background: subTab === 'logs' ? '#ffffff' : 'transparent',
                  color: subTab === 'logs' ? '#BD1D2D' : '#64748b',
                  fontWeight: subTab === 'logs' ? 700 : 600,
                  fontSize: '0.8125rem',
                  boxShadow: subTab === 'logs' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'inline-flex', alignItems: 'center', gap: '6px'
                }}
              >
                <History size={14} />
                {t('Nhật ký bảo mật')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Subtab 1: Active Sessions */}
      {subTab === 'sessions' && (
        <div style={{ ...CARD_STYLE, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                {t('Danh sách phiên Refresh Token đang hoạt động')}
              </h4>
              {isStrictAdmin && (
                <div style={{ display: 'inline-flex', padding: '2px', borderRadius: '8px', background: '#f1f5f9', border: '1px solid #e2e8f0', gap: '2px' }}>
                  <button
                    type="button"
                    onClick={() => { setSessionScope('own'); loadSessions('own').catch(() => {}); }}
                    style={{
                      height: '26px', padding: '0 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.75rem',
                      background: sessionScope === 'own' ? '#ffffff' : 'transparent',
                      color: sessionScope === 'own' ? '#BD1D2D' : '#64748b',
                      fontWeight: sessionScope === 'own' ? 700 : 600,
                    }}
                  >
                    {t('Phiên của tôi')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSessionScope('all'); loadSessions('all').catch(() => {}); }}
                    style={{
                      height: '26px', padding: '0 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.75rem',
                      background: sessionScope === 'all' ? '#ffffff' : 'transparent',
                      color: sessionScope === 'all' ? '#BD1D2D' : '#64748b',
                      fontWeight: sessionScope === 'all' ? 700 : 600,
                    }}
                  >
                    {t('Toàn hệ thống')}
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn outline sm"
              onClick={handleRevokeOtherSessions}
              style={{ color: '#BD1D2D', borderColor: '#fecaca', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <LogOut size={14} />
              {t('Đăng xuất thiết bị khác của tôi')}
            </button>
          </div>

          {!Array.isArray(sessions) || sessions.length === 0 ? (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              {t('Không có phiên Refresh Token nào đang hoạt động.')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '0.8125rem' }}>
                <thead>
                  <tr>
                    {sessionScope === 'all' && <th>{t('Nhân sự')}</th>}
                    <th>{t('Thiết bị / Trình duyệt')}</th>
                    <th>{t('Địa chỉ IP')}</th>
                    <th>{t('Hoạt động gần nhất')}</th>
                    <th>{t('Hết hạn')}</th>
                    <th style={{ textAlign: 'right' }}>{t('Thao tác')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      {sessionScope === 'all' && (
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{s.full_name || '—'}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{s.email} • {s.role}</div>
                        </td>
                      )}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{shortenUA(s.user_agent)}</span>
                          {s.is_current && (
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D' }}>
                              {t('Hiện tại')}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.user_agent || '—'}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'monospace', color: '#334155' }}>{s.ip_address || '—'}</td>
                      <td style={{ color: '#475569' }}>{formatDateTime(s.last_used_at || s.created_at)}</td>
                      <td style={{ color: '#64748b' }}>{formatDateTime(s.expires_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn outline sm"
                          onClick={() => handleRevokeSession(s.id, s.is_current)}
                          style={{ color: '#BD1D2D', borderColor: '#fecaca', fontSize: '0.75rem', padding: '4px 10px' }}
                        >
                          {t('Thu hồi')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Subtab 2: Blocked IPs */}
      {subTab === 'ip_blocks' && isStrictAdmin && (
        <div style={{ ...CARD_STYLE, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                {t('Danh sách IP bị khóa tự động 24 giờ')}
              </h4>
              <p style={{ margin: '2px 0 0', fontSize: '0.775rem', color: '#64748b' }}>
                {t('Mở khóa ngay khi nhân viên hoặc đối tác bị khóa nhầm do nhập sai mật khẩu/OTP nhiều lần.')}
              </p>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#475569', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showExpiredBlocks}
                onChange={(e) => {
                  const next = e.target.checked;
                  setShowExpiredBlocks(next);
                  loadIpBlocks(next).catch(() => {});
                }}
              />
              {t('Hiển thị cả IP đã hết hạn khóa')}
            </label>
          </div>

          {!Array.isArray(ipBlocks) || ipBlocks.length === 0 ? (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              <CheckCircle2 size={24} style={{ color: '#334155', margin: '0 auto 6px' }} />
              <div>{t('Hiện không có địa chỉ IP nào bị khóa trong hệ thống.')}</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '0.8125rem' }}>
                <thead>
                  <tr>
                    <th>{t('Địa chỉ IP')}</th>
                    <th>{t('Lý do / Hành động')}</th>
                    <th>{t('Tài khoản mục tiêu')}</th>
                    <th>{t('Số lần')}</th>
                    <th>{t('Còn lại')}</th>
                    <th style={{ textAlign: 'right' }}>{t('Thao tác')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ipBlocks.map((b) => (
                    <tr key={b.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{b.ip_address}</td>
                      <td>
                        <div style={{ color: '#334155', fontWeight: 600 }}>{b.reason}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{b.blocked_action}</div>
                      </td>
                      <td style={{ color: '#475569' }}>{b.last_email || '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#BD1D2D' }}>{b.attempt_count}</td>
                      <td style={{ color: '#475569' }}>{formatRemaining(Number(b.remaining_seconds || 0))}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn outline sm"
                          onClick={() => handleUnblockIp(b.ip_address)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', padding: '4px 10px' }}
                        >
                          <Unlock size={13} />
                          {t('Mở khóa IP')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Subtab 3: Mandatory 2FA Policy & Alert Channels */}
      {subTab === 'policy_alerts' && isStrictAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Policy & Channels Config */}
          <div style={{ ...CARD_STYLE, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.9rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  {t('Chính sách Xác thực 2 lớp (2FA) & Kênh Cảnh báo Bảo mật')}
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: '0.775rem', color: '#64748b' }}>
                  {t('Group Zalo Data/Lead được cách ly độc lập — cảnh báo bảo mật chỉ gửi tới Chat ID bảo mật riêng, Telegram hoặc Email.')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn outline sm"
                  onClick={handleSendTestAlert}
                  disabled={sendingTestAlert}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={14} />
                  {sendingTestAlert ? t('Đang gửi thử...') : t('Gửi cảnh báo thử')}
                </button>
                <button
                  type="button"
                  className="btn primary sm"
                  onClick={handleSaveSecurityPolicy}
                  disabled={savingPolicy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Save size={14} />
                  {savingPolicy ? t('Đang lưu...') : t('Lưu chính sách')}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '12px 14px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>
                  {t('Bắt buộc 2FA đối với nhóm tài khoản đặc quyền')}
                </div>
                <div style={{ fontSize: '0.775rem', color: '#64748b', marginTop: '2px' }}>
                  {t('Áp dụng cho SuperAdmin, Admin, Director, Accountant, HR và Manager. Tài khoản chưa bật 2FA sẽ được hướng dẫn cài QR Authenticator hoặc Email OTP ngay lúc đăng nhập.')}
                </div>
              </div>
              <ToggleSwitch checked={enforce2FA} onChange={setEnforce2FA} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{t('Zalo Chat ID nhận Cảnh báo Bảo mật (Riêng tư)')}</label>
                <input
                  type="text"
                  className="form-input"
                  value={alertZaloChatId}
                  onChange={(e) => setAlertZaloChatId(e.target.value)}
                  placeholder="Ví dụ: chat_id riêng của Sếp / IT (KHÔNG dùng Group Data)"
                />
                <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                  {hasZaloBot ? t('Zalo Bot Token hệ thống đã sẵn sàng.') : t('Chưa cấu hình Zalo Bot Token trong mục Zalo Bot.')}
                </span>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{t('Telegram Chat ID nhận Cảnh báo Bảo mật')}</label>
                <input
                  type="text"
                  className="form-input"
                  value={alertTelegramChatId}
                  onChange={(e) => setAlertTelegramChatId(e.target.value)}
                  placeholder="Ví dụ: -100xxxxxxxxxx hoặc User ID"
                />
                <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                  {hasTgBot ? t('Telegram Bot Token đã kết nối.') : t('Chưa cấu hình Telegram Bot Token (sẽ dùng khi điền token).')}
                </span>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{t('Email nhận Cảnh báo Mức High/Critical')}</label>
                <input
                  type="text"
                  className="form-input"
                  value={alertEmails}
                  onChange={(e) => setAlertEmails(e.target.value)}
                  placeholder="admin@ideas.edu.vn, it@ideas.edu.vn (trống = SuperAdmin)"
                />
                <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                  {t('Phân cách nhiều email bằng dấu phẩy. Để trống sẽ tự động gửi tới SuperAdmin.')}
                </span>
              </div>
            </div>
          </div>

          {/* Privileged Users 2FA Compliance Table */}
          <div style={{ ...CARD_STYLE, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} color="#334155" />
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  {t('Mức độ tuân thủ 2FA trên tài khoản nhạy cảm')}
                </h4>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '210px' }}>
                <div style={{ flex: 1, height: '8px', borderRadius: '999px', background: '#f1f5f9', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, Math.max(0, pct2fa))}%`, height: '100%', background: tone2fa, borderRadius: '999px', transition: 'width 0.3s ease' }} />
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                  {kpis.privileged_with_2fa}/{kpis.privileged_total} ({pct2fa}%)
                </span>
              </div>
            </div>

            {!Array.isArray(privilegedUsers) || privilegedUsers.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                {t('Không có tài khoản đặc quyền nào.')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr>
                      <th>{t('Nhân sự')}</th>
                      <th>{t('Vai trò')}</th>
                      <th>{t('Trạng thái 2FA')}</th>
                      <th>{t('Phương thức')}</th>
                      <th>{t('Đăng nhập cuối')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {privilegedUsers.map((pu) => (
                      <tr key={pu.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{pu.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{pu.email}</div>
                        </td>
                        <td style={{ fontWeight: 600, color: '#334155', textTransform: 'uppercase', fontSize: '0.75rem' }}>{pu.role}</td>
                        <td>
                          {pu.two_factor_enabled === 1 ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>
                              <CheckCircle2 size={14} /> {t('Đã kích hoạt')}
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, color: '#BD1D2D' }}>
                              <AlertTriangle size={14} /> {t('Chờ kích hoạt lần đăng nhập tới')}
                            </span>
                          )}
                        </td>
                        <td style={{ color: '#475569' }}>
                          {pu.two_factor_enabled === 1 ? (pu.two_factor_type === 'totp' ? 'Google Authenticator' : 'Email OTP') : '—'}
                        </td>
                        <td style={{ color: '#64748b' }}>{formatDateTime(pu.last_login_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subtab 4: Security Audit Logs */}
      {subTab === 'logs' && isStrictAdmin && (
        <div style={{ ...CARD_STYLE, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
            {t('40 Sự kiện & Cảnh báo Bảo mật gần nhất')}
          </h4>
          {!Array.isArray(recentLogs) || recentLogs.length === 0 ? (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              {t('Chưa ghi nhận sự kiện cảnh báo bảo mật nào.')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '0.8125rem' }}>
                <thead>
                  <tr>
                    <th>{t('Thời gian')}</th>
                    <th>{t('Loại sự kiện')}</th>
                    <th>{t('Tài khoản liên quan')}</th>
                    <th>{t('IP')}</th>
                    <th>{t('Chi tiết')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((lg) => {
                    let parsedSummary = lg.new_data || '';
                    try {
                      if (lg.new_data && lg.new_data.startsWith('{')) {
                        const obj = JSON.parse(lg.new_data);
                        parsedSummary = obj.summary || obj.title || lg.new_data;
                      }
                    } catch {}
                    const isCriticalAction = ['SECURITY_ALERT', 'TOKEN_REUSE_DETECTED'].includes(lg.action);
                    return (
                      <tr key={lg.id}>
                        <td style={{ whiteSpace: 'nowrap', color: '#475569' }}>{formatDateTime(lg.created_at)}</td>
                        <td>
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                            background: isCriticalAction ? 'rgba(189, 29, 45, 0.08)' : '#f1f5f9',
                            color: isCriticalAction ? '#BD1D2D' : '#334155',
                          }}>
                            {lg.action}
                          </span>
                        </td>
                        <td style={{ color: '#334155' }}>{lg.actor_email || lg.actor_name || 'Hệ thống'}</td>
                        <td style={{ fontFamily: 'monospace', color: '#475569' }}>{lg.ip_address || '—'}</td>
                        <td style={{ color: '#334155', maxWidth: '420px', wordBreak: 'break-word' }}>{parsedSummary}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

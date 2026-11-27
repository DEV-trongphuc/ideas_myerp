import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, X, Info, AlertTriangle, CheckCircle2, XCircle,
  MessageSquare, MessageCircle, AtSign, Heart, Clock, FileCheck2,
  Calendar, BarChart3, Receipt, Ticket, Handshake, Banknote,
  ShoppingBag, ShoppingCart, UserCheck, Users, ShieldAlert,
  CheckSquare, FolderKanban, Megaphone, UserPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from './Skeleton';
import { ConfirmModal } from './ConfirmModal';
import api from '../../api/axios';
import { cleanNotificationText } from '../../utils/textUtils';
import { pushOverlay } from '../../utils/overlayStack';
import { ensureArray } from '../../utils/safeArray';
import { useUIStore } from '../../store/uiStore';
import { useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';

interface Notification {
  id: number;
  title: string;
  body: string | null;
  type: string;
  is_read: number;
  link: string | null;
  created_at: string;
}

type NotifFilterTab = 'all' | 'unread' | 'mentions' | 'approvals' | 'crm';

interface NotifCounts {
  all: number;
  unread: number;
  mentions: number;
  approvals: number;
  crm: number;
}

interface TypeVisual {
  icon: React.ReactNode;
  bg: string;
}

const SLATE_BG = '#f1f5f9';
const RED_BG = 'rgba(189, 29, 45, 0.08)';
const WARN_BG = '#fef3c7';
const ERR_BG = '#fee2e2';

const TYPE_VISUALS: Record<string, TypeVisual> = {
  info: { icon: <Info size={14} color="#334155" />, bg: SLATE_BG },
  success: { icon: <CheckCircle2 size={14} color="#334155" />, bg: SLATE_BG },
  warning: { icon: <AlertTriangle size={14} color="#d97706" />, bg: WARN_BG },
  error: { icon: <XCircle size={14} color="#BD1D2D" />, bg: ERR_BG },
  security_warning: { icon: <ShieldAlert size={14} color="#BD1D2D" />, bg: ERR_BG },

  post_comment: { icon: <MessageSquare size={14} color="#334155" />, bg: SLATE_BG },
  comment_reply: { icon: <MessageCircle size={14} color="#334155" />, bg: SLATE_BG },
  comment: { icon: <MessageSquare size={14} color="#334155" />, bg: SLATE_BG },
  mention: { icon: <AtSign size={14} color="#BD1D2D" />, bg: RED_BG },
  post_reaction: { icon: <Heart size={14} color="#BD1D2D" />, bg: RED_BG },
  announcement: { icon: <Megaphone size={14} color="#BD1D2D" />, bg: RED_BG },

  approval: { icon: <FileCheck2 size={14} color="#BD1D2D" />, bg: RED_BG },
  leave: { icon: <Calendar size={14} color="#334155" />, bg: SLATE_BG },
  attendance: { icon: <Clock size={14} color="#334155" />, bg: SLATE_BG },
  attendance_update: { icon: <Clock size={14} color="#334155" />, bg: SLATE_BG },
  attendance_report: { icon: <BarChart3 size={14} color="#334155" />, bg: SLATE_BG },
  holiday: { icon: <Calendar size={14} color="#BD1D2D" />, bg: RED_BG },
  roster: { icon: <Users size={14} color="#334155" />, bg: SLATE_BG },

  expense: { icon: <Receipt size={14} color="#BD1D2D" />, bg: RED_BG },
  deposit: { icon: <Banknote size={14} color="#BD1D2D" />, bg: RED_BG },
  sales_order: { icon: <ShoppingBag size={14} color="#334155" />, bg: SLATE_BG },
  purchase_order: { icon: <ShoppingCart size={14} color="#334155" />, bg: SLATE_BG },

  contact: { icon: <UserCheck size={14} color="#334155" />, bg: SLATE_BG },
  customer: { icon: <UserPlus size={14} color="#BD1D2D" />, bg: RED_BG },
  ticket_assignment: { icon: <Ticket size={14} color="#BD1D2D" />, bg: RED_BG },
  cooperation: { icon: <Handshake size={14} color="#334155" />, bg: SLATE_BG },
  task: { icon: <CheckSquare size={14} color="#334155" />, bg: SLATE_BG },
  project: { icon: <FolderKanban size={14} color="#334155" />, bg: SLATE_BG },
  account: { icon: <UserCheck size={14} color="#334155" />, bg: SLATE_BG },
};

const MENTION_TYPES = new Set(['mention', 'post_comment', 'comment_reply', 'comment', 'post_reaction']);
const APPROVAL_TYPES = new Set(['approval', 'leave', 'expense', 'purchase_order', 'deposit', 'holiday', 'attendance_update']);
const CRM_TYPES = new Set(['contact', 'customer', 'sales_order', 'task', 'ticket_assignment', 'cooperation', 'project']);

const fmtTime = (d: string): string => {
  if (!d) return '';
  const normalized = d.includes('T') || d.endsWith('Z') ? d : d.replace(' ', 'T');
  const dt = new Date(normalized);
  if (isNaN(dt.getTime())) return '';
  const diff = (Date.now() - dt.getTime()) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return dt.toLocaleDateString('vi-VN');
};

const isSafeLink = (link?: string | null): 'internal' | 'external' | null => {
  if (!link || typeof link !== 'string') return null;
  const trimmed = link.trim();
  if (!trimmed) return null;
  if (/^(javascript|vbscript|data):/i.test(trimmed)) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return 'internal';
  if (/^https?:\/\//i.test(trimmed)) return 'external';
  return null;
};

export const NotificationsDropdown: React.FC = () => {
  const pollMs = useTypedSubSetting<number>('ui.notifications_policy', 'poll_ms', 30000);
  const badgeCap = useTypedSubSetting<number>('ui.notifications_policy', 'badge_cap', 99);
  const displayLimit = useTypedSubSetting<number>('ui.notifications_policy', 'display_limit', 50);

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [serverUnreadCount, setServerUnreadCount] = useState<number | null>(null);
  const [serverCounts, setServerCounts] = useState<Partial<NotifCounts> | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<NotifFilterTab>('all');
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number }>({ top: 64, right: 16 });

  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const markAllInFlightRef = useRef(false);

  const navigate = useNavigate();

  const localUnread = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);
  const unreadCount = serverUnreadCount !== null ? serverUnreadCount : localUnread;
  const badgeText = unreadCount > badgeCap ? `${badgeCap}+` : String(unreadCount);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'unread') return notifications.filter(n => !n.is_read);
    if (activeTab === 'mentions') return notifications.filter(n => MENTION_TYPES.has(n.type));
    if (activeTab === 'approvals') return notifications.filter(n => APPROVAL_TYPES.has(n.type));
    if (activeTab === 'crm') return notifications.filter(n => CRM_TYPES.has(n.type));
    return notifications;
  }, [notifications, activeTab]);

  const updateAnchorPosition = () => {
    if (!buttonRef.current || typeof window === 'undefined') return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({
      top: Math.round(rect.bottom + 8),
      right: Math.max(12, Math.round(window.innerWidth - rect.right))
    });
  };

  const fetchNotifications = useCallback(async (filterOverride?: NotifFilterTab) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const targetFilter = filterOverride ?? activeTab;
      const r = await api.get('/notifications', {
        params: { filter: targetFilter, limit: displayLimit },
        signal: ctrl.signal
      });
      if (ctrl.signal.aborted) return;
      const rawData = r.data?.data;
      const items = ensureArray<Notification>(Array.isArray(rawData) ? rawData : rawData?.items);
      setNotifications(items);
      if (rawData && !Array.isArray(rawData)) {
        if (typeof rawData.unread_count === 'number') {
          setServerUnreadCount(Math.max(0, rawData.unread_count));
        } else {
          setServerUnreadCount(null);
        }
        if (rawData.counts && typeof rawData.counts === 'object') {
          setServerCounts(rawData.counts);
        }
      } else {
        setServerUnreadCount(null);
        setServerCounts(null);
      }
    } catch {
      // ignore abort/silent background poll failure
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false);
      }
    }
  }, [activeTab, displayLimit]);

  useEffect(() => {
    fetchNotifications();
    const effectivePoll = Math.max(10000, Number(pollMs) || 30000);
    const interval = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) {
        fetchNotifications();
      }
    }, effectivePoll);
    const handleVis = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVis);
      abortRef.current?.abort();
    };
  }, [fetchNotifications, pollMs]);

  useEffect(() => {
    if (!open) return;
    updateAnchorPosition();

    const handleClickOutside = (e: MouseEvent) => {
      if (confirmClearOpen) return;
      const target = e.target as Node;
      const insideTrigger = ref.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideTrigger && !insideDropdown) {
        setOpen(false);
      }
    };

    const handleReposition = () => updateAnchorPosition();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, confirmClearOpen]);

  useEffect(() => {
    if (open && !confirmClearOpen) {
      const unregister = pushOverlay('notifications-dropdown', () => setOpen(false), 2147483610);
      return () => unregister();
    }
  }, [open, confirmClearOpen]);

  const markRead = async (id: number) => {
    const target = notifications.find(n => n.id === id);
    const wasUnread = target && !target.is_read;
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    if (wasUnread) {
      setServerUnreadCount(prev => (prev !== null ? Math.max(0, prev - 1) : null));
    }
    try {
      await api.patch(`/notifications/${id}`);
    } catch {
      if (wasUnread) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 0 } : n));
        setServerUnreadCount(prev => (prev !== null ? prev + 1 : null));
      }
    }
  };

  const markAllRead = async () => {
    if (markAllInFlightRef.current) return;
    markAllInFlightRef.current = true;
    const prevSnapshot = notifications;
    const prevServerUnread = serverUnreadCount;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setServerUnreadCount(0);
    setServerCounts(prev => prev ? { ...prev, unread: 0 } : prev);
    try {
      await api.patch('/notifications');
    } catch {
      setNotifications(prevSnapshot);
      setServerUnreadCount(prevServerUnread);
      useUIStore.getState().addToast('Không thể đánh dấu tất cả thông báo đã đọc', 'error');
    } finally {
      markAllInFlightRef.current = false;
    }
  };

  const clearAll = async () => {
    try {
      await api.delete('/notifications');
      setNotifications([]);
      setServerUnreadCount(0);
      setServerCounts({ all: 0, unread: 0, mentions: 0, approvals: 0, crm: 0 });
      useUIStore.getState().addToast('Đã xóa toàn bộ thông báo', 'success');
    } catch {
      useUIStore.getState().addToast('Không thể xóa thông báo. Vui lòng thử lại.', 'error');
    }
  };

  const handleOpenNotification = (n: Notification) => {
    if (!n.is_read) markRead(n.id);
    const kind = isSafeLink(n.link);
    if (!kind || !n.link) return;
    setOpen(false);
    if (kind === 'internal') {
      navigate(n.link);
    } else {
      window.open(n.link, '_blank', 'noopener,noreferrer');
    }
  };

  const tabs: { id: NotifFilterTab; label: string; count?: number }[] = [
    { id: 'all', label: 'Tất cả', count: serverCounts?.all },
    { id: 'unread', label: 'Chưa đọc', count: serverCounts?.unread },
    { id: 'mentions', label: 'Nhắc tên', count: serverCounts?.mentions },
    { id: 'approvals', label: 'Duyệt', count: serverCounts?.approvals },
    { id: 'crm', label: 'CRM', count: serverCounts?.crm },
  ];

  const panelNode = typeof document !== 'undefined' ? createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={dropdownRef}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] as any }}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            right: dropdownPos.right,
            width: 'min(410px, calc(100vw - 24px))',
            background: 'var(--color-surface, #ffffff)',
            borderRadius: 16,
            boxShadow: '0 20px 50px rgba(15, 23, 42, 0.18)',
            border: '1px solid var(--color-border, #e2e8f0)',
            zIndex: 2147483610,
            overflow: 'hidden',
            willChange: 'transform, opacity',
            transform: 'translate3d(0, 0, 0)',
            contain: 'layout style'
          }}
        >
          {/* Header */}
          <div style={{ padding: '0.9rem 1.15rem 0.65rem', borderBottom: '1px solid var(--color-border-light, #e2e8f0)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontWeight: 700, fontSize: '0.9375rem', margin: 0, color: 'var(--color-text, #0f172a)' }}>Thông báo</h3>
                {unreadCount > 0 && (
                  <span style={{
                    fontSize: '0.6875rem', fontWeight: 700, color: '#BD1D2D',
                    background: 'rgba(189, 29, 45, 0.08)', padding: '2px 8px', borderRadius: 999
                  }}>
                    {unreadCount} chưa đọc
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    title="Đánh dấu tất cả đã đọc"
                    style={{
                      padding: '4px 9px', fontSize: '0.75rem', fontWeight: 600,
                      background: 'var(--color-bg, #f8fafc)', border: '1px solid var(--color-border, #e2e8f0)',
                      borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      color: 'var(--color-text-light, #334155)'
                    }}
                  >
                    <CheckCheck size={12} /> Đọc hết
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmClearOpen(true)}
                    title="Xóa tất cả thông báo"
                    aria-label="Xóa tất cả thông báo"
                    style={{
                      padding: '4px 8px', fontSize: '0.75rem',
                      background: 'var(--color-bg, #f8fafc)', border: '1px solid var(--color-border, #e2e8f0)',
                      borderRadius: 8, cursor: 'pointer', color: 'var(--color-text-muted, #64748b)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Ch.V Segmented Control Filter */}
            <div style={{
              display: 'inline-flex', width: '100%', padding: '3px',
              borderRadius: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', gap: '2px'
            }}>
              {tabs.map(t => {
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(t.id);
                      fetchNotifications(t.id);
                    }}
                    style={{
                      flex: 1, height: '28px', padding: '0 4px', borderRadius: '7px', border: 'none',
                      background: isActive ? '#ffffff' : 'transparent',
                      color: isActive ? '#BD1D2D' : '#64748b',
                      fontWeight: isActive ? 700 : 600,
                      fontSize: '0.69rem', cursor: 'pointer', whiteSpace: 'nowrap',
                      boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {t.label}{typeof t.count === 'number' && t.count > 0 ? ` (${t.count})` : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* List */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading && notifications.length === 0 && (
              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '4px 0' }}>
                    <Skeleton width={30} height={30} borderRadius="50%" />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Skeleton width="85%" height={12} />
                      <Skeleton width="50%" height={9} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && filteredNotifications.length === 0 && (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
                <Bell size={30} style={{ color: '#94a3b8', marginBottom: '0.6rem', display: 'inline-block' }} />
                <p style={{ fontSize: '0.84rem', color: 'var(--color-text-muted, #64748b)', margin: 0 }}>
                  {activeTab === 'all' ? 'Không có thông báo mới' : 'Không có thông báo trong mục này'}
                </p>
              </div>
            )}

            {filteredNotifications.map(n => {
              const visual = TYPE_VISUALS[n.type] || TYPE_VISUALS.info;
              const timeLabel = fmtTime(n.created_at);
              return (
                <div
                  key={n.id}
                  onClick={() => handleOpenNotification(n)}
                  style={{
                    padding: '0.82rem 1.15rem',
                    borderBottom: '1px solid var(--color-border-light, #f1f5f9)',
                    background: !n.is_read ? 'rgba(189, 29, 45, 0.04)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'flex-start',
                    transition: 'background 0.15s'
                  }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: visual.bg, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0, marginTop: 2
                  }}>
                    {visual.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: '0.8125rem', fontWeight: n.is_read ? 500 : 700,
                      color: 'var(--color-text, #0f172a)', lineHeight: 1.4, margin: 0
                    }}>
                      {cleanNotificationText(n.title)}
                    </p>
                    {n.body && (
                      <p style={{
                        fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)',
                        margin: '3px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}>
                        {cleanNotificationText(n.body)}
                      </p>
                    )}
                    {timeLabel && (
                      <p style={{ fontSize: '0.6875rem', color: '#94a3b8', margin: '4px 0 0' }}>{timeLabel}</p>
                    )}
                  </div>
                  {!n.is_read && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#BD1D2D', flexShrink: 0, marginTop: 6
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  ) : null;

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={unreadCount > 0 ? `Thông báo (${unreadCount} chưa đọc)` : 'Thông báo'}
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            updateAnchorPosition();
            fetchNotifications(activeTab);
          }
        }}
        style={{
          position: 'relative', width: 36, height: 36, borderRadius: '50%',
          background: open ? 'rgba(189, 29, 45, 0.08)' : 'var(--color-bg, #f8fafc)',
          border: '1px solid var(--color-border, #e2e8f0)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: open ? '#BD1D2D' : 'var(--color-text-light, #475569)',
          transition: 'all 0.2s'
        }}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              position: 'absolute', top: -4, right: -4,
              minWidth: 18, height: 18, padding: '0 4px', borderRadius: 999,
              background: '#BD1D2D', color: 'white',
              fontSize: '0.625rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--color-surface, #ffffff)'
            }}
          >
            {badgeText}
          </motion.span>
        )}
      </button>

      {panelNode}

      <ConfirmModal
        isOpen={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={clearAll}
        title="Xóa tất cả thông báo"
        message="Bạn có chắc chắn muốn xóa toàn bộ danh sách thông báo hiện tại? Thao tác này không thể hoàn tác."
        confirmText="Xóa tất cả"
        cancelText="Hủy"
        confirmType="danger"
        zIndex={2147483647}
      />
    </div>
  );
};

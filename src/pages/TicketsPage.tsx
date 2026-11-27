import React, { useState, useMemo, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Plus, Search, LifeBuoy, AlertCircle, Clock, X, Save, MoreHorizontal,
  FileText, Loader2, Download, CheckCircle2, Flame, Activity, ShieldAlert
} from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useAuth } from '../contexts/AuthContext';
import { useTabActive } from '../contexts/TabActiveContext';
import { useTenantConfig } from '../contexts/TenantConfigContext';
import { useTypedSetting } from '../contexts/SettingsBootstrapContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar } from '../components/ui/Avatar';
import api from '../api/axios';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useDebounce } from '../hooks/useDebounce';
import { CustomSelect } from '../components/ui/CustomSelect';
import { CustomModal } from '../components/ui/CustomModal';
import { Pagination } from '../components/ui/Pagination';
import { EmptyCard } from '../components/ui/EmptyCard';
import { PasteDropzoneArea } from '../components/ui/PasteDropzoneArea';
import { ensureArray, extractArray } from '../utils/safeArray';
import { formatDateVN, formatDateTimeVN } from '../utils/dateUtils';
import { isViewer, isManagement, isSystemAdmin } from '../utils/roleUtils';
import {
  DomKpiTile,
  DomToolbarButton,
  DomSegmentedSwitch,
} from '../components/Dashboard/DomationDashboardKit';

interface SupportTicketsKpiStripProps {
  kpiStats: {
    totalCount: number;
    openCount: number;
    inProgressCount: number;
    overdueCount: number;
    urgentOpenCount: number;
    atRiskCount: number;
    waitingCount: number;
    doneTotal: number;
    doneRate: number;
    resolvedCount: number;
    avgHours: number | null;
  };
  overdueOnly: boolean;
  onToggleOverdue: () => void;
  urgentHours: number;
  standardHours: number;
}

const SupportTicketsKpiStrip: React.FC<SupportTicketsKpiStripProps> = React.memo(({
  kpiStats,
  overdueOnly,
  onToggleOverdue,
  urgentHours,
  standardHours,
}) => (
  <div
    className="dashboard-kpi-grid"
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '1rem',
      marginBottom: '1.25rem',
    }}
  >
    <DomKpiTile
      label="TỔNG SỐ TICKET"
      value={kpiStats.totalCount.toLocaleString('vi-VN')}
      icon={<LifeBuoy size={16} />}
      accent="brand"
      breakdown={
        <>
          <span>Mới mở: <strong style={{ color: '#0f172a' }}>{kpiStats.openCount}</strong></span>
          <span>Đang xử lý: <strong style={{ color: '#0f172a' }}>{kpiStats.inProgressCount}</strong></span>
        </>
      }
    />
    <DomKpiTile
      label="QUÁ HẠN SLA"
      value={kpiStats.overdueCount.toLocaleString('vi-VN')}
      icon={<Flame size={16} />}
      accent="brand"
      valueTone="brand"
      onClick={onToggleOverdue}
      badge={overdueOnly ? 'Đang lọc' : undefined}
      style={{ outline: overdueOnly ? '2px solid #BD1D2D' : undefined }}
      breakdown={
        <>
          <span>Khẩn/Cao mở: <strong style={{ color: '#0f172a' }}>{kpiStats.urgentOpenCount}</strong></span>
          <span>Sắp trễ: <strong style={{ color: '#0f172a' }}>{kpiStats.atRiskCount}</strong> · Chờ PH: <strong style={{ color: '#0f172a' }}>{kpiStats.waitingCount}</strong></span>
        </>
      }
    />
    <DomKpiTile
      label="ĐÃ GIẢI QUYẾT & ĐÓNG"
      value={kpiStats.doneTotal.toLocaleString('vi-VN')}
      icon={<CheckCircle2 size={16} />}
      accent="slate"
      breakdown={
        <>
          <span>Tỷ lệ hoàn tất: <strong style={{ color: 'var(--color-text)' }}>{kpiStats.doneRate}%</strong></span>
          <span>Đã giải quyết: <strong style={{ color: 'var(--color-text)' }}>{kpiStats.resolvedCount}</strong></span>
        </>
      }
    />
    <DomKpiTile
      label="THỜI GIAN XỬ LÝ TB"
      value={kpiStats.avgHours !== null ? `${kpiStats.avgHours}h` : '—'}
      icon={<Activity size={16} />}
      accent="blue"
      breakdown={
        <>
          <span>SLA Khẩn cấp: <strong style={{ color: 'var(--color-text)' }}>{urgentHours} giờ</strong></span>
          <span>SLA Tiêu chuẩn: <strong style={{ color: 'var(--color-text)' }}>{standardHours} giờ</strong></span>
        </>
      }
    />
  </div>
));

const TicketDrawer = lazy(() => import('./TicketDrawer').then((m) => ({ default: m.TicketDrawer })));
const CustomerProfileDrawer = lazy(() =>
  import('./CustomerProfileDrawer').then((m) => ({ default: m.CustomerProfileDrawer }))
);

const TICKET_STATUSES = [
  { id: 'open', label: 'Mới mở', color: '#BD1D2D', bg: '#fef2f2' },
  { id: 'in_progress', label: 'Đang xử lý', color: '#b45309', bg: '#fffbeb' },
  { id: 'waiting', label: 'Chờ phản hồi', color: '#334155', bg: '#f1f5f9' },
  { id: 'resolved', label: 'Đã giải quyết', color: '#059669', bg: '#ecfdf5' },
  { id: 'closed', label: 'Đã đóng', color: '#64748b', bg: '#f8fafc' },
];

const PRIORITIES = [
  { id: 'low', label: 'Thấp', color: '#64748b', bg: '#f1f5f9' },
  { id: 'medium', label: 'Trung bình', color: '#334155', bg: '#f1f5f9' },
  { id: 'high', label: 'Cao', color: '#b45309', bg: '#fffbeb' },
  { id: 'urgent', label: 'Khẩn cấp', color: '#BD1D2D', bg: '#fef2f2' },
];

const DEFAULT_UI_LIMITS = {
  ticket_polling_interval_ms: 15000,
  default_limit: 20,
};

const DEFAULT_SLA_SETTING = {
  sla_hours_by_priority: {
    urgent: 4,
    high: 8,
    medium: 24,
    low: 48,
  },
};

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const FORBIDDEN_UPLOAD_EXT = /\.(php|phtml|phar|exe|bat|cmd|sh|ps1|msi|vbs|js|mjs|jsx|ts|tsx|html?|svg)$/i;

function normalizeTicketStatus(status: unknown): string {
  const s = String(status || 'open').trim().toLowerCase();
  return !s || s === 'new' ? 'open' : s;
}

function parseSafeDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const trimmed = String(val).trim();
  if (!trimmed || trimmed === '0000-00-00' || trimmed === '0000-00-00 00:00:00') return null;
  const d = new Date(trimmed.includes('T') ? trimmed : trimmed.replace(/-/g, '/'));
  return isNaN(d.getTime()) ? null : d;
}

function normalizeMediaUrl(rawUrl: unknown): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^(javascript|vbscript):/i.test(trimmed)) return '';
  if (trimmed.toLowerCase().startsWith('data:')) {
    return /^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=]+$/i.test(trimmed) ? trimmed : '';
  }
  if (/\.svg(\?.*)?$/i.test(trimmed)) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  const apiBase = import.meta.env.VITE_API_URL || '/backend';
  let path = trimmed.replace(/^\/+/, '');
  if (path.startsWith('backend/')) {
    return `/${path}`;
  }
  if (path.startsWith('storage/uploads/')) {
    path = path.replace('storage/uploads/', 'uploads/');
  }
  return `${apiBase}/${path}`;
}

function csvSafe(val: unknown): string {
  let s = String(val ?? '').replace(/\r\n|\r|\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

export const TicketsPage: React.FC = () => {
  const isTabActive = useTabActive();
  const addToast = useUIStore((s) => s.addToast);
  const { user: currentUser } = useAuth();
  const { hasPermission } = useTenantConfig();
  const uiLimitsSetting = useTypedSetting<any>('hrm.ptk_ui_and_polling_limits', DEFAULT_UI_LIMITS);
  const slaSetting = useTypedSetting<any>('hrm.tickets_sla_and_routing', DEFAULT_SLA_SETTING);

  const isUserViewer = isViewer(currentUser);
  const canCreateTicket = !isUserViewer && hasPermission('tickets', 'write');
  const canMoveKanban =
    !isUserViewer &&
    (isSystemAdmin(currentUser) || isManagement(currentUser) || hasPermission('tickets', 'write'));

  const pageSize = Math.min(50, Math.max(10, Number(uiLimitsSetting?.default_limit || 20)));
  const pollingMs = Math.max(10000, Number(uiLimitsSetting?.ticket_polling_interval_ms || 15000));

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [tickets, setTickets] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [selectedContactForDrawer, setSelectedContactForDrawer] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const emptyCreateForm = useCallback(
    () => ({
      subject: '',
      priority: 'medium',
      customer_name: '',
      contact_id: null as number | null,
      description: '',
      related_contacts: [] as string[],
      related_users: [] as string[],
      attachments: [] as { name: string; url: string; size?: number; type?: string }[],
    }),
    []
  );

  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [isBugTicket, setIsBugTicket] = useState(false);
  const [hasPendingDraft, setHasPendingDraft] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isTabActive) return;
    setNowMs(Date.now());
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') setNowMs(Date.now());
    }, 60000);
    return () => window.clearInterval(t);
  }, [isTabActive]);

  const isSlaOverdue = useCallback(
    (dateStr: unknown, statusStr?: unknown) => {
      const st = normalizeTicketStatus(statusStr);
      if (st === 'closed' || st === 'resolved') return false;
      const d = parseSafeDate(dateStr);
      if (!d) return false;
      return d.getTime() < nowMs;
    },
    [nowMs]
  );

  const ticketsAbortRef = useRef<AbortController | null>(null);
  const usersAbortRef = useRef<AbortController | null>(null);
  const contactsAbortRef = useRef<AbortController | null>(null);
  const deepLinkAbortRef = useRef<AbortController | null>(null);
  const createSubmitInFlightRef = useRef(false);
  const dropzoneUploadInFlightRef = useRef(false);
  const kanbanDropInFlightRef = useRef(false);

  const fetchTickets = useCallback(
    async (silent = false) => {
      if (ticketsAbortRef.current) {
        ticketsAbortRef.current.abort();
      }
      const controller = new AbortController();
      ticketsAbortRef.current = controller;
      const { signal } = controller;

      if (!silent) setLoading(true);
      try {
        const params: Record<string, any> = {
          page,
          limit: pageSize,
          search: debouncedSearch,
          status: filterStatus,
        };
        if (filterPriority !== 'all') params.priority = filterPriority;
        if (filterAssignee !== 'all') params.assignee_id = filterAssignee;
        if (overdueOnly) params.overdue_sla = 1;

        const r = await api.get('/tickets', { params, signal });
        if (signal.aborted) return;
        const data = r.data?.data || {};
        setTickets(ensureArray(data.items));
        setTotal(Number(data.total || 0));
        if (data.summary && typeof data.summary === 'object') {
          setSummary(data.summary);
        }
      } catch (e: any) {
        if (
          e?.name === 'AbortError' ||
          e?.name === 'CanceledError' ||
          e?.code === 'ERR_CANCELED' ||
          signal.aborted
        ) {
          return;
        }
        if (!silent) {
          setTickets([]);
          addToast('Không thể kết nối với máy chủ Backend', 'error');
        }
      } finally {
        if (!signal.aborted && !silent) {
          setLoading(false);
        }
      }
    },
    [page, pageSize, debouncedSearch, filterStatus, filterPriority, filterAssignee, overdueOnly, addToast]
  );

  const fetchTicketsRef = useRef(fetchTickets);
  fetchTicketsRef.current = fetchTickets;

  const fetchUsers = useCallback(async () => {
    usersAbortRef.current?.abort();
    const controller = new AbortController();
    usersAbortRef.current = controller;
    try {
      const uRes = await api.get('/users', { signal: controller.signal });
      if (!controller.signal.aborted) {
        setUsers(extractArray(uRes?.data));
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
    }
  }, []);

  const fetchContactsOnDemand = useCallback(async (searchQuery = '') => {
    contactsAbortRef.current?.abort();
    const controller = new AbortController();
    contactsAbortRef.current = controller;
    try {
      const params: Record<string, any> = { limit: 100 };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      const cRes = await api.get('/contacts', { params, signal: controller.signal });
      if (!controller.signal.aborted) {
        const fetched = extractArray(cRes?.data);
        setContacts((prev) => {
          const map = new Map<number, any>();
          ensureArray(prev).forEach((c: any) => {
            if (c?.id) map.set(Number(c.id), c);
          });
          fetched.forEach((c: any) => {
            if (c?.id) map.set(Number(c.id), c);
          });
          return Array.from(map.values());
        });
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    return () => {
      ticketsAbortRef.current?.abort();
    };
  }, [fetchTickets]);

  useEffect(() => {
    fetchUsers();
    return () => {
      usersAbortRef.current?.abort();
      contactsAbortRef.current?.abort();
    };
  }, [fetchUsers]);

  useEffect(() => {
    if (showCreateModal || selectedTicket) {
      fetchContactsOnDemand('');
    }
  }, [showCreateModal, selectedTicket?.id, fetchContactsOnDemand]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchTicketsRef.current(true);
    };
    window.addEventListener('ticket-updated', handleRefresh);
    window.addEventListener('contact-updated', handleRefresh);
    return () => {
      window.removeEventListener('ticket-updated', handleRefresh);
      window.removeEventListener('contact-updated', handleRefresh);
    };
  }, []);

  useEffect(() => {
    if (!isTabActive) return;
    const timer = window.setInterval(() => {
      if (
        isTabActive &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        !showCreateModal &&
        !selectedTicket
      ) {
        fetchTicketsRef.current(true);
      }
    }, pollingMs);
    return () => window.clearInterval(timer);
  }, [isTabActive, pollingMs, showCreateModal, selectedTicket]);

  const location = useLocation();

  useEffect(() => {
    if (
      !location.pathname.startsWith('/support-tickets') &&
      !location.pathname.startsWith('/tickets')
    ) {
      return;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('open_id') || urlParams.get('id') || urlParams.get('ticket_id');

    const stripTicketParams = () => {
      const newParams = new URLSearchParams(window.location.search);
      newParams.delete('open_id');
      newParams.delete('id');
      newParams.delete('ticket_id');
      const cleanUrl = window.location.pathname + (newParams.toString() ? `?${newParams.toString()}` : '');
      window.history.replaceState({}, '', cleanUrl);
    };

    if (targetId) {
      const tid = Number(targetId);
      if (tid > 0) {
        deepLinkAbortRef.current?.abort();
        const controller = new AbortController();
        deepLinkAbortRef.current = controller;
        api
          .get(`/tickets/${tid}`, { signal: controller.signal })
          .then((res) => {
            if (controller.signal.aborted) return;
            if (res.data?.success && res.data?.data) {
              (useUIStore.getState() as any).closeTicketDrawer?.();
              setSelectedTicket(res.data.data);
            } else {
              addToast('Không tìm thấy Ticket hoặc bạn không có quyền truy cập', 'error');
            }
            stripTicketParams();
          })
          .catch((err: any) => {
            if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
              return;
            }
            addToast(
              err?.response?.data?.message || 'Không tìm thấy Ticket hoặc bạn không có quyền truy cập',
              'error'
            );
            stripTicketParams();
          });
      } else {
        stripTicketParams();
      }
    }

    const shouldCreate = urlParams.get('create') === '1';
    const createType = urlParams.get('type');
    if (shouldCreate && canCreateTicket) {
      if (createType === 'bug') {
        setCreateForm({
          ...emptyCreateForm(),
          customer_name: 'Hệ thống / Yêu cầu chung',
        });
        setIsBugTicket(true);
        setHasPendingDraft(false);
      } else {
        let initialDraft: any = null;
        try {
          const pending = sessionStorage.getItem('pending_ticket_draft');
          if (pending) {
            const parsed = JSON.parse(pending);
            const createdAt = parsed?._draft_created_at || 0;
            if (!createdAt || Date.now() - createdAt < 10 * 60 * 1000) {
              initialDraft = parsed;
            }
          }
        } catch {
          initialDraft = null;
        }

        setCreateForm({
          ...emptyCreateForm(),
          subject: initialDraft?.subject || initialDraft?.title || '',
          priority: initialDraft?.priority || 'medium',
          customer_name: initialDraft?.customer_name || initialDraft?.student_name || '',
          contact_id: initialDraft?.contact_id ? Number(initialDraft.contact_id) : null,
          description: initialDraft?.description || initialDraft?.notes || initialDraft?.body || '',
          related_contacts: initialDraft?.contact_id ? [String(initialDraft.contact_id)] : [],
        });
        setIsBugTicket(false);
        setHasPendingDraft(Boolean(initialDraft));
      }
      setShowCreateModal(true);

      const newParams = new URLSearchParams(window.location.search);
      newParams.delete('create');
      newParams.delete('type');
      const cleanUrl = window.location.pathname + (newParams.toString() ? `?${newParams.toString()}` : '');
      window.history.replaceState({}, '', cleanUrl);
    }

    return () => {
      deepLinkAbortRef.current?.abort();
    };
  }, [location.pathname, location.search, canCreateTicket, emptyCreateForm, addToast]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterStatus, filterPriority, filterAssignee, overdueOnly]);

  useEffect(() => {
    if (total > 0 && page > 1) {
      const maxPage = Math.max(1, Math.ceil(total / pageSize));
      if (page > maxPage) {
        setPage(maxPage);
      }
    }
  }, [total, page, pageSize]);

  const handleCloseCreateModal = useCallback(() => {
    if (saving) return;
    setShowCreateModal(false);
    setIsBugTicket(false);
  }, [saving]);

  const handleUpdate = (updated: any) => {
    setTickets((prev) => prev.map((t) => (Number(t.id) === Number(updated.id) ? { ...t, ...updated } : t)));
    if (selectedTicket && Number(selectedTicket.id) === Number(updated.id)) {
      setSelectedTicket((prev: any) => (prev ? { ...prev, ...updated } : updated));
    }
  };

  const handleDelete = (deletedId: number) => {
    setTickets((prev) => prev.filter((t) => Number(t.id) !== Number(deletedId)));
    setTotal((prev) => Math.max(0, prev - 1));
    if (selectedTicket && Number(selectedTicket.id) === Number(deletedId)) {
      setSelectedTicket(null);
    }
    fetchTicketsRef.current(true);
  };

  const handleCreateTicket = async () => {
    if (!canCreateTicket || createSubmitInFlightRef.current) return;
    const trimmedSubject = createForm.subject?.trim() || '';
    const trimmedCustomer = createForm.customer_name?.trim() || '';
    if (!trimmedSubject || !trimmedCustomer) {
      addToast('Vui lòng nhập tiêu đề và tên khách hàng', 'error');
      return;
    }

    const numericRelContacts = Array.from(
      new Set(
        [
          ...(createForm.contact_id ? [Number(createForm.contact_id)] : []),
          ...ensureArray(createForm.related_contacts).map((id) => Number(id)),
        ].filter((n) => Number.isFinite(n) && n > 0)
      )
    );

    const numericRelUsers = Array.from(
      new Set(
        ensureArray(createForm.related_users)
          .map((id) => Number(id))
          .filter((n) => Number.isFinite(n) && n > 0)
      )
    );

    const payload = {
      subject: trimmedSubject,
      status: 'open',
      priority: createForm.priority,
      customer_name: trimmedCustomer,
      contact_id: createForm.contact_id,
      customer_id: createForm.contact_id,
      description: createForm.description?.trim() || '',
      related_contacts: numericRelContacts,
      related_users: numericRelUsers,
      attachments: createForm.attachments,
    };

    createSubmitInFlightRef.current = true;
    setSaving(true);
    try {
      const r = await api.post('/tickets', payload);
      const newTicket = r.data?.data;
      if (hasPendingDraft) {
        try {
          sessionStorage.removeItem('pending_ticket_draft');
        } catch {}
        setHasPendingDraft(false);
      }
      if (newTicket) {
        setTickets((prev) => [newTicket, ...prev]);
        setTotal((prev) => prev + 1);
      }
      fetchTicketsRef.current(true);
      setShowCreateModal(false);
      setIsBugTicket(false);
      setCreateForm(emptyCreateForm());
      window.dispatchEvent(new CustomEvent('ticket-updated', { detail: { id: newTicket?.id } }));
      window.dispatchEvent(
        new CustomEvent('erp-action-completed', { detail: { actionType: 'ticket', id: newTicket?.id } })
      );
      addToast('Đã tạo Ticket thành công', 'success');
    } catch (e: any) {
      addToast(e?.response?.data?.message || 'Không thể tạo Ticket do lỗi mạng', 'error');
    } finally {
      createSubmitInFlightRef.current = false;
      setSaving(false);
    }
  };

  const handleKanbanDropStatus = async (ticketObj: any, nextStatus: string) => {
    if (!canMoveKanban || !ticketObj?.id || kanbanDropInFlightRef.current) return;
    const currentStatus = normalizeTicketStatus(ticketObj.status);
    if (currentStatus === nextStatus) return;

    kanbanDropInFlightRef.current = true;
    const prevTicket = { ...ticketObj };
    const patch: Record<string, any> = { status: nextStatus };
    if (nextStatus === 'closed' || nextStatus === 'resolved') {
      patch.resolution_status = 'resolved';
    } else if (currentStatus === 'closed' || currentStatus === 'resolved') {
      patch.resolution_status = null;
      patch.rejection_reason = null;
    }

    setTickets((prev) =>
      prev.map((item) => (Number(item.id) === Number(ticketObj.id) ? { ...item, ...patch } : item))
    );
    try {
      const res = await api.put(`/tickets/${ticketObj.id}`, patch);
      const serverRow = res.data?.data && typeof res.data.data === 'object' ? res.data.data : patch;
      setTickets((prev) =>
        prev.map((item) =>
          Number(item.id) === Number(ticketObj.id) ? { ...item, ...patch, ...serverRow } : item
        )
      );
      window.dispatchEvent(new CustomEvent('ticket-updated', { detail: { id: ticketObj.id } }));
      const targetCol = TICKET_STATUSES.find((c) => c.id === nextStatus);
      addToast(`Đã chuyển #${ticketObj.id} sang "${targetCol?.label || nextStatus}"`, 'success');
      fetchTicketsRef.current(true);
    } catch (err: any) {
      setTickets((prev) =>
        prev.map((item) => (Number(item.id) === Number(ticketObj.id) ? prevTicket : item))
      );
      addToast(err?.response?.data?.message || 'Không thể cập nhật trạng thái Ticket', 'error');
    } finally {
      kanbanDropInFlightRef.current = false;
    }
  };

  const handleExportCsv = async () => {
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      const allRows: any[] = [];
      let p = 1;
      while (p <= 5) {
        const params: Record<string, any> = {
          page: p,
          limit: 100,
          search: debouncedSearch,
          status: filterStatus,
        };
        if (filterPriority !== 'all') params.priority = filterPriority;
        if (filterAssignee !== 'all') params.assignee_id = filterAssignee;
        if (overdueOnly) params.overdue_sla = 1;
        const r = await api.get('/tickets', { params });
        const chunk = ensureArray(r.data?.data?.items);
        allRows.push(...chunk);
        const totalRows = Number(r.data?.data?.total || 0);
        if (allRows.length >= totalRows || chunk.length < 100) break;
        p++;
      }

      if (allRows.length === 0) {
        addToast('Không có dữ liệu Ticket khớp bộ lọc để xuất', 'error');
        return;
      }

      const headers = [
        'ID',
        'Tiêu đề',
        'Khách hàng',
        'Người phụ trách',
        'Độ ưu tiên',
        'Trạng thái',
        'Hạn SLA',
        'Ngày tạo',
      ];
      const lines = [
        headers.map(csvSafe).join(','),
        ...allRows.map((row: any) =>
          [
            `#${row.id}`,
            row.subject || '',
            row.customer_name || '',
            row.assignee_name || 'Chưa phân công',
            PRIORITIES.find((x) => x.id === row.priority)?.label || row.priority || '',
            TICKET_STATUSES.find((x) => x.id === normalizeTicketStatus(row.status))?.label || row.status || '',
            formatDateTimeVN(row.due_date, '—'),
            formatDateTimeVN(row.created_at, '—'),
          ]
            .map(csvSafe)
            .join(',')
        ),
      ];

      const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `tickets-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      addToast(`Đã xuất ${allRows.length} Ticket ra CSV`, 'success');
    } catch {
      addToast('Không thể xuất danh sách Ticket', 'error');
    } finally {
      setExportingCsv(false);
    }
  };

  const kpiStats = useMemo(() => {
    if (summary && typeof summary === 'object') {
      const totalCount = Number(summary.total_tickets ?? summary.total ?? total ?? 0);
      const openCount = Number(summary.open_count ?? 0);
      const inProgressCount = Number(summary.in_progress_count ?? 0);
      const waitingCount = Number(summary.waiting_count ?? 0);
      const resolvedCount = Number(summary.resolved_count ?? 0);
      const closedCount = Number(summary.closed_count ?? 0);
      const overdueCount = Number(summary.overdue_sla_count ?? 0);
      const atRiskCount = Number(summary.at_risk_sla_count ?? 0);
      const urgentOpenCount = Number(summary.urgent_high_open_count ?? summary.urgent_open_count ?? 0);
      const doneTotal = resolvedCount + closedCount;
      const avgHours =
        doneTotal > 0 && summary.avg_resolution_hours != null
          ? Number(summary.avg_resolution_hours)
          : null;
      const doneRate = totalCount > 0 ? Math.round((doneTotal / totalCount) * 1000) / 10 : 0;
      const slaCompliancePct =
        summary.sla_compliance_pct != null ? Number(summary.sla_compliance_pct) : 100;
      return {
        totalCount,
        openCount,
        inProgressCount,
        waitingCount,
        resolvedCount,
        closedCount,
        doneTotal,
        doneRate,
        overdueCount,
        atRiskCount,
        urgentOpenCount,
        avgHours,
        slaCompliancePct,
      };
    }

    const totalCount = total || tickets.length;
    let openCount = 0;
    let inProgressCount = 0;
    let waitingCount = 0;
    let resolvedCount = 0;
    let closedCount = 0;
    let overdueCount = 0;
    let urgentOpenCount = 0;
    tickets.forEach((item) => {
      const st = normalizeTicketStatus(item.status);
      if (st === 'open') openCount++;
      else if (st === 'in_progress') inProgressCount++;
      else if (st === 'waiting') waitingCount++;
      else if (st === 'resolved') resolvedCount++;
      else if (st === 'closed') closedCount++;
      if (isSlaOverdue(item.due_date, st)) overdueCount++;
      if ((item.priority === 'urgent' || item.priority === 'high') && st !== 'closed' && st !== 'resolved') {
        urgentOpenCount++;
      }
    });
    const doneTotal = resolvedCount + closedCount;
    const doneRate = totalCount > 0 ? Math.round((doneTotal / totalCount) * 1000) / 10 : 0;
    return {
      totalCount,
      openCount,
      inProgressCount,
      waitingCount,
      resolvedCount,
      closedCount,
      doneTotal,
      doneRate,
      overdueCount,
      atRiskCount: 0,
      urgentOpenCount,
      avgHours: null,
      slaCompliancePct: 100,
    };
  }, [summary, total, tickets, isSlaOverdue]);

  const urgentHours =
    Number(slaSetting?.sla_hours_by_priority?.urgent ?? 4) || 4;
  const standardHours =
    Number(slaSetting?.sla_hours_by_priority?.medium ?? 24) || 24;

  const visibleKanbanCols = useMemo(() => {
    if (filterStatus !== 'all') {
      const match = TICKET_STATUSES.filter((c) => c.id === filterStatus);
      return match.length > 0 ? match : TICKET_STATUSES;
    }
    return TICKET_STATUSES;
  }, [filterStatus]);

  const safeUsers = ensureArray(users);
  const safeContacts = ensureArray(contacts);

  const hasActiveFilter =
    Boolean(search.trim()) ||
    filterStatus !== 'all' ||
    filterPriority !== 'all' ||
    filterAssignee !== 'all' ||
    overdueOnly;

  const ch5CardStyle: React.CSSProperties = {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
    padding: '1.1rem 1.25rem',
  };

  return (
    <div>
      <div className="page-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#0f172a' }}>
            <LifeBuoy size={28} color="#BD1D2D" />
            Trung tâm Hỗ trợ & SLA (Tickets)
          </h1>
          <p className="page-subtitle" style={{ color: '#64748b' }}>
            Quản lý tiếp nhận, điều phối và giám sát cam kết SLA theo thời gian thực
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <DomToolbarButton
            variant="outline"
            icon={exportingCsv ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
            onClick={handleExportCsv}
            disabled={exportingCsv}
            title="Xuất CSV theo bộ lọc hiện tại"
          >
            <span className="hide-on-mobile">Xuất CSV</span>
          </DomToolbarButton>

          {canCreateTicket && (
            <DomToolbarButton
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => {
                setIsBugTicket(false);
                setHasPendingDraft(false);
                setCreateForm(emptyCreateForm());
                setShowCreateModal(true);
              }}
              title="Tạo Ticket mới"
            >
              <span className="hide-on-mobile">Tạo Ticket</span>
            </DomToolbarButton>
          )}
        </div>
      </div>

      {/* Ch. V SLA Risk Radar — Memoized DomKpiTile Strip */}
      <SupportTicketsKpiStrip
        kpiStats={kpiStats}
        overdueOnly={overdueOnly}
        onToggleOverdue={() => setOverdueOnly((v) => !v)}
        urgentHours={urgentHours}
        standardHours={standardHours}
      />

      {/* Status Segmented Control + Search/Filter Card */}
      <div
        className="card"
        style={{
          ...ch5CardStyle,
          marginBottom: isMobile ? '0.875rem' : '1.25rem',
          padding: isMobile ? '10px 12px' : '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <DomSegmentedSwitch
            value={filterStatus}
            onChange={(val) => setFilterStatus(val)}
            options={[{ value: 'all', label: 'Tất cả' }, ...TICKET_STATUSES.map((st) => ({ value: st.id, label: st.label }))]}
          />

          {!isMobile && (
            <DomSegmentedSwitch
              value={viewMode}
              onChange={(val) => setViewMode(val as 'list' | 'kanban')}
              options={[
                { value: 'list', label: 'Danh sách' },
                { value: 'kanban', label: 'Kanban' },
              ]}
            />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', position: 'relative' }}>
          <div className="filter-search" style={{ flex: 1, minWidth: isMobile ? 0 : '240px' }}>
            <Search size={14} style={{ color: '#64748b' }} />
            <input
              className="form-input"
              placeholder="Tìm theo ID, tiêu đề, tên khách hàng..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <X size={14} style={{ color: '#64748b' }} />
              </button>
            )}
          </div>

          {isMobile ? (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowMobileFilters((v) => !v)}
                style={{
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  background: showMobileFilters ? '#f1f5f9' : '#ffffff',
                  color: hasActiveFilter ? '#BD1D2D' : '#0f172a',
                  position: 'relative',
                }}
                title="Bộ lọc & Chế độ xem"
              >
                <MoreHorizontal size={18} />
                {hasActiveFilter && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#BD1D2D',
                    }}
                  />
                )}
              </button>

              <AnimatePresence>
                {showMobileFilters && (
                  <>
                    <div
                      onClick={() => setShowMobileFilters(false)}
                      style={{ position: 'fixed', inset: 0, zIndex: 998, background: 'rgba(15,23,42,0.25)' }}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '42px',
                        width: '260px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        boxShadow: '0 10px 30px rgba(15,23,42,0.15)',
                        padding: '12px',
                        zIndex: 999,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                          Chế độ hiển thị
                        </label>
                        <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setViewMode('list');
                              setShowMobileFilters(false);
                            }}
                            style={{
                              flex: 1,
                              height: '30px',
                              border: 'none',
                              borderRadius: '6px',
                              background: viewMode === 'list' ? '#ffffff' : 'transparent',
                              color: viewMode === 'list' ? '#BD1D2D' : '#64748b',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                            }}
                          >
                            Danh sách
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setViewMode('kanban');
                              setShowMobileFilters(false);
                            }}
                            style={{
                              flex: 1,
                              height: '30px',
                              border: 'none',
                              borderRadius: '6px',
                              background: viewMode === 'kanban' ? '#ffffff' : 'transparent',
                              color: viewMode === 'kanban' ? '#BD1D2D' : '#64748b',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                            }}
                          >
                            Kanban
                          </button>
                        </div>
                      </div>

                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                          Mức ưu tiên
                        </label>
                        <CustomSelect
                          options={[{ value: 'all', label: 'Tất cả ưu tiên' }, ...PRIORITIES.map((p) => ({ value: p.id, label: p.label }))]}
                          value={filterPriority}
                          onChange={(val) => setFilterPriority(String(val))}
                          size="xs"
                          width="100%"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                          Người phụ trách
                        </label>
                        <CustomSelect
                          searchable
                          options={[
                            { value: 'all', label: 'Tất cả nhân sự' },
                            { value: 'unassigned', label: 'Chưa phân công' },
                            ...safeUsers.map((u: any) => ({ value: String(u.id), label: u.full_name })),
                          ]}
                          value={filterAssignee}
                          onChange={(val) => setFilterAssignee(String(val))}
                          size="xs"
                          width="100%"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setOverdueOnly((v) => !v);
                          setShowMobileFilters(false);
                        }}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '8px',
                          border: overdueOnly ? '1px solid #BD1D2D' : '1px solid #e2e8f0',
                          background: overdueOnly ? '#fef2f2' : '#ffffff',
                          color: overdueOnly ? '#BD1D2D' : '#334155',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {overdueOnly ? '✓ Đang lọc Quá hạn SLA' : 'Chỉ xem Quá hạn SLA'}
                      </button>

                      {hasActiveFilter && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearch('');
                            setFilterStatus('all');
                            setFilterPriority('all');
                            setFilterAssignee('all');
                            setOverdueOnly(false);
                            setShowMobileFilters(false);
                          }}
                          style={{
                            padding: '6px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#fef2f2',
                            color: '#BD1D2D',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Đặt lại bộ lọc
                        </button>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: '165px' }}>
                <CustomSelect
                  options={[{ value: 'all', label: 'Tất cả ưu tiên' }, ...PRIORITIES.map((p) => ({ value: p.id, label: p.label }))]}
                  value={filterPriority}
                  onChange={(val) => setFilterPriority(String(val))}
                  size="sm"
                />
              </div>
              <div style={{ width: '190px' }}>
                <CustomSelect
                  searchable
                  showAvatars
                  options={[
                    { value: 'all', label: 'Tất cả phụ trách' },
                    { value: 'unassigned', label: 'Chưa phân công' },
                    ...safeUsers.map((u: any) => ({
                      value: String(u.id),
                      label: u.full_name,
                      avatar: u.avatar_url,
                    })),
                  ]}
                  value={filterAssignee}
                  onChange={(val) => setFilterAssignee(String(val))}
                  size="sm"
                />
              </div>
              <DomToolbarButton
                variant="outline"
                active={overdueOnly}
                icon={<ShieldAlert size={14} />}
                onClick={() => setOverdueOnly((v) => !v)}
              >
                Quá hạn SLA
              </DomToolbarButton>
              {hasActiveFilter && (
                <DomToolbarButton
                  variant="ghost"
                  onClick={() => {
                    setSearch('');
                    setFilterStatus('all');
                    setFilterPriority('all');
                    setFilterAssignee('all');
                    setOverdueOnly(false);
                  }}
                >
                  Xóa lọc
                </DomToolbarButton>
              )}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ ...ch5CardStyle, padding: '1rem' }}>
          <TableSkeleton rows={6} cols={6} />
        </div>
      ) : viewMode === 'list' ? (
        <div className="card" style={{ ...ch5CardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.9rem 1rem', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    Mã & Tiêu đề
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.9rem 1rem', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    Khách hàng
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.9rem 1rem', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    Phụ trách
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.9rem 1rem', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    Độ ưu tiên
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.9rem 1rem', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    Trạng thái
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.9rem 1rem', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    SLA (Hạn chót)
                  </th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const stNorm = normalizeTicketStatus(t.status);
                  const priorityObj = PRIORITIES.find((p) => p.id === t.priority) || PRIORITIES[1];
                  const statusObj = TICKET_STATUSES.find((s) => s.id === stNorm) || TICKET_STATUSES[0];
                  const overdue = isSlaOverdue(t.due_date, stNorm);
                  return (
                    <motion.tr
                      key={t.id}
                      whileHover={{ backgroundColor: '#f8fafc' }}
                      onClick={() => setSelectedTicket(t)}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background-color 0.15s' }}
                    >
                      <td style={{ padding: '0.95rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                          <AlertCircle size={16} color={priorityObj.color} style={{ marginTop: '2px', flexShrink: 0 }} />
                          <div>
                            <p style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.88rem', margin: '0 0 2px 0' }}>
                              {t.subject}
                            </p>
                            <p style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                              #{t.id} • Tạo: {formatDateVN(t.created_at)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.95rem 1rem', fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>
                        {t.customer_name || '—'}
                      </td>
                      <td style={{ padding: '0.95rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Avatar name={t.assignee_name || 'Chưa phân công'} src={t.assignee_avatar} size={24} />
                          <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155' }}>
                            {t.assignee_name || 'Chưa phân công'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '0.95rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 9px',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background: priorityObj.bg,
                            color: priorityObj.color,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          {priorityObj.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.95rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 9px',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background: statusObj.bg,
                            color: statusObj.color,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          {t.resolution_status === 'rejected' ? 'Từ chối' : statusObj.label}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '0.95rem 1rem',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          color: overdue ? '#BD1D2D' : stNorm === 'resolved' || stNorm === 'closed' ? '#059669' : '#334155',
                        }}
                      >
                        {formatDateTimeVN(t.due_date)}
                        {overdue && (
                          <span style={{ display: 'block', fontSize: '0.7rem', color: '#BD1D2D', fontWeight: 700 }}>
                            Quá hạn SLA
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
                {tickets.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={6} style={{ padding: '2rem 1rem' }}>
                      <EmptyCard
                        icon={<LifeBuoy />}
                        title="Không tìm thấy Ticket nào"
                        description="Hệ thống không tìm thấy Ticket nào khớp với bộ lọc hiện tại."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', minHeight: '560px' }}>
          {visibleKanbanCols.map((col) => {
            const colTickets = tickets.filter((t) => normalizeTicketStatus(t.status) === col.id);
            const isOver = dragOverCol === col.id;
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  if (!canMoveKanban) return;
                  e.preventDefault();
                  if (dragOverCol !== col.id) setDragOverCol(col.id);
                }}
                onDragLeave={() => {
                  if (dragOverCol === col.id) setDragOverCol(null);
                }}
                onDrop={(e) => {
                  if (!canMoveKanban) return;
                  e.preventDefault();
                  setDragOverCol(null);
                  const tid = Number(e.dataTransfer.getData('text/plain'));
                  const dragged = tickets.find((item) => Number(item.id) === tid);
                  if (dragged) {
                    handleKanbanDropStatus(dragged, col.id);
                  }
                }}
                style={{
                  flex: visibleKanbanCols.length === 1 ? '1 1 360px' : '0 0 300px',
                  background: isOver ? '#fef2f2' : '#f8fafc',
                  border: isOver ? '1px solid #BD1D2D' : '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ fontWeight: 800, fontSize: '0.88rem', color: col.color, margin: 0 }}>{col.label}</h3>
                  <span
                    style={{
                      background: '#ffffff',
                      padding: '2px 9px',
                      borderRadius: '10px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                    }}
                  >
                    {colTickets.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                  {colTickets.map((t) => {
                    const pObj = PRIORITIES.find((p) => p.id === t.priority) || PRIORITIES[1];
                    const overdue = isSlaOverdue(t.due_date, t.status);
                    return (
                      <div
                        key={t.id}
                        draggable={canMoveKanban}
                        onDragStart={(e) => {
                          if (!canMoveKanban) return;
                          e.dataTransfer.setData('text/plain', String(t.id));
                        }}
                        onClick={() => setSelectedTicket(t)}
                        style={{
                          background: '#ffffff',
                          padding: '14px',
                          borderRadius: '12px',
                          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                          border: '1px solid #e2e8f0',
                          borderLeft: `3px solid ${pObj.color}`,
                          cursor: canMoveKanban ? 'grab' : 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
                            #{t.id} · {pObj.label}
                          </span>
                          <Avatar name={t.assignee_name || 'Chưa phân công'} src={t.assignee_avatar} size={22} />
                        </div>
                        <p style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', margin: '0 0 8px 0', lineHeight: 1.4 }}>
                          {t.subject}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.customer_name || 'Hệ thống'}
                          </span>
                          <span
                            style={{
                              fontSize: '0.71rem',
                              fontVariantNumeric: 'tabular-nums',
                              fontWeight: 700,
                              color: overdue ? '#BD1D2D' : '#64748b',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              flexShrink: 0,
                            }}
                          >
                            <Clock size={12} /> {formatDateVN(t.due_date)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {colTickets.length === 0 && (
                    <div
                      style={{
                        padding: '2rem 1rem',
                        textAlign: 'center',
                        color: '#64748b',
                        fontSize: '0.8rem',
                        border: '1px dashed #cbd5e1',
                        borderRadius: '12px',
                        background: '#ffffff',
                      }}
                    >
                      {canMoveKanban ? 'Kéo thả ticket vào đây' : 'Không có ticket nào'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {total > pageSize && (
        <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} />
        </div>
      )}

      {showCreateModal && (
      <CustomModal
        isOpen={showCreateModal}
        onClose={handleCloseCreateModal}
        title={isBugTicket ? 'Báo cáo lỗi hệ thống' : 'Tạo Ticket Hỗ trợ mới'}
        width={780}
        disableClose={saving}
        preventCloseOnBackdrop={saving}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            {!isBugTicket ? (
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column' }}>
                <label className="form-label">Tên khách hàng *</label>
                <CustomSelect
                  searchable
                  showAvatars
                  placeholder="Tìm hoặc chọn khách hàng..."
                  onSearchChange={(q) => fetchContactsOnDemand(q)}
                  options={safeContacts.map((c: any) => ({
                    value: String(c.id),
                    label: String(c.full_name || c.name || '').trim() || `#${c.id}`,
                    sublabel: c.phone || c.email,
                    avatar: c.avatar_url,
                  }))}
                  value={createForm.contact_id ? String(createForm.contact_id) : ''}
                  onChange={(val) => {
                    const cId = Number(val);
                    const matched = safeContacts.find((c: any) => Number(c.id) === cId);
                    setCreateForm((prev) => ({
                      ...prev,
                      contact_id: cId || null,
                      customer_name: matched ? String(matched.full_name || matched.name || '').trim() : prev.customer_name,
                    }));
                  }}
                />
                {!createForm.contact_id && (
                  <input
                    className="form-input"
                    style={{ marginTop: '0.5rem' }}
                    placeholder="Hoặc nhập tên khách hàng mới..."
                    value={createForm.customer_name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, customer_name: e.target.value, contact_id: null }))}
                  />
                )}
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Tiêu đề vấn đề (Subject) *</label>
                <input
                  className="form-input"
                  placeholder="Tóm tắt ngắn gọn vấn đề gặp phải"
                  value={createForm.subject}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, subject: e.target.value }))}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Độ ưu tiên (SLA)</label>
              <CustomSelect
                options={PRIORITIES.map((p) => ({ value: p.id, label: p.label }))}
                value={createForm.priority}
                onChange={(val) => setCreateForm((prev) => ({ ...prev, priority: String(val) }))}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            {!isBugTicket && (
              <div className="form-group">
                <label className="form-label">Tiêu đề vấn đề (Subject) *</label>
                <input
                  className="form-input"
                  placeholder="Tóm tắt ngắn gọn vấn đề khách gặp phải"
                  value={createForm.subject}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, subject: e.target.value }))}
                />
              </div>
            )}

            <div className="form-group" style={isBugTicket ? { gridColumn: '1 / -1' } : undefined}>
              <label className="form-label">Nhân viên liên quan (Tag)</label>
              <CustomSelect
                searchable
                showAvatars
                placeholder="Chọn nhân viên để tag..."
                options={safeUsers
                  .filter((u: any) => !createForm.related_users.includes(String(u.id)))
                  .map((u: any) => ({
                    value: String(u.id),
                    label: u.full_name,
                    avatar: u.avatar_url,
                  }))}
                value=""
                onChange={(val) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    related_users: [...prev.related_users, String(val)],
                  }))
                }
              />
            </div>
          </div>

          {createForm.related_users.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {createForm.related_users.map((uid) => {
                const u = safeUsers.find((x: any) => String(x.id) === uid);
                return (
                  <div
                    key={uid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '4px 10px 4px 8px',
                      background: '#fef2f2',
                      border: '1px solid rgba(189, 29, 45, 0.2)',
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#BD1D2D',
                    }}
                  >
                    <Avatar src={u?.avatar_url} name={u?.full_name || uid} size={20} />
                    <span>{u?.full_name || uid}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setCreateForm((prev) => ({
                          ...prev,
                          related_users: prev.related_users.filter((id) => id !== uid),
                        }))
                      }
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#BD1D2D', display: 'flex' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!isBugTicket && (
            <>
              <div className="form-group">
                <label className="form-label">Khách hàng liên quan khác (Tag)</label>
                <CustomSelect
                  searchable
                  showAvatars
                  placeholder="Chọn khách hàng để tag..."
                  onSearchChange={(q) => fetchContactsOnDemand(q)}
                  options={safeContacts
                    .filter((c: any) => !createForm.related_contacts.includes(String(c.id)))
                    .map((c: any) => ({
                      value: String(c.id),
                      label: String(c.full_name || c.name || '').trim() || `#${c.id}`,
                      sublabel: c.phone || c.email,
                      avatar: c.avatar_url,
                    }))}
                  value=""
                  onChange={(val) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      related_contacts: [...prev.related_contacts, String(val)],
                    }))
                  }
                />
              </div>
              {createForm.related_contacts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {createForm.related_contacts.map((cid) => {
                    const c = safeContacts.find((x: any) => String(x.id) === cid);
                    return (
                      <div
                        key={cid}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '4px 10px 4px 8px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: '#0f172a',
                        }}
                      >
                        <Avatar src={c?.avatar_url} name={c ? c.full_name || '' : cid} size={20} />
                        <span>{c ? c.full_name || c.name : cid}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setCreateForm((prev) => ({
                              ...prev,
                              related_contacts: prev.related_contacts.filter((id) => id !== cid),
                            }))
                          }
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', display: 'flex' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="form-group">
            <label className="form-label">Mô tả chi tiết</label>
            <textarea
              className="form-input"
              placeholder="Nhập chi tiết về lỗi hoặc yêu cầu hỗ trợ..."
              rows={4}
              value={createForm.description}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
              style={{ resize: 'none' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Ảnh chụp màn hình / Tài liệu đính kèm (Nhấn Ctrl+V để dán)</label>
            <PasteDropzoneArea
              compact={true}
              placeholder="Kéo thả tệp hoặc nhấn Ctrl+V để dán ảnh màn hình lỗi"
              subtext="Chụp ảnh màn hình lỗi (Ctrl+V) dán trực tiếp tại đây"
              onConfirmUpload={async (item) => {
                if (dropzoneUploadInFlightRef.current) return;
                if (item.file) {
                  if (FORBIDDEN_UPLOAD_EXT.test(item.file.name)) {
                    addToast(`Định dạng tệp "${item.file.name}" bị chặn vì lý do bảo mật`, 'error');
                    return;
                  }
                  if (item.file.size > MAX_UPLOAD_BYTES) {
                    addToast(`Tệp "${item.file.name}" vượt quá giới hạn 50MB`, 'error');
                    return;
                  }
                  dropzoneUploadInFlightRef.current = true;
                  const fd = new FormData();
                  fd.append('file', item.file);
                  try {
                    const res = await api.post('/upload', fd);
                    const safeUrl = normalizeMediaUrl(res.data?.data?.url || res.data?.url);
                    if (safeUrl) {
                      setCreateForm((prev) => ({
                        ...prev,
                        attachments: [
                          ...prev.attachments,
                          {
                            name: item.label || item.file?.name || 'Tệp đính kèm',
                            url: safeUrl,
                            size: item.file?.size,
                            type: item.file?.type,
                          },
                        ],
                      }));
                    } else {
                      addToast('URL tệp tải lên không hợp lệ', 'error');
                    }
                  } catch (err: any) {
                    addToast(err?.response?.data?.message || 'Lỗi khi tải lên tệp đính kèm', 'error');
                  } finally {
                    dropzoneUploadInFlightRef.current = false;
                  }
                } else if (item.url) {
                  const safeUrl = normalizeMediaUrl(item.url);
                  if (!safeUrl) {
                    addToast('URL đính kèm không hợp lệ hoặc bị chặn bảo mật', 'error');
                    return;
                  }
                  setCreateForm((prev) => ({
                    ...prev,
                    attachments: [
                      ...prev.attachments,
                      {
                        name: item.label || 'Tệp đính kèm',
                        url: safeUrl,
                      },
                    ],
                  }));
                }
              }}
            />

            {createForm.attachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                {createForm.attachments.map((att, idx) => {
                  const safeUrl = normalizeMediaUrl(att.url);
                  if (!safeUrl) return null;
                  const isImg =
                    /\.(jpeg|jpg|png|gif|webp)(\?.*)?$/i.test(safeUrl) ||
                    (att.type && /^image\/(png|jpeg|jpg|gif|webp)$/i.test(att.type));
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 10px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                      }}
                    >
                      {isImg ? (
                        <img
                          src={safeUrl}
                          alt={att.name}
                          style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' }}
                        />
                      ) : (
                        <FileText size={18} style={{ color: '#BD1D2D' }} />
                      )}
                      <span
                        style={{
                          maxWidth: '160px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: 600,
                          color: '#0f172a',
                        }}
                      >
                        {att.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCreateForm((prev) => ({
                            ...prev,
                            attachments: prev.attachments.filter((_, i) => i !== idx),
                          }))
                        }
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          color: '#dc2626',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '2px',
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            style={{
              paddingTop: '1rem',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <button type="button" className="btn outline" onClick={handleCloseCreateModal} disabled={saving}>
              Hủy bỏ
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={handleCreateTicket}
              disabled={saving}
              style={{ background: '#BD1D2D', borderColor: '#BD1D2D', fontWeight: 700 }}
            >
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              <span>{saving ? 'Đang tạo...' : 'Tạo Ticket'}</span>
            </button>
          </div>
        </div>
      </CustomModal>
      )}

      {Boolean(selectedTicket) && (
        <Suspense fallback={null}>
          <TicketDrawer
            key={selectedTicket?.id ? `ticket-drawer-${selectedTicket.id}` : 'ticket-drawer-empty'}
            isOpen={Boolean(selectedTicket)}
            onClose={() => setSelectedTicket(null)}
            ticket={selectedTicket}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            contacts={safeContacts}
            users={safeUsers}
            onOpenContact={(contactData) => setSelectedContactForDrawer(contactData)}
          />
        </Suspense>
      )}

      {selectedContactForDrawer && (
        <Suspense fallback={null}>
          <CustomerProfileDrawer
            isOpen={Boolean(selectedContactForDrawer)}
            onClose={() => setSelectedContactForDrawer(null)}
            contact={selectedContactForDrawer}
          />
        </Suspense>
      )}
    </div>
  );
};

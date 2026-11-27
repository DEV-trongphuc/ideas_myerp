import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { Plus, CheckCircle2, Clock, Phone, Mail, Users, Calendar, AlignLeft, X, Loader2, Pencil, Trash2, RefreshCw, Link2, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar } from '../components/ui/Avatar';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/uiStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { Pagination } from '../components/ui/Pagination';
import api from '../api/axios';
const CustomerProfileDrawer = lazy(() => import('./CustomerProfileDrawer').then(module => ({ default: module.CustomerProfileDrawer })));
const WorkspaceTaskDrawer = lazy(() => import('./WorkspaceTaskDrawer').then(module => ({ default: module.WorkspaceTaskDrawer })));
import { useDebounce } from '../hooks/useDebounce';
import { CustomSelect } from '../components/ui/CustomSelect';
import { CalendarView } from '../components/CalendarView';
import { LayoutList } from 'lucide-react';
import { CustomModal } from '../components/ui/CustomModal';
import { useAuth } from '../contexts/AuthContext';
import { MentionInput } from '../components/ui/MentionInput';
import { extractArray } from '../utils/safeArray';
import { isManagement, normalizeRole } from '../utils/roleUtils';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';

const PAGE_SIZE = 10;

const TYPES = ['call', 'zalo_connect', 'email', 'meeting', 'task', 'note'];
const T_LABEL: Record<string, string> = { call: 'Cuộc gọi', zalo_connect: 'Zalo', email: 'Email', meeting: 'Gặp gỡ', task: 'Task', note: 'Ghi chú' };
const T_ICON: Record<string, React.ReactNode> = {
  call: <Phone size={14} />,
  zalo_connect: <img src="https://stc-zpl.zdn.vn/favicon.ico" style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '3px' }} alt="Zalo" />,
  email: <Mail size={14} />,
  meeting: <Users size={14} />,
  task: <CheckCircle2 size={14} />,
  note: <AlignLeft size={14} />
};
const T_COLOR: Record<string, string> = { call: '#BD1D2D', zalo_connect: '#0084FF', email: '#334155', meeting: '#C6333D', task: '#475569', note: '#64748B' };

const EMPTY = { type: 'task', subject: '', status: 'planned', priority: 'medium', due_date: '', related_type: '', related_id: '', body: '', auto_trigger: false };

const parseServerDate = (d: any): Date | null => {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const raw = String(d).trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw) ? raw.replace(' ', 'T') : raw;
  const dt = new Date(normalized);
  return isNaN(dt.getTime()) ? null : dt;
};

const toLocalDatetimeInput = (d: any): string => {
  const dt = parseServerDate(d);
  if (!dt) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const fmtDate = (d: string | null) => {
  if (!d) return null;
  const dt = parseServerDate(d);
  if (!dt) return '—';
  const now = new Date();
  const diffMs = dt.getTime() - now.getTime();
  const diffH = Math.round(diffMs / 3600000);
  if (Math.abs(diffH) < 1) return 'Trong giờ này';
  if (diffH < 0 && diffH > -24) return `${Math.abs(diffH)}h trước`;
  if (diffH > 0 && diffH < 24) return `Còn ${diffH}h`;
  return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const getDisplayBody = (bodyStr: string) => {
  if (!bodyStr) return '';
  const trimmed = bodyStr.trim();
  if (trimmed.startsWith('{"erp_task":')) {
    try {
      const parsed = JSON.parse(trimmed);
      return parsed.erp_task?.description || '';
    } catch (e) {
      return bodyStr;
    }
  }
  return bodyStr;
};

export const ActivitiesPage: React.FC = () => {
  const { user } = useAuth();
  const { addToast, showConfirm, closeConfirm } = useUIStore(useShallow((s) => ({ addToast: s.addToast, showConfirm: s.showConfirm, closeConfirm: s.closeConfirm })));
  const navigate = useNavigate();
  const activitiesPageSize = Math.max(5, Number(useTypedSubSetting('crm.ui_list_page_sizes_and_limits', 'activities', PAGE_SIZE)) || PAGE_SIZE);
  const defaultSlotTime = String(useTypedSubSetting('crm.calls_and_meetings_policy', 'slot_time', '09:00') || '09:00');
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTeamId, setFilterTeamId] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [teamsList, setTeamsList] = useState<any[]>([]);
  const [consultantsList, setConsultantsList] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [editingErpTask, setEditingErpTask] = useState<any>(null);
  const debouncedSearch = useDebounce(search.trim(), 300);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [profileContact, setProfileContact] = useState<any>(null);
  const [selectedTaskForDrawer, setSelectedTaskForDrawer] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  const activitiesAbortRef = useRef<AbortController | null>(null);
  const contactDrawerAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const actionInFlightRef = useRef<Set<number>>(new Set());

  const canFilterAllStaff = useMemo(() => {
    const role = normalizeRole(user);
    return isManagement(user) || ['sale_admin', 'saleadmin', 'assistant', 'tro_ly'].includes(role);
  }, [user]);

  const openContactDrawer = async (contactId: number) => {
    if (contactDrawerAbortRef.current) {
      contactDrawerAbortRef.current.abort();
    }
    const controller = new AbortController();
    contactDrawerAbortRef.current = controller;
    const { signal } = controller;

    try {
      const res = await api.get(`/contacts/${contactId}`, { signal });
      if (signal.aborted) return;
      if (res.data?.success || res.data) {
        setProfileContact(res.data?.data || res.data);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || signal.aborted) return;
      addToast('Không thể tải thông tin khách hàng', 'error');
    }
  };

  // Related entities for dropdown
  const [contacts, setContacts] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);

  useEffect(() => {
    if (!showModal) return;
    const controller = new AbortController();
    const { signal } = controller;
    api.get('/contacts', { params: { limit: 1000 }, signal }).then(r => { if (!signal.aborted) setContacts(extractArray(r?.data)); }).catch(() => {});
    api.get('/deals', { params: { limit: 1000 }, signal }).then(r => { if (!signal.aborted) setDeals(extractArray(r?.data)); }).catch(() => {});
    api.get('/companies', { params: { limit: 1000 }, signal }).then(r => { if (!signal.aborted) setCompanies(extractArray(r?.data)); }).catch(() => {});
    return () => controller.abort();
  }, [showModal]);

  useEffect(() => {
    if (!canFilterAllStaff) return;
    const controller = new AbortController();
    const { signal } = controller;
    api.get('/teams', { signal }).then(r => { if (!signal.aborted) setTeamsList(extractArray(r?.data)); }).catch(() => {});
    api.get('/get_consultants', { signal }).then(r => { if (!signal.aborted) setConsultantsList(extractArray(r?.data)); }).catch(() => {});
    return () => controller.abort();
  }, [canFilterAllStaff]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    api.get('/users?all=1', { signal }).then(r => {
      if (signal.aborted) return;
      const list = extractArray<any>(r?.data);
      const team = list.map((u: any) => ({
        ...u,
        id: u.id,
        full_name: u.full_name || u.name || u.username || '',
        avatar_url: u.avatar_url || u.avatar || '',
        role: u.role || 'sale'
      }));
      setUsers(team);
    }).catch(() => {});
    return () => controller.abort();
  }, [user?.id]);

  const teamOptions = useMemo(() => {
    return [
      { value: '', label: 'Tất cả Nhóm' },
      ...teamsList.map(t => ({ value: String(t.id), label: t.name, avatar: undefined }))
    ];
  }, [teamsList]);

  const consultantOptions = useMemo(() => {
    return [
      { value: '', label: 'Tất cả Nhân viên' },
      ...consultantsList.map(u => ({ value: String(u.id), label: u.name || u.full_name, avatar: (u as any).avatar || (u as any).avatar_url }))
    ];
  }, [consultantsList]);

  const getRelatedOptions = () => {
    if (form.related_type === 'contact') {
      return contacts.map(c => ({
        value: c.id,
        label: c.full_name || c.name || `Khách hàng #${c.id}`,
        sublabel: c.phone || c.email,
        avatar: c.avatar_url || c.avatar
      }));
    }
    if (form.related_type === 'deal') {
      return deals.map(d => ({
        value: d.id,
        label: d.title || d.name || `Deal #${d.id}`,
        sublabel: d.value ? `${Number(d.value || 0).toLocaleString()} đ` : ''
      }));
    }
    if (form.related_type === 'company') {
      return companies.map(c => ({
        value: c.id,
        label: c.name || `Đối tác #${c.id}`,
        sublabel: c.industry
      }));
    }
    return [];
  };

  const fetchActivities = useCallback(async () => {
    if (activitiesAbortRef.current) {
      activitiesAbortRef.current.abort();
    }
    const controller = new AbortController();
    activitiesAbortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    try {
      const params: any = { page, limit: activitiesPageSize, search: debouncedSearch };
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      if (filterTeamId) params.team_id = filterTeamId;
      if (filterUserId) params.user_id = filterUserId;
      
      const r = await api.get('/activities', { params, signal });
      if (signal.aborted) return;
      const list = extractArray<any>(r?.data, 'items');
      const totalVal = Number(r?.data?.data?.total ?? r?.data?.total ?? list.length);
      setItems(list);
      setTotal(isNaN(totalVal) ? list.length : totalVal);
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED' || signal.aborted) return;
      addToast(e?.response?.data?.message || 'Không thể tải danh sách hoạt động', 'error');
      setItems([]);
      setTotal(0);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [filterType, filterStatus, filterTeamId, filterUserId, debouncedSearch, page, activitiesPageSize]);

  useEffect(() => {
    fetchActivities();
    return () => {
      activitiesAbortRef.current?.abort();
      contactDrawerAbortRef.current?.abort();
    };
  }, [fetchActivities]);

  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/activities')) return;
    const urlParams = new URLSearchParams(location.search);
    const targetId = urlParams.get('id') || urlParams.get('activity_id');
    if (!targetId) return;
    const aid = Number(targetId);
    if (!aid) return;
    const controller = new AbortController();
    api.get(`/activities/${aid}`, { signal: controller.signal }).then(res => {
      if (controller.signal.aborted) return;
      const actData = res.data?.data || res.data;
      if (actData && actData.id) {
        openEdit(actData);
        const newParams = new URLSearchParams(location.search);
        newParams.delete('id');
        newParams.delete('activity_id');
        const nextSearch = newParams.toString();
        navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
      }
    }).catch(err => {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || controller.signal.aborted) return;
      addToast('Không thể tải chi tiết hoạt động', 'error');
    });
    return () => controller.abort();
  }, [location.pathname, location.search]);

  useEffect(() => {
    setPage(1);
  }, [filterType, filterStatus]);

  const openCreate = () => { 
    setEditItem(null); 
    setEditingErpTask(null);
    setForm(EMPTY); 
    setShowModal(true); 
  };

  const openEdit = (a: any) => {
    if (a.type === 'task') {
      setSelectedTaskForDrawer(a);
      return;
    }
    setEditItem(a);
    let displayBody = a.body || '';
    let erpTaskObj = null;
    
    if (displayBody.trim().startsWith('{"erp_task":')) {
      try {
        const parsed = JSON.parse(displayBody);
        erpTaskObj = parsed.erp_task;
        displayBody = erpTaskObj?.description || '';
      } catch (e) {}
    }
    
    setEditingErpTask(erpTaskObj);
    setForm({ 
      ...a, 
      due_date: toLocalDatetimeInput(a.due_date),
      body: displayBody 
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (inFlightRef.current || saving) return;
    if (!form.subject.trim()) { addToast('Nhập tiêu đề hoạt động', 'error'); return; }
    inFlightRef.current = true;
    setSaving(true);
    try {
      let finalBody = form.body;
      if (editingErpTask) {
        finalBody = JSON.stringify({
          erp_task: {
            ...editingErpTask,
            description: form.body
          }
        });
      }
      const formattedDueDate = form.due_date ? String(form.due_date).replace('T', ' ') : null;
      const payload = { ...form, due_date: formattedDueDate, body: finalBody };

      if (editItem) {
        await api.put(`/activities/${editItem.id}`, payload);
        addToast('Đã cập nhật hoạt động', 'success');
      } else {
        await api.post('/activities', payload);
        addToast('Đã thêm hoạt động', 'success');
      }
      setShowModal(false);
      setCalendarRefreshKey(k => k + 1);
      fetchActivities();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi lưu hoạt động', 'error');
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  };

  const toggleDone = async (item: any) => {
    const id = Number(item.id);
    if (actionInFlightRef.current.has(id) || actionLoadingId === item.id) return;
    const newStatus = item.status === 'done' ? 'planned' : 'done';
    actionInFlightRef.current.add(id);
    setActionLoadingId(item.id);
    try {
      const res = await api.put(`/activities/${item.id}`, { status: newStatus, done_at: newStatus === 'done' ? new Date().toISOString() : null });
      const updated = res?.data?.data || res?.data || {};
      if (updated?.approval_status === 'pending') {
        addToast(res?.data?.message || 'Đã gửi yêu cầu phê duyệt hoàn thành công việc', 'info');
      }
      const nextStatus = updated?.status || newStatus;
      setItems(prev => prev.map(a => a.id === item.id ? { ...a, ...updated, status: nextStatus } : a));
      setCalendarRefreshKey(k => k + 1);
    } catch (e: any) {
      addToast(e?.response?.data?.message || 'Lỗi khi cập nhật trạng thái', 'error');
    } finally {
      actionInFlightRef.current.delete(id);
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (actItem: any) => {
    const id = Number(actItem.id);
    if (actionInFlightRef.current.has(id)) return;
    showConfirm({
      title: 'Xóa hoạt động?',
      message: `Bạn có chắc chắn muốn xóa hoạt động "${actItem.subject}"?`,
      isDanger: true,
      onConfirm: async () => {
        if (actionInFlightRef.current.has(id)) return;
        actionInFlightRef.current.add(id);
        try {
          await api.delete(`/activities/${actItem.id}`);
          setItems(prev => prev.filter(a => a.id !== actItem.id));
          setTotal(prev => Math.max(0, prev - 1));
          setCalendarRefreshKey(k => k + 1);
          addToast('Đã xóa hoạt động thành công', 'success');
        } catch (e: any) {
          addToast(e.response?.data?.message || 'Lỗi khi xóa hoạt động', 'error');
        } finally {
          actionInFlightRef.current.delete(id);
          closeConfirm();
        }
      }
    });
  };

  const navigateToRelated = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.related_type || !item.related_id) return;
    const relId = Number(item.related_id);
    if (item.related_type === 'contact') {
      openContactDrawer(relId);
    } else if (item.related_type === 'company') {
      window.dispatchEvent(new CustomEvent('open-company-drawer', { detail: { id: relId } }));
    } else if (item.related_type === 'deal') {
      navigate(`/deals?open_deal_id=${relId}`);
    }
  };

  const doneCount = useMemo(() => items.filter(a => a.status === 'done').length, [items]);
  const counts = useMemo(() => TYPES.reduce((acc, t) => ({ ...acc, [t]: items.filter(a => a.type === t).length }), {} as Record<string, number>), [items]);
  const filteredActivities = items;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hoạt động & Lịch</h1>
          <p className="page-subtitle" style={{ fontVariantNumeric: 'tabular-nums' }}>{loading ? '...' : `${doneCount}/${total} đã hoàn thành`}</p>
        </div>
        <div className="flex gap-2">
          <div style={{ display: 'inline-flex', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '3px', marginRight: '0.5rem', gap: '2px', alignItems: 'center' }}>
            <button 
              type="button"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px', borderRadius: '7px', fontSize: '0.84rem', fontWeight: viewMode === 'list' ? 700 : 600, background: viewMode === 'list' ? '#ffffff' : 'transparent', color: viewMode === 'list' ? '#BD1D2D' : '#64748b', boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), color 0.2s cubic-bezier(0.22, 1, 0.36, 1)', border: 'none', cursor: 'pointer', height: 32 }}
              onClick={() => setViewMode('list')}
            >
              <LayoutList size={15} /> Danh sách
            </button>
            <button 
              type="button"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px', borderRadius: '7px', fontSize: '0.84rem', fontWeight: viewMode === 'calendar' ? 700 : 600, background: viewMode === 'calendar' ? '#ffffff' : 'transparent', color: viewMode === 'calendar' ? '#BD1D2D' : '#64748b', boxShadow: viewMode === 'calendar' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), color 0.2s cubic-bezier(0.22, 1, 0.36, 1)', border: 'none', cursor: 'pointer', height: 32 }}
              onClick={() => setViewMode('calendar')}
            >
              <Calendar size={15} /> Lịch biểu
            </button>
          </div>
          <button className="btn-icon" onClick={() => { fetchActivities(); setCalendarRefreshKey(k => k + 1); }} title="Làm mới"><RefreshCw size={18} /></button>
          <button className="btn primary" onClick={openCreate}><Plus size={16} /> Thêm hoạt động</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="filter-search" style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
          <input placeholder="Tìm nội dung hoạt động..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ paddingRight: '2rem' }} />
          <div style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
            <AnimatePresence>
              {search && (
                <motion.button 
                  initial={{ opacity: 0, scale: 0.8 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  className="btn-icon-bare" 
                  onClick={() => { setSearch(''); setPage(1); }} 
                  style={{ padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Xóa tìm kiếm"
                >
                  <X size={14} style={{ color: 'var(--color-text-muted)' }}/>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {canFilterAllStaff && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', minWidth: 0, maxWidth: '100%' }}>
            <div style={{ flex: '1 1 150px', minWidth: '140px' }}>
              <CustomSelect
                options={teamOptions}
                value={filterTeamId}
                onChange={val => { setFilterTeamId(val.toString()); setPage(1); }}
                placeholder="Lọc theo Nhóm"
                width="100%"
              />
            </div>
            <div style={{ flex: '1 1 150px', minWidth: '140px' }}>
              <CustomSelect
                options={consultantOptions}
                value={filterUserId}
                onChange={val => { setFilterUserId(val.toString()); setPage(1); }}
                placeholder="Lọc theo Nhân viên"
                width="100%"
                showAvatars
                searchable
                align="right"
              />
            </div>
          </div>
        )}

        {/* Quick filter chips */}
        <div className="no-scrollbar" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '4px' }}>
          {TYPES.map(t => (
            <button key={t} onClick={() => setFilterType(filterType === t ? '' : t)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: filterType === t ? T_COLOR[t] : 'var(--color-surface)', color: filterType === t ? 'white' : 'var(--color-text)', border: `1px solid ${filterType === t ? T_COLOR[t] : 'var(--color-border)'}`, borderRadius: 'var(--radius-full)', fontSize: '0.8125rem', fontWeight: 600, whiteSpace: 'nowrap', transition: 'background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), color 0.2s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s cubic-bezier(0.22, 1, 0.36, 1)', cursor: 'pointer' }}>
              <span style={{ color: filterType === t ? 'white' : T_COLOR[t] }}>{T_ICON[t]}</span>
              {T_LABEL[t]} <span style={{ opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>({counts[t] || 0})</span>
            </button>
          ))}
          <button onClick={() => setFilterStatus(filterStatus === 'done' ? '' : 'done')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: filterStatus === 'done' ? '#0f172a' : 'var(--color-surface)', color: filterStatus === 'done' ? 'white' : 'var(--color-text)', border: `1px solid ${filterStatus === 'done' ? '#0f172a' : 'var(--color-border)'}`, borderRadius: 'var(--radius-full)', fontSize: '0.8125rem', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' }}>
            <CheckCircle2 size={14} /> Đã xong
          </button>
        </div>
      </div>

      {/* Skeleton */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      )}

      {/* Reminders Section */}
      <AnimatePresence>
        {!loading && items.some(a => {
          if (a.status !== 'planned') return false;
          const dt = parseServerDate(a.due_date);
          return dt !== null && dt.toDateString() === new Date().toDateString();
        }) && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ marginBottom: '1.25rem', overflow: 'hidden' }}
          >
            <div className="card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={16} />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Tiêu điểm hôm nay</h3>
              </div>
              <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
                {items.filter(a => {
                  if (a.status !== 'planned') return false;
                  const dt = parseServerDate(a.due_date);
                  return dt !== null && dt.toDateString() === new Date().toDateString();
                }).map(rem => {
                  const remDate = parseServerDate(rem.due_date);
                  return (
                    <div 
                      key={rem.id} 
                      onClick={() => openEdit(rem)}
                      style={{ minWidth: 220, padding: '14px 16px', background: 'var(--color-surface)', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', cursor: 'pointer', transition: 'border-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ color: T_COLOR[rem.type] }}>{T_ICON[rem.type]}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {remDate ? remDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }}>{rem.subject}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                         <Avatar name={rem.user_name} src={rem.user_avatar} size="sm" />
                         <span style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>Phụ trách: {rem.user_name?.split(' ').pop() || 'Bạn'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Activities list or Calendar */}
      {!loading && (
        <div style={{ height: viewMode === 'calendar' ? 'calc(100vh - 280px)' : 'auto' }}>
          {viewMode === 'calendar' ? (
            <CalendarView 
              filterType={filterType}
              filterStatus={filterStatus}
              filterTeamId={filterTeamId}
              filterUserId={filterUserId}
              search={debouncedSearch}
              refreshTrigger={calendarRefreshKey}
              onEventClick={openEdit} 
              onDateClick={(dateStr) => {
                setEditItem(null);
                setEditingErpTask(null);
                setForm({ ...EMPTY, due_date: `${dateStr}T${defaultSlotTime}` });
                setShowModal(true);
              }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {(() => {
                const filtered = filteredActivities;
                if (filtered.length === 0) return (
                  <div className="empty-state card">
                    <Calendar size={40} />
                    <h3>Không có hoạt động</h3>
                    <p>Thêm hoạt động mới để bắt đầu theo dõi công việc</p>
                    <button className="btn primary" style={{ marginTop: '1rem' }} onClick={openCreate}><Plus size={16} /> Thêm hoạt động</button>
                  </div>
                );

                const now = new Date();
                
                // Deduplicate logic for Overdue items if they are identical
                const overdueItems = filtered.filter(a => {
                  if (a.status !== 'planned') return false;
                  const dueDt = parseServerDate(a.due_date);
                  return dueDt !== null && dueDt < now;
                });
                const dedupedOverdue = overdueItems.reduce((acc: any[], curr) => {
                  const currTime = parseServerDate(curr.due_date)?.getTime();
                  const isDuplicate = acc.find(item => 
                    (curr.id && item.id === curr.id) || (
                      !curr.id &&
                      item.subject === curr.subject && 
                      item.type === curr.type && 
                      item.related_type === curr.related_type &&
                      item.related_id === curr.related_id &&
                      parseServerDate(item.due_date)?.getTime() === currTime
                    )
                  );
                  if (!isDuplicate) acc.push(curr);
                  return acc;
                }, []);

                const groups: Record<string, any[]> = {
                  'Quá hạn': dedupedOverdue,
                  'Hôm nay': filtered.filter(a => {
                    if (a.status !== 'planned') return false;
                    const dueDt = parseServerDate(a.due_date);
                    return dueDt !== null && dueDt >= now && dueDt.toDateString() === now.toDateString();
                  }),
                  'Sắp tới': filtered.filter(a => {
                    if (a.status !== 'planned') return false;
                    const dueDt = parseServerDate(a.due_date);
                    return !dueDt || (dueDt > now && dueDt.toDateString() !== now.toDateString());
                  }),
                  'Đã hoàn thành': filtered.filter(a => a.status === 'done'),
                };

                return Object.entries(groups).map(([label, groupItems]) => {
                  if (groupItems.length === 0) return null;
                  return (
                    <div key={label}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <h4 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: label === 'Quá hạn' ? '#BD1D2D' : '#64748b', letterSpacing: '0.05em' }}>{label}</h4>
                        <div style={{ flex: 1, height: 1, background: 'var(--color-border-light)' }} />
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{groupItems.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                        <AnimatePresence>
                          {groupItems.map(act => {
                            const actDue = parseServerDate(act.due_date);
                            const isActOverdue = act.status !== 'done' && actDue !== null && actDue < now;
                            return (
                             <motion.div key={act.id} className="card"
                               initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} layout
                               onClick={() => openEdit(act)}
                               style={{ cursor: 'pointer', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', transition: 'background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s cubic-bezier(0.22, 1, 0.36, 1)' }}>
                              
                              <div style={{ width: 36, height: 36, borderRadius: '10px', background: (act.type === 'call' || act.type === 'meeting') ? 'rgba(189, 29, 45, 0.08)' : '#f1f5f9', color: act.type === 'zalo_connect' ? '#0084FF' : (act.type === 'call' || act.type === 'meeting' ? '#BD1D2D' : '#334155'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {T_ICON[act.type]}
                              </div>

                              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <p style={{ fontWeight: 700, fontSize: '0.9rem', textDecoration: act.status === 'done' ? 'line-through' : 'none', color: act.status === 'done' ? 'var(--color-text-muted)' : 'var(--color-text)', margin: 0 }}>
                                    {act.subject}
                                  </p>
                                  {isActOverdue && (
                                    <span className="badge danger sm" style={{ fontSize: '0.65rem', padding: '1px 6px', fontWeight: 700 }}>QUÁ HẠN</span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Avatar name={act.user_name || 'Bạn'} src={act.user_avatar} size="sm" />
                                    <span style={{ fontWeight: 500 }}>{act.user_name || 'Bạn'}</span>
                                  </span>
                                  {act.due_date && (
                                    <span style={{ fontSize: '0.75rem', color: isActOverdue ? '#BD1D2D' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                                      <Clock size={12} />
                                      {fmtDate(act.due_date)}
                                    </span>
                                  )}
                                  <span className={`badge ${act.priority === 'high' ? 'danger' : act.priority === 'medium' ? 'warning' : 'info'}`} style={{ fontSize: '0.65rem', fontWeight: 600 }}>
                                    {act.priority === 'high' ? 'Quan trọng' : act.priority === 'medium' ? 'Bình thường' : 'Thấp'}
                                  </span>
                                  {act.related_type && (
                                    <button onClick={e => navigateToRelated(act, e)}
                                      style={{ fontSize: '0.75rem', color: '#BD1D2D', display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                                      <Link2 size={12} />
                                      {act.related_type === 'contact' ? (act.contact_name || act.related_name || act.contact_id || act.related_id) : 
                                       act.related_type === 'company' ? (act.company_name || act.related_name || act.company_id || act.related_id) : 
                                       act.related_type === 'deal' ? (act.deal_name || act.related_name || act.deal_id || act.related_id) : act.related_id}
                                    </button>
                                  )}
                                </div>
                                {getDisplayBody(act.body) && (
                                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '600px' }}>
                                    {getDisplayBody(act.body)}
                                  </p>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); toggleDone(act); }}
                                  disabled={actionLoadingId === act.id}
                                  title={act.status === 'done' ? 'Đánh dấu chưa xong' : 'Đánh dấu hoàn thành'}
                                  style={{ 
                                    width: 28, 
                                    height: 28, 
                                    borderRadius: '8px', 
                                    border: `1px solid ${act.status === 'done' ? 'var(--color-success)' : 'var(--color-border)'}`, 
                                    background: act.status === 'done' ? 'var(--color-success-light)' : 'transparent', 
                                    color: act.status === 'done' ? 'var(--color-success)' : 'var(--color-text-muted)', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    cursor: actionLoadingId === act.id ? 'not-allowed' : 'pointer', 
                                    transition: 'background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), color 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                                    opacity: actionLoadingId === act.id ? 0.6 : 1
                                  }}
                                >
                                  {actionLoadingId === act.id ? <Loader2 size={13} className="spin" /> : <CheckCircle2 size={15} />}
                                </button>
                                <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); openEdit(act); }} style={{ padding: '6px' }}><Pencil size={13} /></button>
                                <button className="btn ghost sm" style={{ color: 'var(--color-danger)', padding: '6px' }} onClick={(e) => { e.stopPropagation(); handleDelete(act); }}><Trash2 size={13} /></button>
                              </div>
                            </motion.div>
                          );
                        })}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > activitiesPageSize && (
        <div className="card" style={{ marginTop: '0.5rem' }}>
          <Pagination total={total} page={page} pageSize={activitiesPageSize} onChange={setPage} />
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
      <CustomModal
        isOpen={showModal}
        onClose={() => !saving && setShowModal(false)}
        title={editItem ? 'Sửa hoạt động' : 'Thêm hoạt động'}
        width={640}
        disableClose={saving}
        preventCloseOnBackdrop={saving}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Type selector */}
          <div className="form-group">
            <label className="form-label">Loại hoạt động</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.625rem' }}>
              {TYPES.map(t => (
                <button 
                  key={t} type="button"
                  onClick={() => setForm({ ...form, type: t })}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                    padding: '12px 0', borderRadius: '10px', cursor: 'pointer',
                    background: form.type === t ? `${T_COLOR[t]}12` : 'var(--color-bg-alt)',
                    border: form.type === t ? `1px solid ${T_COLOR[t]}` : '1px solid var(--color-border)',
                    color: form.type === t ? T_COLOR[t] : 'var(--color-text-muted)',
                    fontWeight: form.type === t ? 700 : 500, transition: 'background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), color 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                    outline: 'none'
                  }}
                >
                  <div>
                    {T_ICON[t]}
                  </div>
                  <span style={{ fontSize: '0.8125rem' }}>{T_LABEL[t]}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Tiêu đề *</label>
              <input className="form-input" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="VD: Gọi điện chốt sale, Họp demo..." autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Trạng thái</label>
              <div style={{ 
                display: 'flex', 
                background: '#f1f5f9', 
                borderRadius: '10px', 
                padding: '3px', 
                border: '1px solid #e2e8f0',
                height: 40,
                alignItems: 'center',
                gap: '2px'
              }}>
                <button 
                  type="button" 
                  style={{ 
                    flex: 1, 
                    height: '32px',
                    border: 'none', 
                    borderRadius: '7px', 
                    padding: '0 12px', 
                    fontSize: '0.8125rem', 
                    fontWeight: form.status === 'planned' ? 700 : 600, 
                    cursor: 'pointer', 
                    transition: 'background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), color 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                    background: form.status === 'planned' ? '#ffffff' : 'transparent',
                    color: form.status === 'planned' ? 'var(--color-primary)' : '#64748b',
                    boxShadow: form.status === 'planned' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    outline: 'none'
                  }} 
                  onClick={() => setForm({...form, status: 'planned'})}
                >
                  Kế hoạch
                </button>
                <button 
                  type="button" 
                  style={{ 
                    flex: 1, 
                    height: '32px',
                    border: 'none', 
                    borderRadius: '7px', 
                    padding: '0 12px', 
                    fontSize: '0.8125rem', 
                    fontWeight: form.status === 'done' ? 700 : 600, 
                    cursor: 'pointer', 
                    transition: 'background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), color 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
                    background: form.status === 'done' ? '#ffffff' : 'transparent',
                    color: form.status === 'done' ? '#BD1D2D' : '#64748b',
                    boxShadow: form.status === 'done' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    outline: 'none'
                  }} 
                  onClick={() => setForm({...form, status: 'done'})}
                >
                  Đã xong
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label">Thời gian</label>
              <input className="form-input" type="datetime-local" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Ưu tiên</label>
              <CustomSelect 
                options={[
                  { value: 'low', label: 'Thấp' },
                  { value: 'medium', label: 'Trung bình' },
                  { value: 'high', label: 'Cao' }
                ]} 
                value={form.priority} 
                onChange={val => setForm({ ...form, priority: val.toString() })} 
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label">Liên kết đến</label>
              <CustomSelect 
                options={[
                  { value: '', label: 'Không có' },
                  { value: 'contact', label: 'Khách hàng' },
                  { value: 'deal', label: 'Deal' },
                  { value: 'company', label: 'Công ty' }
                ]} 
                value={form.related_type} 
                onChange={val => setForm({ ...form, related_type: val.toString(), related_id: '' })} 
              />
            </div>
            {form.related_type && (
              <div className="form-group">
                <label className="form-label">Chọn {form.related_type === 'contact' ? 'Khách hàng' : form.related_type === 'deal' ? 'Deal' : 'Công ty'}</label>
                <CustomSelect 
                  options={getRelatedOptions()} 
                  value={form.related_id} 
                  onChange={val => setForm({ ...form, related_id: val.toString() })} 
                  placeholder="Gõ để tìm kiếm..."
                  searchable={true}
                  showAvatars={form.related_type === 'contact'}
                />
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlignLeft size={14} /> Ghi chú chi tiết
            </label>
            <MentionInput 
              className="form-input" 
              rows={3} 
              placeholder="Nhập nội dung chi tiết của hoạt động (Sử dụng @ để tag user/sale)..."
              value={form.body || ''}
              onChange={e => setForm({ ...form, body: e.target.value })}
              style={{ resize: 'none' }}
            />
          </div>

          {/* Auto-Scoring & Stage Trigger Toggle */}
          <div 
            style={{
              background: 'rgba(189, 29, 45, 0.04)',
              border: '1px solid var(--color-primary-light)', borderRadius: '12px',
              padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer',
              marginTop: '4px'
            }}
            onClick={() => setForm({ ...form, auto_trigger: !form.auto_trigger })}
          >
            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)', boxShadow: 'var(--shadow-sm)', flexShrink: 0 }}>
              <Zap size={20} fill={form.auto_trigger ? 'var(--color-primary)' : 'none'} />
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '0.15rem' }}>
                Tự động cập nhật Điểm &amp; Giai đoạn CRM
              </h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.3 }}>
                Hệ thống sẽ tự động cập nhật Lead Score hoặc chuyển trạng thái giai đoạn CRM dựa trên hoạt động chăm sóc này.
              </p>
            </div>
            <div className={`custom-toggle ${form.auto_trigger ? 'active' : ''}`} style={{ zoom: 1.0 }}></div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--color-border)' }}>
          <button className="btn secondary" onClick={() => setShowModal(false)} disabled={saving}>Hủy</button>
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="spin" />}{editItem ? 'Lưu' : 'Thêm'}
          </button>
        </div>
      </CustomModal>
      )}

      {profileContact && (
        <Suspense fallback={null}>
          <CustomerProfileDrawer
            isOpen={!!profileContact}
            onClose={() => setProfileContact(null)}
            contact={profileContact}
            onUpdate={() => {}}
            zIndex={selectedTaskForDrawer ? 2147483638 : undefined}
          />
        </Suspense>
      )}

      {selectedTaskForDrawer && (
        <Suspense fallback={null}>
          <WorkspaceTaskDrawer
            isOpen={!!selectedTaskForDrawer}
            onClose={() => setSelectedTaskForDrawer(null)}
            task={selectedTaskForDrawer}
            zIndex={2147483632}
            onUpdate={(updatedTask?: any) => {
              if (updatedTask && updatedTask.id) {
                if (updatedTask.__duplicatedFromId || updatedTask.duplicated_from_id) {
                  const cleanClone = { ...updatedTask, comments: [], comment_count: 0 };
                  setSelectedTaskForDrawer(cleanClone);
                  setItems(prev => [cleanClone, ...prev.filter(it => Number(it.id) !== Number(cleanClone.id))]);
                } else {
                  setSelectedTaskForDrawer((prev: any) => prev ? { ...prev, ...updatedTask } : prev);
                  setItems(prev => prev.map(it => Number(it.id) === Number(updatedTask.id) ? { ...it, ...updatedTask } : it));
                }
              }
              setCalendarRefreshKey(k => k + 1);
              fetchActivities();
            }}
            users={users}
            onOpenContact={(contactId) => openContactDrawer(contactId)}
          />
        </Suspense>
      )}

    </div>
  );
};

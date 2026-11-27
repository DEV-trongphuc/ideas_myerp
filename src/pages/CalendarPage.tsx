import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, 
  Phone, Users, Video, FileText, CheckCircle2, Mail, AlignLeft, RefreshCw
} from 'lucide-react';
import api from '../api/axios';
import { useUIStore } from '../store/uiStore';
import { useAuth } from '../contexts/AuthContext';
import { CustomSelect } from '../components/ui/CustomSelect';
import { ActivityModal } from '../components/ui/ActivityModal';
import { extractArray } from '../utils/safeArray';
import { getLocalDateStr } from '../utils/dateUtils';
import { isAccountant, isExecutive, isManagement, normalizeRole } from '../utils/roleUtils';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';

const WorkspaceTaskDrawer = lazy(() => import('./WorkspaceTaskDrawer').then(m => ({ default: m.WorkspaceTaskDrawer })));
const AttendancePageInner = lazy(() => import('./AttendancePage').then(m => ({ default: m.AttendancePageInner })));

export const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const addToast = useUIStore(s => s.addToast);
  const { user } = useAuth();
  const calendarFetchLimit = Number(useTypedSubSetting('crm.ui_list_page_sizes_and_limits', 'calendar_fetch', 200)) || 200;
  const calendarCellMax = Math.max(1, Number(useTypedSubSetting('crm.ui_list_page_sizes_and_limits', 'calendar_cell_max', 3)) || 3);
  const defaultSlotTime = String(useTypedSubSetting('crm.calls_and_meetings_policy', 'slot_time', '09:00') || '09:00');
  const [activeTab, setActiveTab] = useState<'calendar' | 'attendance'>('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(() => user?.id ? String(user.id) : '');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const activitiesAbortRef = useRef<AbortController | null>(null);

  const canViewFinanceCalendar = useMemo(() => isAccountant(user, true), [user]);
  const canFilterUsers = useMemo(() => {
    const role = normalizeRole(user);
    return isExecutive(user) || isManagement(user) || ['sale_admin', 'saleadmin'].includes(role);
  }, [user]);
  const showTabs = useMemo(() => {
    const role = normalizeRole(user);
    return role !== 'accountant' && role !== 'viewer';
  }, [user]);

  const formatVND = (n: any) => {
    const num = Math.round(Number(n || 0));
    if (num >= 1e9) {
      return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(num / 1e9) + ' Tỷ';
    }
    if (num >= 1e6) {
      return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(num / 1e6) + ' Tr';
    }
    return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
  };

  const fetchActivities = useCallback(async () => {
    if (!user?.id) return;
    activitiesAbortRef.current?.abort();
    const controller = new AbortController();
    activitiesAbortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const lastDay = new Date(year, month + 1, 0).getDate();
      const startDayStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const startDate = `${startDayStr} 00:00:00`;
      const endDate = `${endDayStr} 23:59:59`;
      
      const params: any = {
        start_date: startDate,
        end_date: endDate,
        limit: calendarFetchLimit,
        type: 'task,meeting,call'
      };

      const activeUserId = selectedUserId || String(user.id);
      if (activeUserId && activeUserId !== 'all') {
        params.user_id = activeUserId;
      }

      const res = await api.get('/activities', { params, signal });
      if (signal.aborted) return;
      let fetched = extractArray<any>(res?.data, 'items');

      // Load PO & Deposits if user is accountant/executive
      if (canViewFinanceCalendar) {
        try {
          const [poRes, soRes] = await Promise.all([
            api.get('/purchase-orders', { params: { start_date: startDayStr, end_date: endDayStr, limit: 500 }, signal }).catch(() => ({ data: [] })),
            api.get('/deposits', { params: { start_date: startDayStr, end_date: endDayStr, limit: 500 }, signal }).catch(() => ({ data: [] }))
          ]);
          if (signal.aborted) return;

          const poList = extractArray<any>(poRes?.data, 'items');
          const soList = extractArray<any>(soRes?.data, 'items');

          const poEvents = poList
            .filter((po: any) => po.order_date && po.order_date >= startDayStr && po.order_date <= endDayStr)
            .map((po: any) => ({
              id: `po-${po.id}`,
              rawId: po.id,
              expense_id: po.expense_id,
              subject: `[PO] ${po.po_number || '#' + po.id} - ${po.supplier_name || 'NCC'} (${formatVND(po.total)})`,
              due_date: po.order_date,
              type: 'po',
              status: po.status === 'received' ? 'done' : 'planned'
            }));

          const soEvents = soList
            .filter((so: any) => so.created_at && String(so.created_at).substring(0, 10) >= startDayStr && String(so.created_at).substring(0, 10) <= endDayStr)
            .map((so: any) => ({
              id: `so-${so.id}`,
              rawId: so.id,
              subject: `[Cọc] ${so.unit_code || so.code || '#' + so.id} - ${so.full_name || so.customer_name || 'Khách'} (${formatVND(so.price ?? so.amount)})`,
              due_date: String(so.created_at).substring(0, 10),
              type: 'so',
              status: so.status === 'approved' ? 'done' : 'planned'
            }));

          fetched = [...fetched, ...poEvents, ...soEvents];
        } catch (e: any) {
          if (signal.aborted || e?.name === 'AbortError' || e?.name === 'CanceledError') return;
        }
      }

      if (!signal.aborted) {
        setActivities(fetched);
      }
    } catch (err: any) {
      if (signal.aborted || err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      addToast('Lỗi khi tải lịch làm việc', 'error');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [currentDate, selectedUserId, user?.id, canViewFinanceCalendar, calendarFetchLimit]);

  useEffect(() => {
    if (user?.id && !selectedUserId) {
      setSelectedUserId(String(user.id));
    }
  }, [user?.id]);

  useEffect(() => {
    if (!canFilterUsers) return;
    const controller = new AbortController();
    api.get('/users?all=1', { signal: controller.signal })
      .then(res => {
        if (controller.signal.aborted) return;
        const list = extractArray<any>(res?.data);
        setUsers(list.map((u: any) => ({
          ...u,
          full_name: u.full_name || u.name || u.username || `NV #${u.id}`,
          avatar_url: u.avatar_url || u.avatar || ''
        })));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [canFilterUsers]);

  useEffect(() => {
    if (user?.id) {
      fetchActivities();
    }
    return () => {
      activitiesAbortRef.current?.abort();
    };
  }, [fetchActivities, user?.id]);

  const userFilterOptions = useMemo(() => {
    const base = [
      { value: user?.id ? String(user.id) : '', label: 'Lịch trình cá nhân', avatar: (user as any)?.avatar_url || (user as any)?.avatar },
      { value: 'all', label: 'Tất cả thành viên' }
    ];
    const others = users
      .filter(u => String(u.id) !== String(user?.id))
      .map(u => ({
        value: String(u.id),
        label: u.full_name,
        sublabel: u.role,
        avatar: u.avatar_url
      }));
    return [...base, ...others];
  }, [users, user]);

  const handleEventClick = (a: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (a.type === 'task') {
      setSelectedTask(a);
    } else if (a.type === 'so') {
      if (a.rawId) {
        window.dispatchEvent(new CustomEvent('open-deposit-drawer', { detail: { id: Number(a.rawId) } }));
      }
    } else if (a.type === 'po') {
      if (a.expense_id) {
        window.dispatchEvent(new CustomEvent('open-expense-drawer', { detail: { id: Number(a.expense_id) } }));
      } else {
        navigate('/purchase-orders');
      }
    } else {
      setSelectedActivity(a);
      setActivityModalOpen(true);
    }
  };

  const handleDayClick = (dateStr: string) => {
    setSelectedActivity({ due_date: `${dateStr}T${defaultSlotTime}`, type: 'meeting' });
    setActivityModalOpen(true);
  };

  const handleCreateTask = () => {
    setSelectedTask({
      id: 'new',
      type: 'task',
      status: 'planned',
      priority: 'medium',
      due_date: `${getLocalDateStr()} ${defaultSlotTime}:00`
    });
  };

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = new Intl.DateTimeFormat('vi-VN', { month: 'long' }).format(currentDate);

  const days = [];
  const totalDays = daysInMonth(year, month);
  const startOffset = firstDayOfMonth(year, month);

  for (let i = 0; i < startOffset; i++) {
    days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayActivities = activities.filter(a => a.due_date && String(a.due_date).slice(0, 10) === dateStr);
    const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
    const isExpanded = expandedDay === dateStr;
    const visibleEvents = isExpanded ? dayActivities : dayActivities.slice(0, calendarCellMax);

    days.push(
      <div
        key={d}
        className={`calendar-day ${isToday ? 'today' : ''}`}
        onClick={() => handleDayClick(dateStr)}
        style={{ cursor: 'pointer' }}
      >
        <div className="day-header">
           <span className="day-number">{d}</span>
           {dayActivities.length > 0 && <span className="activity-dot"></span>}
        </div>
        <div className="day-content">
           {visibleEvents.map(a => (
             <div
               key={a.id}
               onClick={(e) => handleEventClick(a, e)}
               className={`calendar-event ${a.type} ${a.status === 'done' ? 'completed' : ''}`}
               style={{ cursor: 'pointer' }}
               title={a.subject}
             >
               {a.type === 'call' && <Phone size={10} />}
               {a.type === 'meeting' && <Video size={10} />}
               {a.type === 'email' && <Mail size={10} />}
               {a.type === 'note' && <AlignLeft size={10} />}
               {a.type === 'task' && <CheckCircle2 size={10} />}
               {(a.type === 'po' || a.type === 'so') && <FileText size={10} />}
               <span className="event-subject">{a.subject}</span>
             </div>
           ))}
           {dayActivities.length > calendarCellMax && (
             <button
               type="button"
               className="more-events"
               onClick={(e) => {
                 e.stopPropagation();
                 setExpandedDay(isExpanded ? null : dateStr);
               }}
               style={{ background: 'transparent', border: 'none', cursor: 'pointer', width: '100%' }}
             >
               {isExpanded ? 'Thu gọn' : `+${dayActivities.length - calendarCellMax} thêm`}
             </button>
           )}
        </div>
      </div>
    );
  }

  const weekDays = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

  return (
    <div className="page-container flex flex-col h-full overflow-hidden">
      <div className="page-header flex-shrink-0">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>Lịch biểu &amp; Chấm công</h1>
            {canViewFinanceCalendar && (
              <button
                type="button"
                className="btn secondary sm"
                onClick={() => navigate('/data?view=calendar')}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  fontWeight: 600, 
                  padding: '4px 12px',
                  fontSize: '0.78rem',
                  borderRadius: '8px'
                }}
              >
                <CalendarIcon size={13} />
                Xem Lịch trình Tài chính
              </button>
            )}
            
            {/* Tabs for Calendar vs Attendance (Chương V Segmented Control) */}
            {showTabs && (
              <div style={{ display: 'inline-flex', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '3px', borderRadius: '10px', gap: '2px', alignItems: 'center' }}>
                <button 
                  type="button"
                  onClick={() => setActiveTab('calendar')}
                  style={{
                    height: '32px',
                    padding: '0 14px',
                    borderRadius: '7px',
                    fontSize: '0.84rem',
                    fontWeight: activeTab === 'calendar' ? 700 : 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: activeTab === 'calendar' ? '#ffffff' : 'transparent',
                    color: activeTab === 'calendar' ? '#BD1D2D' : '#64748b',
                    boxShadow: activeTab === 'calendar' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  Lịch biểu công việc
                </button>
                <button 
                  type="button"
                  onClick={() => setActiveTab('attendance')}
                  style={{
                    height: '32px',
                    padding: '0 14px',
                    borderRadius: '7px',
                    fontSize: '0.84rem',
                    fontWeight: activeTab === 'attendance' ? 700 : 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: activeTab === 'attendance' ? '#ffffff' : 'transparent',
                    color: activeTab === 'attendance' ? '#BD1D2D' : '#64748b',
                    boxShadow: activeTab === 'attendance' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  Chấm công &amp; Nghỉ phép
                </button>
              </div>
            )}
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.25rem' }}>
            {activeTab === 'calendar' ? 'Theo dõi các cuộc hẹn, cuộc gọi và nhiệm vụ của bạn' : 'Quản lý thông tin giờ làm, bổ sung công và đăng ký nghỉ phép của bạn'}
          </p>
        </div>
        {activeTab === 'calendar' && (
          <div className="flex gap-3 items-center flex-wrap">
            {canFilterUsers && (
              <div style={{ minWidth: '220px' }}>
                <CustomSelect
                  options={userFilterOptions}
                  value={selectedUserId}
                  onChange={val => setSelectedUserId(String(val))}
                  placeholder="Chọn thành viên"
                  showAvatars
                  searchable
                  align="right"
                />
              </div>
            )}
            <div className="flex items-center bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-1 shadow-sm">
               <button type="button" className="btn-icon sm" onClick={prevMonth}><ChevronLeft size={18} /></button>
               <span className="px-4 font-black capitalize" style={{ minWidth: '140px', textAlign: 'center', color: 'var(--color-text)' }}>
                 {monthName} {year}
               </span>
               <button type="button" className="btn-icon sm" onClick={nextMonth}><ChevronRight size={18} /></button>
            </div>
            <button type="button" className="btn-icon" onClick={fetchActivities} title="Làm mới lịch">
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
            <button type="button" className="btn primary" onClick={handleCreateTask}>
              <Plus size={18} /> Thêm công việc
            </button>
          </div>
        )}
      </div>

      {activeTab === 'calendar' ? (
        <div className="flex-1 overflow-hidden flex flex-col card-panel p-0 bg-[var(--color-surface)] border border-[#e2e8f0] rounded-[16px] animate-fade" style={{ display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ overflowX: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ minWidth: isMobile ? '700px' : 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                {weekDays.map(wd => (
                  <div key={wd} className="py-3 text-center text-xs font-black uppercase tracking-widest" style={{ color: 'var(--color-text-light)' }}>
                    {wd}
                  </div>
                ))}
              </div>
              <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto">
                {days}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-[var(--color-surface)] rounded-[16px] border border-[#e2e8f0] p-0 animate-fade">
          <Suspense fallback={<div className="p-8 text-center text-sm text-[var(--color-text-light)]">Đang tải...</div>}>
            <AttendancePageInner />
          </Suspense>
        </div>
      )}

      {selectedTask && (
        <Suspense fallback={null}>
          <WorkspaceTaskDrawer
            isOpen={Boolean(selectedTask)}
            onClose={() => setSelectedTask(null)}
            task={selectedTask}
            users={users}
            zIndex={2147483635}
            onUpdate={(updated?: any) => {
              if (updated && updated.id) {
                setSelectedTask((prev: any) => prev ? { ...prev, ...updated } : updated);
              }
              fetchActivities();
            }}
          />
        </Suspense>
      )}

      <ActivityModal
        isOpen={activityModalOpen}
        onClose={() => {
          setActivityModalOpen(false);
          setSelectedActivity(null);
        }}
        activity={selectedActivity}
        userId={user?.id ? Number(user.id) : undefined}
        onSuccess={fetchActivities}
      />

      <style>{`
        .calendar-day {
          min-height: 120px;
          border-right: 1px solid var(--color-border-light);
          border-bottom: 1px solid var(--color-border-light);
          padding: 8px;
          transition: background 0.2s;
        }
        .calendar-day:nth-child(7n) { border-right: none; }
        .calendar-day:hover { background: var(--color-bg); }
        .calendar-day.empty { background: var(--color-bg); opacity: 0.3; }
        .calendar-day.today { background: rgba(189, 29, 45, 0.04); }
        .calendar-day.today .day-number {
          background: #BD1D2D;
          color: white;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }
        .day-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .day-number { font-weight: 700; font-size: 0.85rem; color: var(--color-text-light); font-variant-numeric: tabular-nums; }
        .activity-dot { width: 6px; height: 6px; background: #BD1D2D; border-radius: 50%; }
        
        .day-content { display: flex; flex-direction: column; gap: 4px; }
        .calendar-event {
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 0.7rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          border: 1px solid transparent;
        }
        .calendar-event.call { background: #fef2f2; color: #BD1D2D; border-color: #fecdd3; }
        .calendar-event.meeting { background: rgba(198, 51, 61, 0.08); color: #991b1b; border-color: #fca5a5; }
        .calendar-event.task { background: #f8fafc; color: #0f172a; border-color: #cbd5e1; }
        .calendar-event.po { background: #f1f5f9; color: #334155; border-color: #cbd5e1; }
        .calendar-event.so { background: rgba(189, 29, 45, 0.08); color: #BD1D2D; border-color: #fecdd3; }
        [data-theme="dark"] .calendar-event.call { background: rgba(189, 29, 45, 0.16); color: #fda4af; border-color: rgba(189, 29, 45, 0.35); }
        [data-theme="dark"] .calendar-event.meeting { background: rgba(198, 51, 61, 0.14); color: #fecdd3; border-color: rgba(198, 51, 61, 0.3); }
        [data-theme="dark"] .calendar-event.task { background: rgba(71, 85, 105, 0.3); color: #e2e8f0; border-color: rgba(148, 163, 184, 0.35); }
        [data-theme="dark"] .calendar-event.po { background: rgba(51, 65, 85, 0.35); color: #cbd5e1; border-color: rgba(100, 116, 139, 0.4); }
        [data-theme="dark"] .calendar-event.so { background: rgba(189, 29, 45, 0.16); color: #fda4af; border-color: rgba(189, 29, 45, 0.35); }
        .calendar-event.completed { opacity: 0.5; text-decoration: line-through; }
        .more-events { font-size: 0.65rem; color: #BD1D2D; font-weight: 700; text-align: center; margin-top: 2px; }
      `}</style>
    </div>
  );
};

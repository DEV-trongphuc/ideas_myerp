import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, Phone, Users,
  CheckCircle2, Mail, AlignLeft
} from 'lucide-react';
import api from '../api/axios';
import { useUIStore } from '../store/uiStore';
import { extractArray } from '../utils/safeArray';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';

interface CalendarViewProps {
  onEventClick: (event: any) => void;
  onDateClick?: (dateStr: string) => void;
  filterType?: string;
  filterStatus?: string;
  filterTeamId?: string;
  filterUserId?: string;
  search?: string;
  refreshTrigger?: number;
}

const LEGEND_ITEMS: Array<{ type: string; label: string }> = [
  { type: 'call', label: 'Cuộc gọi' },
  { type: 'email', label: 'Email' },
  { type: 'meeting', label: 'Gặp gỡ' },
  { type: 'task', label: 'Task' },
  { type: 'note', label: 'Ghi chú' },
];

export const CalendarView: React.FC<CalendarViewProps> = ({
  onEventClick,
  onDateClick,
  filterType,
  filterStatus,
  filterTeamId,
  filterUserId,
  search,
  refreshTrigger
}) => {
  const addToast = useUIStore((s) => s.addToast);
  const calendarFetchLimit = Number(useTypedSubSetting('crm.ui_list_page_sizes_and_limits', 'calendar_fetch', 200)) || 200;
  const calendarCellMax = Math.max(1, Number(useTypedSubSetting('crm.ui_list_page_sizes_and_limits', 'calendar_cell_max', 3)) || 3);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => document.documentElement.getAttribute('data-theme') === 'dark');

  useEffect(() => {
    const syncTheme = () => setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    window.addEventListener('theme-change', syncTheme);
    return () => window.removeEventListener('theme-change', syncTheme);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01 00:00:00`;
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`;

    const params: Record<string, any> = {
      start_date: startDate,
      end_date: endDate,
      limit: calendarFetchLimit,
      minimal: 1
    };
    if (filterType) params.type = filterType;
    if (filterStatus) params.status = filterStatus;
    if (filterTeamId) params.team_id = filterTeamId;
    if (filterUserId) params.user_id = filterUserId;
    if (search) params.search = search;

    setLoading(true);
    api.get('/activities', { params, signal })
      .then((res) => {
        if (signal.aborted) return;
        setActivities(extractArray<any>(res?.data, 'items'));
      })
      .catch((err: any) => {
        if (signal.aborted || err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        addToast('Lỗi khi tải lịch làm việc', 'error');
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [currentDate, filterType, filterStatus, filterTeamId, filterUserId, search, refreshTrigger, calendarFetchLimit]);

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

  // Padding for start of month
  for (let i = 0; i < startOffset; i++) {
    days.push(<div key={`empty-${i}`} className="calendar-day empty border-r border-b border-[var(--color-border-light)] bg-[var(--color-bg)]" style={{ opacity: 0.3 }}></div>);
  }

  const T_ICON: Record<string, React.ReactNode> = {
    call: <Phone size={10} />,
    zalo_connect: <img src="https://stc-zpl.zdn.vn/favicon.ico" style={{ width: 10, height: 10, objectFit: 'contain' }} alt="Zalo" />,
    email: <Mail size={10} />,
    meeting: <Users size={10} />,
    task: <CheckCircle2 size={10} />,
    note: <AlignLeft size={10} />
  };

  const getStyleForType = (type: string) => {
    if (isDark) {
      switch (type) {
        case 'call': return { backgroundColor: 'rgba(189, 29, 45, 0.16)', color: '#fda4af', borderColor: 'rgba(189, 29, 45, 0.35)' };
        case 'meeting': return { backgroundColor: 'rgba(198, 51, 61, 0.14)', color: '#fecdd3', borderColor: 'rgba(198, 51, 61, 0.3)' };
        case 'email': return { backgroundColor: 'rgba(51, 65, 85, 0.35)', color: '#cbd5e1', borderColor: 'rgba(100, 116, 139, 0.4)' };
        case 'task': return { backgroundColor: 'rgba(71, 85, 105, 0.3)', color: '#e2e8f0', borderColor: 'rgba(148, 163, 184, 0.35)' };
        case 'zalo_connect': return { backgroundColor: 'rgba(0, 132, 255, 0.15)', color: '#93c5fd', borderColor: 'rgba(0, 132, 255, 0.3)' };
        default: return { backgroundColor: 'rgba(255, 255, 255, 0.06)', color: '#cbd5e1', borderColor: 'rgba(255, 255, 255, 0.12)' };
      }
    }
    switch (type) {
      case 'call': return { backgroundColor: '#fef2f2', color: '#BD1D2D', borderColor: '#fecdd3' };
      case 'meeting': return { backgroundColor: 'rgba(198, 51, 61, 0.08)', color: '#991b1b', borderColor: '#fca5a5' };
      case 'email': return { backgroundColor: '#f1f5f9', color: '#334155', borderColor: '#cbd5e1' };
      case 'task': return { backgroundColor: '#f8fafc', color: '#0f172a', borderColor: '#cbd5e1' };
      case 'zalo_connect': return { backgroundColor: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' };
      default: return { backgroundColor: '#f8fafc', color: '#475569', borderColor: '#e2e8f0' };
    }
  };

  // Days of month
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayActivities = activities.filter(a => a.due_date && String(a.due_date).slice(0, 10) === dateStr);
    const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
    const isExpanded = expandedDay === dateStr;
    const visibleItems = isExpanded ? dayActivities : dayActivities.slice(0, calendarCellMax);

    days.push(
      <div 
        key={d} 
        className="calendar-day" 
        onClick={() => onDateClick?.(dateStr)}
        style={{ borderRight: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', padding: '0.5rem', minHeight: '120px', transition: 'background-color 0.2s', backgroundColor: isToday ? 'rgba(189, 29, 45, 0.04)' : 'transparent', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
           <span style={{ fontSize: '0.75rem', fontWeight: 700, width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', backgroundColor: isToday ? '#BD1D2D' : 'transparent', color: isToday ? 'white' : 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{d}</span>
           {dayActivities.length > 0 && <span style={{ width: '6px', height: '6px', backgroundColor: '#BD1D2D', borderRadius: '50%' }}></span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
           {visibleItems.map(a => (
             <div 
                key={a.id} 
                onClick={(e) => { e.stopPropagation(); onEventClick(a); }}
                style={{ padding: '4px 6px', borderRadius: '6px', border: '1px solid', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', opacity: a.status === 'done' ? 0.5 : 1, textDecoration: a.status === 'done' ? 'line-through' : 'none', ...getStyleForType(a.type) }}
             >
               {T_ICON[a.type] || T_ICON.note}
               <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{a.subject}</span>
             </div>
           ))}
           {dayActivities.length > calendarCellMax && (
             <button
               type="button"
               onClick={(e) => {
                 e.stopPropagation();
                 setExpandedDay(isExpanded ? null : dateStr);
               }}
               style={{
                 fontSize: '10px',
                 color: '#BD1D2D',
                 fontWeight: 700,
                 textAlign: 'center',
                 marginTop: '2px',
                 background: 'transparent',
                 border: 'none',
                 cursor: 'pointer',
                 padding: '2px 4px',
                 borderRadius: '4px'
               }}
             >
               {isExpanded ? 'Thu gọn' : `+${dayActivities.length - calendarCellMax} thêm`}
             </button>
           )}
        </div>
      </div>
    );
  }

  const weekDays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--color-surface, #ffffff)', borderRadius: '16px', border: '1px solid var(--color-border, #e2e8f0)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '1rem', borderBottom: '1px solid var(--color-border, #e2e8f0)', backgroundColor: 'var(--color-bg, #f8fafc)' }}>
        <div className="flex items-center gap-4">
           <div className="flex bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-1 shadow-sm">
              <button type="button" className="p-1.5 rounded-lg transition-colors hover:bg-[var(--color-surface-hover)]" onClick={prevMonth}><ChevronLeft size={16} /></button>
              <span className="px-4 py-1.5 font-bold capitalize text-sm min-w-[120px] text-center" style={{ color: 'var(--color-text)' }}>
                {monthName} {year}
              </span>
              <button type="button" className="p-1.5 rounded-lg transition-colors hover:bg-[var(--color-surface-hover)]" onClick={nextMonth}><ChevronRight size={16} /></button>
           </div>
           <button type="button" className="text-xs font-bold hover:underline" style={{ color: '#BD1D2D', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => setCurrentDate(new Date())}>
             Hôm nay
           </button>
           {loading && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Đang tải...</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
           {LEGEND_ITEMS.map(item => {
             const st = getStyleForType(item.type);
             return (
               <span
                 key={item.type}
                 style={{
                   display: 'inline-flex',
                   alignItems: 'center',
                   gap: '5px',
                   padding: '3px 8px',
                   borderRadius: '999px',
                   fontSize: '11px',
                   fontWeight: 600,
                   border: '1px solid',
                   ...st
                 }}
               >
                 {T_ICON[item.type]}
                 <span>{item.label}</span>
               </span>
             );
           })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
        {weekDays.map(wd => (
          <div key={wd} style={{ padding: '8px', textAlign: 'center', fontSize: '10.5px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {wd}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridAutoRows: '1fr', overflowY: 'auto' }}>
        {days}
      </div>
    </div>
  );
};

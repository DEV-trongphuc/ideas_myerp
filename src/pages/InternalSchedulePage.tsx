import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { fetchAPI } from '../utils/api';
import { CustomSelect } from '../components/ui/CustomSelect';
import { Avatar } from '../components/ui/Avatar';
import { CalendarSkeleton, Skeleton } from '../components/ui/Skeleton';
import { 
  Calendar, BookOpen, Users, Copy, ExternalLink, 
  ChevronLeft, ChevronRight, Clock, 
  AlertCircle, CalendarDays, Award, Briefcase, FileText,
  Video, FileSpreadsheet, Mail, Send, RefreshCw
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ensureArray, extractArray } from '../utils/safeArray';
import { pushOverlay } from '../utils/overlayStack';
import { getLocalDateStr } from '../utils/dateUtils';

const CompanyDrawer = lazy(() => import('./CompanyDrawer').then(m => ({ default: m.CompanyDrawer })));
const ClassGradebookModal = lazy(() => import('../components/academic/ClassGradebookModal').then(m => ({ default: m.ClassGradebookModal })));
const LecturerInvitationAnd1on1Modal = lazy(() => import('../components/academic/LecturerInvitationAnd1on1Modal').then(m => ({ default: m.LecturerInvitationAnd1on1Modal })));
const SubjectAnnouncementModal = lazy(() => import('../components/academic/SubjectAnnouncementModal').then(m => ({ default: m.SubjectAnnouncementModal })));

const sanitizeSafeUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  const trimmed = String(url).trim();
  return /^(https?:\/\/|\/|mailto:|tel:)/i.test(trimmed) ? trimmed : '';
};

const getMilestoneDate = (ms: any): string => String(ms?.date || ms?.due_date || '').slice(0, 10);
const getMilestoneTitle = (ms: any): string => String(ms?.title || ms?.milestone || ms?.name || 'Mốc khóa luận');

export const InternalSchedulePage: React.FC = () => {
  const [viewType, setViewType] = useState<'course' | 'lecturer'>('lecturer');
  
  // Selection States
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [selectedLecturerId, setSelectedLecturerId] = useState<string>('all');
  
  // Calendar Data States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Calendar UI States
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDaySchedules, setSelectedDaySchedules] = useState<any[]>([]);
  const [selectedDayMilestones, setSelectedDayMilestones] = useState<any[]>([]);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLecturerDrawerOpen, setIsLecturerDrawerOpen] = useState(false);
  const [selectedLecturerEntity, setSelectedLecturerEntity] = useState<any>(null);
  const [showClassGradebookModal, setShowClassGradebookModal] = useState(false);
  const [lecturerModal, setLecturerModal] = useState<{ isOpen: boolean; tab: 'invitation' | '1on1' }>({ isOpen: false, tab: '1on1' });
  const [announcingSubject, setAnnouncingSubject] = useState<any>(null);

  const lecturerSearchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isModalOpen) return;
    return pushOverlay('internal-schedule-detail-modal', () => setIsModalOpen(false), 2147483646);
  }, [isModalOpen]);

  // Load bounded lists cleanly on mount (never companies?limit=2000)
  useEffect(() => {
    const controller = new AbortController();
    const loadData = async () => {
      try {
        const [cRes, compRes] = await Promise.all([
          fetchAPI('campaigns?limit=200', { signal: controller.signal }),
          fetchAPI('companies?limit=100&page=1', { signal: controller.signal })
        ]);
        if (controller.signal.aborted) return;
        if (cRes?.success) {
          setCampaigns(extractArray(cRes));
        }
        if (compRes?.success) {
          setCompanies(extractArray(compRes));
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || err?.name === 'CanceledError') return;
        console.error('Error loading options list', err);
      }
    };
    loadData();
    return () => {
      controller.abort();
      if (lecturerSearchAbortRef.current) lecturerSearchAbortRef.current.abort();
    };
  }, []);

  const handleLecturerSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) return;
    if (lecturerSearchAbortRef.current) lecturerSearchAbortRef.current.abort();
    const controller = new AbortController();
    lecturerSearchAbortRef.current = controller;
    try {
      const res = await fetchAPI(`companies?limit=50&search=${encodeURIComponent(q)}`, { signal: controller.signal });
      if (controller.signal.aborted || !res?.success) return;
      const matched = extractArray<any>(res);
      if (matched.length > 0) {
        setCompanies((prev) => {
          const map = new Map<string, any>();
          prev.forEach((c) => map.set(String(c.id), c));
          matched.forEach((c) => map.set(String(c.id), c));
          return Array.from(map.values());
        });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError') return;
    }
  }, []);

  // Fetch schedule on selection change with AbortController
  useEffect(() => {
    const id = viewType === 'course' ? selectedCampaignId : selectedLecturerId;
    if (!id) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    const fetchSchedule = async () => {
      setLoading(true);
      setError(null);
      
      const qs = new URLSearchParams();
      qs.set('action', 'public_student_schedule');
      if (viewType === 'course') qs.set('campaign_id', id);
      else qs.set('lecturer_id', id);
      if (typeof window !== 'undefined' && window.location.search) {
        const urlToken = new URLSearchParams(window.location.search).get('token');
        if (urlToken) qs.set('token', urlToken);
      }

      try {
        const token = localStorage.getItem('Ideas_token') || localStorage.getItem('access_token') || '';
        const res = await axios.get(`/backend/api.php?${qs.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        if (res.data && res.data.success) {
          setData(res.data.data);
        } else {
          setError(res.data?.message || 'Không thể tải lịch học.');
        }
      } catch (err: any) {
        if (axios.isCancel(err) || err?.name === 'CanceledError' || err?.name === 'AbortError') return;
        console.error(err);
        setError('Đã xảy ra lỗi kết nối.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    fetchSchedule();
    return () => controller.abort();
  }, [viewType, selectedCampaignId, selectedLecturerId, reloadTick]);

  // Helpers for calendar calculation
  const getLocalDateString = (date: Date) => getLocalDateStr(date);

  const getStudentInitials = (name: string) => {
    if (!name) return 'VA';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const formatDaysPhrase = (days: number) => {
    if (days === 0) return 'hôm nay';
    if (days === 1) return 'ngày mai';
    return `trong ${days} ngày tới`;
  };

  const { course, program, lecturers, lecturer } = data || {};
  const subjects = ensureArray<any>(course?.subjects);
  const thesisMilestones = ensureArray<any>(course?.thesis_milestones);

  const getLecturerName = (lecturerId: any) => {
    if (!lecturerId) return 'Chưa phân công';
    return lecturers?.[lecturerId] || lecturerId;
  };

  const allEvents = React.useMemo(() => {
    const events: any[] = [];
    subjects.forEach((sub: any) => {
      const subLecturer = getLecturerName(sub.lecturer_id);
      if (Array.isArray(sub.host_sessions)) {
        sub.host_sessions.forEach((hs: any, hsIdx: number) => {
          if (hs.date) {
            const isShared = sub.zoom_shared !== false;
            events.push({
              type: 'school',
              date: hs.date,
              subjectCode: sub.code || 'MÔN HỌC',
              subjectName: sub.name,
              title: hs.name || `Buổi học ${hsIdx + 1}`,
              time: `${hs.time_start || '20:00'} - ${hs.time_end || '22:00'}`,
              lecturer: hs.lecturer_name ? getLecturerName(hs.lecturer_name) : subLecturer,
              lecturerId: hs.lecturer_name || sub.lecturer_id || null,
              location: hs.location || 'Online',
              zoom_link: (isShared ? sub.zoom_link : sub.school_zoom_link) || '',
              zoom_id: (isShared ? sub.zoom_id : sub.school_zoom_id) || '',
              zoom_pass: (isShared ? sub.zoom_pass : sub.school_zoom_pass) || '',
              rawSubject: sub
            });
          }
        });
      }
      if (Array.isArray(sub.seminars)) {
        sub.seminars.forEach((sem: any) => {
          if (sem.date) {
            const isShared = sub.zoom_shared !== false;
            events.push({
              type: 'seminar',
              date: sem.date,
              subjectCode: sub.code || 'MÔN HỌC',
              subjectName: sub.name,
              title: sem.topic || 'Lớp chuyên đề',
              time: sem.time_slot || (sem.time_start && sem.time_end ? `${sem.time_start} - ${sem.time_end}` : 'Chưa cấu hình giờ'),
              lecturer: sem.lecturer_id ? getLecturerName(sem.lecturer_id) : subLecturer,
              lecturerId: sem.lecturer_id || sub.lecturer_id || null,
              location: sem.location || 'Online',
              zoom_link: (isShared ? sub.zoom_link : sub.seminar_zoom_link) || '',
              zoom_id: (isShared ? sub.zoom_id : sub.seminar_zoom_id) || '',
              zoom_pass: (isShared ? sub.zoom_pass : sub.seminar_zoom_pass) || '',
              rawSubject: sub
            });
          }
        });
      }
    });

    // Deduplicate merged/shared classes (same date, lecturer, subjectCode, time)
    try {
      const dedupedEvents: any[] = [];
      events.forEach(evt => {
        if (!evt) return;
        const existing = dedupedEvents.find(e => 
          e.date === evt.date && 
          e.lecturer === evt.lecturer && 
          e.subjectCode === evt.subjectCode && 
          e.time === evt.time &&
          e.type === evt.type
        );
        
        if (existing) {
          const getCourseName = (fullName: string) => {
            if (!fullName) return '';
            const match = fullName.match(/\(([^)]+)\)$/);
            return match ? match[1] : '';
          };
          
          const getBaseName = (fullName: string) => {
            if (!fullName) return '';
            return fullName.replace(/\s*\([^)]+\)$/, '').trim();
          };
          
          const course1 = getCourseName(existing.subjectName || '');
          const course2 = getCourseName(evt.subjectName || '');
          const baseName = getBaseName(existing.subjectName || '');
          
          if (course1 && course2 && course1 !== course2) {
            const courses = Array.from(new Set([...course1.split(', '), ...course2.split(', ')]));
            existing.subjectName = `${baseName} (${courses.join(', ')})`;
          } else if (!course1 && course2) {
            existing.subjectName = `${existing.subjectName} (${course2})`;
          }
          
          if (existing.title !== evt.title && evt.title) {
            const titles = Array.from(new Set([existing.title, evt.title].filter(Boolean)));
            existing.title = titles.join(' / ');
          }
        } else {
          dedupedEvents.push({ ...evt });
        }
      });
      return dedupedEvents;
    } catch (err) {
      console.error('Error during events deduplication:', err);
      return events;
    }
  }, [subjects, lecturers]);

  // Calculate nearest class and assignment/milestone
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  let nearestClassDays: number | null = null;
  let nearestClassDateStr: string = '';
  
  let nearestAsmDays: number | null = null;
  let nearestAsmDateStr: string = '';
  let nearestAsmName: string = '';

  allEvents.forEach(evt => {
    if (!evt.date) return;
    const evtDate = new Date(evt.date + 'T00:00:00');
    if (evtDate >= todayDate) {
      const diffTime = evtDate.getTime() - todayDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (nearestClassDays === null || diffDays < nearestClassDays) {
        nearestClassDays = diffDays;
        nearestClassDateStr = evt.date;
      }
    }
  });

  const allAssignments: any[] = [];
  subjects.forEach((sub: any) => {
    if (Array.isArray(sub.assignments)) {
      sub.assignments.forEach((asm: any) => {
        if (asm.due_date) {
          allAssignments.push({
            name: `${sub.name}: ${asm.name}`,
            date: asm.due_date.split('T')[0]
          });
        }
      });
    }
  });

  thesisMilestones.forEach((m: any) => {
    const msDate = getMilestoneDate(m);
    if (msDate) {
      allAssignments.push({
        name: `Mốc khóa luận: ${getMilestoneTitle(m)}`,
        date: msDate
      });
    }
  });

  allAssignments.forEach(asm => {
    if (!asm.date) return;
    const asmDate = new Date(asm.date + 'T00:00:00');
    if (asmDate >= todayDate) {
      const diffTime = asmDate.getTime() - todayDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (nearestAsmDays === null || diffDays < nearestAsmDays) {
        nearestAsmDays = diffDays;
        nearestAsmDateStr = asm.date;
        nearestAsmName = asm.name;
      }
    }
  });

  // Calendar cells calculation
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Align to Monday
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const totalDays = getDaysInMonth(year, month);
  const startOffset = getFirstDayOfMonth(year, month);

  const dayCells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) {
    dayCells.push(null);
  }
  for (let i = 1; i <= totalDays; i++) {
    dayCells.push(new Date(year, month, i));
  }

  const eventsByDate: { [key: string]: any[] } = {};
  allEvents.forEach(evt => {
    if (!eventsByDate[evt.date]) eventsByDate[evt.date] = [];
    eventsByDate[evt.date].push(evt);
  });

  const milestonesByDate: { [key: string]: any[] } = {};
  thesisMilestones.forEach((m: any) => {
    const msDate = getMilestoneDate(m);
    if (msDate) {
      if (!milestonesByDate[msDate]) milestonesByDate[msDate] = [];
      milestonesByDate[msDate].push(m);
    }
  });

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };
  const goToday = () => {
    setCurrentDate(new Date());
  };

  const handleDayClick = (date: Date) => {
    const dStr = getLocalDateString(date);
    const evts = eventsByDate[dStr] || [];
    const ms = milestonesByDate[dStr] || [];
    setSelectedDateStr(dStr);
    setSelectedDaySchedules(evts);
    setSelectedDayMilestones(ms);
    setIsModalOpen(true);
  };

  // Link copy action
  const getPublicLink = () => {
    const id = viewType === 'course' ? selectedCampaignId : selectedLecturerId;
    if (!id) return '';
    return `${window.location.origin}/public-schedule/${viewType}/${id}`;
  };

  const handleCopyLink = () => {
    const url = getPublicLink();
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      toast.success('Đã sao chép link xem lịch học public!');
    }).catch(err => {
      console.error(err);
      toast.error('Lỗi khi sao chép link');
    });
  };

  const handleOpenPublicLink = () => {
    const url = getPublicLink();
    if (url) {
      window.open(url, '_blank');
    }
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', background: 'var(--color-bg)', minHeight: '100%' }}>
      
      {/* Selector and Actions Bar */}
      <div style={{ 
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-light)',
        borderRadius: '16px',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text)' }}>Quản lý &amp; Xem Lịch học</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Tra cứu lịch giảng dạy, lớp học và các mốc thời gian</span>
          </div>

          {/* Segment Toggle (Ch.V tray) */}
          <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0', gap: '2px' }}>
            <button
              type="button"
              onClick={() => { setViewType('course'); setData(null); }}
              style={{
                height: '32px',
                padding: '0 14px',
                borderRadius: '7px',
                border: 'none',
                background: viewType === 'course' ? '#ffffff' : 'transparent',
                color: viewType === 'course' ? '#BD1D2D' : '#64748b',
                fontSize: '0.8rem',
                fontWeight: viewType === 'course' ? 700 : 600,
                boxShadow: viewType === 'course' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Lịch theo Khóa học
            </button>
            <button
              type="button"
              onClick={() => { setViewType('lecturer'); setData(null); }}
              style={{
                height: '32px',
                padding: '0 14px',
                borderRadius: '7px',
                border: 'none',
                background: viewType === 'lecturer' ? '#ffffff' : 'transparent',
                color: viewType === 'lecturer' ? '#BD1D2D' : '#64748b',
                fontSize: '0.8rem',
                fontWeight: viewType === 'lecturer' ? 700 : 600,
                boxShadow: viewType === 'lecturer' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Lịch của Giảng viên
            </button>
          </div>
        </div>

        {/* Dropdowns and Action Buttons */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
          <div style={{ width: '320px', maxWidth: '100%' }}>
            {viewType === 'course' ? (
              <CustomSelect
                options={[
                  { value: '', label: '-- Chọn Khóa học / Campaign --' },
                  ...campaigns.filter(c => c.status === 'active').map(c => ({ value: String(c.id), label: c.name }))
                ]}
                value={selectedCampaignId}
                onChange={(val) => setSelectedCampaignId(val as string)}
                placeholder="Chọn khóa học..."
                searchable
              />
            ) : (
              <CustomSelect
                options={[
                  { value: '', label: '-- Chọn Giảng viên --' },
                  { value: 'all', label: 'Tất cả giảng viên (Lịch tổng hợp)', icon: <Users size={14} /> },
                  ...companies.map(c => ({ value: String(c.id), label: c.name }))
                ]}
                value={selectedLecturerId}
                onChange={(val) => setSelectedLecturerId(val as string)}
                onSearchChange={handleLecturerSearch}
                placeholder="Chọn giảng viên..."
                searchable
                showAvatars
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setShowClassGradebookModal(true)}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: '#0f172a',
                color: '#ffffff',
                fontSize: '0.78rem',
                fontWeight: 750,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <FileSpreadsheet size={14} />
              <span>Up điểm cả lớp (Nhiều HV)</span>
            </button>

            <button
              type="button"
              onClick={() => setLecturerModal({ isOpen: true, tab: '1on1' })}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                border: 'none',
                background: '#BD1D2D',
                color: '#ffffff',
                fontSize: '0.78rem',
                fontWeight: 750,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Calendar size={14} />
              <span>Tạo Form Hướng Dẫn 1:1 (Slot 30p)</span>
            </button>

            <button
              type="button"
              onClick={() => setLecturerModal({ isOpen: true, tab: 'invitation' })}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid #fecaca',
                background: 'rgba(189, 29, 45, 0.08)',
                color: '#BD1D2D',
                fontSize: '0.78rem',
                fontWeight: 750,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Mail size={14} />
              <span>Gửi Mail Hợp Đồng & Mời Giảng (GV)</span>
            </button>
          </div>

          {((viewType === 'course' && selectedCampaignId) || (viewType === 'lecturer' && selectedLecturerId)) && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleCopyLink}
                className="btn outline sm hover-lift"
                style={{ 
                  borderRadius: '100px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  fontSize: '0.78rem', 
                  fontWeight: 750, 
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                  background: '#ffffff',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer'
                }}
              >
                <Copy size={14} />
                <span>Copy Link Public</span>
              </button>
              <button
                onClick={handleOpenPublicLink}
                className="btn primary sm hover-lift"
                style={{ 
                  borderRadius: '100px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  fontSize: '0.78rem', 
                  fontWeight: 750, 
                  background: 'var(--color-primary)', 
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                <ExternalLink size={14} />
                <span>Xem bản Public</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Calendar View Area */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: '16px',
            border: '1px solid var(--color-border-light)',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Skeleton width={52} height={52} borderRadius="50%" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Skeleton width={220} height={18} />
                <Skeleton width={300} height={12} />
              </div>
            </div>
            <Skeleton width={140} height={36} borderRadius={10} />
          </div>
          <div style={{ background: 'var(--color-surface)', borderRadius: '16px', border: '1px solid var(--color-border-light)', overflow: 'hidden' }}>
            <CalendarSkeleton />
          </div>
        </div>
      ) : error ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '2rem', gap: '0.75rem', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <AlertCircle size={40} style={{ color: '#BD1D2D' }} />
          <div style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 700 }}>{error}</div>
          <button
            type="button"
            onClick={() => setReloadTick((n) => n + 1)}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#0f172a',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={14} /> Thử tải lại
          </button>
        </div>
      ) : !data ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '2rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          <CalendarDays size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
          <div style={{ fontSize: '0.925rem', color: '#475569', fontWeight: 700 }}>Vui lòng chọn khóa học hoặc giảng viên ở trên để xem lịch học</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Header Card */}
          <div style={{ 
            background: '#ffffff', 
            borderRadius: '16px', 
            border: '1px solid #e2e8f0', 
            padding: '1.25rem 1.5rem', 
            display: 'flex', 
            flexWrap: 'wrap', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            gap: '1rem',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
          }}>
            {lecturer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ 
                  width: '52px', 
                  height: '52px', 
                  borderRadius: '50%', 
                  background: '#BD1D2D', 
                  color: '#ffffff',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '1.25rem', 
                  fontWeight: 800,
                  border: '2px solid #ffffff',
                  boxShadow: '0 2px 8px rgba(189, 29, 45, 0.2)'
                }}>
                  {getStudentInitials(lecturer.name)}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Giảng viên: {lecturer.name}</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#BD1D2D', background: 'rgba(189, 29, 45, 0.08)', padding: '2px 8px', borderRadius: '6px' }}>Giảng viên</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Briefcase size={13} /> Hệ thống: <strong style={{ color: '#0f172a' }}>{program?.name}</strong></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><BookOpen size={13} /> Lịch giảng dạy: <strong style={{ color: '#0f172a' }}>Tất cả khóa học</strong></span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ 
                  width: '52px', 
                  height: '52px', 
                  borderRadius: '50%', 
                  background: '#BD1D2D', 
                  color: '#ffffff',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  border: '2px solid #ffffff',
                  boxShadow: '0 2px 8px rgba(189, 29, 45, 0.2)'
                }}>
                  <CalendarDays size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Khóa học: {course?.name}</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#BD1D2D', background: 'rgba(189, 29, 45, 0.08)', padding: '2px 8px', borderRadius: '6px' }}>Khóa học</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Briefcase size={13} /> Chương trình: <strong style={{ color: '#0f172a' }}>{program?.name}</strong></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><BookOpen size={13} /> Mã khóa: <strong style={{ color: '#0f172a' }}>{program?.code}</strong></span>
                  </div>
                </div>
              </div>
            )}
            
            {program?.degree_awarding_body && (
              <div style={{ 
                background: '#f8fafc', 
                padding: '8px 14px', 
                borderRadius: '10px', 
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Award size={16} style={{ color: '#334155' }} />
                <div>
                  <div style={{ fontSize: '0.625rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Đơn vị</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 750, color: '#0f172a' }}>{program.degree_awarding_body}</div>
                </div>
              </div>
            )}

            {!lecturer && Array.isArray(subjects) && subjects.length > 0 && (
              <div style={{ width: '100%', borderTop: '1px solid var(--color-border-light)', paddingTop: '10px', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  Gửi Thông báo Chuyên đề / Lịch học theo môn (TBCĐ):
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {subjects.map((subItem: any, sIdx: number) => (
                    <button
                      key={subItem.id || sIdx}
                      type="button"
                      onClick={() => setAnnouncingSubject(subItem)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '5px 10px',
                        borderRadius: '8px',
                        border: '1px solid #fecaca',
                        background: '#fef2f2',
                        color: '#BD1D2D',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <Send size={12} />
                      <span>Gửi TBCĐ: {subItem.code ? `${subItem.code} - ${subItem.name}` : subItem.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notices Bar */}
          {(nearestClassDays !== null || nearestAsmDays !== null) && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', 
              gap: '1rem' 
            }}>
              {nearestClassDays !== null && (
                <div style={{ 
                  background: 'var(--color-surface, #ffffff)', 
                  border: '1px solid var(--color-border-light, #e2e8f0)', 
                  borderRadius: '12px', 
                  padding: '0.85rem 1.15rem', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px'
                }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Clock size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{lecturer ? 'Lịch giảng sắp tới' : 'Lịch học sắp tới'}</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text, #0f172a)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                      {lecturer ? 'Lịch giảng gần nhất vào ' : 'Lịch học gần nhất của khóa vào '}
                      <span style={{ color: '#0f172a', fontWeight: 800 }}>{formatDaysPhrase(nearestClassDays)}</span> ({nearestClassDateStr.split('-').reverse().join('/')}).
                    </div>
                  </div>
                </div>
              )}

              {nearestAsmDays !== null && (
                <div style={{ 
                  background: '#ffffff', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '16px', 
                  padding: '0.85rem 1.15rem', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{lecturer ? 'Bài tập & cột mốc liên quan' : 'Bài tập & hạn nộp'}</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text, #0f172a)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                      {lecturer ? 'Thời hạn bài tập/mốc liên quan ' : 'Hạn nộp bài tập/mốc gần nhất '}
                      <span style={{ color: '#BD1D2D', fontWeight: 700 }}>{formatDaysPhrase(nearestAsmDays)}</span> ({nearestAsmDateStr.split('-').reverse().join('/')}): <span style={{ fontWeight: 700 }}>{nearestAsmName}</span>.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Calendar Body */}
          <div style={{ 
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-light)',
            borderRadius: '20px',
            padding: '1.5rem',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}>
            {/* Controller Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Calendar size={22} style={{ color: 'var(--color-primary)' }} />
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lịch học &amp; Sự kiện</h4>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--color-bg-light)', borderRadius: '10px', border: '1px solid var(--color-border-light)', padding: '2px' }}>
                  <button 
                    onClick={prevMonth}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text)', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}
                    className="hover-lift"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-text)', padding: '0 12px', minWidth: '130px', textAlign: 'center' }}>
                    Tháng {month + 1} {year}
                  </span>
                  <button 
                    onClick={nextMonth}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text)', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}
                    className="hover-lift"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <button 
                  onClick={goToday}
                  style={{ 
                    border: '1px solid var(--color-border)', 
                    background: '#ffffff', 
                    borderRadius: '10px', 
                    fontSize: '0.78rem', 
                    fontWeight: 750, 
                    padding: '8px 14px', 
                    color: 'var(--color-text)', 
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                  className="hover-lift"
                >
                  Hôm nay
                </button>
              </div>
            </div>

            {/* Legend (Ch.V Brand Red & Executive Slate) */}
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#334155' }}></span>
                <span>Lịch học Trường</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#BD1D2D' }}></span>
                <span>Lớp Chuyên đề (IDEAS)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#991B1B' }}></span>
                <span>Mốc Khóa luận</span>
              </div>
            </div>

            {/* Calendar Grid Container */}
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <div 
                className="card calendar-card" 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  padding: 0, 
                  minWidth: '700px', 
                  overflow: 'hidden',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  background: 'var(--color-surface)',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <style>{`
                  .class-calendar-day-cell {
                    transition: all 0.15s ease-in-out;
                  }
                  .class-calendar-day-cell:hover {
                    box-shadow: inset 0 0 0 1px var(--color-primary) !important;
                    background-color: var(--color-bg-light) !important;
                  }
                `}</style>
                {/* Calendar Grid Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  background: 'var(--color-bg-light)',
                  borderBottom: '1px solid var(--color-border-light)',
                  padding: '10px 0',
                  flexShrink: 0
                }}>
                  {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'].map((day, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        textAlign: 'center', 
                        fontSize: '0.75rem', 
                        fontWeight: 800, 
                        color: day === 'CN' ? '#ef4444' : 'var(--color-text-muted)', 
                        textTransform: 'uppercase'
                      }}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Days */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gridAutoRows: 'minmax(110px, 1fr)',
                  background: 'var(--color-border-light)',
                  gap: '1px'
                }}>
                  {dayCells.map((date, idx) => {
                    if (!date) {
                      return (
                        <div key={idx} style={{ background: '#f8fafc', opacity: 0.35, minHeight: '100px' }}></div>
                      );
                    }

                    const dStr = getLocalDateString(date);
                    const dayEvts = eventsByDate[dStr] || [];
                    const dayMs = milestonesByDate[dStr] || [];
                    const isToday = getLocalDateString(new Date()) === dStr;
                    const dayOfWeek = date.getDay(); // 0 is Sunday, 6 is Saturday
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                    return (
                      <div 
                        key={idx} 
                        onClick={() => handleDayClick(date)}
                        style={{ 
                          background: isToday ? 'rgba(189, 29, 45, 0.05)' : isWeekend ? '#f8fafc' : '#ffffff', 
                          minHeight: '100px', 
                          padding: '8px', 
                          border: isToday ? '1.5px solid var(--color-primary)' : 'none',
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: '6px',
                          cursor: 'pointer',
                          position: 'relative'
                        }}
                        className="class-calendar-day-cell"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ 
                            fontSize: '0.85rem', 
                            fontWeight: 800, 
                            color: isToday ? 'white' : 'var(--color-text)',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isToday ? 'var(--color-primary)' : 'none'
                          }}>
                            {date.getDate()}
                          </span>
                        </div>

                        {/* Day Events Indicators */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, overflow: 'hidden' }}>
                          {dayEvts.slice(0, 3).map((evt, eidx) => (
                            <div 
                              key={eidx} 
                              style={{ 
                                fontSize: '0.65rem', 
                                fontWeight: 700, 
                                color: '#ffffff', 
                                background: evt.type === 'school' ? '#334155' : '#BD1D2D', 
                                padding: '2px 6px', 
                                borderRadius: '4px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                              title={`${evt.lecturer} - ${evt.subjectCode}: ${evt.title} (${evt.time})`}
                            >
                              {selectedLecturerId === 'all' 
                                ? `${evt.lecturer}: ${evt.subjectCode}`
                                : `${evt.subjectCode}: ${evt.title}`}
                            </div>
                          ))}

                          {dayMs.slice(0, 2).map((ms, eidx) => (
                            <div 
                              key={eidx} 
                              style={{ 
                                fontSize: '0.65rem', 
                                fontWeight: 700, 
                                color: '#ffffff', 
                                background: '#991B1B', 
                                padding: '2px 6px', 
                                borderRadius: '4px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              Mốc QL: {getMilestoneTitle(ms)}
                            </div>
                          ))}

                          {(dayEvts.length + dayMs.length > 5) && (
                            <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', fontWeight: 700, textAlign: 'right', marginTop: '2px' }}>
                              + {dayEvts.length + dayMs.length - 5} sự kiện
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Day Details Modal */}
      {isModalOpen && selectedDateStr && createPortal(
        <div
          onClick={() => setIsModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.58)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2147483646,
            backdropFilter: 'blur(4px)',
            transition: 'opacity 220ms cubic-bezier(0.25, 0.1, 0.25, 1)'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              width: '90%',
              maxWidth: '620px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 48px rgba(15, 23, 42, 0.22)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} style={{ color: '#BD1D2D' }} />
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                  Chi tiết ngày {selectedDateStr.split('-').reverse().join('/')}
                </span>
              </div>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.25rem', color: '#64748b', fontWeight: 700 }}
              >
                &times;
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {selectedDaySchedules.length === 0 && selectedDayMilestones.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                  Không có sự kiện hoặc lịch học nào trong ngày này.
                </div>
              ) : (
                <>
                  {/* Schedules */}
                  {selectedDaySchedules.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                        Buổi học &amp; Chuyên đề ({selectedDaySchedules.length})
                      </div>
                       {selectedDaySchedules.map((evt, idx) => {
                         const isPassed = (() => {
                           if (!selectedDateStr) return false;
                           const now = new Date();
                           const [year, month, day] = selectedDateStr.split('-').map(Number);
                           const eventDate = new Date(year, month - 1, day);
                           const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                           
                           if (eventDate < today) return true;
                           if (eventDate > today) return false;
                           
                           if (evt.time) {
                             const parts = evt.time.split('-');
                             if (parts.length === 2) {
                               const endTimeStr = parts[1].trim();
                               const [endHour, endMin] = endTimeStr.split(':').map(Number);
                               if (!isNaN(endHour) && !isNaN(endMin)) {
                                 const eventEndTime = new Date(year, month - 1, day, endHour, endMin);
                                 return now > eventEndTime;
                               }
                             }
                           }
                           return false;
                         })();

                         return (
                           <div key={idx} style={{ 
                             padding: '12px', 
                             background: 'var(--color-bg-light)', 
                             borderRadius: '12px', 
                             border: '1px solid var(--color-border-light)',
                             display: 'flex',
                             flexDirection: 'column',
                             gap: '6px'
                           }}>
                             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                               <span style={{ 
                                 fontSize: '0.625rem', 
                                 fontWeight: 800, 
                                 padding: '2px 8px', 
                                 borderRadius: '6px', 
                                 color: '#ffffff', 
                                 background: evt.type === 'school' ? '#334155' : '#BD1D2D' 
                               }}>
                                 {evt.type === 'school' ? 'Trường' : 'Chuyên đề'}
                               </span>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                 <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                                   {evt.subjectCode} - {evt.subjectName}
                                 </span>
                                 {evt.rawSubject && (
                                   <button
                                     type="button"
                                     onClick={() => setAnnouncingSubject(evt.rawSubject)}
                                     style={{
                                       display: 'inline-flex',
                                       alignItems: 'center',
                                       gap: '4px',
                                       padding: '2px 8px',
                                       borderRadius: '6px',
                                       border: '1px solid #fecaca',
                                       background: '#fef2f2',
                                       color: '#BD1D2D',
                                       fontSize: '0.68rem',
                                       fontWeight: 700,
                                       cursor: 'pointer'
                                     }}
                                   >
                                     <Send size={10} />
                                     Gửi TBCĐ
                                   </button>
                                 )}
                               </div>
                             </div>
                             <div style={{ fontSize: '0.825rem', fontWeight: 800, color: 'var(--color-text)' }}>{evt.title}</div>
                             <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.72rem', color: 'var(--color-text-light)', borderTop: '1px dashed var(--color-border-light)', paddingTop: '6px', marginTop: '2px' }}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                 <span>Giờ: <strong style={{ color: 'var(--color-text)' }}>{evt.time}</strong></span>
                                 {isPassed && (
                                   <span style={{ 
                                     fontSize: '0.6rem', 
                                     fontWeight: 800, 
                                     color: '#6b7280', 
                                     background: '#e5e7eb', 
                                     padding: '1px 5px', 
                                     borderRadius: '4px', 
                                     textTransform: 'uppercase'
                                   }}>
                                     Đã kết thúc
                                   </span>
                                 )}
                               </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>Giảng viên:</span>
                              <div 
                                onClick={() => {
                                  if (evt.lecturerId) {
                                    const lecturerEntity = companies.find(c => String(c.id) === String(evt.lecturerId));
                                    if (lecturerEntity) {
                                      setSelectedLecturerEntity(lecturerEntity);
                                      setIsLecturerDrawerOpen(true);
                                    } else {
                                      setSelectedLecturerEntity({ id: Number(evt.lecturerId), name: evt.lecturer });
                                      setIsLecturerDrawerOpen(true);
                                    }
                                  }
                                }}
                                style={{ 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  gap: '4px', 
                                  cursor: evt.lecturerId ? 'pointer' : 'default',
                                  padding: '2px 8px',
                                  background: 'var(--color-bg-light)',
                                  borderRadius: '20px',
                                  border: '1px solid var(--color-border-light)',
                                  transition: 'all 0.2s'
                                }}
                                className={evt.lecturerId ? "hover-lift" : ""}
                              >
                                 <Avatar name={evt.lecturer} size={16} />
                                 <strong style={{ color: 'var(--color-text)' }}>{evt.lecturer}</strong>
                               </div>
                             </div>
                             <div>Địa điểm: <strong style={{ color: 'var(--color-text)' }}>{evt.location}</strong></div>
                           </div>
                           {sanitizeSafeUrl(evt.zoom_link) && (
                             <div style={{ 
                               marginTop: '8px', 
                               background: '#f8fafc', 
                               border: '1px solid #e2e8f0', 
                               borderRadius: '10px', 
                               padding: '10px 12px', 
                               display: 'flex', 
                               flexDirection: 'column', 
                               gap: '6px'
                             }}>
                               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                                 <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                   <Video size={14} color="#BD1D2D" />
                                   Phòng Zoom Trực tuyến
                                   {isPassed && (
                                      <span style={{ 
                                        fontSize: '0.6rem', 
                                        fontWeight: 800, 
                                        color: '#475569', 
                                        background: '#e2e8f0', 
                                        padding: '1px 5px', 
                                        borderRadius: '4px', 
                                        marginLeft: '6px',
                                        textTransform: 'uppercase' 
                                      }}>
                                        Đã kết thúc
                                      </span>
                                    )}
                                 </span>
                                 <button
                                   type="button"
                                   onClick={() => {
                                     const infoText = `Link Zoom: ${evt.zoom_link}\nID: ${evt.zoom_id || ''}\nPass: ${evt.zoom_pass || ''}`;
                                     navigator.clipboard.writeText(infoText)
                                       .then(() => toast.success('Đã copy Link, ID và Pass!'))
                                       .catch(() => {});
                                   }}
                                   style={{
                                     display: 'flex',
                                     alignItems: 'center',
                                     gap: '4px',
                                     background: '#0f172a',
                                     color: '#ffffff',
                                     border: 'none',
                                     borderRadius: '6px',
                                     padding: '4px 8px',
                                     fontSize: '0.68rem',
                                     fontWeight: 750,
                                     cursor: 'pointer'
                                   }}
                                   className="hover-lift"
                                 >
                                   Copy thông tin <Copy size={11} />
                                 </button>
                               </div>
                               
                               <div style={{ 
                                 display: 'flex', 
                                 flexDirection: 'column',
                                 gap: '8px', 
                                 fontSize: '0.68rem', 
                                 color: '#0f172a', 
                                 background: '#ffffff', 
                                 padding: '6px 8px', 
                                 borderRadius: '6px', 
                                 border: '1px solid #e2e8f0'
                               }}>
                                 {/* Zoom Link Display */}
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', wordBreak: 'break-all' }}>
                                   <span style={{ fontWeight: 600, flexShrink: 0 }}>Link:</span>
                                   <a 
                                     href={sanitizeSafeUrl(evt.zoom_link)} 
                                     target="_blank" 
                                     rel="noopener noreferrer" 
                                     style={{ color: '#BD1D2D', fontWeight: 700, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
                                   >
                                     {evt.zoom_link}
                                   </a>
                                   <button 
                                     onClick={() => {
                                       navigator.clipboard.writeText(evt.zoom_link);
                                       toast.success('Đã copy Zoom Link!');
                                     }}
                                     style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px', color: 'var(--color-text-muted)', flexShrink: 0 }}
                                   >
                                     <Copy size={11} />
                                   </button>
                                 </div>

                                 {/* ID and Pass row */}
                                 <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', borderTop: '1px dashed var(--color-border-light)', paddingTop: '6px' }}>
                                   {evt.zoom_id && (
                                     <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                       <span>ID: <strong>{evt.zoom_id}</strong></span>
                                       <button 
                                         onClick={() => {
                                           navigator.clipboard.writeText(evt.zoom_id);
                                           toast.success('Đã copy Zoom ID!');
                                         }}
                                         style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px', color: 'var(--color-text-muted)' }}
                                       >
                                         <Copy size={11} />
                                       </button>
                                     </div>
                                   )}
                                   {evt.zoom_pass && (
                                     <div style={{ display: 'flex', alignItems: 'center', gap: '4px', borderLeft: '1px solid var(--color-border-light)', paddingLeft: '10px' }}>
                                       <span>Pass: <strong>{evt.zoom_pass}</strong></span>
                                       <button 
                                         onClick={() => {
                                           navigator.clipboard.writeText(evt.zoom_pass);
                                           toast.success('Đã copy Zoom Pass!');
                                         }}
                                         style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px', color: 'var(--color-text-muted)' }}
                                       >
                                         <Copy size={11} />
                                       </button>
                                     </div>
                                   )}
                                 </div>
                               </div>
                             </div>
                           )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Milestones */}
                  {selectedDayMilestones.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                        Cột mốc luận văn ({selectedDayMilestones.length})
                      </div>
                      {selectedDayMilestones.map((ms, idx) => (
                        <div key={idx} style={{ 
                          padding: '12px', 
                          background: '#fef2f2', 
                          borderRadius: '12px', 
                          border: '1px solid #fecaca',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          <div style={{ fontSize: '0.825rem', fontWeight: 800, color: '#BD1D2D' }}>{getMilestoneTitle(ms)}</div>
                          <div style={{ fontSize: '0.72rem', color: '#475569' }}>{ms.description || 'Không có mô tả chi tiết.'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {isLecturerDrawerOpen && selectedLecturerEntity && (
        <Suspense fallback={null}>
          <CompanyDrawer
            isOpen={isLecturerDrawerOpen}
            onClose={() => setIsLecturerDrawerOpen(false)}
            entity={selectedLecturerEntity}
            onSave={() => {}}
          />
        </Suspense>
      )}

      {showClassGradebookModal && (
        <Suspense fallback={null}>
          <ClassGradebookModal
            isOpen={showClassGradebookModal}
            onClose={() => setShowClassGradebookModal(false)}
            initialCampaignId={selectedCampaignId ? Number(selectedCampaignId) : null}
            campaignsList={campaigns}
          />
        </Suspense>
      )}

      {lecturerModal.isOpen && (
        <Suspense fallback={null}>
          <LecturerInvitationAnd1on1Modal
            isOpen={lecturerModal.isOpen}
            onClose={() => setLecturerModal(prev => ({ ...prev, isOpen: false }))}
            initialTab={lecturerModal.tab}
            lecturer={
              selectedLecturerId && selectedLecturerId !== 'all'
                ? companies.find(c => String(c.id) === String(selectedLecturerId)) || null
                : null
            }
            campaignId={selectedCampaignId ? Number(selectedCampaignId) : null}
            campaignName={
              selectedCampaignId
                ? campaigns.find(c => String(c.id) === String(selectedCampaignId))?.name || ''
                : ''
            }
          />
        </Suspense>
      )}

      {announcingSubject && (
        <Suspense fallback={null}>
          <SubjectAnnouncementModal
            isOpen={!!announcingSubject}
            onClose={() => setAnnouncingSubject(null)}
            subject={announcingSubject}
            campaign={
              selectedCampaignId
                ? campaigns.find(c => String(c.id) === String(selectedCampaignId)) || {
                    id: Number(selectedCampaignId),
                    name: course?.name || ''
                  }
                : null
            }
            programName={program?.name || course?.name || ''}
            companiesList={companies}
            addToast={(msg, type) => {
              if (type === 'error') toast.error(msg);
              else toast.success(msg);
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

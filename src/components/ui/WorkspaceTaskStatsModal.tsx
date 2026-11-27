import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Calendar, CheckCircle2, Clock, AlertTriangle, BarChart3,
  Users, Search, TrendingUp, CheckSquare, Award,
  ArrowUpRight, ShieldAlert, ChevronRight,
  ChevronDown, ArrowLeft, Check, ArrowRightLeft
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, CartesianGrid, Legend
} from 'recharts';
import api from '../../api/axios';
import { useUIStore } from '../../store/uiStore';
import { Avatar } from './Avatar';
import { CustomSelect, type SelectOption } from './CustomSelect';
import { pushOverlay } from '../../utils/overlayStack';
import { ensureArray } from '../../utils/safeArray';
import { getLocalDateStr } from '../../utils/dateUtils';

const parseTaskDate = (raw?: string | null): Date | null => {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const d = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      match[4] ? Number(match[4]) : 0,
      match[5] ? Number(match[5]) : 0,
      match[6] ? Number(match[6]) : 0
    );
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const extractSubtasksSafe = (task: any): any[] => {
  if (!task) return [];
  if (Array.isArray(task.subtasks)) return task.subtasks;
  if (Array.isArray(task.checklist)) return task.checklist;
  if (typeof task.body === 'string' && task.body.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(task.body);
      const list = parsed?.erp_task?.subtasks || parsed?.erp_task?.checklist || parsed?.subtasks || parsed?.checklist;
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  return [];
};

export interface WorkspaceTaskStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: any[];
  users: any[];
  onSelectTask?: (task: any) => void;
  onReassignTask?: (taskId: number, newUserId: number) => Promise<void>;
  currentUserId?: number | string;
  currentUserRole?: string;
  currentUserTeamId?: number | string;
  teamsList?: any[];
}

type DatePreset = 'this_month' | 'today' | 'this_week' | 'last_month' | 'this_quarter' | 'all' | 'custom';

export const WorkspaceTaskStatsModal: React.FC<WorkspaceTaskStatsModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <WorkspaceTaskStatsModalInner {...props} />;
};

const WorkspaceTaskStatsModalInner: React.FC<WorkspaceTaskStatsModalProps> = ({
  isOpen,
  onClose,
  tasks = [],
  users = [],
  onSelectTask,
  onReassignTask,
  currentUserId,
  currentUserRole,
  currentUserTeamId,
  teamsList = []
}) => {
  const addToast = useUIStore(s => s.addToast);
  useEffect(() => {
    if (!isOpen) return;
    return pushOverlay('workspace-task-stats-modal', onClose);
  }, [isOpen, onClose]);

  const [reassignOverrides, setReassignOverrides] = useState<Record<number, number>>({});
  const [reassigningTaskId, setReassigningTaskId] = useState<number | null>(null);
  const reassignInFlightRef = useRef(false);

  const effectiveTasks = useMemo(() => {
    const safeTasks = ensureArray(tasks);
    if (Object.keys(reassignOverrides).length === 0) return safeTasks;
    return safeTasks.map((t: any) => {
      const nextUid = reassignOverrides[Number(t.id)];
      if (!nextUid) return t;
      const found = users.find((u: any) => Number(u.id) === Number(nextUid));
      return {
        ...t,
        user_id: nextUid,
        assignee_id: nextUid,
        user_name: found?.full_name || found?.name || t.user_name,
      };
    });
  }, [tasks, reassignOverrides, users]);

  // Role & Scope classification
  const roleLower = String(currentUserRole || '').toLowerCase();
  const isDirectorOrAdmin = ['admin', 'superadmin', 'super_admin', 'director', 'board'].includes(roleLower);
  const isManager = ['manager', 'leader', 'team_leader', 'vp'].includes(roleLower);
  const isPersonalOnly = !isDirectorOrAdmin && !isManager;

  // Allowed team members for Manager
  const allowedUserIds = useMemo(() => {
    if (isDirectorOrAdmin) return null;

    if (isManager) {
      const uid = Number(currentUserId);
      const managedTeams = ensureArray(teamsList).filter(
        (t: any) => Number(t.leader_id) === uid
      );
      const managedTeamIds = managedTeams.map((t: any) => Number(t.id));

      let memberUsers: any[] = [];
      if (managedTeamIds.length > 0) {
        memberUsers = users.filter((u: any) =>
          Number(u.id) === uid || (u.team_id && managedTeamIds.includes(Number(u.team_id)))
        );
      } else if (currentUserTeamId) {
        memberUsers = users.filter((u: any) =>
          Number(u.id) === uid || String(u.team_id) === String(currentUserTeamId)
        );
      } else {
        memberUsers = users.filter((u: any) => Number(u.id) === uid);
      }
      return new Set(memberUsers.map((u: any) => String(u.id)));
    }

    return new Set([String(currentUserId)]);
  }, [isDirectorOrAdmin, isManager, teamsList, currentUserId, currentUserTeamId, users]);

  // Scoped tasks strictly filtered by role permission
  const scopedTasks = useMemo(() => {
    if (isDirectorOrAdmin) return effectiveTasks;

    const uidStr = String(currentUserId);
    const uidNum = Number(currentUserId);

    return effectiveTasks.filter(task => {
      const subs = extractSubtasksSafe(task);
      const isSubtaskAssignee = subs.some((st: any) => Number(st?.assignee_id) === uidNum);
      if (isPersonalOnly) {
        const isAssignee = String(task.user_id) === uidStr;
        const isCreator = String(task.created_by) === uidStr;
        const isParticipant = task.participant_ids
          ? String(task.participant_ids).split(',').map((s: string) => s.trim()).includes(uidStr)
          : false;
        return isAssignee || isCreator || isParticipant || isSubtaskAssignee;
      }

      if (isManager) {
        const taskUserIdStr = String(task.user_id);
        const isAssigneeInTeam = allowedUserIds ? allowedUserIds.has(taskUserIdStr) : false;
        const isSubInTeam = allowedUserIds ? subs.some((st: any) => st?.assignee_id && allowedUserIds.has(String(st.assignee_id))) : false;
        const isManagerInvolved = Number(task.user_id) === uidNum ||
                                  Number(task.created_by) === uidNum ||
                                  Number(task.approver_id) === uidNum ||
                                  (task.participant_ids && String(task.participant_ids).split(',').map((s: string) => s.trim()).includes(uidStr));
        const isTeamMatch = currentUserTeamId && Number(task.team_id) === Number(currentUserTeamId);
        return isAssigneeInTeam || isSubInTeam || isManagerInvolved || isTeamMatch;
      }

      return false;
    });
  }, [effectiveTasks, isDirectorOrAdmin, isPersonalOnly, isManager, allowedUserIds, currentUserId, currentUserTeamId]);

  const [datePreset, setDatePreset] = useState<DatePreset>('this_month');
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const periodDropdownRef = useRef<HTMLDivElement | null>(null);
  const [isLoading] = useState(false);
  const triggerWithLoading = (callback: () => void) => {
    callback();
  };

  const initialDateRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return {
      start: getLocalDateStr(start),
      end: getLocalDateStr(end)
    };
  }, []);

  const [customStartDate, setCustomStartDate] = useState(initialDateRange.start);
  const [customEndDate, setCustomEndDate] = useState(initialDateRange.end);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'customer' | 'personal' | 'team'>('all');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks'>('overview');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (periodDropdownRef.current && !periodDropdownRef.current.contains(e.target as Node)) {
        setIsPeriodDropdownOpen(false);
      }
    };
    if (isPeriodDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPeriodDropdownOpen]);

  const dateBounds = useMemo(() => {
    const now = new Date();
    if (datePreset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      return { start, end };
    }
    if (datePreset === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
      return { start, end };
    }
    if (datePreset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return { start, end };
    }
    if (datePreset === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start, end };
    }
    if (datePreset === 'this_quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0);
      const end = new Date(now.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59);
      return { start, end };
    }
    if (datePreset === 'custom') {
      const start = parseTaskDate(customStartDate);
      if (start) start.setHours(0, 0, 0, 0);
      const end = parseTaskDate(customEndDate);
      if (end) end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    return { start: null, end: null };
  }, [datePreset, customStartDate, customEndDate]);

  const filteredTasks = useMemo(() => {
    return scopedTasks.filter(task => {
      if (dateBounds.start || dateBounds.end) {
        const taskDateStr = task.due_date || task.created_at;
        const taskDate = parseTaskDate(taskDateStr);
        if (taskDate) {
          if (dateBounds.start && taskDate < dateBounds.start) return false;
          if (dateBounds.end && taskDate > dateBounds.end) return false;
        }
      }

      const isClientTask = Boolean(task.related_type && ['contact', 'deal', 'company'].includes(task.related_type));
      const tagList = String(task.tags || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
      const hasPersonalTag = tagList.includes('ca_nhan') || tagList.includes('personal') || tagList.includes('personal_task');
      const otherParticipants = String(task.participant_ids || task.collaborator_ids || '')
        .split(',')
        .map((s: string) => s.trim())
        .filter((id: string) => id !== '' && Number(id) !== Number(task.user_id));
      const isSelfOnly = Boolean(
        task.user_id &&
        task.created_by &&
        Number(task.user_id) === Number(task.created_by) &&
        otherParticipants.length === 0 &&
        !task.approver_id &&
        !task.team_id &&
        !task.project_id
      );
      const isPersonal = !isClientTask && (hasPersonalTag || isSelfOnly);

      if (selectedCategory === 'customer') {
        if (!isClientTask) return false;
      } else if (selectedCategory === 'personal') {
        if (!isPersonal) return false;
      } else if (selectedCategory === 'team') {
        if (isClientTask || isPersonal) return false;
      }

      if (selectedAssignee !== 'all') {
        const subs = extractSubtasksSafe(task);
        const matchesMain = String(task.user_id) === String(selectedAssignee);
        const matchesSub = subs.some((st: any) => String(st?.assignee_id) === String(selectedAssignee));
        if (!matchesMain && !matchesSub) return false;
      }

      if (searchKeyword.trim()) {
        const q = searchKeyword.toLowerCase();
        const matchSubj = task.subject && task.subject.toLowerCase().includes(q);
        const matchBody = task.body && task.body.toLowerCase().includes(q);
        const matchContact = task.contact_name && task.contact_name.toLowerCase().includes(q);
        if (!matchSubj && !matchBody && !matchContact) return false;
      }

      return true;
    });
  }, [scopedTasks, dateBounds, selectedCategory, selectedAssignee, searchKeyword]);

  const stats = useMemo(() => {
    const total = filteredTasks.length;
    let done = 0;
    let inProgress = 0;
    let notStarted = 0;
    let overdue = 0;
    let dueToday = 0;
    let pendingApproval = 0;
    let urgent = 0;
    let normal = 0;
    let low = 0;

    const todayKey = getLocalDateStr();
    const nowZero = new Date();
    nowZero.setHours(0, 0, 0, 0);

    const userStatsMap: Record<string, {
      user: any;
      total: number;
      done: number;
      inProgress: number;
      overdue: number;
      subtasksAssigned: number;
      firstOverdueTaskId: number | null;
    }> = {};

    const ensureUserBucket = (uKey: string, fallbackName?: string) => {
      if (!userStatsMap[uKey]) {
        const foundUser = users.find((u: any) => String(u.id) === String(uKey));
        userStatsMap[uKey] = {
          user: foundUser || { id: uKey, full_name: fallbackName || 'Chưa gán', avatar_url: '' },
          total: 0,
          done: 0,
          inProgress: 0,
          overdue: 0,
          subtasksAssigned: 0,
          firstOverdueTaskId: null
        };
      }
      return userStatsMap[uKey];
    };

    filteredTasks.forEach(task => {
      const reqApprovalUnapproved =
        Number(task.require_approval) === 1 &&
        String(task.approval_status || '').toLowerCase() !== 'approved';
      const isDone = !reqApprovalUnapproved && (
        task.status === 'done' ||
        task.status === 'completed' ||
        task.progress === 100 ||
        (task.status && task.status.toLowerCase().includes('hoàn thành')) ||
        (task.status && task.status.toLowerCase().includes('xong'))
      );
      const prog = Number(task.progress) || 0;

      if (isDone) {
        done++;
      } else if (prog > 0) {
        inProgress++;
      } else {
        notStarted++;
      }

      let taskOverdue = false;
      if (task.due_date) {
        const d = parseTaskDate(task.due_date);
        if (d) {
          if (!isDone && getLocalDateStr(d) === todayKey) {
            dueToday++;
          } else if (!isDone && d < nowZero) {
            overdue++;
            taskOverdue = true;
          }
        }
      }

      if (Number(task.require_approval) === 1 && task.approval_status === 'pending') {
        pendingApproval++;
      }

      if (task.priority === 'high' || task.priority === 'urgent') urgent++;
      else if (task.priority === 'low') low++;
      else normal++;

      const uId = task.user_id ? String(task.user_id) : 'unassigned';
      const bucket = ensureUserBucket(uId, task.user_name);
      bucket.total++;

      if (isDone) {
        bucket.done++;
      } else {
        bucket.inProgress++;
        if (taskOverdue) {
          bucket.overdue++;
          if (bucket.firstOverdueTaskId === null) {
            bucket.firstOverdueTaskId = Number(task.id);
          }
        }
      }

      // Count delegated subtasks
      const subs = extractSubtasksSafe(task);
      subs.forEach((st: any) => {
        if (st?.assignee_id && String(st.assignee_id) !== uId) {
          const sb = ensureUserBucket(String(st.assignee_id));
          sb.subtasksAssigned++;
        }
      });
    });

    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    const userLeaderboard = Object.values(userStatsMap)
      .filter((item) => item.total > 0 || item.subtasksAssigned > 0)
      .sort((a, b) => b.done - a.done || b.total - a.total);

    const chartData = userLeaderboard.slice(0, 8).map((item) => {
      const fullName = String(item.user.full_name || item.user.name || 'Chưa gán');
      const shortName = fullName.split(' ').slice(-2).join(' ');
      return {
        name: shortName,
        'Hoàn thành': item.done,
        'Đang làm': Math.max(0, item.inProgress - item.overdue),
        'Quá hạn': item.overdue,
        total: item.total,
      };
    });

    return {
      total,
      done,
      inProgress,
      notStarted,
      overdue,
      dueToday,
      pendingApproval,
      completionRate,
      urgent,
      normal,
      low,
      userLeaderboard,
      chartData
    };
  }, [filteredTasks, users]);

  const datePresetsList: { id: DatePreset; label: string }[] = [
    { id: 'this_month', label: 'Tháng này' },
    { id: 'today', label: 'Hôm nay' },
    { id: 'this_week', label: 'Tuần này' },
    { id: 'last_month', label: 'Tháng trước' },
    { id: 'this_quarter', label: 'Quý này' },
    { id: 'all', label: 'Toàn bộ thời gian' },
    { id: 'custom', label: 'Tùy chọn khoảng ngày...' }
  ];

  const categoryOptions: SelectOption[] = useMemo(() => [
    { value: 'all', label: 'Tất cả phân loại' },
    { value: 'customer', label: 'Khách hàng' },
    { value: 'team', label: 'Nội bộ & Đội nhóm' },
    { value: 'personal', label: 'Cá nhân' }
  ], []);

  const assigneeOptions: SelectOption[] = useMemo(() => {
    const list: SelectOption[] = [
      {
        value: 'all',
        label: isDirectorOrAdmin ? 'Tất cả nhân sự' : 'Tất cả thành viên trong nhóm'
      }
    ];

    users
      .filter((u: any) => !allowedUserIds || allowedUserIds.has(String(u.id)))
      .forEach((u: any) => {
        list.push({
          value: String(u.id),
          label: u.full_name || u.name || 'Nhân sự',
          avatar: u.avatar_url || u.avatar || ''
        });
      });

    return list;
  }, [users, allowedUserIds, isDirectorOrAdmin]);

  const reassignOptions = useMemo(() => {
    return users
      .filter((u: any) => !allowedUserIds || allowedUserIds.has(String(u.id)))
      .map((u: any) => ({
        id: Number(u.id),
        name: u.full_name || u.name || 'Nhân sự',
      }));
  }, [users, allowedUserIds]);

  // All hooks are safely evaluated above; guard visibility cleanly here (fixes React #310 Rules-of-Hooks crash)
  if (!isOpen) return null;

  const handleQuickReassign = async (taskId: number, newUid: number) => {
    if (!taskId || !newUid || reassignInFlightRef.current) return;
    reassignInFlightRef.current = true;
    setReassigningTaskId(taskId);
    try {
      if (onReassignTask) {
        await onReassignTask(taskId, newUid);
      } else {
        await api.put(`/activities/${taskId}`, { user_id: newUid, assignee_id: newUid });
      }
      setReassignOverrides(prev => ({ ...prev, [taskId]: newUid }));
      addToast('Đã điều phối lại người phụ trách công việc', 'success');
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Không thể điều phối lại công việc', 'error');
    } finally {
      reassignInFlightRef.current = false;
      setReassigningTaskId(null);
    }
  };

  const activePresetLabel = datePresetsList.find(p => p.id === datePreset)?.label || 'Tháng này';
  const selectedAssigneeObj = selectedAssignee !== 'all' ? users.find((u: any) => String(u.id) === String(selectedAssignee)) : null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        transition: 'opacity 0.22s cubic-bezier(0.25, 0.1, 0.25, 1)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1120px',
          maxHeight: '92vh',
          backgroundColor: '#FFFFFF',
          color: '#0F172A',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.75rem',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#FFFFFF'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'rgba(189, 29, 45, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#BD1D2D'
            }}>
              <BarChart3 size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                  Báo Cáo & Thống Kê Công Việc
                </h3>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 10px',
                  borderRadius: '20px',
                  backgroundColor: 'rgba(189, 29, 45, 0.08)',
                  color: '#BD1D2D'
                }}>
                  {activePresetLabel}
                </span>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 10px',
                  borderRadius: '20px',
                  backgroundColor: '#F1F5F9',
                  color: '#334155'
                }}>
                  {isDirectorOrAdmin ? 'Toàn công ty' : isManager ? 'Đội ngũ quản lý' : 'Cá nhân'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                Tổng hợp hiệu suất làm việc, phân bổ workload và điều phối tiến độ
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748B',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(189, 29, 45, 0.1)'; e.currentTarget.style.color = '#BD1D2D'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#F1F5F9'; e.currentTarget.style.color = '#64748B'; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Filters Toolbar */}
        <div style={{
          padding: '0.75rem 1.75rem',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#F8FAFC',
          position: 'relative',
          zIndex: 60
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }} ref={periodDropdownRef}>
              <button
                type="button"
                onClick={() => setIsPeriodDropdownOpen(!isPeriodDropdownOpen)}
                style={{
                  height: '36px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  border: isPeriodDropdownOpen ? '1.5px solid #BD1D2D' : '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                <Calendar size={15} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                <span style={{ whiteSpace: 'nowrap' }}>Kỳ: <strong>{activePresetLabel}</strong></span>
                <ChevronDown size={14} style={{ color: '#64748B', transform: isPeriodDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
              </button>

              {isPeriodDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  zIndex: 80,
                  width: '210px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 12px 28px -4px rgba(15, 23, 42, 0.16)',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}>
                  {datePresetsList.map(p => {
                    const active = datePreset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setIsPeriodDropdownOpen(false);
                          triggerWithLoading(() => setDatePreset(p.id));
                        }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: active ? 'rgba(189, 29, 45, 0.08)' : 'transparent',
                          color: active ? '#BD1D2D' : '#0F172A',
                          fontSize: '0.78rem',
                          fontWeight: active ? 700 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          textAlign: 'left'
                        }}
                      >
                        <span>{p.label}</span>
                        {active && <Check size={14} style={{ color: '#BD1D2D' }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {datePreset === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => triggerWithLoading(() => setCustomStartDate(e.target.value))}
                  style={{ height: '34px', fontSize: '0.75rem', padding: '0 8px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>-</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => triggerWithLoading(() => setCustomEndDate(e.target.value))}
                  style={{ height: '34px', fontSize: '0.75rem', padding: '0 8px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF' }}
                />
              </div>
            )}

            <div style={{ width: '165px', flexShrink: 0 }}>
              <CustomSelect
                options={categoryOptions}
                value={selectedCategory}
                onChange={(val) => triggerWithLoading(() => setSelectedCategory(val))}
                size="sm"
                placeholder="Phân loại..."
              />
            </div>

            {!isPersonalOnly && (
              <div style={{ width: '220px', flexShrink: 0 }}>
                <CustomSelect
                  options={assigneeOptions}
                  value={selectedAssignee}
                  onChange={(val) => triggerWithLoading(() => setSelectedAssignee(String(val)))}
                  size="sm"
                  searchable={true}
                  showAvatars={true}
                  placeholder="Chọn nhân sự..."
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'inline-flex',
              padding: '3px',
              backgroundColor: '#F1F5F9',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              gap: '2px'
            }}>
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                style={{
                  height: '32px',
                  padding: '0 14px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.76rem',
                  fontWeight: activeTab === 'overview' ? 700 : 600,
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'overview' ? '#FFFFFF' : 'transparent',
                  color: activeTab === 'overview' ? '#BD1D2D' : '#64748B',
                  boxShadow: activeTab === 'overview' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                Thống kê tổng quan
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tasks')}
                style={{
                  height: '32px',
                  padding: '0 14px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.76rem',
                  fontWeight: activeTab === 'tasks' ? 700 : 600,
                  cursor: 'pointer',
                  backgroundColor: activeTab === 'tasks' ? '#FFFFFF' : 'transparent',
                  color: activeTab === 'tasks' ? '#BD1D2D' : '#64748B',
                  boxShadow: activeTab === 'tasks' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                Danh sách ({filteredTasks.length})
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{
          padding: '1.5rem 1.75rem',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          backgroundColor: '#F8FAFC'
        }} className="custom-scrollbar">

          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', opacity: 0.7 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="animate-pulse" style={{
                    padding: '1rem',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#FFFFFF',
                    height: '104px'
                  }} />
                ))}
              </div>
            </div>
          ) : activeTab === 'overview' ? (
            <>
              {/* 1. CHƯƠNG V 4-CARD KPI GRID (Card 1/3/4 Slate Ink #0F172A, Card 2 Brand Red #BD1D2D) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px'
              }}>
                {/* Card 1: Tổng công việc */}
                <div style={{
                  padding: '1.15rem',
                  borderRadius: '16px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B' }}>
                      Tổng công việc
                    </span>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckSquare size={16} />
                    </div>
                  </div>
                  <div style={{ fontSize: '1.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#0F172A' }}>
                    {stats.total}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    • Đến hạn hôm nay: <strong style={{ color: '#0F172A' }}>{stats.dueToday}</strong>
                  </span>
                </div>

                {/* Card 2: Đã hoàn thành (Brand Red #BD1D2D emphasis) */}
                <div style={{
                  padding: '1.15rem',
                  borderRadius: '16px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B' }}>
                      Đã hoàn thành
                    </span>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircle2 size={16} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '1.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#BD1D2D' }}>
                      {stats.done}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#BD1D2D' }}>
                      ({stats.completionRate}%)
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    • Đang triển khai: <strong style={{ color: '#0F172A' }}>{stats.inProgress}</strong>
                  </span>
                </div>

                {/* Card 3: Quá hạn xử lý */}
                <div style={{
                  padding: '1.15rem',
                  borderRadius: '16px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B' }}>
                      Quá hạn xử lý
                    </span>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ShieldAlert size={16} />
                    </div>
                  </div>
                  <div style={{ fontSize: '1.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#0F172A' }}>
                    {stats.overdue}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    • Khẩn cấp / Cao: <strong style={{ color: '#0F172A' }}>{stats.urgent}</strong>
                  </span>
                </div>

                {/* Card 4: Chờ duyệt & Chưa bắt đầu */}
                <div style={{
                  padding: '1.15rem',
                  borderRadius: '16px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B' }}>
                      Chờ phê duyệt
                    </span>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Award size={16} />
                    </div>
                  </div>
                  <div style={{ fontSize: '1.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#0F172A' }}>
                    {stats.pendingApproval}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    • Chưa bắt đầu: <strong style={{ color: '#0F172A' }}>{stats.notStarted}</strong>
                  </span>
                </div>
              </div>

              {/* 2. Breakdown & Brand Red/Slate Stacked Workload Chart */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
                gap: '1.25rem'
              }}>
                {/* Recharts Stacked BarChart (Brand Red & Executive Slate) */}
                <div style={{
                  padding: '1.25rem',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingUp size={16} style={{ color: '#BD1D2D' }} strokeWidth={1.75} />
                    Phân bổ Tải công việc Theo Nhân sự
                  </h4>
                  {stats.chartData.length === 0 ? (
                    <div style={{ height: '210px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.82rem' }}>
                      Chưa có dữ liệu tải công việc trong kỳ đã chọn
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '220px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.chartData} margin={{ top: 18, right: 8, left: -18, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '12px', boxShadow: '0 8px 20px rgba(15,23,42,0.08)' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Bar dataKey="Hoàn thành" stackId="workload" fill="#334155" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="Đang làm" stackId="workload" fill="#94A3B8" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="Quá hạn" stackId="workload" fill="#C6333D" radius={[4, 4, 0, 0]}>
                            <LabelList dataKey="total" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#0F172A' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Progress & Priority Breakdown (Ch.V Slate & Brand Red) */}
                <div style={{
                  padding: '1.25rem',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px'
                }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.85rem 0', fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={16} style={{ color: '#BD1D2D' }} strokeWidth={1.75} />
                      Tiến độ & Mức độ ưu tiên
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px', color: '#334155' }}>
                          <span>Công việc hoàn thành</span>
                          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#BD1D2D' }}>
                            {stats.done}/{stats.total} việc ({stats.completionRate}%)
                          </span>
                        </div>
                        <div style={{ width: '100%', height: '6px', backgroundColor: '#F1F5F9', borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ width: `${stats.completionRate}%`, height: '100%', backgroundColor: '#C6333D', borderRadius: '99px' }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px', color: '#334155' }}>
                          <span>Đang triển khai</span>
                          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                            {stats.inProgress} việc ({stats.total > 0 ? Math.round((stats.inProgress / stats.total) * 100) : 0}%)
                          </span>
                        </div>
                        <div style={{ width: '100%', height: '6px', backgroundColor: '#F1F5F9', borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ width: `${stats.total > 0 ? (stats.inProgress / stats.total) * 100 : 0}%`, height: '100%', backgroundColor: '#334155', borderRadius: '99px' }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#C6333D' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0F172A' }}>Khẩn cấp / Cao</span>
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#BD1D2D' }}>{stats.urgent} việc</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#475569' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0F172A' }}>Trung bình / Tiêu chuẩn</span>
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#0F172A' }}>{stats.normal} việc</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94A3B8' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0F172A' }}>Thấp / Khi rảnh</span>
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#64748B' }}>{stats.low} việc</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Assignee Leaderboard / Team Performance with 1-click Điều phối lại */}
              <div style={{
                padding: '1.25rem',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={16} style={{ color: '#BD1D2D' }} strokeWidth={1.75} />
                    {isPersonalOnly
                      ? 'Hiệu suất cá nhân của bạn'
                      : isManager
                        ? 'Thống kê hiệu suất đội ngũ quản lý'
                        : 'Thống kê hiệu suất theo Nhân sự thực hiện'}
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                    {isPersonalOnly
                      ? 'Chỉ tính công việc được phân công cho bạn'
                      : `${stats.userLeaderboard.length} nhân sự có việc trong kỳ`}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }} className="custom-scrollbar">
                  {ensureArray(stats?.userLeaderboard).map((item, idx) => {
                    const uRate = item.total > 0 ? Math.round((item.done / item.total) * 100) : 0;
                    const barColor = uRate >= 80 ? '#10b981' : uRate >= 50 ? '#f59e0b' : '#ef4444';
                    return (
                      <div
                        key={item.user.id || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '9px 12px',
                          borderRadius: '12px',
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          gap: '12px',
                          flexWrap: 'wrap'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '185px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: idx === 0 ? '#BD1D2D' : '#64748B', width: '22px' }}>
                            #{idx + 1}
                          </span>
                          <Avatar src={item.user.avatar_url || item.user.avatar} name={item.user.full_name} size={30} />
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: '0.825rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.user.full_name}
                            </div>
                            <div style={{ fontSize: '0.69rem', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                              Chính: {item.total} việc{item.subtasksAssigned > 0 ? ` • Việc phụ: ${item.subtasksAssigned}` : ''}
                            </div>
                          </div>
                        </div>

                        <div style={{ flex: 1, minWidth: '160px', maxWidth: '240px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                            <span style={{ color: '#334155' }}>Xong: {item.done}</span>
                            {item.overdue > 0 && <span style={{ color: '#C6333D', fontWeight: 700 }}>Trễ: {item.overdue}</span>}
                            <span style={{ color: '#64748B' }}>{uRate}%</span>
                          </div>
                          <div style={{ width: '100%', height: '6px', backgroundColor: '#E2E8F0', borderRadius: '99px', overflow: 'hidden' }}>
                            <div style={{ width: `${uRate}%`, height: '100%', backgroundColor: barColor, borderRadius: '99px' }} />
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {!isPersonalOnly && item.overdue > 0 && item.firstOverdueTaskId !== null && reassignOptions.length > 1 && (
                            <select
                              aria-label="Điều phối nhanh việc quá hạn"
                              defaultValue=""
                              disabled={reassigningTaskId === item.firstOverdueTaskId}
                              onChange={(e) => {
                                const newUid = Number(e.target.value);
                                if (newUid && item.firstOverdueTaskId) {
                                  handleQuickReassign(item.firstOverdueTaskId, newUid);
                                }
                                e.target.value = '';
                              }}
                              style={{
                                height: '30px',
                                padding: '0 8px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                color: '#334155',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                              title="1-click điều phối lại việc quá hạn"
                            >
                              <option value="">Điều phối lại...</option>
                              {reassignOptions
                                .filter((uOpt) => String(uOpt.id) !== String(item.user.id))
                                .map((uOpt) => (
                                  <option key={uOpt.id} value={uOpt.id}>{uOpt.name}</option>
                                ))}
                            </select>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAssignee(String(item.user.id));
                              setActiveTab('tasks');
                            }}
                            style={{
                              border: 'none',
                              background: 'rgba(189, 29, 45, 0.08)',
                              color: '#BD1D2D',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 12px',
                              borderRadius: '8px',
                            }}
                          >
                            Xem việc <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* TAB 2: DETAILED FILTERED TASKS LIST WITH BACK BUTTON + 1-CLICK REASSIGN */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: '14px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                gap: '12px',
                flexWrap: 'wrap'
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('overview');
                    setSelectedAssignee('all');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #BD1D2D',
                    backgroundColor: 'rgba(189, 29, 45, 0.06)',
                    color: '#BD1D2D',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={16} />
                  <span>Quay lại Thống kê Tổng quan</span>
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {selectedAssigneeObj && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '20px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.75rem',
                      fontWeight: 600
                    }}>
                      <Avatar src={selectedAssigneeObj.avatar_url || selectedAssigneeObj.avatar} name={selectedAssigneeObj.full_name} size={18} />
                      <span>{selectedAssigneeObj.full_name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedAssignee('all')}
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#64748B', display: 'flex' }}
                        title="Bỏ lọc theo nhân sự này"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Tìm thấy <strong>{filteredTasks.length}</strong> công việc
                  </span>
                </div>
              </div>

              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Tìm theo tên công việc, khách hàng, mô tả..."
                  value={searchKeyword}
                  onChange={e => setSearchKeyword(e.target.value)}
                  style={{
                    height: '38px',
                    fontSize: '0.82rem',
                    paddingLeft: '34px',
                    borderRadius: '10px',
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0'
                  }}
                />
                <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#64748B', pointerEvents: 'none' }} />
              </div>

              {filteredTasks.length === 0 ? (
                <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748B', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                  <CheckSquare size={32} style={{ opacity: 0.35, marginBottom: '0.5rem' }} />
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>Không có công việc nào trong kỳ và bộ lọc đã chọn.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '520px', overflowY: 'auto' }} className="custom-scrollbar">
                  {filteredTasks.map(task => {
                    const isDone = task.status === 'done' ||
                                   task.status === 'completed' ||
                                   task.progress === 100 ||
                                   (task.status && task.status.toLowerCase().includes('hoàn thành')) ||
                                   (task.status && task.status.toLowerCase().includes('xong'));
                    const dueObj = parseTaskDate(task.due_date);
                    const todayStart = new Date();
                    todayStart.setHours(0, 0, 0, 0);
                    const isOverdue = !isDone && Boolean(dueObj && dueObj < todayStart);
                    const assignee = users.find((u: any) => String(u.id) === String(task.user_id));

                    return (
                      <div
                        key={task.id}
                        onClick={() => {
                          if (onSelectTask) {
                            onClose();
                            onSelectTask(task);
                          }
                        }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '14px',
                          backgroundColor: '#FFFFFF',
                          border: isOverdue && !isDone ? '1px solid rgba(198, 51, 61, 0.35)' : '1px solid #E2E8F0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          cursor: onSelectTask ? 'pointer' : 'default',
                          transition: 'box-shadow 0.15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(15, 23, 42, 0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: isDone ? '#334155' : (isOverdue ? '#C6333D' : '#94A3B8'),
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {isDone ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{
                              fontSize: '0.85rem',
                              fontWeight: 700,
                              color: '#0F172A',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              textDecoration: isDone ? 'line-through' : 'none',
                              opacity: isDone ? 0.7 : 1
                            }}>
                              {task.subject}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                              {task.contact_name && <span>Khách: <strong style={{ color: '#0F172A' }}>{task.contact_name}</strong></span>}
                              {task.due_date && (
                                <span style={{ color: isOverdue && !isDone ? '#C6333D' : 'inherit', fontWeight: isOverdue && !isDone ? 700 : 400 }}>
                                  Hạn: {String(task.due_date).slice(0, 10)}
                                </span>
                              )}
                              <span>Tiến độ: {task.progress || 0}%</span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                          {!isPersonalOnly && !isDone && reassignOptions.length > 0 && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <ArrowRightLeft size={12} style={{ color: '#64748B' }} />
                              <select
                                aria-label="Điều phối người làm"
                                value={String(task.user_id || '')}
                                disabled={reassigningTaskId === Number(task.id)}
                                onChange={(e) => {
                                  const nextUid = Number(e.target.value);
                                  if (nextUid && nextUid !== Number(task.user_id)) {
                                    handleQuickReassign(Number(task.id), nextUid);
                                  }
                                }}
                                style={{
                                  height: '28px',
                                  borderRadius: '8px',
                                  border: '1px solid #E2E8F0',
                                  backgroundColor: '#F8FAFC',
                                  color: '#0F172A',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  padding: '0 6px',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="">Chọn...</option>
                                {reassignOptions.map((uOpt) => (
                                  <option key={uOpt.id} value={uOpt.id}>{uOpt.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {assignee && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title={`Người làm: ${assignee.full_name}`}>
                              <Avatar src={assignee.avatar_url || assignee.avatar} name={assignee.full_name} size={24} />
                              <span style={{ fontSize: '0.725rem', fontWeight: 600, color: '#64748B' }}>{String(assignee.full_name || '').split(' ').slice(-1)[0]}</span>
                            </div>
                          )}
                          <ArrowUpRight size={15} style={{ color: '#64748B' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{
          padding: '0.875rem 1.75rem',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#FFFFFF'
        }}>
          <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
            Đang hiển thị <strong>{filteredTasks.length}</strong> công việc phù hợp với bộ lọc kỳ này
          </span>
          <button
            type="button"
            className="btn primary"
            onClick={onClose}
            style={{
              padding: '0 18px',
              height: '36px',
              fontSize: '0.82rem',
              fontWeight: 700,
              borderRadius: '10px',
              backgroundColor: '#BD1D2D',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { withRouterFreezer } from '../components/RouterFreezer';
import { Users, Plus, Trash2, Mail, MessageCircle, UserX, Clock, X, User, Send, Check, RefreshCw, BarChart2, Calendar, CheckCircle, Building2, ChevronLeft, ChevronRight, Search, Phone, Info, TrendingUp, Paperclip, Link2, File as FileIcon, Folder, Download, MoreHorizontal, ExternalLink, Copy, Smartphone, Target } from 'lucide-react';
import { SalesTargetModal } from '../components/Dashboard/SalesTargetModal';
import toast from 'react-hot-toast';
import { CustomModal } from '../components/ui/CustomModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Avatar } from '../components/ui/Avatar';
import { fetchAPI } from '../utils/api';
import api from '../api/axios';
import { AccountDetailDrawer } from '../components/AccountDetailDrawer';
import { MentionInput } from '../components/ui/MentionInput';
import styles from './EntityDrawer.module.css';
import { compressToWebP } from '../utils/imageCompress';
import { useUploadProgress } from '../contexts/UploadProgressContext';
import { TableRowSkeleton } from '../components/ui/Skeleton';
import { AddressSelect } from '../components/ui/AddressSelect';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CopyButton } from '../components/ui/CopyButton';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { QRCodeCanvas } from 'qrcode.react';
import { ensureArray, extractArray } from '../utils/safeArray';
import { ResponsiveSegmentedTabs } from '../components/ui/MobileResponsiveTabs';
import { ConsultantStatsModal } from '../components/crm/ConsultantStatsModal';
import { getTenantLogoUrl } from '../contexts/TenantConfigContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { formatDateTimeVN } from '../utils/dateUtils';
import { pushOverlay } from '../utils/overlayStack';
import { isSystemAdmin, isExecutive, isManagement, isHR, canManageSystemSettings } from '../utils/roleUtils';
import { DomKpiTile, DomToolbarButton } from '../components/Dashboard/DomationDashboardKit';

interface ConsultantsKpiStripProps {
  isMobile: boolean;
  loading: boolean;
  totalCount: number;
  activeCount: number;
  leaveCount: number;
  inactiveCount: number;
  t: (k: string) => string;
}

const ConsultantsKpiStrip: React.FC<ConsultantsKpiStripProps> = React.memo(({
  isMobile,
  loading,
  totalCount,
  activeCount,
  leaveCount,
  inactiveCount,
  t,
}) => {
  if (isMobile) return null;
  return (
    <div className="responsive-grid-4 dashboard-kpi-grid" style={{ marginBottom: '1.5rem' }}>
      <DomKpiTile
        label={t('Tổng nhân sự')}
        value={totalCount}
        icon={<Users size={16} />}
        accent="brand"
        loading={loading}
      />
      <DomKpiTile
        label={t('Đang hoạt động')}
        value={activeCount}
        icon={<CheckCircle size={16} />}
        accent="brand"
        valueTone="brand"
        loading={loading}
      />
      <DomKpiTile
        label={t('Đang nghỉ phép')}
        value={leaveCount}
        icon={<Calendar size={16} />}
        accent="slate"
        loading={loading}
      />
      <DomKpiTile
        label={t('Ngừng hoạt động')}
        value={inactiveCount}
        icon={<UserX size={16} />}
        accent="slate"
        loading={loading}
      />
    </div>
  );
});

interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'inactive';
  telegram_id: string | null;
  zalo_chat_id: string | null;
  telegram_chat_id: string | null;
  created_at: string;
}

const dayNames: { [key: string]: string } = {
  "1": "Thứ 2",
  "2": "Thứ 3",
  "3": "Thứ 4",
  "4": "Thứ 5",
  "5": "Thứ 6",
  "6": "Thứ 7",
  "7": "Chủ Nhật"
};

const formatScheduleTooltip = (schedule: any, t: any): string => {
  if (!schedule) return '';
  return Object.entries(dayNames).map(([dayKey, dayLabel]) => {
    const config = schedule[dayKey];
    if (!config) return `${t(dayLabel)}: ${t('Không hoạt động')}`;
    if (!config.active) return `${t(dayLabel)}: ${t('Nghỉ')}`;
    return `${t(dayLabel)}: ${config.start} - ${config.end}`;
  }).join('\n');
};

const parseCoLeaderIds = (raw: unknown): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  const str = String(raw).trim();
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // Fallback to comma-separated string
  }
  return str.split(',').map((s) => s.trim()).filter(Boolean);
};

const parseSafeDate = (raw: string | null | undefined): Date | null => {
  if (!raw) return null;
  const normalized = String(raw).trim().replace('T', ' ').replace(/-/g, '/');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  return d;
};

const ConsultantsInner = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isWriteAuthorized = isSystemAdmin(user) || isManagement(user) || isHR(user) || canManageSystemSettings(user);
  const presenceOnlineTtlMin = useTypedSubSetting<number>('crm.presence_and_heartbeat_ttl', 'user_online_min', 5);
  const configuredConsultantsPageSize = useTypedSubSetting<number>('crm.ui_list_page_sizes_and_limits', 'consultants', 8);

  const renderLastLogin = (lastLoginStr: string | null) => {
    if (!lastLoginStr) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#b5b5c3' }} />
          <span>{t('Chưa truy cập')}</span>
        </div>
      );
    }
    const lastLoginDate = parseSafeDate(lastLoginStr);
    if (!lastLoginDate) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#b5b5c3' }} />
          <span>{t('Chưa truy cập')}</span>
        </div>
      );
    }
    const now = new Date();
    const diffMins = Math.abs(now.getTime() - lastLoginDate.getTime()) / (1000 * 60);

    if (diffMins < Math.max(1, presenceOnlineTtlMin)) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '0.78rem', fontWeight: 600 }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 8px #10b981'
          }} />
          <span>{t('Đang hoạt động')}</span>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text)', fontSize: '0.78rem' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#b5b5c3' }} />
        <span>{formatDateTimeVN(lastLoginStr)}</span>
      </div>
    );
  };
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const handleThemeChange = () => {
      const nextTheme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setTheme(nextTheme);
    };
    window.addEventListener('theme-change', handleThemeChange);
    return () => window.removeEventListener('theme-change', handleThemeChange);
  }, []);

  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [allSystemUsers, setAllSystemUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [salesTargetModalOpen, setSalesTargetModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMobileTabMenu, setShowMobileTabMenu] = useState(false);

  const [unlinkId, setUnlinkId] = useState<number | null>(null);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);

  // Quick message state
  const [quickMessageOpen, setQuickMessageOpen] = useState(false);
  const [quickMessageTarget] = useState<any>(null);
  const [quickMessageText, setQuickMessageText] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // Consultant stats & link attach modal state
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [statsConsultant, setStatsConsultant] = useState<any>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showLinkInputModal, setShowLinkInputModal] = useState(false);
  const [linkInputUrl, setLinkInputUrl] = useState('https://');
  const [linkInputTitle, setLinkInputTitle] = useState('');
  const [linkInputError, setLinkInputError] = useState('');

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const showAllTabs = true;
  const activeTabRaw = queryParams.get('tab') || (queryParams.get('team_id') ? 'teams' : 'consultants');
  const activeTab = activeTabRaw === 'teams' ? 'teams' : 'consultants';

  const uploadProgress = useUploadProgress();
  const startUpload = uploadProgress?.startUpload;
  const updateProgress = uploadProgress?.updateProgress;
  const finishUpload = uploadProgress?.finishUpload;

  const [teams, setTeams] = useState<any[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const isLeaderOfEditingTeam = useMemo(() => {
    if (!editingTeam || !user?.id) return false;
    if (String(editingTeam.leader_id) === String(user.id)) return true;
    return parseCoLeaderIds(editingTeam.co_leader_ids).includes(String(user.id));
  }, [editingTeam, user]);

  const canEditTeam = isWriteAuthorized || isLeaderOfEditingTeam;
  const [isUploadingTeamAvatar, setIsUploadingTeamAvatar] = useState(false);
  const [teamFormData, setTeamFormData] = useState({
    name: '',
    avatar_url: '',
    branch: '',
    leader_id: '',
    co_leader_ids: [] as string[],
    description: '',
    kpi_target: '',
    max_members: '',
    focus_projects: [] as string[],
    member_ids: [] as string[]
  });

  const handleUploadTeamAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIsUploadingTeamAvatar(true);
    const taskId = startUpload ? startUpload(file.name) : null;
    try {
      if (taskId && updateProgress) updateProgress(taskId, 15, 'compressing');
      const compressedFile = await compressToWebP(file);
      if (taskId && updateProgress) updateProgress(taskId, 40, 'uploading');

      const fd = new FormData();
      fd.append('file', compressedFile);
      if (teamFormData.avatar_url) {
        fd.append('previous_url', teamFormData.avatar_url);
      }

      const res = await api.post('/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (evt.total && taskId && updateProgress) {
            const pct = Math.round(40 + (evt.loaded / evt.total) * 50);
            updateProgress(taskId, pct, 'uploading');
          }
        }
      });

      const fileUrl = res.data?.url || res.data?.file_url || res.data?.path || res.data?.data?.url;
      if (fileUrl) {
        if (taskId && finishUpload) finishUpload(taskId, true);
        setTeamFormData(prev => ({ ...prev, avatar_url: fileUrl }));
        toast.success(t('Đã tải lên avatar nhóm thành công!'));
      } else {
        throw new Error(res.data?.message || 'Upload failed');
      }
    } catch (err: any) {
      if (taskId && finishUpload) finishUpload(taskId, false, err.message || 'Upload error');
      toast.error(t('Lỗi tải ảnh avatar: ') + (err.message || err));
    } finally {
      setIsUploadingTeamAvatar(false);
    }
  };
  const [searchLeader, setSearchLeader] = useState('');
  const [searchCoLeader, setSearchCoLeader] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [showLeaderDropdown, setShowLeaderDropdown] = useState(false);
  const [showCoLeaderDropdown, setShowCoLeaderDropdown] = useState(false);
  const leaderDropdownRef = useRef<HTMLDivElement>(null);
  const coLeaderDropdownRef = useRef<HTMLDivElement>(null);
  const [showAddMemberDropdown, setShowAddMemberDropdown] = useState(false);
  const addMemberDropdownRef = useRef<HTMLDivElement>(null);
  const [confirmDeleteTeamOpen, setConfirmDeleteTeamOpen] = useState(false);
  const [deleteTeamId, setDeleteTeamId] = useState<number | null>(null);
  const [confirmLeaveTeamOpen, setConfirmLeaveTeamOpen] = useState(false);
  const [isLeavingTeam, setIsLeavingTeam] = useState(false);
  const [teamDrawerTab, setTeamDrawerTab] = useState<'info' | 'members' | 'comments'>('info');
  const [teamComments, setTeamComments] = useState<any[]>([]);
  const [loadingTeamComments, setLoadingTeamComments] = useState(false);
  const [newTeamCommentText, setNewTeamCommentText] = useState('');
  const [isSubmittingTeamComment, setIsSubmittingTeamComment] = useState(false);
  const [teamReplyTo, setTeamReplyTo] = useState<{ id: number; userName: string } | null>(null);
  const [teamCommentAttachments, setTeamCommentAttachments] = useState<any[]>([]);
  const [isUploadingCommentFile, setIsUploadingCommentFile] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);
  
  const [consultantsPage, setConsultantsPage] = useState(1);
  const [teamsPage, setTeamsPage] = useState(1);
  const ITEMS_PER_PAGE = Math.max(1, Number(configuredConsultantsPageSize) || 8);

  const [zaloBotLink, setZaloBotLink] = useState<string>('');
  const [telegramBotUsername, setTelegramBotUsername] = useState<string>('');
  const [isZaloModalOpen, setIsZaloModalOpen] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const usersAbortRef = useRef<AbortController | null>(null);
  const teamsAbortRef = useRef<AbortController | null>(null);
  const systemUsersAbortRef = useRef<AbortController | null>(null);
  const projectsAbortRef = useRef<AbortController | null>(null);
  const teamCommentsAbortRef = useRef<AbortController | null>(null);
  const handledOpenIdRef = useRef<string | null>(null);
  const highlightTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const teamCommentAttachmentsRef = useRef<any[]>([]);
  // Per-action in-flight guards to prevent concurrent submissions
  const inFlightCommentRef = useRef(false);
  const inFlightDeleteRef = useRef(false);
  const inFlightTeamRef = useRef(false);
  const inFlightQuickMsgRef = useRef(false);
  const inFlightLeaveTeamRef = useRef(false);
  const inFlightUnlinkRef = useRef(false);

  useEffect(() => {
    teamCommentAttachmentsRef.current = teamCommentAttachments;
  }, [teamCommentAttachments]);

  const revokeCommentAttachmentUrls = (items: any[]) => {
    ensureArray(items).forEach((att: any) => {
      if (att?.previewUrl) {
        try { URL.revokeObjectURL(att.previewUrl); } catch { /* ignore */ }
      }
    });
  };

  useEffect(() => {
    return () => {
      usersAbortRef.current?.abort();
      teamsAbortRef.current?.abort();
      systemUsersAbortRef.current?.abort();
      projectsAbortRef.current?.abort();
      teamCommentsAbortRef.current?.abort();
      highlightTimersRef.current.forEach(clearTimeout);
      revokeCommentAttachmentUrls(teamCommentAttachmentsRef.current);
    };
  }, []);

  // RouterFreezer guard: close local overlays if navigating away from /consultants
  useEffect(() => {
    if (!location.pathname.startsWith('/consultants')) {
      setModalOpen(false);
      setSalesTargetModalOpen(false);
      setStatsModalOpen(false);
      setQuickMessageOpen(false);
      setTeamModalOpen(false);
      setShowInfoModal(false);
      setIsZaloModalOpen(false);
      setConfirmDeleteOpen(false);
      setConfirmDeleteTeamOpen(false);
      setConfirmLeaveTeamOpen(false);
      setUnlinkConfirmOpen(false);
      setShowLinkInputModal(false);
    }
  }, [location.pathname]);

  // ESC & scroll-lock via overlayStack for Team drawer & Quick Message modal
  useEffect(() => {
    if (!teamModalOpen) {
      teamCommentsAbortRef.current?.abort();
      revokeCommentAttachmentUrls(teamCommentAttachmentsRef.current);
      setTeamCommentAttachments([]);
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const unregister = pushOverlay('team-detail-drawer', () => setTeamModalOpen(false), 2147483625);
    return () => {
      unregister();
      document.body.style.overflow = prevOverflow;
    };
  }, [teamModalOpen]);

  useEffect(() => {
    if (!quickMessageOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const unregister = pushOverlay('consultants-quick-message-modal', () => setQuickMessageOpen(false), 2147483646);
    return () => {
      unregister();
      document.body.style.overflow = prevOverflow;
    };
  }, [quickMessageOpen]);

  useEffect(() => {
    const controller = new AbortController();
    fetchAPI('notifications/settings', { signal: controller.signal })
      .then(res => {
        if (!controller.signal.aborted && res && res.success && res.data?.user_info) {
          if (res.data.user_info.zalo_bot_link) setZaloBotLink(res.data.user_info.zalo_bot_link);
          if (res.data.user_info.telegram_bot_username) setTelegramBotUsername(res.data.user_info.telegram_bot_username);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const handleConnectZalo = () => {
    const link = zaloBotLink.trim();
    if (!link) {
      toast.error('Hệ thống chưa setup nhận thông báo qua Zalobot');
      return;
    }
    setIsZaloModalOpen(true);
  };

  const handleConnectTelegram = (userId: number) => {
    const username = telegramBotUsername.trim();
    if (!username) {
      toast.error('Hệ thống chưa setup nhận thông báo qua Telegram Bot');
      return;
    }
    window.open(`https://t.me/${username}?start=connect_${userId}`, '_blank', 'noopener,noreferrer');
  };

  const fetchTeams = async () => {
    teamsAbortRef.current?.abort();
    const controller = new AbortController();
    teamsAbortRef.current = controller;
    setTeamsLoading(true);
    try {
      const json = await fetchAPI('teams', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (json.success) setTeams(ensureArray(json.data));
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      toast.error(t('Không thể tải danh sách nhóm: ') + e.message);
    } finally {
      if (!controller.signal.aborted) setTeamsLoading(false);
    }
  };

  const fetchUsers = async () => {
    usersAbortRef.current?.abort();
    const controller = new AbortController();
    usersAbortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    try {
      const json = await fetchAPI('get_consultants', { signal });
      if (signal.aborted) return;
      if (json.success) setUsers(ensureArray(json.data));
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      toast.error(t('Không thể tải dữ liệu: ') + e.message);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  };

  const fetchAllSystemUsers = async () => {
    systemUsersAbortRef.current?.abort();
    const controller = new AbortController();
    systemUsersAbortRef.current = controller;
    try {
      const json = await fetchAPI('get_accounts', { signal: controller.signal });
      if (!controller.signal.aborted && json && json.success) {
        setAllSystemUsers(ensureArray(json.data));
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      console.error('Failed to fetch system users:', e);
    }
  };

  const fetchProjects = async () => {
    projectsAbortRef.current?.abort();
    const controller = new AbortController();
    projectsAbortRef.current = controller;
    try {
      const json = await fetchAPI('projects', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (json && json.success && Array.isArray(json.data)) {
        setProjects(json.data);
      } else if (json && Array.isArray(json)) {
        setProjects(json);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      console.error('Failed to fetch projects:', e);
    }
  };

  const fetchTeamComments = async (teamId: number) => {
    teamCommentsAbortRef.current?.abort();
    const controller = new AbortController();
    teamCommentsAbortRef.current = controller;
    setLoadingTeamComments(true);
    try {
      const res = await api.get(`/teams/${teamId}/comments`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const list = extractArray(res?.data);
      setTeamComments(list);
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      console.error('Failed to fetch team comments:', e);
      toast.error(t('Không thể tải bình luận nhóm'));
    } finally {
      if (!controller.signal.aborted) setLoadingTeamComments(false);
    }
  };

  const addLocalTeamCommentAttachment = (file: File) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error(t('Dung lượng tệp đính kèm không được vượt quá 50MB'));
      return;
    }
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    setTeamCommentAttachments(prev => [...prev, { file, name: file.name, previewUrl }]);
    toast.success(t('Đã thêm tệp đính kèm!'));
  };

  const handleAttachCommentFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) addLocalTeamCommentAttachment(file);
    e.target.value = '';
  };

  const removeTeamCommentAttachment = (index: number) => {
    setTeamCommentAttachments(prev => {
      const target = prev[index];
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handlePostTeamComment = async (teamId: number) => {
    if (!newTeamCommentText.trim() && teamCommentAttachments.length === 0) return;
    if (isSubmittingTeamComment || inFlightCommentRef.current) return;
    inFlightCommentRef.current = true;
    setIsSubmittingTeamComment(true);
    setIsUploadingCommentFile(true);

    try {
      const processedAttachments: { name: string; url: string }[] = [];
      for (const att of teamCommentAttachments) {
        if (att.url) {
          processedAttachments.push({ name: att.name, url: att.url });
        } else if (att.file) {
          const fd = new FormData();
          fd.append('file', att.file);
          const res = await api.post('/upload', fd);
          const fileUrl = res.data?.data?.url || res.data?.url || res.data?.data?.file_path || res.data?.file_path;
          if (fileUrl) {
            processedAttachments.push({ name: att.name, url: fileUrl });
            if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
          } else {
            throw new Error(t('Không nhận được đường dẫn tệp tải lên'));
          }
        }
      }

      let finalBody = newTeamCommentText.trim();

      if (processedAttachments.length > 0) {
        const attachmentLines = processedAttachments.map(att => `📎 [${att.name}](${att.url})`).join('\n');
        finalBody = finalBody ? `${finalBody}\n${attachmentLines}` : attachmentLines;
      }

      const parentId = teamReplyTo ? teamReplyTo.id : null;
      await api.post(`/teams/${teamId}/comments`, {
        body: finalBody,
        parent_id: parentId
      });

      // Clear draft only after successful POST
      setNewTeamCommentText('');
      setTeamReplyTo(null);
      setTeamCommentAttachments([]);
      toast.success(t('Đã gửi bình luận thành công'));
      fetchTeamComments(teamId);
    } catch (e: any) {
      console.error('Failed to post team comment:', e);
      toast.error(e.response?.data?.message || e.message || t('Lỗi khi gửi bình luận'));
    } finally {
      inFlightCommentRef.current = false;
      setIsSubmittingTeamComment(false);
      setIsUploadingCommentFile(false);
    }
  };

  const handleDeleteTeamComment = async (commentId: number) => {
    if (!editingTeam?.id) return;
    try {
      const res = await api.delete(`/teams/comments/${commentId}`);
      if (res.data?.success) {
        toast.success(t('Đã xóa bình luận!'));
        fetchTeamComments(editingTeam.id);
      } else {
        toast.error(res.data?.message || t('Không thể xóa bình luận'));
      }
    } catch (e: any) {
      toast.error(t('Lỗi khi xóa bình luận: ') + (e.response?.data?.message || e.message));
    }
  };

  const handleAttachCommentLink = () => {
    setLinkInputUrl('https://');
    setLinkInputTitle('');
    setLinkInputError('');
    setShowLinkInputModal(true);
  };

  const handleConfirmAttachLink = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = linkInputUrl.trim();
    if (!trimmedUrl || trimmedUrl === 'https://' || trimmedUrl === 'http://') {
      setLinkInputError(t('Vui lòng nhập địa chỉ liên kết (URL)'));
      return;
    }
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      setLinkInputError(t('Liên kết phải bắt đầu bằng https:// hoặc http://'));
      return;
    }
    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        setLinkInputError(t('Giao thức URL không hợp lệ'));
        return;
      }
    } catch {
      setLinkInputError(t('Địa chỉ URL không hợp lệ'));
      return;
    }
    const displayTitle = linkInputTitle.trim() || trimmedUrl;
    setTeamCommentAttachments(prev => [...prev, { name: displayTitle, url: trimmedUrl }]);
    setShowLinkInputModal(false);
    setLinkInputUrl('https://');
    setLinkInputTitle('');
    setLinkInputError('');
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (leaderDropdownRef.current && !leaderDropdownRef.current.contains(event.target as Node)) {
        setShowLeaderDropdown(false);
      }
      if (coLeaderDropdownRef.current && !coLeaderDropdownRef.current.contains(event.target as Node)) {
        setShowCoLeaderDropdown(false);
      }
      if (addMemberDropdownRef.current && !addMemberDropdownRef.current.contains(event.target as Node)) {
        setShowAddMemberDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchTeams();
    fetchAllSystemUsers();
    fetchProjects();
  }, []);

  useEffect(() => {
    if (editingTeam?.id && teamDrawerTab === 'comments') {
      fetchTeamComments(editingTeam.id);
    }
  }, [editingTeam, teamDrawerTab]);

  useEffect(() => {
    if (!location.pathname.startsWith('/consultants')) return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const teamIdParam = params.get('team_id') || (tabParam === 'teams' ? (params.get('open_id') || params.get('id')) : null);
    const hcId = params.get('highlight_comment_id') || params.get('comment_id');
    const subtab = params.get('subtab');

    if (teamIdParam) {
      const tid = Number(teamIdParam);
      const key = `team:${tid}:${hcId || ''}:${subtab || ''}`;
      if (tid > 0 && handledOpenIdRef.current !== key) {
        handledOpenIdRef.current = key;
        if (hcId || subtab === 'comments') {
          setTeamDrawerTab('comments');
        } else if (subtab === 'members') {
          setTeamDrawerTab('members');
        }
        openEditTeamModal({ id: tid });
        params.delete('team_id');
        params.delete('open_id');
        params.delete('id');
        params.delete('subtab');
        if (!params.get('tab')) params.set('tab', 'teams');
        const qs = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
      }
      return;
    }

    const userIdParam = params.get('open_id') || params.get('id');
    if (userIdParam && tabParam !== 'teams' && users.length > 0) {
      const key = `user:${userIdParam}`;
      if (handledOpenIdRef.current === key) return;
      const matchedUser = users.find((u: any) => String(u.id) === String(userIdParam));
      if (matchedUser) {
        handledOpenIdRef.current = key;
        openEditModal(matchedUser);
        params.delete('open_id');
        params.delete('id');
        const qs = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
      }
    }
  }, [location.pathname, location.search, teams.length, users.length]);

  useEffect(() => {
    if (!teamModalOpen || teamDrawerTab !== 'comments' || teamComments.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const hcId = params.get('highlight_comment_id') || params.get('comment_id');
    if (!hcId) return;

    highlightTimersRef.current.forEach(clearTimeout);
    highlightTimersRef.current = [];

    const timer = setTimeout(() => {
      const el = document.getElementById(`team-comment-${hcId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const bubble = (el.querySelector('div[style*="border-radius"]') as HTMLElement) || el;
        const origTransition = bubble.style.transition;
        const origBoxShadow = bubble.style.boxShadow;
        const origBg = bubble.style.backgroundColor;
        bubble.style.transition = 'all 0.4s ease';
        bubble.style.boxShadow = '0 0 0 2px #f59e0b, 0 4px 12px rgba(245, 158, 11, 0.25)';
        bubble.style.backgroundColor = 'rgba(254, 243, 199, 0.65)';
        const t1 = setTimeout(() => {
          bubble.style.boxShadow = origBoxShadow;
          bubble.style.backgroundColor = origBg;
          const t2 = setTimeout(() => { bubble.style.transition = origTransition; }, 400);
          highlightTimersRef.current.push(t2);
        }, 2800);
        highlightTimersRef.current.push(t1);
      }
      params.delete('highlight_comment_id');
      params.delete('comment_id');
      const qs = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
    }, 350);
    highlightTimersRef.current.push(timer);

    return () => {
      highlightTimersRef.current.forEach(clearTimeout);
      highlightTimersRef.current = [];
    };
  }, [teamComments, teamModalOpen, teamDrawerTab]);

  const openAddModal = () => {
    setEditingUser(null);
    setModalOpen(true);
  };

  const openEditModal = (targetUser: any) => {
    setEditingUser(targetUser);
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId || isDeleting || inFlightDeleteRef.current) return;
    inFlightDeleteRef.current = true;
    setIsDeleting(true);
    try {
      const json = await fetchAPI(`delete_consultant&id=${deleteId}`);
      if (json.success) {
        toast.success(t('Đã xóa thành công!'));
        fetchUsers();
      } else {
        toast.error(json.message || t('Lỗi khi xóa'));
      }
    } catch (e: any) { toast.error(t('Lỗi: ') + e.message); }
    finally {
      inFlightDeleteRef.current = false;
      setIsDeleting(false);
      setConfirmDeleteOpen(false);
      setDeleteId(null);
    }
  };

  const openAddTeamModal = () => {
    setEditingTeam(null);
    setTeamFormData({
      name: '',
      avatar_url: '',
      branch: '',
      leader_id: '',
      co_leader_ids: [],
      description: '',
      kpi_target: '',
      max_members: '',
      focus_projects: [],
      member_ids: []
    });
    setSearchLeader('');
    setSearchCoLeader('');
    setShowLeaderDropdown(false);
    setShowCoLeaderDropdown(false);
    setTeamModalOpen(true);
  };

  const openEditTeamModal = async (team: any) => {
    try {
      const res = await fetchAPI(`teams/${team.id}`);
      if (res && res.success && res.data) {
        const data = res.data;
        setEditingTeam(data);
        const memberIds = Array.isArray(data.members) ? data.members.map((m: any) => String(m.id)) : [];
        const focusProjects = data.focus_project ? String(data.focus_project).split(',').map((p: any) => p.trim()).filter(Boolean) : [];
        const coLeaderIds = parseCoLeaderIds(data.co_leader_ids);
        setTeamFormData({
          name: data.name,
          avatar_url: data.avatar_url || data.avatar || '',
          branch: data.branch || '',
          leader_id: data.leader_id || '',
          co_leader_ids: coLeaderIds,
          description: data.description || '',
          kpi_target: data.kpi_target !== null && data.kpi_target !== undefined ? String(data.kpi_target) : '',
          max_members: data.max_members !== null && data.max_members !== undefined ? String(data.max_members) : '',
          focus_projects: focusProjects,
          member_ids: memberIds
        });
        const leaderUser = allSystemUsers.find(u => Number(u.id) === Number(data.leader_id));
        setSearchLeader(leaderUser ? (leaderUser.full_name || leaderUser.name) : '');
        setSearchCoLeader('');
        setShowLeaderDropdown(false);
        setShowCoLeaderDropdown(false);
        setTeamModalOpen(true);
      } else {
        toast.error(res ? res.message : t('Lỗi không xác định khi tải dữ liệu'));
      }
    } catch (e: any) {
      toast.error(t('Không thể tải thông tin nhóm: ') + e.message);
    }
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamFormData.name) return toast.error(t('Vui lòng nhập tên nhóm'));
    if (isSaving || inFlightTeamRef.current) return;
    inFlightTeamRef.current = true;
    
    setIsSaving(true);
    try {
      const isEdit = !!editingTeam;
      const url = isEdit ? `teams/${editingTeam.id}` : 'teams';
      const method = isEdit ? 'PUT' : 'POST';
      
      const payload = {
        name: teamFormData.name,
        avatar_url: teamFormData.avatar_url,
        branch: teamFormData.branch,
        leader_id: teamFormData.leader_id,
        co_leader_ids: teamFormData.co_leader_ids,
        description: teamFormData.description,
        kpi_target: teamFormData.kpi_target,
        max_members: teamFormData.max_members,
        focus_project: teamFormData.focus_projects.join(', '),
        member_ids: teamFormData.member_ids
      };

      const res = await fetchAPI(url, {
        method,
        body: JSON.stringify(payload)
      });
      
      if (res.success) {
        toast.success(isEdit ? t('Cập nhật nhóm thành công!') : t('Tạo nhóm mới thành công!'));
        fetchTeams();
        fetchUsers();
        setTeamModalOpen(false);
      } else {
        toast.error(res.message || t('Lỗi khi lưu nhóm'));
      }
    } catch (e: any) {
      toast.error(t('Lỗi: ') + e.message);
    } finally {
      inFlightTeamRef.current = false;
      setIsSaving(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!deleteTeamId || isDeleting || inFlightTeamRef.current) return;
    inFlightTeamRef.current = true;
    setIsDeleting(true);
    try {
      const res = await fetchAPI(`teams/${deleteTeamId}`, { method: 'DELETE' });
      if (res.success) {
        toast.success(t('Đã xóa nhóm thành công!'));
        fetchTeams();
        fetchUsers();
      } else {
        toast.error(res.message || t('Lỗi khi xóa nhóm'));
      }
    } catch (e: any) {
      toast.error(t('Lỗi: ') + e.message);
    } finally {
      inFlightTeamRef.current = false;
      setIsDeleting(false);
      setConfirmDeleteTeamOpen(false);
      setDeleteTeamId(null);
    }
  };

  const handleLeaveTeam = async () => {
    if (inFlightLeaveTeamRef.current) return;
    inFlightLeaveTeamRef.current = true;
    setIsLeavingTeam(true);
    try {
      const res = await fetchAPI('teams/leave', { method: 'POST' });
      if (res.success) {
        toast.success(t('Bạn đã rời khỏi nhóm thành công!'));
        fetchTeams();
        fetchUsers();
        setTeamModalOpen(false);
      } else {
        toast.error(res.message || t('Lỗi khi rời khỏi nhóm'));
      }
    } catch (e: any) {
      toast.error(t('Lỗi: ') + e.message);
    } finally {
      inFlightLeaveTeamRef.current = false;
      setIsLeavingTeam(false);
      setConfirmLeaveTeamOpen(false);
    }
  };

  const handleUnlinkZalo = async () => {
    if (!unlinkId || inFlightUnlinkRef.current) return;
    inFlightUnlinkRef.current = true;
    try {
      const json = await fetchAPI('unlink_zalo', {
        method: 'POST',
        body: JSON.stringify({ id: unlinkId, type: 'consultant' })
      });
      if (json.success) {
        toast.success(t('Đã hủy liên kết Zalo thành công!'));
        fetchUsers();
        setEditingUser((prev: any) => prev ? { ...prev, zalo_chat_id: null } : null);
      } else {
        toast.error(json.message || t('Lỗi khi hủy liên kết'));
      }
    } catch (e: any) {
      toast.error(t('Lỗi: ') + e.message);
    } finally {
      inFlightUnlinkRef.current = false;
      setUnlinkConfirmOpen(false);
      setUnlinkId(null);
    }
  };
  const [zaloRemindingId, setZaloRemindingId] = useState<number | null>(null);
  const [zaloRemindedId, setZaloRemindedId] = useState<number | null>(null);

  const [tgRemindingId, setTgRemindingId] = useState<number | null>(null);
  const [tgRemindedId, setTgRemindedId] = useState<number | null>(null);

  const handleResendTelegramVerify = async (consId: number) => {
    setTgRemindingId(consId);
    try {
      const json = await fetchAPI('resend_telegram_verify_consultant', {
        method: 'POST',
        body: JSON.stringify({ id: consId })
      });
      if (json.success) {
        toast.success(t('Đã gửi email nhắc liên kết Telegram.'));
        setTgRemindedId(consId);
        setTimeout(() => setTgRemindedId(null), 5000);
      } else {
        toast.error(json.message || t('Lỗi khi gửi email'));
      }
    } catch (e: any) {
      toast.error(t('Lỗi: ') + e.message);
    }
    setTgRemindingId(null);
  };

  const handleResendZaloVerify = async (consId: number) => {
    setZaloRemindingId(consId);
    try {
      const json = await fetchAPI('resend_zalo_verify_consultant', {
        method: 'POST',
        body: JSON.stringify({ id: consId })
      });
      if (json.success) {
        toast.success(t('Đã gửi lại email nhắc xác thực Zalo.'));
        setZaloRemindedId(consId);
        setTimeout(() => setZaloRemindedId(null), 5000);
      } else {
        toast.error(json.message || t('Lỗi khi gửi email'));
      }
    } catch (e: any) {
      toast.error(t('Lỗi: ') + e.message);
    }
    setZaloRemindingId(null);
  };

  const handleSendQuickMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickMessageText.trim() || !quickMessageTarget || isSendingMsg || inFlightQuickMsgRef.current) return;
    inFlightQuickMsgRef.current = true;
    setIsSendingMsg(true);
    try {
      const res = await fetchAPI('send_quick_zalo_message', {
        method: 'POST',
        body: JSON.stringify({ consultant_id: quickMessageTarget.id, message: quickMessageText })
      });
      if (res.success) {
        toast.success(res.message || t('Đã gửi tin nhắn thành công!'));
        setQuickMessageOpen(false);
        setQuickMessageText('');
      } else {
        toast.error(res.message || t('Lỗi khi gửi tin'));
      }
    } catch (e: any) {
      toast.error(t('Lỗi: ') + e.message);
    } finally {
      inFlightQuickMsgRef.current = false;
      setIsSendingMsg(false);
    }
  };

  const activeCount = users.filter(u => String(u.is_active) === '1' || (u.is_active === undefined && u.status === 'active')).length;
  const leaveCount = users.filter(u => u.status === 'leave').length;
  const inactiveCount = users.filter(u => String(u.is_active) === '0' || (u.is_active === undefined && u.status === 'inactive')).length;

  const filteredUsers = React.useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    let result = users;
    if (query) {
      result = users.filter(u => 
        (u.name && u.name.toLowerCase().includes(query)) ||
        (u.email && u.email.toLowerCase().includes(query)) ||
        (u.phone && u.phone.toLowerCase().includes(query))
      );
    }
    return [...result].sort((a, b) => {
      const aInactive = String(a.is_active) === '0' || a.status === 'inactive';
      const bInactive = String(b.is_active) === '0' || b.status === 'inactive';
      if (aInactive && !bInactive) return 1;
      if (!aInactive && bInactive) return -1;
      return (a.name || '').localeCompare(b.name || '', 'vi');
    });
  }, [users, searchQuery]);

  const paginatedUsers = React.useMemo(() => {
    const startIndex = (consultantsPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredUsers, consultantsPage, ITEMS_PER_PAGE]);

  const consultantsTotalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);

  const paginatedTeams = React.useMemo(() => {
    const startIndex = (teamsPage - 1) * ITEMS_PER_PAGE;
    return teams.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [teams, teamsPage, ITEMS_PER_PAGE]);

  const teamsTotalPages = Math.ceil(teams.length / ITEMS_PER_PAGE);

  useEffect(() => {
    setConsultantsPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (consultantsTotalPages > 0 && consultantsPage > consultantsTotalPages) {
      setConsultantsPage(consultantsTotalPages);
    }
  }, [consultantsPage, consultantsTotalPages]);

  useEffect(() => {
    if (teamsTotalPages > 0 && teamsPage > teamsTotalPages) {
      setTeamsPage(teamsTotalPages);
    }
  }, [teamsPage, teamsTotalPages]);

  return (
    <div className="anim-fade-up">
      {/* Header */}
      <div className={isMobile ? "" : "page-header"} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', width: '100%', gap: isMobile ? '10px' : '16px', marginBottom: isMobile ? '0.875rem' : '1.5rem', position: 'relative', zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: isMobile ? '1.125rem' : '1.75rem', flexWrap: 'wrap', margin: 0 }}>
              {activeTab === 'teams' ? t('Quản lý Phòng ban') : t('Nhân sự công ty')}
              <button
                onClick={() => setShowInfoModal(true)}
                style={{
                  background: 'rgba(0, 0, 0, 0.02)',
                  border: '1px solid var(--color-border)',
                  padding: '3px 8px',
                  borderRadius: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  transition: 'all 0.2s',
                  height: '24px'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'var(--color-primary)';
                  e.currentTarget.style.borderColor = 'var(--color-primary-light)';
                  e.currentTarget.style.background = 'var(--color-primary-light)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--color-text-muted)';
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.02)';
                }}
                title={t("Xem hướng dẫn thiết lập nhân sự, team và dự án trọng điểm")}
              >
                <Info size={12} style={{ marginTop: 1 }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{t("Cơ chế")}</span>
              </button>
            </h1>
            <p className="page-subtitle" style={{ fontSize: isMobile ? '0.75rem' : '0.8rem', margin: '2px 0 0 0' }}>
              {activeTab === 'teams'
                ? t('Danh sách phòng ban phân chia công việc và chỉ tiêu dự án')
                : t('Danh sách nhân sự tiếp nhận và xử lý data từ hệ thống')}
            </p>
          </div>
        </div>

        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            {showAllTabs && (
              <ResponsiveSegmentedTabs
                tabs={[
                  { id: 'consultants', label: t('Nhân sự'), icon: <User size={14} /> },
                  { id: 'teams', label: t('Phòng ban'), icon: <Users size={14} /> },
                ]}
                activeId={activeTab}
                onChange={(id) => navigate(`/consultants?tab=${id}`)}
                fullWidthOnMobile
              />
            )}
            {isWriteAuthorized && (
              activeTab === 'teams' ? (
                <button
                  onClick={openAddTeamModal}
                  className="btn primary"
                  style={{ width: '100%', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700, fontSize: '0.8125rem' }}
                >
                  <Plus size={16} />
                  <span>{t('Thêm Phòng ban')}</span>
                </button>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', width: '100%' }}>
                  <button
                    type="button"
                    onClick={() => setSalesTargetModalOpen(true)}
                    className="btn outline"
                    style={{
                      padding: '0 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      borderRadius: '8px',
                      height: '36px',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      color: '#0f172a',
                      borderColor: '#cbd5e1',
                      background: '#ffffff',
                      minWidth: 0,
                    }}
                  >
                    <Target size={14} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('Target TVV')}</span>
                  </button>
                  <button
                    onClick={openAddModal}
                    className="btn primary"
                    style={{ padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', borderRadius: '8px', height: '36px', fontWeight: 700, fontSize: '0.78rem', minWidth: 0 }}
                  >
                    <Plus size={15} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('Thêm tài khoản')}</span>
                  </button>
                </div>
              )
            )}
          </div>
        ) : (
          /* Desktop layout: Subtabs and Add Button side by side */
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', width: 'auto', justifyContent: 'flex-end' }}>
            {/* Tab bar (desktop) */}
            {showAllTabs && (
              <ResponsiveSegmentedTabs
                tabs={[
                  { id: 'consultants', label: t('Nhân sự'), icon: <User size={14} /> },
                  { id: 'teams', label: t('Phòng ban'), icon: <Users size={14} /> },
                ]}
                activeId={activeTab}
                onChange={(id) => navigate(`/consultants?tab=${id}`)}
              />
            )}

            {/* Action Button */}
            {isWriteAuthorized && activeTab === 'teams' ? (
              <DomToolbarButton variant="primary" icon={<Plus size={15} />} onClick={openAddTeamModal}>
                {t('Thêm Phòng ban')}
              </DomToolbarButton>
            ) : isWriteAuthorized ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <DomToolbarButton
                  variant="outline"
                  icon={<Target size={15} style={{ color: '#BD1D2D' }} />}
                  onClick={() => setSalesTargetModalOpen(true)}
                >
                  {t('Target Doanh Thu TVV')}
                </DomToolbarButton>
                <DomToolbarButton variant="primary" icon={<Plus size={15} />} onClick={openAddModal}>
                  {t('Thêm tài khoản')}
                </DomToolbarButton>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Tab Panels with Enter Animation */}
      <div key={activeTab} className="subtab-enter-active" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {/* Summary Cards */}
        {activeTab === 'consultants' && (
          <ConsultantsKpiStrip
            isMobile={isMobile}
            loading={loading}
            totalCount={users.length}
            activeCount={activeCount}
            leaveCount={leaveCount}
            inactiveCount={inactiveCount}
            t={t}
          />
        )}

      {/* Main Content Area */}
      {activeTab === 'consultants' ? (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{
            padding: isMobile ? '0.75rem 1rem' : '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--color-surface)',
            gap: '0.75rem',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: isMobile ? '100%' : '480px', maxWidth: isMobile ? '100%' : '480px', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <input
                  type="text"
                  placeholder={t('Tìm kiếm tên, email, điện thoại...')}
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setConsultantsPage(1);
                  }}
                  className="form-input"
                  style={{
                    paddingLeft: '12px',
                    borderRadius: '10px',
                    fontSize: '0.875rem',
                    width: '100%',
                    height: '38px'
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setConsultantsPage(1);
                    }}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Mobile Tab Selector ... Button */}
              {isMobile && (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    onClick={() => setShowMobileTabMenu(!showMobileTabMenu)}
                    style={{
                      height: '38px',
                      width: '38px',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '10px',
                      border: '1px solid var(--color-border)',
                      background: 'transparent',
                      color: 'var(--color-text)'
                    }}
                  >
                    <MoreHorizontal size={18} />
                  </button>

                  {showMobileTabMenu && (
                    <>
                      <div 
                        onClick={() => setShowMobileTabMenu(false)}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                      />
                      <div style={{
                        position: 'absolute',
                        top: '44px',
                        right: 0,
                        width: '160px',
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '12px',
                        boxShadow: 'var(--shadow-lg)',
                        padding: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        zIndex: 1000
                      }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', padding: '2px 8px', textTransform: 'uppercase' }}>
                          {t('Chuyển Tab')}
                        </div>
                        {[
                          { id: 'consultants', label: t('Tư vấn viên') },
                          { id: 'teams', label: t('Phòng ban') }
                        ].map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => {
                              navigate(`/consultants?tab=${tab.id}`);
                              setShowMobileTabMenu(false);
                            }}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '8px 10px',
                              fontSize: '0.825rem',
                              borderRadius: '8px',
                              border: 'none',
                              cursor: 'pointer',
                              background: activeTab === tab.id ? 'var(--color-primary-light)' : 'transparent',
                              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text)',
                              fontWeight: activeTab === tab.id ? 700 : 500
                            }}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
              {t('Tổng số')}: <strong style={{ color: 'var(--color-text)' }}>{filteredUsers.length}</strong> / {users.length} {t('nhân sự')}
            </div>
          </div>
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>
              {paginatedUsers.map(u => (
                <div
                  key={u.id}
                  onClick={() => openEditModal(u)}
                  style={{
                    padding: '12px 16px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border-light)',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                    <div style={{ flexShrink: 0 }}>
                      <Avatar
                        src={u.avatar}
                        name={u.name}
                        size={42}
                        style={{
                          filter: (u.status === 'inactive' || u.status === 'leave' || Number(u.vacation_mode) === 1) ? 'grayscale(1)' : 'none',
                          opacity: (u.status === 'inactive' || u.status === 'leave' || Number(u.vacation_mode) === 1) ? 0.5 : 1
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text)', lineHeight: 1.2 }}>
                        {u.name}
                      </span>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        {t('Điện thoại:')} {u.phone || '—'}
                      </span>
                    </div>
                  </div>
                  {isWriteAuthorized && (
                    <div style={{ color: 'var(--color-text-light)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <ChevronRight size={18} />
                    </div>
                  )}
                </div>
              ))}
              {paginatedUsers.length === 0 && (
                <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--color-surface)', borderRadius: 12 }}>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{t('Chưa có Tư vấn viên')}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="table-wrap mobile-card-table custom-scrollbar" style={{ border: 'none', borderRadius: 0, maxHeight: '480px', overflowY: 'auto' }}>
              <table className="mobile-table-compact">
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 10, borderBottom: '1px solid var(--color-border)' }}>{t('Tên nhân sự')}</th>
                    <th style={{ position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 10, borderBottom: '1px solid var(--color-border)' }}>{t('Thông tin liên hệ')}</th>
                    <th style={{ position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 10, borderBottom: '1px solid var(--color-border)' }}>{t('Zalo Bot')}</th>
                    <th style={{ position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 10, borderBottom: '1px solid var(--color-border)' }}>{t('Telegram Bot')}</th>
                    {isWriteAuthorized && <th style={{ position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 10, borderBottom: '1px solid var(--color-border)' }}>{t('Truy cập gần nhất')}</th>}
                    {isWriteAuthorized && <th style={{ position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 10, borderBottom: '1px solid var(--color-border)', textAlign: 'right' }}>{t('Thao tác')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => <TableRowSkeleton key={i} cols={isWriteAuthorized ? 6 : 4} />)
                  ) : users.length === 0 ? (
                    <tr className="empty-state-row">
                      <td colSpan={isWriteAuthorized ? 6 : 4}>
                      <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                          <Users size={32} color="var(--color-text-muted)" />
                        </div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.5rem' }}>{t('Chưa có Tư vấn viên')}</h3>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', maxWidth: 400, margin: '0 auto 1.5rem' }}>{t('Thêm tư vấn viên đầu tiên để bắt đầu chia số tự động.')}</p>
                        {isWriteAuthorized && <button className="btn primary" onClick={openAddModal}><Plus size={18} /> {t('Thêm Tư vấn viên')}</button>}
                      </div>
                    </td>
                  </tr>
                ) : paginatedUsers.map((u) => {
                  return (
                    <tr
                      key={u.id}
                      className="group table-row-hover"
                      style={{ cursor: 'pointer' }}
                      onClick={() => openEditModal(u)}
                      title={t("Nhấp để xem chi tiết")}
                    >
                      <td data-label={t('Tên nhân sự')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <Avatar
                            src={u.avatar}
                            name={u.name}
                            size={32}
                            style={{
                              filter: (u.status === 'inactive' || u.status === 'leave' || Number(u.vacation_mode) === 1) ? 'grayscale(1)' : 'none',
                              opacity: (u.status === 'inactive' || u.status === 'leave' || Number(u.vacation_mode) === 1) ? 0.5 : 1
                            }}
                          />
                          <div>
                            <div
                              style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text)', transition: 'color 0.15s' }}
                              onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary)'}
                              onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text)'}
                            >
                              {u.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 2 }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>ID: {u.id}</span>
                              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--color-text-muted)' }} />
                              {u.work_schedule ? (
                                <span
                                  style={{
                                    fontSize: '0.75rem',
                                    color: '#0ea5e9',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    cursor: 'help',
                                    borderBottom: '1px dotted #0ea5e9'
                                  }}
                                  title={formatScheduleTooltip(u.work_schedule, t)}
                                >
                                  <Clock size={12} /> {t('Lịch tuần')}
                                </span>
                              ) : (
                                (u.work_start_time === '00:00' && u.work_end_time === '23:59') || (!u.work_start_time && !u.work_end_time) ? (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }} title={t("Nhận data 24/24")}>
                                    <Clock size={12} /> 24/24
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }} title={`${t('Nhận data từ')} ${u.work_start_time} ${t('đến')} ${u.work_end_time}`}>
                                    <Clock size={12} /> {u.work_start_time} - {u.work_end_time}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td data-label={t('Thông tin liên hệ')} style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Mail size={14} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                            <span>{u.email}</span>
                          </div>
                          {u.phone && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--color-text)' }}>
                              <Phone size={12} style={{ color: 'var(--color-primary)' }} />
                              <span>{u.phone}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td data-label={t('Zalo Bot')} onClick={e => e.stopPropagation()}>
                        {u.zalo_chat_id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '4px 10px', borderRadius: 20,
                              background: '#e5f0ff', color: '#0068ff', fontSize: '0.75rem', fontWeight: 600
                            }}>
                              <MessageCircle size={14} /> {t('Đã liên kết')}
                            </span>
                            <CopyButton text={u.zalo_chat_id} />
                          </div>
                        ) : (() => {
                          const isSelf = u.email && u.email.toLowerCase() === user?.email?.toLowerCase();
                          const isSaleMember = ['sale', 'sales', 'consultant', 'counselor'].includes((u.role || '').toLowerCase()) || (u.team_branch && u.team_branch.toLowerCase().includes('sale'));

                          if (isSelf) {
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  padding: '4px 10px', borderRadius: 20,
                                  background: 'var(--color-bg)', color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 500
                                }}>
                                  {t('Chưa liên kết')}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleConnectZalo(); }}
                                  style={{
                                    fontSize: '0.725rem', padding: '3px 8px', borderRadius: '6px',
                                    background: '#0068ff', color: 'white', border: 'none',
                                    display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, cursor: 'pointer'
                                  }}
                                >
                                  {t('Liên kết')} <ExternalLink size={12} />
                                </button>
                              </div>
                            );
                          }

                          if (!isSaleMember) {
                            return (
                              <span style={{ color: 'var(--color-text-light, #94a3b8)', fontSize: '0.75rem' }}>
                                {t('Không bắt buộc')}
                              </span>
                            );
                          }

                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '4px 10px', borderRadius: 20,
                                background: 'var(--color-bg)', color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 500
                              }}>
                                {t('Chưa liên kết')}
                              </span>
                              {isWriteAuthorized && u.email && (
                                zaloRemindedId === u.id ? (
                                  <span style={{ fontSize: '0.7rem', padding: '2px 6px', color: '#10b981', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                                    <Check size={12} /> {t('Đã nhắc')}
                                  </span>
                                ) : (
                                  <button onClick={(e) => { e.stopPropagation(); handleResendZaloVerify(u.id); }} className="btn ghost" style={{ fontSize: '0.7rem', padding: '2px 6px', color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }} title={t("Gửi email nhắc xác thực Zalo")} disabled={zaloRemindingId === u.id}>
                                    {zaloRemindingId === u.id ? <RefreshCw size={12} className="spin" /> : <Send size={12} />} {zaloRemindingId === u.id ? t('Đang gửi...') : t('Nhắc')}
                                  </button>
                                )
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td data-label={t('Telegram Bot')} onClick={e => e.stopPropagation()}>
                        {u.telegram_chat_id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '4px 10px', borderRadius: 20,
                              background: '#e8f4fd', color: '#0088cc', fontSize: '0.75rem', fontWeight: 600
                            }}>
                              <Send size={14} /> {t('Đã liên kết')}
                            </span>
                            <CopyButton text={u.telegram_chat_id} />
                          </div>
                        ) : (() => {
                          const isSelf = u.email && u.email.toLowerCase() === user?.email?.toLowerCase();
                          const isSaleMember = ['sale', 'sales', 'consultant', 'counselor'].includes((u.role || '').toLowerCase()) || (u.team_branch && u.team_branch.toLowerCase().includes('sale'));

                          if (isSelf) {
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  padding: '4px 10px', borderRadius: 20,
                                  background: 'var(--color-bg)', color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 500
                                }}>
                                  {t('Chưa liên kết')}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleConnectTelegram(u.id); }}
                                  style={{
                                    fontSize: '0.725rem', padding: '3px 8px', borderRadius: '6px',
                                    background: '#0284c7', color: 'white', border: 'none',
                                    display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, cursor: 'pointer'
                                  }}
                                >
                                  {t('Liên kết')} <ExternalLink size={12} />
                                </button>
                              </div>
                            );
                          }

                          if (!isSaleMember) {
                            return (
                              <span style={{ color: 'var(--color-text-light, #94a3b8)', fontSize: '0.75rem' }}>
                                {t('Không bắt buộc')}
                              </span>
                            );
                          }

                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '4px 10px', borderRadius: 20,
                                background: 'var(--color-bg)', color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 500
                              }}>
                                {t('Chưa liên kết')}
                              </span>
                              {isWriteAuthorized && u.email && (
                                tgRemindedId === u.id ? (
                                  <span style={{ fontSize: '0.7rem', padding: '2px 6px', color: '#10b981', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                                    <Check size={12} /> {t('Đã nhắc')}
                                  </span>
                                ) : (
                                  <button onClick={(e) => { e.stopPropagation(); handleResendTelegramVerify(u.id); }} className="btn ghost" style={{ fontSize: '0.7rem', padding: '2px 6px', color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }} title={t("Gửi email nhắc liên kết Telegram")} disabled={tgRemindingId === u.id}>
                                    {tgRemindingId === u.id ? <RefreshCw size={12} className="spin" /> : <Send size={12} />} {tgRemindingId === u.id ? t('Đang gửi...') : t('Nhắc')}
                                  </button>
                                )
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      {isWriteAuthorized && (
                        <td data-label={t('Truy cập gần nhất')} onClick={e => e.stopPropagation()}>
                          {renderLastLogin(u.last_login)}
                        </td>
                      )}
                      {isWriteAuthorized && (
                        <td className="col-actions" data-label={t('Thao tác')} style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <div className="row-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem', opacity: 0, transition: 'opacity 0.15s' }}>
                            <button
                              onClick={() => {
                                setStatsConsultant(u);
                                setStatsModalOpen(true);
                              }}
                              className="btn ghost sm"
                              style={{ width: 32, height: 32, padding: 0, borderRadius: 8, color: 'var(--color-primary)' }}
                              title={t("Thống kê hiệu suất")}
                            >
                              <BarChart2 size={14} />
                            </button>
                            <button onClick={() => { setDeleteId(u.id); setConfirmDeleteOpen(true); }} className="btn ghost sm" style={{ width: 32, height: 32, padding: 0, borderRadius: 8, color: 'var(--color-danger)' }} title={t("Xóa nhân sự")}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

        {/* Consultants Pagination */}
        {consultantsTotalPages > 1 && (
          <div style={{ 
            padding: '1rem 1.25rem', 
            borderTop: '1px solid var(--color-border-light)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            background: 'var(--color-surface)',
            borderBottomLeftRadius: '16px',
            borderBottomRightRadius: '16px'
          }}>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
              Hiển thị <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{(consultantsPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{Math.min(consultantsPage * ITEMS_PER_PAGE, filteredUsers.length)}</span> trên <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{filteredUsers.length}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button 
                onClick={() => setConsultantsPage(prev => Math.max(prev - 1, 1))} 
                disabled={consultantsPage === 1} 
                className="btn sm outline" 
                style={{ height: 32, width: 32, padding: 0, minWidth: 32, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: consultantsPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                <ChevronLeft size={16} />
              </button>
              <div style={{ display: 'flex', gap: 4 }}>
                {(() => {
                  const maxVisible = 5;
                  let start = Math.max(1, consultantsPage - Math.floor(maxVisible / 2));
                  let end = Math.min(consultantsTotalPages, start + maxVisible - 1);
                  if (end - start + 1 < maxVisible) {
                    start = Math.max(1, end - maxVisible + 1);
                  }
                  const pageNumbers = [];
                  for (let p = start; p <= end; p++) {
                    pageNumbers.push(p);
                  }
                  return pageNumbers.map((pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => setConsultantsPage(pageNum)}
                      style={{
                        width: 32, height: 32, borderRadius: 8, fontSize: '0.8125rem', fontWeight: 700,
                        border: consultantsPage === pageNum ? 'none' : '1px solid var(--color-border-light)',
                        background: consultantsPage === pageNum ? 'var(--color-primary)' : 'var(--color-surface)',
                        color: consultantsPage === pageNum ? 'white' : 'var(--color-text-muted)',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      className={consultantsPage === pageNum ? '' : 'hover-lift'}
                    >
                      {pageNum}
                    </button>
                  ));
                })()}
              </div>
              <button 
                onClick={() => setConsultantsPage(prev => Math.min(prev + 1, consultantsTotalPages))} 
                disabled={consultantsPage === consultantsTotalPages} 
                className="btn sm outline" 
                style={{ height: 32, width: 32, padding: 0, minWidth: 32, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: consultantsPage === consultantsTotalPages ? 'not-allowed' : 'pointer' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
      ) : activeTab === 'teams' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <style>{`
            .dept-card {
              transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
              border: 1px solid var(--color-border-light) !important;
              border-radius: 16px !important;
              background: var(--color-surface) !important;
              box-shadow: var(--shadow-sm) !important;
              display: flex;
              flex-direction: column;
              gap: 1rem;
              padding: 1.5rem !important;
              cursor: pointer;
            }
            .dept-card:hover {
              transform: translateY(-4px) !important;
              box-shadow: 0 12px 24px -10px rgba(0, 0, 0, 0.06), 0 4px 12px -5px rgba(189, 29, 45, 0.08) !important;
              border-color: rgba(189, 29, 45, 0.25) !important;
            }
            .dept-inner-panel {
              border-top: 1px dashed var(--color-border) !important;
              padding-top: 1rem !important;
              display: flex;
              flex-direction: column;
              gap: 12px;
            }
          `}</style>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? '1rem' : '1.5rem', padding: '0.25rem' }}>
            {teamsLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="card animate-pulse" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '200px' }}>
                  <div style={{ height: '24px', width: '60%', background: 'var(--color-border-light)', borderRadius: '4px' }} />
                  <div style={{ height: '16px', width: '40%', background: 'var(--color-border-light)', borderRadius: '4px' }} />
                  <div style={{ height: '40px', width: '100%', background: 'var(--color-border-light)', borderRadius: '8px', marginTop: 'auto' }} />
                </div>
              ))
            ) : teams.length === 0 ? (
              <div className="card" style={{ gridColumn: '1 / -1', padding: '4rem 2rem', textAlign: 'center' }}>
                <Users size={48} color="var(--color-text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text)' }}>{t('Chưa có Phòng ban')}</h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>{t('Nhấp thêm phòng ban để bắt đầu quản lý phân cấp thành viên.')}</p>
              </div>
            ) : paginatedTeams.map((team) => {
                const leader = allSystemUsers.find(u => Number(u.id) === Number(team.leader_id));
                const teamCoLeaderIds = parseCoLeaderIds(team.co_leader_ids);
                const getTeamTotalCount = () => {
                  const leaderId = team.leader_id ? Number(team.leader_id) : null;
                  const memberSet = new Set<number>();
                  if (leaderId) memberSet.add(leaderId);
                  teamCoLeaderIds.forEach((cid) => { const n = Number(cid); if (n) memberSet.add(n); });
                  
                  allSystemUsers.forEach((u: any) => {
                    if (String(u.team_id) === String(team.id)) {
                      memberSet.add(Number(u.id));
                    }
                  });

                  if (memberSet.size > 0) return memberSet.size;
                  return Number(team.member_count) || (leaderId ? 1 : 0);
                };
                const totalMembers = getTeamTotalCount();
                return (
                  <div 
                    key={team.id} 
                    className="dept-card" 
                    onClick={() => openEditTeamModal(team)}
                  >
                    {/* Header Row */}
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ 
                        width: '42px', 
                        height: '42px', 
                        borderRadius: '50%', 
                        overflow: 'hidden',
                        border: '1.5px solid var(--color-border-light)',
                        background: (team.avatar_url || team.avatar) ? 'transparent' : '#ffffff', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '1rem',
                        flexShrink: 0
                      }}>
                        {(team.avatar_url || team.avatar) ? (
                          <img src={team.avatar_url || team.avatar} alt={team.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <img src={getTenantLogoUrl('/LOGO.webp')} alt="Logo" style={{ width: '70%', height: '70%', objectFit: 'contain' }} />
                        )}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {team.name}
                        </h3>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '2px', alignItems: 'center' }}>
                          <span className="badge info sm" style={{ fontWeight: 700, fontSize: '0.6875rem', padding: '2px 6px' }}>
                            {totalMembers} {t('nhân viên')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Details Panel */}
                    <div className="dept-inner-panel">
                      {/* Trưởng phòng */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)' }}>
                          <User size={14} />
                          <span>{t('Trưởng phòng')}:</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {team.leader_name ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                <Avatar src={leader?.avatar_url || leader?.avatar} name={team.leader_name} size={18} />
                                {(() => {
                                  const coLeaders = teamCoLeaderIds.map((id: string) => allSystemUsers.find(u => String(u.id) === id)).filter(Boolean);
                                  return (
                                    <>
                                      {coLeaders.slice(0, 3).map((cl: any) => (
                                        <div key={cl.id} style={{ marginLeft: '-5px', border: '1.5px solid var(--color-surface)', borderRadius: '50%', overflow: 'hidden', display: 'flex' }}>
                                          <Avatar src={cl.avatar_url || cl.avatar} name={cl.full_name || cl.name} size={16} />
                                        </div>
                                      ))}
                                      {coLeaders.length > 3 && (
                                        <div style={{ marginLeft: '-5px', width: 16, height: 16, borderRadius: '50%', background: 'var(--color-primary-light)', color: 'var(--color-primary)', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-surface)' }}>
                                          +{teamCoLeaderIds.length - 3}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                              <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>
                                {team.leader_name}
                                {teamCoLeaderIds.length > 0 ? ` (+${teamCoLeaderIds.length})` : ''}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)' }}>{t('Chưa gán')}</span>
                          )}
                        </div>
                      </div>

                      {/* Thành viên (Avatars) */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)' }}>
                          <Users size={14} />
                          <span>{t('Thành viên')}:</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {(() => {
                            const members = allSystemUsers.filter(u => String(u.team_id) === String(team.id));
                            return (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', marginRight: '6px' }}>
                                  {members.slice(0, 5).map((m: any, idx: number) => (
                                    <div key={m.id} style={{ 
                                      marginLeft: idx > 0 ? '-8px' : '0', 
                                      border: '1.5px solid var(--color-surface)', 
                                      borderRadius: '50%', 
                                      overflow: 'hidden', 
                                      display: 'flex',
                                      boxShadow: 'var(--shadow-sm)'
                                    }}>
                                      <Avatar src={m.avatar_url || m.avatar} name={m.full_name || m.name || 'User'} size={20} />
                                    </div>
                                  ))}
                                </div>
                                {members.length > 5 ? (
                                  <span className="badge info sm" style={{ fontWeight: 800, fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px' }}>
                                    +{members.length - 5}
                                  </span>
                                ) : (
                                  members.length === 0 && <span style={{ color: 'var(--color-text-muted)' }}>{t('Trống')}</span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {(() => {
                      const isLeaderOfThisTeam = Boolean(user?.id && (
                        String(team.leader_id) === String(user.id) ||
                        teamCoLeaderIds.includes(String(user.id))
                      ));
                      const canEditThisTeam = isWriteAuthorized || isLeaderOfThisTeam;

                      return (
                        <div 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'flex-end', 
                            gap: '0.5rem', 
                            marginTop: 'auto',
                            paddingTop: '8px'
                          }} 
                          onClick={e => e.stopPropagation()}
                        >
                          {canEditThisTeam ? (
                            <>
                              <button 
                                className="btn sm outline" 
                                onClick={() => openEditTeamModal(team)}
                                style={{ borderRadius: '20px', padding: '5px 14px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)' }}
                              >
                                {t('Sửa')}
                              </button>
                              {isWriteAuthorized && (
                                <button
                                  className="btn sm"
                                  style={{ 
                                    background: 'rgba(239, 68, 68, 0.05)', 
                                    color: 'var(--color-danger)', 
                                    border: '1px solid rgba(239, 68, 68, 0.15)', 
                                    borderRadius: '20px', 
                                    padding: '6px 12px', 
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                  onClick={() => {
                                    setDeleteTeamId(team.id);
                                    setConfirmDeleteTeamOpen(true);
                                  }}
                                  title={t('Xóa')}
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </>
                          ) : (
                            <button 
                              className="btn sm outline" 
                              onClick={() => openEditTeamModal(team)}
                              style={{ borderRadius: '20px', padding: '5px 14px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)' }}
                            >
                              {t('Xem chi tiết')}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
            })}
          </div>

          {/* Teams Pagination */}
          {teamsTotalPages > 1 && (
            <div style={{ 
              padding: '1rem 1.25rem', 
              borderTop: '1px solid var(--color-border-light)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              background: 'var(--color-surface)',
              borderRadius: '16px',
              border: '1px solid var(--color-border-light)'
            }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                Hiển thị <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{(teamsPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{Math.min(teamsPage * ITEMS_PER_PAGE, teams.length)}</span> trên <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{teams.length}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button 
                  onClick={() => setTeamsPage(prev => Math.max(prev - 1, 1))} 
                  disabled={teamsPage === 1} 
                  className="btn sm outline" 
                  style={{ height: 32, width: 32, padding: 0, minWidth: 32, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: teamsPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronLeft size={16} />
                </button>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(() => {
                    const maxVisible = 5;
                    let start = Math.max(1, teamsPage - Math.floor(maxVisible / 2));
                    let end = Math.min(teamsTotalPages, start + maxVisible - 1);
                    if (end - start + 1 < maxVisible) {
                      start = Math.max(1, end - maxVisible + 1);
                    }
                    const pageNumbers = [];
                    for (let p = start; p <= end; p++) {
                      pageNumbers.push(p);
                    }
                    return pageNumbers.map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => setTeamsPage(pageNum)}
                        style={{
                          width: 32, height: 32, borderRadius: 8, fontSize: '0.8125rem', fontWeight: 700,
                          border: teamsPage === pageNum ? 'none' : '1px solid var(--color-border-light)',
                          background: teamsPage === pageNum ? 'var(--color-primary)' : 'var(--color-surface)',
                          color: teamsPage === pageNum ? 'white' : 'var(--color-text-muted)',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                        className={teamsPage === pageNum ? '' : 'hover-lift'}
                      >
                        {pageNum}
                      </button>
                    ));
                  })()}
                </div>
                <button 
                  onClick={() => setTeamsPage(prev => Math.min(prev + 1, teamsTotalPages))} 
                  disabled={teamsPage === teamsTotalPages} 
                  className="btn sm outline" 
                  style={{ height: 32, width: 32, padding: 0, minWidth: 32, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: teamsPage === teamsTotalPages ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      </div>

      {modalOpen && (
        <AccountDetailDrawer
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          account={editingUser}
          onSaveSuccess={fetchUsers}
          readOnly={!isWriteAuthorized}
        />
      )}

      {salesTargetModalOpen && (
        <SalesTargetModal
          isOpen={salesTargetModalOpen}
          onClose={() => setSalesTargetModalOpen(false)}
          onSaved={() => fetchUsers()}
        />
      )}


      {/* Inline style for modal animation */}
      <style>{`
        @keyframes slideUp {
          0% {
            opacity: 0;
            transform: translateY(30px);
          }
          60% {
            transform: translateY(-6px);
          }
          85% {
            transform: translateY(2px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Quick Message Modal */}
      {quickMessageOpen && quickMessageTarget && typeof document !== 'undefined' && createPortal(
        <div className="overlay-backdrop" style={{ zIndex: 2147483646 }} onClick={() => setQuickMessageOpen(false)}>
          <div className="card" style={{ width: '100%', maxWidth: 400, maxHeight: '90vh', display: 'flex', flexDirection: 'column', animation: 'modalSpring 0.4s cubic-bezier(0.34, 1.18, 0.64, 1) both' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem', borderBottom: '1px solid var(--color-border-light)' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageCircle size={20} style={{ color: '#0068ff' }} />
                {t('Nhắn tin cho')} {quickMessageTarget.name}
              </h3>
              <button type="button" onClick={() => setQuickMessageOpen(false)} style={{ color: 'var(--color-text-muted)', padding: 4, borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSendQuickMessage} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '1.25rem', overflowY: 'auto' }}>
                <div className="form-group">
                  <label className="form-label">{t('Nội dung tin nhắn')} <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                  <textarea
                    className="form-input"
                    placeholder={t('Nhập nội dung cần thông báo cho nhân sự...')}
                    value={quickMessageText}
                    onChange={e => setQuickMessageText(e.target.value)}
                    required
                    autoFocus
                    style={{ minHeight: 100, resize: 'vertical' }}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 8 }}>{t('Tin nhắn sẽ được tự động gửi qua Zalo Bot (nếu có) và Email với tiêu đề [ TIN NHẮN TỪ QUẢN TRỊ VIÊN ]')}</p>
                </div>
              </div>
              <div style={{ padding: '1.25rem', background: theme === 'dark' ? 'var(--color-surface)' : 'var(--color-bg)', borderTop: theme === 'dark' ? '1px solid var(--color-border)' : '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderBottomLeftRadius: 'var(--radius-xl)', borderBottomRightRadius: 'var(--radius-xl)' }}>
                <button type="button" className="btn ghost" onClick={() => setQuickMessageOpen(false)}>{t('Hủy')}</button>
                <button type="submit" className="btn primary" disabled={isSendingMsg} style={{ background: '#0068ff', borderColor: '#0068ff' }}>
                  {isSendingMsg ? t('Đang gửi...') : t('Gửi tin nhắn')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Shared Consultant Performance Statistics Modal */}
      {statsModalOpen && statsConsultant && (
        <ConsultantStatsModal
          isOpen={statsModalOpen}
          consultant={statsConsultant}
          onClose={() => {
            setStatsModalOpen(false);
            setStatsConsultant(null);
          }}
        />
      )}

      {confirmDeleteOpen && (
        <ConfirmModal
          isOpen={confirmDeleteOpen}
          onClose={() => setConfirmDeleteOpen(false)}
          onConfirm={handleDelete}
          title={t("Xác nhận xóa mềm Tư vấn viên")}
          message={t("Bạn có chắc chắn muốn xóa mềm (lưu trữ) tư vấn viên này không? Nhân sự sẽ ngừng tham gia vòng chia Data nhưng toàn bộ lịch sử chăm sóc và báo cáo doanh thu vẫn được bảo toàn. Nếu chỉ tạm nghỉ, hãy chuyển sang 'Ngừng hoạt động' hoặc 'Nghỉ phép'.")}
          confirmText={t("Xác nhận xóa")}
        />
      )}

      {unlinkConfirmOpen && (
        <ConfirmModal
          isOpen={unlinkConfirmOpen}
          onClose={() => setUnlinkConfirmOpen(false)}
          onConfirm={handleUnlinkZalo}
          title={t("Hủy liên kết Zalo Bot")}
          message={t("Bạn có chắc chắn muốn hủy liên kết Zalo của tư vấn viên này không? Hệ thống sẽ ngừng gửi data và mọi thông báo qua Zalo cho tài khoản này ngay lập tức.")}
          confirmText={t("Hủy liên kết")}
        />
      )}

      {/* Team Add/Edit Modal */}
      {teamModalOpen && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {teamModalOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                className="drawer-backdrop"
                onClick={() => setTeamModalOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 2147483620,
                  '--drawer-backdrop-z': 2147483620,
                  background: 'rgba(0, 0, 0, 0.6)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  cursor: 'pointer'
                } as any}
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.22 }}
                className={`${styles.drawer} drawer-sheet drawer-panel`}
                style={{
                  zIndex: 2147483625,
                  '--drawer-panel-z': 2147483625
                } as React.CSSProperties}
              >
                {/* Header */}
                <div className={styles.header}>
                  <div className={styles.headerProfile}>
                    <div style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      border: '2px solid var(--color-border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: teamFormData.avatar_url ? 'transparent' : 'linear-gradient(135deg, #BD1D2D 0%, #a31422 100%)',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '1.25rem',
                      flexShrink: 0
                    }}>
                      {teamFormData.avatar_url ? (
                        <img src={teamFormData.avatar_url} alt="Team Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        teamFormData.name?.[0] || 'T'
                      )}
                    </div>
                    <div>
                      <h2 className={styles.title}>{teamFormData.name || t('Tên Phòng ban')}</h2>
                      <p className={styles.subtitle} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={14} /> {t('Quy mô')}: {teamFormData.member_ids.length} {t('nhân sự')} · KPI: {teamFormData.kpi_target ? Number(teamFormData.kpi_target).toLocaleString('vi-VN') : '0'} VND
                      </p>
                    </div>
                  </div>
                  <div className={styles.headerActions} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {canEditTeam ? (
                      <button 
                        type="submit"
                        form="team-drawer-form"
                        className="btn primary sm" 
                        disabled={isSaving}
                        style={{ 
                          background: 'var(--color-primary)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 6,
                          padding: '6px 14px',
                          fontSize: '0.8rem',
                          height: '32px'
                        }}
                      >
                        {isSaving ? t('Đang lưu...') : t('Lưu thay đổi')}
                      </button>
                    ) : (
                      <button type="button" className="btn primary sm" onClick={() => setTeamModalOpen(false)}>
                        {t('Đóng')}
                      </button>
                    )}
                    <button type="button" className={styles.closeBtn} onClick={() => setTeamModalOpen(false)} style={{ marginLeft: '4px' }}><X size={20} /></button>
                  </div>
                </div>

                <form id="team-drawer-form" onSubmit={handleSaveTeam} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  {/* Layout Split: Left Sidebar & Content */}
                  <div className={styles.drawerBody}>
                    
                    {/* Sidebar Tabs */}
                    <div className={styles.sidebarTabs}>
                      <button 
                        type="button" 
                        className={`${styles.sidebarTabBtn} ${teamDrawerTab === 'info' ? styles.sidebarTabActive : ''}`}
                        onClick={() => setTeamDrawerTab('info')}
                      >
                        <Building2 size={16} /> {t('Thông tin')}
                      </button>
                      <button 
                        type="button" 
                        className={`${styles.sidebarTabBtn} ${teamDrawerTab === 'members' ? styles.sidebarTabActive : ''}`}
                        onClick={() => setTeamDrawerTab('members')}
                      >
                        <Users size={16} /> {t('Nhân sự')}
                      </button>
                      {editingTeam && (
                        <button 
                          type="button" 
                          className={`${styles.sidebarTabBtn} ${teamDrawerTab === 'comments' ? styles.sidebarTabActive : ''}`}
                          onClick={() => setTeamDrawerTab('comments')}
                        >
                          <MessageCircle size={16} /> {t('Bình luận')}
                        </button>
                      )}
                    </div>

                    {/* Content Area */}
                    <div className={styles.contentArea}>
                      
                      {/* TAB 1: THÔNG TIN CƠ BẢN */}
                      {teamDrawerTab === 'info' && (
                        <div className="card-panel animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '0.75rem' }}>
                            <h4 className="panel-title" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)' }}>{t('Thông tin nhóm')}</h4>
                          </div>

                          {/* Row 1: Avatar & Team Name side-by-side */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', width: '100%', marginBottom: '0.25rem' }}>
                            {/* Avatar Nhóm Upload */}
                            <div className="form-group" style={{ textAlign: 'left', flexShrink: 0 }}>
                              <label className="form-label" style={{ fontWeight: 650, fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                                {t('Avatar nhóm')}
                              </label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{
                                  width: '54px',
                                  height: '54px',
                                  borderRadius: '50%',
                                  overflow: 'hidden',
                                  border: '2px solid var(--color-border-light)',
                                  boxShadow: 'var(--shadow-sm)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: teamFormData.avatar_url ? 'transparent' : 'var(--color-primary-light, rgba(189, 29, 45, 0.1))',
                                  color: 'var(--color-primary)',
                                  flexShrink: 0
                                }}>
                                  {teamFormData.avatar_url ? (
                                    <img src={teamFormData.avatar_url} alt="Team Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    <Avatar name={teamFormData.name || 'Team'} size={54} />
                                  )}
                                </div>
                                {canEditTeam && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label
                                      className="btn sm outline"
                                      style={{
                                        borderRadius: '8px',
                                        padding: '6px 14px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        cursor: isUploadingTeamAvatar ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        userSelect: 'none'
                                      }}
                                    >
                                      <Paperclip size={14} />
                                      {isUploadingTeamAvatar ? t('Đang xử lý...') : t('Tải ảnh')}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleUploadTeamAvatar}
                                        disabled={isUploadingTeamAvatar}
                                        style={{ display: 'none' }}
                                      />
                                    </label>
                                    {teamFormData.avatar_url && (
                                      <button
                                        type="button"
                                        onClick={() => setTeamFormData(prev => ({ ...prev, avatar_url: '' }))}
                                        style={{
                                          background: 'transparent',
                                          color: 'var(--color-danger)',
                                          border: 'none',
                                          fontSize: '0.75rem',
                                          fontWeight: 600,
                                          padding: 0,
                                          textAlign: 'left',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        {t('Gỡ bỏ')}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Tên nhóm */}
                            <div className="form-group" style={{ textAlign: 'left', flex: 1 }}>
                              <label className="form-label" style={{ fontWeight: 650, fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>{t('Tên nhóm')} <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                              <input 
                                className="form-input"
                                value={teamFormData.name} 
                                onChange={e => setTeamFormData({ ...teamFormData, name: e.target.value })} 
                                required 
                                disabled={!isWriteAuthorized}
                                placeholder={t('Nhập tên nhóm...')}
                                style={{ width: '100%' }}
                              />
                            </div>
                          </div>

                          <div className="grid grid-2" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>

                            <div className="form-group" ref={leaderDropdownRef} style={{ position: 'relative', textAlign: 'left' }}>
                              <label className="form-label" style={{ fontWeight: 650, fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>{t('Manager')}</label>
                              
                              {/* Search Input Box */}
                              <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
                                {(() => {
                                  const selectedLeader = allSystemUsers.find(u => String(u.id) === String(teamFormData.leader_id));
                                  if (!selectedLeader) return null;
                                  const leaderName = selectedLeader.full_name || selectedLeader.name || '';
                                  return (
                                    <div style={{ position: 'absolute', left: '10px', pointerEvents: 'none', display: 'flex', alignItems: 'center', zIndex: 2 }}>
                                      <Avatar src={selectedLeader.avatar_url || selectedLeader.avatar} name={leaderName} size={24} />
                                    </div>
                                  );
                                })()}
                                <input
                                  className={`form-input ${teamFormData.leader_id ? 'form-input-with-avatar' : ''}`}
                                  style={{ 
                                    background: 'var(--color-bg)', 
                                    border: '1px solid var(--color-border-light)', 
                                    width: '100%',
                                    paddingLeft: teamFormData.leader_id ? '42px' : '12px',
                                    paddingRight: '32px'
                                  }}
                                  placeholder={t("Tìm kiếm và chọn Manager...")}
                                  value={searchLeader}
                                  onChange={e => {
                                    if (!isWriteAuthorized) return;
                                    setSearchLeader(e.target.value);
                                    setShowLeaderDropdown(true);
                                    if (!e.target.value.trim()) {
                                      setTeamFormData({ ...teamFormData, leader_id: '' });
                                    }
                                  }}
                                  onFocus={() => isWriteAuthorized && setShowLeaderDropdown(true)}
                                  disabled={!isWriteAuthorized}
                                />
                                {isWriteAuthorized && teamFormData.leader_id && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTeamFormData({ ...teamFormData, leader_id: '' });
                                      setSearchLeader('');
                                    }}
                                    style={{
                                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)',
                                      background: 'transparent', border: 'none', cursor: 'pointer', padding: 0
                                    }}
                                  >
                                    <X size={16} />
                                  </button>
                                )}
                              </div>

                              {/* Dropdown Options */}
                              {showLeaderDropdown && (
                                <div style={{
                                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 1200,
                                  background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '8px',
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', maxHeight: 220, overflowY: 'auto'
                                }}>
                                  {allSystemUsers.filter(u => (u.full_name || u.name || '').toLowerCase().includes(searchLeader.toLowerCase())).map(u => {
                                    const uName = u.full_name || u.name || '';
                                    const isSelected = String(teamFormData.leader_id) === String(u.id);
                                    return (
                                      <div
                                        key={u.id}
                                        onClick={() => {
                                          setTeamFormData({ ...teamFormData, leader_id: String(u.id) });
                                          setSearchLeader(uName);
                                          setShowLeaderDropdown(false);
                                        }}
                                        style={{
                                          padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                          cursor: 'pointer',
                                          background: isSelected ? 'var(--color-primary-light)' : 'transparent',
                                          transition: 'background 0.1s'
                                        }}
                                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-bg)'; }}
                                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                      >
                                        <Avatar src={u.avatar_url || u.avatar} name={uName} size={28} />
                                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                          <p style={{ fontSize: '0.8125rem', fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--color-primary)' : 'var(--color-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uName}</p>
                                          <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                                        </div>
                                        {isSelected && <Check size={16} color="var(--color-primary)" />}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Co-Managers */}
                            <div className="form-group" ref={coLeaderDropdownRef} style={{ position: 'relative', textAlign: 'left' }}>
                              <label className="form-label" style={{ fontWeight: 650, fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                                {t('Manager đồng hành (Co-Managers)')} ({teamFormData.co_leader_ids.length})
                              </label>
                              
                              {/* Selected tags */}
                              {teamFormData.co_leader_ids.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.5rem' }}>
                                  {teamFormData.co_leader_ids.map(id => {
                                    const user = allSystemUsers.find(u => String(u.id) === String(id));
                                    if (!user) return null;
                                    const uName = user.full_name || user.name || '';
                                    return (
                                      <div 
                                        key={id} 
                                        style={{ 
                                          display: 'inline-flex', 
                                          alignItems: 'center', 
                                          gap: '4px', 
                                          background: 'rgba(189, 29, 45, 0.05)', 
                                          border: '1px solid rgba(189, 29, 45, 0.15)', 
                                          padding: '2px 8px 2px 4px', 
                                          borderRadius: '16px', 
                                          fontSize: '0.75rem',
                                          fontWeight: 600,
                                          color: 'var(--color-primary)'
                                        }}
                                      >
                                        <Avatar src={user.avatar_url || user.avatar} name={uName} size={16} />
                                        <span>{uName}</span>
                                        {isWriteAuthorized && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setTeamFormData({
                                                ...teamFormData,
                                                co_leader_ids: teamFormData.co_leader_ids.filter(cid => String(cid) !== String(id))
                                              });
                                            }}
                                            style={{
                                              background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                                              color: 'var(--color-primary)', display: 'flex', alignItems: 'center', marginLeft: 2
                                            }}
                                          >
                                            <X size={12} />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              <div style={{ position: 'relative', width: '100%' }}>
                                <input
                                  className="form-input"
                                  style={{ 
                                    background: 'var(--color-bg)', 
                                    border: '1px solid var(--color-border-light)', 
                                    width: '100%'
                                  }}
                                  placeholder={t("Chọn thêm Manager đồng hành...")}
                                  value={searchCoLeader}
                                  onChange={e => {
                                    if (!isWriteAuthorized) return;
                                    setSearchCoLeader(e.target.value);
                                    setShowCoLeaderDropdown(true);
                                  }}
                                  onFocus={() => isWriteAuthorized && setShowCoLeaderDropdown(true)}
                                  disabled={!isWriteAuthorized}
                                />
                              </div>

                              {showCoLeaderDropdown && (
                                <div style={{
                                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 1200,
                                  background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '8px',
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', maxHeight: 200, overflowY: 'auto'
                                }}>
                                  {allSystemUsers
                                    .filter(u => {
                                      const uName = u.full_name || u.name || '';
                                      const matchesSearch = uName.toLowerCase().includes(searchCoLeader.toLowerCase());
                                      const isPrimaryLeader = String(teamFormData.leader_id) === String(u.id);
                                      const isAlreadyCoLeader = teamFormData.co_leader_ids.some(cid => String(cid) === String(u.id));
                                      return matchesSearch && !isPrimaryLeader && !isAlreadyCoLeader;
                                    })
                                    .map(u => {
                                      const uName = u.full_name || u.name || '';
                                      return (
                                        <div
                                          key={u.id}
                                          onClick={() => {
                                            setTeamFormData({
                                              ...teamFormData,
                                              co_leader_ids: [...teamFormData.co_leader_ids, String(u.id)]
                                            });
                                            setSearchCoLeader('');
                                            setShowCoLeaderDropdown(false);
                                          }}
                                          style={{
                                            padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            cursor: 'pointer', transition: 'background 0.1s'
                                          }}
                                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg)'; }}
                                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                          <Avatar src={u.avatar_url || u.avatar} name={uName} size={28} />
                                          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                            <p style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uName}</p>
                                            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>

                            <div className="form-group" style={{ textAlign: 'left' }}>
                              <label className="form-label" style={{ fontWeight: 650, fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>{t('Mục tiêu KPI (Doanh số)')}</label>
                              <input
                                type="number"
                                className="form-input"
                                value={teamFormData.kpi_target} 
                                onChange={e => setTeamFormData({ ...teamFormData, kpi_target: e.target.value })} 
                                disabled={!isWriteAuthorized}
                                placeholder="0"
                                style={{ width: '100%' }}
                              />
                            </div>

                            <div className="form-group" style={{ textAlign: 'left' }}>
                              <label className="form-label" style={{ fontWeight: 650, fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>{t('Số lượng thành viên tối đa')}</label>
                              <input 
                                type="number"
                                className="form-input"
                                value={teamFormData.max_members} 
                                onChange={e => setTeamFormData({ ...teamFormData, max_members: e.target.value })} 
                                disabled={!isWriteAuthorized}
                                min={1}
                                placeholder="10"
                                style={{ width: '100%' }}
                              />
                            </div>

                            <div className="form-group" style={{ gridColumn: 'span 2', textAlign: 'left' }}>
                              <label className="form-label" style={{ fontWeight: 650, fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>{t('Địa chỉ chi nhánh (Dùng để nhận diện Tỉnh/Thành chi nhánh)')}</label>
                              <AddressSelect
                                value={teamFormData.branch || ''}
                                onChange={val => setTeamFormData({ ...teamFormData, branch: val })}
                                disabled={!isWriteAuthorized}
                                placeholder={t('Chọn địa chỉ chi nhánh để phân loại tự động...')}
                              />
                            </div>

                            <div className="form-group" style={{ gridColumn: 'span 2', textAlign: 'left' }}>
                              <label className="form-label" style={{ fontWeight: 650, fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                                {t('Dự án trọng điểm')} ({teamFormData.focus_projects.length})
                              </label>
                              {teamFormData.focus_projects.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.5rem' }}>
                                  {teamFormData.focus_projects.map(projName => (
                                    <span 
                                      key={projName} 
                                      style={{ 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: '0.25rem', 
                                        background: 'var(--color-primary-light)', 
                                        color: 'var(--color-primary)', 
                                        padding: '2px 8px', 
                                        borderRadius: '12px', 
                                        fontSize: '0.75rem',
                                        fontWeight: 600
                                      }}
                                    >
                                      {projName}
                                      {canEditTeam && (
                                        <button 
                                          type="button" 
                                          onClick={() => setTeamFormData({ ...teamFormData, focus_projects: teamFormData.focus_projects.filter(p => p !== projName) })}
                                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center' }}
                                        >
                                          <X size={12} />
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="custom-scrollbar" style={{ 
                                border: '1px solid var(--color-border-light)', 
                                borderRadius: '8px', 
                                maxHeight: '150px', 
                                overflowY: 'auto',
                                background: 'var(--color-bg)',
                                padding: '8px',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                gap: '6px'
                              }}>
                                {projects.length === 0 ? (
                                  <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                    {t('Không có dự án nào trên hệ thống')}
                                  </div>
                                ) : (
                                  projects.map(p => {
                                    const isChecked = teamFormData.focus_projects.includes(p.name);
                                    return (
                                      <div
                                        key={p.id}
                                        onClick={() => {
                                          if (!canEditTeam) return;
                                          const current = [...teamFormData.focus_projects];
                                          if (isChecked) {
                                            setTeamFormData({ ...teamFormData, focus_projects: current.filter(name => name !== p.name) });
                                          } else {
                                            setTeamFormData({ ...teamFormData, focus_projects: [...current, p.name] });
                                          }
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.5rem',
                                          padding: '0.375rem 0.5rem',
                                          cursor: canEditTeam ? 'pointer' : 'default',
                                          borderRadius: '4px',
                                          fontSize: '0.8125rem',
                                          background: isChecked ? 'rgba(163, 20, 34, 0.05)' : 'transparent'
                                        }}
                                        onMouseEnter={e => { if (!isChecked && canEditTeam) e.currentTarget.style.background = 'var(--color-surface)'; }}
                                        onMouseLeave={e => { if (!isChecked && canEditTeam) e.currentTarget.style.background = 'transparent'; }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => {}}
                                          style={{ cursor: canEditTeam ? 'pointer' : 'default' }}
                                          disabled={!canEditTeam}
                                        />
                                        <span style={{ color: 'var(--color-text)', fontWeight: isChecked ? 600 : 400 }}>{p.name}</span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>

                            <div className="form-group" style={{ gridColumn: 'span 2', textAlign: 'left' }}>
                              <label className="form-label" style={{ fontWeight: 650, fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>{t('Mô tả nhóm')}</label>
                              <textarea 
                                className="form-input"
                                value={teamFormData.description} 
                                onChange={e => setTeamFormData({ ...teamFormData, description: e.target.value })} 
                                disabled={!isWriteAuthorized}
                                placeholder={t('Mô tả ngắn gọn về nhóm...')}
                                rows={3}
                                style={{ width: '100%', resize: 'vertical' }}
                              />
                            </div>

                            {/* Leave team button if user is in team and not manager/admin */}
                            {!isWriteAuthorized && editingTeam && teamFormData.member_ids.includes(String(user?.id)) && (
                              <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-start', marginTop: '1rem' }}>
                                <button 
                                  type="button" 
                                  className="btn outline"
                                  style={{ 
                                    color: 'var(--color-danger)', 
                                    borderColor: 'rgba(189, 29, 45, 0.3)', 
                                    background: 'rgba(189, 29, 45, 0.05)',
                                    fontWeight: 700,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                  onClick={() => setConfirmLeaveTeamOpen(true)}
                                  disabled={isLeavingTeam}
                                >
                                  <UserX size={15} />
                                  {isLeavingTeam ? t('Đang rời nhóm...') : t('Rời khỏi nhóm')}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* TAB 2: THÀNH VIÊN TRONG NHÓM */}
                      {teamDrawerTab === 'members' && (
                        <div className="card-panel animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '0.75rem' }}>
                            <div>
                              <h4 className="panel-title" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)' }}>
                                {t('Thành viên nhóm')} ({teamFormData.member_ids.length})
                              </h4>
                              {teamFormData.max_members && (
                                <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                                  {t('Giới hạn tối đa:')} {teamFormData.max_members} {t('nhân sự')}
                                </p>
                              )}
                            </div>

                            {/* Add Member Dropdown Trigger */}
                            {canEditTeam && (
                              <div ref={addMemberDropdownRef} style={{ position: 'relative' }}>
                                <button
                                  type="button"
                                  onClick={() => setShowAddMemberDropdown(!showAddMemberDropdown)}
                                  className="btn primary sm"
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 14px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    borderRadius: '8px',
                                    background: 'var(--color-primary)',
                                    color: '#fff',
                                    border: 'none',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <span>+ {t('Thêm nhân sự')}</span>
                                </button>

                                {showAddMemberDropdown && (
                                  <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '6px',
                                    width: '320px',
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '12px',
                                    boxShadow: 'var(--shadow-lg)',
                                    zIndex: 1000,
                                    padding: '10px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px'
                                  }}>
                                    <div style={{ position: 'relative' }}>
                                      <Search size={13} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                                      <input
                                        type="text"
                                        className="form-input"
                                        placeholder={t('Tìm nhân sự mới...')}
                                        value={memberSearch}
                                        onChange={e => setMemberSearch(e.target.value)}
                                        style={{ width: '100%', fontSize: '0.78rem', padding: '6px 28px 6px 10px', height: '32px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
                                      />
                                    </div>
                                    <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }} className="custom-scrollbar">
                                      {(() => {
                                        const nonMembers = allSystemUsers.filter(u => !teamFormData.member_ids.includes(String(u.id)));
                                        const filtered = nonMembers.filter(u => 
                                          (u.full_name || u.name || '').toLowerCase().includes(memberSearch.toLowerCase()) ||
                                          (u.email || '').toLowerCase().includes(memberSearch.toLowerCase())
                                        );

                                        if (filtered.length === 0) {
                                          return (
                                            <div style={{ padding: '12px', fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                                              {t('Không có nhân sự khả dụng')}
                                            </div>
                                          );
                                        }

                                        return filtered.map(u => {
                                          const belongsToOtherTeam = u.team_id && String(u.team_id) !== String(editingTeam?.id);
                                          const otherTeam = teams.find(t => String(t.id) === String(u.team_id));
                                          
                                          return (
                                            <div
                                              key={u.id}
                                              onClick={() => {
                                                setTeamFormData(prev => ({
                                                  ...prev,
                                                  member_ids: [...prev.member_ids, String(u.id)]
                                                }));
                                                setShowAddMemberDropdown(false);
                                                setMemberSearch('');
                                                toast.success(`${t('Đã thêm')} ${u.full_name || u.name}`);
                                              }}
                                              style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '6px 8px',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                background: 'transparent',
                                                transition: 'background 0.15s'
                                              }}
                                              className="hover-bg-light"
                                            >
                                              <Avatar src={u.avatar_url || u.avatar} name={u.full_name || u.name || ''} size={22} />
                                              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                  {u.full_name || u.name}
                                                </div>
                                                {belongsToOtherTeam && (
                                                  <div style={{ fontSize: '0.65rem', color: 'var(--color-danger)', fontWeight: 600 }}>
                                                    {t('Phòng ban hiện tại')}: {otherTeam ? otherTeam.name : 'Khác'}
                                                  </div>
                                                )}
                                              </div>
                                              <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontWeight: 800 }}>+ Add</span>
                                            </div>
                                          );
                                        });
                                      })()}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Current Members List */}
                          <div style={{ 
                            border: '1px solid var(--color-border-light)', 
                            borderRadius: '8px', 
                            maxHeight: '350px', 
                            overflowY: 'auto',
                            background: 'var(--color-bg)',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: '10px',
                            padding: '12px'
                          }}>
                            {(() => {
                              const currentMembers = allSystemUsers.filter(u => teamFormData.member_ids.includes(String(u.id)));

                              if (currentMembers.length === 0) {
                                return (
                                  <div style={{ gridColumn: '1 / -1', padding: '2rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                                    {t('Phòng ban hiện chưa có thành viên nào. Hãy nhấn nút "+ Thêm nhân sự" phía trên.')}
                                  </div>
                                );
                              }

                              return currentMembers.map(sale => {
                                return (
                                  <div
                                    key={sale.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.75rem',
                                      padding: '0.625rem 0.75rem',
                                      border: '1px solid var(--color-border-light)',
                                      borderRadius: '8px',
                                      background: 'var(--color-surface)',
                                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                                    }}
                                  >
                                    <Avatar src={sale.avatar_url || sale.avatar} name={sale.full_name || sale.name || ''} size={24} />
                                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                      <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {sale.full_name || sale.name}
                                      </p>
                                      <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {sale.email}
                                      </p>
                                    </div>
                                    
                                    {canEditTeam && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setTeamFormData(prev => ({
                                            ...prev,
                                            member_ids: prev.member_ids.filter(id => id !== String(sale.id))
                                          }));
                                          toast.success(`${t('Đã xóa')} ${sale.full_name || sale.name}`);
                                        }}
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          color: 'var(--color-danger)',
                                          cursor: 'pointer',
                                          padding: '4px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          borderRadius: '4px'
                                        }}
                                        title={t('Xóa khỏi nhóm')}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}

                      {/* TAB 3: THẢO LUẬN & BÌNH LUẬN NHÓM */}
                      {editingTeam && teamDrawerTab === 'comments' && (() => {
                        const rootComments = teamComments.filter((c: any) => !c.parent_id);
                        const getReplies = (parentId: number) => {
                          return teamComments
                            .filter((c: any) => Number(c.parent_id) === Number(parentId))
                            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                        };

                        const parseCommentAttachments = (bodyText: string) => {
                          const attachmentsList: {name: string, url: string}[] = [];
                          const cleanBodyLines: string[] = [];
                          const lines = (bodyText || '').split("\n");
                          
                          lines.forEach(line => {
                            const match = line.match(/^📎\s*\[(.*?)\]\((.*?)\)$/);
                            if (match) {
                              attachmentsList.push({ name: match[1], url: match[2] });
                            } else {
                              cleanBodyLines.push(line);
                            }
                          });
                          
                          return {
                            cleanBody: cleanBodyLines.join("\n").trim(),
                            attachments: attachmentsList
                          };
                        };

                        const getAttachmentIcon = (att: {name: string, url: string}) => {
                          const url = att.url.toLowerCase();
                          const name = att.name.toLowerCase();
                          
                          if (url.includes('drive.google.com') || url.includes('dropbox.com') || name.includes('folder') || name.includes('thư mục') || name.includes('kho')) {
                            return <Folder size={14} style={{ color: '#d97706' }} />;
                          }
                          if (url.startsWith('http') && !url.includes('/uploads/')) {
                            return <Link2 size={14} style={{ color: 'var(--color-primary)' }} />;
                          }
                          return <FileIcon size={14} style={{ color: '#2563eb' }} />;
                        };

                        const renderSingleCommentNode = (comment: any, isReply: boolean = false) => {
                          const { cleanBody, attachments: atts } = parseCommentAttachments(comment.body);
                          return (
                            <div key={comment.id} id={`team-comment-${comment.id}`} style={{ display: 'flex', gap: '8px', fontSize: '0.8125rem', paddingLeft: isReply ? '12px' : '0', borderLeft: isReply ? '2px solid var(--color-border-light)' : undefined, marginTop: isReply ? '6px' : '0' }}>
                              <Avatar name={comment.user_name || 'User'} src={comment.avatar_url || undefined} size={isReply ? 20 : 24} />
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', background: isReply ? 'transparent' : 'var(--color-bg-light)', border: isReply ? 'none' : '1px solid var(--color-border-light)', padding: isReply ? '2px 0' : '8px 12px', borderRadius: isReply ? '0' : '12px', flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 800, color: 'var(--color-text)', textAlign: 'left' }}>{comment.user_name || 'Thành viên'}</span>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>{comment.created_at ? formatDateTimeVN(comment.created_at) : ''}</span>
                                </div>
                                {cleanBody && /<[a-z][\s\S]*>/i.test(cleanBody) ? (
                                   <div 
                                     className="rich-text-editor-content"
                                     dangerouslySetInnerHTML={{ __html: sanitizeHtml(cleanBody) }}
                                     style={{ margin: 0, color: 'var(--color-text-light)', lineHeight: '1.4', textAlign: 'left' }}
                                   />
                                 ) : (
                                   <div style={{ margin: 0, color: 'var(--color-text-light)', whiteSpace: 'pre-wrap', lineHeight: '1.4', textAlign: 'left' }}>
                                     {cleanBody}
                                   </div>
                                 )}
                                
                                {/* Attachments rendering */}
                                {atts.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                                    {atts.map((att, attIdx) => {
                                    const safeHref = /^https?:\/\//i.test(att.url)
                                      ? att.url
                                      : `${import.meta.env.VITE_API_URL || '/backend'}/${att.url.replace(/^\/+/, '')}`;
                                    return (
                                      <a 
                                        key={attIdx}
                                        href={safeHref} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          padding: '4px 10px',
                                          background: 'var(--color-surface)',
                                          border: '1px solid var(--color-border-light)',
                                          borderRadius: '6px',
                                          textDecoration: 'none',
                                          color: 'var(--color-primary)',
                                          fontSize: '0.75rem',
                                          fontWeight: 650
                                        }}
                                      >
                                        {getAttachmentIcon(att)}
                                        <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                                        <Download size={11} style={{ opacity: 0.6 }} />
                                      </a>
                                    );
                                  })}
                                  </div>
                                )}

                                {(() => {
                                   const isAdmin = isSystemAdmin(user) || isExecutive(user);
                                   const isOwner = Number(comment.user_id) === Number(user?.id);
                                   const canDelete = isAdmin || isOwner;

                                   if (!isReply || canDelete) {
                                     return (
                                       <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                                         {!isReply && (
                                           <button
                                             type="button"
                                             onClick={() => setTeamReplyTo({ id: comment.id, userName: comment.user_name || 'Thành viên' })}
                                             style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', fontSize: '0.7rem', padding: 0, cursor: 'pointer', fontWeight: 700, textAlign: 'left', width: 'fit-content' }}
                                             className="hover-lift"
                                           >
                                             Phản hồi
                                           </button>
                                         )}
                                         {canDelete && (
                                           <button
                                             type="button"
                                             onClick={() => setCommentToDelete(comment.id)}
                                             style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '2px', display: 'inline-flex', alignItems: 'center' }}
                                             className="hover-lift"
                                             title={t('Xóa')}
                                           >
                                             <Trash2 size={12} />
                                           </button>
                                         )}
                                       </div>
                                     );
                                   }
                                   return null;
                                 })()}
                              </div>
                            </div>
                          );
                        };

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%' }}>
                            
                            {/* Post Comment Section */}
                            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {teamReplyTo && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(163, 20, 34, 0.06)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 700 }}>
                                  <span>Đang trả lời {teamReplyTo.userName}</span>
                                  <button type="button" onClick={() => setTeamReplyTo(null)} style={{ border: 'none', background: 'transparent', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 800, fontSize: '0.9rem' }}>×</button>
                                </div>
                              )}
                              
                              <div style={{ position: 'relative' }}>
                                <MentionInput
                                  value={newTeamCommentText}
                                  onChange={e => setNewTeamCommentText(e.target.value)}
                                  onImagePaste={addLocalTeamCommentAttachment}
                                  onFilePaste={addLocalTeamCommentAttachment}
                                  placeholder="Nhập nội dung trao đổi... (Dán ảnh trực tiếp Ctrl+V)"
                                  style={{ minHeight: '65px', fontSize: '0.85rem', paddingRight: '40px' }}
                                  disabled={isSubmittingTeamComment || isUploadingCommentFile}
                                />
                                <label style={{ position: 'absolute', right: '10px', bottom: '10px', cursor: (isUploadingCommentFile || isSubmittingTeamComment) ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={t('Đính kèm tệp')}>
                                  <input type="file" onChange={handleAttachCommentFile} style={{ display: 'none' }} disabled={isUploadingCommentFile || isSubmittingTeamComment} />
                                  {isUploadingCommentFile ? <RefreshCw className="spin" size={18} /> : <Paperclip size={18} />}
                                </label>
                              </div>

                              {/* Attachments Preview Row */}
                              {teamCommentAttachments.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '4px 0' }}>
                                  {teamCommentAttachments.map((att: any, idx: number) => (
                                    <span 
                                      key={idx} 
                                      style={{ 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: '4px', 
                                        background: 'var(--color-bg-light)', 
                                        border: '1px solid var(--color-border-light)', 
                                        padding: '2px 8px', 
                                        borderRadius: '6px', 
                                        fontSize: '0.72rem',
                                        fontWeight: 600
                                      }}
                                    >
                                      {att.previewUrl ? (
                                        <img src={att.previewUrl} alt="preview" style={{ width: '20px', height: '20px', borderRadius: '4px', objectFit: 'cover' }} />
                                      ) : (
                                        <Paperclip size={10} style={{ opacity: 0.6 }} />
                                      )}
                                      <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                                      <button 
                                        type="button" 
                                        onClick={() => removeTeamCommentAttachment(idx)}
                                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-danger)', fontSize: '0.9rem', padding: '0 2px' }}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Toolbar Buttons */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border-light)', paddingTop: '10px' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  {/* File Upload Button */}
                                  <label 
                                    htmlFor="team-comment-file-input"
                                    style={{ 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '4px', 
                                      padding: '4px 10px', 
                                      borderRadius: '6px', 
                                      border: '1px solid var(--color-border-light)', 
                                      fontSize: '0.75rem', 
                                      cursor: 'pointer', 
                                      background: 'var(--color-bg-light)',
                                      color: 'var(--color-text-muted)',
                                      fontWeight: 600
                                    }}
                                    className="hover-lift"
                                  >
                                    <Paperclip size={12} />
                                    <span>{isUploadingCommentFile ? t('Đang tải...') : t('Đính kèm tệp')}</span>
                                  </label>
                                  <input 
                                    id="team-comment-file-input"
                                    type="file"
                                    onChange={handleAttachCommentFile}
                                    style={{ display: 'none' }}
                                    disabled={isUploadingCommentFile}
                                  />

                                  {/* Link Attach Button */}
                                  <button
                                    type="button"
                                    onClick={handleAttachCommentLink}
                                    style={{ 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '4px', 
                                      padding: '4px 10px', 
                                      borderRadius: '6px', 
                                      border: '1px solid var(--color-border-light)', 
                                      fontSize: '0.75rem', 
                                      cursor: 'pointer', 
                                      background: 'var(--color-bg-light)',
                                      color: 'var(--color-text-muted)',
                                      fontWeight: 600
                                    }}
                                    className="hover-lift"
                                  >
                                    <Link2 size={12} />
                                    <span>{t('Đính kèm Link')}</span>
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handlePostTeamComment(editingTeam.id)}
                                  disabled={isSubmittingTeamComment}
                                  className="btn primary sm"
                                  style={{ padding: '6px 16px', fontSize: '0.75rem', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <Send size={11} />
                                  <span>{isSubmittingTeamComment ? t('Đang gửi...') : t('Gửi')}</span>
                                </button>
                              </div>
                            </div>

                            {/* Comments List Feed */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '12px', padding: '16px', maxHeight: '350px' }} className="custom-scrollbar">
                              {loadingTeamComments ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                  <RefreshCw className="spin" size={18} color="var(--color-text-muted)" />
                                </div>
                              ) : teamComments.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                                  {t('Chưa có bình luận nào. Phòng ban hãy bình luận trao đổi thông tin tại đây.')}
                                </div>
                              ) : (
                                rootComments.map((rootComment: any) => {
                                  const replies = getReplies(rootComment.id);
                                  return (
                                    <div key={rootComment.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      {renderSingleCommentNode(rootComment, false)}
                                      {replies.length > 0 && (
                                        <div style={{ marginLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '1px solid var(--color-border-light)', paddingLeft: '8px', marginTop: '4px' }}>
                                          {replies.map((reply: any) => renderSingleCommentNode(reply, true))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>

                          </div>
                        );
                      })()}

                    </div>
                  </div>
                </form>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {confirmDeleteTeamOpen && (
        <ConfirmModal
          isOpen={confirmDeleteTeamOpen}
          onClose={() => setConfirmDeleteTeamOpen(false)}
          onConfirm={handleDeleteTeam}
          title={t("Xóa Phòng ban")}
          message={t("Bạn có chắc chắn muốn xóa phòng ban này không? Các thành viên trong phòng ban sẽ được đưa về trạng thái tự do (không thuộc phòng ban nào).")}
          confirmText={t("Xóa phòng ban")}
        />
      )}

      {confirmLeaveTeamOpen && (
        <ConfirmModal
          isOpen={confirmLeaveTeamOpen}
          onClose={() => setConfirmLeaveTeamOpen(false)}
          onConfirm={handleLeaveTeam}
          title={t("Rời khỏi nhóm")}
          message={t("Bạn có chắc chắn muốn rời khỏi nhóm này không? Bạn sẽ không còn thuộc nhóm này và hệ thống phân bổ data sẽ được cập nhật tương ứng.")}
          confirmText={t("Rời nhóm")}
        />
      )}

      {/* Consultants & Teams Guide Modal */}
      {showInfoModal && (
        <CustomModal
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
          title={t("Hướng dẫn thiết lập Cơ cấu Nhân sự & Phòng ban")}
          width="760px"
        >
        <div style={{ padding: '0.25rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12, 
            padding: '0.875rem 1rem', 
            background: 'var(--color-primary-light)', 
            border: '1px solid rgba(163, 20, 34, 0.15)', 
            borderRadius: 12 
          }}>
            <Info size={24} color="var(--color-primary)" style={{ flexShrink: 0 }} />
            <p style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 0 }}>
              {t("Cơ cấu nhân sự là nền tảng để vận hành thuật toán phân chia data và kiểm soát hiệu suất. Hệ thống hỗ trợ quản lý 3 cấp độ:")}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Phòng ban */}
            <div style={{ 
              display: 'flex', 
              gap: 12, 
              padding: '1rem', 
              background: '#ffffff', 
              border: '1px solid #e2e8f0',
              borderRadius: '12px'
            }}>
              <Users size={20} color="#334155" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h5 style={{ fontSize: '0.875rem', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--color-text)' }}>
                  {t("1. Phòng ban (Departments)")}
                </h5>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                  • <strong>Phòng ban</strong>: Các tổ chức bán hàng độc lập có Trưởng phòng (Leader) phụ trách. Mỗi phòng ban có thể cài đặt <strong>Dự án trọng điểm</strong> để phối hợp nhận lead tự động từ hệ thống khi có rule định tuyến khớp dự án đó.<br />
                  • <strong>Quản lý phòng ban</strong>: Để điều chỉnh phòng ban hoặc cập nhật Trưởng phòng, quản trị viên chỉ cần nhấp trực tiếp vào thẻ tương ứng ở tab Phòng ban để mở form cấu hình.
                </p>
              </div>
            </div>

            {/* Trạng thái hoạt động */}
            <div style={{ 
              display: 'flex', 
              gap: 12, 
              padding: '1rem', 
              background: '#ffffff', 
              border: '1px solid #e2e8f0',
              borderRadius: '12px'
            }}>
              <Users size={20} color="#BD1D2D" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h5 style={{ fontSize: '0.875rem', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--color-text)' }}>
                  {t("2. Quản lý TVV & Chế độ Nghỉ phép (Vacation Mode)")}
                </h5>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                  • <strong>Tài khoản TVV</strong>: Cấu hình ca làm việc, thời gian hoạt động và quyền hạn.<br />
                  • <strong>Chế độ nghỉ phép (Vacation Mode)</strong>: Khi bật chế độ này cho một TVV, hệ thống sẽ <strong>tạm thời bỏ qua (bypass)</strong> TVV đó trong hàng đợi chia số của vòng phân bổ (Round-Robin). Lead sẽ tự động chuyển sang người tiếp theo để tránh trễ hạn phản hồi khách hàng.
                </p>
              </div>
            </div>

            {/* Chỉ tiêu KPI */}
            <div style={{ 
              display: 'flex', 
              gap: 12, 
              padding: '1rem', 
              background: '#ffffff', 
              border: '1px solid #e2e8f0',
              borderRadius: '12px'
            }}>
              <TrendingUp size={20} color="#334155" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h5 style={{ fontSize: '0.875rem', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--color-text)' }}>
                  {t("3. Thiết lập KPI & Giới hạn thành viên (KPI Targets & Capacity)")}
                </h5>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                  • <strong>KPI Target</strong>: Thiết lập mục tiêu doanh số của nhóm dùng cho các báo cáo so sánh hiệu suất nhóm.<br />
                  • <strong>Max Members</strong>: Giới hạn số lượng nhân sự tối đa trong nhóm để kiểm soát quy mô và hiệu quả quản trị của Trưởng nhóm.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', gap: '0.75rem', borderTop: '1px solid var(--color-border-light)', paddingTop: '1rem' }}>
          <button className="btn primary" onClick={() => setShowInfoModal(false)} style={{ minWidth: 100 }}>{t("Đồng ý")}</button>
        </div>
        </CustomModal>
      )}

      {/* Zalo Bot Connect Modal */}
      {isZaloModalOpen && (
      <CustomModal
          isOpen={isZaloModalOpen}
          onClose={() => setIsZaloModalOpen(false)}
          title="Kết Nối Zalo Bot Nhận Thông Báo"
          width={640}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '6px 2px' }}>
            {/* Header banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              padding: '14px 16px',
              borderRadius: '12px'
            }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#0068ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MessageCircle size={18} style={{ color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e3a8a' }}>
                  Xác Thực Tài Khoản Zalo Cá Nhân
                </div>
                <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: 2 }}>
                  Gửi mã kết nối bên dưới đến Zalo Bot để hoàn tất liên kết
                </div>
              </div>
            </div>

            {/* 2-column layout */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch' }}>

              {/* Left: Steps */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {/* Bước 1 */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#0068ff', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>1</span>
                    Nhấn liên kết mở Zalo Bot:
                  </div>
                  <a
                    href={zaloBotLink}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 18px',
                      background: '#0068ff',
                      color: 'white',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.8125rem',
                      textDecoration: 'none',
                      boxShadow: '0 3px 8px rgba(0,104,255,0.25)'
                    }}
                  >
                    Mở Zalo Bot Trực Tiếp <ExternalLink size={14} />
                  </a>
                </div>

                {/* Bước 2 */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', flex: 1 }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#0068ff', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>2</span>
                    Gửi mã kết nối cho Zalo Bot:
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      flex: 1,
                      background: '#0f172a',
                      color: '#38bdf8',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '1.05rem',
                      letterSpacing: '1px',
                      textAlign: 'center',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                    }}>
                      {user?.id}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const code = `CONNECT ${user?.id || ''}`;
                        navigator.clipboard.writeText(code);
                        setCopiedCode(true);
                        toast.success('Đã sao chép mã kết nối Zalo Bot!');
                        setTimeout(() => setCopiedCode(false), 2000);
                      }}
                      style={{
                        padding: '10px 16px',
                        background: copiedCode ? '#16a34a' : '#0068ff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '0.8125rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexShrink: 0,
                        transition: 'all 0.2s'
                      }}
                    >
                      {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                      {copiedCode ? 'Đã sao chép' : 'Sao chép mã'}
                    </button>
                  </div>
                </div>

              </div>

              {/* Right: QR Code */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
                minWidth: 160
              }}>
                <div style={{
                  background: '#fff',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {zaloBotLink ? (
                    <QRCodeCanvas
                      value={zaloBotLink}
                      size={120}
                      level="H"
                      includeMargin={false}
                    />
                  ) : (
                    <div style={{ width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                      <Smartphone size={40} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>
                  <Smartphone size={13} /> Quét bằng điện thoại
                </div>
                <div style={{ fontSize: '0.6875rem', color: '#64748b', textAlign: 'center', lineHeight: 1.4 }}>
                  Mở camera để quét &amp; chat trực tiếp
                </div>
              </div>

            </div>

            <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', marginTop: 4 }}>
              Ngay khi nhắn mã thành công, Zalo Bot sẽ tự động phản hồi xác nhận liên kết tài khoản của bạn.
            </div>
          </div>
        </CustomModal>
      )}

      {commentToDelete !== null && (
        <ConfirmModal
          isOpen={commentToDelete !== null}
          onClose={() => setCommentToDelete(null)}
          onConfirm={async () => {
            if (commentToDelete !== null) {
              await handleDeleteTeamComment(commentToDelete);
              setCommentToDelete(null);
            }
          }}
          title={t('Xác nhận xóa bình luận')}
          message={t('Bạn có chắc chắn muốn xóa bình luận này không? Hành động này không thể hoàn tác.')}
          confirmText={t('Xóa')}
          cancelText={t('Hủy')}
          confirmType="danger"
        />
      )}

      {/* Attach Safe HTTPS Link Modal */}
      {showLinkInputModal && (
        <CustomModal
          isOpen={showLinkInputModal}
          onClose={() => {
            setShowLinkInputModal(false);
            setLinkInputError('');
          }}
          title={t('Đính kèm Liên kết (URL)')}
          width="460px"
          zIndex={2147483647}
        >
          <form onSubmit={handleConfirmAttachLink} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">{t('Địa chỉ liên kết (HTTPS/HTTP)')} <span style={{ color: 'var(--color-danger)' }}>*</span></label>
              <input
                type="url"
                className="form-input"
                placeholder="https://..."
                value={linkInputUrl}
                onChange={(e) => {
                  setLinkInputUrl(e.target.value);
                  if (linkInputError) setLinkInputError('');
                }}
                required
                autoFocus
              />
              {linkInputError && (
                <p style={{ color: 'var(--color-danger)', fontSize: '0.75rem', marginTop: '6px', marginBottom: 0 }}>
                  {linkInputError}
                </p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">{t('Tên hiển thị (tùy chọn)')}</label>
              <input
                type="text"
                className="form-input"
                placeholder={t('Để trống sẽ hiển thị theo URL')}
                value={linkInputTitle}
                onChange={(e) => setLinkInputTitle(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--color-border-light)' }}>
              <button type="button" className="btn ghost sm" onClick={() => setShowLinkInputModal(false)}>
                {t('Hủy')}
              </button>
              <button type="submit" className="btn primary sm">
                {t('Đính kèm Link')}
              </button>
            </div>
          </form>
        </CustomModal>
      )}
    </div>
  );
};

export const Consultants = withRouterFreezer(ConsultantsInner, '/consultants');

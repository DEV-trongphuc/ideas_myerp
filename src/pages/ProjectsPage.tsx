import React, { useEffect, useState, useRef, useMemo, useCallback, useId, memo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchAPI } from '../utils/api';
import { ensureArray, extractArray } from '../utils/safeArray';
import api from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/uiStore';
import {
  Building2, Users, FileText, Plus, Trash2, Edit, X, Upload, Download, Check,
  AlertCircle, Layers, FileSpreadsheet, Link2, Globe, Search, Folder, ExternalLink,
  MessageSquare, Paperclip, RefreshCw, Calendar, CheckSquare, HardDrive, Info,
  MapPin, Briefcase, AlignLeft, History, GraduationCap, BookOpen, Award,
  Mail, Phone, Copy, ChevronLeft, Save, Archive, Send, Settings,
  Eye, Megaphone, ShieldAlert, Zap
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { EmptyCard } from '../components/ui/EmptyCard';
import { compressToWebP } from '../utils/imageCompress';
import { CustomSelect } from '../components/ui/CustomSelect';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { AddressSelect } from '../components/ui/AddressSelect';
import { CustomModal } from '../components/ui/CustomModal';
import { Pagination } from '../components/ui/Pagination';
import { Skeleton } from '../components/ui/Skeleton';
import { Avatar } from '../components/ui/Avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { MentionInput } from '../components/ui/MentionInput';
const WorkspaceTaskDrawer = lazy(() => import('./WorkspaceTaskDrawer').then(module => ({ default: module.WorkspaceTaskDrawer })));
const CompanyDrawer = lazy(() => import('./CompanyDrawer').then(module => ({ default: module.CompanyDrawer })));
import { useUploadProgress } from '../contexts/UploadProgressContext';
const ProjectGanttTab = lazy(() => import('../components/ProjectGanttTab').then(module => ({ default: module.ProjectGanttTab })));
import { VietnameseDateInput } from '../components/ui/VietnameseDateInput';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { pushOverlay } from '../utils/overlayStack';
import { formatDateVN, formatDateTimeVN, getLocalDateStr } from '../utils/dateUtils';
import {
  normalizeRole,
  isSystemAdmin as checkIsSystemAdmin,
  isExecutive,
  isManagement,
  isMarketing,
  isAcademic,
  isViewer,
  getUserDisplayRoleOrTitle
} from '../utils/roleUtils';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
const SubjectAnnouncementModal = lazy(() => import('../components/academic/SubjectAnnouncementModal').then(module => ({ default: module.SubjectAnnouncementModal })));
import { ResponsiveSegmentedTabs } from '../components/ui/MobileResponsiveTabs';
import '../components/Dashboard/DomationDashboard.css';
import { DomKpiTile, DomSegmentedSwitch, DomToolbarButton } from '../components/Dashboard/DomationDashboardKit';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB matching UploadController
const BLOCKED_UPLOAD_EXTS = new Set([
  'php', 'phtml', 'php3', 'php4', 'php5', 'phar',
  'html', 'htm', 'xhtml', 'svg', 'svgz',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
  'exe', 'dll', 'bat', 'cmd', 'sh', 'bash', 'ps1', 'vbs', 'msi', 'app'
]);

const TASK_PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1
};

const safeJsonParse = <T = any>(raw: unknown, fallback: T): T => {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw !== 'string') return raw as T;
  try {
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
};

const safeParseArray = <T = any>(raw: unknown): T[] => {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    const parsed = safeJsonParse<unknown>(trimmed, []);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  }
  return [];
};

const sanitizeExternalUrl = (
  rawUrl: unknown,
  options: { allowRelative?: boolean; allowMailTel?: boolean } = {}
): string => {
  const { allowRelative = true, allowMailTel = true } = options;
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  const normalized = trimmed.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('file:')
  ) {
    return '';
  }
  if (allowRelative && trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  if (allowMailTel && (normalized.startsWith('mailto:') || normalized.startsWith('tel:'))) {
    return trimmed;
  }
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://localhost';
    const parsed = new URL(trimmed, origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
  } catch {
    // Ignore invalid URL
  }
  return '';
};

const getApiBaseUrl = (): string => {
  const apiBase = import.meta.env.VITE_API_URL || '/backend';
  let baseUrl = apiBase;
  if (baseUrl.includes('api.php')) {
    baseUrl = baseUrl.split('api.php')[0];
  }
  return baseUrl.replace(/\/+$/, '') || '/backend';
};

const isAbortError = (err: any): boolean => {
  return Boolean(
    err?.name === 'AbortError' ||
    err?.name === 'CanceledError' ||
    err?.code === 'ERR_CANCELED' ||
    err?.__CANCEL__
  );
};

const makeUniqueId = (prefix: string): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
};

const unwrapPaginatedList = <T = any>(res: any): { items: T[]; total: number } => {
  const items = extractArray<T>(res);
  const rawTotal =
    res?.meta?.total ??
    res?.data?.meta?.total ??
    res?.data?.total ??
    res?.total;
  const parsedTotal = Number(rawTotal);
  const total =
    rawTotal !== undefined && rawTotal !== null && Number.isFinite(parsedTotal)
      ? parsedTotal
      : items.length;
  return { items, total };
};

const isAllowedUploadFile = (
  file: File,
  maxMb: number = 50,
  extraBlockedExts?: string[]
): string | null => {
  if (!file) return 'Tệp không hợp lệ';
  const effectiveMaxBytes = (Number.isFinite(Number(maxMb)) && Number(maxMb) > 0 ? Number(maxMb) : 50) * 1024 * 1024;
  if (file.size > effectiveMaxBytes) {
    return `Dung lượng tệp đính kèm không được vượt quá ${Math.round(effectiveMaxBytes / (1024 * 1024))}MB`;
  }
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || '' : '';
  const extraBlocked = Array.isArray(extraBlockedExts) ? extraBlockedExts.map(x => String(x).toLowerCase().trim()) : [];
  if (ext && (BLOCKED_UPLOAD_EXTS.has(ext) || extraBlocked.includes(ext))) {
    return 'Định dạng tệp không được hỗ trợ vì lý do bảo mật';
  }
  return null;
};

let activeDrawerBodyLocks = 0;
let prevDrawerBodyOverflow = '';

const lockDrawerBodyScroll = () => {
  if (typeof document === 'undefined') return;
  if (activeDrawerBodyLocks === 0) {
    prevDrawerBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  activeDrawerBodyLocks++;
};

const unlockDrawerBodyScroll = () => {
  if (typeof document === 'undefined') return;
  activeDrawerBodyLocks = Math.max(0, activeDrawerBodyLocks - 1);
  if (activeDrawerBodyLocks === 0) {
    document.body.style.overflow = prevDrawerBodyOverflow || '';
  }
};

interface SlideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
  headerActions?: React.ReactNode;
  isCampaign?: boolean;
  showBackButton?: boolean;
  isMobile: boolean;
  nested?: boolean;
  overlayKey?: string;
  motionMs?: number;
  backdropZIndex?: number;
  panelZIndex?: number;
}

const SlideDrawer: React.FC<SlideDrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  width = '850px',
  headerActions,
  isCampaign = false,
  showBackButton = false,
  isMobile,
  nested = false,
  overlayKey,
  motionMs = 220,
  backdropZIndex = 2147483620,
  panelZIndex = 2147483625,
}) => {
  const reactId = useId();
  const drawerId = useMemo(
    () => overlayKey || `projects-${nested ? 'nested-' : ''}${reactId.replace(/:/g, '')}-drawer`,
    [overlayKey, nested, reactId]
  );
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const baseBackdrop = Number.isFinite(Number(backdropZIndex)) ? Number(backdropZIndex) : 2147483620;
  const basePanel = Number.isFinite(Number(panelZIndex)) ? Number(panelZIndex) : 2147483625;
  const backdropZ = nested ? baseBackdrop + 10 : baseBackdrop;
  const panelZ = nested ? basePanel + 10 : basePanel;
  const durationSec = Math.max(0.12, Math.min(0.45, (Number(motionMs) || 220) / 1000));

  useEffect(() => {
    if (!isOpen) return;
    lockDrawerBodyScroll();
    const unregister = pushOverlay(drawerId, () => onCloseRef.current(), panelZ);
    return () => {
      unregister();
      unlockDrawerBodyScroll();
    };
  }, [isOpen, drawerId, panelZ]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="drawer-backdrop"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: durationSec, ease: [0.25, 0.1, 0.25, 1] }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: backdropZ,
              '--drawer-backdrop-z': backdropZ,
              backdropFilter: 'blur(4px)',
              cursor: 'pointer'
            } as React.CSSProperties}
          />
          <motion.div
            className="drawer-sheet drawer-panel"
            initial={isMobile ? { y: '100%' } : { opacity: 0, x: 250 }}
            animate={{ y: 0, x: 0, opacity: 1 }}
            exit={isMobile ? { y: '100%' } : { opacity: 0, x: 250 }}
            transition={{ duration: durationSec, ease: [0.25, 0.1, 0.25, 1] }}
            style={{
              left: isMobile ? 0 : 'auto',
              right: 0,
              width: isMobile ? '100vw' : width,
              maxWidth: '100vw',
              zIndex: panelZ,
              '--drawer-panel-z': panelZ,
              background: 'var(--color-bg, #f8fafc)',
              display: 'flex',
              flexDirection: 'column',
              position: 'fixed',
              top: 0,
              bottom: 0,
              boxShadow: '-10px 0 30px rgba(0,0,0,0.15)',
              willChange: 'transform, opacity'
            } as React.CSSProperties}
          >
            {/* Drawer Header */}
            <div style={{
              padding: isMobile ? '0.75rem 1rem' : '1.25rem 1.5rem',
              borderBottom: '1px solid var(--color-border-light, #e2e8f0)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--color-surface, #ffffff)',
              position: 'sticky',
              top: 0,
              zIndex: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                {(showBackButton || (isCampaign && isMobile)) && (
                  <button
                    type="button"
                    onClick={onClose}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px 4px 0' }}
                  >
                    <ChevronLeft size={24} />
                  </button>
                )}
                <h3 style={{ margin: 0, fontSize: (showBackButton || (isCampaign && isMobile)) ? '0.925rem' : '1.125rem', fontWeight: 800, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {headerActions}
                {(!isCampaign || !isMobile) && !showBackButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '50%' }}
                    className="hover-lift"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            </div>
            {/* Drawer Content */}
            <div style={{ padding: isMobile ? '0.5rem 0.5rem 100px 0.5rem' : '1.5rem', overflowY: 'auto', flex: 1 }} className="custom-scrollbar">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

const parseSeminarTimeSlot = (timeSlot: string) => {
  const result = {
    sessions_count: 1,
    session1_start: '08:30',
    session1_end: '11:30',
    session2_start: '13:30',
    session2_end: '16:30'
  };

  if (!timeSlot) return result;

  const parts = timeSlot.split('&').map(p => p.trim());
  if (parts.length >= 2) {
    result.sessions_count = 2;
    const p1 = parts[0].split(/[-–]/).map(t => t.trim());
    if (p1[0]) result.session1_start = p1[0];
    if (p1[1]) result.session1_end = p1[1];

    const p2 = parts[1].split(/[-–]/).map(t => t.trim());
    if (p2[0]) result.session2_start = p2[0];
    if (p2[1]) result.session2_end = p2[1];
  } else {
    result.sessions_count = 1;
    const p1 = parts[0].split(/[-–]/).map(t => t.trim());
    if (p1[0]) result.session1_start = p1[0];
    if (p1[1]) result.session1_end = p1[1];
  }

  return result;
};

const formatSeminarTimeSlot = (sCount: number, s1s: string, s1e: string, s2s: string, s2e: string) => {
  if (Number(sCount) === 2) {
    return `${s1s || '08:30'} - ${s1e || '11:30'} & ${s2s || '13:30'} - ${s2e || '16:30'}`;
  } else {
    return `${s1s || '08:30'} - ${s1e || '11:30'}`;
  }
};

interface Project {
  id: number;
  name: string;
  code: string;
  description: string;
  status: string;
  developer?: string;
  location?: string;
  created_at: string;
  updated_at?: string;
  roster_count?: number;
  doc_count?: number;
  document_ids?: string;
  campaign_ids?: string;
  campaign_ids_array?: number[];
  progress_percent?: number;
  construction_status?: string;
  legal_status?: string;
  scale_block_count?: number;
  scale_unit_count?: number;
  handover_year?: number;
  folder_path?: string;
  manager_ids?: string;
  created_by?: number;
  reference_url?: string;
  campaign_sharing_mode?: string;
  is_archived?: boolean | number;
  is_hidden?: boolean | number;
  deleted_at?: string | null;
}

interface RosterMember {
  id: number;
  full_name: string;
  email: string;
  role: string;
  is_assigned: number;
  avatar_url?: string;
  team_id?: number;
}

interface ProjectDoc {
  id: number;
  name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by_name: string;
  created_at: string;
  isLinkedOnly?: boolean;
}

interface ReferenceLink {
  title: string;
  url: string;
}

interface FolderPathObj {
  type: 'link' | 'select';
  path: string;
}

const parseReferenceLinks = (urlStr: string | undefined): ReferenceLink[] => {
  if (!urlStr || typeof urlStr !== 'string') return [];
  const trimmed = urlStr.trim();
  if (!trimmed) return [];
  const parsed = safeJsonParse<unknown>(trimmed, null);
  if (Array.isArray(parsed)) {
    return parsed
      .filter((item: any) => item && typeof item === 'object')
      .map((item: any) => ({
        title: String(item.title || 'Website / Link tham khảo'),
        url: String(item.url || '')
      }));
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return [];
  }
  return [{ title: 'Website / Link tham khảo', url: trimmed }];
};

const parseFolderPaths = (pathStr: string | undefined): FolderPathObj[] => {
  if (!pathStr || typeof pathStr !== 'string') return [];
  const trimmed = pathStr.trim();
  if (!trimmed) return [];
  const parsed = safeJsonParse<unknown>(trimmed, null);
  if (Array.isArray(parsed)) {
    return parsed
      .filter((item: any) => item && typeof item === 'object')
      .map((item: any) => ({
        type: item.type === 'link' || item.type === 'select' ? item.type : 'link',
        path: String(item.path || '')
      }));
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return [];
  }
  const isUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://');
  return [{ type: isUrl ? 'link' : 'select', path: trimmed }];
};

const ProjectCardSkeleton = () => (
  <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--color-surface, #FFFFFF)', border: '1px solid var(--color-border-light, #E2E8F0)', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Skeleton width="70%" height={20} />
      <Skeleton width={60} height={20} borderRadius={8} />
    </div>
    <Skeleton width={120} height={12} style={{ marginTop: '4px' }} />
    <Skeleton width="100%" height={14} style={{ marginTop: '4px' }} />
    <div style={{ height: '1px', background: 'var(--color-border-light, #E2E8F0)', margin: '4px 0' }} />
    <div style={{ display: 'flex', gap: '8px' }}>
      <Skeleton width="45%" height={24} borderRadius={6} />
      <Skeleton width="45%" height={24} borderRadius={6} />
    </div>
    <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
      <Skeleton width={80} height={12} />
      <Skeleton width={80} height={12} />
    </div>
    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
      <Skeleton width="50%" height={32} borderRadius={8} />
      <Skeleton width="50%" height={32} borderRadius={8} />
    </div>
  </div>
);

const CampaignCardSkeleton = () => (
  <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', background: 'var(--color-surface, #FFFFFF)', border: '1px solid var(--color-border-light, #E2E8F0)', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Skeleton width="60%" height={18} />
      <Skeleton width={80} height={22} borderRadius={8} />
    </div>
    <Skeleton width="100%" height={14} style={{ marginTop: '4px' }} />
    <div style={{ display: 'flex', gap: '12px' }}>
      <Skeleton width={70} height={12} />
      <Skeleton width={70} height={12} />
    </div>
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      <Skeleton width={32} height={32} borderRadius="50%" />
      <Skeleton width={32} height={32} borderRadius="50%" />
      <Skeleton width={32} height={32} borderRadius="50%" />
    </div>
    <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--color-border-light, #E2E8F0)', paddingTop: '1rem' }}>
      <Skeleton width="50%" height={32} borderRadius={8} />
      <Skeleton width="50%" height={32} borderRadius={8} />
    </div>
  </div>
);

const projectsPageCache: {
  scopeKey: string;
  projects: Project[];
  totalProjects: number;
  projectLookup: Project[];
  projectLookupTimestamp: number;
  projectsByPage: Map<string, { items: Project[]; total: number; timestamp: number }>;
  campaigns: any[];
  totalCampaigns: number;
  campaignsTimestamp: number;
  users: any[];
  usersTimestamp: number;
  developers: any[];
  developersTimestamp: number;
  allFiles: any[];
  allFilesTimestamp: number;
  consultants: any[];
  consultantsTimestamp: number;
  companiesList: any[];
  companiesTimestamp: number;
  teams: any[];
  teamsTimestamp: number;
  fileCategories: { id: number; label: string }[];
  fileCategoriesTimestamp: number;
} = {
  scopeKey: '',
  projects: [],
  totalProjects: 0,
  projectLookup: [],
  projectLookupTimestamp: 0,
  projectsByPage: new Map(),
  campaigns: [],
  totalCampaigns: 0,
  campaignsTimestamp: 0,
  users: [],
  usersTimestamp: 0,
  developers: [],
  developersTimestamp: 0,
  allFiles: [],
  allFilesTimestamp: 0,
  consultants: [],
  consultantsTimestamp: 0,
  companiesList: [],
  companiesTimestamp: 0,
  teams: [],
  teamsTimestamp: 0,
  fileCategories: [],
  fileCategoriesTimestamp: 0
};

const projectStatsCache = new Map<string, { data: any; timestamp: number }>();
const campaignStatsCache = new Map<string, { data: any; timestamp: number }>();
const projectRosterCache = new Map<string, { data: any[]; timestamp: number }>();
const entityCommentsCache = new Map<string, { data: any[]; timestamp: number }>();
const entityTasksCache = new Map<string, { data: any[]; timestamp: number }>();
const PROJECTS_SWR_TTL_MS = 45_000;

const resetProjectsPageCaches = (nextScopeKey: string) => {
  projectsPageCache.scopeKey = nextScopeKey;
  projectsPageCache.projects = [];
  projectsPageCache.totalProjects = 0;
  projectsPageCache.projectLookup = [];
  projectsPageCache.projectLookupTimestamp = 0;
  projectsPageCache.projectsByPage.clear();
  projectsPageCache.campaigns = [];
  projectsPageCache.totalCampaigns = 0;
  projectsPageCache.campaignsTimestamp = 0;
  projectsPageCache.users = [];
  projectsPageCache.usersTimestamp = 0;
  projectsPageCache.developers = [];
  projectsPageCache.developersTimestamp = 0;
  projectsPageCache.allFiles = [];
  projectsPageCache.allFilesTimestamp = 0;
  projectsPageCache.consultants = [];
  projectsPageCache.consultantsTimestamp = 0;
  projectsPageCache.companiesList = [];
  projectsPageCache.companiesTimestamp = 0;
  projectsPageCache.teams = [];
  projectsPageCache.teamsTimestamp = 0;
  projectsPageCache.fileCategories = [];
  projectsPageCache.fileCategoriesTimestamp = 0;
  projectStatsCache.clear();
  campaignStatsCache.clear();
  projectRosterCache.clear();
  entityCommentsCache.clear();
  entityTasksCache.clear();
};

interface ProjectDetailsKpiStripProps {
  projectStats: any;
  projectRevenue: number;
  canDrilldown: boolean;
  onDrilldown?: () => void;
}

const ProjectDetailsKpiStrip = memo<ProjectDetailsKpiStripProps>(({
  projectStats,
  projectRevenue,
  canDrilldown,
  onDrilldown,
}) => (
  <div className="responsive-grid-4 dashboard-kpi-grid" style={{ marginBottom: '0.5rem' }}>
    <DomKpiTile
      label="Tổng Học Viên"
      value={Number(projectStats?.won_deals ?? 0).toLocaleString('vi-VN')}
      accent="brand"
      icon={<Users size={15} />}
      onClick={canDrilldown ? onDrilldown : undefined}
      breakdown={
        <span>• Trong tổng <strong style={{ color: '#0f172a' }}>{Number(projectStats?.total_leads ?? 0).toLocaleString('vi-VN')}</strong> hồ sơ</span>
      }
    />
    <DomKpiTile
      label="Cơ Hội Tuyển Sinh"
      value={Number(projectStats?.total_deals ?? 0).toLocaleString('vi-VN')}
      accent="brand"
      valueTone="brand"
      icon={<Layers size={15} />}
      breakdown={<span>• Hồ sơ đang tư vấn &amp; xử lý</span>}
    />
    <DomKpiTile
      label="Học Phí Thực Thu"
      value={
        projectRevenue >= 1000000000
          ? `${(projectRevenue / 1000000000).toFixed(2)} tỷ`
          : `${(projectRevenue / 1000000).toFixed(0)} triệu`
      }
      accent="slate"
      icon={<Building2 size={15} />}
      breakdown={
        <>
          <span>• Từ hóa đơn đã thanh toán</span>
          <span>• Tổng thu: <strong style={{ color: '#0f172a' }}>{projectRevenue.toLocaleString('vi-VN')} đ</strong></span>
        </>
      }
    />
    <DomKpiTile
      label="Tỷ Lệ Nhập Học"
      value={`${Number(projectStats?.win_rate ?? 0)}%`}
      accent="slate"
      icon={<CheckSquare size={15} />}
      breakdown={<span>• Tỷ lệ chuyển đổi học viên</span>}
    />
  </div>
));

interface ProjectLecturerStatsKpiStripProps {
  lecturerCount: number;
  assignedSubjects: number;
  subjectsCount: number;
  assignmentRate: number;
  totalSessions: number;
  totalSeminars: number;
  topLecturerName: string | null;
  topLecturerClassesCount: number;
}

const ProjectLecturerStatsKpiStrip = memo<ProjectLecturerStatsKpiStripProps>(({
  lecturerCount,
  assignedSubjects,
  subjectsCount,
  assignmentRate,
  totalSessions,
  totalSeminars,
  topLecturerName,
  topLecturerClassesCount,
}) => (
  <div className="responsive-grid-4 dashboard-kpi-grid">
    <DomKpiTile
      label="Tổng Giảng Viên"
      value={lecturerCount}
      accent="brand"
      icon={<Users size={15} />}
      breakdown={<span>• Đội ngũ giảng viên khóa học</span>}
    />
    <DomKpiTile
      label="Tỷ Lệ Phân Công"
      value={`${assignedSubjects} / ${subjectsCount} môn`}
      accent="brand"
      valueTone="brand"
      icon={<CheckSquare size={15} />}
      breakdown={<span>• Đã phân công <strong style={{ color: '#0f172a' }}>{assignmentRate}%</strong> môn học</span>}
    />
    <DomKpiTile
      label="Buổi học & Chuyên đề"
      value={`${totalSessions} / ${totalSeminars}`}
      accent="slate"
      icon={<BookOpen size={15} />}
      breakdown={<span>• Tổng số buổi trường / chuyên đề</span>}
    />
    <DomKpiTile
      label="GV Giảng Dạy Nhiều Nhất"
      value={topLecturerName || 'Chưa có'}
      accent="slate"
      icon={<Award size={15} />}
      breakdown={
        <span>
          • {topLecturerName ? <>Phụ trách <strong style={{ color: '#0f172a' }}>{topLecturerClassesCount} buổi</strong> giảng</> : 'Chưa có lịch dạy'}
        </span>
      }
    />
  </div>
));

interface CampaignDetailsKpiStripProps {
  campaignStats: any;
  subjectsCount: number;
  activeSubjectsCount: number;
  endedSubjectsCount: number;
  notStartedSubjectsCount: number;
  totalSessions: number;
  totalSeminars: number;
  campaignRevenue: number;
  canDrilldown: boolean;
  onDrilldown?: () => void;
}

const CampaignDetailsKpiStrip = memo<CampaignDetailsKpiStripProps>(({
  campaignStats,
  subjectsCount,
  activeSubjectsCount,
  endedSubjectsCount,
  notStartedSubjectsCount,
  totalSessions,
  totalSeminars,
  campaignRevenue,
  canDrilldown,
  onDrilldown,
}) => (
  <div className="responsive-grid-4 dashboard-kpi-grid" style={{ marginBottom: '1.25rem' }}>
    <DomKpiTile
      label="Tổng Học Viên"
      value={Number(campaignStats?.won_deals ?? 0).toLocaleString('vi-VN')}
      accent="brand"
      icon={<Users size={15} />}
      onClick={canDrilldown ? onDrilldown : undefined}
      breakdown={
        <span>• <strong style={{ color: '#0f172a' }}>{Number(campaignStats?.converted_leads ?? 0).toLocaleString('vi-VN')}</strong> liên hệ / {Number(campaignStats?.total_leads ?? 0).toLocaleString('vi-VN')} tiềm năng</span>
      }
    />
    <DomKpiTile
      label="Tổng Môn Học"
      value={subjectsCount}
      accent="brand"
      valueTone="brand"
      icon={<BookOpen size={15} />}
      breakdown={
        <span>• <strong style={{ color: '#0f172a' }}>{totalSessions}</strong> buổi trường / <strong style={{ color: '#0f172a' }}>{totalSeminars}</strong> chuyên đề</span>
      }
    />
    <DomKpiTile
      label="Tiến Độ Môn Học"
      value={`${activeSubjectsCount} / ${subjectsCount} đang học`}
      accent="slate"
      icon={<Calendar size={15} />}
      breakdown={<span>• {endedSubjectsCount} đã kết thúc, {notStartedSubjectsCount} chưa mở</span>}
    />
    <DomKpiTile
      label="Học Phí Thực Thu"
      value={
        campaignRevenue >= 1000000000
          ? `${(campaignRevenue / 1000000000).toFixed(2)} tỷ`
          : `${(campaignRevenue / 1000000).toFixed(0)} triệu`
      }
      accent="slate"
      icon={<GraduationCap size={15} />}
      breakdown={
        <>
          <span>• Từ hóa đơn đã thanh toán</span>
          <span>• Tổng thu: <strong style={{ color: '#0f172a' }}>{campaignRevenue.toLocaleString('vi-VN')} đ</strong></span>
        </>
      }
    />
  </div>
));

export default function ProjectsPage() {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 991 : false));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 991px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const { user } = useAuth();
  const { startUpload, updateProgress, finishUpload } = useUploadProgress();
  const { addToast, showConfirm, openCustomerDrawer } = useUIStore(useShallow((s) => ({ addToast: s.addToast, showConfirm: s.showConfirm, openCustomerDrawer: s.openCustomerDrawer })));
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const defaultProjectsPageSize = useTypedSubSetting<number>('hrm.ptk_ui_and_polling_limits', 'projects_page', 12);
  const drawerTasksLimit = useTypedSubSetting<number>('hrm.ptk_ui_and_polling_limits', 'drawer_tasks', 100);
  const uploadMaxMbSetting = useTypedSubSetting<number>('core.upload_security_policy', 'max_mb', 50);
  const uploadForbiddenExts = useTypedSubSetting<string[]>('core.upload_security_policy', 'forbidden_exts', []);
  const projectDefaultPrefix = useTypedSubSetting<string>('hrm.tasks_and_workflows_policy', 'project_default_prefix', 'IDEAS-');
  const overlayDrawerMs = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220);
  const overlayZBackdrop = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_backdrop', 2147483620);
  const overlayZDrawer = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_drawer', 2147483625);
  const overlayZNestedModal = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_modal_nested', 2147483646);

  const tenantId = (user as any)?.tenant_id ?? 1;
  const userId = user?.id ?? 0;
  const cacheScopeKey = `${tenantId}:${userId}`;
  if (projectsPageCache.scopeKey !== cacheScopeKey) {
    resetProjectsPageCaches(cacheScopeKey);
  }

  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderModalPath, setFolderModalPath] = useState('');
  const [folderModalProjectId, setFolderModalProjectId] = useState<number | null>(null);
  const [folderFiles, setFolderFiles] = useState<any[]>([]);
  const [folderFilesLoading, setFolderFilesLoading] = useState(false);

  const [screenWidth, setScreenWidth] = useState(() => {
    if (typeof window === 'undefined') return 1200;
    const w = window.innerWidth;
    return w <= 640 ? 640 : w <= 768 ? 768 : w <= 1024 ? 1024 : 1200;
  });
  useEffect(() => {
    let rafId: number | null = null;
    const bucketWidth = (w: number) => (w <= 640 ? 640 : w <= 768 ? 768 : w <= 1024 ? 1024 : 1200);
    const handleResize = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const nextBucket = bucketWidth(window.innerWidth);
        setScreenWidth(prev => (prev === nextBucket ? prev : nextBucket));
      });
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const [projects, setProjects] = useState<Project[]>(() => projectsPageCache.projects);
  const [allProjectsLookup, setAllProjectsLookup] = useState<Project[]>(() => projectsPageCache.projectLookup);
  const [loading, setLoading] = useState(() => projectsPageCache.projects.length === 0);
  const [fileCategories, setFileCategories] = useState<{ id: number; label: string }[]>(() => projectsPageCache.fileCategories);
  const [campaignFolderLinkType, setCampaignFolderLinkType] = useState<'link' | 'select'>('link');
  const [developers, setDevelopers] = useState<any[]>(() => projectsPageCache.developers);
  const [allFiles, setAllFiles] = useState<any[]>(() => projectsPageCache.allFiles);
  const [users, setUsers] = useState<any[]>(() => projectsPageCache.users);

  const [quickUserCard, setQuickUserCard] = useState<{
    id: number;
    name: string;
    role: string;
    jobTitle?: string;
    email?: string;
    phone?: string;
    vacationMode?: number;
    avatarUrl?: string;
    visible: boolean;
    x: number;
    y: number;
    employeeId?: string;
  } | null>(null);

  useEffect(() => {
    if (!quickUserCard?.visible) return;
    return pushOverlay('projects-quick-user-card', () => setQuickUserCard(null), 2147483646);
  }, [quickUserCard?.visible]);

  const [projectModalMode, setProjectModalMode] = useState<'view' | 'edit' | 'create'>('view');
  const [campaignModalMode, setCampaignModalMode] = useState<'view' | 'edit' | 'create'>('view');

  const formatFileName = (name: string, maxLen: number = 30) => {
    if (!name || name.length <= maxLen) return name;
    const extIndex = name.lastIndexOf('.');
    const ext = extIndex !== -1 ? name.substring(extIndex) : '';
    const baseName = extIndex !== -1 ? name.substring(0, extIndex) : name;
    const cutLen = maxLen - ext.length - 3;
    if (cutLen <= 0) return name.substring(0, maxLen) + '...';
    return baseName.substring(0, cutLen) + '...' + ext;
  };

  const [activeSubTab, setActiveSubTab] = useState<'projects' | 'campaigns'>('projects');
  const [projectTasksPage, setProjectTasksPage] = useState(1);
  const [campaignTasksPage, setCampaignTasksPage] = useState(1);
  const [campaigns, setCampaigns] = useState<any[]>(() => projectsPageCache.campaigns);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignProjectFilter, setCampaignProjectFilter] = useState<string>('');
  const [projectStatusFilter, setProjectStatusFilter] = useState<string>('');
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<any | null>(null);
  const [totalProjects, setTotalProjects] = useState(() => projectsPageCache.totalProjects);
  const [totalCampaigns, setTotalCampaigns] = useState(() => projectsPageCache.totalCampaigns);
  const [rosterSearch, setRosterSearch] = useState('');
  const [mainSearchTerm, setMainSearchTerm] = useState('');
  const [debouncedProjectSearch, setDebouncedProjectSearch] = useState('');

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Partial<Project> | null>(null);
  const [autoCode, setAutoCode] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTaskForDrawer, setSelectedTaskForDrawer] = useState<any>(null);
  const [isLecturerDrawerOpen, setIsLecturerDrawerOpen] = useState(false);
  const [selectedLecturerEntity, setSelectedLecturerEntity] = useState<any>(null);

  // Copy subject modal state
  const [isCopySubjectModalOpen, setIsCopySubjectModalOpen] = useState(false);
  const [subjectToCopy, setSubjectToCopy] = useState<any>(null);
  const [copyTargetCampaignId, setCopyTargetCampaignId] = useState<string>('');
  const [copyConflictMode, setCopyConflictMode] = useState<'add' | 'replace'>('replace');
  const [isCopyingSubject, setIsCopyingSubject] = useState(false);

  // Quick campaigns modal state
  const [quickCampaignsModalOpen, setQuickCampaignsModalOpen] = useState(false);
  const [quickCampaignsProject, setQuickCampaignsProject] = useState<any | null>(null);
  const [quickCampaignsList, setQuickCampaignsList] = useState<any[]>([]);

  // AbortControllers & Refs
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const projectsAbortRef = useRef<AbortController | null>(null);
  const projectsLookupAbortRef = useRef<AbortController | null>(null);
  const campaignsAbortRef = useRef<AbortController | null>(null);
  const folderFilesAbortRef = useRef<AbortController | null>(null);
  const fileCategoriesAbortRef = useRef<AbortController | null>(null);
  const deepLinkTaskAbortRef = useRef<AbortController | null>(null);
  const deepLinkEntityAbortRef = useRef<AbortController | null>(null);
  const projectStatsAbortRef = useRef<AbortController | null>(null);
  const campaignStatsAbortRef = useRef<AbortController | null>(null);
  const projectRosterAbortRef = useRef<AbortController | null>(null);
  const detailCommentsAbortRef = useRef<AbortController | null>(null);
  const linkedTasksAbortRef = useRef<AbortController | null>(null);
  const developersAbortRef = useRef<AbortController | null>(null);
  const allFilesAbortRef = useRef<AbortController | null>(null);
  const usersAbortRef = useRef<AbortController | null>(null);
  const consultantsAbortRef = useRef<AbortController | null>(null);
  const companiesAbortRef = useRef<AbortController | null>(null);
  const teamsAbortRef = useRef<AbortController | null>(null);
  const openRosterAbortRef = useRef<AbortController | null>(null);
  const documentsAbortRef = useRef<AbortController | null>(null);

  const commentSubmitInFlightRef = useRef(false);
  const commentDeleteInFlightRef = useRef(false);
  const saveCampaignInFlightRef = useRef(false);
  const deleteCampaignInFlightRef = useRef(false);
  const saveProjectInFlightRef = useRef(false);
  const deleteProjectInFlightRef = useRef(false);
  const saveRosterInFlightRef = useRef(false);
  const uploadDocInFlightRef = useRef(false);
  const deleteDocInFlightRef = useRef(false);
  const saveSubjectConfigInFlightRef = useRef(false);
  const copySubjectInFlightRef = useRef(false);
  const saveSubjectsConfigInFlightRef = useRef(false);
  const saveThesisMilestonesInFlightRef = useRef(false);
  const saveRemindersInFlightRef = useRef(false);
  const quickUploadInFlightRef = useRef(false);
  const renameDocInFlightRef = useRef(false);
  const duplicateProjectInFlightRef = useRef(false);
  const archiveProjectInFlightRef = useRef(false);
  const quickTaskActionInFlightRef = useRef(false);
  const openedUrlTargetRef = useRef<string | null>(null);

  const revokeAllTrackedBlobs = useCallback(() => {
    blobUrlsRef.current.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    blobUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      projectsAbortRef.current?.abort();
      projectsLookupAbortRef.current?.abort();
      campaignsAbortRef.current?.abort();
      folderFilesAbortRef.current?.abort();
      fileCategoriesAbortRef.current?.abort();
      deepLinkTaskAbortRef.current?.abort();
      deepLinkEntityAbortRef.current?.abort();
      projectStatsAbortRef.current?.abort();
      campaignStatsAbortRef.current?.abort();
      projectRosterAbortRef.current?.abort();
      detailCommentsAbortRef.current?.abort();
      linkedTasksAbortRef.current?.abort();
      developersAbortRef.current?.abort();
      allFilesAbortRef.current?.abort();
      usersAbortRef.current?.abort();
      consultantsAbortRef.current?.abort();
      companiesAbortRef.current?.abort();
      teamsAbortRef.current?.abort();
      openRosterAbortRef.current?.abort();
      documentsAbortRef.current?.abort();
      revokeAllTrackedBlobs();
    };
  }, [revokeAllTrackedBlobs]);

  const loadFolderFiles = async (projectId: number) => {
    folderFilesAbortRef.current?.abort();
    const controller = new AbortController();
    folderFilesAbortRef.current = controller;
    setFolderFilesLoading(true);
    try {
      const res = await fetchAPI(`cloud-files?project_id=${projectId}&limit=100`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res && res.success !== false) {
        setFolderFiles(extractArray(res));
      } else {
        setFolderFiles([]);
        addToast(res?.message || 'Không thể tải danh sách tệp thư mục', 'error');
      }
    } catch (e: any) {
      if (isAbortError(e) || controller.signal.aborted) return;
      console.error('Failed to load folder files', e);
      addToast(e?.message || 'Lỗi tải danh sách tệp thư mục', 'error');
    } finally {
      if (!controller.signal.aborted) setFolderFilesLoading(false);
    }
  };

  const handleOpenFolderModal = (path: string, projectId: number) => {
    setFolderModalPath(path);
    setFolderModalProjectId(projectId);
    setFolderFiles([]);
    setShowFolderModal(true);
    loadFolderFiles(projectId);
  };

  useEffect(() => {
    if (projectsPageCache.fileCategories.length > 0 && Date.now() - projectsPageCache.fileCategoriesTimestamp < PROJECTS_SWR_TTL_MS) {
      setFileCategories(projectsPageCache.fileCategories);
      return;
    }
    fileCategoriesAbortRef.current?.abort();
    const controller = new AbortController();
    fileCategoriesAbortRef.current = controller;
    api.get('/file-categories', { signal: controller.signal })
      .then(res => {
        if (controller.signal.aborted) return;
        const cats = extractArray<{ id: number; label: string }>(res.data);
        setFileCategories(cats);
        projectsPageCache.fileCategories = cats;
        projectsPageCache.fileCategoriesTimestamp = Date.now();
      })
      .catch(err => {
        if (isAbortError(err) || controller.signal.aborted) return;
        console.error('Failed to fetch file categories', err);
      });
    return () => controller.abort();
  }, [cacheScopeKey]);

  const handleOpenQuickCampaigns = (proj: any, linkedCamps: any[]) => {
    setQuickCampaignsProject(proj);
    setQuickCampaignsList(ensureArray(linkedCamps));
    setQuickCampaignsModalOpen(true);
  };

  const isTimeOverlapping = (time1: string, time2: string) => {
    if (!time1 || !time2) return false;
    const parseTime = (tStr: string): number | null => {
      const match = String(tStr || '').match(/(\d{1,2}):(\d{2})/);
      if (!match) return null;
      return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    };
    const getRanges = (rangeStr: string) => {
      const parts = String(rangeStr).split(/[-–]/).map(p => p.trim());
      const start = parseTime(parts[0]);
      const end = parseTime(parts[1] || parts[0]);
      if (start === null || end === null) return null;
      return { start, end };
    };
    const r1 = getRanges(time1);
    const r2 = getRanges(time2);
    if (!r1 || !r2) return false;
    return r1.start < r2.end && r2.start < r1.end;
  };

  const activeCampaignSubjects = useMemo(() => {
    return ensureArray(campaigns)
      .filter(camp => camp && camp.status === 'active')
      .map(camp => ({
        id: camp.id,
        name: camp.name,
        subjects: safeParseArray<any>(camp.subjects_json)
      }));
  }, [campaigns]);

  const checkLecturerConflict = (lecturerId: string, date: string, timeRange: string, currentSubjectId: string, currentSessionId: string) => {
    if (!lecturerId || !date) return null;
    for (const camp of activeCampaignSubjects) {
      const isCurrentCamp = editingCampaign && String(camp.id) === String(editingCampaign.id);
      for (const s of camp.subjects) {
        if (!s || (isCurrentCamp && String(s.id) === String(currentSubjectId))) {
          continue;
        }
        if (Array.isArray(s.host_sessions)) {
          for (const hs of s.host_sessions) {
            if (hs && hs.date === date && String(hs.lecturer_name) === String(lecturerId)) {
              const hsTime = `${hs.time_start || '20:00'} - ${hs.time_end || '22:00'}`;
              if (isTimeOverlapping(hsTime, timeRange) && (s.id !== currentSubjectId || hs.id !== currentSessionId)) {
                return { course: camp.name, subject: s.name, type: 'Lớp trường', time: hsTime };
              }
            }
          }
        }
        if (Array.isArray(s.seminars)) {
          for (const sem of s.seminars) {
            if (sem && sem.date === date && String(sem.lecturer_id) === String(lecturerId)) {
              const semTime = sem.time_slot || (sem.time_start && sem.time_end ? `${sem.time_start} - ${sem.time_end}` : '08:30 - 11:30');
              if (isTimeOverlapping(semTime, timeRange) && (s.id !== currentSubjectId || sem.id !== currentSessionId)) {
                return { course: camp.name, subject: s.name, type: 'Chuyên đề', time: semTime };
              }
            }
          }
        }
      }
    }
    return null;
  };

  const renderQuickCampaignsDrawer = () => {
    if (!quickCampaignsModalOpen) return null;
    return renderDrawer(
      quickCampaignsModalOpen,
      () => setQuickCampaignsModalOpen(false),
      `Khóa học liên kết - ${quickCampaignsProject?.name || ''}`,
      (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem' }}>
          {ensureArray(quickCampaignsList).length === 0 ? (
            <EmptyCard
              icon={<BookOpen size={48} />}
              title="Chưa có khóa học liên kết"
              description="Không tìm thấy khóa học nào liên kết với chương trình này."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {ensureArray(quickCampaignsList).map(camp => {
                const docCount = parseIds(camp.document_ids).length;
                const staffCount = parseIds(camp.user_ids).length;
                return (
                  <div
                    key={camp.id}
                    className="hover-lift"
                    style={{
                      background: 'var(--color-surface, #FFFFFF)',
                      border: '1px solid var(--color-border-light, #E2E8F0)',
                      borderRadius: '16px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', overflow: 'hidden' }}>
                          <div style={{
                            width: '28px',
                            height: '28px',
                            background: 'rgba(189, 29, 45, 0.08)',
                            borderRadius: '8px',
                            color: '#BD1D2D',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <BookOpen size={14} />
                          </div>
                          <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }} className="line-clamp-1">
                            {camp.name}
                          </h4>
                        </div>
                        <span style={{
                          fontSize: '0.68rem',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontWeight: 700,
                          background: camp.status === 'active' ? 'rgba(189, 29, 45, 0.08)' : '#f1f5f9',
                          color: camp.status === 'active' ? '#BD1D2D' : '#64748b',
                          border: camp.status === 'active' ? '1px solid rgba(189, 29, 45, 0.16)' : '1px solid #e2e8f0',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}>
                          {camp.status === 'active' ? 'Hoạt động' : 'Tạm dừng'}
                        </span>
                      </div>
                      {camp.description ? (
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem', lineHeight: 1.45 }} className="line-clamp-2">
                          {camp.description}
                        </p>
                      ) : (
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginBottom: '1rem' }}>
                          Không có mô tả chi tiết
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border-light)', paddingTop: '0.75rem', marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg-light)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--color-border-light)', fontWeight: 600 }}>
                          <Folder size={11} style={{ color: 'var(--color-text-light)' }} />
                          {docCount} Tài liệu
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg-light)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--color-border-light)', fontWeight: 600 }}>
                          <Users size={11} style={{ color: 'var(--color-text-light)' }} />
                          {staffCount} Nhân sự
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickCampaignsModalOpen(false);
                          handleOpenCampaignView(camp);
                        }}
                        className="btn secondary sm"
                        style={{
                          fontSize: '0.72rem',
                          padding: '0 10px',
                          height: '28px',
                          borderRadius: '6px',
                          fontWeight: 700,
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-border-light)',
                          color: 'var(--color-text)'
                        }}
                      >
                        Chi tiết
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ),
      '650px',
      undefined,
      false,
      false,
      false,
      'projects-quick-campaigns-drawer'
    );
  };

  const handleOpenTask = (taskId: number) => {
    const params = new URLSearchParams(location.search);
    params.set('task_id', String(taskId));
    navigate(`${location.pathname}?${params.toString()}`);
  };

  useEffect(() => {
    if (!location.pathname.startsWith('/projects')) return;
    const params = new URLSearchParams(location.search);
    const taskId = params.get('open_task_id') || params.get('task_id');
    if (taskId) {
      const tid = Number(taskId);
      if (tid) {
        deepLinkTaskAbortRef.current?.abort();
        const controller = new AbortController();
        deepLinkTaskAbortRef.current = controller;
        api.get(`/activities/${tid}`, { signal: controller.signal }).then(res => {
          if (controller.signal.aborted) return;
          if (res.data && res.data.success && res.data.data) {
            useUIStore.getState().closeTaskDrawer();
            setSelectedTaskForDrawer(res.data.data);
          }
        }).catch(err => {
          if (isAbortError(err) || controller.signal.aborted) return;
          console.error('Error loading task from URL:', err);
        });
        return () => controller.abort();
      }
    }
  }, [location.pathname, location.search]);

  const handleDuplicateProject = async (projectId: number) => {
    if (duplicateProjectInFlightRef.current) return;
    duplicateProjectInFlightRef.current = true;
    try {
      const res = await api.post(`/projects/${projectId}/duplicate`);
      if (res.data?.success) {
        addToast(t('Đã nhân bản chương trình thành công!'), 'success');
        projectsPageCache.projectsByPage.clear();
        projectsPageCache.projectLookupTimestamp = 0;
        loadProjects(true);
        loadProjectsLookup(true);
      } else {
        addToast(res.data?.message || t('Lỗi nhân bản chương trình'), 'error');
      }
    } catch (err: any) {
      addToast(err.response?.data?.message || err.message || t('Lỗi nhân bản chương trình'), 'error');
    } finally {
      duplicateProjectInFlightRef.current = false;
    }
  };

  const handleToggleArchiveProject = async (projectId: number, shouldArchive: boolean) => {
    if (archiveProjectInFlightRef.current) return;
    archiveProjectInFlightRef.current = true;
    const prevProjects = projects;
    const prevLookup = allProjectsLookup;
    const updateArr = (list: Project[]) =>
      ensureArray(list).map(p =>
        Number(p.id) === Number(projectId)
          ? { ...p, is_archived: shouldArchive ? 1 : 0, status: shouldArchive ? 'archived' : 'active' }
          : p
      );

    setProjects(prev => updateArr(prev));
    setAllProjectsLookup(prev => updateArr(prev));
    if (editingProject && Number(editingProject.id) === Number(projectId)) {
      setEditingProject(prev =>
        prev ? { ...prev, is_archived: shouldArchive ? 1 : 0, status: shouldArchive ? 'archived' : 'active' } : prev
      );
    }
    try {
      const endpoint = shouldArchive ? `/projects/${projectId}/archive` : `/projects/${projectId}/unarchive`;
      const res = await api.post(endpoint);
      if (res.data?.success) {
        addToast(shouldArchive ? t('Đã lưu trữ chương trình') : t('Đã bỏ lưu trữ chương trình'), 'success');
        projectsPageCache.projectsByPage.clear();
        projectsPageCache.projectLookupTimestamp = 0;
        loadProjects(true);
        loadProjectsLookup(true);
      } else {
        setProjects(prevProjects);
        setAllProjectsLookup(prevLookup);
        addToast(res.data?.message || t('Lỗi lưu trữ chương trình'), 'error');
      }
    } catch (err: any) {
      setProjects(prevProjects);
      setAllProjectsLookup(prevLookup);
      addToast(err.response?.data?.message || err.message || t('Lỗi lưu trữ chương trình'), 'error');
    } finally {
      archiveProjectInFlightRef.current = false;
    }
  };

  const handleQuickToggleTaskStatus = async (taskId: number, currentStatus: string) => {
    if (quickTaskActionInFlightRef.current) return;
    quickTaskActionInFlightRef.current = true;
    const nextStatus = currentStatus === 'done' ? 'planned' : 'done';
    const prevTasks = linkedTasks;
    const projectTaskCacheKey = editingProject?.id ? `${cacheScopeKey}:project:${editingProject.id}` : null;
    const campaignTaskCacheKey = editingCampaign?.id ? `${cacheScopeKey}:campaign:${editingCampaign.id}` : null;
    const prevProjTaskCache = projectTaskCacheKey ? entityTasksCache.get(projectTaskCacheKey) : undefined;
    const prevCampTaskCache = campaignTaskCacheKey ? entityTasksCache.get(campaignTaskCacheKey) : undefined;

    setLinkedTasks(prev => {
      const next = ensureArray(prev).map(t => (Number(t.id) === Number(taskId) ? { ...t, status: nextStatus } : t));
      if (projectTaskCacheKey) entityTasksCache.set(projectTaskCacheKey, { data: next, timestamp: Date.now() });
      if (campaignTaskCacheKey) entityTasksCache.set(campaignTaskCacheKey, { data: next, timestamp: Date.now() });
      return next;
    });
    try {
      const res = await api.put(`/tasks/${taskId}/status`, { status: nextStatus });
      if (res.data && res.data.success === false) {
        throw new Error(res.data?.message || t('Lỗi cập nhật trạng thái nhiệm vụ'));
      }
      addToast(nextStatus === 'done' ? t('Đã đánh dấu hoàn thành nhiệm vụ') : t('Đã mở lại nhiệm vụ'), 'success');
      window.dispatchEvent(new CustomEvent('task-updated'));
    } catch (err: any) {
      setLinkedTasks(prevTasks);
      if (projectTaskCacheKey) {
        if (prevProjTaskCache) entityTasksCache.set(projectTaskCacheKey, prevProjTaskCache);
        else entityTasksCache.delete(projectTaskCacheKey);
      }
      if (campaignTaskCacheKey) {
        if (prevCampTaskCache) entityTasksCache.set(campaignTaskCacheKey, prevCampTaskCache);
        else entityTasksCache.delete(campaignTaskCacheKey);
      }
      addToast(t('Lỗi cập nhật trạng thái nhiệm vụ: ') + (err.response?.data?.message || err.message), 'error');
    } finally {
      quickTaskActionInFlightRef.current = false;
    }
  };

  const handleQuickDuplicateTask = async (taskId: number) => {
    if (quickTaskActionInFlightRef.current) return;
    quickTaskActionInFlightRef.current = true;
    try {
      const res = await api.post(`/tasks/${taskId}/duplicate`);
      if (res.data?.success && res.data?.data) {
        const cleanClone = { ...res.data.data, comments: [], comment_count: 0 };
        addToast(t('Đã nhân bản nhiệm vụ thành công!'), 'success');
        setLinkedTasks(prev => {
          const next = [cleanClone, ...ensureArray(prev)];
          if (editingProject?.id) entityTasksCache.set(`${cacheScopeKey}:project:${editingProject.id}`, { data: next, timestamp: Date.now() });
          if (editingCampaign?.id) entityTasksCache.set(`${cacheScopeKey}:campaign:${editingCampaign.id}`, { data: next, timestamp: Date.now() });
          return next;
        });
        window.dispatchEvent(new CustomEvent('task-updated'));
      } else {
        addToast(res.data?.message || t('Lỗi nhân bản nhiệm vụ'), 'error');
      }
    } catch (err: any) {
      addToast(t('Lỗi nhân bản nhiệm vụ: ') + (err.response?.data?.message || err.message), 'error');
    } finally {
      quickTaskActionInFlightRef.current = false;
    }
  };

  const handleQuickDeleteTask = (taskId: number) => {
    if (quickTaskActionInFlightRef.current) return;
    showConfirm({
      title: t('Xóa nhiệm vụ'),
      message: t('Bạn có chắc chắn muốn xóa nhiệm vụ này?'),
      confirmText: t('Xóa'),
      cancelText: t('Hủy'),
      isDanger: true,
      onConfirm: async () => {
        if (quickTaskActionInFlightRef.current) return;
        quickTaskActionInFlightRef.current = true;
        const prevTasks = linkedTasks;
        const projectTaskCacheKey = editingProject?.id ? `${cacheScopeKey}:project:${editingProject.id}` : null;
        const campaignTaskCacheKey = editingCampaign?.id ? `${cacheScopeKey}:campaign:${editingCampaign.id}` : null;
        const prevProjTaskCache = projectTaskCacheKey ? entityTasksCache.get(projectTaskCacheKey) : undefined;
        const prevCampTaskCache = campaignTaskCacheKey ? entityTasksCache.get(campaignTaskCacheKey) : undefined;

        const rollbackTasks = () => {
          setLinkedTasks(prevTasks);
          if (projectTaskCacheKey) {
            if (prevProjTaskCache) entityTasksCache.set(projectTaskCacheKey, prevProjTaskCache);
            else entityTasksCache.delete(projectTaskCacheKey);
          }
          if (campaignTaskCacheKey) {
            if (prevCampTaskCache) entityTasksCache.set(campaignTaskCacheKey, prevCampTaskCache);
            else entityTasksCache.delete(campaignTaskCacheKey);
          }
        };

        setLinkedTasks(prev => {
          const next = ensureArray(prev).filter(t => Number(t.id) !== Number(taskId));
          if (projectTaskCacheKey) entityTasksCache.set(projectTaskCacheKey, { data: next, timestamp: Date.now() });
          if (campaignTaskCacheKey) entityTasksCache.set(campaignTaskCacheKey, { data: next, timestamp: Date.now() });
          return next;
        });
        try {
          const res = await api.delete(`/tasks/${taskId}`);
          if (res.data?.success) {
            addToast(t('Đã xóa nhiệm vụ thành công'), 'success');
            window.dispatchEvent(new CustomEvent('task-updated'));
          } else {
            rollbackTasks();
            addToast(res.data?.message || t('Lỗi xóa nhiệm vụ'), 'error');
          }
        } catch (err: any) {
          rollbackTasks();
          addToast(t('Lỗi xóa nhiệm vụ: ') + (err.response?.data?.message || err.message), 'error');
        } finally {
          quickTaskActionInFlightRef.current = false;
        }
      }
    });
  };

  const clearEntityParamsFromUrl = useCallback(() => {
    if (!location.pathname.startsWith('/projects')) return;
    const newParams = new URLSearchParams(location.search);
    if (newParams.has('open_id') || newParams.has('id') || newParams.has('project_id') || newParams.has('campaign_id')) {
      newParams.delete('open_id');
      newParams.delete('id');
      newParams.delete('project_id');
      newParams.delete('campaign_id');
      const cleanUrl = location.pathname + (newParams.toString() ? '?' + newParams.toString() : '');
      navigate(cleanUrl, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!location.pathname.startsWith('/projects')) return;
    const params = new URLSearchParams(location.search);
    const isCampaigns = params.get('tab') === 'campaigns' || params.get('sub') === 'campaigns' || Boolean(params.get('campaign_id'));
    if (isCampaigns) {
      setActiveSubTab('campaigns');
    } else if (params.get('tab') === 'projects' || params.get('sub') === 'projects' || params.get('project_id')) {
      setActiveSubTab('projects');
    }

    const targetId = params.get('open_id') || params.get('id') || params.get('project_id') || params.get('campaign_id');
    if (!targetId) {
      openedUrlTargetRef.current = null;
      return;
    }
    const targetKey = `${isCampaigns ? 'camp' : 'proj'}:${targetId}`;
    if (openedUrlTargetRef.current === targetKey) {
      clearEntityParamsFromUrl();
      return;
    }

    if (isCampaigns) {
      const matched = ensureArray(campaigns).find(c => String(c.id) === targetId);
      if (matched) {
        openedUrlTargetRef.current = targetKey;
        setCampaignDrawerTab('details');
        setEditingCampaign(matched);
        setCampaignModalMode('view');
        setIsCampaignModalOpen(true);
        clearEntityParamsFromUrl();
      } else if (!campaignsLoading && Number(targetId) > 0) {
        deepLinkEntityAbortRef.current?.abort();
        const controller = new AbortController();
        deepLinkEntityAbortRef.current = controller;
        fetchAPI(`campaigns/${Number(targetId)}`, { signal: controller.signal })
          .then(res => {
            if (controller.signal.aborted) return;
            const entity = res?.data || (res?.id ? res : null);
            if (entity && entity.id) {
              openedUrlTargetRef.current = targetKey;
              setCampaignDrawerTab('details');
              setEditingCampaign(entity);
              setCampaignModalMode('view');
              setIsCampaignModalOpen(true);
              clearEntityParamsFromUrl();
            }
          })
          .catch(err => {
            if (!isAbortError(err)) console.error('Deep-link campaign fetch error:', err);
          });
      }
    } else {
      const matched =
        ensureArray(projects).find(p => String(p.id) === targetId) ||
        ensureArray(allProjectsLookup).find(p => String(p.id) === targetId);
      if (matched) {
        openedUrlTargetRef.current = targetKey;
        setProjectDrawerTab('details');
        setEditingProject(matched);
        setProjectModalMode('view');
        setIsEditModalOpen(true);
        clearEntityParamsFromUrl();
      } else if (!loading && Number(targetId) > 0) {
        deepLinkEntityAbortRef.current?.abort();
        const controller = new AbortController();
        deepLinkEntityAbortRef.current = controller;
        fetchAPI(`projects/${Number(targetId)}`, { signal: controller.signal })
          .then(res => {
            if (controller.signal.aborted) return;
            const entity = res?.data || (res?.id ? res : null);
            if (entity && entity.id) {
              openedUrlTargetRef.current = targetKey;
              setProjectDrawerTab('details');
              setEditingProject(entity);
              setProjectModalMode('view');
              setIsEditModalOpen(true);
              clearEntityParamsFromUrl();
            }
          })
          .catch(err => {
            if (!isAbortError(err)) console.error('Deep-link project fetch error:', err);
          });
      }
    }
  }, [location.pathname, location.search, projects, allProjectsLookup, campaigns, loading, campaignsLoading, clearEntityParamsFromUrl]);

  const initialPageSize = Number(defaultProjectsPageSize) > 0 ? Number(defaultProjectsPageSize) : 12;
  const [projectPage, setProjectPage] = useState(1);
  const [projectPageSize, setProjectPageSize] = useState(initialPageSize);
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignPageSize, setCampaignPageSize] = useState(initialPageSize);

  useEffect(() => {
    const trimmed = mainSearchTerm.trim();
    const timer = setTimeout(() => {
      setDebouncedProjectSearch(prev => {
        if (prev !== trimmed) {
          setProjectPage(1);
        }
        return trimmed;
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [mainSearchTerm]);

  const paginatedProjects = React.useMemo(() => {
    const safeProjects = ensureArray(projects);
    // Server-side pagination returns the active slice (<= projectPageSize); only slice if unpaginated array returned
    if (safeProjects.length > projectPageSize && totalProjects <= safeProjects.length) {
      const start = (projectPage - 1) * projectPageSize;
      return safeProjects.slice(start, start + projectPageSize);
    }
    return safeProjects;
  }, [projects, projectPage, projectPageSize, totalProjects]);

  const filteredCampaigns = React.useMemo(() => {
    let list = ensureArray(campaigns);
    if (campaignProjectFilter) {
      list = list.filter(c => String(c.project_id) === String(campaignProjectFilter));
    }
    if (mainSearchTerm.trim()) {
      const q = mainSearchTerm.toLowerCase();
      list = list.filter(c =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (String(c.id).includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [campaigns, campaignProjectFilter, mainSearchTerm]);

  const paginatedCampaigns = React.useMemo(() => {
    const start = (campaignPage - 1) * campaignPageSize;
    return filteredCampaigns.slice(start, start + campaignPageSize);
  }, [filteredCampaigns, campaignPage, campaignPageSize]);

  const projectQuickUploadInputRef = React.useRef<HTMLInputElement>(null);
  const campaignQuickUploadInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCampaign) {
      const isUrl = editingCampaign.folder_path?.startsWith('http') || false;
      setCampaignFolderLinkType(isUrl ? 'link' : 'select');
    }
  }, [editingCampaign?.id]);

  const generateCodeFromName = (name: string) => {
    if (!name) return '';
    const cleanName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const words = cleanName.trim().split(/\s+/);
    const initials = words
      .map(w => w.charAt(0))
      .filter(char => /[a-zA-Z0-9]/.test(char))
      .join('')
      .toUpperCase();
    return initials;
  };

  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [rosterMembers, setRosterMembers] = useState<RosterMember[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [teams, setTeams] = useState<any[]>([]);

  const [projectRoster, setProjectRoster] = useState<any[]>([]);
  const [projectRosterLoading, setProjectRosterLoading] = useState(false);
  const [projectDrawerTab, setProjectDrawerTab] = useState<'details' | 'gantt' | 'hierarchy' | 'changelog'>('details');
  const [campaignDrawerTab, setCampaignDrawerTab] = useState<'details' | 'subjects' | 'lecturers' | 'thesis' | 'reminders' | 'changelog'>('details');
  const [subjects, setSubjects] = useState<any[]>([]);
  const [remindersConfig, setRemindersConfig] = useState<{
    school_reminder_enabled: boolean;
    school_reminder_hours: number;
    ideas_reminder_enabled: boolean;
    ideas_reminder_hours: number;
    assignment_reminder_enabled: boolean;
    assignment_reminder_hours: number;
    lecturer_reminder_enabled: boolean;
    lecturer_reminder_hours: number;
    thesis_reminder_enabled: boolean;
    thesis_reminder_hours: number;
    upcoming_session_reminder_enabled?: boolean;
    upcoming_session_reminder_minutes?: number;
  }>({
    school_reminder_enabled: true,
    school_reminder_hours: 12,
    ideas_reminder_enabled: true,
    ideas_reminder_hours: 168,
    assignment_reminder_enabled: true,
    assignment_reminder_hours: 12,
    lecturer_reminder_enabled: true,
    lecturer_reminder_hours: 12,
    thesis_reminder_enabled: true,
    thesis_reminder_hours: 12,
    upcoming_session_reminder_enabled: true,
    upcoming_session_reminder_minutes: 5,
  });
  const [copiedSubject, setCopiedSubject] = useState<any>(() => {
    try {
      const saved = sessionStorage.getItem('ideas_copied_subject');
      return safeJsonParse(saved, null);
    } catch {
      return null;
    }
  });
  const [thesisMilestones, setThesisMilestones] = useState<any[]>([]);
  const [configuringSubjectId, setConfiguringSubjectId] = useState<string | null>(null);
  const [activeConfigTab, setActiveConfigTab] = useState<'school' | 'seminar' | 'zoom' | 'quiz'>('school');
  const [consultants, setConsultants] = useState<any[]>(() => projectsPageCache.consultants || []);
  const [companiesList, setCompaniesList] = useState<any[]>(() => projectsPageCache.companiesList || []);
  const [announcingSubject, setAnnouncingSubject] = useState<any>(null);
  const [projectStats, setProjectStats] = useState<any>(null);
  const [campaignStats, setCampaignStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadProjectStats = async (id: number, isSilent = false) => {
    const cacheKey = `${cacheScopeKey}:${id}`;
    const cached = projectStatsCache.get(cacheKey);
    if (cached) {
      setProjectStats(cached.data);
      if (Date.now() - cached.timestamp < PROJECTS_SWR_TTL_MS && !isSilent) {
        setStatsLoading(false);
      }
    } else if (!isSilent) {
      setProjectStats(null);
      setStatsLoading(true);
    }
    projectStatsAbortRef.current?.abort();
    const controller = new AbortController();
    projectStatsAbortRef.current = controller;
    try {
      const res = await fetchAPI(`projects/${id}/stats`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res && res.success) {
        setProjectStats(res.data);
        projectStatsCache.set(cacheKey, { data: res.data, timestamp: Date.now() });
      } else if (!cached) {
        setProjectStats(null);
      }
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      console.error(e);
      if (!cached) setProjectStats(null);
    } finally {
      if (!controller.signal.aborted) setStatsLoading(false);
    }
  };

  const loadCampaignStats = async (id: number, isSilent = false) => {
    const cacheKey = `${cacheScopeKey}:${id}`;
    const cached = campaignStatsCache.get(cacheKey);
    if (cached) {
      setCampaignStats(cached.data);
      if (Date.now() - cached.timestamp < PROJECTS_SWR_TTL_MS && !isSilent) {
        setStatsLoading(false);
      }
    } else if (!isSilent) {
      setCampaignStats(null);
      setStatsLoading(true);
    }
    campaignStatsAbortRef.current?.abort();
    const controller = new AbortController();
    campaignStatsAbortRef.current = controller;
    try {
      const res = await fetchAPI(`campaigns/${id}/stats`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res && res.success) {
        setCampaignStats(res.data);
        campaignStatsCache.set(cacheKey, { data: res.data, timestamp: Date.now() });
      } else if (!cached) {
        setCampaignStats(null);
      }
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      console.error(e);
      if (!cached) setCampaignStats(null);
    } finally {
      if (!controller.signal.aborted) setStatsLoading(false);
    }
  };

  const loadProjectRoster = async (projectId: number, isSilent = false) => {
    const cacheKey = `${cacheScopeKey}:${projectId}`;
    const cached = projectRosterCache.get(cacheKey);
    if (cached) {
      setProjectRoster(cached.data);
      if (Date.now() - cached.timestamp < PROJECTS_SWR_TTL_MS && !isSilent) {
        setProjectRosterLoading(false);
      }
    } else if (!isSilent) {
      setProjectRoster([]);
      setProjectRosterLoading(true);
    }
    projectRosterAbortRef.current?.abort();
    const controller = new AbortController();
    projectRosterAbortRef.current = controller;
    try {
      const res = await fetchAPI(`projects/${projectId}/roster`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const assigned = extractArray<any>(res).filter((m: any) => Number(m.is_assigned) === 1);
      setProjectRoster(assigned);
      projectRosterCache.set(cacheKey, { data: assigned, timestamp: Date.now() });
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      console.error(e);
      if (!cached) setProjectRoster([]);
    } finally {
      if (!controller.signal.aborted) setProjectRosterLoading(false);
    }
  };

  // Comments state for Project or Campaign Detail Modals
  const [detailComments, setDetailComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: number; userName: string } | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<any[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Linked Tasks state for Project or Campaign Detail Modals
  const [linkedTasks, setLinkedTasks] = useState<any[]>([]);
  const [loadingLinkedTasks, setLoadingLinkedTasks] = useState(false);

  const loadDetailComments = async (entityType: 'project' | 'campaign', entityId: number, isSilent = false) => {
    const cacheKey = `${cacheScopeKey}:${entityType}:${entityId}`;
    const cached = entityCommentsCache.get(cacheKey);
    if (cached) {
      setDetailComments(cached.data);
      if (Date.now() - cached.timestamp < PROJECTS_SWR_TTL_MS && !isSilent) {
        setLoadingComments(false);
      }
    } else if (!isSilent) {
      setDetailComments([]);
      setLoadingComments(true);
    }
    detailCommentsAbortRef.current?.abort();
    const controller = new AbortController();
    detailCommentsAbortRef.current = controller;
    try {
      const res = await fetchAPI(`${entityType}s/${entityId}/comments`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const list = extractArray<any>(res);
      setDetailComments(list);
      entityCommentsCache.set(cacheKey, { data: list, timestamp: Date.now() });
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      console.error(e);
      if (!cached) setDetailComments([]);
    } finally {
      if (!controller.signal.aborted) setLoadingComments(false);
    }
  };

  const addLocalFileAttachment = (file: File) => {
    if (!file) return;
    const validationErr = isAllowedUploadFile(file, uploadMaxMbSetting, uploadForbiddenExts);
    if (validationErr) {
      addToast(validationErr, 'error');
      return;
    }
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    if (previewUrl) {
      blobUrlsRef.current.add(previewUrl);
    }
    setCommentAttachments(prev => [...prev, { file, name: file.name, previewUrl }]);
    addToast('Đã thêm tệp đính kèm!', 'info');
  };

  const handleCommentAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) addLocalFileAttachment(file);
    e.target.value = '';
  };

  const removeCommentAttachment = (index: number) => {
    setCommentAttachments(prev => {
      const target = prev[index];
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        blobUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearPendingCommentDraft = useCallback(() => {
    setNewCommentText('');
    setReplyTo(null);
    setCommentAttachments(prev => {
      prev.forEach((att: any) => {
        if (att?.previewUrl) {
          URL.revokeObjectURL(att.previewUrl);
          blobUrlsRef.current.delete(att.previewUrl);
        }
      });
      return [];
    });
  }, []);

  const handlePostDetailComment = async (entityType: 'project' | 'campaign', entityId: number) => {
    if ((!newCommentText.trim() && commentAttachments.length === 0) || isSubmittingComment || commentSubmitInFlightRef.current) return;
    commentSubmitInFlightRef.current = true;
    setIsSubmittingComment(true);
    setUploadingAttachment(true);

    try {
      const workingAttachments = [...commentAttachments];
      const uploadedUrls: string[] = [];
      for (let i = 0; i < workingAttachments.length; i++) {
        const att = workingAttachments[i];
        if (att.url) {
          uploadedUrls.push(att.url);
        } else if (att.file) {
          const sizeStr = (att.file.size / (1024 * 1024)).toFixed(1) + ' MB';
          const taskId = startUpload(att.name, sizeStr);
          const fd = new FormData();
          fd.append('file', att.file);

          updateProgress(taskId, 20, 'uploading');
          const res = await api.post('/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                updateProgress(taskId, percent, percent === 100 ? 'processing' : 'uploading');
              }
            }
          });
          const fileUrl = res.data?.data?.url || res.data?.url;
          if (fileUrl) {
            finishUpload(taskId, true);
            uploadedUrls.push(fileUrl);
            workingAttachments[i] = { ...att, url: fileUrl };
          } else {
            finishUpload(taskId, false, res.data?.message || 'Lỗi tải tệp lên');
            setCommentAttachments(workingAttachments);
            throw new Error(res.data?.message || 'Lỗi tải tệp đính kèm');
          }
        }
      }

      const commentText = newCommentText.trim();
      const parentId = replyTo ? replyTo.id : null;

      const res = await fetchAPI(`${entityType}s/${entityId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          body: commentText,
          attachments: uploadedUrls,
          parent_id: parentId
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (res && (res.success || res.id)) {
        workingAttachments.forEach((att: any) => {
          if (att?.previewUrl) {
            URL.revokeObjectURL(att.previewUrl);
            blobUrlsRef.current.delete(att.previewUrl);
          }
        });
        setNewCommentText('');
        setCommentAttachments([]);
        setReplyTo(null);
        loadDetailComments(entityType, entityId, true);
        addToast('Đã đăng bình luận!', 'success');
      } else {
        setCommentAttachments(workingAttachments);
        addToast(res?.message || 'Lỗi khi gửi bình luận', 'error');
      }
    } catch (e: any) {
      console.error(e);
      addToast('Không thể gửi bình luận: ' + (e?.message || ''), 'error');
    } finally {
      commentSubmitInFlightRef.current = false;
      setIsSubmittingComment(false);
      setUploadingAttachment(false);
    }
  };

  const handleDeleteDetailComment = (entityType: 'project' | 'campaign', entityId: number, commentId: number) => {
    showConfirm({
      title: 'Xóa bình luận',
      message: 'Bạn có chắc chắn muốn xóa bình luận này không?',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        if (commentDeleteInFlightRef.current) return;
        commentDeleteInFlightRef.current = true;
        try {
          const res = await fetchAPI(`${entityType}s/${entityId}/comments/${commentId}`, {
            method: 'DELETE'
          });
          if (res?.success) {
            addToast('Đã xóa bình luận thành công!', 'success');
            loadDetailComments(entityType, entityId, true);
          } else {
            addToast(res?.message || 'Lỗi khi xóa bình luận', 'error');
          }
        } catch (e: any) {
          addToast('Lỗi khi xóa bình luận: ' + (e?.message || ''), 'error');
        } finally {
          commentDeleteInFlightRef.current = false;
        }
      }
    });
  };

  const renderEntityComments = (entityType: 'project' | 'campaign', entityId: number) => {
    const commentsList = ensureArray<any>(detailComments);
    const rootComments = commentsList.filter((c: any) => !c?.parent_id);
    const getReplies = (parentId: number) => {
      return commentsList
        .filter((c: any) => Number(c?.parent_id) === Number(parentId))
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    };

    const renderSingleCommentNode = (comment: any, isReply: boolean = false) => {
      const normalizedUserRole = normalizeRole(user);
      const isCommentAdmin = checkIsSystemAdmin(user) || ['director', 'assistant', 'tro_ly'].includes(normalizedUserRole);
      const isOwner = Number(comment.user_id) === Number(user?.id);
      const canDelete = isCommentAdmin || isOwner;

      const commentParsedAtts = safeParseArray<any>(comment.attachments);

      return (
        <div key={comment.id} id={`entity-comment-${comment.id}`} style={{ display: 'flex', gap: '8px', fontSize: '0.8125rem', paddingLeft: isReply ? '12px' : '0', borderLeft: isReply ? '2px solid var(--color-border-light)' : undefined, marginTop: isReply ? '6px' : '0' }}>
          <Avatar name={comment.user_name || 'User'} src={comment.avatar_url ? resolveAttachmentUrl(comment.avatar_url) : undefined} size={isReply ? 20 : 24} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', background: isReply ? 'transparent' : 'var(--color-bg-light)', border: isReply ? 'none' : '1px solid var(--color-border-light)', padding: isReply ? '2px 0' : '8px 12px', borderRadius: isReply ? '0' : '12px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: 'var(--color-text)' }}>{comment.user_name || 'Thành viên'}</span>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>{formatDateTimeVN(comment.created_at)}</span>
            </div>
            {comment.body ? (
              /<[a-z][\s\S]*>/i.test(comment.body) ? (
                <div
                  className="rich-text-editor-content"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(comment.body) }}
                  style={{ margin: 0, color: 'var(--color-text-light)', lineHeight: '1.4' }}
                />
              ) : (
                <div style={{ margin: 0, color: 'var(--color-text-light)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                  {renderFormattedText(comment.body)}
                </div>
              )
            ) : null}

            {/* Attachments rendering */}
            {commentParsedAtts.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                {commentParsedAtts.map((attUrl: any, aIdx: number) => {
                  const rawHref = typeof attUrl === 'string' ? attUrl : (attUrl?.url || '');
                  const filename = typeof attUrl === 'string' ? rawHref.substring(rawHref.lastIndexOf('/') + 1) : (attUrl?.name || 'Tệp đính kèm');
                  const resolved = resolveAttachmentUrl(rawHref);
                  const href = sanitizeExternalUrl(resolved);
                  if (!href) return null;

                  const isImage = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(href);

                  if (isImage) {
                    return (
                      <div key={aIdx} style={{ marginTop: '2px', display: 'inline-block' }}>
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          <img
                            src={href}
                            alt={filename}
                            style={{
                              maxWidth: '220px',
                              maxHeight: '140px',
                              borderRadius: '8px',
                              border: '1px solid var(--color-border-light)',
                              objectFit: 'cover',
                              cursor: 'zoom-in',
                              boxShadow: 'var(--shadow-sm)'
                            }}
                          />
                        </a>
                      </div>
                    );
                  }

                  return (
                    <a key={aIdx} href={href} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', padding: '3px 8px', borderRadius: '6px', textDecoration: 'none', color: 'var(--color-primary)', fontSize: '0.72rem', fontWeight: 600 }}>
                      <Paperclip size={11} />
                      <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</span>
                    </a>
                  );
                })}
              </div>
            )}

            {/* Actions Row */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px', alignItems: 'center' }}>
              {!isReply && (
                <button
                  type="button"
                  onClick={() => setReplyTo({ id: comment.id, userName: comment.user_name || 'Thành viên' })}
                  style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', fontSize: '0.72rem', padding: '2px 4px', cursor: 'pointer', fontWeight: 600, opacity: 0.85, transition: 'opacity 0.15s ease' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0.85')}
                >
                  Phản hồi
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => handleDeleteDetailComment(entityType, entityId, comment.id)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '2px', display: 'inline-flex', alignItems: 'center' }}
                  className="hover-lift"
                  title={t('Xóa')}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-light)',
        borderRadius: '16px',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
      }}>
        <span style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', fontWeight: 750, display: 'block', marginBottom: '4px' }}>
          Thảo luận & Trao đổi ({commentsList.length})
        </span>

        <div style={{ background: 'var(--color-bg-light)', border: '1px solid var(--color-border-light)', padding: '12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
          {replyTo && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(163, 20, 34, 0.08)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.72rem', color: '#a31422', fontWeight: 700, marginBottom: '6px' }}>
              <span>Đang trả lời {replyTo.userName}</span>
              <button type="button" onClick={() => setReplyTo(null)} style={{ border: 'none', background: 'transparent', color: '#a31422', cursor: 'pointer', fontWeight: 800, fontSize: '0.9rem', padding: '0 4px' }}>×</button>
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <MentionInput
              value={newCommentText}
              onChange={e => setNewCommentText(e.target.value)}
              onImagePaste={addLocalFileAttachment}
              onFilePaste={addLocalFileAttachment}
              placeholder="Viết bình luận... (Dán ảnh trực tiếp Ctrl+V)"
              style={{ minHeight: '65px', fontSize: '0.85rem', paddingRight: '40px' }}
              disabled={isSubmittingComment || uploadingAttachment}
            />
            <label style={{ position: 'absolute', right: '10px', bottom: '10px', cursor: (uploadingAttachment || isSubmittingComment) ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Đính kèm tệp">
              <input type="file" onChange={handleCommentAttachmentUpload} style={{ display: 'none' }} disabled={uploadingAttachment || isSubmittingComment} />
              {uploadingAttachment ? <RefreshCw className="spin" size={18} /> : <Paperclip size={18} />}
            </label>
          </div>

          {/* Attachment Chips List */}
          {commentAttachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '2px' }}>
              {commentAttachments.map((att: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', color: 'var(--color-text)' }}>
                  {att.previewUrl ? (
                    <img src={att.previewUrl} alt="preview" style={{ width: '22px', height: '22px', borderRadius: '4px', objectFit: 'cover' }} />
                  ) : (
                    <Paperclip size={11} color="var(--color-primary)" />
                  )}
                  <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{att.name}</span>
                  <button type="button" onClick={() => removeCommentAttachment(idx)} style={{ border: 'none', background: 'transparent', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px', lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: '4px' }}>
            <button
              type="button"
              onClick={() => handlePostDetailComment(entityType, entityId)}
              disabled={isSubmittingComment || uploadingAttachment || (!newCommentText.trim() && commentAttachments.length === 0)}
              className="btn primary sm"
              style={{ padding: '6px 18px', fontSize: '0.78rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '5px', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#fff' }}
            >
              {isSubmittingComment ? <RefreshCw className="spin" size={13} /> : <Send size={13} />}
              <span>Gửi</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto' }} className="custom-scrollbar">
          {loadingComments ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
              <RefreshCw className="spin" size={16} color="var(--color-text-muted)" />
            </div>
          ) : commentsList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
              Chưa có thảo luận nào.
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
  };

  const loadLinkedTasks = async (entityType: 'project' | 'campaign', entityId: number, isSilent = false, parentProjectId?: number | null) => {
    const cacheKey = `${cacheScopeKey}:${entityType}:${entityId}`;
    const cached = entityTasksCache.get(cacheKey);
    if (cached) {
      setLinkedTasks(cached.data);
      if (Date.now() - cached.timestamp < PROJECTS_SWR_TTL_MS && !isSilent) {
        setLoadingLinkedTasks(false);
      }
    } else if (!isSilent) {
      setLinkedTasks([]);
      setLoadingLinkedTasks(true);
    }
    linkedTasksAbortRef.current?.abort();
    const controller = new AbortController();
    linkedTasksAbortRef.current = controller;
    try {
      const tasksLimit = Math.max(20, Number(drawerTasksLimit) || 100);
      const res = await fetchAPI(`activities?related_type=${entityType}&related_id=${entityId}&limit=${tasksLimit}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const directItems = res && Array.isArray(res.items)
        ? res.items
        : extractArray<any>(res?.data?.items ? res.data.items : res);

      if (entityType === 'campaign') {
        const parentProjId = parentProjectId ?? editingCampaign?.project_id;
        if (parentProjId) {
          const projRes = await fetchAPI(`activities?related_type=project&related_id=${parentProjId}&limit=1000`, { signal: controller.signal });
          if (controller.signal.aborted) return;
          const projItems = projRes && Array.isArray(projRes.items)
            ? projRes.items
            : extractArray<any>(projRes?.data?.items ? projRes.data.items : projRes);

          const matchedProjItems = projItems.filter((task: any) => {
            const parsed = safeJsonParse<any>(task?.body, null);
            return Number(parsed?.erp_task?.campaign_id) === Number(entityId);
          });

          const allItems = [...directItems];
          matchedProjItems.forEach((task: any) => {
            if (!allItems.some(t => t.id === task.id)) {
              allItems.push(task);
            }
          });
          setLinkedTasks(allItems);
          entityTasksCache.set(cacheKey, { data: allItems, timestamp: Date.now() });
        } else {
          setLinkedTasks(directItems);
          entityTasksCache.set(cacheKey, { data: directItems, timestamp: Date.now() });
        }
      } else {
        setLinkedTasks(directItems);
        entityTasksCache.set(cacheKey, { data: directItems, timestamp: Date.now() });
      }
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      console.error(e);
      if (!cached) setLinkedTasks([]);
    } finally {
      if (!controller.signal.aborted) setLoadingLinkedTasks(false);
    }
  };

  useEffect(() => {
    clearPendingCommentDraft();
    if (editingProject && editingProject.id) {
      setProjectDrawerTab('details');
      loadProjectRoster(editingProject.id);
      loadDetailComments('project', editingProject.id);
      loadLinkedTasks('project', editingProject.id);
      loadProjectStats(editingProject.id);
      setProjectTasksPage(1);
    } else {
      projectStatsAbortRef.current?.abort();
      projectRosterAbortRef.current?.abort();
      if (!editingCampaign?.id) {
        detailCommentsAbortRef.current?.abort();
        linkedTasksAbortRef.current?.abort();
        setDetailComments([]);
        setLinkedTasks([]);
      }
      setProjectRoster([]);
      setProjectStats(null);
    }
  }, [editingProject?.id]);

  useEffect(() => {
    clearPendingCommentDraft();
    if (editingCampaign && editingCampaign.id) {
      setCampaignDrawerTab('details');
      loadDetailComments('campaign', editingCampaign.id);
      loadLinkedTasks('campaign', editingCampaign.id, false, editingCampaign.project_id);
      loadCampaignStats(editingCampaign.id);
      setCampaignTasksPage(1);

      setSubjects(safeParseArray<any>(editingCampaign.subjects_json));
      setThesisMilestones(safeParseArray<any>(editingCampaign.thesis_milestones_json));

      const rems = safeJsonParse<Record<string, any>>(editingCampaign.reminders_json, {});
      setRemindersConfig({
        school_reminder_enabled: true,
        school_reminder_hours: 12,
        ideas_reminder_enabled: true,
        ideas_reminder_hours: 168,
        assignment_reminder_enabled: true,
        assignment_reminder_hours: 12,
        lecturer_reminder_enabled: true,
        lecturer_reminder_hours: 12,
        thesis_reminder_enabled: true,
        thesis_reminder_hours: 12,
        upcoming_session_reminder_enabled: true,
        upcoming_session_reminder_minutes: 5,
        ...(rems && typeof rems === 'object' ? rems : {})
      });
    } else {
      campaignStatsAbortRef.current?.abort();
      setCampaignStats(null);
      setSubjects([]);
      setThesisMilestones([]);
      setRemindersConfig({
        school_reminder_enabled: true,
        school_reminder_hours: 12,
        ideas_reminder_enabled: true,
        ideas_reminder_hours: 168,
        assignment_reminder_enabled: true,
        assignment_reminder_hours: 12,
        lecturer_reminder_enabled: true,
        lecturer_reminder_hours: 12,
        thesis_reminder_enabled: true,
        thesis_reminder_hours: 12,
        upcoming_session_reminder_enabled: true,
        upcoming_session_reminder_minutes: 5,
      });
      if (!editingProject?.id) {
        detailCommentsAbortRef.current?.abort();
        linkedTasksAbortRef.current?.abort();
        setDetailComments([]);
        setLinkedTasks([]);
      }
    }
  }, [editingCampaign?.id]);

  useEffect(() => {
    const handleTaskUpdated = () => {
      if (editingProject && editingProject.id) {
        loadLinkedTasks('project', editingProject.id, true);
      }
      if (editingCampaign && editingCampaign.id) {
        loadLinkedTasks('campaign', editingCampaign.id, true, editingCampaign.project_id);
      }
    };
    const handleContactUpdated = () => {
      if (editingProject && editingProject.id) {
        loadProjectRoster(editingProject.id, true);
      }
      loadProjects(true);
    };
    window.addEventListener('task-updated', handleTaskUpdated);
    window.addEventListener('contact-updated', handleContactUpdated);
    return () => {
      window.removeEventListener('task-updated', handleTaskUpdated);
      window.removeEventListener('contact-updated', handleContactUpdated);
    };
  }, [editingProject?.id, editingCampaign?.id]);

  useEffect(() => {
    if (detailComments.length === 0 || (!isEditModalOpen && !isCampaignModalOpen)) return;
    const params = new URLSearchParams(location.search);
    const highlightCommentId = params.get('highlight_comment_id') || params.get('comment_id');
    if (!highlightCommentId) return;

    if (isEditModalOpen) setProjectDrawerTab('details');
    if (isCampaignModalOpen) setCampaignDrawerTab('details');

    let restoreTimer: ReturnType<typeof setTimeout> | null = null;
    const scrollTimer = setTimeout(() => {
      const element =
        document.getElementById(`entity-comment-${highlightCommentId}`) ||
        document.getElementById(`project-comment-${highlightCommentId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const bubble = element.querySelector('div') as HTMLElement | null;
        if (bubble) {
          const originalBg = bubble.style.background;
          const originalShadow = bubble.style.boxShadow;
          bubble.style.backgroundColor = '#fef08a';
          bubble.style.boxShadow = '0 0 0 2px #f59e0b';
          bubble.style.transition = 'all 0.5s ease';
          restoreTimer = setTimeout(() => {
            bubble.style.background = originalBg;
            bubble.style.boxShadow = originalShadow;
          }, 2500);
        }

        const newParams = new URLSearchParams(location.search);
        newParams.delete('highlight_comment_id');
        newParams.delete('comment_id');
        navigate(
          {
            pathname: location.pathname,
            search: newParams.toString() ? `?${newParams.toString()}` : ''
          },
          { replace: true }
        );
      }
    }, 400);

    return () => {
      clearTimeout(scrollTimer);
      if (restoreTimer) clearTimeout(restoreTimer);
    };
  }, [detailComments, isEditModalOpen, isCampaignModalOpen, location.pathname, location.search, navigate]);

  const renderDrawer = (
    isOpen: boolean,
    onClose: () => void,
    title: string,
    content: React.ReactNode | (() => React.ReactNode),
    width: string = '850px',
    headerActions?: React.ReactNode,
    isCampaign?: boolean,
    showBackButton?: boolean,
    nested: boolean = false,
    overlayKey?: string
  ) => {
    if (!isOpen) return null;
    return (
      <SlideDrawer
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        width={width}
        headerActions={headerActions}
        isCampaign={isCampaign}
        showBackButton={showBackButton}
        isMobile={isMobile}
        nested={nested}
        overlayKey={overlayKey}
        motionMs={overlayDrawerMs}
        backdropZIndex={overlayZBackdrop}
        panelZIndex={overlayZDrawer}
      >
        {typeof content === 'function' ? content() : content}
      </SlideDrawer>
    );
  };

  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [projectDocs, setProjectDocs] = useState<ProjectDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [editingDocKey, setEditingDocKey] = useState<string | null>(null);
  const [editDocNameVal, setEditDocNameVal] = useState<string>('');
  const [docFilterCategory, setDocFilterCategory] = useState<string>('all');

  const handleConfirmCopySubject = async () => {
    if (isCopyingSubject || copySubjectInFlightRef.current) return;
    if (!subjectToCopy || !copyTargetCampaignId) {
      addToast('Vui lòng chọn khóa học đích!', 'error');
      return;
    }

    copySubjectInFlightRef.current = true;
    setIsCopyingSubject(true);
    try {
      const resCamp = await fetchAPI(`campaigns/${copyTargetCampaignId}`);
      if (!resCamp?.success) {
        addToast(resCamp?.message || 'Lỗi tải thông tin khóa học đích', 'error');
        return;
      }

      const targetCamp = resCamp.data;
      const targetSubjects = safeParseArray<any>(targetCamp?.subjects_json);

      // Clone subject with unique IDs for safety
      const clonedSub = {
        ...subjectToCopy,
        id: makeUniqueId('sub'),
        host_sessions: ensureArray(subjectToCopy.host_sessions).map((hs: any) => ({ ...hs, id: makeUniqueId('hs') })),
        seminars: ensureArray(subjectToCopy.seminars).map((sem: any) => ({ ...sem, id: makeUniqueId('sem') })),
        assignments: ensureArray(subjectToCopy.assignments).map((asn: any) => ({ ...asn, id: makeUniqueId('asn') }))
      };

      let updatedSubjects = [...targetSubjects];
      const hasConflict = targetSubjects.some(
        (s: any) => String(s?.code || '').trim().toLowerCase() === String(subjectToCopy?.code || '').trim().toLowerCase()
      );

      if (hasConflict && copyConflictMode === 'replace') {
        updatedSubjects = updatedSubjects.filter(
          (s: any) => String(s?.code || '').trim().toLowerCase() !== String(subjectToCopy?.code || '').trim().toLowerCase()
        );
      }
      updatedSubjects.push(clonedSub);

      const serializedSubjects = JSON.stringify(updatedSubjects);
      const resUpdate = await fetchAPI(`campaigns/${copyTargetCampaignId}`, {
        method: 'PUT',
        body: JSON.stringify({
          subjects_json: serializedSubjects
        })
      });

      if (resUpdate?.success) {
        addToast(`Sao chép môn học sang khóa "${targetCamp.name}" thành công!`, 'success');
        setIsCopySubjectModalOpen(false);
        setSubjectToCopy(null);
        setCopyTargetCampaignId('');

        loadCampaigns(true);
        if (editingCampaign && String(editingCampaign.id) === String(copyTargetCampaignId)) {
          setSubjects(updatedSubjects);
          setEditingCampaign((prev: any) => (prev ? { ...prev, subjects_json: serializedSubjects } : prev));
        }
      } else {
        addToast(resUpdate?.message || 'Lỗi cập nhật khóa học đích', 'error');
      }
    } catch (e: any) {
      addToast(e?.message || 'Lỗi kết nối hệ thống', 'error');
    } finally {
      copySubjectInFlightRef.current = false;
      setIsCopyingSubject(false);
    }
  };

  const handleOpenCampaignView = (camp: any) => {
    clearPendingCommentDraft();
    setCampaignDrawerTab('details');
    setEditingCampaign(camp);
    setCampaignModalMode('view');
    setIsCampaignModalOpen(true);
  };

  const isAdmin = Boolean(
    user && (checkIsSystemAdmin(user) || ['director', 'assistant', 'tro_ly'].includes(normalizeRole(user)))
  );
  const isSystemAdmin = Boolean(user && checkIsSystemAdmin(user));
  const isManagerOrLeader = React.useMemo(() => {
    if (!user || isViewer(user)) return false;
    return isExecutive(user) || isManagement(user) || teams.some(t => Number(t.leader_id) === Number(user.id));
  }, [user, teams]);

  const canManageProjects = Boolean(
    user && !isViewer(user) && (isExecutive(user) || isManagement(user) || isMarketing(user) || isManagerOrLeader)
  );
  const canConfigureAcademic = Boolean(
    user && !isViewer(user) && (isExecutive(user) || isManagement(user) || isAcademic(user) || isMarketing(user))
  );

  const canEditRoster = React.useMemo(() => {
    if (!user || isViewer(user)) return false;
    if (isExecutive(user)) return true;

    const isLeaderOrMgr = isManagement(user) || teams.some(t => Number(t.leader_id) === Number(user.id));
    if (isLeaderOrMgr) {
      if (isRosterModalOpen && rosterMembers.length > 0) {
        return rosterMembers.some(m => Number(m.id) === Number(user.id) && Number(m.is_assigned) === 1);
      }
      return projectRoster.some((m: any) => Number(m.id) === Number(user.id));
    }
    return false;
  }, [user, teams, rosterMembers, projectRoster, isRosterModalOpen]);

  const canEditCurrentProject = React.useMemo(() => {
    if (!user || isViewer(user)) return false;
    if (isExecutive(user) || isMarketing(user)) return true;
    if (!editingProject) return false;

    if (editingProject.created_by && Number(editingProject.created_by) === Number(user.id)) return true;
    if (editingProject.manager_ids) {
      const mIds = String(editingProject.manager_ids).split(',').map(s => Number(s.trim())).filter(Boolean);
      if (mIds.includes(Number(user.id))) return true;
    }

    const isLeaderOrMgr = isManagement(user) || teams.some(t => Number(t.leader_id) === Number(user.id));
    if (isLeaderOrMgr) {
      return projectRoster.some((m: any) => Number(m.id) === Number(user.id));
    }
    return false;
  }, [user, editingProject, projectRoster, teams]);

  const canManageDocs = Boolean(
    user && !isViewer(user) && (isAdmin || isManagement(user) || isMarketing(user) || isAcademic(user) || canEditCurrentProject)
  );

  const formatLastUpdated = (updatedAtStr: string | undefined, createdAtStr: string | undefined) => {
    const targetStr = updatedAtStr || createdAtStr;
    if (!targetStr) return '';
    const formatted = formatDateTimeVN(targetStr);
    return formatted ? `Cập nhật: ${formatted}` : '';
  };

  const getSubjectStatus = (sub: any, fallbackStart?: string, fallbackEnd?: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dates: Date[] = [];

    if (sub && Array.isArray(sub.host_sessions)) {
      sub.host_sessions.forEach((s: any) => {
        if (s?.date) {
          const d = new Date(s.date);
          if (!isNaN(d.getTime())) dates.push(d);
        }
      });
    }

    if (sub && Array.isArray(sub.seminars)) {
      sub.seminars.forEach((s: any) => {
        if (s?.date) {
          const d = new Date(s.date);
          if (!isNaN(d.getTime())) dates.push(d);
        }
      });
    }

    if (sub && Array.isArray(sub.assignments)) {
      sub.assignments.forEach((a: any) => {
        if (a?.due_date) {
          const d = new Date(a.due_date);
          if (!isNaN(d.getTime())) dates.push(d);
        }
      });
    }

    if (dates.length === 0) {
      if (fallbackStart || fallbackEnd) {
        const start = fallbackStart ? new Date(fallbackStart) : null;
        const end = fallbackEnd ? new Date(fallbackEnd) : null;
        const minTime = start && !isNaN(start.getTime()) ? start.getTime() : null;
        const maxTime = end && !isNaN(end.getTime()) ? end.getTime() : null;
        const todayTime = today.getTime();

        if (minTime !== null && todayTime < minTime) {
          return {
            code: 'chua_mo',
            label: 'Chưa mở',
            color: '#3b82f6',
            bg: 'rgba(59, 130, 246, 0.08)'
          };
        }
        if (maxTime !== null && todayTime > maxTime) {
          return {
            code: 'da_ket_thuc',
            label: 'Đã kết thúc',
            color: '#ef4444',
            bg: 'rgba(239, 68, 68, 0.08)'
          };
        }
        if (minTime !== null || maxTime !== null) {
          return {
            code: 'dang_hoc',
            label: 'Đang học',
            color: '#10b981',
            bg: 'rgba(16, 185, 129, 0.08)'
          };
        }
      }
      return {
        code: 'chua_mo',
        label: 'Chưa mở',
        color: '#6b7280',
        bg: 'rgba(107, 114, 128, 0.08)'
      };
    }

    const sortedTimes = dates.map(d => d.getTime()).sort((a, b) => a - b);
    const minTime = sortedTimes[0];
    const maxTime = sortedTimes[sortedTimes.length - 1];
    const todayTime = today.getTime();

    if (todayTime < minTime) {
      return {
        code: 'chua_mo',
        label: 'Chưa mở',
        color: '#3b82f6',
        bg: 'rgba(59, 130, 246, 0.08)'
      };
    } else if (todayTime > maxTime) {
      return {
        code: 'da_ket_thuc',
        label: 'Đã kết thúc',
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.08)'
      };
    } else {
      return {
        code: 'dang_hoc',
        label: 'Đang học',
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.08)'
      };
    }
  };

  const subjectStatsSummary = React.useMemo(() => {
    let active = 0;
    let ended = 0;
    let notStarted = 0;
    const statusMap: Record<string, { code: string; label: string; color: string; bg: string }> = {};

    ensureArray<any>(subjects).forEach(s => {
      if (!s) return;
      const statusObj = getSubjectStatus(s, editingCampaign?.start_date, editingCampaign?.end_date);
      statusMap[s.id] = statusObj;
      if (statusObj.code === 'dang_hoc') active++;
      else if (statusObj.code === 'da_ket_thuc') ended++;
      else notStarted++;
    });

    return {
      active,
      ended,
      notStarted,
      statusMap
    };
  }, [subjects, editingCampaign?.start_date, editingCampaign?.end_date]);

  const resolveLecturerInfo = useCallback((lecturerId: unknown): {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    avatar?: string;
    type: 'internal' | 'external' | 'unknown';
  } | null => {
    const cleanId = String(lecturerId ?? '').trim();
    if (!cleanId) return null;

    const comp = ensureArray<any>(companiesList).find(c => String(c.id) === cleanId);
    if (comp) {
      return {
        id: cleanId,
        name: comp.name || comp.company_name || `GV #${cleanId}`,
        email: comp.email,
        phone: comp.phone,
        avatar: comp.logo || comp.avatar_url,
        type: 'external'
      };
    }

    const cons = ensureArray<any>(consultants).find(c => String(c.id) === cleanId);
    if (cons) {
      return {
        id: cleanId,
        name: cons.name || cons.full_name || cons.username || `GV #${cleanId}`,
        email: cons.email,
        phone: cons.phone,
        avatar: cons.avatar_url || cons.avatar,
        type: 'internal'
      };
    }

    const matchedUser = ensureArray<any>(users).find(u => String(u.id) === cleanId);
    if (matchedUser) {
      return {
        id: cleanId,
        name: matchedUser.full_name || matchedUser.name || matchedUser.username || `GV #${cleanId}`,
        email: matchedUser.email,
        phone: matchedUser.phone || matchedUser.phone_number,
        avatar: matchedUser.avatar_url || matchedUser.avatar,
        type: 'internal'
      };
    }

    return {
      id: cleanId,
      name: `GV ID: ${cleanId}`,
      type: 'unknown'
    };
  }, [companiesList, consultants, users]);

  const lecturerOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const options: { value: string; label: string; kind: 'internal' | 'external' }[] = [];

    ensureArray<any>(companiesList).forEach((comp) => {
      const id = String(comp?.id ?? '').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      options.push({
        value: id,
        label: comp.name || comp.company_name || `Giảng viên #${id}`,
        kind: 'external'
      });
    });

    ensureArray<any>(consultants).forEach((cons) => {
      const id = String(cons?.id ?? '').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      options.push({
        value: id,
        label: `${cons.name || cons.full_name || cons.username || `Nhân sự #${id}`} (Nội bộ)`,
        kind: 'internal'
      });
    });

    ensureArray<any>(users).forEach((u) => {
      const id = String(u?.id ?? '').trim();
      if (!id || seen.has(id)) return;
      const role = normalizeRole(u);
      if (isAcademic(u) || isExecutive(u) || ['lecturer', 'instructor', 'trainer'].includes(role)) {
        seen.add(id);
        options.push({
          value: id,
          label: `${u.full_name || u.name || u.username || `Nhân sự #${id}`} (Nội bộ)`,
          kind: 'internal'
        });
      }
    });

    return options;
  }, [companiesList, consultants, users]);

  const canDrilldownExec = isExecutive(user);
  const handleOpenProjectContacts = useCallback(() => {
    if (editingProject?.id) {
      navigate(`/contacts?project_id=${editingProject.id}`);
    }
  }, [editingProject?.id, navigate]);

  const handleOpenCampaignContacts = useCallback(() => {
    if (editingCampaign?.id) {
      navigate(`/contacts?campaign_id=${editingCampaign.id}`);
    }
  }, [editingCampaign?.id, navigate]);

  const subTabOptions = useMemo(() => [
    { value: 'projects', label: 'Chương trình', icon: <GraduationCap size={15} />, badge: totalProjects },
    { value: 'campaigns', label: 'Khóa học', icon: <BookOpen size={15} />, badge: filteredCampaigns.length },
  ], [totalProjects, filteredCampaigns.length]);

  const lecturerStatsSummary = React.useMemo(() => {
    const statsMap: Record<string, {
      id: string;
      name: string;
      email?: string;
      phone?: string;
      avatar?: string;
      subjectIds: Set<string>;
      subjectsCount: number;
      sessionsCount: number;
      seminarsCount: number;
      totalClassesCount: number;
      type: 'internal' | 'external' | 'unknown';
    }> = {};

    const getOrInitLecturer = (lecturerId: string) => {
      const cleanId = String(lecturerId || '').trim();
      if (!cleanId) return null;

      if (!statsMap[cleanId]) {
        const info = resolveLecturerInfo(cleanId);
        if (!info) return null;
        statsMap[cleanId] = {
          ...info,
          subjectIds: new Set(),
          subjectsCount: 0,
          sessionsCount: 0,
          seminarsCount: 0,
          totalClassesCount: 0
        };
      }
      return statsMap[cleanId];
    };

    let totalSessions = 0;
    let totalSeminars = 0;

    ensureArray<any>(subjects).forEach(sub => {
      if (!sub) return;
      const mainLecturerId = sub.lecturer_id ? String(sub.lecturer_id).trim() : '';

      if (mainLecturerId) {
        const lect = getOrInitLecturer(mainLecturerId);
        if (lect) {
          lect.subjectIds.add(sub.id);
        }
      }

      if (Array.isArray(sub.host_sessions)) {
        totalSessions += sub.host_sessions.length;
        sub.host_sessions.forEach((hs: any) => {
          const sessionLecturerId = hs?.lecturer_name ? String(hs.lecturer_name).trim() : mainLecturerId;
          if (sessionLecturerId) {
            const lect = getOrInitLecturer(sessionLecturerId);
            if (lect) {
              lect.sessionsCount += 1;
              lect.totalClassesCount += 1;
              lect.subjectIds.add(sub.id);
            }
          }
        });
      }

      if (Array.isArray(sub.seminars)) {
        sub.seminars.forEach((sem: any) => {
          const semWeight = Number(sem?.sessions_count) === 2 ? 2 : 1;
          totalSeminars += semWeight;
          const semLecturerId = sem?.lecturer_id ? String(sem.lecturer_id).trim() : mainLecturerId;
          if (semLecturerId) {
            const lect = getOrInitLecturer(semLecturerId);
            if (lect) {
              lect.seminarsCount += semWeight;
              lect.totalClassesCount += semWeight;
              lect.subjectIds.add(sub.id);
            }
          }
        });
      }
    });

    Object.values(statsMap).forEach(lect => {
      lect.subjectsCount = lect.subjectIds.size;
    });

    const lecturerStats = Object.values(statsMap);
    const assignedSubjects = ensureArray<any>(subjects).filter(s => s?.lecturer_id).length;
    const assignmentRate = subjects.length > 0 ? Math.round((assignedSubjects / subjects.length) * 100) : 0;
    const topLecturer = lecturerStats.length > 0 ? [...lecturerStats].sort((a, b) => b.totalClassesCount - a.totalClassesCount)[0] : null;

    return {
      lecturerStats,
      assignedSubjects,
      assignmentRate,
      totalSessions,
      totalSeminars,
      topLecturer
    };
  }, [subjects, resolveLecturerInfo]);

  const canEditProject = (proj: Project) => {
    if (!user || isViewer(user)) return false;
    if (isExecutive(user) || isMarketing(user)) return true;
    const isLeaderOrMgr = isManagement(user) || teams.some(t => Number(t.leader_id) === Number(user.id));
    if (isLeaderOrMgr) return true;
    if (proj.manager_ids && String(proj.manager_ids).split(',').map(s => s.trim()).includes(String(user.id))) {
      return true;
    }
    return String(proj.created_by) === String(user.id);
  };

  const canDeleteProject = (proj: Project) => {
    if (!user || isViewer(user)) return false;
    if (isExecutive(user)) return true;
    return String(proj.created_by) === String(user.id);
  };

  const canEditCampaign = (camp: any) => {
    if (!user || isViewer(user)) return false;
    if (isExecutive(user) || isAcademic(user) || isMarketing(user)) return true;

    const projectPool = allProjectsLookup.length > 0 ? allProjectsLookup : projects;
    if (camp?.project_id) {
      const parentProj = projectPool.find(p => String(p.id) === String(camp.project_id));
      if (parentProj) {
        const isProjCreator = String(parentProj.created_by) === String(user.id);
        const isProjMgr = Boolean(
          parentProj.manager_ids && String(parentProj.manager_ids).split(',').map(s => s.trim()).includes(String(user.id))
        );
        if (isProjCreator || isProjMgr) return true;
      }
    }

    const isLeaderOrMgr = isManagement(user) || teams.some(t => Number(t.leader_id) === Number(user.id));
    if (isLeaderOrMgr) return true;
    const isCreator = String(camp?.created_by) === String(user.id);
    const inManagerIds = Boolean(camp?.manager_ids && String(camp.manager_ids).split(',').map(s => s.trim()).includes(String(user.id)));
    const inUserIds = Boolean(camp?.user_ids && String(camp.user_ids).split(',').map(s => s.trim()).includes(String(user.id)));
    return isCreator || inManagerIds || inUserIds;
  };

  const canDeleteCampaign = (camp: any) => {
    if (!user || isViewer(user)) return false;
    if (isExecutive(user)) return true;

    const projectPool = allProjectsLookup.length > 0 ? allProjectsLookup : projects;
    if (camp?.project_id) {
      const parentProj = projectPool.find(p => String(p.id) === String(camp.project_id));
      if (parentProj) {
        const isProjCreator = String(parentProj.created_by) === String(user.id);
        const isProjMgr = Boolean(
          parentProj.manager_ids && String(parentProj.manager_ids).split(',').map(s => s.trim()).includes(String(user.id))
        );
        if (isProjCreator || isProjMgr) return true;
      }
    }

    return String(camp?.created_by) === String(user.id);
  };

  const resolveAttachmentUrl = (url: string | null | undefined): string => {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (!trimmed) return '';
    const safeAbsolute = sanitizeExternalUrl(trimmed, { allowRelative: false, allowMailTel: false });
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return safeAbsolute;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      return '';
    }
    let cleanPath = trimmed.replace(/^\/+/, '');
    if (cleanPath.includes('storage/uploads/')) {
      cleanPath = cleanPath.replace('storage/uploads/', 'uploads/');
    }
    if (cleanPath.startsWith('backend/')) {
      cleanPath = cleanPath.substring('backend/'.length);
    }
    if (cleanPath.startsWith('deposits/')) {
      cleanPath = 'uploads/' + cleanPath;
    }
    return sanitizeExternalUrl(`${getApiBaseUrl()}/${cleanPath}`);
  };

  const showUserCard = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    const cleanName = (n: string) => (n || '').trim().replace(/\s+/g, '_').toLowerCase().replace(/_\([^)]+\)/g, '').replace(/\([^)]+\)/g, '');
    const searchVal = cleanName(name);
    const matchedUser = users.find((u: any) => {
      const uName = cleanName(u.full_name || u.name || u.username || '');
      return uName === searchVal || (searchVal && (uName.includes(searchVal) || searchVal.includes(uName)));
    });

    let empCode = (matchedUser as any)?.employee_id || '';
    if (empCode) {
      empCode = String(empCode).replace(/^RL-/i, 'IDEAS-');
    } else if (matchedUser?.id) {
      empCode = `${projectDefaultPrefix}${String(matchedUser.id).padStart(4, '0')}`;
    }

    setQuickUserCard({
      id: matchedUser?.id || 0,
      name: matchedUser?.full_name || matchedUser?.name || name,
      role: matchedUser?.job_title || matchedUser?.role || 'sales',
      email: matchedUser?.email,
      phone: matchedUser?.phone || matchedUser?.phone_number || '',
      vacationMode: matchedUser?.vacation_mode,
      avatarUrl: (matchedUser?.avatar_url || matchedUser?.avatar) ? resolveAttachmentUrl(matchedUser.avatar_url || matchedUser.avatar || '') : '',
      visible: true,
      x: e.clientX,
      y: e.clientY,
      employeeId: empCode
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => addToast(`Đã sao chép ${label} vào bộ nhớ tạm!`, 'success'))
        .catch(() => addToast(`Không thể sao chép ${label}`, 'error'));
      return;
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      addToast(`Đã sao chép ${label} vào bộ nhớ tạm!`, 'success');
    } catch {
      addToast(`Không thể sao chép ${label}`, 'error');
    }
  };

  const renderFormattedText = (text: string) => {
    if (!text) return '';
    const regex = /(https?:\/\/[^\s]+|@[\p{L}\p{N}_()]+)/gu;
    const parts = text.split(regex);
    return parts.map((part, index) => {
      if (part.startsWith('http://') || part.startsWith('https://')) {
        const safeUrl = sanitizeExternalUrl(part, { allowRelative: false, allowMailTel: false });
        if (!safeUrl) return part;
        return (
          <a
            key={index}
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-primary)', textDecoration: 'underline', wordBreak: 'break-all' }}
          >
            {part}
          </a>
        );
      } else if (part.startsWith('@')) {
        const cleanName = (n: string) => (n || '').trim().replace(/\s+/g, '_').toLowerCase().replace(/_\([^)]+\)/g, '').replace(/\([^)]+\)/g, '');
        const cleanMentionVal = cleanName(part.substring(1));
        const taggedUser = users.find((u: any) => {
          const normalizedUser = cleanName(u.full_name || u.name || u.fullname || u.username);
          return normalizedUser === cleanMentionVal;
        });

        if (!taggedUser) {
          return part;
        }

        const displayName = taggedUser?.full_name || taggedUser?.name || taggedUser?.fullname || taggedUser?.username || part.substring(1).replace(/_/g, ' ');
        const avatarUrl = taggedUser?.avatar_url || taggedUser?.avatar;

        return (
          <span
            key={index}
            onClick={(e) => showUserCard(e, displayName)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: '#dc2626',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              padding: '2px 8px',
              borderRadius: '9999px',
              margin: '0 2px',
              fontWeight: 600,
              fontSize: '0.85em',
              verticalAlign: 'middle',
              cursor: 'pointer'
            }}
          >
            <Avatar name={displayName} src={avatarUrl ? resolveAttachmentUrl(avatarUrl) : undefined} size={16} />
            @{displayName}
          </span>
        );
      }
      return part;
    });
  };

  const parseIds = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(String).filter(Boolean);
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith('[')) {
        return safeParseArray<any>(trimmed).map(String).filter(Boolean);
      }
      return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  const renderFolderPathLink = (path: string | undefined, projectId?: number) => {
    if (!path) return <span style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>Không có folder liên kết</span>;
    const isUrl = path.startsWith('http://') || path.startsWith('https://');
    if (isUrl) {
      const safeHref = sanitizeExternalUrl(path, { allowRelative: false, allowMailTel: false });
      if (!safeHref) {
        return <span style={{ color: 'var(--color-text-light)', fontSize: '0.825rem' }}>Liên kết không hợp lệ</span>;
      }
      const isDriveUrl = safeHref.toLowerCase().includes('drive');
      return (
        <a
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#475569',
            textDecoration: 'none',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(100, 116, 139, 0.05)',
            border: '1px solid rgba(100, 116, 139, 0.14)',
            padding: '0 12px',
            borderRadius: '10px',
            fontSize: '0.825rem',
            transition: 'all 0.2s ease',
            height: '32px',
            boxSizing: 'border-box',
            fontFamily: 'inherit'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(100, 116, 139, 0.09)';
            e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.22)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(100, 116, 139, 0.05)';
            e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.14)';
          }}
        >
          {isDriveUrl ? (
            <>
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Google_Drive_icon_%282020%29.svg/1280px-Google_Drive_icon_%282020%29.svg.png"
                alt="Google Drive"
                style={{ width: '14px', height: '14px', objectFit: 'contain', flexShrink: 0 }}
              />
              <span>Mở Google Drive</span>
            </>
          ) : (
            <>
              <ExternalLink size={14} color="#334155" style={{ flexShrink: 0 }} />
              <span>Mở liên kết</span>
            </>
          )}
        </a>
      );
    }

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (projectId) {
            handleOpenFolderModal(path, projectId);
          } else {
            addToast('Không tìm thấy chương trình liên kết', 'error');
          }
        }}
        style={{
          color: '#475569',
          border: '1px solid rgba(100, 116, 139, 0.14)',
          background: 'rgba(100, 116, 139, 0.05)',
          cursor: 'pointer',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 12px',
          borderRadius: '10px',
          fontSize: '0.825rem',
          transition: 'all 0.2s ease',
          outline: 'none',
          height: '32px',
          boxSizing: 'border-box',
          fontFamily: 'inherit'
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(100, 116, 139, 0.09)';
          e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.22)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(100, 116, 139, 0.05)';
          e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.14)';
        }}
      >
        <Folder size={14} color="#BD1D2D" style={{ flexShrink: 0 }} />
        <span>{path}</span>
      </button>
    );
  };

  const renderProjectHierarchy = () => {
    const linkedCamps = ensureArray<any>(campaigns).filter(c =>
      String(c.project_id) === String(editingProject?.id) ||
      (editingProject?.campaign_ids && String(editingProject.campaign_ids).split(',').map((s: string) => s.trim()).includes(c.name))
    );

    return (
      <div style={{
        background: 'var(--color-surface, #FFFFFF)',
        border: '1px solid var(--color-border-light, #E2E8F0)',
        borderRadius: '16px',
        padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        maxHeight: '75vh',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} style={{ color: '#BD1D2D' }} />
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sơ đồ phân cấp Chương trình &amp; Khóa học</h4>
          </div>
          {canConfigureAcademic && (
            <button
              type="button"
              className="btn primary sm"
              onClick={() => {
                setEditingCampaign({
                  project_id: editingProject?.id,
                  status: 'active',
                  start_date: getLocalDateStr()
                });
                setCampaignModalMode('create');
                setIsCampaignModalOpen(true);
              }}
              style={{ borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700 }}
            >
              <Plus size={14} /> Thêm khóa học mới
            </button>
          )}
        </div>

        {linkedCamps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
            Chưa có khóa học nào liên kết với chương trình này.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingLeft: '8px' }}>
            {linkedCamps.map((camp) => {
              const subs = safeParseArray<any>(camp.subjects_json);
              return (
                <div key={camp.id} style={{ borderLeft: '2px solid rgba(189, 29, 45, 0.18)', paddingLeft: '16px', position: 'relative' }}>
                  <div style={{
                    position: 'absolute',
                    left: '-6px',
                    top: '6px',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#BD1D2D',
                    border: '2px solid var(--color-surface, #ffffff)',
                    boxShadow: '0 0 0 1px #BD1D2D'
                  }} />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>Khóa học: {camp.name}</span>
                      <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '6px', background: camp.status === 'active' ? 'rgba(189, 29, 45, 0.08)' : '#f1f5f9', color: camp.status === 'active' ? '#BD1D2D' : '#64748b', fontWeight: 700 }}>
                        {camp.status === 'active' ? 'Hoạt động' : 'Tạm dừng'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn outline sm"
                      onClick={() => handleOpenCampaignView(camp)}
                      style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '6px', height: '28px' }}
                    >
                      Xem chi tiết khóa
                    </button>
                  </div>

                  {subs.length === 0 ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)', paddingLeft: '12px' }}>
                      Chưa cấu hình môn học
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '12px', marginTop: '6px' }}>
                      {subs.map((s: any) => {
                        const lecturerInfo = resolveLecturerInfo(s.lecturer_id);
                        const foundComp = companiesList.find(c => String(c.id) === String(s.lecturer_id));
                        const lecturerName = lecturerInfo ? lecturerInfo.name : 'Chưa phân công';
                        const avatarUrl = lecturerInfo?.avatar ? resolveAttachmentUrl(lecturerInfo.avatar) : '';
                        return (
                          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-bg-light)', border: '1px solid var(--color-border-light)', borderRadius: '10px', padding: '8px 12px', flexWrap: 'wrap' }}>
                            <BookOpen size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: '150px' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                {s.code || 'MÔN'}: {s.name}
                              </span>
                              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-light)' }}>
                                Lớp: {ensureArray(s.host_sessions).length} buổi trường • {ensureArray(s.seminars).length} chuyên đề
                              </span>
                            </div>
                            <div
                              onClick={(e) => {
                                if (foundComp) {
                                  setSelectedLecturerEntity(foundComp);
                                  setIsLecturerDrawerOpen(true);
                                } else if (lecturerInfo?.type === 'internal') {
                                  showUserCard(e, lecturerInfo.name);
                                }
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'var(--color-surface, #ffffff)',
                                padding: '3px 10px',
                                borderRadius: '20px',
                                border: '1px solid var(--color-border-light)',
                                cursor: (foundComp || lecturerInfo?.type === 'internal') ? 'pointer' : 'default'
                              }}
                              className={(foundComp || lecturerInfo?.type === 'internal') ? 'hover-lift' : ''}
                            >
                              <Avatar name={lecturerName} src={avatarUrl || undefined} size={14} />
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text)' }}>{lecturerName}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderProjectViewDrawer = () => {
    const projectRevenue = Number(projectStats?.actual_revenue ?? 0);
    const projectManagers = parseIds(editingProject?.manager_ids)
      .map(id => users.find(u => String(u.id) === String(id)))
      .filter(Boolean);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
        {/* Unified Tab Selectors (Non-wrapping + overflow dropdown on mobile) */}
        <div style={{ marginBottom: '0.25rem' }}>
          <ResponsiveSegmentedTabs
            tabs={[
              { id: 'details', label: 'Thông tin chung', mobileLabel: 'Thông tin', icon: <Info size={14} /> },
              { id: 'gantt', label: 'Sơ đồ Gantt', mobileLabel: 'Gantt', icon: <Calendar size={14} /> },
              { id: 'hierarchy', label: 'Sơ đồ phân cấp', mobileLabel: 'Phân cấp', icon: <Layers size={14} /> },
              { id: 'changelog', label: 'Lịch sử hoạt động', mobileLabel: 'Lịch sử', icon: <History size={14} /> },
            ]}
            activeId={projectDrawerTab}
            onChange={(id) => setProjectDrawerTab(id as any)}
            mobileMaxVisible={2}
            tabletMaxVisible={4}
            desktopMaxVisible={4}
            fullWidthOnMobile
          />
        </div>

        {projectDrawerTab === 'details' && (
          <>
            {/* KPI Summary Cards (Ch.V Brand Red #BD1D2D & Slate #0F172A DNA) */}
            {projectStats && (
              <ProjectDetailsKpiStrip
                projectStats={projectStats}
                projectRevenue={projectRevenue}
                canDrilldown={canDrilldownExec}
                onDrilldown={handleOpenProjectContacts}
              />
            )}

            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1.25rem', alignItems: 'start' }}>
              {/* Left Column (3/5) */}
              <div style={{ flex: 3, width: isMobile ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                {/* Section 1: Thông tin cơ bản */}
                <div style={{
                  background: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      padding: '8px',
                      background: 'rgba(15, 23, 42, 0.06)',
                      borderRadius: '10px',
                      color: '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Building2 size={16} />
                    </div>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thông tin cơ bản</h4>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.25rem' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Tên chương trình</span>
                      <span style={{ color: 'var(--color-text)', fontSize: '0.95rem', fontWeight: 700, display: 'block' }}>{editingProject?.name}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Mã chương trình</span>
                      <span style={{ color: 'var(--color-text)', fontSize: '0.95rem', fontWeight: 700, display: 'block', fontFamily: 'monospace' }}>{editingProject?.code}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Cấp bằng</span>
                      <span style={{ color: 'var(--color-text)', fontSize: '0.95rem', fontWeight: 700, display: 'block' }}>{editingProject?.developer || 'Chưa cập nhật'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Trạng thái hoạt động</span>
                      <span
                        className={`badge ${editingProject?.status === 'active' ? 'success' : 'secondary'}`}
                        style={{ fontSize: '0.75rem', padding: '6px 12px', borderRadius: '100px', fontWeight: 700, display: 'inline-block', marginTop: '2px' }}
                      >
                        {editingProject?.status === 'active' ? 'Đang hoạt động' : 'Tạm dừng'}
                      </span>
                    </div>
                    {editingProject?.location && (
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Địa điểm học / Cơ sở</span>
                        <span style={{ color: 'var(--color-text)', fontSize: '0.85rem', fontWeight: 700, display: 'block', lineHeight: 1.4 }}>{editingProject.location}</span>
                      </div>
                    )}
                    {editingProject?.reference_url && parseReferenceLinks(editingProject.reference_url).length > 0 && (
                      <div style={{ gridColumn: 'span 2', marginTop: '4px', borderTop: '1px solid var(--color-border-light)', paddingTop: '12px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>Website &amp; Tài liệu tham khảo</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {parseReferenceLinks(editingProject.reference_url).map((link, idx) => {
                            const safeRefUrl = sanitizeExternalUrl(link.url, { allowRelative: false, allowMailTel: false });
                            if (!safeRefUrl) return null;
                            const isGoogleSheets = safeRefUrl.includes('docs.google.com/spreadsheets') || safeRefUrl.includes('google.com/sheets');
                            return (
                              <a
                                key={idx}
                                href={safeRefUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  background: isGoogleSheets ? 'rgba(189, 29, 45, 0.06)' : 'rgba(100, 116, 139, 0.05)',
                                  border: isGoogleSheets ? '1px solid rgba(189, 29, 45, 0.16)' : '1px solid rgba(100, 116, 139, 0.14)',
                                  padding: '8px 14px',
                                  borderRadius: '10px',
                                  color: isGoogleSheets ? '#BD1D2D' : '#475569',
                                  textDecoration: 'none',
                                  fontWeight: 700,
                                  fontSize: '0.825rem',
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                {isGoogleSheets ? (
                                  <FileSpreadsheet size={14} color="#BD1D2D" />
                                ) : (
                                  <Globe size={14} />
                                )}
                                <span>{link.title}</span>
                                <ExternalLink size={12} style={{ opacity: 0.6 }} />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 4: Mô tả chi tiết */}
                <div style={{
                  background: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      padding: '8px',
                      background: 'rgba(15, 23, 42, 0.06)',
                      borderRadius: '10px',
                      color: '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <AlignLeft size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mô tả chi tiết</span>
                  </div>
                  <p style={{ color: 'var(--color-text)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.875rem' }}>
                    {editingProject?.description || 'Không có mô tả chi tiết'}
                  </p>
                </div>

                {/* Discussions/Comments */}
                {editingProject?.id && renderEntityComments('project', editingProject.id)}

              </div>

              {/* Right Column (2/5) */}
              <div style={{ flex: 2, width: isMobile ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                {/* Section: Nhân sự phụ trách (Managers & Roster) */}
                <div style={{
                  background: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        padding: '8px',
                        background: 'rgba(189, 29, 45, 0.08)',
                        borderRadius: '10px',
                        color: '#BD1D2D',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Users size={16} />
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Nhân sự &amp; Roster ({projectRoster.length})
                      </span>
                    </div>
                    {(canEditRoster || canManageProjects || canEditCurrentProject) && editingProject?.id && (
                      <button
                        type="button"
                        onClick={() => handleOpenRoster(editingProject.id as number)}
                        className="btn outline sm"
                        style={{ height: '28px', padding: '0 10px', fontSize: '0.72rem', fontWeight: 700, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Settings size={12} /> Quản lý Roster
                      </button>
                    )}
                  </div>

                  {projectManagers.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Quản lý chương trình</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {projectManagers.map((mgr: any) => {
                          const mgrName = mgr.full_name || mgr.name || mgr.username;
                          return (
                            <span
                              key={mgr.id}
                              onClick={(e) => showUserCard(e, mgrName)}
                              className="hover-lift"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'rgba(189, 29, 45, 0.06)',
                                border: '1px solid rgba(189, 29, 45, 0.16)',
                                padding: '4px 10px',
                                borderRadius: '9999px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: '#BD1D2D',
                                cursor: 'pointer'
                              }}
                            >
                              <Avatar name={mgrName} src={mgr.avatar_url || mgr.avatar} size={18} />
                              {mgrName}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {projectRosterLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem' }}>
                      <RefreshCw className="spin" size={16} color="var(--color-text-muted)" />
                    </div>
                  ) : projectRoster.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--color-bg-light)', border: '1px solid var(--color-border-light)', borderRadius: '10px', color: 'var(--color-text-muted)', fontSize: '0.8rem', fontWeight: 550 }}>
                      <Info size={12} style={{ opacity: 0.6 }} />
                      <span>Chưa phân công nhân sự phụ trách</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {projectRoster.slice(0, 12).map((member: any) => {
                        const memberName = member.full_name || member.name || member.username || `ID #${member.id}`;
                        return (
                          <span
                            key={member.id}
                            onClick={(e) => showUserCard(e, memberName)}
                            className="hover-lift"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'var(--color-bg-light)',
                              border: '1px solid var(--color-border-light)',
                              padding: '4px 10px',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: 'var(--color-text)',
                              cursor: 'pointer'
                            }}
                          >
                            <Avatar name={memberName} src={member.avatar_url || member.avatar} size={18} />
                            {memberName}
                          </span>
                        );
                      })}
                      {projectRoster.length > 12 && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 700, alignSelf: 'center', paddingLeft: '4px' }}>
                          +{projectRoster.length - 12} nhân sự
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Section: Chiến dịch liên kết */}
                <div style={{
                  background: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      padding: '8px',
                      background: 'rgba(15, 23, 42, 0.06)',
                      borderRadius: '10px',
                      color: '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Megaphone size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chiến dịch liên kết</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(() => {
                      const linkedCamps = ensureArray<any>(campaigns).filter(c =>
                        String(c.project_id) === String(editingProject?.id) ||
                        (editingProject?.campaign_ids && String(editingProject.campaign_ids).split(',').map((s: string) => s.trim()).includes(c.name))
                      );

                      if (linkedCamps.length === 0) {
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--color-bg-light)', border: '1px solid var(--color-border-light)', borderRadius: '10px', color: 'var(--color-text-muted)', fontSize: '0.8rem', fontWeight: 550 }}>
                            <Info size={12} style={{ opacity: 0.6 }} />
                            <span>Chưa liên kết chiến dịch</span>
                          </div>
                        );
                      }

                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {linkedCamps.map(camp => (
                            <span
                              key={camp.id}
                              onClick={() => handleOpenCampaignView(camp)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '0.825rem',
                                fontWeight: 700,
                                background: 'rgba(100, 116, 139, 0.05)',
                                padding: '6px 12px',
                                borderRadius: '10px',
                                border: '1px solid rgba(100, 116, 139, 0.14)',
                                color: '#475569',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.borderColor = 'rgba(189, 29, 45, 0.24)';
                                e.currentTarget.style.background = 'rgba(189, 29, 45, 0.05)';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.14)';
                                e.currentTarget.style.background = 'rgba(100, 116, 139, 0.05)';
                              }}
                            >
                              <Megaphone size={14} color="#BD1D2D" style={{ flexShrink: 0 }} />
                              {camp.name}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Section: Đường dẫn Folder liên kết */}
                <div style={{
                  background: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      padding: '8px',
                      background: 'rgba(15, 23, 42, 0.06)',
                      borderRadius: '10px',
                      color: '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Folder size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Đường dẫn Folder liên kết</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {parseFolderPaths(editingProject?.folder_path).length === 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--color-bg-light)', border: '1px solid var(--color-border-light)', borderRadius: '10px', color: 'var(--color-text-muted)', fontSize: '0.8rem', fontWeight: 550 }}>
                        <Info size={12} style={{ opacity: 0.6 }} />
                        <span>Chưa cấu hình folder liên kết</span>
                      </div>
                    ) : (
                      parseFolderPaths(editingProject?.folder_path).map((f, idx) => (
                        <div key={idx}>
                          {renderFolderPathLink(f.path, editingProject?.id)}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Section: Tài liệu liên kết */}
                <div style={{
                  background: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      padding: '8px',
                      background: 'rgba(15, 23, 42, 0.06)',
                      borderRadius: '10px',
                      color: '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <FileText size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tài liệu liên kết</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {parseIds(editingProject?.document_ids).length === 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--color-bg-light)', border: '1px solid var(--color-border-light)', borderRadius: '10px', color: 'var(--color-text-muted)', fontSize: '0.8rem', fontWeight: 550 }}>
                        <Info size={12} style={{ opacity: 0.6 }} />
                        <span>Chưa liên kết tài liệu</span>
                      </div>
                    ) : (
                      parseIds(editingProject?.document_ids).map(docId => {
                        const fileObj = ensureArray(allFiles).find(f => String(f.id) === String(docId));
                        if (!fileObj) return null;
                        const safeDocUrl = resolveAttachmentUrl(fileObj.file_path || fileObj.url);
                        if (!safeDocUrl) return null;
                        return (
                          <a
                            key={docId}
                            href={safeDocUrl}
                            download={fileObj.name}
                            title={fileObj.name}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#475569',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              background: 'var(--color-bg-light)',
                              padding: '8px 12px',
                              borderRadius: '10px',
                              border: '1px solid var(--color-border-light)',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.22)';
                              e.currentTarget.style.background = 'var(--color-surface, #ffffff)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.borderColor = 'var(--color-border-light)';
                              e.currentTarget.style.background = 'var(--color-bg-light)';
                            }}
                          >
                            <FileText size={14} color="#334155" style={{ flexShrink: 0 }} /> {formatFileName(fileObj.name, 40)}
                          </a>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Linked Tasks */}
                <div style={{
                  background: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      padding: '8px',
                      background: 'rgba(15, 23, 42, 0.06)',
                      borderRadius: '10px',
                      color: '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <CheckSquare size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Nhiệm vụ & Công việc liên kết ({linkedTasks.length})
                    </span>
                  </div>
                  {loadingLinkedTasks ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                      <RefreshCw className="spin" size={16} color="var(--color-text-muted)" />
                    </div>
                  ) : linkedTasks.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--color-bg-light)', border: '1px solid var(--color-border-light)', borderRadius: '10px', color: 'var(--color-text-muted)', fontSize: '0.8rem', fontWeight: 550 }}>
                      <Info size={12} style={{ opacity: 0.6 }} />
                      <span>Chưa có công việc nào liên kết với chương trình này.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(() => {
                        const sortedTasks = [...ensureArray<any>(linkedTasks)].sort((a, b) => {
                          const weightA = TASK_PRIORITY_WEIGHT[a.priority] || 2;
                          const weightB = TASK_PRIORITY_WEIGHT[b.priority] || 2;
                          if (weightB !== weightA) {
                            return weightB - weightA;
                          }
                          if (a.due_date && b.due_date) {
                            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
                          }
                          if (a.due_date) return -1;
                          if (b.due_date) return 1;
                          return 0;
                        });

                        const totalPages = Math.ceil(sortedTasks.length / 10);
                        const startIndex = (projectTasksPage - 1) * 10;
                        const paginatedTasks = sortedTasks.slice(startIndex, startIndex + 10);

                        return (
                          <>
                            {paginatedTasks.map(task => {
                              const statusColors: any = {
                                planned: { bg: 'rgba(245, 158, 11, 0.08)', text: 'var(--color-warning)' },
                                done: { bg: 'rgba(16, 185, 129, 0.08)', text: 'var(--color-success)' },
                                cancelled: { bg: 'rgba(239, 68, 68, 0.08)', text: 'var(--color-danger)' }
                              };
                              const sc = statusColors[task.status] || statusColors.planned;
                              const performer = users.find(u => Number(u.id) === Number(task.user_id));
                              const performerRoleLabel = performer ? getUserDisplayRoleOrTitle(performer) : '';
                              return (
                                <div
                                  key={task.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: 'var(--color-bg-light)',
                                    border: '1px solid var(--color-border-light)',
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.01)'
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = 'var(--color-primary-light)';
                                    e.currentTarget.style.background = 'var(--color-surface, #ffffff)';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(189, 29, 45, 0.06)';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = 'var(--color-border-light)';
                                    e.currentTarget.style.background = 'var(--color-bg-light)';
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.01)';
                                  }}
                                  onClick={() => handleOpenTask(task.id)}
                                  title={t('Click để xem chi tiết nhiệm vụ')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                    <div
                                      style={{ marginTop: '3px', cursor: 'pointer', padding: '2px', borderRadius: '4px' }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickToggleTaskStatus(task.id, task.status);
                                      }}
                                      title={task.status === 'done' ? t('Đánh dấu chưa xong') : t('Đánh dấu hoàn thành')}
                                    >
                                      <CheckSquare size={18} color={task.status === 'done' ? 'var(--color-success)' : 'var(--color-text-muted)'} style={{ opacity: 0.85 }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <span style={{ fontWeight: 650, color: 'var(--color-text)', fontSize: '0.9rem', lineHeight: '1.2' }}>{task.subject}</span>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Avatar
                                          src={performer?.avatar_url || performer?.avatar}
                                          name={performer?.full_name || performer?.name || 'Hệ thống'}
                                          size={18}
                                        />
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                                          {performer?.full_name || performer?.name || 'Hệ thống'}{performerRoleLabel ? ` (${performerRoleLabel})` : ''}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickToggleTaskStatus(task.id, task.status);
                                      }}
                                      style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        padding: '4px 10px',
                                        borderRadius: '100px',
                                        background: sc.bg,
                                        color: sc.text,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.03em',
                                        cursor: 'pointer'
                                      }}
                                      title={t('Click để đổi trạng thái')}
                                    >
                                      {task.status === 'done' ? 'Đã xong' : task.status === 'cancelled' ? 'Đã hủy' : 'Chưa xong'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickDuplicateTask(task.id);
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        borderRadius: '6px',
                                        color: 'var(--color-text-muted)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'color 0.15s ease'
                                      }}
                                      onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary)'}
                                      onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
                                      title={t('Nhân bản nhiệm vụ')}
                                    >
                                      <Copy size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickDeleteTask(task.id);
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        borderRadius: '6px',
                                        color: 'var(--color-text-muted)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'color 0.15s ease'
                                      }}
                                      onMouseEnter={e => e.currentTarget.style.color = 'var(--color-danger)'}
                                      onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
                                      title={t('Xóa nhiệm vụ')}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            {totalPages > 1 && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '1rem' }}>
                                <button
                                  type="button"
                                  disabled={projectTasksPage === 1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setProjectTasksPage(p => Math.max(1, p - 1));
                                  }}
                                  style={{
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-border-light)',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: projectTasksPage === 1 ? 'not-allowed' : 'pointer',
                                    opacity: projectTasksPage === 1 ? 0.5 : 1,
                                    color: 'var(--color-text)'
                                  }}
                                >
                                  Trước
                                </button>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                  Trang {projectTasksPage} / {totalPages}
                                </span>
                                <button
                                  type="button"
                                  disabled={projectTasksPage === totalPages}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setProjectTasksPage(p => Math.min(totalPages, p + 1));
                                  }}
                                  style={{
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-border-light)',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: projectTasksPage === totalPages ? 'not-allowed' : 'pointer',
                                    opacity: projectTasksPage === totalPages ? 0.5 : 1,
                                    color: 'var(--color-text)'
                                  }}
                                >
                                  Sau
                                </button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </>
        )}

        {projectDrawerTab === 'hierarchy' && renderProjectHierarchy()}

        {projectDrawerTab === 'gantt' && editingProject?.id && (
          <Suspense fallback={<Skeleton style={{ height: 320, borderRadius: 16 }} />}>
            <ProjectGanttTab projectId={editingProject.id} />
          </Suspense>
        )}

        {projectDrawerTab === 'changelog' && (
          /* Changelog Tab View */
          <div style={{
            background: 'var(--color-surface, #FFFFFF)',
            border: '1px solid var(--color-border-light, #E2E8F0)',
            borderRadius: '16px',
            padding: '1.5rem',
            minHeight: '300px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '3px', height: '14px', background: '#BD1D2D', borderRadius: '1.5px', flexShrink: 0 }} />
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lịch sử hoạt động của Chương trình</h4>
            </div>

            {statsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <RefreshCw className="spin" size={24} color="var(--color-text-muted)" />
              </div>
            ) : ensureArray(projectStats?.logs).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                Chưa có nhật ký hoạt động nào cho chương trình này.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingLeft: '8px' }}>
                {ensureArray(projectStats?.logs).map((log: any, idx: number, arr: any[]) => (
                  <div key={log.id || idx} style={{ display: 'flex', gap: '14px', position: 'relative', alignItems: 'flex-start' }}>
                    {idx !== arr.length - 1 && (
                      <div style={{ position: 'absolute', top: '28px', left: '14px', bottom: '-20px', width: '2px', background: 'var(--color-border-light)' }} />
                    )}
                    <div style={{ flexShrink: 0, position: 'relative', zIndex: 1 }}>
                      <Avatar
                        name={log.user_name || 'Hệ thống'}
                        src={log.avatar_url ? resolveAttachmentUrl(log.avatar_url) : undefined}
                        size={28}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.85rem', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, color: 'var(--color-text)' }}>{log.user_name || 'Hệ thống'}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                          {formatDateTimeVN(log.created_at)}
                        </span>
                      </div>
                      <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                        {log.new_data || log.action}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderLecturersTab = () => {
    const {
      lecturerStats,
      assignedSubjects,
      assignmentRate,
      totalSessions,
      totalSeminars,
      topLecturer
    } = lecturerStatsSummary;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
        {/* Banner thống kê giảng viên (Ch.V Brand Red & Slate DNA) */}
        <ProjectLecturerStatsKpiStrip
          lecturerCount={lecturerStats.length}
          assignedSubjects={assignedSubjects}
          subjectsCount={subjects.length}
          assignmentRate={assignmentRate}
          totalSessions={totalSessions}
          totalSeminars={totalSeminars}
          topLecturerName={topLecturer ? topLecturer.name : null}
          topLecturerClassesCount={topLecturer ? topLecturer.totalClassesCount : 0}
        />

        {/* Bảng Giảng viên */}
        <div style={{ background: 'var(--color-surface, #FFFFFF)', border: '1px solid var(--color-border-light, #E2E8F0)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
          {lecturerStats.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <Users size={36} style={{ color: 'var(--color-text-light)', marginBottom: '0.5rem', opacity: 0.5 }} />
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Chưa phân công giảng viên nào cho các môn học/chuyên đề</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-light)', borderBottom: '1px solid var(--color-border-light)' }}>
                    <th style={{ padding: '10px 16px', fontWeight: 750, color: 'var(--color-text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Giảng viên</th>
                    <th style={{ padding: '10px 16px', fontWeight: 750, color: 'var(--color-text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', textAlign: 'center' }}>Số môn phụ trách</th>
                    <th style={{ padding: '10px 16px', fontWeight: 750, color: 'var(--color-text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', textAlign: 'center' }}>Số buổi trường</th>
                    <th style={{ padding: '10px 16px', fontWeight: 750, color: 'var(--color-text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', textAlign: 'center' }}>Số chuyên đề</th>
                    <th style={{ padding: '10px 16px', fontWeight: 750, color: 'var(--color-text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', textAlign: 'center' }}>Tổng buổi dạy</th>
                  </tr>
                </thead>
                <tbody>
                  {lecturerStats.map((lect, idx) => {
                    const foundComp = companiesList.find(c => String(c.id) === String(lect.id));
                    const isClickable = Boolean(foundComp || lect.type === 'internal');
                    return (
                      <tr
                        key={lect.id}
                        onClick={(e) => {
                          if (foundComp) {
                            setSelectedLecturerEntity(foundComp);
                            setIsLecturerDrawerOpen(true);
                          } else if (lect.type === 'internal') {
                            showUserCard(e, lect.name);
                          }
                        }}
                        style={{
                          borderBottom: idx < lecturerStats.length - 1 ? '1px solid var(--color-border-light)' : 'none',
                          transition: 'background 0.2s ease',
                          cursor: isClickable ? 'pointer' : 'default'
                        }}
                        onMouseEnter={e => { if (isClickable) e.currentTarget.style.background = 'rgba(100, 116, 139, 0.04)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {/* Tên & Avatar & Loại GV */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Avatar name={lect.name} src={lect.avatar ? resolveAttachmentUrl(lect.avatar) : undefined} size={32} />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 800, color: 'var(--color-text)', fontSize: '0.825rem' }}>{lect.name}</span>
                                {lect.type === 'internal' ? (
                                  <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: '6px', fontWeight: 700, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', border: '1px solid rgba(189, 29, 45, 0.16)' }}>
                                    Cơ hữu
                                  </span>
                                ) : lect.type === 'external' ? (
                                  <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: '6px', fontWeight: 700, background: 'rgba(15, 23, 42, 0.06)', color: '#334155', border: '1px solid rgba(15, 23, 42, 0.12)' }}>
                                    Thỉnh giảng
                                  </span>
                                ) : null}
                              </div>
                              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-light)', marginTop: '2px' }}>
                                {lect.email || 'Không có email'} {lect.phone && `• ${lect.phone}`}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Số môn phụ trách */}
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text)' }}>
                          <span style={{ background: 'var(--color-bg-light)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--color-border-light)', fontSize: '0.72rem' }}>
                            {lect.subjectsCount} môn
                          </span>
                        </td>

                        {/* Số buổi trường */}
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text)' }}>
                          <span style={{ background: 'var(--color-bg-light)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--color-border-light)', fontSize: '0.72rem' }}>
                            {lect.sessionsCount} buổi
                          </span>
                        </td>

                        {/* Số chuyên đề */}
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text)' }}>
                          <span style={{ background: 'var(--color-bg-light)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--color-border-light)', fontSize: '0.72rem' }}>
                            {lect.seminarsCount} chuyên đề
                          </span>
                        </td>

                        {/* Tổng buổi dạy */}
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 750, color: '#BD1D2D' }}>
                          <span style={{ background: 'rgba(189, 29, 45, 0.06)', padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(189, 29, 45, 0.16)', fontSize: '0.75rem' }}>
                            {lect.totalClassesCount} buổi
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSubjectsTab = () => {
    const canEdit = canConfigureAcademic;

    const handleAddSubject = () => {
      const newSub = {
        id: makeUniqueId('sub'),
        code: '',
        name: '',
        duration_weeks: 5,
        lecturer_id: '',
        host_sessions: [],
        seminars: [],
        assignments: [],
        zoom_link: '',
        zoom_id: '',
        zoom_pass: ''
      };
      setSubjects(prev => [...ensureArray<any>(prev), newSub]);
    };

    const handleRemoveSubject = (id: string) => {
      setSubjects(prev => ensureArray<any>(prev).filter(s => s.id !== id));
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '3px', height: '14px', background: '#BD1D2D', borderRadius: '1.5px' }} />
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cấu hình Môn học &amp; Lịch giảng dạy</h4>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {copiedSubject && (
                <button
                  type="button"
                  className="btn outline sm"
                  style={{ borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-primary)' }}
                  onClick={() => {
                    const newSub = {
                      ...copiedSubject,
                      id: makeUniqueId('sub'),
                      host_sessions: ensureArray(copiedSubject.host_sessions).map((s: any) => ({ ...s, id: makeUniqueId('session') })),
                      seminars: ensureArray(copiedSubject.seminars).map((s: any) => ({ ...s, id: makeUniqueId('sem') })),
                      assignments: ensureArray(copiedSubject.assignments).map((a: any) => ({ ...a, id: makeUniqueId('asm') }))
                    };
                    setSubjects(prev => [...ensureArray<any>(prev), newSub]);
                    addToast('Đã dán cấu hình môn học thành công!', 'success');
                  }}
                >
                  <Plus size={14} /> Dán môn học
                </button>
              )}
              <button
                type="button"
                className="btn outline sm"
                style={{ borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-primary)' }}
                onClick={handleAddSubject}
              >
                <Plus size={14} /> Thêm môn học
              </button>
              <button
                type="button"
                className="btn primary sm"
                disabled={isSaving}
                onClick={async () => {
                  if (!editingCampaign?.id || isSaving || saveSubjectsConfigInFlightRef.current) return;
                  saveSubjectsConfigInFlightRef.current = true;
                  try {
                    setIsSaving(true);
                    const serializedSubjects = JSON.stringify(subjects);
                    const res = await fetchAPI(`campaigns/${editingCampaign.id}`, {
                      method: 'PUT',
                      body: JSON.stringify({
                        subjects_json: serializedSubjects
                      })
                    });
                    if (res?.success) {
                      addToast('Cập nhật cấu hình môn học thành công!', 'success');
                      setEditingCampaign((prev: any) => (prev ? { ...prev, subjects_json: serializedSubjects } : prev));
                      loadCampaigns(true);
                    } else {
                      addToast(res?.message || 'Lỗi lưu thông tin', 'error');
                    }
                  } catch (e: any) {
                    addToast(e?.message || 'Lỗi kết nối', 'error');
                  } finally {
                    saveSubjectsConfigInFlightRef.current = false;
                    setIsSaving(false);
                  }
                }}
                style={{ borderRadius: '100px', fontWeight: 700, background: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
              >
                <Save size={14} /> {isSaving ? 'Đang lưu...' : 'Lưu cấu hình môn học'}
              </button>
            </div>
          )}
        </div>

        {subjects.length === 0 ? (
          <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: '16px' }}>
            <BookOpen size={40} style={{ color: 'var(--color-text-light)', marginBottom: '12px' }} />
            <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Chưa có môn học nào được cấu hình cho khóa này.</div>
            {canEdit && (
              <button type="button" className="btn secondary sm" style={{ marginTop: '14px', borderRadius: '100px' }} onClick={handleAddSubject}>
                + Bắt đầu cấu hình
              </button>
            )}
          </div>
        ) : (
          <div style={{
            background: 'var(--color-surface, #FFFFFF)',
            border: '1px solid var(--color-border-light, #E2E8F0)',
            borderRadius: '16px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            overflow: 'hidden',
            width: '100%'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-light)', borderBottom: '1px solid var(--color-border-light)' }}>
                  <th style={{ padding: 0, width: '30%' }}>
                    <div style={{ padding: '6px 16px', fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Môn học</div>
                  </th>
                  <th style={{ padding: 0, width: '18%' }}>
                    <div style={{ padding: '6px 16px', fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Giảng viên chính</div>
                  </th>
                  <th style={{ padding: 0, width: '22%' }}>
                    <div style={{ padding: '6px 16px', fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thời lượng / Bài tập</div>
                  </th>
                  <th style={{ padding: 0, width: '15%' }}>
                    <div style={{ padding: '6px 16px', fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trạng thái</div>
                  </th>
                  <th style={{ padding: 0, width: '15%', textAlign: 'right' }}>
                    <div style={{ padding: '6px 16px', fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Hành động</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((sub) => {
                  const sessionCount = ensureArray(sub.host_sessions).length;
                  const seminarCount = ensureArray(sub.seminars).length;
                  const assignmentCount = ensureArray(sub.assignments).length;

                  const lecturerId = sub.lecturer_id;
                  const foundComp = companiesList.find(c => String(c.id) === String(lecturerId));
                  const lecturerInfo = resolveLecturerInfo(lecturerId);
                  const lecturerName = lecturerInfo ? lecturerInfo.name : 'Chưa phân công';
                  const avatarUrl = lecturerInfo?.avatar ? resolveAttachmentUrl(lecturerInfo.avatar) : '';

                  const statusObj = subjectStatsSummary.statusMap[sub.id] || getSubjectStatus(sub, editingCampaign?.start_date, editingCampaign?.end_date);

                  return (
                    <tr
                      key={sub.id}
                      style={{
                        borderBottom: '1px solid var(--color-border-light)',
                        transition: 'background 0.2s ease',
                        cursor: 'pointer'
                      }}
                      className="hover-bg-light"
                      onClick={() => setConfiguringSubjectId(sub.id)}
                    >
                      {/* Cột 1: Mã môn học & Tên môn học */}
                      <td style={{ padding: 0, verticalAlign: 'middle' }}>
                        <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--color-primary)', background: 'var(--color-primary-light)', padding: '2px 8px', borderRadius: '100px', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                            {sub.code || 'MÃ MÔN'}
                          </span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 750, color: 'var(--color-text)' }}>
                            {sub.name || 'Tên môn học chưa đặt'}
                          </span>
                        </div>
                      </td>

                      {/* Cột 2: Giảng viên phụ trách */}
                      <td style={{ padding: 0, verticalAlign: 'middle' }}>
                        <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center' }}>
                          {!lecturerId ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Users size={12} /> Chưa phân công
                            </span>
                          ) : (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                if (foundComp) {
                                  setSelectedLecturerEntity(foundComp);
                                  setIsLecturerDrawerOpen(true);
                                } else if (lecturerInfo?.type === 'internal') {
                                  showUserCard(e, lecturerInfo.name);
                                }
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: (foundComp || lecturerInfo?.type === 'internal') ? 'pointer' : 'default',
                                padding: '3px 8px',
                                background: (foundComp || lecturerInfo?.type === 'internal') ? 'var(--color-bg-light)' : 'transparent',
                                borderRadius: '12px',
                                border: (foundComp || lecturerInfo?.type === 'internal') ? '1px solid var(--color-border-light)' : 'none',
                                maxWidth: '180px'
                              }}
                              className={(foundComp || lecturerInfo?.type === 'internal') ? 'hover-lift' : ''}
                            >
                              <Avatar name={lecturerName} src={avatarUrl || undefined} size={18} />
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lecturerName}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Cột 3: Thống kê buổi học */}
                      <td style={{ padding: 0, verticalAlign: 'middle' }}>
                        <div style={{ padding: '8px 16px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', background: 'var(--color-bg-light)', padding: '3px 8px', borderRadius: '6px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                            <Calendar size={11} /> {sessionCount} buổi
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', background: 'var(--color-bg-light)', padding: '3px 8px', borderRadius: '6px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                            <Layers size={11} /> {seminarCount} đề
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', background: 'var(--color-bg-light)', padding: '3px 8px', borderRadius: '6px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                            <CheckSquare size={11} /> {assignmentCount} bài
                          </span>
                        </div>
                      </td>

                      {/* Cột 3.5: Trạng thái môn học */}
                      <td style={{ padding: 0, verticalAlign: 'middle' }}>
                        <div style={{ padding: '8px 16px' }}>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 750,
                            color: statusObj.color,
                            background: statusObj.bg,
                            padding: '4px 10px',
                            borderRadius: '100px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em',
                            display: 'inline-block',
                            border: `1px solid ${statusObj.color}22`
                          }}>
                            {statusObj.label}
                          </span>
                        </div>
                      </td>

                      {/* Cột 4: Nút hành động */}
                      <td style={{ padding: 0, verticalAlign: 'middle', textAlign: 'right' }}>
                        <div
                          style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="btn outline sm"
                            style={{
                              borderRadius: '8px',
                              height: '30px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '0 10px',
                              background: 'rgba(189, 29, 45, 0.08)',
                              color: '#BD1D2D',
                              border: '1px solid rgba(189, 29, 45, 0.22)'
                            }}
                            onClick={() => setAnnouncingSubject(sub)}
                            title="Gửi Thông báo Chuyên đề / Lịch học môn (Tự động điền thông tin môn học)"
                          >
                            <Send size={12} /> Gửi TBCĐ
                          </button>
                          <button
                            type="button"
                            className="btn primary sm"
                            style={{ borderRadius: '8px', height: '30px', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', padding: '0 10px' }}
                            onClick={() => setConfiguringSubjectId(sub.id)}
                          >
                            <Settings size={12} /> Cài đặt
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              className="btn outline sm"
                              style={{ borderRadius: '8px', height: '30px', width: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border)' }}
                              onClick={() => {
                                setSubjectToCopy(sub);
                                setCopyTargetCampaignId('');
                                setCopyConflictMode('replace');
                                setIsCopySubjectModalOpen(true);
                              }}
                              title="Sao chép môn học sang khóa khác..."
                            >
                              <Copy size={12} />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSubject(sub.id)}
                              style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Xóa môn học"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderThesisTab = () => {
    const canEdit = canConfigureAcademic;

    const handleAddMilestone = () => {
      const newMs = {
        id: makeUniqueId('ms'),
        milestone: '',
        due_date: ''
      };
      setThesisMilestones(prev => [...ensureArray<any>(prev), newMs]);
    };

    const handleUpdateMilestone = (id: string, fields: any) => {
      setThesisMilestones(prev => ensureArray<any>(prev).map(m => m.id === id ? { ...m, ...fields } : m));
    };

    const handleRemoveMilestone = (id: string) => {
      setThesisMilestones(prev => ensureArray<any>(prev).filter(m => m.id !== id));
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '3px', height: '14px', background: '#BD1D2D', borderRadius: '1.5px' }} />
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cột mốc luận văn (Thesis Milestones)</h4>
          </div>
          {canEdit && (
            <button type="button" className="btn primary sm" style={{ borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700 }} onClick={handleAddMilestone}>
              <Plus size={14} /> Thêm cột mốc
            </button>
          )}
        </div>

        {thesisMilestones.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: '16px' }}>
            <FileText size={32} style={{ color: 'var(--color-text-light)', marginBottom: '8px' }} />
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Chưa cấu hình cột mốc luận văn nào cho khóa này.</div>
            {canEdit && (
              <button type="button" className="btn secondary sm" style={{ marginTop: '10px', borderRadius: '100px' }} onClick={handleAddMilestone}>
                + Bắt đầu cấu hình
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--color-surface, #FFFFFF)', border: '1px solid var(--color-border-light, #E2E8F0)', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
            {thesisMilestones.map((ms, idx) => (
              <div key={ms.id || idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: idx < thesisMilestones.length - 1 ? '1px solid var(--color-border-light)' : 'none', paddingBottom: idx < thesisMilestones.length - 1 ? '0.75rem' : '0' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', width: '24px' }}>#{idx + 1}</span>
                <input
                  type="text"
                  placeholder="Tên cột mốc (ví dụ: Nộp đề cương chi tiết...)"
                  className="form-input"
                  disabled={!canEdit}
                  value={ms.milestone || ''}
                  onChange={e => handleUpdateMilestone(ms.id, { milestone: e.target.value })}
                  style={{ flex: 2, height: '36px', fontSize: '0.85rem' }}
                />
                <div style={{ flex: 1 }}>
                  <VietnameseDateInput
                    disabled={!canEdit}
                    value={ms.due_date || ''}
                    onChange={val => handleUpdateMilestone(ms.id, { due_date: val })}
                    size="sm"
                    inputStyle={{ height: '36px', fontSize: '0.85rem' }}
                  />
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMilestone(ms.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '6px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit && thesisMilestones.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border-light)', paddingTop: '1rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn primary sm"
              disabled={isSaving}
              onClick={async () => {
                if (!editingCampaign?.id || isSaving || saveThesisMilestonesInFlightRef.current) return;
                saveThesisMilestonesInFlightRef.current = true;
                try {
                  setIsSaving(true);
                  const serializedMilestones = JSON.stringify(thesisMilestones);
                  const res = await fetchAPI(`campaigns/${editingCampaign.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                      thesis_milestones_json: serializedMilestones
                    })
                  });
                  if (res?.success) {
                    addToast('Cập nhật cột mốc luận văn thành công!', 'success');
                    setEditingCampaign((prev: any) => (prev ? { ...prev, thesis_milestones_json: serializedMilestones } : prev));
                    loadCampaigns(true);
                  } else {
                    addToast(res?.message || 'Lỗi lưu thông tin', 'error');
                  }
                } catch (e: any) {
                  addToast(e?.message || 'Lỗi kết nối', 'error');
                } finally {
                  saveThesisMilestonesInFlightRef.current = false;
                  setIsSaving(false);
                }
              }}
              style={{ borderRadius: '100px', fontWeight: 700 }}
            >
              {isSaving ? 'Đang lưu...' : 'Lưu cột mốc luận văn'}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderRemindersTab = () => {
    const canEdit = canConfigureAcademic;

    const handleSaveReminders = async () => {
      if (!editingCampaign?.id || isSaving || saveRemindersInFlightRef.current) return;
      saveRemindersInFlightRef.current = true;
      try {
        setIsSaving(true);
        const serializedReminders = JSON.stringify(remindersConfig);
        const res = await fetchAPI(`campaigns/${editingCampaign.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            reminders_json: serializedReminders
          })
        });
        if (res?.success) {
          addToast('Cập nhật cài đặt nhắc nhở thành công!', 'success');
          setEditingCampaign((prev: any) => (prev ? { ...prev, reminders_json: serializedReminders } : prev));
          loadCampaigns(true);
        } else {
          addToast(res?.message || 'Lỗi lưu cấu hình', 'error');
        }
      } catch (e: any) {
        addToast(e?.message || 'Lỗi kết nối', 'error');
      } finally {
        saveRemindersInFlightRef.current = false;
        setIsSaving(false);
      }
    };

    const clampHours = (val: string) => Math.min(168, Math.max(1, parseInt(val, 10) || 1));
    const clampMinutes = (val: string) => Math.min(60, Math.max(1, parseInt(val, 10) || 1));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{
          background: 'var(--color-surface, #FFFFFF)',
          border: '1px solid var(--color-border-light, #E2E8F0)',
          borderRadius: '16px',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem'
        }}>
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-text)' }}>Cài đặt nhắc nhở lịch học & bài tập</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>Cấu hình thời gian gửi thông báo nhắc nhở lịch học và bài tập tự động cho học viên.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* School Reminder Card */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              background: 'var(--color-bg-light)',
              border: '1px solid var(--color-border-light)',
              borderRadius: '12px',
              gap: '1.5rem',
              flexWrap: 'wrap'
            }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)' }}>Nhắc nhở lịch học với trường</span>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>Trường học</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Gửi thông báo nhắc nhở trước khi buổi học chính thức tại trường diễn ra.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Nhắc trước:</span>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    className="form-input"
                    disabled={!canEdit || !remindersConfig.school_reminder_enabled}
                    value={remindersConfig.school_reminder_hours}
                    onChange={e => setRemindersConfig(prev => ({ ...prev, school_reminder_hours: clampHours(e.target.value) }))}
                    style={{ width: '70px', height: '36px', textAlign: 'center', padding: '0 4px', fontSize: '0.85rem' }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>giờ</span>
                </div>
                <label className="switch" style={{ display: 'inline-block', width: '40px', height: '22px', position: 'relative' }}>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={remindersConfig.school_reminder_enabled}
                    onChange={e => setRemindersConfig(prev => ({ ...prev, school_reminder_enabled: e.target.checked }))}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span className="slider round" style={{
                    position: 'absolute', cursor: canEdit ? 'pointer' : 'not-allowed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: remindersConfig.school_reminder_enabled ? 'var(--color-primary)' : '#ccc',
                    transition: '0.4s', borderRadius: '34px'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '16px', width: '16px', left: remindersConfig.school_reminder_enabled ? '20px' : '4px', bottom: '3px',
                      backgroundColor: 'white', transition: '0.4s', borderRadius: '50%'
                    }} />
                  </span>
                </label>
              </div>
            </div>

            {/* IDEAS Reminder Card */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              background: 'var(--color-bg-light)',
              border: '1px solid var(--color-border-light)',
              borderRadius: '12px',
              gap: '1.5rem',
              flexWrap: 'wrap'
            }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)' }}>Nhắc nhở lịch học với IDEAS</span>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>IDEAS</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Gửi thông báo nhắc nhở trước khi các buổi học/thảo luận chuyên đề tại IDEAS bắt đầu.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Nhắc trước:</span>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    className="form-input"
                    disabled={!canEdit || !remindersConfig.ideas_reminder_enabled}
                    value={remindersConfig.ideas_reminder_hours}
                    onChange={e => setRemindersConfig(prev => ({ ...prev, ideas_reminder_hours: clampHours(e.target.value) }))}
                    style={{ width: '70px', height: '36px', textAlign: 'center', padding: '0 4px', fontSize: '0.85rem' }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>giờ</span>
                </div>
                <label className="switch" style={{ display: 'inline-block', width: '40px', height: '22px', position: 'relative' }}>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={remindersConfig.ideas_reminder_enabled}
                    onChange={e => setRemindersConfig(prev => ({ ...prev, ideas_reminder_enabled: e.target.checked }))}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span className="slider round" style={{
                    position: 'absolute', cursor: canEdit ? 'pointer' : 'not-allowed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: remindersConfig.ideas_reminder_enabled ? 'var(--color-primary)' : '#ccc',
                    transition: '0.4s', borderRadius: '34px'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '16px', width: '16px', left: remindersConfig.ideas_reminder_enabled ? '20px' : '4px', bottom: '3px',
                      backgroundColor: 'white', transition: '0.4s', borderRadius: '50%'
                    }} />
                  </span>
                </label>
              </div>
            </div>

            {/* Assignments Reminder Card */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              background: 'var(--color-bg-light)',
              border: '1px solid var(--color-border-light)',
              borderRadius: '12px',
              gap: '1.5rem',
              flexWrap: 'wrap'
            }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)' }}>Nhắc nhở nộp bài tập / Quiz</span>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>Bài tập</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Gửi thông báo nhắc nhở trước khi đến hạn chót (Deadline) nộp bài tập, bài luận hoặc quiz.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Nhắc trước:</span>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    className="form-input"
                    disabled={!canEdit || !remindersConfig.assignment_reminder_enabled}
                    value={remindersConfig.assignment_reminder_hours}
                    onChange={e => setRemindersConfig(prev => ({ ...prev, assignment_reminder_hours: clampHours(e.target.value) }))}
                    style={{ width: '70px', height: '36px', textAlign: 'center', padding: '0 4px', fontSize: '0.85rem' }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>giờ</span>
                </div>
                <label className="switch" style={{ display: 'inline-block', width: '40px', height: '22px', position: 'relative' }}>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={remindersConfig.assignment_reminder_enabled}
                    onChange={e => setRemindersConfig(prev => ({ ...prev, assignment_reminder_enabled: e.target.checked }))}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span className="slider round" style={{
                    position: 'absolute', cursor: canEdit ? 'pointer' : 'not-allowed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: remindersConfig.assignment_reminder_enabled ? 'var(--color-primary)' : '#ccc',
                    transition: '0.4s', borderRadius: '34px'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '16px', width: '16px', left: remindersConfig.assignment_reminder_enabled ? '20px' : '4px', bottom: '3px',
                      backgroundColor: 'white', transition: '0.4s', borderRadius: '50%'
                    }} />
                  </span>
                </label>
              </div>
            </div>

            {/* Lecturer Reminder Card */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              background: 'var(--color-bg-light)',
              border: '1px solid var(--color-border-light)',
              borderRadius: '12px',
              gap: '1.5rem',
              flexWrap: 'wrap'
            }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)' }}>Nhắc nhở giảng viên lớp chuyên đề</span>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>Giảng viên</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Gửi thông báo nhắc nhở trước khi đến lịch giảng dạy lớp chuyên đề cho giảng viên.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Nhắc trước:</span>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    className="form-input"
                    disabled={!canEdit || !remindersConfig.lecturer_reminder_enabled}
                    value={remindersConfig.lecturer_reminder_hours}
                    onChange={e => setRemindersConfig(prev => ({ ...prev, lecturer_reminder_hours: clampHours(e.target.value) }))}
                    style={{ width: '70px', height: '36px', textAlign: 'center', padding: '0 4px', fontSize: '0.85rem' }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>giờ</span>
                </div>
                <label className="switch" style={{ display: 'inline-block', width: '40px', height: '22px', position: 'relative' }}>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={remindersConfig.lecturer_reminder_enabled}
                    onChange={e => setRemindersConfig(prev => ({ ...prev, lecturer_reminder_enabled: e.target.checked }))}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span className="slider round" style={{
                    position: 'absolute', cursor: canEdit ? 'pointer' : 'not-allowed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: remindersConfig.lecturer_reminder_enabled ? 'var(--color-primary)' : '#ccc',
                    transition: '0.4s', borderRadius: '34px'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '16px', width: '16px', left: remindersConfig.lecturer_reminder_enabled ? '20px' : '4px', bottom: '3px',
                      backgroundColor: 'white', transition: '0.4s', borderRadius: '50%'
                    }} />
                  </span>
                </label>
              </div>
            </div>

            {/* Thesis Reminder Card */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              background: 'var(--color-bg-light)',
              border: '1px solid var(--color-border-light)',
              borderRadius: '12px',
              gap: '1.5rem',
              flexWrap: 'wrap'
            }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)' }}>Nhắc nhở nộp luận văn</span>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>Luận văn</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Gửi thông báo nhắc nhở trước khi đến hạn chót (Deadline) nộp các cột mốc luận văn.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Nhắc trước:</span>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    className="form-input"
                    disabled={!canEdit || !remindersConfig.thesis_reminder_enabled}
                    value={remindersConfig.thesis_reminder_hours}
                    onChange={e => setRemindersConfig(prev => ({ ...prev, thesis_reminder_hours: clampHours(e.target.value) }))}
                    style={{ width: '70px', height: '36px', textAlign: 'center', padding: '0 4px', fontSize: '0.85rem' }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>giờ</span>
                </div>
                <label className="switch" style={{ display: 'inline-block', width: '40px', height: '22px', position: 'relative' }}>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={remindersConfig.thesis_reminder_enabled}
                    onChange={e => setRemindersConfig(prev => ({ ...prev, thesis_reminder_enabled: e.target.checked }))}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span className="slider round" style={{
                    position: 'absolute', cursor: canEdit ? 'pointer' : 'not-allowed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: remindersConfig.thesis_reminder_enabled ? 'var(--color-primary)' : '#ccc',
                    transition: '0.4s', borderRadius: '34px'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '16px', width: '16px', left: remindersConfig.thesis_reminder_enabled ? '20px' : '4px', bottom: '3px',
                      backgroundColor: 'white', transition: '0.4s', borderRadius: '50%'
                    }} />
                  </span>
                </label>
              </div>
            </div>

            {/* Upcoming Session Reminder Card */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              background: 'var(--color-bg-light)',
              border: '1px solid var(--color-border-light)',
              borderRadius: '12px',
              gap: '1.5rem',
              flexWrap: 'wrap'
            }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)' }}>Nhắc nhở lịch học sắp bắt đầu</span>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>Sắp diễn ra</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Gửi thông báo nhắc nhở trước khi buổi học bắt đầu vài phút (chỉ nhắc buổi đầu tiên trong ngày nếu có nhiều buổi).</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Nhắc trước:</span>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    className="form-input"
                    disabled={!canEdit || !(remindersConfig.upcoming_session_reminder_enabled ?? true)}
                    value={remindersConfig.upcoming_session_reminder_minutes ?? 5}
                    onChange={e => setRemindersConfig(prev => ({ ...prev, upcoming_session_reminder_minutes: clampMinutes(e.target.value) }))}
                    style={{ width: '70px', height: '36px', textAlign: 'center', padding: '0 4px', fontSize: '0.85rem' }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>phút</span>
                </div>
                <label className="switch" style={{ display: 'inline-block', width: '40px', height: '22px', position: 'relative' }}>
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={remindersConfig.upcoming_session_reminder_enabled ?? true}
                    onChange={e => setRemindersConfig(prev => ({ ...prev, upcoming_session_reminder_enabled: e.target.checked }))}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span className="slider round" style={{
                    position: 'absolute', cursor: canEdit ? 'pointer' : 'not-allowed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: (remindersConfig.upcoming_session_reminder_enabled ?? true) ? 'var(--color-primary)' : '#ccc',
                    transition: '0.4s', borderRadius: '34px'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '16px', width: '16px', left: (remindersConfig.upcoming_session_reminder_enabled ?? true) ? '20px' : '4px', bottom: '3px',
                      backgroundColor: 'white', transition: '0.4s', borderRadius: '50%'
                    }} />
                  </span>
                </label>
              </div>
            </div>
          </div>

          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border-light)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn primary sm"
                disabled={isSaving}
                onClick={handleSaveReminders}
                style={{ borderRadius: '100px', fontWeight: 700 }}
              >
                {isSaving ? 'Đang lưu...' : 'Lưu cấu hình nhắc nhở'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCampaignViewDrawer = () => {
    const campaignRevenue = Number(campaignStats?.actual_revenue ?? 0);
    const safeCampaignRefUrl = sanitizeExternalUrl(editingCampaign?.reference_url, { allowRelative: false, allowMailTel: false });
    const projectPool = allProjectsLookup.length > 0 ? allProjectsLookup : projects;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
        {/* Unified Tab Selectors (Non-wrapping + overflow dropdown on mobile) */}
        <div style={{ marginBottom: '0.25rem' }}>
          <ResponsiveSegmentedTabs
            tabs={[
              { id: 'details', label: 'Thông tin chung', mobileLabel: 'Thông tin', icon: <Info size={14} /> },
              { id: 'subjects', label: 'Môn học & Lịch học', mobileLabel: 'Môn & Lịch', icon: <BookOpen size={14} /> },
              { id: 'lecturers', label: 'Đội ngũ giảng viên', mobileLabel: 'Giảng viên', icon: <Users size={14} /> },
              { id: 'thesis', label: 'Cột mốc luận văn', mobileLabel: 'Luận văn', icon: <FileText size={14} /> },
              { id: 'reminders', label: 'Cài đặt nhắc nhở', mobileLabel: 'Nhắc nhở', icon: <Settings size={14} /> },
              { id: 'changelog', label: 'Lịch sử hoạt động', mobileLabel: 'Lịch sử', icon: <History size={14} /> },
            ]}
            activeId={campaignDrawerTab}
            onChange={(id) => setCampaignDrawerTab(id as any)}
            mobileMaxVisible={2}
            tabletMaxVisible={4}
            desktopMaxVisible={6}
            fullWidthOnMobile
          />
        </div>

        {campaignDrawerTab === 'details' && (
          <>
            {/* KPI Summary Cards (Ch.V Brand Red #BD1D2D & Slate #0F172A DNA) */}
            {campaignStats && (
              <CampaignDetailsKpiStrip
                campaignStats={campaignStats}
                subjectsCount={subjects.length}
                activeSubjectsCount={subjectStatsSummary.active}
                endedSubjectsCount={subjectStatsSummary.ended}
                notStartedSubjectsCount={subjectStatsSummary.notStarted}
                totalSessions={lecturerStatsSummary.totalSessions}
                totalSeminars={lecturerStatsSummary.totalSeminars}
                campaignRevenue={campaignRevenue}
                canDrilldown={canDrilldownExec}
                onDrilldown={handleOpenCampaignContacts}
              />
            )}

            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1.5rem', alignItems: 'start' }}>
              {/* Left Column (3/5) */}
              <div style={{ flex: 3, width: isMobile ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                {/* Section 1: Thông tin cơ bản */}
                <div style={{
                  background: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '3px', height: '14px', background: '#334155', borderRadius: '1.5px', flexShrink: 0 }} />
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thông tin cơ bản</h4>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.25rem' }}>
                    <div>
                      <span style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', fontWeight: 750, display: 'block', marginBottom: '4px' }}>Tên chiến dịch</span>
                      <span style={{ color: 'var(--color-text)', fontSize: '0.925rem', fontWeight: 700, display: 'block' }}>{editingCampaign?.name}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', fontWeight: 750, display: 'block', marginBottom: '4px' }}>Trạng thái hoạt động</span>
                      <span
                        className={`badge ${editingCampaign?.status === 'active' ? 'success' : 'secondary'}`}
                        style={{ fontSize: '0.75rem', padding: '5px 10px', borderRadius: '100px', fontWeight: 700, display: 'inline-block', marginTop: '2px' }}
                      >
                        {editingCampaign?.status === 'active' ? 'Hoạt động' : 'Tạm dừng'}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', fontWeight: 750, display: 'block', marginBottom: '4px' }}>Ngày bắt đầu</span>
                      <span style={{ color: 'var(--color-text)', fontSize: '0.875rem', fontWeight: 600, display: 'block' }}>{editingCampaign?.start_date ? formatDateVN(editingCampaign.start_date) : 'Chưa thiết lập'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', fontWeight: 750, display: 'block', marginBottom: '4px' }}>Ngày kết thúc</span>
                      <span style={{ color: 'var(--color-text)', fontSize: '0.875rem', fontWeight: 600, display: 'block' }}>{editingCampaign?.end_date ? formatDateVN(editingCampaign.end_date) : 'Chưa thiết lập'}</span>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', fontWeight: 750, display: 'block', marginBottom: '4px' }}>Đường dẫn Folder</span>
                      <div style={{ marginTop: '4px' }}>
                        {renderFolderPathLink(editingCampaign?.folder_path, editingCampaign?.project_id)}
                      </div>
                    </div>
                    {safeCampaignRefUrl && (
                      <div style={{ gridColumn: 'span 2', marginTop: '4px', borderTop: '1px dotted var(--color-border-light)', paddingTop: '8px' }}>
                        <span style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', fontWeight: 750, display: 'block', marginBottom: '4px' }}>Website / Link tham khảo</span>
                        <a
                          href={safeCampaignRefUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: '#BD1D2D',
                            textDecoration: 'none',
                            fontWeight: 700,
                            fontSize: '0.875rem'
                          }}
                        >
                          {safeCampaignRefUrl.includes('docs.google.com/spreadsheets') || safeCampaignRefUrl.includes('google.com/sheets') ? (
                            <>
                              <FileSpreadsheet size={16} color="#BD1D2D" />
                              <span>Bảng tính Google Sheets</span>
                            </>
                          ) : (
                            <>
                              <Link2 size={16} />
                              <span>Mở liên kết tham khảo</span>
                            </>
                          )}
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3: Mô tả chiến dịch */}
                <div style={{
                  background: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <span style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', fontWeight: 750, display: 'block' }}>Mô tả chiến dịch</span>
                  <p style={{ color: 'var(--color-text)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: '0.875rem' }}>
                    {editingCampaign?.description || 'Không có mô tả chi tiết'}
                  </p>
                </div>

              </div>

              {/* Right Column (2/5) */}
              <div style={{ flex: 2, width: isMobile ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                {/* Cột mốc & Tiến độ Khóa học (Right panel) */}
                <div style={{
                  background: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '3px', height: '14px', background: '#BD1D2D', borderRadius: '1.5px', flexShrink: 0 }} />
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tiến độ &amp; Cột mốc</h4>
                  </div>

                  {/* Time Progress Bar */}
                  {(() => {
                    const today = new Date();
                    const startStr = editingCampaign?.start_date;
                    const endStr = editingCampaign?.end_date;
                    if (!startStr && !endStr) {
                      return (
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                          Chưa thiết lập thời gian bắt đầu & kết thúc.
                        </div>
                      );
                    }

                    const start = startStr ? new Date(startStr) : null;
                    const end = endStr ? new Date(endStr) : null;

                    let percent = 0;
                    if (start && end) {
                      const totalTime = end.getTime() - start.getTime();
                      if (totalTime > 0) {
                        const elapsed = today.getTime() - start.getTime();
                        percent = Math.max(0, Math.min(100, Math.round((elapsed / totalTime) * 100)));
                      }
                    } else if (start && today >= start) {
                      percent = 50;
                    }

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                            Tiến độ thời gian: <strong style={{ color: '#BD1D2D' }}>{percent}%</strong>
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-light)', fontWeight: 600 }}>
                            {percent === 100 ? 'Đã hoàn thành' : 'Đang diễn ra'}
                          </span>
                        </div>
                        <div style={{
                          width: '100%',
                          height: '6px',
                          borderRadius: '3px',
                          background: 'var(--color-border-light)',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${percent}%`,
                            height: '100%',
                            background: percent === 100 ? 'var(--color-success)' : '#BD1D2D',
                            borderRadius: '3px',
                            transition: 'width 0.4s cubic-bezier(0.22, 1, 0.36, 1)'
                          }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--color-text-light)', marginTop: '2px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          <span>Bắt đầu: {startStr ? formatDateVN(startStr) : 'N/A'}</span>
                          <span>Kết thúc: {endStr ? formatDateVN(endStr) : 'N/A'}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Thesis Milestones List */}
                  <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Các cột mốc học vụ
                    </span>
                    {(() => {
                      const miles = safeParseArray<any>(editingCampaign?.thesis_milestones_json);

                      if (miles.length === 0) {
                        return (
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', padding: '6px 8px' }}>
                            Chưa có cột mốc học vụ/luận văn nào được thiết lập.
                          </div>
                        );
                      }

                      const todayStr = getLocalDateStr();
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {miles.map((m: any, mIdx: number) => {
                            const isOverdue = Boolean(m?.due_date && String(m.due_date) < todayStr);
                            return (
                              <div key={m.id || mIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'var(--color-bg-light)', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--color-border-light)' }}>
                                <div style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  background: isOverdue ? 'var(--color-danger)' : 'var(--color-success)',
                                  marginTop: '5px',
                                  flexShrink: 0
                                }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text)' }}>{m.milestone}</span>
                                  <span style={{ fontSize: '0.72rem', color: isOverdue ? 'var(--color-danger)' : 'var(--color-text-light)', fontWeight: 650 }}>
                                    Hạn nộp: {m.due_date ? formatDateVN(m.due_date) : 'Chưa đặt'} {isOverdue && '(Quá hạn)'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Section 2: Chương trình & Nhân sự phụ trách */}
                <div style={{
                  background: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '3px', height: '14px', background: '#334155', borderRadius: '1.5px', flexShrink: 0 }} />
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chương trình liên kết</h4>
                  </div>

                  {(() => {
                    const associatedProjs = editingCampaign?.project_id
                      ? projectPool.filter(p => Number(p.id) === Number(editingCampaign.project_id))
                      : projectPool.filter(p => {
                        const campIds = p.campaign_ids ? String(p.campaign_ids).split(',').map((id: string) => id.trim()) : [];
                        return campIds.includes(editingCampaign?.name);
                      });

                    if (associatedProjs.length === 0) {
                      return (
                        <div style={{ padding: '1rem', background: 'var(--color-bg-light)', border: '1px dashed var(--color-border)', borderRadius: '12px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                          Chưa liên kết chương trình nào
                        </div>
                      );
                    }

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {associatedProjs.map(proj => {
                          return (
                            <div key={proj.id} style={{ border: '1px solid var(--color-border-light)', borderRadius: '12px', padding: '1rem', background: 'var(--color-bg-light)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span
                                  onClick={() => {
                                    setEditingProject(proj);
                                    setProjectModalMode('view');
                                    setIsCampaignModalOpen(false);
                                    setIsEditModalOpen(true);
                                  }}
                                  style={{ color: '#BD1D2D', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <Building2 size={14} /> {proj.name}
                                </span>
                                <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{proj.code}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Linked Tasks */}
                <div style={{
                  background: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <span style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', fontWeight: 750, display: 'block' }}>
                    Nhiệm vụ & Công việc liên kết ({linkedTasks.length})
                  </span>
                  {loadingLinkedTasks ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                      <RefreshCw className="spin" size={16} color="var(--color-text-muted)" />
                    </div>
                  ) : linkedTasks.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', padding: '10px 14px', background: 'var(--color-bg-light)', border: '1px dashed var(--color-border)', borderRadius: '10px' }}>
                      Chưa có công việc nào liên kết với chiến dịch này.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(() => {
                        const sortedTasks = [...ensureArray<any>(linkedTasks)].sort((a, b) => {
                          const weightA = TASK_PRIORITY_WEIGHT[a.priority] || 2;
                          const weightB = TASK_PRIORITY_WEIGHT[b.priority] || 2;
                          if (weightB !== weightA) {
                            return weightB - weightA;
                          }
                          if (a.due_date && b.due_date) {
                            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
                          }
                          if (a.due_date) return -1;
                          if (b.due_date) return 1;
                          return 0;
                        });

                        const totalPages = Math.ceil(sortedTasks.length / 10);
                        const startIndex = (campaignTasksPage - 1) * 10;
                        const paginatedTasks = sortedTasks.slice(startIndex, startIndex + 10);

                        return (
                          <>
                            {paginatedTasks.map(task => {
                              const statusColors: any = {
                                planned: { bg: 'rgba(245, 158, 11, 0.08)', text: 'var(--color-warning)' },
                                done: { bg: 'rgba(16, 185, 129, 0.08)', text: 'var(--color-success)' },
                                cancelled: { bg: 'rgba(239, 68, 68, 0.08)', text: 'var(--color-danger)' }
                              };
                              const sc = statusColors[task.status] || statusColors.planned;
                              const performer = users.find(u => Number(u.id) === Number(task.user_id));
                              const performerRoleLabel = performer ? getUserDisplayRoleOrTitle(performer) : '';
                              return (
                                <div
                                  key={task.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: 'var(--color-bg-light)',
                                    border: '1px solid var(--color-border-light)',
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.01)'
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = 'var(--color-primary-light)';
                                    e.currentTarget.style.background = 'var(--color-surface, #ffffff)';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(189, 29, 45, 0.06)';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = 'var(--color-border-light)';
                                    e.currentTarget.style.background = 'var(--color-bg-light)';
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.01)';
                                  }}
                                  onClick={() => handleOpenTask(task.id)}
                                  title={t('Click để xem chi tiết nhiệm vụ')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                    <div
                                      style={{ marginTop: '3px', cursor: 'pointer', padding: '2px', borderRadius: '4px' }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickToggleTaskStatus(task.id, task.status);
                                      }}
                                      title={task.status === 'done' ? t('Đánh dấu chưa xong') : t('Đánh dấu hoàn thành')}
                                    >
                                      <CheckSquare size={18} color={task.status === 'done' ? 'var(--color-success)' : 'var(--color-text-muted)'} style={{ opacity: 0.85 }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <span style={{ fontWeight: 650, color: 'var(--color-text)', fontSize: '0.9rem', lineHeight: '1.2' }}>{task.subject}</span>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Avatar
                                          src={performer?.avatar_url || performer?.avatar}
                                          name={performer?.full_name || performer?.name || 'Hệ thống'}
                                          size={18}
                                        />
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                                          {performer?.full_name || performer?.name || 'Hệ thống'}{performerRoleLabel ? ` (${performerRoleLabel})` : ''}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickToggleTaskStatus(task.id, task.status);
                                      }}
                                      style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        padding: '4px 10px',
                                        borderRadius: '100px',
                                        background: sc.bg,
                                        color: sc.text,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.03em',
                                        cursor: 'pointer'
                                      }}
                                      title={t('Click để đổi trạng thái')}
                                    >
                                      {task.status === 'done' ? 'Đã xong' : task.status === 'cancelled' ? 'Đã hủy' : 'Chưa xong'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickDuplicateTask(task.id);
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        borderRadius: '6px',
                                        color: 'var(--color-text-muted)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'color 0.15s ease'
                                      }}
                                      onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary)'}
                                      onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
                                      title={t('Nhân bản nhiệm vụ')}
                                    >
                                      <Copy size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickDeleteTask(task.id);
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        borderRadius: '6px',
                                        color: 'var(--color-text-muted)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'color 0.15s ease'
                                      }}
                                      onMouseEnter={e => e.currentTarget.style.color = 'var(--color-danger)'}
                                      onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
                                      title={t('Xóa nhiệm vụ')}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            {totalPages > 1 && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '1rem' }}>
                                <button
                                  type="button"
                                  disabled={campaignTasksPage === 1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCampaignTasksPage(p => Math.max(1, p - 1));
                                  }}
                                  style={{
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-border-light)',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: campaignTasksPage === 1 ? 'not-allowed' : 'pointer',
                                    opacity: campaignTasksPage === 1 ? 0.5 : 1,
                                    color: 'var(--color-text)'
                                  }}
                                >
                                  Trước
                                </button>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                  Trang {campaignTasksPage} / {totalPages}
                                </span>
                                <button
                                  type="button"
                                  disabled={campaignTasksPage === totalPages}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCampaignTasksPage(p => Math.min(totalPages, p + 1));
                                  }}
                                  style={{
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--color-border-light)',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: campaignTasksPage === totalPages ? 'not-allowed' : 'pointer',
                                    opacity: campaignTasksPage === totalPages ? 0.5 : 1,
                                    color: 'var(--color-text)'
                                  }}
                                >
                                  Sau
                                </button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Discussions/Comments at the very bottom */}
            {editingCampaign?.id && (
              <div style={{ marginTop: '1.25rem' }}>
                {renderEntityComments('campaign', editingCampaign.id)}
              </div>
            )}
          </>
        )}

        {campaignDrawerTab === 'subjects' && renderSubjectsTab()}

        {campaignDrawerTab === 'lecturers' && renderLecturersTab()}

        {campaignDrawerTab === 'thesis' && renderThesisTab()}

        {campaignDrawerTab === 'reminders' && renderRemindersTab()}

        {campaignDrawerTab === 'changelog' && (
          /* Changelog Tab View */
          <div style={{
            background: 'var(--color-surface, #FFFFFF)',
            border: '1px solid var(--color-border-light, #E2E8F0)',
            borderRadius: '16px',
            padding: '1.5rem',
            minHeight: '300px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '3px', height: '14px', background: '#BD1D2D', borderRadius: '1.5px', flexShrink: 0 }} />
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lịch sử hoạt động của Chiến dịch</h4>
            </div>

            {statsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <RefreshCw className="spin" size={24} color="var(--color-text-muted)" />
              </div>
            ) : ensureArray(campaignStats?.logs).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                Chưa có nhật ký hoạt động nào cho chiến dịch này.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingLeft: '8px' }}>
                {ensureArray(campaignStats?.logs).map((log: any, idx: number, arr: any[]) => (
                  <div key={log.id || idx} style={{ display: 'flex', gap: '14px', position: 'relative', alignItems: 'flex-start' }}>
                    {idx !== arr.length - 1 && (
                      <div style={{ position: 'absolute', top: '28px', left: '14px', bottom: '-20px', width: '2px', background: 'var(--color-border-light)' }} />
                    )}
                    <div style={{ flexShrink: 0, position: 'relative', zIndex: 1 }}>
                      <Avatar
                        name={log.user_name || 'Hệ thống'}
                        src={log.avatar_url ? resolveAttachmentUrl(log.avatar_url) : undefined}
                        size={28}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, color: 'var(--color-text)' }}>{log.user_name || 'Hệ thống'}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                          {formatDateTimeVN(log.created_at)}
                        </span>
                      </div>
                      <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.4, fontWeight: 550 }}>
                        {log.new_data || log.action}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const loadProjects = async (isSilent = false) => {
    projectsAbortRef.current?.abort();
    const controller = new AbortController();
    projectsAbortRef.current = controller;
    const { signal } = controller;

    const pageKey = `${cacheScopeKey}:${projectPage}:${projectPageSize}:${debouncedProjectSearch}:${projectStatusFilter}`;
    const cachedPage = projectsPageCache.projectsByPage.get(pageKey);
    if (cachedPage && !isSilent) {
      setProjects(cachedPage.items);
      setTotalProjects(cachedPage.total);
      setLoading(false);
    } else if (!isSilent && projects.length === 0) {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams();
      params.set('page', String(projectPage));
      params.set('limit', String(projectPageSize));
      if (debouncedProjectSearch) params.set('search', debouncedProjectSearch);
      if (projectStatusFilter === 'archived') {
        params.set('status', 'archived');
      } else if (projectStatusFilter === 'all') {
        params.set('include_archived', '1');
      } else if (projectStatusFilter) {
        params.set('status', projectStatusFilter);
      }

      const res = await fetchAPI(`projects?${params.toString()}`, { signal });
      if (signal.aborted) return;
      if (res && res.success !== false) {
        const { items, total } = unwrapPaginatedList<Project>(res);
        setProjects(items);
        setTotalProjects(total);
        projectsPageCache.projectsByPage.set(pageKey, { items, total, timestamp: Date.now() });
      } else {
        addToast(res?.message || 'Lỗi tải danh sách chương trình', 'error');
      }
    } catch (e: any) {
      if (isAbortError(e) || signal.aborted) return;
      console.error('loadProjects error:', e);
      addToast(e?.message || 'Lỗi kết nối', 'error');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  const loadProjectsLookup = async (forceRefresh = false) => {
    if (!forceRefresh && projectsPageCache.projectLookup.length > 0 && Date.now() - projectsPageCache.projectLookupTimestamp < PROJECTS_SWR_TTL_MS) {
      setAllProjectsLookup(projectsPageCache.projectLookup);
      return;
    }
    projectsLookupAbortRef.current?.abort();
    const controller = new AbortController();
    projectsLookupAbortRef.current = controller;
    try {
      const res = await fetchAPI('projects?bypass_roster=1&limit=200', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res && res.success !== false) {
        const list = extractArray<Project>(res);
        setAllProjectsLookup(list);
        projectsPageCache.projectLookup = list;
        projectsPageCache.projectLookupTimestamp = Date.now();
      }
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      console.error('Failed to load projects lookup', e);
    }
  };

  const loadDevelopers = async (forceRefresh = false) => {
    if (!forceRefresh && projectsPageCache.developers.length > 0 && Date.now() - projectsPageCache.developersTimestamp < PROJECTS_SWR_TTL_MS) {
      setDevelopers(projectsPageCache.developers);
      return;
    }
    developersAbortRef.current?.abort();
    const controller = new AbortController();
    developersAbortRef.current = controller;
    try {
      const res = await fetchAPI('suppliers?limit=100', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res && res.success !== false) {
        const list = extractArray(res);
        setDevelopers(list);
        projectsPageCache.developers = list;
        projectsPageCache.developersTimestamp = Date.now();
      }
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      console.error('Failed to load developers', e);
    }
  };

  const loadAllFiles = async (forceRefresh = false) => {
    if (!forceRefresh && projectsPageCache.allFiles.length > 0 && Date.now() - projectsPageCache.allFilesTimestamp < PROJECTS_SWR_TTL_MS) {
      setAllFiles(projectsPageCache.allFiles);
      return;
    }
    allFilesAbortRef.current?.abort();
    const controller = new AbortController();
    allFilesAbortRef.current = controller;
    try {
      const res = await fetchAPI('cloud-files?limit=100', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res && res.success !== false) {
        const list = extractArray(res);
        setAllFiles(list);
        projectsPageCache.allFiles = list;
        projectsPageCache.allFilesTimestamp = Date.now();
      }
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      console.error('Failed to load all files', e);
    }
  };

  const handleQuickUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    projectId?: number,
    targetEntity: 'project' | 'campaign' | 'folder' = 'project'
  ) => {
    const file = e.target.files?.[0];
    if (!file || uploadingDoc || quickUploadInFlightRef.current) {
      e.target.value = '';
      return;
    }
    const validationErr = isAllowedUploadFile(file, uploadMaxMbSetting, uploadForbiddenExts);
    if (validationErr) {
      addToast(validationErr, 'error');
      e.target.value = '';
      return;
    }

    quickUploadInFlightRef.current = true;
    setUploadingDoc(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', file.name.replace(/\.[^/.]+$/, '') || file.name);
    fd.append('category', 'general');
    fd.append('visibility', 'shared');
    if (projectId) {
      fd.append('project_id', String(projectId));
    }
    try {
      const res = await fetchAPI('cloud-files', {
        method: 'POST',
        body: fd
      });
      if (res && (res.success || res.id)) {
        addToast('Đã tải tài liệu lên thành công!', 'success');
        loadAllFiles(true);
        if (projectId) {
          loadFolderFiles(projectId);
        }
        const rawId = res.data?.id ?? res.id;
        const newFileId = rawId !== undefined && rawId !== null && rawId !== '' ? String(rawId) : '';
        if (newFileId) {
          if (targetEntity === 'project') {
            setEditingProject(prev => {
              if (!prev) return prev;
              const currentIds = parseIds(prev.document_ids);
              if (currentIds.includes(newFileId)) return prev;
              return { ...prev, document_ids: [...currentIds, newFileId].join(',') };
            });
          } else if (targetEntity === 'campaign') {
            setEditingCampaign((prev: any) => {
              if (!prev) return prev;
              const currentIds = parseIds(prev.document_ids);
              if (currentIds.includes(newFileId)) return prev;
              return { ...prev, document_ids: [...currentIds, newFileId].join(',') };
            });
          }
        }
      } else {
        addToast(res?.message || 'Lỗi khi tải tài liệu lên', 'error');
      }
    } catch (err: any) {
      addToast(err?.message || 'Lỗi tải tệp tin', 'error');
    } finally {
      quickUploadInFlightRef.current = false;
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const loadCampaigns = async (isSilent = false) => {
    campaignsAbortRef.current?.abort();
    const controller = new AbortController();
    campaignsAbortRef.current = controller;
    const { signal } = controller;

    if (!isSilent && projectsPageCache.campaignsTimestamp > 0) {
      setCampaigns(projectsPageCache.campaigns);
      setTotalCampaigns(projectsPageCache.totalCampaigns);
      setCampaignsLoading(false);
    } else if (!isSilent && campaigns.length === 0) {
      setCampaignsLoading(true);
    }
    try {
      const res = await fetchAPI('campaigns?limit=1000', { signal });
      if (signal.aborted) return;
      if (res && res.success !== false) {
        const { items, total } = unwrapPaginatedList(res);
        setCampaigns(items);
        setTotalCampaigns(total);
        projectsPageCache.campaigns = items;
        projectsPageCache.totalCampaigns = total;
        projectsPageCache.campaignsTimestamp = Date.now();
      }
    } catch (e: any) {
      if (isAbortError(e) || signal.aborted) return;
      console.error('Failed to load campaigns', e);
    } finally {
      if (!signal.aborted) setCampaignsLoading(false);
    }
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign?.name?.trim()) {
      addToast('Tên chiến dịch là bắt buộc', 'error');
      return;
    }
    if (editingCampaign.start_date && editingCampaign.end_date && String(editingCampaign.start_date) > String(editingCampaign.end_date)) {
      addToast('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu', 'error');
      return;
    }
    const rawRef = editingCampaign.reference_url ? String(editingCampaign.reference_url).trim() : '';
    if (rawRef && !sanitizeExternalUrl(rawRef, { allowRelative: false, allowMailTel: false })) {
      addToast('Link tham khảo không hợp lệ (chỉ hỗ trợ http:// hoặc https://)', 'error');
      return;
    }
    const rawFolder = editingCampaign.folder_path ? String(editingCampaign.folder_path).trim() : '';
    if (campaignFolderLinkType === 'link' && rawFolder && !sanitizeExternalUrl(rawFolder, { allowRelative: false, allowMailTel: false })) {
      addToast('Đường dẫn Folder liên kết không hợp lệ (chỉ hỗ trợ http:// hoặc https://)', 'error');
      return;
    }
    if (isSaving || saveCampaignInFlightRef.current) return;

    try {
      saveCampaignInFlightRef.current = true;
      setIsSaving(true);
      const isNew = !editingCampaign.id;
      const action = isNew ? 'campaigns' : `campaigns/${editingCampaign.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const payload: Record<string, any> = {
        name: editingCampaign.name.trim(),
        project_id: editingCampaign.project_id || null,
        status: editingCampaign.status || 'active',
        start_date: editingCampaign.start_date || null,
        end_date: editingCampaign.end_date || null,
        folder_path: rawFolder,
        reference_url: rawRef,
        document_ids: editingCampaign.document_ids || '',
        manager_ids: editingCampaign.manager_ids || '',
        user_ids: editingCampaign.user_ids || '',
        description: editingCampaign.description || ''
      };

      const res = await fetchAPI(action, {
        method,
        body: JSON.stringify(payload)
      });

      if (res?.success) {
        addToast(isNew ? 'Tạo chiến dịch thành công!' : 'Cập nhật chiến dịch thành công!', 'success');
        setIsCampaignModalOpen(false);
        loadCampaigns(true);
      } else {
        addToast(res?.message || 'Lỗi lưu thông tin chiến dịch', 'error');
      }
    } catch (err: any) {
      addToast(err?.message || 'Lỗi kết nối', 'error');
    } finally {
      saveCampaignInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const handleDeleteCampaign = (id: number) => {
    showConfirm({
      title: 'Xóa chiến dịch',
      message: 'Bạn có chắc chắn muốn xóa chiến dịch này không? Hành động này không thể hoàn tác.',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        if (deleteCampaignInFlightRef.current) return;
        deleteCampaignInFlightRef.current = true;
        // 0ms Optimistic UI update
        const prevCampaigns = campaigns;
        const prevTotal = totalCampaigns;
        setCampaigns(prev => prev.filter(c => Number(c.id) !== Number(id)));
        setTotalCampaigns(prev => Math.max(0, prev - 1));
        projectsPageCache.campaigns = projectsPageCache.campaigns.filter(c => Number(c.id) !== Number(id));
        try {
          const res = await fetchAPI(`campaigns/${id}`, { method: 'DELETE' });
          if (res?.success) {
            addToast('Xóa chiến dịch thành công!', 'success');
            loadCampaigns(true);
          } else {
            setCampaigns(prevCampaigns);
            setTotalCampaigns(prevTotal);
            projectsPageCache.campaigns = prevCampaigns;
            addToast(res?.message || 'Lỗi khi xóa chiến dịch', 'error');
          }
        } catch (err: any) {
          setCampaigns(prevCampaigns);
          setTotalCampaigns(prevTotal);
          projectsPageCache.campaigns = prevCampaigns;
          addToast(err?.message || 'Lỗi kết nối', 'error');
        } finally {
          deleteCampaignInFlightRef.current = false;
        }
      }
    });
  };

  const loadUsers = async (forceRefresh = false) => {
    if (!forceRefresh && projectsPageCache.users.length > 0 && Date.now() - projectsPageCache.usersTimestamp < PROJECTS_SWR_TTL_MS) {
      setUsers(projectsPageCache.users);
      return;
    }
    usersAbortRef.current?.abort();
    const controller = new AbortController();
    usersAbortRef.current = controller;
    try {
      const res = await fetchAPI('users?all=1', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res && res.success !== false) {
        const list = extractArray(res);
        setUsers(list);
        projectsPageCache.users = list;
        projectsPageCache.usersTimestamp = Date.now();
      }
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      console.error('Failed to load users', e);
    }
  };

  const loadConsultants = async (forceRefresh = false) => {
    if (!forceRefresh && projectsPageCache.consultants.length > 0 && Date.now() - projectsPageCache.consultantsTimestamp < PROJECTS_SWR_TTL_MS) {
      setConsultants(projectsPageCache.consultants);
      return;
    }
    consultantsAbortRef.current?.abort();
    const controller = new AbortController();
    consultantsAbortRef.current = controller;
    try {
      const res = await fetchAPI('get_consultants', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res && res.success !== false) {
        const list = extractArray(res);
        setConsultants(list);
        projectsPageCache.consultants = list;
        projectsPageCache.consultantsTimestamp = Date.now();
      }
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      console.error('Failed to load consultants', e);
    }
  };

  const loadCompanies = async (forceRefresh = false) => {
    if (!forceRefresh && projectsPageCache.companiesList.length > 0 && Date.now() - projectsPageCache.companiesTimestamp < PROJECTS_SWR_TTL_MS) {
      setCompaniesList(projectsPageCache.companiesList);
      return;
    }
    companiesAbortRef.current?.abort();
    const controller = new AbortController();
    companiesAbortRef.current = controller;
    try {
      const res = await fetchAPI('companies?limit=2000', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res && res.success !== false) {
        const list = extractArray(res);
        setCompaniesList(list);
        projectsPageCache.companiesList = list;
        projectsPageCache.companiesTimestamp = Date.now();
      }
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      console.error('Failed to load companies', e);
    }
  };

  useEffect(() => {
    loadProjects();
    return () => {
      projectsAbortRef.current?.abort();
    };
  }, [projectPage, projectPageSize, debouncedProjectSearch, projectStatusFilter, cacheScopeKey]);

  useEffect(() => {
    loadProjectsLookup();
    loadDevelopers();
    loadAllFiles();
    loadUsers();
    loadConsultants();
    loadCompanies();
    loadCampaigns();
    return () => {
      projectsLookupAbortRef.current?.abort();
      developersAbortRef.current?.abort();
      allFilesAbortRef.current?.abort();
      usersAbortRef.current?.abort();
      consultantsAbortRef.current?.abort();
      companiesAbortRef.current?.abort();
      campaignsAbortRef.current?.abort();
    };
  }, [cacheScopeKey]);

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject?.name?.trim()) {
      addToast('Tên chương trình là bắt buộc', 'error');
      return;
    }
    if (!autoCode && !editingProject?.code?.trim()) {
      addToast('Mã chương trình là bắt buộc khi tắt tự động sinh mã', 'error');
      return;
    }

    const parsedRefLinks = parseReferenceLinks(editingProject.reference_url);
    for (const link of parsedRefLinks) {
      if (link.url && !sanitizeExternalUrl(link.url, { allowRelative: false, allowMailTel: false })) {
        addToast(`Link tham khảo "${link.title || link.url}" không hợp lệ (chỉ hỗ trợ http:// hoặc https://)`, 'error');
        return;
      }
    }

    const parsedFolders = parseFolderPaths(editingProject.folder_path);
    for (const f of parsedFolders) {
      if (f.type === 'link' && f.path && !sanitizeExternalUrl(f.path, { allowRelative: false, allowMailTel: false })) {
        addToast(`Đường dẫn folder "${f.path}" không hợp lệ (chỉ hỗ trợ http:// hoặc https://)`, 'error');
        return;
      }
    }

    if (isSaving || saveProjectInFlightRef.current) return;

    try {
      saveProjectInFlightRef.current = true;
      setIsSaving(true);
      const isNew = !editingProject.id;
      const action = isNew ? 'projects' : `projects/${editingProject.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const payload: Record<string, any> = {
        name: editingProject.name.trim(),
        code: editingProject.code ? String(editingProject.code).trim() : '',
        developer: editingProject.developer || '',
        location: editingProject.location || '',
        status: editingProject.status || 'active',
        description: editingProject.description || '',
        folder_path: editingProject.folder_path || '',
        reference_url: editingProject.reference_url || '',
        document_ids: editingProject.document_ids || '',
        campaign_ids: editingProject.campaign_ids || '',
        manager_ids: editingProject.manager_ids || '',
        campaign_sharing_mode: editingProject.campaign_sharing_mode || 'independent'
      };

      const res = await fetchAPI(action, {
        method,
        body: JSON.stringify(payload)
      });

      if (res?.success) {
        addToast(isNew ? 'Tạo chương trình thành công!' : 'Cập nhật chương trình thành công!', 'success');
        projectsPageCache.projectsByPage.clear();
        setIsEditModalOpen(false);
        loadProjects(true);
        loadProjectsLookup(true);
      } else {
        addToast(res?.message || 'Lỗi lưu thông tin', 'error');
      }
    } catch (e: any) {
      addToast(e?.message || 'Lỗi kết nối', 'error');
    } finally {
      saveProjectInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const handleDeleteProject = (id: number) => {
    showConfirm({
      title: 'Xóa chương trình',
      message: 'Bạn có chắc chắn muốn xóa chương trình này không? Toàn bộ tài liệu, chiến dịch và roster liên quan sẽ bị ảnh hưởng.',
      confirmText: 'Xóa chương trình',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        if (deleteProjectInFlightRef.current) return;
        deleteProjectInFlightRef.current = true;
        // 0ms Optimistic UI update
        const prevProjects = projects;
        const prevTotal = totalProjects;
        setProjects(prev => prev.filter(p => Number(p.id) !== Number(id)));
        setTotalProjects(prev => Math.max(0, prev - 1));
        try {
          const res = await fetchAPI(`projects/${id}`, { method: 'DELETE' });
          if (res?.success) {
            addToast('Xóa chương trình thành công!', 'success');
            projectsPageCache.projectsByPage.clear();
            loadProjects(true);
            loadProjectsLookup(true);
          } else {
            setProjects(prevProjects);
            setTotalProjects(prevTotal);
            addToast(res?.message || 'Lỗi xóa chương trình', 'error');
          }
        } catch (e: any) {
          setProjects(prevProjects);
          setTotalProjects(prevTotal);
          addToast(e?.message || 'Lỗi kết nối', 'error');
        } finally {
          deleteProjectInFlightRef.current = false;
        }
      }
    });
  };

  // Roster logic
  const fetchTeams = async () => {
    if (projectsPageCache.teams.length > 0 && Date.now() - projectsPageCache.teamsTimestamp < PROJECTS_SWR_TTL_MS) {
      setTeams(projectsPageCache.teams);
      return;
    }
    teamsAbortRef.current?.abort();
    const controller = new AbortController();
    teamsAbortRef.current = controller;
    try {
      const res = await fetchAPI('teams', { signal: controller.signal });
      if (controller.signal.aborted) return;
      const list = extractArray<any>(res);
      setTeams(list);
      projectsPageCache.teams = list;
      projectsPageCache.teamsTimestamp = Date.now();
    } catch (e) {
      if (isAbortError(e) || controller.signal.aborted) return;
      console.error('Failed to fetch teams:', e);
    }
  };

  const handleOpenRoster = async (projectId: number) => {
    setSelectedProjectId(projectId);
    setRosterSearch('');
    setRosterMembers([]);
    setRosterLoading(true);
    setIsRosterModalOpen(true);
    fetchTeams();
    openRosterAbortRef.current?.abort();
    const controller = new AbortController();
    openRosterAbortRef.current = controller;
    try {
      const res = await fetchAPI(`projects/${projectId}/roster`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res && res.success !== false) {
        setRosterMembers(extractArray(res));
      } else {
        addToast(res?.message || 'Lỗi tải roster', 'error');
      }
    } catch (e: any) {
      if (isAbortError(e) || controller.signal.aborted) return;
      addToast(e?.message || 'Lỗi kết nối', 'error');
    } finally {
      if (!controller.signal.aborted) setRosterLoading(false);
    }
  };

  const handleToggleRoster = (uid: number) => {
    setRosterMembers(prev =>
      prev.map(m => (Number(m.id) === Number(uid) ? { ...m, is_assigned: Number(m.is_assigned) === 1 ? 0 : 1 } : m))
    );
  };

  const handleSaveRoster = async () => {
    if (!selectedProjectId || saveRosterInFlightRef.current) return;

    const assignedMembers = rosterMembers.filter(m => Number(m.is_assigned) === 1);
    const assignedIds = assignedMembers.map(m => m.id);
    const rosterCacheKey = `${cacheScopeKey}:${selectedProjectId}`;
    const prevRoster = projectRoster;
    const prevCachedRoster = projectRosterCache.get(rosterCacheKey);

    saveRosterInFlightRef.current = true;
    // 0ms Optimistic UI update for project roster
    projectRosterCache.set(rosterCacheKey, { data: assignedMembers, timestamp: Date.now() });
    if (editingProject && Number(editingProject.id) === Number(selectedProjectId)) {
      setProjectRoster(assignedMembers);
    }
    try {
      let res: any;
      try {
        res = await fetchAPI(`projects/${selectedProjectId}/roster`, {
          method: 'PUT',
          body: JSON.stringify({ user_ids: assignedIds })
        });
      } catch (putErr: any) {
        const status = putErr?.response?.status ?? putErr?.status;
        if (status === 404 || status === 405) {
          res = await fetchAPI(`projects/${selectedProjectId}/roster`, {
            method: 'POST',
            body: JSON.stringify({ user_ids: assignedIds })
          });
        } else {
          throw putErr;
        }
      }

      if (res?.success) {
        addToast('Cập nhật roster chương trình thành công!', 'success');
        projectsPageCache.projectsByPage.clear();
        setIsRosterModalOpen(false);
        loadProjects(true);
        if (editingProject?.id && Number(editingProject.id) === Number(selectedProjectId)) {
          loadProjectRoster(Number(selectedProjectId), true);
        }
      } else {
        if (prevCachedRoster) {
          projectRosterCache.set(rosterCacheKey, prevCachedRoster);
        } else {
          projectRosterCache.delete(rosterCacheKey);
        }
        if (editingProject && Number(editingProject.id) === Number(selectedProjectId)) {
          setProjectRoster(prevRoster);
        }
        addToast(res?.message || 'Lỗi lưu roster', 'error');
      }
    } catch (e: any) {
      if (prevCachedRoster) {
        projectRosterCache.set(rosterCacheKey, prevCachedRoster);
      } else {
        projectRosterCache.delete(rosterCacheKey);
      }
      if (editingProject && Number(editingProject.id) === Number(selectedProjectId)) {
        setProjectRoster(prevRoster);
      }
      addToast(e?.message || 'Lỗi kết nối', 'error');
    } finally {
      saveRosterInFlightRef.current = false;
    }
  };

  // Documents logic
  const handleOpenDocs = async (projectId: number) => {
    setSelectedProjectId(projectId);
    setProjectDocs([]);
    setDocFilterCategory('all');
    setIsDocsModalOpen(true);
    loadDocuments(projectId);
  };

  const loadDocuments = async (projectId: number) => {
    documentsAbortRef.current?.abort();
    const controller = new AbortController();
    documentsAbortRef.current = controller;
    setDocsLoading(true);
    try {
      const res = await fetchAPI(`projects/${projectId}/documents`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res && res.success !== false) {
        setProjectDocs(extractArray(res));
      } else {
        addToast(res?.message || 'Lỗi tải tài liệu', 'error');
      }
    } catch (e: any) {
      if (isAbortError(e) || controller.signal.aborted) return;
      addToast(e?.message || 'Lỗi kết nối', 'error');
    } finally {
      if (!controller.signal.aborted) setDocsLoading(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProjectId || uploadDocInFlightRef.current) {
      e.target.value = '';
      return;
    }
    const validationErr = isAllowedUploadFile(file, uploadMaxMbSetting, uploadForbiddenExts);
    if (validationErr) {
      addToast(validationErr, 'error');
      e.target.value = '';
      return;
    }

    uploadDocInFlightRef.current = true;
    setUploadingDoc(true);
    try {
      const compressedFile = await compressToWebP(file);
      const formData = new FormData();
      formData.append('file', compressedFile);

      const response = await api.post(`/projects/${selectedProjectId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const res = response.data;
      if (res?.success) {
        addToast('Tải tài liệu lên thành công!', 'success');
        projectsPageCache.projectsByPage.clear();
        loadDocuments(selectedProjectId);
        loadProjects(true);
      } else {
        addToast(res?.message || 'Lỗi tải tài liệu lên', 'error');
      }
    } catch (err: any) {
      addToast(err?.response?.data?.message || err?.message || 'Lỗi tải file', 'error');
    } finally {
      uploadDocInFlightRef.current = false;
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const handleDeleteDoc = (docId: number) => {
    if (!selectedProjectId) return;
    showConfirm({
      title: 'Xóa tài liệu',
      message: 'Bạn có chắc chắn muốn xóa tài liệu này không?',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        if (deleteDocInFlightRef.current) return;
        deleteDocInFlightRef.current = true;
        try {
          const res = await fetchAPI(`projects/${selectedProjectId}/documents/${docId}`, { method: 'DELETE' });
          if (res?.success) {
            addToast('Xóa tài liệu thành công!', 'success');
            projectsPageCache.projectsByPage.clear();
            loadDocuments(selectedProjectId);
            loadProjects(true);
          } else {
            addToast(res?.message || 'Lỗi xóa tài liệu', 'error');
          }
        } catch (e: any) {
          addToast(e?.message || 'Lỗi kết nối', 'error');
        } finally {
          deleteDocInFlightRef.current = false;
        }
      }
    });
  };

  const handleRenameDoc = (doc: any) => {
    setEditingDocKey(`${doc.isLinkedOnly ? 'link' : 'direct'}-${doc.id}`);
    setEditDocNameVal(doc.name);
  };

  const handleSaveRenameDoc = async (doc: any) => {
    if (!editDocNameVal || editDocNameVal.trim() === '' || editDocNameVal.trim() === doc.name) {
      setEditingDocKey(null);
      return;
    }
    if (renameDocInFlightRef.current) return;
    renameDocInFlightRef.current = true;

    try {
      const endpoint = doc.isLinkedOnly
        ? `cloud-files/${doc.id}`
        : `projects/${selectedProjectId}/documents/${doc.id}`;
      const res = await fetchAPI(endpoint, {
        method: 'PUT',
        body: JSON.stringify({ name: editDocNameVal.trim() })
      });

      if (res?.success) {
        addToast('Đổi tên tài liệu thành công!', 'success');
        setEditingDocKey(null);
        projectsPageCache.projectsByPage.clear();
        if (selectedProjectId) {
          loadDocuments(selectedProjectId);
        }
        loadAllFiles(true);
        loadProjects(true);
      } else {
        addToast(res?.message || 'Lỗi đổi tên tài liệu', 'error');
      }
    } catch (e: any) {
      addToast(e?.message || 'Lỗi kết nối', 'error');
    } finally {
      renameDocInFlightRef.current = false;
    }
  };

  const handleDownloadDoc = async (docId: number, fallbackName?: string) => {
    if (!selectedProjectId) return;
    try {
      const response = await api.get(`/projects/${selectedProjectId}/documents/${docId}/download`, {
        responseType: 'blob'
      });
      const cd = String(response.headers?.['content-disposition'] || '');
      let filename = fallbackName || `document_${docId}`;
      const utf8Match = cd.match(/filename\*=UTF-8''([^;]+)/i);
      const asciiMatch = cd.match(/filename="?([^";]+)"?/i);
      if (utf8Match?.[1]) {
        try { filename = decodeURIComponent(utf8Match[1].trim()); } catch {}
      } else if (asciiMatch?.[1]) {
        filename = asciiMatch[1].trim();
      }
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
      const blobUrl = URL.createObjectURL(blob);
      blobUrlsRef.current.add(blobUrl);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        blobUrlsRef.current.delete(blobUrl);
      }, 15000);
    } catch (e: any) {
      addToast(e?.response?.data?.message || e?.message || 'Không thể tải xuống tài liệu', 'error');
    }
  };

  return (
    <div className="page-container anim-fade-up" style={{ color: 'var(--color-text)', height: 'auto', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {quickUserCard && quickUserCard.visible && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: Math.max(2147483645, (Number(overlayZNestedModal) || 2147483646) - 1) }}
            onClick={() => setQuickUserCard(null)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.16, ease: [0.25, 0.1, 0.25, 1] }}
            style={{
              position: 'fixed',
              top: quickUserCard.y > window.innerHeight / 2 ? Math.max(10, quickUserCard.y - 370) : Math.min(window.innerHeight - 360, quickUserCard.y + 15),
              left: Math.max(10, Math.min(quickUserCard.x - 130, window.innerWidth - 290)),
              zIndex: Number(overlayZNestedModal) || 2147483646,
              width: 270,
              background: 'var(--color-surface, #FFFFFF)',
              borderRadius: '20px',
              boxShadow: '0 20px 48px -10px rgba(15, 23, 42, 0.22), 0 8px 24px -6px rgba(0,0,0,0.08)',
              border: '1px solid var(--color-border-light, #E2E8F0)',
              overflow: 'hidden'
            }}
          >
            <div style={{ height: 75, background: 'linear-gradient(135deg, #BD1D2D 0%, #8a0f1b 100%)' }} />
            <div style={{ padding: '0 1.25rem 1.25rem', textAlign: 'center', marginTop: -32 }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'var(--color-surface, #ffffff)',
                margin: '0 auto 0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                border: '4px solid var(--color-surface, #ffffff)',
                overflow: 'hidden'
              }}>
                <Avatar name={quickUserCard.name} src={quickUserCard.avatarUrl || undefined} size={56} />
              </div>
              <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text)', marginBottom: '2px' }}>
                {quickUserCard.name}
              </h4>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                {quickUserCard.employeeId || `${projectDefaultPrefix}${String(quickUserCard.id).padStart(4, '0')}`}
              </span>

              <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#BD1D2D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                {getUserDisplayRoleOrTitle({ role: quickUserCard.role, job_title: quickUserCard.jobTitle })}
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                <span style={{
                  fontSize: '0.65rem',
                  padding: '3px 8px',
                  borderRadius: '100px',
                  background: quickUserCard.vacationMode === 1 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                  color: quickUserCard.vacationMode === 1 ? '#d97706' : '#059669',
                  border: quickUserCard.vacationMode === 1 ? '1px solid rgba(245, 158, 11, 0.15)' : '1px solid rgba(16, 185, 129, 0.15)',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: quickUserCard.vacationMode === 1 ? '#d97706' : '#059669'
                  }} />
                  {quickUserCard.vacationMode === 1 ? 'Nghỉ phép (Tạm ngưng nhận lead)' : 'Đang hoạt động (Sẵn sàng nhận lead)'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                {quickUserCard.email && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--color-bg)', borderRadius: '10px', border: '1px solid var(--color-border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={quickUserCard.email}>
                      <Mail size={12} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{quickUserCard.email}</span>
                    </div>
                    <button
                      type="button"
                      className="btn-icon xs"
                      onClick={() => copyToClipboard(quickUserCard.email || '', 'email')}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--color-text-muted)', display: 'inline-flex', borderRadius: '4px' }}
                      title="Sao chép email"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                )}
                {quickUserCard.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--color-bg)', borderRadius: '10px', border: '1px solid var(--color-border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={quickUserCard.phone}>
                      <Phone size={12} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)' }}>{quickUserCard.phone}</span>
                    </div>
                    <button
                      type="button"
                      className="btn-icon xs"
                      onClick={() => copyToClipboard(quickUserCard.phone || '', 'số điện thoại')}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--color-text-muted)', display: 'inline-flex', borderRadius: '4px' }}
                      title="Sao chép số điện thoại"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', width: '100%' }}>
                {quickUserCard.email && sanitizeExternalUrl(`mailto:${quickUserCard.email}`) && (
                  <a
                    href={sanitizeExternalUrl(`mailto:${quickUserCard.email}`)}
                    className="btn primary sm"
                    style={{ flex: 1, height: '32px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '8px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Mail size={12} />
                    Email
                  </a>
                )}
                {quickUserCard.phone && sanitizeExternalUrl(`tel:${quickUserCard.phone}`) && (
                  <a
                    href={sanitizeExternalUrl(`tel:${quickUserCard.phone}`)}
                    className="btn outline sm"
                    style={{ flex: 1, height: '32px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '8px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Phone size={12} />
                    Gọi điện
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.25rem'
      }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>
            {activeSubTab === 'campaigns' ? t('Quản Lý Khóa Học') : t('Quản Lý Dự Án')}
            <button
              type="button"
              onClick={() => setShowInfoModal(true)}
              style={{
                background: 'var(--color-bg-light)',
                border: '1px solid var(--color-border-light)',
                padding: '3px 10px',
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
                e.currentTarget.style.color = '#BD1D2D';
                e.currentTarget.style.borderColor = 'rgba(189, 29, 45, 0.25)';
                e.currentTarget.style.background = 'rgba(189, 29, 45, 0.05)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--color-text-muted)';
                e.currentTarget.style.borderColor = 'var(--color-border-light)';
                e.currentTarget.style.background = 'var(--color-bg-light)';
              }}
              title={t("Xem hướng dẫn thiết lập chương trình, khóa học và roster")}
            >
              <Info size={12} style={{ marginTop: 1 }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{t("Giải thích cơ chế")}</span>
            </button>
          </h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: 'var(--color-text-muted)' }}>
            {activeSubTab === 'campaigns' ? t('Cấu hình khóa học, thời gian giảng dạy và quản lý môn học') : t('Đăng ký chương trình, roster đội ngũ phân phối và quản lý tài liệu')}
          </p>
        </div>
        {(canManageProjects || (activeSubTab === 'campaigns' && !isViewer(user) && (allProjectsLookup.length > 0 ? allProjectsLookup : projects).some(p => String(p.created_by) === String(user?.id) || (p.manager_ids && String(p.manager_ids).split(',').map(s => s.trim()).includes(String(user?.id)))))) && (
          <div>
            {activeSubTab === 'projects' ? (
              canManageProjects && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingProject({ status: 'active', campaign_sharing_mode: 'independent' });
                    setAutoCode(true);
                    setProjectModalMode('create');
                    setIsEditModalOpen(true);
                  }}
                  className="btn primary"
                  style={{ height: '36px', borderRadius: '8px', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 700 }}
                >
                  <Plus size={16} />
                  Thêm chương trình mới
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingCampaign({ name: '', description: '', status: 'active', start_date: '', end_date: '', project_id: null, project_ids: '', user_ids: '', manager_ids: '', document_ids: '', folder_path: '' });
                  setCampaignModalMode('create');
                  setIsCampaignModalOpen(true);
                }}
                className="btn primary"
                style={{ height: '36px', borderRadius: '8px', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 700 }}
              >
                <Plus size={16} />
                Thêm khóa học mới
              </button>
            )}
          </div>
        )}
      </div>

      {/* Control row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.875rem',
        background: isMobile ? 'transparent' : 'var(--color-surface)',
        border: isMobile ? 'none' : '1px solid var(--color-border-light)',
        borderRadius: '16px',
        padding: isMobile ? '0' : '0.625rem 1rem',
        marginBottom: '1.25rem',
        boxShadow: isMobile ? 'none' : '0 1px 3px rgba(15, 23, 42, 0.04)',
        width: '100%'
      }}>
        {/* Left: Capsule Segmented Tabs */}
        <DomSegmentedSwitch
          ariaLabel="Chuyển đổi Chương trình và Khóa học"
          value={activeSubTab}
          onChange={(val) => {
            setActiveSubTab(val as any);
            setProjectPage(1);
            setCampaignPage(1);
          }}
          options={subTabOptions}
        />

        {/* Middle: Real-time Search Box */}
        <div style={{
          position: 'relative',
          minWidth: screenWidth <= 768 ? '100%' : '240px',
          flex: screenWidth <= 768 ? '1 1 100%' : '0 1 300px'
        }}>
          <Search size={14} style={{
            position: 'absolute',
            left: '11px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-text-light)',
            pointerEvents: 'none'
          }} />
          <input
            type="text"
            value={mainSearchTerm}
            onChange={e => {
              setMainSearchTerm(e.target.value);
              setProjectPage(1);
              setCampaignPage(1);
            }}
            placeholder={activeSubTab === 'projects' ? 'Tìm tên, mã hoặc đơn vị cấp bằng...' : 'Tìm khóa học...'}
            style={{
              width: '100%',
              height: '36px',
              paddingLeft: '32px',
              paddingRight: mainSearchTerm ? '30px' : '10px',
              fontSize: '0.8rem',
              borderRadius: '9px',
              border: '1px solid var(--color-border-light)',
              background: 'var(--color-bg-light)',
              color: 'var(--color-text)',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'all 0.15s ease'
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = '#BD1D2D';
              e.currentTarget.style.background = 'var(--color-surface)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(189, 29, 45, 0.08)';
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'var(--color-border-light)';
              e.currentTarget.style.background = 'var(--color-bg-light)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          {mainSearchTerm && (
            <button
              type="button"
              onClick={() => {
                setMainSearchTerm('');
                setProjectPage(1);
                setCampaignPage(1);
              }}
              style={{
                position: 'absolute',
                right: '7px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                padding: '3px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Xóa tìm kiếm"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Right: Filter & Stats consolidated */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
          {activeSubTab === 'projects' && (
            <div style={{ width: isMobile ? '100%' : '165px' }}>
              <CustomSelect
                size="sm"
                options={[
                  { value: '', label: 'Đang mở (Chưa lưu trữ)' },
                  { value: 'active', label: 'Đang hoạt động' },
                  { value: 'inactive', label: 'Tạm dừng' },
                  { value: 'archived', label: 'Đã lưu trữ' },
                  { value: 'all', label: 'Tất cả trạng thái' }
                ]}
                value={projectStatusFilter}
                onChange={val => {
                  setProjectStatusFilter(String(val));
                  setProjectPage(1);
                }}
                placeholder="Trạng thái..."
              />
            </div>
          )}

          {activeSubTab === 'campaigns' && (
            <div style={{ width: isMobile ? '100%' : '185px' }}>
              <CustomSelect
                size="sm"
                searchable={true}
                options={[
                  { value: '', label: 'Tất cả chương trình' },
                  ...(allProjectsLookup.length > 0 ? allProjectsLookup : projects).map(p => ({ value: String(p.id), label: p.name }))
                ]}
                value={campaignProjectFilter}
                onChange={val => {
                  setCampaignProjectFilter(String(val));
                  setCampaignPage(1);
                }}
                placeholder="Chọn chương trình..."
              />
            </div>
          )}

          <div style={{
            display: isMobile ? 'none' : 'inline-flex',
            fontSize: '0.78rem',
            color: 'var(--color-text-muted)',
            fontWeight: 700,
            background: 'var(--color-bg-light)',
            padding: '0 12px',
            borderRadius: '9px',
            border: '1px solid var(--color-border-light)',
            height: '36px',
            alignItems: 'center',
            gap: '6px',
            boxSizing: 'border-box',
            whiteSpace: 'nowrap'
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#BD1D2D' }} />
            {activeSubTab === 'projects'
              ? `Hiển thị ${paginatedProjects.length} / ${totalProjects} chương trình`
              : `Hiển thị ${paginatedCampaigns.length} / ${filteredCampaigns.length} khóa học`
            }
          </div>
        </div>
      </div>

      {/* Tab Panels with Enter Animation */}
      <div key={activeSubTab} className="subtab-enter-active" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {/* Projects List */}
        {activeSubTab === 'projects' && (
          loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: screenWidth <= 640 ? '1fr' : (screenWidth <= 1024 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'), gap: screenWidth <= 640 ? '1rem' : '1.5rem' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <ProjectCardSkeleton key={i} />
              ))}
            </div>
          ) : paginatedProjects.length === 0 ? (
            <EmptyCard
              icon={<Building2 size={48} />}
              title={mainSearchTerm || projectStatusFilter ? "Không tìm thấy chương trình" : "Chưa có chương trình nào"}
              description={mainSearchTerm || projectStatusFilter ? "Không có chương trình nào khớp với điều kiện lọc. Vui lòng thử lại." : "Bắt đầu đăng ký các chương trình đào tạo, dự án hợp tác để phân phối và quản lý tài liệu."}
              actionText={mainSearchTerm || projectStatusFilter ? "Xóa bộ lọc" : (canManageProjects ? "Thêm ngay" : undefined)}
              onAction={mainSearchTerm || projectStatusFilter ? () => {
                setMainSearchTerm('');
                setProjectStatusFilter('');
                setProjectPage(1);
              } : (canManageProjects ? () => {
                setEditingProject({ status: 'active', campaign_sharing_mode: 'independent' });
                setAutoCode(true);
                setProjectModalMode('create');
                setIsEditModalOpen(true);
              } : undefined)}
            />
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: screenWidth <= 640 ? '1fr' : (screenWidth <= 1024 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'), gap: screenWidth <= 640 ? '0.875rem' : '1.125rem' }}>
                {paginatedProjects.map(proj => (
                  <div
                    key={proj.id}
                    className="card flex flex-col justify-between transition-all duration-200"
                    style={{
                      cursor: 'pointer',
                      background: 'var(--color-surface, #FFFFFF)',
                      border: '1px solid var(--color-border-light, #E2E8F0)',
                      borderRadius: '16px',
                      padding: screenWidth <= 640 ? '1rem' : '1.25rem',
                      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.borderColor = 'rgba(189, 29, 45, 0.28)';
                      e.currentTarget.style.boxShadow = '0 12px 24px -8px rgba(15, 23, 42, 0.09)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.borderColor = 'var(--color-border-light, #E2E8F0)';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.04)';
                    }}
                    onClick={() => {
                      setProjectDrawerTab('details');
                      setEditingProject(proj);
                      setProjectModalMode('view');
                      setIsEditModalOpen(true);
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                      {/* Header Row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.625rem' }}>
                        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', minWidth: 0 }}>
                          <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            background: 'rgba(189, 29, 45, 0.08)',
                            color: '#BD1D2D',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <GraduationCap size={20} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <h3 style={{
                              fontSize: '0.95rem',
                              fontWeight: 700,
                              color: 'var(--color-text)',
                              margin: 0,
                              lineHeight: 1.35,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }} title={proj.name}>
                              {proj.name}
                            </h3>
                            <span style={{
                              fontSize: '0.7rem',
                              color: 'var(--color-text-muted)',
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              display: 'inline-block',
                              marginTop: '2px'
                            }}>
                              Mã: {proj.code}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                          {Boolean(Number(proj.is_archived)) && (
                            <span
                              style={{
                                fontSize: '0.68rem',
                                padding: '3px 7px',
                                borderRadius: '6px',
                                fontWeight: 700,
                                background: 'rgba(15, 23, 42, 0.06)',
                                color: '#475569',
                                border: '1px solid rgba(15, 23, 42, 0.12)',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              Lưu trữ
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '3px 8px',
                              borderRadius: '8px',
                              fontWeight: 700,
                              background: proj.status === 'active' ? 'rgba(189, 29, 45, 0.08)' : 'rgba(100, 116, 139, 0.08)',
                              color: proj.status === 'active' ? '#BD1D2D' : '#64748b',
                              border: proj.status === 'active' ? '1px solid rgba(189, 29, 45, 0.16)' : '1px solid rgba(100, 116, 139, 0.15)',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {proj.status === 'active' ? '● Hoạt động' : '○ Tạm dừng'}
                          </span>
                        </div>
                      </div>

                      {/* Developer and Location */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                        {proj.developer && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: 'var(--color-text-light)', display: 'inline-flex' }}><Briefcase size={12} /></span>
                            <span>Cấp bằng: <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{proj.developer}</strong></span>
                          </div>
                        )}
                        {proj.location && (
                          <div style={{ display: 'flex', alignItems: 'start', gap: '6px' }}>
                            <span style={{ color: 'var(--color-text-light)', display: 'inline-flex', marginTop: '2px' }}><MapPin size={12} /></span>
                            <span style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.35 }}>
                              {proj.location}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Info Badges */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: '6px',
                          fontSize: '0.72rem',
                          color: 'var(--color-text-muted)'
                        }}
                      >
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDocs(proj.id);
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--color-bg-light)',
                            border: '1px solid var(--color-border-light)',
                            padding: '3px 8px',
                            borderRadius: '8px',
                            fontWeight: 600,
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = '#BD1D2D';
                            e.currentTarget.style.color = '#BD1D2D';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'var(--color-border-light)';
                            e.currentTarget.style.color = 'var(--color-text-muted)';
                          }}
                        >
                          <FileText size={11} /> {(proj.doc_count || 0) + parseIds(proj.document_ids).length} tài liệu
                        </span>
                        {(() => {
                          const linkedCamps = ensureArray<any>(campaigns).filter(c => Number(c.project_id) === Number(proj.id) || (proj.campaign_ids && String(proj.campaign_ids).split(',').map((name: string) => name.trim()).includes(c.name)));
                          return (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenQuickCampaigns(proj, linkedCamps);
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'var(--color-bg-light)',
                                border: '1px solid var(--color-border-light)',
                                padding: '3px 8px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                color: 'var(--color-text-muted)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.borderColor = '#BD1D2D';
                                e.currentTarget.style.color = '#BD1D2D';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'var(--color-border-light)';
                                e.currentTarget.style.color = 'var(--color-text-muted)';
                              }}
                            >
                              <Layers size={11} /> {linkedCamps.length} khóa học
                            </span>
                          );
                        })()}
                      </div>
                      {/* Project Managers Row */}
                      {(() => {
                        const projManagers = parseIds(proj.manager_ids).map(id => users.find(u => Number(u.id) === Number(id))).filter(Boolean);
                        if (projManagers.length === 0) return null;
                        return (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 8px',
                            background: 'var(--color-bg-light)',
                            border: '1px solid var(--color-border-light)',
                            borderRadius: '8px',
                            width: 'fit-content',
                            maxWidth: '100%'
                          }}>
                            <Users size={11} style={{ color: 'var(--color-text-light)', flexShrink: 0 }} />
                            <div style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                              {projManagers.slice(0, 3).map((m: any, idx) => (
                                <div
                                  key={m.id}
                                  style={{
                                    marginLeft: idx > 0 ? '-5px' : '0',
                                    zIndex: 10 - idx,
                                    position: 'relative'
                                  }}
                                >
                                  <Avatar src={m.avatar_url || m.avatar} name={m.full_name || m.username} size={16} />
                                </div>
                              ))}
                            </div>
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              color: 'var(--color-text)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {projManagers.length === 1 ? (
                                projManagers[0].full_name || projManagers[0].username
                              ) : (
                                `${projManagers[0].full_name || projManagers[0].username} +${projManagers.length - 1}`
                              )}
                            </span>
                          </div>
                        );
                      })()}

                      {/* Last updated timestamp */}
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-light)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <RefreshCw size={9} style={{ opacity: 0.6 }} />
                        <span>{formatLastUpdated(proj.updated_at, proj.created_at)}</span>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid var(--color-border-light)',
                      marginTop: '0.875rem',
                      paddingTop: '0.625rem',
                      gap: '6px'
                    }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDocs(proj.id);
                          }}
                          className="btn secondary sm"
                          style={{
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            height: '30px',
                            padding: '0 10px',
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-border-light)',
                            color: 'var(--color-text)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <FileText size={12} />
                          Tài liệu
                        </button>
                        {(isManagerOrLeader || canEditProject(proj)) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenRoster(proj.id);
                            }}
                            className="btn secondary sm"
                            style={{
                              borderRadius: '8px',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              height: '30px',
                              padding: '0 10px',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--color-border-light)',
                              color: 'var(--color-text)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              transition: 'all 0.15s ease'
                            }}
                            title="Quản lý Roster phân phối"
                          >
                            <Users size={12} />
                            Roster
                          </button>
                        )}
                      </div>
                      {canManageProjects && (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          {canEditProject(proj) && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateProject(proj.id);
                                }}
                                className="btn secondary sm"
                                style={{
                                  borderRadius: '8px',
                                  width: '30px',
                                  height: '30px',
                                  padding: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: 'var(--color-bg)',
                                  border: '1px solid var(--color-border-light)',
                                  color: 'var(--color-text)',
                                  transition: 'all 0.15s ease'
                                }}
                                title="Nhân bản chương trình"
                              >
                                <Copy size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleArchiveProject(proj.id, !proj.is_archived);
                                }}
                                className="btn secondary sm"
                                style={{
                                  borderRadius: '8px',
                                  width: '30px',
                                  height: '30px',
                                  padding: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: proj.is_archived ? 'rgba(234, 179, 8, 0.12)' : 'var(--color-bg)',
                                  border: proj.is_archived ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid var(--color-border-light)',
                                  color: proj.is_archived ? '#eab308' : 'var(--color-text)',
                                  transition: 'all 0.15s ease'
                                }}
                                title={proj.is_archived ? "Bỏ lưu trữ chương trình" : "Lưu trữ chương trình"}
                              >
                                <Archive size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingProject(proj);
                                  setAutoCode(false);
                                  setProjectModalMode('edit');
                                  setIsEditModalOpen(true);
                                }}
                                className="btn secondary sm"
                                style={{
                                  borderRadius: '8px',
                                  width: '30px',
                                  height: '30px',
                                  padding: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: 'var(--color-bg)',
                                  border: '1px solid var(--color-border-light)',
                                  color: 'var(--color-text)',
                                  transition: 'all 0.15s ease'
                                }}
                                title="Sửa chương trình"
                              >
                                <Edit size={12} />
                              </button>
                            </>
                          )}
                          {canDeleteProject(proj) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProject(proj.id);
                              }}
                              className="btn secondary sm"
                              style={{
                                borderRadius: '8px',
                                width: '30px',
                                height: '30px',
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                color: 'var(--color-danger)',
                                transition: 'all 0.15s ease'
                              }}
                              title="Xóa chương trình"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center', paddingBottom: '2.5rem' }}>
                <Pagination
                  total={totalProjects}
                  page={projectPage}
                  pageSize={projectPageSize}
                  onChange={setProjectPage}
                  showSizeChanger={true}
                  onPageSizeChange={(nextSize) => {
                    setProjectPageSize(nextSize);
                    setProjectPage(1);
                  }}
                />
              </div>
            </>
          )
        )}

        {/* Campaigns List Tab */}
        {activeSubTab === 'campaigns' && (
          <>
            {campaignsLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: screenWidth <= 640 ? '1fr' : (screenWidth <= 1024 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'), gap: screenWidth <= 640 ? '1rem' : '1.5rem' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <CampaignCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <EmptyCard
                icon={<Layers size={48} />}
                title={mainSearchTerm || campaignProjectFilter ? "Không tìm thấy khóa học" : "Chưa có khóa học nào"}
                description={mainSearchTerm || campaignProjectFilter ? "Không có khóa học nào khớp với bộ lọc hiện tại." : "Bắt đầu tạo khóa học mới để quản lý."}
                actionText={mainSearchTerm || campaignProjectFilter ? "Xóa bộ lọc" : undefined}
                onAction={mainSearchTerm || campaignProjectFilter ? () => {
                  setMainSearchTerm('');
                  setCampaignProjectFilter('');
                  setCampaignPage(1);
                } : undefined}
              />
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: screenWidth <= 640 ? '1fr' : (screenWidth <= 1024 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'), gap: screenWidth <= 640 ? '1rem' : '1.5rem' }}>
                  {paginatedCampaigns.map(camp => {
                    const projectPool = allProjectsLookup.length > 0 ? allProjectsLookup : projects;
                    const associatedProj = camp.project_id
                      ? projectPool.find(p => Number(p.id) === Number(camp.project_id))
                      : projectPool.find(p => {
                        const campIds = p.campaign_ids ? String(p.campaign_ids).split(',').map((id: string) => id.trim()) : [];
                        return campIds.includes(camp.name);
                      });
                    const docCount = parseIds(camp.document_ids).length;

                    const subs = safeParseArray<any>(camp.subjects_json);
                    const totalSubjects = subs.length;
                    const totalSeminars = subs.reduce((acc: number, s: any) => acc + ensureArray(s?.seminars).length, 0);
                    const totalAssignments = subs.reduce((acc: number, s: any) => acc + ensureArray(s?.assignments).length, 0);

                    const thesisMs = safeParseArray<any>(camp.thesis_milestones_json);
                    const totalThesis = thesisMs.length;

                    return (
                      <div
                        key={camp.id}
                        onClick={() => handleOpenCampaignView(camp)}
                        className="card flex flex-col justify-between transition-all duration-300"
                        style={{
                          cursor: 'pointer',
                          background: 'var(--color-surface, #FFFFFF)',
                          border: '1px solid var(--color-border-light, #E2E8F0)',
                          borderRadius: '16px',
                          padding: screenWidth <= 640 ? '1.15rem' : '1.35rem',
                          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.borderColor = 'rgba(189, 29, 45, 0.28)';
                          e.currentTarget.style.boxShadow = '0 12px 24px -8px rgba(15, 23, 42, 0.09)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.borderColor = 'var(--color-border-light, #E2E8F0)';
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.04)';
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
                          {/* Header Row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                              <div style={{
                                padding: '10px',
                                background: 'rgba(189, 29, 45, 0.08)',
                                borderRadius: '12px',
                                color: '#BD1D2D',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                <BookOpen size={20} style={{ color: '#BD1D2D' }} />
                              </div>
                              <div>
                                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text)', margin: 0, lineHeight: 1.35, letterSpacing: '-0.01em' }} className="line-clamp-1">{camp.name}</h3>
                                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontFamily: 'monospace', fontWeight: 600, display: 'inline-block', marginTop: '2px' }}>
                                  ID: {camp.id}
                                </span>
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontWeight: 700,
                                background: camp.status === 'active' ? 'rgba(189, 29, 45, 0.08)' : 'rgba(100, 116, 139, 0.08)',
                                color: camp.status === 'active' ? '#BD1D2D' : '#64748b',
                                border: camp.status === 'active' ? '1px solid rgba(189, 29, 45, 0.16)' : '1px solid rgba(100, 116, 139, 0.15)',
                                whiteSpace: 'nowrap',
                                flexShrink: 0
                              }}
                            >
                              {camp.status === 'active' ? 'Hoạt động' : 'Tạm dừng'}
                            </span>
                          </div>

                          {/* Rich Campaign Info List */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--color-text-muted)', borderTop: '1px dotted var(--color-border-light)', paddingTop: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: 'var(--color-text-light)', display: 'inline-flex' }}><Building2 size={13} /></span>
                              <span>Chương trình liên kết: <strong style={{ color: '#BD1D2D' }}>{associatedProj ? associatedProj.name : 'Chưa liên kết'}</strong></span>
                            </div>

                            {(camp.start_date || camp.end_date) && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ color: 'var(--color-text-light)', display: 'inline-flex' }}><Calendar size={13} /></span>
                                  <span>Thời gian: <strong>{camp.start_date ? formatDateVN(camp.start_date) : '...'}</strong> đến <strong>{camp.end_date ? formatDateVN(camp.end_date) : '...'}</strong></span>
                                </div>
                                {(() => {
                                  const getTimelineProgress = (start: string, end: string) => {
                                    if (!start || !end) return 0;
                                    const startDate = new Date(start);
                                    const endDate = new Date(end);
                                    const today = new Date();
                                    if (today < startDate) return 0;
                                    if (today > endDate) return 100;
                                    const total = endDate.getTime() - startDate.getTime();
                                    const current = today.getTime() - startDate.getTime();
                                    return total > 0 ? Math.round((current / total) * 100) : 0;
                                  };
                                  const progressVal = getTimelineProgress(camp.start_date, camp.end_date);
                                  if (progressVal > 0 && progressVal < 100) {
                                    return (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
                                        <div style={{ width: '100%', height: '4px', background: 'var(--color-bg-light)', borderRadius: '2px', overflow: 'hidden' }}>
                                          <div style={{ width: `${progressVal}%`, height: '100%', background: '#BD1D2D', borderRadius: '2px' }} />
                                        </div>
                                        <span style={{ fontSize: '0.62rem', color: 'var(--color-text-light)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>Tiến độ: {progressVal}% thời gian</span>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            )}

                            {/* Last updated timestamp */}
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ display: 'inline-flex', opacity: 0.6 }}><RefreshCw size={10} /></span>
                              <span>{formatLastUpdated(camp.updated_at, camp.created_at)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Footer Stats Bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border-light)', paddingTop: '0.75rem', marginTop: '1rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg-light)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--color-border-light)', fontWeight: 600 }}>
                              <Folder size={12} style={{ color: 'var(--color-text-light)' }} />
                              {docCount} Tài liệu
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg-light)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--color-border-light)', fontWeight: 600 }}>
                              <BookOpen size={12} style={{ color: 'var(--color-text-light)' }} />
                              {totalSubjects} Môn học
                            </span>
                            {totalSeminars > 0 && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg-light)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--color-border-light)', fontWeight: 600 }}>
                                <Layers size={12} style={{ color: 'var(--color-text-light)' }} />
                                {totalSeminars} Chuyên đề
                              </span>
                            )}
                            {totalAssignments > 0 && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg-light)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--color-border-light)', fontWeight: 600 }}>
                                <CheckSquare size={12} style={{ color: 'var(--color-text-light)' }} />
                                {totalAssignments} Bài tập
                              </span>
                            )}
                            {totalThesis > 0 && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(189, 29, 45, 0.06)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(189, 29, 45, 0.16)', fontWeight: 600, color: '#BD1D2D' }}>
                                <Award size={12} />
                                {totalThesis} Khóa luận
                              </span>
                            )}
                          </div>
                          {(canManageProjects || canEditCampaign(camp)) && (
                            <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                              {canEditCampaign(camp) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCampaign(camp);
                                    setCampaignModalMode('edit');
                                    setIsCampaignModalOpen(true);
                                  }}
                                  className="btn outline icon-only sm"
                                  style={{ width: '28px', height: '28px', borderRadius: '8px', padding: 0 }}
                                  title="Sửa"
                                >
                                  <Edit size={12} />
                                </button>
                              )}
                              {canDeleteCampaign(camp) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCampaign(camp.id)}
                                  className="btn outline icon-only sm"
                                  style={{ width: '28px', height: '28px', borderRadius: '8px', padding: 0, color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                  title="Xóa"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center', paddingBottom: '2.5rem' }}>
                  <Pagination
                    total={filteredCampaigns.length}
                    page={campaignPage}
                    pageSize={campaignPageSize}
                    onChange={setCampaignPage}
                    showSizeChanger={true}
                    onPageSizeChange={(nextSize) => {
                      setCampaignPageSize(nextSize);
                      setCampaignPage(1);
                    }}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>

        {/* Edit Modal (converted to Drawer) */}
        {isEditModalOpen && renderDrawer(
          isEditModalOpen,
          () => {
            setIsEditModalOpen(false);
            setEditingProject(null);
            clearEntityParamsFromUrl();
          },
          projectModalMode === 'view'
            ? `Chi tiết Chương trình: ${editingProject?.name || ''}`
            : editingProject?.id ? 'Chỉnh sửa chương trình' : 'Thêm chương trình mới',
          <>
            {projectModalMode === 'view' ? (
              renderProjectViewDrawer()
            ) : (
              <form id="project-form" onSubmit={handleSaveProject} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1.5rem', alignItems: 'start' }}>
                <input
                  type="file"
                  ref={projectQuickUploadInputRef}
                  style={{ display: 'none' }}
                  onChange={e => handleQuickUpload(e, editingProject?.id, 'project')}
                />
                {/* Left Column (3/5) */}
                <div style={{ flex: 3, width: isMobile ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                  {/* Card 1: Thông tin cơ bản */}
                  <div style={{
                    background: 'var(--color-surface, #FFFFFF)',
                    border: '1px solid var(--color-border-light, #E2E8F0)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                  }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#BD1D2D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thông tin cơ bản</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
                      <div>
                        <label className="form-label">Tên chương trình</label>
                        <input
                          type="text"
                          required
                          value={editingProject?.name || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setEditingProject(prev => {
                              const next = { ...prev, name: val };
                              if (autoCode && !prev?.id) {
                                next.code = generateCodeFromName(val);
                              }
                              return next;
                            });
                          }}
                          className="form-input"
                          placeholder="Nhập tên chương trình..."
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <label className="form-label" style={{ marginBottom: 0 }}>Mã chương trình</label>
                          {!editingProject?.id && (
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#BD1D2D', fontWeight: 600, cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={autoCode}
                                onChange={e => {
                                  const checked = e.target.checked;
                                  setAutoCode(checked);
                                  if (checked && editingProject?.name) {
                                    setEditingProject(prev => ({ ...prev, code: generateCodeFromName(prev?.name || '') }));
                                  }
                                }}
                                style={{ accentColor: '#BD1D2D' }}
                              />
                              Tự động tạo mã
                            </label>
                          )}
                        </div>
                        <input
                          type="text"
                          required
                          disabled={autoCode && !editingProject?.id}
                          value={editingProject?.code || ''}
                          onChange={e => {
                            setAutoCode(false);
                            setEditingProject(prev => ({ ...prev, code: e.target.value.toUpperCase() }));
                          }}
                          className="form-input"
                          placeholder={autoCode && !editingProject?.id ? 'Hệ thống tự động sinh' : 'Ví dụ: VGP'}
                        />
                      </div>

                      <div>
                        <label className="form-label">Cấp bằng</label>
                        {developers.length === 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)', fontWeight: 600 }}>
                              Chưa có đơn vị cấp bằng nào!
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditModalOpen(false);
                                navigate('/suppliers');
                              }}
                              className="btn primary sm"
                              style={{ width: '100%', height: '38px', fontSize: '0.75rem' }}
                            >
                              Thêm đơn vị cấp bằng trước
                            </button>
                          </div>
                        ) : (
                          <CustomSelect
                            searchable={true}
                            options={developers.map(d => ({ value: d.name, label: d.name }))}
                            value={editingProject?.developer || ''}
                            onChange={val => setEditingProject(prev => ({ ...prev, developer: String(val) }))}
                            placeholder="Chọn đơn vị cấp bằng..."
                          />
                        )}
                      </div>

                      <div>
                        <label className="form-label" style={{ fontWeight: 600 }}>Trạng thái hoạt động</label>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0 12px',
                          background: 'var(--color-bg-light)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--color-border-light)',
                          height: '42px'
                        }}>
                          <div>
                            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>Cho phép hoạt động</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: editingProject?.status === 'active' ? '#BD1D2D' : 'var(--color-text-muted)' }}>
                              {editingProject?.status === 'active' ? 'Đang hoạt động' : 'Tạm dừng'}
                            </span>
                            <ToggleSwitch
                              checked={editingProject?.status === 'active'}
                              onChange={checked => setEditingProject(prev => ({ ...prev, status: checked ? 'active' : 'inactive' }))}
                            />
                          </div>
                        </div>
                      </div>

                      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                        <AddressSelect
                          label="Địa điểm học / Cơ sở"
                          value={editingProject?.location || ''}
                          onChange={val => setEditingProject(prev => ({ ...prev, location: val }))}
                          placeholder="Nhấp để chọn tỉnh/thành phố, xã/phường..."
                        />
                      </div>

                      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2', borderTop: '1px solid var(--color-border-light)', paddingTop: '16px', marginTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <label className="form-label" style={{ marginBottom: 0 }}>Website &amp; Tài liệu tham khảo liên kết</label>
                          <button
                            type="button"
                            onClick={() => {
                              const currentLinks = parseReferenceLinks(editingProject?.reference_url);
                              const nextLinks = [...currentLinks, { title: 'Tài liệu tham khảo', url: '' }];
                              setEditingProject(prev => ({ ...prev, reference_url: JSON.stringify(nextLinks) }));
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#BD1D2D',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: 0
                            }}
                          >
                            <Plus size={12} />
                            <span>Thêm Link mới</span>
                          </button>
                        </div>

                        {(() => {
                          const currentLinks = parseReferenceLinks(editingProject?.reference_url);
                          if (currentLinks.length === 0) {
                            return (
                              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', padding: '8px 12px', background: 'var(--color-bg-light)', border: '1px dashed var(--color-border)', borderRadius: '10px' }}>
                                Chưa có đường dẫn tham khảo nào. Bấm "Thêm Link mới" để cấu hình.
                              </div>
                            );
                          }
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {currentLinks.map((link, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <input
                                    type="text"
                                    value={link.title}
                                    onChange={e => {
                                      const val = e.target.value;
                                      const updated = currentLinks.map((item, i) => (i === idx ? { ...item, title: val } : item));
                                      setEditingProject(prev => ({ ...prev, reference_url: JSON.stringify(updated) }));
                                    }}
                                    className="form-input"
                                    placeholder="Tên liên kết (Ví dụ: GG Sheets Phí)"
                                    style={{ flex: 1 }}
                                  />
                                  <input
                                    type="text"
                                    value={link.url}
                                    onChange={e => {
                                      const val = e.target.value;
                                      const updated = currentLinks.map((item, i) => (i === idx ? { ...item, url: val } : item));
                                      setEditingProject(prev => ({ ...prev, reference_url: JSON.stringify(updated) }));
                                    }}
                                    className="form-input"
                                    placeholder="https://..."
                                    style={{ flex: 2 }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = currentLinks.filter((_, i) => i !== idx);
                                      setEditingProject(prev => ({ ...prev, reference_url: JSON.stringify(updated) }));
                                    }}
                                    className="btn secondary sm"
                                    style={{ color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.2)', width: '38px', height: '38px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Mô tả */}
                  <div style={{
                    background: 'var(--color-surface, #FFFFFF)',
                    border: '1px solid var(--color-border-light, #E2E8F0)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                  }}>
                    <label className="form-label">Mô tả chi tiết</label>
                    <textarea
                      value={editingProject?.description || ''}
                      onChange={e => setEditingProject(prev => ({ ...prev, description: e.target.value }))}
                      className="form-textarea"
                      style={{ minHeight: '100px' }}
                      placeholder="Nhập mô tả thông tin chương trình..."
                    />
                  </div>

                </div>

                {/* Right Column (2/5) */}
                <div style={{ flex: 2, width: isMobile ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                  {/* Card: Quản lý phụ trách chính */}
                  <div style={{
                    background: 'var(--color-surface, #FFFFFF)',
                    border: '1px solid var(--color-border-light, #E2E8F0)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                  }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#BD1D2D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nhân sự điều phối</h4>
                    <div>
                      <label className="form-label" style={{ fontWeight: 600 }}>Quản lý phụ trách chính</label>
                      <CustomSelect
                        multiple
                        searchable={true}
                        showAvatars={true}
                        options={ensureArray(users)
                          .filter(u => isManagement(u) || isExecutive(u) || isAcademic(u))
                          .map(u => ({
                            value: String(u.id),
                            label: u.full_name || u.fullname || u.username,
                            avatar: u.avatar_url || u.avatar
                          }))}
                        value={parseIds(editingProject?.manager_ids)}
                        onChange={val => setEditingProject(prev => ({
                          ...prev,
                          manager_ids: Array.isArray(val) ? val.join(',') : String(val)
                        }))}
                        placeholder="Chọn quản lý phụ trách..."
                      />
                    </div>
                  </div>

                  {/* Card 2: Tài liệu & Liên kết */}
                  <div style={{
                    background: 'var(--color-surface, #FFFFFF)',
                    border: '1px solid var(--color-border-light, #E2E8F0)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                  }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#BD1D2D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thư mục & Tài liệu</h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <label className="form-label" style={{ marginBottom: 0 }}>Đường dẫn Folder liên kết</label>
                          <button
                            type="button"
                            onClick={() => {
                              const currentFolders = parseFolderPaths(editingProject?.folder_path);
                              const nextFolders = [...currentFolders, { type: 'link' as const, path: '' }];
                              setEditingProject(prev => ({ ...prev, folder_path: JSON.stringify(nextFolders) }));
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#BD1D2D',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: 0
                            }}
                          >
                            <Plus size={12} />
                            <span>Thêm Thư mục</span>
                          </button>
                        </div>

                        {(() => {
                          const currentFolders = parseFolderPaths(editingProject?.folder_path);
                          if (currentFolders.length === 0) {
                            return (
                              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', padding: '8px 12px', background: 'var(--color-bg-light)', border: '1px dashed var(--color-border)', borderRadius: '10px' }}>
                                Chưa liên kết thư mục nào. Bấm "Thêm Thư mục" để cấu hình.
                              </div>
                            );
                          }
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {currentFolders.map((f, idx) => (
                                <div key={idx} style={{ background: 'var(--color-bg-light)', padding: '12px', borderRadius: '12px', border: '1px solid var(--color-border-light)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #e2e8f0', gap: '2px' }}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = currentFolders.map((item, i) => (i === idx ? { ...item, type: 'link' as const } : item));
                                          setEditingProject(prev => ({ ...prev, folder_path: JSON.stringify(updated) }));
                                        }}
                                        style={{
                                          padding: '4px 10px',
                                          borderRadius: '6px',
                                          border: 'none',
                                          background: f.type === 'link' ? '#ffffff' : 'transparent',
                                          color: f.type === 'link' ? '#BD1D2D' : '#64748b',
                                          boxShadow: f.type === 'link' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                                          fontSize: '0.7rem',
                                          fontWeight: 700,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Dán Link (Drive)
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = currentFolders.map((item, i) => (i === idx ? { ...item, type: 'select' as const } : item));
                                          setEditingProject(prev => ({ ...prev, folder_path: JSON.stringify(updated) }));
                                        }}
                                        style={{
                                          padding: '4px 10px',
                                          borderRadius: '6px',
                                          border: 'none',
                                          background: f.type === 'select' ? '#ffffff' : 'transparent',
                                          color: f.type === 'select' ? '#BD1D2D' : '#64748b',
                                          boxShadow: f.type === 'select' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                                          fontSize: '0.7rem',
                                          fontWeight: 700,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Chọn thư mục
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = currentFolders.filter((_, i) => i !== idx);
                                        setEditingProject(prev => ({ ...prev, folder_path: JSON.stringify(updated) }));
                                      }}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--color-danger)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '4px'
                                      }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                  {f.type === 'link' ? (
                                    <input
                                      type="text"
                                      value={f.path}
                                      onChange={e => {
                                        const val = e.target.value;
                                        const updated = currentFolders.map((item, i) => (i === idx ? { ...item, path: val } : item));
                                        setEditingProject(prev => ({ ...prev, folder_path: JSON.stringify(updated) }));
                                      }}
                                      className="form-input"
                                      placeholder="Dán link thư mục Google Drive..."
                                    />
                                  ) : (
                                    <CustomSelect
                                      options={fileCategories.map(cat => ({ value: cat.label, label: cat.label }))}
                                      value={f.path}
                                      onChange={val => {
                                        const updated = currentFolders.map((item, i) => (i === idx ? { ...item, path: String(val) } : item));
                                        setEditingProject(prev => ({ ...prev, folder_path: JSON.stringify(updated) }));
                                      }}
                                      placeholder="Chọn thư mục từ /files..."
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <label className="form-label" style={{ marginBottom: 0 }}>Tài liệu đính kèm</label>
                          <button
                            type="button"
                            onClick={() => projectQuickUploadInputRef.current?.click()}
                            disabled={uploadingDoc}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#BD1D2D',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: 0
                            }}
                          >
                            {uploadingDoc ? (
                              <RefreshCw className="spin" size={12} />
                            ) : (
                              <Plus size={12} />
                            )}
                            <span>Tải tệp mới</span>
                          </button>
                        </div>
                        <CustomSelect
                          multiple
                          searchable={true}
                          options={ensureArray(allFiles).map(f => ({ value: String(f.id), label: f.name }))}
                          value={parseIds(editingProject?.document_ids)}
                          onChange={val => setEditingProject(prev => ({ ...prev, document_ids: Array.isArray(val) ? val.join(',') : String(val) }))}
                          placeholder="Chọn tài liệu..."
                        />
                      </div>

                      <div>
                        <label className="form-label" style={{ fontWeight: 600 }}>Chiến dịch liên kết</label>
                        <CustomSelect
                          multiple
                          searchable={true}
                          options={ensureArray(campaigns).map(c => ({ value: String(c.id), label: c.name, faded: c.status !== 'active' }))}
                          value={
                            editingProject?.campaign_ids_array !== undefined
                              ? ensureArray(editingProject.campaign_ids_array).map(String)
                              : ensureArray(campaigns).filter(c => Number(c.project_id) === Number(editingProject?.id)).map(c => String(c.id))
                          }
                          onChange={val => {
                            const selectedIds = Array.isArray(val) ? val.map(Number) : [];
                            const selectedNames = ensureArray(campaigns).filter(c => selectedIds.includes(Number(c.id))).map(c => c.name);
                            setEditingProject(prev => ({
                              ...prev,
                              campaign_ids: selectedNames.join(','),
                              campaign_ids_array: selectedIds
                            }));
                          }}
                          placeholder="Chọn chiến dịch..."
                        />
                      </div>

                    </div>
                  </div>

                </div>
              </form>
            )}
          </>,
          '960px',
          projectModalMode === 'view' ? (
            canEditCurrentProject && (
              <button
                type="button"
                onClick={() => setProjectModalMode('edit')}
                className="btn primary sm"
                style={{ borderRadius: '100px', fontWeight: 700, background: 'var(--color-primary)', border: 'none' }}
              >
                Chỉnh sửa
              </button>
            )
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="submit"
                form="project-form"
                className="btn primary sm hover-lift"
                disabled={isSaving}
                style={{ borderRadius: '100px', fontWeight: 700, background: 'var(--color-primary)', border: 'none', opacity: isSaving ? 0.7 : 1, cursor: isSaving ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {isSaving && <RefreshCw size={14} className="spin" />}
                <span>{isSaving ? 'Đang lưu...' : 'Lưu chương trình'}</span>
              </button>
            </div>
          )
        )}

        {/* Roster Drawer */}
        {isRosterModalOpen && renderDrawer(
          isRosterModalOpen,
          () => setIsRosterModalOpen(false),
          "Cấu hình Roster Nhân Sự Phân Phối",
          (() => {
            const q = rosterSearch.trim().toLowerCase();
            const filtered = ensureArray<any>(rosterMembers).filter(m =>
              !q ||
              String(m.full_name || '').toLowerCase().includes(q) ||
              String(m.email || '').toLowerCase().includes(q)
            );

            const sorted = [...filtered].sort((a, b) => {
              const aAssigned = Number(a.is_assigned) === 1 ? 1 : 0;
              const bAssigned = Number(b.is_assigned) === 1 ? 1 : 0;
              return bAssigned - aAssigned;
            });

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Roster Search Box */}
                <div style={{ position: 'relative', width: '100%' }}>
                  <input
                    type="text"
                    placeholder="Tìm kiếm nhân sự theo tên hoặc email..."
                    value={rosterSearch}
                    onChange={e => setRosterSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.625rem 1rem',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--color-border)',
                      fontSize: '0.875rem',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text)',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Add Team Dropdown / Buttons */}
                {canEditRoster && teams.length > 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'var(--color-bg-light)',
                    padding: '10px 16px',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border-light)',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ flexShrink: 0 }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        Thêm nhanh theo Phòng ban:
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ width: isMobile ? '100%' : '280px' }}>
                        <CustomSelect
                          multiple={true}
                          searchable={true}
                          placeholder="Chọn Phòng ban..."
                          options={teams
                            .map(team => {
                              const teamMembers = rosterMembers.filter(m => Number(m.team_id) === Number(team.id) || Number(m.id) === Number(team.leader_id));
                              const assignedInTeam = teamMembers.filter(m => Number(m.is_assigned) === 1);
                              if (teamMembers.length === 0) return null;
                              return {
                                value: String(team.id),
                                label: team.name,
                                sublabel: `${assignedInTeam.length}/${teamMembers.length} thành viên`
                              };
                            })
                            .filter(Boolean) as any[]
                          }
                          value={teams
                            .filter(team => {
                              const teamMembers = rosterMembers.filter(m => Number(m.team_id) === Number(team.id) || Number(m.id) === Number(team.leader_id));
                              return teamMembers.length > 0 && teamMembers.every(m => Number(m.is_assigned) === 1);
                            })
                            .map(team => String(team.id))
                          }
                          onChange={(newVal: string[]) => {
                            const currentSelected = teams
                              .filter(team => {
                                const teamMembers = rosterMembers.filter(m => Number(m.team_id) === Number(team.id) || Number(m.id) === Number(team.leader_id));
                                return teamMembers.length > 0 && teamMembers.every(m => Number(m.is_assigned) === 1);
                              })
                              .map(team => String(team.id));

                            const addedIds = newVal.filter(id => !currentSelected.includes(id)).map(Number);
                            const removedIds = currentSelected.filter(id => !newVal.includes(id)).map(Number);

                            const addedLeaders = teams.filter(t => addedIds.includes(t.id)).map(t => Number(t.leader_id));
                            const removedLeaders = teams.filter(t => removedIds.includes(t.id)).map(t => Number(t.leader_id));

                            setRosterMembers(prev =>
                              prev.map(m => {
                                if (addedIds.includes(Number(m.team_id)) || addedLeaders.includes(Number(m.id))) {
                                  return { ...m, is_assigned: 1 };
                                }
                                if (removedIds.includes(Number(m.team_id)) || removedLeaders.includes(Number(m.id))) {
                                  return { ...m, is_assigned: 0 };
                                }
                                return m;
                              })
                            );
                          }}
                        />
                      </div>

                      <DomToolbarButton
                        variant="outline"
                        onClick={() => {
                          setRosterMembers(prev => prev.map(m => ({ ...m, is_assigned: 0 })));
                        }}
                      >
                        Bỏ chọn tất cả
                      </DomToolbarButton>
                    </div>
                  </div>
                )}

                {rosterLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.625rem', padding: '3rem 1rem', color: 'var(--color-text-muted)' }}>
                    <RefreshCw size={22} className="spin" style={{ color: '#BD1D2D' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Đang tải danh sách nhân sự...</span>
                  </div>
                ) : sorted.length === 0 ? (
                  <div style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2.5rem 1rem', fontSize: '0.875rem', background: 'var(--color-bg-light)', borderRadius: '12px', border: '1px dashed var(--color-border-light)' }}>
                    Không tìm thấy nhân sự phù hợp
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                    gap: '0.75rem',
                    overflowY: 'auto',
                    paddingRight: '4px',
                    maxHeight: '450px'
                  }}>
                    {sorted.map(member => {
                      const assigned = Number(member.is_assigned) === 1;
                      const roleLabel = getUserDisplayRoleOrTitle(member);
                      return (
                        <div
                          key={member.id}
                          onClick={() => canEditRoster && handleToggleRoster(member.id)}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.75rem 1rem',
                            borderRadius: '12px',
                            border: assigned ? '1px solid #BD1D2D' : '1px solid #E2E8F0',
                            background: assigned ? '#fef2f2' : 'var(--color-surface)',
                            cursor: canEditRoster ? 'pointer' : 'default',
                            transition: 'all 0.15s ease',
                            gap: '0.5rem'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                            <Avatar src={member.avatar_url || member.avatar} name={member.full_name} size={36} />
                            <div style={{ minWidth: 0 }}>
                              <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {member.full_name}
                                {roleLabel && (
                                  <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-muted)', marginLeft: '4px' }}>
                                    ({roleLabel})
                                  </span>
                                )}
                              </h4>
                              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.email}</p>
                            </div>
                          </div>
                          <div
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '4px',
                              border: assigned ? '1px solid #BD1D2D' : '1px solid var(--color-border)',
                              backgroundColor: assigned ? '#BD1D2D' : 'transparent',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {assigned && <Check size={14} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })(),
          '650px',
          (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {canEditRoster ? (
                <>
                  <button
                    type="button"
                    className="btn secondary sm"
                    style={{ borderRadius: '100px', fontWeight: 700 }}
                    onClick={() => setIsRosterModalOpen(false)}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="btn primary sm"
                    disabled={isSaving || rosterLoading}
                    style={{ borderRadius: '100px', fontWeight: 700, background: 'var(--color-primary)', border: 'none', opacity: (isSaving || rosterLoading) ? 0.7 : 1 }}
                    onClick={handleSaveRoster}
                  >
                    {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn secondary sm"
                  style={{ borderRadius: '100px', fontWeight: 700 }}
                  onClick={() => setIsRosterModalOpen(false)}
                >
                  Đóng
                </button>
              )}
            </div>
          ),
          false,
          false,
          false,
          'projects-roster-drawer'
        )}

        {renderQuickCampaignsDrawer()}

        {/* Project Docs Drawer */}
        {renderDrawer(
          isDocsModalOpen,
          () => setIsDocsModalOpen(false),
          "Kho Tài Liệu Dự Án",
          () => {
            const projectPool = allProjectsLookup.length > 0 ? allProjectsLookup : projects;
            const selectedProj = ensureArray<any>(projectPool).find(p => Number(p.id) === Number(selectedProjectId));
            const linkedDocIds = selectedProj?.document_ids ? parseIds(selectedProj.document_ids) : [];

            const formattedLinkedDocs = ensureArray(allFiles)
              .filter(f => linkedDocIds.includes(String(f.id)))
              .map(f => ({
                id: f.id,
                name: f.name,
                file_path: f.file_path,
                file_size: Number(f.file_size || 0),
                mime_type: f.mime_type || '',
                uploaded_by_name: f.uploaded_by_name || 'Hệ thống',
                created_at: f.created_at || '',
                isLinkedOnly: true
              }));

            const combinedDocs = [...ensureArray(projectDocs), ...formattedLinkedDocs];

            return (
              <div className="project-docs-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRadius: '12px' }}>
                <style>{`
                .project-docs-container {
                  background: var(--color-surface);
                  padding: 1.25rem;
                  gap: 1rem;
                }
                .project-docs-layout {
                  display: flex;
                  flex-direction: column;
                  gap: 1.25rem;
                }
                .project-docs-top-card {
                  background: var(--color-surface);
                  border: 1px solid #E2E8F0;
                  border-radius: 16px;
                  padding: 1rem 1.25rem;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  gap: 1.5rem;
                  flex-wrap: wrap;
                }
                .explorer-layout {
                  display: grid;
                  grid-template-columns: 190px 1fr;
                  gap: 1.25rem;
                }
                .category-sidebar {
                  display: flex;
                  flex-direction: column;
                  gap: 0.375rem;
                }
                .category-btn {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  padding: 0.625rem 0.875rem;
                  border-radius: 8px;
                  border: 1px solid transparent;
                  background: transparent;
                  color: var(--color-text-muted);
                  font-size: 0.8125rem;
                  font-weight: 600;
                  cursor: pointer;
                  text-align: left;
                  transition: all 0.15s ease;
                }
                .category-btn:hover {
                  background: var(--color-bg-secondary);
                  color: var(--color-text);
                }
                .category-btn.active {
                  background: #fef2f2;
                  border-color: #fecaca;
                  color: #BD1D2D;
                }
                .category-btn.active.gdrive,
                .category-btn.active.excel,
                .category-btn.active.image {
                  background: #f1f5f9;
                  border-color: #cbd5e1;
                  color: #0F172A;
                }
                .category-btn.active.pdf {
                  background: #fef2f2;
                  border-color: #fecaca;
                  color: #BD1D2D;
                }
                .category-badge {
                  font-size: 0.72rem;
                  opacity: 0.85;
                }
                .table-container {
                  background: var(--color-surface);
                  border: 1px solid #E2E8F0;
                  border-radius: 16px;
                  overflow-x: auto;
                  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
                }
                .doc-table {
                  width: 100%;
                  border-collapse: collapse;
                  text-align: left;
                  font-size: 0.8125rem;
                }
                .doc-table th {
                  padding: 0.875rem 1rem;
                  font-weight: 700;
                  color: var(--color-text-muted);
                  background: var(--color-bg-secondary);
                  border-bottom: 1px solid var(--color-border-light);
                }
                .doc-table td {
                  padding: 0.75rem 1rem;
                  border-bottom: 1px solid var(--color-border-light);
                  vertical-align: middle;
                }
                .doc-table tr:last-child td {
                  border-bottom: none;
                }
                .doc-row:hover {
                  background-color: var(--color-bg-secondary);
                }
                @media (max-width: 768px) {
                  .project-docs-container {
                    padding: 0.5rem !important;
                    gap: 0.75rem;
                  }
                  .project-docs-top-card {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 1rem;
                    padding: 0.75rem;
                  }
                  .explorer-layout {
                    grid-template-columns: 1fr;
                    gap: 0.75rem;
                  }
                  .category-sidebar {
                    flex-direction: row;
                    overflow-x: auto;
                    padding-bottom: 8px;
                    gap: 0.5rem;
                    border-bottom: 1px solid var(--color-border-light);
                    -webkit-overflow-scrolling: touch;
                  }
                  .category-btn {
                    padding: 0.5rem 0.875rem !important;
                    border-radius: 100px !important;
                    background: var(--color-bg-secondary) !important;
                    border: 1px solid var(--color-border-light) !important;
                    font-size: 0.75rem !important;
                    flex-shrink: 0;
                    display: inline-flex !important;
                    alignItems: center;
                    gap: 6px;
                    justify-content: center !important;
                  }
                  .category-btn.active {
                    background: #BD1D2D !important;
                    color: #fff !important;
                    border-color: #BD1D2D !important;
                  }
                  .category-btn.active .category-badge {
                    background: rgba(255, 255, 255, 0.2) !important;
                    color: #fff !important;
                  }
                  .category-btn .category-badge {
                    background: var(--color-border-light);
                    color: var(--color-text-muted);
                    padding: 1px 6px;
                    border-radius: 100px;
                    font-size: 0.68rem;
                    margin-left: 2px;
                    opacity: 1 !important;
                  }
                  .doc-table th:nth-child(3),
                  .doc-table td:nth-child(3),
                  .doc-table th:nth-child(4),
                  .doc-table td:nth-child(4) {
                    display: none;
                  }
                  .doc-table th {
                    padding: 0.625rem 0.5rem !important;
                  }
                  .doc-table td {
                    padding: 0.5rem 0.5rem !important;
                  }
                }
              `}</style>

                <div className="project-docs-layout">
                  {/* Top Horizontal Card: Project Info & Folder Links */}
                  <div className="project-docs-top-card">
                    {/* Left part: Project details */}
                    <div style={{ flex: 1, minWidth: '280px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <Building2 size={15} style={{ color: '#BD1D2D' }} />
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#BD1D2D', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dự Án Đang Xem</span>
                        <span style={{ background: 'var(--color-bg-secondary)', padding: '1px 6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text)', border: '1px solid var(--color-border-light)', marginLeft: '8px' }}>
                          {selectedProj?.code || 'N/A'}
                        </span>
                      </div>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-text)' }}>
                        {selectedProj?.name || 'Thông tin chương trình'}
                      </h3>
                      {selectedProj?.location && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          <MapPin size={12} style={{ color: 'var(--color-text-muted)' }} />
                          <span>{selectedProj.location}</span>
                        </div>
                      )}
                    </div>

                    {/* Right part: Folders & Links rendered horizontally */}
                    {selectedProj?.folder_path && parseFolderPaths(selectedProj.folder_path).length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {parseFolderPaths(selectedProj.folder_path).map((f, idx) => {
                          const isGdrive = f.type === 'link';
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                if (!isGdrive && selectedProjectId) {
                                  handleOpenFolderModal(f.path, selectedProjectId);
                                } else if (isGdrive) {
                                  const safeDriveUrl = sanitizeExternalUrl(f.path, { allowRelative: false, allowMailTel: false });
                                  if (safeDriveUrl) {
                                    window.open(safeDriveUrl, '_blank', 'noopener,noreferrer');
                                  } else {
                                    addToast('Đường dẫn Google Drive không hợp lệ', 'error');
                                  }
                                }
                              }}
                              style={{
                                padding: '0.5rem 0.875rem',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                background: 'var(--color-bg-secondary)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                height: '38px'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.borderColor = '#BD1D2D';
                                e.currentTarget.style.backgroundColor = 'var(--color-surface)';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.borderColor = '#E2E8F0';
                                e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)';
                              }}
                            >
                              <div style={{
                                width: 24,
                                height: 24,
                                borderRadius: '4px',
                                background: isGdrive ? '#f1f5f9' : '#fef2f2',
                                color: isGdrive ? '#334155' : '#BD1D2D',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                {isGdrive ? <HardDrive size={13} /> : <Folder size={13} />}
                              </div>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                {isGdrive ? 'Google Drive' : 'Thư mục tài liệu'}
                              </span>
                              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
                                Mở <ExternalLink size={9} />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Main Content Area: Documents Explorer */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Danh sách tài liệu ({combinedDocs.length})
                      </span>
                      {canManageDocs && (
                        <label style={{ cursor: 'pointer', margin: 0 }}>
                          <div className="btn primary sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '30px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, padding: '0 12px', background: 'var(--color-primary)', color: '#fff', border: 'none' }}>
                            <Upload size={14} />
                            <span>{uploadingDoc ? 'Đang tải...' : 'Tải tài liệu'}</span>
                          </div>
                          <input type="file" disabled={uploadingDoc} onChange={handleUploadFile} style={{ display: 'none' }} />
                        </label>
                      )}
                    </div>

                    {(() => {
                      const getCount = (cat: string) => {
                        return combinedDocs.filter(doc => {
                          if (cat === 'all') return true;
                          const ext = String(doc.name || '').split('.').pop()?.toLowerCase();
                          if (cat === 'gdrive') return doc.isLinkedOnly;
                          if (cat === 'pdf') return ext === 'pdf';
                          if (cat === 'excel') return ['xls', 'xlsx', 'csv'].includes(ext || '');
                          if (cat === 'image') return ['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext || '');
                          if (cat === 'other') {
                            return !doc.isLinkedOnly && ext !== 'pdf' && !['xls', 'xlsx', 'csv'].includes(ext || '') && !['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext || '');
                          }
                          return true;
                        }).length;
                      };

                      const filteredDocs = combinedDocs.filter(doc => {
                        if (docFilterCategory === 'all') return true;
                        const ext = String(doc.name || '').split('.').pop()?.toLowerCase();
                        if (docFilterCategory === 'gdrive') return doc.isLinkedOnly;
                        if (docFilterCategory === 'pdf') return ext === 'pdf';
                        if (docFilterCategory === 'excel') return ['xls', 'xlsx', 'csv'].includes(ext || '');
                        if (docFilterCategory === 'image') return ['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext || '');
                        if (docFilterCategory === 'other') {
                          return !doc.isLinkedOnly && ext !== 'pdf' && !['xls', 'xlsx', 'csv'].includes(ext || '') && !['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext || '');
                        }
                        return true;
                      });

                      return (
                        <div className="explorer-layout">
                          {/* Categories Sidebar */}
                          <div className="category-sidebar">
                            {(getCount('all') > 0 || combinedDocs.length === 0) && (
                              <button
                                type="button"
                                onClick={() => setDocFilterCategory('all')}
                                className={`category-btn ${docFilterCategory === 'all' ? 'active' : ''}`}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Layers size={14} />
                                  <span>Tất cả tài liệu</span>
                                </div>
                                <span className="category-badge">({getCount('all')})</span>
                              </button>
                            )}

                            {getCount('gdrive') > 0 && (
                              <button
                                type="button"
                                onClick={() => setDocFilterCategory('gdrive')}
                                className={`category-btn gdrive ${docFilterCategory === 'gdrive' ? 'active' : ''}`}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <HardDrive size={14} />
                                  <span>Google Drive</span>
                                </div>
                                <span className="category-badge">({getCount('gdrive')})</span>
                              </button>
                            )}

                            {getCount('pdf') > 0 && (
                              <button
                                type="button"
                                onClick={() => setDocFilterCategory('pdf')}
                                className={`category-btn pdf ${docFilterCategory === 'pdf' ? 'active' : ''}`}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <FileText size={14} />
                                  <span>Tài liệu PDF</span>
                                </div>
                                <span className="category-badge">({getCount('pdf')})</span>
                              </button>
                            )}

                            {getCount('excel') > 0 && (
                              <button
                                type="button"
                                onClick={() => setDocFilterCategory('excel')}
                                className={`category-btn excel ${docFilterCategory === 'excel' ? 'active' : ''}`}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <FileSpreadsheet size={14} />
                                  <span>Bảng tính Excel</span>
                                </div>
                                <span className="category-badge">({getCount('excel')})</span>
                              </button>
                            )}

                            {getCount('image') > 0 && (
                              <button
                                type="button"
                                onClick={() => setDocFilterCategory('image')}
                                className={`category-btn image ${docFilterCategory === 'image' ? 'active' : ''}`}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Paperclip size={14} />
                                  <span>Hình ảnh</span>
                                </div>
                                <span className="category-badge">({getCount('image')})</span>
                              </button>
                            )}

                            {getCount('other') > 0 && (
                              <button
                                type="button"
                                onClick={() => setDocFilterCategory('other')}
                                className={`category-btn ${docFilterCategory === 'other' ? 'active' : ''}`}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Info size={14} />
                                  <span>Tài liệu khác</span>
                                </div>
                                <span className="category-badge">({getCount('other')})</span>
                              </button>
                            )}
                          </div>

                          {/* List/Table view */}
                          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {docsLoading ? (
                              <div style={{
                                textAlign: 'center',
                                padding: '3.5rem 0',
                                color: 'var(--color-text-muted)',
                                background: 'var(--color-bg-secondary)',
                                borderRadius: '12px',
                                border: '1px solid #E2E8F0',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.625rem'
                              }}>
                                <RefreshCw size={22} className="spin" style={{ color: '#BD1D2D' }} />
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Đang tải danh sách tài liệu...</span>
                              </div>
                            ) : filteredDocs.length === 0 ? (
                              <div style={{
                                textAlign: 'center',
                                padding: '4rem 0',
                                color: 'var(--color-text-muted)',
                                background: 'var(--color-bg-secondary)',
                                borderRadius: '12px',
                                border: '2px dashed var(--color-border-light)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.75rem'
                              }}>
                                <div style={{
                                  width: 48,
                                  height: 48,
                                  borderRadius: '50%',
                                  background: 'var(--color-surface)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--color-text-muted)',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                                }}>
                                  <FileText size={20} style={{ opacity: 0.5 }} />
                                </div>
                                <div>
                                  <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)' }}>Không có tài liệu</p>
                                  <p style={{ margin: '2px 0 0', fontSize: '0.725rem', color: 'var(--color-text-muted)' }}>Danh mục này hiện chưa có dữ liệu</p>
                                </div>
                              </div>
                            ) : (
                              <div className="table-container no-scrollbar">
                                <table className="doc-table">
                                  <thead>
                                    <tr>
                                      <th style={{ width: '45%' }}>Tên tài liệu</th>
                                      <th>Nguồn</th>
                                      <th>Dung lượng</th>
                                      <th>Người tải</th>
                                      <th style={{ textAlign: 'right' }}>Thao tác</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredDocs.map(doc => {
                                      const isLink = doc.isLinkedOnly;
                                      const docKey = `${isLink ? 'link' : 'direct'}-${doc.id}`;
                                      const isEditing = editingDocKey === docKey;
                                      const ext = String(doc.name || '').split('.').pop()?.toLowerCase();

                                      let icon = <FileText size={16} />;
                                      let iconColor = '#334155';
                                      let iconBg = '#f1f5f9';

                                      if (isLink) {
                                        icon = <ExternalLink size={16} />;
                                        iconColor = '#334155';
                                        iconBg = '#f1f5f9';
                                      } else if (ext === 'pdf') {
                                        icon = <FileText size={16} />;
                                        iconColor = '#BD1D2D';
                                        iconBg = '#fef2f2';
                                      } else if (['xls', 'xlsx', 'csv'].includes(ext || '')) {
                                        icon = <FileSpreadsheet size={16} />;
                                        iconColor = '#334155';
                                        iconBg = '#f1f5f9';
                                      } else if (['doc', 'docx'].includes(ext || '')) {
                                        icon = <FileText size={16} />;
                                        iconColor = '#334155';
                                        iconBg = '#f1f5f9';
                                      } else if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext || '')) {
                                        icon = <Paperclip size={16} />;
                                        iconColor = '#BD1D2D';
                                        iconBg = '#fef2f2';
                                      }

                                      const docDateStr = doc.created_at ? formatDateVN(doc.created_at) : '—';
                                      const docSizeStr = doc.file_size ? `${(Number(doc.file_size) / 1024 / 1024).toFixed(2)} MB` : '—';

                                      return (
                                        <tr key={docKey} className="doc-row">
                                          <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                              <div style={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: '6px',
                                                background: iconBg,
                                                color: iconColor,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0
                                              }}>
                                                {icon}
                                              </div>
                                              <div style={{ minWidth: 0, flex: 1 }}>
                                                {isEditing ? (
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                                                    <input
                                                      type="text"
                                                      className="form-input"
                                                      value={editDocNameVal}
                                                      onChange={e => setEditDocNameVal(e.target.value)}
                                                      style={{
                                                        fontSize: '0.8125rem',
                                                        padding: '4px 8px',
                                                        height: '28px',
                                                        borderRadius: '6px',
                                                        flex: 1
                                                      }}
                                                      autoFocus
                                                      onKeyDown={e => {
                                                        if (e.key === 'Enter') handleSaveRenameDoc(doc);
                                                        if (e.key === 'Escape') setEditingDocKey(null);
                                                      }}
                                                    />
                                                    <button
                                                      type="button"
                                                      onClick={() => handleSaveRenameDoc(doc)}
                                                      className="btn success sm"
                                                      style={{ minWidth: 'auto', padding: '4px 8px', height: '28px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px' }}
                                                    >
                                                      <Check size={12} />
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => setEditingDocKey(null)}
                                                      className="btn secondary sm"
                                                      style={{ minWidth: 'auto', padding: '4px 8px', height: '28px', borderRadius: '6px' }}
                                                    >
                                                      <X size={12} />
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <span
                                                    style={{ fontWeight: 600, color: 'var(--color-text)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                    title={doc.name}
                                                  >
                                                    {doc.name}
                                                  </span>
                                                )}
                                                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', display: 'block', marginTop: '2px' }}>
                                                  Ngày tạo: {docDateStr}
                                                </span>
                                              </div>
                                            </div>
                                          </td>
                                          <td>
                                            <span style={{
                                              fontSize: '0.68rem',
                                              padding: '2px 8px',
                                              borderRadius: '4px',
                                              background: isLink ? '#f1f5f9' : '#fef2f2',
                                              color: isLink ? '#334155' : '#BD1D2D',
                                              fontWeight: 700,
                                              display: 'inline-block'
                                            }}>
                                              {isLink ? 'Liên kết' : 'Đính kèm'}
                                            </span>
                                          </td>
                                          <td style={{ color: 'var(--color-text-muted)' }}>
                                            {docSizeStr}
                                          </td>
                                          <td style={{ color: 'var(--color-text)', fontWeight: 500 }}>
                                            {doc.uploaded_by_name}
                                          </td>
                                          <td style={{ textAlign: 'right' }}>
                                            {!isEditing && (
                                              <div style={{ display: 'inline-flex', gap: '0.375rem' }}>
                                                {canManageDocs && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleRenameDoc(doc)}
                                                    className="btn secondary sm"
                                                    style={{ height: '28px', width: '28px', padding: 0, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 'auto', border: '1px solid var(--color-border-light)', background: 'var(--color-surface)' }}
                                                    title="Đổi tên"
                                                  >
                                                    <Edit size={12} />
                                                  </button>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    if (doc.isLinkedOnly) {
                                                      const safeDocUrl = resolveAttachmentUrl(doc.file_path);
                                                      if (safeDocUrl) {
                                                        window.open(safeDocUrl, '_blank', 'noopener,noreferrer');
                                                      } else {
                                                        addToast('Đường dẫn tài liệu không hợp lệ', 'error');
                                                      }
                                                    } else {
                                                      handleDownloadDoc(doc.id, doc.name);
                                                    }
                                                  }}
                                                  className="btn secondary sm"
                                                  style={{ height: '28px', width: '28px', padding: 0, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 'auto', border: '1px solid var(--color-border-light)', background: 'var(--color-surface)', color: 'var(--color-primary)' }}
                                                  title="Tải về"
                                                >
                                                  <Download size={12} />
                                                </button>
                                                {canManageDocs && !doc.isLinkedOnly && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleDeleteDoc(doc.id)}
                                                    className="btn danger sm"
                                                    style={{ height: '28px', width: '28px', padding: 0, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 'auto', border: 'none', backgroundColor: '#fef2f2', color: '#BD1D2D' }}
                                                    title="Xóa"
                                                  >
                                                    <Trash2 size={12} />
                                                  </button>
                                                )}
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Footer */}
                <div style={{ borderTop: '1px solid var(--color-border-light)', marginTop: '0.5rem', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn secondary sm" style={{ borderRadius: '100px', fontWeight: 700 }} onClick={() => setIsDocsModalOpen(false)}>Đóng</button>
                </div>
              </div>
            );
          },
          '1000px',
          undefined,
          false,
          false,
          false,
          'projects-docs-drawer'
        )}

        {/* Campaign Create/Edit Modal (converted to Drawer) */}
        {isCampaignModalOpen && renderDrawer(
          isCampaignModalOpen,
          () => {
            setIsCampaignModalOpen(false);
            setEditingCampaign(null);
            clearEntityParamsFromUrl();
          },
          campaignModalMode === 'view'
            ? `Chi tiết Khóa học: ${editingCampaign?.name || ''}`
            : editingCampaign?.id ? 'Chỉnh sửa Khóa học' : 'Thêm Khóa học mới',
          <>
            {campaignModalMode === 'view' ? (
              renderCampaignViewDrawer()
            ) : (
              <form id="campaign-form" onSubmit={handleSaveCampaign} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1.5rem', alignItems: 'start' }}>
                <input
                  type="file"
                  ref={campaignQuickUploadInputRef}
                  style={{ display: 'none' }}
                  onChange={e => handleQuickUpload(e, editingCampaign?.project_id || undefined, 'campaign')}
                />
                {/* Left Column (3/5) */}
                <div style={{ flex: 3, width: isMobile ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                  {/* Card 1: Thông tin cơ bản */}
                  <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid #E2E8F0',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                  }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#BD1D2D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thông tin cơ bản</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 600 }}>Tên Chiến dịch <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Ví dụ: MBA Intake K20"
                          value={editingCampaign?.name || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setEditingCampaign((prev: any) => ({ ...(prev || {}), name: val }));
                          }}
                          required
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                          <label className="form-label" style={{ fontWeight: 600 }}>Ngày bắt đầu</label>
                          <VietnameseDateInput
                            value={editingCampaign?.start_date || ''}
                            onChange={val => setEditingCampaign((prev: any) => ({ ...(prev || {}), start_date: val }))}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ fontWeight: 600 }}>Ngày kết thúc</label>
                          <VietnameseDateInput
                            value={editingCampaign?.end_date || ''}
                            onChange={val => setEditingCampaign((prev: any) => ({ ...(prev || {}), end_date: val }))}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 600 }}>Website hoặc Link tham khảo (GG Sheets, tài liệu...)</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Dán đường dẫn link website hoặc Google Sheets tham khảo..."
                          value={editingCampaign?.reference_url || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setEditingCampaign((prev: any) => ({ ...(prev || {}), reference_url: val }));
                          }}
                        />
                      </div>

                      <div>
                        <label className="form-label" style={{ fontWeight: 600 }}>Trạng thái chiến dịch</label>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.875rem', background: 'var(--color-bg-light)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)', height: '44px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: editingCampaign?.status === 'active' ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                            {editingCampaign?.status === 'active' ? 'Hoạt động' : 'Tạm dừng'}
                          </span>
                          <ToggleSwitch
                            checked={editingCampaign?.status === 'active'}
                            onChange={checked => setEditingCampaign((prev: any) => ({ ...(prev || {}), status: checked ? 'active' : 'inactive' }))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Mô tả */}
                  <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid #E2E8F0',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                  }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Mô tả chiến dịch</label>
                    <textarea
                      className="form-input"
                      placeholder="Mô tả mục tiêu, nguồn lead, ngân sách..."
                      rows={3}
                      value={editingCampaign?.description || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setEditingCampaign((prev: any) => ({ ...(prev || {}), description: val }));
                      }}
                      style={{ minHeight: '80px', padding: '10px 14px' }}
                    />
                  </div>

                </div>

                {/* Right Column (2/5) */}
                <div style={{ flex: 2, width: isMobile ? '100%' : 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                  {/* Card 1: Nhân sự & Chương trình liên kết */}
                  <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid #E2E8F0',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                  }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#BD1D2D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nhân sự &amp; Chương trình</h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 600 }}>Chương trình liên kết</label>
                        {(() => {
                          const projectPool = allProjectsLookup.length > 0 ? allProjectsLookup : projects;
                          return (
                            <CustomSelect
                              searchable={true}
                              options={ensureArray<any>(projectPool).map(p => ({ value: String(p.id), label: `${p.name} (${p.code})` }))}
                              value={editingCampaign?.project_id ? String(editingCampaign.project_id) : ''}
                              onChange={val => {
                                const selectedId = val ? Number(val) : null;
                                const matchedName = val ? (ensureArray<any>(projectPool).find(p => String(p.id) === String(val))?.name || '') : '';
                                setEditingCampaign((prev: any) => ({
                                  ...(prev || {}),
                                  project_id: selectedId,
                                  project_ids: matchedName
                                }));
                              }}
                              placeholder="Chọn chương trình..."
                            />
                          );
                        })()}
                      </div>

                      <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 600 }}>Manager phụ trách chính</label>
                        <CustomSelect
                          multiple
                          searchable={true}
                          showAvatars={true}
                          options={ensureArray<any>(users)
                            .filter(u => isManagement(u) || isExecutive(u) || isAcademic(u))
                            .map(u => ({ value: String(u.id), label: u.full_name || u.fullname || u.username, avatar: u.avatar_url || u.avatar }))
                          }
                          value={parseIds(editingCampaign?.manager_ids)}
                          onChange={val => setEditingCampaign((prev: any) => ({ ...(prev || {}), manager_ids: Array.isArray(val) ? val.join(',') : String(val) }))}
                          placeholder="Chọn manager..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Tài liệu & Thư mục */}
                  <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid #E2E8F0',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                  }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#BD1D2D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thư mục &amp; Tài liệu</h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 600 }}>Đường dẫn Folder liên kết</label>
                        <div style={{ display: 'inline-flex', width: '100%', padding: '3px', borderRadius: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', gap: '2px', marginBottom: '12px' }}>
                          <button
                            type="button"
                            onClick={() => setCampaignFolderLinkType('link')}
                            style={{
                              flex: 1,
                              height: '32px',
                              padding: '0 12px',
                              borderRadius: '7px',
                              border: 'none',
                              background: campaignFolderLinkType === 'link' ? '#ffffff' : 'transparent',
                              color: campaignFolderLinkType === 'link' ? '#BD1D2D' : '#64748b',
                              fontSize: '0.75rem',
                              fontWeight: campaignFolderLinkType === 'link' ? 700 : 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              boxShadow: campaignFolderLinkType === 'link' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                            }}
                          >
                            Dán Link (Drive...)
                          </button>
                          <button
                            type="button"
                            onClick={() => setCampaignFolderLinkType('select')}
                            style={{
                              flex: 1,
                              height: '32px',
                              padding: '0 12px',
                              borderRadius: '7px',
                              border: 'none',
                              background: campaignFolderLinkType === 'select' ? '#ffffff' : 'transparent',
                              color: campaignFolderLinkType === 'select' ? '#BD1D2D' : '#64748b',
                              fontSize: '0.75rem',
                              fontWeight: campaignFolderLinkType === 'select' ? 700 : 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              boxShadow: campaignFolderLinkType === 'select' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                            }}
                          >
                            Chọn thư mục có sẵn
                          </button>
                        </div>

                        {campaignFolderLinkType === 'link' ? (
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Dán link thư mục Google Drive..."
                            value={editingCampaign?.folder_path || ''}
                            onChange={e => {
                              const val = e.target.value;
                              setEditingCampaign((prev: any) => ({ ...(prev || {}), folder_path: val }));
                            }}
                          />
                        ) : (
                          <CustomSelect
                            options={fileCategories.map(cat => ({ value: cat.label, label: cat.label }))}
                            value={editingCampaign?.folder_path || ''}
                            onChange={val => setEditingCampaign((prev: any) => ({ ...(prev || {}), folder_path: String(val || '') }))}
                            placeholder="Chọn thư mục từ /files..."
                          />
                        )}
                      </div>

                      <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <label className="form-label" style={{ fontWeight: 600, marginBottom: 0 }}>Tài liệu đính kèm</label>
                          {canManageDocs && (
                            <button
                              type="button"
                              onClick={() => campaignQuickUploadInputRef.current?.click()}
                              disabled={uploadingDoc}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#BD1D2D',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: 0
                              }}
                            >
                              {uploadingDoc ? (
                                <RefreshCw className="spin" size={12} />
                              ) : (
                                <Plus size={12} />
                              )}
                              <span>Tải tệp mới</span>
                            </button>
                          )}
                        </div>
                        <CustomSelect
                          multiple
                          searchable={true}
                          options={ensureArray(allFiles).map(f => ({ value: String(f.id), label: f.name }))}
                          value={parseIds(editingCampaign?.document_ids)}
                          onChange={val => setEditingCampaign((prev: any) => ({ ...(prev || {}), document_ids: Array.isArray(val) ? val.join(',') : String(val) }))}
                          placeholder="Chọn tài liệu..."
                        />
                      </div>
                    </div>
                  </div>

                </div>
              </form>
            )}
          </>,
          '850px',
          campaignModalMode === 'view' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {canEditCampaign(editingCampaign) && (
                <button
                  type="button"
                  className="btn primary sm hover-lift"
                  style={{
                    borderRadius: '100px',
                    fontWeight: 700,
                    background: 'var(--color-primary)',
                    border: 'none',
                    height: '38px',
                    padding: '0 16px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onClick={() => setCampaignModalMode('edit')}
                >
                  <Edit size={14} />
                  <span>Chỉnh sửa</span>
                </button>
              )}
              {editingCampaign?.id && (
                <button
                  type="button"
                  className="btn outline sm hover-lift"
                  style={{
                    color: '#BD1D2D',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    height: '38px',
                    borderRadius: '10px',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    const publicLink = `/public-schedule/course/${editingCampaign.id}`;
                    window.open(publicLink, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <Calendar size={15} />
                  <span>Xem lịch khóa học (Public)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setCampaignDrawerTab(campaignDrawerTab === 'details' ? 'changelog' : 'details')}
                style={{
                  border: 'none',
                  background: campaignDrawerTab === 'changelog' ? 'rgba(100, 116, 139, 0.08)' : 'transparent',
                  cursor: 'pointer',
                  color: campaignDrawerTab === 'changelog' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                  height: '38px',
                  width: '38px'
                }}
                title={campaignDrawerTab === 'details' ? 'Xem lịch sử thay đổi' : 'Xem thông tin chi tiết'}
                className="hover-lift"
              >
                <History size={20} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="submit"
                form="campaign-form"
                className="btn primary sm hover-lift"
                disabled={isSaving}
                style={{ borderRadius: '100px', fontWeight: 700, background: 'var(--color-primary)', border: 'none', opacity: isSaving ? 0.7 : 1, cursor: isSaving ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {isSaving && <RefreshCw size={14} className="spin" />}
                <span>{isSaving ? 'Đang lưu...' : 'Lưu chiến dịch'}</span>
              </button>
            </div>
          ),
          true,
          false,
          false,
          'projects-campaign-drawer'
        )}
        {/* Explanation of Projects & Campaigns Modal */}
        {showInfoModal && (
        <CustomModal
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
          title={t("Hướng dẫn Thiết lập Chương trình & Chiến dịch & Roster")}
          width="760px"
        >
          <div style={{ padding: '0.25rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '0.875rem 1rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 12
            }}>
              <Info size={24} color="#BD1D2D" style={{ flexShrink: 0 }} />
              <p style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 0 }}>
                {t("Chương trình và Chiến dịch marketing là nguồn phát sinh dữ liệu học viên tiềm năng (lead). Việc cấu hình đúng đắn quyết định đường đi của lead và đội ngũ tiếp nhận tư vấn:")}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Chương trình */}
              <div style={{
                display: 'flex',
                gap: 12,
                padding: '1rem',
                background: 'var(--color-surface)',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
              }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Building2 size={18} />
                </div>
                <div>
                  <h5 style={{ fontSize: '0.875rem', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--color-text)' }}>
                    {t("1. Quản lý Chương trình & Tài liệu (Projects & Drive)")}
                  </h5>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.45 }}>
                    • <strong>Chương trình (Project)</strong>: Chương trình đào tạo, ngành học hoặc dự án hợp tác tại IDEAS. Mã chương trình (Code) là duy nhất dùng để so khớp UTM parameter khi lead đổ về.<br />
                    • <strong>Tài liệu chương trình</strong>: Lưu trữ tài liệu (Brochure, khung chương trình, quy chế học vụ) để TVV truy cập nhanh từ Workspace.
                  </p>
                </div>
              </div>

              {/* Chiến dịch */}
              <div style={{
                display: 'flex',
                gap: 12,
                padding: '1rem',
                background: 'var(--color-surface)',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
              }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Layers size={18} />
                </div>
                <div>
                  <h5 style={{ fontSize: '0.875rem', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--color-text)' }}>
                    {t("2. Chiến dịch / Khóa học (Campaigns & Cohorts)")}
                  </h5>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.45 }}>
                    • <strong>Chiến dịch / Khóa học</strong>: Đại diện cho các đợt tuyển sinh, khóa học hoặc chiến dịch tiếp thị chạy cho chương trình (vd: MBA Intake, FB Ads). Dùng để phân loại nguồn gốc lead, quản lý lịch học và tính toán hiệu quả vận hành.
                  </p>
                </div>
              </div>

              {/* Roster */}
              <div style={{
                display: 'flex',
                gap: 12,
                padding: '1rem',
                background: 'var(--color-surface)',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
              }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Users size={18} />
                </div>
                <div>
                  <h5 style={{ fontSize: '0.875rem', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--color-text)' }}>
                    {t("3. Đội ngũ tiếp nhận & Roster (Project Roster)")}
                  </h5>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.45 }}>
                    • <strong>Roster</strong>: Danh sách tư vấn viên được kích hoạt tham gia tư vấn chương trình này. <strong>Hệ thống chỉ phân bổ lead cho TVV có tên trong Roster của Chương trình đó</strong>, đảm bảo lead được giao đúng người phụ trách chuyên môn.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', gap: '0.75rem', borderTop: '1px solid var(--color-border-light)', paddingTop: '1rem' }}>
            <button type="button" className="btn primary" onClick={() => setShowInfoModal(false)} style={{ minWidth: 100 }}>{t("Đồng ý")}</button>
          </div>
        </CustomModal>
        )}

        {/* Folder Contents Modal */}
        {showFolderModal && (
        <CustomModal
          isOpen={showFolderModal}
          onClose={() => setShowFolderModal(false)}
          title={`Thư mục: ${folderModalPath}`}
          width="800px"
        >
          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
                Danh sách tài liệu thuộc thư mục chương trình này ({folderFiles.length} tệp tin):
              </span>
              {canManageDocs && folderModalProjectId && (
                <div>
                  <input
                    type="file"
                    id="folder-modal-upload"
                    style={{ display: 'none' }}
                    onChange={(e) => folderModalProjectId && handleQuickUpload(e, folderModalProjectId, 'folder')}
                  />
                  <button
                    type="button"
                    disabled={uploadingDoc}
                    onClick={() => document.getElementById('folder-modal-upload')?.click()}
                    className="btn primary sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, borderRadius: '8px', padding: '6px 12px', opacity: uploadingDoc ? 0.7 : 1 }}
                  >
                    {uploadingDoc ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}
                    {uploadingDoc ? 'Đang tải...' : 'Tải tệp lên'}
                  </button>
                </div>
              )}
            </div>

            {folderFilesLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
                <RefreshCw className="spin" size={24} color="var(--color-text-muted)" />
              </div>
            ) : folderFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border-light)', borderRadius: '12px', background: 'var(--color-bg-light)' }}>
                <Folder size={32} style={{ color: 'var(--color-text-light)', marginBottom: '8px' }} />
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Thư mục trống</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Chưa có tài liệu nào được tải lên cho chương trình này.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
                {ensureArray<any>(folderFiles).map((fileObj: any) => {
                  const safeFileUrl = resolveAttachmentUrl(fileObj.file_path || fileObj.url);
                  return (
                    <div
                      key={fileObj.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'var(--color-bg-light)',
                        border: '1px solid var(--color-border-light)',
                        borderRadius: '12px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                        <FileText size={16} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                        <span style={{ fontWeight: 650, color: 'var(--color-text)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fileObj.name}>
                          {fileObj.name}
                        </span>
                      </div>
                      {safeFileUrl && (
                        <a
                          href={safeFileUrl}
                          download={fileObj.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn outline sm"
                          style={{ fontSize: '0.75rem', height: '28px', padding: '0 10px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, borderRadius: '6px' }}
                        >
                          <Download size={12} />
                          Tải về
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CustomModal>
        )}

        {selectedTaskForDrawer && (
          <Suspense fallback={null}>
            <WorkspaceTaskDrawer
              isOpen={!!selectedTaskForDrawer}
              onClose={() => {
                setSelectedTaskForDrawer(null);
                const params = new URLSearchParams(window.location.search);
                params.delete('task_id');
                params.delete('open_task_id');
                params.delete('subtask_id');
                params.delete('highlight_comment_id');
                params.delete('comment_id');
                params.delete('highlight_activity_id');
                navigate(`${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`, { replace: true });
              }}
              task={selectedTaskForDrawer}
              onUpdate={(updatedTask?: any) => {
                if (updatedTask && updatedTask.id && (updatedTask.__duplicatedFromId || updatedTask.duplicated_from_id)) {
                  setSelectedTaskForDrawer({ ...updatedTask, comments: [], comment_count: 0 });
                }
                window.dispatchEvent(new CustomEvent('task-updated'));
              }}
              users={users}
              onOpenContact={(contactId) => {
                if (contactId) openCustomerDrawer(Number(contactId), 'info');
              }}
              zIndex={2147483632}
            />
          </Suspense>
        )}

        {/* Dedicated Subject Configuration Modal */}
        {(() => {
          if (!configuringSubjectId || !editingCampaign) return null;
          const sub = subjects.find(s => s.id === configuringSubjectId);
          if (!sub) return null;

          const canEdit = canConfigureAcademic;

          const lecturerSelectOptions = [
            { value: '', label: '-- Chọn giảng viên --' },
            ...lecturerOptions.map(opt => {
              const info = resolveLecturerInfo(opt.value);
              return {
                value: opt.value,
                label: opt.label,
                avatar: info?.avatar ? resolveAttachmentUrl(info.avatar) : '',
                sublabel: opt.kind === 'external'
                  ? (info?.phone || info?.email || 'Giảng viên ngoài')
                  : 'Nhân sự nội bộ'
              };
            })
          ];

          const handleUpdateSubjectInModal = (fields: any) => {
            setSubjects(prev => ensureArray<any>(prev).map(s => s.id === sub.id ? { ...s, ...fields } : s));
          };

          const handleAddHostSession = () => {
            const sessions = ensureArray<any>(sub.host_sessions);
            const nextSessionNum = sessions.length + 1;
            const newSession = {
              id: makeUniqueId('session'),
              name: `Session ${nextSessionNum}`,
              date: '',
              time_start: '20:00',
              time_end: '22:00',
              lecturer_name: ''
            };
            handleUpdateSubjectInModal({ host_sessions: [...sessions, newSession] });
          };

          const handleAddSeminar = () => {
            const seminars = ensureArray<any>(sub.seminars);
            const newSem = {
              id: makeUniqueId('sem'),
              topic: '',
              date: '',
              time_slot: '8:30 – 11:30 & 13:30 – 16:30',
              lecturer_id: sub.lecturer_id || '',
              location: 'Trực tuyến qua Zoom'
            };
            handleUpdateSubjectInModal({ seminars: [...seminars, newSem] });
          };

          const handleAddAssignment = () => {
            const assignments = ensureArray<any>(sub.assignments);
            const newAsm = {
              id: makeUniqueId('asm'),
              name: '',
              due_date: ''
            };
            handleUpdateSubjectInModal({ assignments: [...assignments, newAsm] });
          };

          const handleSaveConfig = async () => {
            if (!editingCampaign?.id || isSaving || saveSubjectConfigInFlightRef.current) return;
            const rawAiLink = String(sub.ai_agent_link || '').trim();
            if (rawAiLink && !sanitizeExternalUrl(rawAiLink, { allowRelative: false, allowMailTel: false })) {
              addToast('Link AI Agent phải bắt đầu bằng https:// hoặc http://', 'error');
              return;
            }
            for (const linkField of [sub.zoom_link, sub.school_zoom_link, sub.seminar_zoom_link]) {
              const trimmedLink = String(linkField || '').trim();
              if (trimmedLink && !sanitizeExternalUrl(trimmedLink, { allowRelative: false, allowMailTel: false })) {
                addToast('Đường dẫn Zoom phải bắt đầu bằng https:// hoặc http://', 'error');
                return;
              }
            }
            try {
              saveSubjectConfigInFlightRef.current = true;
              setIsSaving(true);
              const serializedSubjects = JSON.stringify(subjects);
              const res = await fetchAPI(`campaigns/${editingCampaign.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                  subjects_json: serializedSubjects
                })
              });
              if (res.success) {
                addToast('Lưu cấu hình môn học thành công!', 'success');
                setEditingCampaign((prev: any) => prev ? { ...prev, subjects_json: serializedSubjects } : prev);
                loadCampaigns(true);
                setConfiguringSubjectId(null);
              } else {
                addToast(res.message || 'Lỗi lưu thông tin', 'error');
              }
            } catch (e: any) {
              addToast(e.message || 'Lỗi kết nối', 'error');
            } finally {
              saveSubjectConfigInFlightRef.current = false;
              setIsSaving(false);
            }
          };

          const saveButton = canEdit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn outline sm"
                style={{
                  borderRadius: '8px',
                  fontWeight: 700,
                  background: '#fef2f2',
                  color: '#BD1D2D',
                  border: '1px solid #fecaca',
                  height: '34px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '0 14px'
                }}
                onClick={() => setAnnouncingSubject(sub)}
              >
                <Send size={13} />
                Gửi TBCĐ (Email/Zalo)
              </button>
              <button
                type="button"
                className="btn primary sm"
                style={{ borderRadius: '8px', fontWeight: 700, background: 'var(--color-primary)', border: 'none', height: '34px', display: 'flex', alignItems: 'center', gap: '4px', padding: '0 16px', opacity: isSaving ? 0.7 : 1 }}
                disabled={isSaving}
                onClick={handleSaveConfig}
              >
                {isSaving ? 'Đang lưu...' : 'Lưu cấu hình'}
              </button>
            </div>
          ) : undefined;

          return renderDrawer(
            !!configuringSubjectId,
            () => setConfiguringSubjectId(null),
            `Cấu hình Lịch học: Môn ${sub.code || ''} - ${sub.name || 'Chưa đặt tên'}`,
            (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.25rem 0' }}>

                {/* Modal Basic Info Inputs */}
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', background: 'var(--color-bg-light)', padding: '16px 20px', borderRadius: '14px', border: '1px solid var(--color-border-light)' }}>
                  <div style={{ flex: '1 1 130px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Mã môn học</label>
                    <input
                      type="text"
                      placeholder="E0729"
                      disabled={!canEdit}
                      value={sub.code || ''}
                      onChange={e => handleUpdateSubjectInModal({ code: e.target.value })}
                      style={{ width: '100%', padding: '8px 14px', fontSize: '0.88rem', borderRadius: '10px', border: '1px solid var(--color-border-light)', height: '42px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                    />
                  </div>
                  <div style={{ flex: '2 1 250px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Tên môn học</label>
                    <input
                      type="text"
                      placeholder="Leadership Development"
                      disabled={!canEdit}
                      value={sub.name || ''}
                      onChange={e => handleUpdateSubjectInModal({ name: e.target.value })}
                      style={{ width: '100%', padding: '8px 14px', fontSize: '0.88rem', borderRadius: '10px', border: '1px solid var(--color-border-light)', height: '42px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                    />
                  </div>
                  <div style={{ flex: '1.5 1 200px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Giảng viên chuyên đề</label>
                    <CustomSelect
                      disabled={!canEdit}
                      options={lecturerSelectOptions}
                      value={sub.lecturer_id ? String(sub.lecturer_id) : ''}
                      onChange={val => handleUpdateSubjectInModal({ lecturer_id: String(val || '') })}
                      placeholder="Chọn giảng viên..."
                      searchable
                      showAvatars
                    />
                  </div>
                  <div style={{ flex: '1.5 1 220px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Link AI Agent hỗ trợ môn học</label>
                    <input
                      type="text"
                      placeholder="https://ai.your-domain.com/..."
                      disabled={!canEdit}
                      value={sub.ai_agent_link || ''}
                      onChange={e => handleUpdateSubjectInModal({ ai_agent_link: e.target.value })}
                      style={{ width: '100%', padding: '8px 14px', fontSize: '0.84rem', borderRadius: '10px', border: '1px solid var(--color-border-light)', height: '42px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                    />
                  </div>
                </div>

                {/* Modal Inner Tab Buttons */}
                <div style={{ 
                  display: 'flex', 
                  borderBottom: '1px solid var(--color-border-light)', 
                  gap: '1.5rem', 
                  paddingBottom: 0,
                  marginBottom: '1.25rem',
                  flexWrap: 'wrap'
                }}>
                  {[
                    { id: 'school', label: '1. Lịch học với trường', count: ensureArray(sub.host_sessions).length },
                    { id: 'seminar', label: '2. Lớp chuyên đề (IDEAS)', count: ensureArray(sub.seminars).length },
                    { id: 'zoom', label: '3. Zoom Meeting', count: (sub.zoom_link || sub.zoom_id || sub.zoom_pass || sub.school_zoom_link || sub.seminar_zoom_link) ? 1 : 0 },
                    { id: 'quiz', label: '4. Bài tập / Quiz / Bài thi', count: ensureArray(sub.assignments).length }
                  ].map(tabItem => (
                    <button
                      key={tabItem.id}
                      type="button"
                      onClick={() => setActiveConfigTab(tabItem.id as any)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '0 4px 10px 4px',
                        border: 'none',
                        background: 'transparent',
                        fontSize: '0.85rem',
                        fontWeight: 750,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        color: activeConfigTab === tabItem.id ? '#BD1D2D' : 'var(--color-text-muted)',
                        borderBottom: activeConfigTab === tabItem.id ? '2.5px solid #BD1D2D' : '2.5px solid transparent'
                      }}
                    >
                      <span>{tabItem.label}</span>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        padding: '2px 6px', 
                        background: activeConfigTab === tabItem.id ? '#BD1D2D' : 'var(--color-bg-light)', 
                        color: activeConfigTab === tabItem.id ? '#ffffff' : 'var(--color-text-muted)', 
                        borderRadius: '100px', 
                        marginLeft: '4px',
                        fontWeight: 700 
                      }}>
                        {tabItem.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Sub-tab Content Area */}
                <div style={{ minHeight: '480px', maxHeight: '650px', overflowY: 'auto', paddingRight: '4px' }}>

                  {/* Tab 1: School Sessions */}
                  {activeConfigTab === 'school' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Danh sách các buổi học trường (Host Sessions)</span>
                        {canEdit && (
                          <button type="button" className="btn secondary" style={{ height: '36px', padding: '0 16px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddHostSession}>
                            <Plus size={14} /> Thêm buổi học
                          </button>
                        )}
                      </div>

                      {ensureArray(sub?.host_sessions).length === 0 ? (
                        <div style={{ padding: '2.5rem', textAlign: 'center', background: 'var(--color-bg-light)', borderRadius: '12px', border: '1px dashed var(--color-border-light)' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Chưa thiết lập buổi học nào. Bấm "+ Thêm buổi học" để cấu hình.</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {ensureArray(sub?.host_sessions).map((hs: any, hsIdx: number) => {
                            const hsTime = `${hs.time_start || '20:00'} - ${hs.time_end || '22:00'}`;
                            const conflict = checkLecturerConflict(hs.lecturer_name || sub.lecturer_id, hs.date, hsTime, sub.id, hs.id || `hs_${hsIdx}`);
                            return (
                              <div key={hs.id || hsIdx} style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', width: '100%' }}>
                                  <input
                                    type="text"
                                    placeholder="Session..."
                                    disabled={!canEdit}
                                    value={hs.name || ''}
                                    onChange={e => {
                                      const val = e.target.value;
                                      const newSessions = ensureArray<any>(sub.host_sessions).map((item, idx) => idx === hsIdx ? { ...item, name: val } : item);
                                      handleUpdateSubjectInModal({ host_sessions: newSessions });
                                    }}
                                    style={{ width: '90px', padding: '6px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--color-border-light)', height: '34px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                  />

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 140px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>Ngày:</span>
                                    <div style={{ flex: 1 }}>
                                      <VietnameseDateInput
                                        disabled={!canEdit}
                                        value={hs.date || ''}
                                        onChange={val => {
                                          const newSessions = ensureArray<any>(sub.host_sessions).map((item, idx) => idx === hsIdx ? { ...item, date: val } : item);
                                          handleUpdateSubjectInModal({ host_sessions: newSessions });
                                        }}
                                        size="sm"
                                        inputStyle={{ height: '34px', fontSize: '0.8rem' }}
                                      />
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input
                                      type="text"
                                      disabled={!canEdit}
                                      value={hs.time_start || '20:00'}
                                      onChange={e => {
                                        const val = e.target.value;
                                        const newSessions = ensureArray<any>(sub.host_sessions).map((item, idx) => idx === hsIdx ? { ...item, time_start: val } : item);
                                        handleUpdateSubjectInModal({ host_sessions: newSessions });
                                      }}
                                      style={{ width: '55px', padding: '6px 4px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--color-border-light)', height: '34px', textAlign: 'center', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>-</span>
                                    <input
                                      type="text"
                                      disabled={!canEdit}
                                      value={hs.time_end || '22:00'}
                                      onChange={e => {
                                        const val = e.target.value;
                                        const newSessions = ensureArray<any>(sub.host_sessions).map((item, idx) => idx === hsIdx ? { ...item, time_end: val } : item);
                                        handleUpdateSubjectInModal({ host_sessions: newSessions });
                                      }}
                                      style={{ width: '55px', padding: '6px 4px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--color-border-light)', height: '34px', textAlign: 'center', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1.2 1 180px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>Giảng viên Zoom:</span>
                                    <input
                                      type="text"
                                      placeholder="Nhập tên giảng viên..."
                                      disabled={!canEdit}
                                      value={hs.lecturer_name || ''}
                                      onChange={e => {
                                        const val = e.target.value;
                                        const newSessions = ensureArray<any>(sub.host_sessions).map((item, idx) => idx === hsIdx ? { ...item, lecturer_name: val } : item);
                                        handleUpdateSubjectInModal({ host_sessions: newSessions });
                                      }}
                                      style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--color-border-light)', height: '34px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                    />
                                  </div>

                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleUpdateSubjectInModal({ host_sessions: ensureArray<any>(sub.host_sessions).filter((_, idx) => idx !== hsIdx) });
                                      }}
                                      style={{ border: 'none', background: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '6px' }}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  )}
                                </div>
                                {conflict && (
                                  <div style={{ color: 'var(--color-danger)', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.05)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                                    <AlertCircle size={12} style={{ flexShrink: 0 }} />
                                    <span>Cảnh báo trùng lịch: Giảng viên này đã có lịch dạy lớp {conflict.type} ở khóa {conflict.course} ({conflict.subject}) vào lúc {conflict.time} cùng ngày!</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 2: Vietnam Seminars */}
                  {activeConfigTab === 'seminar' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Danh sách lớp chuyên đề IDEAS (VN Time)</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {canEdit && (
                            <button
                              type="button"
                              className="btn outline"
                              style={{
                                height: '36px',
                                padding: '0 14px',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#fef2f2',
                                color: '#BD1D2D',
                                border: '1px solid #fecaca'
                              }}
                              onClick={() => setAnnouncingSubject(sub)}
                            >
                              <Send size={14} /> Gửi Thông báo Chuyên đề (TBCĐ)
                            </button>
                          )}
                          {canEdit && (
                            <button type="button" className="btn secondary" style={{ height: '36px', padding: '0 16px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddSeminar}>
                              <Plus size={14} /> Thêm chuyên đề
                            </button>
                          )}
                        </div>
                      </div>

                      {ensureArray(sub?.seminars).length === 0 ? (
                        <div style={{ padding: '2.5rem', textAlign: 'center', background: 'var(--color-bg-light)', borderRadius: '12px', border: '1px dashed var(--color-border-light)' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Chưa thiết lập lớp chuyên đề.</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {ensureArray(sub?.seminars).map((sem: any, sIdx: number) => (
                            <div key={sem.id || sIdx} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--color-surface)', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <div style={{ flex: '2 1 200px' }}>
                                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '3px' }}>Nội dung chuyên đề</label>
                                  <input
                                    type="text"
                                    placeholder="Hướng dẫn chuyên đề..."
                                    disabled={!canEdit}
                                    value={sem.topic || ''}
                                    onChange={e => {
                                      const val = e.target.value;
                                      const newSeminars = ensureArray<any>(sub.seminars).map((item, idx) => idx === sIdx ? { ...item, topic: val } : item);
                                      handleUpdateSubjectInModal({ seminars: newSeminars });
                                    }}
                                    style={{ width: '100%', padding: '6px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--color-border-light)', height: '34px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                  />
                                </div>
                                <div style={{ flex: '1 1 120px' }}>
                                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '3px' }}>Ngày học</label>
                                  <VietnameseDateInput
                                    disabled={!canEdit}
                                    value={sem.date || ''}
                                    onChange={val => {
                                      const newSeminars = ensureArray<any>(sub.seminars).map((item, idx) => idx === sIdx ? { ...item, date: val } : item);
                                      handleUpdateSubjectInModal({ seminars: newSeminars });
                                    }}
                                    size="sm"
                                    inputStyle={{ height: '34px', fontSize: '0.8rem' }}
                                  />
                                </div>
                                {(() => {
                                  const parsedTime = { ...parseSeminarTimeSlot(sem.time_slot), ...sem };

                                  const updateTimeSlotFields = (updates: any) => {
                                    const nextMerged = { ...parsedTime, ...updates };
                                    const formattedSlot = formatSeminarTimeSlot(
                                      nextMerged.sessions_count,
                                      nextMerged.session1_start,
                                      nextMerged.session1_end,
                                      nextMerged.session2_start,
                                      nextMerged.session2_end
                                    );
                                    const newSeminars = ensureArray<any>(sub.seminars).map((item, idx) =>
                                      idx === sIdx ? { ...item, ...updates, time_slot: formattedSlot } : item
                                    );
                                    handleUpdateSubjectInModal({ seminars: newSeminars });
                                  };

                                  return (
                                    <>
                                      <div style={{ flex: '1 1 110px' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '3px' }}>Số buổi</label>
                                        <CustomSelect
                                          disabled={!canEdit}
                                          options={[
                                            { value: '1', label: '1 buổi' },
                                            { value: '2', label: '2 buổi' }
                                          ]}
                                          value={String(parsedTime.sessions_count)}
                                          onChange={val => updateTimeSlotFields({ sessions_count: Number(val) })}
                                        />
                                      </div>
                                      <div style={{ flex: '2 1 200px' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '3px' }}>Giờ học thực tế</label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', width: '38px' }}>Buổi 1:</span>
                                            <input
                                              type="time"
                                              disabled={!canEdit}
                                              value={parsedTime.session1_start}
                                              onChange={e => updateTimeSlotFields({ session1_start: e.target.value })}
                                              style={{ width: '80px', padding: '4px 6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-border-light)', height: '26px' }}
                                            />
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>-</span>
                                            <input
                                              type="time"
                                              disabled={!canEdit}
                                              value={parsedTime.session1_end}
                                              onChange={e => updateTimeSlotFields({ session1_end: e.target.value })}
                                              style={{ width: '80px', padding: '4px 6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-border-light)', height: '26px' }}
                                            />
                                          </div>
                                          {Number(parsedTime.sessions_count) === 2 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                              <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', width: '38px' }}>Buổi 2:</span>
                                              <input
                                                type="time"
                                                disabled={!canEdit}
                                                value={parsedTime.session2_start}
                                                onChange={e => updateTimeSlotFields({ session2_start: e.target.value })}
                                                style={{ width: '80px', padding: '4px 6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-border-light)', height: '26px' }}
                                              />
                                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>-</span>
                                              <input
                                                type="time"
                                                disabled={!canEdit}
                                                value={parsedTime.session2_end}
                                                onChange={e => updateTimeSlotFields({ session2_end: e.target.value })}
                                                style={{ width: '80px', padding: '4px 6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-border-light)', height: '26px' }}
                                              />
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>

                              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 180px' }}>
                                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '3px' }}>Giảng viên</label>
                                  <CustomSelect
                                    disabled={!canEdit}
                                    options={lecturerSelectOptions}
                                    value={sem.lecturer_id ? String(sem.lecturer_id) : ''}
                                    onChange={val => {
                                      const nextVal = String(val || '');
                                      const newSeminars = ensureArray<any>(sub.seminars).map((item, idx) => idx === sIdx ? { ...item, lecturer_id: nextVal } : item);
                                      handleUpdateSubjectInModal({ seminars: newSeminars });
                                    }}
                                    placeholder="Chọn giảng viên..."
                                    searchable
                                    showAvatars
                                  />
                                </div>
                                <div style={{ flex: '1.5 1 200px' }}>
                                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '3px' }}>Địa điểm học</label>
                                  <input
                                    type="text"
                                    placeholder="Online hoặc địa chỉ..."
                                    disabled={!canEdit}
                                    value={sem.location || ''}
                                    onChange={e => {
                                      const val = e.target.value;
                                      const newSeminars = ensureArray<any>(sub.seminars).map((item, idx) => idx === sIdx ? { ...item, location: val } : item);
                                      handleUpdateSubjectInModal({ seminars: newSeminars });
                                    }}
                                    style={{ width: '100%', padding: '6px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--color-border-light)', height: '34px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                  />
                                </div>
                                {canEdit && (
                                  <button
                                    type="button"
                                    className="btn secondary sm"
                                    style={{ height: '34px', width: '34px', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--color-danger)', border: '1px solid var(--color-border-light)' }}
                                    onClick={() => {
                                      handleUpdateSubjectInModal({ seminars: ensureArray<any>(sub.seminars).filter((_, idx) => idx !== sIdx) });
                                    }}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </div>
                              {(() => {
                                const semTime = sem.time_slot || (sem.time_start && sem.time_end ? `${sem.time_start} - ${sem.time_end}` : '08:30 - 11:30');
                                const conflict = checkLecturerConflict(sem.lecturer_id || sub.lecturer_id, sem.date, semTime, sub.id, sem.id || `sem_${sIdx}`);
                                if (conflict) {
                                  return (
                                    <div style={{ color: 'var(--color-danger)', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.05)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.15)', marginTop: '8px' }}>
                                      <AlertCircle size={12} style={{ flexShrink: 0 }} />
                                      <span>Cảnh báo trùng lịch: Giảng viên này đã có lịch dạy lớp {conflict.type} ở khóa {conflict.course} ({conflict.subject}) vào lúc {conflict.time} cùng ngày!</span>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 3: Zoom Meeting */}
                  {activeConfigTab === 'zoom' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                      {/* Zoom Toggle Switch */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-light)', padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--color-border-light)' }}>
                        <div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-text)', display: 'block' }}>Tài khoản Zoom Meeting dùng chung</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px', display: 'block' }}>Bật để dùng chung một Zoom cho cả lịch trường và chuyên đề. Tắt để cấu hình liên kết riêng biệt.</span>
                        </div>
                        <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: canEdit ? 'pointer' : 'not-allowed', userSelect: 'none' }}>
                          <input 
                            type="checkbox" 
                            disabled={!canEdit}
                            checked={sub.zoom_shared !== false} 
                            onChange={e => handleUpdateSubjectInModal({ zoom_shared: e.target.checked })}
                            style={{ display: 'none' }}
                          />
                          <div style={{
                            width: '44px',
                            height: '24px',
                            backgroundColor: (sub.zoom_shared !== false) ? '#BD1D2D' : '#cbd5e1',
                            borderRadius: '100px',
                            position: 'relative',
                            transition: 'background-color 0.2s ease',
                          }}>
                            <div style={{
                              width: '18px',
                              height: '18px',
                              backgroundColor: '#ffffff',
                              borderRadius: '50%',
                              position: 'absolute',
                              top: '3px',
                              left: (sub.zoom_shared !== false) ? '23px' : '3px',
                              transition: 'left 0.2s ease',
                              boxShadow: 'var(--shadow-xs)'
                            }} />
                          </div>
                        </label>
                      </div>

                      {/* Zoom details */}
                      {sub.zoom_shared !== false ? (
                        <div style={{ background: 'var(--color-surface)', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#BD1D2D', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>Thông tin Zoom dùng chung</span>
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ flex: '2 1 240px' }}>
                              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '4px' }}>Đường dẫn Zoom Link</label>
                              <input
                                type="text"
                                placeholder="https://us02web.zoom.us/j/..."
                                disabled={!canEdit}
                                value={sub.zoom_link || ''}
                                onChange={e => handleUpdateSubjectInModal({ zoom_link: e.target.value })}
                                style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--color-border-light)', height: '38px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                              />
                            </div>
                            <div style={{ flex: '1 1 120px' }}>
                              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '4px' }}>Meeting ID</label>
                              <input
                                type="text"
                                placeholder="306 909 7520"
                                disabled={!canEdit}
                                value={sub.zoom_id || ''}
                                onChange={e => handleUpdateSubjectInModal({ zoom_id: e.target.value })}
                                style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--color-border-light)', height: '38px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                              />
                            </div>
                            <div style={{ flex: '1 1 100px' }}>
                              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '4px' }}>Passcode</label>
                              <input
                                type="text"
                                placeholder="passcode..."
                                disabled={!canEdit}
                                value={sub.zoom_pass || ''}
                                onChange={e => handleUpdateSubjectInModal({ zoom_pass: e.target.value })}
                                style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--color-border-light)', height: '38px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          {/* School Zoom Account */}
                          <div style={{ background: 'var(--color-surface)', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#BD1D2D', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>1. Zoom Lớp học với trường</span>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                              <div style={{ flex: '2 1 240px' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '4px' }}>Đường dẫn Zoom Link (Trường)</label>
                                <input
                                  type="text"
                                  placeholder="https://us02web.zoom.us/j/..."
                                  disabled={!canEdit}
                                  value={sub.school_zoom_link || ''}
                                  onChange={e => handleUpdateSubjectInModal({ school_zoom_link: e.target.value })}
                                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--color-border-light)', height: '38px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                />
                              </div>
                              <div style={{ flex: '1 1 120px' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '4px' }}>Meeting ID</label>
                                <input
                                  type="text"
                                  placeholder="306 909 7520"
                                  disabled={!canEdit}
                                  value={sub.school_zoom_id || ''}
                                  onChange={e => handleUpdateSubjectInModal({ school_zoom_id: e.target.value })}
                                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--color-border-light)', height: '38px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                />
                              </div>
                              <div style={{ flex: '1 1 100px' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '4px' }}>Passcode</label>
                                <input
                                  type="text"
                                  placeholder="passcode..."
                                  disabled={!canEdit}
                                  value={sub.school_zoom_pass || ''}
                                  onChange={e => handleUpdateSubjectInModal({ school_zoom_pass: e.target.value })}
                                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--color-border-light)', height: '38px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Seminar Zoom Account */}
                          <div style={{ background: 'var(--color-surface)', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>2. Zoom Lớp chuyên đề (IDEAS)</span>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                              <div style={{ flex: '2 1 240px' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '4px' }}>Đường dẫn Zoom Link (Chuyên đề)</label>
                                <input
                                  type="text"
                                  placeholder="https://us02web.zoom.us/j/..."
                                  disabled={!canEdit}
                                  value={sub.seminar_zoom_link || ''}
                                  onChange={e => handleUpdateSubjectInModal({ seminar_zoom_link: e.target.value })}
                                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--color-border-light)', height: '38px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                />
                              </div>
                              <div style={{ flex: '1 1 120px' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '4px' }}>Meeting ID</label>
                                <input
                                  type="text"
                                  placeholder="306 909 7520"
                                  disabled={!canEdit}
                                  value={sub.seminar_zoom_id || ''}
                                  onChange={e => handleUpdateSubjectInModal({ seminar_zoom_id: e.target.value })}
                                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--color-border-light)', height: '38px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                />
                              </div>
                              <div style={{ flex: '1 1 100px' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: '4px' }}>Passcode</label>
                                <input
                                  type="text"
                                  placeholder="passcode..."
                                  disabled={!canEdit}
                                  value={sub.seminar_zoom_pass || ''}
                                  onChange={e => handleUpdateSubjectInModal({ seminar_zoom_pass: e.target.value })}
                                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', borderRadius: '8px', border: '1px solid var(--color-border-light)', height: '38px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 4: Homework & Quiz */}
                  {activeConfigTab === 'quiz' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                      {/* Quiz & Assignment list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Danh sách bài tập / Quiz / Bài thi</span>
                          {canEdit && (
                            <button type="button" className="btn secondary" style={{ height: '36px', padding: '0 16px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddAssignment}>
                              <Plus size={14} /> Thêm bài tập
                            </button>
                          )}
                        </div>

                        {ensureArray(sub?.assignments).length === 0 ? (
                          <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--color-bg-light)', borderRadius: '12px', border: '1px dashed var(--color-border-light)' }}>
                            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>Chưa thiết lập bài tập nào.</span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {ensureArray(sub?.assignments).map((asm: any, aIdx: number) => (
                              <div key={asm.id || aIdx} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-surface)', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', flexWrap: 'wrap' }}>
                                <input
                                  type="text"
                                  placeholder="Tên bài tập (ví dụ: Quiz 1, Final Exam...)"
                                  disabled={!canEdit}
                                  value={asm.name || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    const newAsms = ensureArray<any>(sub.assignments).map((item, idx) => idx === aIdx ? { ...item, name: val } : item);
                                    handleUpdateSubjectInModal({ assignments: newAsms });
                                  }}
                                  style={{ flex: '2 1 200px', padding: '6px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--color-border-light)', height: '34px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                />

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 180px' }}>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>Hạn nộp:</span>
                                  <input
                                    type="datetime-local"
                                    disabled={!canEdit}
                                    value={asm.due_date || ''}
                                    onChange={e => {
                                      const val = e.target.value;
                                      const newAsms = ensureArray<any>(sub.assignments).map((item, idx) => idx === aIdx ? { ...item, due_date: val } : item);
                                      handleUpdateSubjectInModal({ assignments: newAsms });
                                    }}
                                    style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--color-border-light)', height: '34px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                                  />
                                </div>

                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleUpdateSubjectInModal({ assignments: ensureArray<any>(sub.assignments).filter((_, idx) => idx !== aIdx) });
                                    }}
                                    style={{ border: 'none', background: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '6px' }}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  )}
                </div>

              </div>
            ),
            '1000px',
            saveButton,
            false,
            false,
            true,
            'projects-subject-config-drawer'
          );
        })()}

        {/* Subject & Seminar Announcement Modal (Auto-Fill 5 Official TBCĐ Templates & 1-Click Send) */}
        {announcingSubject && (
          <Suspense fallback={null}>
            <SubjectAnnouncementModal
              isOpen={!!announcingSubject}
              onClose={() => setAnnouncingSubject(null)}
              subject={announcingSubject}
              campaign={editingCampaign}
              programName={
                editingCampaign?.project_name ||
                ensureArray<any>(allProjectsLookup.length > 0 ? allProjectsLookup : projects).find(p => Number(p.id) === Number(editingCampaign?.project_id))?.name ||
                editingCampaign?.name ||
                ''
              }
              companiesList={companiesList}
              consultants={consultants}
              addToast={addToast}
              onSubjectUpdated={({ ai_agent_link, school_lecturer }) => {
                if (!editingCampaign || !announcingSubject) return;
                const subs = safeParseArray<any>(editingCampaign.subjects_json);
                const updatedSubs = subs.map((s: any) => {
                  if (s.id === announcingSubject.id || (s.code && s.code === announcingSubject.code)) {
                    return {
                      ...s,
                      ...(ai_agent_link ? { ai_agent_link } : {}),
                      ...(school_lecturer ? { school_lecturer } : {})
                    };
                  }
                  return s;
                });
                const serialized = JSON.stringify(updatedSubs);
                setSubjects(updatedSubs);
                setEditingCampaign((prev: any) => prev ? { ...prev, subjects_json: serialized } : prev);
              }}
            />
          </Suspense>
        )}

        {/* Copy Subject to Other Courses Modal */}
        {isCopySubjectModalOpen && (
        <CustomModal
          isOpen={isCopySubjectModalOpen}
          onClose={() => {
            setIsCopySubjectModalOpen(false);
            setSubjectToCopy(null);
          }}
          title={`Sao chép môn học: ${subjectToCopy?.name || ''}`}
          width="500px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.25rem 0' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: 0 }}>
              Chọn khóa học (Campaign) đích để import cấu hình môn học này (bao gồm cả các buổi học trường, chuyên đề và bài tập).
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>Khóa học nhận môn học:</label>
              <CustomSelect
                options={[
                  { value: '', label: 'Chọn khóa học...' },
                  ...ensureArray<any>(campaigns)
                    .filter(c => c.status === 'active' && (editingCampaign ? Number(c.id) !== Number(editingCampaign.id) : true))
                    .map(c => ({ value: String(c.id), label: `${c.name} (ID: ${c.id})` }))
                ]}
                value={copyTargetCampaignId}
                onChange={val => setCopyTargetCampaignId(val)}
                placeholder="Chọn khóa học đích..."
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--color-border-light)', paddingTop: '1rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>Khi trùng mã môn học ở khóa học đích:</label>
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                  <input
                    type="radio"
                    name="copy-conflict-mode"
                    checked={copyConflictMode === 'replace'}
                    onChange={() => setCopyConflictMode('replace')}
                    style={{ cursor: 'pointer' }}
                  />
                  Ghi đè (Replace)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                  <input
                    type="radio"
                    name="copy-conflict-mode"
                    checked={copyConflictMode === 'add'}
                    onChange={() => setCopyConflictMode('add')}
                    style={{ cursor: 'pointer' }}
                  />
                  Thêm mới
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn secondary sm"
                style={{ borderRadius: '8px', fontWeight: 700 }}
                onClick={() => {
                  setIsCopySubjectModalOpen(false);
                  setSubjectToCopy(null);
                }}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn primary sm"
                style={{ borderRadius: '8px', fontWeight: 700, background: 'var(--color-primary)', border: 'none' }}
                disabled={isCopyingSubject || !copyTargetCampaignId}
                onClick={handleConfirmCopySubject}
              >
                {isCopyingSubject ? 'Đang sao chép...' : 'Xác nhận sao chép'}
              </button>
            </div>
          </div>
        </CustomModal>
        )}

        {isLecturerDrawerOpen && selectedLecturerEntity && (
          <Suspense fallback={null}>
            <CompanyDrawer
              isOpen={isLecturerDrawerOpen}
              onClose={() => {
                setIsLecturerDrawerOpen(false);
                setSelectedLecturerEntity(null);
              }}
              entity={selectedLecturerEntity}
              onSave={() => loadCompanies(true)}
            />
          </Suspense>
        )}
      </div>
      );
}

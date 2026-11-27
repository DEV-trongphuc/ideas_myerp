import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, FileText, FileBadge, Phone, Mail, MapPin, Calendar, Users, Briefcase, Plus, HelpCircle, Globe, Settings, Download, Trash2, Pencil, Loader2, History, ChevronLeft, ChevronRight, ChevronDown, Camera, Save, TrendingUp, DollarSign, BookOpen, List, GitBranch, CheckCircle2, Clock, RefreshCw, XCircle, UserPlus, CreditCard } from 'lucide-react';
import { CustomerProfileDrawer } from './CustomerProfileDrawer';
import { Avatar } from '../components/ui/Avatar';
import { CustomSelect } from '../components/ui/CustomSelect';
import { CustomCheckbox } from '../components/ui/CustomCheckbox';
import { AddressSelect } from '../components/ui/AddressSelect';
import { EmptyCard } from '../components/ui/EmptyCard';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/uiStore';
import api from '../api/axios';
import { compressToWebP } from '../utils/imageCompress';
import { ActivityModal } from '../components/ui/ActivityModal';
import { createPortal } from 'react-dom';
import styles from './EntityDrawer.module.css'; // Reusing the same drawer CSS
import { useAuth } from '../contexts/AuthContext';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { CopyButton } from '../components/ui/CopyButton';
import { canEditPartnerOrSupplier, isSales, normalizeRole } from '../utils/roleUtils';
import { pushOverlay } from '../utils/overlayStack';
import { LecturerInvitationAnd1on1Modal } from '../components/academic/LecturerInvitationAnd1on1Modal';
import { ensureArray, extractArray } from '../utils/safeArray';
import { downloadFileWithName } from '../utils/fileDownloader';
import { formatDateVN, getLocalDateStr } from '../utils/dateUtils';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';

interface CompanyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entity: any;
  onSave?: (data?: any) => void | Promise<any>;
  onSaved?: (updated: any) => void;
  zIndex?: number;
}

const STAGE_PALETTE = ['#C6333D', '#334155', '#E11D48', '#64748B', '#991B1B', '#475569', '#FB7185', '#94A3B8', '#1E293B', '#CBD5E1'];
const DEFAULT_WON_STAGE_SLUGS = ['enrolled', 'hoc_vien'];

const TIER_OPTIONS = [
  { value: 'giang_vien', label: 'Giảng viên' },
  { value: 'chuyen_gia', label: 'Chuyên gia' },
  { value: 'referrer', label: 'Người giới thiệu' },
  { value: 'doanh_nghiep', label: 'Đối tác doanh nghiệp' },
  { value: 'ca_nhan', label: 'Đối tác cá nhân' },
];

const normalizeTierValue = (rawTier: unknown): string => {
  const t = String(rawTier || '').toLowerCase().trim();
  if (!t) return 'ca_nhan';
  if (t === 'f1' || t === 'teacher' || t === 'giang_vien') return 'giang_vien';
  if (t === 'f2' || t === 'chuyen_gia') return 'chuyen_gia';
  if (t === 'f3' || t === 'nguoi_gioi_thieu' || t === 'referrer') return 'referrer';
  if (t === 'ctv' || t === 'b2b' || t === 'doanh_nghiep') return 'doanh_nghiep';
  if (t === 'ca_nhan') return 'ca_nhan';
  return t;
};

const getTierDisplayLabel = (rawTier: unknown): string => {
  const normalized = normalizeTierValue(rawTier);
  const matched = TIER_OPTIONS.find(o => o.value === normalized);
  return matched ? matched.label : String(rawTier || 'Đối tác cá nhân');
};

const deepClone = <T,>(val: T): T => {
  if (val === null || val === undefined || typeof val !== 'object') return val;
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(val);
    }
  } catch {}
  try {
    return JSON.parse(JSON.stringify(val));
  } catch {
    return Array.isArray(val) ? ([...val] as unknown as T) : ({ ...val } as T);
  }
};

const safeParseArray = (val: unknown): any[] => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const parseMultiSelectValue = (val: unknown): string[] => {
  return safeParseArray(val).map(v => String(v));
};

const formatFileSize = (bytes: number): string => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

const resolveMediaUrl = (rawPath?: string): string => {
  if (!rawPath) return '';
  if (/^(https?:|data:|blob:)/i.test(rawPath)) return rawPath;
  const base = (import.meta.env.VITE_API_URL || '/backend').replace(/\/$/, '');
  const clean = String(rawPath).replace(/^\/+/, '');
  return `${base}/${clean}`;
};

const isAbortError = (err: any): boolean =>
  err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';

const TABS = [
  { id: 'info', label: 'Thông tin', icon: <Building2 size={16} /> },
  { id: 'teaching', label: 'Giảng dạy', icon: <BookOpen size={16} /> },
  { id: 'activities', label: 'Hoạt động', icon: <History size={16} /> },
  { id: 'contacts', label: 'Liên hệ', icon: <Users size={16} /> },
  { id: 'sales_orders', label: 'Đơn bán (SO)', icon: <FileText size={16} /> },
  { id: 'purchase_orders', label: 'Đơn mua (PO)', icon: <FileBadge size={16} /> },
  { id: 'deals', label: 'Giao dịch', icon: <Briefcase size={16} /> },
  { id: 'invoices', label: 'Hóa đơn', icon: <FileText size={16} /> },
  { id: 'expenses', label: 'Chi trả thù lao', icon: <Plus size={16} /> },
  { id: 'docs', label: 'Tài liệu', icon: <FileBadge size={16} /> },
  { id: 'settings', label: 'Thiết lập', icon: <Settings size={16} /> },
];

export const CompanyDrawer: React.FC<CompanyDrawerProps> = ({ isOpen, onClose, entity, onSave, onSaved, zIndex }) => {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const canEdit = canEditPartnerOrSupplier(currentUser);
  const isSale = isSales(currentUser);
  const isViewerRole = normalizeRole(currentUser) === 'viewer';
  const disableEdit = !canEdit;
  const defaultDrawerZIndex = Number(useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_drawer', 2147483625)) || 2147483625;
  const nestedModalZIndex = Number(useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_modal_nested', 2147483646)) || 2147483646;
  const drawerMotionMs = Math.max(100, Number(useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220)) || 220);
  const uploadMaxMb = Math.max(1, Number(useTypedSubSetting<number>('core.upload_security_policy', 'max_mb', 50)) || 50);
  const wonStageSlugsSetting = useTypedSubSetting<string[]>('crm.pipeline_stage_slugs', 'won', DEFAULT_WON_STAGE_SLUGS);
  const wonStageSlugs = useMemo(
    () => Array.from(new Set([...ensureArray(wonStageSlugsSetting).map(s => String(s || '').toLowerCase().trim()).filter(Boolean), 'won'])),
    [wonStageSlugsSetting]
  );

  const effectiveZIndex = zIndex || defaultDrawerZIndex;
  const nestedCustomerZIndex = effectiveZIndex === defaultDrawerZIndex
    ? Math.min(defaultDrawerZIndex + 10, nestedModalZIndex - 2)
    : Math.min(Math.max(2147483635, effectiveZIndex + 10), nestedModalZIndex - 2);
  const { addToast, showConfirm } = useUIStore(
    useShallow((s) => ({
      addToast: s.addToast,
      showConfirm: s.showConfirm,
    }))
  );
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(window.innerWidth <= 1024);

  useEffect(() => {
    const handleResize = () => setIsMobileOrTablet(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const renderColoredIcon = (IconComponent: any, bgColor: string) => {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        backgroundColor: bgColor,
        color: 'white',
        flexShrink: 0
      }}>
        <IconComponent size={14} />
      </div>
    );
  };

  const [activeTab, setActiveTab] = useState(() => window.innerWidth <= 1024 ? '' : 'info');
  const [formData, setFormData] = useState<any>(() => deepClone(entity || {}));
  const isPartner = true; // All partner types have data referral and pipeline recording capabilities
  const isLecturer = ['f1', 'f2', 'giang_vien', 'chuyen_gia', 'teacher'].includes(String(formData?.tier || entity?.tier || '').toLowerCase());
  const [lecturerModalState, setLecturerModalState] = useState<{ isOpen: boolean; tab: 'invitation' | '1on1' }>({ isOpen: false, tab: 'invitation' });
  const [tags, setTags] = useState<string[]>(() => deepClone(ensureArray(entity?.tags)));
  const [isSaving, setIsSaving] = useState(false);
  const [creatingDeal, setCreatingDeal] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isMobileOrTablet && !activeTab) {
      setActiveTab('info');
    }
  }, [isMobileOrTablet, activeTab]);

  useEffect(() => {
    if (!isLecturer && activeTab === 'teaching') {
      setActiveTab(isMobileOrTablet ? '' : 'info');
    }
  }, [isLecturer, activeTab, isMobileOrTablet]);

  const [pipelineStats, setPipelineStats] = useState<any>(null);
  const [pipelineStatsLoading, setPipelineStatsLoading] = useState(false);
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>('all');
  const [showZeroStages, setShowZeroStages] = useState(false);
  const [selectedCustomerContact, setSelectedCustomerContact] = useState<any | null>(null);
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);

  const visibleTabs = useMemo(() => {
    let list = disableEdit ? TABS.filter(t => t.id !== 'settings') : TABS;
    if (!isLecturer) {
      list = list.filter(t => t.id !== 'teaching');
    }
    list = list.map(t => t.id === 'contacts' ? { ...t, label: 'Data giới thiệu (Pipeline)' } : t);
    return list;
  }, [disableEdit, isLecturer]);

  const pipelineStatsAbortRef = useRef<AbortController | null>(null);
  const activitiesAbortRef = useRef<AbortController | null>(null);
  const invoicesAbortRef = useRef<AbortController | null>(null);
  const expensesAbortRef = useRef<AbortController | null>(null);
  const soAbortRef = useRef<AbortController | null>(null);
  const poAbortRef = useRef<AbortController | null>(null);
  const subContactsAbortRef = useRef<AbortController | null>(null);
  const dealsAbortRef = useRef<AbortController | null>(null);
  const docsAbortRef = useRef<AbortController | null>(null);
  const usersAbortRef = useRef<AbortController | null>(null);
  const allCompaniesAbortRef = useRef<AbortController | null>(null);
  const campaignsAbortRef = useRef<AbortController | null>(null);
  const stagesAbortRef = useRef<AbortController | null>(null);

  const hydratedTabsRef = useRef<Record<string, number | null>>({});
  const prevBodyOverflowRef = useRef<string>('');
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveInFlightRef = useRef(false);
  const createDealInFlightRef = useRef(false);
  const logoUploadInFlightRef = useRef(false);
  const docsUploadInFlightRef = useRef(false);
  const docsActionInFlightRef = useRef(false);
  const escapeHandlerRef = useRef<() => void>(() => onClose());

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const fetchPipelineStats = useCallback(async (companyId: number) => {
    if (!companyId) return;
    if (pipelineStatsAbortRef.current) pipelineStatsAbortRef.current.abort();
    const abortController = new AbortController();
    pipelineStatsAbortRef.current = abortController;
    setPipelineStatsLoading(true);
    try {
      const res = await api.get(`/companies/${companyId}/pipeline-stats`, { signal: abortController.signal });
      if (abortController.signal.aborted) return;
      if (res.data?.data) {
        setPipelineStats(res.data.data);
      }
    } catch (err: any) {
      if (isAbortError(err)) return;
      console.error('Failed to fetch pipeline stats for partner', err);
    } finally {
      if (!abortController.signal.aborted) setPipelineStatsLoading(false);
    }
  }, []);

  const [users, setUsers] = useState<any[]>([]);
  const fetchUsers = useCallback(async () => {
    if (usersAbortRef.current) usersAbortRef.current.abort();
    const controller = new AbortController();
    usersAbortRef.current = controller;
    try {
      const res = await api.get('/users', { signal: controller.signal });
      if (!controller.signal.aborted) {
        setUsers(extractArray(res?.data));
      }
    } catch (err: any) {
      if (isAbortError(err)) return;
      setUsers([]);
    }
  }, []);

  const [allCompanies, setAllCompanies] = useState<any[]>([]);
  const fetchAllCompanies = useCallback(async () => {
    if (allCompaniesAbortRef.current) allCompaniesAbortRef.current.abort();
    const controller = new AbortController();
    allCompaniesAbortRef.current = controller;
    try {
      const res = await api.get('/companies', { params: { limit: 1000 }, signal: controller.signal });
      if (!controller.signal.aborted) {
        setAllCompanies(extractArray(res?.data));
      }
    } catch (err: any) {
      if (isAbortError(err)) return;
      setAllCompanies([]);
    }
  }, []);

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const fetchCampaigns = useCallback(async () => {
    if (campaignsAbortRef.current) campaignsAbortRef.current.abort();
    const controller = new AbortController();
    campaignsAbortRef.current = controller;
    setLoadingCampaigns(true);
    try {
      const res = await api.get('/marketing-campaigns', { signal: controller.signal });
      if (!controller.signal.aborted) {
        setCampaigns(extractArray(res?.data));
      }
    } catch (err: any) {
      if (isAbortError(err)) return;
      setCampaigns([]);
    } finally {
      if (!controller.signal.aborted) setLoadingCampaigns(false);
    }
  }, []);

  const [pipelineStages, setPipelineStages] = useState<any[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);
  const fetchPipelineStages = useCallback(async () => {
    if (stagesAbortRef.current) stagesAbortRef.current.abort();
    const controller = new AbortController();
    stagesAbortRef.current = controller;
    setLoadingStages(true);
    try {
      const res = await api.get('/pipeline-stages', { signal: controller.signal });
      if (!controller.signal.aborted) {
        setPipelineStages(extractArray(res?.data));
      }
    } catch (err: any) {
      if (isAbortError(err)) return;
      setPipelineStages([]);
    } finally {
      if (!controller.signal.aborted) setLoadingStages(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      prevBodyOverflowRef.current = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const unregisterOverlay = pushOverlay('company-drawer', () => escapeHandlerRef.current(), 90);
      fetchUsers();
      fetchAllCompanies();
      fetchCampaigns();
      fetchPipelineStages();
      return () => {
        document.body.style.overflow = prevBodyOverflowRef.current || '';
        unregisterOverlay();
        usersAbortRef.current?.abort();
        allCompaniesAbortRef.current?.abort();
        campaignsAbortRef.current?.abort();
        stagesAbortRef.current?.abort();
      };
    }
  }, [isOpen, fetchUsers, fetchAllCompanies, fetchCampaigns, fetchPipelineStages]);

  useEffect(() => {
    if (isOpen && !isCustomerDrawerOpen && document.body.style.overflow !== 'hidden') {
      document.body.style.overflow = 'hidden';
    }
  }, [isOpen, isCustomerDrawerOpen]);

  const [baseData, setBaseData] = useState<any>(() => deepClone(entity || {}));
  const [baseTags, setBaseTags] = useState<string[]>(() => deepClone(ensureArray(entity?.tags)));

  const parentOptions = useMemo(() => {
    return ensureArray(allCompanies)
      .filter(c => c.id !== entity?.id && ['f1', 'giang_vien', 'teacher'].includes(String(c.tier || '').toLowerCase()))
      .map(c => ({
        value: c.id,
        label: `${c.name} (${getTierDisplayLabel(c.tier)})`
      }));
  }, [allCompanies, entity?.id]);

  const hasChanges = useMemo(() => {
    if (!entity) return false;
    if (JSON.stringify(tags) !== JSON.stringify(baseTags)) return true;
    
    const fieldsToCompare = [
      'name', 'email', 'phone', 'website', 'tax_id', 'address', 'city', 'ward', 'status', 'notes',
      'industry', 'size', 'stage_id', 'expected_revenue', 'social_link', 'legal_representative', 'erp_code',
      'sla_level', 'wholesale_price', 'vat_exempt', 'dedicated_rep_id',
      'tier', 'parent_id', 'commission_rate', 'focus_markets', 'agent_count',
      'bank_name', 'bank_account_number', 'bank_account_name'
    ];
    
    for (const key of fieldsToCompare) {
      const val1 = formData?.[key] === undefined || formData?.[key] === null ? '' : String(formData[key]);
      const val2 = baseData?.[key] === undefined || baseData?.[key] === null ? '' : String(baseData[key]);
      if (val1 !== val2) return true;
    }
    
    if (JSON.stringify(formData?.custom_fields || []) !== JSON.stringify(baseData?.custom_fields || [])) {
      return true;
    }
    
    return false;
  }, [formData, baseData, tags, baseTags, entity]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (disableEdit || isSaving || saveInFlightRef.current) return false;
    saveInFlightRef.current = true;
    try {
      setIsSaving(true);
      setErrors({});
      const newErrors: Record<string, boolean> = {};

      if (!formData?.name || !String(formData.name).trim()) {
        newErrors.name = true;
        addToast('Tên đối tác là bắt buộc.', 'error');
      }

      const payload: any = { ...formData, tags };
      if (Array.isArray(formData?.custom_fields)) {
        for (const f of formData.custom_fields) {
          const isEmpty = f.value === undefined || f.value === null || f.value === '' || (Array.isArray(f.value) && f.value.length === 0);
          if (f.is_required && isEmpty) {
            newErrors[`cf_${f.id}`] = true;
            addToast(`Trường "${f.label}" là bắt buộc.`, 'error');
          }
        }
        payload.custom_fields = formData.custom_fields.map((f: any) => ({ field_id: f.id, value: f.value }));
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return false;
      }

      if (!entity?.id) {
        if (onSave) {
          await onSave(payload);
        }
        return true;
      }

      const res = await api.put(`/companies/${entity.id}`, payload);
      const updated = res.data?.data || res.data;
      const cloned = deepClone(updated);
      const nextTags = deepClone(ensureArray(cloned?.tags));
      setFormData(cloned);
      setBaseData(deepClone(cloned));
      setTags(nextTags);
      setBaseTags(deepClone(nextTags));
      const updatedIsLecturer = ['f1', 'f2', 'giang_vien', 'chuyen_gia', 'teacher'].includes(
        String(cloned?.tier || formData?.tier || '').toLowerCase()
      );
      addToast(
        updatedIsLecturer ? 'Đã cập nhật thông tin giảng viên thành công' : 'Đã cập nhật đối tác thành công',
        'success'
      );
      if (onSaved) {
        onSaved(cloned);
      } else if (onSave && onSave.length === 0) {
        onSave(cloned);
      }
      return true;
    } catch (e: any) {
      console.error("SAVE COMPANY ERROR:", e);
      addToast(
        e?.response?.data?.message || e?.message || (isLecturer ? 'Lỗi khi lưu thông tin giảng viên' : 'Lỗi khi lưu thông tin đối tác'),
        'error'
      );
      return false;
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  }, [disableEdit, formData, tags, entity, onSave, onSaved, addToast, isSaving, isLecturer]);

  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
    } else {
      setIsClosing(false);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    const performClose = () => {
      setIsClosing(true);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        onClose();
        setIsClosing(false);
      }, drawerMotionMs);
    };

    if (hasChanges && !disableEdit) {
      showConfirm({
        title: 'Bỏ qua thay đổi?',
        message: 'Bạn có các thay đổi chưa lưu. Bạn có muốn lưu thay đổi trước khi đóng không?',
        confirmText: 'Lưu & Đóng',
        extraText: 'Bỏ qua thay đổi',
        cancelText: 'Hủy',
        onConfirm: async () => {
          const savedOk = await handleSave();
          if (savedOk) {
            performClose();
          }
        },
        onExtra: () => {
          performClose();
        }
      });
    } else {
      performClose();
    }
  }, [hasChanges, disableEdit, onClose, showConfirm, handleSave, isClosing, drawerMotionMs]);

  const [helpModal, setHelpModal] = useState<{title: string, content: string} | null>(null);
  
  // Referred contacts State — loaded from API
  const [subContacts, setSubContacts] = useState<any[]>([]);

  const filteredSubContacts = useMemo(() => {
    if (selectedStageFilter === 'all') return subContacts;
    if (selectedStageFilter === 'won') {
      return subContacts.filter(c => c.lead_status === 'won' || wonStageSlugs.includes(String(c.pipeline_status || '').toLowerCase().trim()));
    }
    if (selectedStageFilter === 'nurture') {
      return subContacts.filter(c => c.lead_status === 'nurture');
    }
    if (selectedStageFilter === 'lost') {
      return subContacts.filter(c => c.lead_status === 'lost');
    }
    return subContacts.filter(c => String(c.stage_id) === String(selectedStageFilter) || c.pipeline_status === selectedStageFilter);
  }, [subContacts, selectedStageFilter, wonStageSlugs]);

  const [showDealModal, setShowDealModal] = useState(false);
  const [dealForm, setDealForm] = useState<{ title: string; value: string; stage_id: string; probability: number; expected_close_date: string }>({
    title: '',
    value: '',
    stage_id: '',
    probability: 50,
    expected_close_date: ''
  });
  const [subLoading, setSubLoading] = useState(false);

  // Deals — loaded from API
  const [deals, setDeals] = useState<any[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  
  // Docs — loaded from /cloud-files
  const [docs, setDocs] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  
  // Activities State
  const [activities, setActivities] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);

  const fetchActivities = useCallback(async (force = false) => {
    if (!entity?.id) return;
    if (!force && hydratedTabsRef.current.activities === entity.id) return;
    if (activitiesAbortRef.current) activitiesAbortRef.current.abort();
    const abortController = new AbortController();
    activitiesAbortRef.current = abortController;
    setActivitiesLoading(true);
    try {
      const r = await api.get('/activities', { params: { related_type: 'company', related_id: entity.id }, signal: abortController.signal });
      if (abortController.signal.aborted) return;
      setActivities(extractArray(r?.data));
      hydratedTabsRef.current.activities = entity.id;
    } catch (e: any) {
      if (isAbortError(e)) return;
      setActivities([]);
    } finally {
      if (!abortController.signal.aborted) setActivitiesLoading(false);
    }
  }, [entity?.id]);

  const fetchDocs = useCallback(async (force = false) => {
    if (!entity?.id) return;
    if (!force && hydratedTabsRef.current.docs === entity.id) return;
    if (docsAbortRef.current) docsAbortRef.current.abort();
    const abortController = new AbortController();
    docsAbortRef.current = abortController;
    setLoadingDocs(true);
    try {
      const r = await api.get('/cloud-files', {
        params: { category: `company_${entity.id}`, limit: 100 },
        signal: abortController.signal
      });
      if (abortController.signal.aborted) return;
      setDocs(extractArray(r?.data));
      hydratedTabsRef.current.docs = entity.id;
    } catch (e: any) {
      if (isAbortError(e)) return;
      setDocs([]);
    } finally {
      if (!abortController.signal.aborted) setLoadingDocs(false);
    }
  }, [entity?.id]);

  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  const fetchInvoices = useCallback(async (force = false) => {
    if (!entity?.id) return;
    if (!force && hydratedTabsRef.current.invoices === entity.id) return;
    if (invoicesAbortRef.current) invoicesAbortRef.current.abort();
    const abortController = new AbortController();
    invoicesAbortRef.current = abortController;
    setLoadingInvoices(true);
    try {
      const r = await api.get('/invoices', { params: { company_id: entity.id, limit: 100 }, signal: abortController.signal });
      if (abortController.signal.aborted) return;
      setInvoices(extractArray(r?.data));
      hydratedTabsRef.current.invoices = entity.id;
    } catch (e: any) {
      if (isAbortError(e)) return;
      setInvoices([]);
    } finally {
      if (!abortController.signal.aborted) setLoadingInvoices(false);
    }
  }, [entity?.id]);

  const fetchExpenses = useCallback(async (force = false) => {
    if (!entity?.id) return;
    if (!force && hydratedTabsRef.current.expenses === entity.id) return;
    if (expensesAbortRef.current) expensesAbortRef.current.abort();
    const abortController = new AbortController();
    expensesAbortRef.current = abortController;
    setLoadingExpenses(true);
    try {
      const r = await api.get('/expenses', { params: { company_id: entity.id, limit: 100 }, signal: abortController.signal });
      if (abortController.signal.aborted) return;
      setExpenses(extractArray(r?.data));
      hydratedTabsRef.current.expenses = entity.id;
    } catch (e: any) {
      if (isAbortError(e)) return;
      setExpenses([]);
    } finally {
      if (!abortController.signal.aborted) setLoadingExpenses(false);
    }
  }, [entity?.id]);

  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [loadingSO, setLoadingSO] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [loadingPO, setLoadingPO] = useState(false);

  const fetchSalesOrders = useCallback(async (force = false) => {
    if (!entity?.id) return;
    if (!force && hydratedTabsRef.current.sales_orders === entity.id) return;
    if (soAbortRef.current) soAbortRef.current.abort();
    const abortController = new AbortController();
    soAbortRef.current = abortController;
    setLoadingSO(true);
    try {
      const r = await api.get('/sales-orders', { params: { company_id: entity.id, limit: 100 }, signal: abortController.signal });
      if (abortController.signal.aborted) return;
      setSalesOrders(extractArray(r?.data, 'orders'));
      hydratedTabsRef.current.sales_orders = entity.id;
    } catch (e: any) {
      if (isAbortError(e)) return;
      setSalesOrders([]);
    } finally {
      if (!abortController.signal.aborted) setLoadingSO(false);
    }
  }, [entity?.id]);

  const fetchPurchaseOrders = useCallback(async (force = false) => {
    if (!entity?.id) return;
    if (!force && hydratedTabsRef.current.purchase_orders === entity.id) return;
    if (poAbortRef.current) poAbortRef.current.abort();
    const abortController = new AbortController();
    poAbortRef.current = abortController;
    setLoadingPO(true);
    try {
      const r = await api.get('/purchase-orders', { params: { supplier_id: entity.id, limit: 100 }, signal: abortController.signal });
      if (abortController.signal.aborted) return;
      setPurchaseOrders(extractArray(r?.data, 'orders'));
      hydratedTabsRef.current.purchase_orders = entity.id;
    } catch (e: any) {
      if (isAbortError(e)) return;
      setPurchaseOrders([]);
    } finally {
      if (!abortController.signal.aborted) setLoadingPO(false);
    }
  }, [entity?.id]);

  const fetchDeals = useCallback(async (force = false) => {
    if (!entity?.id) return;
    if (!force && hydratedTabsRef.current.deals === entity.id) return;
    if (dealsAbortRef.current) dealsAbortRef.current.abort();
    const abortController = new AbortController();
    dealsAbortRef.current = abortController;
    setDealsLoading(true);
    try {
      const r = await api.get('/deals', { params: { company_id: entity.id }, signal: abortController.signal });
      if (abortController.signal.aborted) return;
      setDeals(extractArray(r?.data));
      hydratedTabsRef.current.deals = entity.id;
    } catch (err: any) {
      if (isAbortError(err)) return;
      setDeals([]);
    } finally {
      if (!abortController.signal.aborted) setDealsLoading(false);
    }
  }, [entity?.id]);

  useEffect(() => {
    if (showDealModal && pipelineStages.length === 0 && !loadingStages) {
      fetchPipelineStages();
    }
    if (showDealModal && !dealForm.stage_id && pipelineStages.length > 0) {
      setDealForm(prev => ({ ...prev, stage_id: String(pipelineStages[0].id) }));
    }
  }, [showDealModal, pipelineStages, loadingStages, dealForm.stage_id, fetchPipelineStages]);

  const handleCreateDeal = async () => {
    if (isViewerRole) {
      addToast('Bạn không có quyền tạo cơ hội bán hàng', 'error');
      return;
    }
    if (!entity?.id) {
      addToast('Vui lòng lưu đối tác trước khi tạo Deal', 'error');
      return;
    }
    if (!dealForm.title.trim()) {
      addToast('Tên Deal là bắt buộc', 'error');
      return;
    }
    if (creatingDeal || createDealInFlightRef.current) return;
    createDealInFlightRef.current = true;
    try {
      setCreatingDeal(true);
      const selectedStageId = dealForm.stage_id || (pipelineStages[0]?.id ? String(pipelineStages[0].id) : '');
      await api.post('/deals', {
        company_id: entity.id,
        title: dealForm.title.trim(),
        value: Number(dealForm.value) || 0,
        stage_id: selectedStageId ? Number(selectedStageId) : undefined,
        probability: Math.min(100, Math.max(0, Number(dealForm.probability ?? 50))),
        expected_close_date: dealForm.expected_close_date || null
      });
      setShowDealModal(false);
      setDealForm({
        title: '',
        value: '',
        stage_id: pipelineStages[0]?.id ? String(pipelineStages[0].id) : '',
        probability: 50,
        expected_close_date: ''
      });
      await fetchDeals(true);
      addToast('Đã tạo cơ hội mới thành công', 'success');
    } catch (e: any) {
      console.error("CREATE DEAL ERROR:", e);
      addToast(e?.response?.data?.message || e.message || 'Lỗi khi tạo cơ hội', 'error');
    } finally {
      createDealInFlightRef.current = false;
      setCreatingDeal(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !entity?.id) return;
    if (activeTab === 'activities') fetchActivities();
    if (activeTab === 'docs') fetchDocs();
    if (activeTab === 'deals') fetchDeals();
    if (activeTab === 'invoices') fetchInvoices();
    if (activeTab === 'expenses') fetchExpenses();
    if (activeTab === 'sales_orders') fetchSalesOrders();
    if (activeTab === 'purchase_orders') fetchPurchaseOrders();
  }, [isOpen, entity?.id, activeTab, fetchActivities, fetchDocs, fetchDeals, fetchInvoices, fetchExpenses, fetchSalesOrders, fetchPurchaseOrders]);

  useEffect(() => {
    if (!isOpen || !entity?.id) return;
    const handleTaskUpdated = () => {
      fetchActivities(true);
    };
    window.addEventListener('task-updated', handleTaskUpdated);
    window.addEventListener('task-local-updated', handleTaskUpdated);
    return () => {
      window.removeEventListener('task-updated', handleTaskUpdated);
      window.removeEventListener('task-local-updated', handleTaskUpdated);
    };
  }, [isOpen, entity?.id, fetchActivities]);

  const fetchSubContacts = useCallback(() => {
    if (!entity?.id) return;
    if (subContactsAbortRef.current) subContactsAbortRef.current.abort();
    const abortController = new AbortController();
    subContactsAbortRef.current = abortController;
    setSubLoading(true);
    fetchPipelineStats(entity.id);
    api.get('/contacts', { params: { company_id: entity.id, limit: 500 }, signal: abortController.signal })
      .then(r => {
        if (abortController.signal.aborted) return;
        setSubContacts(extractArray(r?.data).map((c: any) => ({
          id: c.id,
          name: (c.full_name || '').trim() || 'Chưa có tên',
          role: c.job_title || '',
          phone: c.phone || '',
          email: c.email || '',
          avatar_url: c.avatar_url || '',
          isPrimary: c.is_primary || false,
          stage_id: c.stage_id,
          stage_name: c.stage_name,
          stage_color: c.stage_color,
          pipeline_status: c.pipeline_status,
          lead_status: c.lead_status,
          created_at: c.created_at,
          owner_name: c.owner_name,
          owner_avatar: c.owner_avatar
        })));
      })
      .catch((err: any) => {
        if (!isAbortError(err)) {
          setSubContacts([]);
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) setSubLoading(false);
      });
  }, [entity?.id, fetchPipelineStats]);

  useEffect(() => {
    hydratedTabsRef.current = {};
    setActivities([]);
    setDeals([]);
    setDocs([]);
    setInvoices([]);
    setExpenses([]);
    setSalesOrders([]);
    setPurchaseOrders([]);
    setSubContacts([]);
    setPipelineStats(null);
    setSelectedStageFilter('all');
    setHelpModal(null);
    setShowDealModal(false);
    setShowActivityModal(false);
    setErrors({});

    if (!isOpen) {
      return () => {
        pipelineStatsAbortRef.current?.abort();
        activitiesAbortRef.current?.abort();
        invoicesAbortRef.current?.abort();
        expensesAbortRef.current?.abort();
        soAbortRef.current?.abort();
        poAbortRef.current?.abort();
        subContactsAbortRef.current?.abort();
        dealsAbortRef.current?.abort();
        docsAbortRef.current?.abort();
      };
    }

    if (entity) {
      const clonedEntity = deepClone(entity);
      const clonedTags = deepClone(ensureArray(entity.tags));
      setFormData(clonedEntity);
      setTags(clonedTags);
      setBaseData(deepClone(clonedEntity));
      setBaseTags(deepClone(clonedTags));
      if (entity.id) {
        fetchSubContacts();
        fetchDeals();
        fetchInvoices();
        fetchExpenses();
        fetchSalesOrders();
        fetchPurchaseOrders();
      }
    } else {
      setFormData({});
      setTags([]);
      setBaseData({});
      setBaseTags([]);
      setSubLoading(false);
      setDealsLoading(false);
    }

    return () => {
      pipelineStatsAbortRef.current?.abort();
      activitiesAbortRef.current?.abort();
      invoicesAbortRef.current?.abort();
      expensesAbortRef.current?.abort();
      soAbortRef.current?.abort();
      poAbortRef.current?.abort();
      subContactsAbortRef.current?.abort();
      dealsAbortRef.current?.abort();
      docsAbortRef.current?.abort();
    };
  }, [isOpen, entity, fetchPipelineStats, fetchSubContacts, fetchDeals, fetchInvoices, fetchExpenses, fetchSalesOrders, fetchPurchaseOrders]);

  const teachingSummary = useMemo(() => {
    const companyIdStr = String(entity?.id || '');
    const companyNameStr = String(entity?.name || '').toLowerCase();
    const allSessions: any[] = [];
    const todayStr = getLocalDateStr();

    ensureArray(campaigns).forEach((camp: any) => {
      const subjects = safeParseArray(camp?.subjects_json);

      subjects.forEach((sub: any) => {
        if (!sub || typeof sub !== 'object') return;
        const isMainLecturer = String(sub.lecturer_id || '') === companyIdStr;

        if (Array.isArray(sub.host_sessions)) {
          sub.host_sessions.forEach((hs: any) => {
            const isHsLecturer = hs?.lecturer_name
              ? (String(hs.lecturer_name) === companyIdStr || String(hs.lecturer_name).toLowerCase() === companyNameStr)
              : isMainLecturer;

            if (isHsLecturer) {
              allSessions.push({
                type: 'school',
                campaignId: camp.id,
                campaignName: camp.name,
                subjectCode: sub.code || 'MÔN HỌC',
                subjectName: sub.name || '',
                title: hs?.name || 'Buổi học',
                date: hs?.date || '',
                time: `${hs?.time_start || '20:00'} - ${hs?.time_end || '22:00'}`,
                location: hs?.location || 'Online',
                sessionsCount: 1
              });
            }
          });
        }

        if (Array.isArray(sub.seminars)) {
          sub.seminars.forEach((sem: any) => {
            const isSemLecturer = sem?.lecturer_id
              ? (String(sem.lecturer_id) === companyIdStr)
              : isMainLecturer;

            if (isSemLecturer) {
              allSessions.push({
                type: 'seminar',
                campaignId: camp.id,
                campaignName: camp.name,
                subjectCode: sub.code || 'MÔN HỌC',
                subjectName: sub.name || '',
                title: sem?.topic || 'Lớp chuyên đề',
                date: sem?.date || '',
                time: sem?.time_slot || 'Chưa cấu hình giờ',
                location: sem?.location || 'Online',
                sessionsCount: Number(sem?.sessions_count) || 1
              });
            }
          });
        }
      });
    });

    const groupedSessions: Record<string, {
      type: string;
      subjectCode: string;
      subjectName: string;
      title: string;
      date: string;
      time: string;
      location: string;
      campaigns: { id: any; name: string }[];
      sessionsCount: number;
    }> = {};

    allSessions.forEach(s => {
      const subKey = (s.subjectCode && s.subjectCode !== 'MÔN HỌC') ? s.subjectCode : s.subjectName;
      const key = `${s.date || 'no-date'}_${s.time || 'no-time'}_${subKey || 'no-subj'}_${s.type}`;
      if (!groupedSessions[key]) {
        groupedSessions[key] = {
          type: s.type,
          subjectCode: s.subjectCode,
          subjectName: s.subjectName,
          title: s.title,
          date: s.date,
          time: s.time,
          location: s.location,
          campaigns: [],
          sessionsCount: s.sessionsCount
        };
      }
      if (!groupedSessions[key].campaigns.some(c => String(c.id) === String(s.campaignId))) {
        groupedSessions[key].campaigns.push({
          id: s.campaignId,
          name: s.campaignName
        });
      }
    });

    const deduplicatedList = Object.values(groupedSessions);

    const upcoming = deduplicatedList
      .filter(s => s.date && s.date >= todayStr)
      .map(s => ({
        type: s.type,
        campaignName: s.campaigns.map(c => c.name).join(', '),
        subjectCode: s.subjectCode,
        subjectName: s.subjectName,
        title: s.title,
        date: s.date,
        time: s.time,
        location: s.location
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const courseMap: Record<string, { campaignName: string; campaignId: any; subjects: Set<string>; sessionCount: number }> = {};
    allSessions.forEach(s => {
      if (!courseMap[s.campaignId]) {
        courseMap[s.campaignId] = {
          campaignName: s.campaignName,
          campaignId: s.campaignId,
          subjects: new Set(),
          sessionCount: 0
        };
      }
      courseMap[s.campaignId].subjects.add(s.subjectName || s.subjectCode);
      courseMap[s.campaignId].sessionCount += s.sessionsCount;
    });

    const courseStatsList = Object.values(courseMap).map(c => ({
      ...c,
      subjectListStr: Array.from(c.subjects).join(', ')
    }));

    return {
      upcoming,
      courseStatsList,
      totalCourses: courseStatsList.length,
      totalSubjects: new Set(allSessions.map(s => (s.subjectCode && s.subjectCode !== 'MÔN HỌC') ? s.subjectCode : s.subjectName)).size,
      totalSessions: deduplicatedList.reduce((acc, s) => acc + s.sessionsCount, 0)
    };
  }, [campaigns, entity?.id, entity?.name]);

  escapeHandlerRef.current = () => {
    if (lecturerModalState.isOpen) {
      setLecturerModalState(prev => ({ ...prev, isOpen: false }));
      return;
    }
    if (isCustomerDrawerOpen) {
      setIsCustomerDrawerOpen(false);
      setSelectedCustomerContact(null);
      return;
    }
    if (helpModal) {
      setHelpModal(null);
    } else if (showDealModal) {
      setShowDealModal(false);
    } else if (showActivityModal) {
      setShowActivityModal(false);
    } else {
      handleClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!lecturerModalState.isOpen && !helpModal && !showDealModal) return;
    return pushOverlay('company-drawer-submodal', () => escapeHandlerRef.current(), 2147483644);
  }, [isOpen, lecturerModalState.isOpen, helpModal, showDealModal]);

  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      return;
    }
    const timer = setTimeout(() => setIsVisible(false), drawerMotionMs);
    return () => clearTimeout(timer);
  }, [isOpen, drawerMotionMs]);

  if (!isVisible) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <AnimatePresence>
      {isOpen && !isClosing && (
        <>
          <motion.div
            className="drawer-backdrop"
            onClick={handleClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: drawerMotionMs / 1000, ease: [0.25, 0.1, 0.25, 1] as any }}
            style={{
              zIndex: effectiveZIndex - 5,
              '--drawer-backdrop-z': effectiveZIndex - 5,
              background: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              position: 'fixed',
              inset: 0,
              cursor: 'pointer'
            } as React.CSSProperties}
          />
          <motion.div
            className={`${styles.drawer} drawer-panel drawer-sheet`}
            initial={isMobileOrTablet ? { y: '100%' } : { opacity: 0, x: '250px' }}
            animate={{ y: 0, x: 0, opacity: 1 }}
            exit={isMobileOrTablet ? { y: '60%', opacity: 0 } : { x: '60%', opacity: 0 }}
            transition={{ duration: drawerMotionMs / 1000, ease: [0.25, 0.1, 0.25, 1] as any }}
            style={{ zIndex: effectiveZIndex, '--drawer-panel-z': effectiveZIndex } as React.CSSProperties}
          >
            {/* Header / Sticky Top Bar */}
            {isMobileOrTablet ? (
              <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 150,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                background: 'var(--color-surface)',
                borderBottom: '1px solid var(--color-border-light)',
                height: '56px',
                boxSizing: 'border-box',
                width: '100%',
                flexShrink: 0
              }}>
                <button 
                  type="button"
                  onClick={() => {
                    if (activeTab) {
                      setActiveTab('');
                    } else {
                      handleClose();
                    }
                  }} 
                  style={{ 
                    background: 'var(--color-bg)', 
                    border: '1px solid var(--color-border-light)', 
                    color: 'var(--color-text)', 
                    cursor: 'pointer', 
                    padding: 0,
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    display: 'flex', 
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                  title={activeTab ? 'Quay lại menu' : 'Đóng'}
                >
                  <ChevronLeft size={20} />
                </button>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '0 0.5rem', overflow: 'hidden' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {activeTab ? (visibleTabs.find(t => t.id === activeTab)?.label || 'Chi tiết') : (formData?.name || (isLecturer ? 'Tên Giảng viên' : 'Tên Đối tác'))}
                  </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {isLecturer && formData?.id && (
                    <button
                      type="button"
                      onClick={() => {
                        const publicLink = `/public-schedule/lecturer/${formData.id}`;
                        window.open(publicLink, '_blank');
                      }}
                      style={{
                        padding: 0,
                        borderRadius: '8px',
                        height: '36px',
                        width: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        color: '#334155',
                        cursor: 'pointer'
                      }}
                      title="Xem lịch giảng công khai"
                    >
                      <Calendar size={18} />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isSaving || disableEdit}
                    onClick={handleSave}
                    style={{
                      padding: 0,
                      borderRadius: '8px',
                      height: '36px',
                      width: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--color-primary)',
                      borderColor: 'var(--color-primary)',
                      color: 'white',
                      border: 'none',
                      cursor: (isSaving || disableEdit) ? 'not-allowed' : 'pointer',
                      opacity: disableEdit ? 0.5 : 1
                    }}
                    title={disableEdit ? 'Bạn không có quyền chỉnh sửa' : (isSaving ? 'Đang lưu...' : 'Lưu thay đổi')}
                  >
                    {isSaving ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.header}>
                <div className={styles.headerProfile}>
                  <div 
                    className={styles.avatarContainer}
                    style={{ 
                      background: '#0f172a', 
                      fontSize: '1.25rem', 
                      width: 56, 
                      height: 56, 
                      border: '1px solid var(--color-border)',
                      cursor: disableEdit ? 'default' : 'pointer',
                      color: 'white',
                      fontWeight: 700
                    }}
                    onClick={() => {
                      if (!disableEdit) {
                        document.getElementById('company-logo-upload')?.click();
                      }
                    }}
                  >
                    {formData?.logo_url ? (
                      <img 
                        src={resolveMediaUrl(formData.logo_url)} 
                        alt="Company Logo" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                    ) : (
                      formData?.name?.[0] || 'C'
                    )}
                    {!disableEdit && (
                      <div className={styles.avatarOverlay}>
                        <Camera size={16} />
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className={styles.title}>{formData?.name || (isLecturer ? 'Tên Giảng viên' : 'Tên Đối tác')}</h2>
                    <p className={styles.subtitle} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Briefcase size={14} /> {getTierDisplayLabel(formData?.tier)} · {formData?.focus_markets || 'Chưa cập nhật thế mạnh'}
                    </p>
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'row', 
                      gap: '1rem', 
                      marginTop: '0.5rem',
                      alignItems: 'center'
                    }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={12} /> {formData?.phone || 'Chưa có SĐT'}
                        {formData?.phone && <CopyButton text={formData.phone} />}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Mail size={12} /> {formData?.email || 'Chưa có Email'}
                        {formData?.email && <CopyButton text={formData.email} />}
                      </span>
                      {formData?.address && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px', maxWidth: 260 }} title={formData.address}>
                          <MapPin size={12} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formData.address}</span>
                          <CopyButton text={formData.address} />
                        </span>
                      )}
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Globe size={12} />
                        {formData?.website ? (
                          <a 
                            href={formData.website.startsWith('http') ? formData.website : `http://${formData.website}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
                          >
                            {formData.website}
                          </a>
                        ) : (
                          'Chưa có Website'
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={styles.headerActions} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className={`badge ${formData?.status === 'active' ? 'success' : formData?.status === 'inactive' ? 'danger' : 'warning'}`}>
                    {formData?.status === 'active' ? 'Hoạt động' : formData?.status === 'inactive' ? 'Ngừng' : 'Tiềm năng'}
                  </span>
                  {isLecturer && formData?.id && (
                    <>
                      <button
                        type="button"
                        className="btn outline"
                        style={{
                          borderColor: '#BD1D2D',
                          color: '#BD1D2D',
                          background: 'rgba(189, 29, 45, 0.08)',
                          border: '1px solid #fecaca',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 16px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          height: '38px',
                          borderRadius: '10px',
                          cursor: 'pointer'
                        }}
                        onClick={() => setLecturerModalState({ isOpen: true, tab: 'invitation' })}
                      >
                        <Mail size={15} />
                        <span>Gửi Mail Hợp Đồng & Mời Giảng</span>
                      </button>
                      <button
                        type="button"
                        className="btn outline"
                        style={{
                          borderColor: '#0f172a',
                          color: '#0f172a',
                          background: '#f8fafc',
                          border: '1px solid #cbd5e1',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 16px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          height: '38px',
                          borderRadius: '10px',
                          cursor: 'pointer'
                        }}
                        onClick={() => setLecturerModalState({ isOpen: true, tab: '1on1' })}
                      >
                        <Calendar size={15} />
                        <span>Form Hướng Dẫn 1:1 (30p)</span>
                      </button>
                      <button
                        type="button"
                        className="btn outline"
                        style={{
                          borderColor: '#cbd5e1',
                          color: '#334155',
                          background: 'var(--color-surface)',
                          border: '1px solid #cbd5e1',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 16px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          height: '38px',
                          borderRadius: '10px',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          const publicLink = `/public-schedule/lecturer/${formData.id}`;
                          window.open(publicLink, '_blank');
                        }}
                      >
                        <Calendar size={16} />
                        <span>Xem lịch giảng</span>
                      </button>
                    </>
                  )}
                  <button 
                    type="button"
                    className="btn primary" 
                    disabled={isSaving || disableEdit}
                    title={disableEdit ? 'Bạn không có quyền chỉnh sửa' : undefined}
                    style={{ 
                      background: 'var(--color-primary)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 8,
                      padding: '8px 20px',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      height: '38px',
                      borderRadius: '10px',
                      boxShadow: 'var(--shadow-sm)',
                      opacity: disableEdit ? 0.55 : 1,
                      cursor: (isSaving || disableEdit) ? 'not-allowed' : 'pointer'
                    }}
                    onClick={handleSave}
                  >
                    {isSaving && <Loader2 size={16} className="spin" />}
                    <span>{isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
                  </button>
                  <button type="button" className={styles.closeBtn} onClick={handleClose} style={{ marginLeft: '4px' }}><X size={20} /></button>
                </div>
              </div>
            )}

            {/* Logo Upload Input Element */}
            <input 
              type="file" 
              id="company-logo-upload" 
              accept="image/*" 
              disabled={disableEdit}
              style={{ display: 'none' }} 
              onChange={async (e) => {
                const inputEl = e.target;
                const file = inputEl.files?.[0];
                if (!file) return;
                if (disableEdit || logoUploadInFlightRef.current) {
                  inputEl.value = '';
                  return;
                }
                logoUploadInFlightRef.current = true;
                try {
                  const compressed = await compressToWebP(file);
                  const formDataUpload = new FormData();
                  formDataUpload.append('file', compressed);
                  if (formData?.logo_url) {
                    formDataUpload.append('previous_url', formData.logo_url);
                  }
                  const res = await api.post('api.php?action=upload', formDataUpload, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                  });
                  if (res.data?.success) {
                    const newLogoUrl = res.data.data?.url;
                    setFormData((prev: any) => ({ ...prev, logo_url: newLogoUrl }));
                    if (entity?.id) {
                      const updateRes = await api.put(`/companies/${entity.id}`, { logo_url: newLogoUrl });
                      if (updateRes.data?.success) {
                        const updated = updateRes.data?.data || { ...formData, logo_url: newLogoUrl };
                        const syncedLogo = updated.logo_url ?? newLogoUrl;
                        setFormData((prev: any) => ({ ...prev, logo_url: syncedLogo }));
                        setBaseData((prev: any) => ({ ...prev, logo_url: syncedLogo }));
                        addToast('Cập nhật logo đối tác thành công.', 'success');
                        if (onSaved) {
                          onSaved(updated);
                        } else if (onSave && onSave.length === 0) {
                          onSave(updated);
                        }
                      }
                    } else {
                      addToast('Đã tải lên logo đối tác.', 'success');
                    }
                  }
                } catch (err: any) {
                  addToast('Lỗi tải lên logo: ' + (err?.response?.data?.message || err?.message || 'Không xác định'), 'error');
                } finally {
                  logoUploadInFlightRef.current = false;
                  inputEl.value = '';
                }
              }}
            />

            {/* Mobile Profile Block (only rendered at root menu level) */}
            {isMobileOrTablet && !activeTab && (
              <div style={{
                padding: '1.25rem 1rem',
                borderBottom: '1px solid var(--color-border-light)',
                background: 'var(--color-surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                flexShrink: 0
              }}>
                {/* Row 1: Avatar Left, Name & Phone & Email Right */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}>
                  {/* Left: Avatar Container */}
                  <div 
                    className={styles.avatarContainer}
                    style={{ 
                      background: '#0f172a', 
                      fontSize: '1.25rem', 
                      width: 60, 
                      height: 60, 
                      borderRadius: '50%',
                      position: 'relative',
                      border: '1px solid var(--color-border)',
                      cursor: disableEdit ? 'default' : 'pointer',
                      color: 'white',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      flexShrink: 0
                    }}
                    onClick={() => {
                      if (!disableEdit) {
                        document.getElementById('company-logo-upload')?.click();
                      }
                    }}
                  >
                    {formData?.logo_url ? (
                      <img 
                        src={resolveMediaUrl(formData.logo_url)} 
                        alt="Company Logo" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                    ) : (
                      formData?.name?.[0] || 'C'
                    )}
                    {!disableEdit && (
                      <div className={styles.avatarOverlay}>
                        <Camera size={14} />
                      </div>
                    )}
                  </div>
                  
                  {/* Right: Basic Info */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {formData?.name || (isLecturer ? 'Tên Giảng viên' : 'Tên Đối tác')}
                    </h2>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px', fontVariantNumeric: 'tabular-nums' }}>
                      <Phone size={12} style={{ color: 'var(--color-primary)', flexShrink: 0 }} /> {formData?.phone || 'Chưa có SĐT'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <Mail size={12} style={{ color: 'var(--color-text-light)', flexShrink: 0 }} /> 
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formData?.email || 'Chưa có Email'}
                      </span>
                    </span>
                  </div>
                </div>
                
                {/* Row 2: Secondary / Auxiliary Info Card */}
                <div style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border-light)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.01)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Briefcase size={12} /> {formData?.focus_markets || 'Chưa cập nhật thế mạnh'}
                    </span>
                    <span className={`badge ${formData?.status === 'active' ? 'success' : formData?.status === 'inactive' ? 'danger' : 'warning'}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                      {formData?.status === 'active' ? 'Hoạt động' : formData?.status === 'inactive' ? 'Ngừng' : 'Tiềm năng'}
                    </span>
                  </div>
                  
                  <div style={{ height: '1px', background: 'var(--color-border-light)' }} />
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Ngân hàng:</span>
                      <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{formData?.bank_name || 'Chưa cập nhật'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Số tài khoản:</span>
                      <span style={{ fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {formData?.bank_account_number || 'Chưa cập nhật'}
                        {formData?.bank_account_number && <CopyButton text={formData.bank_account_number} />}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Chủ tài khoản:</span>
                      <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{formData?.bank_account_name || 'Chưa cập nhật'}</span>
                    </div>
                    {formData?.website && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', minWidth: 0 }}>
                        <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>Website:</span>
                        <a 
                          href={formData.website.startsWith('http') ? formData.website : `https://${formData.website}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          style={{ fontWeight: 600, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          <Globe size={11} /> {formData.website}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Layout Split: Left Sidebar & Content */}
            <div className={styles.drawerBody}>
              {/* Sidebar Tabs */}
              <AnimatePresence>
                {(!isMobileOrTablet || !activeTab) && (
                  <motion.div
                    initial={isMobileOrTablet ? { opacity: 0, x: -30 } : undefined}
                    animate={isMobileOrTablet ? { opacity: 1, x: 0 } : undefined}
                    exit={isMobileOrTablet ? { opacity: 0, x: -30 } : undefined}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    className={!isMobileOrTablet ? styles.sidebarTabs : undefined}
                  style={isMobileOrTablet ? {
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.875rem',
                    padding: '1.25rem 1rem',
                    overflowY: 'auto',
                    background: 'var(--color-bg)',
                    height: '100%'
                  } : undefined}
                >
                  {isMobileOrTablet ? (
                    /* ── Mobile iOS-style list menu ── */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', width: '100%' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 750, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '4px' }}>
                        Thông tin & Giao dịch
                      </div>
                      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                        {visibleTabs.map((tab, idx) => {
                          let bgColor = '#8e8e93';
                          if (tab.id === 'info') bgColor = '#eb4e3d';
                          else if (tab.id === 'activities') bgColor = '#f09a37';
                          else if (tab.id === 'contacts') bgColor = '#007af5';
                          else if (tab.id === 'deals') bgColor = '#34c759';
                          else if (tab.id === 'invoices') bgColor = '#5856d6';
                          else if (tab.id === 'expenses') bgColor = '#ff2d55';
                          else if (tab.id === 'docs') bgColor = '#3b82f6';
                          else if (tab.id === 'settings') bgColor = '#555555';

                          let IconComp = tab.icon.type;

                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setActiveTab(tab.id)}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between', 
                                padding: '14px 16px', 
                                background: 'transparent', 
                                border: 'none', 
                                borderBottom: idx < visibleTabs.length - 1 ? '1px solid var(--color-border-light)' : 'none', 
                                width: '100%', 
                                cursor: 'pointer', 
                                textAlign: 'left' 
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--color-text)' }}>
                                {renderColoredIcon(IconComp, bgColor)}
                                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{tab.label}</span>
                              </div>
                              <ChevronRight size={14} style={{ color: 'var(--color-text-muted)' }} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    visibleTabs.map(tab => {
                      let bgColor = '#8e8e93';
                      if (tab.id === 'info') bgColor = '#eb4e3d';
                      else if (tab.id === 'activities') bgColor = '#f09a37';
                      else if (tab.id === 'contacts') bgColor = '#007af5';
                      else if (tab.id === 'deals') bgColor = '#34c759';
                      else if (tab.id === 'invoices') bgColor = '#5856d6';
                      else if (tab.id === 'expenses') bgColor = '#ff2d55';
                      else if (tab.id === 'docs') bgColor = '#3b82f6';
                      else if (tab.id === 'settings') bgColor = '#555555';

                      let IconComp = tab.icon.type;

                      return (
                        <button 
                          key={tab.id} 
                          className={`${styles.sidebarTabBtn} ${activeTab === tab.id ? styles.sidebarTabActive : ''}`}
                          onClick={() => setActiveTab(tab.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                          }}
                        >
                          {renderColoredIcon(IconComp, bgColor)}
                          <span>{tab.label}</span>
                        </button>
                      );
                    })
                  )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Content Area */}
              <AnimatePresence>
                {(!isMobileOrTablet || activeTab) && (
                  <motion.div 
                    key={activeTab || 'content'}
                    initial={isMobileOrTablet ? { opacity: 0, x: 30 } : undefined}
                    animate={isMobileOrTablet ? { opacity: 1, x: 0 } : undefined}
                    exit={isMobileOrTablet ? { opacity: 0, x: 30 } : undefined}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    className={!isMobileOrTablet ? styles.contentArea : undefined}
                  style={isMobileOrTablet ? {
                    flex: 1,
                    padding: '1.25rem 1rem 100px 1rem',
                    overflowY: 'auto',
                    backgroundColor: 'var(--color-bg)',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column'
                  } : undefined}
                >

                {activeTab === 'info' && (
                  <fieldset disabled={disableEdit} style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }} className="animate-fade">
                    {/* Partner Statistics Cards — Ch. V Standard */}
                    {isPartner && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.125rem' }}>
                        {/* Card 1: Khách hàng giới thiệu */}
                        <div style={{
                          padding: '20px',
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: '128px',
                          position: 'relative',
                          overflow: 'hidden',
                          borderRadius: '16px',
                          background: 'var(--color-surface, #FFFFFF)',
                          border: '1px solid var(--color-border, #E2E8F0)',
                          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, fontSize: '0.73rem', color: '#64748b' }}>
                              Khách hàng giới thiệu
                            </span>
                            <div style={{
                              color: '#BD1D2D',
                              background: 'rgba(189, 29, 45, 0.08)',
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <Users size={16} strokeWidth={1.75} />
                            </div>
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                            <div style={{ fontWeight: 800, color: 'var(--color-text, #0f172a)', fontSize: '1.85rem', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                              {pipelineStats?.summary?.total ?? subContacts.length}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>• Hồ sơ giới thiệu:</span>
                              <strong style={{ color: 'var(--color-text, #0f172a)' }}>{pipelineStats?.summary?.active ?? 0} đang tư vấn</strong>
                            </div>
                          </div>
                        </div>

                        {/* Card 2: Doanh thu mang lại */}
                        <div style={{
                          padding: '20px',
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: '128px',
                          position: 'relative',
                          overflow: 'hidden',
                          borderRadius: '16px',
                          background: 'var(--color-surface, #FFFFFF)',
                          border: '1px solid var(--color-border, #E2E8F0)',
                          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, fontSize: '0.73rem', color: '#64748b' }}>
                              Doanh thu mang lại
                            </span>
                            <div style={{
                              color: '#BD1D2D',
                              background: 'rgba(189, 29, 45, 0.08)',
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <TrendingUp size={16} strokeWidth={1.75} />
                            </div>
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                            <div style={{ fontWeight: 800, color: '#BD1D2D', fontSize: '1.85rem', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(
                                salesOrders.length > 0 
                                  ? salesOrders.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) 
                                  : invoices.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0)
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>• Nguồn ghi nhận:</span>
                              <strong style={{ color: 'var(--color-text, #0f172a)' }}>{salesOrders.length > 0 ? `${salesOrders.length} đơn hàng SO` : `${invoices.length} hóa đơn`}</strong>
                            </div>
                          </div>
                        </div>

                        {/* Card 3: Hoa hồng phát sinh */}
                        <div style={{
                          padding: '20px',
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: '128px',
                          position: 'relative',
                          overflow: 'hidden',
                          borderRadius: '16px',
                          background: 'var(--color-surface, #FFFFFF)',
                          border: '1px solid var(--color-border, #E2E8F0)',
                          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, fontSize: '0.73rem', color: '#64748b' }}>
                              Hoa hồng phát sinh
                            </span>
                            <div style={{
                              color: '#334155',
                              background: 'rgba(15, 23, 42, 0.06)',
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <DollarSign size={16} strokeWidth={1.75} />
                            </div>
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                            <div style={{ fontWeight: 800, color: 'var(--color-text, #0f172a)', fontSize: '1.85rem', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(
                                purchaseOrders.length > 0 
                                  ? purchaseOrders.reduce((acc: number, curr: any) => acc + (Number(curr.total) || 0), 0) 
                                  : expenses.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0)
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>• Chứng từ:</span>
                              <strong style={{ color: 'var(--color-text, #0f172a)' }}>{purchaseOrders.length > 0 ? `${purchaseOrders.length} đơn mua PO` : `${expenses.length} phiếu chi trả`}</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Referral Pipeline Statistics Panel */}
                    {isPartner && (
                      <div style={{
                        background: 'var(--color-surface, #FFFFFF)',
                        border: '1px solid var(--color-border, #E2E8F0)',
                        borderRadius: '16px',
                        padding: isMobileOrTablet ? '16px' : '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '20px',
                        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              background: 'rgba(15, 23, 42, 0.06)',
                              color: '#334155',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <GitBranch size={18} strokeWidth={1.75} />
                            </div>
                            <div>
                              <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-text, #0f172a)' }}>
                                Thống kê Data theo trạng thái Pipeline
                              </h4>
                              <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#64748b', fontWeight: 500 }}>
                                Tiến trình chuyển đổi & trạng thái các data do đối tác này giới thiệu
                              </p>
                            </div>
                          </div>
                          <button 
                            type="button"
                            className="btn secondary sm"
                            onClick={() => {
                              setSelectedStageFilter('all');
                              setActiveTab('contacts');
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '8px 12px', borderRadius: '8px', fontVariantNumeric: 'tabular-nums' }}
                          >
                            <Users size={14} />
                            <span>Xem danh sách ({pipelineStats?.summary?.total ?? subContacts.length})</span>
                            <ChevronRight size={14} />
                          </button>
                        </div>

                        {/* Mini KPI Chips Row — Ch. V Brand Red & Slate */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: isMobileOrTablet ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)',
                          gap: '12px'
                        }}>
                          {/* 1. Tổng nhận */}
                          <div style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            background: 'var(--color-surface, #FFFFFF)',
                            border: '1px solid var(--color-border, #E2E8F0)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                              <Users size={14} color="#475569" /> Tổng nhận
                            </div>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text, #0f172a)', fontVariantNumeric: 'tabular-nums' }}>
                              {pipelineStats?.summary?.total ?? subContacts.length}
                            </span>
                          </div>

                          {/* 2. Đang tư vấn */}
                          <div style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            background: 'var(--color-surface, #FFFFFF)',
                            border: '1px solid var(--color-border, #E2E8F0)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                              <Clock size={14} color="#475569" /> Đang tư vấn
                            </div>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text, #0f172a)', fontVariantNumeric: 'tabular-nums' }}>
                              {pipelineStats?.summary?.active ?? 0}
                            </span>
                          </div>

                          {/* 3. Nhập học / Đậu */}
                          <div style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            background: 'var(--color-surface, #FFFFFF)',
                            border: '1px solid var(--color-border, #E2E8F0)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                              <CheckCircle2 size={14} color="#BD1D2D" /> Nhập học / Đậu
                            </div>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                              {pipelineStats?.summary?.won ?? 0}
                            </span>
                          </div>

                          {/* 4. Tỷ lệ chốt */}
                          <div style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            background: 'var(--color-surface, #FFFFFF)',
                            border: '1px solid var(--color-border, #E2E8F0)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                              <TrendingUp size={14} color="#BD1D2D" /> Tỷ lệ chốt
                            </div>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                              {pipelineStats?.summary?.conversion_rate ?? 0}%
                            </span>
                          </div>

                          {/* 5. Nuôi dưỡng */}
                          <div style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            background: 'var(--color-surface, #FFFFFF)',
                            border: '1px solid var(--color-border, #E2E8F0)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                              <RefreshCw size={14} color="#475569" /> Nuôi dưỡng
                            </div>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text, #0f172a)', fontVariantNumeric: 'tabular-nums' }}>
                              {pipelineStats?.summary?.nurture ?? 0}
                            </span>
                          </div>

                          {/* 6. Thất bại / Hủy */}
                          <div style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            background: 'var(--color-surface, #FFFFFF)',
                            border: '1px solid var(--color-border, #E2E8F0)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                              <XCircle size={14} color="#64748b" /> Thất bại / Hủy
                            </div>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text, #0f172a)', fontVariantNumeric: 'tabular-nums' }}>
                              {pipelineStats?.summary?.lost ?? 0}
                            </span>
                          </div>
                        </div>

                        {/* Stage Breakdown Funnel Bars */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Phân bổ theo giai đoạn Pipeline:
                            </span>
                            <span style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                              Chạm / Bấm vào giai đoạn để lọc nhanh danh sách
                            </span>
                          </div>

                          {pipelineStatsLoading ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                              <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 8px', color: 'var(--color-primary)' }} />
                              <span style={{ fontSize: '0.8rem' }}>Đang tải số liệu thống kê pipeline...</span>
                            </div>
                          ) : !pipelineStats?.stages || pipelineStats.stages.length === 0 ? (
                            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', background: 'var(--color-bg)', borderRadius: '12px' }}>
                              <p style={{ margin: 0, fontSize: '0.85rem' }}>Chưa có dữ liệu giai đoạn pipeline nào.</p>
                            </div>
                          ) : (() => {
                            const activeStages = ensureArray(pipelineStats.stages).filter((st: any) => st.count > 0);
                            const zeroStages = ensureArray(pipelineStats.stages).filter((st: any) => st.count === 0);

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {/* Horizontal Visual Segmented Distribution Bar — Ch. V Brand Red & Slate */}
                                {activeStages.length > 0 && (
                                  <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px',
                                    background: 'var(--color-surface, #FFFFFF)',
                                    padding: '14px 16px',
                                    borderRadius: '16px',
                                    border: '1px solid var(--color-border-light, #E2E8F0)',
                                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                                  }}>
                                    <div style={{
                                      height: '14px',
                                      width: '100%',
                                      borderRadius: '8px',
                                      background: '#f1f5f9',
                                      display: 'flex',
                                      overflow: 'hidden',
                                      gap: '3px',
                                      padding: '2px',
                                      boxSizing: 'border-box'
                                    }}>
                                      {activeStages.map((st: any, idx: number) => {
                                        const toneColor = st.is_won ? '#C6333D' : STAGE_PALETTE[idx % STAGE_PALETTE.length];
                                        return (
                                          <div
                                            key={st.id}
                                            title={`${st.name}: ${st.count} data (${st.percentage}%)`}
                                            onClick={() => {
                                              setSelectedStageFilter(String(st.id));
                                              setActiveTab('contacts');
                                            }}
                                            style={{
                                              width: `${Math.max(3, st.percentage)}%`,
                                              background: toneColor,
                                              height: '100%',
                                              borderRadius: '5px',
                                              cursor: 'pointer',
                                              transition: 'transform 0.18s ease, opacity 0.18s ease'
                                            }}
                                            onMouseEnter={e => {
                                              e.currentTarget.style.transform = 'scaleY(1.15)';
                                              e.currentTarget.style.opacity = '0.85';
                                            }}
                                            onMouseLeave={e => {
                                              e.currentTarget.style.transform = 'none';
                                              e.currentTarget.style.opacity = '1';
                                            }}
                                          />
                                        );
                                      })}
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '2px' }}>
                                      {activeStages.map((st: any, idx: number) => {
                                        const toneColor = st.is_won ? '#C6333D' : STAGE_PALETTE[idx % STAGE_PALETTE.length];
                                        return (
                                          <div
                                            key={st.id}
                                            onClick={() => {
                                              setSelectedStageFilter(String(st.id));
                                              setActiveTab('contacts');
                                            }}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.75rem' }}
                                          >
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: toneColor }} />
                                            <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{st.name}:</span>
                                            <span style={{ fontWeight: 800, color: idx === 0 || st.is_won ? '#BD1D2D' : '#334155', fontVariantNumeric: 'tabular-nums' }}>{st.count}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Active Stages Grid (2 Columns) — Ch. V Card Borders */}
                                {activeStages.length === 0 ? (
                                  <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--color-text-muted)', background: 'var(--color-bg)', borderRadius: '12px' }}>
                                    <p style={{ margin: 0, fontSize: '0.825rem' }}>Hiện chưa có data nào trong các giai đoạn đang hoạt động.</p>
                                  </div>
                                ) : (
                                  <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: isMobileOrTablet ? '1fr' : 'repeat(2, 1fr)',
                                    gap: '12px'
                                  }}>
                                    {activeStages.map((st: any, idx: number) => {
                                      const toneColor = st.is_won ? '#C6333D' : STAGE_PALETTE[idx % STAGE_PALETTE.length];
                                      return (
                                        <div
                                          key={st.id}
                                          onClick={() => {
                                            setSelectedStageFilter(String(st.id));
                                            setActiveTab('contacts');
                                          }}
                                          style={{
                                            padding: '12px 16px',
                                            borderRadius: '16px',
                                            background: 'var(--color-surface, #FFFFFF)',
                                            border: '1px solid var(--color-border, #E2E8F0)',
                                            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                            cursor: 'pointer',
                                            transition: 'border-color 0.15s ease, background-color 0.15s ease',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px'
                                          }}
                                          title={`Bấm xem ${st.count} data ở giai đoạn ${st.name}`}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: toneColor, flexShrink: 0 }} />
                                              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text, #0f172a)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {st.name}
                                              </span>
                                              {st.is_won && (
                                                <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '6px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', fontWeight: 700 }}>
                                                  WON
                                                </span>
                                              )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                              <span style={{
                                                fontSize: '0.8rem',
                                                fontWeight: 700,
                                                fontVariantNumeric: 'tabular-nums',
                                                color: 'var(--color-text, #0f172a)',
                                                background: '#f8fafc',
                                                border: '1px solid #e2e8f0',
                                                padding: '2px 8px',
                                                borderRadius: '8px'
                                              }}>
                                                {st.count} data
                                              </span>
                                              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                                {st.percentage}%
                                              </span>
                                            </div>
                                          </div>
                                          {/* Micro progress bar */}
                                          <div style={{ height: '6px', width: '100%', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{
                                              height: '100%',
                                              width: `${Math.max(2, st.percentage)}%`,
                                              background: toneColor,
                                              borderRadius: '3px',
                                              transition: 'width 0.4s ease'
                                            }} />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Collapsible Zero Stages section */}
                                {zeroStages.length > 0 && (
                                  <div style={{ marginTop: '4px' }}>
                                    <button
                                      type="button"
                                      onClick={() => setShowZeroStages(prev => !prev)}
                                      style={{
                                        background: 'none',
                                        border: '1px dashed var(--color-border)',
                                        borderRadius: '8px',
                                        padding: '8px 12px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        color: 'var(--color-text-muted)',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        transition: 'border-color 0.15s ease, color 0.15s ease'
                                      }}
                                    >
                                      <ChevronDown size={14} style={{ transform: showZeroStages ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                      <span>{showZeroStages ? 'Thu gọn các giai đoạn 0 data' : `Xem thêm ${zeroStages.length} giai đoạn chưa có data (0)`}</span>
                                    </button>

                                    {showZeroStages && (
                                      <div style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '6px',
                                        marginTop: '10px',
                                        padding: '12px',
                                        background: 'var(--color-bg)',
                                        borderRadius: '12px',
                                        border: '1px solid var(--color-border-light)'
                                      }}>
                                        {zeroStages.map((st: any) => (
                                          <div
                                            key={st.id}
                                            onClick={() => {
                                              setSelectedStageFilter(String(st.id));
                                              setActiveTab('contacts');
                                            }}
                                            style={{
                                              padding: '5px 10px',
                                              borderRadius: '8px',
                                              background: 'var(--color-surface)',
                                              border: '1px solid var(--color-border-light)',
                                              fontSize: '0.72rem',
                                              color: 'var(--color-text-muted)',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '6px',
                                              cursor: 'pointer'
                                            }}
                                            title={`Xem data giai đoạn ${st.name}`}
                                          >
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8' }} />
                                            <span>{st.name}</span>
                                            <span style={{ opacity: 0.6, fontSize: '0.68rem' }}>(0)</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                    <div className="card-panel">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="panel-title" style={{ margin: 0 }}>Hồ sơ Đối tác</h4>
                      </div>
                      <div className="grid grid-2">
                        <div className="form-group" style={{ gridColumn: 'span 2' }}>
                          <label className="form-label">Tên Đối tác <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                          <input 
                            className="form-input" 
                            placeholder="Tên đối tác..." 
                            value={formData?.name || ''} 
                            onChange={e => {
                              setFormData((prev: any) => ({ ...prev, name: e.target.value }));
                              if (e.target.value.trim() && errors.name) {
                                setErrors(prev => ({ ...prev, name: false }));
                              }
                            }} 
                            style={{
                              borderColor: errors.name ? 'var(--color-danger, #bd1d2d)' : undefined,
                              boxShadow: errors.name ? '0 0 0 2px rgba(189, 29, 45, 0.1)' : undefined
                            }}
                          />
                        </div>
                        
                        <div className="form-group">
                          <label className="form-label">Loại hình đối tác</label>
                          <CustomSelect 
                            options={TIER_OPTIONS}
                            value={normalizeTierValue(formData?.tier)}
                            disabled={disableEdit}
                            onChange={val => {
                              const nextTier = String(val);
                              setFormData((prev: any) => ({ 
                                ...prev, 
                                tier: nextTier,
                                parent_id: ['chuyen_gia', 'referrer', 'f2', 'f3'].includes(nextTier) ? prev.parent_id : null 
                              }));
                            }}
                            placeholder="Chọn loại hình đối tác..."
                          />
                        </div>

                        {['f2', 'f3', 'chuyen_gia', 'referrer'].includes(String(formData?.tier || '').toLowerCase()) && (
                          <div className="form-group">
                            <label className="form-label">Đối tác quản lý trực tiếp</label>
                            <CustomSelect 
                              options={parentOptions}
                              value={formData?.parent_id || ''}
                              disabled={disableEdit}
                              onChange={val => setFormData((prev: any) => ({ ...prev, parent_id: val }))}
                              placeholder="Chọn đối tác quản lý..."
                            />
                          </div>
                        )}

                        <div className="form-group">
                          <label className="form-label">Lĩnh vực / Môn học giảng dạy thế mạnh</label>
                          <input 
                            className="form-input" 
                            placeholder="Ví dụ: Lập trình Python, Machine Learning, Kế toán..." 
                            value={formData?.focus_markets || ''} 
                            onChange={e => setFormData((prev: any) => ({ ...prev, focus_markets: e.target.value }))} 
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">{isLecturer ? 'Số giờ giảng dạy tối đa/tuần' : 'Quy mô / Số lượng nhân sự'}</label>
                          <input 
                            className="form-input" 
                            type="number"
                            placeholder={isLecturer ? 'Nhập số giờ giảng dạy tối đa...' : 'Nhập quy mô / số lượng nhân sự...'} 
                            value={formData?.agent_count || 0} 
                            onChange={e => setFormData((prev: any) => ({ ...prev, agent_count: parseInt(e.target.value) || 0 }))} 
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">Trạng thái đối tác</label>
                          <CustomSelect 
                            options={[
                              { value: 'prospect', label: 'Tiềm năng' },
                              { value: 'active', label: 'Đang hoạt động' },
                              { value: 'inactive', label: 'Ngừng hoạt động' }
                            ]}
                            value={formData?.status || 'prospect'}
                            disabled={disableEdit}
                            onChange={val => setFormData((prev: any) => ({ ...prev, status: val as string }))}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Người liên hệ khẩn cấp / đại diện</label>
                          <input className="form-input" placeholder="Tên người liên hệ..." value={formData?.legal_representative || ''} onChange={e => setFormData((prev: any) => ({ ...prev, legal_representative: e.target.value }))} />
                        </div>

                        <div style={{ 
                          border: '1px dashed var(--color-border, #e2e8f0)',
                          borderRadius: '12px',
                          padding: '16px',
                          marginBottom: '16px',
                          background: 'var(--color-bg, #f8fafc)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          gridColumn: '1 / -1'
                        }}>
                          <h4 style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--color-text, #1e293b)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CreditCard size={15} style={{ color: 'var(--color-primary)' }} />
                            <span>THÔNG TIN THANH TOÁN (BANKING)</span>
                          </h4>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Tên ngân hàng</label>
                              <input className="form-input" placeholder="Ví dụ: Vietcombank..." value={formData?.bank_name || ''} onChange={e => setFormData((prev: any) => ({ ...prev, bank_name: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Số tài khoản (STK)</label>
                              <input className="form-input" placeholder="Nhập số tài khoản..." value={formData?.bank_account_number || ''} onChange={e => setFormData((prev: any) => ({ ...prev, bank_account_number: e.target.value }))} />
                            </div>
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Chủ tài khoản thanh toán</label>
                            <input className="form-input" placeholder="Nhập tên chủ tài khoản..." value={formData?.bank_account_name || ''} onChange={e => setFormData((prev: any) => ({ ...prev, bank_account_name: e.target.value.toUpperCase() }))} />
                          </div>
                        </div>

                        {!isSale && (
                          <div className="form-group">
                            <label className="form-label">Tỷ lệ phí liên kết (%)</label>
                            <input 
                              className="form-input" 
                              type="number"
                              step="0.01"
                              placeholder="Ví dụ: 70" 
                              value={formData?.commission_rate || 0.00} 
                              onChange={e => setFormData((prev: any) => ({ ...prev, commission_rate: parseFloat(e.target.value) || 0.00 }))} 
                            />
                          </div>
                        )}
                      </div>

                      <div style={{ borderTop: '1px solid var(--color-border-light)', margin: '1.25rem 0', paddingTop: '1.25rem' }}></div>
                      
                      <h4 className="panel-title" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Thông tin Liên hệ & Trụ sở</h4>
                      <div className="grid grid-2">
                        <div className="form-group">
                          <label className="form-label">Điện thoại Hotline</label>
                          <input className="form-input" type="tel" placeholder="028 xxx xxxx" value={formData?.phone || ''} onChange={e => setFormData((prev: any) => ({ ...prev, phone: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Email Liên hệ</label>
                          <input className="form-input" type="email" placeholder="info@dai-ly.com" value={formData?.email || ''} onChange={e => setFormData((prev: any) => ({ ...prev, email: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Website</label>
                          <input className="form-input" placeholder="www.congty.com" value={formData?.website || ''} onChange={e => setFormData((prev: any) => ({ ...prev, website: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Mạng xã hội (LinkedIn/FB)</label>
                          <input className="form-input" placeholder="https://..." value={formData?.social_link || ''} onChange={e => setFormData((prev: any) => ({ ...prev, social_link: e.target.value }))} />
                        </div>
                      </div>
                    </div>

                    <div className="card-panel">
                      <h4 className="panel-title">Địa chỉ Trụ sở</h4>
                      <AddressSelect 
                        value={formData?.address || ''}
                        onChange={addr => setFormData((prev: any) => ({ ...prev, address: addr }))}
                        placeholder="Chọn địa chỉ trụ sở..."
                      />
                    </div>

                    <div className="card-panel">
                      <h4 className="panel-title">Ghi chú chi tiết</h4>
                      <textarea
                        className="form-input"
                        placeholder="Nhập ghi chú hoặc mô tả chi tiết về đối tác này..."
                        rows={4}
                        value={formData?.notes || ''}
                        onChange={e => setFormData((prev: any) => ({ ...prev, notes: e.target.value }))}
                        style={{ resize: 'vertical' }}
                      />
                    </div>

                    <div className="card-panel">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="panel-title" style={{ margin: 0 }}>Các trường tùy chỉnh (Custom Fields)</h4>
                      </div>
                      <div className="grid grid-2">
                        {Array.isArray(formData?.custom_fields) && formData.custom_fields.length > 0 ? (
                          formData.custom_fields.map((field: any, index: number) => (
                            <div className="form-group" key={field.id}>
                              <label className="form-label">{field.label} {field.is_required ? <span style={{color: 'var(--color-danger)'}}>*</span> : ''}</label>
                              {field.field_type === 'text' && (
                                <input 
                                  className="form-input" 
                                  value={field.value || ''} 
                                  onChange={e => {
                                    const nextVal = e.target.value;
                                    setFormData((prev: any) => ({
                                      ...prev,
                                      custom_fields: ensureArray(prev?.custom_fields).map((item: any, idx: number) =>
                                        idx === index ? { ...item, value: nextVal } : item
                                      )
                                    }));
                                    if (nextVal.trim() && errors[`cf_${field.id}`]) {
                                      setErrors(prev => ({ ...prev, [`cf_${field.id}`]: false }));
                                    }
                                  }} 
                                  style={{
                                    borderColor: errors[`cf_${field.id}`] ? 'var(--color-danger, #bd1d2d)' : undefined,
                                    boxShadow: errors[`cf_${field.id}`] ? '0 0 0 2px rgba(189, 29, 45, 0.1)' : undefined
                                  }}
                                />
                              )}
                              {field.field_type === 'number' && (
                                <input 
                                  type="number" 
                                  className="form-input" 
                                  value={field.value ?? ''} 
                                  onChange={e => {
                                    const nextVal = e.target.value;
                                    setFormData((prev: any) => ({
                                      ...prev,
                                      custom_fields: ensureArray(prev?.custom_fields).map((item: any, idx: number) =>
                                        idx === index ? { ...item, value: nextVal } : item
                                      )
                                    }));
                                    if (nextVal.trim() && errors[`cf_${field.id}`]) {
                                      setErrors(prev => ({ ...prev, [`cf_${field.id}`]: false }));
                                    }
                                  }} 
                                  style={{
                                    borderColor: errors[`cf_${field.id}`] ? 'var(--color-danger, #bd1d2d)' : undefined,
                                    boxShadow: errors[`cf_${field.id}`] ? '0 0 0 2px rgba(189, 29, 45, 0.1)' : undefined
                                  }}
                                />
                              )}
                              {field.field_type === 'date' && (
                                <input 
                                  type="date" 
                                  className="form-input" 
                                  value={field.value || ''} 
                                  onChange={e => {
                                    const nextVal = e.target.value;
                                    setFormData((prev: any) => ({
                                      ...prev,
                                      custom_fields: ensureArray(prev?.custom_fields).map((item: any, idx: number) =>
                                        idx === index ? { ...item, value: nextVal } : item
                                      )
                                    }));
                                    if (nextVal.trim() && errors[`cf_${field.id}`]) {
                                      setErrors(prev => ({ ...prev, [`cf_${field.id}`]: false }));
                                    }
                                  }} 
                                  style={{
                                    borderColor: errors[`cf_${field.id}`] ? 'var(--color-danger, #bd1d2d)' : undefined,
                                    boxShadow: errors[`cf_${field.id}`] ? '0 0 0 2px rgba(189, 29, 45, 0.1)' : undefined
                                  }}
                                />
                              )}
                              {field.field_type === 'dropdown' && (
                                <div style={{
                                  border: errors[`cf_${field.id}`] ? '1px solid var(--color-danger, #bd1d2d)' : undefined,
                                  borderRadius: errors[`cf_${field.id}`] ? '8px' : undefined,
                                  boxShadow: errors[`cf_${field.id}`] ? '0 0 0 2px rgba(189, 29, 45, 0.1)' : undefined
                                }}>
                                  <CustomSelect 
                                    options={safeParseArray(field.options).map((o: any) => ({ value: String(o), label: String(o) }))} 
                                    value={field.value || ''} 
                                    disabled={disableEdit}
                                    onChange={val => {
                                      const nextVal = val !== null && val !== undefined ? String(val) : '';
                                      setFormData((prev: any) => ({
                                        ...prev,
                                        custom_fields: ensureArray(prev?.custom_fields).map((item: any, idx: number) =>
                                          idx === index ? { ...item, value: nextVal } : item
                                        )
                                      }));
                                      if (nextVal.trim() && errors[`cf_${field.id}`]) {
                                        setErrors(prev => ({ ...prev, [`cf_${field.id}`]: false }));
                                      }
                                    }} 
                                  />
                                </div>
                              )}
                              {field.field_type === 'multiselect' && (() => {
                                const selected = parseMultiSelectValue(field.value);
                                const opts = safeParseArray(field.options);
                                return (
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      gap: '0.5rem',
                                      padding: errors[`cf_${field.id}`] ? '6px' : '0.25rem 0 0',
                                      border: errors[`cf_${field.id}`] ? '1px solid var(--color-danger, #bd1d2d)' : undefined,
                                      borderRadius: errors[`cf_${field.id}`] ? '8px' : undefined,
                                      boxShadow: errors[`cf_${field.id}`] ? '0 0 0 2px rgba(189, 29, 45, 0.1)' : undefined
                                    }}
                                  >
                                    {opts.map((o: any) => {
                                      const optVal = String(o);
                                      const isChecked = selected.includes(optVal);
                                      return (
                                        <label
                                          key={optVal}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            cursor: disableEdit ? 'not-allowed' : 'pointer',
                                            background: isChecked ? 'var(--color-primary, #BD1D2D)' : 'var(--color-bg)',
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            border: `1px solid ${isChecked ? 'var(--color-primary, #BD1D2D)' : 'var(--color-border)'}`,
                                            transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                                            opacity: disableEdit ? 0.65 : 1
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            disabled={disableEdit}
                                            onChange={e => {
                                              const nextSelected = e.target.checked
                                                ? [...selected, optVal]
                                                : selected.filter(s => s !== optVal);
                                              setFormData((prev: any) => ({
                                                ...prev,
                                                custom_fields: ensureArray(prev?.custom_fields).map((item: any, idx: number) =>
                                                  idx === index ? { ...item, value: nextSelected } : item
                                                )
                                              }));
                                              if (nextSelected.length > 0 && errors[`cf_${field.id}`]) {
                                                setErrors(prev => ({ ...prev, [`cf_${field.id}`]: false }));
                                              }
                                            }}
                                            style={{ display: 'none' }}
                                          />
                                          <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: isChecked ? '#ffffff' : 'var(--color-text)' }}>
                                            {optVal}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                              {field.field_type === 'checkbox' && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: disableEdit ? 'not-allowed' : 'pointer', height: '40px' }}>
                                  <CustomCheckbox 
                                    checked={field.value === 'true' || field.value === true || field.value === 1 || field.value === '1'} 
                                    disabled={disableEdit}
                                    onChange={e => {
                                      const nextVal = e.target.checked ? 'true' : 'false';
                                      setFormData((prev: any) => ({
                                        ...prev,
                                        custom_fields: ensureArray(prev?.custom_fields).map((item: any, idx: number) =>
                                          idx === index ? { ...item, value: nextVal } : item
                                        )
                                      }));
                                    }} 
                                  />
                                  <span style={{ fontSize: '0.875rem' }}>Có</span>
                                </label>
                              )}
                            </div>
                          ))
                        ) : (
                          <div style={{ gridColumn: 'span 2', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Chưa có trường tùy chỉnh nào được cấu hình cho Đối tác.</div>
                        )}
                      </div>
                    </div>
                  </fieldset>
                )}

                {activeTab === 'teaching' && (
                  <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Quick Academic Coordination Bar for Lecturer */}
                    <div style={{
                      padding: '14px 18px',
                      borderRadius: '16px',
                      background: 'var(--color-surface, #FFFFFF)',
                      border: '1px solid var(--color-border, #E2E8F0)',
                      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text)' }}>
                          Điều phối hợp đồng giảng dạy & lịch hướng dẫn 1:1
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                          Gửi Email Hợp đồng mời giảng kèm lịch dạy hoặc tạo Form đăng ký Hướng dẫn 1:1 (Khung 30 phút tự động đồng bộ Calendar).
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setLecturerModalState({ isOpen: true, tab: 'invitation' })}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#BD1D2D',
                            color: '#ffffff',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <Mail size={15} />
                          Gửi Mail Hợp Đồng & Thông Tin Mời Giảng
                        </button>
                        <button
                          type="button"
                          onClick={() => setLecturerModalState({ isOpen: true, tab: '1on1' })}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: '#0f172a',
                            color: '#ffffff',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <Calendar size={15} />
                          Tạo Form Đăng Ký Hướng Dẫn 1:1 (Slot 30p)
                        </button>
                      </div>
                    </div>

                    {loadingCampaigns && campaigns.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <Loader2 size={24} className="spin" style={{ margin: '0 auto 8px' }} />
                        <span style={{ fontSize: '0.8rem' }}>Đang tải dữ liệu giảng dạy...</span>
                      </div>
                    ) : (
                      <>
                        {/* Grid Thống kê nhanh */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                          <div style={{ padding: '20px', background: 'var(--color-surface, #FFFFFF)', border: '1px solid var(--color-border, #E2E8F0)', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Khóa học giảng dạy</div>
                            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>{teachingSummary.totalCourses}</div>
                          </div>
                          <div style={{ padding: '20px', background: 'var(--color-surface, #FFFFFF)', border: '1px solid var(--color-border, #E2E8F0)', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Số môn phụ trách</div>
                            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--color-text, #0f172a)', fontVariantNumeric: 'tabular-nums' }}>{teachingSummary.totalSubjects}</div>
                          </div>
                          <div style={{ padding: '20px', background: 'var(--color-surface, #FFFFFF)', border: '1px solid var(--color-border, #E2E8F0)', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Tổng số buổi dạy</div>
                            <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--color-text, #0f172a)', fontVariantNumeric: 'tabular-nums' }}>{teachingSummary.totalSessions}</div>
                          </div>
                        </div>

                        {/* Bảng Danh sách Khóa học & Môn học */}
                        <div className="card-panel" style={{ padding: '24px', borderRadius: '16px', background: 'var(--color-surface, #FFFFFF)', border: '1px solid var(--color-border, #E2E8F0)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '12px', marginBottom: '16px' }}>
                            <List size={18} style={{ color: '#BD1D2D' }} />
                            <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-text, #0f172a)' }}>Danh sách lớp học đang giảng dạy</h4>
                          </div>

                          {teachingSummary.courseStatsList.length === 0 ? (
                            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Chưa có thông tin giảng dạy cho giảng viên này.</div>
                          ) : (
                            <div className="table-responsive" style={{ overflowX: 'auto' }}>
                              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ borderBottom: '2px solid var(--color-border-light)' }}>
                                    <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Khóa học</th>
                                    <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Môn học giảng dạy</th>
                                    <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', width: '90px' }}>Số môn</th>
                                    <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', width: '90px' }}>Số buổi</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {teachingSummary.courseStatsList.map((stat, idx) => (
                                    <tr key={stat.campaignId || idx} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                                      <td style={{ padding: '12px 8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)' }}>{stat.campaignName}</td>
                                      <td style={{ padding: '12px 8px', fontSize: '0.8rem', color: 'var(--color-text)' }}>{stat.subjectListStr}</td>
                                      <td style={{ padding: '12px 8px', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center', color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>{stat.subjects.size}</td>
                                      <td style={{ padding: '12px 8px', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center', color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>{stat.sessionCount}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Lịch dạy sắp tới */}
                        <div className="card-panel" style={{ padding: '24px', borderRadius: '16px', background: 'var(--color-surface, #FFFFFF)', border: '1px solid var(--color-border, #E2E8F0)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '12px', marginBottom: '16px' }}>
                            <Calendar size={18} style={{ color: '#BD1D2D' }} />
                            <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-text, #0f172a)', fontVariantNumeric: 'tabular-nums' }}>Lịch dạy sắp tới ({teachingSummary.upcoming.length})</h4>
                          </div>

                          {teachingSummary.upcoming.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Chưa có lịch dạy sắp tới.</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              {teachingSummary.upcoming.map((sch, idx) => (
                                <div key={idx} style={{ padding: '12px 14px', background: 'var(--color-surface, #FFFFFF)', borderRadius: '12px', border: '1px solid var(--color-border-light, #E2E8F0)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        ...(sch.type === 'school'
                                          ? { background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D' }
                                          : { background: '#f1f5f9', color: '#334155' })
                                      }}>
                                        {sch.type === 'school' ? 'Trường' : 'Chuyên đề'}
                                      </span>
                                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{sch.campaignName}</span>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>{formatDateVN(sch.date)}</span>
                                  </div>
                                  <div style={{ fontWeight: 700, fontSize: '0.825rem', color: 'var(--color-text)' }}>{sch.subjectCode} - {sch.subjectName}: {sch.title}</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.75rem', color: '#64748b' }}>
                                    <span>Giờ: <strong style={{ color: 'var(--color-text)' }}>{sch.time}</strong></span>
                                    <span>Địa điểm: <strong style={{ color: 'var(--color-text)' }}>{sch.location}</strong></span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'activities' && (
                  <div className="animate-fade">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <h4 className="panel-title" style={{ margin: 0 }}>Lịch sử hoạt động</h4>
                      {!isViewerRole && entity?.id && (
                        <button type="button" className="btn primary sm" onClick={() => setShowActivityModal(true)}><Plus size={14}/> Thêm hoạt động</button>
                      )}
                    </div>

                    {activitiesLoading ? (
                      <div className="flex justify-center p-8"><Loader2 className="spin" /></div>
                    ) : activities.length === 0 ? (
                      <EmptyCard 
                        title="Chưa có hoạt động" 
                        description="Ghi lại các cuộc gọi, họp hoặc email với đối tác này."
                        icon={<Calendar size={32} />}
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {activities.map(act => {
                          let displayBody = act.body || 'Không có mô tả chi tiết';
                          if (typeof act.body === 'string' && act.body.startsWith('{"erp_task":')) {
                            try {
                              const parsed = JSON.parse(act.body);
                              displayBody = parsed?.erp_task?.description || 'Không có mô tả chi tiết';
                            } catch {}
                          }
                          return (
                            <div
                              key={act.id}
                              className="card-panel"
                              onClick={() => useUIStore.getState().openTaskDrawer(act)}
                              style={{ padding: '1rem', borderRadius: '16px', border: '1px solid var(--color-border-light, #E2E8F0)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', cursor: 'pointer' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <h5 style={{ fontWeight: 600 }}>{act.subject}</h5>
                                <span className="text-xs text-light" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDateVN(act.created_at)}</span>
                              </div>
                              <p className="text-sm text-light mt-1">{displayBody}</p>
                              <div className="mt-2 flex gap-2">
                                <span className="badge info sm">{act.type}</span>
                                <span className={`badge sm ${act.status === 'done' ? 'success' : act.status === 'cancelled' ? 'danger' : 'warning'}`}>
                                  {act.status === 'done' ? 'Đã xong' : act.status === 'cancelled' ? 'Đã hủy' : 'Chờ xử lý'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'contacts' && (
                    <div className="animate-fade">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <div>
                          <h4 className="panel-title" style={{ margin: 0, marginBottom: '0.25rem' }}>
                            Danh sách Khách hàng giới thiệu
                          </h4>
                          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                            Danh sách các khách hàng tiềm năng được giới thiệu bởi đối tác này.
                          </p>
                        </div>
                      </div>
                      
                      {/* Filter Bar for Partner's Referred Contacts — Ch. V Segmented Control */}
                      <div style={{ overflowX: 'auto', maxWidth: '100%', paddingBottom: '8px', marginBottom: '1rem', borderBottom: '1px solid var(--color-border-light)' }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '3px',
                          borderRadius: '10px',
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          gap: '2px',
                          whiteSpace: 'nowrap'
                        }}>
                          <button
                            type="button"
                            onClick={() => setSelectedStageFilter('all')}
                            style={{
                              height: '32px',
                              padding: '0 12px',
                              borderRadius: '7px',
                              border: 'none',
                              fontSize: '0.78rem',
                              whiteSpace: 'nowrap',
                              background: selectedStageFilter === 'all' ? '#ffffff' : 'transparent',
                              color: selectedStageFilter === 'all' ? '#BD1D2D' : '#64748b',
                              fontWeight: selectedStageFilter === 'all' ? 700 : 600,
                              boxShadow: selectedStageFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <span>Tất cả</span>
                            <span style={{
                              background: selectedStageFilter === 'all' ? 'rgba(189, 29, 45, 0.08)' : 'rgba(15, 23, 42, 0.06)',
                              color: selectedStageFilter === 'all' ? '#BD1D2D' : '#475569',
                              borderRadius: '6px',
                              padding: '1px 6px',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              fontVariantNumeric: 'tabular-nums'
                            }}>
                              {pipelineStats?.summary?.total ?? subContacts.length}
                            </span>
                          </button>

                          {ensureArray(pipelineStats?.stages).map((st: any) => {
                            const isSelected = selectedStageFilter === String(st.id);
                            return (
                              <button
                                type="button"
                                key={st.id}
                                onClick={() => setSelectedStageFilter(isSelected ? 'all' : String(st.id))}
                                style={{
                                  height: '32px',
                                  padding: '0 12px',
                                  borderRadius: '7px',
                                  border: 'none',
                                  fontSize: '0.78rem',
                                  whiteSpace: 'nowrap',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  background: isSelected ? '#ffffff' : 'transparent',
                                  color: isSelected ? '#BD1D2D' : (st.count > 0 ? '#334155' : '#64748b'),
                                  fontWeight: isSelected ? 700 : 600,
                                  boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                  cursor: 'pointer'
                                }}
                              >
                                <span>{st.name}</span>
                                <span style={{
                                  background: isSelected ? 'rgba(189, 29, 45, 0.08)' : 'rgba(15, 23, 42, 0.06)',
                                  color: isSelected ? '#BD1D2D' : '#475569',
                                  borderRadius: '6px',
                                  padding: '1px 6px',
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  fontVariantNumeric: 'tabular-nums'
                                }}>
                                  {st.count}
                                </span>
                              </button>
                            );
                          })}

                          {(pipelineStats?.summary?.nurture ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedStageFilter(selectedStageFilter === 'nurture' ? 'all' : 'nurture')}
                              style={{
                                height: '32px',
                                padding: '0 12px',
                                borderRadius: '7px',
                                border: 'none',
                                fontSize: '0.78rem',
                                whiteSpace: 'nowrap',
                                background: selectedStageFilter === 'nurture' ? '#ffffff' : 'transparent',
                                color: selectedStageFilter === 'nurture' ? '#BD1D2D' : '#475569',
                                fontWeight: selectedStageFilter === 'nurture' ? 700 : 600,
                                boxShadow: selectedStageFilter === 'nurture' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <span>Nuôi dưỡng</span>
                              <span style={{
                                background: selectedStageFilter === 'nurture' ? 'rgba(189, 29, 45, 0.08)' : 'rgba(15, 23, 42, 0.06)',
                                color: selectedStageFilter === 'nurture' ? '#BD1D2D' : '#475569',
                                borderRadius: '6px',
                                padding: '1px 6px',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums'
                              }}>
                                {pipelineStats.summary.nurture}
                              </span>
                            </button>
                          )}

                          {(pipelineStats?.summary?.lost ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedStageFilter(selectedStageFilter === 'lost' ? 'all' : 'lost')}
                              style={{
                                height: '32px',
                                padding: '0 12px',
                                borderRadius: '7px',
                                border: 'none',
                                fontSize: '0.78rem',
                                whiteSpace: 'nowrap',
                                background: selectedStageFilter === 'lost' ? '#ffffff' : 'transparent',
                                color: selectedStageFilter === 'lost' ? '#BD1D2D' : '#475569',
                                fontWeight: selectedStageFilter === 'lost' ? 700 : 600,
                                boxShadow: selectedStageFilter === 'lost' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <span>Thất bại</span>
                              <span style={{
                                background: selectedStageFilter === 'lost' ? 'rgba(189, 29, 45, 0.08)' : 'rgba(15, 23, 42, 0.06)',
                                color: selectedStageFilter === 'lost' ? '#BD1D2D' : '#475569',
                                borderRadius: '6px',
                                padding: '1px 6px',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums'
                              }}>
                                {pipelineStats.summary.lost}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {subLoading ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {[1, 2, 3].map(i => (
                              <div key={i} className="animate-pulse" style={{ height: '74px', borderRadius: '16px', background: '#f1f5f9', border: '1px solid #E2E8F0' }} />
                            ))}
                          </div>
                        ) : filteredSubContacts.length === 0 ? (
                          <EmptyCard
                            icon={<Users size={36} />}
                            title={selectedStageFilter !== 'all' ? 'Không có khách hàng nào ở giai đoạn này' : 'Chưa có khách hàng giới thiệu nào'}
                            description="Các khách hàng do đối tác giới thiệu sẽ hiển thị tại đây."
                          />
                        ) : (
                          filteredSubContacts.map(sc => {
                            const isWonStage = wonStageSlugs.includes(String(sc.pipeline_status || '').toLowerCase().trim());
                            return (
                              <div key={sc.id} className="card-panel" style={{ 
                                padding: '16px 20px',
                                background: 'var(--color-surface, #FFFFFF)',
                                border: '1px solid var(--color-border-light, #E2E8F0)',
                                borderRadius: '16px',
                                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '16px',
                                flexWrap: isMobileOrTablet ? 'wrap' : 'nowrap',
                                transition: 'border-color 0.15s ease'
                              }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', minWidth: 0, flex: 1 }}>
                                  <Avatar name={sc.name} src={sc.avatar_url} size={40} />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                        <span>{sc.name}</span>
                                        <span title="Khách hàng được giới thiệu (Ref)" style={{ display: 'inline-flex', alignItems: 'center', color: '#BD1D2D' }}>
                                          <UserPlus size={14} />
                                        </span>
                                      </h4>
                                      {sc.stage_name && (
                                        <span style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '5px',
                                          padding: '2px 8px',
                                          borderRadius: '6px',
                                          fontSize: '0.72rem',
                                          fontWeight: 700,
                                          background: isWonStage ? 'rgba(189, 29, 45, 0.08)' : '#f1f5f9',
                                          color: isWonStage ? '#BD1D2D' : '#334155'
                                        }}>
                                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: isWonStage ? '#BD1D2D' : '#64748b' }} />
                                          {sc.stage_name}
                                        </span>
                                      )}
                                      {sc.lead_status === 'won' && <span className="badge success sm">Thành công</span>}
                                      {sc.lead_status === 'nurture' && <span className="badge warning sm">Nuôi dưỡng</span>}
                                      {sc.lead_status === 'lost' && <span className="badge danger sm">Thất bại</span>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '0.75rem', color: 'var(--color-text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
                                      {sc.role && <span>{sc.role}</span>}
                                      {sc.phone && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontVariantNumeric: 'tabular-nums' }}>
                                          <Phone size={12} style={{ opacity: 0.6 }} /> {sc.phone}
                                        </span>
                                      )}
                                      {sc.email && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                          <Mail size={12} style={{ opacity: 0.6 }} /> {sc.email}
                                        </span>
                                      )}
                                      {!sc.phone && !sc.email && (
                                        <span style={{ 
                                          display: 'inline-flex', 
                                          alignItems: 'center', 
                                          gap: '6px',
                                          background: 'rgba(15, 23, 42, 0.06)',
                                          borderRadius: '6px',
                                          padding: '2px 8px',
                                          fontSize: '0.75rem'
                                        }} title={`Được giới thiệu bởi ${entity?.name || 'Đối tác'}`}>
                                          <Avatar name={entity?.name || 'Ref'} src={entity?.logo_url || entity?.avatar_url} size={16} />
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: '#334155', fontWeight: 700 }}>Ref:</span>
                                            <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{entity?.name || 'Đối tác'}</span>
                                          </span>
                                        </span>
                                      )}
                                      {sc.owner_name && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                          <Avatar src={sc.owner_avatar} name={sc.owner_name} size={18} />
                                          <span>Sale: <strong style={{ color: 'var(--color-text)' }}>{sc.owner_name}</strong></span>
                                        </span>
                                      )}
                                      {sc.created_at && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontVariantNumeric: 'tabular-nums' }}>
                                          <Calendar size={12} style={{ opacity: 0.6 }} /> Ngày nhận: {formatDateVN(sc.created_at)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                  <button 
                                    type="button"
                                    className="btn secondary sm"
                                    onClick={() => {
                                      setSelectedCustomerContact({
                                        id: sc.id,
                                        name: sc.name,
                                        phone: sc.phone,
                                        email: sc.email,
                                        pipeline_stage: sc.pipeline_stage || sc.pipeline_status || 'new',
                                        partner_id: entity?.id,
                                        partner_name: entity?.name,
                                        referrer_name: entity?.name,
                                        ...sc
                                      });
                                      setIsCustomerDrawerOpen(true);
                                    }}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <span>Chi tiết</span>
                                    <ChevronRight size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}


                {activeTab === 'deals' && (
                  <div className="animate-fade">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <h4 className="panel-title" style={{ margin: 0 }}>Cơ hội Bán hàng (Hợp đồng/Deals)</h4>
                      {!isViewerRole && entity?.id && (
                        <button type="button" className="btn primary sm" onClick={() => setShowDealModal(true)}><Plus size={14}/> Tạo Deal</button>
                      )}
                    </div>
                    {dealsLoading ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <Loader2 size={24} className="spin" style={{ margin: '0 auto' }} />
                      </div>
                    ) : deals.length === 0 ? (
                      <EmptyCard
                        icon={<Briefcase size={36} />}
                        title="Chưa có giao dịch bán nào"
                        description="Quản lý các giao dịch của đại lý/đối tác này."
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {deals.map((d: any) => (
                          <div key={d.id} className="card-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderRadius: '16px', border: '1px solid var(--color-border-light, #E2E8F0)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                            <div>
                              <h4 style={{ fontWeight: 600, fontSize: '0.9rem', color: '#BD1D2D' }}>{d.title}</h4>
                              <p className="text-xs text-light mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                Giá trị: <strong style={{ color: 'var(--color-text)' }}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(d.value || 0)}</strong>
                                {d.probability !== undefined && d.probability !== null ? ` • Xác suất: ${d.probability}%` : ''}
                                {' '}• Ngày dự kiến: {formatDateVN(d.expected_close_date || d.expected_close, 'Chưa xác định')}
                              </p>
                            </div>
                            <span
                              className="badge sm"
                              style={{
                                background: d.is_won ? 'rgba(189, 29, 45, 0.08)' : '#f1f5f9',
                                color: d.is_won ? '#BD1D2D' : '#334155',
                                fontWeight: 700,
                                borderRadius: '6px'
                              }}
                            >
                              {d.stage_name || d.stage || d.pipeline_stage || 'Đang xử lý'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'sales_orders' && (
                  <div className="animate-fade">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <h4 className="panel-title" style={{ margin: 0 }}>Đơn bán hàng (Sales Order - SO)</h4>
                      {!disableEdit && (
                        <button 
                          type="button"
                          className="btn primary sm" 
                          onClick={() => {
                            useUIStore.getState().setShowPOS(true);
                          }}
                        >
                          <Plus size={14}/> Tạo Đơn bán hàng
                        </button>
                      )}
                    </div>
                    {loadingSO ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <Loader2 size={24} className="spin" style={{ margin: '0 auto' }} />
                      </div>
                    ) : salesOrders.length === 0 ? (
                      <EmptyCard
                        icon={<FileText size={36} />}
                        title="Chưa có đơn bán hàng (SO) nào"
                        description="Các đơn bán hàng liên kết đối tác sẽ hiển thị tại đây."
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {salesOrders.map((so: any) => (
                          <div key={so.id} className="card-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderRadius: '16px', border: '1px solid var(--color-border-light, #E2E8F0)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                            <div>
                              <h4 style={{ fontWeight: 600, fontSize: '0.9rem', color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>{so.so_number || `SO-${so.id}`}</h4>
                              <p className="text-xs text-light mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                Ngày đặt: {formatDateVN(so.order_date, 'Chưa rõ')} • Tổng tiền: <strong style={{ color: 'var(--color-text)' }}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(so.total || 0)}</strong>
                              </p>
                              {so.notes && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>{so.notes}</p>}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                              <span className={`badge ${so.status === 'approved' || so.status === 'completed' ? 'success' : so.status === 'draft' ? 'info' : 'warning'}`}>
                                {so.status === 'approved' ? 'Đã duyệt' : so.status === 'completed' ? 'Hoàn thành' : so.status === 'draft' ? 'Nháp' : 'Chờ duyệt'}
                              </span>
                              <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: so.payment_status === 'paid' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: so.payment_status === 'paid' ? 'var(--color-success)' : 'var(--color-warning)' }}>
                                {so.payment_status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'purchase_orders' && (
                  <div className="animate-fade">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <h4 className="panel-title" style={{ margin: 0 }}>Đơn mua hàng (Purchase Order - PO)</h4>
                      {!disableEdit && (
                        <button 
                          type="button"
                          className="btn primary sm" 
                          onClick={() => {
                            navigate('/purchase-orders?tab=purchase_orders&create_po=1', { 
                              state: { 
                                activeTab: 'purchase_orders',
                                openPOCreate: true
                              } 
                            });
                            onClose();
                          }}
                        >
                          <Plus size={14}/> Tạo Đơn mua hàng (PO)
                        </button>
                      )}
                    </div>
                    {loadingPO ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <Loader2 size={24} className="spin" style={{ margin: '0 auto' }} />
                      </div>
                    ) : purchaseOrders.length === 0 ? (
                      <EmptyCard
                        icon={<FileBadge size={36} />}
                        title="Chưa có đơn mua hàng (PO) nào"
                        description="Các đơn mua hàng / chi trả PO sẽ hiển thị tại đây."
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {purchaseOrders.map((po: any) => (
                          <div
                            key={po.id}
                            className="card-panel"
                            onClick={() => {
                              navigate(`/approvals?open_id=${po.id}&open_type=po`);
                              onClose();
                            }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderRadius: '16px', border: '1px solid var(--color-border-light, #E2E8F0)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', cursor: 'pointer' }}
                          >
                            <div>
                              <h4 style={{ fontWeight: 600, fontSize: '0.9rem', color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>{po.po_number || `PO-${po.id}`}</h4>
                              <p className="text-xs text-light mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                Ngày lập: {formatDateVN(po.order_date, 'Chưa rõ')} • Tổng tiền: <strong style={{ color: 'var(--color-text)' }}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(po.total || 0)}</strong>
                              </p>
                              {po.notes && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>{po.notes}</p>}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                              <span className={`badge ${po.status === 'received' || po.status === 'approved' ? 'success' : po.status === 'rejected' ? 'danger' : 'warning'}`}>
                                {po.status === 'received' ? 'Đã nhận hàng' : po.status === 'approved' ? 'Đã duyệt' : po.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'invoices' && (
                  <div className="animate-fade">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <h4 className="panel-title" style={{ margin: 0 }}>Lịch sử Hóa đơn</h4>
                      {!disableEdit && (
                        <button 
                          type="button"
                          className="btn primary sm" 
                          onClick={() => {
                            const primaryContact = subContacts.find(sc => sc.isPrimary) || subContacts[0];
                            if (primaryContact) {
                              useUIStore.getState().setShowPOS({
                                id: primaryContact.id,
                                full_name: primaryContact.name,
                                phone: primaryContact.phone
                              });
                            } else {
                              useUIStore.getState().setShowPOS(true);
                            }
                          }}
                        >
                          <Plus size={14}/> Tạo hóa đơn (POS)
                        </button>
                      )}
                    </div>
                    {loadingInvoices ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <Loader2 size={24} className="spin" style={{ margin: '0 auto' }} />
                      </div>
                    ) : invoices.length === 0 ? (
                      <EmptyCard
                        icon={<FileText size={36} />}
                        title="Chưa có hóa đơn nào"
                        description="Lịch sử hóa đơn phát sinh với đối tác này sẽ hiển thị tại đây."
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {invoices.map((inv: any) => (
                          <div key={inv.id} className="card-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderRadius: '16px', border: '1px solid var(--color-border-light, #E2E8F0)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                            <div>
                              <h4 style={{ fontWeight: 600, fontSize: '0.9rem', color: '#BD1D2D' }}>{inv.invoice_number || `INV-${inv.id}`}</h4>
                              <p className="text-xs text-light mt-1">
                                Tiêu đề: <strong>{inv.title || 'Hóa đơn dịch vụ'}</strong> • Tổng tiền: <strong style={{ color: 'var(--color-text)' }}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(inv.total || 0)}</strong>
                              </p>
                            </div>
                            <span className={`badge ${inv.status === 'paid' ? 'success' : inv.status === 'pending' ? 'warning' : 'danger'}`}>
                              {inv.status === 'paid' ? 'Đã thanh toán' : inv.status === 'pending' ? 'Chờ thanh toán' : 'Quá hạn'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'expenses' && (
                  <div className="animate-fade">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <h4 className="panel-title" style={{ margin: 0 }}>{isLecturer ? 'Lịch sử Chi trả & Thưởng thù lao giảng viên' : 'Lịch sử Chi trả & Hoa hồng đối tác'}</h4>
                      {!disableEdit && (
                        <button 
                          type="button"
                          className="btn primary sm" 
                          onClick={() => {
                            const primaryContact = subContacts.find(sc => sc.isPrimary) || subContacts[0];
                            navigate('/expenses', { 
                              state: { 
                                openCreate: true, 
                                defaultContact: primaryContact ? {
                                  id: primaryContact.id,
                                  name: primaryContact.name,
                                  avatar_url: ''
                                } : null
                              } 
                            });
                            onClose();
                          }}
                        >
                          <Plus size={14}/> Thêm chi phí chi trả
                        </button>
                      )}
                    </div>
                    {loadingExpenses ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <Loader2 size={24} className="spin" style={{ margin: '0 auto' }} />
                      </div>
                    ) : expenses.length === 0 ? (
                      <EmptyCard
                        icon={<DollarSign size={36} />}
                        title="Chưa ghi nhận chi phí chi trả nào"
                        description="Các khoản chi trả thù lao / hoa hồng đối tác sẽ hiển thị tại đây."
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {expenses.map((exp: any) => (
                          <div
                            key={exp.id}
                            className="card-panel"
                            onClick={() => useUIStore.getState().openExpenseDrawer(exp.id)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderRadius: '16px', border: '1px solid var(--color-border-light, #E2E8F0)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', cursor: 'pointer' }}
                          >
                            <div>
                              <h4 style={{ fontWeight: 600, fontSize: '0.9rem', color: '#BD1D2D' }}>{exp.title}</h4>
                              <p className="text-xs text-light mt-1">
                                Số tiền: <strong style={{ color: 'var(--color-text)' }}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(exp.amount || 0)}</strong> • Loại: {exp.category || 'Khác'}
                              </p>
                            </div>
                            <span className={`badge ${exp.status === 'approved' ? 'success' : exp.status === 'rejected' ? 'danger' : 'warning'}`}>
                              {exp.status === 'approved' ? 'Đã duyệt' : exp.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'docs' && (
                  <div className="animate-fade">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <h4 className="panel-title" style={{ margin: 0 }}>Tài liệu</h4>
                      {!disableEdit && entity?.id && (
                        <label
                          className="btn outline sm"
                          style={{
                            cursor: uploadingDoc ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            opacity: uploadingDoc ? 0.65 : 1
                          }}
                        >
                          <input
                            type="file"
                            disabled={uploadingDoc || disableEdit}
                            style={{ display: 'none' }}
                            onChange={async (e) => {
                              const inputEl = e.target;
                              const file = inputEl.files?.[0];
                              if (!file || !entity?.id || disableEdit) {
                                inputEl.value = '';
                                return;
                              }
                              if (file.size > uploadMaxMb * 1024 * 1024) {
                                addToast(`Dung lượng tệp tối đa cho phép là ${uploadMaxMb}MB.`, 'error');
                                inputEl.value = '';
                                return;
                              }
                              if (docsUploadInFlightRef.current) {
                                inputEl.value = '';
                                return;
                              }
                              docsUploadInFlightRef.current = true;
                              setUploadingDoc(true);
                              try {
                                const fd = new FormData();
                                fd.append('file', file);
                                fd.append('category', `company_${entity.id}`);
                                fd.append('visibility', 'shared');
                                fd.append('name', file.name);
                                const uploadRes = await api.post('/cloud-files', fd, {
                                  headers: { 'Content-Type': 'multipart/form-data' }
                                });
                                if (uploadRes.data?.success) {
                                  addToast('Đã tải lên tài liệu mới thành công.', 'success');
                                  await fetchDocs(true);
                                } else {
                                  addToast(uploadRes.data?.message || 'Lỗi khi tải lên tài liệu', 'error');
                                }
                              } catch (err: any) {
                                addToast(err?.response?.data?.message || err?.message || 'Lỗi khi tải lên tài liệu', 'error');
                              } finally {
                                docsUploadInFlightRef.current = false;
                                setUploadingDoc(false);
                                inputEl.value = '';
                              }
                            }}
                          />
                          {uploadingDoc ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                          <span>{uploadingDoc ? 'Đang tải lên...' : 'Upload Tệp'}</span>
                        </label>
                      )}
                    </div>
                    {!entity?.id ? (
                      <EmptyCard
                        icon={<FileBadge size={36} />}
                        title="Chưa có tài liệu"
                        description="Vui lòng lưu hồ sơ đối tác trước khi tải lên tài liệu đính kèm."
                      />
                    ) : loadingDocs ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {[1, 2, 3].map(i => (
                          <div key={i} className="animate-pulse" style={{ height: '72px', borderRadius: '16px', background: '#f1f5f9', border: '1px solid #E2E8F0' }} />
                        ))}
                      </div>
                    ) : docs.length === 0 ? (
                      <EmptyCard
                        icon={<FileBadge size={36} />}
                        title="Chưa có tài liệu"
                        description="Upload hợp đồng, bằng cấp và các tài liệu liên quan đến đối tác này."
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {docs.map((doc: any) => {
                          const lowerName = String(doc.name || '').toLowerCase();
                          const isPdf = lowerName.endsWith('.pdf');
                          const isDoc = lowerName.endsWith('.doc') || lowerName.endsWith('.docx');
                          return (
                            <div key={doc.id} className="card-panel" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', borderRadius: '16px', border: '1px solid var(--color-border-light, #E2E8F0)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                              {isPdf ? (
                                <div style={{ width: 40, height: 40, background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }} title="Tài liệu PDF">
                                  <FileText size={18} style={{ color: '#BD1D2D' }} />
                                  <span style={{ position: 'absolute', bottom: 2, right: 2, fontSize: '8px', fontWeight: 700, color: '#ffffff', background: '#BD1D2D', padding: '1px 4px', borderRadius: '4px', lineHeight: 1 }}>PDF</span>
                                </div>
                              ) : isDoc ? (
                                <div style={{ width: 40, height: 40, background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }} title="Tài liệu Word (DOC/DOCX)">
                                  <FileText size={18} style={{ color: '#334155' }} />
                                  <span style={{ position: 'absolute', bottom: 2, right: 2, fontSize: '8px', fontWeight: 700, color: '#ffffff', background: '#334155', padding: '1px 4px', borderRadius: '4px', lineHeight: 1 }}>DOC</span>
                                </div>
                              ) : (
                                <div style={{ width: 40, height: 40, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <FileText size={18} />
                                </div>
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</h4>
                                <p className="text-xs text-light mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  Tải lên: {formatDateVN(doc.created_at)} • {formatFileSize(doc.file_size)}
                                  {doc.uploader_name ? ` • ${doc.uploader_name}` : ''}
                                </p>
                              </div>
                              <div className="flex gap-1" style={{ flexShrink: 0 }}>
                                <button
                                  type="button"
                                  className="btn-icon sm"
                                  title="Tải xuống"
                                  onClick={async () => {
                                    if (!doc.file_path) {
                                      addToast('Không tìm thấy đường dẫn tệp để tải xuống.', 'error');
                                      return;
                                    }
                                    try {
                                      await downloadFileWithName(doc.file_path, doc.name || 'document');
                                    } catch (err: any) {
                                      addToast(err?.message || 'Không thể tải xuống tài liệu', 'error');
                                    }
                                  }}
                                >
                                  <Download size={14} />
                                </button>
                                {!disableEdit && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn-icon sm"
                                      title="Đổi tên"
                                      onClick={() => {
                                        showConfirm({
                                          title: 'Đổi tên tài liệu',
                                          message: 'Nhập tên mới cho tài liệu:',
                                          requirePromptInput: true,
                                          promptPlaceholder: doc.name,
                                          promptDefaultValue: doc.name,
                                          confirmText: 'Lưu',
                                          cancelText: 'Hủy',
                                          onConfirm: async (newName) => {
                                            if (!newName || !newName.trim() || docsActionInFlightRef.current) return;
                                            docsActionInFlightRef.current = true;
                                            try {
                                              await api.put(`/cloud-files/${doc.id}`, {
                                                name: newName.trim(),
                                                category: doc.category || `company_${entity.id}`,
                                                visibility: doc.visibility || 'shared'
                                              });
                                              addToast('Đã đổi tên tài liệu.', 'success');
                                              await fetchDocs(true);
                                            } catch (err: any) {
                                              addToast(err?.response?.data?.message || err?.message || 'Lỗi khi đổi tên tài liệu', 'error');
                                            } finally {
                                              docsActionInFlightRef.current = false;
                                            }
                                          }
                                        });
                                      }}
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-icon sm text-danger"
                                      title="Xóa"
                                      onClick={() => {
                                        showConfirm({
                                          title: 'Xóa tài liệu?',
                                          message: `Bạn có chắc muốn xóa tài liệu "${doc.name}"?`,
                                          confirmText: 'Xóa',
                                          cancelText: 'Hủy',
                                          isDanger: true,
                                          onConfirm: async () => {
                                            if (docsActionInFlightRef.current) return;
                                            docsActionInFlightRef.current = true;
                                            try {
                                              await api.delete(`/cloud-files/${doc.id}`);
                                              addToast('Đã xóa tài liệu.', 'success');
                                              await fetchDocs(true);
                                            } catch (err: any) {
                                              addToast(err?.response?.data?.message || err?.message || 'Lỗi khi xóa tài liệu', 'error');
                                            } finally {
                                              docsActionInFlightRef.current = false;
                                            }
                                          }
                                        });
                                      }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'settings' && (
                  <div className="animate-fade" style={{ textAlign: 'left' }}>
                    <div className="card-panel mb-4" style={{ borderRadius: '16px', border: '1px solid var(--color-border-light, #E2E8F0)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                      <h4 className="panel-title">{isLecturer ? 'Thiết lập Giảng viên (Instructor Settings)' : 'Thiết lập Đối tác (Partner Settings)'}</h4>
                      <p className="text-sm text-light mb-4">{isLecturer ? 'Cấu hình các tùy chọn ưu đãi và phân nhóm giảng viên.' : 'Cấu hình các tùy chọn ưu đãi và chuyên viên phụ trách đối tác.'}</p>
                      
                      <div className="form-group mb-4">
                        <label className="form-label">Cấp độ hợp tác</label>
                        <CustomSelect 
                          options={[
                            { value: 'standard', label: 'Standard (Cơ bản)' },
                            { value: 'gold', label: 'Gold (Ưu tiên)' },
                            { value: 'platinum', label: 'Platinum (Độc quyền / Cố vấn)' }
                          ]}
                          value={formData?.sla_level || 'standard'}
                          disabled={disableEdit}
                          onChange={(val) => {
                            setFormData((prev: any) => ({ ...prev, sla_level: val }));
                          }}
                        />
                      </div>

                      <div className="form-group mb-4">
                        <label className="form-label">Chuyên viên hỗ trợ đối tác</label>
                        <CustomSelect 
                          options={ensureArray(users).map(u => ({ 
                            value: String(u.id), 
                            label: u.full_name || u.name,
                            avatar: u.avatar_url || u.avatar,
                            sublabel: u.role
                          }))}
                          value={formData?.dedicated_rep_id ? String(formData.dedicated_rep_id) : null}
                          disabled={disableEdit}
                          onChange={(val) => setFormData((prev: any) => ({ ...prev, dedicated_rep_id: val ? Number(val) : null }))}
                          placeholder="Chọn chuyên viên..."
                          searchable
                          showAvatars={true}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                        <CustomCheckbox 
                          label={<div><span style={{ fontWeight: 600, display: 'block' }}>Áp dụng chính sách thù lao ưu tiên</span><span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Đối tác này sẽ được ưu tiên phân bổ và mức thù lao tốt.</span></div>}
                          checked={!!formData?.wholesale_price}
                          disabled={disableEdit}
                          onChange={(e) => setFormData((prev: any) => ({ ...prev, wholesale_price: e.target.checked }))}
                        />
                        <CustomCheckbox 
                          label={<div><span style={{ fontWeight: 600, display: 'block' }}>Miễn khấu trừ thuế TNCN tại nguồn</span><span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>Áp dụng khi đối tác tự kê khai và quyết toán thuế TNCN riêng.</span></div>}
                          checked={!!formData?.vat_exempt}
                          disabled={disableEdit}
                          onChange={(e) => setFormData((prev: any) => ({ ...prev, vat_exempt: e.target.checked }))}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
            </AnimatePresence>
            </div>

            {/* Footer removed */}
          </motion.div>
        </>
      )}
    </AnimatePresence>

          {/* Help Modal */}
          <AnimatePresence>
            {helpModal && (
              <div style={{ position: 'fixed', inset: 0, zIndex: nestedModalZIndex, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div 
                  className="overlay-backdrop" 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                  onClick={() => setHelpModal(null)} 
                  style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', '--modal-z': nestedModalZIndex } as React.CSSProperties}
                />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: drawerMotionMs / 1000, ease: [0.25, 0.1, 0.25, 1] as any }}
                  style={{
                    position: 'relative',
                    background: 'var(--color-surface)', width: '400px', borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-xl)', zIndex: Math.min(nestedModalZIndex + 1, 2147483647), border: '1px solid var(--color-border)',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ background: '#BD1D2D', padding: '16px 20px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><HelpCircle size={18} /> {helpModal.title}</h3>
                    <button type="button" onClick={() => setHelpModal(null)} style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '50%', padding: '4px', color: 'white' }}><X size={16} /></button>
                  </div>
                  <div style={{ padding: '1.25rem', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>
                    {helpModal.content}
                  </div>
                  <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'flex-end', background: 'var(--color-bg)' }}>
                    <button type="button" className="btn outline" onClick={() => setHelpModal(null)}>Đã hiểu</button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* CREATE DEAL MODAL */}
          <AnimatePresence>
            {showDealModal && (
              <div style={{ position: 'fixed', inset: 0, zIndex: nestedModalZIndex, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div 
                  className="overlay-backdrop" 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                  onClick={() => setShowDealModal(false)}
                  style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', '--modal-z': nestedModalZIndex } as React.CSSProperties}
                />
                <motion.div
                  className="modal-sheet"
                  style={{ position: 'relative', width: '100%', maxWidth: 680, zIndex: Math.min(nestedModalZIndex + 1, 2147483647) }}
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: drawerMotionMs / 1000, ease: [0.25, 0.1, 0.25, 1] as any }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="modal-header">
                    <h3>Tạo Deal mới cho {formData?.name || 'Đối tác'}</h3>
                    <button type="button" className="btn-icon-bare" onClick={() => setShowDealModal(false)}><X size={20} /></button>
                  </div>
                  <div className="modal-body">
                    <div className="form-group">
                      <label className="form-label">Tên Deal *</label>
                      <input className="form-input" placeholder="VD: Hợp đồng triển khai chương trình..." value={dealForm.title} onChange={e => setDealForm(prev => ({ ...prev, title: e.target.value }))} autoFocus />
                    </div>
                    <div className="grid grid-2">
                      <div className="form-group">
                        <label className="form-label">Giá trị dự kiến</label>
                        <CurrencyInput
                          value={dealForm.value || 0}
                          onChange={val => setDealForm(prev => ({ ...prev, value: String(val) }))}
                          placeholder="VD: 1.500.000.000"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Giai đoạn Pipeline</label>
                        <CustomSelect 
                          options={pipelineStages.map((st: any) => ({
                            value: String(st.id),
                            label: st.name
                          }))}
                          value={dealForm.stage_id || (pipelineStages[0]?.id ? String(pipelineStages[0].id) : '')}
                          onChange={val => setDealForm(prev => ({ ...prev, stage_id: String(val) }))}
                          placeholder={loadingStages ? 'Đang tải giai đoạn...' : 'Chọn giai đoạn...'}
                        />
                      </div>
                    </div>
                    <div className="grid grid-2">
                      <div className="form-group">
                        <label className="form-label">Xác suất chốt (%)</label>
                        <input
                          className="form-input"
                          type="number"
                          min={0}
                          max={100}
                          value={dealForm.probability}
                          onChange={e => {
                            const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                            setDealForm(prev => ({ ...prev, probability: val }));
                          }}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Ngày dự kiến chốt</label>
                        <input
                          className="form-input"
                          type="date"
                          value={dealForm.expected_close_date}
                          onChange={e => setDealForm(prev => ({ ...prev, expected_close_date: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn outline" onClick={() => setShowDealModal(false)} disabled={creatingDeal}>Hủy</button>
                    <button type="button" className="btn primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={handleCreateDeal} disabled={creatingDeal || !dealForm.title.trim()}>
                      {creatingDeal && <Loader2 size={16} className="spin" />}
                      <span>{creatingDeal ? 'Đang tạo...' : 'Tạo Deal'}</span>
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {showActivityModal && (
            <ActivityModal 
              isOpen={showActivityModal} 
              onClose={() => setShowActivityModal(false)}
              entityType="company"
              entityId={entity?.id}
              onSuccess={() => fetchActivities(true)}
              userId={entity?.owner_id || currentUser?.id}
              zIndex={Math.min(Math.max(2147483640, effectiveZIndex + 15), nestedModalZIndex)}
            />
          )}

          {isCustomerDrawerOpen && selectedCustomerContact && (
            <CustomerProfileDrawer
              isOpen={isCustomerDrawerOpen}
              onClose={() => {
                setIsCustomerDrawerOpen(false);
                setSelectedCustomerContact(null);
                if (isOpen) {
                  document.body.style.overflow = 'hidden';
                }
              }}
              contact={selectedCustomerContact}
              zIndex={nestedCustomerZIndex}
              onUpdate={() => {
                fetchSubContacts();
              }}
            />
          )}

          {lecturerModalState.isOpen && (
            <LecturerInvitationAnd1on1Modal
              isOpen={lecturerModalState.isOpen}
              onClose={() => setLecturerModalState(prev => ({ ...prev, isOpen: false }))}
              initialTab={lecturerModalState.tab}
              zIndex={nestedModalZIndex}
              lecturer={{
                id: Number(formData?.id || entity?.id || 0),
                name: formData?.name || entity?.name || '',
                email: formData?.email || entity?.email || '',
                phone: formData?.phone || entity?.phone || '',
                degree_title: formData?.degree_title || '',
                teaching_subjects: formData?.focus_markets || ''
              }}
            />
          )}
    </>,
    document.body
  );
};

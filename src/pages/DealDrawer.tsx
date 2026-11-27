import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, DollarSign, History, Briefcase, Box, FileText, CheckCircle2, Link2, Paperclip, RefreshCw, ArrowRight, Loader2, Package } from 'lucide-react';
import { CustomSelect } from '../components/ui/CustomSelect';
import { CustomCheckbox } from '../components/ui/CustomCheckbox';
import { EmptyCard } from '../components/ui/EmptyCard';
import { useUIStore } from '../store/uiStore';
import { useAuth } from '../contexts/AuthContext';
import { useTypedSetting, useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import api from '../api/axios';
import { createPortal } from 'react-dom';
import styles from './EntityDrawer.module.css';
import { TagInput } from '../components/ui/TagInput';
import { MentionInput } from '../components/ui/MentionInput';
import { Avatar } from '../components/ui/Avatar';
import { numberToText } from '../utils/numberToText';
import { CustomModal } from '../components/ui/CustomModal';
import { VietnameseDateInput } from '../components/ui/VietnameseDateInput';
import { pushOverlay } from '../utils/overlayStack';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { isViewer as checkIsViewer, isPrivilegedCRM, normalizeRole } from '../utils/roleUtils';
import { ensureArray, extractArray } from '../utils/safeArray';
import { formatDateVN } from '../utils/dateUtils';

interface DealDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  deal: any;
  onSave: (data?: any) => void | Promise<any>;
  stages: any[];
  onSwitchDeal?: (deal: any) => void;
  allowPipelineBackward?: boolean;
  allowPipelineSkip?: boolean;
}

const isAbortError = (e: any): boolean =>
  e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED' || e?.message === 'canceled';

const parseServerDate = (dateStr?: string | null): Date => {
  if (!dateStr) return new Date(NaN);
  const s = String(dateStr).trim();
  if (!s || s === '0000-00-00' || s === '0000-00-00 00:00:00') return new Date(NaN);
  if (s.includes('T')) return new Date(s);
  return new Date(s.replace(/-/g, '/'));
};

const formatServerDateTime = (dateStr?: string | null): string => {
  const d = parseServerDate(dateStr);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN');
};

const safeParseTags = (rawTags: unknown): string[] => {
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((t: any) => String(typeof t === 'object' && t !== null ? (t.name || t.label || '') : (t ?? '')).trim())
      .filter(Boolean);
  }
  if (typeof rawTags === 'string') {
    const trimmed = rawTags.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((t: any) => String(typeof t === 'object' && t !== null ? (t.name || t.label || '') : (t ?? '')).trim())
          .filter(Boolean);
      }
    } catch {
      return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
};

const safeParseJsonArray = (raw: unknown): any[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const TABS = [
  { id: 'info', label: 'Thông tin cơ bản', icon: <Briefcase size={16} /> },
  { id: 'activities', label: 'Lịch sử tương tác', icon: <History size={16} /> },
  { id: 'products', label: 'Sản phẩm báo giá', icon: <Box size={16} /> },
  { id: 'quotes', label: 'Báo giá & Hợp đồng', icon: <FileText size={16} /> },
  { id: 'audit', label: 'Vết kiểm toán', icon: <Link2 size={16} /> },
];

export const DealDrawer: React.FC<DealDrawerProps> = ({
  isOpen,
  onClose,
  deal,
  onSave,
  stages,
  onSwitchDeal,
  allowPipelineBackward: allowPipelineBackwardProp,
  allowPipelineSkip: allowPipelineSkipProp,
}) => {
  const addToast = useUIStore((s) => s.addToast);
  const setShowPOS = useUIStore((s) => s.setShowPOS);
  const [activeTab, setActiveTab] = useState<'info' | 'activities' | 'products' | 'quotes' | string>('info');
  const [formData, setFormData] = useState<any>(() => (deal ? { ...deal, tags: safeParseTags(deal.tags) } : {}));

  const { user: currentUser } = useAuth();
  const activeDealId = Number(formData?.id || deal?.id || 0);
  const uploadMaxMb = Math.max(1, Number(useTypedSubSetting<number>('core.upload_security_policy', 'max_mb', 50)) || 50);
  const stageSlugsCfg = useTypedSetting<Record<string, any>>('crm.pipeline_stage_slugs', {});
  const wonSlugs = useMemo(
    () => Array.from(new Set(['won', 'enrolled', 'hoc_vien', ...ensureArray(stageSlugsCfg?.won).map((s: any) => String(s).toLowerCase().trim())].filter(Boolean))),
    [stageSlugsCfg]
  );
  const lockedAfterWonSlugs = useMemo(
    () => Array.from(new Set(['hoc_vien', 'enrolled', ...ensureArray(stageSlugsCfg?.locked_after_won).map((s: any) => String(s).toLowerCase().trim())].filter(Boolean))),
    [stageSlugsCfg]
  );
  const depositSlugConfigured = String(stageSlugsCfg?.deposit || '').toLowerCase().trim();
  const isViewerRole = checkIsViewer(currentUser);
  const isPrivileged = isPrivilegedCRM(currentUser);
  const isOwner = !activeDealId || Number(currentUser?.id) === Number(formData?.owner_id || deal?.owner_id || formData?.created_by || deal?.created_by);
  const isReadOnly = !isOwner && !isPrivileged;
  const isViewer = isViewerRole || isReadOnly;

  const [settingsAllowBackward, setSettingsAllowBackward] = useState(false);
  const [settingsAllowSkip, setSettingsAllowSkip] = useState(false);
  const effectiveAllowBackward = allowPipelineBackwardProp ?? settingsAllowBackward;
  const effectiveAllowSkip = allowPipelineSkipProp ?? settingsAllowSkip;

  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  const [dealQuotes, setDealQuotes] = useState<any[]>([]);
  const [dealQuoteItems, setDealQuoteItems] = useState<any[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [loadingQuotesProducts, setLoadingQuotesProducts] = useState(false);
  const [isSavingDeal, setIsSavingDeal] = useState(false);

  // Unit Switching State
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false);
  const [switchUnitCode, setSwitchUnitCode] = useState('');
  const [switchPrice, setSwitchPrice] = useState('');
  const [switchProjectId, setSwitchProjectId] = useState('');
  const [switchReason, setSwitchReason] = useState('');
  const [submittingSwitch, setSubmittingSwitch] = useState(false);
  const switchUnitInFlightRef = useRef(false);
  const addNoteInFlightRef = useRef(false);
  const saveDealInFlightRef = useRef(false);
  const escapeHandlerRef = useRef<() => void>(() => {});

  const listsAbortRef = useRef<AbortController | null>(null);
  const notesAbortRef = useRef<AbortController | null>(null);
  const detailsAbortRef = useRef<AbortController | null>(null);
  const projectFallbackAbortRef = useRef<AbortController | null>(null);
  const settingsAbortRef = useRef<AbortController | null>(null);
  const quotesProductsAbortRef = useRef<AbortController | null>(null);
  const lastSwitchedDealIdRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const handleSwitchUnit = async () => {
    if (isViewer || switchUnitInFlightRef.current || !activeDealId) return;
    const parsedPrice = Number(switchPrice);
    if (!switchUnitCode.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      addToast('Vui lòng điền đầy đủ mã căn hộ mới và giá bán mới hợp lệ (> 0)', 'error');
      return;
    }
    switchUnitInFlightRef.current = true;
    setSubmittingSwitch(true);
    try {
      const res = await api.post(`/deals/${activeDealId}/switch`, {
        new_unit_code: switchUnitCode.trim(),
        new_price: parsedPrice,
        new_project_id: switchProjectId ? Number(switchProjectId) : undefined,
        reason: switchReason
      });
      if (res.data?.success) {
        addToast('Đổi căn hộ giao dịch thành công', 'success');
        setIsSwitchModalOpen(false);
        onClose(); // Close the drawer to refresh the main page
        if (onSave) {
          onSave(); // trigger reload on main page
        }
      } else {
        addToast(res.data?.message || 'Lỗi đổi căn hộ', 'error');
      }
    } catch (e: any) {
      addToast(e.response?.data?.message || e.message || 'Lỗi kết nối', 'error');
    } finally {
      switchUnitInFlightRef.current = false;
      setSubmittingSwitch(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const unregister = pushOverlay('deal-drawer', () => {
        escapeHandlerRef.current();
      }, 2147483625);
      return () => {
        document.body.style.overflow = prevOverflow;
        unregister();
      };
    }
  }, [isOpen]);

  const renderFormattedText = (text: string) => {
    if (!text) return '';
    const regex = /(https?:\/\/[^\s]+|@[\p{L}\p{N}_()]+)/gu;
    const parts = text.split(regex);
    return parts.map((part, index) => {
      if (part.startsWith('http://') || part.startsWith('https://')) {
        return (
          <a
            key={index}
            href={part}
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

        const displayName = taggedUser?.full_name || part.substring(1).replace(/_/g, ' ');
        const avatarUrl = taggedUser?.avatar_url || taggedUser?.avatar;
        const initial = displayName ? displayName.charAt(0).toUpperCase() : '?';

        return (
          <span
            key={index}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: '#BD1D2D',
              background: 'rgba(189, 29, 45, 0.08)',
              padding: '2px 8px',
              borderRadius: '9999px',
              margin: '0 2px',
              fontWeight: 600,
              fontSize: '0.85em',
              verticalAlign: 'middle'
            }}
          >
            <Avatar name={displayName} src={avatarUrl} size={16} />
            @{displayName}
          </span>
        );
      }
      return part;
    });
  };

  const fetchLists = async () => {
    if (listsAbortRef.current) listsAbortRef.current.abort();
    const abortController = new AbortController();
    listsAbortRef.current = abortController;
    setLoadingLists(true);
    try {
      const usersEndpoint = '/users?all=1';
      const roleNorm = normalizeRole(currentUser);
      const isRosterRestricted = ['sale', 'sales', 'manager', 'director'].includes(roleNorm);
      const bypassProj = isRosterRestricted ? '' : '?bypass_roster=1';
      const [rC, rCo, rT, rU, rP] = await Promise.all([
        api.get('/contacts?limit=1000', { signal: abortController.signal }),
        api.get('/companies', { signal: abortController.signal }),
        api.get('/tags', { signal: abortController.signal }),
        api.get(usersEndpoint, { signal: abortController.signal }).catch(() => ({ data: { data: [] } })),
        api.get(`/projects${bypassProj}`, { signal: abortController.signal }).catch(() => ({ data: { data: [] } }))
      ]);
      if (abortController.signal.aborted) return;
      setContacts(extractArray(rC?.data));
      setCompanies(extractArray(rCo?.data));
      setAllTags(extractArray(rT?.data));
      const list = extractArray(rU?.data);
      const mapped = list.map((u: any) => ({
        ...u,
        id: u.id,
        full_name: u.full_name || u.name || u.username || '',
        avatar_url: u.avatar_url || u.avatar || '',
        role: u.role || 'sale'
      }));
      setUsers(mapped);
      setProjects(extractArray(rP?.data));
    } catch (e: any) {
      if (isAbortError(e)) return;
    } finally {
      if (!abortController.signal.aborted) setLoadingLists(false);
    }
  };

  const [dealTasks, setDealTasks] = useState<any[]>([]);

  const fetchNotes = useCallback(async (targetDealId?: number) => {
    const did = Number(targetDealId || formData?.id || deal?.id || 0);
    if (!did) {
      setNotes([]);
      setDealTasks([]);
      setLoadingNotes(false);
      return;
    }
    if (notesAbortRef.current) notesAbortRef.current.abort();
    const abortController = new AbortController();
    notesAbortRef.current = abortController;
    setLoadingNotes(true);
    try {
      const [rNotes, rTasks] = await Promise.all([
        api.get(`/notes?entity_type=deal&entity_id=${did}`, { signal: abortController.signal }),
        api.get(`/activities?related_type=deal&related_id=${did}`, { signal: abortController.signal }).catch(() => ({ data: { data: [] } }))
      ]);
      if (abortController.signal.aborted) return;
      setNotes(extractArray(rNotes?.data));
      setDealTasks(extractArray(rTasks?.data));
    } catch (e: any) {
      if (isAbortError(e)) return;
      setNotes([]);
      setDealTasks([]);
    } finally {
      if (!abortController.signal.aborted) setLoadingNotes(false);
    }
  }, [formData?.id, deal?.id]);

  const fetchDealQuotesAndProducts = useCallback(async (targetDealId?: number) => {
    const did = Number(targetDealId || formData?.id || deal?.id || 0);
    if (quotesProductsAbortRef.current) quotesProductsAbortRef.current.abort();
    const abortController = new AbortController();
    quotesProductsAbortRef.current = abortController;

    if (!did) {
      setDealQuotes([]);
      setDealQuoteItems([]);
      setLoadingQuotesProducts(false);
      return;
    }

    setLoadingQuotesProducts(true);
    try {
      const [quotesRes, productsRes] = await Promise.allSettled([
        api.get('/quotes', { params: { deal_id: did, limit: 100 }, signal: abortController.signal }),
        api.get('/products', { params: { limit: 50 }, signal: abortController.signal })
      ]);
      if (abortController.signal.aborted) return;

      if (productsRes.status === 'fulfilled') {
        setCatalogProducts(extractArray(productsRes.value?.data));
      } else if (!isAbortError((productsRes as any).reason)) {
        setCatalogProducts([]);
      }

      if (quotesRes.status === 'fulfilled') {
        const rawQuotes = extractArray(quotesRes.value?.data);
        const matchedQuotes = rawQuotes.filter((q: any) => Number(q.deal_id) === did);
        setDealQuotes(matchedQuotes);

        if (matchedQuotes.length > 0) {
          const detailResults = await Promise.allSettled(
            matchedQuotes.slice(0, 10).map((q: any) =>
              api.get(`/quotes/${q.id}`, { signal: abortController.signal })
            )
          );
          if (abortController.signal.aborted) return;
          const itemsAgg: any[] = [];
          detailResults.forEach((res, idx) => {
            if (res.status === 'fulfilled') {
              const qObj = res.value?.data?.data || res.value?.data || matchedQuotes[idx];
              const qItems = ensureArray(qObj?.items);
              qItems.forEach((it: any) => {
                itemsAgg.push({
                  ...it,
                  quote_id: qObj?.id || matchedQuotes[idx]?.id,
                  quote_number: qObj?.quote_number || matchedQuotes[idx]?.quote_number || `#${matchedQuotes[idx]?.id}`,
                  quote_status: qObj?.status || matchedQuotes[idx]?.status || 'draft',
                });
              });
            }
          });
          setDealQuoteItems(itemsAgg);
        } else {
          setDealQuoteItems([]);
        }
      } else if (!isAbortError((quotesRes as any).reason)) {
        setDealQuotes([]);
        setDealQuoteItems([]);
      }
    } catch (e: any) {
      if (isAbortError(e)) return;
      setDealQuotes([]);
      setDealQuoteItems([]);
    } finally {
      if (!abortController.signal.aborted) setLoadingQuotesProducts(false);
    }
  }, [formData?.id, deal?.id]);

  const getLinkedDealId = () => {
    // 1. Check description
    const desc = formData?.description || '';
    const matchDesc = desc.match(/Deal ID:\s*(\d+)/i) || desc.match(/Deal ID mới:\s*(\d+)/i) || desc.match(/Deal ID cũ:\s*(\d+)/i);
    if (matchDesc) return parseInt(matchDesc[1], 10);

    // 2. Check notes
    for (const note of ensureArray(notes)) {
      const body = note?.body || '';
      const matchNote = body.match(/Deal ID:\s*(\d+)/i) || body.match(/Deal ID mới:\s*(\d+)/i) || body.match(/Deal ID cũ:\s*(\d+)/i);
      if (matchNote) return parseInt(matchNote[1], 10);
    }
    return null;
  };

  const fetchDealDetails = async (dealId: number) => {
    if (!dealId) return;
    if (detailsAbortRef.current) detailsAbortRef.current.abort();
    const abortController = new AbortController();
    detailsAbortRef.current = abortController;
    try {
      const res = await api.get(`/deals/${dealId}`, { signal: abortController.signal });
      if (abortController.signal.aborted) return;
      if (res.data?.success && res.data?.data) {
        const d = res.data.data;
        setFormData({
          ...d,
          tags: safeParseTags(d.tags)
        });
      }
    } catch (e: any) {
      if (isAbortError(e)) return;
      console.error("Error fetching deal details:", e);
    }
  };

  const handleSwitchToLinkedDeal = async (linkedId: number, toastSuccessMessage: string) => {
    if (!linkedId) return;
    if (detailsAbortRef.current) detailsAbortRef.current.abort();
    const abortController = new AbortController();
    detailsAbortRef.current = abortController;
    try {
      const res = await api.get(`/deals/${linkedId}`, { signal: abortController.signal });
      if (abortController.signal.aborted) return;
      if (res.data?.success && res.data?.data) {
        const nextRaw = res.data.data;
        const normalizedDeal = {
          ...nextRaw,
          tags: safeParseTags(nextRaw.tags)
        };
        lastSwitchedDealIdRef.current = Number(normalizedDeal.id);
        setFormData(normalizedDeal);
        onSwitchDeal?.(normalizedDeal);
        fetchNotes(Number(normalizedDeal.id));
        fetchDealQuotesAndProducts(Number(normalizedDeal.id));
        addToast(toastSuccessMessage, 'success');
      } else {
        addToast('Không tìm thấy thông tin Deal liên kết', 'error');
      }
    } catch (e: any) {
      if (isAbortError(e)) return;
      addToast('Không thể tải Deal liên kết', 'error');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (allowPipelineBackwardProp !== undefined && allowPipelineSkipProp !== undefined) return;
    if (settingsAbortRef.current) settingsAbortRef.current.abort();
    const controller = new AbortController();
    settingsAbortRef.current = controller;
    api.get('/api.php?action=get_settings', { signal: controller.signal })
      .then(res => {
        if (controller.signal.aborted) return;
        const d = res.data?.data;
        if (res.data?.success && d) {
          setSettingsAllowBackward(d.allow_pipeline_backward === '1' || d.allow_pipeline_backward === 1);
          setSettingsAllowSkip(d.allow_pipeline_skip === '1' || d.allow_pipeline_skip === 1);
        }
      })
      .catch(e => {
        if (isAbortError(e)) return;
      });
    return () => controller.abort();
  }, [isOpen, allowPipelineBackwardProp, allowPipelineSkipProp]);

  useEffect(() => {
    setActiveTab('info');
  }, [deal?.id]);

  const companyOptions = useMemo(() => ensureArray(companies).map(c => ({ value: c.id, label: c.name })), [companies]);
  const contactOptions = useMemo(() => ensureArray(contacts).map(c => ({ value: c.id, label: c.full_name || '', avatar: c.avatar_url || c.avatar })), [contacts]);
  const projectOptions = useMemo(() => ensureArray(projects).map(p => ({ value: String(p.id), label: p.name })), [projects]);

  useEffect(() => {
    if (!isOpen) return;
    const incomingId = Number(deal?.id || 0);
    if (incomingId && lastSwitchedDealIdRef.current === incomingId) {
      lastSwitchedDealIdRef.current = null;
      return;
    }

    setNotes([]);
    setDealTasks([]);
    setDealQuotes([]);
    setDealQuoteItems([]);
    setNewNote('');
    setIsSwitchModalOpen(false);
    setNoteAttachmentFile(null);
    setNoteAttachmentPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    if (deal) {
      setFormData({
        ...deal,
        tags: safeParseTags(deal.tags)
      });
      if (deal.id) {
        fetchDealDetails(Number(deal.id));
        fetchNotes(Number(deal.id));
        fetchDealQuotesAndProducts(Number(deal.id));
      } else {
        setLoadingNotes(false);
        setLoadingQuotesProducts(false);
      }
    } else {
      setFormData({});
      setLoadingNotes(false);
      setLoadingQuotesProducts(false);
    }
    fetchLists();
    return () => {
      if (listsAbortRef.current) listsAbortRef.current.abort();
      if (notesAbortRef.current) notesAbortRef.current.abort();
      if (detailsAbortRef.current) detailsAbortRef.current.abort();
      if (quotesProductsAbortRef.current) quotesProductsAbortRef.current.abort();
    };
  }, [deal, isOpen]);

  useEffect(() => {
    if (!isOpen || !activeDealId) return;
    const handleTaskUpdated = () => {
      fetchNotes(activeDealId);
    };
    window.addEventListener('task-updated', handleTaskUpdated);
    window.addEventListener('task-local-updated', handleTaskUpdated);
    return () => {
      window.removeEventListener('task-updated', handleTaskUpdated);
      window.removeEventListener('task-local-updated', handleTaskUpdated);
    };
  }, [isOpen, activeDealId, fetchNotes]);

  useEffect(() => {
    if (isOpen && formData?.project_id && projects.length > 0) {
      const activeProjId = Number(formData.project_id);
      if (activeProjId > 0 && !projects.some((p: any) => Number(p.id) === activeProjId)) {
        if (projectFallbackAbortRef.current) projectFallbackAbortRef.current.abort();
        const controller = new AbortController();
        projectFallbackAbortRef.current = controller;
        api.get(`/projects/${activeProjId}`, { signal: controller.signal })
          .then(res => {
            if (controller.signal.aborted) return;
            const pObj = res.data?.data || res.data;
            if (pObj && pObj.id) {
              setProjects(prev => (prev.some((x: any) => Number(x.id) === Number(pObj.id)) ? prev : [pObj, ...prev]));
            }
          })
          .catch(e => {
            if (isAbortError(e)) return;
          });
        return () => controller.abort();
      }
    }
  }, [isOpen, formData?.project_id, projects.length]);

  useEffect(() => {
    return () => {
      if (listsAbortRef.current) listsAbortRef.current.abort();
      if (notesAbortRef.current) notesAbortRef.current.abort();
      if (detailsAbortRef.current) detailsAbortRef.current.abort();
      if (projectFallbackAbortRef.current) projectFallbackAbortRef.current.abort();
      if (settingsAbortRef.current) settingsAbortRef.current.abort();
      if (quotesProductsAbortRef.current) quotesProductsAbortRef.current.abort();
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const [noteAttachmentFile, setNoteAttachmentFile] = useState<File | null>(null);
  const [noteAttachmentPreview, setNoteAttachmentPreview] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);

  const handleNoteImagePaste = (file: File) => {
    if (isViewer) return;
    if (file.size > uploadMaxMb * 1024 * 1024) {
      addToast(`Dung lượng tệp đính kèm không được vượt quá ${uploadMaxMb}MB`, 'error');
      return;
    }
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setNoteAttachmentFile(file);
    setNoteAttachmentPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return previewUrl;
    });
    addToast('Đã thêm tệp đính kèm', 'info');
  };

  const handleNoteFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isViewer) {
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (file) handleNoteImagePaste(file);
    e.target.value = '';
  };

  const removeNoteAttachment = () => {
    if (noteAttachmentPreview) {
      URL.revokeObjectURL(noteAttachmentPreview);
    }
    setNoteAttachmentFile(null);
    setNoteAttachmentPreview(null);
  };

  const handleAddNote = async () => {
    if (isViewer || !activeDealId) return;
    if (!newNote.trim() && !noteAttachmentFile) return;
    if (addNoteInFlightRef.current) return;
    addNoteInFlightRef.current = true;
    setIsSavingNote(true);

    let finalBody = newNote.trim();

    try {
      if (noteAttachmentFile) {
        const fd = new FormData();
        fd.append('file', noteAttachmentFile);
        const res = await api.post('/upload', fd);
        const fileUrl = res.data?.data?.url || res.data?.url || res.data?.data?.file_path || res.data?.file_path;
        if (fileUrl) {
          const attLine = `[${noteAttachmentFile.name}](${fileUrl})`;
          finalBody = finalBody ? `${finalBody}\n${attLine}` : attLine;
        }
      }

      await api.post(`/notes?entity_type=deal&entity_id=${activeDealId}`, { body: finalBody, type: 'internal' });
      setNewNote('');
      removeNoteAttachment();
      addToast('Đã lưu ghi chú mới', 'success');
      fetchNotes(activeDealId);
    } catch (e: any) {
      console.error('Lỗi khi lưu ghi chú deal:', e);
      addToast(e?.response?.data?.message || 'Không thể lưu ghi chú vào máy chủ. Vui lòng thử lại.', 'error');
    } finally {
      addNoteInFlightRef.current = false;
      setIsSavingNote(false);
    }
  };

  const [isVisible, setIsVisible] = useState(isOpen);
  const [animateIn, setAnimateIn] = useState(isOpen);

  useEffect(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (isOpen) {
      setIsVisible(true);
      const timer = window.setTimeout(() => setAnimateIn(true), 10);
      return () => window.clearTimeout(timer);
    } else {
      setAnimateIn(false);
      const timer = window.setTimeout(() => setIsVisible(false), 220);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = () => {
    setAnimateIn(false);
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, 220);
  };

  escapeHandlerRef.current = () => {
    if (isSwitchModalOpen) {
      if (!submittingSwitch) setIsSwitchModalOpen(false);
    } else {
      handleClose();
    }
  };

  const currentStageObj = useMemo(
    () => ensureArray(stages).find((s: any) => Number(s.id) === Number(formData?.stage_id || deal?.stage_id)),
    [stages, formData?.stage_id, deal?.stage_id]
  );
  const currentStageSlug = String(currentStageObj?.system_slug || formData?.pipeline_status || '').toLowerCase().trim();
  const wonStage = Boolean(
    currentStageObj?.is_won === 1 ||
    currentStageObj?.is_won === true ||
    wonSlugs.includes(currentStageSlug)
  );
  const isLostDeal = Boolean(
    formData?.is_lost === 1 ||
    formData?.is_lost === true ||
    currentStageObj?.is_lost === 1 ||
    currentStageObj?.is_lost === true
  );
  const canShowSwitchUnit = Boolean(
    activeDealId &&
    !isViewer &&
    !isLostDeal &&
    (Boolean(formData?.is_won === 1 || formData?.is_won === true) || wonStage || formData?.status === 'won')
  );

  const displayProbability = formData?.probability ?? formData?.prob ?? 0;

  const updateCustomFieldAt = (targetIdx: number, nextValue: any) => {
    setFormData((prev: any) => {
      const existing = Array.isArray(prev?.custom_fields) ? prev.custom_fields : [];
      const nextFields = existing.map((item: any, idx: number) =>
        idx === targetIdx ? { ...item, value: nextValue } : item
      );
      return { ...prev, custom_fields: nextFields };
    });
  };

  if (!isVisible) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="drawer-backdrop"
        onClick={handleClose}
        style={{
          zIndex: 2147483620,
          '--drawer-backdrop-z': 2147483620,
          opacity: animateIn ? 1 : 0,
          transition: 'opacity 0.22s cubic-bezier(0.25, 0.1, 0.25, 1)',
          pointerEvents: animateIn ? 'auto' : 'none'
        } as any}
      />
      <div
        className={`${styles.drawer} drawer-sheet drawer-panel`}
        style={{
          zIndex: 2147483625, ...({ '--drawer-panel-z': 2147483625 } as any),
          transform: animateIn ? 'translateX(0)' : 'translateX(60%)',
          opacity: animateIn ? 1 : 0,
          transition: 'transform 0.22s cubic-bezier(0.25, 0.1, 0.25, 1), opacity 0.22s cubic-bezier(0.25, 0.1, 0.25, 1)',
          willChange: 'transform, opacity'
        }}
      >
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerProfile}>
                <div
                  className="avatar-placeholder lg"
                  style={{
                    background: 'rgba(189, 29, 45, 0.08)',
                    color: '#BD1D2D',
                    border: '1px solid rgba(189, 29, 45, 0.18)',
                    fontSize: '1.25rem',
                    width: 56,
                    height: 56,
                    borderRadius: '14px'
                  }}
                >
                  <DollarSign size={26} />
                </div>
                <div>
                  <h2 className={styles.title}>{formData?.title || 'Tên cơ hội...'}</h2>
                  <p className={styles.subtitle} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong>{formData?.company_name || formData?.company || 'Chưa chọn công ty'}</strong> - Liên hệ: {formData?.contact_name || formData?.contact || 'N/A'}
                  </p>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontWeight: 700, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                    <span>{formData?.value ? Number(formData.value).toLocaleString('vi-VN') : '0'} đ</span>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>| Xác suất: {displayProbability}%</span>
                  </div>
                </div>
              </div>
              <div className={styles.headerActions}>
                <button className={styles.closeBtn} onClick={handleClose}><X size={20} /></button>
              </div>
            </div>

            {/* Layout Split: Left Sidebar & Content */}
            <div className={styles.drawerBody}>
              <div className={styles.sidebarTabs}>
                {TABS.map(tab => (
                  <button 
                    key={tab.id} 
                    className={`${styles.sidebarTabBtn} ${activeTab === tab.id ? styles.sidebarTabActive : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>

              <div className={styles.contentArea}>
                {activeTab === 'info' && (
                  <fieldset disabled={isViewer} className="animate-fade" style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {(() => {
                      const linkedId = getLinkedDealId();
                      if (!linkedId || linkedId === activeDealId) return null;
                      return (
                        <div style={{
                          background: 'rgba(189, 29, 45, 0.06)',
                          border: '1px solid rgba(189, 29, 45, 0.2)',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          fontSize: '0.875rem'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#BD1D2D', fontWeight: 600 }}>
                            <Link2 size={16} />
                            <span>Giao dịch này liên quan đến một Deal đổi căn hộ</span>
                          </div>
                          <button 
                            type="button"
                            className="btn primary sm" 
                            style={{ padding: '6px 12px', fontSize: '0.75rem', whiteSpace: 'nowrap', background: '#BD1D2D', borderColor: '#BD1D2D' }}
                            onClick={() => handleSwitchToLinkedDeal(linkedId, `Đã chuyển sang Deal liên kết #${linkedId}`)}
                          >
                            Xem Deal #{linkedId}
                          </button>
                        </div>
                      );
                    })()}
                    <div className="card-panel" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                      <h4 className="panel-title">Cơ hội bán hàng</h4>
                      <div className="grid grid-2">
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label className="form-label">Tên Deal (Cơ hội)</label>
                          <input className="form-input" value={formData?.title || ''} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Vd: Cung cấp giải pháp phần mềm ABC..." />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Giá trị dự kiến (đ)</label>
                          <input 
                            className="form-input" 
                            type="text" 
                            value={formData?.value ? Number(formData.value).toLocaleString('en-US') : ''} 
                            onChange={e => {
                              const rawDigits = e.target.value.replace(/\D/g, '');
                              setFormData({ ...formData, value: rawDigits ? Number(rawDigits) : '' });
                            }} 
                          />
                          {Number(formData?.value || 0) > 0 && (
                            <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#BD1D2D', fontWeight: 600 }}>
                              {numberToText(formData.value)}
                            </div>
                          )}
                        </div>
                        <div className="form-group">
                          <label className="form-label">Xác suất thành công (%)</label>
                          <input
                            className="form-input"
                            type="number"
                            min={0}
                            max={100}
                            value={formData?.probability ?? formData?.prob ?? ''}
                            onChange={e => {
                              const raw = e.target.value;
                              const numVal = raw === '' ? '' : Math.max(0, Math.min(100, Number(raw)));
                              setFormData({ ...formData, probability: numVal, prob: numVal });
                            }}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Giai đoạn (Pipeline Stage)</label>
                          <div
                            onClickCapture={(e) => {
                              if (isReadOnly) {
                                e.stopPropagation();
                                const ownerName = formData?.owner_name || deal?.owner_name || deal?.consultant_name || 'chủ sở hữu';
                                addToast(`Chặn thao tác: Chỉ chủ sở hữu (Owner: ${ownerName}) mới có quyền chuyển đổi giai đoạn Deal`, 'error');
                              }
                            }}
                          >
                            <CustomSelect 
                              options={ensureArray(stages).map(s => ({ value: s.id, label: s.name }))}
                              value={formData?.stage_id}
                              onChange={val => {
                                const targetStageId = Number(val);
                                const fromStage = formData?.stage_id || deal?.stage_id || 0;
                                const stageList = ensureArray(stages);
                                const fromIdx = stageList.findIndex(s => Number(s.id) === Number(fromStage));
                                const toIdx = stageList.findIndex(s => Number(s.id) === Number(targetStageId));

                                const fromStageObj = stageList[fromIdx];
                                const toStageObj = stageList[toIdx];

                                const fromSlug = String(fromStageObj?.system_slug || '').toLowerCase();
                                const fromName = String(fromStageObj?.name || '').toLowerCase();
                                const toSlug = String(toStageObj?.system_slug || '').toLowerCase();
                                const toName = String(toStageObj?.name || '').toLowerCase();

                                const isFromDeposit = fromName.includes('cọc') || fromName.includes('deposit') || fromSlug.includes('deposit') || (Boolean(depositSlugConfigured) && fromSlug === depositSlugConfigured);
                                const isToSuccess = toName.includes('hợp đồng') || toName.includes('won') || toName.includes('thành công') || Boolean(toStageObj?.is_won) || wonSlugs.includes(toSlug);
                                const isCancellation = isFromDeposit && !isToSuccess;
                                const isBackward = fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx;
                                const isWonLocked = lockedAfterWonSlugs.includes(fromSlug) || Boolean(fromStageObj?.is_won);

                                if (isWonLocked && isBackward) {
                                  addToast('Không thể chuyển lùi giai đoạn khi giao dịch đã chốt / học viên chính thức.', 'error');
                                  return;
                                }

                                if (isBackward && !isCancellation && !effectiveAllowBackward) {
                                  addToast('Không thể di chuyển ngược giai đoạn trên Pipeline.', 'error');
                                  return;
                                }

                                const isForwardSkip = fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx + 1;
                                if (isForwardSkip && !effectiveAllowSkip) {
                                  addToast('Không được phép nhảy cóc giai đoạn. Tiến trình chuyển giai đoạn phải đi tuần tự từng bước.', 'error');
                                  return;
                                }

                                setFormData({ ...formData, stage_id: targetStageId });
                              }}
                              disabled={isViewer}
                            />
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Ngày dự kiến chốt</label>
                          <VietnameseDateInput
                            value={formData?.expected_close_date || ''}
                            onChange={val => setFormData({ ...formData, expected_close_date: val })}
                            disabled={isViewer}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Độ ưu tiên (Priority)</label>
                          <CustomSelect
                            options={[
                              { value: 'low', label: 'Thấp (Low)' },
                              { value: 'medium', label: 'Trung bình (Medium)' },
                              { value: 'high', label: 'Cao (High)' }
                            ]}
                            value={formData?.priority || 'medium'}
                            onChange={val => setFormData({ ...formData, priority: val as string })}
                            disabled={isViewer}
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="card-panel" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                      <h4 className="panel-title">Các trường tùy chỉnh (Custom Fields)</h4>
                      <div className="grid grid-2">
                        {Array.isArray(formData?.custom_fields) && formData.custom_fields.length > 0 ? (
                          formData.custom_fields.map((field: any, index: number) => (
                            <div className="form-group" key={field.id ?? index}>
                              <label className="form-label">{field.label} {field.is_required ? <span style={{ color: 'var(--color-danger)' }}>*</span> : ''}</label>
                              {field.field_type === 'text' && (
                                <input className="form-input" value={field.value || ''} onChange={e => updateCustomFieldAt(index, e.target.value)} />
                              )}
                              {field.field_type === 'number' && (
                                <input type="number" className="form-input" value={field.value || ''} onChange={e => updateCustomFieldAt(index, e.target.value)} />
                              )}
                              {field.field_type === 'date' && (
                                <VietnameseDateInput
                                  value={field.value || ''}
                                  onChange={val => updateCustomFieldAt(index, val)}
                                  disabled={isViewer}
                                />
                              )}
                              {field.field_type === 'dropdown' && (
                                <CustomSelect 
                                  options={ensureArray(field.options).map((o: any) => ({ value: o, label: o }))} 
                                  value={field.value || ''} 
                                  onChange={val => updateCustomFieldAt(index, val.toString())} 
                                  disabled={isViewer}
                                />
                              )}
                              {field.field_type === 'multiselect' && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.25rem' }}>
                                  {ensureArray(field.options).map((o: any) => {
                                    const selected = safeParseJsonArray(field.value);
                                    const isChecked = selected.includes(o);
                                    return (
                                      <label key={o} style={{ display: 'flex', alignItems: 'center', cursor: isViewer ? 'not-allowed' : 'pointer', background: isChecked ? '#BD1D2D' : 'var(--color-bg)', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${isChecked ? '#BD1D2D' : '#E2E8F0'}`, transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease', opacity: isViewer ? 0.6 : 1 }}>
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          disabled={isViewer}
                                          onChange={e => {
                                            const newSelected = e.target.checked ? [...selected, o] : selected.filter((s: string) => s !== o);
                                            updateCustomFieldAt(index, newSelected);
                                          }}
                                          style={{ display: 'none' }}
                                        />
                                        <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: isChecked ? 'white' : 'var(--color-text)' }}>{o}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                              {field.field_type === 'checkbox' && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isViewer ? 'not-allowed' : 'pointer', height: '40px' }}>
                                  <CustomCheckbox 
                                    checked={field.value === 'true' || field.value === true || field.value === 1 || field.value === '1'} 
                                    onChange={e => updateCustomFieldAt(index, Boolean(e?.target?.checked) ? 'true' : 'false')} 
                                    disabled={isViewer}
                                  />
                                  <span style={{ fontSize: '0.875rem' }}>Có</span>
                                </label>
                              )}
                            </div>
                          ))
                        ) : (
                          <div style={{ gridColumn: 'span 2', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Chưa có trường tùy chỉnh nào được cấu hình cho Cơ hội bán hàng.</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="card-panel" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                      <h4 className="panel-title">Khách hàng / Công ty</h4>
                      <div className="grid grid-2">
                        <div className="form-group">
                          <label className="form-label">Công ty</label>
                          <CustomSelect 
                            options={companyOptions}
                            value={formData?.company_id}
                            onChange={val => {
                              const co = ensureArray(companies).find(x => x.id === Number(val));
                              setFormData({ ...formData, company_id: val ? Number(val) : null, company_name: co?.name || '', company: co?.name || '' });
                            }}
                            placeholder="Chọn công ty..."
                            searchable
                            disabled={isViewer}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Liên hệ chính</label>
                          <CustomSelect 
                            options={contactOptions}
                            value={formData?.contact_id}
                            onChange={val => {
                              const co = ensureArray(contacts).find(x => x.id === Number(val));
                              setFormData({ ...formData, contact_id: val ? Number(val) : null, contact_name: co?.full_name || '', contact: co?.full_name || '' });
                            }}
                            placeholder="Chọn liên hệ..."
                            searchable
                            showAvatars
                            disabled={isViewer}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="card-panel" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                      <h4 className="panel-title">Phân loại & Tags</h4>
                      <div className="form-group">
                        <label className="form-label">Gắn Tags</label>
                        <div style={{ padding: '0.5rem 0' }}>
                          <TagInput 
                            tags={ensureArray(formData?.tags)} 
                            onChange={newTags => setFormData({ ...formData, tags: newTags })}
                            suggestions={ensureArray(allTags).map(t => t.name)}
                            placeholder="Thêm tag cho deal này..."
                            readOnly={isViewer}
                          />
                        </div>
                        <p className="text-xs text-muted" style={{ marginTop: '0.5rem' }}>
                          Tags giúp lọc và báo cáo hiệu quả chiến dịch bán hàng.
                        </p>
                      </div>
                    </div>
                  </fieldset>
                )}

                {activeTab === 'activities' && (
                  <div className="animate-fade">
                    {!isViewer ? (
                      <div className="card-panel" style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '8px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                        <div style={{ position: 'relative' }}>
                          <MentionInput 
                            className="form-textarea" 
                            rows={3} 
                            placeholder="Viết ghi chú, cập nhật tiến độ deal (Dán ảnh trực tiếp Ctrl+V)..."
                            value={newNote}
                            onChange={e => setNewNote(e.target.value)}
                            onImagePaste={handleNoteImagePaste}
                            onFilePaste={handleNoteImagePaste}
                            style={{ minHeight: '65px', paddingRight: '40px' }}
                            disabled={isSavingNote || isViewer}
                          />
                          <label style={{ position: 'absolute', right: '10px', bottom: '10px', cursor: (isSavingNote || isViewer) ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Đính kèm file">
                            <input type="file" onChange={handleNoteFileUpload} style={{ display: 'none' }} disabled={isSavingNote || isViewer} />
                            {isSavingNote ? <RefreshCw className="spin" size={18} /> : <Paperclip size={18} />}
                          </label>
                        </div>

                        {noteAttachmentFile && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-surface)', border: '1px solid #E2E8F0', padding: '4px 8px', borderRadius: '8px', fontSize: '0.75rem', width: 'fit-content' }}>
                            {noteAttachmentPreview ? (
                              <img src={noteAttachmentPreview} alt="preview" style={{ width: '22px', height: '22px', borderRadius: '4px', objectFit: 'cover' }} />
                            ) : (
                              <Paperclip size={12} color="#BD1D2D" />
                            )}
                            <span style={{ fontWeight: 600 }}>{noteAttachmentFile.name}</span>
                            <button type="button" onClick={removeNoteAttachment} style={{ border: 'none', background: 'transparent', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '0.85rem' }}>×</button>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '0.25rem' }}>
                          <button
                            type="button"
                            className="btn primary sm"
                            onClick={handleAddNote}
                            disabled={isViewer || isSavingNote || (!newNote.trim() && !noteAttachmentFile)}
                            style={{ padding: '6px 18px', fontSize: '0.78rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '5px', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#fff' }}
                          >
                            {isSavingNote ? <RefreshCw className="spin" size={13} /> : null}
                            <span>Lưu ghi chú</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginBottom: '1.25rem', padding: '10px 14px', borderRadius: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.8rem', fontWeight: 500 }}>
                        Chế độ chỉ xem: bạn không thể thêm ghi chú hoặc đính kèm tệp trên cơ hội này.
                      </div>
                    )}
                    
                    <div className="timeline" style={{ position: 'relative', paddingLeft: '2rem' }}>
                      {loadingNotes ? (
                        <div className="p-4 text-center text-muted">Đang tải...</div>
                      ) : (
                        <>
                          {ensureArray(dealTasks).map(act => {
                            let displayBody = act.body || '';
                            if (typeof act.body === 'string' && act.body.startsWith('{"erp_task":')) {
                              try {
                                const parsed = JSON.parse(act.body);
                                displayBody = parsed?.erp_task?.description || '';
                              } catch {}
                            }
                            return (
                              <div
                                key={`task-${act.id}`}
                                className="timeline-item"
                                onClick={() => useUIStore.getState().openTaskDrawer(act)}
                                style={{ marginBottom: '1.5rem', position: 'relative', cursor: 'pointer' }}
                              >
                                <div className="timeline-icon bg-primary" style={{ position: 'absolute', left: '-2rem', top: '0', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D' }}>
                                  <CheckCircle2 size={14} />
                                </div>
                                <div className="timeline-content" style={{ padding: '0.75rem 1rem', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'left' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <strong style={{ fontSize: '0.875rem', color: '#0F172A' }}>{act.subject}</strong>
                                    <span className="text-xs text-muted">{formatServerDateTime(act.created_at)}</span>
                                  </div>
                                  {displayBody && (
                                    <div style={{ fontSize: '0.825rem', color: '#475569', marginBottom: '6px', whiteSpace: 'pre-wrap' }}>
                                      {displayBody}
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <span className="badge info sm">{act.type || 'task'}</span>
                                    <span className={`badge sm ${act.status === 'done' ? 'success' : act.status === 'cancelled' ? 'danger' : 'warning'}`}>
                                      {act.status === 'done' ? 'Đã xong' : act.status === 'cancelled' ? 'Đã hủy' : 'Chưa xong'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {ensureArray(notes).map(n => (
                            <div key={n.id} className="timeline-item" style={{ marginBottom: '1.5rem', position: 'relative' }}>
                              <div className="timeline-icon bg-primary" style={{ position: 'absolute', left: '-2rem', top: '0', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, background: '#F1F5F9', color: '#334155' }}>
                                <History size={14} />
                              </div>
                              <div className="timeline-content" style={{ padding: '0.75rem 1rem', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'left' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                  <strong style={{ fontSize: '0.875rem', color: '#0F172A' }}>{n.author_name || n.user_name || 'Hệ thống'}</strong>
                                  <span className="text-xs text-muted">{formatServerDateTime(n.created_at)}</span>
                                </div>
                                {n.body && /<[a-z][\s\S]*>/i.test(n.body) ? (
                                  <div 
                                    className="rich-text-editor-content"
                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.body) }}
                                    style={{ fontSize: '0.875rem', margin: 0 }}
                                  />
                                ) : (
                                  <div style={{ fontSize: '0.875rem', margin: 0, whiteSpace: 'pre-wrap' }}>
                                    {renderFormattedText(n.body)}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          
                          <div className="timeline-item" style={{ marginBottom: '1.5rem', position: 'relative' }}>
                            <div className="timeline-icon" style={{ position: 'absolute', left: '-2rem', top: '0', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D' }}>
                              <CheckCircle2 size={14} />
                            </div>
                            <div className="timeline-content" style={{ padding: '0.75rem 1rem', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'left' }}>
                              <p style={{ fontSize: '0.875rem', margin: 0 }}><strong>System</strong> chuyển sang trạng thái "{ensureArray(stages).find(s => Number(s.id) === Number(formData?.stage_id))?.name || 'Lead mới'}".</p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'products' && (
                  <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {loadingQuotesProducts ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {[1, 2, 3].map(idx => (
                          <div key={idx} className="animate-pulse" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '1rem' }}>
                            <div style={{ height: '14px', width: '45%', background: '#E2E8F0', borderRadius: '6px', marginBottom: '8px' }} />
                            <div style={{ height: '12px', width: '70%', background: '#F1F5F9', borderRadius: '6px' }} />
                          </div>
                        ))}
                      </div>
                    ) : dealQuoteItems.length > 0 ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                              Sản phẩm đã báo giá ({dealQuoteItems.length})
                            </h4>
                            <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                              Tổng hợp trực tiếp từ các báo giá gắn với cơ hội #{activeDealId}
                            </p>
                          </div>
                          {!isViewer && (
                            <button
                              type="button"
                              className="btn primary sm"
                              style={{ background: '#BD1D2D', borderColor: '#BD1D2D' }}
                              onClick={() => setShowPOS(formData?.contact_id ? { id: Number(formData.contact_id), full_name: formData?.contact_name || formData?.contact || '' } : true)}
                            >
                              Mở Quầy Báo Giá (POS)
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {dealQuoteItems.map((item: any, idx: number) => (
                            <div
                              key={item.id ?? `${item.quote_id}-${idx}`}
                              style={{
                                background: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                borderRadius: '16px',
                                padding: '0.95rem 1.1rem',
                                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '1rem',
                                flexWrap: 'wrap'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Package size={16} />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.name || item.product_name || 'Sản phẩm / Dịch vụ'}
                                  </div>
                                  <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                                    Báo giá: <strong style={{ color: '#334155' }}>{item.quote_number}</strong> • SL: <strong style={{ color: '#0F172A' }}>{Number(item.quantity || 1)}</strong> × {Number(item.unit_price || 0).toLocaleString('vi-VN')} đ
                                    {Number(item.discount || 0) > 0 ? ` • Giảm: ${Number(item.discount).toLocaleString('vi-VN')} đ` : ''}
                                  </div>
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#BD1D2D' }}>
                                  {Number(item.subtotal || 0).toLocaleString('vi-VN')} đ
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <EmptyCard 
                        icon={<Box size={48} />}
                        title="Chưa có sản phẩm nào trong báo giá của Deal"
                        description={
                          catalogProducts.length > 0
                            ? `Hệ thống hiện có ${catalogProducts.length} sản phẩm/dịch vụ trong danh mục. Chọn sản phẩm qua Quầy Báo Giá (POS) để gắn vào cơ hội này.`
                            : 'Thêm các sản phẩm, phần mềm hoặc dịch vụ vào cơ hội bán hàng này để tính toán giá trị chính xác.'
                        }
                        action={!isViewer ? (
                          <button
                            type="button"
                            className="btn primary"
                            style={{ background: '#BD1D2D', borderColor: '#BD1D2D' }}
                            onClick={() => setShowPOS(formData?.contact_id ? { id: Number(formData.contact_id), full_name: formData?.contact_name || formData?.contact || '' } : true)}
                          >
                            Mở Quầy Báo Giá (POS)
                          </button>
                        ) : undefined}
                      />
                    )}
                  </div>
                )}

                {activeTab === 'quotes' && (
                  <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {loadingQuotesProducts ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {[1, 2].map(idx => (
                          <div key={idx} className="animate-pulse" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '1rem' }}>
                            <div style={{ height: '14px', width: '40%', background: '#E2E8F0', borderRadius: '6px', marginBottom: '8px' }} />
                            <div style={{ height: '12px', width: '65%', background: '#F1F5F9', borderRadius: '6px' }} />
                          </div>
                        ))}
                      </div>
                    ) : dealQuotes.length > 0 ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                              Báo giá liên kết ({dealQuotes.length})
                            </h4>
                            <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                              Danh sách báo giá chính thức đã phát hành cho cơ hội #{activeDealId}
                            </p>
                          </div>
                          {!isViewer && (
                            <button
                              type="button"
                              className="btn primary sm"
                              style={{ background: '#BD1D2D', borderColor: '#BD1D2D' }}
                              onClick={() => setShowPOS(formData?.contact_id ? { id: Number(formData.contact_id), full_name: formData?.contact_name || formData?.contact || '' } : true)}
                            >
                              Tạo báo giá qua POS
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {dealQuotes.map((q: any) => {
                            const statusLabelMap: Record<string, string> = {
                              draft: 'Nháp',
                              sent: 'Đã gửi',
                              accepted: 'Đã chấp nhận',
                              rejected: 'Từ chối',
                              expired: 'Hết hạn',
                              invoiced: 'Đã xuất hóa đơn',
                            };
                            const stKey = String(q.status || 'draft').toLowerCase();
                            const isAccepted = stKey === 'accepted' || stKey === 'invoiced';
                            return (
                              <div
                                key={q.id}
                                style={{
                                  background: '#FFFFFF',
                                  border: '1px solid #E2E8F0',
                                  borderRadius: '16px',
                                  padding: '1rem 1.15rem',
                                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.5rem'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: isAccepted ? 'rgba(189, 29, 45, 0.08)' : 'rgba(15, 23, 42, 0.06)', color: isAccepted ? '#BD1D2D' : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <FileText size={15} />
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                                        {q.quote_number || `QT-${q.id}`} — {q.title || 'Báo giá'}
                                      </div>
                                      <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                        {q.items_count ?? 0} hạng mục • Tạo bởi: {q.created_by_name || 'Hệ thống'}
                                        {q.valid_until ? ` • Hiệu lực: ${formatDateVN(q.valid_until)}` : ''}
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: isAccepted ? 'rgba(189, 29, 45, 0.08)' : '#F1F5F9', color: isAccepted ? '#BD1D2D' : '#334155' }}>
                                      {statusLabelMap[stKey] || q.status}
                                    </span>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                      {Number(q.total || 0).toLocaleString('vi-VN')} đ
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <EmptyCard 
                        icon={<FileText size={48} />}
                        title="Chưa có báo giá / hợp đồng"
                        description="Sau khi chốt xong sản phẩm, bạn có thể tạo báo giá PDF chuyên nghiệp và gửi thẳng cho khách hàng."
                        action={!isViewer ? (
                          <button
                            type="button"
                            className="btn primary"
                            style={{ background: '#BD1D2D', borderColor: '#BD1D2D' }}
                            onClick={() => setShowPOS(formData?.contact_id ? { id: Number(formData.contact_id), full_name: formData?.contact_name || formData?.contact || '' } : true)}
                          >
                            Tạo báo giá qua POS
                          </button>
                        ) : undefined}
                      />
                    )}
                  </div>
                )}

                {activeTab === 'audit' && (
                  <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.5rem' }}>
                    {/* Header summary of audit trail */}
                    <div style={{ display: 'flex', gap: '1rem', background: '#FFFFFF', padding: '1rem', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(189, 29, 45, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#BD1D2D' }}>
                        <Link2 size={20} />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontWeight: 800, fontSize: '0.95rem', color: '#0F172A' }}>Sơ đồ vết kiểm toán</h4>
                        <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                          Lịch sử dịch chuyển trạng thái, thay đổi căn hộ hoặc hoàn/bể cọc được đồng bộ thời gian thực.
                        </p>
                      </div>
                    </div>

                    {/* Horizontal Graphic for Unit Switching (if any parent or child exists) */}
                    {(() => {
                      const linkedId = getLinkedDealId();
                      if (!linkedId || linkedId === activeDealId) return null;
                      
                      // Check if current deal description contains "Đổi từ căn cũ"
                      const desc = formData?.description || '';
                      const isChild = desc.toLowerCase().includes('đổi từ căn cũ') || desc.toLowerCase().includes('đổi căn');
                      
                      return (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          padding: '1.25rem',
                          borderRadius: '16px',
                          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                        }}>
                          <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Luồng dịch chuyển giao dịch (Unit Switching Flow)
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '8px' }}>
                            {isChild ? (
                              <>
                                <div 
                                  style={{ border: '1px dashed #CBD5E1', borderRadius: '10px', padding: '8px 12px', textAlign: 'center', opacity: 0.85, cursor: 'pointer', background: '#F8FAFC' }}
                                  onClick={() => handleSwitchToLinkedDeal(linkedId, `Đã chuyển sang Deal cũ #${linkedId}`)}
                                >
                                  <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Deal cũ (Đã đóng)</div>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>ID: #{linkedId}</div>
                                </div>
                                <div style={{ color: '#BD1D2D', display: 'flex', alignItems: 'center' }}><ArrowRight size={18} /></div>
                                <div style={{ border: '1.5px solid #BD1D2D', borderRadius: '10px', padding: '8px 12px', textAlign: 'center', background: 'rgba(189, 29, 45, 0.06)' }}>
                                  <div style={{ fontSize: '0.7rem', color: '#BD1D2D', fontWeight: 700 }}>Deal hiện tại</div>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>ID: #{formData.id} ({formData.title})</div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={{ border: '1.5px solid #BD1D2D', borderRadius: '10px', padding: '8px 12px', textAlign: 'center', background: 'rgba(189, 29, 45, 0.06)' }}>
                                  <div style={{ fontSize: '0.7rem', color: '#BD1D2D', fontWeight: 700 }}>Deal cũ (Đã đóng)</div>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>ID: #{formData.id} ({formData.title})</div>
                                </div>
                                <div style={{ color: '#BD1D2D', display: 'flex', alignItems: 'center' }}><ArrowRight size={18} /></div>
                                <div 
                                  style={{ border: '1px dashed #CBD5E1', borderRadius: '10px', padding: '8px 12px', textAlign: 'center', opacity: 0.85, cursor: 'pointer', background: '#F8FAFC' }}
                                  onClick={() => handleSwitchToLinkedDeal(linkedId, `Đã chuyển sang Deal mới #${linkedId}`)}
                                >
                                  <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Deal mới (Đang chạy)</div>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>ID: #{linkedId}</div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Timeline representation of audit trails */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Vết kiểm toán chi tiết (Audit Timeline)
                      </div>

                      {(() => {
                        // Merge stage history and internal notes
                        const combinedEvents: any[] = [];
                        
                        // Add stage history
                        ensureArray(formData?.stage_history).forEach((h: any) => {
                          combinedEvents.push({
                            type: 'stage',
                            date: h.moved_at,
                            title: 'Dịch chuyển cột trạng thái',
                            body: `Chuyển từ "${h.from_stage_name || 'Bắt đầu'}" sang "${h.to_stage_name}"`,
                            user: h.moved_by_name || 'Hệ thống'
                          });
                        });

                        // Add internal notes (audit trails)
                        ensureArray(formData?.internal_notes).forEach((n: any) => {
                          combinedEvents.push({
                            type: 'audit_note',
                            date: n.created_at,
                            title: 'Ghi chú nghiệp vụ hệ thống',
                            body: n.body,
                            user: n.user_name || 'Hệ thống'
                          });
                        });

                        if (combinedEvents.length === 0) {
                          return (
                            <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', fontSize: '0.8rem' }}>
                              Chưa ghi nhận vết kiểm toán nào cho giao dịch này.
                            </div>
                          );
                        }

                        // Sort chronologically using Safari-safe date parser
                        combinedEvents.sort((a, b) => {
                          const ta = parseServerDate(a.date).getTime();
                          const tb = parseServerDate(b.date).getTime();
                          return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
                        });

                        return (
                          <div style={{ position: 'relative', borderLeft: '2px solid #E2E8F0', paddingLeft: '1rem', marginLeft: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {combinedEvents.map((ev, idx) => (
                              <div key={idx} style={{ position: 'relative' }}>
                                {/* Timeline dot */}
                                <div style={{
                                  position: 'absolute',
                                  left: 'calc(-1rem - 7px)',
                                  top: '4px',
                                  width: '12px',
                                  height: '12px',
                                  borderRadius: '50%',
                                  background: ev.type === 'stage' ? '#BD1D2D' : '#334155',
                                  border: '2px solid #FFFFFF',
                                  boxShadow: '0 0 0 2px rgba(15, 23, 42, 0.08)'
                                }} />
                                
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '2px' }}>
                                  {formatServerDateTime(ev.date)} {ev.user ? `• ${ev.user}` : ''}
                                </div>
                                <div style={{ fontWeight: 700, fontSize: '0.825rem', color: '#0F172A' }}>
                                  {ev.title}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px', background: '#F8FAFC', padding: '6px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                  {ev.body}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className={styles.footer}>
              {canShowSwitchUnit && (
                <button 
                  type="button"
                  className="btn outline"
                  style={{ marginRight: 'auto', color: '#BD1D2D', borderColor: '#BD1D2D', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => {
                    setSwitchUnitCode('');
                    setSwitchPrice(formData.value ? String(formData.value) : '');
                    setSwitchProjectId(formData.project_id ? String(formData.project_id) : '');
                    setSwitchReason('');
                    setIsSwitchModalOpen(true);
                  }}
                >
                  <RefreshCw size={14} />
                  <span>Đổi Căn</span>
                </button>
              )}
              <button type="button" className="btn ghost" onClick={handleClose} disabled={isSavingDeal}>{isViewer ? 'Đóng' : 'Hủy bỏ'}</button>
              {!isViewer && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={isSavingDeal}
                  style={{ background: '#BD1D2D', borderColor: '#BD1D2D', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={async () => {
                    if (saveDealInFlightRef.current || isSavingDeal) return;
                    if (!String(formData?.title || '').trim()) {
                      addToast('Vui lòng nhập tên Deal (Cơ hội).', 'error');
                      return;
                    }
                    const payload: any = { ...formData };
                    if (activeDealId) {
                      payload.id = activeDealId;
                    }
                    const rawProb = formData?.probability ?? formData?.prob;
                    if (rawProb !== undefined && rawProb !== null && rawProb !== '') {
                      payload.probability = Math.max(0, Math.min(100, Number(rawProb) || 0));
                    }
                    delete payload.prob;

                    if (Array.isArray(formData?.custom_fields)) {
                      for (const f of formData.custom_fields) {
                        const isEmpty = f.value === undefined || f.value === null || f.value === '' || (Array.isArray(f.value) && f.value.length === 0);
                        if (f.is_required && isEmpty) {
                          addToast(`Trường "${f.label}" là bắt buộc.`, 'error');
                          return;
                        }
                      }
                      payload.custom_fields = formData.custom_fields.map((f: any) => ({ field_id: f.id, value: f.value }));
                    }
                    saveDealInFlightRef.current = true;
                    setIsSavingDeal(true);
                    try {
                      await onSave(payload);
                    } finally {
                      saveDealInFlightRef.current = false;
                      setIsSavingDeal(false);
                    }
                  }}
                >
                  {isSavingDeal && <Loader2 size={14} className="spin" />}
                  <span>{isSavingDeal ? 'Đang lưu...' : 'Lưu Cơ Hội'}</span>
                </button>
              )}
            </div>
            {/* Unit Switching Modal */}
            {isSwitchModalOpen && (
              <CustomModal
                isOpen={isSwitchModalOpen}
                onClose={() => { if (!submittingSwitch) setIsSwitchModalOpen(false); }}
                title="Đổi căn hộ giao dịch (Unit Switch)"
                width="500px"
                zIndex={2147483646}
                disableClose={submittingSwitch}
                preventCloseOnBackdrop={submittingSwitch}
              >
                <div style={{ padding: '0.5rem 0', color: 'var(--color-text)' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                    <strong>Quy tắc đổi căn:</strong> Hệ thống sẽ tự động đóng deal cũ này (đánh dấu thất bại), tạo một deal mới hoàn toàn cho căn hộ mới, chuyển lịch thanh toán cọc, và tự động ghi chú lưu vết kiểm toán (audit trail).
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Mã căn hộ mới <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <input
                        type="text"
                        required
                        placeholder="VD: B-205"
                        value={switchUnitCode}
                        onChange={e => setSwitchUnitCode(e.target.value.toUpperCase())}
                        className="form-input"
                        style={{ height: '38px', padding: '8px 12px', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Giá bán mới (VND) <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                      <input
                        type="number"
                        min={1}
                        required
                        placeholder="Nhập giá bán mới..."
                        value={switchPrice}
                        onChange={e => setSwitchPrice(e.target.value)}
                        className="form-input"
                        style={{ height: '38px', padding: '8px 12px', fontSize: '0.85rem' }}
                      />
                      {parseFloat(switchPrice) > 0 && (
                        <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#BD1D2D', fontWeight: 600 }}>
                          {numberToText(parseFloat(switchPrice))}
                        </div>
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Chương trình mới (Nếu đổi chương trình)</label>
                      <CustomSelect
                        searchable
                        options={projectOptions}
                        value={switchProjectId}
                        onChange={val => setSwitchProjectId(val.toString())}
                        placeholder="-- Giữ nguyên chương trình cũ --"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Lý do đổi căn</label>
                      <textarea
                        placeholder="Nhập lý do đổi căn..."
                        value={switchReason}
                        onChange={e => setSwitchReason(e.target.value)}
                        className="form-input"
                        style={{ height: '80px', resize: 'none', padding: '8px 12px', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button type="button" className="btn ghost w-full" onClick={() => setIsSwitchModalOpen(false)} disabled={submittingSwitch}>Hủy bỏ</button>
                      <button type="button" className="btn primary w-full" style={{ backgroundColor: '#BD1D2D', borderColor: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={handleSwitchUnit} disabled={submittingSwitch}>
                        {submittingSwitch && <RefreshCw size={14} className="spin" />}
                        <span>{submittingSwitch ? 'Đang xử lý...' : 'Xác nhận Đổi Căn'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </CustomModal>
            )}
      </div>
    </>,
    document.body
  );
};

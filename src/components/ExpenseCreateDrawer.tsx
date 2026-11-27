import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Wallet,
  Upload,
  Loader2,
  Truck,
  Coffee,
  Home,
  Briefcase,
  CreditCard,
  Tag,
  CheckCircle2,
  Building2,
  ChevronDown,
  ChevronLeft,
  FileText,
  Plus,
  Search,
  Check,
  Users,
  User,
  Landmark,
  Zap,
  Bookmark,
  Receipt,
  Trash2,
  Copy,
  FileSignature
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';
import { useUIStore } from '../store/uiStore';
import { CustomSelect } from './ui/CustomSelect';
import { Avatar } from './ui/Avatar';
import { compressToWebP } from '../utils/imageCompress';
import { PasteDropzoneArea } from './ui/PasteDropzoneArea';
import { resolveTeamLeaderId } from '../utils/teamLeader';
import { DraftExitConfirmModal } from './ui/DraftExitConfirmModal';
import { BankSelect } from './ui/BankSelect';
import { getVietQrUrl, findBank, normalizeVietQrText } from '../utils/vietnamBanks';
import { getSystemTitle } from '../config/env';
import { VietnameseDateInput } from './ui/VietnameseDateInput';
import { pushOverlay } from '../utils/overlayStack';
import { useTypedSetting } from '../contexts/SettingsBootstrapContext';
import { isExcludedSystemEmail, useTenantConfig } from '../contexts/TenantConfigContext';
import { getLocalDateStr } from '../utils/dateUtils';
import { ensureArray } from '../utils/safeArray';
import { isExecutive, isManagement, isAccountant, isViewer as checkIsViewer } from '../utils/roleUtils';

const CATEGORIES = [
  { value: 'travel', label: 'Vận Chuyển', icon: Truck, color: '#334155' },
  { value: 'client_meeting', label: 'Ăn uống', icon: Coffee, color: '#475569' },
  { value: 'general', label: 'Vận hành', icon: Home, color: '#0F172A' },
  { value: 'marketing', label: 'Marketing', icon: Briefcase, color: '#BD1D2D' },
  { value: 'stationery', label: 'Văn phòng phẩm', icon: CreditCard, color: '#64748B' },
  { value: 'hr', label: 'Nhân sự', icon: Tag, color: '#334155' },
];

const EMPTY_FORM = {
  title: '',
  category: 'Vận hành',
  amount: '',
  currency: 'VND',
  vat_amount: '',
  date: '',
  due_date: '',
  notes: '',
  approver_id: null as number | null,
  approver_id_2: null as number | null,
  approver_id_3: null as number | null,
  related_user_ids: [] as number[],
  vendor_name: '',
  has_vat_invoice: true,
  is_vat_inclusive: true,
  entities: [] as any[],
  image_url: '',
  request_bank_transfer: true,
  bank_name: '',
  bank_account_number: '',
  bank_account_name: '',
  bank_branch: ''
};

const extractExpenseTitleSuffix = (rawTitle: string) => {
  if (!rawTitle) return '';
  const trimmed = rawTitle.trim();
  const prefixes = [
    'Đề nghị thanh toán',
    'Đề xuất thanh toán',
    'Thanh toán',
    'Đề nghị tạm ứng',
    'Tạm ứng'
  ];
  for (const p of prefixes) {
    const regex = new RegExp(`^${p}\\s*([—\\-–:]\\s*)?`, 'i');
    if (regex.test(trimmed)) {
      return trimmed.replace(regex, '').trim();
    }
  }
  return trimmed;
};

export interface ExpenseItemRow {
  id: number | string;
  content: string;
  quantity: number | string;
  price: number;
  vat: number;
}

export const parseMoneyVn = (raw: any): number => {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : Math.round(raw);
  const s = String(raw).trim();
  if (!s) return 0;

  // If both dot and comma exist: determine which is decimal
  if (s.includes('.') && s.includes(',')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      const intPart = s.split(',')[0].replace(/\D/g, '');
      return Number(intPart) || 0;
    } else {
      const intPart = s.split('.')[0].replace(/\D/g, '');
      return Number(intPart) || 0;
    }
  }

  // If only dot exists
  if (s.includes('.')) {
    const dotParts = s.split('.');
    if (dotParts.length > 2 || dotParts[dotParts.length - 1].length === 3) {
      return Number(s.replace(/\D/g, '')) || 0;
    }
    return Math.round(parseFloat(s) || 0);
  }

  // If only comma exists
  if (s.includes(',')) {
    const commaParts = s.split(',');
    if (commaParts.length > 2 || commaParts[commaParts.length - 1].length === 3) {
      return Number(s.replace(/\D/g, '')) || 0;
    }
    return Math.round(parseFloat(s.replace(',', '.')) || 0);
  }

  return Number(s.replace(/\D/g, '')) || 0;
};

const formatNumberWithDots = (val: string | number) => {
  if (val === undefined || val === null || val === '') return '';
  const num = parseMoneyVn(val);
  return new Intl.NumberFormat('vi-VN').format(num);
};

const normalizeFileUrl = (u: string) => {
  if (!u) return '';
  return u.replace(/^https?:\/\/[^\/]+/i, '')
          .replace(/^\/?backend\/?/i, '')
          .replace(/^\/+/, '')
          .split('?')[0];
};

const getFileNameFromUrl = (u: string) => {
  return normalizeFileUrl(u).split('/').pop() || '';
};

const formatApprovalCurrency = (amount: number | string, currency: string = 'VND') => {
  const num = Number(amount);
  const safeNum = Number.isFinite(num) ? num : 0;
  const rawCurr = (currency || 'VND').toUpperCase().trim();
  const norm = rawCurr === 'EURO' ? 'EUR' : rawCurr;
  if (norm === 'VND') return `${safeNum.toLocaleString('vi-VN')} ₫`;
  if (norm === 'USD') return `$${safeNum.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  if (norm === 'EUR') return `€${safeNum.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: norm, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(safeNum);
  } catch {
    return `${safeNum.toLocaleString('en-US')} ${norm}`;
  }
};

function docSoTiengViet(num: number): string {
  if (num === 0) return 'Không đồng';
  if (num < 0) return 'Âm ' + docSoTiengViet(Math.abs(num)).toLowerCase();

  const units = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ'];
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

  const readThreeDigits = (n: number, isFirst: boolean): string => {
    let hundred = Math.floor(n / 100);
    let ten = Math.floor((n % 100) / 10);
    let single = n % 10;
    let res = '';

    if (hundred > 0 || !isFirst) {
      res += digits[hundred] + ' trăm ';
    }

    if (ten > 0) {
      if (ten === 1) {
        res += 'mười ';
      } else {
        res += digits[ten] + ' mươi ';
      }
    } else if (hundred > 0 && single > 0) {
      res += 'lẻ ';
    }

    if (single > 0) {
      if (single === 1 && ten > 1) {
        res += 'mốt';
      } else if (single === 5 && ten > 0) {
        res += 'lăm';
      } else if (single === 4 && ten > 1) {
        res += 'tư';
      } else {
        res += digits[single];
      }
    }

    return res.trim();
  };

  let cleanNum = Math.floor(num);
  let groups = [];
  while (cleanNum > 0) {
    groups.push(cleanNum % 1000);
    cleanNum = Math.floor(cleanNum / 1000);
  }

  let result = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    let groupVal = groups[i];
    if (groupVal === 0) {
      continue;
    }
    
    let isFirst = (i === groups.length - 1);
    let groupStr = readThreeDigits(groupVal, isFirst);
    result += groupStr + units[i] + ' ';
  }

  result = result.trim();
  if (!result) return 'Không đồng';
  return result.charAt(0).toUpperCase() + result.slice(1) + ' đồng';
}

interface ExpenseCreateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  editItem?: any;
  initialDate?: string; // YYYY-MM-DD
  onSaveSuccess: () => void;
  user: any;
  users?: any[];
  zIndex?: number;
}

export const ExpenseCreateDrawer: React.FC<ExpenseCreateDrawerProps> = ({
  isOpen,
  onClose,
  editItem,
  initialDate,
  onSaveSuccess,
  user,
  users: propUsers,
  zIndex
}) => {
  const { hasPermission } = useTenantConfig();
  const overlayUi = useTypedSetting<{ z_backdrop?: number; z_drawer?: number; z_modal_nested?: number; motion_ms?: number }>('ui.overlay_zindex_and_motion_ms', {
    z_backdrop: 2147483620,
    z_drawer: 2147483625,
    z_modal_nested: 2147483646,
    motion_ms: 220,
  });
  const approvalPolicy = useTypedSetting<{ po_three_level_vnd?: number }>('finance.approval_policy', { po_three_level_vnd: 5000000 });
  const fxConfig = useTypedSetting<{ supported?: string[]; rates_to_vnd?: Record<string, number> }>('finance.currency_and_fx_rates', {
    supported: ['VND', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'AUD', 'CAD', 'CHF'],
    rates_to_vnd: { VND: 1, USD: 25400, EUR: 27500, GBP: 32000, JPY: 170, SGD: 18900, AUD: 16500, CAD: 18500, CHF: 28500 },
  });
  const vatPolicy = useTypedSetting<{ vat_rates?: number[] }>('finance.vat_and_cit_policy', { vat_rates: [0, 5, 8, 10] });
  const vietQrConfig = useTypedSetting<{ template?: string; memo_prefix?: string }>('finance.vietqr_config', {
    template: 'compact2',
    memo_prefix: 'Thanh toan PO',
  });
  const uploadPolicy = useTypedSetting<{ max_mb?: number; forbidden_exts?: string[] }>('core.upload_security_policy', {
    max_mb: 50,
    forbidden_exts: ['php', 'phtml', 'php3', 'php4', 'php5', 'phar', 'exe', 'bat', 'cmd', 'sh', 'js', 'mjs', 'cjs', 'html', 'htm', 'svg', 'asp', 'aspx', 'jsp', 'py', 'rb', 'pl', 'cgi', 'htaccess'],
  });

  const maxUploadMb = Math.max(1, Number(uploadPolicy.max_mb || 50));
  const forbiddenUploadExts = useMemo(
    () => ensureArray<string>(uploadPolicy.forbidden_exts).map(x => String(x).toLowerCase()),
    [uploadPolicy.forbidden_exts]
  );
  const vatRates = useMemo(() => {
    const rates = ensureArray<number>(vatPolicy?.vat_rates).map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 100);
    return rates.length > 0 ? rates : [0, 5, 8, 10];
  }, [vatPolicy]);

  const defaultPanelZ = Number(overlayUi.z_drawer || 2147483625);
  const panelZIndex = Math.min(Math.max(zIndex ?? defaultPanelZ, defaultPanelZ), 2147483644);
  const baseZIndex = zIndex ? Math.max(panelZIndex - 2, 2147483620) : Number(overlayUi.z_backdrop || 2147483620);
  const modalNestedZ = Math.min(Math.max(panelZIndex + 2, Number(overlayUi.z_modal_nested || 2147483646)), 2147483647);
  const motionSec = Math.max(0.15, Math.min(0.4, Number(overlayUi.motion_ms || 220) / 1000));
  const threshold = Math.max(0, Number(approvalPolicy.po_three_level_vnd || 5000000));

  const addToast = useUIStore((s) => s.addToast);
  const saveInFlightRef = useRef(false);
  const saveAbortRef = useRef<AbortController | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const justHydratedRef = useRef(false);
  const isEditMode = Boolean(editItem?.id && !editItem?.isClone);
  const isCloneMode = Boolean(editItem?.isClone);
  const isRealEditOrClone = Boolean(isEditMode || isCloneMode || (editItem && (editItem.amount !== undefined || editItem.title !== undefined)));
  const [form, setForm] = useState<any>({ ...EMPTY_FORM });
  const [titlePrefix, setTitlePrefix] = useState<string>('Đề nghị thanh toán');
  const [titleSuffix, setTitleSuffix] = useState<string>('');

  // Multi-line payment breakdown table
  const [expenseItems, setExpenseItems] = useState<ExpenseItemRow[]>([
    { id: Date.now(), content: '', quantity: 1, price: 0, vat: 10 }
  ]);

  // Classification & Payment Targets
  const [expenseCategory, setExpenseCategory] = useState<string>('general');
  const [invoiceType, setInvoiceType] = useState<string>('vat_10');
  const [paymentTarget, setPaymentTarget] = useState<string>('Nội bộ');
  const [paymentMethod, setPaymentMethod] = useState<string>('Chuyển khoản');
  const [currencyType, setCurrencyType] = useState<string>('VND');

  // Dynamic Beneficiary States
  const [paymentEmployeeId, setPaymentEmployeeId] = useState<string>('');
  const [paymentSupplierId, setPaymentSupplierId] = useState<string>('');
  const [paymentLecturerId, setPaymentLecturerId] = useState<string>('');
  const [paymentContactId, setPaymentContactId] = useState<string>('');
  const [paymentBeneficiaryName, setPaymentBeneficiaryName] = useState<string>('');
  const [paymentBankName, setPaymentBankName] = useState<string>('');
  const [paymentBankAccount, setPaymentBankAccount] = useState<string>('');
  const [paymentAccountName, setPaymentAccountName] = useState<string>('');
  const [paymentBankBranch, setPaymentBankBranch] = useState<string>('');
  const [paymentPhone, setPaymentPhone] = useState<string>('');
  const [paymentTaxCode, setPaymentTaxCode] = useState<string>('');

  // Cash / Wallet / Credit card / Gov Agency states
  const [paymentDestination, setPaymentDestination] = useState<string>('');
  const [paymentWalletType, setPaymentWalletType] = useState<'momo' | 'zalopay' | 'viettel_money'>('momo');
  const [paymentWalletPhone, setPaymentWalletPhone] = useState<string>('');
  const [paymentCorporateCard, setPaymentCorporateCard] = useState<string>('');
  const [paymentGovAgencyType, setPaymentGovAgencyType] = useState<'tax' | 'social_insurance' | 'treasury' | 'other'>('tax');
  const [paymentGovDecisionNumber, setPaymentGovDecisionNumber] = useState<string>('');

  // QR Modal preview
  const [previewQrModalUrl, setPreviewQrModalUrl] = useState<string | null>(null);

  // Totals calculations
  const itemsTotalBeforeTax = useMemo(() => {
    return ensureArray<ExpenseItemRow>(expenseItems).reduce((acc, it) => {
      const q = Number(it.quantity);
      const safeQty = Number.isFinite(q) && q >= 0 ? q : 0;
      const p = Number(it.price) || 0;
      return acc + safeQty * p;
    }, 0);
  }, [expenseItems]);

  const itemsTotalVat = useMemo(() => {
    return ensureArray<ExpenseItemRow>(expenseItems).reduce((acc, it) => {
      const q = Number(it.quantity);
      const safeQty = Number.isFinite(q) && q >= 0 ? q : 0;
      const lineBase = safeQty * (Number(it.price) || 0);
      const lineVat = currencyType === 'VND'
        ? Math.round(lineBase * (Number(it.vat) || 0) / 100)
        : (lineBase * (Number(it.vat) || 0) / 100);
      return acc + lineVat;
    }, 0);
  }, [expenseItems, currencyType]);

  const itemsGrandTotal = useMemo(() => {
    return itemsTotalBeforeTax + itemsTotalVat;
  }, [itemsTotalBeforeTax, itemsTotalVat]);

  const itemsGrandTotalVnd = useMemo(() => {
    const rawCurr = (currencyType || 'VND').toUpperCase().trim();
    const norm = rawCurr === 'EURO' ? 'EUR' : rawCurr;
    if (norm === 'VND') return itemsGrandTotal;
    const rate = Number(fxConfig?.rates_to_vnd?.[norm] || fxConfig?.rates_to_vnd?.[rawCurr] || 25400);
    return Math.round(itemsGrandTotal * (Number.isFinite(rate) && rate > 0 ? rate : 25400));
  }, [itemsGrandTotal, currencyType, fxConfig]);

  useEffect(() => {
    if (!isInitializedRef.current) return;
    const nextAmt = String(itemsGrandTotal);
    const nextVat = itemsTotalVat > 0 ? String(itemsTotalVat) : '0';
    const nextHasVat = itemsTotalVat > 0;
    setForm((prev: any) => {
      if (prev.amount === nextAmt && prev.vat_amount === nextVat && prev.has_vat_invoice === nextHasVat) {
        return prev;
      }
      return {
        ...prev,
        amount: nextAmt,
        vat_amount: nextVat,
        has_vat_invoice: nextHasVat,
      };
    });
  }, [itemsGrandTotal, itemsTotalVat]);

  const handleSuffixChange = (val: string) => {
    setTitleSuffix(val);
    const trimmed = val.trim();
    const activePrefix = titlePrefix || 'Đề nghị thanh toán';
    const combined = trimmed ? `${activePrefix} — ${trimmed}` : activePrefix;
    setForm((prev: any) => ({ ...prev, title: combined }));
  };

  interface ExpenseAttachmentItem {
    url: string;
    name: string;
    size?: number;
    type?: string;
  }

  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [images, setImages] = useState<(ExpenseAttachmentItem | string)[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const fileInputMultiRef = useRef<HTMLInputElement>(null);
  const [users, setUsers] = useState<any[]>(propUsers && propUsers.length > 0 ? propUsers : []);
  const [contacts, setContacts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 767.98px)').matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 767.98px)');
    const onChange = (ev: MediaQueryListEvent) => setIsMobile(ev.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Security guard: Only creator / manager / accountant + write permission
  useEffect(() => {
    if (!isOpen) return;
    if (checkIsViewer(user) || !hasPermission('expenses', 'write')) {
      addToast('Bạn không có quyền tạo hoặc chỉnh sửa phiếu chi', 'error');
      onClose();
      return;
    }
    if (isEditMode) {
      const creatorId = Number(editItem.created_by || editItem.user_id);
      const currentUserId = Number(user?.id);
      const isAdminOrMgr = Boolean(user && (isManagement(user) || isAccountant(user, true)));
      if (creatorId && currentUserId && creatorId !== currentUserId && !isAdminOrMgr) {
        addToast('Chỉ người tạo phiếu mới có quyền chỉnh sửa', 'error');
        onClose();
      }
    }
  }, [isOpen, isEditMode, editItem, user, hasPermission, addToast, onClose]);

  const isInitializedRef = useRef(false);
  const prevOpenRef = useRef(false);
  const prevEditItemRef = useRef<any>(null);
  const [allocationType, setAllocationType] = useState<'contact' | 'company'>('contact');
  const [showParticipantDropdown, setShowParticipantDropdown] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');

  const EXPENSE_DRAFT_KEY = `myerp_expense_create_draft_${user?.tenant_id || 0}_${user?.id || 0}`;
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [existingDraft, setExistingDraft] = useState<any>(null);

  // Check for saved draft
  useEffect(() => {
    if (isOpen && !isRealEditOrClone) {
      try {
        const saved = localStorage.getItem(EXPENSE_DRAFT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && (parsed.form?.title || parsed.form?.amount || parsed.form?.notes || (parsed.images && parsed.images.length > 0))) {
            setExistingDraft(parsed);
          } else {
            setExistingDraft(null);
          }
        } else {
          setExistingDraft(null);
        }
      } catch {
        setExistingDraft(null);
      }
    } else if (!isOpen) {
      setShowExitConfirm(false);
      saveAbortRef.current?.abort();
      uploadAbortRef.current?.abort();
    }
  }, [isOpen, editItem, EXPENSE_DRAFT_KEY, isRealEditOrClone]);

  const isFormDirty = () => {
    if (isEditMode) return false;
    return Boolean(
      titleSuffix?.trim() ||
      form.title?.trim() ||
      (Number(form.amount) || 0) > 0 ||
      form.notes?.trim() ||
      images.length > 0 ||
      paymentBeneficiaryName?.trim() ||
      paymentBankAccount?.trim() ||
      (expenseItems && expenseItems.some(i => i.content?.trim() || (Number(i.price) || 0) > 0))
    );
  };

  const saveDraftToStorage = () => {
    const payload = {
      form,
      titlePrefix,
      titleSuffix,
      expenseItems,
      images,
      expenseCategory,
      invoiceType,
      allocationType,
      paymentTarget,
      paymentMethod,
      currencyType,
      paymentEmployeeId,
      paymentSupplierId,
      paymentLecturerId,
      paymentContactId,
      paymentBeneficiaryName,
      paymentBankName,
      paymentBankAccount,
      paymentAccountName,
      paymentBankBranch,
      paymentPhone,
      paymentTaxCode,
      paymentDestination,
      paymentWalletType,
      paymentWalletPhone,
      paymentCorporateCard,
      paymentGovAgencyType,
      paymentGovDecisionNumber,
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(EXPENSE_DRAFT_KEY, JSON.stringify(payload));
      setExistingDraft(payload);
    } catch (e) {
      console.error('Failed to save expense draft', e);
    }
  };

  const handleSaveDraftAndExit = () => {
    saveDraftToStorage();
    addToast('Đã lưu bản nháp chi phí thành công!', 'success');
    setShowExitConfirm(false);
    onClose();
  };

  const handleExplicitSaveDraft = () => {
    if (isEditMode && editItem?.status === 'draft') {
      handleSave(true);
      return;
    }
    saveDraftToStorage();
    addToast('Đã lưu bản nháp chi phí thành công!', 'success');
  };

  const handleDiscardAndExit = () => {
    try {
      localStorage.removeItem(EXPENSE_DRAFT_KEY);
    } catch {}
    setExistingDraft(null);
    setShowExitConfirm(false);
    onClose();
  };

  const handleRequestClose = () => {
    if (isFormDirty()) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  };
  const handleRequestCloseRef = useRef<() => void>(() => {});
  handleRequestCloseRef.current = handleRequestClose;
  const previewQrModalUrlRef = useRef<string | null>(null);
  previewQrModalUrlRef.current = previewQrModalUrl;
  const confirmUploadInFlightRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    return pushOverlay('expense-create-drawer', () => {
      if (previewQrModalUrlRef.current) {
        setPreviewQrModalUrl(null);
        return;
      }
      handleRequestCloseRef.current();
    }, 100);
  }, [isOpen]);

  const handleRestoreDraft = () => {
    if (!existingDraft) return;
    justHydratedRef.current = true;
    if (existingDraft.form) setForm({ ...EMPTY_FORM, ...existingDraft.form });
    if (existingDraft.titlePrefix) setTitlePrefix(existingDraft.titlePrefix);
    if (existingDraft.titleSuffix !== undefined) {
      setTitleSuffix(existingDraft.titleSuffix);
    } else if (existingDraft.form?.title) {
      setTitleSuffix(extractExpenseTitleSuffix(existingDraft.form.title));
    }
    if (Array.isArray(existingDraft.expenseItems) && existingDraft.expenseItems.length > 0) {
      setExpenseItems(existingDraft.expenseItems);
    }
    if (Array.isArray(existingDraft.images)) setImages(existingDraft.images);
    if (existingDraft.expenseCategory) setExpenseCategory(existingDraft.expenseCategory);
    if (existingDraft.invoiceType) setInvoiceType(existingDraft.invoiceType);
    setAllocationType(existingDraft.allocationType ?? 'contact');
    if (existingDraft.paymentTarget) setPaymentTarget(existingDraft.paymentTarget);
    if (existingDraft.paymentMethod) setPaymentMethod(existingDraft.paymentMethod);
    if (existingDraft.currencyType) setCurrencyType(existingDraft.currencyType);
    setPaymentEmployeeId(existingDraft.paymentEmployeeId ?? '');
    setPaymentSupplierId(existingDraft.paymentSupplierId ?? '');
    setPaymentLecturerId(existingDraft.paymentLecturerId ?? '');
    setPaymentContactId(existingDraft.paymentContactId ?? '');
    setPaymentBeneficiaryName(existingDraft.paymentBeneficiaryName ?? '');
    setPaymentBankName(existingDraft.paymentBankName ?? '');
    setPaymentBankAccount(existingDraft.paymentBankAccount ?? '');
    setPaymentAccountName(existingDraft.paymentAccountName ?? '');
    setPaymentBankBranch(existingDraft.paymentBankBranch ?? '');
    setPaymentPhone(existingDraft.paymentPhone ?? '');
    setPaymentTaxCode(existingDraft.paymentTaxCode ?? '');
    setPaymentDestination(existingDraft.paymentDestination ?? '');
    setPaymentWalletType(existingDraft.paymentWalletType ?? 'momo');
    setPaymentWalletPhone(existingDraft.paymentWalletPhone ?? '');
    setPaymentCorporateCard(existingDraft.paymentCorporateCard ?? '');
    setPaymentGovAgencyType(existingDraft.paymentGovAgencyType ?? 'tax');
    setPaymentGovDecisionNumber(existingDraft.paymentGovDecisionNumber ?? '');
    addToast('Đã khôi phục dữ liệu bản nháp chi phí', 'info');
    setExistingDraft(null);
  };

  const handleClearDraft = () => {
    try {
      localStorage.removeItem(EXPENSE_DRAFT_KEY);
    } catch {}
    setExistingDraft(null);
    addToast('Đã xóa bản nháp', 'info');
  };

  // Lecturer options from companies + users
  const lecturerOptions = useMemo(() => {
    const list: any[] = [];
    const seenNames = new Set<string>();
    const safeCompanies = Array.isArray(companies) ? companies : ((companies as any)?.items || []);
    const safeUsers = Array.isArray(users) ? users : ((users as any)?.items || []);

    safeCompanies.forEach((co: any) => {
      const coType = String(co.type || co.category || '').toLowerCase();
      const name = co.name || '';
      if (coType.includes('lecturer') || coType.includes('giảng viên') || coType.includes('chuyên gia') || name.toLowerCase().includes('giảng viên')) {
        seenNames.add(name.toLowerCase());
        list.push({
          value: `company_${co.id}`,
          label: name,
          source: 'company',
          raw: co,
          bank_name: co.bank_name || '',
          bank_account: co.bank_account_number || co.bank_account || '',
          bank_account_name: co.bank_account_name || name,
          phone: co.phone || '',
          sublabel: `Giảng viên B2B • ${co.bank_name ? `${co.bank_name}: ${co.bank_account_number || co.bank_account}` : 'Chưa có STK'}`
        });
      }
    });

    safeUsers.forEach((u: any) => {
      const role = String(u.role || '').toLowerCase();
      const job = String(u.job_title || '').toLowerCase();
      const isLec = role.includes('teacher') || role.includes('giang_vien') || role.includes('tro_giang') || job.includes('giảng viên') || job.includes('học thuật');
      const uName = u.full_name || u.name || '';
      if (isLec && uName && !seenNames.has(uName.toLowerCase())) {
        list.push({
          value: `user_${u.id}`,
          label: uName,
          source: 'user',
          raw: u,
          avatar: u.avatar_url || u.avatar,
          bank_name: u.bank_name || '',
          bank_account: u.bank_account || '',
          bank_account_name: uName,
          phone: u.phone || '',
          sublabel: `Giảng viên nội bộ • ${u.bank_name ? `${u.bank_name}: ${u.bank_account}` : 'Chưa có STK'}`
        });
      }
    });

    return list;
  }, [companies, users]);

  // Partners: unified suppliers + companies
  const partnerOptions = useMemo(() => {
    const list: any[] = [];
    const seenNames = new Set<string>();
    const safeSuppliers = Array.isArray(suppliers) ? suppliers : ((suppliers as any)?.items || (suppliers as any)?.suppliers || []);
    const safeCompanies = Array.isArray(companies) ? companies : ((companies as any)?.items || []);

    safeSuppliers.forEach((s: any) => {
      if (s.name) {
        seenNames.add(s.name.toLowerCase());
        list.push({
          value: `sup_${s.id}`,
          label: s.name,
          source: 'supplier',
          raw: s,
          bank_name: s.bank_name || '',
          bank_account: s.bank_account || '',
          bank_account_name: s.bank_account_name || s.name || '',
          tax_code: s.tax_code || '',
          phone: s.phone || '',
          sublabel: `Nhà cung cấp • MST: ${s.tax_code || 'N/A'}${s.bank_name ? ` • ${s.bank_name}` : ''}`
        });
      }
    });

    safeCompanies.forEach((co: any) => {
      const name = co.name || '';
      if (name && !seenNames.has(name.toLowerCase())) {
        const tier = String(co.tier || '').toUpperCase();
        list.push({
          value: `company_${co.id}`,
          label: name,
          source: 'company',
          raw: co,
          bank_name: co.bank_name || '',
          bank_account: co.bank_account_number || co.bank_account || '',
          bank_account_name: co.bank_account_name || name,
          tax_code: co.tax_id || '',
          phone: co.phone || '',
          sublabel: `Đối tác ${tier || 'B2B'}${co.tax_id ? ` • MST: ${co.tax_id}` : ''}${co.bank_name ? ` • ${co.bank_name}` : ''}`
        });
      }
    });

    return list;
  }, [suppliers, companies]);

  // Contacts (Clients / Students)
  const contactOptions = useMemo(() => {
    const safeContacts = Array.isArray(contacts) ? contacts : ((contacts as any)?.items || []);
    return safeContacts.map((c: any) => {
      const name = c.full_name || c.name || `Khách hàng #${c.id}`;
      return {
        value: String(c.id),
        label: name,
        raw: c,
        avatar: c.avatar_url || c.avatar,
        phone: c.phone || '',
        email: c.email || '',
        bank_name: c.bank_name || '',
        bank_account: c.bank_account || '',
        bank_account_name: c.bank_account_name || name,
        sublabel: [c.phone, c.email].filter(Boolean).join(' • ')
      };
    });
  }, [contacts]);

  const employeeSelectOptions = useMemo(() => (
    users.map((u: any) => ({
      value: String(u.id),
      label: u.full_name || u.name || u.username || `Nhân viên #${u.id}`,
      avatar: u.avatar_url || u.avatar,
      sublabel: [
        u.role || '',
        u.bank_name ? `${u.bank_name}: ${u.bank_account}` : 'Chưa có STK'
      ].filter(Boolean).join(' • ')
    }))
  ), [users]);

  const allocationContactOptions = useMemo(() => (
    contacts.filter(c => !form.entities.find((e: any) => e.entity_id === c.id)).map(c => ({
      value: String(c.id),
      label: (c.full_name || '').trim(),
      avatar: c.avatar_url,
      sublabel: c.company_name
    }))
  ), [contacts, form.entities]);

  const allocationCompanyOptions = useMemo(() => (
    companies.filter(c => !form.entities.find((e: any) => e.entity_id === c.id)).map(c => ({
      value: String(c.id),
      label: c.name || c.company_name || 'Không tên',
      avatar: c.logo_url || c.logo,
      sublabel: c.code || c.phone
    }))
  ), [companies, form.entities]);

  const approverUserOptions = useMemo(() => (
    users.map((u: any) => ({
      value: u.id,
      label: u.full_name,
      avatar: u.avatar_url,
      sublabel: [u.phone, u.email, u.role].filter(Boolean).join(' - ')
    }))
  ), [users]);

  // Fetch initial system dependencies
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    const { signal } = controller;

    if (propUsers && propUsers.length > 0) {
      setUsers(propUsers);
    }

    api.get('/users', { signal }).then(r => {
      if (signal.aborted) return;
      const d = r.data?.data || r.data;
      const list = Array.isArray(d) ? d : ensureArray(d?.items);
      if (list.length > 0) {
        setUsers(list);
      }
    }).catch(() => {});

    api.get('/teams', { signal }).then(r => {
      if (signal.aborted) return;
      const d = r.data?.data;
      setTeams(Array.isArray(d) ? d : ensureArray(r.data));
    }).catch(() => {});

    api.get('/suppliers', { signal }).then(r => {
      if (signal.aborted) return;
      const d = r.data?.data;
      setSuppliers(Array.isArray(d) ? d : ensureArray(d?.items));
    }).catch(() => {});

    api.get('/contacts?limit=1000', { signal }).then(r => {
      if (signal.aborted) return;
      const d = r.data?.data;
      setContacts(Array.isArray(d) ? d : ensureArray(d?.items));
    }).catch(() => {});

    api.get('/companies?limit=1000', { signal }).then(r => {
      if (signal.aborted) return;
      const d = r.data?.data;
      setCompanies(Array.isArray(d) ? d : ensureArray(d?.items));
    }).catch(() => {});

    return () => {
      controller.abort();
    };
  }, [isOpen, propUsers]);

  // Auto-fill logged in user's bank details if target is 'Nội bộ'
  useEffect(() => {
    if (isOpen && !isRealEditOrClone && user && paymentTarget === 'Nội bộ' && !paymentEmployeeId) {
      const currentEmp = ensureArray(users).find((u: any) => Number(u.id) === Number(user.id)) || user;
      if (currentEmp) {
        setPaymentEmployeeId(String(currentEmp.id));
        setPaymentBeneficiaryName(currentEmp.full_name || currentEmp.name || '');
        if (currentEmp.bank_name) setPaymentBankName(currentEmp.bank_name);
        if (currentEmp.bank_account) setPaymentBankAccount(currentEmp.bank_account);
        const accName = currentEmp.full_name || currentEmp.name || '';
        if (accName) setPaymentAccountName(accName.toUpperCase());
        if (currentEmp.phone) setPaymentPhone(currentEmp.phone);
      }
    }
  }, [isOpen, isRealEditOrClone, user, paymentTarget, paymentEmployeeId, users]);

  // Initialize form state when opening or when editItem changes
  useEffect(() => {
    if (isOpen) {
      const isNewlyOpened = !prevOpenRef.current;
      const editItemKey = editItem?.id
        ? `edit_${editItem.id}`
        : editItem?.isClone
          ? `clone_${editItem.title || ''}_${editItem.amount || ''}`
          : `new_${editItem?.contact_id || editItem?.entity_id || ''}`;
      const isItemChanged = editItemKey !== prevEditItemRef.current;

      if (isNewlyOpened || isItemChanged) {
        prevOpenRef.current = true;
        prevEditItemRef.current = editItemKey;

        if (isRealEditOrClone) {
          justHydratedRef.current = true;

          // Parse structured payment_meta if present
          let metaObj: Record<string, any> = {};
          if (editItem.payment_meta) {
            if (typeof editItem.payment_meta === 'object') {
              metaObj = editItem.payment_meta;
            } else if (typeof editItem.payment_meta === 'string') {
              try {
                const parsedMeta = JSON.parse(editItem.payment_meta);
                if (parsedMeta && typeof parsedMeta === 'object') metaObj = parsedMeta;
              } catch {}
            }
          }

          // Extract existing images with strict deduplication
          const existingImages: (ExpenseAttachmentItem | string)[] = [];
          const isDuplicateImg = (candidate: string) => {
            const norm = normalizeFileUrl(candidate);
            const name = getFileNameFromUrl(candidate);
            return existingImages.some(img => {
              const existingUrl = typeof img === 'string' ? img : img.url;
              const existingNorm = normalizeFileUrl(existingUrl);
              const existingName = typeof img === 'string' ? getFileNameFromUrl(img) : (img.name || getFileNameFromUrl(img.url));
              return (norm && existingNorm && norm === existingNorm) || (name && existingName && name === existingName);
            });
          };

          if (editItem.notes) {
            const matches = editItem.notes.matchAll(/([^\n\r(•]+)\s*\((https?:\/\/[^\s)]+|\/backend\/[^\s)]+|uploads\/[^\s)]+)\)/gi);
            for (const m of matches) {
              const rawName = m[1].replace(/^[•\-\s]+/, '').trim();
              const url = m[2].trim();
              if (url && !isDuplicateImg(url)) {
                existingImages.push({
                  url,
                  name: rawName || getFileNameFromUrl(url) || 'Tài liệu'
                });
              }
            }
          }
          if (editItem.image_url && !isDuplicateImg(editItem.image_url)) {
            existingImages.push({
              url: editItem.image_url,
              name: getFileNameFromUrl(editItem.image_url) || 'Tài liệu đính kèm'
            });
          }
          setImages(existingImages);

          // Bank details parsing
          const bankRegex = /\[Thông tin chuyển khoản\]:\s*([^\-]+)\s*-\s*STK:\s*([^\-]+)\s*-\s*Chủ TK:\s*([^\n-]+)(?:\s*-\s*Chi nhánh:\s*([^\n]+))?/;
          const match = editItem.notes?.match(bankRegex);
          let parsedBankName = editItem.bank_name || '';
          let parsedBankAccount = editItem.bank_account_number || editItem.bank_account || '';
          let parsedAccountName = editItem.bank_account_name || '';
          let parsedBranch = metaObj.bank_branch || editItem.bank_branch || '';

          if (match) {
            parsedBankName = match[1].trim();
            parsedBankAccount = match[2].trim();
            parsedAccountName = match[3].trim();
            if (match[4]) parsedBranch = match[4].trim();
          }

          setPaymentBankName(parsedBankName);
          setPaymentBankAccount(parsedBankAccount);
          setPaymentAccountName(parsedAccountName);
          setPaymentBankBranch(parsedBranch);

          const rawTitle = (editItem.title || '').trim();
          let detectedPrefix = 'Đề nghị thanh toán';
          let rawSuffix = extractExpenseTitleSuffix(rawTitle);
          const dashMatch = rawTitle.match(/^([^—\-]+?)\s*(?:—|-)\s*(.+)$/);
          if (dashMatch) {
            const candidatePrefix = dashMatch[1].trim();
            if (/^(Đề nghị|Đề xuất|Phiếu|Tờ trình|Thanh toán|Tạm ứng|Hoàn ứng)/i.test(candidatePrefix)) {
              detectedPrefix = candidatePrefix;
              rawSuffix = dashMatch[2].trim();
            }
          }
          const initialSuffix = editItem.isClone && rawSuffix && !rawSuffix.endsWith('(Bản sao)')
            ? `${rawSuffix} (Bản sao)`
            : rawSuffix;
          setTitlePrefix(detectedPrefix);
          setTitleSuffix(initialSuffix);
          const fullTitle = initialSuffix ? `${detectedPrefix} — ${initialSuffix}` : rawTitle;

          let initialCategory = editItem.category || 'Vận hành';
          if (initialCategory === 'Di chuyển' || initialCategory === 'Vận chuyển') initialCategory = 'travel';
          else if (initialCategory === 'Ăn uống') initialCategory = 'client_meeting';
          else if (initialCategory === 'Vận hành') initialCategory = 'general';
          else if (initialCategory === 'Marketing') initialCategory = 'marketing';
          else if (initialCategory === 'Văn phòng phẩm' || initialCategory === 'Công cụ') initialCategory = 'stationery';
          else if (initialCategory === 'Nhân sự') initialCategory = 'hr';
          setExpenseCategory(initialCategory);

          setPaymentBeneficiaryName(editItem.vendor_name || '');
          setCurrencyType(editItem.currency || 'VND');

          const rawNotes = editItem.notes || editItem.description || '';

          // Restore paymentMethod & auxiliary payment details from metaObj / editItem / notes
          const cashMatch = rawNotes.match(/\[Thông tin nhận tiền\]:\s*Tiền mặt(?:\s*-\s*Người nhận:\s*([^\-\n]+))?(?:\s*-\s*Quầy bàn giao:\s*([^\n]+))?/i);
          const walletMatch = rawNotes.match(/\[Thông tin nhận tiền\]:\s*Ví điện tử\s*\(([^)]+)\)(?:\s*-\s*SĐT:\s*([^\-\n]+))?(?:\s*-\s*Chủ ví:\s*([^\n]+))?/i);
          const cardMatch = rawNotes.match(/\[Thông tin nhận tiền\]:\s*Thẻ tín dụng(?:\s*-\s*4 số cuối:\s*([^\-\n]+))?(?:\s*-\s*Người quẹt:\s*([^\n]+))?/i);

          let hydratedMethod = 'Chuyển khoản';
          if (metaObj.payment_method || editItem.payment_method) {
            hydratedMethod = metaObj.payment_method || editItem.payment_method;
          } else if (cashMatch) {
            hydratedMethod = 'Tiền mặt';
          } else if (walletMatch) {
            hydratedMethod = 'Ví điện tử';
          } else if (cardMatch) {
            hydratedMethod = 'Thẻ tín dụng';
          } else if (editItem.request_bank_transfer === false || editItem.request_bank_transfer === 0) {
            hydratedMethod = 'Tiền mặt';
          }
          setPaymentMethod(hydratedMethod);

          setPaymentDestination(metaObj.destination || editItem.payment_destination || cashMatch?.[2]?.trim() || '');
          setPaymentWalletType((metaObj.wallet_type || editItem.payment_wallet_type || walletMatch?.[1]?.trim() || 'momo') as any);
          setPaymentWalletPhone(metaObj.wallet_phone || editItem.payment_wallet_phone || walletMatch?.[2]?.trim() || '');
          const parsedCard = metaObj.corporate_card || editItem.payment_corporate_card || cardMatch?.[1]?.trim() || '';
          setPaymentCorporateCard(parsedCard === 'N/A' ? '' : parsedCard);
          setPaymentGovAgencyType(metaObj.gov_agency || editItem.payment_gov_agency_type || 'tax');
          setPaymentGovDecisionNumber(metaObj.gov_decision || editItem.payment_gov_decision_number || '');
          setPaymentPhone(metaObj.phone || editItem.payment_phone || '');
          setPaymentTaxCode(metaObj.tax_code || editItem.payment_tax_code || '');

          // Restore paymentTarget & beneficiary selector IDs
          const matchedEmp = ensureArray(users).find((u: any) =>
            (editItem.vendor_name && (u.full_name === editItem.vendor_name || u.name === editItem.vendor_name)) ||
            (parsedBankAccount && u.bank_account && String(u.bank_account).trim() === String(parsedBankAccount).trim())
          );
          const matchedPartner = ensureArray(companies).find((c: any) =>
            editItem.vendor_name && (c.name === editItem.vendor_name || c.company_name === editItem.vendor_name)
          );
          const matchedContact = ensureArray(contacts).find((c: any) =>
            editItem.vendor_name && ((c.full_name || '').trim() === editItem.vendor_name || c.name === editItem.vendor_name)
          );

          const metaTarget = metaObj.payment_target || editItem.payment_target;
          if (metaTarget) {
            setPaymentTarget(metaTarget);
            setPaymentEmployeeId(metaObj.employee_id || editItem.payment_employee_id ? String(metaObj.employee_id || editItem.payment_employee_id) : (matchedEmp ? String(matchedEmp.id) : ''));
            setPaymentSupplierId(metaObj.supplier_id || editItem.payment_supplier_id ? String(metaObj.supplier_id || editItem.payment_supplier_id) : (matchedPartner ? String(matchedPartner.id) : ''));
            setPaymentLecturerId(metaObj.lecturer_id || editItem.payment_lecturer_id ? String(metaObj.lecturer_id || editItem.payment_lecturer_id) : '');
            setPaymentContactId(metaObj.contact_id || editItem.payment_contact_id ? String(metaObj.contact_id || editItem.payment_contact_id) : (matchedContact ? String(matchedContact.id) : ''));
          } else if (matchedEmp) {
            setPaymentTarget('Nội bộ');
            setPaymentEmployeeId(String(matchedEmp.id));
            setPaymentSupplierId('');
            setPaymentLecturerId('');
            setPaymentContactId('');
          } else if (matchedPartner) {
            setPaymentTarget('Đối tác');
            setPaymentEmployeeId('');
            setPaymentSupplierId(String(matchedPartner.id));
            setPaymentLecturerId('');
            setPaymentContactId('');
          } else if (matchedContact) {
            setPaymentTarget('Khách hàng');
            setPaymentEmployeeId('');
            setPaymentSupplierId('');
            setPaymentLecturerId('');
            setPaymentContactId(String(matchedContact.id));
          } else if (editItem.vendor_name) {
            setPaymentTarget('Đối tác');
            setPaymentEmployeeId('');
            setPaymentSupplierId('');
            setPaymentLecturerId('');
            setPaymentContactId('');
          } else {
            setPaymentTarget('Nội bộ');
            setPaymentEmployeeId('');
            setPaymentSupplierId('');
            setPaymentLecturerId('');
            setPaymentContactId('');
          }

          // Restore allocationType from entities
          const hydratedEntities = Array.isArray(editItem.entities) ? editItem.entities : [];
          setAllocationType(hydratedEntities[0]?.entity_type === 'company' ? 'company' : 'contact');

          // Parse related_user_ids safely from array, JSON string, or comma-separated string
          let parsedRelatedIds: number[] = [];
          if (Array.isArray(editItem.related_user_ids)) {
            parsedRelatedIds = editItem.related_user_ids.map(Number).filter((n: number) => !isNaN(n) && n > 0);
          } else if (typeof editItem.related_user_ids === 'string' && editItem.related_user_ids.trim()) {
            const rawRel = editItem.related_user_ids.trim();
            if (rawRel.startsWith('[')) {
              try {
                const parsed = JSON.parse(rawRel);
                if (Array.isArray(parsed)) parsedRelatedIds = parsed.map(Number).filter((n: number) => !isNaN(n) && n > 0);
              } catch {}
            } else {
              parsedRelatedIds = rawRel.split(',').map((s: string) => Number(s.trim())).filter((n: number) => !isNaN(n) && n > 0);
            }
          }

          let cleanNotes = editItem.notes ? editItem.notes
            .replace(/\[Chi tiết các khoản chi\]:[^\n]*(\n[•\-*][^\n]*)*\s*/gi, '')
            .replace(/\[JSON_ITEMS\]:[^\n]*/gi, '')
            .replace(/\[Hồ sơ chi phí[^\]]*\]:[^\n]*/gi, '')
            .replace(/\[Phòng ban[^\]]*\]:[^\n]*/gi, '')
            .replace(/\[Thông tin chuyển khoản[^\]]*\]:[^\n]*/gi, '')
            .replace(/\[Thông tin nhận tiền[^\]]*\]:[^\n]*/gi, '')
            .replace(/\[Tài liệu đính kèm[^\]]*\]:[^\n]*(\n•[^\n]*)*\s*/gi, '')
            .trim() : '';

          setForm({
            title: fullTitle,
            category: initialCategory,
            amount: String(editItem.amount || 0),
            currency: editItem.currency || 'VND',
            vat_amount: editItem.vat_amount ? String(editItem.vat_amount) : '',
            date: editItem.date || getLocalDateStr(),
            due_date: editItem.due_date || '',
            notes: cleanNotes,
            approver_id: editItem.approver_id ? Number(editItem.approver_id) : null,
            approver_id_2: editItem.approver_id_2 ? Number(editItem.approver_id_2) : null,
            approver_id_3: editItem.approver_id_3 ? Number(editItem.approver_id_3) : null,
            related_user_ids: parsedRelatedIds,
            vendor_name: editItem.vendor_name || '',
            has_vat_invoice: !!editItem.has_vat_invoice,
            is_vat_inclusive: !!editItem.is_vat_inclusive,
            entities: hydratedEntities,
            image_url: editItem.image_url || '',
            request_bank_transfer: hydratedMethod === 'Chuyển khoản',
            bank_name: parsedBankName,
            bank_account_number: parsedBankAccount,
            bank_account_name: parsedAccountName
          });

          // Expense items breakdown parsing
          let loadedItems: any[] = [];
          const jsonItemsMatch = rawNotes.match(/\[JSON_ITEMS\]:\s*(\[[^\n]+\])/i);
          if (jsonItemsMatch) {
            try {
              const parsed = JSON.parse(jsonItemsMatch[1]);
              if (Array.isArray(parsed) && parsed.length > 0) loadedItems = parsed;
            } catch {}
          }
          if (loadedItems.length === 0) {
            if (Array.isArray(editItem.items) && editItem.items.length > 0) {
              loadedItems = editItem.items;
            } else if (typeof editItem.items === 'string' && editItem.items.trim().startsWith('[')) {
              try {
                const parsed = JSON.parse(editItem.items);
                if (Array.isArray(parsed) && parsed.length > 0) loadedItems = parsed;
              } catch {}
            }
          }

          let hydratedItems: ExpenseItemRow[] = [];
          if (loadedItems.length > 0) {
            hydratedItems = loadedItems.map((it: any, idx: number) => ({
              id: it.id || Date.now() + idx,
              content: it.content || it.name || it.description || '',
              quantity: it.quantity !== undefined && it.quantity !== null && it.quantity !== '' ? Math.max(0, Number(it.quantity) || 0) : 1,
              price: parseMoneyVn(it.price !== undefined ? it.price : it.unit_price),
              vat: Number(it.vat !== undefined ? it.vat : (editItem.has_vat_invoice ? 10 : 0))
            }));
          } else {
            const itemMatches = Array.from(rawNotes.matchAll(/[•\-*]?\s*\[?(\d+)\]?\s*([^\-\n]+?)\s*-\s*SL:\s*(\d+(?:\.\d+)?)\s*-\s*Đơn giá:\s*([0-9.,]+)[^\-]*-\s*VAT:\s*(\d+)%/gi));
            if (itemMatches.length > 0) {
              hydratedItems = itemMatches.map((m: any, idx: number) => {
                const parsedPrice = String(m[4] || '').trim();
                const p = parseMoneyVn(parsedPrice);
                return {
                  id: Date.now() + idx,
                  content: m[2].trim(),
                  quantity: Math.max(0, Number(m[3]) || 0),
                  price: p,
                  vat: Number(m[5]) || 0
                };
              });
            } else {
              const amt = Math.round(Number(editItem.amount) || 0);
              const vatAmt = Math.round(Number(editItem.vat_amount) || 0);
              let vatPct = 0;
              let netPrice = amt;
              if (vatAmt > 0 && amt > 0) {
                netPrice = Math.round(amt - vatAmt);
                const calcPct = netPrice > 0 ? Math.round((vatAmt / netPrice) * 100) : 0;
                vatPct = vatRates.includes(calcPct) ? calcPct : Math.round((vatAmt / amt) * 100);
                if (!vatRates.includes(vatPct)) vatPct = 8;
              }
              hydratedItems = [
                {
                  id: Date.now(),
                  content: initialSuffix || editItem.title || '',
                  quantity: 1,
                  price: Math.round(netPrice > 0 ? netPrice : amt),
                  vat: vatPct
                }
              ];
            }
          }
          setExpenseItems(hydratedItems);

          // Restore invoiceType accurately from editItem or hydrated items
          if (editItem.invoice_type && ['vat_10', 'vat_8', 'vat_5', 'vat_0', 'retail', 'none'].includes(editItem.invoice_type)) {
            setInvoiceType(editItem.invoice_type);
          } else if (editItem.has_vat_invoice || hydratedItems.some(it => Number(it.vat) > 0)) {
            const firstVat = Number(hydratedItems[0]?.vat ?? 10);
            if (firstVat === 8) setInvoiceType('vat_8');
            else if (firstVat === 5) setInvoiceType('vat_5');
            else if (firstVat === 0) setInvoiceType('vat_0');
            else setInvoiceType('vat_10');
          } else {
            setInvoiceType('none');
          }
        } else {
          // Fresh create mode (including pre-filled contact from CustomerProfileDrawer)
          const defaultApproverId = resolveTeamLeaderId(user, users, teams) || (users[0]?.id || null);
          const prefillContactId = editItem?.contact_id || editItem?.entity_id || null;
          const prefillContactName = editItem?.contact_name || '';
          const prefillEntities = prefillContactId
            ? [{
                entity_type: editItem?.entity_type || 'contact',
                entity_id: Number(prefillContactId),
                name: prefillContactName || `Khách hàng #${prefillContactId}`
              }]
            : [];

          setImages([]);
          setTitlePrefix('Đề nghị thanh toán');
          setTitleSuffix('');
          setExpenseCategory('general');
          setInvoiceType('vat_10');
          setPaymentTarget('Nội bộ');
          setPaymentMethod('Chuyển khoản');
          setCurrencyType('VND');
          setAllocationType('contact');
          setPaymentSupplierId('');
          setPaymentLecturerId('');
          setPaymentContactId('');
          setPaymentDestination('');
          setPaymentWalletType('momo');
          setPaymentWalletPhone('');
          setPaymentCorporateCard('');
          setPaymentGovAgencyType('tax');
          setPaymentGovDecisionNumber('');
          setPaymentPhone('');
          setPaymentTaxCode('');
          setExpenseItems([{ id: Date.now(), content: '', quantity: 1, price: 0, vat: 10 }]);

          setForm({
            ...EMPTY_FORM,
            title: '',
            date: initialDate || getLocalDateStr(),
            due_date: '',
            approver_id: defaultApproverId,
            entities: prefillEntities
          });
        }

        setTimeout(() => {
          isInitializedRef.current = true;
        }, 50);
      }
    } else {
      prevOpenRef.current = false;
      prevEditItemRef.current = null;
      isInitializedRef.current = false;
    }
  }, [isOpen, editItem, initialDate, vatRates]);

  // Default Director & Accountant for 3-step routing
  const defaultDirector = useMemo(() => {
    const businessUsers = ensureArray(users).filter((u: any) =>
      !['superadmin', 'super_admin', 'bot', 'system'].includes(String(u.role).toLowerCase()) &&
      !isExcludedSystemEmail(u.email)
    );
    return businessUsers.find((u: any) => String(u.role).toLowerCase() === 'director')
      || businessUsers.find((u: any) => String(u.role).toLowerCase() === 'admin')
      || null;
  }, [users]);

  const defaultAccountant = useMemo(() => {
    const businessUsers = ensureArray(users).filter((u: any) =>
      !['superadmin', 'super_admin', 'bot', 'system'].includes(String(u.role).toLowerCase()) &&
      !isExcludedSystemEmail(u.email)
    );
    return businessUsers.find((u: any) => isAccountant(u, false))
      || businessUsers.find((u: any) => String(u.department || '').toLowerCase().includes('kế toán'))
      || null;
  }, [users]);

  // Dynamic threshold routing effect (uses FX-normalized VND amount)
  useEffect(() => {
    if (isOpen && ensureArray(users).length > 0) {
      if (justHydratedRef.current) {
        justHydratedRef.current = false;
        return;
      }
      if (itemsGrandTotalVnd >= threshold) {
        setForm((prev: any) => ({
          ...prev,
          approver_id_2: defaultDirector?.id ? Number(defaultDirector.id) : prev.approver_id_2,
          approver_id_3: defaultAccountant?.id ? Number(defaultAccountant.id) : prev.approver_id_3
        }));
      } else {
        setForm((prev: any) => ({
          ...prev,
          approver_id_2: defaultAccountant?.id ? Number(defaultAccountant.id) : prev.approver_id_2,
          approver_id_3: null
        }));
      }
    }
  }, [itemsGrandTotalVnd, threshold, isOpen, defaultDirector, defaultAccountant, users]);

  // Keep approver_id updated with team leader
  useEffect(() => {
    if (isOpen && !isRealEditOrClone && !form.approver_id && (users.length > 0 || teams.length > 0)) {
      const leaderId = resolveTeamLeaderId(user, users, teams) || users[0]?.id || null;
      if (leaderId) {
        setForm((prev: any) => ({ ...prev, approver_id: leaderId }));
      }
    }
  }, [isOpen, isRealEditOrClone, users, teams, user, form.approver_id]);

  // Anti-self-approval: only executive roles without downstream tiers may auto-approve
  const isExecutiveUser = isExecutive(user);
  const isAutoApprove = Boolean(
    isExecutiveUser &&
    form.approver_id !== null &&
    user?.id !== undefined &&
    Number(form.approver_id) === Number(user.id) &&
    itemsGrandTotalVnd < threshold
  );

  const multiUploadInFlightRef = useRef(false);

  // Handle Save
  const handleSave = async (isSaveDraft = false) => {
    if (saveInFlightRef.current || checkIsViewer(user) || !hasPermission('expenses', 'write')) return;
    saveInFlightRef.current = true;

    try {
      if (isEditMode) {
        const creatorId = Number(editItem.created_by || editItem.user_id);
        const currentUserId = Number(user?.id);
        const isAdminOrMgr = Boolean(user && (isManagement(user) || isAccountant(user, true)));
        if (creatorId && currentUserId && creatorId !== currentUserId && !isAdminOrMgr) {
          addToast('Chỉ người tạo phiếu mới có quyền chỉnh sửa', 'error');
          return;
        }
      }

      const activePrefix = titlePrefix || 'Đề nghị thanh toán';
      let finalTitle = titleSuffix.trim() ? `${activePrefix} — ${titleSuffix.trim()}` : (form.title?.trim() || '');
      const validItems = ensureArray<ExpenseItemRow>(expenseItems).filter(it => it.content?.trim());
      if (!titleSuffix.trim() && (!finalTitle || finalTitle === activePrefix)) {
        if (validItems.length > 0) {
          const autoSuffix = validItems.map(it => it.content.trim()).join(', ');
          finalTitle = `${activePrefix} — ${autoSuffix}`;
        } else if (!isSaveDraft) {
          addToast('Vui lòng nhập chi tiết nội dung chi trong bảng kê hoặc tiêu đề', 'error');
          return;
        } else {
          finalTitle = `${activePrefix} — Bản nháp`;
        }
      }
      if (!isSaveDraft) {
        if (itemsGrandTotal <= 0) {
          addToast('Vui lòng nhập đầy đủ số tiền chi trong bảng chi tiết', 'error');
          return;
        }
        if (form.approver_id === null) {
          addToast('Vui lòng chọn người duyệt Cấp 1 (Trưởng nhóm / Quản lý)', 'error');
          return;
        }
        if (!isExecutiveUser && form.approver_id !== null && user?.id !== undefined && Number(form.approver_id) === Number(user.id)) {
          addToast('Nhân viên không thể tự phê duyệt phiếu chi của mình. Vui lòng chọn Quản lý / Trưởng nhóm phê duyệt', 'error');
          return;
        }
        if (form.approver_id_2 === null) {
          addToast(itemsGrandTotalVnd >= threshold ? 'Vui lòng chọn người duyệt Cấp 2 (Ban Giám đốc)' : 'Vui lòng chọn người duyệt Cấp 2 (Kế toán)', 'error');
          return;
        }
        if (itemsGrandTotalVnd >= threshold && form.approver_id_3 === null) {
          addToast(`Khoản chi từ ${threshold.toLocaleString('vi-VN')}đ trở lên bắt buộc phê duyệt 3 cấp: Leader -> Ban Giám đốc -> Kế toán!`, 'error');
          return;
        }
      }

      setSaving(true);
      saveAbortRef.current?.abort();
      const controller = new AbortController();
      saveAbortRef.current = controller;

      const safeEntities = ensureArray<any>(form.entities);
      let payloadEntities = safeEntities;
      if (safeEntities.length > 0) {
        const splitAmt = Math.round((itemsGrandTotal / safeEntities.length) * 100) / 100;
        payloadEntities = safeEntities.map((e: any) => ({ ...e, amount: splitAmt }));
      }

      let finalNotes = form.notes || '';
      finalNotes = finalNotes.replace(/\[Chi tiết các khoản chi\]:[^\n]*(\n[•\-*][^\n]*)*\s*/gi, '').trim();
      finalNotes = finalNotes.replace(/\[JSON_ITEMS\]:[^\n]*/gi, '').trim();
      finalNotes = finalNotes.replace(/\[Hồ sơ chi phí[^\]]*\]:[^\n]*/gi, '').trim();
      finalNotes = finalNotes.replace(/\[Phòng ban[^\]]*\]:[^\n]*/gi, '').trim();
      finalNotes = finalNotes.replace(/\[Thông tin chuyển khoản[^\]]*\]:[^\n]*/gi, '').trim();
      finalNotes = finalNotes.replace(/\[Thông tin nhận tiền[^\]]*\]:[^\n]*/gi, '').trim();
      finalNotes = finalNotes.replace(/\[Tài liệu đính kèm[^\]]*\]:[^\n]*(\n•[^\n]*)*\s*/gi, '').trim();

      const matchedCat = CATEGORIES.find(c => c.value === expenseCategory);
      finalNotes = `[Hồ sơ chi phí]: ${matchedCat?.label || expenseCategory}\n${finalNotes}`.trim();

      if (paymentMethod === 'Chuyển khoản' && paymentBankAccount) {
        finalNotes = `${finalNotes}\n[Thông tin chuyển khoản]: ${paymentBankName || 'Ngân hàng'} - STK: ${paymentBankAccount} - Chủ TK: ${paymentAccountName || paymentBeneficiaryName}${paymentBankBranch ? ` - Chi nhánh: ${paymentBankBranch}` : ''}`.trim();
      } else if (paymentMethod === 'Tiền mặt') {
        finalNotes = `${finalNotes}\n[Thông tin nhận tiền]: Tiền mặt - Người nhận: ${paymentBeneficiaryName || 'Người nhận'} - Quầy bàn giao: ${paymentDestination || 'Thủ quỹ'}`.trim();
      } else if (paymentMethod === 'Ví điện tử') {
        finalNotes = `${finalNotes}\n[Thông tin nhận tiền]: Ví điện tử (${paymentWalletType}) - SĐT: ${paymentWalletPhone || paymentPhone} - Chủ ví: ${paymentBeneficiaryName}`.trim();
      } else if (paymentMethod === 'Thẻ tín dụng') {
        finalNotes = `${finalNotes}\n[Thông tin nhận tiền]: Thẻ tín dụng - 4 số cuối: ${paymentCorporateCard || 'N/A'} - Người quẹt: ${paymentBeneficiaryName}`.trim();
      }

      if (ensureArray(expenseItems).length > 0) {
        const itemRowsStr = ensureArray<ExpenseItemRow>(expenseItems).map((it, idx) => {
          const q = Number(it.quantity);
          const safeQty = Number.isFinite(q) && q >= 0 ? q : 0;
          const sub = safeQty * (Number(it.price) || 0);
          return `• [${idx + 1}] ${it.content || 'Hạng mục chi'} - SL: ${safeQty} - Đơn giá: ${Number(it.price || 0).toLocaleString('vi-VN')} đ - VAT: ${it.vat || 0}% - Thành tiền: ${Number(sub).toLocaleString('vi-VN')} đ`;
        }).join('\n');
        finalNotes = `${finalNotes}\n\n[Chi tiết các khoản chi]:\n${itemRowsStr}`.trim();
      }

      // Deduplicate images
      const uniqueAttachments: ExpenseAttachmentItem[] = [];
      for (const img of ensureArray<ExpenseAttachmentItem | string>(images)) {
        if (!img) continue;
        const imgUrl = typeof img === 'string' ? img : img.url;
        const imgName = typeof img === 'string' ? (getFileNameFromUrl(img) || 'Tài liệu') : (img.name || getFileNameFromUrl(img.url) || 'Tài liệu');
        const norm = normalizeFileUrl(imgUrl);
        const already = uniqueAttachments.some(u => normalizeFileUrl(u.url) === norm || (u.name && u.name === imgName));
        if (!already) {
          uniqueAttachments.push({
            url: imgUrl,
            name: imgName,
            size: typeof img === 'object' ? img.size : undefined,
            type: typeof img === 'object' ? img.type : undefined
          });
        }
      }

      if (uniqueAttachments.length > 0) {
        const baseUrl = (import.meta.env.VITE_API_URL || '/backend').replace(/\/+$/, '');
        const attsStr = uniqueAttachments.map(att => {
          const normPath = normalizeFileUrl(att.url);
          const fileName = att.name || getFileNameFromUrl(att.url) || 'Tài liệu';
          return `• ${fileName} (${baseUrl}/${normPath})`;
        }).join('\n');
        finalNotes = `${finalNotes}\n\n[Tài liệu đính kèm (${uniqueAttachments.length} tệp)]:\n${attsStr}`.trim();
      }

      const statusVal = isSaveDraft ? 'draft' : (isAutoApprove ? 'approved' : 'pending');

      const paymentMeta = {
        payment_target: paymentTarget,
        payment_method: paymentMethod,
        wallet_type: paymentWalletType,
        wallet_phone: paymentWalletPhone,
        corporate_card: paymentCorporateCard,
        gov_agency: paymentGovAgencyType,
        gov_decision: paymentGovDecisionNumber,
        destination: paymentDestination,
        employee_id: paymentEmployeeId || null,
        supplier_id: paymentSupplierId || null,
        lecturer_id: paymentLecturerId || null,
        contact_id: paymentContactId || null,
        phone: paymentPhone || '',
        tax_code: paymentTaxCode || '',
        bank_branch: paymentBankBranch || '',
      };

      const payload = {
        ...form,
        title: finalTitle,
        vendor_name: paymentBeneficiaryName || form.vendor_name || '',
        bank_name: paymentBankName,
        bank_account_number: paymentBankAccount,
        bank_account_name: paymentAccountName,
        request_bank_transfer: paymentMethod === 'Chuyển khoản',
        category: matchedCat?.label || 'Vận hành',
        currency: currencyType,
        amount: Number(itemsGrandTotal),
        vat_amount: Number(itemsTotalVat),
        has_vat_invoice: invoiceType.startsWith('vat_'),
        is_vat_inclusive: true,
        image_url: uniqueAttachments.length > 0 ? normalizeFileUrl(uniqueAttachments[0].url) : null,
        notes: finalNotes,
        items: expenseItems,
        entities: payloadEntities,
        related_user_ids: ensureArray<number>(form.related_user_ids),
        payment_meta: paymentMeta,
      };

      if (isEditMode) {
        const { created_by, ...updatePayload } = payload;
        await api.put(`/expenses/${editItem.id}`, {
          ...updatePayload,
          status: statusVal
        }, { signal: controller.signal });
        addToast(
          isSaveDraft
            ? 'Đã lưu bản nháp đề xuất!'
            : (editItem?.status === 'draft' || editItem?.status === 'rejected')
              ? 'Đã gửi phê duyệt đề xuất thành công!'
              : 'Đã cập nhật đề xuất thanh toán thành công!',
          'success'
        );
        if (!isSaveDraft) {
          try {
            localStorage.removeItem(EXPENSE_DRAFT_KEY);
          } catch {}
        }
      } else {
        await api.post('/expenses', {
          ...payload,
          status: statusVal
        }, { signal: controller.signal });
        addToast(isSaveDraft ? 'Đã lưu bản nháp đề xuất!' : 'Đã tạo đề xuất thanh toán thành công!', 'success');
        try {
          localStorage.removeItem(EXPENSE_DRAFT_KEY);
        } catch {}
      }

      onSaveSuccess();
      onClose();
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') {
        addToast(err?.response?.data?.message || err?.message || 'Lỗi khi lưu đề xuất', 'error');
      }
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  return (
    createPortal(<AnimatePresence>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: baseZIndex }}>
          <motion.div
            className="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionSec, ease: [0.25, 0.1, 0.25, 1] as any }}
            onClick={handleRequestClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: baseZIndex,
              '--drawer-backdrop-z': baseZIndex,
              background: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              willChange: 'opacity',
              transform: 'translate3d(0, 0, 0)'
            } as any}
          />

          <motion.div
            className="drawer-sheet drawer-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: motionSec, ease: [0.25, 0.1, 0.25, 1] as any }}
            style={{
              position: 'fixed',
              left: isMobile ? 0 : 'var(--sidebar-width, 220px)',
              right: 0,
              top: 0,
              bottom: 0,
              width: isMobile ? '100vw' : 'auto',
              maxWidth: 'none',
              height: isMobile ? '100dvh' : '100vh',
              background: 'var(--color-surface)',
              boxShadow: isMobile ? 'none' : '-10px 0 30px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: panelZIndex, ...({ '--drawer-panel-z': panelZIndex } as any),
              overflow: 'hidden',
              willChange: 'transform, opacity',
              transform: 'translate3d(0, 0, 0)',
              contain: 'layout style'
            }}
          >
            {/* Drawer Header */}
            <div style={{
              padding: isMobile ? '0.75rem 1rem' : '1rem 1.75rem',
              borderBottom: '1px solid var(--color-border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--color-surface)',
              flexShrink: 0,
              gap: '1rem',
              flexWrap: isMobile ? 'wrap' : 'nowrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                <button
                  type="button"
                  onClick={handleRequestClose}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    background: 'var(--color-bg-secondary)',
                    color: 'var(--color-text)',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s ease'
                  }}
                  title="Quay lại"
                >
                  <ChevronLeft size={22} />
                </button>

                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontWeight: 800, fontSize: '1.15rem', margin: 0 }}>
                    {isEditMode
                      ? 'Cập nhật đề xuất thanh toán (PO)'
                      : isCloneMode
                        ? 'Nhân bản đề xuất thanh toán (PO)'
                        : 'Tạo đề xuất thanh toán (PO)'}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--color-text-light)', marginTop: 2, marginBottom: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '560px' }} title={form.title || editItem?.title || undefined}>
                    {form.title || editItem?.title || 'Biểu mẫu quy trình đề xuất thanh toán & giải ngân Purchase Order chuẩn hóa.'}
                  </p>
                </div>
              </div>

              {/* Action Buttons in top right corner */}
              <div style={{
                display: 'flex',
                gap: '0.6rem',
                alignItems: 'center',
                justifyContent: isMobile ? 'space-between' : 'flex-end',
                width: isMobile ? '100%' : 'auto',
                flexWrap: isMobile ? 'wrap' : 'nowrap'
              }}>
                {(!isEditMode || editItem?.status === 'draft') && (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => isEditMode ? handleSave(true) : handleExplicitSaveDraft()}
                    disabled={saving}
                    style={{
                      height: '34px',
                      flex: isMobile ? 1 : 'none',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      borderRadius: '10px'
                    }}
                    title="Lưu bản nháp để tiếp tục hoàn thiện sau"
                  >
                    <FileText size={14} style={{ flexShrink: 0 }} />
                    <span>Lưu nháp</span>
                  </button>
                )}
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  style={{
                    height: '34px',
                    flex: isMobile ? 2 : 'none',
                    minWidth: isMobile ? 'none' : '150px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    borderRadius: '10px',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  {saving ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
                  {saving
                    ? 'Đang lưu...'
                    : isEditMode
                      ? ((editItem?.status === 'draft' || editItem?.status === 'rejected') ? 'Gửi duyệt' : 'Cập nhật')
                      : (isAutoApprove ? 'Tạo & Duyệt' : 'Gửi phê duyệt')}
                </button>
              </div>
            </div>

            {/* Drawer Body: 2 Columns Matching Approvals.tsx */}
            <div className="modal-body custom-scrollbar" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1.5rem', padding: '1.5rem', flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 65px)', WebkitOverflowScrolling: 'touch' }}>
              
              {/* Left Column (Main Form - 7/10) */}
              <div style={{ flex: isMobile ? 'none' : 7, display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0, width: '100%', paddingBottom: '140px' }}>
                
                {/* Draft Notification Banner */}
                {existingDraft && !editItem && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '12px',
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.28)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', color: 'var(--color-text)' }}>
                      <Bookmark size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                      <span>
                        Có 1 bản nháp đã lưu lúc <strong>{existingDraft.savedAt ? new Date(existingDraft.savedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''}</strong>
                        {existingDraft.form?.title ? ` - "${existingDraft.form.title}"` : ''}.
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleRestoreDraft}
                        style={{
                          padding: '5px 12px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: 'var(--color-primary)',
                          color: '#fff',
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          boxShadow: '0 2px 6px rgba(163, 20, 34, 0.2)'
                        }}
                      >
                        Khôi phục bản nháp
                      </button>
                      <button
                        type="button"
                        onClick={handleClearDraft}
                        style={{
                          padding: '5px 10px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          background: 'transparent',
                          color: 'var(--color-text-muted)',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          cursor: 'pointer'
                        }}
                      >
                        Xóa nháp
                      </button>
                    </div>
                  </div>
                )}

                {/* CARD 1: THÔNG TIN CHI TIẾT ĐỀ XUẤT & TIÊU ĐỀ */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
                  
                  {/* Workflow Banner Highlight */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)'
                  }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <FileSignature size={18} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.875rem' }}>Đề nghị thanh toán (PO)</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Đề xuất thanh toán nhà cung cấp, chi phí vận hành, đối tác & cán bộ nhân viên.</span>
                    </div>
                  </div>

                  {/* Tiêu đề quy trình / Nội dung chi (Fix prefix + editable suffix) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Tiêu đề đề xuất / Nội dung chi</span>
                        <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'stretch',
                      borderRadius: '10px',
                      border: '1.5px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      overflow: 'hidden',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                    }}>
                      {/* Fixed Prefix Box */}
                      <div style={{
                        padding: '0 14px',
                        background: 'var(--color-bg-secondary, #f1f5f9)',
                        borderRight: '1.5px solid var(--color-border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: 'var(--color-text)',
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                        flexShrink: 0
                      }}>
                        <span style={{ color: '#10b981', fontSize: '0.9rem' }}>●</span>
                        <span>{titlePrefix || 'Đề nghị thanh toán'}</span>
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>—</span>
                      </div>

                      {/* Suffix Input */}
                      <input
                        type="text"
                        className="form-input"
                        value={titleSuffix}
                        onChange={e => handleSuffixChange(e.target.value)}
                        placeholder="Nhập nội dung chi cụ thể (VD: In ấn, thi công Lễ tốt nghiệp, Tiền điện nước tháng 9...) *"
                        style={{
                          flex: 1,
                          border: 'none',
                          borderRadius: 0,
                          height: '42px',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          background: 'transparent',
                          padding: '0 14px'
                        }}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* CARD 2: THÔNG TIN CHI TIẾT ĐỀ XUẤT & ĐỐI TƯỢNG THỤ HƯỞNG */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text)' }}>
                    <Receipt size={18} style={{ color: 'var(--color-primary)' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Thông tin chi tiết đề xuất (Hồ sơ chi phí & Đối tượng thụ hưởng)
                    </span>
                  </div>

                  {/* Tạm thời ẩn phân loại chi phí theo yêu cầu */}
                  {false && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                        Phân loại chi phí
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {CATEGORIES.map(c => {
                          const Icon = c.icon;
                          const isSelected = expenseCategory === c.value;
                          return (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => {
                                setExpenseCategory(c.value);
                                setForm((prev: any) => ({ ...prev, category: c.label }));
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '5px 12px',
                                borderRadius: 'var(--radius-full)',
                                border: `1.5px solid ${isSelected ? c.color : 'var(--color-border)'}`,
                                background: isSelected ? `${c.color}18` : 'transparent',
                                color: isSelected ? c.color : 'var(--color-text-light)',
                                fontSize: '0.78rem',
                                fontWeight: isSelected ? 750 : 600,
                                cursor: 'pointer',
                                transition: 'all 0.18s ease'
                              }}
                            >
                              <Icon size={13} />
                              <span>{c.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Loại chứng từ hóa đơn */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      Loại chứng từ hóa đơn
                    </label>
                    <CustomSelect
                      value={invoiceType}
                      onChange={val => {
                        setInvoiceType(val as any);
                        const vatMatch = String(val).match(/^vat_(\d+)$/);
                        const vatNum = vatMatch ? Number(vatMatch[1]) : null;
                        if (vatNum !== null) {
                          setExpenseItems(prev => prev.map(it => ({ ...it, vat: vatNum })));
                        }
                      }}
                      options={[
                        ...[...vatRates].sort((a, b) => b - a).map(rate => ({
                          value: `vat_${rate}`,
                          label: rate === 0 ? 'Hóa đơn điện tử VAT 0% / Không chịu thuế' : `Hóa đơn điện tử VAT ${rate}%`,
                        })),
                        { value: 'retail', label: 'Hóa đơn bán lẻ / Biên lai thu tiền' },
                        { value: 'none', label: 'Không có hóa đơn (Giải trình nội bộ)' }
                      ]}
                      width="100%"
                    />
                  </div>

                  {/* PAYMENT TARGET, METHOD & CURRENCY ROW */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1.2fr 0.8fr', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                        Đối tượng thụ hưởng <span style={{ color: '#BD1D2D' }}>*</span>
                      </label>
                      <CustomSelect
                        value={paymentTarget}
                        onChange={val => {
                          setPaymentTarget(val);
                          if (val === 'Nội bộ') {
                            const currentEmp = ensureArray(users).find((u: any) => Number(u.id) === Number(user?.id)) || user;
                            if (currentEmp) {
                              setPaymentEmployeeId(String(currentEmp.id));
                              setPaymentBeneficiaryName(currentEmp.full_name || currentEmp.name || '');
                              if (currentEmp.bank_name) setPaymentBankName(currentEmp.bank_name);
                              if (currentEmp.bank_account) setPaymentBankAccount(currentEmp.bank_account);
                              const accName = currentEmp.full_name || currentEmp.name || '';
                              if (accName) setPaymentAccountName(accName.toUpperCase());
                              if (currentEmp.phone) setPaymentPhone(currentEmp.phone);
                            }
                          } else {
                            setPaymentEmployeeId('');
                            setPaymentSupplierId('');
                            setPaymentLecturerId('');
                            setPaymentContactId('');
                            setPaymentBeneficiaryName('');
                            setPaymentBankName('');
                            setPaymentBankAccount('');
                            setPaymentAccountName('');
                            setPaymentPhone('');
                            setPaymentTaxCode('');
                          }
                        }}
                        options={[
                          { value: 'Nội bộ', label: 'Nội bộ (Cán bộ nhân viên)' },
                          { value: 'Giảng viên', label: 'Giảng viên / Chuyên gia' },
                          { value: 'Đối tác', label: 'Đối tác / Vendor / Nhà cung cấp' },
                          { value: 'Khách hàng', label: 'Khách hàng / Học viên CRM' },
                          { value: 'Cộng tác viên', label: 'Cộng tác viên (CTV Tuyển sinh / Marketing)' },
                          { value: 'Cơ quan Nhà nước', label: 'Cơ quan Nhà nước / Thuế / BHXH / Kho bạc' },
                          { value: 'Cá nhân khác', label: 'Cá nhân khác / Khách vãng lai' }
                        ]}
                        width="100%"
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                        Hình thức nhận tiền
                      </label>
                      <CustomSelect
                        value={paymentMethod}
                        onChange={val => setPaymentMethod(val)}
                        options={[
                          { value: 'Chuyển khoản', label: 'Chuyển khoản (Ngân hàng)' },
                          { value: 'Tiền mặt', label: 'Tiền mặt (Thủ quỹ bàn giao)' },
                          { value: 'Ví điện tử', label: 'Ví điện tử (MoMo / ZaloPay / Viettel Money)' },
                          { value: 'Thẻ tín dụng', label: 'Thẻ tín dụng doanh nghiệp (Corporate Card)' }
                        ]}
                        width="100%"
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                        Loại tiền tệ
                      </label>
                      <CustomSelect
                        value={currencyType}
                        onChange={val => {
                          setCurrencyType(val);
                          setForm((prev: any) => ({ ...prev, currency: val }));
                        }}
                        options={(ensureArray<string>(fxConfig?.supported).length > 0
                          ? ensureArray<string>(fxConfig.supported)
                          : ['VND', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'AUD', 'CAD', 'CHF']
                        ).map(code => {
                          const c = String(code).toUpperCase();
                          const labelMap: Record<string, string> = {
                            VND: 'VND (₫)', USD: 'USD ($)', EUR: 'EUR (€)', EURO: 'EUR (€)',
                            GBP: 'GBP (£)', JPY: 'JPY (¥)', SGD: 'SGD (S$)', AUD: 'AUD (A$)',
                            CAD: 'CAD (C$)', CHF: 'CHF (Fr)',
                          };
                          return { value: c, label: labelMap[c] || c };
                        })}
                        width="100%"
                      />
                    </div>
                  </div>

                  {/* BENEFICIARY DYNAMIC SELECTORS */}
                  {paymentTarget === 'Nội bộ' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                          Nhân viên thụ hưởng <span style={{ color: 'var(--color-danger)' }}>*</span>
                        </label>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                          (Tự động trích xuất STK ngân hàng từ hồ sơ nhân sự)
                        </span>
                      </div>
                      <CustomSelect
                        options={employeeSelectOptions}
                        value={paymentEmployeeId}
                        onChange={val => {
                          const empId = String(val);
                          setPaymentEmployeeId(empId);
                          const emp = users.find((u: any) => String(u.id) === empId);
                          if (emp) {
                            const empName = emp.full_name || emp.name || emp.username || '';
                            setPaymentBeneficiaryName(empName);
                            if (emp.bank_name) setPaymentBankName(emp.bank_name);
                            if (emp.bank_account) setPaymentBankAccount(emp.bank_account);
                            if (empName) setPaymentAccountName(empName.toUpperCase());
                            if (emp.phone) setPaymentPhone(emp.phone);
                            if (emp.bank_account) {
                              addToast(`Đã trích xuất STK ngân hàng của ${empName}`, 'success');
                            } else {
                              addToast(`Nhân viên ${empName} chưa lưu STK trong hồ sơ. Vui lòng nhập STK bên dưới.`, 'info');
                            }
                          }
                        }}
                        placeholder="-- Chọn nhân viên nhận thanh toán --"
                        searchable
                        showAvatars
                        width="100%"
                      />
                      {paymentEmployeeId && (() => {
                        const emp = users.find((u: any) => String(u.id) === paymentEmployeeId);
                        if (!emp) return null;
                        return (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: '10px',
                            background: emp.bank_account ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                            border: `1px solid ${emp.bank_account ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                            fontSize: '0.78rem'
                          }}>
                            <span style={{ color: emp.bank_account ? '#059669' : '#d97706', fontWeight: 650 }}>
                              {emp.bank_account 
                                ? `✓ Số tài khoản đồng bộ ${getSystemTitle()}: ${emp.bank_name || 'Ngân hàng'} - ${emp.bank_account} (Chủ TK: ${(emp.full_name || emp.name || '').toUpperCase()})` 
                                : '⚠️ Nhân viên chưa cập nhật STK trong hồ sơ cá nhân. Vui lòng nhập STK bên dưới.'}
                            </span>
                            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>
                              {emp.role || 'Nhân viên'}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {paymentTarget === 'Giảng viên' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                            Chọn giảng viên / chuyên gia trong hệ thống
                          </label>
                          <CustomSelect
                            options={[
                              { value: '', label: '-- Chọn giảng viên đã có (hoặc nhập mới bên cạnh) --' },
                              ...lecturerOptions
                            ]}
                            value={paymentLecturerId}
                            onChange={val => {
                              const lecId = String(val);
                              setPaymentLecturerId(lecId);
                              const lec = lecturerOptions.find(l => l.value === lecId);
                              if (lec) {
                                setPaymentBeneficiaryName(lec.label);
                                if (lec.bank_name) setPaymentBankName(lec.bank_name);
                                if (lec.bank_account) setPaymentBankAccount(lec.bank_account);
                                if (lec.bank_account_name || lec.label) setPaymentAccountName((lec.bank_account_name || lec.label).toUpperCase());
                                if (lec.phone) setPaymentPhone(lec.phone);
                                if (lec.bank_account) {
                                  addToast(`Đã trích xuất STK của giảng viên: ${lec.label}`, 'success');
                                } else {
                                  addToast(`Giảng viên ${lec.label} chưa lưu STK. Vui lòng nhập thông tin bên dưới.`, 'info');
                                }
                              }
                            }}
                            placeholder="-- Tìm kiếm giảng viên / chuyên gia --"
                            searchable
                            width="100%"
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                            Họ và tên giảng viên <span style={{ color: 'var(--color-danger)' }}>*</span>
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentBeneficiaryName}
                            onChange={e => {
                              setPaymentBeneficiaryName(e.target.value);
                              if (!paymentAccountName) setPaymentAccountName(e.target.value.toUpperCase());
                            }}
                            placeholder="Họ và tên giảng viên nhận thù lao..."
                            style={{ height: '36px', fontSize: '0.8rem' }}
                          />
                        </div>
                      </div>
                      {paymentBeneficiaryName && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '10px',
                          background: paymentBankAccount ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                          border: `1px solid ${paymentBankAccount ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                          fontSize: '0.78rem'
                        }}>
                          <span style={{ color: paymentBankAccount ? '#059669' : '#d97706', fontWeight: 650 }}>
                            {paymentBankAccount 
                              ? `✓ STK Giảng viên: ${paymentBankName || 'Ngân hàng'} - ${paymentBankAccount} (Chủ TK: ${paymentAccountName})` 
                              : 'ℹ️ Giảng viên chưa có STK trong hệ thống. Vui lòng nhập số tài khoản ở bên dưới.'}
                          </span>
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>
                            Giảng viên / Chuyên gia
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {paymentTarget === 'Đối tác' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1.2fr 1fr', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                            Chọn đối tác / nhà cung cấp đã lưu
                          </label>
                          <CustomSelect
                            options={[
                              { value: '', label: '-- Chọn đối tác trong danh bạ (hoặc nhập tay) --' },
                              ...partnerOptions
                            ]}
                            value={paymentSupplierId}
                            onChange={val => {
                              const sId = String(val);
                              setPaymentSupplierId(sId);
                              const sup = partnerOptions.find(s => s.value === sId);
                              if (sup) {
                                setPaymentBeneficiaryName(sup.label);
                                if (sup.bank_name) setPaymentBankName(sup.bank_name);
                                if (sup.bank_account) setPaymentBankAccount(sup.bank_account);
                                if (sup.bank_account_name || sup.label) setPaymentAccountName((sup.bank_account_name || sup.label).toUpperCase());
                                if (sup.tax_code) setPaymentTaxCode(sup.tax_code);
                                if (sup.phone) setPaymentPhone(sup.phone);
                                if (sup.bank_account) {
                                  addToast(`Đã trích xuất STK của đối tác: ${sup.label}`, 'success');
                                } else {
                                  addToast(`Đối tác ${sup.label} chưa lưu STK. Vui lòng điền thông tin bên dưới.`, 'info');
                                }
                              }
                            }}
                            placeholder="-- Tìm đối tác / nhà cung cấp --"
                            searchable
                            width="100%"
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                            Tên đơn vị thụ hưởng <span style={{ color: 'var(--color-danger)' }}>*</span>
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentBeneficiaryName}
                            onChange={e => {
                              setPaymentBeneficiaryName(e.target.value);
                              if (!paymentAccountName) setPaymentAccountName(e.target.value.toUpperCase());
                            }}
                            placeholder="Tên công ty / nhà cung cấp nhận tiền..."
                            style={{ height: '36px', fontSize: '0.8rem' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                            Mã số thuế (MST)
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentTaxCode}
                            onChange={e => setPaymentTaxCode(e.target.value)}
                            placeholder="Mã số thuế doanh nghiệp..."
                            style={{ height: '36px', fontSize: '0.8rem' }}
                          />
                        </div>
                      </div>
                      {paymentBeneficiaryName && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '10px',
                          background: paymentBankAccount ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                          border: `1px solid ${paymentBankAccount ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                          fontSize: '0.78rem'
                        }}>
                          <span style={{ color: paymentBankAccount ? '#059669' : '#d97706', fontWeight: 650 }}>
                            {paymentBankAccount 
                              ? `✓ STK Đối tác: ${paymentBankName || 'Ngân hàng'} - ${paymentBankAccount} (Chủ TK: ${paymentAccountName})` 
                              : 'ℹ️ Đối tác chưa lưu STK trong danh bạ. Vui lòng nhập số tài khoản ở ô bên dưới.'}
                          </span>
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>
                            {paymentTaxCode ? `MST: ${paymentTaxCode}` : 'Đối tác / Vendor'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {paymentTarget === 'Khách hàng' && (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1.2fr 1fr', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                          Chọn khách hàng / học viên (CRM)
                        </label>
                        <CustomSelect
                          options={[
                            { value: '', label: '-- Chọn khách hàng trong CRM (hoặc nhập bên cạnh) --' },
                            ...contactOptions
                          ]}
                          value={paymentContactId}
                          onChange={val => {
                            const cId = String(val || '');
                            setPaymentContactId(cId);
                            const con = contactOptions.find((c: any) => c.value === cId);
                            if (con) {
                              setPaymentBeneficiaryName(con.label);
                              if (con.bank_name) setPaymentBankName(con.bank_name);
                              if (con.bank_account) setPaymentBankAccount(con.bank_account);
                              if (con.bank_account_name || con.label) setPaymentAccountName((con.bank_account_name || con.label).toUpperCase());
                              if (con.phone) setPaymentPhone(con.phone);
                              setForm((prev: any) => {
                                const curEntities = Array.isArray(prev.entities) ? prev.entities : [];
                                const numId = Number(cId);
                                if (numId > 0 && !curEntities.some((e: any) => Number(e.entity_id) === numId && e.entity_type === 'contact')) {
                                  return {
                                    ...prev,
                                    entities: [...curEntities, { entity_type: 'contact', entity_id: numId, name: con.label, avatar_url: con.avatar }]
                                  };
                                }
                                return prev;
                              });
                              if (con.bank_account) {
                                addToast(`Đã trích xuất STK khách hàng: ${con.label}`, 'success');
                              }
                            }
                          }}
                          placeholder="-- Tìm khách hàng / học viên --"
                          searchable
                          width="100%"
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                          Tên khách hàng thụ hưởng <span style={{ color: 'var(--color-danger)' }}>*</span>
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={paymentBeneficiaryName}
                          onChange={e => {
                            setPaymentBeneficiaryName(e.target.value);
                            if (!paymentAccountName) setPaymentAccountName(e.target.value.toUpperCase());
                          }}
                          placeholder="Họ và tên khách hàng hoặc mã hồ sơ..."
                          style={{ height: '36px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                          Số điện thoại liên hệ
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={paymentPhone}
                          onChange={e => setPaymentPhone(e.target.value)}
                          placeholder="Ví dụ: 0912345678..."
                          style={{ height: '36px', fontSize: '0.8rem' }}
                        />
                      </div>
                    </div>
                  )}

                  {paymentTarget === 'Cộng tác viên' && (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                          Họ và tên Cộng tác viên <span style={{ color: 'var(--color-danger)' }}>*</span>
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={paymentBeneficiaryName}
                          onChange={e => {
                            setPaymentBeneficiaryName(e.target.value);
                            if (!paymentAccountName) setPaymentAccountName(e.target.value.toUpperCase());
                          }}
                          placeholder="Họ và tên CTV tuyển sinh / Marketing..."
                          style={{ height: '36px', fontSize: '0.8rem' }}
                          required
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                          Số điện thoại / CCCD của CTV
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={paymentPhone}
                          onChange={e => setPaymentPhone(e.target.value)}
                          placeholder="Số điện thoại hoặc số CCCD..."
                          style={{ height: '36px', fontSize: '0.8rem' }}
                        />
                      </div>
                    </div>
                  )}

                  {paymentTarget === 'Cơ quan Nhà nước' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.4fr 1fr', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                            Loại cơ quan / Ngân sách
                          </label>
                          <CustomSelect
                            value={paymentGovAgencyType}
                            onChange={val => setPaymentGovAgencyType(val as any)}
                            options={[
                              { value: 'tax', label: 'Cơ quan Thuế (GTGT, TNDN, Môn bài)' },
                              { value: 'social_insurance', label: 'Cơ quan Bảo hiểm Xã hội (BHXH)' },
                              { value: 'treasury', label: 'Kho bạc Nhà nước (Ngân sách / Lệ phí)' },
                              { value: 'other', label: 'Sở Ban ngành / Cơ quan hành chính' }
                            ]}
                            width="100%"
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                            Tên cơ quan thụ hưởng <span style={{ color: 'var(--color-danger)' }}>*</span>
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentBeneficiaryName}
                            onChange={e => {
                              setPaymentBeneficiaryName(e.target.value);
                              if (!paymentAccountName) setPaymentAccountName(e.target.value.toUpperCase());
                            }}
                            placeholder="VD: Chi cục Thuế Quận 1, Kho bạc Nhà nước..."
                            style={{ height: '36px', fontSize: '0.8rem' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                            Số QĐ / Mã chương tiểu mục
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentGovDecisionNumber}
                            onChange={e => setPaymentGovDecisionNumber(e.target.value)}
                            placeholder="Số thông báo nộp thuế..."
                            style={{ height: '36px', fontSize: '0.8rem' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {paymentTarget === 'Cá nhân khác' && (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                          Họ và tên người nhận <span style={{ color: 'var(--color-danger)' }}>*</span>
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={paymentBeneficiaryName}
                          onChange={e => {
                            setPaymentBeneficiaryName(e.target.value);
                            if (!paymentAccountName) setPaymentAccountName(e.target.value.toUpperCase());
                          }}
                          placeholder="Họ và tên người nhận thanh toán vãng lai..."
                          style={{ height: '36px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                          Số điện thoại / CCCD
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={paymentPhone}
                          onChange={e => setPaymentPhone(e.target.value)}
                          placeholder="Số điện thoại hoặc CCCD/CMND..."
                          style={{ height: '36px', fontSize: '0.8rem' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* BANK TRANSFER DETAILS (When paymentMethod === 'Chuyển khoản') */}
                  {paymentMethod === 'Chuyển khoản' && (
                    <div style={{
                      background: 'var(--color-bg-secondary, #f8fafc)',
                      padding: '1.25rem',
                      borderRadius: '14px',
                      border: '1px solid var(--color-border-light)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CreditCard size={17} style={{ color: 'var(--color-primary)' }} />
                          <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text)', letterSpacing: '0.03em' }}>
                            Thông tin tài khoản ngân hàng nhận chuyển khoản
                          </span>
                        </div>

                        {user && (user.bank_name || user.bank_account) && (
                          <button
                            type="button"
                            onClick={() => {
                              const myName = (user.full_name || user.name || '').toUpperCase();
                              if (user.bank_name) setPaymentBankName(user.bank_name);
                              if (user.bank_account) setPaymentBankAccount(user.bank_account);
                              if (myName) setPaymentAccountName(myName);
                              addToast(`Đã điền thông tin tài khoản của ${user.full_name || user.name}`, 'success');
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              background: 'rgba(59, 130, 246, 0.08)',
                              border: '1px solid rgba(59, 130, 246, 0.2)',
                              color: '#2563eb',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            <Zap size={13} />
                            <span>⚡ Dùng STK của tôi</span>
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1.2fr 1.4fr 1fr', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            Tên ngân hàng <span style={{ color: 'var(--color-danger)' }}>*</span>
                          </label>
                          <BankSelect
                            value={paymentBankName}
                            onChange={val => setPaymentBankName(val)}
                            placeholder="Chọn ngân hàng..."
                            size="sm"
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            Số tài khoản (STK) <span style={{ color: 'var(--color-danger)' }}>*</span>
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentBankAccount}
                            onChange={e => setPaymentBankAccount(e.target.value.replace(/\s+/g, ''))}
                            placeholder="Số tài khoản"
                            style={{ height: '36px', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.5px' }}
                            required
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            Tên chủ tài khoản <span style={{ color: 'var(--color-danger)' }}>*</span>
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentAccountName}
                            onChange={e => setPaymentAccountName(e.target.value.toUpperCase())}
                            placeholder="TÊN CHỦ TÀI KHOẢN (IN HOA)..."
                            style={{ height: '36px', fontSize: '0.8rem', fontWeight: 700 }}
                            required
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            Chi nhánh
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentBankBranch}
                            onChange={e => setPaymentBankBranch(e.target.value)}
                            placeholder="VD: CN Hội sở, Ba Đình..."
                            style={{ height: '36px', fontSize: '0.8rem' }}
                          />
                        </div>
                      </div>

                      {/* Bank Card Preview & VietQR Card */}
                      {paymentBankAccount && paymentBankName && (() => {
                        const vietQrUrl = getVietQrUrl({
                          bankBinOrCode: paymentBankName,
                          accountNumber: paymentBankAccount,
                          accountName: paymentAccountName,
                          amount: itemsGrandTotal > 0 ? itemsGrandTotal : undefined,
                          memo: normalizeVietQrText(form.title || vietQrConfig.memo_prefix || 'Thanh toan PO'),
                          template: (vietQrConfig.template || 'compact2') as 'compact2' | 'compact' | 'qr_only' | 'print'
                        });

                        return (
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 155px',
                            gap: '12px',
                            marginTop: '6px',
                            alignItems: 'stretch'
                          }}>
                            {/* Executive Brand Light Bank Card */}
                            <div style={{
                              background: '#ffffff',
                              border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                              borderRadius: '14px',
                              padding: '12px 14px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '10px',
                              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                              position: 'relative',
                              overflow: 'hidden'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                                  <div style={{
                                    width: '26px',
                                    height: '26px',
                                    borderRadius: '6px',
                                    background: 'var(--color-bg-subtle, #f8fafc)',
                                    border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}>
                                    {findBank(paymentBankName)?.logo ? (
                                      <img
                                        src={findBank(paymentBankName)!.logo}
                                        alt=""
                                        style={{ width: '18px', height: '18px', objectFit: 'contain' }}
                                      />
                                    ) : (
                                      <Landmark size={14} style={{ color: 'var(--color-primary, #dc2626)' }} />
                                    )}
                                  </div>
                                  <span style={{ fontWeight: 750, fontSize: '0.8rem', letterSpacing: '0.01em', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={paymentBankName}>
                                    {paymentBankName}
                                  </span>
                                </div>
                                <span style={{
                                  fontSize: '0.6rem',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                  padding: '2px 6px',
                                  borderRadius: '5px',
                                  background: 'rgba(220, 38, 38, 0.06)',
                                  color: '#dc2626',
                                  border: '1px solid rgba(220, 38, 38, 0.15)',
                                  flexShrink: 0
                                }}>
                                  Napas 247
                                </span>
                              </div>

                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#f8fafc',
                                padding: '7px 10px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                              }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <span style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                                    Số tài khoản (STK)
                                  </span>
                                  <span style={{
                                    fontSize: '1.05rem',
                                    fontWeight: 800,
                                    fontFamily: 'monospace',
                                    letterSpacing: '0.06em',
                                    color: '#dc2626'
                                  }}>
                                    {paymentBankAccount}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(paymentBankAccount);
                                    addToast('Đã sao chép số tài khoản!', 'success');
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '5px 9px',
                                    borderRadius: '6px',
                                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                    color: '#ffffff',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    fontSize: '0.7rem',
                                    boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
                                    flexShrink: 0
                                  }}
                                >
                                  <Copy size={12} />
                                  <span>Sao chép</span>
                                </button>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '4px' }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <span style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                                    Chủ tài khoản
                                  </span>
                                  <div style={{ fontSize: '0.78rem', fontWeight: 750, letterSpacing: '0.01em', color: '#0f172a', marginTop: '1px', textTransform: 'uppercase', lineHeight: 1.25 }}>
                                    {paymentAccountName || paymentBeneficiaryName || 'CHƯA ĐIỀN'}
                                  </div>
                                </div>
                                {paymentBankBranch && (
                                  <div style={{ fontSize: '0.65rem', color: '#64748b', textAlign: 'right', flexShrink: 0 }}>
                                    CN: <span style={{ color: '#1e293b', fontWeight: 600 }}>{paymentBankBranch}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* VietQR Card: Click to zoom in */}
                            <div
                              onClick={() => vietQrUrl && setPreviewQrModalUrl(vietQrUrl)}
                              title={vietQrUrl ? 'Bấm để phóng to mã QR' : undefined}
                              style={{
                                background: '#ffffff',
                                border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                                borderRadius: '14px',
                                padding: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                                cursor: vietQrUrl ? 'pointer' : 'default',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {vietQrUrl ? (
                                <img
                                  src={vietQrUrl}
                                  alt="Mã VietQR"
                                  style={{
                                    width: '100%',
                                    maxWidth: '140px',
                                    maxHeight: '140px',
                                    objectFit: 'contain'
                                  }}
                                />
                              ) : (
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Chưa có mã QR</span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* CASH DETAILS */}
                  {paymentMethod === 'Tiền mặt' && (
                    <div style={{
                      background: 'var(--color-bg-secondary, #f8fafc)',
                      padding: '1rem 1.25rem',
                      borderRadius: '14px',
                      border: '1px solid var(--color-border-light)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 750, fontSize: '0.8rem' }}>
                        <Receipt size={16} />
                        <span>Hình thức nhận: Tiền mặt (Bàn giao trực tiếp tại quầy / thủ quỹ)</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            Người nhận tiền mặt
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentBeneficiaryName}
                            onChange={e => setPaymentBeneficiaryName(e.target.value)}
                            placeholder="Họ và tên người nhận tiền..."
                            style={{ height: '36px', fontSize: '0.8rem' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            Địa điểm / Quầy bàn giao tiền
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentDestination}
                            onChange={e => setPaymentDestination(e.target.value)}
                            placeholder="Ví dụ: Quầy Thủ quỹ Hội sở / Phòng Kế toán..."
                            style={{ height: '36px', fontSize: '0.8rem' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* WALLET DETAILS */}
                  {paymentMethod === 'Ví điện tử' && (
                    <div style={{
                      background: 'var(--color-bg-secondary, #f8fafc)',
                      padding: '1rem 1.25rem',
                      borderRadius: '14px',
                      border: '1px solid var(--color-border-light)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a21caf', fontWeight: 750, fontSize: '0.8rem' }}>
                        <Wallet size={16} />
                        <span>Hình thức nhận: Ví điện tử di động</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr 1fr', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            Loại ví điện tử
                          </label>
                          <CustomSelect
                            value={paymentWalletType}
                            onChange={val => setPaymentWalletType(val as any)}
                            options={[
                              { value: 'momo', label: 'MoMo' },
                              { value: 'zalopay', label: 'ZaloPay' },
                              { value: 'viettel_money', label: 'Viettel Money' }
                            ]}
                            width="100%"
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            Số điện thoại liên kết ví
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentWalletPhone || paymentPhone}
                            onChange={e => setPaymentWalletPhone(e.target.value)}
                            placeholder="Nhập SĐT đăng ký ví..."
                            style={{ height: '36px', fontSize: '0.8rem' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            Tên chủ ví
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentBeneficiaryName}
                            onChange={e => setPaymentBeneficiaryName(e.target.value)}
                            placeholder="Họ và tên chủ ví..."
                            style={{ height: '36px', fontSize: '0.8rem' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CORPORATE CARD DETAILS */}
                  {paymentMethod === 'Thẻ tín dụng' && (
                    <div style={{
                      background: 'var(--color-bg-secondary, #f8fafc)',
                      padding: '1rem 1.25rem',
                      borderRadius: '14px',
                      border: '1px solid var(--color-border-light)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1d4ed8', fontWeight: 750, fontSize: '0.8rem' }}>
                        <CreditCard size={16} />
                        <span>Hình thức nhận: Thẻ tín dụng doanh nghiệp (Corporate Card)</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.5fr', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            4 số cuối thẻ tín dụng
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentCorporateCard}
                            onChange={e => setPaymentCorporateCard(e.target.value)}
                            placeholder="Ví dụ: 8899"
                            style={{ height: '36px', fontSize: '0.8rem' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                            Cán bộ phụ trách giữ thẻ / Quẹt thẻ
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            value={paymentBeneficiaryName}
                            onChange={e => setPaymentBeneficiaryName(e.target.value)}
                            placeholder="Họ và tên người quẹt thẻ..."
                            style={{ height: '36px', fontSize: '0.8rem' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ngày đề xuất chi & Thời hạn thanh toán */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                        Ngày đề xuất chi *
                      </label>
                      <VietnameseDateInput
                        value={form.date}
                        onChange={val => setForm({ ...form, date: val })}
                        inputStyle={{ height: '38px', borderRadius: '8px', fontSize: '0.85rem' }}
                        required
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                        Thời hạn thanh toán
                      </label>
                      <VietnameseDateInput
                        value={form.due_date || ''}
                        onChange={val => setForm({ ...form, due_date: val })}
                        placeholder="Chọn hạn thanh toán..."
                        inputStyle={{ height: '38px', borderRadius: '8px', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                </div>

                {/* CARD 3: BẢNG CHI TIẾT THANH TOÁN & MỤC ĐÍCH */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Bảng chi tiết thanh toán
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setExpenseItems([
                          ...expenseItems,
                          { id: Date.now(), content: '', quantity: 1, price: 0, vat: 10 }
                        ]);
                      }}
                      className="btn secondary"
                      style={{ height: '28px', padding: '0 10px', fontSize: '0.75rem', color: 'var(--color-primary)' }}
                    >
                      + Thêm dòng
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                    <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                          <th style={{ padding: '8px', width: '45px', minWidth: '45px', textAlign: 'center', fontWeight: 700 }}>STT</th>
                          <th style={{ padding: '8px', minWidth: '200px', fontWeight: 700 }}>Nội dung chi</th>
                          <th style={{ padding: '8px', width: '95px', minWidth: '95px', textAlign: 'center', fontWeight: 700 }}>SL</th>
                          <th style={{ padding: '8px', width: '160px', minWidth: '160px', fontWeight: 700 }}>Đơn giá ({currencyType})</th>
                          <th style={{ padding: '8px', width: '120px', minWidth: '120px', fontWeight: 700 }}>Thành tiền</th>
                          <th style={{ padding: '8px', width: '95px', minWidth: '95px', fontWeight: 700 }}>VAT (%)</th>
                          <th style={{ padding: '8px', width: '36px', minWidth: '36px' }} />
                        </tr>
                      </thead>
                      <tbody>
                        {ensureArray<ExpenseItemRow>(expenseItems).map((item, idx) => {
                          const safeQty = Math.max(0, Number(item.quantity) || 0);
                          const safePrice = Math.max(0, Number(item.price) || 0);
                          const lineTotal = safeQty * safePrice;
                          return (
                            <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <td style={{ padding: '8px', textAlign: 'center', width: '45px', minWidth: '45px', verticalAlign: 'top', lineHeight: '28px' }}>{idx + 1}</td>
                              <td style={{ padding: '8px', minWidth: '200px', verticalAlign: 'top' }}>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={item.content}
                                  onChange={e => {
                                    const nextContent = e.target.value;
                                    setExpenseItems(prev => prev.map((it, i) => (i === idx ? { ...it, content: nextContent } : it)));
                                  }}
                                  placeholder="Nội dung chi tiêu"
                                  style={{ padding: '4px 8px', height: '28px', fontSize: '0.8rem', width: '100%' }}
                                  required
                                />
                              </td>
                              <td style={{ padding: '8px', width: '95px', minWidth: '95px', verticalAlign: 'top' }}>
                                <input
                                  type="number"
                                  className="form-input"
                                  value={item.quantity}
                                  onChange={e => {
                                    const nextQty = e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0);
                                    setExpenseItems(prev => prev.map((it, i) => (i === idx ? { ...it, quantity: nextQty } : it)));
                                  }}
                                  style={{ padding: '4px 6px', height: '28px', fontSize: '0.825rem', width: '100%', minWidth: '70px', textAlign: 'center', fontWeight: 600 }}
                                  min="0"
                                  required
                                />
                              </td>
                              <td style={{ padding: '8px', width: '160px', minWidth: '160px', verticalAlign: 'top' }}>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={formatNumberWithDots(item.price)}
                                  onChange={e => {
                                    const rawVal = e.target.value.replace(/\D/g, '');
                                    const nextPrice = Math.max(0, Number(rawVal) || 0);
                                    setExpenseItems(prev => prev.map((it, i) => (i === idx ? { ...it, price: nextPrice } : it)));
                                  }}
                                  style={{ padding: '4px 8px', height: '28px', fontSize: '0.8rem', width: '100%' }}
                                  placeholder="0"
                                  required
                                />
                                {safePrice > 0 && (
                                  <div 
                                    style={{ 
                                      fontSize: '0.68rem', 
                                      color: 'var(--color-primary)', 
                                      fontWeight: 600, 
                                      marginTop: '4px', 
                                      fontStyle: 'italic', 
                                      whiteSpace: 'normal', 
                                      wordBreak: 'break-word', 
                                      lineHeight: 1.25 
                                    }} 
                                    title={docSoTiengViet(safePrice)}
                                  >
                                    {docSoTiengViet(safePrice)}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '8px', fontWeight: 600, width: '120px', minWidth: '120px', verticalAlign: 'top', lineHeight: '28px' }}>
                                {formatApprovalCurrency(lineTotal, currencyType)}
                              </td>
                              <td style={{ padding: '8px', width: '95px', minWidth: '95px', verticalAlign: 'top' }}>
                                <select
                                  className="form-input"
                                  value={item.vat}
                                  onChange={e => {
                                    const nextVat = Number(e.target.value);
                                    setExpenseItems(prev => prev.map((it, i) => (i === idx ? { ...it, vat: nextVat } : it)));
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    height: '28px',
                                    fontSize: '0.8rem',
                                    width: '85px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: 'var(--color-bg-primary, #ffffff)',
                                    color: 'var(--color-text-primary, #1e293b)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '6px'
                                  }}
                                >
                                  {(vatRates.length > 0 ? vatRates : [0, 5, 8, 10]).map(rate => (
                                    <option key={rate} value={rate}>{rate}%</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center', width: '36px', minWidth: '36px', verticalAlign: 'top', lineHeight: '28px' }}>
                                {expenseItems.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpenseItems(expenseItems.filter(x => x.id !== item.id));
                                    }}
                                    style={{ border: 'none', background: 'transparent', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '1.1rem', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    &times;
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals Summary */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignSelf: 'flex-end', width: isMobile ? '100%' : '280px', marginTop: '4px', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Tổng tiền chưa thuế:</span>
                      <strong style={{ color: 'var(--color-text)' }}>{formatApprovalCurrency(itemsTotalBeforeTax, currencyType)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Tiền thuế VAT:</span>
                      <strong style={{ color: 'var(--color-text)' }}>{formatApprovalCurrency(itemsTotalVat, currencyType)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '6px', fontSize: '0.9rem' }}>
                      <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>Tổng thanh toán:</span>
                      <strong style={{ color: 'var(--color-primary)' }}>{formatApprovalCurrency(itemsGrandTotal, currencyType)}</strong>
                    </div>
                    {itemsGrandTotal > 0 && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 600, fontStyle: 'italic', textAlign: 'right', marginTop: '2px', lineHeight: 1.35 }}>
                        ({docSoTiengViet(itemsGrandTotal)})
                      </div>
                    )}
                  </div>

                  {/* PURPOSE & DETAILS */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border-light)' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                      Mục đích & Nội dung thanh toán
                    </label>
                    <textarea
                      className="form-input"
                      value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                      placeholder="Giải trình chi tiết mục đích chi tiêu và căn cứ đề xuất (nếu có)..."
                      style={{ height: '76px', resize: 'vertical', fontSize: '0.8rem', padding: '8px' }}
                    />
                  </div>
                </div>

                {/* CARD 4: TÀI LIỆU CHỨNG TỪ ĐÍNH KÈM */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Tài liệu chứng từ đính kèm {images.length > 0 && `(${images.length} tệp)`}</span>
                    <button
                      type="button"
                      onClick={() => fileInputMultiRef.current?.click()}
                      style={{
                        background: 'rgba(189, 29, 45, 0.08)',
                        color: 'var(--color-primary)',
                        border: '1px solid rgba(189, 29, 45, 0.2)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Upload size={13} />
                      <span>Tải nhiều file / ảnh</span>
                    </button>
                    <input
                      type="file"
                      ref={fileInputMultiRef}
                      multiple
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv,image/png,image/jpeg,image/webp,image/gif"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const inputEl = e.target;
                        const files = inputEl.files;
                        if (!files || files.length === 0) return;
                        if (multiUploadInFlightRef.current) {
                          inputEl.value = '';
                          return;
                        }
                        multiUploadInFlightRef.current = true;
                        setUploadingImg(true);
                        uploadAbortRef.current?.abort();
                        const controller = new AbortController();
                        uploadAbortRef.current = controller;
                        let successCount = 0;
                        try {
                          for (let i = 0; i < files.length; i++) {
                            const file = files[i];
                            const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || '' : '';
                            if (ext === 'svg' || forbiddenUploadExts.includes(ext) || file.type === 'image/svg+xml') {
                              addToast(`Tệp "${file.name}" bị chặn vì lý do bảo mật.`, 'error');
                              continue;
                            }
                            if (file.size > maxUploadMb * 1024 * 1024) {
                              addToast(`Tệp "${file.name}" vượt quá giới hạn ${maxUploadMb}MB.`, 'error');
                              continue;
                            }
                            try {
                              let fileToUpload: File = file;
                              if (file.type.startsWith('image/') && !file.type.includes('svg')) {
                                try {
                                  const webpBlob = await compressToWebP(file);
                                  fileToUpload = new File([webpBlob], `expense_proof_${Date.now()}_${i}.webp`, { type: 'image/webp' });
                                } catch {
                                  fileToUpload = file;
                                }
                              }
                              const fd = new FormData();
                              fd.append('file', fileToUpload);
                              const res = await api.post('/upload', fd, {
                                headers: { 'Content-Type': 'multipart/form-data' },
                                signal: controller.signal
                              });
                              if (res.data && res.data.success && res.data.data?.url) {
                                const newUrl = res.data.data.url;
                                const originalName = file.name || res.data.data.name || 'Tài liệu đính kèm';
                                const newAtt: ExpenseAttachmentItem = {
                                  url: newUrl,
                                  name: originalName,
                                  size: file.size,
                                  type: file.type
                                };
                                setImages(prev => [...prev, newAtt]);
                                setForm((prev: any) => ({ ...prev, image_url: prev.image_url || newUrl }));
                                successCount++;
                              }
                            } catch (err: any) {
                              if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
                                break;
                              }
                              addToast(`Lỗi khi tải tệp "${file.name}"`, 'error');
                            }
                          }
                          if (successCount > 0) {
                            addToast(`Đã tải lên thành công ${successCount} tệp đính kèm!`, 'success');
                          }
                        } catch (err: any) {
                          if (err?.name !== 'AbortError' && err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') {
                            addToast('Lỗi khi tải tệp: ' + (err?.message || ''), 'error');
                          }
                        } finally {
                          multiUploadInFlightRef.current = false;
                          setUploadingImg(false);
                          inputEl.value = '';
                        }
                      }}
                    />
                  </div>

                  <PasteDropzoneArea
                    compact={true}
                    placeholder="Chọn/kéo thả hoặc Ctrl+V để dán nhiều ảnh, file PDF, hóa đơn"
                    subtext={`Hỗ trợ tối đa ${maxUploadMb}MB (PDF, Word, Excel, Ảnh PNG/JPG/WebP...)`}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv,image/png,image/jpeg,image/webp,image/gif"
                    onConfirmUpload={async (item) => {
                      if (item.file) {
                        const file = item.file;
                        const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || '' : '';
                        if (ext === 'svg' || forbiddenUploadExts.includes(ext) || file.type === 'image/svg+xml') {
                          addToast('Định dạng tệp không được phép tải lên vì lý do bảo mật.', 'error');
                          return;
                        }
                        if (file.size > maxUploadMb * 1024 * 1024) {
                          addToast(`Tệp vượt quá giới hạn ${maxUploadMb}MB.`, 'error');
                          return;
                        }
                        if (confirmUploadInFlightRef.current) return;
                        confirmUploadInFlightRef.current = true;
                        setUploadingImg(true);
                        uploadAbortRef.current?.abort();
                        const controller = new AbortController();
                        uploadAbortRef.current = controller;
                        try {
                          let fileToUpload: File = file;
                          if (file.type.startsWith('image/') && !file.type.includes('svg')) {
                            try {
                              const webpBlob = await compressToWebP(file);
                              fileToUpload = new File([webpBlob], `expense_proof_${Date.now()}.webp`, { type: 'image/webp' });
                            } catch {
                              fileToUpload = file;
                            }
                          }
                          const fd = new FormData();
                          fd.append('file', fileToUpload);
                          const res = await api.post('/upload', fd, {
                            headers: { 'Content-Type': 'multipart/form-data' },
                            signal: controller.signal
                          });
                          if (res.data && res.data.success && res.data.data?.url) {
                            const newUrl = res.data.data.url;
                            const originalName = file.name || res.data.data.name || 'Tài liệu đính kèm';
                            const newAtt: ExpenseAttachmentItem = {
                              url: newUrl,
                              name: originalName,
                              size: file.size,
                              type: file.type
                            };
                            setImages(prev => {
                              const isAlreadyIn = prev.some(existing => {
                                const eUrl = typeof existing === 'string' ? existing : existing.url;
                                return normalizeFileUrl(eUrl) === normalizeFileUrl(newUrl);
                              });
                              return isAlreadyIn ? prev : [...prev, newAtt];
                            });
                            setForm((prev: any) => ({ ...prev, image_url: prev.image_url || newUrl }));
                            addToast('Tải lên tệp đính kèm thành công!', 'success');
                          } else {
                            addToast('Tải tệp thất bại', 'error');
                          }
                        } catch (err: any) {
                          if (err?.name !== 'AbortError' && err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') {
                            addToast('Lỗi khi tải tệp: ' + (err?.message || ''), 'error');
                          }
                        } finally {
                          confirmUploadInFlightRef.current = false;
                          setUploadingImg(false);
                        }
                      }
                    }}
                  />

                  {uploadingImg && (
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="spinner sm"></div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Đang xử lý & tải lên tệp...</span>
                    </div>
                  )}

                  {/* Attachment gallery */}
                  {ensureArray(images).length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
                        {ensureArray<ExpenseAttachmentItem | string>(images).map((imgItem, idx) => {
                          const imgUrl = typeof imgItem === 'string' ? imgItem : imgItem.url;
                          const rawFileName = typeof imgItem === 'string' ? (imgUrl.split('/').pop() || `Tệp ${idx + 1}`) : (imgItem.name || imgUrl.split('/').pop() || `Tệp ${idx + 1}`);
                          const isImg = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(imgUrl) || (typeof imgItem === 'object' && imgItem.type?.startsWith('image/') && !imgItem.type?.includes('svg'));
                          const fileUrl = imgUrl.startsWith('http') ? imgUrl : `${import.meta.env.VITE_API_URL || '/backend'}${imgUrl.startsWith('/') ? '' : '/'}${imgUrl}`;
                          const fileName = rawFileName;
                          return (
                            <div
                              key={idx}
                              style={{
                                position: 'relative',
                                height: '80px',
                                borderRadius: '10px',
                                overflow: 'hidden',
                                border: '1.5px solid var(--color-border)',
                                background: isImg ? '#0F172A' : 'var(--color-bg-secondary)',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: isImg ? 0 : '8px'
                              }}
                            >
                              {isImg ? (
                                <img
                                  src={fileUrl}
                                  alt={fileName}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: 'var(--color-text)', width: '100%', height: '100%', justifyContent: 'center' }}
                                  title={fileName}
                                >
                                  <FileText size={24} style={{ color: '#BD1D2D' }} />
                                  <span style={{ fontSize: '0.65rem', fontWeight: 600, maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                    {fileName}
                                  </span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  const next = images.filter((_, i) => i !== idx);
                                  setImages(next);
                                  const firstUrl = next.length > 0 ? (typeof next[0] === 'string' ? next[0] : next[0].url) : '';
                                  setForm((prev: any) => ({ ...prev, image_url: firstUrl }));
                                }}
                                style={{
                                  position: 'absolute',
                                  top: 4,
                                  right: 4,
                                  background: 'rgba(0,0,0,0.7)',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '50%',
                                  width: 20,
                                  height: 20,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  zIndex: 2
                                }}
                                title="Xóa tệp này"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column (Sidebar - 3/10) */}
              <div 
                className="custom-scrollbar"
                style={{ 
                  flex: isMobile ? 'none' : 3, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '1.25rem', 
                  paddingBottom: isMobile ? '80px' : '20px',
                  position: isMobile ? 'static' : 'sticky',
                  top: 0,
                  alignSelf: 'flex-start',
                  maxHeight: isMobile ? 'none' : 'calc(100vh - 95px)',
                  overflowY: isMobile ? 'visible' : 'auto'
                }}
              >
                
                {/* Áp dụng cho (Khách / Đối tác) */}
                <div style={{ 
                  background: 'var(--color-surface)',
                  padding: '1.25rem',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px' }}>
                    <label className="form-label" style={{ fontWeight: 800, margin: 0, fontSize: '0.9rem', color: 'var(--color-text)' }}>Áp dụng cho</label>
                    
                    <div style={{
                      display: 'inline-flex',
                      background: '#F1F5F9',
                      padding: '3px',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      gap: '2px'
                    }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (allocationType !== 'contact') {
                            setAllocationType('contact');
                            setForm((prev: any) => ({ ...prev, entities: [] }));
                          }
                        }}
                        style={{
                          height: '28px',
                          padding: '0 12px',
                          fontSize: '0.75rem',
                          fontWeight: allocationType === 'contact' ? 700 : 600,
                          borderRadius: '7px',
                          border: 'none',
                          background: allocationType === 'contact' ? '#FFFFFF' : 'transparent',
                          color: allocationType === 'contact' ? '#BD1D2D' : '#64748B',
                          boxShadow: allocationType === 'contact' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        Khách
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (allocationType !== 'company') {
                            setAllocationType('company');
                            setForm((prev: any) => ({ ...prev, entities: [] }));
                          }
                        }}
                        style={{
                          height: '28px',
                          padding: '0 12px',
                          fontSize: '0.75rem',
                          fontWeight: allocationType === 'company' ? 700 : 600,
                          borderRadius: '7px',
                          border: 'none',
                          background: allocationType === 'company' ? '#FFFFFF' : 'transparent',
                          color: allocationType === 'company' ? '#BD1D2D' : '#64748B',
                          boxShadow: allocationType === 'company' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        Đối tác
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {ensureArray(form.entities).length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                        Chưa áp dụng cho ai
                      </span>
                    ) : (
                      ensureArray(form.entities).map((e: any) => (
                        <span key={e.entity_id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 600, border: '1px solid rgba(189, 29, 45, 0.2)' }}>
                          <Avatar name={e.name} src={e.avatar_url} size={20} />
                          {e.name || `${allocationType === 'contact' ? 'Khách hàng' : 'Đối tác'} #${e.entity_id}`}
                          <X size={14} style={{ cursor: 'pointer', marginLeft: 4 }} onClick={() => setForm({ ...form, entities: ensureArray(form.entities).filter((x: any) => x.entity_id !== e.entity_id) })} />
                        </span>
                      ))
                    )}
                  </div>

                  {allocationType === 'contact' ? (
                    <CustomSelect
                      options={allocationContactOptions}
                      value=""
                      onChange={(val) => {
                        const found = ensureArray(contacts).find(c => String(c.id) === val);
                        if (found) {
                          setForm({ ...form, entities: [...ensureArray(form.entities), { entity_type: 'contact', entity_id: found.id, name: (found.full_name || '').trim(), avatar_url: found.avatar_url }] });
                        }
                      }}
                      placeholder="+ Thêm khách hàng..."
                      searchable
                      showAvatars
                    />
                  ) : (
                    <CustomSelect
                      options={allocationCompanyOptions}
                      value=""
                      onChange={(val) => {
                        const found = ensureArray(companies).find(c => String(c.id) === val);
                        if (found) {
                          setForm((prev: any) => ({ 
                            ...prev, 
                            entities: [...ensureArray(prev.entities), { entity_type: 'company', entity_id: found.id, name: found.name || found.company_name || 'Không tên', avatar_url: found.logo_url || found.logo }]
                          }));
                        }
                      }}
                      placeholder="+ Thêm đối tác..."
                      searchable
                      showAvatars
                    />
                  )}
                </div>

                {/* Phê duyệt & Vận hành */}
                <div style={{ 
                  background: 'var(--color-surface)',
                  padding: '1.25rem',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <div style={{ borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-text)' }}>
                      Các bước duyệt áp dụng
                    </h4>
                    {itemsGrandTotalVnd >= threshold ? (
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#BD1D2D', marginTop: '4px' }}>
                        Khoản chi từ {threshold.toLocaleString('vi-VN')}đ duyệt 3 cấp (Leader → Giám đốc → Kế toán)
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.72rem', fontWeight: 650, color: '#0F172A', marginTop: '4px' }}>
                        Khoản chi dưới {threshold.toLocaleString('vi-VN')}đ duyệt 2 cấp (Leader → Kế toán)
                      </div>
                    )}
                  </div>

                  {/* Vertical Timeline Stepper */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '12px', position: 'relative', paddingLeft: '30px' }}>
                    <div style={{ position: 'absolute', left: '10px', top: '10px', bottom: '10px', width: '2px', background: 'var(--color-border-light)' }} />

                    {/* Step 1: Creator */}
                    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                      <div style={{
                        position: 'absolute',
                        left: '-30px',
                        top: '0px',
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: '#BD1D2D',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        zIndex: 2
                      }}>
                        1
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.8rem', color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>Người tạo</strong>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px', 
                          padding: '6px 12px', 
                          background: 'var(--color-bg)', 
                          border: '1px solid var(--color-border-light)', 
                          borderRadius: '8px',
                          height: '38px'
                        }}>
                          <Avatar src={user?.avatar_url || user?.avatar} name={user?.full_name || user?.name || user?.username} size="sm" />
                          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{user?.full_name || user?.name || user?.username}</span>
                        </div>
                      </div>
                    </div>

                    {/* Step 2: Level 1 Approver */}
                    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                      <div style={{
                        position: 'absolute',
                        left: '-30px',
                        top: '0px',
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: form.approver_id ? '#BD1D2D' : 'var(--color-surface)',
                        border: `2px solid ${form.approver_id ? '#BD1D2D' : 'var(--color-border-light)'}`,
                        color: form.approver_id ? '#ffffff' : 'var(--color-text-light)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        zIndex: 2
                      }}>
                        2
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.8rem', color: form.approver_id ? 'var(--color-text)' : 'var(--color-text-light)', display: 'block', marginBottom: '6px' }}>
                          Người duyệt Cấp 1 *
                        </strong>
                        <CustomSelect
                          options={approverUserOptions}
                          value={form.approver_id}
                          onChange={val => {
                            const numVal = Number(val);
                            setForm({
                              ...form,
                              approver_id: numVal,
                              related_user_ids: ensureArray<number>(form.related_user_ids).filter((x: number) => x !== numVal)
                            });
                          }}
                          placeholder="Chọn người duyệt Cấp 1..."
                          searchable
                          showAvatars
                        />
                      </div>
                    </div>

                    {/* Step 3: Level 2 Approver */}
                    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                      <div style={{
                        position: 'absolute',
                        left: '-30px',
                        top: '0px',
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: form.approver_id_2 ? '#BD1D2D' : 'var(--color-surface)',
                        border: `2px solid ${form.approver_id_2 ? '#BD1D2D' : 'var(--color-border-light)'}`,
                        color: form.approver_id_2 ? '#ffffff' : 'var(--color-text-light)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        zIndex: 2
                      }}>
                        3
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', display: 'block', marginBottom: '6px' }}>
                          {itemsGrandTotalVnd >= threshold ? (
                            <>Người duyệt Cấp 2: Ban Giám đốc <span style={{ color: '#BD1D2D' }}>*</span></>
                          ) : (
                            <>Người duyệt Cấp 2: Kế toán <span style={{ color: '#BD1D2D' }}>*</span></>
                          )}
                        </strong>
                        <CustomSelect
                          options={approverUserOptions}
                          value={form.approver_id_2}
                          onChange={val => {
                            const numVal = Number(val);
                            setForm({
                              ...form,
                              approver_id_2: numVal,
                              related_user_ids: ensureArray<number>(form.related_user_ids).filter((x: number) => x !== numVal)
                            });
                          }}
                          placeholder="Chọn người duyệt Cấp 2..."
                          searchable
                          showAvatars
                        />
                      </div>
                    </div>

                    {/* Step 4: Level 3 Approver (Only if >= threshold) */}
                    {itemsGrandTotalVnd >= threshold && (
                      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        <div style={{
                          position: 'absolute',
                          left: '-30px',
                          top: '0px',
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: form.approver_id_3 ? '#BD1D2D' : 'var(--color-surface)',
                          border: `2px solid ${form.approver_id_3 ? '#BD1D2D' : 'var(--color-border-light)'}`,
                          color: form.approver_id_3 ? '#ffffff' : 'var(--color-text-light)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          zIndex: 2
                        }}>
                          4
                        </div>
                        <div>
                          <strong style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', display: 'block', marginBottom: '6px' }}>
                            Người duyệt Cấp 3: Kế toán <span style={{ color: '#BD1D2D' }}>*</span>
                          </strong>
                          <CustomSelect
                            options={approverUserOptions}
                            value={form.approver_id_3}
                            onChange={val => {
                              const numVal = Number(val);
                              setForm({
                                ...form,
                                approver_id_3: numVal,
                                related_user_ids: ensureArray<number>(form.related_user_ids).filter((x: number) => x !== numVal)
                              });
                            }}
                            placeholder="Chọn người duyệt Cấp 3..."
                            searchable
                            showAvatars
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Related Users */}
                <div style={{ 
                  background: 'var(--color-surface)',
                  padding: '1.25rem',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-text)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px' }}>
                    Người liên quan (Theo dõi)
                  </h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {/* Selected participant avatars */}
                      {ensureArray(form.related_user_ids).length > 0 ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {ensureArray<number>(form.related_user_ids).map((uid: number, idx: number) => {
                            const u = ensureArray(users).find((x: any) => x.id === uid);
                            if (!u) return null;
                            return (
                              <div
                                key={uid}
                                style={{
                                  marginLeft: idx === 0 ? 0 : -8,
                                  border: '1.5px solid var(--color-surface)',
                                  borderRadius: '50%',
                                  overflow: 'hidden',
                                  zIndex: 10 - idx,
                                  boxShadow: 'var(--shadow-sm)',
                                  display: 'flex'
                                }}
                                title={u.full_name || u.name}
                              >
                                <Avatar src={u.avatar_url || u.avatar} name={u.full_name || u.name} size="sm" />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Chưa chọn ai</span>
                      )}

                      {/* Dash add button */}
                      <button
                        type="button"
                        onClick={() => setShowParticipantDropdown(!showParticipantDropdown)}
                        style={{
                          border: '1px dashed #BD1D2D',
                          background: 'rgba(189, 29, 45, 0.04)',
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: 0,
                          transition: 'all 0.15s ease'
                        }}
                        className="hover-scale"
                        title="Thêm người liên quan"
                      >
                        <Plus size={14} color="#BD1D2D" />
                      </button>

                      {/* Dropdown list of users */}
                      {showParticipantDropdown && (
                        <div style={{
                          position: 'absolute',
                          top: isMobile ? 'auto' : '100%',
                          bottom: isMobile ? 'calc(100% + 6px)' : 'auto',
                          left: 0,
                          marginTop: isMobile ? 0 : '6px',
                          marginBottom: isMobile ? '6px' : 0,
                          zIndex: 2147483645,
                          background: 'var(--color-surface)',
                          border: '1px solid #E2E8F0',
                          borderRadius: '12px',
                          boxShadow: isMobile ? '0 -10px 25px rgba(0, 0, 0, 0.18)' : '0 10px 25px rgba(0, 0, 0, 0.18)',
                          minWidth: '240px',
                          maxWidth: isMobile ? 'calc(100vw - 32px)' : '320px',
                          maxHeight: isMobile ? '250px' : '260px',
                          overflowY: 'auto',
                          padding: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}>
                          <div style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 10, paddingBottom: '4px' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                              <Search size={13} style={{ position: 'absolute', left: '8px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                              <input
                                type="text"
                                placeholder="Tìm người liên quan..."
                                value={participantSearch}
                                onChange={(e) => setParticipantSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px 6px 26px',
                                  fontSize: '0.75rem',
                                  borderRadius: '6px',
                                  border: '1px solid var(--color-border)',
                                  background: 'var(--color-bg)',
                                  color: 'var(--color-text)',
                                  outline: 'none',
                                  boxSizing: 'border-box'
                                }}
                                autoFocus
                              />
                            </div>
                          </div>
                          {ensureArray(users)
                            .filter((u: any) => u.id !== form.approver_id)
                            .filter((u: any) => {
                              if (!participantSearch.trim()) return true;
                              const q = participantSearch.toLowerCase();
                              return (
                                (u.full_name || u.name || '').toLowerCase().includes(q) ||
                                (u.email || '').toLowerCase().includes(q) ||
                                (u.role || '').toLowerCase().includes(q)
                              );
                            })
                            .map((u: any) => {
                              const currentRelated = ensureArray<number>(form.related_user_ids);
                              const isSelected = currentRelated.includes(u.id);
                              return (
                                <div
                                  key={u.id}
                                  onClick={() => {
                                    if (isSelected) {
                                      setForm({ ...form, related_user_ids: currentRelated.filter((x: number) => x !== u.id) });
                                    } else {
                                      setForm({ ...form, related_user_ids: [...currentRelated, u.id] });
                                    }
                                  }}
                                  style={{
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: isSelected ? 'rgba(189, 29, 45, 0.06)' : 'transparent',
                                    color: isSelected ? '#BD1D2D' : 'var(--color-text)'
                                  }}
                                  className="hover-bg-alt"
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                    <Avatar src={u.avatar_url || u.avatar} name={u.full_name || u.name} size="sm" />
                                    <span style={{ fontSize: '0.75rem', fontWeight: isSelected ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {u.full_name || u.name}
                                    </span>
                                  </div>
                                  {isSelected && <Check size={12} color="#BD1D2D" strokeWidth={3} style={{ flexShrink: 0 }} />}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* QR Code Zoom Preview Modal */}
            {previewQrModalUrl && typeof document !== 'undefined' && createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.75)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: modalNestedZ,
                  padding: '20px'
                }}
                onClick={() => setPreviewQrModalUrl(null)}
              >
                <div
                  style={{
                    background: '#fff',
                    borderRadius: '16px',
                    padding: '20px',
                    maxWidth: '380px',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    position: 'relative'
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewQrModalUrl(null)}
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#64748b'
                    }}
                  >
                    <X size={20} />
                  </button>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Mã VietQR Thanh Toán</h4>
                  <img src={previewQrModalUrl} alt="VietQR" style={{ width: '100%', borderRadius: '12px' }} />
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Quét mã bằng app ngân hàng để chuyển khoản nhanh 24/7</span>
                </div>
              </div>,
              document.body
            )}

            {/* Draft Exit Confirmation Modal */}
            <DraftExitConfirmModal
              isOpen={showExitConfirm}
              onSaveDraft={handleSaveDraftAndExit}
              onDiscard={handleDiscardAndExit}
              onContinue={() => setShowExitConfirm(false)}
              title="Lưu bản nháp đề xuất thanh toán?"
              message="Bạn có thông tin đề xuất đang nhập dở dang. Bạn có muốn lưu bản nháp để tiếp tục hoàn thiện sau không?"
              zIndex={modalNestedZ}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>, document.body)
  );
};

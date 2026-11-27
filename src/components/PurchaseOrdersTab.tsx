import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingCart, Plus, Search, Calendar, 
  ArrowUpRight, CheckCircle2, Clock, XCircle, Loader2,
  Truck, Package, Trash2, PlusCircle, MinusCircle, AlertCircle,
  Users, FileText, Pencil, Copy, Printer, Download, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useUIStore } from '../store/uiStore';
import { useTenantConfig, getTenantOrganizationName, getTenantLogoUrl } from '../contexts/TenantConfigContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { isSystemAdmin, isExecutive, isAccountant, isSales, isViewer, normalizeRole } from '../utils/roleUtils';
import { ensureArray, extractArray } from '../utils/safeArray';
import { getLocalDateStr, formatDateVN } from '../utils/dateUtils';
import { numberToVietnameseText } from '../utils/numberToText';
import { pushOverlay } from '../utils/overlayStack';
import { EmptyCard } from '../components/ui/EmptyCard';
import { CustomSelect } from '../components/ui/CustomSelect';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from './ui/Avatar';
import { resolveTeamLeaderId } from '../utils/teamLeader';
import { DraftExitConfirmModal } from './ui/DraftExitConfirmModal';
import { VietnameseDateInput } from './ui/VietnameseDateInput';

interface Props {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  defaultSupplierId?: string;
  openPoId?: number | null;
  onClearOpenPoId?: () => void;
}

const FMT = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Number(n) || 0)} đ`;

const csvSafe = (val: unknown): string => {
  const s = String(val ?? '').replace(/\r?\n/g, ' ');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

const formatThresholdShort = (val: number): string => {
  if (val >= 1000000 && val % 1000000 === 0) return `${val / 1000000}tr`;
  return `${new Intl.NumberFormat('vi-VN').format(val)}đ`;
};

export const PurchaseOrdersTab: React.FC<Props> = ({
  showModal,
  setShowModal,
  defaultSupplierId,
  openPoId,
  onClearOpenPoId,
}) => {
  const { user } = useAuth();
  const { config, hasPermission } = useTenantConfig();
  const thresholdSetting = useTypedSubSetting<number>('finance.approval_policy', 'po_three_level_vnd', 5000000);
  const vatRates = useTypedSubSetting<number[]>('finance.vat_and_cit_policy', 'vat_rates', [0, 5, 8, 10]);
  const zModalNested = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_modal_nested', 2147483646);
  const motionMs = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220);

  const threshold = Number(thresholdSetting) > 0 ? Number(thresholdSetting) : 5000000;
  const safeVatOptions = useMemo(() => {
    const presets = ensureArray<number>(vatRates, [0, 5, 8, 10]).filter(v => Number.isFinite(Number(v)) && Number(v) >= 0);
    const list = presets.length > 0 ? presets : [0, 5, 8, 10];
    return list.map(v => ({
      value: String(v),
      label: Number(v) === 0 ? '0% (Không thuế)' : `${v}%`,
    }));
  }, [vatRates]);

  const isSale = !user || isSales(user) || isViewer(user);
  const isAdminOrExec = isSystemAdmin(user) || isExecutive(user);
  const canReceiveInventory = !isSale && (isSystemAdmin(user) || hasPermission('inventory', 'write'));

  const addToast = useUIStore((s) => s.addToast);
  const showConfirm = useUIStore((s) => s.showConfirm);
  const closeConfirm = useUIStore((s) => s.closeConfirm);
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [editingPoId, setEditingPoId] = useState<number | null>(null);
  const [editingPoNumber, setEditingPoNumber] = useState<string>('');
  const justHydratedPoRef = useRef(false);
  const manualApproversRef = useRef({ l1: false, l2: false, l3: false });
  const inFlightRef = useRef(false);
  const ordersAbortRef = useRef<AbortController | null>(null);
  const metaAbortRef = useRef<AbortController | null>(null);
  const deepLinkAbortRef = useRef<AbortController | null>(null);

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [beneficiaryType, setBeneficiaryType] = useState<'supplier' | 'employee'>('supplier');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  const [printPo, setPrintPo] = useState<any>(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [rejectModalPoId, setRejectModalPoId] = useState<number | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  const [formData, setFormData] = useState({
    supplier_id: '',
    order_date: getLocalDateStr(),
    notes: '',
    items: [] as any[],
    tax_rate: 0,
    approver_id: '',
    approver_id_2: '',
    approver_id_3: ''
  });

  const PO_DRAFT_KEY = useMemo(
    () => `myerp_po_create_draft_t${(user as any)?.tenant_id || 0}_u${user?.id || 0}`,
    [user]
  );
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [existingDraft, setExistingDraft] = useState<any>(null);

  const isFormDirty = useCallback(() => {
    return Boolean(
      (formData.items && formData.items.length > 0) ||
      formData.notes?.trim() ||
      (formData.supplier_id && formData.supplier_id !== defaultSupplierId)
    );
  }, [formData.items, formData.notes, formData.supplier_id, defaultSupplierId]);

  const handleRequestClose = useCallback(() => {
    if (isFormDirty()) {
      setShowExitConfirm(true);
    } else {
      setShowModal(false);
    }
  }, [isFormDirty, setShowModal]);

  useEffect(() => {
    if (!showModal) return;
    return pushOverlay('po-editor-modal', handleRequestClose, zModalNested);
  }, [showModal, handleRequestClose, zModalNested]);

  useEffect(() => {
    if (!printPo) return;
    return pushOverlay('po-print-modal', () => setPrintPo(null), zModalNested + 1);
  }, [printPo, zModalNested]);

  useEffect(() => {
    if (!rejectModalPoId) return;
    return pushOverlay('po-reject-modal', () => {
      if (!isSubmitting) setRejectModalPoId(null);
    }, zModalNested + 2);
  }, [rejectModalPoId, isSubmitting, zModalNested]);

  // Check for saved draft when opening
  useEffect(() => {
    if (showModal) {
      // 1. Check AI Agent draft from sessionStorage first
      try {
        const aiDraftRaw = sessionStorage.getItem('pending_po_draft');
        if (aiDraftRaw) {
          sessionStorage.removeItem('pending_po_draft');
          const aiDraft = JSON.parse(aiDraftRaw);
          const createdAt = aiDraft?._draft_created_at || 0;
          if (aiDraft && (!createdAt || Date.now() - createdAt < 10 * 60 * 1000)) {
            const rawItems = ensureArray<any>(aiDraft.items);
            const mappedItems = rawItems.map((it: any) => {
              const qty = Math.max(1, Number(it.quantity) || 1);
              const cost = Math.max(0, Number(it.unit_cost || it.unit_price || it.price || 0));
              return {
                name: it.name || 'Vật tư / Hàng hóa',
                quantity: qty,
                unit_cost: cost,
                subtotal: qty * cost
              };
            });

            setFormData(prev => ({
              ...prev,
              notes: aiDraft.notes || prev.notes,
              items: mappedItems.length > 0 ? mappedItems : prev.items
            }));

            if (aiDraft.supplier_name && suppliers.length > 0) {
              const sTarget = String(aiDraft.supplier_name).toLowerCase().trim();
              const matchedSup = suppliers.find((s: any) => (s.name || '').toLowerCase().includes(sTarget));
              if (matchedSup) {
                setFormData(prev => ({ ...prev, supplier_id: String(matchedSup.id) }));
              }
            }
          }
        }
      } catch (e) {
        console.error('Error restoring AI PO draft:', e);
      }

      // 2. Check local saved draft
      try {
        const saved = localStorage.getItem(PO_DRAFT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && ((parsed.formData?.items && parsed.formData.items.length > 0) || parsed.formData?.notes || parsed.formData?.supplier_id)) {
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
    } else {
      setShowExitConfirm(false);
      setEditingPoId(null);
      setEditingPoNumber('');
      manualApproversRef.current = { l1: false, l2: false, l3: false };
    }
  }, [showModal, suppliers, PO_DRAFT_KEY]);

  const saveDraftToStorage = () => {
    const payload = {
      formData,
      beneficiaryType,
      selectedEmployeeId,
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(PO_DRAFT_KEY, JSON.stringify(payload));
      setExistingDraft(payload);
    } catch (e) {
      console.error('Failed to save PO draft', e);
    }
  };

  const handleSaveDraftAndExit = () => {
    saveDraftToStorage();
    addToast('Đã lưu bản nháp đơn nhập hàng PO thành công!', 'success');
    setShowExitConfirm(false);
    setShowModal(false);
  };

  const handleExplicitSaveDraft = () => {
    saveDraftToStorage();
    addToast('Đã lưu bản nháp đơn nhập hàng PO thành công!', 'success');
  };

  const handleDiscardAndExit = () => {
    try {
      localStorage.removeItem(PO_DRAFT_KEY);
    } catch {}
    setExistingDraft(null);
    setShowExitConfirm(false);
    setShowModal(false);
  };

  const handleRestoreDraft = () => {
    if (!existingDraft) return;
    if (existingDraft.formData) setFormData(existingDraft.formData);
    if (existingDraft.beneficiaryType) setBeneficiaryType(existingDraft.beneficiaryType);
    if (existingDraft.selectedEmployeeId) setSelectedEmployeeId(existingDraft.selectedEmployeeId);
    addToast('Đã khôi phục dữ liệu bản nháp đơn PO', 'info');
    setExistingDraft(null);
  };

  const handleClearDraft = () => {
    try {
      localStorage.removeItem(PO_DRAFT_KEY);
    } catch {}
    setExistingDraft(null);
    addToast('Đã xóa bản nháp PO', 'info');
  };

  // Default Director and default Accountant for PO routing (pure role-based, zero hardcoded user identities)
  const defaultDirector = useMemo(() => {
    const businessUsers = ensureArray<any>(users).filter(u =>
      !['superadmin', 'super_admin', 'bot', 'system'].includes(normalizeRole(u.role))
    );
    return (
      businessUsers.find(u => normalizeRole(u.role) === 'director') ||
      businessUsers.find(u => isExecutive(u)) ||
      businessUsers.find(u => isSystemAdmin(u)) ||
      null
    );
  }, [users]);

  const defaultAccountant = useMemo(() => {
    const businessUsers = ensureArray<any>(users).filter(u =>
      !['superadmin', 'super_admin', 'bot', 'system'].includes(normalizeRole(u.role))
    );
    return (
      businessUsers.find(u => isAccountant(u, false)) ||
      businessUsers.find(u => String(u.department || '').toLowerCase().includes('kế toán')) ||
      null
    );
  }, [users]);

  useEffect(() => {
    if (!showModal) return;
    if (justHydratedPoRef.current) {
      justHydratedPoRef.current = false;
      return;
    }
    if (editingPoId) return; // Never overwrite existing PO approvers while editing line items

    const leaderId = resolveTeamLeaderId(user, users, teams);
    const subtotal = formData.items.reduce((acc, i) => acc + (Number(i.subtotal) || 0), 0);
    const taxRate = Number(formData.tax_rate || 0);
    const tax = Math.round((subtotal * taxRate) / 100);
    const total = subtotal + tax;

    setFormData(prev => {
      const nextLeader = manualApproversRef.current.l1
        ? prev.approver_id
        : (prev.approver_id || (leaderId ? String(leaderId) : ''));

      if (total >= threshold) {
        return {
          ...prev,
          supplier_id: defaultSupplierId ? String(defaultSupplierId) : prev.supplier_id,
          approver_id: nextLeader,
          approver_id_2: manualApproversRef.current.l2
            ? prev.approver_id_2
            : (defaultDirector?.id ? String(defaultDirector.id) : prev.approver_id_2),
          approver_id_3: manualApproversRef.current.l3
            ? prev.approver_id_3
            : (defaultAccountant?.id ? String(defaultAccountant.id) : prev.approver_id_3),
        };
      }
      return {
        ...prev,
        supplier_id: defaultSupplierId ? String(defaultSupplierId) : prev.supplier_id,
        approver_id: nextLeader,
        approver_id_2: manualApproversRef.current.l2
          ? prev.approver_id_2
          : (defaultAccountant?.id ? String(defaultAccountant.id) : prev.approver_id_2),
        approver_id_3: manualApproversRef.current.l3 ? prev.approver_id_3 : '',
      };
    });
  }, [showModal, editingPoId, defaultSupplierId, user, users, teams, formData.items, formData.tax_rate, threshold, defaultDirector, defaultAccountant]);

  const fetchOrders = useCallback(async () => {
    ordersAbortRef.current?.abort();
    const controller = new AbortController();
    ordersAbortRef.current = controller;
    try {
      const res = await api.get('/purchase-orders', { signal: controller.signal });
      if (controller.signal.aborted) return;
      setOrders(extractArray<any>(res?.data, 'items'));
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      addToast('Lỗi khi tải danh sách đơn nhập hàng', 'error');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [addToast]);

  const fetchSuppliersAndProducts = useCallback(async () => {
    metaAbortRef.current?.abort();
    const controller = new AbortController();
    metaAbortRef.current = controller;
    try {
      const [sRes, pRes, uRes, tRes] = await Promise.all([
        api.get('/suppliers', { params: { limit: 200 }, signal: controller.signal }),
        api.get('/products', { params: { limit: 200 }, signal: controller.signal }),
        api.get('/users?all=1', { signal: controller.signal }),
        api.get('/teams', { signal: controller.signal }).catch(() => ({ data: [] })),
      ]);
      if (controller.signal.aborted) return;
      const uList = extractArray<any>(uRes?.data, 'items', 'users');
      const tList = extractArray<any>(tRes?.data, 'items', 'teams');
      setSuppliers(extractArray<any>(sRes?.data, 'items', 'suppliers'));
      setProducts(extractArray<any>(pRes?.data, 'items', 'products'));
      setUsers(uList);
      setTeams(tList);

      const leaderId = resolveTeamLeaderId(user, uList, tList);
      if (leaderId) {
        setFormData(prev => ({ ...prev, approver_id: prev.approver_id || String(leaderId) }));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      addToast('Không thể tải danh mục Nhà cung cấp / Sản phẩm', 'warning');
    }
  }, [user, addToast]);

  useEffect(() => {
    void fetchOrders();
    void fetchSuppliersAndProducts();
    return () => {
      ordersAbortRef.current?.abort();
      metaAbortRef.current?.abort();
      deepLinkAbortRef.current?.abort();
    };
  }, [fetchOrders, fetchSuppliersAndProducts]);

  const handleOpenPrintPo = useCallback(async (o: any) => {
    setPrintPo({ ...o, items: ensureArray<any>(o.items) });
    if (!Array.isArray(o.items) && o.id) {
      setPrintLoading(true);
      try {
        const res = await api.get(`/purchase-orders/${o.id}`);
        const detail = res.data?.data ?? res.data ?? {};
        setPrintPo({ ...o, ...detail, items: ensureArray<any>(detail.items) });
      } catch {
        // Show header-level summary cleanly if detail unavailable
      } finally {
        setPrintLoading(false);
      }
    }
  }, []);

  // Handle ?open_id= deep-link passed from InventoryPage or Notifications
  useEffect(() => {
    if (!openPoId || loading) return;
    const targetId = Number(openPoId);
    const match = orders.find(o => Number(o.id) === targetId);
    if (match) {
      void handleOpenPrintPo(match);
      onClearOpenPoId?.();
      return;
    }
    deepLinkAbortRef.current?.abort();
    const controller = new AbortController();
    deepLinkAbortRef.current = controller;
    api.get(`/purchase-orders/${targetId}`, { signal: controller.signal })
      .then(res => {
        if (controller.signal.aborted) return;
        const poDetail = res.data?.data ?? res.data;
        if (poDetail?.id) {
          setPrintPo({ ...poDetail, items: ensureArray<any>(poDetail.items) });
        }
        onClearOpenPoId?.();
      })
      .catch(() => {
        onClearOpenPoId?.();
      });
  }, [openPoId, loading, orders, handleOpenPrintPo, onClearOpenPoId]);

  const handleOpenEditPO = async (o: any, isClone = false) => {
    let poData = o;
    if (!Array.isArray(o.items) && o.id) {
      try {
        const res = await api.get(`/purchase-orders/${o.id}`);
        poData = res.data?.data || res.data || o;
      } catch {
        poData = o;
      }
    }
    const rawItems = ensureArray<any>(poData.items);
    const mappedItems = rawItems.map((it: any) => {
      const qty = Math.max(1, Number(it.quantity) || 1);
      const cost = Math.max(0, Number(it.unit_cost || it.price || 0));
      return {
        product_id: it.product_id,
        name: it.product_name || it.name || 'Sản phẩm',
        quantity: qty,
        unit_cost: cost,
        subtotal: Number(it.subtotal) || qty * cost
      };
    });
    const subtotalVal = Number(poData.subtotal || 0);
    const taxVal = Number(poData.tax || 0);
    const taxRate = poData.tax_rate !== undefined
      ? Number(poData.tax_rate)
      : (subtotalVal > 0 && taxVal > 0 ? Math.round((taxVal / subtotalVal) * 100) : 0);

    setBeneficiaryType(poData.beneficiary_type === 'employee' ? 'employee' : 'supplier');
    setSelectedEmployeeId(poData.beneficiary_id ? String(poData.beneficiary_id) : '');
    justHydratedPoRef.current = true;
    manualApproversRef.current = { l1: true, l2: true, l3: true };
    setEditingPoId(isClone ? null : Number(poData.id || o.id));
    setEditingPoNumber(isClone ? '' : String(poData.po_number || o.po_number || ''));
    setFormData({
      supplier_id: poData.supplier_id ? String(poData.supplier_id) : '',
      order_date: isClone
        ? getLocalDateStr()
        : (poData.order_date ? String(poData.order_date).split('T')[0] : getLocalDateStr()),
      notes: poData.notes || '',
      items: mappedItems,
      tax_rate: taxRate,
      approver_id: poData.approver_id ? String(poData.approver_id) : '',
      approver_id_2: poData.approver_id_2 ? String(poData.approver_id_2) : '',
      approver_id_3: poData.approver_id_3 ? String(poData.approver_id_3) : ''
    });
    setShowModal(true);
  };

  const handleAddItem = (p: any) => {
    const cost = Math.max(0, Number(p.cost || 0));
    setFormData(prev => {
      const exists = prev.items.find(i => Number(i.product_id) === Number(p.id));
      if (exists) {
        return {
          ...prev,
          items: prev.items.map(i => Number(i.product_id) === Number(p.id)
            ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * Number(i.unit_cost) }
            : i
          )
        };
      }
      return {
        ...prev,
        items: [...prev.items, {
          product_id: p.id,
          name: p.name,
          quantity: 1,
          unit_cost: cost,
          subtotal: cost
        }]
      };
    });
  };

  const handleAddManualItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        product_id: null,
        name: searchTerm.trim() || 'Hạng mục ngoài danh mục',
        quantity: 1,
        unit_cost: 0,
        subtotal: 0,
      }]
    }));
  };

  const handleRemoveItem = (idx: number) => {
    setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  const handleQtyChange = (idx: number, qty: number) => {
    if (qty < 1) return;
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === idx ? { ...item, quantity: qty, subtotal: qty * Number(item.unit_cost || 0) } : item)
    }));
  };

  const handleUnitCostChange = (idx: number, newCost: number) => {
    const safeCost = Math.max(0, Number(newCost) || 0);
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === idx ? { ...item, unit_cost: safeCost, subtotal: Number(item.quantity || 1) * safeCost } : item)
    }));
  };

  const handleItemNameChange = (idx: number, newName: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === idx ? { ...item, name: newName } : item)
    }));
  };

  const calculateTotal = () => formData.items.reduce((acc, i) => acc + (Number(i.subtotal) || 0), 0);

  const handleApproveConfirm = (po: any) => {
    if (inFlightRef.current || isSubmitting) return;
    showConfirm({
      title: 'Phê duyệt đơn nhập hàng',
      message: `Xác nhận phê duyệt đơn ${po.po_number || `#PO-${po.id}`} với tổng giá trị ${FMT(po.total)}?`,
      confirmText: 'Phê duyệt',
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        setIsSubmitting(true);
        try {
          await api.post(`/purchase-orders/${po.id}/approve`, { status: 'approved' });
          addToast('Đã duyệt đơn nhập hàng thành công', 'success');
          await fetchOrders();
        } catch (err: any) {
          addToast(err?.response?.data?.message || 'Lỗi khi phê duyệt đơn hàng', 'error');
        } finally {
          inFlightRef.current = false;
          setIsSubmitting(false);
          closeConfirm();
        }
      },
    });
  };

  const handleSubmitReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalPoId || inFlightRef.current || isSubmitting) return;
    const trimmedReason = rejectReasonInput.trim();
    if (!trimmedReason) {
      addToast('Vui lòng nhập lý do từ chối đơn nhập hàng', 'warning');
      return;
    }
    inFlightRef.current = true;
    setIsSubmitting(true);
    try {
      await api.post(`/purchase-orders/${rejectModalPoId}/approve`, {
        status: 'rejected',
        reject_reason: trimmedReason,
        reason: trimmedReason,
        note: trimmedReason,
      });
      addToast('Đã từ chối đơn nhập hàng', 'info');
      setRejectModalPoId(null);
      setRejectReasonInput('');
      await fetchOrders();
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Lỗi khi từ chối đơn hàng', 'error');
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current || isSubmitting) return;
    if (beneficiaryType === 'supplier' && !formData.supplier_id) {
      return addToast('Vui lòng chọn nhà cung cấp', 'warning');
    }
    if (beneficiaryType === 'employee' && !selectedEmployeeId) {
      return addToast('Vui lòng chọn nhân viên cần thanh toán', 'warning');
    }
    if (formData.items.length === 0) return addToast('Vui lòng thêm ít nhất một sản phẩm / hạng mục', 'warning');
    if (formData.items.some(it => !String(it.name || '').trim() || Number(it.quantity) <= 0 || Number(it.unit_cost) < 0)) {
      return addToast('Vui lòng kiểm tra tên, số lượng (> 0) và đơn giá (>= 0) của các hạng mục', 'warning');
    }

    const subtotal = calculateTotal();
    const taxRate = Number(formData.tax_rate || 0);
    const tax = Math.round((subtotal * taxRate) / 100);
    const total = subtotal + tax;

    if (!formData.approver_id) {
      return addToast('Vui lòng chọn người duyệt Cấp 1 (Trưởng nhóm / Quản lý)', 'warning');
    }
    if (!formData.approver_id_2) {
      return addToast(total >= threshold ? 'Vui lòng chọn người duyệt Cấp 2 (Ban Giám đốc)' : 'Vui lòng chọn người duyệt Cấp 2 (Kế toán)', 'warning');
    }
    if (total >= threshold && !formData.approver_id_3) {
      return addToast(`Đơn hàng từ ${FMT(threshold)} trở lên bắt buộc phê duyệt 3 cấp (Leader → Ban Giám đốc → Kế toán)`, 'warning');
    }

    inFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const payload = {
        supplier_id: beneficiaryType === 'supplier' ? formData.supplier_id : null,
        beneficiary_type: beneficiaryType,
        beneficiary_id: beneficiaryType === 'employee' ? Number(selectedEmployeeId) : null,
        order_date: formData.order_date,
        notes: formData.notes,
        items: formData.items.map(i => ({
          product_id: i.product_id || null,
          name: i.name,
          quantity: Number(i.quantity) || 1,
          unit_cost: Math.max(0, Number(i.unit_cost) || 0),
          subtotal: Number(i.subtotal) || 0,
        })),
        subtotal,
        tax,
        tax_rate: taxRate,
        total,
        approver_id: formData.approver_id ? Number(formData.approver_id) : null,
        approver_id_2: formData.approver_id_2 ? Number(formData.approver_id_2) : null,
        approver_id_3: formData.approver_id_3 ? Number(formData.approver_id_3) : null,
      };

      if (editingPoId) {
        await api.put(`/purchase-orders/${editingPoId}`, payload);
        addToast('Đã cập nhật đơn nhập hàng thành công', 'success');
      } else {
        await api.post('/purchase-orders', payload);
        addToast('Đã tạo đơn nhập hàng mới', 'success');
      }
      window.dispatchEvent(new CustomEvent('erp-action-completed', { detail: { actionType: 'inventory_receipt' } }));
      try {
        localStorage.removeItem(PO_DRAFT_KEY);
      } catch {}
      setExistingDraft(null);
      setEditingPoId(null);
      setEditingPoNumber('');
      setShowModal(false);
      setBeneficiaryType('supplier');
      setSelectedEmployeeId('');
      setFormData({
        supplier_id: '',
        order_date: getLocalDateStr(),
        notes: '',
        items: [],
        tax_rate: 0,
        approver_id: '',
        approver_id_2: '',
        approver_id_3: ''
      });
      await fetchOrders();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi lưu đơn hàng', 'error');
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleReceive = (id: number) => {
    if (inFlightRef.current || isSubmitting || !canReceiveInventory) return;
    showConfirm({
      title: 'Nhập kho hàng hóa',
      message: 'Hệ thống sẽ cộng số lượng sản phẩm vào kho và ghi nhận công nợ. Bạn xác nhận đã nhận đủ hàng?',
      confirmText: 'Xác nhận nhập kho',
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        setIsSubmitting(true);
        try {
          await api.post(`/purchase-orders/${id}/receive`);
          addToast('Đã nhập kho thành công', 'success');
          await fetchOrders();
        } catch (err: any) {
          addToast(err.response?.data?.message || 'Lỗi khi nhập kho', 'error');
        } finally {
          inFlightRef.current = false;
          setIsSubmitting(false);
          closeConfirm();
        }
      }
    });
  };

  const filteredProducts = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return ensureArray<any>(products).filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q)
    );
  }, [products, searchTerm]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.toLowerCase().trim();
    return ensureArray<any>(orders).filter(o => {
      if (orderStatusFilter !== 'all') {
        if (orderStatusFilter === 'rejected' && o.status !== 'cancelled' && o.status !== 'rejected') return false;
        if (orderStatusFilter !== 'rejected' && o.status !== orderStatusFilter) return false;
      }
      if (!q) return true;
      const hay = `${o.po_number || ''} ${o.supplier_name || ''} ${o.creator_name || ''} ${o.notes || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orders, orderSearch, orderStatusFilter]);

  const handleExportPoCsv = () => {
    if (filteredOrders.length === 0) {
      addToast('Không có đơn nhập hàng nào để xuất', 'warning');
      return;
    }
    const headers = ['Mã đơn PO', 'Nhà cung cấp / Người nhận', 'Người tạo', 'Ngày đặt', 'Tạm tính (VND)', 'Thuế VAT (VND)', 'Tổng tiền (VND)', 'Trạng thái', 'Ghi chú'];
    const rows = filteredOrders.map(o => [
      csvSafe(o.po_number || `#PO-${o.id}`),
      csvSafe(o.supplier_name || o.beneficiary_name || '—'),
      csvSafe(o.creator_name || '—'),
      csvSafe(formatDateVN(o.order_date) || '—'),
      csvSafe(Number(o.subtotal) || 0),
      csvSafe(Number(o.tax) || 0),
      csvSafe(Number(o.total) || 0),
      csvSafe(o.status || ''),
      csvSafe(o.notes || ''),
    ].join(','));
    const csvContent = `\uFEFF${headers.map(csvSafe).join(',')}\n${rows.join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `don-nhap-hang-po-${getLocalDateStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast(`Đã xuất ${filteredOrders.length} đơn PO ra CSV`, 'success');
  };

  const supplierSelectOptions = useMemo(() => {
    return ensureArray<any>(suppliers).map(s => ({ value: String(s.id), label: s.name }));
  }, [suppliers]);

  const employeeSelectOptions = useMemo(() => {
    return ensureArray<any>(users).map((u: any) => ({
      value: String(u.id),
      label: u.full_name || u.name || `Nhân viên #${u.id}`,
      avatar: u.avatar_url || u.avatar,
      sublabel: [
        u.role || '',
        u.bank_name ? `${u.bank_name}: ${u.bank_account}` : 'Chưa có STK'
      ].filter(Boolean).join(' • ')
    }));
  }, [users]);

  const approverUserOptions = useMemo(() => {
    return ensureArray<any>(users).map((u: any) => ({
      value: String(u.id),
      label: u.full_name || u.name,
      avatar: u.avatar_url || u.avatar,
      sublabel: [u.phone, u.email].filter(Boolean).join(' - ')
    }));
  }, [users]);

  const org = config?.organization;
  const orgName = getTenantOrganizationName();
  const orgLogo = getTenantLogoUrl();

  return (
    <>
      <div className="animate-fade">
        {/* Toolbar */}
        <div className="card-panel mb-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '0.85rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', flex: 1 }}>
            <div className="filter-search" style={{ flex: 1, minWidth: '210px' }}>
              <Search size={16} className="text-muted" />
              <input
                placeholder="Tìm mã đơn PO, nhà cung cấp, người tạo..."
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)}
              />
            </div>
            <div style={{ width: '180px' }}>
              <CustomSelect
                options={[
                  { value: 'all', label: 'Tất cả trạng thái' },
                  { value: 'pending_approval', label: 'Chờ duyệt' },
                  { value: 'ordered', label: 'Đã duyệt / Đặt hàng' },
                  { value: 'received', label: 'Đã nhập kho' },
                  { value: 'rejected', label: 'Từ chối / Hủy' },
                ]}
                value={orderStatusFilter}
                onChange={val => setOrderStatusFilter(String(val))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" className="btn outline sm" onClick={handleExportPoCsv} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Download size={14} /> Xuất CSV
            </button>
            {!isSale && (
              <button type="button" className="btn primary sm" onClick={() => setShowModal(true)} style={{ background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={14} /> Tạo đơn PO
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="spinner sm"></div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <EmptyCard 
            icon={<ShoppingCart size={48} />}
            title="Chưa có đơn nhập hàng nào"
            description="Bắt đầu tạo đơn nhập hàng để quản lý kho và công nợ nhà cung cấp."
            actionText={isSale ? undefined : "Tạo đơn đầu tiên"}
            onAction={isSale ? undefined : () => setShowModal(true)}
          />
        ) : (
          <div className="card overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>MÃ ĐƠN</th>
                    <th>NHÀ CUNG CẤP</th>
                    <th>NGÀY ĐẶT</th>
                    <th style={{ textAlign: 'right' }}>TỔNG TIỀN</th>
                    <th>TRẠNG THÁI</th>
                    <th style={{ textAlign: 'right' }}>THAO TÁC</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(o => {
                    let statusColor = '#475569';
                    let statusBg = '#F1F5F9';
                    let statusLabel = 'Nháp';
                    if (o.status === 'received') {
                      statusColor = '#0F172A';
                      statusBg = 'rgba(15, 23, 42, 0.08)';
                      statusLabel = 'Đã nhập kho';
                    } else if (o.status === 'ordered' || o.approval_status === 'approved') {
                      statusColor = '#0F172A';
                      statusBg = 'rgba(15, 23, 42, 0.06)';
                      statusLabel = 'Đã duyệt / Đặt hàng';
                    } else if (o.status === 'pending_approval' || o.status === 'pending') {
                      statusColor = '#334155';
                      statusBg = '#F1F5F9';
                      statusLabel = 'Chờ duyệt';
                    } else if (o.status === 'cancelled' || o.status === 'rejected') {
                      statusColor = '#BD1D2D';
                      statusBg = 'rgba(189, 29, 45, 0.08)';
                      statusLabel = 'Từ chối';
                    }

                    // Active approver check
                    let isActiveApprover = false;
                    const curUserId = Number(user?.id);
                    const isCreator = Number(o.created_by) === curUserId;

                    if ((o.status === 'pending_approval' || o.status === 'pending') && !isCreator) {
                      if (o.status_level_1 === 'pending') {
                        if (Number(o.approver_id) === curUserId || isAdminOrExec) isActiveApprover = true;
                      } else if (o.status_level_1 === 'approved' && o.status_level_2 === 'pending') {
                        if (Number(o.approver_id_2) === curUserId || isAdminOrExec) isActiveApprover = true;
                      } else if (o.status_level_1 === 'approved' && o.status_level_2 === 'approved' && o.status_level_3 === 'pending') {
                        if (Number(o.approver_id_3) === curUserId || isAdminOrExec) isActiveApprover = true;
                      }
                    }

                    const isReadyToReceive = (o.status === 'ordered' || o.approval_status === 'approved') && o.status !== 'received' && o.status !== 'cancelled' && o.status !== 'rejected';

                    return (
                      <tr key={o.id} className="table-row-hover group">
                        <td>
                          <span className="font-bold text-xs font-mono px-2 py-1 rounded tabular-nums" style={{ color: '#BD1D2D', background: 'rgba(189, 29, 45, 0.08)' }}>{o.po_number || `#PO-${o.id}`}</span>
                        </td>
                        <td>
                          <div className="flex items-center gap-3">
                            <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Truck size={15} />
                            </div>
                            <div>
                              <span className="font-bold text-sm" style={{ color: '#0F172A' }}>{o.supplier_name || o.beneficiary_name || 'Nội bộ'}</span>
                              <div className="text-[11px]" style={{ color: '#64748B', marginTop: '2px' }}>Tạo bởi: {o.creator_name || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#475569' }}>
                            <Calendar size={14} style={{ color: '#64748B' }} /> {formatDateVN(o.order_date) || '—'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="font-bold text-sm tabular-nums" style={{ color: '#BD1D2D' }}>
                            {FMT(o.total)}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-col gap-1">
                            <span style={{ alignSelf: 'flex-start', padding: '3px 9px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, color: statusColor, background: statusBg }}>
                              {statusLabel}
                            </span>
                            {(o.status === 'cancelled' || o.status === 'rejected') && o.reject_reason && (
                              <span style={{ fontSize: '0.7rem', color: '#BD1D2D' }} title={o.reject_reason}>
                                Lý do: {o.reject_reason}
                              </span>
                            )}

                            {/* Approval levels info */}
                            {o.approver_id && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px', fontSize: '11px', color: '#64748B' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {o.status_level_1 === 'approved' ? (
                                    <CheckCircle2 size={11} color="#0F172A" />
                                  ) : o.status_level_1 === 'rejected' ? (
                                    <XCircle size={11} color="#BD1D2D" />
                                  ) : (
                                    <Clock size={11} color="#64748B" />
                                  )}
                                  <span style={{ fontWeight: 600, color: o.status_level_1 === 'rejected' ? '#BD1D2D' : '#334155' }}>
                                    Cấp 1: {o.approver_name_1 || '—'}
                                  </span>
                                </div>
                                {o.approver_id_2 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {o.status_level_2 === 'approved' ? (
                                      <CheckCircle2 size={11} color="#0F172A" />
                                    ) : o.status_level_2 === 'rejected' ? (
                                      <XCircle size={11} color="#BD1D2D" />
                                    ) : (
                                      <Clock size={11} color="#64748B" />
                                    )}
                                    <span style={{ fontWeight: 600, color: o.status_level_2 === 'rejected' ? '#BD1D2D' : '#334155' }}>
                                      {o.approver_id_3 ? 'Cấp 2 (BGD):' : 'Cấp 2 (Kế toán):'} {o.approver_name_2 || '—'}
                                    </span>
                                  </div>
                                )}
                                {o.approver_id_3 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {o.status_level_3 === 'approved' ? (
                                      <CheckCircle2 size={11} color="#0F172A" />
                                    ) : o.status_level_3 === 'rejected' ? (
                                      <XCircle size={11} color="#BD1D2D" />
                                    ) : (
                                      <Clock size={11} color="#64748B" />
                                    )}
                                    <span style={{ fontWeight: 600, color: o.status_level_3 === 'rejected' ? '#BD1D2D' : '#334155' }}>
                                      Cấp 3 (Kế toán): {o.approver_name_3 || '—'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="flex flex-col gap-1.5 items-end">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                className="btn-icon sm"
                                title="Xem / In đơn PO"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleOpenPrintPo(o);
                                }}
                              >
                                <Printer size={13} />
                              </button>
                              {!isSale && (
                                <button
                                  type="button"
                                  className="btn-icon sm"
                                  title="Nhân bản đơn nhập hàng"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleOpenEditPO(o, true);
                                  }}
                                >
                                  <Copy size={13} />
                                </button>
                              )}
                              {!isSale && (o.status === 'pending' || o.status === 'pending_approval' || o.status === 'draft' || o.status === 'cancelled' || o.status === 'rejected') && (isCreator || isAdminOrExec) && (
                                <button
                                  type="button"
                                  className="btn-icon sm"
                                  title="Chỉnh sửa đơn nhập hàng"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleOpenEditPO(o, false);
                                  }}
                                >
                                  <Pencil size={13} />
                                </button>
                              )}
                            </div>
                            {isReadyToReceive && canReceiveInventory && (
                              <button type="button" className="btn primary sm inline-flex items-center justify-center gap-2" style={{ background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }} onClick={() => handleReceive(o.id)}>
                                <Package size={14} /> Nhập kho
                              </button>
                            )}
                            {o.status === 'received' && (
                              <div className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: '#0F172A' }}>
                                <CheckCircle2 size={14} /> Hoàn tất
                              </div>
                            )}
                            {(o.status === 'cancelled' || o.status === 'rejected') && (
                              <div className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: '#BD1D2D' }}>
                                <XCircle size={14} /> Bị từ chối
                              </div>
                            )}

                            {isActiveApprover && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <button
                                  type="button"
                                  className="btn primary sm"
                                  onClick={() => handleApproveConfirm(o)}
                                  disabled={isSubmitting}
                                  style={{ padding: '2px 10px', fontSize: '11px', height: '26px', minHeight: 'unset', background: '#0F172A', borderColor: '#0F172A', color: '#FFFFFF' }}
                                >
                                  Duyệt
                                </button>
                                <button
                                  type="button"
                                  className="btn outline sm"
                                  onClick={() => { setRejectModalPoId(o.id); setRejectReasonInput(''); }}
                                  disabled={isSubmitting}
                                  style={{ padding: '2px 10px', fontSize: '11px', height: '26px', minHeight: 'unset', borderColor: '#BD1D2D', color: '#BD1D2D' }}
                                >
                                  Từ chối
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* PO Create / Edit Modal */}
      {typeof document !== 'undefined' && ReactDOM.createPortal(
        <AnimatePresence>
          {showModal && (
            <motion.div
              key="po-editor-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
              className="overlay-backdrop"
              onClick={handleRequestClose}
              style={{ zIndex: zModalNested, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <motion.div
                key="po-editor-sheet"
                className="modal-sheet modal-xl shadow-2xl"
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                style={{ height: '90vh', overflow: 'hidden', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="modal-header" style={{ padding: '1.25rem 2rem', borderBottom: '1px solid #E2E8F0' }}>
                  <div className="flex items-center gap-4">
                    <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ShoppingCart size={22} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                        {editingPoId ? `Chỉnh sửa đơn nhập hàng ${editingPoNumber || `#PO-${editingPoId}`}` : 'Tạo đơn nhập hàng mới'}
                      </h3>
                      <p style={{ fontSize: '0.73rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '3px', marginBottom: 0 }}>
                        Thiết lập đối tượng thanh toán, hạng mục & quy trình phê duyệt
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={handleExplicitSaveDraft}
                      style={{
                        height: '36px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        borderRadius: '10px'
                      }}
                      title="Lưu bản nháp đơn hàng"
                    >
                      <FileText size={15} style={{ flexShrink: 0 }} />
                      <span>Lưu nháp</span>
                    </button>
                    <button type="button" className="btn-icon" onClick={handleRequestClose} style={{ width: '38px', height: '38px', borderRadius: '10px' }}>
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Body: 2 Columns */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 290px', flex: 1, minHeight: 0, backgroundColor: '#F8FAFC' }}>

                  {/* Left Column: Form & Selected Items */}
                  <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', borderRight: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                    <div style={{ padding: '1.25rem 1.5rem 60px 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                      {/* Draft Notification Banner */}
                      {existingDraft && (
                        <div style={{
                          padding: '0.75rem 1rem',
                          borderRadius: '12px',
                          background: 'rgba(189, 29, 45, 0.05)',
                          border: '1px solid rgba(189, 29, 45, 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          flexWrap: 'wrap'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', color: '#0F172A' }}>
                            <FileText size={16} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                            <span>
                              Có 1 bản nháp đơn nhập hàng đã lưu lúc <strong>{existingDraft.savedAt ? new Date(existingDraft.savedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''}</strong>
                              {existingDraft.formData?.items?.length ? ` (${existingDraft.formData.items.length} sản phẩm)` : ''}.
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
                                background: '#BD1D2D',
                                color: '#fff',
                                borderRadius: '8px',
                                border: 'none',
                                cursor: 'pointer',
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
                                color: '#64748B',
                                borderRadius: '8px',
                                border: '1px solid #E2E8F0',
                                cursor: 'pointer'
                              }}
                            >
                              Xóa nháp
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Beneficiary + Basic Info */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                            Đối tượng thanh toán PO <span style={{ color: '#BD1D2D' }}>*</span>
                          </span>
                          <div style={{ display: 'inline-flex', padding: '3px', borderRadius: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', gap: '2px' }}>
                            <button
                              type="button"
                              onClick={() => setBeneficiaryType('supplier')}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                height: '32px',
                                padding: '0 14px',
                                borderRadius: '7px',
                                fontSize: '0.8rem',
                                fontWeight: beneficiaryType === 'supplier' ? 700 : 600,
                                border: 'none',
                                background: beneficiaryType === 'supplier' ? '#ffffff' : 'transparent',
                                color: beneficiaryType === 'supplier' ? '#BD1D2D' : '#64748b',
                                boxShadow: beneficiaryType === 'supplier' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <Truck size={14} />
                              <span>Nhà cung cấp</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setBeneficiaryType('employee')}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                height: '32px',
                                padding: '0 14px',
                                borderRadius: '7px',
                                fontSize: '0.8rem',
                                fontWeight: beneficiaryType === 'employee' ? 700 : 600,
                                border: 'none',
                                background: beneficiaryType === 'employee' ? '#ffffff' : 'transparent',
                                color: beneficiaryType === 'employee' ? '#BD1D2D' : '#64748b',
                                boxShadow: beneficiaryType === 'employee' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <Users size={14} />
                              <span>Nhân viên</span>
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '1rem' }}>
                          {beneficiaryType === 'supplier' ? (
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <Truck size={13} /> Nhà cung cấp <span style={{ color: '#BD1D2D' }}>*</span>
                              </label>
                              <CustomSelect
                                options={supplierSelectOptions}
                                value={formData.supplier_id}
                                onChange={val => setFormData({ ...formData, supplier_id: String(val) })}
                                placeholder="-- Chọn nhà cung cấp --"
                                searchable
                              />
                            </div>
                          ) : (
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <Users size={13} /> Nhân viên thanh toán <span style={{ color: '#BD1D2D' }}>*</span>
                              </label>
                              <CustomSelect
                                options={employeeSelectOptions}
                                value={selectedEmployeeId}
                                onChange={val => {
                                  const empId = String(val);
                                  setSelectedEmployeeId(empId);
                                  const emp = users.find((u: any) => String(u.id) === empId);
                                  const empName = emp ? (emp.full_name || emp.name || '') : '';
                                  if (emp && (emp.bank_name || emp.bank_account)) {
                                    const bankInfo = `[Thông tin chuyển khoản]: ${emp.bank_name || ''} - STK: ${emp.bank_account || ''} - Chủ TK: ${empName.toUpperCase()}`;
                                    setFormData(prev => {
                                      const clean = prev.notes ? prev.notes.replace(/\[Thông tin chuyển khoản\]:[^\n]*/g, '').trim() : '';
                                      return {
                                        ...prev,
                                        notes: clean ? `${bankInfo}\n${clean}` : bankInfo
                                      };
                                    });
                                    addToast(`Đã tự động điền STK của ${empName}`, 'success');
                                  } else if (emp) {
                                    addToast(`Đã chọn nhân viên: ${empName}`, 'info');
                                  }
                                }}
                                placeholder="-- Chọn nhân viên --"
                                searchable
                                showAvatars
                              />
                            </div>
                          )}
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                              <Calendar size={13} /> Ngày dự kiến
                            </label>
                            <VietnameseDateInput
                              value={formData.order_date}
                              onChange={val => setFormData({ ...formData, order_date: val })}
                              inputStyle={{ height: '2.5rem', fontSize: '0.85rem', fontWeight: 600, borderRadius: '10px' }}
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                              Thuế suất VAT (%)
                            </label>
                            <CustomSelect
                              options={safeVatOptions}
                              value={String(formData.tax_rate || 0)}
                              onChange={val => setFormData({ ...formData, tax_rate: Number(val) })}
                              placeholder="Chọn thuế suất"
                            />
                          </div>
                        </div>

                        {beneficiaryType === 'employee' && selectedEmployeeId && (() => {
                          const emp = users.find((u: any) => String(u.id) === selectedEmployeeId);
                          if (!emp) return null;
                          return (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              borderRadius: '10px',
                              background: emp.bank_account ? 'rgba(15, 23, 42, 0.04)' : 'rgba(189, 29, 45, 0.06)',
                              border: `1px solid ${emp.bank_account ? '#E2E8F0' : 'rgba(189, 29, 45, 0.2)'}`,
                              fontSize: '0.78rem'
                            }}>
                              <span style={{ color: emp.bank_account ? '#0F172A' : '#BD1D2D', fontWeight: 600 }}>
                                {emp.bank_account
                                  ? `✓ STK đồng bộ (${orgName}): ${emp.bank_name || 'Ngân hàng'} - ${emp.bank_account} (Chủ TK: ${(emp.full_name || '').toUpperCase()})`
                                  : 'Nhân viên chưa cập nhật STK trong hồ sơ cá nhân'}
                              </span>
                              <span style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 600 }}>
                                {emp.role || 'Nhân viên'}
                              </span>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Phê duyệt & Vận hành Card */}
                      <div style={{
                        padding: '1.25rem',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                      }}>
                        <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CheckCircle2 size={16} color="#BD1D2D" /> Phê duyệt & Vận hành
                        </h4>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                          {/* Creator Block */}
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label" style={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748B' }}>Người tạo</label>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '6px 12px',
                              background: '#FFFFFF',
                              border: '1px solid #E2E8F0',
                              borderRadius: '10px',
                              height: '38px'
                            }}>
                              <Avatar src={user?.avatar_url || user?.avatar} name={user?.name || user?.username} size="sm" />
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0F172A' }}>{user?.name || user?.username}</span>
                            </div>
                          </div>

                          {/* Threshold info */}
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: '#FFFFFF', border: '1px dashed #CBD5E1', borderRadius: '12px', padding: '8px 12px' }}>
                            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: '#64748B' }}>
                              Hạn mức duyệt 3 cấp:
                            </span>
                            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#BD1D2D', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                              {FMT(threshold)}
                            </span>
                            {(() => {
                              const subtotal = calculateTotal();
                              const taxRate = Number(formData.tax_rate || 0);
                              const tax = Math.round((subtotal * taxRate) / 100);
                              const total = subtotal + tax;
                              if (total >= threshold) {
                                return (
                                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#BD1D2D', marginTop: '2px' }}>
                                    Từ {formatThresholdShort(threshold)}: Duyệt 3 cấp (Leader → Ban Giám đốc → Kế toán)
                                  </span>
                                );
                              }
                              return (
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', marginTop: '2px' }}>
                                  Dưới {formatThresholdShort(threshold)}: Duyệt 2 cấp (Leader → Kế toán)
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Stacked Approvers */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                              Cấp 1: Trưởng nhóm / Quản lý <span style={{ color: '#BD1D2D' }}>*</span>
                            </label>
                            <CustomSelect
                              options={approverUserOptions}
                              value={formData.approver_id}
                              onChange={val => {
                                manualApproversRef.current.l1 = true;
                                setFormData({ ...formData, approver_id: String(val) });
                              }}
                              placeholder="Chọn người duyệt Cấp 1..."
                              searchable
                              showAvatars
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                              {(() => {
                                const subtotal = calculateTotal();
                                const tax = Math.round((subtotal * Number(formData.tax_rate || 0)) / 100);
                                const total = subtotal + tax;
                                return total >= threshold ? (
                                  <>Cấp 2: Ban Giám đốc <span style={{ color: '#BD1D2D' }}>*</span></>
                                ) : (
                                  <>Cấp 2: Kế toán <span style={{ color: '#BD1D2D' }}>*</span></>
                                );
                              })()}
                            </label>
                            <CustomSelect
                              options={approverUserOptions}
                              value={formData.approver_id_2}
                              onChange={val => {
                                manualApproversRef.current.l2 = true;
                                setFormData({ ...formData, approver_id_2: String(val) });
                              }}
                              placeholder="Chọn người duyệt Cấp 2..."
                              searchable
                              showAvatars
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                              {(() => {
                                const subtotal = calculateTotal();
                                const tax = Math.round((subtotal * Number(formData.tax_rate || 0)) / 100);
                                const total = subtotal + tax;
                                return total >= threshold ? (
                                  <>Cấp 3: Kế toán <span style={{ color: '#BD1D2D' }}>*</span></>
                                ) : (
                                  <>Cấp 3 <span style={{ fontSize: '0.7rem', fontWeight: 500, color: '#64748B' }}>(Từ {formatThresholdShort(threshold)} trở lên)</span></>
                                );
                              })()}
                            </label>
                            <CustomSelect
                              options={approverUserOptions}
                              value={formData.approver_id_3}
                              onChange={val => {
                                manualApproversRef.current.l3 = true;
                                setFormData({ ...formData, approver_id_3: String(val) });
                              }}
                              placeholder="-- Không áp dụng --"
                              searchable
                              showAvatars
                            />
                          </div>
                        </div>
                      </div>

                      {/* Order Notes */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>
                          Ghi chú đơn hàng (Notes)
                        </label>
                        <textarea
                          className="form-input"
                          placeholder="Nhập ghi chú chi tiết cho đơn nhập hàng này..."
                          style={{ height: '3.5rem', fontSize: '0.85rem', fontWeight: 600, borderRadius: '10px', resize: 'vertical' }}
                          value={formData.notes}
                          onChange={e => setFormData({ ...formData, notes: e.target.value })}
                        />
                      </div>

                      {/* Selected Products */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div className="flex items-center justify-between">
                          <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', margin: 0 }}>
                            Danh sách sản phẩm / hạng mục ({formData.items.length})
                          </label>
                          <button type="button" className="btn outline sm" onClick={handleAddManualItem} style={{ fontSize: '0.75rem', height: '30px', gap: '4px' }}>
                            <Plus size={13} /> Thêm mục thủ công
                          </button>
                        </div>

                        {formData.items.length === 0 ? (
                          <div style={{ padding: '2rem', border: '2px dashed #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
                            <Package size={36} style={{ color: '#94A3B8', marginBottom: '0.75rem' }} />
                            <p style={{ fontWeight: 700, color: '#475569', fontSize: '0.85rem', margin: 0 }}>Chưa có sản phẩm nào</p>
                            <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '4px 0 0', textAlign: 'center' }}>Chọn sản phẩm từ danh mục bên phải hoặc nhấn &quot;Thêm mục thủ công&quot;</p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {formData.items.map((item, idx) => (
                              <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                key={idx}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', flexWrap: 'wrap' }}
                              >
                                <div style={{ flex: 1, minWidth: '140px' }}>
                                  <input
                                    type="text"
                                    value={item.name}
                                    onChange={e => handleItemNameChange(idx, e.target.value)}
                                    style={{ width: '100%', border: 'none', background: 'transparent', fontWeight: 650, fontSize: '0.85rem', color: '#0F172A', outline: 'none' }}
                                  />
                                </div>
                                {/* Editable Unit Cost */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '125px' }}>
                                  <input
                                    type="text"
                                    title="Đơn giá nhập (VND)"
                                    value={item.unit_cost ? Number(item.unit_cost).toLocaleString('en-US') : ''}
                                    onChange={e => {
                                      const digits = e.target.value.replace(/\D/g, '');
                                      handleUnitCostChange(idx, digits ? Number(digits) : 0);
                                    }}
                                    placeholder="Đơn giá"
                                    style={{ width: '100%', height: '30px', padding: '0 8px', textAlign: 'right', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.78rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#BD1D2D' }}
                                  />
                                  <span style={{ fontSize: '0.7rem', color: '#64748B' }}>đ</span>
                                </div>
                                {/* Qty Stepper */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#FFFFFF', padding: '2px 4px', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                                  <button type="button" className="btn-icon sm" style={{ border: 'none', background: 'transparent', width: '20px', height: '20px' }} onClick={() => handleQtyChange(idx, item.quantity - 1)}>
                                    <MinusCircle size={14} />
                                  </button>
                                  <span style={{ minWidth: '22px', textAlign: 'center', fontWeight: 700, fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</span>
                                  <button type="button" className="btn-icon sm" style={{ border: 'none', background: 'transparent', width: '20px', height: '20px' }} onClick={() => handleQtyChange(idx, item.quantity + 1)}>
                                    <PlusCircle size={14} />
                                  </button>
                                </div>
                                <div style={{ width: '105px', textAlign: 'right', fontWeight: 800, fontSize: '0.85rem', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                  {FMT(item.subtotal)}
                                </div>
                                <button type="button" className="btn-icon" style={{ color: '#BD1D2D', border: 'none', background: 'transparent', width: '28px', height: '28px' }} onClick={() => handleRemoveItem(idx)}>
                                  <Trash2 size={16} />
                                </button>
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Summary Box */}
                    <div style={{ marginTop: 'auto', padding: '1.25rem 1.5rem', borderTop: '1px solid #E2E8F0' }}>
                      {(() => {
                        const subtotal = calculateTotal();
                        const taxRate = Number(formData.tax_rate || 0);
                        const tax = Math.round((subtotal * taxRate) / 100);
                        const total = subtotal + tax;
                        return (
                          <div style={{ padding: '1rem 1.5rem', backgroundColor: '#0F172A', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '0.5rem', color: '#fff', boxShadow: '0 8px 20px -5px rgba(15, 23, 42, 0.25)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)' }}>
                              <span>Tạm tính (Subtotal):</span>
                              <span className="tabular-nums">{FMT(subtotal)}</span>
                            </div>
                            {tax > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)' }}>
                                <span>Thuế VAT ({taxRate}%):</span>
                                <span className="tabular-nums">{FMT(tax)}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed rgba(255,255,255,0.18)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                              <div>
                                <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Tổng thanh toán</p>
                                <p style={{ fontSize: '1.25rem', fontWeight: 800, margin: '2px 0 0', color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>{FMT(total)}</p>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Hình thức</p>
                                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', margin: '2px 0 0' }}>Công nợ / Chuyển khoản</p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Right Column: Search & Add Products */}
                  <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#F8FAFC' }}>
                    <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                      <div className="filter-search w-full" style={{ background: '#F8FAFC', borderRadius: '10px', padding: '0.5rem 0.75rem' }}>
                        <Search size={16} className="text-muted" />
                        <input
                          placeholder="Tìm theo tên hoặc SKU..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          style={{ fontSize: '0.8rem', fontWeight: 600 }}
                        />
                      </div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
                      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '0.75rem', paddingLeft: '0.25rem', marginTop: 0 }}>
                        Danh mục ({filteredProducts.length})
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {filteredProducts.map(p => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => handleAddItem(p)}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '0.625rem 0.75rem', borderRadius: '10px', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0',
                              cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#BD1D2D'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; }}
                          >
                            <div style={{ flex: 1, minWidth: 0, paddingRight: '0.5rem' }}>
                              <p style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0F172A', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '3px' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 4px', backgroundColor: '#F1F5F9', color: '#475569', borderRadius: '3px' }}>{p.sku || 'N/A'}</span>
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B' }}>Tồn: {p.stock_quantity || 0}</span>
                              </div>
                            </div>
                            <div style={{ width: '26px', height: '26px', borderRadius: '8px', backgroundColor: 'rgba(189, 29, 45, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#BD1D2D', flexShrink: 0 }}>
                              <Plus size={14} />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="modal-footer" style={{ padding: '1.25rem 2rem', backgroundColor: '#FFFFFF', borderTop: '1px solid #E2E8F0', zIndex: 10 }}>
                  {beneficiaryType === 'supplier' && suppliers.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(189, 29, 45, 0.06)', padding: '0.85rem 1.25rem', borderRadius: '14px', border: '1px solid rgba(189, 29, 45, 0.25)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <AlertCircle style={{ color: '#BD1D2D' }} size={22} />
                        <div>
                          <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#BD1D2D', margin: 0 }}>Chưa có Nhà cung cấp</p>
                          <p style={{ fontSize: '0.75rem', fontWeight: 500, color: '#475569', margin: 0 }}>Bạn cần khởi tạo Nhà cung cấp hoặc chuyển sang tab Nhân viên để thanh toán PO nội bộ.</p>
                        </div>
                      </div>
                      <button type="button" className="btn primary sm" style={{ background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }} onClick={() => navigate('/suppliers')}>Khởi tạo NCC</button>
                    </div>
                  ) : (
                    <>
                      <button type="button" className="btn secondary" onClick={handleRequestClose} disabled={isSubmitting}>Hủy bỏ</button>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={handleExplicitSaveDraft}
                        disabled={isSubmitting}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        title="Lưu bản nháp đơn nhập hàng"
                      >
                        <FileText size={15} style={{ flexShrink: 0 }} />
                        <span>Lưu nháp</span>
                      </button>
                      <button type="button" className="btn primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 1.75rem', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }} onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 size={18} className="spin" /> : (editingPoId ? 'Lưu cập nhật đơn hàng' : 'Xác nhận tạo đơn PO')}
                        {!isSubmitting && <ArrowUpRight size={18} />}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Reject Reason Modal */}
      {typeof document !== 'undefined' && ReactDOM.createPortal(
        <AnimatePresence>
          {rejectModalPoId !== null && (
            <motion.div
              key="po-reject-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)', zIndex: zModalNested + 2, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
              onClick={() => !isSubmitting && setRejectModalPoId(null)}
            >
              <motion.form
                key="po-reject-dialog"
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                onSubmit={handleSubmitReject}
                onClick={e => e.stopPropagation()}
                style={{ width: '100%', maxWidth: '460px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 25px 60px rgba(15, 23, 42, 0.25)', overflow: 'hidden' }}
              >
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#BD1D2D' }}>Từ chối đơn nhập hàng PO</h4>
                  <button type="button" className="btn-icon sm" onClick={() => !isSubmitting && setRejectModalPoId(null)}><X size={18} /></button>
                </div>
                <div style={{ padding: '1.25rem' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Lý do từ chối <span style={{ color: '#BD1D2D' }}>*</span></label>
                  <textarea
                    className="form-input"
                    rows={3}
                    required
                    autoFocus
                    placeholder="Nhập lý do từ chối cụ thể để người tạo chỉnh sửa..."
                    value={rejectReasonInput}
                    onChange={e => setRejectReasonInput(e.target.value)}
                  />
                </div>
                <div style={{ padding: '0.9rem 1.25rem', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="button" className="btn outline sm" disabled={isSubmitting} onClick={() => setRejectModalPoId(null)}>Hủy</button>
                  <button type="submit" className="btn primary sm" disabled={isSubmitting} style={{ background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }}>
                    {isSubmitting ? 'Đang gửi...' : 'Xác nhận từ chối'}
                  </button>
                </div>
              </motion.form>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Printable PO Summary Modal */}
      {typeof document !== 'undefined' && ReactDOM.createPortal(
        <AnimatePresence>
          {printPo && (
            <motion.div
              key="po-print-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)', zIndex: zModalNested + 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
              onClick={() => setPrintPo(null)}
            >
              <motion.div
                key="po-print-card"
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                onClick={e => e.stopPropagation()}
                style={{ width: '100%', maxWidth: '820px', maxHeight: '90vh', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 25px 60px rgba(15, 23, 42, 0.28)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
              >
                <div className="no-print" style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Printer size={18} style={{ color: '#BD1D2D' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>Phiếu Đơn Mua Hàng — {printPo.po_number || `#PO-${printPo.id}`}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button type="button" className="btn primary sm" style={{ background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={() => window.print()}>
                      <Printer size={14} /> In / Lưu PDF
                    </button>
                    <button type="button" className="btn-icon sm" onClick={() => setPrintPo(null)}><X size={18} /></button>
                  </div>
                </div>

                <div style={{ padding: '28px 32px', overflowY: 'auto', background: '#FFFFFF', color: '#0F172A' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #BD1D2D', paddingBottom: '16px', marginBottom: '20px', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {orgLogo && <img src={orgLogo} alt={orgName} style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: '8px' }} />}
                      <div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>{orgName}</div>
                        {org?.address && <div style={{ fontSize: '0.75rem', color: '#475569' }}>{org.address}</div>}
                        <div style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {org?.tax_id && <span>MST: {org.tax_id}</span>}
                          {org?.support_hotline && <span>Hotline: {org.support_hotline}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#BD1D2D' }}>ĐƠN ĐẶT HÀNG (PO)</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, fontFamily: 'monospace' }}>{printPo.po_number || `#PO-${printPo.id}`}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>Ngày đặt: {formatDateVN(printPo.order_date) || '—'}</div>
                    </div>
                  </div>

                  <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', marginBottom: '18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.82rem' }}>
                    <div>
                      <span style={{ color: '#64748B' }}>Nhà cung cấp / Người nhận: </span>
                      <strong>{printPo.supplier_name || printPo.beneficiary_name || 'Nội bộ'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Người lập phiếu: </span>
                      <strong>{printPo.creator_name || '—'}</strong>
                    </div>
                    {printPo.notes && (
                      <div style={{ gridColumn: 'span 2', color: '#475569' }}>
                        <span>Ghi chú: </span>{printPo.notes}
                      </div>
                    )}
                  </div>

                  {printLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '2rem', color: '#64748B' }}>
                      <Loader2 size={16} className="spin" /> <span>Đang tải chi tiết đơn PO...</span>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: '18px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #CBD5E1' }}>
                          <th style={{ padding: '8px', textAlign: 'center', width: '44px' }}>STT</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Sản phẩm / Vật tư</th>
                          <th style={{ padding: '8px', textAlign: 'center', width: '75px' }}>SL</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '130px' }}>Đơn giá</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '140px' }}>Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ensureArray<any>(printPo.items).map((it: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                            <td style={{ padding: '8px', textAlign: 'center', color: '#64748B' }}>{idx + 1}</td>
                            <td style={{ padding: '8px', fontWeight: 600 }}>{it.product_name || it.name}</td>
                            <td style={{ padding: '8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Number(it.quantity) || 0}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{FMT(Number(it.unit_cost || it.price) || 0)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{FMT(Number(it.subtotal) || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '18px' }}>
                    <div style={{ width: '300px', borderTop: '1px solid #E2E8F0', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748B' }}>Tạm tính:</span>
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{FMT(printPo.subtotal)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748B' }}>Thuế VAT:</span>
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{FMT(printPo.tax)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #CBD5E1', paddingTop: '8px', fontSize: '1rem', fontWeight: 800, color: '#BD1D2D' }}>
                        <span>Tổng thanh toán:</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{FMT(printPo.total)}</span>
                      </div>
                      {Number(printPo.total) > 0 && (
                        <div style={{ fontSize: '0.72rem', color: '#475569', textAlign: 'right', fontStyle: 'italic' }}>
                          Bằng chữ: {numberToVietnameseText(Number(printPo.total))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Approver Chain Sign-offs */}
                  {printPo.approver_id && (
                    <div style={{ borderTop: '1px dashed #CBD5E1', paddingTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', textAlign: 'center', fontSize: '0.78rem' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#475569' }}>Duyệt Cấp 1</div>
                        <div style={{ marginTop: '4px', fontWeight: 700 }}>{printPo.approver_name_1 || '—'}</div>
                        <div style={{ fontSize: '0.7rem', color: printPo.status_level_1 === 'approved' ? '#0F172A' : '#BD1D2D' }}>{printPo.status_level_1 || 'pending'}</div>
                      </div>
                      {printPo.approver_id_2 && (
                        <div>
                          <div style={{ fontWeight: 700, color: '#475569' }}>{printPo.approver_id_3 ? 'Duyệt Cấp 2 (BGD)' : 'Duyệt Cấp 2 (Kế toán)'}</div>
                          <div style={{ marginTop: '4px', fontWeight: 700 }}>{printPo.approver_name_2 || '—'}</div>
                          <div style={{ fontSize: '0.7rem', color: printPo.status_level_2 === 'approved' ? '#0F172A' : '#BD1D2D' }}>{printPo.status_level_2 || 'pending'}</div>
                        </div>
                      )}
                      {printPo.approver_id_3 && (
                        <div>
                          <div style={{ fontWeight: 700, color: '#475569' }}>Duyệt Cấp 3 (Kế toán)</div>
                          <div style={{ marginTop: '4px', fontWeight: 700 }}>{printPo.approver_name_3 || '—'}</div>
                          <div style={{ fontSize: '0.7rem', color: printPo.status_level_3 === 'approved' ? '#0F172A' : '#BD1D2D' }}>{printPo.status_level_3 || 'pending'}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Draft Exit Confirmation Modal */}
      <DraftExitConfirmModal
        isOpen={showExitConfirm}
        onSaveDraft={handleSaveDraftAndExit}
        onDiscard={handleDiscardAndExit}
        onContinue={() => setShowExitConfirm(false)}
        title="Lưu bản nháp đơn nhập hàng PO?"
        message="Bạn có các thông tin đơn hàng đang nhập dở dang. Bạn có muốn lưu bản nháp để tiếp tục hoàn thiện sau không?"
        zIndex={zModalNested + 2}
      />
    </>
  );
};

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { 
  Package, Plus, Edit, Trash2, LayoutGrid, List, Search, 
  History, Share, Clock, CheckCircle, AlertTriangle, 
  ChevronDown, DollarSign, CalendarDays, Layers,
  X, Download, FileSpreadsheet, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/uiStore';
import { useTenantConfig } from '../contexts/TenantConfigContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { isSystemAdmin, isSales, isViewer } from '../utils/roleUtils';
import { ensureArray, extractArray } from '../utils/safeArray';
import { formatDateVN, formatDateTimeVN } from '../utils/dateUtils';
import { pushOverlay } from '../utils/overlayStack';
import { PurchaseOrdersTab } from '../components/PurchaseOrdersTab';
import api from '../api/axios';
import { downloadExportFile } from '../utils/exportHelper';
import { EmptyCard } from '../components/ui/EmptyCard';
import { Avatar } from '../components/ui/Avatar';
import { TableSkeleton, CardSkeleton } from '../components/ui/Skeleton';
import { useDebounce } from '../hooks/useDebounce';
import { Pagination } from '../components/ui/Pagination';
import { CustomSelect } from '../components/ui/CustomSelect';
import { InventorySyncModal } from '../components/ui/InventorySyncModal';
import { Tooltip } from '../components/ui/Tooltip';
import { useAuth } from '../contexts/AuthContext';
import { ResponsiveSegmentedTabs, ResponsiveActionGroup } from '../components/ui/MobileResponsiveTabs';

interface Batch {
  id: number;
  product_id: number;
  product_name: string;
  sku: string;
  category: string;
  unit: string;
  supplier_name: string;
  batch_code: string;
  import_date: string;
  expiry_date: string | null;
  import_price: number;
  selling_price?: number;
  price?: number;
  min_stock_level?: number;
  initial_qty: number;
  current_qty: number;
  notes: string | null;
  status: 'active' | 'archived';
}

interface InventoryLog {
  id: number;
  batch_id: number;
  action_type: 'IMPORT' | 'SALE' | 'EXPORT_INTERNAL' | 'ADJUST' | 'RETURN';
  qty_change: number;
  reason: string;
  creator_name: string;
  creator_avatar?: string;
  created_at: string;
}

interface InventorySummary {
  total_skus?: number;
  total_batches?: number;
  total_qty?: number;
  total_cost_value?: number;
  total_retail_value?: number;
  low_stock_count?: number;
  out_of_stock_count?: number;
}

const FMT = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Number(n) || 0)} đ`;

export default function InventoryPage() {
  const { user } = useAuth();
  const { hasPermission } = useTenantConfig();
  const invPageSizeSetting = useTypedSubSetting<number>('finance.ui_pagination_sizes', 'inventory', 10);
  const lowStockSetting = useTypedSubSetting<number>('finance.inventory_and_pos_policy', 'low_stock_fallback', 5);
  const defaultUnit = useTypedSubSetting<string>('finance.inventory_and_pos_policy', 'default_unit', 'cái');
  const zModalNested = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_modal_nested', 2147483646);
  const motionMs = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220);

  const pageSize = Number(invPageSizeSetting) > 0 ? Number(invPageSizeSetting) : 10;
  const lowThreshold = Number(lowStockSetting) >= 0 ? Number(lowStockSetting) : 5;

  const isSaleOrViewer = !user || isSales(user) || isViewer(user);
  const canWriteInventory = !isSaleOrViewer && (isSystemAdmin(user) || hasPermission('inventory', 'write'));
  const canSeeCost = !isSaleOrViewer && (isSystemAdmin(user) || hasPermission('inventory', 'write'));

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [showExportModal, setShowExportModal] = useState(false);
  const [showInventorySync, setShowInventorySync] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showPOModal, setShowPOModal] = useState(false);
  const [openPoId, setOpenPoId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'batches' | 'history' | 'purchase_orders'>('batches');
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [globalLogs, setGlobalLogs] = useState<(InventoryLog & { product_name: string; batch_code: string })[]>([]);
  const [summary, setSummary] = useState<InventorySummary>({
    total_skus: 0,
    total_batches: 0,
    total_qty: 0,
    total_cost_value: 0,
    total_retail_value: 0,
    low_stock_count: 0,
    out_of_stock_count: 0,
  });

  const [exportForm, setExportForm] = useState({ qty: '', reason: 'Hàng tặng/Quà tặng', receiver_id: '' });
  const [adjustForm, setAdjustForm] = useState({ new_qty: '', reason: 'Điều chỉnh kiểm kho' });
  const [receivers, setReceivers] = useState<{ value: string; label: string; sublabel?: string; avatar?: string }[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const { showConfirm, addToast, closeConfirm } = useUIStore(useShallow((s) => ({ showConfirm: s.showConfirm, addToast: s.addToast, closeConfirm: s.closeConfirm })));
  const location = useLocation();
  const [defaultSupplierId, setDefaultSupplierId] = useState<string | undefined>(undefined);

  const batchesAbortRef = useRef<AbortController | null>(null);
  const batchLogsAbortRef = useRef<AbortController | null>(null);
  const globalLogsAbortRef = useRef<AbortController | null>(null);
  const receiversAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!location.pathname.startsWith('/inventory') && !location.pathname.startsWith('/purchase-orders')) return;
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    const openIdParam = params.get('open_id');

    if (openIdParam && Number(openIdParam) > 0) {
      setActiveTab('purchase_orders');
      setOpenPoId(Number(openIdParam));
      params.delete('open_id');
      const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
      window.history.replaceState({}, '', cleanUrl);
    } else if (tabParam === 'purchase_orders' || tabParam === 'history' || tabParam === 'batches') {
      setActiveTab(tabParam);
    } else if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }

    if (location.state?.openPOCreate || params.get('create_po') === '1') {
      setActiveTab('purchase_orders');
      setShowPOModal(true);
      if (location.state?.defaultSupplierId || params.get('supplier_id')) {
        setDefaultSupplierId(String(location.state?.defaultSupplierId || params.get('supplier_id')));
      }
      if (params.has('create_po') || params.has('supplier_id')) {
        params.delete('create_po');
        params.delete('supplier_id');
        const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  }, [location.pathname, location.state, location.search]);

  useEffect(() => {
    if (!showPOModal) {
      setDefaultSupplierId(undefined);
    }
  }, [showPOModal]);

  useEffect(() => {
    if (!showExportModal) return;
    return pushOverlay('inventory-export-modal', () => {
      if (!isSaving) setShowExportModal(false);
    }, zModalNested);
  }, [showExportModal, isSaving, zModalNested]);

  useEffect(() => {
    if (!showAdjustModal) return;
    return pushOverlay('inventory-adjust-modal', () => {
      if (!isSaving) setShowAdjustModal(false);
    }, zModalNested);
  }, [showAdjustModal, isSaving, zModalNested]);

  useEffect(() => {
    if (!showHistoryModal) return;
    return pushOverlay('inventory-history-modal', () => setShowHistoryModal(false), zModalNested);
  }, [showHistoryModal, zModalNested]);

  const fetchReceivers = useCallback(async () => {
    receiversAbortRef.current?.abort();
    const controller = new AbortController();
    receiversAbortRef.current = controller;
    try {
      const res = await api.get('/contacts', { params: { limit: 100 }, signal: controller.signal });
      if (controller.signal.aborted) return;
      const list = extractArray<any>(res.data, 'items');
      setReceivers(list.map((c: any) => ({
        value: String(c.id),
        label: (c.full_name || '').trim() || `Khách hàng #${c.id}`,
        sublabel: c.phone || c.email || '',
        avatar: c.avatar_url
      })));
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
    }
  }, []);

  const fetchBatches = useCallback(async () => {
    batchesAbortRef.current?.abort();
    const controller = new AbortController();
    batchesAbortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    try {
      const params: any = {
        page,
        limit: pageSize,
        search: debouncedSearch,
        stock_status: statusFilter === 'all' ? '' : statusFilter,
        sort: sortBy.split('_')[0],
        order: sortBy.split('_')[1] === 'desc' ? 'DESC' : 'ASC'
      };
      const res = await api.get('/inventory', { params, signal });
      if (signal.aborted) return;
      const data = res.data?.data ?? res.data ?? {};
      setBatches(ensureArray<Batch>(data.items));
      setTotal(Number(data.total) || 0);
      if (data.summary) setSummary(data.summary);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || signal.aborted) return;
      addToast('Không thể tải dữ liệu tồn kho', 'error');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, sortBy, addToast]);

  const fetchBatchLogs = async (batchId: number) => {
    batchLogsAbortRef.current?.abort();
    const controller = new AbortController();
    batchLogsAbortRef.current = controller;
    const { signal } = controller;

    try {
      const res = await api.get(`/inventory/logs/${batchId}`, { signal });
      if (signal.aborted) return;
      if (res.data?.success !== false) {
        setLogs(extractArray<InventoryLog>(res.data, 'items', 'logs'));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || signal.aborted) return;
      addToast('Không thể tải lịch sử lô hàng', 'warning');
    }
  };

  const fetchGlobalLogs = useCallback(async () => {
    globalLogsAbortRef.current?.abort();
    const controller = new AbortController();
    globalLogsAbortRef.current = controller;
    const { signal } = controller;

    try {
      const res = await api.get('/inventory/global-logs', { params: { limit: 100 }, signal });
      if (signal.aborted) return;
      if (res.data?.success !== false) {
        setGlobalLogs(extractArray<InventoryLog & { product_name: string; batch_code: string }>(res.data, 'items', 'logs'));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || signal.aborted) return;
      addToast('Không thể tải lịch sử giao dịch kho', 'warning');
    }
  }, [addToast]);

  useEffect(() => {
    void fetchBatches();
    return () => {
      batchesAbortRef.current?.abort();
    };
  }, [fetchBatches]);

  useEffect(() => {
    void fetchGlobalLogs();
    void fetchReceivers();
    return () => {
      batchLogsAbortRef.current?.abort();
      globalLogsAbortRef.current?.abort();
      receiversAbortRef.current?.abort();
    };
  }, [fetchGlobalLogs, fetchReceivers]);

  useEffect(() => {
    if (activeTab === 'history') {
      void fetchGlobalLogs();
    }
  }, [activeTab, fetchGlobalLogs]);

  const archiveBatch = (id: number) => {
    if (!canWriteInventory) return;
    showConfirm({
      title: 'Lưu trữ lô hàng',
      message: 'Bạn có chắc chắn muốn lưu trữ lô hàng này? Lô hàng sẽ ẩn khỏi danh sách đang hoạt động nhưng vẫn giữ lịch sử kiểm kho.',
      isDanger: true,
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          const res = await api.post(`/inventory/archive/${id}`);
          if (res.data?.success !== false) {
            addToast('Đã lưu trữ lô hàng', 'success');
            await fetchBatches();
          } else {
            addToast(res.data?.message || 'Không thể lưu trữ lô hàng', 'error');
          }
        } catch (err: any) {
          addToast(err?.response?.data?.message || 'Không thể kết nối máy chủ', 'error');
        } finally {
          inFlightRef.current = false;
          closeConfirm();
        }
      },
    });
  };

  const handleInternalExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch || isSaving || inFlightRef.current || !canWriteInventory) return;
    const qtyNum = Number(exportForm.qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0 || qtyNum > selectedBatch.current_qty) {
      addToast(`Số lượng xuất phải từ 1 đến ${selectedBatch.current_qty}`, 'warning');
      return;
    }

    inFlightRef.current = true;
    setIsSaving(true);
    try {
      const res = await api.post('/inventory/export', {
        batch_id: selectedBatch.id,
        qty: qtyNum,
        reason: exportForm.reason,
        receiver_id: exportForm.receiver_id || null,
        items: [{ batch_id: selectedBatch.id, qty: qtyNum, reason: exportForm.reason }],
      });
      if (res.data?.success !== false) {
        addToast('Đã xuất kho nội bộ thành công', 'success');
        setShowExportModal(false);
        setExportForm({ qty: '', reason: 'Hàng tặng/Quà tặng', receiver_id: '' });
        await Promise.all([fetchBatches(), fetchGlobalLogs()]);
      } else {
        addToast(res.data?.message || 'Lỗi khi xuất kho nội bộ', 'error');
      }
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Không thể kết nối máy chủ', 'error');
    } finally {
      inFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch || isSaving || inFlightRef.current || !canWriteInventory) return;
    const newQtyNum = Number(adjustForm.new_qty);
    if (!Number.isFinite(newQtyNum) || newQtyNum < 0) {
      addToast('Số lượng tồn kho mới không được nhỏ hơn 0', 'warning');
      return;
    }

    inFlightRef.current = true;
    setIsSaving(true);
    try {
      const res = await api.post('/inventory/adjust', {
        batch_id: selectedBatch.id,
        new_qty: newQtyNum,
        reason: adjustForm.reason,
        items: [{ batch_id: selectedBatch.id, new_qty: newQtyNum, reason: adjustForm.reason }],
      });
      if (res.data?.success !== false) {
        addToast('Đã điều chỉnh tồn kho thành công', 'success');
        setShowAdjustModal(false);
        setAdjustForm({ new_qty: '', reason: 'Điều chỉnh kiểm kho' });
        await Promise.all([fetchBatches(), fetchGlobalLogs()]);
      } else {
        addToast(res.data?.message || 'Lỗi khi điều chỉnh tồn kho', 'error');
      }
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Không thể kết nối máy chủ', 'error');
    } finally {
      inFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const filteredBatches = ensureArray<Batch>(batches);

  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});
  const toggleDateGroup = (date: string) => {
    setCollapsedDates(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const totalBatchesCount = Number(summary.total_batches ?? total ?? 0);
  const lowStockCount = Number(summary.low_stock_count ?? 0);
  const outOfStockCount = Number(summary.out_of_stock_count ?? 0);
  const inStockCount = Math.max(0, totalBatchesCount - lowStockCount - outOfStockCount);

  const handleExport = async () => {
    if (isExporting || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsExporting(true);
    addToast('Đang tải xuống dữ liệu kho hàng theo bộ lọc...', 'info');
    try {
      await downloadExportFile({
        endpoint: '/export',
        params: {
          type: 'inventory',
          search: debouncedSearch,
          stock_status: statusFilter !== 'all' ? statusFilter : undefined,
        },
        defaultFilename: `export_inventory_${Date.now()}.csv`,
        onSuccess: () => {
          addToast('Tải xuống dữ liệu kho hàng thành công', 'success');
        },
        onError: (msg) => {
          addToast(msg || 'Xuất dữ liệu kho hàng thất bại', 'error');
        },
      });
    } catch (err: any) {
      addToast(err?.message || 'Xuất dữ liệu kho hàng thất bại', 'error');
    } finally {
      inFlightRef.current = false;
      setIsExporting(false);
    }
  };

  return (
    <div className="page-container anim-fade-up">
      <div className="page-header" style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderBottom: '1px solid #E2E8F0', paddingBottom: '20px', marginBottom: '24px', alignItems: 'stretch' }}>
        {/* Row 1: Title & Actions */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', width: '100%', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Kho hàng &amp; Đơn mua hàng</h1>
            <p className="page-subtitle" style={{ margin: '4px 0 0' }}>Quản lý tồn kho theo lô hàng, lịch sử xuất nhập kho và đơn mua hàng (PO).</p>
          </div>

          <ResponsiveActionGroup
            moreLabel="Tác vụ"
            fullWidthOnMobile={true}
            actions={[
              {
                key: 'create-po',
                label: 'Tạo đơn nhập kho (PO)',
                shortLabel: 'Tạo đơn PO',
                icon: <Plus size={14} />,
                primary: true,
                hidden: !canWriteInventory,
                onClick: () => { setActiveTab('purchase_orders'); setShowPOModal(true); },
              },
              {
                key: 'sync-sheets',
                label: 'Đồng bộ Google Sheets',
                shortLabel: 'Đồng bộ Sheets',
                icon: <FileSpreadsheet size={14} />,
                hidden: !canWriteInventory,
                onClick: () => setShowInventorySync(true),
              },
              {
                key: 'export-inventory',
                label: isExporting ? 'Đang xuất...' : 'Xuất file',
                icon: isExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />,
                disabled: isExporting,
                onClick: handleExport,
              },
            ]}
          />
        </div>

        {/* Row 2: Tabs Switcher */}
        <div style={{ display: 'flex', width: '100%', justifyContent: 'flex-start' }}>
          <ResponsiveSegmentedTabs
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as 'batches' | 'history' | 'purchase_orders')}
            mobileMaxVisible={2}
            tabletMaxVisible={3}
            desktopMaxVisible={3}
            fullWidthOnMobile={true}
            tabs={[
              {
                id: 'batches',
                label: 'Danh sách Lô hàng',
                shortLabel: 'Lô hàng',
                icon: <Package size={14} />,
              },
              {
                id: 'history',
                label: 'Lịch sử giao dịch kho',
                shortLabel: 'Lịch sử',
                icon: <History size={14} />,
              },
              {
                id: 'purchase_orders',
                label: 'Đơn mua hàng (PO)',
                shortLabel: 'Đơn PO',
                icon: <Layers size={14} />,
              },
            ]}
          />
        </div>
      </div>

      {showInventorySync && (
        <InventorySyncModal
          isOpen={showInventorySync}
          onClose={() => setShowInventorySync(false)}
        />
      )}

      {/* Always mounted so header button or ?open_id= can interact from any tab */}
      <div style={{ display: activeTab === 'purchase_orders' ? 'block' : 'none' }}>
        <PurchaseOrdersTab
          showModal={showPOModal}
          setShowModal={setShowPOModal}
          defaultSupplierId={defaultSupplierId}
          openPoId={openPoId}
          onClearOpenPoId={() => setOpenPoId(null)}
        />
      </div>

      {activeTab !== 'purchase_orders' && (
        <>
          {/* Stats Cards (Chapter V DNA - Server Summary Powered) */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? '8px' : '16px', marginBottom: '24px' }}>
            {[
              {
                label: 'Tổng số lô hàng',
                value: String(totalBatchesCount),
                icon: Layers,
                color: '#BD1D2D',
                bg: 'rgba(189, 29, 45, 0.08)',
                sub: `${Number(summary.total_skus || 0)} mã SKU • Tổng SL: ${Number(summary.total_qty || 0)}`,
              },
              {
                label: 'Còn hàng (Sẵn sàng)',
                value: String(inStockCount),
                icon: CheckCircle,
                color: '#BD1D2D',
                bg: 'rgba(189, 29, 45, 0.08)',
                sub: canSeeCost
                  ? `Giá vốn: ${FMT(Number(summary.total_cost_value || 0))}`
                  : `Giá trị bán: ${FMT(Number(summary.total_retail_value || 0))}`,
              },
              {
                label: 'Sắp hết hàng',
                value: String(lowStockCount),
                icon: Clock,
                color: '#334155',
                bg: 'rgba(15, 23, 42, 0.06)',
                sub: `Ngưỡng tồn ≤ ${lowThreshold} đơn vị`,
              },
              {
                label: 'Đã hết hàng',
                value: String(outOfStockCount),
                icon: DollarSign,
                color: '#334155',
                bg: 'rgba(15, 23, 42, 0.06)',
                sub: 'Cần tạo PO nhập bổ sung',
              },
            ].map((k, i) => {
              const Icon = k.icon;
              return (
                <motion.div
                  key={i}
                  className="stat-card"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '132px',
                    padding: '20px',
                    borderRadius: '16px',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span className="stat-label" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, fontSize: '0.73rem', color: '#64748b' }}>{k.label}</span>
                    <div className="stat-icon" style={{
                      background: k.bg,
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: k.color,
                      flexShrink: 0
                    }}>
                      <Icon size={17} />
                    </div>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {loading ? (
                      <div className="skeleton" style={{ height: 28, width: '80%', borderRadius: 6, marginBottom: 8 }} />
                    ) : (
                      <div className="stat-value" style={{ fontWeight: 800, color: i === 1 ? '#BD1D2D' : '#0F172A', fontSize: '1.65rem', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                    )}
                    <div className="stat-desc" style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 'auto', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }} title={k.sub}>{k.sub}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Filters */}
          {activeTab === 'batches' && (
            <div style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'stretch' : 'center',
              gap: '0.75rem',
              background: '#FFFFFF',
              padding: '0.75rem 1rem',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              marginBottom: '1.5rem',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
            }}>
              <div className="filter-search" style={{ flex: 1, minWidth: 0, width: '100%' }}>
                <Search size={18} style={{ color: '#64748B' }} />
                <input
                  placeholder="Tìm theo tên sản phẩm, mã SKU hoặc mã lô..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                />
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexShrink: 0,
                width: isMobile ? '100%' : 'auto',
                justifyContent: isMobile ? 'space-between' : 'flex-start',
                flexWrap: 'wrap'
              }}>
                <div style={{ flex: isMobile ? 1 : 'none', width: isMobile ? 'calc(50% - 4px)' : 185, minWidth: 120 }}>
                  <CustomSelect
                    options={[
                      { value: 'all', label: 'Tất cả trạng thái' },
                      { value: 'in_stock', label: 'Còn hàng (Sẵn sàng)' },
                      { value: 'low_stock', label: 'Sắp hết hàng' },
                      { value: 'out_of_stock', label: 'Đã hết hàng' }
                    ]}
                    value={statusFilter}
                    onChange={(val) => { setStatusFilter(String(val)); setPage(1); }}
                  />
                </div>
                <div style={{ flex: isMobile ? 1 : 'none', width: isMobile ? 'calc(50% - 4px)' : 165, minWidth: 120 }}>
                  <CustomSelect
                    options={[
                      { value: 'date_desc', label: 'Mới nhất trước' },
                      { value: 'date_asc', label: 'Cũ nhất trước' },
                      { value: 'qty_desc', label: 'Tồn kho giảm dần' },
                      { value: 'qty_asc', label: 'Tồn kho tăng dần' }
                    ]}
                    value={sortBy}
                    onChange={(val) => { setSortBy(String(val)); setPage(1); }}
                  />
                </div>
                {!isMobile && <div style={{ width: '1px', height: 24, background: '#E2E8F0' }} />}
                <div style={{ display: 'flex', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '3px', marginLeft: isMobile ? 'auto' : '0' }}>
                  <button type="button" title="Danh sách" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '7px', background: viewMode === 'list' ? '#FFFFFF' : 'transparent', color: viewMode === 'list' ? '#BD1D2D' : '#64748B', border: 'none', cursor: 'pointer' }} onClick={() => setViewMode('list')}><List size={16} /></button>
                  <button type="button" title="Lưới thẻ" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '7px', background: viewMode === 'card' ? '#FFFFFF' : 'transparent', color: viewMode === 'card' ? '#BD1D2D' : '#64748B', border: 'none', cursor: 'pointer' }} onClick={() => setViewMode('card')}><LayoutGrid size={16} /></button>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          {loading ? (
            activeTab === 'history' || viewMode === 'list' ? (
              <TableSkeleton rows={6} cols={6} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '1.5rem' }}>
                <CardSkeleton height={200} />
                <CardSkeleton height={200} />
                <CardSkeleton height={200} />
              </div>
            )
          ) : activeTab === 'history' ? (
            <div className="card anim-fade-up" style={{ overflow: 'hidden', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
              <div className="flex items-center justify-between" style={{ padding: '1.25rem', borderBottom: '1px solid #E2E8F0' }}>
                <div>
                  <h3 className="font-bold m-0" style={{ color: '#0F172A' }}>Lịch sử biến động toàn kho</h3>
                  <p className="text-xs" style={{ color: '#64748B', marginTop: '0.25rem', marginBottom: 0 }}>Ghi nhận mọi giao dịch nhập, xuất nội bộ, điều chỉnh và bán hàng</p>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: '8px', background: '#F1F5F9', color: '#334155', fontSize: '0.75rem', fontWeight: 700 }}>{globalLogs.length} giao dịch</span>
              </div>
              {globalLogs.length === 0 ? (
                <div style={{ padding: '2rem' }}>
                  <EmptyCard
                    icon={<History size={40} />}
                    title="Chưa có biến động kho nào"
                    description="Mọi phiếu nhập từ PO, xuất kho nội bộ hoặc điều chỉnh kiểm kê sẽ được ghi nhận tự động tại đây."
                  />
                </div>
              ) : (
                <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', overflowX: 'auto' }}>
                  <table style={{ minWidth: 850 }}>
                    <thead>
                      <tr>
                        <th>THỜI GIAN</th>
                        <th>SẢN PHẨM / LÔ</th>
                        <th>LOẠI GIAO DỊCH</th>
                        <th style={{ textAlign: 'right' }}>BIẾN ĐỘNG</th>
                        <th>LÝ DO</th>
                        <th>NGƯỜI THỰC HIỆN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {globalLogs.map(log => {
                        const isIn = log.qty_change > 0;
                        const typeLabel = log.action_type === 'IMPORT' ? 'Nhập kho'
                          : log.action_type === 'SALE' ? 'Bán hàng'
                          : log.action_type === 'EXPORT_INTERNAL' ? 'Xuất nội bộ'
                          : log.action_type === 'RETURN' ? 'Hoàn trả'
                          : 'Điều chỉnh';
                        return (
                          <tr key={log.id} className="table-row-hover">
                            <td>
                              <div className="font-bold text-sm" style={{ color: '#0F172A' }}>{formatDateTimeVN(log.created_at) || '—'}</div>
                            </td>
                            <td>
                              <div className="font-bold text-sm" style={{ color: '#0F172A' }}>{log.product_name}</div>
                              <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748B', marginTop: '2px' }}>#{log.batch_code}</div>
                            </td>
                            <td>
                              <span style={{
                                padding: '3px 9px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: isIn ? 'rgba(15, 23, 42, 0.06)' : 'rgba(189, 29, 45, 0.08)',
                                color: isIn ? '#0F172A' : '#BD1D2D',
                              }}>
                                {typeLabel}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div className="font-bold text-sm tabular-nums" style={{ color: isIn ? '#0F172A' : '#BD1D2D' }}>
                                {isIn ? '+' : ''}{log.qty_change}
                              </div>
                            </td>
                            <td><div className="text-sm truncate" style={{ color: '#64748B', maxWidth: '220px' }} title={log.reason}>{log.reason}</div></td>
                            <td>
                              <div className="flex items-center gap-2">
                                <Avatar src={log.creator_avatar} name={log.creator_name || 'Hệ thống'} size={24} />
                                <span className="font-bold text-sm" style={{ color: '#0F172A' }}>{log.creator_name || 'Hệ thống'}</span>
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
          ) : filteredBatches.length === 0 ? (
            <EmptyCard
              icon={<Package size={44} />}
              title="Không tìm thấy lô hàng nào"
              description="Thử thay đổi bộ lọc, từ khóa tìm kiếm hoặc tạo đơn nhập hàng (PO) để nhập thêm lô hàng mới."
              actionText={canWriteInventory ? 'Tạo đơn nhập kho (PO)' : undefined}
              onAction={canWriteInventory ? () => { setActiveTab('purchase_orders'); setShowPOModal(true); } : undefined}
            />
          ) : (
            <>
              {viewMode === 'list' ? (
                <div className="card" style={{ borderRadius: '16px', border: '1px solid #E2E8F0', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', overflow: 'hidden' }}>
                  <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', overflowX: 'auto' }}>
                    <table style={{ minWidth: 900 }}>
                      <thead>
                        <tr>
                          <th>SẢN PHẨM / MÃ SKU <Tooltip content="Mã sản phẩm / SKU và mã lô nhập kho của từng đợt hàng." /></th>
                          <th>NGÀY NHẬP KHO</th>
                          <th style={{ textAlign: 'right' }}>GIÁ BÁN (VND)</th>
                          <th style={{ textAlign: 'center' }}>TỒN KHO</th>
                          <th>TRẠNG THÁI</th>
                          <th style={{ textAlign: 'right' }}>THAO TÁC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBatches.map((b, i) => {
                          const isNewDate = i === 0 || b.import_date !== filteredBatches[i - 1].import_date;
                          const dateKey = b.import_date;
                          const isCollapsed = collapsedDates[dateKey];
                          const batchMin = Number(b.min_stock_level) > 0 ? Number(b.min_stock_level) : lowThreshold;
                          const retailPrice = Number(b.selling_price ?? b.price ?? b.import_price ?? 0);
                          return (
                            <React.Fragment key={b.id}>
                              {isNewDate && (
                                <tr style={{ background: '#F8FAFC', cursor: 'pointer' }} onClick={() => toggleDateGroup(dateKey)}>
                                  <td colSpan={6} style={{ padding: '10px 20px', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '4px', background: '#E2E8F0', color: '#0F172A', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                                        <ChevronDown size={14} />
                                      </div>
                                      <CalendarDays size={14} style={{ color: '#64748B' }} />
                                      Nhập ngày: {formatDateVN(b.import_date) || '—'}
                                    </div>
                                  </td>
                                </tr>
                              )}
                              {!isCollapsed && (
                                <tr className="table-row-hover group">
                                  <td>
                                    <div className="font-bold text-sm" style={{ color: '#0F172A' }}>{b.product_name}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                      {b.category && <span style={{ background: '#F1F5F9', color: '#334155', padding: '2px 6px', fontSize: '10px', fontWeight: 700, borderRadius: '4px' }}>{b.category}</span>}
                                      <span style={{ background: '#F8FAFC', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontSize: '0.6875rem', fontWeight: 600, fontFamily: 'monospace', textTransform: 'uppercase', border: '1px solid #E2E8F0' }}>{b.sku || 'No SKU'}</span>
                                      <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>#{b.batch_code}</span>
                                    </div>
                                  </td>
                                  <td>
                                    <div className="font-bold text-sm" style={{ fontVariantNumeric: 'tabular-nums', color: '#0F172A' }}>{formatDateVN(b.import_date) || '—'}</div>
                                    {b.expiry_date && (
                                      <div className="text-xs flex items-center gap-1" style={{ marginTop: '0.25rem', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                                        <Clock size={12} /> Hạn dùng: {formatDateVN(b.expiry_date) || '—'}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <div className="font-bold text-sm tabular-nums" style={{ color: '#BD1D2D' }}>{FMT(retailPrice)}</div>
                                    {canSeeCost && (
                                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                                        Giá nhập: {FMT(Number(b.import_price) || 0)}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                        {b.current_qty} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748B' }}>{b.unit || defaultUnit}</span>
                                      </div>
                                      <div style={{ fontSize: '11px', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>Ban đầu: {b.initial_qty}</div>
                                    </div>
                                  </td>
                                  <td>
                                    {b.current_qty <= 0 ? (
                                      <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D' }}>Hết hàng</span>
                                    ) : b.current_qty <= batchMin ? (
                                      <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: '#F1F5F9', color: '#334155' }}>Sắp hết hàng</span>
                                    ) : (
                                      <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: 'rgba(15, 23, 42, 0.06)', color: '#0F172A' }}>Còn hàng</span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <div className="flex gap-2 justify-end group-hover-visible">
                                      {canWriteInventory && b.current_qty > 0 && (
                                        <button type="button" className="btn-icon sm" style={{ color: '#334155' }} title="Xuất kho nội bộ" onClick={() => { setSelectedBatch(b); setExportForm({ qty: '', reason: 'Hàng tặng/Quà tặng', receiver_id: '' }); setShowExportModal(true); }}>
                                          <Share size={14} />
                                        </button>
                                      )}
                                      <button type="button" className="btn-icon sm" style={{ color: '#0F172A' }} title="Lịch sử lô hàng" onClick={() => { setSelectedBatch(b); setLogs([]); void fetchBatchLogs(b.id); setShowHistoryModal(true); }}>
                                        <History size={14} />
                                      </button>
                                      {canWriteInventory && (
                                        <>
                                          <button type="button" className="btn-icon sm" style={{ color: '#334155' }} title="Điều chỉnh tồn kho" onClick={() => { setSelectedBatch(b); setAdjustForm({ new_qty: String(b.current_qty), reason: 'Điều chỉnh kiểm kho' }); setShowAdjustModal(true); }}>
                                            <Edit size={14} />
                                          </button>
                                          {b.current_qty <= 0 && (
                                            <button type="button" className="btn-icon sm" style={{ color: '#BD1D2D' }} title="Lưu trữ lô hàng" onClick={() => archiveBatch(b.id)}>
                                              <Trash2 size={14} />
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: '16px' }}>
                  {filteredBatches.map(b => {
                    const pct = b.initial_qty > 0 ? Math.min((b.current_qty / b.initial_qty) * 100, 100) : 0;
                    const batchMin = Number(b.min_stock_level) > 0 ? Number(b.min_stock_level) : lowThreshold;
                    const retailPrice = Number(b.selling_price ?? b.price ?? b.import_price ?? 0);
                    return (
                      <motion.div
                        key={b.id}
                        layout
                        className="card"
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          borderRadius: '16px',
                          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                        }}
                      >
                        <div style={{ padding: '22px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
                            <div style={{ flex: 1, minWidth: 0, paddingRight: '14px' }}>
                              <h3 style={{ fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '1.05rem', margin: 0 }}>{b.product_name}</h3>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                                {b.category && <span style={{ background: '#F1F5F9', color: '#334155', padding: '2px 6px', fontSize: '10px', fontWeight: 700, borderRadius: '4px' }}>{b.category}</span>}
                                <span style={{ background: '#F8FAFC', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontSize: '0.6875rem', fontWeight: 600, fontFamily: 'monospace', textTransform: 'uppercase', border: '1px solid #E2E8F0' }}>{b.sku || 'No SKU'}</span>
                                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>#{b.batch_code}</span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>{FMT(retailPrice)}</div>
                              <div style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>/ {b.unit || defaultUnit}</div>
                              {canSeeCost && (
                                <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                                  Vốn: {FMT(Number(b.import_price) || 0)}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px', marginBottom: '16px', border: '1px solid #E2E8F0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tồn kho hiện tại</span>
                              <span style={{ fontSize: '0.875rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: b.current_qty <= batchMin ? '#BD1D2D' : '#0F172A' }}>
                                {b.current_qty} <span style={{ color: '#64748B', fontWeight: 600 }}>/ {b.initial_qty}</span>
                              </span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '100px', overflow: 'hidden' }}>
                              <div
                                style={{ height: '100%', borderRadius: '100px', transition: 'width 0.4s ease', width: `${pct}%`, background: b.current_qty <= batchMin ? '#BD1D2D' : '#334155' }}
                              />
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748B' }}>
                              <CalendarDays size={14} />
                              <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>Nhập: <span style={{ color: '#0F172A', fontWeight: 700 }}>{formatDateVN(b.import_date) || '—'}</span></div>
                            </div>
                            {b.expiry_date && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748B' }}>
                                <Clock size={14} />
                                <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>HSD: <span style={{ color: '#0F172A', fontWeight: 700 }}>{formatDateVN(b.expiry_date) || '—'}</span></div>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '1rem', borderTop: '1px solid #E2E8F0' }}>
                            {canWriteInventory && b.current_qty > 0 && (
                              <button
                                type="button"
                                onClick={() => { setSelectedBatch(b); setExportForm({ qty: '', reason: 'Hàng tặng/Quà tặng', receiver_id: '' }); setShowExportModal(true); }}
                                className="btn secondary"
                                style={{ flex: 1, height: '36px', fontSize: '0.75rem', padding: '0 8px' }}
                              >
                                <Share size={14} /> Xuất nội bộ
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { setSelectedBatch(b); setLogs([]); void fetchBatchLogs(b.id); setShowHistoryModal(true); }}
                              className="btn secondary"
                              style={{ flex: canWriteInventory ? undefined : 1, width: canWriteInventory ? '36px' : undefined, height: '36px', padding: canWriteInventory ? '0' : '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                              title="Lịch sử"
                            >
                              <History size={14} />
                              {!canWriteInventory && <span style={{ fontSize: '0.75rem' }}>Lịch sử lô hàng</span>}
                            </button>
                            {canWriteInventory && (
                              <button
                                type="button"
                                onClick={() => { setSelectedBatch(b); setAdjustForm({ new_qty: String(b.current_qty), reason: 'Điều chỉnh kiểm kho' }); setShowAdjustModal(true); }}
                                className="btn secondary"
                                style={{ width: '36px', height: '36px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                title="Điều chỉnh tồn kho"
                              >
                                <Edit size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end" style={{ marginTop: '2rem' }}>
                <Pagination
                  total={total}
                  page={page}
                  pageSize={pageSize}
                  onChange={setPage}
                />
              </div>
            </>
          )}

          {/* Internal Export Modal */}
          {typeof document !== 'undefined' && createPortal(
            <AnimatePresence>
              {showExportModal && selectedBatch && (
                <motion.div
                  key="inv-export-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                  className="overlay-backdrop"
                  style={{ zIndex: zModalNested, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => !isSaving && setShowExportModal(false)}
                >
                  <motion.div
                    key="inv-export-sheet"
                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                    transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                    className="modal-sheet"
                    style={{ width: '100%', maxWidth: '480px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="modal-header" style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: 42, height: 42, borderRadius: '12px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Share size={20} />
                        </div>
                        <div>
                          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Xuất kho nội bộ</h2>
                          <p style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, margin: 0 }}>#{selectedBatch.batch_code} — {selectedBatch.product_name}</p>
                        </div>
                      </div>
                      <button type="button" className="btn-icon sm" onClick={() => !isSaving && setShowExportModal(false)}><X size={18} /></button>
                    </div>
                    <form onSubmit={handleInternalExport}>
                      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ background: 'rgba(189, 29, 45, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(189, 29, 45, 0.18)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                          <AlertTriangle style={{ color: '#BD1D2D', marginTop: '2px', flexShrink: 0 }} size={18} />
                          <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.5 }}>
                            Bạn đang xuất hàng cho mục đích phi thương mại (Quà tặng, hàng mẫu, hư hỏng...). Thao tác này sẽ trừ tồn kho và ghi nhận lịch sử giao dịch kho.
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: canSeeCost ? 'repeat(2, 1fr)' : '1fr', gap: '12px' }}>
                          <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Tồn hiện tại</div>
                            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{selectedBatch.current_qty} {selectedBatch.unit || defaultUnit}</div>
                          </div>
                          {canSeeCost && (
                            <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                              <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Giá vốn lô</div>
                              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{FMT(Number(selectedBatch.import_price) || 0)}</div>
                            </div>
                          )}
                        </div>

                        <div className="form-group">
                          <label className="form-label">Số lượng xuất <span style={{ color: '#BD1D2D' }}>*</span></label>
                          <input
                            type="number"
                            className="form-control"
                            required
                            min="1"
                            max={selectedBatch.current_qty}
                            value={exportForm.qty}
                            onChange={e => setExportForm({ ...exportForm, qty: e.target.value })}
                            placeholder="Nhập số lượng..."
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">Lý do xuất</label>
                          <CustomSelect
                            options={[
                              { value: 'Hàng tặng/Quà tặng', label: 'Hàng tặng/Quà tặng' },
                              { value: 'Hư hỏng/Bể vỡ', label: 'Hư hỏng/Bể vỡ' },
                              { value: 'Hao hụt/Mất lạc', label: 'Hao hụt/Mất lạc' },
                              { value: 'Hàng mẫu/Tester', label: 'Hàng mẫu/Tester' },
                              { value: 'Tiêu dùng nội bộ', label: 'Tiêu dùng nội bộ' }
                            ]}
                            value={exportForm.reason}
                            onChange={val => setExportForm({ ...exportForm, reason: String(val) })}
                          />
                        </div>

                        <AnimatePresence>
                          {exportForm.reason === 'Hàng tặng/Quà tặng' && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="form-group" style={{ overflow: 'hidden' }}>
                              <label className="form-label" style={{ color: '#BD1D2D' }}>Khách hàng nhận (Ghi nhận chi phí CRM)</label>
                              <CustomSelect
                                options={receivers.map(r => ({ ...r, label: r.label }))}
                                value={exportForm.receiver_id}
                                onChange={val => setExportForm({ ...exportForm, receiver_id: String(val) })}
                                placeholder="-- Bỏ qua hoặc Chọn khách hàng nhận --"
                                searchable
                                showAvatars
                              />
                              <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.5rem' }}>Chi phí (giá vốn × số lượng) sẽ được ghi nhận vào mục chi phí của khách hàng này nếu bạn chọn.</p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="modal-footer" style={{ borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                        <button type="button" className="btn outline" onClick={() => setShowExportModal(false)} disabled={isSaving}>Hủy bỏ</button>
                        <button type="submit" className="btn primary" style={{ minWidth: '140px', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }} disabled={isSaving}>
                          {isSaving ? 'Đang xuất...' : 'Xác nhận xuất'}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>,
            document.body
          )}

          {/* Adjust Modal */}
          {typeof document !== 'undefined' && createPortal(
            <AnimatePresence>
              {showAdjustModal && selectedBatch && (
                <motion.div
                  key="inv-adjust-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                  className="overlay-backdrop"
                  style={{ zIndex: zModalNested, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => !isSaving && setShowAdjustModal(false)}
                >
                  <motion.div
                    key="inv-adjust-sheet"
                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                    transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                    className="modal-sheet"
                    style={{ width: '100%', maxWidth: '460px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="modal-header" style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: 42, height: 42, borderRadius: '12px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Edit size={20} />
                        </div>
                        <div>
                          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Điều chỉnh tồn kho</h2>
                          <p style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, margin: 0 }}>Lô #{selectedBatch.batch_code} — {selectedBatch.product_name}</p>
                        </div>
                      </div>
                      <button type="button" className="btn-icon sm" onClick={() => !isSaving && setShowAdjustModal(false)}><X size={18} /></button>
                    </div>
                    <form onSubmit={handleAdjust}>
                      <div className="p-6 space-y-4">
                        <div className="form-group">
                          <label className="form-label">Số lượng thực tế mới <span style={{ color: '#BD1D2D' }}>*</span></label>
                          <input
                            type="number"
                            className="form-control"
                            required
                            min="0"
                            value={adjustForm.new_qty}
                            onChange={e => setAdjustForm({ ...adjustForm, new_qty: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Ghi chú điều chỉnh</label>
                          <textarea
                            className="form-control"
                            rows={3}
                            value={adjustForm.reason}
                            onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                            placeholder="Lý do điều chỉnh (Kiểm kho định kỳ...)"
                          />
                        </div>
                      </div>
                      <div className="modal-footer" style={{ borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                        <button type="button" className="btn outline" onClick={() => setShowAdjustModal(false)} disabled={isSaving}>Hủy bỏ</button>
                        <button type="submit" className="btn primary" style={{ minWidth: '140px', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }} disabled={isSaving}>
                          {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>,
            document.body
          )}

          {/* History Modal */}
          {typeof document !== 'undefined' && createPortal(
            <AnimatePresence>
              {showHistoryModal && selectedBatch && (
                <motion.div
                  key="inv-history-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                  className="overlay-backdrop"
                  style={{ zIndex: zModalNested, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setShowHistoryModal(false)}
                >
                  <motion.div
                    key="inv-history-sheet"
                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                    transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                    className="modal-sheet"
                    style={{ width: '100%', maxWidth: '640px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="modal-header" style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: 42, height: 42, borderRadius: '12px', background: 'rgba(15, 23, 42, 0.06)', color: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <History size={20} />
                        </div>
                        <div>
                          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Lịch sử lô hàng</h2>
                          <p style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, margin: 0 }}>Chi tiết mọi biến động của lô #{selectedBatch.batch_code}</p>
                        </div>
                      </div>
                      <button type="button" className="btn-icon sm" onClick={() => setShowHistoryModal(false)}><X size={18} /></button>
                    </div>
                    <div style={{ padding: '1.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
                      {logs.length === 0 ? (
                        <EmptyCard
                          icon={<History size={34} />}
                          title="Chưa có dữ liệu lịch sử"
                          description="Chưa ghi nhận biến động nào cho lô hàng này."
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '19px', width: '2px', background: '#E2E8F0' }}></div>
                          {logs.map((log) => (
                            <div key={log.id} style={{ position: 'relative', paddingLeft: '3rem' }}>
                              <div style={{ position: 'absolute', left: '10px', top: '10px', width: '20px', height: '20px', borderRadius: '50%', border: '4px solid #FFFFFF', zIndex: 10, background: log.qty_change > 0 ? '#0F172A' : '#BD1D2D' }} />
                              <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', gap: '8px' }}>
                                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{log.reason}</span>
                                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', fontVariantNumeric: 'tabular-nums' }}>{formatDateTimeVN(log.created_at) || '—'}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ color: '#64748B' }}>Thay đổi:</span>
                                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: log.qty_change > 0 ? '#0F172A' : '#BD1D2D' }}>
                                      {log.qty_change > 0 ? '+' : ''}{log.qty_change} {selectedBatch.unit || defaultUnit}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ color: '#64748B' }}>Thực hiện:</span>
                                    <span style={{ fontWeight: 700, color: '#334155' }}>{log.creator_name || 'Hệ thống'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="modal-footer" style={{ justifyContent: 'flex-end', borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                      <button type="button" onClick={() => setShowHistoryModal(false)} className="btn primary" style={{ minWidth: '120px', background: '#0F172A', borderColor: '#0F172A', color: '#FFFFFF' }}>Đóng</button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>,
            document.body
          )}
        </>
      )}
    </div>
  );
}

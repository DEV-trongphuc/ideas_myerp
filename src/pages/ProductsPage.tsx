import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Pagination } from '../components/ui/Pagination';
import { Plus, Package, Pencil, Trash2, X, Loader2, Search, Layers, Download, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useTenantConfig } from '../contexts/TenantConfigContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { isSystemAdmin, isViewer as checkIsViewer } from '../utils/roleUtils';
import { ensureArray, extractArray } from '../utils/safeArray';
import { pushOverlay } from '../utils/overlayStack';
import api from '../api/axios';
import { downloadExportFile } from '../utils/exportHelper';
import { useDebounce } from '../hooks/useDebounce';
import { CustomSelect } from '../components/ui/CustomSelect';
import { CustomCheckbox } from '../components/ui/CustomCheckbox';
import { EmptyCard } from '../components/ui/EmptyCard';
import { TableRowSkeleton } from '../components/ui/Skeleton';
import { numberToText } from '../utils/numberToText';
import { ResponsiveActionGroup } from '../components/ui/MobileResponsiveTabs';
import { useViewportDevice } from '../hooks/useViewportDevice';

const FMT = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n) || 0);

interface CategoryItem {
  id: number | string;
  name: string;
  description?: string;
  product_count?: number;
  track_inventory: boolean;
  track_cost: boolean;
}

const FALLBACK_CATEGORIES: CategoryItem[] = [
  { id: 1, name: 'Phần mềm', track_inventory: false, track_cost: false },
  { id: 2, name: 'Dịch vụ', track_inventory: false, track_cost: false },
  { id: 3, name: 'Hàng hóa', track_inventory: true, track_cost: true },
  { id: 4, name: 'Khác', track_inventory: true, track_cost: true }
];

export const ProductsPage: React.FC = () => {
  const { addToast, showConfirm, closeConfirm } = useUIStore(useShallow((s) => ({ addToast: s.addToast, showConfirm: s.showConfirm, closeConfirm: s.closeConfirm })));
  const { isMobile } = useViewportDevice();
  const currentUser = useAuthStore(state => state.user);
  const { hasPermission } = useTenantConfig();

  const lowStockFallback = useTypedSubSetting<number>('finance.inventory_and_pos_policy', 'low_stock_fallback', 5);
  const defaultUnit = useTypedSubSetting<string>('finance.inventory_and_pos_policy', 'default_unit', 'cái');
  const pageSizeSetting = useTypedSubSetting<number>('finance.ui_pagination_sizes', 'products', 20);
  const zModalNested = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_modal_nested', 2147483646);
  const motionMs = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220);

  const pageSize = Number(pageSizeSetting) > 0 ? Number(pageSizeSetting) : 20;
  const lowThreshold = Number(lowStockFallback) >= 0 ? Number(lowStockFallback) : 5;
  const roleUser = currentUser
    ? { ...currentUser, manager_behavior_mode: currentUser.manager_behavior_mode ?? undefined }
    : null;
  const isReadOnly = !roleUser || checkIsViewer(roleUser) || (!isSystemAdmin(roleUser) && !hasPermission('products', 'write'));

  const buildEmptyForm = useCallback(() => ({
    name: '',
    sku: '',
    category_id: '',
    category: 'Phần mềm',
    price: '',
    cost: '',
    unit: defaultUnit || 'cái',
    description: '',
    is_active: true,
    stock_quantity: 0,
    track_inventory: false,
    track_cost: false,
  }), [defaultUnit]);

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryItem[]>(FALLBACK_CATEGORIES);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [editingCatId, setEditingCatId] = useState<number | string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>(() => buildEmptyForm());
  const [saving, setSaving] = useState(false);
  const [catSaving, setCatSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const productsAbortRef = useRef<AbortController | null>(null);
  const catsAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const fetchCategories = useCallback(async () => {
    catsAbortRef.current?.abort();
    const controller = new AbortController();
    catsAbortRef.current = controller;
    try {
      const r = await api.get('/product-categories', { signal: controller.signal });
      if (controller.signal.aborted) return;
      const rows = extractArray<any>(r?.data, 'categories', 'items');
      if (rows.length > 0) {
        setCategories(rows.map((c: any) => ({
          id: c.id,
          name: String(c.name || ''),
          description: c.description || '',
          product_count: Number(c.product_count) || 0,
          track_inventory: c.track_inventory !== undefined ? Boolean(Number(c.track_inventory)) : !['Phần mềm', 'Dịch vụ'].includes(String(c.name || '')),
          track_cost: c.track_cost !== undefined ? Boolean(Number(c.track_cost)) : !['Phần mềm', 'Dịch vụ'].includes(String(c.name || '')),
        })));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      // Graceful fallback to read-only default categories if /product-categories route not yet available
    }
  }, []);

  const fetchProducts = useCallback(() => {
    if (productsAbortRef.current) {
      productsAbortRef.current.abort();
    }
    const controller = new AbortController();
    productsAbortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    const params = {
      page,
      limit: pageSize,
      search: debouncedSearch,
      category_id: categoryFilter
    };
    api.get('/products', { params, signal })
      .then(r => {
        if (signal.aborted) return;
        const data = r.data?.data ?? r.data;
        if (Array.isArray(data)) {
          setProducts(data);
          setTotal(data.length);
        } else {
          setProducts(ensureArray<any>(data?.items));
          setTotal(Number(data?.total) || 0);
        }
      })
      .catch((err: any) => {
        if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || signal.aborted) return;
        setProducts([]);
        setTotal(0);
        addToast('Không thể tải danh sách sản phẩm', 'error');
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
  }, [page, pageSize, debouncedSearch, categoryFilter, addToast]);

  useEffect(() => {
    void fetchCategories();
    return () => catsAbortRef.current?.abort();
  }, [fetchCategories]);

  useEffect(() => {
    fetchProducts();
    return () => {
      productsAbortRef.current?.abort();
    };
  }, [fetchProducts]);

  useEffect(() => {
    if (!showModal) return;
    return pushOverlay('product-editor-modal', () => {
      if (!saving) setShowModal(false);
    }, zModalNested);
  }, [showModal, saving, zModalNested]);

  useEffect(() => {
    if (!showCatModal) return;
    return pushOverlay('product-category-modal', () => {
      if (!catSaving) setShowCatModal(false);
    }, zModalNested + 1);
  }, [showCatModal, catSaving, zModalNested]);

  const filtered = ensureArray<any>(products);

  const handleOpenAddModal = () => {
    if (isReadOnly) return;
    const firstCat = categories[0];
    setEditItem(null);
    setForm({
      ...buildEmptyForm(),
      category_id: firstCat?.id || '',
      category: firstCat?.name || 'Phần mềm',
      track_inventory: firstCat?.track_inventory ?? false,
      track_cost: firstCat?.track_cost ?? false,
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (p: any) => {
    const cat = categories.find(c => String(c.id) === String(p.category_id) || c.name === p.category) || categories[0];
    setEditItem(p);
    setForm({
      ...p,
      price: String(p.price ?? ''),
      cost: String(p.cost ?? ''),
      unit: p.unit || defaultUnit || 'cái',
      category_id: cat?.id ?? p.category_id ?? '',
      category: cat?.name || p.category || '',
      track_inventory: cat?.track_inventory ?? Boolean(p.track_inventory),
      track_cost: cat?.track_cost ?? true,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (inFlightRef.current || saving || isReadOnly) return;
    if (!String(form.name || '').trim()) {
      addToast('Tên sản phẩm là bắt buộc', 'warning');
      return;
    }
    const priceNum = Number(form.price) || 0;
    const costNum = Number(form.cost) || 0;
    const stockNum = Number(form.stock_quantity) || 0;
    if (priceNum < 0 || costNum < 0 || stockNum < 0) {
      addToast('Giá bán, giá vốn và tồn kho không được nhỏ hơn 0', 'warning');
      return;
    }

    inFlightRef.current = true;
    setSaving(true);
    const payload: Record<string, any> = {
      ...form,
      name: String(form.name).trim(),
      sku: String(form.sku || '').trim(),
      unit: String(form.unit || defaultUnit || 'cái').trim(),
      price: priceNum,
      cost: costNum,
    };
    if (!editItem) {
      payload.stock_quantity = stockNum;
    }

    try {
      if (editItem) {
        await api.put(`/products/${editItem.id}`, payload);
        addToast('Đã cập nhật sản phẩm', 'success');
      } else {
        await api.post('/products', payload);
        addToast('Đã thêm sản phẩm mới', 'success');
      }
      fetchProducts();
      setShowModal(false);
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Lỗi khi lưu sản phẩm', 'error');
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (isExporting || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsExporting(true);
    addToast('Đang xuất danh sách sản phẩm theo bộ lọc hiện tại...', 'info');
    try {
      const selectedCategoryObj = categories.find(c => String(c.id) === String(categoryFilter));
      await downloadExportFile({
        endpoint: '/export',
        params: {
          type: 'product',
          search: debouncedSearch,
          category: selectedCategoryObj?.name || '',
          category_id: categoryFilter && categoryFilter !== 'all' ? categoryFilter : '',
        },
        defaultFilename: `export_products_${Date.now()}.csv`,
        onSuccess: () => {
          addToast('Tải xuống danh sách sản phẩm thành công', 'success');
        },
        onError: (msg) => {
          addToast(msg || 'Xuất danh sách sản phẩm thất bại', 'error');
        },
      });
    } catch (err: any) {
      addToast(err?.message || 'Xuất danh sách sản phẩm thất bại', 'error');
    } finally {
      inFlightRef.current = false;
      setIsExporting(false);
    }
  };

  const handleCreateCategory = async () => {
    const trimmed = newCat.trim();
    if (!trimmed || catSaving || isReadOnly) return;
    setCatSaving(true);
    try {
      const res = await api.post('/product-categories', { name: trimmed, track_inventory: true, track_cost: true });
      const created = res.data?.data ?? res.data;
      addToast('Đã thêm danh mục sản phẩm', 'success');
      setNewCat('');
      if (created?.id) {
        setCategories(prev => [...prev, {
          id: created.id,
          name: String(created.name || trimmed),
          description: created.description || '',
          track_inventory: created.track_inventory !== undefined ? Boolean(created.track_inventory) : true,
          track_cost: created.track_cost !== undefined ? Boolean(created.track_cost) : true,
        }]);
      } else {
        await fetchCategories();
      }
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Không thể lưu danh mục mới trên máy chủ', 'error');
    } finally {
      setCatSaving(false);
    }
  };

  const handleRenameCategory = async (cat: CategoryItem) => {
    const trimmed = editingCatName.trim();
    if (!trimmed || catSaving || isReadOnly) {
      setEditingCatId(null);
      return;
    }
    setCatSaving(true);
    try {
      await api.put(`/product-categories/${cat.id}`, {
        name: trimmed,
        description: cat.description || '',
        track_inventory: cat.track_inventory,
        track_cost: cat.track_cost,
      });
      setCategories(prev => prev.map(x => String(x.id) === String(cat.id) ? { ...x, name: trimmed } : x));
      addToast('Đã cập nhật tên danh mục', 'success');
      setEditingCatId(null);
      fetchProducts();
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Không thể cập nhật danh mục', 'error');
    } finally {
      setCatSaving(false);
    }
  };

  const handleToggleCategoryFlag = async (cat: CategoryItem, field: 'track_inventory' | 'track_cost', checked: boolean) => {
    if (isReadOnly) return;
    const prevCats = categories;
    setCategories(prev => prev.map(x => String(x.id) === String(cat.id) ? { ...x, [field]: checked } : x));
    try {
      await api.put(`/product-categories/${cat.id}`, {
        name: cat.name,
        description: cat.description || '',
        track_inventory: field === 'track_inventory' ? checked : cat.track_inventory,
        track_cost: field === 'track_cost' ? checked : cat.track_cost,
      });
    } catch (err: any) {
      setCategories(prevCats);
      addToast(err?.response?.data?.message || 'Không thể cập nhật cấu hình danh mục', 'error');
    }
  };

  const handleDeleteCategory = (cat: CategoryItem) => {
    if (isReadOnly) return;
    showConfirm({
      title: 'Xóa danh mục sản phẩm',
      message: `Bạn có chắc chắn muốn xóa danh mục "${cat.name}" khỏi hệ thống?`,
      isDanger: true,
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          await api.delete(`/product-categories/${cat.id}`);
          setCategories(prev => prev.filter(x => String(x.id) !== String(cat.id)));
          addToast('Đã xóa danh mục', 'success');
        } catch (err: any) {
          addToast(err?.response?.data?.message || 'Không thể xóa danh mục này', 'error');
        } finally {
          inFlightRef.current = false;
          closeConfirm();
        }
      },
    });
  };

  const handleDeleteProduct = (p: any) => {
    if (isReadOnly) return;
    showConfirm({
      title: 'Xóa sản phẩm',
      message: `Bạn có chắc muốn chuyển sản phẩm "${p.name}" vào thùng rác (xóa mềm)?`,
      isDanger: true,
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          await api.delete(`/products/${p.id}`);
          addToast('Đã xóa sản phẩm thành công', 'success');
          fetchProducts();
        } catch (e: any) {
          addToast(e.response?.data?.message || 'Lỗi khi xóa sản phẩm', 'error');
        } finally {
          inFlightRef.current = false;
          closeConfirm();
        }
      },
    });
  };

  const handleBulkDelete = () => {
    if (isReadOnly || selectedIds.length === 0) return;
    showConfirm({
      title: `Xóa ${selectedIds.length} sản phẩm?`,
      message: `${selectedIds.length} sản phẩm đã chọn sẽ được xóa mềm (chuyển vào thùng rác).`,
      isDanger: true,
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          await api.post('/products/bulk-delete', { ids: selectedIds });
          addToast(`Đã xóa ${selectedIds.length} sản phẩm`, 'success');
          setSelectedIds([]);
          fetchProducts();
        } catch (err: any) {
          addToast(err.response?.data?.message || 'Lỗi khi xóa hàng loạt', 'error');
        } finally {
          inFlightRef.current = false;
          closeConfirm();
        }
      },
    });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sản phẩm & Dịch vụ</h1>
          <p className="page-subtitle" style={{ fontVariantNumeric: 'tabular-nums' }}>{total} sản phẩm</p>
        </div>
        <ResponsiveActionGroup
          moreLabel="Khác"
          actions={[
            ...(!isReadOnly ? [{
              key: 'add',
              label: 'Thêm sản phẩm',
              icon: <Plus size={15} />,
              variant: 'primary' as const,
              onClick: handleOpenAddModal,
            }, {
              key: 'cat',
              label: 'Quản lý danh mục',
              icon: <Layers size={15} />,
              variant: 'secondary' as const,
              onClick: () => setShowCatModal(true),
            }] : []),
            {
              key: 'export',
              label: isExporting ? 'Đang xuất...' : 'Xuất file Excel/CSV',
              icon: isExporting ? <Loader2 size={15} className="spin" /> : <Download size={15} />,
              variant: 'outline',
              disabled: isExporting,
              onClick: handleExport,
            },
          ]}
        />
      </div>

      <div className="card-panel mb-6 flex items-center gap-3" style={{ flexWrap: 'wrap', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
        <div className="filter-search flex-1" style={{ minWidth: isMobile ? '100%' : '220px' }}>
          <Search size={18} className="text-muted" />
          <input 
            placeholder="Tìm sản phẩm theo tên hoặc mã SKU..." 
            value={search} 
            onChange={e => { setSearch(e.target.value); setPage(1); }} 
          />
          <AnimatePresence>
            {search && (
              <motion.button 
                type="button"
                initial={{ opacity: 0, scale: 0.8 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => { setSearch(''); setPage(1); }} 
                className="text-muted hover:text-danger p-1"
                title="Xóa tìm kiếm"
              >
                <X size={16} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <div style={{ width: isMobile ? '100%' : '200px', flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
          <CustomSelect 
            options={[{ value: '', label: 'Tất cả danh mục' }, ...categories.map(c => ({ value: String(c.id), label: c.name }))]} 
            value={categoryFilter} 
            onChange={val => { setCategoryFilter(String(val)); setPage(1); }} 
          />
        </div>
        {!isReadOnly && selectedIds.length > 0 && (
          <button type="button" className="btn danger sm" onClick={handleBulkDelete}>Xóa {selectedIds.length} mục</button>
        )}
      </div>

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`prod-sk-${i}`} className="card" style={{ padding: '12px 14px', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                <div className="skeleton" style={{ height: 15, width: '65%', borderRadius: 4, marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 18, width: '40%', borderRadius: 6 }} />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <EmptyCard
              icon={<Package />}
              title="Chưa có sản phẩm nào phù hợp"
              description="Không tìm thấy sản phẩm khớp bộ lọc. Hãy điều chỉnh điều kiện tìm kiếm hoặc thêm mới."
              actionText={isReadOnly ? undefined : 'Thêm sản phẩm'}
              onAction={isReadOnly ? undefined : handleOpenAddModal}
            />
          ) : (
            filtered.map(p => (
              <div
                key={`mob-prod-${p.id}`}
                className="mobile-card-item"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '16px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Package size={16} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>{p.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                        <code style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: 4, fontSize: '0.7rem', color: '#475569' }}>SKU: {p.sku}</code>
                        <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>{p.category}</span>
                      </div>
                    </div>
                  </div>
                  <span style={{
                    flexShrink: 0,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: p.is_active ? 'rgba(15, 23, 42, 0.06)' : 'rgba(189, 29, 45, 0.08)',
                    color: p.is_active ? '#0F172A' : '#BD1D2D',
                  }}>
                    {p.is_active ? 'Đang bán' : 'Ngừng bán'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #F1F5F9', paddingTop: '8px', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>{FMT(p.price)}</span>
                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}> / {p.unit || defaultUnit}</span>
                    {p.track_inventory && (
                      <span style={{ marginLeft: '8px', fontSize: '0.72rem', fontWeight: 700, color: (Number(p.stock_quantity) || 0) <= lowThreshold ? '#BD1D2D' : '#334155' }}>
                        • Kho: {p.stock_quantity || 0}
                      </span>
                    )}
                  </div>
                  {!isReadOnly && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button type="button" className="btn outline sm" onClick={() => handleOpenEditModal(p)}>
                        <Pencil size={13} /> Sửa
                      </button>
                      <button type="button" className="btn ghost sm" style={{ color: '#BD1D2D' }} onClick={() => handleDeleteProduct(p)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {total > pageSize && <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} />}
        </div>
      ) : (
      <div className="card" style={{ overflow: 'hidden', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
        <div className="table-wrap">
          <table style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <CustomCheckbox 
                    checked={selectedIds.length === filtered.length && filtered.length > 0} 
                    onChange={e => setSelectedIds(e.target.checked ? filtered.map(p => p.id) : [])} 
                  />
                </th>
                <th>Sản phẩm</th><th>Đơn giá</th><th>Kho</th><th>Trạng thái</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={6} />
                ))
              ) : filtered.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={6} style={{ padding: '2rem 1rem' }}>
                    <EmptyCard
                      icon={<Package />}
                      title="Không tìm thấy sản phẩm nào"
                      description="Hãy thử điều chỉnh bộ lọc hoặc thêm sản phẩm / dịch vụ mới."
                      actionText={isReadOnly ? undefined : 'Thêm sản phẩm mới'}
                      onAction={isReadOnly ? undefined : handleOpenAddModal}
                    />
                  </td>
                </tr>
              ) : filtered.map(p => (
                <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <td>
                    <CustomCheckbox 
                      checked={selectedIds.includes(p.id)} 
                      onChange={e => setSelectedIds(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))} 
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Package size={16} /></div>
                      <div>
                        <p className="text-sm font-semi" style={{ color: '#0F172A', margin: 0 }}>{p.name}</p>
                        {p.description && <p className="text-xs" style={{ color: '#64748B', margin: '2px 0 4px' }}>{p.description}</p>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <code style={{ background: '#F8FAFC', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', color: '#475569', fontFamily: 'monospace', border: '1px solid #E2E8F0' }}>SKU: {p.sku}</code>
                          <span style={{ background: '#F1F5F9', color: '#334155', padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600 }}>{p.category}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ color: '#BD1D2D', fontWeight: 700, fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>{FMT(p.price)}</span>
                      <span className="text-xs" style={{ color: '#64748B' }}>/ {p.unit || defaultUnit}</span>
                    </div>
                  </td>
                  <td>
                    {p.track_inventory ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        background: (Number(p.stock_quantity) || 0) <= lowThreshold ? 'rgba(189, 29, 45, 0.08)' : 'rgba(15, 23, 42, 0.06)',
                        color: (Number(p.stock_quantity) || 0) <= lowThreshold ? '#BD1D2D' : '#0F172A',
                      }}>
                        {p.stock_quantity || 0}
                      </span>
                    ) : (
                      <span style={{ color: '#94A3B8' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: p.is_active ? 'rgba(15, 23, 42, 0.06)' : 'rgba(189, 29, 45, 0.08)',
                      color: p.is_active ? '#0F172A' : '#BD1D2D',
                    }}>
                      {p.is_active ? 'Đang bán' : 'Ngừng bán'}
                    </span>
                  </td>
                  <td>
                    {!isReadOnly && (
                      <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="btn ghost sm" onClick={() => handleOpenEditModal(p)} title="Chỉnh sửa"><Pencil size={14} /></button>
                        <button type="button" className="btn ghost sm" style={{ color: '#BD1D2D' }} onClick={() => handleDeleteProduct(p)} title="Xóa"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > pageSize && (
          <div style={{ padding: '1rem', borderTop: '1px solid #E2E8F0' }}>
            <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} />
          </div>
        )}
      </div>
      )}

      {/* Product Editor Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showModal && (
            <motion.div
              key="product-editor-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
              className="overlay-backdrop"
              onClick={() => !saving && setShowModal(false)}
              style={{ zIndex: zModalNested, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0 }}
            >
              <motion.div className="modal-sheet modal-md shadow-2xl"
                initial={{ opacity: 0, scale: 0.96, y: 12 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                style={{ maxWidth: '650px', width: '100%', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}
                onClick={e => e.stopPropagation()}
              >
              
              <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Package size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0F172A', margin: 0 }}>{editItem ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm mới'}</h3>
                    <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', marginBottom: 0 }}>
                      Điền thông tin chi tiết cho sản phẩm/dịch vụ
                    </p>
                  </div>
                </div>
                <button type="button" className="btn-icon" onClick={() => !saving && setShowModal(false)} style={{ borderRadius: '8px' }}><X size={18} /></button>
              </div>

              <div className="modal-body" style={{ padding: '24px', gap: '20px' }}>

                {/* Basic Info */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700 }}>Tên sản phẩm / dịch vụ <span style={{ color: '#BD1D2D' }}>*</span></label>
                  <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="VD: Khóa học / Gói dịch vụ..." autoFocus />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 700 }}>Mã SKU</label>
                    <input className="form-input" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="VD: SV-CRM-01" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 700 }}>Nhóm danh mục</label>
                    <CustomSelect 
                      options={categories.map(c => ({ value: String(c.id), label: c.name }))} 
                      value={String(form.category_id || '')} 
                      onChange={val => {
                        const cat = categories.find(c => String(c.id) === String(val));
                        if (cat) {
                          setForm({ ...form, category_id: cat.id, category: cat.name, track_inventory: cat.track_inventory, track_cost: cat.track_cost });
                        }
                      }} 
                    />
                  </div>
                </div>

                {/* Pricing */}
                <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '16px', border: '1px solid #E2E8F0' }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', marginBottom: '12px', marginTop: 0 }}>
                    Giá cả
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: form.track_cost ? '1fr 1fr' : '1fr', gap: '16px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700 }}>Giá bán (đ)</label>
                      <div style={{ position: 'relative' }}>
                        <input 
                          className="form-input" 
                          type="text" 
                          value={form.price ? Number(form.price).toLocaleString('en-US') : ''} 
                          onChange={e => {
                            const rawDigits = e.target.value.replace(/\D/g, '');
                            setForm({ ...form, price: rawDigits });
                          }} 
                          style={{ paddingRight: '2.5rem', fontVariantNumeric: 'tabular-nums' }} 
                        />
                        <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: '#64748B', fontSize: '0.75rem' }}>đ</span>
                        {form.price && Number(form.price) > 0 && (
                          <div style={{ marginTop: '4px', fontSize: '0.7rem', color: '#BD1D2D', fontWeight: 500 }}>
                            {numberToText(Number(form.price))}
                          </div>
                        )}
                      </div>
                    </div>
                    {form.track_cost && (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontWeight: 700 }}>Giá vốn nhập (đ)</label>
                        <div style={{ position: 'relative' }}>
                          <input 
                            className="form-input" 
                            type="text" 
                            value={form.cost ? Number(form.cost).toLocaleString('en-US') : ''} 
                            onChange={e => {
                              const rawDigits = e.target.value.replace(/\D/g, '');
                              setForm({ ...form, cost: rawDigits });
                            }} 
                            style={{ paddingRight: '2.5rem', fontVariantNumeric: 'tabular-nums' }} 
                          />
                          <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: '#64748B', fontSize: '0.75rem' }}>đ</span>
                          {form.cost && Number(form.cost) > 0 && (
                            <div style={{ marginTop: '4px', fontSize: '0.7rem', color: '#BD1D2D', fontWeight: 500 }}>
                              {numberToText(Number(form.cost))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Inventory */}
                {form.track_inventory && (
                  <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '16px', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', margin: 0 }}>
                        Tồn kho
                      </p>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700 }}>
                        {editItem ? 'Số lượng tồn kho hiện có (Chỉ xem)' : 'Số lượng tồn kho ban đầu'}
                      </label>
                      <input
                        className="form-input"
                        type="number"
                        min={0}
                        disabled={Boolean(editItem)}
                        style={{ fontVariantNumeric: 'tabular-nums', background: editItem ? '#F1F5F9' : '#FFFFFF' }}
                        value={form.stock_quantity}
                        onChange={e => setForm({ ...form, stock_quantity: Math.max(0, Number(e.target.value) || 0) })}
                      />
                      {editItem && (
                        <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                          Tồn kho thực tế được đồng bộ tự động qua module Nhập / Điều chỉnh Kho theo từng lô hàng.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Unit & Description */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700 }}>Đơn vị tính</label>
                  <input className="form-input" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder={`VD: ${defaultUnit || 'cái'}, Hộp, Giờ, Gói...`} />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 700 }}>Mô tả</label>
                  <textarea className="form-textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Mô tả ngắn gọn..." />
                </div>

                <div style={{ padding: '0.25rem 0' }}>
                  <CustomCheckbox 
                    checked={form.is_active} 
                    onChange={e => setForm({ ...form, is_active: e.target.checked })} 
                    label="Đang kinh doanh / Hiển thị"
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ padding: '1.25rem 1.75rem', background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
                <button type="button" className="btn secondary" onClick={() => setShowModal(false)} disabled={saving}>Hủy bỏ</button>
                <button type="button" className="btn primary" onClick={handleSave} disabled={saving} style={{ minWidth: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }}>
                  {saving && <Loader2 size={16} className="spin" />}
                  {editItem ? 'Lưu thay đổi' : 'Thêm sản phẩm'}
                </button>
              </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Category Management Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showCatModal && (
            <motion.div 
              key="product-category-backdrop"
              className="overlay-backdrop" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={() => !catSaving && setShowCatModal(false)} 
              style={{ zIndex: zModalNested + 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0 }}
            >
            <motion.div className="modal-sheet" style={{ width: '700px', maxWidth: 'calc(100vw - 2rem)', margin: 'auto', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}
              initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={e => e.stopPropagation()}
            >
              
              <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Layers size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0F172A', margin: 0 }}>Thiết lập Danh mục</h3>
                    <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', marginBottom: 0 }}>
                      Quản lý nhóm danh mục, theo dõi tồn kho và giá vốn
                    </p>
                  </div>
                </div>
                <button type="button" className="btn-icon" onClick={() => !catSaving && setShowCatModal(false)} style={{ borderRadius: '8px' }}><X size={18} /></button>
              </div>

              <div className="modal-body" style={{ padding: '1.5rem 1.75rem' }}>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '1.5rem', background: '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div className="form-group flex-1" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Tên danh mục mới</label>
                    <input
                      className="form-input"
                      placeholder="VD: Khóa học, Thiết bị..."
                      value={newCat}
                      onChange={e => setNewCat(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleCreateCategory(); } }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                    <button type="button" className="btn primary" disabled={catSaving || !newCat.trim()} onClick={handleCreateCategory} style={{ background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }}>
                      {catSaving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} Thêm mới
                    </button>
                  </div>
                </div>

                <div className="table-wrap" style={{ border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                  <table style={{ minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th>Tên danh mục</th>
                        <th style={{ textAlign: 'center' }}>Quản lý Tồn kho</th>
                        <th style={{ textAlign: 'center' }}>Nhập Giá vốn</th>
                        <th style={{ textAlign: 'right' }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map(c => (
                        <tr key={String(c.id)}>
                          <td style={{ fontWeight: 600 }}>
                            {editingCatId === c.id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                  className="form-input"
                                  style={{ height: '30px', padding: '0 8px', fontSize: '0.82rem' }}
                                  value={editingCatName}
                                  onChange={e => setEditingCatName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') void handleRenameCategory(c); if (e.key === 'Escape') setEditingCatId(null); }}
                                  autoFocus
                                />
                                <button type="button" className="btn-icon sm" onClick={() => handleRenameCategory(c)} style={{ color: '#0F172A' }}><Check size={14} /></button>
                                <button type="button" className="btn-icon sm" onClick={() => setEditingCatId(null)}><X size={14} /></button>
                              </div>
                            ) : (
                              <span>{c.name}</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <CustomCheckbox checked={c.track_inventory} onChange={e => void handleToggleCategoryFlag(c, 'track_inventory', e.target.checked)} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <CustomCheckbox checked={c.track_cost} onChange={e => void handleToggleCategoryFlag(c, 'track_cost', e.target.checked)} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '4px' }}>
                              <button type="button" className="btn-icon sm" onClick={() => { setEditingCatId(c.id); setEditingCatName(c.name); }} title="Đổi tên">
                                <Pencil size={14} />
                              </button>
                              <button type="button" className="btn-icon sm" style={{ color: '#BD1D2D' }} onClick={() => handleDeleteCategory(c)} title="Xóa">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="modal-footer" style={{ padding: '1.25rem 1.75rem', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', justifyContent: 'flex-end' }}>
                <button type="button" className="btn primary" style={{ background: '#0F172A', borderColor: '#0F172A', color: '#FFFFFF' }} onClick={() => setShowCatModal(false)}>Hoàn tất</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}
    </div>
  );
};

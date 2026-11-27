import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Trash2, CheckCircle2, Package, Plus, X, User,
  DollarSign, Loader2, FileText, Ban, Receipt
} from 'lucide-react';
import api from '../../api/axios';
import { useUIStore } from '../../store/uiStore';
import { useAuth } from '../../contexts/AuthContext';
import { useTenantConfig } from '../../contexts/TenantConfigContext';
import { useTypedSetting, useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';
import { isViewer as checkIsViewer } from '../../utils/roleUtils';
import { pushOverlay } from '../../utils/overlayStack';
import { extractArray, ensureArray } from '../../utils/safeArray';
import { Avatar } from './Avatar';
import { numberToText } from '../../utils/numberToText';

interface Product {
  id: number;
  name: string;
  price: number;
  category?: string;
  category_id?: number;
  stock_quantity: number;
  track_inventory: number;
  sku?: string;
}

interface Contact {
  id: number;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
}

interface CartItem extends Product {
  quantity: number;
}

export const POSModal: React.FC<{
  onClose: () => void;
  defaultContact?: Contact | null;
  posSessionId?: number | null;
  onSuccess?: (createdOrder?: any) => void;
}> = ({ onClose, defaultContact, posSessionId, onSuccess }) => {
  const addToast = useUIStore((s) => s.addToast);
  const { user: currentUser } = useAuth();
  const { hasPermission } = useTenantConfig();
  const isViewer = checkIsViewer(currentUser) || !hasPermission('invoices', 'write');

  const posPolicy = useTypedSetting('finance.inventory_and_pos_policy', {
    low_stock_fallback: 5,
    pos_popular_cap: 15,
    pos_search_cap: 10,
  });
  const vatPolicy = useTypedSetting('finance.vat_and_cit_policy', {
    vat_rates: [0, 5, 8, 10],
    pos_vat_inclusive: true,
    quote_default_vat: 10,
  });
  const defaultCurrency = useTypedSubSetting<string>('finance.currency_and_fx_rates', 'default', 'VND');

  const [products, setProducts] = useState<Product[]>([]);
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Array<{ id?: number; name: string }>>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchProduct, setSearchProduct] = useState('');
  const [searchContact, setSearchContact] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(defaultContact || null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newCust, setNewCust] = useState({ full_name: '', phone: '' });
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [shippingCustomerPay, setShippingCustomerPay] = useState(true);
  const [vatRate, setVatRate] = useState<number>(() => (vatPolicy.pos_vat_inclusive ? 0 : Number(vatPolicy.quote_default_vat ?? 0)));
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const checkoutInFlightRef = useRef(false);
  const quickAddInFlightRef = useRef(false);
  const initAbortRef = useRef<AbortController | null>(null);
  const searchProdAbortRef = useRef<AbortController | null>(null);
  const searchContactAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const unregister = pushOverlay('pos-modal', onClose, 2147483646);
    return () => unregister();
  }, [onClose]);

  useEffect(() => {
    initAbortRef.current?.abort();
    const ctrl = new AbortController();
    initAbortRef.current = ctrl;

    Promise.all([
      api.get('/products', { params: { limit: Math.max(15, Number(posPolicy.pos_popular_cap || 15)) }, signal: ctrl.signal }).catch(() => ({ data: { data: { items: [] } } })),
      api.get('/product-categories', { signal: ctrl.signal }).catch(() => ({ data: { data: [] } })),
    ]).then(([prodRes, catRes]) => {
      if (ctrl.signal.aborted) return;
      const prodItems = extractArray<Product>(prodRes?.data, 'items');
      setPopularProducts(prodItems);
      const serverCats = extractArray<any>(catRes?.data, 'items');
      if (serverCats.length > 0) {
        setCategories(serverCats.map((c: any) => ({ id: c.id, name: String(c.name || '').trim() })).filter(c => c.name !== ''));
      } else {
        const derived = Array.from(new Set(prodItems.map(p => String(p.category || '').trim()).filter(Boolean)));
        setCategories(derived.map(name => ({ name })));
      }
    });

    return () => ctrl.abort();
  }, [posPolicy.pos_popular_cap]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!searchProduct.trim()) {
        searchProdAbortRef.current?.abort();
        setProducts([]);
        return;
      }
      searchProdAbortRef.current?.abort();
      const ctrl = new AbortController();
      searchProdAbortRef.current = ctrl;
      api.get('/products', {
        params: { search: searchProduct.trim(), limit: Math.max(10, Number(posPolicy.pos_search_cap || 10)) },
        signal: ctrl.signal,
      })
        .then(r => { if (!ctrl.signal.aborted) setProducts(extractArray<Product>(r?.data, 'items')); })
        .catch((e) => { if (e?.name !== 'CanceledError' && e?.name !== 'AbortError') setProducts([]); });
    }, 300);
    return () => {
      clearTimeout(timer);
      searchProdAbortRef.current?.abort();
    };
  }, [searchProduct, posPolicy.pos_search_cap]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!searchContact.trim()) {
        searchContactAbortRef.current?.abort();
        setContacts([]);
        return;
      }
      searchContactAbortRef.current?.abort();
      const ctrl = new AbortController();
      searchContactAbortRef.current = ctrl;
      api.get('/contacts', {
        params: { search: searchContact.trim(), limit: 20, mode: 'pos', all_pipeline: 1 },
        signal: ctrl.signal,
      })
        .then(r => { if (!ctrl.signal.aborted) setContacts(extractArray<Contact>(r?.data, 'items')); })
        .catch((e) => { if (e?.name !== 'CanceledError' && e?.name !== 'AbortError') setContacts([]); });
    }, 300);
    return () => {
      clearTimeout(timer);
      searchContactAbortRef.current?.abort();
    };
  }, [searchContact]);

  const displayedProducts = useMemo(() => {
    const source = searchProduct.trim() ? products : popularProducts;
    if (categoryFilter === 'all') return source;
    return source.filter((p) => {
      const catName = String(p.category || '').trim();
      return catName === categoryFilter || String(p.category_id || '') === categoryFilter;
    });
  }, [searchProduct, products, popularProducts, categoryFilter]);

  const subtotalAmount = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const taxAmount = vatPolicy.pos_vat_inclusive ? 0 : Math.round(subtotalAmount * (Math.max(0, vatRate) / 100));
  const finalTotal = subtotalAmount + taxAmount + (shippingCustomerPay ? Math.max(0, shippingFee) : 0);

  const FMT_PRICE = (n: number) => {
    if (defaultCurrency !== 'VND') {
      return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)} ${defaultCurrency}`;
    }
    return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' đ';
  };

  const addToCart = (p: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === p.id);
      const currentQty = existing ? existing.quantity : 0;
      if (p.track_inventory && currentQty >= p.stock_quantity) {
        addToast(`Sản phẩm ${p.name} đã đạt giới hạn tồn kho`, 'warning');
        return prev;
      }
      if (existing) {
        return prev.map(item => item.id === p.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...p, quantity: 1 }];
    });
    setSearchProduct('');
  };

  const handleQuickAdd = async () => {
    if (quickAddInFlightRef.current) return;
    if (!newCust.full_name.trim() || !newCust.phone.trim()) {
      return addToast('Vui lòng nhập họ tên và SĐT khách hàng', 'warning');
    }
    quickAddInFlightRef.current = true;
    setLoading(true);
    try {
      const r = await api.post('/contacts', { full_name: newCust.full_name.trim(), phone: newCust.phone.trim() });
      const created = r.data?.data;
      if (created) {
        setContacts(prev => [created, ...prev]);
        setSelectedContact(created);
      }
      setShowQuickAdd(false);
      setNewCust({ full_name: '', phone: '' });
      addToast('Đã thêm khách hàng mới', 'success');
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Lỗi khi thêm khách hàng', 'error');
    } finally {
      quickAddInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (checkoutInFlightRef.current || isViewer) return;
    if (!selectedContact) return addToast('Vui lòng chọn khách hàng', 'warning');
    if (cart.length === 0) return addToast('Giỏ hàng trống', 'warning');
    if (shippingFee < 0) return addToast('Phí vận chuyển không được âm', 'warning');

    checkoutInFlightRef.current = true;
    setLoading(true);
    try {
      const res = await api.post('/pos/orders', {
        customer_id: selectedContact.id,
        pos_session_id: posSessionId || undefined,
        cart: cart.map(c => ({ id: c.id, name: c.name, quantity: c.quantity, price: c.price })),
        tax_rate: vatRate,
        total_amount: finalTotal,
        shipping_fee: Math.max(0, shippingFee),
        shipping_customer_pay: shippingCustomerPay ? 1 : 0,
      });
      addToast('Thanh toán & xuất hóa đơn POS thành công', 'success');
      window.dispatchEvent(new CustomEvent('erp-action-completed', { detail: { actionType: 'sales_order' } }));
      onSuccess?.(res.data?.data);
      onClose();
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Lỗi khi tạo đơn hàng POS', 'error');
    } finally {
      checkoutInFlightRef.current = false;
      setLoading(false);
    }
  };

  if (typeof document === 'undefined') return null;

  const vatRatesList = ensureArray<number>(vatPolicy.vat_rates, [0, 5, 8, 10]);
  const lowStockThresh = Number(posPolicy.low_stock_fallback ?? 5);

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483645,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(6px)',
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        padding: '1rem',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          maxWidth: '1140px',
          width: '95vw',
          height: '88vh',
          maxHeight: '840px',
          background: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.3)',
          zIndex: 2147483646,
        }}
        onClick={e => e.stopPropagation()}
      >
        <fieldset disabled={isViewer} style={{ border: 'none', padding: 0, margin: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top Header */}
          <div style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid #E2E8F0', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              <div style={{ background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', width: 42, height: 42, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Receipt size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>Bán hàng Tại quầy (POS) & Hóa đơn nhanh</h2>
                <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '3px 0 0 0', fontWeight: 500 }}>
                  Thanh toán trực tiếp, trừ kho FIFO tự động và ghi nhận hóa đơn thu tiền
                </p>
              </div>
            </div>
            <button type="button" className="btn-icon" onClick={onClose} style={{ borderRadius: '8px', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} />
            </button>
          </div>

          {/* Main Split */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left: Products */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#FFFFFF', borderRight: '1px solid #E2E8F0' }}>
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', borderRadius: '10px', padding: '8px 12px', background: '#FFFFFF', border: '1px solid #CBD5E1' }}>
                    <Search size={17} style={{ color: '#64748B', marginRight: '8px' }} />
                    <input
                      autoFocus
                      style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: '0.875rem', fontWeight: 500, color: '#0F172A' }}
                      placeholder="Tìm sản phẩm, khóa học, học phần hoặc gói dịch vụ..."
                      value={searchProduct}
                      onChange={e => setSearchProduct(e.target.value)}
                    />
                    {searchProduct && (
                      <button type="button" onClick={() => setSearchProduct('')} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 0 }}>
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ padding: '1.25rem 1.5rem', flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                    Danh mục Sản phẩm & Dịch vụ
                  </h3>
                  <div style={{ display: 'inline-flex', padding: '3px', borderRadius: '10px', background: '#F1F5F9', border: '1px solid #E2E8F0', gap: '2px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('all')}
                      style={{
                        height: '28px', padding: '0 10px', borderRadius: '7px', fontSize: '0.75rem', fontWeight: categoryFilter === 'all' ? 700 : 600,
                        border: 'none', cursor: 'pointer',
                        background: categoryFilter === 'all' ? '#FFFFFF' : 'transparent',
                        color: categoryFilter === 'all' ? '#BD1D2D' : '#64748B',
                        boxShadow: categoryFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      Tất cả
                    </button>
                    {categories.slice(0, 4).map((cat) => {
                      const val = cat.name;
                      const isActive = categoryFilter === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setCategoryFilter(val)}
                          style={{
                            height: '28px', padding: '0 10px', borderRadius: '7px', fontSize: '0.75rem', fontWeight: isActive ? 700 : 600,
                            border: 'none', cursor: 'pointer',
                            background: isActive ? '#FFFFFF' : 'transparent',
                            color: isActive ? '#BD1D2D' : '#64748B',
                            boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          }}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {displayedProducts.length === 0 ? (
                  <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
                    Không tìm thấy sản phẩm phù hợp với bộ lọc hiện tại
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: '0.875rem' }}>
                    {displayedProducts.map(p => (
                      <div
                        key={p.id}
                        className="card cursor-pointer"
                        style={{ borderRadius: '14px', border: '1px solid #E2E8F0', background: '#FFFFFF', padding: '0.875rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transition: 'border-color 0.15s ease' }}
                        onClick={() => addToCart(p)}
                      >
                        <div>
                          <div style={{ width: 32, height: 32, background: 'rgba(189, 29, 45, 0.08)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.625rem' }}>
                            <Package size={16} style={{ color: '#BD1D2D' }} />
                          </div>
                          <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A', minHeight: '2.2rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.3, margin: 0 }}>
                            {p.name}
                          </p>
                          {!!p.track_inventory && (
                            <p style={{ fontSize: '0.72rem', color: Number(p.stock_quantity || 0) <= lowStockThresh ? '#BD1D2D' : '#64748B', fontWeight: 600, marginTop: '4px', marginBottom: 0 }}>
                              Tồn kho: {p.stock_quantity || 0}
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.625rem', borderTop: '1px dashed #E2E8F0', marginTop: '0.625rem' }}>
                          <span style={{ color: '#0F172A', fontWeight: 800, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums' }}>{FMT_PRICE(p.price)}</span>
                          <div style={{ width: 26, height: 26, borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Plus size={14} strokeWidth={2.5} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Customer & Cart */}
            <div style={{ width: '400px', background: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', background: '#FFFFFF' }}>
                <h3 style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px 0' }}>
                  Khách hàng / Học viên
                </h3>
                {selectedContact ? (
                  <div style={{ padding: '0.75rem', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar name={selectedContact.full_name || ''} src={selectedContact.avatar_url} size={34} />
                      <div>
                        <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A', margin: 0 }}>{selectedContact.full_name || 'Khách lẻ'}</p>
                        <p style={{ fontSize: '0.72rem', color: '#64748B', margin: 0 }}>{selectedContact.phone || 'Chưa có SĐT'}</p>
                      </div>
                    </div>
                    <button type="button" className="btn-icon sm" onClick={() => setSelectedContact(null)}><X size={14} /></button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <div style={{ borderRadius: '10px', background: '#F8FAFC', flex: 1, border: '1px solid #CBD5E1', display: 'flex', alignItems: 'center', padding: '0 10px' }}>
                        <User size={15} style={{ color: '#64748B', marginRight: '6px' }} />
                        <input
                          style={{ background: 'transparent', border: 'none', fontSize: '0.825rem', outline: 'none', width: '100%', height: '36px', color: '#0F172A' }}
                          placeholder="Tìm & chọn khách hàng..."
                          value={searchContact}
                          onChange={e => setSearchContact(e.target.value)}
                        />
                      </div>
                      <button type="button" className="btn primary sm" onClick={() => setShowQuickAdd(v => !v)} style={{ borderRadius: '10px', width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Plus size={16} />
                      </button>
                    </div>
                    {showQuickAdd && (
                      <div style={{ padding: '0.875rem', marginTop: '8px', borderRadius: '12px', background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#BD1D2D' }}>Thêm khách hàng nhanh</span>
                          <button type="button" onClick={() => setShowQuickAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={14} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <input className="form-input sm" placeholder="Họ tên *" value={newCust.full_name} onChange={e => setNewCust(prev => ({ ...prev, full_name: e.target.value }))} />
                          <input className="form-input sm" placeholder="Số điện thoại *" value={newCust.phone} onChange={e => setNewCust(prev => ({ ...prev, phone: e.target.value }))} />
                          <button type="button" className="btn primary sm" onClick={handleQuickAdd} disabled={loading}>Lưu & Chọn</button>
                        </div>
                      </div>
                    )}
                    {searchContact && (
                      <div style={{ marginTop: '4px', padding: '4px', position: 'absolute', width: '100%', zIndex: 20, borderRadius: '10px', top: '40px', background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 10px 20px rgba(0,0,0,0.1)', maxHeight: '220px', overflowY: 'auto' }}>
                        {contacts.length > 0 ? contacts.map(c => (
                          <div key={c.id} className="hover-bg cursor-pointer" style={{ padding: '0.5rem 0.75rem', borderRadius: '8px' }} onClick={() => { setSelectedContact(c); setSearchContact(''); }}>
                            <p style={{ fontWeight: 700, fontSize: '0.825rem', color: '#0F172A', margin: 0 }}>{c.full_name}</p>
                            <p style={{ fontSize: '0.725rem', color: '#64748B', margin: 0 }}>{c.phone}</p>
                          </div>
                        )) : (
                          <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: '#64748B' }}>Không tìm thấy khách hàng</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Cart */}
              <div style={{ padding: '1rem 1.25rem', flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', margin: 0 }}>Giỏ hàng</h3>
                  <span style={{ padding: '2px 8px', borderRadius: '6px', background: '#F1F5F9', fontSize: '0.72rem', fontWeight: 700, color: '#0F172A' }}>{cart.length} hạng mục</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {cart.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFFFFF', padding: '0.625rem 0.75rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</p>
                        <p style={{ fontSize: '0.75rem', color: '#BD1D2D', fontWeight: 700, margin: '2px 0 0 0', fontVariantNumeric: 'tabular-nums' }}>{FMT_PRICE(item.price)}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#F1F5F9', padding: '2px 4px', borderRadius: '6px' }}>
                          <button type="button" className="btn ghost sm" style={{ padding: 0, width: 22, height: 22, minWidth: 22 }} onClick={() => setCart(prev => prev.map(x => x.id === item.id ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}>-</button>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, width: '22px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</span>
                          <button
                            type="button"
                            className="btn ghost sm"
                            style={{ padding: 0, width: 22, height: 22, minWidth: 22 }}
                            onClick={() => {
                              if (item.track_inventory && item.quantity >= item.stock_quantity) {
                                addToast('Không thể vượt quá tồn kho', 'warning');
                                return;
                              }
                              setCart(prev => prev.map(x => x.id === item.id ? { ...x, quantity: x.quantity + 1 } : x));
                            }}
                          >+</button>
                        </div>
                        <button type="button" style={{ color: '#BD1D2D', padding: '4px', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setCart(prev => prev.filter(x => x.id !== item.id))}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {cart.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem 0', color: '#94A3B8', fontSize: '0.82rem' }}>
                      <FileText size={32} strokeWidth={1.3} style={{ margin: '0 auto 6px', opacity: 0.5 }} />
                      <div>Chưa chọn sản phẩm giao dịch</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '1rem 1.25rem', background: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem', fontSize: '0.78rem' }}>
                  <span style={{ color: '#64748B', fontWeight: 600 }}>Thuế VAT:</span>
                  {vatPolicy.pos_vat_inclusive ? (
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>Giá niêm yết đã gồm VAT</span>
                  ) : (
                    <select className="form-input sm" value={vatRate} onChange={e => setVatRate(Math.max(0, Number(e.target.value)))} style={{ width: '96px', height: '28px', padding: '0 8px' }}>
                      {vatRatesList.map((r) => <option key={r} value={r}>{r}% VAT</option>)}
                    </select>
                  )}
                </div>

                <div style={{ marginBottom: '0.75rem', padding: '0.625rem 0.75rem', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B' }}>PHÍ VẬN CHUYỂN / PHỤ PHÍ</span>
                    <div style={{ display: 'inline-flex', background: '#FFFFFF', padding: '2px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                      <button type="button" className={`btn sm ${shippingCustomerPay ? 'primary' : 'ghost'}`} onClick={() => setShippingCustomerPay(true)} style={{ fontSize: '0.68rem', padding: '1px 6px', height: '20px' }}>Khách chịu</button>
                      <button type="button" className={`btn sm ${!shippingCustomerPay ? 'primary' : 'ghost'}`} onClick={() => setShippingCustomerPay(false)} style={{ fontSize: '0.68rem', padding: '1px 6px', height: '20px' }}>Đơn vị chịu</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', borderRadius: '8px', padding: '4px 8px', background: '#FFFFFF', border: '1px solid #CBD5E1' }}>
                    <DollarSign size={13} style={{ color: '#BD1D2D', marginRight: '4px' }} />
                    <input
                      type="number"
                      min={0}
                      style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: '0.825rem', fontWeight: 700, color: '#0F172A' }}
                      placeholder="0"
                      value={shippingFee || ''}
                      onChange={e => {
                        const raw = e.target.value === '' ? 0 : parseFloat(e.target.value);
                        setShippingFee(Math.max(0, isNaN(raw) ? 0 : raw));
                      }}
                    />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B' }}>{defaultCurrency}</span>
                  </div>
                  {shippingFee > 0 && <div style={{ marginTop: '3px', fontSize: '0.68rem', color: '#BD1D2D', fontWeight: 600 }}>{numberToText(shippingFee, defaultCurrency)}</div>}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.875rem' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Tổng thanh toán</span>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#BD1D2D', lineHeight: 1.1, marginTop: '2px' }}>{FMT_PRICE(finalTotal)}</div>
                  </div>
                  {taxAmount > 0 && <span style={{ fontSize: '0.72rem', color: '#64748B' }}>VAT: {FMT_PRICE(taxAmount)}</span>}
                </div>

                <button
                  type="button"
                  className="btn primary lg"
                  disabled={loading || cart.length === 0 || !selectedContact || isViewer}
                  onClick={handleCheckout}
                  style={{
                    width: '100%', padding: '0.875rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    background: isViewer ? '#E2E8F0' : '#BD1D2D', color: isViewer ? '#64748B' : '#FFFFFF', fontSize: '0.875rem', fontWeight: 800, border: 'none', height: '46px',
                  }}
                >
                  {loading ? <Loader2 size={17} className="spin" /> : (isViewer ? <Ban size={16} /> : <CheckCircle2 size={16} />)}
                  {isViewer ? 'BẠN KHÔNG CÓ QUYỀN XUẤT HÓA ĐƠN' : 'XÁC NHẬN & XUẤT HÓA ĐƠN POS'}
                </button>
              </div>
            </div>
          </div>
        </fieldset>
      </motion.div>
    </div>,
    document.body
  );
};

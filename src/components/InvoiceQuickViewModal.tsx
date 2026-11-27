import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Printer, Loader2 } from 'lucide-react';
import api from '../api/axios';
import { useTenantConfig } from '../contexts/TenantConfigContext';
import { Avatar } from './ui/Avatar';
import { pushOverlay } from '../utils/overlayStack';
import { formatDateVN } from '../utils/dateUtils';
import { ensureArray } from '../utils/safeArray';
import { numberToVietnameseText } from '../utils/numberToText';

const FMT = (n: number, currency = 'VND') => {
  const num = Number(n || 0);
  if (currency !== 'VND') {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num)} ${currency}`;
  }
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
};

interface InvoiceQuickViewModalProps {
  invoiceId: number | null;
  onClose: () => void;
  zIndex?: number;
}

export const InvoiceQuickViewModal: React.FC<InvoiceQuickViewModalProps> = ({
  invoiceId,
  onClose,
  zIndex = 2147483646,
}) => {
  const { config } = useTenantConfig();
  const org = config?.organization;
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchInvoiceDetails = useCallback(async (id: number) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const r = await api.get(`/invoices/${id}`, { signal: ctrl.signal });
      if (!ctrl.signal.aborted && r.data?.success) {
        setPreviewItem(r.data.data);
      }
    } catch (e: any) {
      if (e?.name === 'CanceledError' || e?.name === 'AbortError' || ctrl.signal.aborted) return;
      console.error('Error fetching invoice details:', e);
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (invoiceId) {
      fetchInvoiceDetails(invoiceId);
    } else {
      abortRef.current?.abort();
      setPreviewItem(null);
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [invoiceId, fetchInvoiceDetails]);

  useEffect(() => {
    if (!invoiceId) return;
    const unregister = pushOverlay('invoice-quick-view-modal', onClose, zIndex);
    return () => unregister();
  }, [invoiceId, onClose, zIndex]);

  if (!invoiceId || typeof document === 'undefined') return null;

  const lineItems = ensureArray(previewItem?.items);
  const currency = previewItem?.currency || org?.currency || 'VND';
  const subtotal = Number(previewItem?.subtotal ?? previewItem?.total ?? 0);
  const discount = Number(previewItem?.discount ?? 0);
  const tax = Number(previewItem?.tax ?? 0);
  const shippingFee = Number(previewItem?.shipping_fee ?? 0);
  const total = Number(previewItem?.total ?? 0);

  return createPortal(
    <AnimatePresence>
      <div
        className="overlay-backdrop"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          zIndex: zIndex - 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
        onClick={onClose}
      >
        <style>{`
          @media print {
            body {
              background: #ffffff !important;
              color: #0f172a !important;
            }
            #root {
              display: none !important;
            }
            .overlay-backdrop {
              position: static !important;
              background: #ffffff !important;
              display: block !important;
              padding: 0 !important;
              height: auto !important;
              width: auto !important;
              opacity: 1 !important;
              overflow: visible !important;
            }
            .invoice-print-container {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              border: none !important;
              border-radius: 0 !important;
              background: #ffffff !important;
              color: #0f172a !important;
              position: static !important;
              transform: none !important;
              overflow: visible !important;
            }
            .invoice-paper-content {
              padding: 0 !important;
              background: #ffffff !important;
              color: #0f172a !important;
            }
            .invoice-info-box {
              border: 1px solid #e2e8f0 !important;
              background: #f8fafc !important;
              border-radius: 8px !important;
            }
            .no-print, .print-no-avatar {
              display: none !important;
            }
          }
        `}</style>

        {loading ? (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '2rem', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#0F172A' }}
          >
            <Loader2 className="spin" size={20} style={{ color: '#BD1D2D' }} />
            <span>Đang tải thông tin hóa đơn...</span>
          </div>
        ) : previewItem ? (
          <motion.div
            className="modal-sheet invoice-print-container"
            style={{
              width: '92%',
              maxWidth: 740,
              maxHeight: '90vh',
              overflowY: 'auto',
              zIndex,
              padding: 0,
              borderRadius: '16px',
              margin: 'auto',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.22)',
            }}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="invoice-paper-content" style={{ padding: '2rem', background: '#FFFFFF', color: '#0F172A' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#BD1D2D', margin: 0 }}>HÓA ĐƠN BÁN HÀNG</h2>
                  <p style={{ fontSize: '0.875rem', color: '#64748B', margin: '4px 0 0 0', fontFamily: 'monospace', fontWeight: 600 }}>
                    Mã số: {previewItem.invoice_number || `#INV-${previewItem.id}`}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <h3 style={{ fontWeight: 700, margin: 0, color: '#0F172A', fontSize: '1rem' }}>
                    {org?.name || 'Đơn vị phát hành'}
                  </h3>
                  {org?.tax_id && (
                    <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '2px 0 0 0' }}>MST: {org.tax_id}</p>
                  )}
                  {org?.address && (
                    <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '2px 0 0 0' }}>{org.address}</p>
                  )}
                  {org?.support_hotline && (
                    <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '2px 0 0 0' }}>Hotline: {org.support_hotline}</p>
                  )}
                </div>
              </div>

              <div
                className="responsive-grid-1-1 invoice-info-box"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1.5rem',
                  marginBottom: '1.5rem',
                  padding: '1.25rem',
                  background: '#F8FAFC',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B' }}>
                    Khách hàng nhận
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '2px' }}>
                    <div className="print-no-avatar">
                      <Avatar name={previewItem.contact_name || previewItem.company_name || 'K'} size="md" />
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '0.95rem', margin: 0, color: '#0F172A' }}>
                        {previewItem.contact_name || previewItem.company_name || 'Khách lẻ'}
                      </p>
                      {previewItem.contact_phone && (
                        <p style={{ fontSize: '0.8125rem', color: '#475569', margin: '3px 0 0 0', fontWeight: 600 }}>
                          SĐT: {previewItem.contact_phone}
                        </p>
                      )}
                      {previewItem.company_name && previewItem.contact_name && (
                        <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '2px 0 0 0' }}>
                          {previewItem.company_name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B' }}>
                    Thông tin thanh toán
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem' }}>
                    <p style={{ margin: 0 }}>
                      Ngày lập: <strong>{formatDateVN(previewItem.issue_date || previewItem.created_at)}</strong>
                    </p>
                    <p style={{ margin: 0 }}>
                      Hạn thanh toán: <strong>{formatDateVN(previewItem.due_date)}</strong>
                    </p>
                    <div style={{ marginTop: '4px' }}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: previewItem.status === 'paid' ? '#F1F5F9' : '#FEF2F2',
                          color: previewItem.status === 'paid' ? '#0F172A' : '#BD1D2D',
                        }}
                      >
                        {previewItem.status === 'paid' ? 'Đã thanh toán' : previewItem.status === 'overdue' ? 'Quá hạn' : 'Chờ thanh toán'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '0.75rem', color: '#64748B' }}>STT & SẢN PHẨM / DỊCH VỤ</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: '0.75rem', color: '#64748B' }}>SL</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: '0.75rem', color: '#64748B' }}>ĐƠN GIÁ</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', fontSize: '0.75rem', color: '#64748B' }}>THÀNH TIỀN</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.length > 0 ? (
                    lineItems.map((item: any, idx: number) => {
                      const qty = Number(item.quantity ?? 1);
                      const unitPrice = Number(item.unit_price ?? 0);
                      const lineSub = Number(item.subtotal ?? unitPrice * qty);
                      return (
                        <tr key={item.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '10px 8px' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>
                              {idx + 1}. {item.product_name || item.name || previewItem.title || 'Sản phẩm / Dịch vụ'}
                            </div>
                            {item.description && (
                              <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 2 }}>{item.description}</div>
                            )}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: '0.85rem' }}>{qty}</td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: '0.85rem' }}>{FMT(unitPrice, currency)}</td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontSize: '0.875rem' }}>{FMT(lineSub, currency)}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 8px' }} colSpan={3}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{previewItem.title || 'Hóa đơn dịch vụ'}</div>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700 }}>{FMT(subtotal, currency)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  {subtotal !== total && (
                    <tr>
                      <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'right', fontSize: '0.85rem', color: '#64748B' }}>Tạm tính</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{FMT(subtotal, currency)}</td>
                    </tr>
                  )}
                  {discount > 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'right', fontSize: '0.85rem', color: '#64748B' }}>Chiết khấu / Giảm giá</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: '#BD1D2D' }}>-{FMT(discount, currency)}</td>
                    </tr>
                  )}
                  {tax > 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'right', fontSize: '0.85rem', color: '#64748B' }}>Thuế GTGT (VAT)</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{FMT(tax, currency)}</td>
                    </tr>
                  )}
                  {shippingFee > 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'right', fontSize: '0.85rem', color: '#64748B' }}>
                        Phí vận chuyển ({previewItem.shipping_customer_pay ? 'Khách trả' : 'Đơn vị chịu'})
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{FMT(shippingFee, currency)}</td>
                    </tr>
                  )}
                  <tr style={{ borderTop: '2px solid #E2E8F0' }}>
                    <td colSpan={3} style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, fontSize: '1rem' }}>TỔNG THANH TOÁN</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 800, fontSize: '1.2rem', color: '#BD1D2D' }}>{FMT(total, currency)}</td>
                  </tr>
                  {total > 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '0 8px 8px 8px', textAlign: 'right', fontSize: '0.78rem', color: '#64748B', fontStyle: 'italic' }}>
                        Bằng chữ: {numberToVietnameseText(total, currency)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>

              {previewItem.notes && (
                <div style={{ padding: '0.875rem', background: '#F8FAFC', borderRadius: '10px', marginBottom: '1.25rem', border: '1px solid #E2E8F0', fontSize: '0.8125rem', color: '#475569', lineHeight: 1.45 }}>
                  <strong>Ghi chú:</strong>
                  <p style={{ margin: '4px 0 0 0' }}>{previewItem.notes}</p>
                </div>
              )}

              <div className="no-print" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid #E2E8F0', paddingTop: '1.25rem' }}>
                <button className="btn ghost" onClick={onClose}>Đóng</button>
                <button className="btn primary" onClick={() => window.print()}><Printer size={16} /> In Hóa Đơn</button>
              </div>
            </div>
          </motion.div>
        ) : (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '2rem', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#0F172A' }}
          >
            <span>Không tìm thấy thông tin hóa đơn.</span>
            <button className="btn ghost" onClick={onClose}><X size={16} /></button>
          </div>
        )}
      </div>
    </AnimatePresence>,
    document.body
  );
};

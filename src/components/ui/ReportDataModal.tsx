import React, { useState, useEffect, useRef } from 'react';
import { CustomModal } from './CustomModal';
import { AlertTriangle, Send, Loader2, Info, CheckCircle2, ShieldAlert, User, Phone, Layers } from 'lucide-react';
import { fetchAPI } from '../../utils/api';
import api from '../../api/axios';
import { ensureArray } from '../../utils/safeArray';
import toast from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';

export interface ReportReasonOption {
  id: string;
  label: string;
  description: string;
  badge?: string;
  badgeColor?: string;
}

export const REPORT_REASONS: ReportReasonOption[] = [
  {
    id: 'invalid_phone',
    label: 'Sai số điện thoại / Số ảo',
    description: 'Số không liên lạc được, thiếu số, thuê bao không tồn tại hoặc nghe máy xác nhận không phải tên khách hàng.',
    badge: 'Sai thông tin',
    badgeColor: '#ef4444'
  },
  {
    id: 'duplicate_mine',
    label: 'Trùng của tôi (< {n} tháng)',
    description: 'Data bị trùng lặp với số điện thoại của chính bạn đã được chia/chăm sóc trong vòng {n} tháng gần nhất.',
    badge: 'Trùng lặp',
    badgeColor: '#f59e0b'
  },
  {
    id: 'duplicate_other',
    label: 'Trùng của Sale khác',
    description: 'Data bị trùng lặp với khách hàng đang được đồng nghiệp khác phụ trách chăm sóc tích cực.',
    badge: 'Trùng lặp',
    badgeColor: '#f59e0b'
  },
  {
    id: 'spam_junk',
    label: 'Spam ảo / Junk lead',
    description: 'Khách hàng vừa gọi cuộc 1 đã báo không đăng ký, cháu chắt nghịch máy, bấm nhầm hoặc đăng ký ảo.',
    badge: 'Spam / Rác',
    badgeColor: '#dc2626'
  },
  {
    id: 'unqualified',
    label: 'Khác / Data Unqualified',
    description: 'Data không đúng đối tượng tuyển sinh (chưa tốt nghiệp CĐ/ĐH, khác chuyên ngành, không có tiếng Anh...).',
    badge: 'Không đạt chuẩn',
    badgeColor: '#475569'
  }
];

const formatReasonList = (rawList: any[], dupMonths: number): ReportReasonOption[] => {
  const safeList = ensureArray<any>(rawList);
  const source = safeList.length > 0 ? safeList : REPORT_REASONS;
  const monthStr = String(dupMonths > 0 ? dupMonths : 6);

  return source.map((item, idx) => {
    if (typeof item === 'string') {
      const label = item.replace(/{n}/g, monthStr);
      return {
        id: `reason_${idx}`,
        label,
        description: '',
        badge: undefined,
        badgeColor: '#64748b'
      };
    }
    const rawLabel = String(item?.label || item?.reason || '').replace(/{n}/g, monthStr);
    const rawDesc = String(item?.description || item?.note || '').replace(/{n}/g, monthStr);
    const isDup = rawLabel.toLowerCase().includes('trùng');
    const isOther = rawLabel.toLowerCase().includes('khác') || rawLabel.toLowerCase().includes('unqualified');
    const isSpam = rawLabel.toLowerCase().includes('spam') || rawLabel.toLowerCase().includes('junk');
    return {
      id: String(item?.id || `reason_${idx}`),
      label: rawLabel || `Lý do #${idx + 1}`,
      description: rawDesc,
      badge: item?.badge || (isDup ? 'Trùng lặp' : isSpam ? 'Spam / Rác' : isOther ? 'Không đạt chuẩn' : 'Sai thông tin'),
      badgeColor: item?.badgeColor || (isDup ? '#f59e0b' : isOther ? '#475569' : '#dc2626')
    };
  });
};

interface ReportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: any;
  onSuccess?: () => void;
  zIndex?: number;
}

export const ReportDataModal: React.FC<ReportDataModalProps> = ({
  isOpen,
  onClose,
  contact,
  onSuccess,
  zIndex
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const policyMonths = Number(useTypedSubSetting('crm.duplicate_check_policy', 'months', 6)) || 6;
  const [dupMonths, setDupMonths] = useState<number>(policyMonths);
  const [reasons, setReasons] = useState<ReportReasonOption[]>(() => formatReasonList(REPORT_REASONS, policyMonths));
  const [selectedReasonId, setSelectedReasonId] = useState<string>(REPORT_REASONS[0].id);
  const [customNote, setCustomNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [hydratedContact, setHydratedContact] = useState<any | null>(null);
  const [resolvingContext, setResolvingContext] = useState(false);
  const inFlightRef = useRef<boolean>(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setHydratedContact(null);
      setResolvingContext(false);
      return;
    }
    setSubmittedSuccess(false);
    setCustomNote('');
    setHydratedContact(null);

    const initialMonths = Number(contact?.duplicate_check_months || policyMonths || 6) || 6;
    setDupMonths(initialMonths);
    const defaultFormatted = formatReasonList(REPORT_REASONS, initialMonths);
    setReasons(defaultFormatted);
    setSelectedReasonId(defaultFormatted[0]?.id || 'invalid_phone');

    const controller = new AbortController();
    fetchAPI('get_settings', { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted || !res?.success || !res?.data) return;
        const months = Number(res.data.duplicate_check_months || initialMonths) || 6;
        setDupMonths(months);
        const remoteReasons = ensureArray<any>(res.data.report_error_reasons);
        const formatted = formatReasonList(remoteReasons.length > 0 ? remoteReasons : REPORT_REASONS, months);
        setReasons(formatted);
        if (formatted.length > 0) {
          setSelectedReasonId(formatted[0].id);
        }
      })
      .catch((err: any) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
      });

    const curLeadId = Number(contact?.lead_id || 0);
    const curRoundId = Number(contact?.dl_round_id || contact?.round_id || 0);
    const hasRoundName = Boolean(contact?.round_name);
    const cid = contact?.id;
    const isNumericCid = cid !== undefined && cid !== null && /^\d+$/.test(String(cid));

    if (isNumericCid && (!(curLeadId > 0 && curRoundId > 0) || !hasRoundName)) {
      setResolvingContext(true);
      api.get(`/contacts/${cid}`, { signal: controller.signal })
        .then((res) => {
          if (controller.signal.aborted) return;
          const fresh = res.data?.data || res.data;
          if (fresh && fresh.id) {
            setHydratedContact(fresh);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) {
            setResolvingContext(false);
          }
        });
    } else {
      setResolvingContext(false);
    }

    return () => {
      controller.abort();
    };
  }, [isOpen, contact?.lead_id, contact?.dl_round_id, contact?.round_id, contact?.round_name, contact?.id, policyMonths]);

  if (!contact) return null;

  const effectiveContact = hydratedContact ? { ...contact, ...hydratedContact } : contact;
  const fullName = effectiveContact.full_name || effectiveContact.name || 'Khách hàng';
  const phone = effectiveContact.phone || effectiveContact.mobile || effectiveContact.phone2 || '—';
  const source = effectiveContact.source || effectiveContact.lead_source || 'Chiến dịch Marketing';
  const roundName = effectiveContact.round_name || 'Vòng chia số';
  const ownerName = effectiveContact.owner_name || effectiveContact.consultant_name || 'Bạn';

  const leadId = Number(effectiveContact.lead_id || 0);
  const roundId = Number(effectiveContact.dl_round_id || effectiveContact.round_id || 0);
  const saleId = Number(effectiveContact.assigned_to || effectiveContact.consultant_id || effectiveContact.owner_id || user?.consultant_id || user?.id || 0);
  const hasValidRoutingContext = leadId > 0 && roundId > 0;

  const selectedReason = reasons.find(r => r.id === selectedReasonId) || reasons[0];
  const isNoteRequired = Boolean(
    selectedReason && (
      selectedReason.id === 'unqualified' ||
      selectedReason.label.toLowerCase().includes('khác') ||
      selectedReason.label.toLowerCase().includes('other')
    )
  );
  const effectiveZIndex = Math.min(2147483646, Math.max(2147483640, zIndex || 2147483646));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || inFlightRef.current) return;

    if (!hasValidRoutingContext) {
      toast.error(t('Hồ sơ chưa gắn thông tin Lead/Vòng phân bổ hợp lệ để báo lỗi.'));
      return;
    }

    if (!selectedReasonId || !selectedReason) {
      toast.error(t('Vui lòng chọn lý do báo cáo data lỗi'));
      return;
    }

    if (isNoteRequired && !customNote.trim()) {
      toast.error(t('Vui lòng nhập chi tiết lý do trong phần Ghi chú'));
      return;
    }

    inFlightRef.current = true;
    setSubmitting(true);
    try {
      const fullDescription = `${selectedReason.label}${customNote.trim() ? ` — Ghi chú: ${customNote.trim()}` : ''}`;

      const payload = {
        lead_id: leadId,
        consultant_id: saleId,
        sale_id: saleId,
        round_id: roundId,
        reason: fullDescription
      };

      const res = await fetchAPI('submit_report', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res && res.success !== false) {
        setSubmittedSuccess(true);
        if (res.auto_approved) {
          toast.success(t('Báo cáo lỗi đã được hệ thống tự động phê duyệt và đền bù'));
        } else {
          toast.success(res.message || t('Đã gửi báo cáo data lỗi. Đang chờ Quản lý duyệt bù vòng.'));
        }
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        closeTimerRef.current = setTimeout(() => {
          closeTimerRef.current = null;
          setSubmittedSuccess(false);
          onSuccess?.();
          onClose();
        }, 1500);
      } else {
        toast.error(res?.message || t('Không thể gửi báo cáo data lỗi. Vui lòng thử lại.'));
      }
    } catch (err: any) {
      toast.error(err?.message || t('Lỗi kết nối khi gửi báo cáo.'));
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <CustomModal
      isOpen={isOpen}
      onClose={() => {
        if (!submitting) {
          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
          setSubmittedSuccess(false);
          onClose();
        }
      }}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#BD1D2D' }}>
          <ShieldAlert size={20} color="#BD1D2D" />
          <span style={{ fontWeight: 800 }}>{t('BÁO CÁO DATA LỖI & YÊU CẦU BÙ VÒNG')}</span>
        </span>
      }
      width="100%"
      maxWidth="560px"
      zIndex={effectiveZIndex}
      disableClose={submitting}
      preventCloseOnBackdrop={submitting}
    >
      {submittedSuccess ? (
        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem auto'
          }}>
            <CheckCircle2 size={36} />
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 8px 0' }}>
            {t('Gửi báo cáo thành công')}
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>
            {t('Ticket đã được gửi tới Quản lý xét duyệt. Khi được duyệt, hệ thống sẽ tự động kích hoạt lượt bù vòng ưu tiên cho bạn.')}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
          {/* Contact summary card */}
          <div style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '6px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('Thông tin data')}
              </span>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#dc2626',
                background: 'rgba(239, 68, 68, 0.1)',
                padding: '2px 8px',
                borderRadius: '6px'
              }}>
                {roundName}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>
                <User size={14} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 650, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                <Phone size={14} style={{ color: '#64748b', flexShrink: 0 }} />
                <span>{phone}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                <Layers size={13} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                <span style={{ fontWeight: 600 }}>Sale:</span>
                <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{ownerName}</span>
              </div>
            </div>
          </div>

          {resolvingContext ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#475569'
            }}>
              <Loader2 size={16} className="spin" style={{ flexShrink: 0 }} />
              <span>{t('Đang đồng bộ mã Lead & Vòng phân bổ...')}</span>
            </div>
          ) : !hasValidRoutingContext && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              background: 'rgba(189, 29, 45, 0.06)',
              border: '1px solid rgba(189, 29, 45, 0.25)',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#BD1D2D'
            }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{t('Dữ liệu này chưa có mã Lead hoặc Vòng phân bổ (round_id) nên không thể gửi yêu cầu bù vòng.')}</span>
            </div>
          )}

          {/* Reason selector */}
          <div>
            <label style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--color-text)', display: 'block', marginBottom: '8px' }}>
              {t('Chọn lý do báo lỗi')} <span style={{ color: '#BD1D2D' }}>*</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {reasons.map((r) => {
                const isSelected = selectedReasonId === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedReasonId(r.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: isSelected ? '1.5px solid #BD1D2D' : '1px solid var(--color-border)',
                      background: isSelected ? 'rgba(189, 29, 45, 0.04)' : 'var(--color-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      checked={isSelected}
                      onChange={() => setSelectedReasonId(r.id)}
                      style={{ marginTop: '3px', accentColor: '#BD1D2D', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isSelected ? '#BD1D2D' : 'var(--color-text)' }}>
                          {r.label}
                        </span>
                        {r.badge && (
                          <span style={{
                            fontSize: '0.625rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: `${r.badgeColor || '#BD1D2D'}15`,
                            color: r.badgeColor || '#BD1D2D',
                            lineHeight: 1.2
                          }}>
                            {r.badge}
                          </span>
                        )}
                      </div>
                      {r.description && (
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '3px 0 0 0', lineHeight: 1.4 }}>
                          {r.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Note */}
          <div>
            <label style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>
              {t('Ghi chú chi tiết')}{' '}
              {isNoteRequired ? (
                <span style={{ color: '#BD1D2D' }}>*</span>
              ) : (
                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>({t('Không bắt buộc')})</span>
              )}
            </label>
            <textarea
              rows={3}
              required={isNoteRequired}
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder={isNoteRequired
                ? t('Nhập chi tiết lý do data không đạt chuẩn (bắt buộc)...')
                : t('Mô tả thêm tình trạng cuộc gọi, phản hồi của khách, hoặc thông tin đối soát...')}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                fontSize: '0.825rem',
                lineHeight: 1.5,
                outline: 'none',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Compensation alert notice */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 12px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '0.78rem',
            color: 'var(--color-text)'
          }}>
            <Info size={16} style={{ color: '#475569', flexShrink: 0 }} />
            <span>
              {t('Sau khi gửi, Quản lý sẽ kiểm tra đối soát. Nếu data lỗi hợp lệ (hệ thống đối chiếu trùng trong {n} tháng), hệ thống sẽ đưa bạn vào danh sách').replace('{n}', String(dupMonths))} <strong>{t('Ưu tiên Bù vòng')}</strong> {t('để nhận data bù ở lượt tiếp theo.')}
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn outline"
              onClick={onClose}
              disabled={submitting}
              style={{ padding: '8px 16px', borderRadius: '8px', fontWeight: 600 }}
            >
              {t('Hủy')}
            </button>
            <button
              type="submit"
              disabled={submitting || resolvingContext || !hasValidRoutingContext}
              className="btn danger"
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: hasValidRoutingContext && !resolvingContext ? '#BD1D2D' : '#cbd5e1',
                color: 'white',
                border: 'none',
                cursor: submitting || resolvingContext || !hasValidRoutingContext ? 'not-allowed' : 'pointer'
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>{t('Đang gửi...')}</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>{t('Gửi Báo Cáo & Bù Vòng')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </CustomModal>
  );
};

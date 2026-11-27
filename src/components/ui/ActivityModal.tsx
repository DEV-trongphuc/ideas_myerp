import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, AlignLeft, Phone, Mail, Users, Zap, PhoneOutgoing, PhoneIncoming, Camera, FileText, Loader2 } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { CustomSelect } from './CustomSelect';
import { MentionInput } from './MentionInput';
import api from '../../api/axios';
import { compressToWebP } from '../../utils/imageCompress';
import { pushOverlay } from '../../utils/overlayStack';
import { useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';
import { ensureArray } from '../../utils/safeArray';

interface ActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType?: 'contact' | 'company' | 'deal' | 'supplier';
  entityId?: number;
  onSuccess?: () => void;
  userId?: number;
  activity?: any; // If passed, we are in edit mode
  onSwitchToTask?: () => void;
  zIndex?: number;
}

const parseServerDate = (dateVal: any): Date => {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? new Date() : dateVal;
  const raw = String(dateVal).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw) ? raw.replace(' ', 'T') : raw;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? new Date() : d;
};

const toLocalDatetimeInputValue = (dateVal: any): string => {
  const d = parseServerDate(dateVal);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const TYPES = [
  { id: 'call', label: 'Cuộc gọi', icon: <Phone size={16} />, color: '#BD1D2D' },
  { id: 'zalo_connect', label: 'Zalo', icon: <img src="https://stc-zpl.zdn.vn/favicon.ico" style={{ width: 16, height: 16, objectFit: 'contain' }} alt="Zalo" />, color: '#0084FF' },
  { id: 'email', label: 'Email', icon: <Mail size={16} />, color: '#334155' },
  { id: 'meeting', label: 'Gặp gỡ', icon: <Users size={16} />, color: '#C6333D' },
  { id: 'note', label: 'Ghi chú', icon: <FileText size={16} />, color: '#475569' }
];

const DEFAULT_SUBJECTS: Record<string, string> = {
  call: 'Cuộc gọi',
  zalo_connect: 'Nhắn tin Zalo',
  email: 'Gửi email',
  meeting: 'Gặp gỡ khách hàng',
  note: 'Ghi chú'
};

const PLACEHOLDERS: Record<string, string> = {
  call: 'Nhập ghi chú cuộc gọi...',
  zalo_connect: 'Ví dụ: Nhắn tin Zalo tư vấn dự án...',
  email: 'Ví dụ: Gửi email báo giá căn hộ...',
  meeting: 'Ví dụ: Gặp trực tiếp tại sa bàn...',
  note: 'Ví dụ: Ghi chú trao đổi với khách hàng...'
};

export const ActivityModal: React.FC<ActivityModalProps> = ({ isOpen, onClose, entityType, entityId, onSuccess, userId, activity, onSwitchToTask, zIndex }) => {
  const addToast = useUIStore((s) => s.addToast);
  const defaultDurationMin = Number(useTypedSubSetting('crm.calls_and_meetings_policy', 'default_duration_min', 5)) || 5;
  const maxDurationMin = Number(useTypedSubSetting('crm.calls_and_meetings_policy', 'max_duration_min', 120)) || 120;
  const rawPresets = ensureArray<number>(useTypedSubSetting('crm.calls_and_meetings_policy', 'duration_presets', [3, 5, 10, 15, 20]));
  const durationPresets = rawPresets.length > 0 ? rawPresets : [3, 5, 10, 15, 20];
  const requireMeetingProof = Boolean(useTypedSubSetting('crm.calls_and_meetings_policy', 'require_meeting_proof', true));
  const proofMaxMb = Math.max(1, Number(useTypedSubSetting('crm.calls_and_meetings_policy', 'proof_max_mb', 5)) || 5);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [formData, setFormData] = useState({
    type: 'call',
    subject: '',
    body: '',
    due_date: '',
    priority: 'medium',
    status: 'planned',
    auto_trigger: false,
    
    // Call-specific properties
    call_direction: 'outbound' as 'outbound' | 'inbound',
    call_outcome: 'reached' as 'reached' | 'no_answer' | 'voicemail' | 'busy' | 'wrong_number',
    call_duration: defaultDurationMin
  });
  const [proofImageFile, setProofImageFile] = useState<File | null>(null);
  const [proofImagePreview, setProofImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateProofPreview = (nextUrl: string | null) => {
    setProofImagePreview(prev => {
      if (prev && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return nextUrl;
    });
  };

  useEffect(() => {
    return () => {
      if (proofImagePreview && proofImagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(proofImagePreview);
      }
    };
  }, [proofImagePreview]);

  const effectiveZIndex = Math.min(2147483646, Math.max(2147483640, zIndex || 2147483646));

  useEffect(() => {
    if (!isOpen) return;
    return pushOverlay('activity-modal', () => {
      if (!submitInFlightRef.current) onClose();
    }, effectiveZIndex);
  }, [isOpen, onClose, effectiveZIndex]);

  const draftStorageKey = entityId ? `draft_activity_${entityType || 'contact'}_${entityId}` : null;

  useEffect(() => {
    if (isOpen) {
      const localISOTime = toLocalDatetimeInputValue(activity?.due_date);

      let initialBody = String(activity?.body || '');
      const initialType = activity?.type || 'call';
      let nextType = initialType;
      let initialSubject = activity?.subject || DEFAULT_SUBJECTS[initialType] || '';
      let callDirection: 'outbound' | 'inbound' = 'outbound';
      let callOutcome: 'reached' | 'no_answer' | 'voicemail' | 'busy' | 'wrong_number' = 'reached';
      let callDuration = defaultDurationMin;

      if (initialType === 'call' && activity) {
        const durMatch = initialBody.match(/^\[Thời lượng:\s*(\d+)\s*phút\]\s*\n?/i);
        if (durMatch) {
          callDuration = Math.max(1, Number(durMatch[1]) || defaultDurationMin);
          initialBody = initialBody.slice(durMatch[0].length);
        }
        const subjLower = String(activity.subject || '').toLowerCase();
        if (subjLower.includes('gọi đến') || subjLower.includes('inbound')) {
          callDirection = 'inbound';
        }
        if (subjLower.includes('không kết nối') || subjLower.includes('không nghe')) {
          callOutcome = 'no_answer';
        } else if (subjLower.includes('hộp thư')) {
          callOutcome = 'voicemail';
        } else if (subjLower.includes('sai số')) {
          callOutcome = 'wrong_number';
        }
      }

      // Auto-recover draft if creating new activity
      if (!activity && draftStorageKey) {
        try {
          const savedDraft = localStorage.getItem(draftStorageKey);
          if (savedDraft) {
            const parsed = JSON.parse(savedDraft);
            if (parsed && typeof parsed.body === 'string' && parsed.body.trim()) {
              initialBody = parsed.body;
              if (parsed.type) nextType = parsed.type;
              if (parsed.subject) initialSubject = parsed.subject;
              addToast('Đã khôi phục bản nháp nội dung tương tác', 'info');
            }
          }
        } catch (e) {}
      }

      setFormData({
        type: nextType,
        subject: initialSubject,
        body: initialBody,
        due_date: localISOTime,
        priority: activity?.priority || 'medium',
        status: activity?.status || (nextType === 'call' ? 'done' : 'planned'),
        auto_trigger: false,
        call_direction: callDirection,
        call_outcome: callOutcome,
        call_duration: callDuration
      });
      setProofImageFile(null);
      updateProofPreview(null);
    }
  }, [isOpen, activity, draftStorageKey, defaultDurationMin]);

  // Autosave draft on body/subject/type change
  useEffect(() => {
    if (isOpen && !activity && draftStorageKey) {
      const cleanBody = formData.body ? formData.body.replace(/<[^>]*>/g, '').trim() : '';
      if (cleanBody || (formData.subject && formData.subject !== DEFAULT_SUBJECTS[formData.type])) {
        localStorage.setItem(draftStorageKey, JSON.stringify({
          body: formData.body,
          type: formData.type,
          subject: formData.subject,
          updatedAt: Date.now()
        }));
      } else {
        localStorage.removeItem(draftStorageKey);
      }
    }
  }, [formData.body, formData.type, formData.subject, isOpen, activity, draftStorageKey]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (submitInFlightRef.current) return;
    
    let subject = formData.subject.trim();
    if (!subject && formData.type === 'note') {
      subject = 'Ghi chú';
    }
    let body = formData.body.replace(/^\[Thời lượng:\s*\d+\s*phút\]\s*\n?/i, '');
    let status = formData.status;

    if (formData.type === 'call') {
      const directionLabel = formData.call_direction === 'outbound' ? 'đi' : 'đến';
      const outcomeLabel = formData.call_outcome === 'reached' ? 'Đã kết nối' :
                           formData.call_outcome === 'no_answer' || formData.call_outcome === 'busy' ? 'Không kết nối được' :
                           formData.call_outcome === 'voicemail' ? 'Hộp thư thoại' : 'Sai số';
      subject = `Cuộc gọi ${directionLabel}: ${outcomeLabel}`;
      status = 'done';

      if (formData.call_outcome === 'reached') {
        body = `[Thời lượng: ${formData.call_duration} phút]\n${body}`;
      }
    } else {
      if (!subject.trim()) { addToast('Vui lòng nhập tiêu đề hoạt động', 'error'); return; }
    }

    const requiresNewProof = requireMeetingProof && formData.type === 'meeting' && status === 'done' && (!activity?.id || activity?.status !== 'done');
    if (requiresNewProof && !proofImageFile) {
      addToast('Vui lòng tải lên ảnh minh chứng để hoàn thành gặp gỡ', 'error');
      return;
    }

    submitInFlightRef.current = true;
    setLoading(true);
    
    try {
      let uploadedUrl = '';
      if (proofImageFile) {
        let fileToUpload = proofImageFile;
        if (proofImageFile.type.startsWith('image/')) {
          fileToUpload = await compressToWebP(proofImageFile);
        }
        const fd = new FormData();
        fd.append('file', fileToUpload);
        const uploadRes = await api.post('/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        uploadedUrl = uploadRes.data?.data?.url ?? uploadRes.data?.url ?? '';
        if (!uploadedUrl) throw new Error('Không thể tải tệp đính kèm lên');
      }

      const formattedDate = formData.due_date ? formData.due_date.replace('T', ' ') : null;
      let activityId = activity?.id;

      if (activity?.id) {
        await api.put(`/activities/${activity.id}`, {
          ...formData,
          due_date: formattedDate,
          subject,
          body,
          status
        });
        addToast('Đã cập nhật hoạt động thành công', 'success');
      } else {
        const createRes = await api.post('/activities', {
          ...formData,
          due_date: formattedDate,
          subject,
          body,
          status,
          related_type: entityType,
          related_id: entityId,
          user_id: userId
        });
        activityId = createRes.data?.data?.id || createRes.data?.data;
        if (formData.auto_trigger) {
          addToast('Đã kích hoạt tự động hóa Workflow', 'success');
        }
        addToast('Đã thêm hoạt động mới', 'success');
      }

      if (uploadedUrl && activityId) {
        const attachmentLabel = formData.type === 'meeting' ? 'Ảnh minh chứng hoàn thành gặp gỡ: ' : 'Tệp đính kèm hoạt động: ';
        await api.post(`/activities/${activityId}/comments`, {
          content: attachmentLabel + (body || ''),
          attachments: [uploadedUrl],
          parent_id: null
        });
      }

      window.dispatchEvent(new CustomEvent('task-updated', { detail: { id: activityId } }));

      if (draftStorageKey) {
        localStorage.removeItem(draftStorageKey);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      addToast(err?.response?.data?.message || err?.message || (activity?.id ? 'Lỗi khi cập nhật hoạt động' : 'Lỗi khi thêm hoạt động'), 'error');
    } finally {
      submitInFlightRef.current = false;
      setLoading(false);
    }
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="overlay-backdrop modal-above-drawer" 
          style={{ 
            zIndex: effectiveZIndex,
            ...({ '--modal-z': effectiveZIndex } as any),
            display: 'flex', 
            alignItems: isMobile ? 'flex-end' : 'center', 
            justifyContent: 'center',
            position: 'fixed',
            inset: 0
          }} 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          onClick={() => { if (!loading) onClose(); }}
        >
        <motion.div 
          className="modal-sheet" 
          style={{ 
            width: '100%', 
            maxWidth: isMobile ? '100%' : 640, 
            padding: 0,
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            borderBottomLeftRadius: isMobile ? '0' : '24px',
            borderBottomRightRadius: isMobile ? '0' : '24px',
            maxHeight: isMobile ? '85vh' : '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-xl)',
            willChange: 'transform',
            transform: 'translate3d(0, 0, 0)',
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden'
          }}
          initial={isMobile ? { y: '100%' } : { opacity: 0, y: 16, scale: 0.97 }} 
          animate={isMobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }} 
          exit={isMobile ? { y: '100%' } : { opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          onClick={e => e.stopPropagation()}
        >
          <div 
            className="modal-header"
            style={{
              padding: isMobile ? '12px 16px' : '16px 24px',
              borderBottom: '1px solid var(--color-border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0
            }}
          >
            <h3 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.15rem', fontWeight: 800 }}>
              {activity?.id ? 'Cập nhật hoạt động' : 'Thêm hoạt động mới'}
            </h3>
            <button type="button" className="btn-icon-bare" onClick={() => { if (!loading) onClose(); }} disabled={loading} style={{ padding: '4px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              <X size={isMobile ? 18 : 20} />
            </button>
          </div>
          
          <form 
            onSubmit={handleSubmit} 
            onKeyDown={(e) => {
              if (e.defaultPrevented) return;
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            className="modal-body no-scrollbar"
            style={{
              overflowY: 'auto',
              padding: isMobile ? '16px' : '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: isMobile ? '12px' : '18px'
            }}
          >
            {/* Type selector */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: isMobile ? '6px' : '10px' }}>
              {TYPES.map(t => (
                <button 
                  key={t.id} type="button"
                  onClick={() => {
                    const currentDefault = DEFAULT_SUBJECTS[formData.type];
                    const nextDefault = DEFAULT_SUBJECTS[t.id] || '';
                    const newSubject = (!formData.subject || formData.subject === currentDefault) ? nextDefault : formData.subject;
                    setFormData({ 
                      ...formData, 
                      type: t.id, 
                      subject: newSubject,
                      status: (t.id === 'call' || t.id === 'zalo_connect' || t.id === 'note') ? 'done' : 'planned' 
                    });
                  }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    padding: isMobile ? '8px 0' : '12px 0', borderRadius: '12px', cursor: 'pointer',
                    background: formData.type === t.id ? `${t.color}15` : 'var(--color-bg-alt)',
                    border: formData.type === t.id ? `1.5px solid ${t.color}` : '1px solid var(--color-border)',
                    color: formData.type === t.id ? t.color : 'var(--color-text-muted)',
                    fontWeight: formData.type === t.id ? 700 : 500, transition: 'all 0.2s',
                    boxShadow: formData.type === t.id ? `0 4px 12px ${t.color}12` : 'none',
                    outline: 'none'
                  }}
                >
                  <div style={{ transform: formData.type === t.id ? 'scale(1.08)' : 'scale(1)', transition: 'transform 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {t.icon}
                  </div>
                  <span style={{ fontSize: isMobile ? '0.7rem' : '0.8125rem' }}>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Ghi chú chi tiết */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><AlignLeft size={13} /> Ghi chú chi tiết</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Zap size={12} /> Phím tắt: <strong>Ctrl + Enter</strong> để lưu</span>
              </label>
              <MentionInput 
                className="form-input" 
                rows={isMobile ? 4 : 6} 
                placeholder="Nhập nội dung chi tiết của hoạt động (Dán ảnh Ctrl+V, nhấn Ctrl+Enter để lưu)..."
                value={formData.body}
                onChange={e => setFormData({ ...formData, body: e.target.value })}
                onSubmitShortcut={() => {
                  handleSubmit();
                }}
                onImagePaste={(file: File) => {
                  if (file.size > proofMaxMb * 1024 * 1024) {
                    addToast(`Dung lượng tệp đính kèm không được vượt quá ${proofMaxMb}MB`, 'error');
                    return;
                  }
                  const previewUrl = URL.createObjectURL(file);
                  setProofImageFile(file);
                  updateProofPreview(previewUrl);
                  addToast('Đã dán ảnh minh chứng từ clipboard!', 'success');
                }}
                onFilePaste={(file: File) => {
                  if (file.size > proofMaxMb * 1024 * 1024) {
                    addToast(`Dung lượng tệp đính kèm không được vượt quá ${proofMaxMb}MB`, 'error');
                    return;
                  }
                  const previewUrl = URL.createObjectURL(file);
                  setProofImageFile(file);
                  updateProofPreview(previewUrl);
                  addToast('Đã dán tệp từ clipboard!', 'success');
                }}
                style={{ resize: 'none' }}
              />
            </div>

            {formData.type === 'call' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '15px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  {/* Loại cuộc gọi */}
                  <div>
                    <label className="form-label">Loại cuộc gọi</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, call_direction: 'outbound' })}
                        className={`btn sm ${formData.call_direction === 'outbound' ? 'primary' : 'outline'}`}
                        style={{ flex: 1, height: isMobile ? 32 : 36, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <PhoneOutgoing size={13} /> Gọi đi
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, call_direction: 'inbound' })}
                        className={`btn sm ${formData.call_direction === 'inbound' ? 'primary' : 'outline'}`}
                        style={{ flex: 1, height: isMobile ? 32 : 36, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <PhoneIncoming size={13} /> Gọi đến
                      </button>
                    </div>
                  </div>

                  {/* Thời gian thực hiện */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={13} /> Thời gian thực hiện
                    </label>
                    <input 
                      type="datetime-local" 
                      className="form-input" 
                      value={formData.due_date}
                      onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                    />
                  </div>
                </div>

                {/* Kết quả cuộc gọi */}
                <div>
                  <label className="form-label">Kết quả cuộc gọi</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))', gap: '6px' }}>
                    {[
                      { value: 'reached', label: 'Đã kết nối', color: '#10b981' },
                      { value: 'no_answer', label: 'Không kết nối được', color: '#f59e0b' },
                      { value: 'voicemail', label: 'Hộp thư thoại', color: '#BD1D2D' },
                      { value: 'wrong_number', label: 'Sai số', color: '#6b7280' }
                    ].map(out => (
                      <button
                        key={out.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, call_outcome: out.value as any })}
                        className="btn sm"
                        style={{
                          height: isMobile ? 32 : 36,
                          border: `1px solid ${formData.call_outcome === out.value ? out.color : 'var(--color-border)'}`,
                          background: formData.call_outcome === out.value ? `${out.color}15` : 'var(--color-surface)',
                          color: formData.call_outcome === out.value ? out.color : 'var(--color-text)',
                          fontWeight: formData.call_outcome === out.value ? 700 : 500,
                          cursor: 'pointer',
                          fontSize: isMobile ? '0.72rem' : '0.8rem',
                          padding: '0 4px'
                        }}
                      >
                        {out.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Thời lượng - Only show if Đã kết nối (reached) */}
                {formData.call_outcome === 'reached' && (
                  <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label" style={{ margin: 0 }}>Thời lượng: <strong style={{ color: 'var(--color-primary)' }}>{formData.call_duration} phút</strong></label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {durationPresets.map(mins => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setFormData({ ...formData, call_duration: mins })}
                            className="btn sm outline"
                            style={{ padding: '2px 6px', fontSize: '0.7rem', height: 22, cursor: 'pointer' }}
                          >
                            {mins}p
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max={maxDurationMin}
                      value={Math.min(maxDurationMin, formData.call_duration)}
                      onChange={e => setFormData({ ...formData, call_duration: Number(e.target.value) })}
                      style={{ width: '100%', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                      <span>1 phút</span>
                      <span>{Math.round(maxDurationMin * 0.25)} phút</span>
                      <span>{Math.round(maxDurationMin * 0.5)} phút</span>
                      <span>{maxDurationMin} phút</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">
                    Tiêu đề {formData.type === 'note' ? 'ghi chú' : 'hoạt động'} {formData.type !== 'note' && <span style={{ color: 'var(--color-danger)' }}>*</span>}
                  </label>
                  <input 
                    className="form-input" 
                    placeholder={PLACEHOLDERS[formData.type] || 'Nhập tiêu đề hoạt động...'} 
                    value={formData.subject}
                    onChange={e => setFormData({ ...formData, subject: e.target.value })}
                    autoFocus
                    style={{ fontSize: isMobile ? '0.85rem' : '0.95rem', padding: '0.5rem 0.75rem' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: (isMobile || formData.type === 'zalo_connect') ? '1fr' : '1fr 1fr 1fr', gap: isMobile ? '10px' : '16px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={13} /> Thời gian thực hiện
                    </label>
                    <input 
                      type="datetime-local" 
                      className="form-input" 
                      value={formData.due_date}
                      onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                    />
                  </div>
                  {formData.type !== 'zalo_connect' && (
                    <>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Mức độ ưu tiên</label>
                        <CustomSelect 
                          options={[
                            { value: 'low', label: 'Thấp' },
                            { value: 'medium', label: 'Bình thường' },
                            { value: 'high', label: 'Quan trọng' }
                          ]}
                          value={formData.priority}
                          onChange={val => setFormData({ ...formData, priority: val as string })}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Trạng thái</label>
                        <div style={{ 
                          display: 'inline-flex',
                          width: '100%',
                          background: '#f1f5f9', 
                          borderRadius: '10px', 
                          padding: '3px', 
                          border: '1px solid #e2e8f0',
                          gap: '2px',
                          height: 38,
                          alignItems: 'center',
                          boxSizing: 'border-box'
                        }}>
                          <button 
                            type="button" 
                            style={{ 
                              flex: 1, 
                              height: '100%',
                              border: 'none', 
                              borderRadius: '7px', 
                              padding: '0 10px', 
                              fontSize: '0.78rem', 
                              fontWeight: formData.status === 'planned' ? 700 : 600, 
                              cursor: 'pointer', 
                              transition: 'all 0.18s',
                              background: formData.status === 'planned' ? '#ffffff' : 'transparent',
                              color: formData.status === 'planned' ? '#BD1D2D' : '#64748b',
                              boxShadow: formData.status === 'planned' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                              outline: 'none',
                              whiteSpace: 'nowrap'
                            }} 
                            onClick={() => setFormData({...formData, status: 'planned'})}
                          >
                            Kế hoạch
                          </button>
                          <button 
                            type="button" 
                            style={{ 
                              flex: 1, 
                              height: '100%',
                              border: 'none', 
                              borderRadius: '7px', 
                              padding: '0 10px', 
                              fontSize: '0.78rem', 
                              fontWeight: formData.status === 'done' ? 700 : 600, 
                              cursor: 'pointer', 
                              transition: 'all 0.18s',
                              background: formData.status === 'done' ? '#ffffff' : 'transparent',
                              color: formData.status === 'done' ? '#BD1D2D' : '#64748b',
                              boxShadow: formData.status === 'done' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                              outline: 'none',
                              whiteSpace: 'nowrap'
                            }} 
                            onClick={() => setFormData({...formData, status: 'done'})}
                          >
                            Đã xong
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {proofImageFile && !(formData.type === 'meeting' && formData.status === 'done') && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                fontSize: '0.78rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  {proofImagePreview && proofImageFile.type.startsWith('image/') && (
                    <img src={proofImagePreview} alt="Attachment preview" style={{ width: 32, height: 32, borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <span style={{ fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Đính kèm: {proofImageFile.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProofImageFile(null);
                    updateProofPreview(null);
                  }}
                  style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                  title="Xóa tệp đính kèm"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {formData.type === 'meeting' && formData.status === 'done' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text)', fontWeight: 600 }}>
                  <Camera size={13} style={{ color: '#BD1D2D' }} /> Ảnh minh chứng gặp gỡ <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {proofImagePreview ? (
                    <div style={{ position: 'relative', width: '100%', height: '150px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                      <img src={proofImagePreview} alt="Proof preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button 
                        type="button"
                        onClick={() => {
                          setProofImageFile(null);
                          updateProofPreview(null);
                        }}
                        style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100px', border: '2px dashed var(--color-border)', borderRadius: '10px', cursor: 'pointer', background: 'var(--color-bg)', transition: 'border-color 0.2s cubic-bezier(0.22, 1, 0.36, 1)', padding: '8px' }}>
                      <Camera size={24} style={{ color: 'var(--color-text-muted)', marginBottom: '4px' }} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textAlign: 'center' }}>Tải ảnh minh chứng gặp gỡ lên</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          if (file.size > proofMaxMb * 1024 * 1024) {
                            addToast(`Dung lượng tệp đính kèm không được vượt quá ${proofMaxMb}MB`, 'error');
                            return;
                          }
                          const previewUrl = URL.createObjectURL(file);
                          setProofImageFile(file);
                          updateProofPreview(previewUrl);
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
          </form>

          <div 
            className="modal-footer"
            style={{
              padding: isMobile ? '12px 16px' : '16px 24px',
              borderTop: '1px solid var(--color-border-light)',
              background: 'var(--color-surface)',
              display: 'flex',
              gap: '10px',
              flexShrink: 0
            }}
          >
            <button type="button" className="btn outline lg" style={{ flex: 1 }} onClick={onClose} disabled={loading}>Hủy bỏ</button>
            <button type="button" className="btn primary lg" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={handleSubmit} disabled={loading}>
              {loading && <Loader2 size={16} className="spin" />}
              <span>{loading ? 'Đang lưu...' : 'Lưu hoạt động'}</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

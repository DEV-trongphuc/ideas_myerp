import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Filter, Plus, Trash2, DollarSign, MapPin, Target, Clock, Globe, Zap } from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { pushOverlay } from '../../utils/overlayStack';
import { ensureArray } from '../../utils/safeArray';

export interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface AdvancedFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (rules: FilterRule[], matchType: 'AND' | 'OR') => void;
  initialRules?: FilterRule[];
  initialMatchType?: 'AND' | 'OR';
}

const FIELDS = [
  { value: 'status', label: 'Trạng thái', icon: <Zap size={14} /> },
  { value: 'source', label: 'Nguồn', icon: <Globe size={14} /> },
  { value: 'city', label: 'Thành phố', icon: <MapPin size={14} /> },
  { value: 'expected_revenue', label: 'Dự kiến doanh thu', icon: <DollarSign size={14} /> },
  { value: 'win_probability', label: 'Xác suất chốt (%)', icon: <Target size={14} /> },
  { value: 'has_called', label: 'Đã liên hệ', icon: <Clock size={14} /> }
];

const OPERATORS: Record<string, { value: string; label: string }[]> = {
  status: [
    { value: 'equals', label: 'Bằng' },
    { value: 'not_equals', label: 'Khác' }
  ],
  source: [
    { value: 'equals', label: 'Bằng' },
    { value: 'not_equals', label: 'Khác' }
  ],
  city: [
    { value: 'equals', label: 'Bằng' },
    { value: 'contains', label: 'Chứa' }
  ],
  expected_revenue: [
    { value: 'greater_than', label: 'Lớn hơn' },
    { value: 'less_than', label: 'Nhỏ hơn' }
  ],
  win_probability: [
    { value: 'greater_than', label: 'Lớn hơn' },
    { value: 'less_than', label: 'Nhỏ hơn' }
  ],
  has_called: [
    { value: 'equals', label: 'Là' }
  ]
};

const createDefaultRule = (): FilterRule => ({
  id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  field: 'status',
  operator: 'equals',
  value: ''
});

function sanitizeRules(input: unknown): FilterRule[] {
  const arr = ensureArray<FilterRule>(input);
  const cleaned = arr
    .filter((r) => r && typeof r === 'object' && typeof r.field === 'string' && OPERATORS[r.field])
    .map((r, idx) => {
      const validOps = OPERATORS[r.field];
      const op = validOps.some((o) => o.value === r.operator) ? r.operator : validOps[0].value;
      return {
        id: r.id ? String(r.id) : `${Date.now()}_${idx}`,
        field: r.field,
        operator: op,
        value: r.value !== undefined && r.value !== null ? String(r.value) : ''
      };
    });
  return cleaned.length > 0 ? cleaned : [createDefaultRule()];
}

export const AdvancedFilterModal: React.FC<AdvancedFilterModalProps> = ({
  isOpen,
  onClose,
  onApply,
  initialRules = [],
  initialMatchType = 'AND'
}) => {
  const [rules, setRules] = useState<FilterRule[]>(() => sanitizeRules(initialRules));
  const [matchType, setMatchType] = useState<'AND' | 'OR'>(initialMatchType === 'OR' ? 'OR' : 'AND');

  useEffect(() => {
    if (isOpen) {
      setRules(sanitizeRules(initialRules));
      setMatchType(initialMatchType === 'OR' ? 'OR' : 'AND');
    }
  }, [isOpen, initialRules, initialMatchType]);

  useEffect(() => {
    if (!isOpen) return;
    return pushOverlay('advanced-filter-modal', onClose, 2147483646);
  }, [isOpen, onClose]);

  const addRule = () => {
    setRules((prev) => [...prev, createDefaultRule()]);
  };

  const removeRule = (id: string) => {
    setRules((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const updateRule = (id: string, key: keyof FilterRule, val: string) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const updated = { ...r, [key]: val };
          if (key === 'field') {
            const ops = OPERATORS[val] || OPERATORS.status;
            updated.operator = ops[0].value;
            updated.value = '';
          }
          return updated;
        }
        return r;
      })
    );
  };

  const handleApply = () => {
    onApply(rules.filter((r) => String(r.value).trim() !== ''), matchType);
    onClose();
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="advanced-filter-backdrop"
          className="overlay-backdrop modal-above-drawer"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483646,
            ...({ '--modal-z': 2147483646 } as React.CSSProperties),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          onClick={onClose}
        >
          <motion.div
            key="advanced-filter-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-surface, #FFFFFF)',
              width: '640px',
              maxWidth: 'calc(100vw - 2rem)',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '16px',
              boxShadow: '0 20px 48px rgba(15, 23, 42, 0.25)',
              border: '1px solid var(--color-border, #E2E8F0)',
              overflow: 'hidden'
            }}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border, #E2E8F0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--color-text, #0F172A)' }}>
                <span style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Filter size={16} />
                </span>
                Bộ lọc nâng cao (Query Builder)
              </h3>
              <button type="button" aria-label="Đóng" className="btn-icon-bare" onClick={onClose}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', background: 'var(--color-bg, #F8FAFC)', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid var(--color-border-light, #E2E8F0)' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text, #0F172A)' }}>Hiển thị kết quả thỏa mãn:</span>
                <div style={{ display: 'inline-flex', padding: '3px', borderRadius: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', gap: '2px' }}>
                  <button
                    type="button"
                    onClick={() => setMatchType('AND')}
                    style={{
                      height: '32px',
                      padding: '0 14px',
                      borderRadius: '7px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      background: matchType === 'AND' ? '#ffffff' : 'transparent',
                      color: matchType === 'AND' ? '#BD1D2D' : '#64748b',
                      fontWeight: matchType === 'AND' ? 700 : 600,
                      boxShadow: matchType === 'AND' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    TẤT CẢ (AND)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMatchType('OR')}
                    style={{
                      height: '32px',
                      padding: '0 14px',
                      borderRadius: '7px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      background: matchType === 'OR' ? '#ffffff' : 'transparent',
                      color: matchType === 'OR' ? '#BD1D2D' : '#64748b',
                      fontWeight: matchType === 'OR' ? 700 : 600,
                      boxShadow: matchType === 'OR' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    BẤT KỲ (OR)
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <AnimatePresence>
                  {rules.map((rule) => (
                    <motion.div
                      key={rule.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <CustomSelect
                          options={FIELDS}
                          value={rule.field}
                          onChange={(v) => updateRule(rule.id, 'field', String(v))}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <CustomSelect
                          options={OPERATORS[rule.field] || OPERATORS.status}
                          value={rule.operator}
                          onChange={(v) => updateRule(rule.id, 'operator', String(v))}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {rule.field === 'has_called' ? (
                          <CustomSelect
                            options={[{ value: 'true', label: 'Có' }, { value: 'false', label: 'Không' }]}
                            value={rule.value}
                            onChange={(v) => updateRule(rule.id, 'value', String(v))}
                          />
                        ) : (
                          <input
                            className="form-input"
                            placeholder="Giá trị..."
                            value={rule.value}
                            onChange={(e) => updateRule(rule.id, 'value', e.target.value)}
                            style={{ height: '40px' }}
                          />
                        )}
                      </div>
                      {rules.length > 1 && (
                        <button
                          type="button"
                          aria-label="Xóa điều kiện"
                          className="btn-icon-bare"
                          style={{ color: 'var(--color-text-muted)', height: '40px', padding: '0 8px' }}
                          onClick={() => removeRule(rule.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <div>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={addRule}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#BD1D2D' }}
                >
                  <Plus size={14} /> Thêm điều kiện lọc
                </button>
              </div>
            </div>

            <div style={{ padding: '1.125rem 1.5rem', borderTop: '1px solid var(--color-border, #E2E8F0)', display: 'flex', justifyContent: 'space-between', background: 'var(--color-bg, #F8FAFC)' }}>
              <button type="button" className="btn ghost" onClick={() => setRules([createDefaultRule()])}>
                Xóa bộ lọc
              </button>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" className="btn secondary" onClick={onClose}>
                  Hủy bỏ
                </button>
                <button type="button" className="btn primary" onClick={handleApply}>
                  Áp dụng Bộ lọc
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

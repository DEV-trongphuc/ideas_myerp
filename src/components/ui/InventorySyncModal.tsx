import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, FileSpreadsheet, Plus, Trash2, Database, 
  RefreshCw, AlertCircle, ExternalLink, Edit2,
  Link2, Info, Clock, Zap, Target
} from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';
import { pushOverlay } from '../../utils/overlayStack';
import { useViewportDevice } from '../../hooks/useViewportDevice';
import { fetchAPI } from '../../utils/api';
import { CustomSelect } from './CustomSelect';
import { ensureArray, extractArray } from '../../utils/safeArray';

interface InventorySyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Connection = {
  id: number;
  sheet_name: string;
  spreadsheet_id?: string;
  webhook_token: string;
  is_active: boolean;
  connection_type?: string;
  sync_interval?: number;
  sync_status?: 'idle' | 'syncing' | 'error' | string;
  last_error?: string | null;
  last_sync_at?: string;
  mappings?: Mapping[];
};

type Mapping = {
  id: number;
  connection_id: number;
  sheet_column: string;
  system_field: string;
  custom_label?: string;
};

const INVENTORY_FIELDS = [
  { value: 'sku', label: 'Mã SKU / Mã sản phẩm (Khóa so khớp)' },
  { value: 'product_name', label: 'Tên Sản phẩm / Khóa học' },
  { value: 'price', label: 'Giá Bán Niêm Yết' },
  { value: 'import_price', label: 'Giá Nhập / Giá Vốn' },
  { value: 'qty', label: 'Số Lượng Tồn Kho' },
  { value: 'status', label: 'Trạng Thái (Đang bán / Ngừng bán)' },
  { value: 'category', label: 'Danh Mục Sản Phẩm' },
  { value: 'unit', label: 'Đơn Vị Tính' },
  { value: 'notes', label: 'Ghi Chú / Mô Tả' }
];

export const InventorySyncModal: React.FC<InventorySyncModalProps> = ({ isOpen, onClose }) => {
  const showConfirm = useUIStore((s) => s.showConfirm);
  const closeConfirm = useUIStore((s) => s.closeConfirm);
  const addToast = useUIStore((s) => s.addToast);
  const { isMobile } = useViewportDevice();
  const zModalNested = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_modal_nested', 2147483646);
  const motionMs = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [selected, setSelected] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form states for new connection
  const [showAddConn, setShowAddConn] = useState(false);
  const [showSyncMechanismInfo, setShowSyncMechanismInfo] = useState(false);
  const [newSpreadsheetId, setNewSpreadsheetId] = useState('');
  const [newSheetTab, setNewSheetTab] = useState('Sheet1');
  const [syncPreset, setSyncPreset] = useState<'5p' | '15p' | '1h' | '1d' | 'custom'>('15p');
  const [customSyncMins, setCustomSyncMins] = useState(15);

  // Column fetching states
  const [columns, setColumns] = useState<string[]>([]);
  const [isFetchingColumns, setIsFetchingColumns] = useState(false);

  // New mapping row states
  const [newMappingField, setNewMappingField] = useState('sku');
  const [newMappingCol, setNewMappingCol] = useState('');
  const [newMappingCustomLabel, setNewMappingCustomLabel] = useState('');
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [editingMappingId, setEditingMappingId] = useState<number | null>(null);

  // Force sync execution states
  const [syncLogs, setSyncLogs] = useState('');
  const [isForceSyncing, setIsForceSyncing] = useState(false);

  const dataAbortRef = useRef<AbortController | null>(null);
  const colAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const selectedRef = useRef<Connection | null>(selected);
  selectedRef.current = selected;

  const generateToken = () => 'tok_' + Math.random().toString(36).slice(2, 10);

  useEffect(() => {
    if (!isOpen) return;
    return pushOverlay('inventory-sync-modal', onClose, zModalNested);
  }, [isOpen, onClose, zModalNested]);

  useEffect(() => {
    if (!showAddConn) return;
    return pushOverlay('inventory-sync-add-modal', () => setShowAddConn(false), zModalNested + 1);
  }, [showAddConn, zModalNested]);

  const fetchData = useCallback(async () => {
    dataAbortRef.current?.abort();
    const controller = new AbortController();
    dataAbortRef.current = controller;

    setLoading(true);
    try {
      const [connRes, mapRes] = await Promise.all([
        fetchAPI('get_connections&type=inventory_sheets', { signal: controller.signal }),
        fetchAPI('get_mappings', { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;

      const connsData = connRes.success ? ensureArray<Connection>(connRes.data) : [];
      const mapsData = mapRes.success ? ensureArray<Mapping>(mapRes.data) : [];

      const mappedConns = connsData.map((c: Connection) => ({
        ...c,
        is_active: Boolean(Number(c.is_active)),
        mappings: mapsData.filter((m: Mapping) => Number(m.connection_id) === Number(c.id)),
      }));

      setConnections(mappedConns);

      const currentSel = selectedRef.current;
      if (currentSel) {
        const updatedSelected = mappedConns.find((c: Connection) => Number(c.id) === Number(currentSel.id));
        if (updatedSelected) {
          setSelected(updatedSelected);
        } else {
          setSelected(mappedConns[0] || null);
        }
      } else if (mappedConns.length > 0) {
        setSelected(mappedConns[0]);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      addToast('Lỗi tải cấu hình đồng bộ: ' + (e?.message || 'Không xác định'), 'error');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!isOpen) return;
    void fetchData();
    setSyncLogs('');
    return () => {
      dataAbortRef.current?.abort();
      colAbortRef.current?.abort();
    };
  }, [isOpen, fetchData]);

  const loadColumnsForSelected = useCallback(async (conn: Connection | null) => {
    if (!conn?.spreadsheet_id) {
      setColumns([]);
      return;
    }
    colAbortRef.current?.abort();
    const controller = new AbortController();
    colAbortRef.current = controller;
    setIsFetchingColumns(true);
    try {
      const res = await fetchAPI(
        `fetch_columns&id=${encodeURIComponent(conn.spreadsheet_id)}&name=${encodeURIComponent(conn.sheet_name)}`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      if (res.success) {
        setColumns(extractArray<string>(res));
      } else {
        addToast(res.message || 'Không thể tải danh sách cột từ Google Sheets', 'warning');
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      addToast('Không thể đọc danh sách cột từ trang tính', 'warning');
    } finally {
      if (!controller.signal.aborted) setIsFetchingColumns(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (selected && selected.id !== -1) {
      void loadColumnsForSelected(selected);
    } else {
      setColumns([]);
    }
    return () => {
      colAbortRef.current?.abort();
    };
  }, [selected?.id, selected?.spreadsheet_id, selected?.sheet_name, loadColumnsForSelected]);

  const handleAddConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current || isSaving) return;
    if (!newSpreadsheetId.trim()) {
      addToast('ID hoặc liên kết Google Sheets không được để trống', 'warning');
      return;
    }

    let spreadsheetId = newSpreadsheetId.trim();
    const urlMatch = spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch && urlMatch[1]) {
      spreadsheetId = urlMatch[1];
    }

    const calculatedInterval = syncPreset === '5p' ? 5
      : syncPreset === '15p' ? 15
      : syncPreset === '1h' ? 60
      : syncPreset === '1d' ? 1440
      : Math.max(1, Number(customSyncMins) || 15);

    const payload = {
      sheet_name: newSheetTab.trim() || 'Sheet1',
      spreadsheet_id: spreadsheetId,
      webhook_token: generateToken(),
      is_active: 1,
      sync_interval: calculatedInterval,
      connection_type: 'inventory_sheets',
      sync_mode: 'all',
      is_silent: 0,
      sync_saleperson: 0
    };

    inFlightRef.current = true;
    setIsSaving(true);
    try {
      const res = await fetchAPI('add_connection', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.success) {
        addToast('Đã kết nối Google Sheets thành công', 'success');
        setShowAddConn(false);
        setNewSpreadsheetId('');

        const freshRes = await fetchAPI('get_connections&type=inventory_sheets');
        const list = freshRes.success ? ensureArray<Connection>(freshRes.data) : [];
        if (list.length > 0) {
          const newConn = list[0];
          setSelected({
            ...newConn,
            is_active: Boolean(Number(newConn.is_active)),
            mappings: []
          });
        }
        await fetchData();
      } else {
        addToast(res.message || 'Lỗi thêm kết nối đồng bộ', 'error');
      }
    } catch (err: any) {
      addToast('Lỗi: ' + (err?.message || 'Không xác định'), 'error');
    } finally {
      inFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!selected || inFlightRef.current) return;
    inFlightRef.current = true;
    const newActive = !selected.is_active;
    try {
      const res = await fetchAPI(`toggle_connection&id=${selected.id}&active=${newActive ? 1 : 0}`);
      if (res.success) {
        addToast(newActive ? 'Đã kích hoạt đồng bộ tự động' : 'Đã tạm dừng đồng bộ', 'success');
        await fetchData();
      } else {
        addToast(res.message || 'Không thể đổi trạng thái kết nối', 'error');
      }
    } catch (e: any) {
      addToast('Lỗi: ' + (e?.message || 'Không xác định'), 'error');
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleDeleteConnection = (id: number) => {
    showConfirm({
      title: 'Xóa kết nối đồng bộ',
      message: 'Bạn có chắc chắn muốn xóa kết nối đồng bộ này và toàn bộ ánh xạ trường liên quan?',
      confirmText: 'Xóa kết nối',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          await fetchAPI(`delete_connection&id=${id}`);
          addToast('Đã xóa kết nối đồng bộ thành công', 'success');
          setSelected(null);
          await fetchData();
        } catch (e: any) {
          addToast('Lỗi: ' + (e?.message || 'Không xác định'), 'error');
        } finally {
          inFlightRef.current = false;
          closeConfirm();
        }
      }
    });
  };

  const handleSaveMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || inFlightRef.current || isSavingMapping) return;
    if (!newMappingCol.trim()) {
      addToast('Vui lòng chọn hoặc nhập tên cột trên Google Sheets', 'warning');
      return;
    }

    inFlightRef.current = true;
    setIsSavingMapping(true);
    try {
      const isEdit = Boolean(editingMappingId);
      const action = isEdit ? 'edit_mapping' : 'add_mapping';

      const payload = isEdit
        ? { id: editingMappingId, sheet_column: newMappingCol.trim(), system_field: newMappingField, custom_label: newMappingCustomLabel.trim() }
        : { connection_id: selected.id, sheet_column: newMappingCol.trim(), system_field: newMappingField, custom_label: newMappingCustomLabel.trim() };

      const res = await fetchAPI(action, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.success) {
        addToast(isEdit ? 'Đã cập nhật ánh xạ trường' : 'Đã thêm ánh xạ trường', 'success');
        setNewMappingCol('');
        setNewMappingCustomLabel('');
        setEditingMappingId(null);
        await fetchData();
      } else {
        addToast(res.message || 'Lỗi lưu ánh xạ trường', 'error');
      }
    } catch (e: any) {
      addToast('Lỗi: ' + (e?.message || 'Không xác định'), 'error');
    } finally {
      inFlightRef.current = false;
      setIsSavingMapping(false);
    }
  };

  const handleDeleteMapping = async (id: number) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await fetchAPI(`delete_mapping&id=${id}`);
      addToast('Đã xóa ánh xạ trường', 'info');
      await fetchData();
    } catch (e: any) {
      addToast('Lỗi: ' + (e?.message || 'Không xác định'), 'error');
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleForceSync = async () => {
    if (!selected || inFlightRef.current || isForceSyncing) return;
    inFlightRef.current = true;
    setIsForceSyncing(true);
    setSyncLogs('Đang kết nối API và tải dữ liệu tồn kho từ Google Sheets...');
    try {
      const res = await fetchAPI(`force_sync&id=${selected.id}`);
      if (res.success) {
        setSyncLogs(prev => prev + '\n\n--- KẾT QUẢ ĐỒNG BỘ ---\n' + (res.output || 'Đồng bộ hoàn tất.'));
        addToast('Đồng bộ dữ liệu kho hoàn tất', 'success');
        await fetchData();
      } else {
        setSyncLogs(prev => prev + '\n\n[LỖI ĐỒNG BỘ]: ' + (res.message || 'Không rõ nguyên nhân'));
        addToast(res.message || 'Lỗi đồng bộ', 'error');
      }
    } catch (e: any) {
      setSyncLogs(prev => prev + '\n\n[LỖI KẾT NỐI]: ' + (e?.message || 'Không xác định'));
      addToast('Lỗi kết nối khi đồng bộ', 'error');
    } finally {
      inFlightRef.current = false;
      setIsForceSyncing(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="inv-sync-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
            className="overlay-backdrop"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isMobile ? '0.5rem' : '2rem',
              zIndex: zModalNested,
              position: 'fixed',
              inset: 0,
            }}
            onClick={onClose}
          >
            <motion.div
              key="inv-sync-sheet"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
              className="modal-sheet"
              style={{
                width: '95vw',
                maxWidth: '1100px',
                height: '85vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: '16px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="modal-header" style={{ borderBottom: '1px solid #E2E8F0' }}>
                <div className="flex items-center gap-4">
                  <div style={{ background: '#BD1D2D', color: '#fff', width: 44, height: 44, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileSpreadsheet size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold" style={{ margin: 0, color: '#0F172A' }}>Đồng bộ Tồn kho Google Sheets</h2>
                    <p className="text-xs" style={{ margin: 0, color: '#64748B' }}>Kết nối bảng tính Google Sheets để tự động đồng bộ danh mục sản phẩm và số lượng tồn kho.</p>
                  </div>
                </div>
                <button type="button" className="btn-icon sm" onClick={onClose}><X size={20} /></button>
              </div>

              {/* Content Container */}
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', flex: 1, minHeight: 0, background: '#F8FAFC' }}>
                {/* Left Panel: List of Connections */}
                <div style={{ width: isMobile ? '100%' : 280, maxHeight: isMobile ? '180px' : 'none', borderRight: isMobile ? 'none' : '1px solid #E2E8F0', borderBottom: isMobile ? '1px solid #E2E8F0' : 'none', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', background: '#FFFFFF' }}>
                  <button
                    type="button"
                    onClick={() => setShowAddConn(true)}
                    className="btn primary sm"
                    style={{ width: '100%', justifyContent: 'center', gap: '0.5rem', height: '36px', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }}
                  >
                    <Plus size={16} /> Kết nối Sheets mới
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {loading && connections.length === 0 ? (
                      <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.78rem', color: '#64748B' }}>Đang tải kết nối...</div>
                    ) : connections.length === 0 ? (
                      <div style={{ padding: '2rem 1rem', textAlign: 'center', background: '#F8FAFC', borderRadius: 12, border: '1px dashed #E2E8F0' }}>
                        <Database size={24} style={{ color: '#64748B', margin: '0 auto 0.5rem' }} />
                        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', margin: 0 }}>Chưa có kết nối nào</p>
                      </div>
                    ) : (
                      connections.map(conn => {
                        const isSelected = selected && Number(selected.id) === Number(conn.id);
                        return (
                          <div
                            key={conn.id}
                            onClick={() => { setSelected(conn); setShowAddConn(false); }}
                            style={{
                              background: isSelected ? 'rgba(189, 29, 45, 0.06)' : '#FFFFFF',
                              border: `1px solid ${isSelected ? '#BD1D2D' : '#E2E8F0'}`,
                              borderRadius: 10, padding: '10px 12px', cursor: 'pointer', transition: 'all 0.2s',
                              position: 'relative'
                            }}
                          >
                            <div className="flex justify-between items-start">
                              <span style={{ fontWeight: 700, fontSize: '0.825rem', color: isSelected ? '#BD1D2D' : '#0F172A' }}>
                                {conn.sheet_name}
                              </span>
                              <span style={{
                                fontSize: '0.65rem',
                                padding: '2px 6px',
                                borderRadius: '6px',
                                fontWeight: 700,
                                background: conn.is_active ? 'rgba(15, 23, 42, 0.06)' : '#F1F5F9',
                                color: conn.is_active ? '#0F172A' : '#64748B',
                              }}>
                                {conn.is_active ? 'Bật' : 'Tắt'}
                              </span>
                            </div>
                            <p style={{ fontSize: '0.65rem', color: '#64748B', marginTop: 4, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 0 }}>
                              ID: {conn.spreadsheet_id}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right Panel: Active Screen */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto', padding: '1.5rem' }}>
                  {selected ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      {/* Connection Quick Controls */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, padding: '1rem' }}>
                        <div>
                          <h3 className="font-bold text-base" style={{ margin: 0, color: '#0F172A' }}>Tab: {selected.sheet_name}</h3>
                          <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            Spreadsheet ID: <span className="font-mono" style={{ background: '#F8FAFC', padding: '2px 6px', borderRadius: 4, border: '1px solid #E2E8F0' }}>{selected.spreadsheet_id}</span>
                            {selected.spreadsheet_id && (
                              <a href={`https://docs.google.com/spreadsheets/d/${selected.spreadsheet_id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#BD1D2D' }} title="Mở trang tính"><ExternalLink size={12} /></a>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={handleForceSync}
                            disabled={isForceSyncing}
                            className="btn outline sm"
                            style={{ height: '36px', gap: '0.4rem' }}
                          >
                            <RefreshCw size={14} className={isForceSyncing ? 'animate-spin' : ''} />
                            {isForceSyncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}
                          </button>

                          <button
                            type="button"
                            onClick={handleToggleActive}
                            className={`btn ${selected.is_active ? 'outline' : 'primary'} sm`}
                            style={{ height: '36px', ...(selected.is_active ? {} : { background: '#0F172A', borderColor: '#0F172A', color: '#FFFFFF' }) }}
                          >
                            {selected.is_active ? 'Tạm dừng đồng bộ' : 'Kích hoạt đồng bộ'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteConnection(selected.id)}
                            className="btn danger sm"
                            style={{ height: '36px', background: 'rgba(189, 29, 45, 0.08)', borderColor: 'rgba(189, 29, 45, 0.2)', color: '#BD1D2D' }}
                            title="Xóa kết nối"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Status or errors warning */}
                      {selected.last_error && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '12px', background: 'rgba(189, 29, 45, 0.06)', border: '1px solid rgba(189, 29, 45, 0.2)', color: '#BD1D2D', borderRadius: '10px', fontSize: '0.78rem' }}>
                          <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                          <div>
                            <span style={{ fontWeight: 700 }}>Lỗi đồng bộ gần nhất:</span> {selected.last_error}
                            {selected.last_sync_at && <p style={{ margin: '2px 0 0', opacity: 0.85 }}>Thời gian: {selected.last_sync_at}</p>}
                          </div>
                        </div>
                      )}

                      {/* Force sync stdout console log panel */}
                      {syncLogs && (
                        <div style={{ background: '#0F172A', borderRadius: 10, padding: '1rem', border: '1px solid #334155', fontSize: '0.75rem', fontFamily: 'monospace', color: '#F8FAFC', maxHeight: '180px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                          {syncLogs}
                        </div>
                      )}

                      {/* Field Mappings setup */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: '#0F172A' }}>Cấu hình Ánh xạ Trường Sản phẩm & Tồn kho</h4>
                          {isFetchingColumns && <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Đang tải danh sách cột...</span>}
                        </div>
                        <p style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '1rem', marginTop: 0 }}>
                          Ánh xạ các cột tiêu đề trên file Google Sheet khớp với các trường sản phẩm & tồn kho trong hệ thống.
                        </p>

                        {/* Mapping Add Row */}
                        <form onSubmit={handleSaveMapping} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '1rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1.2fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                          <div>
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Trường Dữ liệu Hệ thống</label>
                            <CustomSelect
                              options={INVENTORY_FIELDS}
                              value={newMappingField}
                              onChange={val => {
                                setNewMappingField(String(val));
                                const field = INVENTORY_FIELDS.find(f => f.value === val);
                                if (field && val !== 'custom') {
                                  setNewMappingCustomLabel('');
                                }
                              }}
                            />
                          </div>

                          <div>
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Tên Cột Trên Google Sheet</label>
                            {columns.length > 0 ? (
                              <CustomSelect
                                options={columns.map(c => ({ value: c, label: c }))}
                                value={newMappingCol}
                                onChange={val => setNewMappingCol(String(val))}
                                placeholder="Chọn cột..."
                              />
                            ) : (
                              <input
                                type="text"
                                className="form-input text-xs"
                                value={newMappingCol}
                                onChange={e => setNewMappingCol(e.target.value)}
                                placeholder="Ví dụ: Mã SKU, Tên sản phẩm, Giá bán"
                                style={{ height: 38 }}
                              />
                            )}
                          </div>

                          <div>
                            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Nhãn Tùy Biến (Tùy chọn)</label>
                            <input
                              type="text"
                              className="form-input text-xs"
                              value={newMappingCustomLabel}
                              onChange={e => setNewMappingCustomLabel(e.target.value)}
                              placeholder="Vd: Ghi chú kho, Quy cách"
                              style={{ height: 38 }}
                            />
                          </div>

                          <div className="flex gap-2">
                            {editingMappingId && (
                              <button type="button" className="btn outline sm" onClick={() => { setEditingMappingId(null); setNewMappingCol(''); setNewMappingCustomLabel(''); }} disabled={isSavingMapping}>Hủy</button>
                            )}
                            <button type="submit" className="btn primary sm" style={{ height: 38, display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }} disabled={isSavingMapping}>
                              {isSavingMapping && <RefreshCw size={14} className="spin" />}
                              <span>{editingMappingId ? (isSavingMapping ? 'Đang cập nhật...' : 'Cập nhật') : (isSavingMapping ? 'Đang thêm...' : 'Thêm')}</span>
                            </button>
                          </div>
                        </form>

                        {/* Mappings Table */}
                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                            <thead>
                              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>Trường Dữ liệu Hệ thống</th>
                                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>Cột Trên Google Sheet</th>
                                <th style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>Nhãn Hiển Thị Thêm</th>
                                <th style={{ padding: '10px 14px', width: 80 }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {ensureArray<Mapping>(selected.mappings).length === 0 ? (
                                <tr>
                                  <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
                                    Chưa cấu hình ánh xạ trường nào. Vui lòng thêm ánh xạ cột phía trên để đồng bộ dữ liệu.
                                  </td>
                                </tr>
                              ) : (
                                ensureArray<Mapping>(selected.mappings).map(m => {
                                  const sysFieldLabel = INVENTORY_FIELDS.find(f => f.value === m.system_field)?.label || m.system_field;
                                  return (
                                    <tr key={m.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>{sysFieldLabel}</td>
                                      <td style={{ padding: '10px 14px' }}>
                                        <span className="font-mono" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 6px', borderRadius: 4 }}>{m.sheet_column}</span>
                                      </td>
                                      <td style={{ padding: '10px 14px', color: '#64748B' }}>{m.custom_label || '—'}</td>
                                      <td style={{ padding: '10px 14px' }} className="flex justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingMappingId(m.id);
                                            setNewMappingField(m.system_field);
                                            setNewMappingCol(m.sheet_column);
                                            setNewMappingCustomLabel(m.custom_label || '');
                                          }}
                                          className="btn-icon sm"
                                          style={{ color: '#64748B' }}
                                          title="Sửa"
                                        >
                                          <Edit2 size={13} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteMapping(m.id)}
                                          className="btn-icon sm"
                                          style={{ color: '#BD1D2D' }}
                                          title="Xóa"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748B' }}>
                      <Database size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                      <p style={{ fontSize: '0.875rem' }}>Chọn một kết nối Google Sheets ở cột bên trái để xem chi tiết hoặc cấu hình.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Connection Modal */}
      <AnimatePresence>
        {showAddConn && (
          <motion.div
            key="inv-sync-add-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
            className="overlay-backdrop"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', zIndex: zModalNested + 1, position: 'fixed', inset: 0 }}
            onClick={() => setShowAddConn(false)}
          >
            <motion.div
              key="inv-sync-add-sheet"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
              className="modal-sheet"
              style={{ width: '640px', maxWidth: 'calc(100vw - 2rem)', maxHeight: '90vh', borderRadius: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 25px 60px rgba(15, 23, 42, 0.25)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="modal-header" style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(189, 29, 45, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#BD1D2D' }}>
                    <FileSpreadsheet size={22} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Kết nối Google Sheets Kho</h2>
                    <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>Kết nối bảng tính của bạn để tự động nạp & đồng bộ dữ liệu Sản phẩm / Tồn kho.</p>
                  </div>
                </div>
                <button type="button" className="btn-icon sm" onClick={() => setShowAddConn(false)}><X size={20} /></button>
              </div>

              {/* Body */}
              <div style={{ padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Hướng dẫn nhanh card */}
                <div style={{
                  background: 'rgba(189, 29, 45, 0.04)',
                  border: '1px solid rgba(189, 29, 45, 0.16)',
                  borderRadius: 12,
                  padding: '1.1rem',
                  color: '#0F172A',
                  fontSize: '0.82rem',
                  lineHeight: 1.6
                }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, color: '#BD1D2D', marginBottom: 6 }}>
                    <Info size={16} /> Hướng dẫn nhanh:
                  </div>
                  <ol style={{ paddingLeft: '1.20rem', margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <li>Bấm nút <strong style={{ color: '#BD1D2D' }}>Chia sẻ (Share)</strong> trên file Google Sheets.</li>
                    <li>Tại phần <strong style={{ color: '#BD1D2D' }}>Quyền truy cập chung</strong>, chọn <strong style={{ color: '#BD1D2D' }}>Bất kỳ ai có liên kết</strong> và đặt quyền là <strong style={{ color: '#BD1D2D' }}>Người xem</strong>.</li>
                    <li>Copy <strong style={{ color: '#BD1D2D' }}>Spreadsheet ID</strong> hoặc dán toàn bộ URL trình duyệt vào ô bên dưới.</li>
                  </ol>
                </div>

                <form onSubmit={handleAddConnection} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                  {/* Đường dẫn bảng tính */}
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, color: '#334155', textTransform: 'uppercase', fontSize: '0.73rem', letterSpacing: 0.4, marginBottom: 6, display: 'block' }}>
                      Đường dẫn Google Sheet (hoặc ID)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 11, left: 12, color: '#64748B' }}><Link2 size={16} /></div>
                      <input
                        type="text"
                        className="form-input"
                        style={{ paddingLeft: 36, background: '#F8FAFC', border: '1px solid #E2E8F0', height: 40 }}
                        value={newSpreadsheetId}
                        onChange={e => setNewSpreadsheetId(e.target.value)}
                        placeholder="Dán link hoặc Spreadsheet ID vào đây..."
                        required
                      />
                    </div>
                  </div>

                  {/* Tên sheet con */}
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, color: '#334155', textTransform: 'uppercase', fontSize: '0.73rem', letterSpacing: 0.4, marginBottom: 6, display: 'block' }}>
                      Tên trang tính (Sheet name)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 11, left: 12, color: '#64748B' }}><FileSpreadsheet size={16} /></div>
                      <input
                        type="text"
                        className="form-input"
                        style={{ paddingLeft: 36, background: '#F8FAFC', border: '1px solid #E2E8F0', height: 40 }}
                        value={newSheetTab}
                        onChange={e => setNewSheetTab(e.target.value)}
                        placeholder="Sheet1"
                        required
                      />
                    </div>
                  </div>

                  {/* Chu kỳ đồng bộ */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label className="form-label" style={{ fontWeight: 700, color: '#334155', textTransform: 'uppercase', fontSize: '0.73rem', letterSpacing: '0.04em', margin: 0 }}>CHU KỲ ĐỒNG BỘ</label>
                      <button
                        type="button"
                        onClick={() => setShowSyncMechanismInfo(v => !v)}
                        style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.75rem', color: '#BD1D2D', fontWeight: 600, cursor: 'pointer' }}
                      >
                        (?) Cơ chế hoạt động
                      </button>
                    </div>

                    {showSyncMechanismInfo && (
                      <div style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: '0.75rem', color: '#475569', lineHeight: 1.5 }}>
                        Hệ thống định kỳ đọc trang tính theo chu kỳ đã chọn, đối khớp từng dòng theo <strong>Mã SKU / Mã sản phẩm</strong> để cập nhật đơn giá bán, giá vốn và số lượng tồn kho an toàn mà không làm mất lịch sử giao dịch.
                      </div>
                    )}

                    <div className="responsive-grid-5" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                      {[
                        { id: '5p', icon: <Zap size={18} />, time: '5p', label: 'NHANH' },
                        { id: '15p', icon: <Clock size={18} />, time: '15p', label: 'CHUẨN' },
                        { id: '1h', icon: <Clock size={18} />, time: '1h', label: 'ỔN ĐỊNH' },
                        { id: '1d', icon: <Target size={18} />, time: '1 ngày', label: 'TIẾT KIỆM' },
                        { id: 'custom', icon: <Plus size={18} />, time: 'Khác', label: 'TÙY CHỈNH' }
                      ].map(preset => (
                        <div
                          key={preset.id}
                          onClick={() => setSyncPreset(preset.id as any)}
                          style={{
                            border: syncPreset === preset.id ? '2px solid #BD1D2D' : '1px solid #E2E8F0',
                            background: syncPreset === preset.id ? 'rgba(189, 29, 45, 0.06)' : '#FFFFFF',
                            borderRadius: 12, padding: '0.75rem 0', cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                            transition: 'all 0.2s',
                            textAlign: 'center'
                          }}
                        >
                          <div style={{ color: syncPreset === preset.id ? '#BD1D2D' : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{preset.icon}</div>
                          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: syncPreset === preset.id ? '#BD1D2D' : '#0F172A' }}>{preset.time}</div>
                          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: syncPreset === preset.id ? '#BD1D2D' : '#64748B' }}>{preset.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {syncPreset === 'custom' && (
                    <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: 12, border: '1px solid #E2E8F0', display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                      <div style={{ width: 150 }}>
                        <label className="form-label" style={{ fontWeight: 700, color: '#64748B', textTransform: 'uppercase', fontSize: '0.73rem', letterSpacing: 0.4 }}>Số phút tùy chỉnh</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="number" min={1} className="form-input"
                            value={customSyncMins} onChange={e => setCustomSyncMins(Math.max(1, Number(e.target.value) || 1))}
                            style={{ fontWeight: 700, fontSize: '0.95rem', paddingRight: '3.2rem' }}
                          />
                          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: '0.8rem', fontWeight: 600 }}>phút</span>
                        </div>
                      </div>
                      <div style={{ flex: 1, fontSize: '0.75rem', color: '#64748B', lineHeight: 1.5 }}>
                        Lưu ý: Thời gian quá ngắn (dưới 5 phút) có thể khiến Google giới hạn băng thông API.
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddConn(false)}
                      style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Quay lại
                    </button>
                    <button
                      type="submit"
                      className="btn primary"
                      disabled={isSaving}
                      style={{
                        padding: '10px 20px',
                        borderRadius: 8,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 600,
                        background: '#BD1D2D',
                        borderColor: '#BD1D2D',
                        color: '#FFFFFF',
                      }}
                    >
                      {isSaving && <RefreshCw size={14} className="spin" />}
                      {isSaving ? 'Đang kết nối...' : 'Kiểm tra & Lưu kết nối'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
};

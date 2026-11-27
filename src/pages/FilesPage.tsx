import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  Folder, FileText, Download, Trash2, Search, X,
  File, LayoutGrid, List, Plus, Edit,
  Shield, User, Users, ChevronRight, HardDrive,
  Clock3, FileImage, FileVideo,
  MoreHorizontal, Share2, Building2, Eye, Megaphone, Loader2,
  FileSpreadsheet, Calendar
} from 'lucide-react';
import api from '../api/axios';
import { compressToWebP } from '../utils/imageCompress';
import { downloadFileWithWebpToJpg } from '../utils/fileDownloader';
import { downloadExportFile } from '../utils/exportHelper';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/uiStore';
import { EmptyCard } from '../components/ui/EmptyCard';
import { Avatar } from '../components/ui/Avatar';
import { CustomSelect } from '../components/ui/CustomSelect';
import { CustomModal } from '../components/ui/CustomModal';
import { Pagination } from '../components/ui/Pagination';
import { CardSkeleton, TableSkeleton, Skeleton } from '../components/ui/Skeleton';
import { useAuthStore } from '../store/authStore';
import { isSales, isViewer as checkIsViewer } from '../utils/roleUtils';
import { ensureArray } from '../utils/safeArray';
import { pushOverlay } from '../utils/overlayStack';
import { useUploadProgress } from '../contexts/UploadProgressContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';

const TEN_GB_BYTES = 10 * 1024 * 1024 * 1024;
const FORBIDDEN_CLOUD_EXT = /\.(php|phtml|phar|exe|bat|cmd|sh|ps1|msi|vbs|js|mjs|jsx|ts|tsx|html?|svg)$/i;
const SAFE_CLOUD_ACCEPT = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z';
const MIME_GROUP_FILTERS: { id: 'all' | 'image' | 'pdf' | 'document' | 'link'; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'document', label: 'Tài liệu' },
  { id: 'pdf', label: 'PDF' },
  { id: 'image', label: 'Hình ảnh' },
  { id: 'link', label: 'Liên kết' },
];

interface FilesPageProps {
  embedProjectId?: string;
  isEmbedded?: boolean;
}

type ExportDomainKey = 'crm' | 'finance' | 'hrm' | 'ops';

const EXPORT_PRESET_DOMAINS: Record<ExportDomainKey, { label: string; datasets: { type: string; label: string; desc: string }[] }> = {
  crm: {
    label: 'CRM',
    datasets: [
      { type: 'contact', label: 'Khách hàng & Lead (Contacts)', desc: 'Hồ sơ lead, nguồn, tư vấn phụ trách, trạng thái phễu' },
      { type: 'deal', label: 'Cơ hội bán hàng (Deals)', desc: 'Danh sách deal, giai đoạn, doanh thu dự kiến' },
      { type: 'company', label: 'Doanh nghiệp B2B (Companies)', desc: 'Đối tác, quy mô, ngành nghề, liên hệ chính' },
      { type: 'task', label: 'Công việc (Tasks)', desc: 'Tiến độ xử lý, hạn hoàn thành, người phụ trách' },
    ],
  },
  finance: {
    label: 'Tài chính',
    datasets: [
      { type: 'deposit', label: 'Đặt cọc & Thu học phí (Deposits)', desc: 'Phiếu đặt cọc, số tiền, phương thức & trạng thái đối soát' },
      { type: 'sales_order', label: 'Đơn hàng bán (Sales Orders)', desc: 'SO bán hàng, công nợ & chi tiết hợp đồng' },
      { type: 'expense', label: 'Phiếu chi phí (Expenses)', desc: 'Chi phí vận hành, trạng thái duyệt & chứng từ' },
      { type: 'purchase_order', label: 'Đơn mua hàng (PO)', desc: 'Đơn đặt mua nhà cung cấp & tổng giá trị' },
      { type: 'invoice', label: 'Hóa đơn (Invoices)', desc: 'Hóa đơn phát hành & trạng thái thanh toán' },
      { type: 'quote', label: 'Báo giá dịch vụ (Quotes)', desc: 'Bảng báo giá đã gửi khách hàng' },
    ],
  },
  hrm: {
    label: 'HRM',
    datasets: [
      { type: 'staff', label: 'Hồ sơ Nhân sự (Employees)', desc: 'Danh sách nhân viên, phòng ban, chức vụ & hợp đồng' },
      { type: 'attendance', label: 'Bảng công chấm công (Attendance)', desc: 'Dữ liệu check-in/check-out & ngày công theo kỳ' },
      { type: 'salary_advance', label: 'Tạm ứng lương (Advances)', desc: 'Danh sách phiếu tạm ứng & trạng thái phê duyệt' },
    ],
  },
  ops: {
    label: 'Kho & Vận hành',
    datasets: [
      { type: 'ticket', label: 'Phiếu hỗ trợ (Tickets & SLA)', desc: 'Ticket hỗ trợ nội bộ & lịch sử xử lý' },
      { type: 'product', label: 'Danh mục Sản phẩm / Khóa học', desc: 'Mã SP, đơn giá & phân loại' },
      { type: 'inventory', label: 'Tồn kho & Vật tư (Inventory)', desc: 'Số lượng tồn & giá trị kho hiện tại' },
      { type: 'asset', label: 'Tài sản cố định (Assets)', desc: 'Thiết bị cấp phát & giá trị khấu hao' },
      { type: 'supplier', label: 'Nhà cung cấp (Suppliers)', desc: 'Thông tin đối tác cung ứng' },
    ],
  },
};

const isSafeExternalUrl = (raw?: string): boolean => {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || /^(javascript|vbscript|data):/i.test(trimmed)) return false;
  return !trimmed.startsWith('//');
};

const resolveCloudFileUrl = (fileObj: any): string => {
  const raw = String(fileObj?.file_path || fileObj?.url || '').trim();
  if (!raw || !isSafeExternalUrl(raw)) return '';
  if (fileObj?.mime_type === 'link' || /^https?:\/\//i.test(raw)) {
    return raw;
  }
  const apiBase = import.meta.env.VITE_API_URL ?? '/backend';
  const clean = raw.replace(/^\/?(storage\/)+/i, '').replace(/^\/?/, '');
  return `${apiBase}/${clean}`;
};

const formatDateSafe = (val: any): string => {
  if (!val) return '--/--/----';
  const s = String(val).trim();
  const normalized = s.includes('T') || s.endsWith('Z') ? s : s.replace(' ', 'T');
  const dt = new Date(normalized);
  if (isNaN(dt.getTime())) return '--/--/----';
  return dt.toLocaleDateString('vi-VN');
};

const formatSize = (bytes: number): string => {
  if (!bytes || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (name: string) => {
  const ext = (name || '').split('.').pop()?.toLowerCase() || '';
  if (['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    return {
      icon: ['pdf'].includes(ext) ? <FileText size={20} /> : <FileImage size={20} />,
      color: '#BD1D2D',
      bg: 'rgba(189, 29, 45, 0.08)'
    };
  }
  if (['doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx'].includes(ext)) {
    return { icon: <FileText size={20} />, color: '#334155', bg: '#f1f5f9' };
  }
  if (['zip', 'rar', '7z', 'mp4', 'mov'].includes(ext)) {
    return { icon: <Folder size={20} />, color: '#475569', bg: '#f1f5f9' };
  }
  return { icon: <File size={20} />, color: '#64748b', bg: '#f1f5f9' };
};

export const FilesPage: React.FC<FilesPageProps> = ({ embedProjectId, isEmbedded = false }) => {
  const { startUpload, updateProgress, finishUpload } = useUploadProgress();
  const { addToast, showConfirm } = useUIStore(useShallow((s) => ({ addToast: s.addToast, showConfirm: s.showConfirm })));
  const currentUser = useAuthStore(s => s.user);
  const isSale = isSales(currentUser as any);
  const isViewer = checkIsViewer(currentUser as any);
  const maxUploadMb = Math.max(1, Number(useTypedSubSetting<number>('core.upload_security_policy', 'max_mb', 50)) || 50);
  const quotaGb = Math.max(1, Number(useTypedSubSetting<number>('core.upload_security_policy', 'quota_gb', 10)) || 10);
  const maxCloudFileBytes = maxUploadMb * 1024 * 1024;

  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isUpdatingFile, setIsUpdatingFile] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mimeGroup, setMimeGroup] = useState<'all' | 'image' | 'pdf' | 'document' | 'link'>('all');
  const [activeTab, setActiveTab] = useState<'shared' | 'personal'>('shared');
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [category, setCategory] = useState('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadInFlightRef = useRef(false);
  const updateInFlightRef = useRef(false);
  const filesAbortRef = useRef<AbortController | null>(null);
  const catsAbortRef = useRef<AbortController | null>(null);
  const projAbortRef = useRef<AbortController | null>(null);
  const campAbortRef = useRef<AbortController | null>(null);
  const prevFilterKeyRef = useRef<string>('');

  const [categories, setCategories] = useState<any[]>([
    { id: 'all', label: 'Tất cả' }
  ]);
  const [projects, setProjects] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(embedProjectId || 'all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalSizeBytes, setTotalSizeBytes] = useState(0);
  const [storageSummary, setStorageSummary] = useState<{
    total_files: number;
    total_size_bytes: number;
    shared_files: number;
    shared_bytes: number;
    personal_files: number;
    personal_bytes: number;
    recent_7d_files: number;
    quota_bytes: number;
  } | null>(null);

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadFormData, setUploadFormData] = useState({ name: '', category: 'general', project_id: embedProjectId || '', campaign_id: '' });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingFile, setEditingFile] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({ id: 0, name: '', category: 'general', visibility: 'shared', project_id: '', campaign_id: '' });
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [catFormData, setCatFormData] = useState({ label: '' });
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [editFileExt, setEditFileExt] = useState('');

  // Portal dropdown anchor state so overflow:hidden never clips
  const [menuAnchor, setMenuAnchor] = useState<{
    kind: 'folder' | 'file';
    id: string | number;
    top: number;
    left: number;
    item: any;
    displayLabel?: string;
  } | null>(null);

  // Smart Export Preset Builder Modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDomain, setExportDomain] = useState<ExportDomainKey>('crm');
  const [exportType, setExportType] = useState<string>('contact');
  const [exportFromDate, setExportFromDate] = useState('');
  const [exportToDate, setExportToDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const canManageCurrentFolder = !isViewer && (!isSale || activeTab === 'personal');
  const currentLimit = debouncedSearch.trim() ? 100 : (currentPath.length === 0 ? 50 : 15);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    return () => {
      filesAbortRef.current?.abort();
      catsAbortRef.current?.abort();
      projAbortRef.current?.abort();
      campAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!menuAnchor) return;
    const unregister = pushOverlay('files-action-menu', () => setMenuAnchor(null), 2147483630);
    const closeOnScrollOrResize = () => setMenuAnchor(null);
    window.addEventListener('resize', closeOnScrollOrResize);
    window.addEventListener('scroll', closeOnScrollOrResize, true);
    return () => {
      unregister();
      window.removeEventListener('resize', closeOnScrollOrResize);
      window.removeEventListener('scroll', closeOnScrollOrResize, true);
    };
  }, [menuAnchor]);

  const fetchProjects = useCallback(async () => {
    projAbortRef.current?.abort();
    const ctrl = new AbortController();
    projAbortRef.current = ctrl;
    try {
      const res = await api.get('/projects?bypass_roster=1', { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (res.data?.success) {
        setProjects(ensureArray<any>(res.data.data));
      }
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      console.error('Failed to fetch projects', err);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    catsAbortRef.current?.abort();
    const ctrl = new AbortController();
    catsAbortRef.current = ctrl;
    try {
      const res = await api.get('/file-categories', {
        params: { visibility: activeTab },
        signal: ctrl.signal
      });
      if (ctrl.signal.aborted) return;
      const rawCats = ensureArray<any>(res.data?.data);
      setCategories(rawCats);
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      console.error('Failed to fetch categories', err);
    }
  }, [activeTab]);

  const fetchCampaigns = useCallback(async () => {
    campAbortRef.current?.abort();
    const ctrl = new AbortController();
    campAbortRef.current = ctrl;
    try {
      const res = await api.get('/marketing-campaigns', { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (res.data?.success) {
        setCampaigns(ensureArray<any>(res.data.data));
      }
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      console.error('Failed to fetch campaigns', err);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchProjects();
    fetchCampaigns();
    if (embedProjectId) {
      setSelectedProjectId(embedProjectId);
      setUploadFormData(prev => ({ ...prev, project_id: embedProjectId }));
    } else {
      const params = new URLSearchParams(window.location.search);
      const pId = params.get('project_id');
      if (pId) {
        setSelectedProjectId(pId);
      }
    }
  }, [embedProjectId, fetchProjects, fetchCampaigns]);

  const fetchFiles = useCallback(async (targetPage = page) => {
    filesAbortRef.current?.abort();
    const ctrl = new AbortController();
    filesAbortRef.current = ctrl;
    setLoading(true);
    try {
      const reqLimit = debouncedSearch.trim() ? 100 : (currentPath.length === 0 ? 50 : 15);
      const res = await api.get('/cloud-files', {
        params: {
          page: targetPage,
          limit: reqLimit,
          category: category === 'all' ? '' : category,
          search: debouncedSearch.trim(),
          mime_group: mimeGroup === 'all' ? '' : mimeGroup,
          project_id: selectedProjectId === 'all' ? '' : selectedProjectId,
          visibility: activeTab
        },
        signal: ctrl.signal
      });
      if (ctrl.signal.aborted) return;
      const data = res.data?.data || {};
      const allFiles = ensureArray<any>(data.items);
      const generalFiles = allFiles.filter((f: any) => {
        const isClientDoc = f.contact_id || f.category === 'Đặt cọc' || f.category === 'coop_proof' || (f.name && String(f.name).startsWith('UNC_'));
        return !isClientDoc;
      });
      setFiles(generalFiles);
      setTotal(Number(data.total) || 0);
      setTotalSizeBytes(Number(data.total_size_bytes) || 0);
      setStorageSummary(data.storage_summary || null);
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      addToast('Lỗi khi tải danh sách tệp tin', 'error');
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false);
      }
    }
  }, [page, category, activeTab, selectedProjectId, debouncedSearch, mimeGroup, currentPath.length, addToast]);

  useEffect(() => {
    const filterKey = `${category}|${activeTab}|${selectedProjectId}|${debouncedSearch}|${mimeGroup}`;
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    fetchFiles(page);
  }, [page, category, activeTab, selectedProjectId, debouncedSearch, mimeGroup, fetchFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (FORBIDDEN_CLOUD_EXT.test(file.name)) {
      addToast('Định dạng tệp này không được phép tải lên vì lý do bảo mật.', 'error');
      return;
    }
    if (file.size > maxCloudFileBytes) {
      addToast(`Dung lượng tệp vượt quá giới hạn tối đa ${maxUploadMb}MB`, 'error');
      return;
    }

    const baseName = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;
    setSelectedFile(file);
    setUploadFormData({
      name: baseName,
      category: category === 'all' ? 'general' : category,
      project_id: embedProjectId || '',
      campaign_id: ''
    });
    setShowUploadModal(true);
  };

  const confirmUpload = async () => {
    if (!selectedFile || uploadInFlightRef.current || isUploading) return;
    uploadInFlightRef.current = true;
    setIsUploading(true);

    const sizeStr = `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`;
    const taskId = startUpload(selectedFile.name, sizeStr);

    try {
      updateProgress(taskId, 10, 'compressing');
      const compressedFile = await compressToWebP(selectedFile);
      if (compressedFile.size > maxCloudFileBytes) {
        throw new Error(`Dung lượng tệp sau nén vẫn vượt quá ${maxUploadMb}MB`);
      }
      updateProgress(taskId, 25, 'uploading');

      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('name', uploadFormData.name.trim() || selectedFile.name);
      formData.append('category', uploadFormData.category || 'general');
      formData.append('visibility', activeTab);
      if (uploadFormData.project_id) {
        formData.append('project_id', uploadFormData.project_id);
      }
      if (uploadFormData.campaign_id) {
        formData.append('campaign_id', uploadFormData.campaign_id);
      }

      await api.post('/cloud-files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            updateProgress(taskId, percent, percent === 100 ? 'processing' : 'uploading');
          }
        }
      });

      finishUpload(taskId, true);
      addToast('Đã tải tệp lên thành công', 'success');
      setShowUploadModal(false);
      setSelectedFile(null);
      setUploadFormData({ name: '', category: 'general', project_id: embedProjectId || '', campaign_id: '' });
      await fetchFiles(page);
    } catch (e: any) {
      finishUpload(taskId, false, e?.message || 'Lỗi khi tải tệp lên');
      addToast(e?.response?.data?.message || e?.message || 'Lỗi khi tải tệp lên', 'error');
    } finally {
      uploadInFlightRef.current = false;
      setIsUploading(false);
    }
  };

  const handleOpenEditModal = (fileObj: any) => {
    setEditingFile(fileObj);
    const name = fileObj.name || '';
    const lastDot = name.lastIndexOf('.');
    const ext = lastDot !== -1 ? name.substring(lastDot) : '';
    const baseName = lastDot !== -1 ? name.substring(0, lastDot) : name;
    setEditFileExt(ext);
    setEditFormData({
      id: fileObj.id,
      name: baseName,
      category: fileObj.category || 'general',
      visibility: fileObj.visibility || 'shared',
      project_id: fileObj.project_id ? String(fileObj.project_id) : '',
      campaign_id: fileObj.campaign_id ? String(fileObj.campaign_id) : ''
    });
    setShowEditModal(true);
  };

  const handleUpdateFile = async () => {
    if (!editFormData.name.trim() || updateInFlightRef.current || isUpdatingFile) return;
    updateInFlightRef.current = true;
    setIsUpdatingFile(true);
    try {
      await api.put(`/cloud-files/${editFormData.id}`, {
        name: editFormData.name.trim() + editFileExt,
        category: editFormData.category || 'general',
        visibility: editFormData.visibility,
        project_id: editFormData.project_id || null,
        campaign_id: editFormData.campaign_id || null
      });
      addToast('Cập nhật tài liệu thành công', 'success');
      setShowEditModal(false);
      await fetchFiles(page);
    } catch {
      addToast('Lỗi khi cập nhật tài liệu', 'error');
    } finally {
      updateInFlightRef.current = false;
      setIsUpdatingFile(false);
    }
  };

  const handleSaveCategory = async () => {
    if (!canManageCurrentFolder) {
      addToast('Bạn không có quyền thực hiện hành động này', 'error');
      return;
    }
    if (!catFormData.label.trim() || isSavingCategory) return;
    try {
      setIsSavingCategory(true);
      const cleanName = catFormData.label.trim();
      // Both create and rename inside currentPath share currentPath as parent directory
      const fullLabel = currentPath.length > 0 ? `${currentPath.join('/')}/${cleanName}` : cleanName;

      if (editingCat) {
        const oldLabel = editingCat.label;
        await api.put(`/file-categories/${editingCat.id}`, { label: fullLabel });
        const subCatsToRename = categories.filter(c => String(c.label).startsWith(oldLabel + '/'));
        for (const sub of subCatsToRename) {
          const relativePart = String(sub.label).slice(oldLabel.length);
          await api.put(`/file-categories/${sub.id}`, { label: fullLabel + relativePart });
        }
        addToast('Đã cập nhật thư mục', 'success');
      } else {
        await api.post('/file-categories', { label: fullLabel, icon_type: 'folder', visibility: activeTab });
        addToast('Đã tạo thư mục mới', 'success');
      }
      await fetchCategories();
      setShowCatModal(false);
      setEditingCat(null);
      setCatFormData({ label: '' });
    } catch {
      addToast('Lỗi lưu thư mục', 'error');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const deleteCategory = (id: string) => {
    if (!canManageCurrentFolder) {
      addToast('Bạn không có quyền xóa thư mục này', 'error');
      return;
    }
    const targetCat = categories.find(c => String(c.id) === String(id));
    showConfirm(
      'Xóa danh mục?',
      'Thư mục này (và các thư mục con nếu có) sẽ bị xóa. Các tệp tin bên trong sẽ được chuyển về mục Khác.',
      async () => {
        try {
          if (targetCat?.label) {
            const subCats = categories.filter(c => String(c.label).startsWith(targetCat.label + '/'));
            for (const sub of subCats) {
              await api.delete(`/file-categories/${sub.id}`);
            }
          }
          await api.delete(`/file-categories/${id}`);
          if (category === id) setCategory('all');
          addToast('Đã xóa danh mục', 'success');
          await fetchCategories();
          await fetchFiles(1);
        } catch {
          addToast('Lỗi xóa danh mục', 'error');
        }
      }
    );
  };

  const handleDelete = (id: number) => {
    showConfirm(
      'Xóa tệp tin?',
      'Hành động này không thể hoàn tác. Tệp tin sẽ bị xóa vĩnh viễn khỏi hệ thống.',
      async () => {
        try {
          await api.delete(`/cloud-files/${id}`);
          addToast('Đã xóa tệp tin', 'success');
          await fetchFiles(page);
        } catch {
          addToast('Lỗi khi xóa tệp tin', 'error');
        }
      }
    );
  };

  const handleCopyShareLink = async (fileObj: any) => {
    const url = resolveCloudFileUrl(fileObj);
    if (!url) {
      addToast('Liên kết tệp không hợp lệ', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      addToast('Đã sao chép link liên kết', 'success');
    } catch {
      addToast('Trình duyệt không cho phép sao chép tự động', 'error');
    }
  };

  const openMenuAtTrigger = (
    e: React.MouseEvent<HTMLButtonElement>,
    kind: 'folder' | 'file',
    item: any,
    displayLabel?: string
  ) => {
    e.stopPropagation();
    const id = item.id;
    if (menuAnchor && menuAnchor.kind === kind && String(menuAnchor.id) === String(id)) {
      setMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 155;
    const left = Math.min(Math.max(12, rect.right - menuWidth), Math.max(12, window.innerWidth - menuWidth - 12));
    const top = Math.min(rect.bottom + 6, Math.max(12, window.innerHeight - 190));
    setMenuAnchor({ kind, id, top, left, item, displayLabel });
  };

  const handleRunExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const params: Record<string, any> = { type: exportType };
      if (exportFromDate) params.from_date = exportFromDate;
      if (exportToDate) params.to_date = exportToDate;
      const dateSuffix = new Date().toISOString().slice(0, 10);
      await downloadExportFile({
        endpoint: '/export',
        params,
        defaultFilename: `myerp_${exportType}_${dateSuffix}.csv`,
        onSuccess: () => {
          addToast('Đã xuất tệp dữ liệu ERP thành công', 'success');
          setShowExportModal(false);
        },
        onError: (err: any) => addToast(typeof err === 'string' ? err : (err?.message || 'Lỗi khi xuất dữ liệu ERP'), 'error')
      });
    } catch {
      // Handled via onError callback
    } finally {
      setIsExporting(false);
    }
  };

  const currentPathStr = currentPath.join('/');
  const currentCategoryObj = categories.find(c => c.label === currentPathStr);
  const currentCategoryId = currentCategoryObj ? currentCategoryObj.id : 'all';

  const displayFolders = useMemo(() => {
    if (searchTerm.trim()) return [];
    return categories.filter(c => {
      if (c.id === 'all') return false;
      const label = String(c.label || '');
      if (currentPath.length === 0) {
        return !label.includes('/');
      }
      return label.startsWith(currentPathStr + '/') && label.slice(currentPathStr.length + 1).split('/').length === 1;
    });
  }, [categories, currentPath.length, currentPathStr, searchTerm]);

  const displayFiles = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return files.filter(f => {
      if (q) {
        const matchName = String(f.name || '').toLowerCase().includes(q);
        const matchUploader = String(f.uploader_name || '').toLowerCase().includes(q);
        if (!matchName && !matchUploader) return false;
      }
      if (searchTerm.trim() || mimeGroup !== 'all') return true;
      if (currentPath.length === 0) {
        return !f.category || f.category === 'general' || f.category === 'all' || !categories.some(c => c.id === f.category);
      }
      return f.category === currentCategoryId;
    });
  }, [files, debouncedSearch, searchTerm, mimeGroup, currentPath.length, categories, currentCategoryId]);

  const categorySelectOptions = useMemo(() => {
    const base = categories.filter(c => c.id !== 'all').map(c => ({ value: String(c.id), label: c.label }));
    if (!base.some(o => o.value === 'general')) {
      base.unshift({ value: 'general', label: 'Khác (Mặc định)' });
    }
    return base;
  }, [categories]);

  // Real governance KPI stats computed strictly from loaded backend storage_summary & file state
  const kpiStats = useMemo(() => {
    const customFolders = categories.filter(c => c.id !== 'all');
    const quotaBytes = Number(storageSummary?.quota_bytes) > 0 ? Number(storageSummary?.quota_bytes) : quotaGb * 1073741824 || TEN_GB_BYTES;
    const usedBytes = storageSummary ? Number(storageSummary.total_size_bytes || 0) : totalSizeBytes;
    const usedPct = Math.min(100, (usedBytes / Math.max(1, quotaBytes)) * 100);
    const remainingBytes = Math.max(0, quotaBytes - usedBytes);
    const linkedProjectCount = files.filter(f => Boolean(f.project_id || f.project_name)).length;
    const linkedCampaignCount = files.filter(f => Boolean(f.campaign_id || f.campaign_name)).length;
    return {
      quotaBytes,
      usedBytes,
      usedPct,
      remainingBytes,
      customFoldersCount: customFolders.length,
      linkedProjectCount,
      linkedCampaignCount,
      sharedFiles: storageSummary ? Number(storageSummary.shared_files || 0) : null,
      personalFiles: storageSummary ? Number(storageSummary.personal_files || 0) : null,
      recent7dFiles: storageSummary ? Number(storageSummary.recent_7d_files || 0) : null,
    };
  }, [categories, totalSizeBytes, storageSummary, quotaGb, files]);

  const getMimeIcon = (mime: string) => {
    if (!mime) return <File size={24} style={{ color: '#64748b' }} />;
    if (mime.includes('image')) return <FileImage size={24} style={{ color: '#BD1D2D' }} />;
    if (mime.includes('video')) return <FileVideo size={24} style={{ color: '#334155' }} />;
    return <File size={24} style={{ color: '#64748b' }} />;
  };

  return (
    <div className={isEmbedded ? '' : 'page-container'} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: isEmbedded ? 0 : undefined }}>
      {!isEmbedded && (
        <div className="page-header" style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {activeTab === 'shared' ? <Users style={{ color: '#BD1D2D' }} /> : <User style={{ color: '#334155' }} />}
              {activeTab === 'shared' ? 'Kho tài liệu chung' : 'Tài liệu cá nhân'}
            </h1>
            <p className="page-subtitle" style={{ marginTop: '4px' }}>
              {activeTab === 'shared'
                ? 'Lưu trữ các biểu mẫu, quy trình và tài liệu dùng chung cho toàn đội ngũ'
                : 'Không gian lưu trữ riêng tư chỉ mình bạn có thể truy cập'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Ch.V Segmented Control Switcher */}
            <div style={{
              display: 'inline-flex',
              padding: '3px',
              borderRadius: '10px',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              gap: '2px'
            }}>
              <button
                type="button"
                style={{
                  height: '32px',
                  padding: '0 14px',
                  borderRadius: '7px',
                  border: 'none',
                  background: activeTab === 'shared' ? '#ffffff' : 'transparent',
                  color: activeTab === 'shared' ? '#BD1D2D' : '#64748b',
                  fontWeight: activeTab === 'shared' ? 700 : 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'shared' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => { setActiveTab('shared'); setCurrentPath([]); setCategory('all'); }}
              >
                <Users size={14} />
                Dùng chung
              </button>
              <button
                type="button"
                style={{
                  height: '32px',
                  padding: '0 14px',
                  borderRadius: '7px',
                  border: 'none',
                  background: activeTab === 'personal' ? '#ffffff' : 'transparent',
                  color: activeTab === 'personal' ? '#BD1D2D' : '#64748b',
                  fontWeight: activeTab === 'personal' ? 700 : 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'personal' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => { setActiveTab('personal'); setCurrentPath([]); setCategory('all'); }}
              >
                <User size={14} />
                Cá nhân
              </button>
            </div>

            {!isViewer && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowExportModal(true)}
                title="Xuất báo cáo dữ liệu ERP chuẩn UTF-8"
                style={{ border: '1px solid #e2e8f0', borderRadius: '8px', height: '38px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <FileSpreadsheet size={15} color="#334155" />
                <span className="hide-on-mobile">Xuất dữ liệu ERP</span>
              </button>
            )}

            {!isViewer && (
              <button
                type="button"
                className="btn primary"
                onClick={() => fileInputRef.current?.click()}
                title="Tải tệp mới"
                style={{ borderRadius: '8px', height: '38px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#BD1D2D', color: '#ffffff', border: 'none' }}
              >
                <Plus size={16} />
                <span className="hide-on-mobile">Tải tệp mới</span>
              </button>
            )}
          </div>
        </div>
      )}
      <input type="file" ref={fileInputRef} accept={SAFE_CLOUD_ACCEPT} style={{ display: 'none' }} onChange={handleFileSelect} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem', overflow: 'hidden' }}>

          {/* Ch.V 4-KPI Storage Governance Strip */}
          {!isEmbedded && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', flexShrink: 0 }}>
              {/* Card 1 */}
              <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '16px 18px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>TỔNG TÀI LIỆU</span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <HardDrive size={16} />
                  </div>
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                  {total}
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.74rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span>• Chung / Cá nhân: <strong style={{ color: '#0f172a' }}>{kpiStats.sharedFiles !== null ? `${kpiStats.sharedFiles} / ${kpiStats.personalFiles}` : (activeTab === 'shared' ? 'Dùng chung' : 'Cá nhân')}</strong></span>
                  <span>• Đang hiển thị: <strong style={{ color: '#0f172a' }}>{displayFiles.length} tệp</strong></span>
                </div>
              </div>

              {/* Card 2 */}
              <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '16px 18px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>DUNG LƯỢNG SỬ DỤNG</span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={16} />
                  </div>
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                  {formatSize(kpiStats.usedBytes)}
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.74rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span>• Tỷ lệ hạn mức {formatSize(kpiStats.quotaBytes)}: <strong style={{ color: '#0f172a' }}>{kpiStats.usedPct.toFixed(1)}%</strong></span>
                  <span>• Còn trống: <strong style={{ color: '#0f172a' }}>{formatSize(kpiStats.remainingBytes)}</strong></span>
                </div>
              </div>

              {/* Card 3 */}
              <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '16px 18px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>CÂY THƯ MỤC & MỚI</span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Folder size={16} />
                  </div>
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                  {kpiStats.customFoldersCount}
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.74rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span>• Vị trí: <strong style={{ color: '#0f172a' }}>{currentPath.length === 0 ? 'Thư mục gốc' : currentPath[currentPath.length - 1]}</strong></span>
                  <span>• Tải lên 7 ngày qua: <strong style={{ color: '#0f172a' }}>{kpiStats.recent7dFiles !== null ? `${kpiStats.recent7dFiles} tệp` : `${displayFolders.length} thư mục`}</strong></span>
                </div>
              </div>

              {/* Card 4 */}
              <div style={{ background: '#ffffff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '16px 18px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>LIÊN KẾT CHƯƠNG TRÌNH</span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Megaphone size={16} />
                  </div>
                </div>
                <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                  {kpiStats.linkedProjectCount}
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.74rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span>• Gắn chiến dịch MKT: <strong style={{ color: '#0f172a' }}>{kpiStats.linkedCampaignCount}</strong></span>
                  <span>• Giới hạn tệp: <strong style={{ color: '#0f172a' }}>{maxUploadMb} MB / tệp</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* Personal Vault Theme banner */}
          {activeTab === 'personal' && (
            <div style={{
              background: '#0F172A',
              border: '1px solid #1E293B',
              borderRadius: '16px',
              padding: '16px 22px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
              flexShrink: 0
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(189, 29, 45, 0.16)',
                border: '1px solid rgba(189, 29, 45, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#F87171',
                flexShrink: 0
              }}>
                <Shield size={18} strokeWidth={1.75} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontWeight: 700, fontSize: '0.88rem', color: '#F8FAFC', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  HỆ THỐNG LƯU TRỮ BẢO MẬT CÁ NHÂN (PERSONAL VAULT)
                  <span style={{ fontSize: '0.6875rem', background: 'rgba(248, 250, 252, 0.12)', border: '1px solid rgba(248, 250, 252, 0.18)', color: '#E2E8F0', padding: '2px 8px', borderRadius: '6px', fontWeight: 600, letterSpacing: '0.04em' }}>SECURE</span>
                </h4>
                <p style={{ fontSize: '0.76rem', color: '#CBD5E1', margin: '3px 0 0 0', fontWeight: 500, lineHeight: 1.45 }}>
                  Không gian lưu trữ riêng tư. Chỉ tài khoản cá nhân của bạn mới có quyền truy cập, xem hoặc chỉnh sửa dữ liệu tại đây.
                </p>
              </div>
            </div>
          )}

          {/* Unified Explorer Control Panel */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            flexShrink: 0
          }}>
            {/* Row 1: Breadcrumbs Bar + Storage Progress + New Folder */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '20px',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', flex: 1, paddingBottom: '2px' }}>
                <button
                  type="button"
                  onClick={() => { setCurrentPath([]); setCategory('all'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: currentPath.length === 0 ? '#BD1D2D' : '#64748b', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                >
                  <HardDrive size={16} /> Gốc
                </button>
                {currentPath.map((folder, idx) => (
                  <React.Fragment key={idx}>
                    <ChevronRight size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    <button
                      type="button"
                      onClick={() => {
                        const newPath = currentPath.slice(0, idx + 1);
                        setCurrentPath(newPath);
                        const partialLabel = newPath.join('/');
                        const catObj = categories.find(c => c.label === partialLabel);
                        setCategory(catObj ? catObj.id : 'all');
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: idx === currentPath.length - 1 ? '#BD1D2D' : '#64748b', padding: 0 }}
                    >
                      {folder}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Dung lượng:</span>
                  <div style={{ width: '80px', height: '6px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      height: '100%',
                      width: `${kpiStats.usedPct}%`,
                      background: activeTab === 'personal' ? '#334155' : '#BD1D2D'
                    }} />
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#0f172a', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {formatSize(kpiStats.usedBytes)} / {formatSize(kpiStats.quotaBytes)}
                  </span>
                </div>

                {canManageCurrentFolder && (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => { setEditingCat(null); setCatFormData({ label: '' }); setShowCatModal(true); }}
                    style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px', height: '32px', border: '1px solid #e2e8f0' }}
                  >
                    <Plus size={14} /> Thư mục mới
                  </button>
                )}
              </div>
            </div>

            <div style={{ height: '1px', background: '#f1f5f9' }} />

            {/* Row 2: Search, Project filter, View Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '1rem', flex: 1, maxWidth: '650px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="filter-search" style={{ flex: 1, borderRadius: '8px', height: '34px', minWidth: '200px' }}>
                  <Search size={16} style={{ color: '#64748b', flexShrink: 0 }} />
                  <input
                    type="text"
                    placeholder="Tìm kiếm tài liệu theo tên hoặc người tải..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ fontSize: '0.8rem' }}
                  />
                  {searchTerm && (
                    <button type="button" onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                      <X size={14} />
                    </button>
                  )}
                </div>

                {!isEmbedded && (
                  <div style={{ width: '210px', flexShrink: 0 }}>
                    <CustomSelect
                      options={[
                        { value: 'all', label: 'Tất cả chương trình' },
                        ...projects.map(p => ({ value: String(p.id), label: p.name }))
                      ]}
                      value={selectedProjectId}
                      onChange={val => setSelectedProjectId(String(val))}
                      placeholder="Lọc theo chương trình"
                      searchable
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'inline-flex', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '3px', gap: '2px' }}>
                <button
                  type="button"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 12px',
                    borderRadius: '7px', fontSize: '0.78rem', fontWeight: viewMode === 'grid' ? 700 : 600,
                    background: viewMode === 'grid' ? '#ffffff' : 'transparent',
                    color: viewMode === 'grid' ? '#BD1D2D' : '#64748b',
                    boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid size={14} /> Lưới thẻ
                </button>
                <button
                  type="button"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 12px',
                    borderRadius: '7px', fontSize: '0.78rem', fontWeight: viewMode === 'list' ? 700 : 600,
                    background: viewMode === 'list' ? '#ffffff' : 'transparent',
                    color: viewMode === 'list' ? '#BD1D2D' : '#64748b',
                    boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                  onClick={() => setViewMode('list')}
                >
                  <List size={14} /> Danh sách
                </button>
              </div>
            </div>

            {/* Row 3: Ch.V Segmented MIME Group Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', padding: '3px', borderRadius: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', gap: '2px', flexWrap: 'wrap' }}>
                {MIME_GROUP_FILTERS.map((mg) => {
                  const isActive = mimeGroup === mg.id;
                  return (
                    <button
                      key={mg.id}
                      type="button"
                      onClick={() => setMimeGroup(mg.id)}
                      style={{
                        height: '30px',
                        padding: '0 12px',
                        borderRadius: '7px',
                        border: 'none',
                        background: isActive ? '#ffffff' : 'transparent',
                        color: isActive ? '#BD1D2D' : '#64748b',
                        fontWeight: isActive ? 700 : 600,
                        fontSize: '0.76rem',
                        cursor: 'pointer',
                        boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {mg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px', paddingBottom: '160px' }}>
            {loading ? (
              viewMode === 'list' ? (
                <TableSkeleton rows={6} cols={6} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="card skeleton-card" style={{ padding: '0.85rem 1.15rem', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid #E2E8F0' }}>
                        <Skeleton width={32} height={32} borderRadius={8} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <Skeleton width="70%" height={13} />
                          <Skeleton width="40%" height={10} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1.25rem' }}>
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <CardSkeleton key={i} height={150} />
                    ))}
                  </div>
                </div>
              )
            ) : (displayFolders.length === 0 && displayFiles.length === 0) ? (
              <div style={{ flex: 1, display: 'flex', minHeight: '360px', width: '100%' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <EmptyCard
                    icon={<Folder />}
                    title={debouncedSearch.trim() || mimeGroup !== 'all' ? 'Không tìm thấy tài liệu phù hợp' : 'Thư mục này đang trống'}
                    description={
                      debouncedSearch.trim()
                        ? `Không có tệp tin nào khớp với từ khóa "${debouncedSearch}".`
                        : mimeGroup !== 'all'
                          ? 'Không có tài liệu nào thuộc nhóm định dạng đã chọn.'
                          : isViewer
                            ? 'Không có tài liệu nào trong thư mục này.'
                            : `Bắt đầu tổ chức tài liệu bằng cách tải lên tệp đầu tiên. Dung lượng lưu trữ được giới hạn ở mức ${quotaGb} GB.`
                    }
                    actionText={!debouncedSearch.trim() && mimeGroup === 'all' && !isViewer ? 'Tải lên ngay' : undefined}
                    onAction={!debouncedSearch.trim() && mimeGroup === 'all' && !isViewer ? () => fileInputRef.current?.click() : undefined}
                  />
                </div>
              </div>
            ) : (
              <>
                {viewMode === 'grid' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '2rem' }}>
                    {/* Folders Section */}
                    {displayFolders.length > 0 && (
                      <div>
                        <h5 style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '14px', letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}>
                          Thư mục ({displayFolders.length})
                        </h5>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
                          {displayFolders.map(sub => {
                            const displayLabel = currentPath.length === 0 ? sub.label : sub.label.slice(currentPathStr.length + 1);
                            const fileCount = files.filter(f => f.category === sub.id).length;
                            return (
                              <motion.div
                                key={sub.id}
                                layout
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                style={{
                                  background: '#ffffff',
                                  padding: '14px 16px',
                                  borderRadius: '16px',
                                  border: '1px solid #E2E8F0',
                                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  position: 'relative',
                                  overflow: 'visible'
                                }}
                                className="hover-shadow"
                                onClick={() => {
                                  const nextPath = [...currentPath, displayLabel];
                                  setCurrentPath(nextPath);
                                  setCategory(sub.id);
                                }}
                              >
                                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Folder size={20} />
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <h5 style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={displayLabel}>
                                    {displayLabel}
                                  </h5>
                                  <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '3px 0 0 0', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                                    {fileCount > 0 ? `${fileCount} tài liệu` : 'Mở thư mục'}
                                  </p>
                                </div>
                                {canManageCurrentFolder && (
                                  <button
                                    type="button"
                                    className="btn-icon-bare"
                                    title="Thao tác thư mục"
                                    onClick={(e) => openMenuAtTrigger(e, 'folder', sub, displayLabel)}
                                    style={{ padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
                                  >
                                    <MoreHorizontal size={16} />
                                  </button>
                                )}
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Files Section */}
                    {displayFiles.length > 0 && (
                      <div>
                        <h5 style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '14px', letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}>
                          Tệp tin ({displayFiles.length})
                        </h5>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
                          {displayFiles.map(f => {
                            const fileVisual = getFileIcon(f.name);
                            return (
                              <motion.div
                                key={f.id}
                                layout
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                style={{
                                  background: '#ffffff',
                                  padding: '16px',
                                  borderRadius: '16px',
                                  border: '1px solid #E2E8F0',
                                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                  position: 'relative',
                                  overflow: 'visible'
                                }}
                                className="hover-shadow"
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                                    <div style={{ width: '34px', height: '34px', background: fileVisual.bg, color: fileVisual.color, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      {React.cloneElement(fileVisual.icon, { size: 17 })}
                                    </div>
                                    <h4 style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.name}>
                                      {f.name}
                                    </h4>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn-icon-bare"
                                    title="Thao tác"
                                    onClick={(e) => openMenuAtTrigger(e, 'file', f)}
                                    style={{ padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
                                  >
                                    <MoreHorizontal size={16} />
                                  </button>
                                </div>

                                <p style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginBottom: (f.project_name || f.campaign_name) ? '8px' : '14px', paddingLeft: '44px' }}>
                                  {formatSize(f.file_size)} • {f.mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}
                                </p>
                                {(f.project_name || f.campaign_name) && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginLeft: '44px', marginBottom: '14px' }}>
                                    {f.project_name && (
                                      <div style={{ gap: '4px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', padding: '2px 8px', borderRadius: '6px', fontSize: '0.6875rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                                        <Building2 size={10} /> {f.project_name}
                                      </div>
                                    )}
                                    {f.campaign_name && (
                                      <div style={{ gap: '4px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', padding: '2px 8px', borderRadius: '6px', fontSize: '0.6875rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                                        <Megaphone size={10} /> {f.campaign_name}
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                                  <Avatar name={f.uploader_name} size="sm" />
                                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.uploader_name || 'Thành viên'}</span>
                                    <span style={{ fontSize: '0.6875rem', color: '#64748b', fontWeight: 500, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <Clock3 size={9} /> {formatDateSafe(f.created_at)}
                                    </span>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="table-wrap responsive-table-wrap mobile-card-table" style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', overflow: 'hidden', marginBottom: '2rem' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '14px 20px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>Tên tài liệu</th>
                          <th style={{ padding: '14px 16px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>Loại</th>
                          <th style={{ padding: '14px 16px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>Dung lượng</th>
                          <th style={{ padding: '14px 16px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>Người tải lên</th>
                          <th style={{ padding: '14px 16px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>Ngày tải</th>
                          <th style={{ padding: '14px 20px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>Hành động</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayFolders.map(sub => {
                          const displayLabel = currentPath.length === 0 ? sub.label : sub.label.slice(currentPathStr.length + 1);
                          return (
                            <tr
                              key={sub.id}
                              className="hover-row"
                              style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                              onClick={() => {
                                const nextPath = [...currentPath, displayLabel];
                                setCurrentPath(nextPath);
                                setCategory(sub.id);
                              }}
                            >
                              <td data-label="Tên tài liệu" style={{ padding: '14px 20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Folder size={17} />
                                  </div>
                                  <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.85rem' }}>{displayLabel}</span>
                                </div>
                              </td>
                              <td data-label="Loại" style={{ padding: '14px 16px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Thư mục</span>
                              </td>
                              <td data-label="Dung lượng" style={{ padding: '14px 16px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>-</span>
                              </td>
                              <td data-label="Người tải lên" style={{ padding: '14px 16px' }}>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>-</span>
                              </td>
                              <td data-label="Ngày tải" style={{ padding: '14px 16px' }}>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>-</span>
                              </td>
                              <td data-label="Hành động" style={{ padding: '14px 20px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                {canManageCurrentFolder && (
                                  <button
                                    type="button"
                                    className="btn-icon-bare"
                                    title="Thao tác"
                                    onClick={(e) => openMenuAtTrigger(e, 'folder', sub, displayLabel)}
                                    style={{ padding: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
                                  >
                                    <MoreHorizontal size={16} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}

                        {displayFiles.map(f => {
                          const fileVisual = getFileIcon(f.name);
                          return (
                            <tr key={f.id} className="hover-row" style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td data-label="Tên tài liệu" style={{ padding: '14px 20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div style={{ width: '36px', height: '36px', background: fileVisual.bg, color: fileVisual.color, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {fileVisual.icon}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.85rem' }}>{f.name}</span>
                                    {(f.project_name || f.campaign_name) && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '3px' }}>
                                        {f.project_name && (
                                          <span style={{ fontSize: '0.6875rem', color: '#475569', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <Building2 size={10} /> {f.project_name}
                                          </span>
                                        )}
                                        {f.campaign_name && (
                                          <span style={{ fontSize: '0.6875rem', color: '#BD1D2D', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <Megaphone size={10} /> {f.campaign_name}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td data-label="Loại" style={{ padding: '14px 16px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>{f.mime_type?.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                              </td>
                              <td data-label="Dung lượng" style={{ padding: '14px 16px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{formatSize(f.file_size || f.size)}</span>
                              </td>
                              <td data-label="Người tải lên" style={{ padding: '14px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Avatar name={f.uploader_name} size="sm" />
                                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0f172a' }}>{f.uploader_name || 'Thành viên'}</span>
                                </div>
                              </td>
                              <td data-label="Ngày tải" style={{ padding: '14px 16px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{formatDateSafe(f.created_at)}</span>
                              </td>
                              <td data-label="Hành động" style={{ padding: '14px 20px', textAlign: 'right' }}>
                                <button
                                  type="button"
                                  className="btn-icon-bare"
                                  title="Thao tác"
                                  onClick={(e) => openMenuAtTrigger(e, 'file', f)}
                                  style={{ padding: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
                                >
                                  <MoreHorizontal size={18} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {total > currentLimit && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem 0 2rem' }}>
                    <Pagination total={total} page={page} pageSize={currentLimit} onChange={setPage} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Portal Action Dropdown Menu (never clipped by overflow:hidden) */}
      {typeof document !== 'undefined' && menuAnchor && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 2147483629 }}
            onClick={() => setMenuAnchor(null)}
          />
          <div
            style={{
              position: 'fixed',
              top: menuAnchor.top,
              left: menuAnchor.left,
              width: 155,
              background: 'var(--color-surface, #ffffff)',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 10px 28px rgba(15, 23, 42, 0.16)',
              padding: '5px',
              zIndex: 2147483630,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}
          >
            {menuAnchor.kind === 'folder' ? (
              <>
                <button
                  type="button"
                  className="btn-icon-bare"
                  style={{ padding: '7px 10px', fontSize: '0.76rem', fontWeight: 600, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '7px', color: '#334155' }}
                  onClick={() => {
                    const sub = menuAnchor.item;
                    const label = menuAnchor.displayLabel || sub.label;
                    setMenuAnchor(null);
                    setEditingCat(sub);
                    setCatFormData({ label });
                    setShowCatModal(true);
                  }}
                >
                  <Edit size={13} /> Đổi tên
                </button>
                <button
                  type="button"
                  className="btn-icon-bare"
                  style={{ padding: '7px 10px', fontSize: '0.76rem', fontWeight: 600, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '7px', color: '#BD1D2D' }}
                  onClick={() => {
                    const id = menuAnchor.item.id;
                    setMenuAnchor(null);
                    deleteCategory(id);
                  }}
                >
                  <Trash2 size={13} /> Xóa
                </button>
              </>
            ) : (
              <>
                {resolveCloudFileUrl(menuAnchor.item) && (
                  <a
                    href={resolveCloudFileUrl(menuAnchor.item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '7px 10px', fontSize: '0.76rem', fontWeight: 600, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '7px', color: '#334155', textDecoration: 'none' }}
                    onClick={() => setMenuAnchor(null)}
                  >
                    <Eye size={13} /> Xem tài liệu
                  </a>
                )}
                <button
                  type="button"
                  style={{ padding: '7px 10px', fontSize: '0.76rem', fontWeight: 600, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '7px', color: '#334155', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onClick={() => {
                    const f = menuAnchor.item;
                    setMenuAnchor(null);
                    const url = resolveCloudFileUrl(f);
                    if (url) downloadFileWithWebpToJpg(url, f.name);
                  }}
                >
                  <Download size={13} /> Tải xuống
                </button>
                {canManageCurrentFolder && (
                  <button
                    type="button"
                    style={{ padding: '7px 10px', fontSize: '0.76rem', fontWeight: 600, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '7px', color: '#334155', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onClick={() => {
                      const f = menuAnchor.item;
                      setMenuAnchor(null);
                      handleOpenEditModal(f);
                    }}
                  >
                    <Edit size={13} /> Chỉnh sửa
                  </button>
                )}
                <button
                  type="button"
                  style={{ padding: '7px 10px', fontSize: '0.76rem', fontWeight: 600, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '7px', color: '#334155', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onClick={() => {
                    const f = menuAnchor.item;
                    setMenuAnchor(null);
                    handleCopyShareLink(f);
                  }}
                >
                  <Share2 size={13} /> Sao chép link
                </button>
                {canManageCurrentFolder && (
                  <button
                    type="button"
                    style={{ padding: '7px 10px', fontSize: '0.76rem', fontWeight: 600, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '7px', color: '#BD1D2D', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onClick={() => {
                      const id = menuAnchor.item.id;
                      setMenuAnchor(null);
                      handleDelete(id);
                    }}
                  >
                    <Trash2 size={13} /> Xóa
                  </button>
                )}
              </>
            )}
          </div>
        </>,
        document.body
      )}

      {/* Modal Tải tệp mới */}
      {showUploadModal && (
      <CustomModal
        isOpen={showUploadModal}
        onClose={() => !isUploading && setShowUploadModal(false)}
        title="Tải tài liệu mới"
        width={560}
        disableClose={isUploading}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {getMimeIcon(selectedFile?.type || '')}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{selectedFile?.name}</p>
              <p style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, margin: '2px 0 0' }}>{formatSize(selectedFile?.size || 0)}</p>
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Tên hiển thị</label>
            <input
              className="form-input"
              value={uploadFormData.name}
              onChange={e => setUploadFormData({ ...uploadFormData, name: e.target.value })}
              placeholder="Nhập tên tài liệu..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Danh mục</label>
              <CustomSelect
                options={categorySelectOptions}
                value={uploadFormData.category}
                onChange={val => setUploadFormData({ ...uploadFormData, category: String(val) })}
              />
            </div>

            <div style={{ margin: 0 }} />

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Chương trình liên kết</label>
              <CustomSelect
                searchable
                direction="up"
                options={[
                  { value: '', label: 'Không liên kết' },
                  ...projects.map(p => ({ value: String(p.id), label: p.name }))
                ]}
                value={uploadFormData.project_id}
                onChange={val => {
                  const nextProj = String(val);
                  let nextCamp = uploadFormData.campaign_id;
                  if (nextCamp) {
                    const c = campaigns.find(x => String(x.id) === nextCamp);
                    if (c && String(c.project_id) !== nextProj) {
                      nextCamp = '';
                    }
                  }
                  setUploadFormData({ ...uploadFormData, project_id: nextProj, campaign_id: nextCamp });
                }}
                placeholder="Chọn chương trình..."
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Chiến dịch liên kết</label>
              <CustomSelect
                searchable
                direction="up"
                options={[
                  { value: '', label: 'Không liên kết' },
                  ...campaigns
                    .filter(c => !uploadFormData.project_id || String(c.project_id) === uploadFormData.project_id)
                    .map(c => ({ value: String(c.id), label: c.name }))
                ]}
                value={uploadFormData.campaign_id}
                onChange={val => {
                  const nextCamp = String(val);
                  let nextProj = uploadFormData.project_id;
                  if (nextCamp) {
                    const c = campaigns.find(x => String(x.id) === nextCamp);
                    if (c && c.project_id) {
                      nextProj = String(c.project_id);
                    }
                  }
                  setUploadFormData({ ...uploadFormData, campaign_id: nextCamp, project_id: nextProj });
                }}
                placeholder="Chọn chiến dịch..."
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn secondary flex-1" onClick={() => setShowUploadModal(false)} disabled={isUploading}>Hủy</button>
            <button type="button" className="btn primary flex-1" onClick={confirmUpload} disabled={isUploading} style={{ background: '#BD1D2D', color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {isUploading && <Loader2 size={15} className="spin" />}
              <span>{isUploading ? 'Đang tải...' : 'Bắt đầu tải lên'}</span>
            </button>
          </div>
        </div>
      </CustomModal>
      )}

      {/* Modal Chỉnh sửa tài liệu */}
      {showEditModal && (
      <CustomModal
        isOpen={showEditModal}
        onClose={() => !isUpdatingFile && setShowEditModal(false)}
        title="Chỉnh sửa tài liệu"
        width={560}
        disableClose={isUpdatingFile}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Tên hiển thị</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                className="form-input"
                value={editFormData.name}
                onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                placeholder="Nhập tên tài liệu..."
                style={{ flex: 1 }}
              />
              {editFileExt && (
                <span style={{
                  background: '#f8fafc',
                  padding: '0.55rem 0.8rem',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap'
                }}>
                  {editFileExt}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Danh mục</label>
              <CustomSelect
                options={categorySelectOptions}
                value={editFormData.category}
                onChange={val => setEditFormData({ ...editFormData, category: String(val) })}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Quyền riêng tư</label>
              <CustomSelect
                options={[
                  { value: 'shared', label: 'Chia sẻ (Shared)' },
                  { value: 'personal', label: 'Cá nhân (Personal)' }
                ]}
                value={editFormData.visibility}
                onChange={val => setEditFormData({ ...editFormData, visibility: String(val) })}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Chương trình liên kết</label>
              <CustomSelect
                searchable
                direction="up"
                options={[
                  { value: '', label: 'Không liên kết' },
                  ...projects.map(p => ({ value: String(p.id), label: p.name }))
                ]}
                value={editFormData.project_id}
                onChange={val => {
                  const nextProj = String(val);
                  let nextCamp = editFormData.campaign_id;
                  if (nextCamp) {
                    const c = campaigns.find(x => String(x.id) === nextCamp);
                    if (c && String(c.project_id) !== nextProj) {
                      nextCamp = '';
                    }
                  }
                  setEditFormData({ ...editFormData, project_id: nextProj, campaign_id: nextCamp });
                }}
                placeholder="Chọn chương trình..."
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Chiến dịch liên kết</label>
              <CustomSelect
                searchable
                direction="up"
                options={[
                  { value: '', label: 'Không liên kết' },
                  ...campaigns
                    .filter(c => !editFormData.project_id || String(c.project_id) === editFormData.project_id)
                    .map(c => ({ value: String(c.id), label: c.name }))
                ]}
                value={editFormData.campaign_id}
                onChange={val => {
                  const nextCamp = String(val);
                  let nextProj = editFormData.project_id;
                  if (nextCamp) {
                    const c = campaigns.find(x => String(x.id) === nextCamp);
                    if (c && c.project_id) {
                      nextProj = String(c.project_id);
                    }
                  }
                  setEditFormData({ ...editFormData, campaign_id: nextCamp, project_id: nextProj });
                }}
                placeholder="Chọn chiến dịch..."
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn secondary flex-1" onClick={() => setShowEditModal(false)} disabled={isUpdatingFile}>Hủy</button>
            <button type="button" className="btn primary flex-1" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#BD1D2D', color: '#ffffff' }} onClick={handleUpdateFile} disabled={isUpdatingFile}>
              {isUpdatingFile && <Loader2 size={15} className="spin" />}
              <span>{isUpdatingFile ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
            </button>
          </div>
        </div>
      </CustomModal>
      )}

      {/* Modal Quản lý Danh mục */}
      {showCatModal && (
      <CustomModal
        isOpen={showCatModal}
        onClose={() => !isSavingCategory && setShowCatModal(false)}
        title={editingCat ? 'Sửa danh mục' : 'Thêm danh mục mới'}
        width={400}
        disableClose={isSavingCategory}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Tên danh mục</label>
            <input
              className="form-input"
              value={catFormData.label}
              onChange={e => setCatFormData({ label: e.target.value })}
              placeholder="Ví dụ: Tài liệu kỹ thuật..."
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveCategory();
                }
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="btn secondary flex-1" onClick={() => setShowCatModal(false)} disabled={isSavingCategory}>Hủy</button>
            <button type="button" className="btn primary flex-1" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#BD1D2D', color: '#ffffff' }} onClick={handleSaveCategory} disabled={isSavingCategory}>
              {isSavingCategory && <Loader2 size={15} className="spin" />}
              <span>{isSavingCategory ? 'Đang lưu...' : (editingCat ? 'Cập nhật' : 'Thêm ngay')}</span>
            </button>
          </div>
        </div>
      </CustomModal>
      )}

      {/* Ch.V Smart Export Preset Builder Modal */}
      {showExportModal && (
      <CustomModal
        isOpen={showExportModal}
        onClose={() => !isExporting && setShowExportModal(false)}
        title="Smart Export Preset Builder — Xuất dữ liệu ERP"
        width={640}
        disableClose={isExporting}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            {/* Ch.V Segmented Control */}
            <div style={{ display: 'inline-flex', padding: '3px', borderRadius: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', gap: '2px' }}>
              {(Object.keys(EXPORT_PRESET_DOMAINS) as ExportDomainKey[]).map(key => {
                const active = exportDomain === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setExportDomain(key);
                      setExportType(EXPORT_PRESET_DOMAINS[key].datasets[0].type);
                    }}
                    style={{
                      height: '32px',
                      padding: '0 14px',
                      borderRadius: '7px',
                      border: 'none',
                      background: active ? '#ffffff' : 'transparent',
                      color: active ? '#BD1D2D' : '#64748b',
                      fontWeight: active ? 700 : 600,
                      fontSize: '0.8rem',
                      boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {EXPORT_PRESET_DOMAINS[key].label}
                  </button>
                );
              })}
            </div>

            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '4px 10px', borderRadius: '6px' }}>
              UTF-8 BOM • csvSafe()
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.65rem' }}>
            {EXPORT_PRESET_DOMAINS[exportDomain].datasets.map(ds => {
              const selected = exportType === ds.type;
              return (
                <button
                  key={ds.type}
                  type="button"
                  onClick={() => setExportType(ds.type)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: selected ? '1.5px solid #BD1D2D' : '1px solid #e2e8f0',
                    background: selected ? 'rgba(189, 29, 45, 0.04)' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                    transition: 'all 0.12s ease'
                  }}
                >
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: selected ? '#BD1D2D' : '#0f172a' }}>{ds.label}</span>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.35 }}>{ds.desc}</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', paddingTop: '4px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={13} color="#64748b" /> Từ ngày (tùy chọn)
              </label>
              <input
                type="date"
                className="form-input"
                value={exportFromDate}
                onChange={e => setExportFromDate(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={13} color="#64748b" /> Đến ngày (tùy chọn)
              </label>
              <input
                type="date"
                className="form-input"
                value={exportToDate}
                onChange={e => setExportToDate(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
            <button type="button" className="btn secondary" onClick={() => setShowExportModal(false)} disabled={isExporting}>
              Đóng
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={handleRunExport}
              disabled={isExporting}
              style={{ background: '#BD1D2D', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {isExporting ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
              <span>{isExporting ? 'Đang kết xuất CSV...' : 'Tải xuống báo cáo CSV'}</span>
            </button>
          </div>
        </div>
      </CustomModal>
      )}
    </div>
  );
};

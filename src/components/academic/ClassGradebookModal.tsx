import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, BookOpen, Upload, Download, Save, Search, CheckCircle2,
  Loader2, FileSpreadsheet, Users, Award
} from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api/axios';
import { toast } from 'react-hot-toast';
import {
  STANDARD_PROGRAM_NAMES,
  STANDARD_PROGRAM_CURRICULUMS,
  matchStandardProgramKey,
  resolveCurriculumSubjects
} from './StudentAcademicWorkspace';
import { useTypedSetting } from '../../contexts/SettingsBootstrapContext';
import { pushOverlay } from '../../utils/overlayStack';

export type InputScoreScale = 'auto' | '6' | '10' | '20' | '100';

const csvSafe = (val: unknown): string => {
  const s = String(val ?? '');
  if (/^[=+\-@\t\r]/.test(s)) {
    return `'${s}`;
  }
  return s;
};

const toCsvRow = (cells: unknown[]): string =>
  cells.map(c => `"${csvSafe(c).replace(/"/g, '""')}"`).join(',');

interface ClassGradebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCampaignId?: number | null;
  initialProjectId?: number | null;
  initialProgramName?: string;
  initialSubjectKey?: string;
  campaignsList?: any[];
  projectsList?: any[];
  onSaved?: () => void;
  zIndex?: number;
}

const cleanSubjectNameWithoutCode = (rawName: string): string => {
  const s = String(rawName || '').trim();
  if (!s) return '';
  const stripped = s
    .replace(/^\[[A-Z0-9_-]{2,24}\]\s*[-–—:\|]?\s*/i, '')
    .replace(/^(?=[A-Z0-9_-]*\d)[A-Z0-9_-]{2,20}\s*[-–—:\|]\s*/i, '')
    .replace(/^\d{1,3}[\.\)]\s+/, '')
    .trim();
  return stripped || s;
};

/**
 * Official Swiss UMEF 6.0 ECTS Grading Scale with explicit input scale support & TypedSettings cutoffs:
 * - A (Excellent):    >= 5.25 => passed
 * - B (Very Good):    4.75 – 5.24 => passed
 * - C (Good):         4.50 – 4.74 => passed
 * - D (Satisfactory): 4.25 – 4.49 => passed
 * - E (Pass):         4.00 – 4.24 => passed
 * - F (Fail):         < 4.00 (FX >= 3.50: Retake; < 3.50: Redo)
 */
export const inferEctsGrade6 = (
  scoreStr: string,
  inputScale: InputScoreScale = 'auto',
  cutoffs?: { A?: number; B?: number; C?: number; D?: number; E?: number; FX?: number }
) => {
  const trimmed = String(scoreStr || '').trim().replace(',', '.');
  if (trimmed === '' || isNaN(Number(trimmed))) {
    return null;
  }
  const raw = Number(trimmed);
  if (!Number.isFinite(raw) || raw < 0) {
    return null;
  }
  let score6 = raw;
  if (inputScale === '6') {
    if (raw > 6.0001) return null;
    score6 = raw;
  } else if (inputScale === '10') {
    if (raw > 10.0001) return null;
    score6 = (raw / 10) * 6;
  } else if (inputScale === '20') {
    if (raw > 20.0001) return null;
    score6 = (raw / 20) * 6;
  } else if (inputScale === '100') {
    if (raw > 100.0001) return null;
    score6 = (raw / 100) * 6;
  } else {
    if (raw > 100.0001) return null;
    score6 = raw > 10 ? (raw / 100) * 6 : raw > 6 ? (raw / 10) * 6 : raw;
  }
  score6 = Math.round(Math.max(0, Math.min(6, score6)) * 100) / 100;

  const cutA = Number(cutoffs?.A ?? 5.25);
  const cutB = Number(cutoffs?.B ?? 4.75);
  const cutC = Number(cutoffs?.C ?? 4.5);
  const cutD = Number(cutoffs?.D ?? 4.25);
  const cutE = Number(cutoffs?.E ?? 4.0);
  const cutFX = Number(cutoffs?.FX ?? 3.5);

  if (score6 >= cutA) return { score6, letter: 'A (Excellent)', short: 'A', status: 'passed' };
  if (score6 >= cutB) return { score6, letter: 'B (Very Good)', short: 'B', status: 'passed' };
  if (score6 >= cutC) return { score6, letter: 'C (Good)', short: 'C', status: 'passed' };
  if (score6 >= cutD) return { score6, letter: 'D (Satisfactory)', short: 'D', status: 'passed' };
  if (score6 + 1e-9 >= cutE) return { score6, letter: 'E (Pass)', short: 'E', status: 'passed' };
  const failLabel = score6 >= cutFX ? 'F (Fail - Retake)' : 'F (Fail - Redo)';
  return { score6, letter: failLabel, short: 'F', status: 'failed' };
};

export const ClassGradebookModal: React.FC<ClassGradebookModalProps> = ({
  isOpen,
  onClose,
  initialCampaignId,
  initialProjectId,
  initialProgramName = '',
  initialSubjectKey,
  campaignsList = [],
  projectsList = [],
  onSaved,
  zIndex = 2147483646
}) => {
  const gradingDefaults = useTypedSetting<any>('academic.grading_and_curriculum_defaults', {});
  const quizWeight = Number(gradingDefaults?.quiz_weight ?? 0.5);
  const finalWeight = Number(gradingDefaults?.final_weight ?? 0.5);
  const ectsCutoffs = gradingDefaults?.ects_cutoffs;
  const defaultProgramSetting = String(gradingDefaults?.default_program || 'BBA');

  const [selectedCampaignId, setSelectedCampaignId] = useState<number>(Number(initialCampaignId || 0));
  const [selectedProgram, setSelectedProgram] = useState<string>(() => {
    return matchStandardProgramKey(initialProgramName) || initialProgramName || defaultProgramSetting;
  });
  const [inputScale, setInputScale] = useState<InputScoreScale>('auto');
  const [localCampaigns, setLocalCampaigns] = useState<any[]>(Array.isArray(campaignsList) ? campaignsList : []);
  const initialSubs = useMemo(
    () =>
      resolveCurriculumSubjects(matchStandardProgramKey(initialProgramName) || initialProgramName || defaultProgramSetting).map((s, idx) => ({
        index: idx,
        code: s.code,
        rawName: s.name,
        name: cleanSubjectNameWithoutCode(s.name),
        key: s.code || s.name
      })),
    [initialProgramName, defaultProgramSetting]
  );
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string>(() => {
    if (initialSubjectKey) return initialSubjectKey;
    return initialSubs[0]?.key || 'ALL';
  });
  const [activeMode, setActiveMode] = useState<'grid' | 'import'>('grid');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const overlayZ = Math.min(Number(zIndex || 2147483645), 2147483646);

  const [courseInfo, setCourseInfo] = useState<any>(null);
  const [subjects, setSubjects] = useState<any[]>(initialSubs);
  const [students, setStudents] = useState<any[]>([]);
  // Local editable matrix: { [contactId]: { [subjectKey]: { ... } } }
  const [matrix, setMatrix] = useState<Record<number, Record<string, any>>>({});
  const [dirtyCellKeys, setDirtyCellKeys] = useState<Set<string>>(() => new Set());
  const dirtyCount = dirtyCellKeys.size;

  // Import state
  const [importText, setImportText] = useState<string>('');
  const [importPreviewRows, setImportPreviewRows] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inFlightRef = useRef<boolean>(false);
  const loadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const unregister = pushOverlay(
      'class-gradebook-modal',
      () => {
        onClose();
        return true;
      },
      overlayZ
    );

    return () => {
      document.body.style.overflow = prevOverflow;
      unregister();
      loadAbortRef.current?.abort();
    };
  }, [isOpen, onClose, overlayZ]);

  useEffect(() => {
    const controller = new AbortController();
    if (Array.isArray(campaignsList) && campaignsList.length > 0) {
      setLocalCampaigns(campaignsList);
    } else if (isOpen && localCampaigns.length === 0) {
      api.get('/campaigns', { signal: controller.signal }).then(res => {
        const list = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data?.data?.items) ? res.data.data.items : []);
        if (list.length > 0) {
          setLocalCampaigns(list);
        }
      }).catch(() => {});
    }
    return () => controller.abort();
  }, [isOpen, campaignsList, localCampaigns.length]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedCampaignId(Number(initialCampaignId || 0));
    const resolvedProg = matchStandardProgramKey(initialProgramName) || initialProgramName || defaultProgramSetting;
    setSelectedProgram(resolvedProg);
    if (initialSubjectKey) {
      setSelectedSubjectKey(initialSubjectKey);
    }
  }, [isOpen, initialCampaignId, initialProgramName, initialSubjectKey, defaultProgramSetting]);

  const loadGradebook = async (campId: number, progOverride?: string) => {
    const effectiveProg = progOverride !== undefined ? progOverride : selectedProgram;
    const fallbackSubs = effectiveProg
      ? resolveCurriculumSubjects(effectiveProg).map((s, idx) => ({
          index: idx,
          code: s.code,
          rawName: s.name,
          name: cleanSubjectNameWithoutCode(s.name),
          key: s.code || s.name
        }))
      : [];
    if (fallbackSubs.length > 0) {
      setSubjects(fallbackSubs);
      setSelectedSubjectKey(prev => {
        if (prev === 'ALL') return 'ALL';
        if (fallbackSubs.some(s => s.key === prev)) return prev;
        return fallbackSubs[0]?.key || 'ALL';
      });
    }
    if ((!campId || campId <= 0) && !effectiveProg) return;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoading(true);
    try {
      const res = await api.get(`/academic/class-gradebook/${campId || 0}`, {
        signal: controller.signal,
        params: {
          project_id: initialProjectId || undefined,
          include_project: 1,
          program: effectiveProg || undefined,
          input_scale: inputScale
        }
      });
      const data = res.data?.data;
      if (data) {
        setCourseInfo(data.campaign || null);
        let rawSubs = Array.isArray(data.subjects) && data.subjects.length > 0 ? data.subjects : fallbackSubs;
        const subs = rawSubs.map((s: any, idx: number) => ({
          ...s,
          index: idx,
          rawName: s.rawName || s.name || s.subject_name || '',
          name: cleanSubjectNameWithoutCode(s.name || s.subject_name || ''),
          key: s.key || s.code || s.name
        }));
        const stus = Array.isArray(data.students) ? data.students : [];
        const gMap = data.grades_map || {};
        setSubjects(subs);
        setSelectedSubjectKey(prev => {
          if (prev === 'ALL') return 'ALL';
          if (subs.some((s: any) => s.key === prev)) return prev;
          return subs[0]?.key || 'ALL';
        });
        setStudents(stus);

        const nextMatrix: Record<number, Record<string, any>> = {};
        stus.forEach((st: any) => {
          const cid = Number(st.id);
          nextMatrix[cid] = {};
          const stuGrades = gMap[cid] || {};
          subs.forEach((sub: any) => {
            const existing = stuGrades[sub.code] || stuGrades[sub.rawName] || stuGrades[sub.name] || {};
            const rawFin = existing.final_score ?? '';
            const inferred = rawFin !== '' ? inferEctsGrade6(String(rawFin), inputScale, ectsCutoffs) : null;
            const curStatus = String(existing.status ?? '').toLowerCase();
            const isLockedStatus = curStatus === 'postponed' || curStatus === 'exempt' || (curStatus === 'failed' && inferred?.status === 'passed');
            nextMatrix[cid][sub.key] = {
              subject_code: sub.code,
              subject_name: existing.subject_name || sub.rawName || sub.name,
              attendance_score: existing.attendance_score ?? '',
              assignment_score: existing.assignment_score ?? '',
              final_score: rawFin,
              letter_grade: inferred ? inferred.letter : (existing.letter_grade ?? ''),
              status: isLockedStatus ? curStatus : (inferred ? inferred.status : (existing.status ?? 'studying')),
              note: existing.note ?? ''
            };
          });
        });
        setMatrix(nextMatrix);
        setDirtyCellKeys(new Set());
      }
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      toast.error(err?.response?.data?.message || 'Không thể tải bảng điểm lớp');
    } finally {
      if (loadAbortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen && (selectedCampaignId > 0 || selectedProgram)) {
      loadGradebook(selectedCampaignId, selectedProgram);
    }
    return () => {
      loadAbortRef.current?.abort();
    };
  }, [isOpen, selectedCampaignId, selectedProgram]);

  const inferGradeAndStatus = (scoreStr: string) => {
    return inferEctsGrade6(scoreStr, inputScale, ectsCutoffs);
  };

  const handleCellChange = (contactId: number, subKey: string, field: string, value: string) => {
    setMatrix(prev => {
      const stuRow = { ...(prev[contactId] || {}) };
      const cell = { ...(stuRow[subKey] || {}) };
      cell[field] = value;

      if (field === 'attendance_score' || field === 'assignment_score') {
        const qStr = String(field === 'attendance_score' ? value : (cell.attendance_score ?? '')).trim().replace(',', '.');
        const fStr = String(field === 'assignment_score' ? value : (cell.assignment_score ?? '')).trim().replace(',', '.');
        if (qStr !== '' && fStr !== '' && !isNaN(Number(qStr)) && !isNaN(Number(fStr))) {
          const avg6 = Math.round(((Number(qStr) * quizWeight) + (Number(fStr) * finalWeight)) * 100) / 100;
          cell.final_score = String(avg6);
          const inferred = inferGradeAndStatus(cell.final_score);
          if (inferred) {
            cell.letter_grade = inferred.letter;
            if (cell.status !== 'postponed' && cell.status !== 'exempt') {
              cell.status = inferred.status;
              cell.auto_status = true;
            }
          }
        }
      }

      if (field === 'final_score') {
        const inferred = inferGradeAndStatus(value);
        if (inferred) {
          cell.letter_grade = inferred.letter;
          if (cell.status !== 'postponed' && cell.status !== 'exempt') {
            cell.status = inferred.status;
            cell.auto_status = true;
          }
        }
      }
      if (field === 'status') {
        cell.auto_status = false;
      }
      stuRow[subKey] = cell;
      return { ...prev, [contactId]: stuRow };
    });
    setDirtyCellKeys(prev => {
      const next = new Set(prev);
      next.add(`${contactId}::${subKey}`);
      return next;
    });
  };

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter(st => {
      const name = String(st.full_name || '').toLowerCase();
      const code = String(st.student_id || '').toLowerCase();
      const email = String(st.email || '').toLowerCase();
      const phone = String(st.phone || st.mobile || '').toLowerCase();
      return name.includes(q) || code.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [students, searchQuery]);

  const visibleSubjects = useMemo(() => {
    if (selectedSubjectKey === 'ALL') return subjects;
    return subjects.filter(s => s.key === selectedSubjectKey);
  }, [subjects, selectedSubjectKey]);

  const handleSaveGrid = async () => {
    if (inFlightRef.current || saving) return;
    const dirtyByStudent = new Map<number, Record<string, any>>();
    dirtyCellKeys.forEach(pair => {
      const sepIdx = pair.indexOf('::');
      if (sepIdx <= 0) return;
      const cid = Number(pair.slice(0, sepIdx));
      const subKey = pair.slice(sepIdx + 2);
      const cellVal = matrix[cid]?.[subKey];
      if (!cellVal) return;
      if (!dirtyByStudent.has(cid)) dirtyByStudent.set(cid, {});
      dirtyByStudent.get(cid)![subKey] = {
        ...cellVal,
        input_scale: inputScale,
      };
    });

    if (dirtyByStudent.size === 0) {
      toast('Chưa có ô điểm nào thay đổi để lưu.');
      return;
    }

    inFlightRef.current = true;
    setSaving(true);
    try {
      const rowsPayload = Array.from(dirtyByStudent.entries()).map(([cid, gradesObj]) => {
        const st = students.find(s => Number(s.id) === cid);
        return {
          contact_id: cid,
          student_id: st?.student_id,
          email: st?.email,
          phone: st?.phone,
          grades: gradesObj
        };
      });

      const res = await api.post(`/academic/class-gradebook/${selectedCampaignId}`, {
        input_scale: inputScale,
        rows: rowsPayload
      });
      toast.success(res.data?.message || 'Đã lưu bảng điểm cả lớp thành công.');
      setDirtyCellKeys(new Set());
      onSaved?.();
      await loadGradebook(selectedCampaignId);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Lỗi khi lưu bảng điểm lớp');
    } finally {
      setSaving(false);
      inFlightRef.current = false;
    }
  };

  // Download CSV Template pre-filled with class students & subjects (Excel formula-injection safe via csvSafe)
  const handleDownloadCsvTemplate = () => {
    const isSingleSubject = selectedSubjectKey !== 'ALL' && visibleSubjects.length === 1;
    const targetSub = isSingleSubject ? visibleSubjects[0] : null;
    const cleanTargetSubName = targetSub ? cleanSubjectNameWithoutCode(targetSub.name) : '';

    if (isSingleSubject && targetSub) {
      const headers = [
        'Contact_ID',
        'Ma_Hoc_Vien',
        'Ho_Ten',
        'Email',
        'So_Dien_Thoai',
        'Diem_Quiz_50 (0-6)',
        'Diem_Final_50 (0-6)',
        `${cleanTargetSubName} - Diem_TK (Thang 6)`,
        'Ghi_Chu'
      ];
      const csvRows = [toCsvRow(headers)];
      const demoRow = [
        '0',
        'SV-DEMO',
        'Học viên Mẫu (Ví dụ - Thang điểm 6.0)',
        'demo.student@example.com',
        '0901234567',
        '5.50',
        '5.50',
        '5.50',
        'A (Excellent)'
      ];
      csvRows.push(toCsvRow(demoRow));

      students.forEach(st => {
        const cid = Number(st.id);
        const cell = matrix[cid]?.[targetSub.key] || {};
        csvRows.push(toCsvRow([
          String(cid),
          String(st.student_id || ''),
          String(st.full_name || ''),
          String(st.email || ''),
          String(st.phone || st.mobile || ''),
          String(cell.attendance_score ?? ''),
          String(cell.assignment_score ?? ''),
          String(cell.final_score ?? ''),
          String(cell.note ?? '')
        ]));
      });

      const bom = '\uFEFF';
      const blob = new Blob([bom + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeSub = cleanTargetSubName.replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `Bang_Diem_Mon_${safeSub}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Đã tải file mẫu môn "${cleanTargetSubName}" (Thang điểm 6.0).`);
      return;
    }

    const headers = ['Contact_ID', 'Ma_Hoc_Vien', 'Ho_Ten', 'Email', 'So_Dien_Thoai'];
    subjects.forEach(s => {
      headers.push(cleanSubjectNameWithoutCode(s.name));
    });

    const csvRows = [toCsvRow(headers)];
    const demoRow = ['0', 'SV-DEMO', 'Học viên Mẫu (Ví dụ - Thang 6.0)', 'demo.student@example.com', '0901234567'];
    subjects.forEach((_, sIdx) => {
      const demoScores6 = ['5.50', '5.00', '5.75', '4.75', '4.50', '5.25', '5.50', '6.00', '4.25', '5.00', '5.50'];
      demoRow.push(demoScores6[sIdx % demoScores6.length]);
    });
    csvRows.push(toCsvRow(demoRow));

    students.forEach(st => {
      const cid = Number(st.id);
      const row = [
        String(cid),
        String(st.student_id || ''),
        String(st.full_name || ''),
        String(st.email || ''),
        String(st.phone || st.mobile || '')
      ];
      subjects.forEach(s => {
        const val = matrix[cid]?.[s.key]?.final_score ?? '';
        row.push(String(val));
      });
      csvRows.push(toCsvRow(row));
    });

    const bom = '\uFEFF';
    const blob = new Blob([bom + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeCourse = String(selectedProgram || courseInfo?.name || 'Tat_Ca_Mon').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `Bang_Diem_Tat_Ca_Mon_${safeCourse}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Đã tải xuống file mẫu tất cả môn (Thang điểm 6.0).');
  };

  // Parse RFC-4180 CSV / TSV text (handles BOM & escaped "" quotes)
  const parseCsvToRows2D = (rawText: string): string[][] => {
    const clean = rawText.replace(/^\uFEFF/, '');
    const firstLine = clean.split(/\r?\n/)[0] || '';
    const delim = firstLine.includes('\t')
      ? '\t'
      : firstLine.split(';').length > firstLine.split(',').length
        ? ';'
        : ',';

    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (inQuotes) {
        if (ch === '"') {
          if (clean[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(field.trim());
        field = '';
      } else if (ch === '\r') {
        continue;
      } else if (ch === '\n') {
        row.push(field.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
    row.push(field.trim());
    if (row.some(c => c !== '')) rows.push(row);
    return rows;
  };

  const parseImportMatrix = (rows2D: string[][]) => {
    if (!Array.isArray(rows2D) || rows2D.length < 2) {
      setImportPreviewRows([]);
      return;
    }

    const headers = rows2D[0].map(h => String(h ?? '').replace(/^\uFEFF/, '').trim());
    const isSingleSubjectMode = selectedSubjectKey !== 'ALL' && visibleSubjects.length === 1;
    const activeSingleSubject = isSingleSubjectMode ? visibleSubjects[0] : (subjects[0] || null);

    let idColIdx = -1;
    let codeColIdx = -1;
    let nameColIdx = -1;
    let emailColIdx = -1;
    let phoneColIdx = -1;
    let quizColIdx = -1;
    let finalExamColIdx = -1;
    let noteColIdx = -1;
    const colToSubject: Record<number, any> = {};

    headers.forEach((h, idx) => {
      const hClean = h.toLowerCase().trim();
      if (['contact_id', 'contact id', 'crm_id'].includes(hClean)) {
        idColIdx = idx;
        return;
      }
      if (['ma_hoc_vien', 'mã học viên', 'mã hv', 'id student', 'student_id', 'student_code'].includes(hClean)) {
        codeColIdx = idx;
        return;
      }
      if (['ho_ten', 'họ tên', 'họ và tên', 'full_name', 'tên học viên', 'name'].includes(hClean)) {
        nameColIdx = idx;
        return;
      }
      if (['email', 'e-mail'].includes(hClean)) {
        emailColIdx = idx;
        return;
      }
      if (['so_dien_thoai', 'số điện thoại', 'sđt', 'phone', 'mobile'].includes(hClean)) {
        phoneColIdx = idx;
        return;
      }
      if (hClean.includes('diem_quiz') || hClean.includes('điểm quiz') || hClean.includes('chuyên cần') || hClean.includes('chuyen_can') || hClean === 'quiz') {
        quizColIdx = idx;
        return;
      }
      if (hClean.includes('diem_final') || hClean.includes('điểm final') || hClean.includes('bài tập') || hClean.includes('bai_tap') || hClean === 'final') {
        finalExamColIdx = idx;
        return;
      }
      if (hClean.includes('ghi_chu') || hClean.includes('ghi chú') || hClean === 'note') {
        noteColIdx = idx;
        return;
      }
      const matchedSub = subjects.find(s => {
        const sCode = String(s.code || '').toLowerCase();
        const sName = cleanSubjectNameWithoutCode(s.name).toLowerCase();
        return (sCode && hClean.includes(sCode)) || (sName && hClean.includes(sName));
      });
      if (matchedSub) {
        colToSubject[idx] = matchedSub;
      } else if (activeSingleSubject && (hClean.includes('diem_tk') || hClean.includes('điểm tk') || hClean.includes('tổng kết') || hClean.includes('tong_ket') || hClean.includes('điểm') || hClean.includes('score') || isSingleSubjectMode)) {
        colToSubject[idx] = activeSingleSubject;
      }
    });

    if (idColIdx === -1 && codeColIdx === -1 && nameColIdx === -1 && emailColIdx === -1) {
      idColIdx = 0;
      codeColIdx = 1;
      nameColIdx = 2;
      emailColIdx = 3;
      phoneColIdx = 4;
    }

    const parsedRows: any[] = [];
    for (let r = 1; r < rows2D.length; r++) {
      const cols = rows2D[r];
      if (!cols || cols.length < 2) continue;

      const cIdVal = idColIdx >= 0 ? String(cols[idColIdx] ?? '').trim() : '';
      const cCodeVal = codeColIdx >= 0 ? String(cols[codeColIdx] ?? '').trim() : '';
      const cNameVal = nameColIdx >= 0 ? String(cols[nameColIdx] ?? '').trim() : '';
      const cEmailVal = emailColIdx >= 0 ? String(cols[emailColIdx] ?? '').trim() : '';
      const cPhoneVal = phoneColIdx >= 0 ? String(cols[phoneColIdx] ?? '').trim() : '';

      if (cCodeVal.toUpperCase() === 'SV-DEMO' || cEmailVal.toLowerCase().startsWith('demo.student@')) {
        continue;
      }

      let matchedStudent = cIdVal ? students.find(st => String(st.id) === cIdVal) : undefined;
      if (!matchedStudent && cCodeVal) {
        matchedStudent = students.find(st => String(st.student_id || '').toLowerCase() === cCodeVal.toLowerCase());
      }
      if (!matchedStudent && cEmailVal) {
        matchedStudent = students.find(st => String(st.email || '').toLowerCase() === cEmailVal.toLowerCase());
      }
      if (!matchedStudent && cPhoneVal) {
        const phTail = cPhoneVal.replace(/\D/g, '').slice(-9);
        if (phTail.length >= 9) {
          matchedStudent = students.find(st => String(st.phone || st.mobile || '').replace(/\D/g, '').endsWith(phTail));
        }
      }
      if (!matchedStudent && cIdVal) {
        matchedStudent = students.find(
          st =>
            String(st.student_id || '').toLowerCase() === cIdVal.toLowerCase() ||
            String(st.email || '').toLowerCase() === cIdVal.toLowerCase() ||
            String(st.full_name || '').toLowerCase() === cIdVal.toLowerCase()
        );
      }

      const rowGrades: Record<string, any> = {};
      Object.entries(colToSubject).forEach(([colIdxStr, subObj]) => {
        const rawScoreVal = String(cols[Number(colIdxStr)] ?? '').trim().replace(',', '.');
        const qVal = quizColIdx >= 0 ? String(cols[quizColIdx] ?? '').trim().replace(',', '.') : '';
        const fVal = finalExamColIdx >= 0 ? String(cols[finalExamColIdx] ?? '').trim().replace(',', '.') : '';
        const nVal = noteColIdx >= 0 ? String(cols[noteColIdx] ?? '').trim() : '';

        let effectiveFinal = rawScoreVal;
        if (effectiveFinal === '' && qVal !== '' && fVal !== '' && !isNaN(Number(qVal)) && !isNaN(Number(fVal))) {
          effectiveFinal = String(Math.round(((Number(qVal) * quizWeight) + (Number(fVal) * finalWeight)) * 100) / 100);
        }

        if (effectiveFinal !== '' || qVal !== '' || fVal !== '') {
          const inferred = effectiveFinal !== '' ? inferGradeAndStatus(effectiveFinal) : null;
          rowGrades[subObj.key] = {
            subject_code: subObj.code,
            subject_name: subObj.rawName || cleanSubjectNameWithoutCode(subObj.name),
            attendance_score: qVal || undefined,
            assignment_score: fVal || undefined,
            final_score: effectiveFinal,
            input_scale: inputScale,
            auto_status: true,
            letter_grade: inferred?.letter || '',
            status: inferred?.status || 'studying',
            note: nVal || undefined
          };
        }
      });

      if (Object.keys(rowGrades).length === 0 && activeSingleSubject && (quizColIdx >= 0 || finalExamColIdx >= 0)) {
        const qVal = quizColIdx >= 0 ? String(cols[quizColIdx] ?? '').trim().replace(',', '.') : '';
        const fVal = finalExamColIdx >= 0 ? String(cols[finalExamColIdx] ?? '').trim().replace(',', '.') : '';
        const nVal = noteColIdx >= 0 ? String(cols[noteColIdx] ?? '').trim() : '';
        let effectiveFinal = '';
        if (qVal !== '' && fVal !== '' && !isNaN(Number(qVal)) && !isNaN(Number(fVal))) {
          effectiveFinal = String(Math.round(((Number(qVal) * quizWeight) + (Number(fVal) * finalWeight)) * 100) / 100);
        }
        if (effectiveFinal !== '' || qVal !== '' || fVal !== '') {
          const inferred = effectiveFinal !== '' ? inferGradeAndStatus(effectiveFinal) : null;
          rowGrades[activeSingleSubject.key] = {
            subject_code: activeSingleSubject.code,
            subject_name: activeSingleSubject.rawName || cleanSubjectNameWithoutCode(activeSingleSubject.name),
            attendance_score: qVal || undefined,
            assignment_score: fVal || undefined,
            final_score: effectiveFinal,
            input_scale: inputScale,
            auto_status: true,
            letter_grade: inferred?.letter || '',
            status: inferred?.status || 'studying',
            note: nVal || undefined
          };
        }
      }

      parsedRows.push({
        contact_id: matchedStudent?.id || (Number(cIdVal) > 0 ? Number(cIdVal) : 0),
        student_id: matchedStudent?.student_id || cCodeVal || cIdVal,
        full_name: matchedStudent?.full_name || cNameVal || cCodeVal,
        email: matchedStudent?.email || cEmailVal,
        phone: matchedStudent?.phone || cPhoneVal,
        matched: !!matchedStudent,
        grades: rowGrades
      });
    }

    setImportPreviewRows(parsedRows);
  };

  const parseImportContent = (rawText: string) => {
    setImportText(rawText);
    parseImportMatrix(parseCsvToRows2D(rawText));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const buf = new Uint8Array(ev.target?.result as ArrayBuffer);
          const wb = XLSX.read(buf, { type: 'array' });
          const firstSheetName = wb.SheetNames[0];
          const sheet = wb.Sheets[firstSheetName];
          const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as string[][];
          setImportText(aoa.map(row => row.join('\t')).join('\n'));
          parseImportMatrix(aoa);
          toast.success(`Đã đọc file Excel "${file.name}" (${aoa.length} dòng).`);
        } catch (err: any) {
          toast.error('Không thể đọc file Excel. Vui lòng kiểm tra định dạng .xlsx / .csv.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = ev => {
        const content = String(ev.target?.result || '');
        parseImportContent(content);
        toast.success(`Đã đọc file "${file.name}" thành công.`);
      };
      reader.readAsText(file, 'UTF-8');
    }
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (inFlightRef.current || importPreviewRows.length === 0 || saving) return;
    inFlightRef.current = true;
    setSaving(true);
    try {
      const res = await api.post(`/academic/class-gradebook/${selectedCampaignId}`, {
        input_scale: inputScale,
        rows: importPreviewRows
      });
      toast.success(res.data?.message || 'Đã import điểm cả lớp thành công.');
      setActiveMode('grid');
      setImportPreviewRows([]);
      setImportText('');
      onSaved?.();
      await loadGradebook(selectedCampaignId);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Lỗi khi import điểm');
    } finally {
      setSaving(false);
      inFlightRef.current = false;
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: overlayZ,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '1220px',
          maxHeight: '90vh',
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 24px 48px rgba(15, 23, 42, 0.22)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(189, 29, 45, 0.1)',
                color: '#BD1D2D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Award size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
                Bảng Điểm Lớp & Cập Nhật Hàng Loạt
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                Nhập điểm trực tiếp theo chương trình học hoặc tải file Excel / CSV lên hệ thống
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Segmented Mode Switcher */}
            <div
              style={{
                display: 'inline-flex',
                padding: '3px',
                borderRadius: '10px',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                gap: '2px'
              }}
            >
              <button
                type="button"
                onClick={() => setActiveMode('grid')}
                style={{
                  height: '32px',
                  padding: '0 14px',
                  borderRadius: '7px',
                  border: 'none',
                  background: activeMode === 'grid' ? '#ffffff' : 'transparent',
                  color: activeMode === 'grid' ? '#BD1D2D' : '#64748b',
                  fontWeight: activeMode === 'grid' ? 700 : 600,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  boxShadow: activeMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Users size={14} />
                <span>Danh sách học viên ({students.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('import')}
                style={{
                  height: '32px',
                  padding: '0 14px',
                  borderRadius: '7px',
                  border: 'none',
                  background: activeMode === 'import' ? '#ffffff' : 'transparent',
                  color: activeMode === 'import' ? '#BD1D2D' : '#64748b',
                  fontWeight: activeMode === 'import' ? 700 : 600,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  boxShadow: activeMode === 'import' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FileSpreadsheet size={14} />
                <span>Nhập từ Excel / CSV</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div
          style={{
            padding: '12px 22px',
            borderBottom: '1px solid #e2e8f0',
            background: '#ffffff',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(160px, 1fr)) auto',
            alignItems: 'end',
            gap: '10px'
          }}
        >
          {/* Standard Program Curriculum Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.03em' }}>
              Chương trình đào tạo
            </label>
            <select
              value={selectedProgram}
              onChange={e => {
                const nextProg = e.target.value;
                setSelectedProgram(nextProg);
                if (nextProg) {
                  const instantSubs = resolveCurriculumSubjects(nextProg).map((s, idx) => ({
                    index: idx,
                    code: s.code,
                    name: cleanSubjectNameWithoutCode(s.name),
                    key: s.code || s.name
                  }));
                  if (instantSubs.length > 0) {
                    setSubjects(instantSubs);
                    setSelectedSubjectKey(instantSubs[0].key);
                  } else {
                    setSelectedSubjectKey('ALL');
                  }
                } else {
                  setSelectedSubjectKey('ALL');
                }
              }}
              style={{
                width: '100%',
                height: '36px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: '#0f172a',
                background: '#ffffff'
              }}
            >
              <option value="">Tất cả chương trình</option>
              {STANDARD_PROGRAM_NAMES.map((progKey, idx) => (
                <option key={progKey} value={progKey}>
                  {idx + 1}/ {progKey} ({(STANDARD_PROGRAM_CURRICULUMS[progKey] || []).length} môn)
                </option>
              ))}
            </select>
          </div>

          {/* Course Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.03em' }}>
              Khóa học / Lớp học
            </label>
            <select
              value={selectedCampaignId}
              onChange={e => setSelectedCampaignId(Number(e.target.value))}
              style={{
                width: '100%',
                height: '36px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#0f172a',
                background: '#ffffff'
              }}
            >
              <option value={0}>Tất cả lớp thuộc chương trình</option>
              {courseInfo && courseInfo.id > 0 && !localCampaigns.some(c => Number(c.id) === Number(courseInfo.id)) && (
                <option value={Number(courseInfo.id)}>{courseInfo.name}</option>
              )}
              {Array.isArray(localCampaigns) &&
                localCampaigns.map(c => (
                  <option key={c.id} value={Number(c.id)}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Subject Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.03em' }}>
              Môn học hiển thị
            </label>
            <select
              value={selectedSubjectKey}
              onChange={e => setSelectedSubjectKey(e.target.value)}
              style={{
                width: '100%',
                height: '36px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#0f172a',
                background: '#ffffff'
              }}
            >
              <option value="ALL">Tất cả môn học ({subjects.length} môn)</option>
              {subjects.map((s, idx) => (
                <option key={s.key} value={s.key}>
                  {idx + 1}. {cleanSubjectNameWithoutCode(s.name)}
                </option>
              ))}
            </select>
          </div>

          {/* Search Student */}
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.03em' }}>
              Tìm học viên
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Tên, Mã HV, Email, SĐT..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    height: '36px',
                    padding: '0 10px 0 30px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem'
                  }}
                />
              </div>
              <select
                value={inputScale}
                onChange={e => setInputScale(e.target.value as InputScoreScale)}
                title="Hệ điểm nhập liệu đầu vào (tự quy đổi sang thang 6.0 ECTS)"
                style={{
                  height: '36px',
                  padding: '0 8px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#334155',
                  background: '#ffffff'
                }}
              >
                <option value="auto">Hệ Auto</option>
                <option value="6">Hệ 6.0</option>
                <option value="10">Hệ 10</option>
                <option value="100">Hệ 100</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleDownloadCsvTemplate}
              title={
                selectedSubjectKey !== 'ALL' && visibleSubjects[0]
                  ? `Tải file mẫu Excel/CSV của môn: ${cleanSubjectNameWithoutCode(visibleSubjects[0].name)}`
                  : 'Tải file mẫu Excel/CSV của toàn bộ các môn trong chương trình'
              }
              style={{
                height: '36px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontWeight: 600,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Download size={14} style={{ color: '#BD1D2D' }} />
              <span>
                {selectedSubjectKey !== 'ALL' && visibleSubjects.length === 1
                  ? 'Tải mẫu môn này (.CSV)'
                  : 'Tải mẫu tất cả môn'}
              </span>
            </button>

            {activeMode === 'grid' && (
              <button
                type="button"
                onClick={handleSaveGrid}
                disabled={saving || loading || students.length === 0}
                style={{
                  height: '36px',
                  padding: '0 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#BD1D2D',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                <span>Lưu điểm cả lớp {dirtyCount > 0 ? `(${dirtyCount} thay đổi)` : ''}</span>
              </button>
            )}
          </div>
        </div>

        {/* 6.0 ECTS Grading Scale Reference Bar */}
        <div
          style={{
            padding: '6px 22px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '6px',
            fontSize: '0.7rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              Thang điểm 6.0 (ECTS):
            </span>
            <span style={{ padding: '1px 6px', borderRadius: '4px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#0f172a', fontWeight: 700 }}>
              A: 5.25–6.0 (Excellent)
            </span>
            <span style={{ padding: '1px 6px', borderRadius: '4px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#334155', fontWeight: 700 }}>
              B: 4.75–5.24 (Very Good)
            </span>
            <span style={{ padding: '1px 6px', borderRadius: '4px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
              C: 4.50–4.74 (Good)
            </span>
            <span style={{ padding: '1px 6px', borderRadius: '4px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
              D: 4.25–4.49 (Satisfactory)
            </span>
            <span style={{ padding: '1px 6px', borderRadius: '4px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700 }}>
              E: 4.00–4.24 (Pass)
            </span>
            <span style={{ padding: '1px 6px', borderRadius: '4px', background: '#fef2f2', border: '1px solid #fecaca', color: '#BD1D2D', fontWeight: 700 }}>
              F: &lt; 4.00 (3.50–3.99: Retake • &lt; 3.50: Redo)
            </span>
          </div>
          {selectedSubjectKey !== 'ALL' && visibleSubjects[0] && (
            <div style={{ fontWeight: 700, color: '#BD1D2D', whiteSpace: 'nowrap' }}>
              Môn: {cleanSubjectNameWithoutCode(visibleSubjects[0].name)}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
              <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 10px', color: '#BD1D2D' }} />
              <div style={{ fontWeight: 600 }}>Đang tải danh sách học viên & bảng điểm...</div>
            </div>
          ) : activeMode === 'grid' ? (
            students.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                <Users size={36} style={{ color: '#94a3b8', margin: '0 auto 8px' }} />
                <div style={{ fontWeight: 700, color: '#334155' }}>Chưa có học viên nào trong khóa học này</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                  Vui lòng chọn khóa học khác hoặc gán học viên vào khóa học.
                </div>
              </div>
            ) : subjects.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                <BookOpen size={36} style={{ color: '#94a3b8', margin: '0 auto 8px' }} />
                <div style={{ fontWeight: 700, color: '#334155' }}>Khóa học này chưa cấu hình danh sách môn học</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '10px 10px', textAlign: 'left', color: '#475569', fontWeight: 800, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2, minWidth: '185px' }}>
                        Học viên ({filteredStudents.length})
                      </th>
                      <th style={{ padding: '10px 8px', textAlign: 'left', color: '#475569', fontWeight: 800, minWidth: '115px' }}>
                        Mã Học viên
                      </th>
                      {selectedSubjectKey !== 'ALL' && visibleSubjects.length === 1 ? (
                        <>
                          <th style={{ padding: '10px 6px', textAlign: 'center', color: '#0f172a', fontWeight: 800, width: '112px' }}>
                            Điểm Quiz (50%)
                          </th>
                          <th style={{ padding: '10px 6px', textAlign: 'center', color: '#0f172a', fontWeight: 800, width: '112px' }}>
                            Điểm Final (50%)
                          </th>
                          <th style={{ padding: '10px 6px', textAlign: 'center', color: '#BD1D2D', fontWeight: 800, width: '124px' }}>
                            Điểm TK (Thang 6) *
                          </th>
                          <th style={{ padding: '10px 6px', textAlign: 'center', color: '#0f172a', fontWeight: 800, width: '125px' }}>
                            Điểm chữ (ECTS)
                          </th>
                          <th style={{ padding: '10px 6px', textAlign: 'center', color: '#0f172a', fontWeight: 800, width: '128px' }}>
                            Trạng thái môn
                          </th>
                          <th style={{ padding: '10px 8px', textAlign: 'left', color: '#0f172a', fontWeight: 800, minWidth: '130px' }}>
                            Ghi chú / Nhận xét
                          </th>
                        </>
                      ) : (
                        visibleSubjects.map(sub => (
                          <th
                            key={sub.key}
                            style={{
                              padding: '12px 10px',
                              textAlign: 'center',
                              color: '#0f172a',
                              fontWeight: 800,
                              minWidth: '140px',
                              borderLeft: '1px solid #e2e8f0'
                            }}
                          >
                            <div style={{ fontSize: '0.76rem', color: '#0f172a', fontWeight: 800, lineHeight: 1.3, textTransform: 'uppercase' }}>
                              {cleanSubjectNameWithoutCode(sub.name)}
                            </div>
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((st, rIdx) => {
                      const cid = Number(st.id);
                      const stuRow = matrix[cid] || {};
                      return (
                        <tr
                          key={cid}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: rIdx % 2 === 0 ? '#ffffff' : '#fcfcfd'
                          }}
                        >
                          <td
                            style={{
                              padding: '8px 12px',
                              position: 'sticky',
                              left: 0,
                              background: rIdx % 2 === 0 ? '#ffffff' : '#fcfcfd',
                              zIndex: 1,
                              borderRight: '1px solid #f1f5f9'
                            }}
                          >
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{st.full_name}</div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{st.email || st.phone || '—'}</div>
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: '#334155', fontSize: '0.76rem' }}>
                            {st.student_id || '—'}
                          </td>

                          {selectedSubjectKey !== 'ALL' && visibleSubjects.length === 1 ? (
                            (() => {
                              const sub = visibleSubjects[0];
                              const cell = stuRow[sub.key] || {};
                              return (
                                <>
                                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                    <input
                                      type="text"
                                      placeholder="0.0 - 6.0"
                                      value={cell.attendance_score ?? ''}
                                      onChange={e => handleCellChange(cid, sub.key, 'attendance_score', e.target.value)}
                                      style={{ width: '85px', height: '30px', textAlign: 'center', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                    <input
                                      type="text"
                                      placeholder="0.0 - 6.0"
                                      value={cell.assignment_score ?? ''}
                                      onChange={e => handleCellChange(cid, sub.key, 'assignment_score', e.target.value)}
                                      style={{ width: '85px', height: '30px', textAlign: 'center', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                    <input
                                      type="text"
                                      placeholder="0.0 - 6.0"
                                      value={cell.final_score ?? ''}
                                      onChange={e => handleCellChange(cid, sub.key, 'final_score', e.target.value)}
                                      style={{
                                        width: '95px',
                                        height: '30px',
                                        textAlign: 'center',
                                        borderRadius: '6px',
                                        border: '1.5px solid #BD1D2D',
                                        fontWeight: 800,
                                        color: '#0f172a',
                                        fontSize: '0.82rem',
                                        background: '#fff1f2'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                    <input
                                      type="text"
                                      placeholder="A / B / C / D / E / F"
                                      value={cell.letter_grade ?? ''}
                                      onChange={e => handleCellChange(cid, sub.key, 'letter_grade', e.target.value)}
                                      style={{ width: '130px', height: '30px', textAlign: 'center', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem', fontWeight: 700, color: cell.status === 'passed' ? '#15803d' : cell.status === 'failed' ? '#dc2626' : '#0f172a' }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                    <select
                                      value={cell.status || 'studying'}
                                      onChange={e => handleCellChange(cid, sub.key, 'status', e.target.value)}
                                      style={{
                                        height: '30px',
                                        borderRadius: '6px',
                                        border: '1px solid #cbd5e1',
                                        fontSize: '0.76rem',
                                        fontWeight: 700,
                                        padding: '0 6px',
                                        color: cell.status === 'passed' ? '#16a34a' : cell.status === 'failed' ? '#dc2626' : '#334155'
                                      }}
                                    >
                                      <option value="studying">Đang học</option>
                                      <option value="passed">Đạt (Pass)</option>
                                      <option value="failed">Học lại (Fail)</option>
                                      <option value="postponed">Bảo lưu môn</option>
                                      <option value="exempt">Miễn giảm</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <input
                                      type="text"
                                      placeholder="Ghi chú..."
                                      value={cell.note ?? ''}
                                      onChange={e => handleCellChange(cid, sub.key, 'note', e.target.value)}
                                      style={{ width: '100%', height: '30px', padding: '0 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                                    />
                                  </td>
                                </>
                              );
                            })()
                          ) : (
                            visibleSubjects.map(sub => {
                              const cell = stuRow[sub.key] || {};
                              const isPassed = cell.status === 'passed';
                              return (
                                <td
                                  key={sub.key}
                                  style={{
                                    padding: '6px 8px',
                                    textAlign: 'center',
                                    borderLeft: '1px solid #f1f5f9'
                                  }}
                                >
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                    <input
                                      type="text"
                                      placeholder="Điểm..."
                                      value={cell.final_score ?? ''}
                                      onChange={e => handleCellChange(cid, sub.key, 'final_score', e.target.value)}
                                      style={{
                                        width: '86px',
                                        height: '28px',
                                        textAlign: 'center',
                                        borderRadius: '6px',
                                        border: cell.final_score ? (isPassed ? '1.5px solid #0f172a' : '1.5px solid #BD1D2D') : '1px solid #cbd5e1',
                                        background: cell.final_score ? (isPassed ? '#f8fafc' : '#fef2f2') : '#ffffff',
                                        fontWeight: 700,
                                        fontSize: '0.8rem',
                                        color: '#0f172a'
                                      }}
                                    />
                                    {cell.letter_grade && (
                                      <span style={{ fontSize: '0.66rem', fontWeight: 700, color: isPassed ? '#0f172a' : '#BD1D2D' }}>
                                        {cell.letter_grade}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              );
                            })
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            /* IMPORT EXCEL / CSV MODE */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  border: '2px dashed #cbd5e1',
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '16px'
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a', marginBottom: '4px' }}>
                    Bước 1: Chọn file CSV / Excel điểm theo môn (Thang điểm 6.0) hoặc Dán trực tiếp từ Excel
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    {selectedSubjectKey !== 'ALL' && visibleSubjects[0] ? (
                      <>
                        Đang nhập điểm cho môn: <strong style={{ color: '#BD1D2D' }}>{cleanSubjectNameWithoutCode(visibleSubjects[0].name)}</strong> • Hệ thống tự động quy đổi Điểm chữ (A, B, C, D, E, F) theo thang điểm 6.0 chuẩn ECTS.
                      </>
                    ) : (
                      <>
                        Hệ thống tự động nhận diện Học viên theo <strong>Mã Học viên (ID Student)</strong>, <strong>Email</strong>, <strong>Số điện thoại</strong> và quy đổi Điểm chữ theo thang điểm 6.0.
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: '9px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#BD1D2D',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Upload size={15} />
                    <span>Chọn file điểm (.XLSX / .CSV)</span>
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Hoặc Copy-Paste bảng điểm trực tiếp từ Excel vào ô dưới đây:
                </label>
                <textarea
                  rows={5}
                  placeholder={
                    selectedSubjectKey !== 'ALL' && visibleSubjects[0]
                      ? `Contact_ID\tMa_Hoc_Vien\tHo_Ten\tEmail\tDiem_Quiz_50 (0-6)\tDiem_Final_50 (0-6)\t${cleanSubjectNameWithoutCode(visibleSubjects[0].name)} - Diem_TK (Thang 6)\n1025200\tBBA-25-000337EN\tBÙI THỊ THUẬN\tbui.thuan@gmail.com\t5.50\t5.50\t5.50`
                      : 'Contact_ID\tMa_Hoc_Vien\tHo_Ten\tEmail\tIntroduction to Management\tIntroduction to Finance\n1025200\tBBA-25-000337EN\tBÙI THỊ THUẬN\tbui.thuan@gmail.com\t5.50\t5.00'
                  }
                  value={importText}
                  onChange={e => parseImportContent(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.78rem',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              {importPreviewRows.length > 0 && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <div
                    style={{
                      padding: '10px 14px',
                      background: '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0f172a' }}>
                      Xem trước dữ liệu sẽ cập nhật ({importPreviewRows.length} học viên)
                    </span>
                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      disabled={saving}
                      style={{
                        padding: '7px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#16a34a',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      <span>Xác nhận Up điểm cho {importPreviewRows.length} học viên</span>
                    </button>
                  </div>
                  <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>Trạng thái khớp</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>Mã HV</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>Họ tên</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>Điểm các môn đọc được</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreviewRows.map((r, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px' }}>
                              {r.matched ? (
                                <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Đã khớp hồ sơ</span>
                              ) : (
                                <span style={{ color: '#d97706', fontWeight: 700 }}>Tìm theo Mã/Email</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.student_id || '—'}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 700 }}>{r.full_name || '—'}</td>
                            <td style={{ padding: '8px 10px' }}>
                              {Object.values(r.grades || {}).map((g: any, gIdx: number) => (
                                <span
                                  key={gIdx}
                                  style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: '#f1f5f9',
                                    marginRight: '6px',
                                    fontWeight: 600
                                  }}
                                >
                                  {(g.subject_name || g.name || g.subject_code).replace(/^(\d+[\.\-_/:\s]+|[A-Z]{1,6}[-_]?[A-Z0-9]{1,6}[-_:]*\s*)/i, '').trim()}: <strong style={{ color: '#BD1D2D' }}>{g.final_score}</strong>
                                </span>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

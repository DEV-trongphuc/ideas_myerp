import React, { useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { Calendar, RefreshCw, Link2, Clock } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useUIStore } from '../store/uiStore';
import { ensureArray } from '../utils/safeArray';
import { getLocalDateStr } from '../utils/dateUtils';

interface ProjectGanttTabProps {
  projectId: number;
}

interface Task {
  id: number;
  subject: string;
  start_date: string | null;
  due_date: string | null;
  status: 'planned' | 'in_progress' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  progress: number;
  user_id: number | null;
  user_name?: string;
  predecessor_id?: number | null;
  lag_days?: number;
}

const parseSafeGanttDate = (raw?: string | null): Date | null => {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const d = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      match[4] ? Number(match[4]) : 0,
      match[5] ? Number(match[5]) : 0,
      match[6] ? Number(match[6]) : 0
    );
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const formatDateTimeLocalApi = (d: Date): string => {
  const ymd = getLocalDateStr(d);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${ymd} ${hh}:${mm}:${ss}`;
};

export const ProjectGanttTab: React.FC<ProjectGanttTabProps> = ({ projectId }) => {
  const { t } = useLanguage();
  const addToast = useUIStore((s) => s.addToast);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [predecessorId, setPredecessorId] = useState<string>('');
  const [lagDays, setLagDays] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'days' | 'weeks'>('days');
  const saveInFlightRef = useRef(false);

  // Tải danh sách công việc kèm phụ thuộc trong 1 request duy nhất (zero N+1)
  const loadTasks = async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/projects/${projectId}/tasks?include_dependencies=1`, { signal });
      if (signal?.aborted) return;
      const rawData = res.data?.data ?? res.data;
      const list = ensureArray(Array.isArray(rawData) ? rawData : rawData?.items);
      setTasks(
        list.map((task: any) => {
          const deps = ensureArray(task.dependencies);
          return {
            ...task,
            subject: task.subject || task.title || `#${task.id}`,
            predecessor_id: task.predecessor_id ?? deps[0]?.predecessor_id ?? null,
            lag_days: task.lag_days ?? deps[0]?.lag_days ?? 0,
          };
        })
      );
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') {
        return;
      }
      setError(t('Không thể tải danh sách công việc'));
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    loadTasks(controller.signal);
    return () => controller.abort();
  }, [projectId]);

  // Cập nhật ngày bắt đầu/kết thúc của task
  const handleUpdateDates = async (taskId: number, newStart: string, newDue: string) => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    try {
      await api.put(`/activities/${taskId}`, {
        start_date: newStart,
        due_date: newDue,
        cascade_dependencies: true,
      });
      await loadTasks();
      addToast(t('Đã cập nhật thời gian công việc'), 'success');
    } catch (e: any) {
      addToast(e?.response?.data?.message || t('Lỗi khi cập nhật ngày'), 'error');
    } finally {
      saveInFlightRef.current = false;
    }
  };

  // Thiết lập mối quan hệ phụ thuộc
  const handleSaveDependency = async () => {
    if (!selectedTaskId || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    try {
      const payload = predecessorId
        ? { predecessors: [{ predecessor_id: Number(predecessorId), dependency_type: 'FS', lag_days: Math.max(0, Number(lagDays) || 0) }] }
        : { predecessors: [] };

      await api.post(`/activities/${selectedTaskId}/dependencies`, payload);
      addToast(t('Cập nhật mối quan hệ phụ thuộc thành công!'), 'success');
      setSelectedTaskId(null);
      setPredecessorId('');
      setLagDays(0);
      await loadTasks();
    } catch (e: any) {
      addToast(e?.response?.data?.message || t('Lỗi khi thiết lập phụ thuộc'), 'error');
    } finally {
      saveInFlightRef.current = false;
    }
  };

  // Tính toán thời gian bắt đầu và kết thúc chung của dự án để vẽ timeline (Safari-safe)
  const getTimelineRange = () => {
    const timestamps = tasks
      .flatMap((t) => [parseSafeGanttDate(t.start_date), parseSafeGanttDate(t.due_date)])
      .filter((d): d is Date => d !== null)
      .map((d) => d.getTime());

    if (timestamps.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const nextMonth = new Date(today);
      nextMonth.setMonth(today.getMonth() + 1);
      return { start: today, end: nextMonth };
    }

    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const start = new Date(minTime - 3 * 86400 * 1000);
    const end = new Date(maxTime + 7 * 86400 * 1000);
    return { start, end };
  };

  const { start: timelineStart, end: timelineEnd } = getTimelineRange();
  const totalSpanMs = Math.max(86400 * 1000, timelineEnd.getTime() - timelineStart.getTime());

  // Helper render thanh Bar của Task theo chuẩn Chương V (Brand Red & Slate)
  const renderTaskBar = (task: Task) => {
    const startObj = parseSafeGanttDate(task.start_date);
    const dueObj = parseSafeGanttDate(task.due_date);
    if (!startObj || !dueObj) return null;

    const taskStart = startObj.getTime();
    const taskDue = Math.max(taskStart + 3600 * 1000, dueObj.getTime());

    const leftPercent = Math.max(0, Math.min(96, ((taskStart - timelineStart.getTime()) / totalSpanMs) * 100));
    const widthPercent = Math.max(4, Math.min(100 - leftPercent, ((taskDue - taskStart) / totalSpanMs) * 100));

    const priorityColors: Record<string, string> = {
      urgent: 'linear-gradient(135deg, #BD1D2D, #991B1B)',
      high: 'linear-gradient(135deg, #C6333D, #BD1D2D)',
      medium: 'linear-gradient(135deg, #334155, #1E293B)',
      low: 'linear-gradient(135deg, #94A3B8, #64748B)',
    };
    const barBg = task.status === 'done'
      ? 'linear-gradient(135deg, #0F172A, #334155)'
      : (priorityColors[task.priority] || priorityColors.medium);

    return (
      <div style={{ position: 'relative', width: '100%', height: '44px', display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            position: 'absolute',
            left: `${leftPercent}%`,
            width: `${widthPercent}%`,
            minWidth: '24px',
            height: '24px',
            background: barBg,
            borderRadius: '6px',
            boxShadow: '0 2px 6px rgba(15, 23, 42, 0.14)',
            cursor: 'pointer',
            transition: 'all 0.22s cubic-bezier(0.25, 0.1, 0.25, 1)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
          }}
          onClick={() => {
            setSelectedTaskId(task.id);
            setPredecessorId(task.predecessor_id ? String(task.predecessor_id) : '');
            setLagDays(task.lag_days || 0);
          }}
          title={`${task.subject} (${task.progress || 0}%)`}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, Number(task.progress) || 0))}%`,
              height: '100%',
              background: 'rgba(255, 255, 255, 0.24)',
              transition: 'width 0.35s ease',
            }}
          />
        </div>
      </div>
    );
  };

  // Helper dịch chuyển ngày theo Local Timezone (không dùng toISOString UTC)
  const shiftTaskDays = (task: Task, days: number) => {
    const startObj = parseSafeGanttDate(task.start_date);
    const dueObj = parseSafeGanttDate(task.due_date);
    if (!startObj || !dueObj) {
      addToast(t('Công việc cần có ngày bắt đầu và hạn chót để dịch chuyển'), 'error');
      return;
    }
    const nextStart = new Date(startObj.getTime() + days * 86400 * 1000);
    const nextDue = new Date(dueObj.getTime() + days * 86400 * 1000);
    handleUpdateDates(task.id, formatDateTimeLocalApi(nextStart), formatDateTimeLocalApi(nextDue));
  };

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: '16px',
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
    }}>
      {/* Header Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'rgba(189, 29, 45, 0.08)',
            color: '#BD1D2D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Calendar size={16} />
          </div>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('Sơ đồ tiến độ Gantt & Ràng buộc công việc')}
          </h4>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{
            display: 'inline-flex',
            padding: '3px',
            borderRadius: '10px',
            background: '#F1F5F9',
            border: '1px solid #E2E8F0',
            gap: '2px',
          }}>
            <button
              type="button"
              onClick={() => setViewMode('days')}
              style={{
                height: '30px',
                padding: '0 12px',
                borderRadius: '7px',
                border: 'none',
                background: viewMode === 'days' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'days' ? '#BD1D2D' : '#64748B',
                fontWeight: viewMode === 'days' ? 700 : 600,
                fontSize: '0.75rem',
                cursor: 'pointer',
                boxShadow: viewMode === 'days' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {t('Theo Ngày')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('weeks')}
              style={{
                height: '30px',
                padding: '0 12px',
                borderRadius: '7px',
                border: 'none',
                background: viewMode === 'weeks' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'weeks' ? '#BD1D2D' : '#64748B',
                fontWeight: viewMode === 'weeks' ? 700 : 600,
                fontSize: '0.75rem',
                cursor: 'pointer',
                boxShadow: viewMode === 'weeks' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {t('Theo Tuần')}
            </button>
          </div>

          <button
            type="button"
            onClick={() => loadTasks()}
            style={{
              height: '36px',
              padding: '0 12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={13} className={loading ? 'spin-anim' : ''} />
            {t('Tải lại')}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '1rem 0' }}>
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="animate-pulse" style={{ height: '42px', borderRadius: '10px', background: '#F1F5F9' }} />
          ))}
        </div>
      ) : error ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#BD1D2D', fontSize: '0.85rem' }}>{error}</div>
      ) : tasks.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
          {t('Dự án này chưa có công việc (tasks) nào để vẽ sơ đồ.')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Main Gantt Grid Container */}
          <div style={{
            overflowX: 'auto',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            background: '#FFFFFF',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <th style={{ padding: '12px', width: '280px', textAlign: 'left', fontSize: '0.73rem', fontWeight: 700, color: '#64748B', borderRight: '1px solid #E2E8F0', letterSpacing: '0.04em' }}>
                    {t('TÊN CÔNG VIỆC')}
                  </th>
                  <th style={{ padding: '12px', width: '165px', textAlign: 'left', fontSize: '0.73rem', fontWeight: 700, color: '#64748B', borderRight: '1px solid #E2E8F0', letterSpacing: '0.04em' }}>
                    {t('THỜI GIAN')}
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '0.73rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>
                    {t('SƠ ĐỒ TIẾN ĐỘ')} ({viewMode === 'weeks' ? t('Theo tuần') : t('Theo ngày')})
                  </th>
                </tr>
              </thead>

              <tbody>
                {tasks.map((task) => {
                  const isSelected = selectedTaskId === task.id;
                  const sDate = parseSafeGanttDate(task.start_date);
                  const dDate = parseSafeGanttDate(task.due_date);
                  const stepDays = viewMode === 'weeks' ? 7 : 1;
                  return (
                    <tr
                      key={task.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        background: isSelected ? 'rgba(189, 29, 45, 0.04)' : '#FFFFFF',
                        transition: 'background 0.2s ease',
                      }}
                    >
                      <td style={{
                        padding: '10px 12px',
                        borderRight: '1px solid #F1F5F9',
                        verticalAlign: 'middle',
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#0F172A' }}>
                            {task.subject}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', color: '#64748B' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 7px',
                              borderRadius: '6px',
                              background: task.status === 'done' ? '#F1F5F9' : 'rgba(189, 29, 45, 0.08)',
                              color: task.status === 'done' ? '#0F172A' : '#BD1D2D',
                              fontWeight: 700,
                            }}>
                              {task.status === 'done' ? t('Hoàn thành') : t('Chưa xong')}
                            </span>
                            {task.predecessor_id && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#334155', fontWeight: 600 }}>
                                <Link2 size={10} />
                                #{task.predecessor_id}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td style={{
                        padding: '10px 12px',
                        borderRight: '1px solid #F1F5F9',
                        fontSize: '0.75rem',
                        color: '#0F172A',
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => shiftTaskDays(task, -stepDays)}
                              style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0', background: '#FFFFFF', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700, color: '#334155' }}
                              title={t('Lùi lịch trình')}
                            >
                              -{stepDays}d
                            </button>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums' }}>
                              {sDate ? sDate.toLocaleDateString('vi-VN') : 'N/A'}
                            </span>
                            <button
                              type="button"
                              onClick={() => shiftTaskDays(task, stepDays)}
                              style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0', background: '#FFFFFF', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700, color: '#334155' }}
                              title={t('Tịnh tiến lịch trình')}
                            >
                              +{stepDays}d
                            </button>
                          </div>
                          <span style={{ color: '#64748B', fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' }}>
                            đến {dDate ? dDate.toLocaleDateString('vi-VN') : 'N/A'}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '0 12px', position: 'relative', overflow: 'hidden' }}>
                        {renderTaskBar(task)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Ràng buộc Tiến độ (Dependency Configuration Panel) */}
          {selectedTaskId && (
            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h5 style={{ margin: 0, fontSize: '0.825rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Link2 size={14} style={{ color: '#BD1D2D' }} />
                  {t('Cấu hình Ràng buộc Phụ thuộc của Công việc')}
                </h5>
                <button
                  type="button"
                  onClick={() => setSelectedTaskId(null)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  {t('Hủy')}
                </button>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '200px' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                    {t('Công việc tiền nhiệm (Predecessor)')}
                  </label>
                  <select
                    value={predecessorId}
                    onChange={(e) => setPredecessorId(e.target.value)}
                    style={{
                      padding: '8px',
                      fontSize: '0.78rem',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      background: '#FFFFFF',
                      color: '#0F172A',
                    }}
                  >
                    <option value="">{t('-- Không có --')}</option>
                    {tasks
                      .filter((tItem) => tItem.id !== selectedTaskId)
                      .map((tItem) => (
                        <option key={tItem.id} value={tItem.id}>{tItem.subject}</option>
                      ))}
                  </select>
                </div>

                {predecessorId && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '130px' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                      {t('Lag Days (Ngày chờ)')}
                    </label>
                    <input
                      type="number"
                      value={lagDays}
                      onChange={(e) => setLagDays(Math.max(0, Number(e.target.value) || 0))}
                      style={{
                        padding: '8px',
                        fontSize: '0.78rem',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#0F172A',
                      }}
                      min={0}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSaveDependency}
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: 'none',
                    background: '#BD1D2D',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    height: '36px',
                  }}
                >
                  {t('Lưu Ràng Buộc')}
                </button>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={12} style={{ color: '#BD1D2D' }} />
                <span>{t('Ghi chú: Khi công việc tiền nhiệm thay đổi ngày hoàn thành, công việc này và toàn bộ các công việc phụ thuộc phía sau sẽ tự động tịnh tiến lịch trình tương ứng.')}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

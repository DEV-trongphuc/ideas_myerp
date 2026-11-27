import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface UploadTask {
  id: string;
  fileName: string;
  fileSize?: string;
  progress: number;
  status: 'compressing' | 'uploading' | 'processing' | 'success' | 'error';
  errorMessage?: string;
}

interface UploadActionsContextType {
  startUpload: (fileName: string, fileSize?: string) => string;
  updateProgress: (id: string, progress: number, status?: UploadTask['status']) => void;
  finishUpload: (id: string, success?: boolean, errorMessage?: string) => void;
  removeTask: (id: string) => void;
}

interface UploadProgressContextType extends UploadActionsContextType {
  tasks: UploadTask[];
}

const EMPTY_TASKS: UploadTask[] = [];
const NOOP_UPLOAD_ACTIONS: UploadActionsContextType = {
  startUpload: () => '',
  updateProgress: () => {},
  finishUpload: () => {},
  removeTask: () => {},
};

const UploadTasksStateContext = createContext<UploadTask[] | null>(null);
const UploadActionsContext = createContext<UploadActionsContextType | null>(null);

export const UploadProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);

  const startUpload = useCallback((fileName: string, fileSize?: string) => {
    const id = 'up_' + Math.random().toString(36).substr(2, 9);
    const newTask: UploadTask = {
      id,
      fileName,
      fileSize,
      progress: 0,
      status: 'compressing'
    };
    setTasks(prev => [...prev, newTask]);
    return id;
  }, []);

  const updateProgress = useCallback((id: string, progress: number, status: UploadTask['status'] = 'uploading') => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, progress: Math.min(100, Math.max(0, progress)), status } : t));
  }, []);

  const finishUpload = useCallback((id: string, success: boolean = true, errorMessage?: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        return {
          ...t,
          progress: 100,
          status: success ? 'success' : 'error',
          errorMessage
        };
      }
      return t;
    }));

    // Auto remove completed task after 4 seconds
    setTimeout(() => {
      setTasks(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const actionsValue = useMemo<UploadActionsContextType>(
    () => ({ startUpload, updateProgress, finishUpload, removeTask }),
    [startUpload, updateProgress, finishUpload, removeTask]
  );

  return (
    <UploadActionsContext.Provider value={actionsValue}>
      <UploadTasksStateContext.Provider value={tasks}>
        {children}
        <UploadProgressWidget />
      </UploadTasksStateContext.Provider>
    </UploadActionsContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useUploadTasksState = (): UploadTask[] => {
  return useContext(UploadTasksStateContext) ?? EMPTY_TASKS;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useUploadActions = (): UploadActionsContextType => {
  return useContext(UploadActionsContext) ?? NOOP_UPLOAD_ACTIONS;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useUploadProgress = (): UploadProgressContextType => {
  const tasks = useUploadTasksState();
  const actions = useUploadActions();
  return useMemo(() => ({ tasks, ...actions }), [tasks, actions]);
};

// Global Upload Floating Widget Component
const UploadProgressWidget: React.FC = React.memo(() => {
  const tasks = useUploadTasksState();
  const { removeTask: onRemove } = useUploadActions();
  if (tasks.length === 0 || typeof document === 'undefined') return null;

  return createPortal(
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 2147483645,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      maxWidth: '380px',
      width: 'calc(100vw - 48px)',
      pointerEvents: 'none'
    }}>
      <AnimatePresence>
        {tasks.map(task => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            style={{
              pointerEvents: 'auto',
              background: 'var(--color-surface, #ffffff)',
              color: 'var(--color-text, #0f172a)',
              borderRadius: '16px',
              padding: '14px 16px',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.08)',
              border: task.status === 'error' 
                ? '1px solid rgba(239, 68, 68, 0.3)' 
                : task.status === 'success'
                ? '1px solid rgba(16, 185, 129, 0.3)'
                : '1px solid var(--color-border, #e2e8f0)',
              backdropFilter: 'blur(10px)',
              overflow: 'hidden'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: task.status === 'error'
                    ? 'rgba(239, 68, 68, 0.1)'
                    : task.status === 'success'
                    ? 'rgba(16, 185, 129, 0.1)'
                    : 'rgba(189, 29, 45, 0.08)',
                  color: task.status === 'error'
                    ? '#ef4444'
                    : task.status === 'success'
                    ? '#10b981'
                    : '#BD1D2D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {task.status === 'success' ? (
                    <CheckCircle2 size={20} />
                  ) : task.status === 'error' ? (
                    <AlertCircle size={20} />
                  ) : (
                    <Loader2 size={20} className="animate-spin" />
                  )}
                </div>

                <div style={{ overflow: 'hidden' }}>
                  <div style={{
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: 'var(--color-text)'
                  }}>
                    {task.fileName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: '6px' }}>
                    <span>
                      {task.status === 'compressing' && 'Đang nén WebP...'}
                      {task.status === 'uploading' && `Đang tải lên ${task.progress}%`}
                      {task.status === 'processing' && 'Đang xử lý trên máy chủ...'}
                      {task.status === 'success' && 'Tải lên hoàn tất!'}
                      {task.status === 'error' && (task.errorMessage || 'Lỗi tải tệp')}
                    </span>
                    {task.fileSize && <span>• {task.fileSize}</span>}
                  </div>
                </div>
              </div>

              <button
                onClick={() => onRemove(task.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Progress Bar */}
            <div style={{
              height: '6px',
              width: '100%',
              background: 'var(--color-border-light, #f1f5f9)',
              borderRadius: '99px',
              overflow: 'hidden',
              marginTop: '4px'
            }}>
              <div
                style={{
                  height: '100%',
                  width: `${task.progress}%`,
                  background: task.status === 'error'
                    ? '#ef4444'
                    : task.status === 'success'
                    ? 'linear-gradient(90deg, #10b981, #059669)'
                    : 'linear-gradient(90deg, #BD1D2D, #ff4d5e)',
                  borderRadius: '99px',
                  transition: 'width 0.25s ease-out, background 0.3s ease'
                }}
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
});

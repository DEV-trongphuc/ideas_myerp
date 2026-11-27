import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useUIStore } from '../../store/uiStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { pushOverlay } from '../../utils/overlayStack';
import { isExecutive, isManagement } from '../../utils/roleUtils';
import { extractArray } from '../../utils/safeArray';
import api from '../../api/axios';

const CustomerProfileDrawer = lazy(() => import('../../pages/CustomerProfileDrawer').then(module => ({ default: module.CustomerProfileDrawer })));
const WorkspaceTaskDrawer = lazy(() => import('../../pages/WorkspaceTaskDrawer').then(module => ({ default: module.WorkspaceTaskDrawer })));
const ExpenseQuickViewDrawer = lazy(() => import('../ExpenseQuickViewDrawer').then(module => ({ default: module.ExpenseQuickViewDrawer })));
const ExpenseCreateDrawer = lazy(() => import('../ExpenseCreateDrawer').then(module => ({ default: module.ExpenseCreateDrawer })));
const ApprovalDetailDrawer = lazy(() => import('../common/ApprovalDetailDrawer').then(module => ({ default: module.ApprovalDetailDrawer })));
const DepositDetailDrawer = lazy(() => import('../DepositDetailDrawer').then(module => ({ default: module.DepositDetailDrawer })));
const CompanyDrawer = lazy(() => import('../../pages/CompanyDrawer').then(module => ({ default: module.CompanyDrawer })));

export const GlobalEntityDrawers: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    customerDrawer, closeCustomerDrawer, openCustomerDrawer,
    taskDrawer, closeTaskDrawer, openTaskDrawer,
    expenseDrawer, closeExpenseDrawer, openExpenseDrawer,
    approvalDrawer, closeApprovalDrawer, openApprovalDrawer,
    depositDrawer, closeDepositDrawer, openDepositDrawer
  } = useUIStore(useShallow(state => ({
    customerDrawer: state.customerDrawer,
    closeCustomerDrawer: state.closeCustomerDrawer,
    openCustomerDrawer: state.openCustomerDrawer,
    taskDrawer: state.taskDrawer,
    closeTaskDrawer: state.closeTaskDrawer,
    openTaskDrawer: state.openTaskDrawer,
    expenseDrawer: state.expenseDrawer,
    closeExpenseDrawer: state.closeExpenseDrawer,
    openExpenseDrawer: state.openExpenseDrawer,
    approvalDrawer: state.approvalDrawer,
    closeApprovalDrawer: state.closeApprovalDrawer,
    openApprovalDrawer: state.openApprovalDrawer,
    depositDrawer: state.depositDrawer,
    closeDepositDrawer: state.closeDepositDrawer,
    openDepositDrawer: state.openDepositDrawer,
  })));
  const isWorkChatOpen = useChatStore(state => state.isOpen);
  const currentUser = useAuthStore(state => state.user);
  const [fullContact, setFullContact] = useState<any>(null);
  const [fullTask, setFullTask] = useState<any>(null);
  const [expenseCreateOpen, setExpenseCreateOpen] = useState(false);
  const [expenseCreateEditItem, setExpenseCreateEditItem] = useState<any>(null);
  const [companyDrawerEntity, setCompanyDrawerEntity] = useState<any>(null);
  const [drawerOrder, setDrawerOrder] = useState<string[]>([]);
  const approvalActionInFlightRef = useRef(false);
  const companyAbortRef = useRef<AbortController | null>(null);

  const bumpDrawer = useCallback((key: string) => {
    setDrawerOrder(prev => [...prev.filter(k => k !== key), key]);
  }, []);

  const dropDrawer = useCallback((key: string) => {
    setDrawerOrder(prev => prev.filter(k => k !== key));
  }, []);

  const getDrawerZIndex = useCallback((key: string) => {
    const idx = drawerOrder.indexOf(key);
    return Math.min(2147483640, 2147483632 + Math.max(0, idx) * 2);
  }, [drawerOrder]);

  useEffect(() => {
    if (customerDrawer.isOpen) bumpDrawer('customer');
    else dropDrawer('customer');
  }, [customerDrawer.isOpen, customerDrawer.contact?.id, bumpDrawer, dropDrawer]);

  useEffect(() => {
    if (taskDrawer.isOpen) bumpDrawer('task');
    else dropDrawer('task');
  }, [taskDrawer.isOpen, taskDrawer.task?.id, bumpDrawer, dropDrawer]);

  useEffect(() => {
    if (expenseDrawer.isOpen) bumpDrawer('expense');
    else dropDrawer('expense');
  }, [expenseDrawer.isOpen, expenseDrawer.expenseId, bumpDrawer, dropDrawer]);

  useEffect(() => {
    if (expenseCreateOpen) bumpDrawer('expenseCreate');
    else dropDrawer('expenseCreate');
  }, [expenseCreateOpen, bumpDrawer, dropDrawer]);

  useEffect(() => {
    if (approvalDrawer.isOpen) bumpDrawer('approval');
    else dropDrawer('approval');
  }, [approvalDrawer.isOpen, approvalDrawer.item?.id, bumpDrawer, dropDrawer]);

  useEffect(() => {
    if (depositDrawer.isOpen) bumpDrawer('deposit');
    else dropDrawer('deposit');
  }, [depositDrawer.isOpen, depositDrawer.deposit?.id, bumpDrawer, dropDrawer]);

  useEffect(() => {
    if (companyDrawerEntity) bumpDrawer('company');
    else dropDrawer('company');
  }, [Boolean(companyDrawerEntity), companyDrawerEntity?.id, bumpDrawer, dropDrawer]);

  // Deep link URL listener: Auto-open drawer when navigating with query parameters or direct entity path (e.g. /contact/123)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const path = location.pathname;

    // 1. Contacts: ContactsPage (/contacts, /students) handles its own local drawer when WorkChat is closed
    const isContactsPage = path === '/contacts' || path === '/students' || path.startsWith('/contacts?') || path.startsWith('/students?');
    if (isContactsPage && !isWorkChatOpen) {
      if (customerDrawer.isOpen && (params.get('open_contact_id') || params.get('id') || params.get('contact_id'))) {
        closeCustomerDrawer();
      }
    } else {
      const contactPathMatch = path.match(/^\/(?:contacts?|students?|leads?|crm)\/([0-9]+)/i);
      const contactId = params.get('contact_id') || (contactPathMatch ? contactPathMatch[1] : null);
      if (contactId && !isNaN(Number(contactId))) {
        openCustomerDrawer(Number(contactId), params.get('tab') || 'info');
        return;
      }
    }

    // 2. Expenses: ExpensesPage does not have a URL param listener for ?open_id= / ?id=, so GlobalEntityDrawers handles it
    const expensePathMatch = path.match(/^\/(?:expenses?|workflow\/expense)\/([0-9]+)/i);
    const expenseId = params.get('expense_id') || (expensePathMatch ? expensePathMatch[1] : null) || (path.startsWith('/expenses') ? (params.get('open_id') || params.get('id')) : null);
    if (expenseId && !isNaN(Number(expenseId))) {
      openExpenseDrawer(Number(expenseId));
      return;
    }

    // 3. Tasks: SalePortal (/workspace, /sale-portal, /) and ProjectsPage (/projects) handle their own local WorkspaceTaskDrawer when WorkChat is closed
    const isLocalTaskPage = path === '/' || path.startsWith('/workspace') || path.startsWith('/sale-portal') || path.startsWith('/projects');
    if (isLocalTaskPage && !isWorkChatOpen) {
      const localUrlTaskId = params.get('task_id') || params.get('open_task_id');
      if (taskDrawer.isOpen && localUrlTaskId && String(taskDrawer.task?.id) === String(localUrlTaskId)) {
        closeTaskDrawer();
      }
    } else {
      const taskPathMatch = path.match(/^\/tasks?\/([0-9]+)/i);
      const taskId = params.get('task_id') || params.get('open_task_id') || (taskPathMatch ? taskPathMatch[1] : null) || (path.startsWith('/tasks') ? params.get('id') : null);
      if (taskId && !isNaN(Number(taskId))) {
        openTaskDrawer(Number(taskId));
        return;
      }
    }

    // 4. Approvals: Approvals.tsx (/approvals) handles its own local drawer when WorkChat is closed
    if (path.startsWith('/approvals') && !isWorkChatOpen) {
      if (approvalDrawer.isOpen && (params.get('open_id') || params.get('id') || params.get('approval_id'))) {
        closeApprovalDrawer();
      }
    } else {
      const approvalId = params.get('approval_id');
      if (approvalId && !isNaN(Number(approvalId))) {
        openApprovalDrawer({ id: Number(approvalId), type: params.get('type') || params.get('open_type') || 'leave' });
        return;
      }
    }

    // 5. Deposits: DepositsPage.tsx (/deposits, /sales-orders, /cash-flow) handles its own local drawer when WorkChat is closed
    const isLocalDepositPage = path.startsWith('/deposits') || path.startsWith('/sales-orders') || path.startsWith('/cash-flow');
    if (isLocalDepositPage && !isWorkChatOpen) {
      if (depositDrawer.isOpen && (params.get('open_id') || params.get('id') || params.get('deposit_id'))) {
        closeDepositDrawer();
      }
    } else {
      const depositId = params.get('deposit_id');
      if (depositId && !isNaN(Number(depositId))) {
        openDepositDrawer(Number(depositId));
        return;
      }
    }
  }, [
    location.pathname,
    location.search,
    isWorkChatOpen,
    openCustomerDrawer,
    closeCustomerDrawer,
    openExpenseDrawer,
    openTaskDrawer,
    closeTaskDrawer,
    openApprovalDrawer,
    closeApprovalDrawer,
    openDepositDrawer,
    closeDepositDrawer
  ]);

  // Sync / fetch full contact if only ID is provided
  useEffect(() => {
    const controller = new AbortController();
    if (customerDrawer.isOpen && customerDrawer.contact) {
      const c = customerDrawer.contact;
      if (c.full_name || c.phone || c.email) {
        setFullContact(c);
      } else if (c.id) {
        setFullContact({ ...c, full_name: 'Đang tải thông tin...' });
        api.get(`/contacts/${c.id}`, { signal: controller.signal }).then(res => {
          if (controller.signal.aborted) return;
          const d = res.data?.data || res.data;
          if (d && d.id) {
            setFullContact(d);
          }
        }).catch((err: any) => {
          if (controller.signal.aborted || err?.name === 'AbortError' || err?.name === 'CanceledError') return;
          setFullContact(c);
        });
      }
    } else {
      setFullContact(null);
    }
    return () => controller.abort();
  }, [customerDrawer.isOpen, customerDrawer.contact]);

  // Sync / fetch full task if only ID is provided
  useEffect(() => {
    const controller = new AbortController();
    if (taskDrawer.isOpen && taskDrawer.task) {
      const t = taskDrawer.task;
      if (t.subject || t.body || t.status || t.id === 'new') {
        setFullTask(t);
      } else if (t.id && t.id !== 'new') {
        setFullTask({ ...t, subject: 'Đang tải công việc...' });
        api.get(`/activities/${t.id}`, { signal: controller.signal }).then(res => {
          if (controller.signal.aborted) return;
          const d = res.data?.data || res.data;
          if (d && d.id) {
            setFullTask(d);
          }
        }).catch((err: any) => {
          if (controller.signal.aborted || err?.name === 'AbortError' || err?.name === 'CanceledError') return;
          setFullTask(t);
        });
      }
    } else {
      setFullTask(null);
    }
    return () => controller.abort();
  }, [taskDrawer.isOpen, taskDrawer.task]);

  // Global window CustomEvents listener
  useEffect(() => {
    const handleOpenCustomer = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail) {
        const c = custom.detail.contact || custom.detail.contactId || custom.detail.id || ((custom.detail.phone || custom.detail.email) ? custom.detail : undefined);
        const tab = custom.detail.initialTab || 'info';
        if (c) {
          bumpDrawer('customer');
          openCustomerDrawer(c, tab);
        }
      }
    };

    const handleOpenTask = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail) {
        const t = custom.detail.task || custom.detail.taskId || custom.detail.id;
        if (t) {
          bumpDrawer('task');
          openTaskDrawer(t);
        }
      }
    };

    const handleOpenExpense = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail) {
        const id = custom.detail.id || custom.detail.expenseId || custom.detail.open_id;
        if (id) {
          bumpDrawer('expense');
          openExpenseDrawer(Number(id));
        }
      }
    };

    const handleOpenApproval = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail) {
        const id = custom.detail.id || custom.detail.open_id;
        const type = custom.detail.type || custom.detail.open_type || 'leave';
        if (id) {
          bumpDrawer('approval');
          openApprovalDrawer({ id: Number(id), type, ...custom.detail });
        }
      }
    };

    const handleOpenDeposit = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail) {
        const d = custom.detail.deposit || custom.detail.id || custom.detail.depositId;
        if (d) {
          bumpDrawer('deposit');
          openDepositDrawer(d);
        }
      }
    };

    const handleOpenExpenseCreate = (e: Event) => {
      const custom = e as CustomEvent;
      setExpenseCreateEditItem(custom?.detail?.id ? custom.detail : null);
      bumpDrawer('expenseCreate');
      setExpenseCreateOpen(true);
    };

    const handleOpenCompany = (e: Event) => {
      const custom = e as CustomEvent;
      const cid = Number(custom?.detail?.id || custom?.detail?.companyId);
      if (cid) {
        companyAbortRef.current?.abort();
        const controller = new AbortController();
        companyAbortRef.current = controller;
        api.get(`/companies/${cid}`, { signal: controller.signal }).then(res => {
          if (controller.signal.aborted) return;
          const data = res.data?.data || res.data;
          if (data && data.id) {
            bumpDrawer('company');
            setCompanyDrawerEntity(data);
          }
        }).catch((err: any) => {
          if (controller.signal.aborted || err?.name === 'AbortError' || err?.name === 'CanceledError') return;
          toast.error(err?.response?.data?.message || 'Không thể tải thông tin đại lý/đối tác');
        });
      }
    };

    const handleOpenEntityDrawer = (e: Event) => {
      const custom = e as CustomEvent;
      const d = custom.detail;
      if (!d) return;
      const rawType = String(d.type || d.entityType || d.entity_type || '').toLowerCase();
      const entityId = d.id || d.entityId || d.entity_id || d.contactId || d.taskId || d.expenseId || d.depositId;
      if (!entityId) return;

      if (['contact', 'customer', 'student', 'lead', 'crm_profile'].includes(rawType)) {
        bumpDrawer('customer');
        openCustomerDrawer(Number(entityId), d.initialTab || d.tab || 'info');
      } else if (['task', 'activity'].includes(rawType)) {
        bumpDrawer('task');
        openTaskDrawer(d.task || Number(entityId));
      } else if (['expense', 'po', 'purchase_order', 'po_order'].includes(rawType)) {
        bumpDrawer('expense');
        openExpenseDrawer(Number(entityId));
      } else if (['approval', 'workflow', 'leave', 'wfh', 'ot', 'late_early', 'remote_work', 'overtime', 'advance', 'checkin', 'attendance_bulk'].includes(rawType)) {
        const subType = String(d.sub_type || d.approval_type || '').toLowerCase();
        if (rawType === 'approval' && ['expense', 'po', 'purchase_order', 'po_order'].includes(subType)) {
          bumpDrawer('expense');
          openExpenseDrawer(Number(entityId));
        } else {
          bumpDrawer('approval');
          openApprovalDrawer({ id: Number(entityId), type: rawType === 'workflow' || rawType === 'approval' ? (subType || 'leave') : rawType, ...d });
        }
      } else if (['deposit', 'so', 'sales_order'].includes(rawType)) {
        bumpDrawer('deposit');
        openDepositDrawer(d.deposit || Number(entityId));
      } else if (['company', 'partner'].includes(rawType)) {
        handleOpenCompany({ detail: { id: Number(entityId) } } as any);
      }
    };

    window.addEventListener('open-global-customer', handleOpenCustomer);
    window.addEventListener('open-customer-drawer', handleOpenCustomer);
    window.addEventListener('open-global-task', handleOpenTask);
    window.addEventListener('open-expense-drawer', handleOpenExpense);
    window.addEventListener('open-global-expense', handleOpenExpense);
    window.addEventListener('open-expense-create-drawer', handleOpenExpenseCreate);
    window.addEventListener('open-create-expense-modal', handleOpenExpenseCreate);
    window.addEventListener('open-global-approval', handleOpenApproval);
    window.addEventListener('open-deposit-drawer', handleOpenDeposit);
    window.addEventListener('open-company-drawer', handleOpenCompany);
    window.addEventListener('open-entity-drawer', handleOpenEntityDrawer);

    // Global click listener for .entity-mention and .mention
    const handleGlobalEntityClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('.entity-mention, [data-entity-type]') as HTMLElement | null;
      if (!target) return;
      const type = (target.getAttribute('data-entity-type') || '').toLowerCase();
      const id = target.getAttribute('data-entity-id');
      if (!type || !id) return;

      e.preventDefault();
      e.stopPropagation();

      if (type === 'contact' || type === 'customer' || type === 'student' || type === 'lead' || type === 'crm_profile') {
        bumpDrawer('customer');
        openCustomerDrawer(Number(id), 'info');
      } else if (type === 'task' || type === 'activity') {
        bumpDrawer('task');
        openTaskDrawer(Number(id));
      } else if (type === 'po' || type === 'purchase_order' || type === 'po_order' || type === 'expense') {
        bumpDrawer('expense');
        openExpenseDrawer(Number(id));
      } else if (type === 'approval') {
        const approvalType = (target.getAttribute('data-approval-type') || target.getAttribute('data-sub-type') || '').toLowerCase();
        if (['leave', 'wfh', 'ot', 'late_early', 'remote_work', 'overtime', 'advance', 'checkin', 'attendance_bulk'].includes(approvalType)) {
          bumpDrawer('approval');
          openApprovalDrawer({ id: Number(id), type: approvalType });
        } else {
          bumpDrawer('expense');
          openExpenseDrawer(Number(id));
        }
      } else if (type === 'leave' || type === 'wfh' || type === 'ot' || type === 'late_early' || type === 'remote_work' || type === 'overtime' || type === 'workflow' || type === 'advance' || type === 'checkin' || type === 'attendance_bulk') {
        bumpDrawer('approval');
        openApprovalDrawer({ id: Number(id), type: type === 'workflow' ? 'leave' : type });
      } else if (type === 'company') {
        window.dispatchEvent(new CustomEvent('open-company-drawer', { detail: { id: Number(id) } }));
      } else if (type === 'deal') {
        if (window.location.pathname.startsWith('/deals')) {
          window.dispatchEvent(new CustomEvent('open-deal-drawer', { detail: { id: Number(id), dealId: Number(id) } }));
        } else {
          navigate(`/deals?open_deal_id=${id}`);
        }
      } else if (type === 'so' || type === 'deposit' || type === 'sales_order') {
        bumpDrawer('deposit');
        openDepositDrawer(Number(id));
      }
    };

    document.addEventListener('click', handleGlobalEntityClick);

    return () => {
      companyAbortRef.current?.abort();
      document.removeEventListener('click', handleGlobalEntityClick);
      window.removeEventListener('open-global-customer', handleOpenCustomer);
      window.removeEventListener('open-customer-drawer', handleOpenCustomer);
      window.removeEventListener('open-global-task', handleOpenTask);
      window.removeEventListener('open-expense-drawer', handleOpenExpense);
      window.removeEventListener('open-global-expense', handleOpenExpense);
      window.removeEventListener('open-expense-create-drawer', handleOpenExpenseCreate);
      window.removeEventListener('open-create-expense-modal', handleOpenExpenseCreate);
      window.removeEventListener('open-global-approval', handleOpenApproval);
      window.removeEventListener('open-deposit-drawer', handleOpenDeposit);
      window.removeEventListener('open-company-drawer', handleOpenCompany);
      window.removeEventListener('open-entity-drawer', handleOpenEntityDrawer);
    };
  }, [openCustomerDrawer, openTaskDrawer, openExpenseDrawer, openApprovalDrawer, openDepositDrawer, bumpDrawer, navigate]);

  const [usersList, setUsersList] = useState<any[]>([]);

  useEffect(() => {
    if (!approvalDrawer.isOpen) return;
    const controller = new AbortController();
    api.get('/users', { signal: controller.signal }).then(res => {
      if (controller.signal.aborted) return;
      const u = extractArray<any>(res.data);
      if (u.length > 0) setUsersList(u);
    }).catch((err: any) => {
      if (controller.signal.aborted || err?.name === 'AbortError' || err?.name === 'CanceledError') return;
    });
    return () => controller.abort();
  }, [approvalDrawer.isOpen]);

  const clearUrlEntityParams = (paramKeys: string[]) => {
    const params = new URLSearchParams(location.search || window.location.search);
    let changed = false;
    const allKeys = [
      ...paramKeys,
      'open_contact_id',
      'open_id',
      'open_type',
      'open_status',
      'open_deposit_id',
      'task_id',
      'open_task_id',
      'highlight_activity_id',
      'highlight_comment_id',
      'highlight_note_id',
      'subtask_id',
      'comment_id'
    ];
    allKeys.forEach((k) => {
      if (params.has(k)) {
        params.delete(k);
        changed = true;
      }
    });
    if (changed) {
      const nextSearch = params.toString();
      navigate({ pathname: location.pathname, search: nextSearch ? '?' + nextSearch : '' }, { replace: true });
    }
  };

  const handleCloseCustomerDrawer = () => {
    (window as any).__activeErpProposalId = null;
    clearUrlEntityParams(['contact_id', 'open_contact_id', 'id', 'tab']);
    closeCustomerDrawer();
  };

  const handleCloseTaskDrawer = () => {
    (window as any).__activeErpProposalId = null;
    clearUrlEntityParams(['task_id', 'open_id', 'id']);
    closeTaskDrawer();
  };

  const handleCloseExpenseDrawer = () => {
    (window as any).__activeErpProposalId = null;
    clearUrlEntityParams(['expense_id', 'open_id', 'id']);
    closeExpenseDrawer();
  };

  const handleCloseApprovalDrawer = () => {
    (window as any).__activeErpProposalId = null;
    clearUrlEntityParams(['approval_id', 'open_id', 'open_type', 'open_status', 'id', 'type']);
    closeApprovalDrawer();
  };

  const handleCloseDepositDrawer = () => {
    (window as any).__activeErpProposalId = null;
    clearUrlEntityParams(['deposit_id', 'open_deposit_id', 'open_id', 'id']);
    closeDepositDrawer();
  };

  const handleCloseCompanyDrawer = () => {
    (window as any).__activeErpProposalId = null;
    clearUrlEntityParams(['company_id', 'open_company_id']);
    setCompanyDrawerEntity(null);
  };

  // Register global drawers on LIFO overlayStack above WorkChatModal (priority 1000) so ESC closes only the top drawer
  useEffect(() => {
    if (customerDrawer.isOpen) {
      return pushOverlay('global-customer-drawer', handleCloseCustomerDrawer, 2000);
    }
  }, [customerDrawer.isOpen]);

  useEffect(() => {
    if (taskDrawer.isOpen) {
      return pushOverlay('global-task-drawer', handleCloseTaskDrawer, 2100);
    }
  }, [taskDrawer.isOpen]);

  useEffect(() => {
    if (expenseDrawer.isOpen) {
      return pushOverlay('global-expense-drawer', handleCloseExpenseDrawer, 2000);
    }
  }, [expenseDrawer.isOpen]);

  useEffect(() => {
    if (expenseCreateOpen) {
      return pushOverlay('global-expense-create-drawer', () => {
        (window as any).__activeErpProposalId = null;
        setExpenseCreateOpen(false);
        setExpenseCreateEditItem(null);
      }, 2000);
    }
  }, [expenseCreateOpen]);

  useEffect(() => {
    if (approvalDrawer.isOpen) {
      return pushOverlay('global-approval-drawer', handleCloseApprovalDrawer, 2000);
    }
  }, [approvalDrawer.isOpen]);

  useEffect(() => {
    if (depositDrawer.isOpen) {
      return pushOverlay('global-deposit-drawer', handleCloseDepositDrawer, 2000);
    }
  }, [depositDrawer.isOpen]);

  useEffect(() => {
    if (companyDrawerEntity) {
      return pushOverlay('global-company-drawer', handleCloseCompanyDrawer, 2000);
    }
  }, [Boolean(companyDrawerEntity)]);

  return (
    <>
      {customerDrawer.isOpen && fullContact && (
        <Suspense fallback={null}>
          <CustomerProfileDrawer
            isOpen={customerDrawer.isOpen}
            onClose={handleCloseCustomerDrawer}
            contact={fullContact}
            initialTab={customerDrawer.initialTab || 'info'}
            zIndex={getDrawerZIndex('customer')}
          />
        </Suspense>
      )}

      {taskDrawer.isOpen && fullTask && (
        <Suspense fallback={null}>
          <WorkspaceTaskDrawer
            isOpen={taskDrawer.isOpen}
            onClose={handleCloseTaskDrawer}
            task={fullTask}
            zIndex={getDrawerZIndex('task')}
            onUpdate={(updatedTask?: any) => {
              if (updatedTask) {
                setFullTask((prev: any) => prev ? { ...prev, ...updatedTask } : updatedTask);
              }
              const detail = updatedTask || fullTask;
              window.dispatchEvent(new CustomEvent('task-updated', { detail }));
              window.dispatchEvent(new CustomEvent('task-local-updated', { detail }));
            }}
            onOpenContact={(contactId: number | string) => {
              if (contactId) {
                bumpDrawer('customer');
                openCustomerDrawer(Number(contactId), 'info');
              }
            }}
          />
        </Suspense>
      )}

      {expenseDrawer.isOpen && expenseDrawer.expenseId && (
        <Suspense fallback={null}>
          <ExpenseQuickViewDrawer
            expenseId={expenseDrawer.expenseId}
            onClose={handleCloseExpenseDrawer}
            user={currentUser}
            zIndex={getDrawerZIndex('expense')}
          />
        </Suspense>
      )}

      {expenseCreateOpen && (
        <Suspense fallback={null}>
          <ExpenseCreateDrawer
            isOpen={expenseCreateOpen}
            onClose={() => {
              (window as any).__activeErpProposalId = null;
              setExpenseCreateOpen(false);
              setExpenseCreateEditItem(null);
            }}
            editItem={expenseCreateEditItem}
            user={currentUser}
            onSaveSuccess={() => {
              setExpenseCreateOpen(false);
              setExpenseCreateEditItem(null);
              window.dispatchEvent(new CustomEvent('refresh-pending-counts'));
              window.dispatchEvent(new CustomEvent('erp-action-completed', { detail: { actionType: 'expense' } }));
            }}
            zIndex={getDrawerZIndex('expenseCreate')}
          />
        </Suspense>
      )}

      {approvalDrawer.isOpen && approvalDrawer.item && (
        <Suspense fallback={null}>
          <ApprovalDetailDrawer
            item={approvalDrawer.item}
            onClose={handleCloseApprovalDrawer}
            users={usersList}
            t={(k: string) => k}
            onApprove={async (it) => {
              if (approvalActionInFlightRef.current) return;
              approvalActionInFlightRef.current = true;
              const itemType = String(it.type || '').toLowerCase();
              try {
                if (itemType === 'leave' || itemType === 'wfh' || itemType === 'ot' || itemType === 'late_early' || itemType === 'remote_work' || itemType === 'overtime') {
                  await api.put('/hrm/leaves/' + it.id + '/status', { status: 'approved' });
                } else if (itemType === 'advance') {
                  await api.put('/hrm/advances/' + it.id + '/status', { status: 'approved' });
                } else if (itemType === 'po' || itemType === 'purchase_order') {
                  await api.post('/purchase-orders/' + it.id + '/approve');
                } else if (itemType === 'checkin') {
                  await api.put('/check-ins/' + it.id, { status: 'approved' });
                } else if (itemType === 'attendance_bulk') {
                  await api.post('/check-ins/' + it.id + '/bulk-approve', { action: 'approve' });
                } else {
                  await api.post('/expenses/' + it.id + '/approve');
                }
                toast.success('Đã duyệt yêu cầu thành công');
                handleCloseApprovalDrawer();
                window.dispatchEvent(new CustomEvent('refresh-pending-counts'));
              } catch (err: any) {
                toast.error(err?.response?.data?.message || 'Lỗi khi phê duyệt');
              } finally {
                approvalActionInFlightRef.current = false;
              }
            }}
            onReject={(it) => {
              if (approvalActionInFlightRef.current) return;
              useUIStore.getState().showConfirm({
                title: 'Từ chối yêu cầu',
                message: 'Vui lòng nhập lý do từ chối:',
                requirePromptInput: true,
                promptPlaceholder: 'Nhập lý do từ chối...',
                confirmText: 'Xác nhận từ chối',
                cancelText: 'Hủy',
                isDanger: true,
                onConfirm: async (rawReason?: string) => {
                  if (approvalActionInFlightRef.current) return;
                  const reason = String(rawReason || '').trim();
                  if (!reason) {
                    toast.error('Vui lòng nhập lý do từ chối');
                    return;
                  }
                  approvalActionInFlightRef.current = true;
                  const itemType = String(it.type || '').toLowerCase();
                  try {
                    if (itemType === 'leave' || itemType === 'wfh' || itemType === 'ot' || itemType === 'late_early' || itemType === 'remote_work' || itemType === 'overtime') {
                      await api.put('/hrm/leaves/' + it.id + '/status', { status: 'rejected', reject_reason: reason });
                    } else if (itemType === 'advance') {
                      await api.put('/hrm/advances/' + it.id + '/status', { status: 'rejected', reject_reason: reason });
                    } else if (itemType === 'po' || itemType === 'purchase_order') {
                      await api.post('/purchase-orders/' + it.id + '/reject', { reason });
                    } else if (itemType === 'checkin') {
                      await api.put('/check-ins/' + it.id, { status: 'rejected', notes: reason });
                    } else if (itemType === 'attendance_bulk') {
                      await api.post('/check-ins/' + it.id + '/bulk-approve', { action: 'reject', reason });
                    } else {
                      await api.post('/expenses/' + it.id + '/reject', { reason });
                    }
                    toast.success('Đã từ chối yêu cầu');
                    handleCloseApprovalDrawer();
                    window.dispatchEvent(new CustomEvent('refresh-pending-counts'));
                  } catch (err: any) {
                    toast.error(err?.response?.data?.message || 'Lỗi khi từ chối');
                  } finally {
                    approvalActionInFlightRef.current = false;
                  }
                }
              });
            }}
            isAdmin={Boolean(isExecutive(currentUser) || isManagement(currentUser) || (currentUser as any)?.is_admin)}
            onEdit={(it) => {
              handleCloseApprovalDrawer();
              if (window.location.pathname.startsWith('/approvals')) {
                window.dispatchEvent(new CustomEvent('open-approval-item', { detail: { id: it.id, type: it.type, raw: it, mode: 'edit' } }));
              } else {
                navigate(`/approvals?open_id=${it.id}&open_type=${it.type}&action=edit`);
              }
            }}
            onDuplicate={(it) => {
              handleCloseApprovalDrawer();
              if (window.location.pathname.startsWith('/approvals')) {
                window.dispatchEvent(new CustomEvent('open-approval-item', { detail: { id: it.id, type: it.type, raw: it, mode: 'duplicate' } }));
              } else {
                navigate(`/approvals?open_id=${it.id}&open_type=${it.type}&action=duplicate`);
              }
            }}
            zIndex={getDrawerZIndex('approval')}
          />
        </Suspense>
      )}

      {depositDrawer.isOpen && depositDrawer.deposit && (
        <Suspense fallback={null}>
          <DepositDetailDrawer
            isOpen={depositDrawer.isOpen}
            onClose={handleCloseDepositDrawer}
            deposit={depositDrawer.deposit}
            onSaveSuccess={() => {
              handleCloseDepositDrawer();
              window.dispatchEvent(new CustomEvent('refresh-deposits'));
              window.dispatchEvent(new CustomEvent('erp-action-completed', { detail: { actionType: 'deposit' } }));
            }}
            zIndex={getDrawerZIndex('deposit')}
          />
        </Suspense>
      )}

      {companyDrawerEntity && (
        <Suspense fallback={null}>
          <CompanyDrawer
            isOpen={Boolean(companyDrawerEntity)}
            onClose={handleCloseCompanyDrawer}
            entity={companyDrawerEntity}
            zIndex={getDrawerZIndex('company')}
            onSaved={(savedData: any) => {
              if (savedData && typeof savedData === 'object') {
                setCompanyDrawerEntity((prev: any) => (prev ? { ...prev, ...savedData } : savedData));
                window.dispatchEvent(new CustomEvent('erp-action-completed', { detail: { actionType: 'company', company: savedData } }));
              }
            }}
          />
        </Suspense>
      )}
    </>
  );
};

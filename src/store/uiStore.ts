import { create } from 'zustand';
import toast from 'react-hot-toast';
import React from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string | React.ReactElement;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  extraText?: string;
  isDanger?: boolean;
  impactInfo?: string; // e.g. "Ảnh hưởng đến 45 khách hàng"
  requireWordMatch?: string; // e.g. "DELETE"
  requirePromptInput?: boolean;
  optionalPromptInput?: boolean;
  promptPlaceholder?: string;
  promptDefaultValue?: string;
  onConfirm: (promptValue?: string) => void | Promise<void>;
  onCancel?: () => void;
  onExtra?: () => void;
}

interface UIStore {
  toasts: Toast[];
  addToast: (message: string | React.ReactElement, type?: ToastType, action?: Toast['action']) => void;
  removeToast: (id: string) => void;
  showPOS: boolean | { id: number; [key: string]: any }; // POS can be open for a specific contact
  setShowPOS: (show: boolean | { id: number; [key: string]: any }) => void;
  confirmModal: ConfirmModalState;
  showConfirm: (titleOrOptions: string | Partial<ConfirmModalState>, message?: string, onConfirm?: () => void) => void;
  closeConfirm: () => void;
  callModal: { isOpen: boolean; phone: string };
  showCall: (phone: string) => void;
  closeCall: () => void;
  customerDrawer: { isOpen: boolean; contact: any | null; initialTab?: string };
  openCustomerDrawer: (contactOrId: any, initialTab?: string) => void;
  closeCustomerDrawer: () => void;
  taskDrawer: { isOpen: boolean; task: any | null };
  openTaskDrawer: (taskOrId: any) => void;
  closeTaskDrawer: () => void;
  expenseDrawer: { isOpen: boolean; expenseId: number | null };
  openExpenseDrawer: (expenseId: number) => void;
  closeExpenseDrawer: () => void;
  approvalDrawer: { isOpen: boolean; item: any | null };
  openApprovalDrawer: (itemOrId: any, type?: string) => void;
  closeApprovalDrawer: () => void;
  depositDrawer: { isOpen: boolean; deposit: any | null };
  openDepositDrawer: (depositOrId: any) => void;
  closeDepositDrawer: () => void;
  closeAllDrawers: () => void;
}

const recentToastTimestamps = new Map<string, number>();
const TOAST_DEDUPE_WINDOW_MS = 1200;

const CLOSED_CUSTOMER_DRAWER = Object.freeze({ isOpen: false, contact: null as any, initialTab: 'info' });
const CLOSED_TASK_DRAWER = Object.freeze({ isOpen: false, task: null as any });
const CLOSED_EXPENSE_DRAWER = Object.freeze({ isOpen: false, expenseId: null as number | null });
const CLOSED_APPROVAL_DRAWER = Object.freeze({ isOpen: false, item: null as any });
const CLOSED_DEPOSIT_DRAWER = Object.freeze({ isOpen: false, deposit: null as any });

export const useUIStore = create<UIStore>((set) => ({
  toasts: [],
  showPOS: false,
  setShowPOS: (show) => set((state) => (Object.is(state.showPOS, show) ? state : { showPOS: show })),
  confirmModal: {
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  },
  showConfirm: (titleOrOptions: any, message?: string, onConfirm?: () => void) => {
    if (typeof titleOrOptions === 'object') {
      set({ confirmModal: { ...titleOrOptions, isOpen: true } });
    } else {
      set({ 
        confirmModal: { 
          title: titleOrOptions, 
          message: message || '', 
          onConfirm: onConfirm || (() => {}), 
          isOpen: true 
        } 
      });
    }
  },
  closeConfirm: () => set((state) => (state.confirmModal.isOpen ? { confirmModal: { ...state.confirmModal, isOpen: false } } : state)),
  callModal: { isOpen: false, phone: '' },
  showCall: (phone: string) => set({ callModal: { isOpen: true, phone } }),
  closeCall: () => set((state) => (state.callModal.isOpen ? { callModal: { ...state.callModal, isOpen: false } } : state)),
  customerDrawer: CLOSED_CUSTOMER_DRAWER,
  openCustomerDrawer: (contactOrId: any, initialTab = 'info') => {
    const contactObj = (typeof contactOrId === 'object' && contactOrId !== null) 
      ? contactOrId 
      : { id: Number(contactOrId) };
    set((state) => ({
      customerDrawer: { isOpen: true, contact: contactObj, initialTab },
      ...(state.expenseDrawer.isOpen ? { expenseDrawer: CLOSED_EXPENSE_DRAWER } : {}),
      ...(state.approvalDrawer.isOpen ? { approvalDrawer: CLOSED_APPROVAL_DRAWER } : {}),
      ...(state.depositDrawer.isOpen ? { depositDrawer: CLOSED_DEPOSIT_DRAWER } : {}),
    }));
  },
  closeCustomerDrawer: () => set((state) => (state.customerDrawer.isOpen ? { customerDrawer: CLOSED_CUSTOMER_DRAWER } : state)),
  taskDrawer: CLOSED_TASK_DRAWER,
  openTaskDrawer: (taskOrId: any) => {
    const taskObj = (typeof taskOrId === 'object' && taskOrId !== null)
      ? taskOrId
      : { id: Number(taskOrId) };
    set((state) => ({
      taskDrawer: { isOpen: true, task: taskObj },
      ...(state.expenseDrawer.isOpen ? { expenseDrawer: CLOSED_EXPENSE_DRAWER } : {}),
      ...(state.approvalDrawer.isOpen ? { approvalDrawer: CLOSED_APPROVAL_DRAWER } : {}),
      ...(state.depositDrawer.isOpen ? { depositDrawer: CLOSED_DEPOSIT_DRAWER } : {}),
    }));
  },
  closeTaskDrawer: () => set((state) => (state.taskDrawer.isOpen ? { taskDrawer: CLOSED_TASK_DRAWER } : state)),
  expenseDrawer: CLOSED_EXPENSE_DRAWER,
  openExpenseDrawer: (expenseId: number) => {
    set((state) => ({
      expenseDrawer: { isOpen: true, expenseId: Number(expenseId) },
      ...(state.customerDrawer.isOpen ? { customerDrawer: CLOSED_CUSTOMER_DRAWER } : {}),
      ...(state.taskDrawer.isOpen ? { taskDrawer: CLOSED_TASK_DRAWER } : {}),
      ...(state.approvalDrawer.isOpen ? { approvalDrawer: CLOSED_APPROVAL_DRAWER } : {}),
      ...(state.depositDrawer.isOpen ? { depositDrawer: CLOSED_DEPOSIT_DRAWER } : {}),
    }));
  },
  closeExpenseDrawer: () => set((state) => (state.expenseDrawer.isOpen ? { expenseDrawer: CLOSED_EXPENSE_DRAWER } : state)),
  approvalDrawer: CLOSED_APPROVAL_DRAWER,
  openApprovalDrawer: (itemOrId: any, type = 'leave') => {
    let itemObj: any = null;
    if (typeof itemOrId === 'object' && itemOrId !== null) {
      itemObj = itemOrId;
    } else {
      itemObj = { id: Number(itemOrId), type: type || 'leave' };
    }
    set((state) => ({
      approvalDrawer: { isOpen: true, item: itemObj },
      ...(state.customerDrawer.isOpen ? { customerDrawer: CLOSED_CUSTOMER_DRAWER } : {}),
      ...(state.taskDrawer.isOpen ? { taskDrawer: CLOSED_TASK_DRAWER } : {}),
      ...(state.expenseDrawer.isOpen ? { expenseDrawer: CLOSED_EXPENSE_DRAWER } : {}),
      ...(state.depositDrawer.isOpen ? { depositDrawer: CLOSED_DEPOSIT_DRAWER } : {}),
    }));
  },
  closeApprovalDrawer: () => set((state) => (state.approvalDrawer.isOpen ? { approvalDrawer: CLOSED_APPROVAL_DRAWER } : state)),
  depositDrawer: CLOSED_DEPOSIT_DRAWER,
  openDepositDrawer: (depositOrId: any) => {
    const depObj = (typeof depositOrId === 'object' && depositOrId !== null)
      ? depositOrId
      : { id: Number(depositOrId) };
    set((state) => ({
      depositDrawer: { isOpen: true, deposit: depObj },
      ...(state.customerDrawer.isOpen ? { customerDrawer: CLOSED_CUSTOMER_DRAWER } : {}),
      ...(state.taskDrawer.isOpen ? { taskDrawer: CLOSED_TASK_DRAWER } : {}),
      ...(state.expenseDrawer.isOpen ? { expenseDrawer: CLOSED_EXPENSE_DRAWER } : {}),
      ...(state.approvalDrawer.isOpen ? { approvalDrawer: CLOSED_APPROVAL_DRAWER } : {}),
    }));
  },
  closeDepositDrawer: () => set((state) => (state.depositDrawer.isOpen ? { depositDrawer: CLOSED_DEPOSIT_DRAWER } : state)),
  closeAllDrawers: () => set((state) => {
    if (
      !state.customerDrawer.isOpen &&
      !state.taskDrawer.isOpen &&
      !state.expenseDrawer.isOpen &&
      !state.approvalDrawer.isOpen &&
      !state.depositDrawer.isOpen
    ) {
      return state;
    }
    return {
      ...(state.customerDrawer.isOpen ? { customerDrawer: CLOSED_CUSTOMER_DRAWER } : {}),
      ...(state.taskDrawer.isOpen ? { taskDrawer: CLOSED_TASK_DRAWER } : {}),
      ...(state.expenseDrawer.isOpen ? { expenseDrawer: CLOSED_EXPENSE_DRAWER } : {}),
      ...(state.approvalDrawer.isOpen ? { approvalDrawer: CLOSED_APPROVAL_DRAWER } : {}),
      ...(state.depositDrawer.isOpen ? { depositDrawer: CLOSED_DEPOSIT_DRAWER } : {}),
    };
  }),
  addToast: (message, type = 'info', action) => {
    // Deduplication check for string messages
    if (typeof message === 'string') {
      const key = `${type}::${message}`;
      const now = Date.now();
      const last = recentToastTimestamps.get(key);
      if (last && now - last < TOAST_DEDUPE_WINDOW_MS) {
        return; // Suppress duplicate spam
      }
      recentToastTimestamps.set(key, now);
      if (recentToastTimestamps.size > 50) {
        for (const [k, ts] of recentToastTimestamps.entries()) {
          if (now - ts > 10000) recentToastTimestamps.delete(k);
        }
      }
    }

    if (action) {
      toast((t) => (
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', null, message),
          React.createElement('button', {
            onClick: () => {
              action.onClick();
              toast.dismiss(t.id);
            },
            style: {
              padding: '2px 8px',
              backgroundColor: '#a31422',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold'
            }
          }, action.label)
        )
      ), { id: Math.random().toString(), duration: 4000 });
    } else {
      if (type === 'success') {
        toast.success(message);
      } else if (type === 'error') {
        toast.error(message);
      } else if (type === 'warning') {
        toast(message, { icon: '⚠️', duration: 3000 });
      } else {
        toast(message, { duration: 3000 });
      }
    }
  },
  removeToast: () => {}
}));


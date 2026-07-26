import { useState, useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';
import styles from './Toast.module.css';

export const useToast = create((set) => ({
  toasts: [],
  addToast: (message, type = 'success', duration = 4000) => {
    const id = Date.now() + Math.random();
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type] || ICONS.success;
        return (
          <div key={toast.id} className={`${styles.toast} ${styles[toast.type]}`}>
            <Icon size={16} />
            <span className={styles.message}>{toast.message}</span>
            <button className={styles.dismiss} onClick={() => removeToast(toast.id)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

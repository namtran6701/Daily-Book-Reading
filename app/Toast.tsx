"use client";

import { AnimatePresence, motion } from "motion/react";
import { bouncy } from "./springs";

export type Toast = {
  id: number;
  message: string;
  undo?: () => void;
};

type Props = {
  toasts: Toast[];
  onUndo: (toast: Toast) => void;
};

export function ToastStack({ toasts, onUndo }: Props) {
  return (
    <div className="toast-stack" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className="toast"
            initial={{ opacity: 0, y: 32, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.9 }}
            transition={bouncy}
            layout
          >
            <span>{toast.message}</span>
            {toast.undo && (
              <button className="toast-undo" onClick={() => onUndo(toast)}>
                Undo
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

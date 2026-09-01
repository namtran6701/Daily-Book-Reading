"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";

// Shared modal shell: scrim, Escape-to-close, backdrop tap, scroll lock.
export function Overlay({
  active = true,
  center,
  label,
  onClose,
  children,
}: {
  active?: boolean;
  center?: boolean;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const scrimRef = useRef<HTMLDivElement>(null);

  const focusable = useCallback(
    () =>
      Array.from(
        scrimRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute("disabled")),
    [],
  );

  // While active, lock scroll, make the app behind the dialog inert (out of the
  // tab order and hidden from assistive tech), and set the initial focus. A task
  // canvas temporarily suspends these behaviors without unmounting the sheet.
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const app = document.querySelector<HTMLElement>('[data-app="second-brain"]');
    if (app) {
      app.dataset.overlayDepth = String(Number(app.dataset.overlayDepth ?? "0") + 1);
      app.setAttribute("inert", "");
    }
    const restoreFocus = document.activeElement as HTMLElement | null;

    // Focus the first control (the close button), never the text field, so
    // opening the sheet doesn't pop the keyboard. The keyboard opens only when
    // the user taps the field themselves.
    (focusable()[0] ?? scrimRef.current)?.focus();

    return () => {
      document.body.style.overflow = previous;
      if (app) {
        const remaining = Number(app.dataset.overlayDepth ?? "1") - 1;
        if (remaining > 0) {
          app.dataset.overlayDepth = String(remaining);
        } else {
          delete app.dataset.overlayDepth;
          app.removeAttribute("inert");
        }
      }
      restoreFocus?.focus?.();
    };
  }, [active, focusable]);

  // Escape to close + Tab focus trap. Re-subscribes when onClose changes without
  // disturbing focus.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose, focusable]);

  return createPortal(
    <motion.div
      ref={scrimRef}
      className={`scrim ${center ? "center" : ""}`}
      hidden={!active}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {children}
    </motion.div>,
    document.body,
  );
}

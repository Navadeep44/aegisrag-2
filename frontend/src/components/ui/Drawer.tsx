import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLenisContext } from "../motion/LenisProvider";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  children,
  footer,
  widthClass = "max-w-xl",
}: DrawerProps) {
  const { pauseLenis, resumeLenis } = useLenisContext();

  useEffect(() => {
    if (isOpen) {
      pauseLenis();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        resumeLenis();
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen, onClose, pauseLenis, resumeLenis]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink/40 backdrop-blur-xs"
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={`relative z-10 flex h-full w-full ${widthClass} flex-col border-l border-line bg-surface shadow-2xl`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-line px-6 py-5">
              <div className="min-w-0 flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <h2 id="drawer-title" className="display text-2xl font-semibold text-ink truncate">
                    {title}
                  </h2>
                  {badge}
                </div>
                {subtitle && <p className="text-xs text-muted mt-0.5 leading-relaxed">{subtitle}</p>}
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="rounded-lg p-1.5 text-muted hover:bg-surface-hover hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {children}
            </div>

            {/* Optional Footer */}
            {footer && (
              <div className="border-t border-line bg-surface-subtle/50 px-6 py-4 flex items-center justify-end gap-3">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

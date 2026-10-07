import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "./Button";
import { useLenisContext } from "../motion/LenisProvider";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "warn" | "primary";
  busy?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  tone = "danger",
  busy = false,
}: ConfirmDialogProps) {
  const { pauseLenis, resumeLenis } = useLenisContext();

  useEffect(() => {
    if (isOpen) {
      pauseLenis();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !busy) onClose();
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        resumeLenis();
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen, onClose, busy, pauseLenis, resumeLenis]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !busy && onClose()}
            className="fixed inset-0 bg-ink/40 backdrop-blur-xs"
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-2xl space-y-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            aria-describedby="dialog-desc"
          >
            <div className="flex items-start gap-3.5">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  tone === "danger"
                    ? "bg-deny-bg text-deny"
                    : tone === "warn"
                    ? "bg-warn-bg text-warn"
                    : "bg-surface-subtle text-ink"
                }`}
              >
                {tone === "danger" ? (
                  <Trash2 className="h-5 w-5" />
                ) : (
                  <AlertTriangle className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="dialog-title" className="display text-xl font-semibold text-ink">
                  {title}
                </h3>
                <p id="dialog-desc" className="mt-1 text-xs sm:text-sm text-muted leading-relaxed">
                  {description}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <Button
                type="button"
                kind="secondary"
                onClick={onClose}
                disabled={busy}
              >
                {cancelText}
              </Button>
              <Button
                type="button"
                kind={tone === "danger" ? "danger" : "primary"}
                onClick={onConfirm}
                disabled={busy}
              >
                {busy ? "Processing..." : confirmText}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

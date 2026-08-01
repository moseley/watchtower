"use client";

import { useEffect } from "react";
import { X } from "./icons";

/**
 * The builder surface. On desktop it is a right-hand panel that the grid
 * narrows to make room for; below `lg` it becomes a full-height bottom sheet
 * over a backdrop, which is where the spec's mobile builder lives.
 */
export function SlideOver({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop only below lg — on desktop the grid simply narrows. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-ink/20 lg:hidden"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-[92vh] flex-col rounded-t-[18px] border-t border-hairline bg-surface p-6 shadow-slideover lg:static lg:z-auto lg:max-h-none lg:w-[372px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[20px] font-bold tracking-[-.02em] text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-[8px] p-1.5 text-muted transition-colors hover:bg-sidebar hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

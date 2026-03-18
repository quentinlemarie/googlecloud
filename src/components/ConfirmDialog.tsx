import React, { useEffect, useRef } from 'react';
import { BRAND_RED } from '../lib/constants';

interface ConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = React.memo(function ConfirmDialog({
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Go back',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Use a ref so the keydown handler always calls the latest onCancel without
  // needing it in the dependency array (avoids unnecessary effect re-runs when
  // the parent renders a new function reference).
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-gray-700 text-sm mb-6 text-center">{message}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-xl text-sm font-medium text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ backgroundColor: BRAND_RED }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
});

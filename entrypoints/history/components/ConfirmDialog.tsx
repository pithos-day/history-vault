import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onCancel);

  return createPortal(
    <div className="modal-backdrop">
      <div
        aria-describedby="confirm-message"
        aria-labelledby="confirm-title"
        aria-modal="true"
        className="modal confirm-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="modal-actions">
          <button className="text-button" onClick={onCancel} type="button">
            キャンセル
          </button>
          <button
            className={`button ${danger ? 'button-danger' : ''}`}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

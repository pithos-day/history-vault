import {
  Copy as CopyIcon,
  ExternalLink as ExternalLinkIcon,
  Trash2 as TrashIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { EntryGroup } from '@/utils/history/types';

interface ContextMenuProps {
  x: number;
  y: number;
  entry: EntryGroup;
  onOpen: (url: string) => void;
  onCopy: (url: string) => void;
  onDelete: (entry: EntryGroup) => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, entry, onOpen, onCopy, onDelete, onClose }: ContextMenuProps) {
  useEffect(() => {
    const close = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 150);

  return createPortal(
    <div className="context-menu" role="menu" style={{ left, top }}>
      <button onClick={() => onOpen(entry.url)} role="menuitem" type="button">
        <ExternalLinkIcon size={15} />
        新しいタブで開く
      </button>
      <button onClick={() => onCopy(entry.url)} role="menuitem" type="button">
        <CopyIcon size={15} />
        URLをコピー
      </button>
      <button className="is-danger" onClick={() => onDelete(entry)} role="menuitem" type="button">
        <TrashIcon size={15} />
        Vaultから削除
      </button>
    </div>,
    document.body,
  );
}

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDialogFocus } from '../entrypoints/history/hooks/useDialogFocus';

function TestDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose);

  return (
    <div ref={dialogRef} tabIndex={-1}>
      <button type="button">first</button>
      <button type="button">last</button>
    </div>
  );
}

describe('useDialogFocus', () => {
  afterEach(() => {
    cleanup();
  });

  it('focuses the first control and closes on Escape', async () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);

    expect(screen.getByRole('button', { name: 'first' })).toBe(document.activeElement);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('wraps focus when tabbing past either end', async () => {
    render(<TestDialog onClose={() => undefined} />);

    const first = screen.getByRole('button', { name: 'first' });
    const last = screen.getByRole('button', { name: 'last' });

    expect(first).toBe(document.activeElement);

    await userEvent.tab();
    expect(last).toBe(document.activeElement);

    await userEvent.tab();
    expect(first).toBe(document.activeElement);

    await userEvent.tab({ shift: true });
    expect(last).toBe(document.activeElement);
  });

  it('restores focus to the opener when unmounted', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();

    const { unmount } = render(<TestDialog onClose={() => undefined} />);
    unmount();

    expect(opener).toBe(document.activeElement);
    opener.remove();
  });
});

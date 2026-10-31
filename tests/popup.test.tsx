import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import App from '../entrypoints/popup/App';
import { db } from '../utils/db';
import { pageRecord } from './factories';

describe('popup', () => {
  beforeEach(async () => {
    await Promise.all([db.pages.clear(), db.visits.clear(), db.activity.clear(), db.meta.clear()]);
    await fakeBrowser.storage.local.clear();
    Object.assign(fakeBrowser.runtime, {
      getManifest: () => ({ name: 'History Vault', version: '0.1.0' }),
    });
    window.close = vi.fn();
  });

  it('shows recent history and opens the search view', async () => {
    const now = Date.now();
    await db.pages.put(pageRecord('https://example.com/', now, { title: 'Example Domain' }));

    render(<App />);

    expect(await screen.findByText('Example Domain')).toBeTruthy();
    expect(screen.getByText(/1ページ/)).toBeTruthy();

    const createTab = vi.spyOn(fakeBrowser.tabs, 'create');
    await userEvent.click(screen.getByRole('button', { name: /履歴を検索/ }));

    expect(createTab).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('focus=search') }),
    );
    expect(window.close).toHaveBeenCalled();
  });

  it('shows an empty state when the vault has no pages', async () => {
    render(<App />);

    expect(
      await screen.findByText('まだ履歴がありません。閲覧すると自動で保存されます。'),
    ).toBeTruthy();
  });
});

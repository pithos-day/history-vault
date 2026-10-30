import { browser } from 'wxt/browser';
import { bumpVaultRevision } from '../vault-events';
import { ingestHistoryItem } from './collect';
import { setMeta } from './query';

export async function reconcileRecent(days = 2): Promise<number> {
  const end = Date.now();
  const start = end - days * 86_400_000;

  const items = await browser.history.search({
    text: '',
    startTime: start,
    endTime: end,
    maxResults: 5000,
  });

  let inserted = 0;

  for (let index = 0; index < items.length; index += 8) {
    const chunk = items.slice(index, index + 8);
    const results = await Promise.all(
      chunk.map((item) => ingestHistoryItem(item, { source: 'import', notify: false })),
    );
    inserted += results.reduce((total, result) => total + result.insertedVisits, 0);
  }

  await setMeta('lastReconcileAt', end);
  if (inserted > 0) await bumpVaultRevision();
  return inserted;
}

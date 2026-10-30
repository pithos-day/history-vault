import Dexie, { type EntityTable } from 'dexie';
import type { MetaRecord, PageRecord, VisitRecord } from './history/types';

export class HistoryVaultDatabase extends Dexie {
  pages!: EntityTable<PageRecord, 'url'>;
  visits!: EntityTable<VisitRecord, 'id'>;
  meta!: EntityTable<MetaRecord, 'key'>;

  constructor(name = 'history-vault') {
    super(name);
    this.version(1).stores({
      pages: 'url, host, lastVisitTime, titleLower, urlLower',
      visits: 'id, url, host, visitedAt, [url+visitedAt]',
      meta: 'key',
    });
  }
}

export const db = new HistoryVaultDatabase();

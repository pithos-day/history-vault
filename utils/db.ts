import Dexie, { type EntityTable } from 'dexie';
import { addVisitToDayActivity, toDayActivityRecords } from './history/day-activity';
import type { DayActivityRecord, MetaRecord, PageRecord, VisitRecord } from './history/types';

class HistoryVaultDatabase extends Dexie {
  pages!: EntityTable<PageRecord, 'url'>;
  visits!: EntityTable<VisitRecord, 'id'>;
  activity!: EntityTable<DayActivityRecord, 'date'>;
  meta!: EntityTable<MetaRecord, 'key'>;

  constructor(name = 'history-vault') {
    super(name);
    this.version(1).stores({
      pages: 'url, host, lastVisitTime, titleLower, urlLower',
      visits: 'id, url, host, visitedAt, [url+visitedAt]',
      meta: 'key',
    });

    this.version(2)
      .stores({
        pages: 'url, host, lastVisitTime, titleLower, urlLower',
        visits: 'id, url, host, visitedAt, [url+visitedAt]',
        activity: 'date',
        meta: 'key',
      })
      .upgrade(async (transaction) => {
        const days = new Map<string, { views: number; urls: Set<string> }>();
        await transaction.table('visits').each((visit: VisitRecord) => {
          addVisitToDayActivity(days, visit);
        });
        await transaction.table('activity').bulkPut(toDayActivityRecords(days));
      });
  }
}

export const db = new HistoryVaultDatabase();

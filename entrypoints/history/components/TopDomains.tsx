import { formatCount } from '@/utils/date';
import type { DomainCount } from '@/utils/history/types';
import { getHostUrl } from '@/utils/url';
import { Favicon } from './Favicon';

interface TopDomainsProps {
  domains: DomainCount[];
  total: number;
}

export function TopDomains({ domains, total }: TopDomainsProps) {
  if (domains.length === 0) {
    return <div className="chart-empty">データがありません。</div>;
  }

  const max = Math.max(1, domains[0]?.count ?? 1);

  return (
    <div className="top-domains">
      <p className="section-caption">全{formatCount(total)}ドメイン</p>
      <ul>
        {domains.map((domain) => (
          <li key={domain.host}>
            <span className="domain-bar" style={{ width: `${(domain.count / max) * 100}%` }} />
            <Favicon host={domain.host} size={14} url={getHostUrl(domain.host)} />
            <span className="domain-name" title={domain.host}>
              {domain.host}
            </span>
            <span className="domain-count">{formatCount(domain.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

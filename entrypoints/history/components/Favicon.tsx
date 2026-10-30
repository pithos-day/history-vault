import { useState } from 'react';
import { getFaviconUrl, getHostInitial } from '@/utils/url';

interface FaviconProps {
  url: string;
  host: string;
  size?: number;
  className?: string;
}

export function Favicon({ url, host, size = 16, className }: FaviconProps) {
  const [failed, setFailed] = useState(false);
  const src = getFaviconUrl(url, size * 2);

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className={`favicon favicon-fallback ${className ?? ''}`}
        style={{ height: size, width: size, fontSize: Math.max(8, size * 0.52) }}
      >
        {getHostInitial(host)}
      </span>
    );
  }

  return (
    <img
      alt=""
      className={`favicon ${className ?? ''}`}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      src={src}
      width={size}
    />
  );
}

import { useVirtualizer } from '@tanstack/react-virtual';
import { type ReactNode, useRef } from 'react';

interface VirtualListProps<T> {
  items: T[];
  estimateSize: number | ((index: number) => number);
  renderItem: (item: T, index: number) => ReactNode;
  getKey?: (item: T, index: number) => string | number;
  className?: string;
  empty?: ReactNode;
}

export function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  getKey,
  className,
  empty,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is the supported list virtualizer here.
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: typeof estimateSize === 'number' ? () => estimateSize : estimateSize,
    overscan: 10,
  });

  if (items.length === 0) {
    return <div className={`empty-list ${className ?? ''}`}>{empty}</div>;
  }

  return (
    <div className={`virtual-list ${className ?? ''}`} ref={parentRef}>
      <div className="virtual-list-inner" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          if (item === undefined) return null;

          return (
            <div
              className="virtual-list-item"
              data-index={virtualItem.index}
              key={getKey ? getKey(item, virtualItem.index) : virtualItem.key}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

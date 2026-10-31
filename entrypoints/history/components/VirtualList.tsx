import { useVirtualizer } from '@tanstack/react-virtual';
import { type ReactNode, useEffect, useRef } from 'react';

interface VirtualListProps<T> {
  items: T[];
  estimateSize: number | ((index: number) => number);
  renderItem: (item: T, index: number) => ReactNode;
  getKey?: (item: T, index: number) => string | number;
  className?: string;
  empty?: ReactNode;
  scrollToIndex?: number;
  scrollRequest?: number;
  onEndReached?: () => void;
}

export function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  getKey,
  className,
  empty,
  scrollToIndex = -1,
  scrollRequest = 0,
  onEndReached,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const onEndReachedRef = useRef(onEndReached);
  const endReachedRef = useRef(false);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is the supported list virtualizer here.
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: typeof estimateSize === 'number' ? () => estimateSize : estimateSize,
    overscan: 10,
  });

  useEffect(() => {
    onEndReachedRef.current = onEndReached;
  }, [onEndReached]);

  useEffect(() => {
    const element = parentRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => virtualizer.measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [virtualizer]);

  useEffect(() => {
    endReachedRef.current = false;
    if (!onEndReachedRef.current || items.length === 0) return;
    const element = parentRef.current;
    if (!element || endReachedRef.current) return;

    // Fill the viewport on first paint, then let scrolling request more.
    if (element.scrollHeight <= element.clientHeight + 40) {
      endReachedRef.current = true;
      onEndReachedRef.current();
    }
  }, [items.length]);

  useEffect(() => {
    if (scrollToIndex < 0) return;
    void scrollRequest;
    virtualizer.scrollToIndex(scrollToIndex, { align: 'start' });
  }, [scrollRequest, scrollToIndex, virtualizer]);

  if (items.length === 0) {
    return <div className={`empty-list ${className ?? ''}`}>{empty}</div>;
  }

  const handleScroll = () => {
    const element = parentRef.current;
    if (!element || !onEndReachedRef.current || endReachedRef.current) return;

    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 160) {
      endReachedRef.current = true;
      onEndReachedRef.current();
    }
  };

  return (
    <div className={`virtual-list ${className ?? ''}`} onScroll={handleScroll} ref={parentRef}>
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

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  header: ReactNode;
  children: ReactNode;
  itemCount: number;
}

export function MediaShelf({ header, children, itemCount }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(maxScroll - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    updateScrollState();

    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollState, itemCount]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const distance = Math.max(el.clientWidth * 0.82, 240);
    el.scrollBy({ left: direction * distance, behavior: 'smooth' });
  };

  const hasOverflow = canScrollLeft || canScrollRight;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">{header}</div>
        {hasOverflow && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              aria-label="Scroll left"
              disabled={!canScrollLeft}
              onClick={() => scrollByPage(-1)}
              className="w-7 h-7 rounded-full bg-surface border border-tone/10 flex items-center justify-center text-ink-secondary hover:text-ink hover:border-tone/25 hover:bg-elevated disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Scroll right"
              disabled={!canScrollRight}
              onClick={() => scrollByPage(1)}
              className="w-7 h-7 rounded-full bg-surface border border-tone/10 flex items-center justify-center text-ink-secondary hover:text-ink hover:border-tone/25 hover:bg-elevated disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="relative group/shelf">
        <div
          ref={trackRef}
          onScroll={updateScrollState}
          className="flex gap-4 sm:gap-5 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-proximity py-1.5 -my-1.5"
        >
          {children}
        </div>

        {/* Edge fade cues indicating additional off-screen items */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-canvas to-transparent transition-opacity duration-200 ${
            canScrollLeft ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-canvas to-transparent transition-opacity duration-200 ${
            canScrollRight ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>
    </section>
  );
}

export const SHELF_CARD_CLASS = 'w-[156px] sm:w-[176px] md:w-[192px] lg:w-[200px] shrink-0 snap-start';

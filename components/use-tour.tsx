'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Markdown } from './markdown';

// ---- Tunables ------------------------------------------------------------------------------------------
/** The window never grows beyond this fraction of the viewport (resizing and the default size are clamped). */
const MAX_WIDTH_FRACTION = 0.5;
const MAX_HEIGHT_FRACTION = 0.5;
/** Smallest the window can be resized to (unless the viewport is so small that the maximum is lower). */
const MIN_WIDTH = 260;
const MIN_HEIGHT = 160;
/** Size the window opens at, before the user resizes it. */
const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 300;
/** Gap between the window and the viewport edge when it first opens (bottom-right). */
const EDGE_MARGIN = 16;
/** Space kept between the highlighted region and the dimmed surround. */
const HIGHLIGHT_PADDING = 6;
// -------------------------------------------------------------------------------------------------------

/** A rectangle in viewport (client) pixels: `[min, max]` along each axis, like `getBoundingClientRect()`. */
export interface TourRegion {
  x: [number, number];
  y: [number, number];
}

export interface TourSlide {
  /** Markdown (inline formatting only). */
  title: string;
  /** Markdown. */
  content: string;
  /**
   * Returns the area to highlight, in viewport pixels, or `null` for no highlight. Called every animation
   * frame while the slide is shown, so it may read refs, element rects or chart coordinates directly and the
   * highlight follows scrolling, resizing and animation.
   */
  region?: () => TourRegion | null | undefined;
  /**
   * Runs whenever the tour arrives at this slide (start, next, back, jump) to put the simulation in the state
   * the slide talks about. It is not run when the window is merely closed and reopened. Going back runs it
   * again, so make it set absolute values rather than apply deltas.
   */
  effect?: () => void;
}

export interface Tour {
  /** Whether the window is showing. Closing keeps `index`. */
  isOpen: boolean;
  /** Current slide, 0-based. */
  index: number;
  count: number;
  /** Slide titles as plain text (markup stripped), e.g. for a slide picker. */
  titles: string[];
  slide: TourSlide | undefined;
  isFirst: boolean;
  isLast: boolean;
  /** Begin from the first slide (runs its effect) and show the window. */
  start: () => void;
  /** Show the window at the slide it was left on; behaves like `start` if the tour never began. */
  open: () => void;
  /** Hide the window and keep the position. */
  close: () => void;
  /** Next slide; on the last slide closes the window instead. */
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
}

/** Title markup removed, for places that cannot render it (`<option>`). */
function plainText(markdown: string) {
  return markdown.replace(/[*`$]/g, '').replace(/\\([a-zA-Z]+)/g, '$1');
}

/** Bounding box of an element, for a slide's `region`. */
export function regionOf(el: Element | null | undefined): TourRegion | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: [r.left, r.right], y: [r.top, r.bottom] };
}

interface State {
  index: number;
  isOpen: boolean;
  started: boolean;
}

/**
 * Slide-by-slide walkthrough state. The hook only holds the position and exposes controls; it never decides
 * when to show itself (call `start()`/`open()` from your own effect or button) and renders nothing.
 * Render `<TourView tour={tour} />` once in the page to draw the window and highlight.
 */
export function useTour(slides: TourSlide[]): Tour {
  const [state, setState] = useState<State>({
    index: 0,
    isOpen: false,
    started: false,
  });
  // Mirrors of the latest values for the callbacks below, so they stay stable and never read stale state.
  const stateRef = useRef(state);
  const slidesRef = useRef(slides);
  useEffect(() => {
    slidesRef.current = slides;
  });

  const update = useCallback((next: State) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const goTo = useCallback(
    (target: number) => {
      const count = slidesRef.current.length;
      if (count === 0) return;
      const index = Math.min(Math.max(target, 0), count - 1);
      update({ index, isOpen: true, started: true });
      slidesRef.current[index].effect?.();
    },
    [update]
  );

  const start = useCallback(() => goTo(0), [goTo]);
  const open = useCallback(() => {
    const s = stateRef.current;
    if (!s.started) goTo(0);
    else update({ ...s, isOpen: true });
  }, [goTo, update]);
  const close = useCallback(
    () => update({ ...stateRef.current, isOpen: false }),
    [update]
  );
  const next = useCallback(() => {
    const { index } = stateRef.current;
    if (index >= slidesRef.current.length - 1) close();
    else goTo(index + 1);
  }, [goTo, close]);
  const prev = useCallback(() => goTo(stateRef.current.index - 1), [goTo]);

  const count = slides.length;
  const titles = slides.map((s) => plainText(s.title));
  const index = Math.min(state.index, Math.max(count - 1, 0));
  return useMemo(
    () => ({
      isOpen: state.isOpen && count > 0,
      index,
      count,
      titles,
      slide: slides[index],
      isFirst: index === 0,
      isLast: index === count - 1,
      start,
      open,
      close,
      next,
      prev,
      goTo,
    }),
    [
      state.isOpen,
      index,
      count,
      titles,
      slides,
      start,
      open,
      close,
      next,
      prev,
      goTo,
    ]
  );
}

// ---- View ----------------------------------------------------------------------------------------------

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Effective window rectangle for a viewport: the saved size/position, kept inside the limits. */
function layout(
  pos: { x: number; y: number } | null,
  size: { w: number; h: number } | null,
  vw: number,
  vh: number
): Box {
  const maxW = vw * MAX_WIDTH_FRACTION;
  const maxH = vh * MAX_HEIGHT_FRACTION;
  const w = clamp(size?.w ?? DEFAULT_WIDTH, Math.min(MIN_WIDTH, maxW), maxW);
  const h = clamp(size?.h ?? DEFAULT_HEIGHT, Math.min(MIN_HEIGHT, maxH), maxH);
  const x = clamp(pos?.x ?? vw - w - EDGE_MARGIN, 0, vw - w);
  const y = clamp(pos?.y ?? vh - h - EDGE_MARGIN, 0, vh - h);
  return { x, y, w, h };
}

/** Same sliding-fill button as the rest of the site; add the colours (`bg-…`, `before:bg-…`). */
const BUTTON =
  'relative cursor-pointer p-2 px-3 before:absolute before:-inset-1 before:block before:w-0 before:transition-all hover:before:w-[calc(100%+8px)] disabled:cursor-default disabled:opacity-40 disabled:before:hidden';

const overlaps = (b: Box, r: TourRegion) =>
  b.x < Math.max(...r.x) &&
  b.x + b.w > Math.min(...r.x) &&
  b.y < Math.max(...r.y) &&
  b.y + b.h > Math.min(...r.y);

/**
 * The tour window and the highlight over the page. Both are `position: fixed` in a portal, so they work in
 * the full-screen simulation layout and never take part in it. Keep it mounted: closing only hides it, so
 * the window keeps the position and size the user gave it.
 */
export function TourView({ tour }: { tour: Tour }) {
  const { isOpen, slide, close, next, prev } = tour;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [region, setRegion] = useState<TourRegion | null>(null);
  // Re-render on viewport resize so the clamping above follows it.
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const regionFn = useRef(slide?.region);
  useEffect(() => {
    regionFn.current = slide?.region;
  });

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('resize', bump);
    return () => window.removeEventListener('resize', bump);
  }, [isOpen]);

  // Poll the region each frame; only touch state when it actually moved.
  useEffect(() => {
    if (!isOpen) return;
    let frame = 0;
    const tick = () => {
      const r = regionFn.current?.();
      const ok =
        r &&
        [...r.x, ...r.y].every(Number.isFinite) &&
        r.x[0] !== r.x[1] &&
        r.y[0] !== r.y[1];
      setRegion((prev) =>
        !ok
          ? null
          : prev &&
              prev.x[0] === r.x[0] &&
              prev.x[1] === r.x[1] &&
              prev.y[0] === r.y[0] &&
              prev.y[1] === r.y[1]
            ? prev
            : { x: [r.x[0], r.x[1]], y: [r.y[0], r.y[1]] }
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close();
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // Arrow keys belong to sliders, text fields and the like.
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]'))
        return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, close, next, prev]);

  // Drag (title bar) and resize (corner grip) share one pointer gesture.
  const gesture = useRef<{
    kind: 'move' | 'resize';
    px: number;
    py: number;
    box: Box;
  } | null>(null);

  if (!isOpen || !slide) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let box = layout(pos, size, vw, vh);
  // Until the user drags it, keep the window off the highlight: swap to the left edge if it would cover it.
  if (!pos && region && overlaps(box, region))
    box = { ...box, x: Math.min(EDGE_MARGIN, vw - box.w) };

  const grab = (kind: 'move' | 'resize') => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      gesture.current = { kind, px: e.clientX, py: e.clientY, box };
      e.preventDefault();
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g) return;
      const dx = e.clientX - g.px;
      const dy = e.clientY - g.py;
      if (g.kind === 'move') setPos({ x: g.box.x + dx, y: g.box.y + dy });
      else {
        // Pin the top-left corner; stop at the viewport edge as well as the size limits.
        const next = layout(
          { x: g.box.x, y: g.box.y },
          { w: g.box.w + dx, h: g.box.h + dy },
          vw,
          vh
        );
        const room = {
          w: Math.min(next.w, vw - g.box.x),
          h: Math.min(next.h, vh - g.box.y),
        };
        setPos({ x: g.box.x, y: g.box.y });
        setSize(room);
      }
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      gesture.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
  });

  const pad = HIGHLIGHT_PADDING;
  return createPortal(
    <>
      {region && (
        <div
          aria-hidden
          className="outline-primary-400 pointer-events-none fixed z-40 shadow-[0_0_0_9999px_rgba(15,23,42,0.55)] outline-2 transition-[left,top,width,height] duration-150"
          style={{
            left: Math.min(...region.x) - pad,
            top: Math.min(...region.y) - pad,
            width: Math.abs(region.x[1] - region.x[0]) + 2 * pad,
            height: Math.abs(region.y[1] - region.y[0]) + 2 * pad,
          }}
        />
      )}
      <div
        role="dialog"
        aria-label="Guided tour"
        className="fixed z-50 flex flex-col overflow-hidden bg-slate-100 text-slate-900 shadow-xl"
        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      >
        <div
          {...grab('move')}
          className="bg-primary-500 flex cursor-move touch-none items-center gap-2 px-4 py-3 text-white select-none"
        >
          <h2 className="flex-1 truncate text-lg">
            <Markdown source={slide.title} inline />
          </h2>
          <button
            type="button"
            aria-label="Close tour"
            title="Close (Esc)"
            onClick={close}
            className="before:bg-primary-700 relative -my-1 -mr-2 cursor-pointer px-2 py-1 text-xl leading-none before:absolute before:inset-0 before:block before:w-0 before:transition-all hover:before:w-full"
          >
            <span className="relative">×</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <Markdown source={slide.content} />
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={prev}
            disabled={tour.isFirst}
            className={`${BUTTON} bg-slate-200 before:bg-slate-300`}
          >
            <span className="relative">Back</span>
          </button>
          <select
            aria-label="Jump to slide"
            value={tour.index}
            onChange={(e) => tour.goTo(Number(e.target.value))}
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            {tour.titles.map((title, i) => (
              <option key={i} value={i}>
                {i + 1}. {title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={next}
            className={`${BUTTON} bg-primary-600 before:bg-primary-800 text-white`}
          >
            <span className="relative">{tour.isLast ? 'Finish' : 'Next'}</span>
          </button>
        </div>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={tour.count}
          aria-valuenow={tour.index + 1}
          className="h-1 bg-slate-300"
        >
          <div
            className="bg-primary-600 h-full transition-[width]"
            style={{ width: `${((tour.index + 1) / tour.count) * 100}%` }}
          />
        </div>
        <div
          {...grab('resize')}
          aria-hidden
          title="Drag to resize"
          className="absolute right-0 bottom-0 z-10 size-4 cursor-nwse-resize touch-none"
        >
          <svg viewBox="0 0 16 16" className="size-4 text-slate-400">
            <path
              d="M15 6 6 15M15 11l-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>
        </div>
      </div>
    </>,
    document.body
  );
}

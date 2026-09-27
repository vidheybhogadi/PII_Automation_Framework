import { useEffect, useRef, useState } from 'preact/hooks';
import { isTypingTarget, prefersReducedMotion } from './utils';

/** True once the element has entered (or is near) the viewport. Always true in print mode. */
export function useInView<T extends Element>(eager = false): [preact.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(eager);
  useEffect(() => {
    if (inView || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: '120px 0px' },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [inView]);
  return [ref, inView];
}

/** Animated count-up (respects reduced motion and print). */
export function useCountUp(target: number, run: boolean, durationMs = 900): number {
  const [value, setValue] = useState(run && !prefersReducedMotion() ? 0 : target);
  useEffect(() => {
    if (!run || prefersReducedMotion() || document.documentElement.dataset.print === 'true') {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, durationMs]);
  return value;
}

export interface HotkeyHandlers {
  onPalette: () => void;
  onEscape: () => void;
  onKey: (key: string, e: KeyboardEvent) => void;
}

/**
 * Global shortcuts. Single keys are ignored while typing. Only ⌘/Ctrl+K is intercepted among modifier combos —
 * browser shortcuts (⌘D, ⌘P, ⌘F…) are left alone.
 */
export function useHotkeys(h: HotkeyHandlers): void {
  const handlers = useRef(h);
  handlers.current = h;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const hh = handlers.current;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        hh.onPalette();
        return;
      }
      if (e.key === 'Escape') {
        hh.onEscape();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      hh.onKey(e.key, e);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/**
 * True once the page is scrolled past `threshold` px. Re-renders ONLY when that flips — never on every scroll
 * frame (per-frame re-renders made fast scrolling stutter).
 */
export function useScrolledPast(threshold = 500): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setPast(window.scrollY > threshold));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [threshold]);
  return past;
}

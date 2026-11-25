import { Button, CloseButton, Group, Paper, Text, Title } from '@mantine/core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFocusTrap, useMergedRef } from '@mantine/hooks';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';

export interface TourStep<Tab extends string = string> {
  id: string;
  /** The tab the step is on. */
  tab: Tab;
  /** `data-tour` of the element to highlight; none for a step in the middle of the screen. Steps whose element is missing are skipped. */
  target?: string;
  /** The element stays in place when the page scrolls (header): it is not scrolled to. */
  fixed?: boolean;
  title: string;
  body: string;
}

interface Props<Tab extends string> {
  steps: Array<TourStep<Tab>>;
  onTab: (tab: Tab) => void;
  onClose: () => void;
}

/** Space around the highlighted element, between it and the card, and from the screen edges (px). */
const PAD = 6;
const GAP = 12;
const EDGE = 8;
/** The app's fixed header covers the top of the page. */
const HEADER = 56;
/** How long the highlight and the card take to move to the next step (ms). */
const MOVE = 250;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function elementOf(step: TourStep): HTMLElement | null {
  return step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
}

const available = (step: TourStep) => !step.target || elementOf(step) !== null;

/** The highlighted area: the element and some space around it, as far as it is on screen. */
function holeOf(step: TourStep): Box | null {
  const r = elementOf(step)?.getBoundingClientRect();
  if (!r || (r.width === 0 && r.height === 0)) return null;
  const left = Math.max(0, r.left - PAD);
  const top = Math.max(0, r.top - PAD);
  const right = Math.min(window.innerWidth, r.right + PAD);
  const bottom = Math.min(window.innerHeight, r.bottom + PAD);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (a !== null && b !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

/** Where the highlight and the card are drawn. */
interface Frame {
  hole: Box;
  card: { left: number; top: number };
}

/** Where the card goes: below the highlight, else above, right, left, or at the bottom of the screen over it. */
function placeCard(hole: Box | null, card: { w: number; h: number }, view: { w: number; h: number }) {
  if (!hole) return { left: (view.w - card.w) / 2, top: Math.max(EDGE, (view.h - card.h) / 2) };
  const centred = clamp(hole.left + hole.width / 2 - card.w / 2, EDGE, view.w - card.w - EDGE);
  if (hole.top + hole.height + GAP + card.h <= view.h - EDGE) return { left: centred, top: hole.top + hole.height + GAP };
  if (hole.top - GAP - card.h >= EDGE) return { left: centred, top: hole.top - GAP - card.h };
  const beside = clamp(hole.top, EDGE, view.h - card.h - EDGE);
  if (hole.left + hole.width + GAP + card.w <= view.w - EDGE) return { left: hole.left + hole.width + GAP, top: beside };
  if (hole.left - GAP - card.w >= EDGE) return { left: hole.left - GAP - card.w, top: beside };
  return { left: centred, top: view.h - card.h - EDGE };
}

/**
 * A guided tour over the app itself: each step highlights an element (switching tabs as needed) and explains it in a
 * card next to it. The rest of the app is dimmed and cannot be used until the tour is closed.
 */
export function Tour<Tab extends string>({ steps, onTab, onClose }: Props<Tab>) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const step = steps[index];
  /** The steps that can be shown, for the progress count (some elements appear only after the tour starts). */
  const [shown, setShown] = useState<Array<TourStep<Tab>>>(() => steps.filter(available));
  const holeRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const drawn = useRef<Frame | null>(null);
  /** Keyboard focus stays in the card. */
  const trapRef = useFocusTrap(true);
  const cardRefs = useMergedRef(cardRef, trapRef);
  const nextRef = useRef<HTMLButtonElement>(null);

  const go = useCallback(
    (direction: 1 | -1) => {
      for (let i = index + direction; i >= 0 && i < steps.length; i += direction) {
        if (available(steps[i])) {
          setIndex(i);
          return;
        }
      }
      if (direction === 1) onClose();
    },
    [index, steps, onClose],
  );

  // Entering a step: show its tab, then scroll its element into view.
  useEffect(() => {
    onTab(step.tab);
    nextRef.current?.focus({ preventScroll: true });
    let frame = requestAnimationFrame(() => {
      // A frame later, once the tab is shown.
      frame = requestAnimationFrame(() => {
        setShown(steps.filter(available));
        const el = elementOf(step);
        if (!el || step.fixed) return;
        const r = el.getBoundingClientRect();
        const top = HEADER + EDGE;
        if (r.top >= top && r.bottom <= window.innerHeight - EDGE) return;
        const by = r.height < (window.innerHeight - top) * 0.7 ? r.top + r.height / 2 - (top + window.innerHeight) / 2 : r.top - top;
        window.scrollBy({ top: by, behavior: 'smooth' });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [step, steps, onTab]);

  // Move the highlight and the card to the step's element, and keep them on it while the page scrolls, resizes or
  // changes. The move is animated here, not with CSS transitions: those restart whenever the element moves, so during a
  // scroll they trail behind it and arrive well after it stops.
  useLayoutEffect(() => {
    const holeEl = holeRef.current;
    const cardEl = cardRef.current;
    if (!holeEl || !cardEl) return;
    const from = drawn.current;
    const start = performance.now();
    const still = !from || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const draw = () => {
      const view = { w: window.innerWidth, h: window.innerHeight };
      const target = holeOf(step);
      const to: Frame = {
        hole: target ?? { left: view.w / 2, top: view.h / 2, width: 0, height: 0 },
        card: placeCard(target, { w: cardEl.offsetWidth, h: cardEl.offsetHeight }, view),
      };
      const p = still ? 1 : easeInOut(Math.min(1, (performance.now() - start) / MOVE));
      const now: Frame =
        from && p < 1
          ? {
              hole: {
                left: mix(from.hole.left, to.hole.left, p),
                top: mix(from.hole.top, to.hole.top, p),
                width: mix(from.hole.width, to.hole.width, p),
                height: mix(from.hole.height, to.hole.height, p),
              },
              card: { left: mix(from.card.left, to.card.left, p), top: mix(from.card.top, to.card.top, p) },
            }
          : to;
      if (!drawn.current || !sameBox(drawn.current.hole, now.hole)) {
        Object.assign(holeEl.style, {
          left: `${now.hole.left}px`,
          top: `${now.hole.top}px`,
          width: `${now.hole.width}px`,
          height: `${now.hole.height}px`,
        });
      }
      if (!drawn.current || drawn.current.card.left !== now.card.left || drawn.current.card.top !== now.card.top) {
        cardEl.style.left = `${now.card.left}px`;
        cardEl.style.top = `${now.card.top}px`;
      }
      holeEl.classList.toggle('is-empty', !target);
      drawn.current = now;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const position = shown.indexOf(step);
  const last = !steps.slice(index + 1).some(available);
  const first = !steps.slice(0, index).some(available);

  // A portal of React's own: it is in the page at once, so the card can be placed before it is first shown.
  return createPortal(
    <>
      {/* Keeps the app from being used while the tour is open. */}
      <div className="tour-blocker" />
      {/* Placed and moved by the effect above, as is the card. */}
      <div ref={holeRef} className="tour-hole" />
      <Paper
        ref={cardRefs}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        shadow="xl"
        radius="md"
        p="md"
        withBorder
      >
        <Group justify="space-between" wrap="nowrap" mb={4}>
          <Text size="xs" c="dimmed">
            {t('tour.progress', { n: (position >= 0 ? position : index) + 1, total: Math.max(shown.length, position + 1) })}
          </Text>
          <CloseButton size="sm" aria-label={t('tour.close')} onClick={onClose} />
        </Group>
        <Title id="tour-title" order={2} size="h5" mb={6}>
          {step.title}
        </Title>
        <Text size="sm">{step.body}</Text>
        <Group justify="space-between" mt="md">
          <Button variant="default" size="xs" onClick={() => go(-1)} disabled={first}>
            {t('tour.back')}
          </Button>
          <Button ref={nextRef} data-autofocus size="xs" onClick={() => go(1)}>
            {last ? t('tour.done') : t('tour.next')}
          </Button>
        </Group>
      </Paper>
    </>,
    document.body,
  );
}

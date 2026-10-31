import { describe, expect, it } from 'vitest';
import { applyHomography, invert, solveHomography } from '../src/scan/homography';
import { runCase, sampleTemplate } from './sim/scenario';

describe('solveHomography', () => {
  it('recovers a perspective transform and its inverse', () => {
    const truth = [1.2, 0.1, 30, -0.05, 0.9, 12, 0.0004, -0.0002, 1];
    const from = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 280 },
      { x: 0, y: 280 },
      { x: 100, y: 140 },
    ];
    const h = solveHomography(from, from.map((p) => applyHomography(truth, p.x, p.y)));
    const p = applyHomography(h, 50, 70);
    const q = applyHomography(truth, 50, 70);
    expect(p.x).toBeCloseTo(q.x, 6);
    expect(p.y).toBeCloseTo(q.y, 6);
    const back = applyHomography(invert(h), q.x, q.y);
    expect(back.x).toBeCloseTo(50, 6);
  });
});

describe('scanPage on synthetic photos', () => {
  const template = sampleTemplate({ rows: 30, stripe: '#e8e8e8', headerBackground: '#cccccc' });

  // Light, sparse scribbles may be flagged for review; what must never happen is a wrong reading
  // that is not flagged.
  it.each([11, 12, 13])('reads an easy photo with no silent mistakes and little to review (seed %i)', (seed) => {
    const r = runCase({ template, seed, difficulty: 'easy' });
    expect(r.error).toBeUndefined();
    expect(r.boxes).toBe(120);
    expect(r.silentWrong).toBe(0);
    expect(r.uncertain).toBeLessThanOrEqual(3);
  });

  it.each([21, 22])('never silently misreads a hard photo (seed %i)', (seed) => {
    const r = runCase({ template, seed, difficulty: 'hard' });
    expect(r.error).toBeUndefined();
    expect(r.silentWrong).toBe(0);
  });

  it('reads a page photographed upside down', () => {
    const r = runCase({ template, seed: 31, difficulty: 'easy', photo: { rotation: 180 } });
    expect(r.error).toBeUndefined();
    expect(r.silentWrong).toBe(0);
    expect(r.uncertain).toBeLessThanOrEqual(3);
  });
});

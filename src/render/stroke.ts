import type { Point } from "./types";
import { CELL_ASPECT } from "./types";

/** Straight spoke parent→child; works at any yaw. */
export function strokeContains(
  a: Point,
  b: Point,
  lit: boolean,
  tone: (near: number, relates: boolean, lit: boolean) => number,
  plot: (col: number, row: number, z: number, ch: string, color: number) => void,
): void {
  const tip: Point = {
    ...b,
    col: a.col + (b.col - a.col) * 0.88,
    row: a.row + (b.row - a.row) * 0.88,
    depth: a.depth + (b.depth - a.depth) * 0.88,
    near: a.near + (b.near - a.near) * 0.88,
  };
  walk(a, tip, lit, false, tone, plot, 1, Math.max(a.radius + 0.5, 2), Math.max(b.radius + 0.5, 1.5));
}

/** Soft relate dots — only when lit (hover). */
export function strokeRelates(
  a: Point,
  b: Point,
  lit: boolean,
  tone: (near: number, relates: boolean, lit: boolean) => number,
  plot: (col: number, row: number, z: number, ch: string, color: number) => void,
): void {
  if (!lit) return;
  walk(a, b, true, true, tone, plot, 3, Math.max(a.radius, 2), Math.max(b.radius, 2));
}

function walk(
  a: Point,
  b: Point,
  lit: boolean,
  relates: boolean,
  tone: (near: number, relates: boolean, lit: boolean) => number,
  plot: (col: number, row: number, z: number, ch: string, color: number) => void,
  stride: number,
  clearA: number,
  clearB: number,
): void {
  const dx = b.col - a.col;
  const dy = b.row - a.row;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
  const glyph = relates ? "·" : edgeGlyph(dx, dy);
  const color = tone((a.near + b.near) / 2, relates, lit);
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy * CELL_ASPECT)));
  let plotted = 0;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const c = a.col + dx * t;
    const r = a.row + dy * t;
    if (tooClose(c, r, a, clearA) || tooClose(c, r, b, clearB)) continue;
    if (plotted++ % stride !== 0) continue;
    plot(c, r, a.depth + (b.depth - a.depth) * t, glyph, color);
  }
}

function edgeGlyph(dx: number, dy: number): string {
  const deg = (Math.atan2(Math.abs(dy) * CELL_ASPECT, Math.abs(dx)) * 180) / Math.PI;
  if (deg < 28) return "-";
  if (deg > 62) return "|";
  return dx * dy < 0 ? "/" : "\\";
}

function tooClose(col: number, row: number, point: Point, pad: number): boolean {
  return Math.hypot(col - point.col, (row - point.row) * CELL_ASPECT) < pad;
}

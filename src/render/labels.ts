import type { Point } from "./types";
import { EDGE_CHARS } from "./types";

export function placeLabel(
  point: Point,
  chars: string[],
  colors: number[],
  cols: number,
  rows: number,
  reserved: { c0: number; c1: number; r0: number; r1: number }[],
  color: number,
  must: boolean,
  write: (col: number, row: number, ch: string, color: number) => void,
): { col: number; row: number } | null {
  const text = point.node.label;
  const pad = 1;
  const clear = Math.ceil(point.radius) + 1;
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const anchors = [
    { col: Math.round(point.col) + clear, row: Math.round(point.row) },
    { col: Math.round(point.col) - clear - text.length, row: Math.round(point.row) },
    { col: Math.round(point.col) - Math.floor(text.length / 2), row: Math.round(point.row) + clear },
    { col: Math.round(point.col) - Math.floor(text.length / 2), row: Math.round(point.row) - clear },
  ].sort((a, b) => {
    // Prefer labels that sit outward from the constellation centre.
    const da = Math.hypot(a.col + text.length / 2 - cx, a.row - cy);
    const db = Math.hypot(b.col + text.length / 2 - cx, b.row - cy);
    return db - da;
  });

  for (const anchor of anchors) {
    const box = {
      c0: anchor.col - pad,
      c1: anchor.col + text.length - 1 + pad,
      r0: anchor.row - pad,
      r1: anchor.row + pad,
    };
    if (anchor.row < 0 || anchor.row >= rows) continue;
    if (anchor.col < 0 || anchor.col + text.length > cols) continue;
    if (reserved.some((r) => overlap(box, r))) continue;
    if (!must && !labelClear(chars, cols, rows, anchor.col, anchor.row, text, pad)) continue;
    reserved.push(box);
    clearPad(chars, colors, cols, rows, anchor.col, anchor.row, text, pad);
    for (let i = 0; i < text.length; i++) write(anchor.col + i, anchor.row, text[i], color);
    return anchor;
  }
  if (!must) return null;
  const fallback = anchors.find((a) => a.row >= 0 && a.row < rows) ?? anchors[0];
  clearPad(chars, colors, cols, rows, fallback.col, fallback.row, text, pad);
  for (let i = 0; i < text.length; i++) write(fallback.col + i, fallback.row, text[i], color);
  return fallback;
}

function clearPad(
  chars: string[],
  colors: number[],
  cols: number,
  rows: number,
  col: number,
  row: number,
  text: string,
  pad: number,
): void {
  for (let r = row - pad; r <= row + pad; r++) {
    for (let c = col - pad; c <= col + text.length - 1 + pad; c++) {
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      if (r === row && c >= col && c < col + text.length) continue;
      const i = r * cols + c;
      if (EDGE_CHARS.has(chars[i])) {
        chars[i] = " ";
        colors[i] = -1;
      }
    }
  }
}

function labelClear(
  chars: string[],
  cols: number,
  rows: number,
  col: number,
  row: number,
  text: string,
  pad: number,
): boolean {
  for (let r = row - pad; r <= row + pad; r++) {
    for (let c = col - pad; c <= col + text.length - 1 + pad; c++) {
      if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
      const ch = chars[r * cols + c];
      if (ch === " " || EDGE_CHARS.has(ch)) continue;
      return false;
    }
  }
  return true;
}

function overlap(
  a: { c0: number; c1: number; r0: number; r1: number },
  b: { c0: number; c1: number; r0: number; r1: number },
): boolean {
  return !(a.c1 < b.c0 || a.c0 > b.c1 || a.r1 < b.r0 || a.r0 > b.r1);
}

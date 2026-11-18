import type { Point } from "./types";

export function drawNode(
  point: Point,
  color: number,
  isRoot: boolean,
  write: (col: number, row: number, ch: string, color: number) => void,
): { c0: number; c1: number; r0: number; r1: number } {
  const label = point.node.label.slice(0, isRoot ? 16 : 14);
  const text =
    point.node.kind === "file"
      ? point.node.status === "pending"
        ? `(${truncate(label, 10)})`
        : `o`
      : isRoot
        ? `#[${label}]`
        : `[${label}]`;

  const left = Math.round(point.col) - Math.floor(text.length / 2);
  const row = Math.round(point.row);
  for (let i = 0; i < text.length; i++) write(left + i, row, text[i], color);
  return { c0: left, c1: left + text.length - 1, r0: row, r1: row };
}

export function nodeHalfWidth(point: Point, isRoot = false): number {
  if (point.node.kind === "file") return 1;
  const label = point.node.label.slice(0, isRoot ? 16 : 14);
  const len = isRoot ? label.length + 3 : label.length + 2;
  return Math.ceil(len / 2);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

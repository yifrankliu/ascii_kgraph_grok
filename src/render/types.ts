import type { RenderNode } from "./renderer";

export interface Point {
  id: string;
  col: number;
  row: number;
  depth: number;
  near: number;
  node: RenderNode;
  radius: number;
}

export const CELL_ASPECT = 2;
export const EDGE_CHARS = new Set(["-", "|", "/", "\\", ".", "·", "=", "+", ":"]);

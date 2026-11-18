interface CellGrid {
  cols: number;
  rows: number;
  aspect: number;
  plot(col: number, row: number, ch: string, color: string): void;
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%*+-=?";

interface Column {
  x: number;
  y: number;
  speed: number;
  trail: number;
  depth: number;
  cell: number;
  glyphs: string[];
}

export function createMatrix(): { resize(cols: number, rows: number): void; draw(grid: CellGrid, dt: number): void } {
  let columns: Column[] = [];
  let cols = 1;
  let rows = 1;

  return {
    resize(nextCols, nextRows) {
      if (nextCols === cols && nextRows === rows && columns.length > 0) return;
      cols = nextCols;
      rows = nextRows;
      columns = [];
      let x = Math.floor(Math.random() * 2);
      while (x < nextCols) {
        columns.push(makeColumn(x, nextRows));
        x += 2 + (Math.random() < 0.35 ? 1 : 0);
      }
    },
    draw(grid, dt) {
      for (const column of columns) stepColumn(column, dt, rows);
      for (const column of columns) paintColumn(grid, column);
    },
  };
}

function makeColumn(index: number, rows: number): Column {
  const trail = 7 + Math.floor(Math.random() * 6);
  const speed = pickSpeed();
  return {
    x: index,
    y: Math.random() * rows,
    speed,
    trail,
    depth: Math.min(1, 0.35 + speed / 28),
    cell: -1,
    glyphs: Array.from({ length: trail }, glyph),
  };
}

function pickSpeed(): number {
  const roll = Math.random();
  if (roll < 0.16) return 4 + Math.random() * 3;
  if (roll > 0.88) return 16 + Math.random() * 8;
  return 8 + Math.random() * 6;
}

function stepColumn(column: Column, dt: number, rows: number): void {
  column.y += column.speed * dt;
  const cell = Math.floor(column.y);
  if (column.cell < 0) column.cell = cell;
  while (cell > column.cell) {
    column.glyphs.unshift(glyph());
    if (column.glyphs.length > column.trail) column.glyphs.length = column.trail;
    column.cell += 1;
  }
  if (column.glyphs.length > 2 && Math.random() < dt * 6) {
    const index = 1 + Math.floor(Math.random() * (column.glyphs.length - 1));
    column.glyphs[index] = glyph();
  }
  if (column.y - column.trail <= rows + 2) return;
  column.y = -2 - Math.random() * rows * 0.18;
  column.speed = pickSpeed();
  column.depth = Math.min(1, 0.35 + column.speed / 28);
  column.trail = 7 + Math.floor(Math.random() * 6);
  column.cell = -1;
  column.glyphs = Array.from({ length: column.trail }, glyph);
}

function paintColumn(grid: CellGrid, column: Column): void {
  for (let i = 0; i < column.glyphs.length; i++) {
    const ch = column.glyphs[i];
    if (!ch) continue;
    grid.plot(column.x, column.y - i, ch, rainColor(i, column.trail, column.depth));
  }
}

function rainColor(index: number, trail: number, depth: number): string {
  if (index === 0) return depth > 0.62 ? "m3" : "m2";
  const fade = index / trail;
  if (fade < 0.22) return depth > 0.45 ? "m2" : "m1";
  if (fade < 0.55) return "m1";
  return "m0";
}

function glyph(): string {
  return GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
}

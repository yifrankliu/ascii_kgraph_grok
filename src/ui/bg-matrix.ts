interface CellGrid {
  cols: number;
  rows: number;
  aspect: number;
  plot(col: number, row: number, ch: string, color: string): void;
  roof(col: number): number;
  blocked(col: number, row: number): boolean;
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%*+-=?";
const DROPS = "o.'`,";

interface Column {
  x: number;
  y: number;
  speed: number;
  trail: number;
  depth: number;
  cell: number;
  glyphs: string[];
  soak: number;
  drip: number;
  show: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  ch: string;
  split: boolean;
}

export function createMatrix(): { resize(cols: number, rows: number): void; draw(grid: CellGrid, dt: number): void } {
  let columns: Column[] = [];
  let drops: Drop[] = [];
  let cols = 1;
  let rows = 1;

  return {
    resize(nextCols, nextRows) {
      if (nextCols === cols && nextRows === rows && columns.length > 0) return;
      cols = nextCols;
      rows = nextRows;
      columns = [];
      drops = [];
      let x = Math.floor(Math.random() * 2);
      while (x < nextCols) {
        columns.push(makeColumn(x, nextRows));
        x += 2 + (Math.random() < 0.35 ? 1 : 0);
      }
    },
    draw(grid, dt) {
      for (const column of columns) stepColumn(column, dt, rows, grid, drops);
      const born = drops.length;
      for (let i = 0; i < born; i++) stepDrop(drops[i] as Drop, dt, grid, drops);
      drops = drops.filter((drop) => drop.age < drop.life);
      for (const column of columns) paintColumn(grid, column);
      for (const drop of drops) paintDrop(grid, drop);
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
    soak: 0,
    drip: 0,
    show: 1,
  };
}

function pickSpeed(): number {
  const roll = Math.random();
  if (roll < 0.16) return 4 + Math.random() * 3;
  if (roll > 0.88) return 16 + Math.random() * 8;
  return 8 + Math.random() * 6;
}

function stepColumn(column: Column, dt: number, rows: number, grid: CellGrid, drops: Drop[]): void {
  if (column.soak > 0) {
    const surface = column.y + 0.8;
    if (!grid.blocked(column.x, surface)) {
      column.soak = 0;
      column.show = 1;
    } else {
      drip(column, dt, rows, drops, surface);
      return;
    }
  }
  const next = column.y + column.speed * dt;
  const hit = strike(grid, column.x, column.y, next);
  if (hit >= 0) {
    column.y = hit - 0.8;
    drip(column, dt, rows, drops, hit);
    return;
  }
  column.drip = Math.max(0, column.drip - dt);
  column.y = next;
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
  relaunch(column, rows);
}

function strike(grid: CellGrid, x: number, y: number, next: number): number {
  const roof = grid.roof(x);
  if (roof >= 0 && y < roof && next >= roof) return roof;
  if (grid.blocked(x, next)) return Math.round(next);
  return -1;
}

function drip(column: Column, dt: number, rows: number, drops: Drop[], surface: number): void {
  column.soak += dt;
  column.show = Math.max(0, 1 - column.soak / 0.85);
  if (column.drip <= 0) {
    burst(drops, column.x, surface, column.soak < 0.08);
    column.drip = 0.1 + Math.random() * 0.08;
  } else column.drip -= dt;
  if (column.soak > 0.45 + column.trail / Math.max(6, column.speed)) relaunch(column, rows);
}

function relaunch(column: Column, rows: number): void {
  column.y = -2 - Math.random() * rows * 0.18;
  column.speed = pickSpeed();
  column.depth = Math.min(1, 0.35 + column.speed / 28);
  column.trail = 7 + Math.floor(Math.random() * 6);
  column.cell = -1;
  column.glyphs = Array.from({ length: column.trail }, glyph);
  column.soak = 0;
  column.drip = 0;
  column.show = 1;
}

function stepDrop(drop: Drop, dt: number, grid: CellGrid, drops: Drop[]): void {
  drop.age += dt;
  drop.vy += 16 * dt;
  drop.x += drop.vx * dt;
  drop.y += drop.vy * dt;
  if (drop.age >= drop.life) return;
  if (!grid.blocked(drop.x, drop.y)) return;
  if (!drop.split && drops.length < 170) {
    const roof = grid.roof(drop.x);
    const y = roof >= 0 ? roof - 1.2 : drop.y - 1;
    split(drops, drop.x, y, drop.vx);
  }
  drop.age = drop.life;
}

function burst(drops: Drop[], x: number, y: number, heavy: boolean): void {
  if (drops.length > 150) return;
  const count = heavy ? 5 : 3;
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    drops.push({
      x: x + side * 0.2,
      y: y - 1.15,
      vx: side * (4 + Math.random() * 6),
      vy: -(2 + Math.random() * 3),
      age: 0,
      life: 0.85 + Math.random() * 0.45,
      ch: DROPS.charAt(i % DROPS.length) ?? ".",
      split: false,
    });
  }
}

function split(drops: Drop[], x: number, y: number, vx: number): void {
  const side = vx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(vx);
  for (const dir of [-1, 1]) {
    drops.push({
      x,
      y,
      vx: dir * (5 + Math.random() * 4) + side,
      vy: -(0.4 + Math.random() * 1.2),
      age: 0,
      life: 0.55 + Math.random() * 0.25,
      ch: ".",
      split: true,
    });
  }
}

function paintColumn(grid: CellGrid, column: Column): void {
  const roof = grid.roof(column.x);
  const count = Math.max(0, Math.ceil(column.glyphs.length * column.show));
  for (let i = 0; i < count; i++) {
    const ch = column.glyphs[i];
    if (!ch) continue;
    const row = column.y - i;
    if (roof >= 0 && row >= roof) continue;
    grid.plot(column.x, row, ch, rainColor(i, column.trail, column.depth));
  }
}

function paintDrop(grid: CellGrid, drop: Drop): void {
  const fade = drop.age / drop.life;
  const color = fade < 0.3 ? "m3" : fade < 0.65 ? "m2" : "m1";
  grid.plot(drop.x, drop.y, drop.ch, color);
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

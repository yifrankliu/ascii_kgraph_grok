interface Surface {
  roof(col: number): number;
  blocked(col: number, row: number): boolean;
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%*+-=?";
const DROPS = "o.'`,";
const INK = ["#0c5324", "#14943c", "#3ee066", "#b6ffb6"];

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

interface Stamp {
  x: number;
  y: number;
  ch: string;
  color: number;
}

export function createMatrix(): {
  resize(cols: number, rows: number): void;
  draw(surface: Surface, dt: number): void;
  blit(
    ctx: CanvasRenderingContext2D,
    cellW: number,
    cellH: number,
    font: number,
    dpr: number,
    viewW: number,
    viewH: number,
  ): void;
} {
  let columns: Column[] = [];
  let drops: Drop[] = [];
  let cols = 1;
  let rows = 1;
  const stamps: Stamp[] = [];
  let count = 0;

  const stamp = (x: number, y: number, ch: string, color: number) => {
    const mark = stamps[count] ?? { x: 0, y: 0, ch: "", color: 0 };
    mark.x = x;
    mark.y = y;
    mark.ch = ch;
    mark.color = color;
    stamps[count] = mark;
    count += 1;
  };

  return {
    resize(nextCols, nextRows) {
      if (nextCols === cols && nextRows === rows && columns.length > 0) return;
      cols = nextCols;
      rows = nextRows;
      columns = [];
      drops = [];
      const stride = Math.max(2, Math.ceil(nextCols / 64));
      let x = Math.floor(Math.random() * stride);
      while (x < nextCols) {
        columns.push(makeColumn(x, nextRows));
        x += stride + (Math.random() < 0.3 ? 1 : 0);
      }
    },
    draw(surface, dt) {
      count = 0;
      for (const column of columns) stepColumn(column, dt, rows, surface, drops);
      const born = drops.length;
      for (let i = 0; i < born; i++) stepDrop(drops[i] as Drop, dt, surface, drops);
      if (drops.length > 40) drops.splice(0, drops.length - 40);
      drops = drops.filter((drop) => drop.age < drop.life);
      for (const column of columns) paintColumn(surface, column, stamp);
      for (const drop of drops) paintDrop(drop, stamp);
    },
    blit(ctx, cellW, cellH, font, dpr, viewW, viewH) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);
      ctx.font = `${font}px ui-monospace, Consolas, monospace`;
      ctx.textBaseline = "top";
      for (let color = 0; color < INK.length; color++) {
        ctx.fillStyle = INK[color] ?? "#14943c";
        for (let i = 0; i < count; i++) {
          const mark = stamps[i];
          if (!mark || mark.color !== color) continue;
          ctx.fillText(mark.ch, mark.x * cellW, mark.y * cellH);
        }
      }
    },
  };
}

function makeColumn(index: number, rows: number): Column {
  const trail = 6 + Math.floor(Math.random() * 4);
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

function stepColumn(column: Column, dt: number, rows: number, surface: Surface, drops: Drop[]): void {
  if (column.soak > 0) {
    const hit = column.y + 0.8;
    if (!surface.blocked(column.x, hit)) {
      column.soak = 0;
      column.show = 1;
    } else {
      drip(column, dt, rows, drops, hit);
      return;
    }
  }
  const next = column.y + column.speed * dt;
  const hit = strike(surface, column.x, column.y, next);
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
  if (column.glyphs.length > 2 && Math.random() < dt * 4) {
    const index = 1 + Math.floor(Math.random() * (column.glyphs.length - 1));
    column.glyphs[index] = glyph();
  }
  if (column.y - column.trail <= rows + 2) return;
  relaunch(column, rows);
}

function strike(surface: Surface, x: number, y: number, next: number): number {
  const roof = surface.roof(x);
  if (roof >= 0 && y < roof && next >= roof) return roof;
  if (surface.blocked(x, next)) return Math.round(next);
  return -1;
}

function drip(column: Column, dt: number, rows: number, drops: Drop[], hit: number): void {
  column.soak += dt;
  column.show = Math.max(0, 1 - column.soak / 0.85);
  if (column.drip <= 0) {
    burst(drops, column.x, hit, column.soak < 0.08);
    column.drip = 0.16 + Math.random() * 0.12;
  } else column.drip -= dt;
  if (column.soak > 0.45 + column.trail / Math.max(6, column.speed)) relaunch(column, rows);
}

function relaunch(column: Column, rows: number): void {
  column.y = -2 - Math.random() * rows * 0.18;
  column.speed = pickSpeed();
  column.depth = Math.min(1, 0.35 + column.speed / 28);
  column.trail = 6 + Math.floor(Math.random() * 4);
  column.cell = -1;
  column.glyphs = Array.from({ length: column.trail }, glyph);
  column.soak = 0;
  column.drip = 0;
  column.show = 1;
}

function stepDrop(drop: Drop, dt: number, surface: Surface, drops: Drop[]): void {
  drop.age += dt;
  drop.vy += 16 * dt;
  drop.x += drop.vx * dt;
  drop.y += drop.vy * dt;
  if (drop.age >= drop.life) return;
  if (!surface.blocked(drop.x, drop.y)) return;
  if (!drop.split && drops.length < 40) {
    const roof = surface.roof(drop.x);
    split(drops, drop.x, roof >= 0 ? roof - 1.2 : drop.y - 1, drop.vx);
  }
  drop.age = drop.life;
}

function burst(drops: Drop[], x: number, y: number, heavy: boolean): void {
  if (drops.length > 36) return;
  const count = heavy ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    drops.push({
      x: x + side * 0.2,
      y: y - 1.15,
      vx: side * (4 + Math.random() * 6),
      vy: -(2 + Math.random() * 3),
      age: 0,
      life: 0.7 + Math.random() * 0.35,
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
      life: 0.4 + Math.random() * 0.2,
      ch: ".",
      split: true,
    });
  }
}

function paintColumn(
  surface: Surface,
  column: Column,
  stamp: (x: number, y: number, ch: string, color: number) => void,
): void {
  const roof = surface.roof(column.x);
  const shown = Math.max(0, Math.ceil(column.glyphs.length * column.show));
  for (let i = 0; i < shown; i++) {
    const ch = column.glyphs[i];
    if (!ch) continue;
    const row = column.y - i;
    if (roof >= 0 && row >= roof) continue;
    stamp(column.x, row, ch, rainColor(i, column.trail, column.depth));
  }
}

function paintDrop(drop: Drop, stamp: (x: number, y: number, ch: string, color: number) => void): void {
  const fade = drop.age / drop.life;
  const color = fade < 0.3 ? 3 : fade < 0.65 ? 2 : 1;
  stamp(drop.x, drop.y, drop.ch, color);
}

function rainColor(index: number, trail: number, depth: number): number {
  if (index === 0) return depth > 0.62 ? 3 : 2;
  const fade = index / trail;
  if (fade < 0.22) return depth > 0.45 ? 2 : 1;
  if (fade < 0.55) return 1;
  return 0;
}

function glyph(): string {
  return GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
}

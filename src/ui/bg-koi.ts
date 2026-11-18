interface Bounds {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

interface CellGrid {
  cols: number;
  rows: number;
  aspect: number;
  plot(col: number, row: number, ch: string, color: string): void;
  box(): Bounds | null;
}

const NODES = 14;
const GIRTH = 1.45;
const SCALE = ".:;+=*%#";
const VARIETIES = ["kohaku", "sanke", "showa", "ogon", "chagoi"] as const;
type Variety = (typeof VARIETIES)[number];

interface Wake {
  x: number;
  y: number;
  age: number;
}

interface Ripple {
  x: number;
  y: number;
  age: number;
  life: number;
}

interface Fish {
  x: number;
  y: number;
  heading: number;
  course: number;
  phase: number;
  span: number;
  speed: number;
  variety: Variety;
  seed: number;
  nodes: Float32Array;
  wake: Wake[];
  wakeAcc: number;
}

export function createKoi(): { resize(cols: number, rows: number): void; draw(grid: CellGrid, dt: number): void } {
  let fish: Fish[] = [];
  let ripples: Ripple[] = [];
  let nextRipple = 1.2;
  let cols = 1;
  let rows = 1;
  let clock = 0;

  return {
    resize(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      const count = clamp(Math.round(nextCols / 46), 3, 5);
      if (fish.length === count) return;
      fish = Array.from({ length: count }, (_, index) => spawn(nextCols, nextRows, index));
      ripples = [];
      nextRipple = 1.6;
    },
    draw(grid, dt) {
      clock += dt;
      const aspect = grid.aspect || 1.8;
      const blocked = grid.box();
      for (const swimmer of fish) stepFish(swimmer, dt, cols, rows, aspect, clock, blocked);
      nextRipple -= dt;
      if (nextRipple <= 0 && ripples.length < 2) {
        const bearer = fish[Math.floor(Math.random() * fish.length)];
        ripples.push({
          x: bearer ? bearer.x : cols * 0.5,
          y: bearer ? bearer.y : rows * 0.5,
          age: 0,
          life: 2.8,
        });
        nextRipple = 3.2 + Math.random() * 2.4;
      }
      ripples = ripples.filter((ripple) => ripple.age < ripple.life);
      for (const ripple of ripples) paintRing(grid, ripple, dt);
      const ordered = [...fish].sort((a, b) => a.y - b.y);
      for (const swimmer of ordered) {
        paintWake(grid, swimmer, dt);
        paintFish(grid, swimmer, aspect, dt);
      }
    },
  };
}

function spawn(cols: number, rows: number, index: number): Fish {
  const span = 26 + (index % 3) * 7;
  const lane = index % 4;
  const inset = 4;
  let x = cols * 0.5;
  let y = rows * 0.5;
  let heading = 0;
  if (lane === 0) {
    x = inset;
    y = rows * (0.2 + (index % 3) * 0.25);
    heading = Math.PI / 2;
  } else if (lane === 1) {
    x = cols - inset;
    y = rows * (0.25 + (index % 2) * 0.35);
    heading = -Math.PI / 2;
  } else if (lane === 2) {
    x = cols * (0.15 + (index % 3) * 0.2);
    y = inset;
    heading = 0;
  } else {
    x = cols * (0.2 + (index % 3) * 0.22);
    y = rows - inset;
    heading = Math.PI;
  }
  const swimmer: Fish = {
    x,
    y,
    heading,
    course: heading,
    phase: Math.random() * Math.PI * 2,
    span,
    speed: 4.2 + (index % 3) * 0.7,
    variety: VARIETIES[index % VARIETIES.length] ?? "kohaku",
    seed: index * 1.37 + 0.4,
    nodes: new Float32Array(NODES * 2),
    wake: [],
    wakeAcc: 0,
  };
  laySpine(swimmer, 1.8);
  return swimmer;
}

function stepFish(
  swimmer: Fish,
  dt: number,
  cols: number,
  rows: number,
  aspect: number,
  clock: number,
  blocked: Bounds | null,
): void {
  const margin = 3;
  let want = swimmer.course + Math.sin(clock * 0.35 + swimmer.seed) * 0.45;
  if (swimmer.x < margin) swimmer.course = 0;
  else if (swimmer.x > cols - margin) swimmer.course = Math.PI;
  if (swimmer.y < margin) swimmer.course = Math.PI / 2;
  else if (swimmer.y > rows - margin) swimmer.course = -Math.PI / 2;
  const onEdge = swimmer.x < margin || swimmer.x > cols - margin || swimmer.y < margin || swimmer.y > rows - margin;
  if (onEdge) want = swimmer.course;
  const around = blocked ? avoidHeading(swimmer, blocked, aspect) : null;
  if (around !== null && !onEdge) want = around;
  const turn = (around === null ? 0.9 : 2.8) * dt;
  swimmer.heading += clamp(angleDiff(swimmer.heading, want), -turn, turn);
  swimmer.x += Math.cos(swimmer.heading) * swimmer.speed * dt;
  swimmer.y += (Math.sin(swimmer.heading) * swimmer.speed * dt) / aspect;
  swimmer.x = clamp(swimmer.x, 1, cols - 2);
  swimmer.y = clamp(swimmer.y, 1, rows - 2);
  swimmer.phase += dt * (2 + swimmer.speed / 5);
  follow(swimmer, aspect);
  if (blocked) {
    pushOut(swimmer, blocked, aspect, cols, rows);
    pushOut(swimmer, blocked, aspect, cols, rows);
  }
}

function avoidHeading(swimmer: Fish, box: Bounds, aspect: number): number | null {
  const zone = clearance(swimmer, box, aspect);
  const look = Math.max(8, swimmer.span * 0.45);
  const aheadX = swimmer.x + Math.cos(swimmer.heading) * look;
  const aheadY = swimmer.y + (Math.sin(swimmer.heading) * look) / aspect;
  const headIn = contains(swimmer.x, swimmer.y, zone);
  const aheadIn = contains(aheadX, aheadY, zone);
  if (!headIn && !aheadIn) return null;
  const cx = (zone.c0 + zone.c1) / 2;
  const cy = (zone.r0 + zone.r1) / 2;
  const vx = swimmer.x - cx;
  const vy = (swimmer.y - cy) * aspect;
  if (headIn) return Math.atan2(vy, vx);
  const left = Math.atan2(vx, -vy);
  const right = Math.atan2(-vx, vy);
  return Math.abs(angleDiff(swimmer.heading, left)) < Math.abs(angleDiff(swimmer.heading, right)) ? left : right;
}

function pushOut(swimmer: Fish, box: Bounds, aspect: number, cols: number, rows: number): void {
  const zone = clearance(swimmer, box, aspect);
  let pushX = 0;
  let pushY = 0;
  let depth = -1;
  const consider = (x: number, y: number) => {
    const exit = leave(x, y, zone, aspect, cols, rows);
    if (!exit || exit.depth <= depth) return;
    depth = exit.depth;
    pushX = exit.x;
    pushY = exit.y;
  };
  consider(swimmer.x, swimmer.y);
  for (let i = 0; i < NODES; i++) consider(swimmer.nodes[i * 2], swimmer.nodes[i * 2 + 1]);
  if (depth <= 0) return;
  swimmer.x += pushX;
  swimmer.y += pushY;
  for (let i = 0; i < NODES; i++) {
    swimmer.nodes[i * 2] += pushX;
    swimmer.nodes[i * 2 + 1] += pushY;
  }
  const outward = Math.atan2(pushY * aspect, pushX);
  const left = outward + Math.PI / 2;
  const right = outward - Math.PI / 2;
  swimmer.course = Math.abs(angleDiff(swimmer.heading, left)) < Math.abs(angleDiff(swimmer.heading, right)) ? left : right;
  swimmer.heading += clamp(angleDiff(swimmer.heading, swimmer.course), -0.6, 0.6);
}

function clearance(swimmer: Fish, box: Bounds, aspect: number): Bounds {
  const girth = swimmer.span * 0.12 * GIRTH + 1.5;
  return {
    c0: box.c0 - girth,
    c1: box.c1 + girth,
    r0: box.r0 - girth / aspect,
    r1: box.r1 + girth / aspect,
  };
}

function contains(x: number, y: number, box: Bounds): boolean {
  return x > box.c0 && x < box.c1 && y > box.r0 && y < box.r1;
}

function leave(
  x: number,
  y: number,
  box: Bounds,
  aspect: number,
  cols: number,
  rows: number,
): { x: number; y: number; depth: number } | null {
  if (!contains(x, y, box)) return null;
  const options = [
    { x: box.c0 - x - 0.6, y: 0, depth: x - box.c0, nx: box.c0 - 0.6, ny: y },
    { x: box.c1 - x + 0.6, y: 0, depth: box.c1 - x, nx: box.c1 + 0.6, ny: y },
    { x: 0, y: box.r0 - y - 0.6, depth: (y - box.r0) * aspect, nx: x, ny: box.r0 - 0.6 },
    { x: 0, y: box.r1 - y + 0.6, depth: (box.r1 - y) * aspect, nx: x, ny: box.r1 + 0.6 },
  ];
  const visible = options.filter((option) => option.nx > 2 && option.nx < cols - 2 && option.ny > 2 && option.ny < rows - 2);
  const pool = visible.length > 0 ? visible : options;
  pool.sort((a, b) => a.depth - b.depth);
  return pool[0] ?? null;
}

function laySpine(swimmer: Fish, aspect: number): void {
  const seg = swimmer.span / (NODES - 1);
  for (let i = 0; i < NODES; i++) {
    const angle = swimmer.heading + Math.PI;
    swimmer.nodes[i * 2] = swimmer.x + Math.cos(angle) * seg * i;
    swimmer.nodes[i * 2 + 1] = swimmer.y + (Math.sin(angle) * seg * i) / aspect;
  }
}

function follow(swimmer: Fish, aspect: number): void {
  const nodes = swimmer.nodes;
  const seg = swimmer.span / (NODES - 1);
  nodes[0] = swimmer.x;
  nodes[1] = swimmer.y;
  let prev = swimmer.heading + Math.PI;
  for (let i = 1; i < NODES; i++) {
    let angle = Math.atan2((nodes[i * 2 + 1] - nodes[i * 2 - 1]) * aspect, nodes[i * 2] - nodes[i * 2 - 2]);
    angle = prev + clamp(angleDiff(prev, angle), -0.22, 0.22);
    nodes[i * 2] = nodes[i * 2 - 2] + Math.cos(angle) * seg;
    nodes[i * 2 + 1] = nodes[i * 2 - 1] + (Math.sin(angle) * seg) / aspect;
    prev = angle;
  }
}

function paintFish(grid: CellGrid, swimmer: Fish, aspect: number, dt: number): void {
  const spine = new Float32Array(NODES * 2);
  const arc = new Float32Array(NODES);
  bend(swimmer, aspect, spine, arc);
  const total = arc[NODES - 1] || swimmer.span;
  const pad = swimmer.span * 0.2;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < NODES; i++) {
    minX = Math.min(minX, spine[i * 2]);
    maxX = Math.max(maxX, spine[i * 2]);
    minY = Math.min(minY, spine[i * 2 + 1]);
    maxY = Math.max(maxY, spine[i * 2 + 1]);
  }
  const c0 = Math.floor(minX - pad);
  const c1 = Math.ceil(maxX + pad);
  const r0 = Math.floor(minY - pad / aspect);
  const r1 = Math.ceil(maxY + pad / aspect);
  const finBeat = 0.8 + 0.2 * Math.sin(swimmer.phase * 0.7);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const hit = nearest(col + 0.5, row + 0.5, spine, arc, total, swimmer.span, aspect);
      if (!hit || hit.past > 0) continue;
      const mark = skin(hit.s, hit.a, swimmer, finBeat);
      if (!mark) continue;
      grid.plot(col, row, mark.ch, mark.color);
    }
  }
  paintEyes(grid, swimmer, spine, arc, total, aspect);
  const tail = (NODES - 2) * 2;
  swimmer.wakeAcc += dt;
  if (swimmer.wakeAcc >= 0.14) {
    swimmer.wakeAcc = 0;
    swimmer.wake.push({ x: spine[tail] ?? swimmer.x, y: spine[tail + 1] ?? swimmer.y, age: 0 });
    if (swimmer.wake.length > 16) swimmer.wake.shift();
  }
}

function bend(swimmer: Fish, aspect: number, spine: Float32Array, arc: Float32Array): void {
  const nodes = swimmer.nodes;
  for (let i = 0; i < NODES; i++) {
    const s = i / (NODES - 1);
    const ia = Math.max(0, i - 1);
    const ib = Math.min(NODES - 1, i + 1);
    let tx = nodes[ia * 2] - nodes[ib * 2];
    let ty = (nodes[ia * 2 + 1] - nodes[ib * 2 + 1]) * aspect;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const off = swimmer.span * 0.06 * Math.pow(s, 1.6) * Math.sin(swimmer.phase - s * 4.5);
    spine[i * 2] = nodes[i * 2] - ty * off;
    spine[i * 2 + 1] = nodes[i * 2 + 1] + (tx * off) / aspect;
    if (i === 0) arc[i] = 0;
    else {
      const dx = spine[i * 2] - spine[i * 2 - 2];
      const dy = (spine[i * 2 + 1] - spine[i * 2 - 1]) * aspect;
      arc[i] = arc[i - 1] + Math.hypot(dx, dy);
    }
  }
}

function nearest(
  px: number,
  py: number,
  spine: Float32Array,
  arc: Float32Array,
  total: number,
  length: number,
  aspect: number,
): { s: number; a: number; past: number } | null {
  let best = Infinity;
  let s = 0;
  let a = 0;
  let past = 0;
  const pyI = py * aspect;
  for (let i = 0; i < NODES - 1; i++) {
    const ax = spine[i * 2];
    const ay = spine[i * 2 + 1] * aspect;
    const sx = spine[(i + 1) * 2] - ax;
    const sy = spine[(i + 1) * 2 + 1] * aspect - ay;
    const len2 = sx * sx + sy * sy || 1;
    const raw = ((px - ax) * sx + (pyI - ay) * sy) / len2;
    const sl = Math.sqrt(len2);
    if (i === NODES - 2 && raw > 1) {
      const cross = sx * (pyI - ay) - sy * (px - ax);
      const across = Math.abs(cross) / sl;
      if (across * across < best) {
        best = across * across;
        s = 1;
        past = ((raw - 1) * sl) / length;
        a = (across / length) * (cross >= 0 ? 1 : -1);
      }
      continue;
    }
    const q = clamp(raw, 0, 1);
    const dx = px - ax - sx * q;
    const dy = pyI - ay - sy * q;
    const d2 = dx * dx + dy * dy;
    if (d2 >= best) continue;
    best = d2;
    s = (arc[i] + q * sl) / total;
    const cross = sx * (pyI - ay) - sy * (px - ax);
    a = (Math.sqrt(d2) / length) * (cross >= 0 ? 1 : -1);
    past = 0;
  }
  return { s, a, past };
}

function skin(
  s: number,
  a: number,
  swimmer: Fish,
  finBeat: number,
): { ch: string; color: string } | null {
  const aa = Math.abs(a);
  const w = halfWidth(s) * GIRTH;
  if (s > 0.93 && aa < ((s - 0.93) / 0.07) * 0.06 * GIRTH) return null;
  const pectoral = s > 0.17 && s < 0.34 && aa < w + 0.1 * GIRTH * finBeat * Math.sin(((s - 0.17) / 0.17) * Math.PI);
  const pelvic = s > 0.48 && s < 0.6 && aa < w + 0.05 * GIRTH * Math.sin(((s - 0.48) / 0.12) * Math.PI);
  if (aa > w) {
    if (!pectoral && !pelvic) return null;
    return { ch: pick("-=" , s, a, swimmer.seed), color: "kf" };
  }
  if (s > 0.82) {
    const set = s > 0.9 ? "/\\" : "=";
    return { ch: pick(set, s, a, swimmer.seed), color: "kf" };
  }
  if (w - aa < 0.018) return { ch: pick(".,'`", s, a, swimmer.seed), color: "kedge" };
  return { ch: bodyGlyph(s, a, swimmer), color: bodyColor(s, a, swimmer) };
}

function bodyColor(s: number, a: number, swimmer: Fish): string {
  const patch = blotch(s, a, swimmer.seed) > 0.25;
  if (swimmer.variety === "ogon") return "kg";
  if (swimmer.variety === "chagoi") return "ko";
  if (swimmer.variety === "showa") {
    if (blotch(s, a, swimmer.seed + 4) > 0.55) return "kw";
    return patch ? "kr" : "kk";
  }
  if (swimmer.variety === "sanke" && hash3(Math.round(s * 30), Math.round(a * 60), swimmer.seed) > 0.9 && s > 0.15) {
    return "kk";
  }
  return patch && s < 0.8 ? "kr" : "kw";
}

function bodyGlyph(s: number, a: number, swimmer: Fish): string {
  const color = bodyColor(s, a, swimmer);
  const lum = color === "kk" ? 0.12 : color === "kr" ? 0.4 : color === "ko" ? 0.55 : 0.78;
  const key = hash3(Math.round(s * 40), Math.round(a * 80), swimmer.seed);
  const jitter = Math.floor(key * 3) - 1;
  const index = clamp(Math.floor((1 - lum) * (SCALE.length - 0.01)) + jitter, 0, SCALE.length - 1);
  return SCALE[index] ?? ".";
}

function paintEyes(
  grid: CellGrid,
  swimmer: Fish,
  spine: Float32Array,
  arc: Float32Array,
  total: number,
  aspect: number,
): void {
  const across = halfWidth(0.09) * GIRTH * 0.55 * swimmer.span;
  if (across < 0.85) return;
  const along = 0.09 * total;
  let i = 0;
  while (i < NODES - 2 && arc[i + 1] < along) i++;
  const sl = (arc[i + 1] ?? 0) - (arc[i] ?? 0) || 1;
  const q = clamp((along - (arc[i] ?? 0)) / sl, 0, 1);
  const x0 = spine[i * 2];
  const y0 = spine[i * 2 + 1];
  const x1 = spine[(i + 1) * 2];
  const y1 = spine[(i + 1) * 2 + 1];
  const dx = x1 - x0;
  const dy = (y1 - y0) * aspect;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const hx = x0 + dx * q;
  const hy = y0 + ((y1 - y0) * q);
  for (const side of [-1, 1]) {
    const ex = hx + (-uy * across * side);
    const ey = hy + (ux * across * side) / aspect;
    grid.plot(ex, ey, "o", swimmer.variety === "showa" ? "kgl" : "kk");
    grid.plot(ex + ux * 0.45, ey + (uy * 0.45) / aspect, ".", "kgl");
  }
}

function paintWake(grid: CellGrid, swimmer: Fish, dt: number): void {
  const next: Wake[] = [];
  for (const drop of swimmer.wake) {
    drop.age += dt;
    if (drop.age > 1.3) continue;
    const tone = drop.age < 0.35 ? "r2" : drop.age < 0.8 ? "r1" : "r0";
    grid.plot(drop.x, drop.y, drop.age < 0.45 ? "~" : ".", tone);
    next.push(drop);
  }
  swimmer.wake = next;
}

function paintRing(grid: CellGrid, ripple: Ripple, dt: number): void {
  ripple.age += dt;
  const progress = ripple.age / ripple.life;
  const radius = ripple.age * 4.2;
  const color = progress < 0.3 ? "r2" : progress < 0.65 ? "r1" : "r0";
  if (radius < 0.8) return;
  const aspect = grid.aspect || 1.8;
  const rx = Math.ceil(radius + 1);
  const ry = Math.ceil((radius + 1) / aspect);
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const dist = Math.hypot(dx, dy * aspect);
      if (Math.abs(dist - radius) > 0.55) continue;
      const deg = (Math.atan2(Math.abs(dy) * aspect, Math.abs(dx)) * 180) / Math.PI;
      const ch = deg < 28 ? "~" : ".";
      grid.plot(ripple.x + dx, ripple.y + dy, ch, color);
    }
  }
}

function halfWidth(s: number): number {
  if (s < 0.12) return 0.1 * Math.pow(Math.sin(((s / 0.12) * Math.PI) / 2), 0.6);
  if (s < 0.35) return 0.1 + 0.016 * Math.sin(((s - 0.12) / 0.23) * (Math.PI / 2));
  if (s < 0.82) return 0.116 - 0.088 * smoothstep(0.35, 0.82, s);
  return 0.028 + ((s - 0.82) / 0.18) * 0.1;
}

function blotch(s: number, a: number, seed: number): number {
  return (
    Math.sin(s * 11 + seed) * Math.cos(a * 22 + seed * 1.3) +
    0.6 * Math.sin(s * 23 + a * 15 + seed * 2.1) +
    0.35 * Math.sin(s * 5 - seed * 0.7)
  );
}

function pick(set: string, s: number, a: number, seed: number): string {
  const index = Math.floor(hash3(Math.round(s * 50), Math.round(a * 40), seed) * set.length);
  return set[index] ?? set[0] ?? "=";
}

function hash3(a: number, b: number, c: number): number {
  let n = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul((c * 1000) | 0, 1440670341);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function angleDiff(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

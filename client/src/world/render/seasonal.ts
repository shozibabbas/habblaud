import { FURNITURE, TILE, type FurnitureKind, type Sprite } from '../../art/api';
import { pixelText, pixelTextWidth } from '../../art/pixelfont';
import { hash32 } from '../../../../shared/hash';
import { renderSeasonalProp, type SeasonalProp } from '../../art/seasonal';
import type { SeasonalTheme } from '../api';
import type { AreaLayout, WallSegment } from '../layout/types';
import { reducedMotion } from './github-fx';

type Festive = Exclude<SeasonalTheme, 'none'>;

/** Cores de cada tema: Ramadã em azul-noite e dourado; Eid al-Fitr verde e dourado; Eid al-Adha verde-água e dourado. */
const PAL: Record<Festive, { cord: string; bulb: string; glow: string; flags: readonly string[]; banner: string; edge: string; text: string; motif: string; motif2: string }> = {
  ramadan: { cord: '#a8834a', bulb: '#ffe2a0', glow: '#ffcf7a', flags: [], banner: '#26306a', edge: '#e2b864', text: '#f7dc94', motif: '#e2b864', motif2: '#f7dc94' },
  eid_fitr: { cord: '#b99649', bulb: '#fff0b0', glow: '#ffe08a', flags: ['#3fae6a', '#f2c14e', '#f5f1e6', '#2f8f5b'], banner: '#2f8f5b', edge: '#f2c14e', text: '#fff3c4', motif: '#e6bd55', motif2: '#3fae6a' },
  eid_adha: { cord: '#b99649', bulb: '#fff0b0', glow: '#ffd98a', flags: ['#2fa3a0', '#ebb54d', '#f5f1e6', '#a8455a'], banner: '#227d7b', edge: '#ebb54d', text: '#fff3c4', motif: '#e6bd55', motif2: '#2fa3a0' },
};

const BANNER: Record<Festive, string> = { ramadan: 'ramadan mubarak', eid_fitr: 'eid mubarak', eid_adha: 'eid mubarak' };

const sprites = new Map<SeasonalProp, Sprite>();
function prop(kind: SeasonalProp): Sprite {
  let sprite = sprites.get(kind);
  if (!sprite) {
    const { buf, ax, ay } = renderSeasonalProp(kind);
    const canvas = document.createElement('canvas');
    canvas.width = buf.w;
    canvas.height = buf.h;
    canvas.getContext('2d')!.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
    sprites.set(kind, sprite = { canvas, ax, ay });
  }
  return sprite;
}

/** Iftar: a mesa da copa é posta perto do pôr do sol e fica até o começo da noite (hora local ou ?hora=). */
export function isIftarHour(hour: number): boolean {
  return hour >= 17 && hour < 20.5;
}

function isFirstTall(area: AreaLayout, seed: number): boolean {
  const first = area.furniture.find((f) => f.kind === 'plant_tall');
  return !!first && hash32(first.id) === seed;
}

/** Reutiliza footprints de plantas: nenhuma nova colisão ou mudança de caminhos. */
export function seasonalFurniture(theme: SeasonalTheme, kind: FurnitureKind, area: AreaLayout, seed: number): Sprite | null {
  if (theme === 'none' || area.kind === 'restroom') return null;
  if (kind === 'plant_tall') {
    if (!isFirstTall(area, seed)) return null;
    return prop(theme === 'ramadan' ? 'fanoos_tall' : theme === 'eid_fitr' ? 'balloons_fitr' : 'balloons_adha');
  }
  if (kind === 'plant_small') return prop(theme === 'ramadan' ? 'fanoos' : theme === 'eid_fitr' ? 'fanoos_green' : 'fanoos_teal');
  return null;
}

/** Centro do brilho (relativo à âncora do móvel) de um fanoos que substituiu uma planta; null se não houver. */
function lanternGlow(theme: SeasonalTheme, kind: FurnitureKind, area: AreaLayout, seed: number): { dy: number; r: number } | null {
  if (theme === 'none' || area.kind === 'restroom') return null;
  if (kind === 'plant_small') return { dy: -10, r: 15 };
  if (kind === 'plant_tall' && theme === 'ramadan' && isFirstTall(area, seed)) return { dy: -28, r: 22 };
  return null;
}

export interface TableItem {
  sprite: Sprite;
  /** Âncora do item relativa à âncora do móvel (px). */
  dx: number;
  dy: number;
}

const NO_ITEMS: readonly TableItem[] = [];
const tableItems = new Map<string, readonly TableItem[]>();

/**
 * Itens sobre as mesas: no Ramadã, o iftar (tâmaras, água, pakoras, sharbat) nas mesas da copa ao pôr do sol e
 * fanoos de mesa nas mesinhas de centro; no Eid, sheer khurma e caixas de mithai o dia todo.
 */
export function seasonalTableTop(theme: SeasonalTheme, kind: FurnitureKind, area: AreaLayout, seed: number, hour: number): readonly TableItem[] {
  if (theme === 'none' || (kind !== 'meeting_table' && kind !== 'cafe_table' && kind !== 'coffee_table')) return NO_ITEMS;
  const iftar = theme === 'ramadan' && area.kind === 'cafe' && isIftarHour(hour);
  if (theme === 'ramadan' && !iftar && kind !== 'coffee_table') return NO_ITEMS;
  const alt = (seed >>> 0) % 2;
  const key = `${theme}|${kind}|${iftar ? 1 : 0}|${alt}`;
  let items = tableItems.get(key);
  if (!items) {
    const it = (p: SeasonalProp, dx: number, dy: number): TableItem => ({ sprite: prop(p), dx, dy });
    if (kind === 'coffee_table') items = theme === 'ramadan' ? [it('fanoos_mini', 7, -9)] : [it('mithai', 7, -9)];
    else if (kind === 'cafe_table') items = iftar ? [it('dates', -2, -8), it('water', 5, -8)] : [it(alt ? 'mithai' : 'khurma', 0, -8)];
    else if (iftar) items = alt ? [it('pakora', -14, -22), it('sharbat', -6, -22), it('dates', 9, -22), it('water', 16, -22)] : [it('dates', -14, -22), it('water', -6, -22), it('pakora', 9, -22), it('sharbat', 16, -22)];
    else items = alt ? [it('khurma', -12, -22), it('mithai', 10, -22)] : [it('mithai', -12, -22), it('khurma', 10, -22)];
    tableItems.set(key, items);
  }
  return items;
}

/** Estrela de oito pontas (quadrado + losango, 7x7) com o miolo em `inner`. */
function eightStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, c: string, inner: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(cx, cy - 3, 1, 7);
  ctx.fillRect(cx - 3, cy, 7, 1);
  ctx.fillRect(cx - 2, cy - 2, 5, 1);
  ctx.fillRect(cx - 2, cy + 2, 5, 1);
  ctx.fillRect(cx - 2, cy - 2, 1, 5);
  ctx.fillRect(cx + 2, cy - 2, 1, 5);
  ctx.fillStyle = inner;
  ctx.fillRect(cx - 1, cy - 1, 3, 3);
}

/** Lua crescente pequena (aberta para a direita), em pixels. */
function smallCrescent(ctx: CanvasRenderingContext2D, x: number, y: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(x + 1, y, 2, 1);
  ctx.fillRect(x, y + 1, 1, 3);
  ctx.fillRect(x + 1, y + 1, 1, 1);
  ctx.fillRect(x + 1, y + 3, 1, 1);
  ctx.fillRect(x + 1, y + 4, 2, 1);
}

/** Motivos de tapete (cacheados junto com o piso). A cor do tapete fica: o acento de cada máquina continua. */
export function decorateSeasonalRug(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, rug: { x: number; y: number; w: number; h: number }): void {
  if (theme === 'none') return;
  const x = Math.round(rug.x), y = Math.round(rug.y), w = Math.floor(rug.w), h = Math.floor(rug.h);
  if (w < 25 || h < 16) return;
  const p = PAL[theme];
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = p.motif;
  ctx.fillRect(x + 3, y + 3, w - 6, 1);
  ctx.fillRect(x + 3, y + h - 4, w - 6, 1);
  ctx.fillRect(x + 3, y + 3, 1, h - 6);
  ctx.fillRect(x + w - 4, y + 3, 1, h - 6);
  const cy = Math.round(y + h / 2);
  let i = 0;
  for (let cx = x + 14; cx < x + w - 10; cx += 22, i++) {
    if (theme === 'ramadan' || i % 2 === 0) eightStar(ctx, cx, cy, p.motif, p.motif2);
    else smallCrescent(ctx, cx - 1, cy - 2, p.motif);
  }
  ctx.restore();
}

/** Enfeites no alto da parede, longe das telas e placas. Os vãos ficam livres. */
export function decorateSeasonalWall(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, wall: WallSegment): void {
  if (theme === 'none' || wall.kind !== 'face') return;
  const p = PAL[theme];
  ctx.save();
  const x0 = Math.round(wall.x + 3), end = Math.floor(wall.x + wall.w - 3), y = Math.round(wall.y + 5);
  const inDoor = (x: number) => wall.doorways?.some((d) => x >= d.x - 1 && x < d.x + d.w + 1);
  const sagAt = (x: number) => Math.round(Math.sin(((x - x0) % 48) / 48 * Math.PI) * 3);
  for (let x = x0; x < end; x++) {
    if (inDoor(x)) continue;
    const sag = sagAt(x);
    ctx.fillStyle = p.cord;
    ctx.fillRect(x, y + sag, 1, 1);
    const k = x - x0;
    if (theme === 'ramadan') {
      // cordão com lanterninhas, luas e estrelas alternadas; lâmpadas miúdas entre elas
      if (k % 16 === 8 && x + 2 < end && !inDoor(x + 2)) {
        const kind = Math.floor(k / 16) % 3;
        const top = y + sag + 1;
        ctx.fillStyle = p.cord;
        ctx.fillRect(x, top, 1, 2);
        if (kind === 0) {
          ctx.fillStyle = '#c08d45';
          ctx.fillRect(x - 1, top + 2, 3, 1);
          ctx.fillStyle = '#ffc767';
          ctx.fillRect(x - 1, top + 3, 3, 3);
          ctx.fillStyle = '#ffe3a1';
          ctx.fillRect(x, top + 3, 1, 3);
          ctx.fillStyle = '#94683a';
          ctx.fillRect(x - 1, top + 6, 3, 1);
        } else if (kind === 1) {
          smallCrescent(ctx, x - 1, top + 2, p.motif);
        } else {
          ctx.fillStyle = p.motif;
          ctx.fillRect(x, top + 2, 1, 3);
          ctx.fillRect(x - 1, top + 3, 3, 1);
          ctx.fillStyle = p.motif2;
          ctx.fillRect(x, top + 3, 1, 1);
        }
      } else if (k % 16 === 0) {
        ctx.fillStyle = p.bulb;
        ctx.fillRect(x, y + sag + 1, 1, 1);
      }
    } else if (k % 6 === 0 && x + 4 < end && !inDoor(x + 4)) {
      // bandeirinhas triangulares
      ctx.fillStyle = p.flags[Math.floor(k / 6) % p.flags.length];
      ctx.fillRect(x, y + sag + 1, 5, 1);
      ctx.fillRect(x + 1, y + sag + 2, 3, 1);
      ctx.fillRect(x + 1, y + sag + 3, 3, 1);
      ctx.fillRect(x + 2, y + sag + 4, 1, 1);
    }
  }
  ctx.restore();
}

/** Móveis altos que, encostados na parede norte, cobririam a faixa. */
const TALL: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>([
  'bookshelf', 'binder_shelf', 'fridge', 'vending_machine', 'plant_tall', 'water_cooler', 'arcade', 'floor_lamp', 'coffee_machine', 'glass_partition', 'toilet_stall',
]);

/** Maior trecho livre (px) das faces da parede norte, fora dos intervalos bloqueados e dos vãos. */
function widestGap(layout: AreaLayout, blocked: readonly (readonly [number, number])[]): { x: number; w: number; y: number } | null {
  let best: { x: number; w: number; y: number } | null = null;
  for (const wall of layout.walls) {
    if (wall.kind !== 'face') continue;
    const cuts = [...blocked, ...(wall.doorways ?? []).map((d) => [d.x - 2, d.x + d.w + 2] as const)].sort((a, b) => a[0] - b[0]);
    let from = wall.x + 6;
    const stop = wall.x + wall.w - 6;
    for (const [a, b] of [...cuts, [stop, stop] as const]) {
      const to = Math.min(a, stop);
      if (to - from > (best?.w ?? 0)) best = { x: from, w: to - from, y: wall.y };
      from = Math.max(from, b);
    }
  }
  return best;
}

/**
 * Faixa "Ramadan Mubarak" / "Eid Mubarak" (duas linhas) na recepção: no maior trecho livre da parede norte, sem
 * cobrir vãos, móveis altos encostados ou itens animados (`dynamic`: janelas, relógio, elevador, placa...). Se
 * só couber na frente de um quadro ou pôster, pendura por cima dele (desenhe depois dos itens fixos).
 */
export function decorateSeasonalBanner(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, layout: AreaLayout, dynamic: ReadonlySet<FurnitureKind>): void {
  if (theme === 'none' || layout.kind !== 'reception') return;
  const p = PAL[theme];
  const lines = theme === 'ramadan' ? ['ramadan', 'mubarak'] : ['eid', 'mubarak'];
  const bw = Math.max(...lines.map(pixelTextWidth)) + 8;
  const bh = 17;
  const fixed: [number, number][] = [];
  const moving: [number, number][] = [];
  for (const w of layout.wallItems) {
    if (w.on !== 'face') continue;
    const half = (FURNITURE[w.kind]?.footprint.w ?? 1) * TILE / 2;
    (dynamic.has(w.kind) ? moving : fixed).push([w.cx - half - 2, w.cx + half + 2]);
  }
  const wallRow = layout.rect.y + 2;
  for (const f of layout.furniture) {
    if (f.ty !== wallRow || !TALL.has(f.kind)) continue;
    const x = f.tx * TILE + (f.dx ?? 0);
    moving.push([x - 2, x + FURNITURE[f.kind].footprint.w * TILE + 2]);
  }
  let gap = widestGap(layout, [...moving, ...fixed]);
  let cx = gap ? gap.x + gap.w / 2 : 0;
  if (!gap || gap.w < bw) {
    gap = widestGap(layout, moving);
    if (!gap || gap.w < bw) return;
    // por cima de um quadro: centrada nele, para não sobrar uma beirada da moldura
    const g = gap;
    const under = fixed.map(([a, b]) => (a + b) / 2).find((c) => c - bw / 2 >= g.x && c + bw / 2 <= g.x + g.w);
    cx = under ?? g.x + g.w / 2;
  }
  const x = Math.round(cx - bw / 2);
  const y = Math.round(gap.y + 9);
  ctx.save();
  // cordões até o varal
  ctx.fillStyle = p.cord;
  ctx.fillRect(x + 2, y - 4, 1, 4);
  ctx.fillRect(x + bw - 3, y - 4, 1, 4);
  ctx.fillStyle = 'rgba(20,24,40,0.22)';
  ctx.fillRect(x + 1, y + bh, bw, 1);
  ctx.fillStyle = p.edge;
  ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = p.banner;
  ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
  // pontas em "V" embaixo (flâmula) e uma estrelinha pendurada no meio
  for (const ex of [x + 1, x + bw - 4]) {
    ctx.fillRect(ex, y + bh, 3, 1);
    ctx.fillRect(ex + 1, y + bh + 1, 1, 1);
  }
  lines.forEach((line, i) => pixelText(ctx, line, Math.round(x + (bw - pixelTextWidth(line)) / 2), y + 3 + i * 7, p.text));
  const mid = Math.round(x + bw / 2);
  ctx.fillStyle = p.cord;
  ctx.fillRect(mid, y + bh, 1, 2);
  ctx.fillStyle = p.edge;
  ctx.fillRect(mid, y + bh + 2, 1, 3);
  ctx.fillRect(mid - 1, y + bh + 3, 3, 1);
  ctx.restore();
}

/** Lua crescente com estrela sobre a moldura dos elevadores (sem cobrir a porta animada). */
export function decorateElevator(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, x: number, y: number): void {
  if (theme === 'none') return;
  const sprite = prop('crescent');
  ctx.drawImage(sprite.canvas, Math.round(x - sprite.ax), Math.round(y - 19 - sprite.ay));
}

const glows = new Map<string, HTMLCanvasElement>();
function glowSprite(color: string, r: number): HTMLCanvasElement {
  const key = `${color}|${r}`;
  let canvas = glows.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = r * 2;
    const ctx = canvas.getContext('2d')!;
    const glow = ctx.createRadialGradient(r, r, 1, r, r, r);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(255,220,170,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, r * 2, r * 2);
    glows.set(key, canvas);
  }
  return canvas;
}

/**
 * Luz decorativa suave: lâmpadas do varal (limitadas à face da parede) e os fanoos de chão, que brilham mais
 * à noite. Não interfere com salas apagadas. Sem prefers-reduced-motion, as chamas tremulam de leve.
 */
export function drawSeasonalLights(
  ctx: CanvasRenderingContext2D,
  theme: SeasonalTheme,
  area: { layout: AreaLayout; furniture: readonly { kind: FurnitureKind; seed: number; ax: number; ay: number }[] },
  light: number,
  night: number,
  now: number,
): void {
  if (theme === 'none' || light <= 0.01) return;
  const p = PAL[theme];
  const layout = area.layout;
  const still = reducedMotion();
  const flicker = (seed: number) => (still ? 1 : 0.9 + 0.1 * Math.sin(now / 260 + (seed % 17)));
  ctx.save();
  for (const wall of layout.walls) {
    if (wall.kind !== 'face') continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(wall.x, wall.y + 4, wall.w, 27);
    ctx.clip();
    const step = theme === 'ramadan' ? 16 : 24;
    const first = theme === 'ramadan' ? 8 : 14;
    for (let x = Math.round(wall.x + 3) + first; x < wall.x + wall.w - 6; x += step) {
      if (wall.doorways?.some((d) => x >= d.x - 10 && x <= d.x + d.w + 10)) continue;
      ctx.globalAlpha = light * (0.22 + 0.3 * night);
      ctx.drawImage(glowSprite(p.glow, 17), Math.round(x - 17), wall.y - 8);
    }
    ctx.restore();
  }
  for (const f of area.furniture) {
    const g = lanternGlow(theme, f.kind, layout, f.seed);
    if (!g) continue;
    ctx.globalAlpha = light * (0.12 + 0.5 * night) * flicker(f.seed);
    ctx.drawImage(glowSprite(p.glow, g.r), Math.round(f.ax - g.r), Math.round(f.ay + g.dy - g.r));
  }
  ctx.restore();
}

/**
 * Céu da janela: no Ramadã, à noite, a lua vira um crescente fino (o resto do disco em luz cinérea) com uma
 * estrela; no Eid, fogos discretos ao longe (parados com prefers-reduced-motion).
 */
export function drawSeasonalWindow(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, glass: { x: number; y: number; w: number; h: number }, hour: number, now: number, seed: number): void {
  if (theme === 'none') return;
  const hr = ((hour % 24) + 24) % 24;
  // mesma curva do céu da janela (art/dynamic.ts): a lua aparece com night > 0.3
  const night = hr < 5 || hr > 20 ? 1 : hr < 6.2 ? Math.max(0, (6.2 - hr) / 1.2) : hr > 19 ? Math.min(1, (hr - 19) / 1.2) : 0;
  if (night <= 0.3) return;
  const x = Math.round(glass.x), y = Math.round(glass.y), w = Math.round(glass.w), h = Math.round(glass.h);
  if (w < 8 || h < 6) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (theme === 'ramadan') {
    const mx = x + Math.floor(w * 0.72) - 1;
    const my = y + 1;
    ctx.fillStyle = '#2f3767';
    ctx.fillRect(mx + 1, my, 3, 5);
    ctx.fillRect(mx, my + 1, 5, 3);
    ctx.fillStyle = '#f6efc8';
    ctx.fillRect(mx + 1, my, 2, 1);
    ctx.fillRect(mx, my + 1, 1, 3);
    ctx.fillRect(mx + 1, my + 4, 2, 1);
    ctx.fillStyle = '#fff8dc';
    ctx.fillRect(mx - 3, my + 2, 1, 1);
  } else {
    const still = reducedMotion();
    const colors = PAL[theme].flags;
    for (let k = 0; k < 2; k++) {
      const hh = hash32(`${seed}:${k}`);
      const period = 2600 + (hh % 900);
      const ph = still ? 0.35 : ((now + (hh % period)) % period) / period;
      if (ph > 0.6) continue;
      const cx = x + 3 + (hh % Math.max(1, w - 6));
      const cy = y + 2 + ((hh >>> 8) % Math.max(1, Math.floor(h * 0.45)));
      const r = Math.round(1 + ph * 5);
      ctx.globalAlpha = still ? 0.8 : Math.max(0, 1 - ph / 0.6);
      ctx.fillStyle = colors[(hh >>> 4) % 2 === 0 ? 1 : 2];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]] as const) {
        ctx.fillRect(Math.round(cx + dx * r), Math.round(cy + dy * r), 1, 1);
      }
    }
  }
  ctx.restore();
}

/** Brilho de festa no Eid: uma estrelinha pisca de vez em quando ao lado da cabeça (nada com reduced-motion). */
export function drawEidSparkle(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, x: number, y: number, now: number, seed: number): void {
  if ((theme !== 'eid_fitr' && theme !== 'eid_adha') || reducedMotion()) return;
  const period = 6000 + ((seed >>> 3) % 3000);
  const ph = ((now + (seed % period)) % period) / 700;
  if (ph >= 1) return;
  const r = ph < 0.5 ? 1 : 2;
  const c = theme === 'eid_fitr' ? '#ffe9a0' : '#fff0c0';
  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * (1 - Math.abs(ph - 0.5) * 1.4);
  ctx.fillStyle = c;
  ctx.fillRect(x - r, y, r * 2 + 1, 1);
  ctx.fillRect(x, y - r, 1, r * 2 + 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, 1, 1);
  ctx.restore();
}

// Desenho da recreação do campus (layout/recreation.ts): o piso da quadra de tênis (camada base), a bola dos ralis
// com a sombra no chão/tampo, o placar das mesas e da quadra, a fumaça dos cigarros (com um ventinho), o "Zzz" das
// cápsulas ocupadas e as luzes da noite (refletores da quadra, luz baixa das cápsulas). Com movimento reduzido, nada
// voa: sem bola, fumaça parada e "Zzz" fixo.
import { mulberry32 } from '../../../../shared/hash';
import { TILE, type Sprite } from '../../art/api';
import { pixelText, pixelTextWidth } from '../../art/pixelfont';
import type { RecreationLayout } from '../layout/recreation';
import type { Sim } from '../sim/sim';
import type { Gathering } from '../social/gathering';
import { ballAt, tennisBoard } from '../social/rally';
import { reducedMotion } from './github-fx';
import { glowSprite } from './props';
import type { AreaVis } from './scene';

/** Visível (px de mundo). */
interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const COURT_OUT = '#3f7d5e';
const COURT_IN = '#3b6ea8';
const LINE = '#f2f5f8';

// =================================================================== camada base

/** Quadra de tênis: piso verde dentro do alambrado, quadra azul e as linhas brancas (simples e duplas). */
export function paintCourt(ctx: CanvasRenderingContext2D, rec: RecreationLayout): void {
  const c = rec.court;
  const f = c.fence;
  const fx = f.x * TILE;
  const fy = f.y * TILE;
  const fw = f.w * TILE;
  const fh = f.h * TILE;
  ctx.fillStyle = COURT_OUT;
  ctx.fillRect(fx, fy, fw, fh);
  // textura de piso de resina: pontinhos claros e escuros
  const rng = mulberry32(0x7e44);
  for (let i = 0; i < (fw * fh) / 40; i++) {
    const x = fx + Math.floor(rng() * fw);
    const y = fy + Math.floor(rng() * fh);
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = COURT_IN;
  ctx.fillRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
  for (let i = 0; i < ((c.x1 - c.x0) * (c.y1 - c.y0)) / 50; i++) {
    const x = c.x0 + Math.floor(rng() * (c.x1 - c.x0));
    const y = c.y0 + Math.floor(rng() * (c.y1 - c.y0));
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, y, 1, 1);
  }
  const w = c.x1 - c.x0;
  const h = c.y1 - c.y0;
  const alley = Math.round(h * 0.125);
  const half = w / 2;
  const service = Math.round(half * 0.54);
  const cy = Math.round(c.y0 + h / 2);
  ctx.fillStyle = LINE;
  // laterais (duplas e simples)
  ctx.fillRect(c.x0, c.y0, w, 1);
  ctx.fillRect(c.x0, c.y1 - 1, w, 1);
  ctx.fillRect(c.x0, c.y0 + alley, w, 1);
  ctx.fillRect(c.x0, c.y1 - 1 - alley, w, 1);
  // linhas de base (mais grossas) e marcas centrais
  ctx.fillRect(c.x0, c.y0, 2, h);
  ctx.fillRect(c.x1 - 2, c.y0, 2, h);
  ctx.fillRect(c.x0 + 2, cy, 3, 1);
  ctx.fillRect(c.x1 - 5, cy, 3, 1);
  // linhas de saque e a linha central de saque
  ctx.fillRect(c.netX - service, c.y0 + alley, 1, h - 2 * alley);
  ctx.fillRect(c.netX + service, c.y0 + alley, 1, h - 2 * alley);
  ctx.fillRect(c.netX - service, cy, service * 2, 1);
}

// =================================================================== ralis e placares

/** Bola de cada rali (pingue-pongue e tênis) e o placar sobre as mesas. Por cima das entidades. */
export function drawRallies(ctx: CanvasRenderingContext2D, sim: Sim, now: number, view: View): void {
  const still = reducedMotion();
  for (const g of sim.social.gatherings) {
    const st = g.rally;
    if (!st || (g.phase !== 'run' && g.phase !== 'final')) continue;
    if (g.phase === 'run' && !still) {
      const b = ballAt(st, now);
      if (b && b.x > view.x0 - 8 && b.x < view.x1 + 8 && b.y > view.y0 - 40 && b.y < view.y1 + 8) {
        const a = Math.max(0.15, 0.38 - b.h * 0.008);
        ctx.fillStyle = `rgba(20,30,40,${a})`;
        ctx.fillRect(Math.round(b.sx) - 1, Math.round(b.sy), 2, 1);
        if (st.kind === 'tennis') {
          ctx.fillStyle = '#e3f04a';
          ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2);
          ctx.fillStyle = '#9fae1e';
          ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2);
        }
      }
    }
    if (g.kind === 'pingpong' && st.players.length) drawTableScore(ctx, g, view);
  }
}

/** Plaquinha "3-2" sobre a mesa de pingue-pongue (lado oeste à esquerda). */
function drawTableScore(ctx: CanvasRenderingContext2D, g: Gathering, view: View): void {
  const st = g.rally!;
  let x = 0;
  let top = Infinity;
  for (const p of st.players) {
    x += p.hx;
    top = Math.min(top, p.hy);
  }
  x = Math.round(x / st.players.length);
  const y = Math.round(top - 34);
  if (x < view.x0 - 20 || x > view.x1 + 20 || y < view.y0 - 10 || y > view.y1 + 10) return;
  const text = `${g.score[0]}-${g.score[1]}`;
  const w = pixelTextWidth(text) + 6;
  ctx.fillStyle = 'rgba(22,27,40,0.88)';
  ctx.fillRect(x - Math.ceil(w / 2), y, w, 9);
  ctx.fillRect(x - Math.ceil(w / 2) + 1, y - 1, w - 2, 11);
  ctx.fillStyle = '#3f7fd8';
  ctx.fillRect(x - Math.ceil(w / 2) + 1, y + 8, Math.floor(w / 2) - 1, 1);
  ctx.fillStyle = '#e05a5a';
  ctx.fillRect(x, y + 8, Math.ceil(w / 2) - 2, 1);
  pixelText(ctx, text, x - Math.ceil(w / 2) + 3, y + 2, g.phase === 'final' ? '#ffd34d' : '#f3f5fa');
}

/** Mostrador do placar da quadra (rects.screen do 'scoreboard'): games em cima, pontos do game embaixo. */
export function drawScoreboard(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, sim: Sim): void {
  let g: Gathering | null = null;
  for (const q of sim.social.gatherings) if (q.kind === 'tennis' && q.rally && (q.phase === 'run' || q.phase === 'final')) g = q;
  const left = r.x + 2;
  const right = r.x + r.w - 2;
  if (!g) {
    pixelText(ctx, '-', left + 3, r.y + 1, '#4f7d5e');
    pixelText(ctx, '-', right - 6, r.y + 1, '#4f7d5e');
    return;
  }
  const amber = '#ffcf5a';
  pixelText(ctx, String(g.score[0]), left + 3, r.y + 1, amber);
  pixelText(ctx, String(g.score[1]), right - 6, r.y + 1, amber);
  const [a, b] = tennisBoard(g.rally!.points);
  pixelText(ctx, a, left, r.y + 7, '#e8f2ea');
  pixelText(ctx, b, right - pixelTextWidth(b), r.y + 7, '#e8f2ea');
  // quem saca: pontinho do lado
  ctx.fillStyle = '#e3f04a';
  ctx.fillRect(g.rally!.server === 0 ? left + 9 : right - 10, r.y + 3, 1, 1);
}

// =================================================================== fumaça

/** Fumaça dos cigarros: um fiozinho da brasa e, na tragada, baforadas pela boca; o vento leva para leste. */
export function drawSmoke(ctx: CanvasRenderingContext2D, sim: Sim, heads: ReadonlyMap<string, { x: number; y: number; feetY: number; visible: boolean }>, now: number, view: View): void {
  const still = reducedMotion();
  for (const ch of sim.chars.values()) {
    if (ch.held !== 'cigarette' || ch.inside) continue;
    const head = heads.get(ch.id);
    if (!head?.visible) continue;
    const x = head.x;
    const feet = head.feetY;
    if (x < view.x0 - 30 || x > view.x1 + 30 || feet < view.y0 - 10 || feet > view.y1 + 50) continue;
    const side = ch.dir === 'left' ? -1 : ch.dir === 'right' ? 1 : 0;
    const tip = { x: x + (side ? side * 6 : 5), y: feet - (ch.seated ? 10 : 12) };
    if (still) {
      ctx.fillStyle = 'rgba(96,104,122,0.55)';
      ctx.fillRect(tip.x, tip.y - 3, 1, 2);
      ctx.fillRect(tip.x + 1, tip.y - 6, 1, 2);
      ctx.fillRect(tip.x + 3, tip.y - 9, 2, 2);
      continue;
    }
    const seed = (ch.info.seed >>> 0) % 997;
    // fiozinho da brasa: bolinhas pequenas subindo e se abrindo
    wisp(ctx, tip.x, tip.y - 1, now + seed * 13, 650, 4, 2, 0.8, 20);
    // baforada depois da tragada (pose 'drink': a mão vai à boca)
    if (ch.pose === 'drink') {
      const mouth = { x: x + side * 3, y: head.y + 9 };
      wisp(ctx, mouth.x, mouth.y, now + seed * 7, 300, 4, 3.2, 0.9, 16);
    }
  }
}

/** Uma fila de baforadas (`n` vivas, uma nova a cada `every` ms) saindo de (x, y), com vento e balanço. */
function wisp(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, every: number, n: number, size: number, alpha: number, rise: number): void {
  const life = every * n;
  const wind = 10 + Math.sin(t / 2_700) * 4;
  const base = Math.floor(t / every);
  for (let i = 0; i < n; i++) {
    const born = (base - i) * every;
    const a = (t - born) / life;
    if (a < 0 || a > 1) continue;
    const px = Math.round(x + a * wind + Math.sin(a * 6 + born / 300) * 1.5);
    const py = Math.round(y - a * rise);
    const r = Math.max(1, Math.round(1 + a * size));
    const k = alpha * (1 - a * a);
    // contorno cinza-azulado (legível no piso claro) e miolo claro
    ctx.fillStyle = `rgba(96,104,122,${(k * 0.55).toFixed(3)})`;
    ctx.fillRect(px - Math.floor(r / 2) - 1, py - Math.floor(r / 2), r + 2, r);
    ctx.fillRect(px - Math.floor(r / 2), py - Math.floor(r / 2) - 1, r, r + 2);
    ctx.fillStyle = `rgba(238,241,246,${k.toFixed(3)})`;
    ctx.fillRect(px - Math.floor(r / 2), py - Math.floor(r / 2), r, r);
  }
}

// =================================================================== cápsulas e luzes

/** "Zzz" sobre as cápsulas ocupadas (desenhado depois da escuridão, como os ícones). */
export function drawPodSleepers(ctx: CanvasRenderingContext2D, sim: Sim, areas: Iterable<AreaVis>, icon: Sprite | null, now: number, view: View): void {
  if (!icon || !sim.podBusy.size) return;
  const still = reducedMotion();
  for (const vis of areas) {
    if (vis.layout.rec !== 'rest') continue;
    for (const f of vis.furniture) {
      if (f.kind !== 'sleep_pod' || !sim.podBusy.has(f.id)) continue;
      if (f.ax < view.x0 - 20 || f.ax > view.x1 + 20 || f.ay < view.y0 || f.ay > view.y1 + 40) continue;
      const ph = (f.seed % 1000) * 3.1;
      const bob = still ? 0 : Math.round(Math.sin((now + ph) / 600) * 1.5);
      const drift = still ? 0 : Math.round(((now + ph) / 1_400) % 1 * 3);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(icon.canvas, Math.round(f.ax + 6 - icon.ax + drift), Math.round(f.ay - 36 - icon.ay - bob));
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Halos no mapa de luz (noite): os refletores clareiam a quadra inteira; `halo` é o mesmo pincel dos postes.
 * `k` = força da noite (0..1).
 */
export function recreationHalos(areas: Iterable<AreaVis>, halo: (cx: number, cy: number, w: number, h: number, a: number) => void, k: number): void {
  for (const vis of areas) {
    if (vis.layout.rec !== 'court') continue;
    const r = vis.px;
    halo(r.x + r.w / 2, r.y + r.h / 2 + 8, r.w * 1.25, r.h * 1.5, k);
    for (const f of vis.furniture) if (f.kind === 'floodlight') halo(f.ax, f.ay, 90, 70, 0.8 * k);
  }
}

/** Brilhos por frame: cabeças dos refletores e a luz baixa das cápsulas ocupadas. */
export function drawRecreationGlows(ctx: CanvasRenderingContext2D, sim: Sim, areas: Iterable<AreaVis>, n: number, view: View): void {
  if (n < 0.2) return;
  const flood = glowSprite('#fff1c8', 64);
  const warm = glowSprite('#ffb86a', 32);
  for (const vis of areas) {
    const rec = vis.layout.rec;
    if (rec !== 'court' && rec !== 'rest') continue;
    for (const f of vis.furniture) {
      if (f.ax < view.x0 - 60 || f.ax > view.x1 + 60 || f.ay < view.y0 - 80 || f.ay > view.y1 + 60) continue;
      if (f.kind === 'floodlight') {
        ctx.globalAlpha = 0.75 * n;
        ctx.drawImage(flood, Math.round(f.ax - 20), Math.round(f.ay - 86), 40, 40);
      } else if (f.kind === 'sleep_pod' && sim.podBusy.has(f.id)) {
        ctx.globalAlpha = 0.7 * n;
        ctx.drawImage(warm, Math.round(f.ax - 18), Math.round(f.ay - 24), 36, 28);
      }
    }
  }
  ctx.globalAlpha = 1;
}

// Desenho da diretoria do campus (layout/ceo.ts) que depende do mundo: o estado dos móveis (a mesa de pé, a cadeira
// executiva que rola para o lado junto com ela, o bar em uso), as telas (Studio Display e MacBook do dono, monitor
// da secretária), o vapor do bar e, à noite, a luminária da mesa acesa (halo no piso e o bulbo) e o brilho das telas.
// Os estados vêm de Sim.furnStates (o comportamento liga e desliga); o bar também acende com Sim.machineUntil.
import type { ArtModule, ScreenMode, Sprite } from '../../art/api';
import { COFFEE_BAR_STEAM, execDeskLamp, execDeskScreen } from '../../art/furniture/ceo';
import { screenModeFor } from '../sim/behavior';
import type { Sim } from '../sim/sim';
import { reducedMotion } from './github-fx';
import { glowSprite } from './props';
import type { AreaVis, FurnVis } from './scene';

interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Estado de um móvel da diretoria, ou undefined se não for um deles. */
export function ceoFurnState(sim: Sim, f: FurnVis, now: number, areas: ReadonlyMap<string, AreaVis>): number | undefined {
  switch (f.kind) {
    case 'exec_desk':
      return sim.furnStates.get(f.id) ?? 0;
    case 'exec_chair': {
      // a cadeira acompanha a mesa da mesma sala: com o tampo erguido, ela rola para o lado
      const desk = areas.get(f.areaId)?.furniture.find((d) => d.kind === 'exec_desk');
      return desk ? (sim.furnStates.get(desk.id) ?? 0) : 0;
    }
    case 'coffee_bar':
      return sim.furnStates.get(f.id) === 1 || (sim.machineUntil.get(f.id) ?? 0) > now ? 1 : 0;
    default:
      return undefined;
  }
}

/**
 * Tela de uma mesa da diretoria: segue quem está no lugar dela (sentado ou em pé, spots com `deskId` = a mesa).
 * Vazia: em espera (a diretoria fica sempre acesa, também à noite).
 */
export function ceoScreen(sim: Sim, f: FurnVis, area: AreaVis): ScreenMode {
  for (const s of area.layout.spots) {
    if (s.deskId !== f.id) continue;
    const owner = sim.spots.ownerOf(s.id);
    const ch = owner ? sim.chars.get(owner) : undefined;
    if (!ch || ch.leaving || ch.atSpot !== s.id) continue;
    if (ch.mode === 'wait') return 'alert';
    return ch.mode === 'work' ? screenModeFor(ch.info.activity?.kind) : 'docs';
  }
  return 'standby';
}

/** Por cima do sprite base: as telas das mesas e o vapor do bar em uso. `dx`/`dy` = canto do sprite no mundo. */
export function drawCeoFurniture(
  ctx: CanvasRenderingContext2D,
  art: ArtModule,
  sim: Sim,
  f: FurnVis,
  area: AreaVis,
  s: Sprite,
  dx: number,
  dy: number,
  state: number,
  now: number,
): void {
  if (f.kind === 'exec_desk' || f.kind === 'secretary_desk') {
    const mode = ceoScreen(sim, f, area);
    const r = s.rects?.screen;
    if (r) art.drawScreen(ctx, { x: dx + r.x, y: dy + r.y, w: r.w, h: r.h }, mode, now, f.seed);
    // MacBook: fica com o painel fixo do sprite; com o dono à mesa, mostra o chat
    const r2 = s.rects?.screen2;
    if (r2 && mode !== 'standby') art.drawScreen(ctx, { x: dx + r2.x, y: dy + r2.y, w: r2.w, h: r2.h }, 'chat', now, f.seed + 1);
  } else if (f.kind === 'coffee_bar' && state === 1) {
    COFFEE_BAR_STEAM.forEach((p, i) => steam(ctx, f.ax + p.dx, f.ay + p.dy, now, f.seed + i * 3));
  }
}

/** Fiapos de vapor subindo, com uma sombra cinza à esquerda para lerem na parede clara (parados com movimento reduzido). */
function steam(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, seed: number): void {
  const t = reducedMotion() ? 0 : now;
  for (let i = 0; i < 4; i++) {
    const ph = ((t / 1300 + i / 4 + (seed % 7) / 7) % 1 + 1) % 1;
    const sx = Math.round(x + Math.sin(ph * 6 + i * 2) * 1.5);
    const sy = Math.round(y - ph * 12);
    ctx.globalAlpha = 0.85 * (1 - ph);
    ctx.fillStyle = 'rgba(150,160,175,0.6)';
    ctx.fillRect(sx - 1, sy + 1, 1, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx, sy, ph < 0.5 ? 2 : 1, 2);
  }
  ctx.globalAlpha = 1;
}

/** Halos no mapa de luz (à noite): a luminária da mesa ilumina o tampo e o chão em volta. */
export function ceoHalos(sim: Sim, areas: Iterable<AreaVis>, halo: (cx: number, cy: number, w: number, h: number, a: number) => void, k: number): void {
  for (const vis of areas) {
    if (vis.layout.ceo !== 'office') continue;
    for (const f of vis.furniture) {
      if (f.kind !== 'exec_desk') continue;
      const lamp = execDeskLamp(sim.furnStates.get(f.id) ?? 0);
      halo(f.ax + lamp.dx, f.ay + lamp.dy + 6, 96, 64, k);
    }
  }
}

/** Brilhos por frame (à noite): o bulbo da luminária da mesa e a luz das telas ligadas no rosto de quem trabalha. */
export function drawCeoGlows(ctx: CanvasRenderingContext2D, sim: Sim, areas: Iterable<AreaVis>, n: number, view: View): void {
  if (n < 0.2) return;
  const warm = glowSprite('#ffcf7a', 64);
  const cool = glowSprite('#7fb8ff', 48);
  for (const vis of areas) {
    if (!vis.layout.ceo) continue;
    for (const f of vis.furniture) {
      if (f.ax < view.x0 - 60 || f.ax > view.x1 + 60 || f.ay < view.y0 - 80 || f.ay > view.y1 + 60) continue;
      if (f.kind === 'exec_desk') {
        const st = sim.furnStates.get(f.id) ?? 0;
        const lamp = execDeskLamp(st);
        ctx.globalAlpha = 0.7 * n;
        ctx.drawImage(warm, Math.round(f.ax + lamp.dx - 16), Math.round(f.ay + lamp.dy - 12), 32, 32);
        if (ceoScreen(sim, f, vis) !== 'off') {
          const scr = execDeskScreen(st);
          ctx.globalAlpha = 0.3 * n;
          ctx.drawImage(cool, Math.round(f.ax + scr.dx - 28), Math.round(f.ay + scr.dy - 16), 56, 48);
        }
      } else if (f.kind === 'secretary_desk' && ceoScreen(sim, f, vis) !== 'off') {
        ctx.globalAlpha = 0.3 * n;
        ctx.drawImage(cool, Math.round(f.ax - 24), Math.round(f.ay - 34));
      }
    }
  }
  ctx.globalAlpha = 1;
}

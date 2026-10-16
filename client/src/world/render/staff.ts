// Desenho da equipe do escritório (sim/staff.ts) além dos próprios personagens: o kit da limpeza (carrinho, balde,
// placa de piso molhado), entre as entidades ordenadas por profundidade; o brilho do piso recém-limpo, no piso
// (verniz, reflexo e brilhinhos piscando; no carpete, as listras do aspirador); à noite, por cima da escuridão, o
// reflexo quente das luzes no piso molhado; e o cartão de quem é clicado ("Saira · Equipe de limpeza").
// Com "reduzir movimento", nada pisca: só o verniz que vai sumindo.
import { renderCleaningProp, type CleaningProp } from '../../art/furniture/cleaning';
import { shineLevel, type ShinePatch, type ShineView } from '../sim/shine';
import type { KitItem } from '../sim/staff';
import type { Sim } from '../sim/sim';

interface Cached {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
}

const kitCache = new Map<string, Cached>();

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function kitSprite(kind: CleaningProp, flip: boolean): Cached {
  const key = `${kind}|${flip ? 1 : 0}`;
  let s = kitCache.get(key);
  if (!s) {
    const { buf, ax, ay } = renderCleaningProp(kind);
    const b = flip ? buf.flipped() : buf;
    const [c, ctx] = canvasOf(b.w, b.h);
    ctx.putImageData(new ImageData(b.data, b.w, b.h), 0, 0);
    s = { canvas: c, ax: flip ? b.w - ax : ax, ay };
    kitCache.set(key, s);
  }
  return s;
}

/** Uma peça do kit com os pés em (x, y). */
export function drawKitItem(ctx: CanvasRenderingContext2D, it: KitItem): void {
  const s = kitSprite(it.kind, it.flip);
  ctx.drawImage(s.canvas, Math.round(it.x - s.ax), Math.round(it.y - s.ay));
}

// ------------------------------------------------------------------ brilho do piso

const sheenCache = new Map<string, HTMLCanvasElement>();

/** Variantes do desenho de um trecho: verniz (o brilho que fica), molhado (logo depois do mop) e carpete aspirado. */
type SheenKind = 'gloss' | 'wet' | 'carpet';

/**
 * Desenho de um trecho, em pixels nítidos (sem antialias, como o resto do mundo), gerado uma vez por tamanho e
 * variação. Verniz: um véu azulado em degraus, uma borda pontilhada e dois reflexos diagonais com uma linha de sombra
 * embaixo (assim aparece também no piso claro). Molhado: um tom mais escuro por baixo. Carpete: listras do aspirador.
 */
function sheenSprite(rx: number, ry: number, kind: SheenKind, tilt: number): HTMLCanvasElement {
  const key = `${rx}|${ry}|${kind}|${tilt}`;
  let c = sheenCache.get(key);
  if (c) return c;
  const w = rx * 2;
  const h = ry * 2;
  const [cv, ctx] = canvasOf(w, h);
  const img = ctx.createImageData(w, h);
  const put = (x: number, y: number, rgb: number, a: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    img.data[i] = (rgb >> 16) & 255;
    img.data[i + 1] = (rgb >> 8) & 255;
    img.data[i + 2] = rgb & 255;
    img.data[i + 3] = Math.round(a * 255);
  };
  const inside = (x: number, y: number) => {
    const dx = (x + 0.5 - rx) / rx;
    const dy = (y + 0.5 - ry) / ry;
    return dx * dx + dy * dy;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = inside(x, y);
      if (d > 1) continue;
      if (kind === 'carpet') {
        // faixas de ida e volta do aspirador (claras e escuras alternadas)
        const band = Math.floor((x + Math.floor(y * 0.5)) / 3) % 2;
        const edge = d > 0.7 ? 0.55 : 1;
        put(x, y, band ? 0x283048 : 0xffffff, (band ? 0.12 : 0.2) * edge);
        continue;
      }
      if (kind === 'wet') {
        put(x, y, 0x4f7fa3, d > 0.8 ? 0.1 : 0.17);
        continue;
      }
      // véu azulado em degraus, mais forte no alto/à esquerda (de onde vem a luz); borda pontilhada
      const cx = (x + 0.5 - rx) / rx + 0.25;
      const cy = (y + 0.5 - ry) / ry + 0.3;
      const c2 = cx * cx + cy * cy;
      const rim = d > 0.82;
      if (rim) put(x, y, 0x6fb2d6, (x + y) % 2 ? 0.34 : 0.14);
      else put(x, y, c2 < 0.3 ? 0xdff3ff : 0xb3dcf2, c2 < 0.3 ? 0.42 : c2 < 0.7 ? 0.26 : 0.18);
    }
  }
  if (kind === 'gloss') {
    // dois reflexos diagonais (janelas e luzes no piso polido), com a linha de sombra logo abaixo
    for (let i = 0; i < 2; i++) {
      const len = i === 0 ? Math.round(rx * 0.75) : Math.round(rx * 0.45);
      const x0 = Math.round(rx * (0.5 + i * 0.4) + tilt);
      const y0 = Math.round(ry * (1.3 - i * 0.2));
      for (let k = 0; k < len; k++) {
        const x = x0 + k;
        const y = y0 - Math.round(k * 0.5);
        if (inside(x, y) > 0.8) continue;
        put(x, y, 0xffffff, i === 0 ? 0.95 : 0.75);
        if (inside(x, y + 1) <= 0.8) put(x, y + 1, 0x5d9cc4, 0.38);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  sheenCache.set(key, (c = cv));
  return c;
}

/** Posições fixas (por semente) dos brilhinhos de um trecho, relativas ao centro. */
function glints(p: ShinePatch): [number, number, number][] {
  const out: [number, number, number][] = [];
  let s = p.seed >>> 0;
  const next = () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296);
  for (let i = 0; i < 3; i++) out.push([Math.round((next() * 2 - 1) * p.rx * 0.7), Math.round((next() * 2 - 1) * p.ry * 0.6), next()]);
  return out;
}

const glintCache = new WeakMap<ShinePatch, [number, number, number][]>();

/** Estrelinha de 4 pontas: miolo branco, braços azul-claros (aparece também no piso claro). */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, a: number): void {
  ctx.globalAlpha = a;
  ctx.fillStyle = '#7cc4ec';
  ctx.fillRect(x - 1, y, 1, 1);
  ctx.fillRect(x + 1, y, 1, 1);
  ctx.fillRect(x, y - 1, 1, 1);
  ctx.fillRect(x, y + 1, 1, 1);
  if (a > 0.55) {
    ctx.globalAlpha = a * 0.55;
    ctx.fillRect(x - 2, y, 1, 1);
    ctx.fillRect(x + 2, y, 1, 1);
    ctx.fillRect(x, y - 2, 1, 1);
    ctx.fillRect(x, y + 2, 1, 1);
  }
  ctx.globalAlpha = a;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, 1, 1);
}

export class StaffRenderer {
  private readonly kitOut: KitItem[] = [];
  private readonly vis: ShinePatch[] = [];

  /** Peças do kit desta vez (o renderer as ordena com as outras entidades). */
  kit(sim: Sim, now: number): readonly KitItem[] {
    return sim.staff.kit(this.kitOut, now);
  }

  /** Brilho no piso (antes dos móveis e personagens). */
  drawShine(ctx: CanvasRenderingContext2D, sim: Sim, now: number, view: ShineView, still: boolean): void {
    const list = sim.staff.shine.visible(view, now, this.vis);
    if (!list.length) return;
    ctx.save();
    for (const p of list) {
      if (p.gleam) continue;
      const level = shineLevel(p, now);
      const x = Math.round(p.x - p.rx);
      const y = Math.round(p.y - p.ry);
      // logo depois do mop o piso ainda está molhado: um tom mais escuro por baixo do verniz
      const wet = p.carpet ? 0 : Math.max(0, 1 - (now - p.at - p.grow) / 25_000) * Math.min(1, level * 2);
      if (wet > 0.01) {
        ctx.globalAlpha = wet;
        ctx.drawImage(sheenSprite(p.rx, p.ry, 'wet', 0), x, y);
      }
      ctx.globalAlpha = level;
      ctx.drawImage(sheenSprite(p.rx, p.ry, p.carpet ? 'carpet' : 'gloss', p.seed % 3), x, y);
    }
    if (!still) {
      for (const p of list) {
        if (p.carpet || p.gleam) continue;
        const level = shineLevel(p, now);
        let g = glintCache.get(p);
        if (!g) glintCache.set(p, (g = glints(p)));
        for (const [dx, dy, ph] of g) {
          // piscadas curtas, cada brilhinho no seu ritmo
          const t = (now / (800 + ph * 600) + ph) % 1;
          const k = Math.pow(Math.sin(Math.PI * t), 4);
          if (k * level < 0.08) continue;
          star(ctx, Math.round(p.x + dx), Math.round(p.y + dy), Math.min(1, k * level * 1.2));
        }
      }
    }
    ctx.restore();
  }

  /**
   * Brilho do que foi limpo à mão (vaso, pia, espelho, torneira), por cima dos móveis: um reflexo diagonal e uma
   * estrelinha que somem no ritmo do piso. Logo depois do pano, o reflexo atravessa a peça (o "rangido" do espelho).
   */
  drawGleams(ctx: CanvasRenderingContext2D, sim: Sim, now: number, view: ShineView, still: boolean): void {
    const list = sim.staff.shine.visible(view, now, this.vis);
    if (!list.length) return;
    ctx.save();
    for (const p of list) {
      if (!p.gleam) continue;
      const level = shineLevel(p, now);
      const after = now - p.at - p.grow;
      // varredura rápida logo depois do pano (sem movimento: o reflexo fica parado no meio)
      const sweep = !still && after >= 0 && after < 900 ? after / 900 : -1;
      const ox = sweep >= 0 ? Math.round((sweep - 0.5) * p.rx * 2.4) : 0;
      const x = Math.round(p.x) + ox;
      const y = Math.round(p.y);
      ctx.globalAlpha = Math.min(1, level * (sweep >= 0 ? 1 : 0.85));
      ctx.fillStyle = '#ffffff';
      for (let k = -2; k <= 2; k++) ctx.fillRect(x + k, y - k, 1, 1);
      ctx.globalAlpha = Math.min(1, level * 0.5);
      ctx.fillStyle = '#9fd8f2';
      for (let k = -1; k <= 1; k++) ctx.fillRect(x + k + 1, y - k, 1, 1);
      // estrelinha no canto (pisca devagar; sem movimento, fica acesa)
      const tw = still ? 0.8 : 0.45 + 0.55 * Math.pow(Math.sin(now / 520 + (p.seed % 7)), 2);
      const big = sweep >= 0 ? 1 : tw;
      if (level * big > 0.08) star(ctx, Math.round(p.x) + 3, Math.round(p.y) - 3, Math.min(1, level * big));
    }
    ctx.restore();
  }

  /** À noite, por cima da escuridão: o reflexo quente das luzes no piso limpo (sutil). */
  drawNight(ctx: CanvasRenderingContext2D, sim: Sim, now: number, view: ShineView, night: number): void {
    if (night < 0.05) return;
    const list = sim.staff.shine.visible(view, now, this.vis);
    if (!list.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffe2a6';
    for (const p of list) {
      if (p.carpet || p.gleam) continue;
      const a = shineLevel(p, now) * night;
      if (a < 0.02) continue;
      // faixa vertical (a luminária refletida) e um ponto mais forte no meio
      const x = Math.round(p.x - 3 + (p.seed % 5));
      const y = Math.round(p.y - p.ry * 0.6);
      ctx.globalAlpha = 0.16 * a;
      ctx.fillRect(x - 1, y, 3, Math.round(p.ry * 1.2));
      ctx.globalAlpha = 0.3 * a;
      ctx.fillRect(x, y + 2, 1, Math.round(p.ry * 0.8));
      ctx.globalAlpha = 0.12 * a;
      ctx.fillRect(Math.round(p.x - p.rx * 0.5), Math.round(p.y + 1), Math.round(p.rx), 1);
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------ cartão (overlay, espaço de tela)

/**
 * Cartãozinho acima da cabeça de alguém da equipe: faixa na cor do uniforme, "Nome · Função" e o que está fazendo.
 * (x, y) = ponto acima da cabeça, em px CSS.
 */
export function drawStaffCard(ctx: CanvasRenderingContext2D, x: number, y: number, card: { name: string; role: string; doing: string | null; color: string }, font: string, viewW: number): void {
  const title = `${card.name} · ${card.role}`;
  const titleFont = `700 11.5px ${font}`;
  const subFont = `500 10.5px ${font}`;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.font = titleFont;
  const tw = ctx.measureText(title).width;
  ctx.font = subFont;
  const sw = card.doing ? ctx.measureText(card.doing).width : 0;
  const w = Math.round(Math.max(tw, sw) + 24);
  const h = card.doing ? 36 : 22;
  const bx = Math.round(Math.max(4, Math.min(viewW - w - 4, x - w / 2)));
  const by = Math.round(y - h - 10);
  ctx.fillStyle = 'rgba(16,20,32,0.28)';
  ctx.beginPath();
  ctx.roundRect(bx, by + 2, w, h, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(22,27,40,0.95)';
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, 8);
  ctx.fill();
  // faixa do uniforme e a setinha para a pessoa
  ctx.fillStyle = card.color;
  ctx.beginPath();
  ctx.roundRect(bx + 5, by + 5, 4, h - 10, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(22,27,40,0.95)';
  ctx.beginPath();
  ctx.moveTo(Math.round(x) - 5, by + h);
  ctx.lineTo(Math.round(x) + 5, by + h);
  ctx.lineTo(Math.round(x), by + h + 6);
  ctx.fill();
  ctx.font = titleFont;
  ctx.fillStyle = '#f5f7fb';
  ctx.fillText(title, bx + 14, by + (card.doing ? 12 : h / 2 + 0.5));
  if (card.doing) {
    ctx.font = subFont;
    ctx.fillStyle = '#aeb8cc';
    ctx.fillText(card.doing, bx + 14, by + 26);
  }
  ctx.restore();
}

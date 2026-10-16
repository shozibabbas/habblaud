// Desenho da mesquita do campus que não cabe nos móveis: o desenho dos tapetes de oração sobre o carpete (linhas
// dos safs e um arco apontando para a qibla em cada lugar), a cúpula e os minaretes acima da parede norte, o fio
// d'água das torneiras da ablução e, à noite, as janelas em arco acesas, a cúpula iluminada e as lâmpadas dos
// minaretes. Tudo em cache (canvas pronto); por frame só drawImage e alguns retângulos.
import { MOSQUE, westArch } from '../../art/furniture/mosque';
import { PixelBuf } from '../../art/core/pixbuf';
import { TILE } from '../../art/api';
import type { BuildingLayout } from '../layout/building';
import { CARPET, MEN_ID, SAF_X, WOMEN_ID, type MosqueSite } from '../layout/mosque';
import type { AreaVis } from './scene';

/** Folga (px) do sprite da silhueta à esquerda/direita do prédio (minaretes fora dos cantos). */
const SKY_SIDE = 28;
/** Altura (px) da silhueta acima do topo do prédio. */
const SKY_UP = 128;
/** Minaretes: x (px, relativo ao canto do prédio) do centro de cada um e altura total. */
const MINARET_DX = [-14, 30 * TILE + 14] as const;
const MINARET_TOP = -118;
/** Cúpula principal sobre o salão masculino (centro x, raio, altura) e a menor sobre a entrada. */
const DOME = { cx: 148, rx: 40, h: 46 };
const SMALL_DOME = { cx: 388, rx: 20, h: 24 };

function toCanvas(buf: PixelBuf): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, buf.w);
  c.height = Math.max(1, buf.h);
  const ctx = c.getContext('2d');
  if (ctx) ctx.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
  return c;
}

// ------------------------------------------------------------------ silhueta (puro)

/** Meia-largura de uma cúpula em bulbo (leve barriga acima da base) na altura relativa t (0 = base, 1 = topo). */
function domeHalf(rx: number, t: number): number {
  const belly = 1 + 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.6));
  const round = Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2)));
  return rx * round * belly * (t > 0.82 ? 1 - (t - 0.82) * 2.2 : 1);
}

function dome(b: PixelBuf, cx: number, baseY: number, rx: number, h: number): void {
  const st = MOSQUE.stone;
  // tambor com janelinhas
  const dw = Math.round(rx * 1.5);
  b.rect(cx - dw / 2, baseY - 8, dw, 8, st.base);
  b.hline(cx - dw / 2, cx + dw / 2 - 1, baseY - 8, st.hi);
  b.vline(cx + dw / 2 - 1, baseY - 8, baseY - 1, st.dk);
  for (let x = cx - dw / 2 + 4; x < cx + dw / 2 - 4; x += 7) {
    b.rect(x, baseY - 6, 3, 4, '#5f8fae');
    b.set(x + 1, baseY - 7, '#5f8fae');
  }
  b.hline(cx - dw / 2 - 1, cx + dw / 2, baseY - 9, MOSQUE.green.base);
  // bulbo de mármore claro, luz vindo de cima/esquerda
  const top = baseY - 9;
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const half = domeHalf(rx, t);
    if (half < 0.5) continue;
    const l = Math.round(cx - half);
    const r = Math.round(cx + half);
    for (let x = l; x <= r; x++) {
      const u = (x - cx) / Math.max(1, half);
      const c = u < -0.55 ? st.hi : u < 0.15 ? st.lt : u < 0.6 ? st.base : st.dk;
      b.set(x, top - y, c);
    }
  }
  // gomos sutis
  for (const u of [-0.5, 0, 0.5]) {
    for (let y = 2; y < h * 0.8; y++) {
      const half = domeHalf(rx, y / h);
      b.set(Math.round(cx + u * half), top - y, 'rgba(150,140,120,0.25)');
    }
  }
  // remate dourado com o crescente
  finial(b, cx, top - h + 1);
}

/** Haste dourada com esferas e o crescente no alto. */
function finial(b: PixelBuf, cx: number, y: number): void {
  const g = MOSQUE.gold;
  b.vline(cx, y - 10, y, g.base);
  b.rect(cx - 1, y - 4, 3, 3, g.base);
  b.set(cx - 1, y - 4, g.hi);
  b.rect(cx - 1, y - 8, 3, 2, g.dk);
  // crescente: disco dourado menos um disco deslocado (abertura para cima/direita)
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const inA = dx * dx + dy * dy <= 9;
      const inB = (dx - 1.4) * (dx - 1.4) + (dy + 1.2) * (dy + 1.2) <= 6;
      if (inA && !inB) b.set(cx + dx, y - 14 + dy, dx < 0 ? g.hi : g.base);
    }
  }
}

/** Minarete octogonal: base, fuste com faixas, duas varandas, quiosque com cúpula e remate. */
function minaret(b: PixelBuf, cx: number, groundY: number): void {
  const st = MOSQUE.stone;
  const gr = MOSQUE.green;
  const shaft = (y0: number, y1: number, w: number) => {
    for (let y = y0; y <= y1; y++) {
      const l = cx - Math.floor(w / 2);
      b.hline(l, l + w - 1, y, st.base);
      b.vline(l, y, y, st.hi);
      b.vline(l + 1, y, y, st.lt);
      b.vline(l + w - 2, y, y, st.dk);
      b.vline(l + w - 1, y, y, st.dd);
    }
  };
  const balcony = (y: number, w: number) => {
    const l = cx - Math.floor(w / 2);
    b.rect(l, y, w, 3, st.lt);
    b.hline(l, l + w - 1, y, st.hi);
    b.hline(l, l + w - 1, y + 2, st.dk);
    for (let x = l + 1; x < l + w - 1; x += 2) b.vline(x, y - 4, y - 1, st.base);
    b.hline(l, l + w - 1, y - 5, st.lt);
  };
  // base quadrada
  b.rect(cx - 9, groundY - 18, 18, 18, st.base);
  b.hline(cx - 9, cx + 8, groundY - 18, st.hi);
  b.vline(cx + 8, groundY - 18, groundY - 1, st.dk);
  b.rect(cx - 3, groundY - 13, 6, 9, '#3d4a5a');
  b.set(cx - 2, groundY - 14, '#3d4a5a');
  b.set(cx + 1, groundY - 14, '#3d4a5a');
  // fuste em dois lances com faixas verdes
  shaft(groundY - 70, groundY - 19, 12);
  for (const y of [groundY - 30, groundY - 46, groundY - 62]) b.hline(cx - 6, cx + 5, y, gr.base);
  for (const y of [groundY - 40, groundY - 56]) b.rect(cx - 1, y, 2, 4, '#3d4a5a');
  balcony(groundY - 73, 18);
  shaft(groundY - 98, groundY - 74, 9);
  b.rect(cx - 1, groundY - 90, 2, 4, '#3d4a5a');
  balcony(groundY - 101, 14);
  // quiosque (colunetas) e a cúpula pontuda
  b.vline(cx - 5, groundY - 112, groundY - 106, st.dk);
  b.vline(cx + 4, groundY - 112, groundY - 106, st.dk);
  b.vline(cx - 1, groundY - 112, groundY - 106, st.base);
  b.rect(cx - 6, groundY - 114, 12, 2, st.lt);
  for (let y = 0; y < 9; y++) {
    const half = Math.round(6 * Math.sqrt(1 - y / 9));
    b.hline(cx - half, cx + half - 1, groundY - 115 - y, y < 3 ? st.lt : st.hi);
    b.set(cx + half - 1, groundY - 115 - y, st.dk);
  }
  finial(b, cx, groundY - 123);
}

/** Pequenos quiosques (chhatris) nos cantos da fachada. */
function chhatri(b: PixelBuf, cx: number, baseY: number): void {
  const st = MOSQUE.stone;
  b.rect(cx - 6, baseY - 2, 12, 2, st.lt);
  b.vline(cx - 5, baseY - 9, baseY - 3, st.dk);
  b.vline(cx + 4, baseY - 9, baseY - 3, st.dk);
  b.rect(cx - 7, baseY - 11, 14, 2, st.lt);
  for (let y = 0; y < 6; y++) {
    const half = Math.round(6 * Math.sqrt(1 - y / 6));
    b.hline(cx - half, cx + half - 1, baseY - 12 - y, st.hi);
  }
  b.vline(cx, baseY - 21, baseY - 18, MOSQUE.gold.base);
}

/** Sprite da silhueta (cúpulas, chhatris, minaretes) com origem no canto superior esquerdo do prédio. */
export function skylineBuf(): { buf: PixelBuf; ox: number; oy: number } {
  const w = 30 * TILE + SKY_SIDE * 2;
  const buf = new PixelBuf(w, SKY_UP + 2 * TILE + 4);
  buf.ox = SKY_SIDE;
  buf.oy = SKY_UP;
  // o topo da face norte fica em y = 0; a cúpula assenta logo acima dela
  dome(buf, DOME.cx, -1, DOME.rx, DOME.h);
  dome(buf, SMALL_DOME.cx, -1, SMALL_DOME.rx, SMALL_DOME.h);
  for (const cx of [10, 30 * TILE - 10, 296]) chhatri(buf, cx, -1);
  for (const dx of MINARET_DX) minaret(buf, dx, 2 * TILE);
  buf.ox = 0;
  buf.oy = 0;
  buf.outline();
  return { buf, ox: SKY_SIDE, oy: SKY_UP };
}

// ------------------------------------------------------------------ renderer

export class MosqueRenderer {
  private sky: { canvas: HTMLCanvasElement; ox: number; oy: number } | null = null;
  private decor: { canvas: HTMLCanvasElement; key: string; x: number; y: number } | null = null;

  /** Desenho dos tapetes sobre o carpete das alas (depois dos pisos, antes dos móveis). */
  drawFloor(ctx: CanvasRenderingContext2D, building: BuildingLayout): void {
    const site = building.campus?.mosque;
    if (!site) return;
    const key = `${site.rect.x},${site.rect.y}`;
    if (!this.decor || this.decor.key !== key) this.decor = { ...floorDecor(site), key };
    ctx.drawImage(this.decor.canvas, this.decor.x, this.decor.y);
  }

  /** Cúpulas e minaretes acima da parede norte (depois das paredes, antes das entidades). */
  drawSkyline(ctx: CanvasRenderingContext2D, building: BuildingLayout): void {
    const site = building.campus?.mosque;
    if (!site) return;
    if (!this.sky) {
      const s = skylineBuf();
      this.sky = { canvas: toCanvas(s.buf), ox: s.ox, oy: s.oy };
    }
    ctx.drawImage(this.sky.canvas, site.rect.x * TILE - this.sky.ox, site.rect.y * TILE - this.sky.oy);
  }

  /** À noite (por cima da escuridão): janelas em arco acesas, cúpula iluminada de baixo e as lâmpadas dos minaretes. */
  drawNight(ctx: CanvasRenderingContext2D, building: BuildingLayout, areas: ReadonlyMap<string, AreaVis>, night: number, now: number): void {
    const site = building.campus?.mosque;
    if (!site || night < 0.12) return;
    const k = Math.min(1, (night - 0.12) / 0.5);
    const x0 = site.rect.x * TILE;
    const y0 = site.rect.y * TILE;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // vidro das janelas em arco: luz quente
    for (const id of [MEN_ID, WOMEN_ID]) {
      const vis = areas.get(id);
      if (!vis) continue;
      for (const w of vis.wallItems) {
        if (w.kind !== 'arch_window') continue;
        ctx.fillStyle = `rgba(255,196,110,${0.55 * k})`;
        archPath(ctx, w.cx - 7, w.baseY - 24, 14, 16);
        ctx.fill();
      }
    }
    // cúpulas lavadas de luz (holofote de baixo) e as lâmpadas dos minaretes, piscando de leve
    for (const d of [DOME, SMALL_DOME]) {
      const g = ctx.createRadialGradient(x0 + d.cx, y0 - 6, 2, x0 + d.cx, y0 - d.h * 0.4, d.rx * 1.3);
      g.addColorStop(0, `rgba(255,214,150,${0.5 * k})`);
      g.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x0 + d.cx - d.rx * 1.4, y0 - d.h - 20, d.rx * 2.8, d.h + 24);
    }
    const flicker = 0.9 + 0.1 * Math.sin(now / 700);
    for (const dx of MINARET_DX) {
      for (const [dy, r] of [[2 * TILE - 76, 10], [2 * TILE - 104, 9], [2 * TILE + MINARET_TOP - 23, 6]] as const) {
        const cx = x0 + dx;
        const cy = y0 + dy;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2);
        g.addColorStop(0, `rgba(180,255,200,${0.75 * k * flicker})`);
        g.addColorStop(0.35, `rgba(120,230,160,${0.35 * k * flicker})`);
        g.addColorStop(1, 'rgba(120,230,160,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
      }
    }
    ctx.restore();
  }
}

/** Quanto dura o brilho do chamado para a oração (ms). */
export const CALL_GLOW_MS = 7_000;

/**
 * Chamado para a oração (menu Atividades): as lâmpadas dos minaretes e o alto das cúpulas brilham em verde e
 * dourado por alguns segundos, de dia também. Sem som. Com movimento reduzido, o brilho fica parado (sem pulsar).
 */
export function drawCallToPrayer(ctx: CanvasRenderingContext2D, building: BuildingLayout, at: number, now: number, still: boolean): void {
  const site = building.campus?.mosque;
  const t = now - at;
  if (!site || !at || t < 0 || t > CALL_GLOW_MS) return;
  // entra em 0,6 s, fica e some no último 1,5 s
  const env = Math.min(1, t / 600) * Math.min(1, (CALL_GLOW_MS - t) / 1_500);
  const pulse = still ? 1 : 0.8 + 0.2 * Math.sin(t / 260);
  const k = env * pulse;
  const x0 = site.rect.x * TILE;
  const y0 = site.rect.y * TILE;
  const glow = (cx: number, cy: number, r: number, inner: string, outer: string) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, inner);
    g.addColorStop(0.4, outer);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const dx of MINARET_DX) {
    for (const [dy, r] of [[2 * TILE - 76, 18], [2 * TILE - 104, 16], [2 * TILE + MINARET_TOP - 23, 14]] as const) {
      glow(x0 + dx, y0 + dy, r * 1.6, `rgba(200,255,210,${0.85 * k})`, `rgba(110,230,150,${0.35 * k})`);
    }
  }
  // o crescente no alto das cúpulas
  for (const d of [DOME, SMALL_DOME]) glow(x0 + d.cx, y0 - d.h - 10, d.rx * 0.9, `rgba(255,236,160,${0.9 * k})`, `rgba(255,200,90,${0.35 * k})`);
  if (!still) {
    // um anel de luz que se abre a partir da cúpula grande
    const u = (t % 2_400) / 2_400;
    ctx.strokeStyle = `rgba(255,226,140,${0.35 * env * (1 - u)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x0 + DOME.cx, y0 - DOME.h * 0.4, DOME.rx * (0.8 + u * 2.4), DOME.h * (0.5 + u * 1.4), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function archPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + w * 0.45);
  ctx.quadraticCurveTo(x, y, x + w / 2, y - 3);
  ctx.quadraticCurveTo(x + w, y, x + w, y + w * 0.45);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

// ------------------------------------------------------------------ tapetes

/**
 * Tapetes de oração sobre o carpete das duas alas: uma faixa clara em cada linha de saf (onde ficam os pés) e,
 * em cada lugar, um arco apontando para a qibla (oeste) com a borda dourada — o desenho dos tapetes de mesquita.
 */
function floorDecor(site: MosqueSite): { canvas: HTMLCanvasElement; x: number; y: number } {
  const w = site.rect.w * TILE;
  const h = site.rect.h * TILE;
  const b = new PixelBuf(w, h);
  const sections = [
    { s: 'm' as const, y0: 2, y1: 12, hallW: 18 },
    { s: 'f' as const, y0: 13 + 2, y1: 13 + 11, hallW: 14 },
  ];
  for (const sec of sections) {
    const [c1] = CARPET[sec.s];
    const edge = '#d8b45a';
    const fill = sec.s === 'm' ? '#2b6450' : '#743140';
    const xs = SAF_X[sec.s];
    for (let i = 0; i < xs.length; i++) {
      const fx = xs[i] * TILE;
      // cada tapete vai da linha dos pés (leste) até perto do próximo saf (oeste)
      const x1 = fx + TILE - 2;
      const x0 = i === 0 ? TILE + 6 : xs[i - 1] * TILE + TILE + 2;
      for (let ty = sec.y0; ty < sec.y1; ty++) {
        const y = ty * TILE;
        westArch(b, x0, y + 1, x1 - x0, TILE - 2, edge, fill);
        // franja/miolo: losango no centro do tapete
        const mx = Math.round((x0 + x1) / 2);
        b.set(mx, y + 7, edge);
        b.set(mx - 1, y + 8, edge);
        b.set(mx + 1, y + 8, edge);
        b.set(mx, y + 9, edge);
      }
      // linha do saf
      b.rect(x1, sec.y0 * TILE, 2, (sec.y1 - sec.y0) * TILE, 'rgba(240,226,180,0.7)');
    }
    // borda do carpete junto à treliça
    b.rect(TILE * 1, sec.y0 * TILE - 1, (sec.hallW - 1) * TILE, 1, `${c1}`);
  }
  return { canvas: toCanvas(b), x: site.rect.x * TILE, y: site.rect.y * TILE };
}

/** Fio d'água da torneira aberta (px de mundo: bico em (x, y)), com gotas descendo até a canaleta. */
export function drawWuduWater(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
  ctx.fillStyle = 'rgba(150,210,248,0.85)';
  ctx.fillRect(x, y, 2, 10);
  ctx.fillStyle = 'rgba(235,248,255,0.9)';
  ctx.fillRect(x, y, 1, 10);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 2; i++) {
    const ph = ((now / 420 + i / 2) % 1 + 1) % 1;
    ctx.globalAlpha = 0.9 - ph * 0.5;
    ctx.fillRect(x, Math.round(y + ph * 10), 1, 1);
  }
  ctx.globalAlpha = 1;
  // respingo na canaleta
  const sp = Math.floor(now / 160) % 3;
  ctx.fillStyle = 'rgba(200,236,255,0.8)';
  ctx.fillRect(x - 1 - sp, y + 10, 1, 1);
  ctx.fillRect(x + 1 + sp, y + 10, 1, 1);
}

/**
 * Turbahs (sajdagahs: tabletes de barro) no carpete, diante de quem reza no estilo shia: o mesmo desenho e o mesmo
 * lugar da que a arte põe sob a testa no sujood (art/character/prayer.ts drawTurbah). (x, y) = canto esquerdo da base.
 */
export function drawTurbahs(ctx: CanvasRenderingContext2D, at: Iterable<{ x: number; y: number }>): void {
  for (const t of at) {
    ctx.fillStyle = 'rgba(28,32,52,0.28)';
    ctx.fillRect(t.x + 1, t.y + 1, 8, 1);
    ctx.fillStyle = '#c2b6a5';
    ctx.fillRect(t.x + 1, t.y - 2, 6, 1);
    ctx.fillStyle = '#9a8e7e';
    ctx.fillRect(t.x, t.y - 1, 8, 1);
    ctx.fillStyle = '#b3a797';
    ctx.fillRect(t.x + 2, t.y - 1, 1, 1);
    ctx.fillStyle = '#71675a';
    ctx.fillRect(t.x + 1, t.y, 6, 1);
  }
}

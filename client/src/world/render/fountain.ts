// Fonte da praça do campus: bacia de pedra com uma faixa de mosaico e, no meio, uma jubarte saltando de uma rocha,
// de boca aberta, soltando um jato que chove de volta na bacia; dois golfinhos saltando junto à borda cospem arcos
// d'água pela boca na direção dela. E os passarinhos: de vez em quando um bando (pombos, pardais ou os dois) chega
// voando, uns pousam na borda para beber (outros só ficam sentados ali ou nas costas dos golfinhos), outros ciscam
// no chão e sobem na borda para beber, e depois o bando vai embora. A pedra e as esculturas ficam em cache; por
// frame só a água (jato, arcos, ondinhas, brilhos) e os pássaros, com retângulos de 1 px.
import type { ExteriorLayout } from '../layout/exterior';
import type { ExteriorProp } from '../layout/types';
import { glowSprite } from './props';

/** Bacia: semi-eixos (px) da elipse no chão. A âncora (x, y) da prop é a borda sul da bacia, no chão. */
export const FOUNTAIN_RX = 36;
export const FOUNTAIN_RY = 18;
const RX = FOUNTAIN_RX;
const RY = FOUNTAIN_RY;
/** Altura da mureta e centro da elipse do topo dela. */
const RIM_H = 6;
const TOP_Y = -RY - RIM_H;
/** Beirada interna da mureta e o espelho d'água (um pouco abaixo da beirada). */
const LIP = { rx: 31, ry: 14 };
const WATER = { cy: TOP_Y + 2, rx: 30, ry: 13 };
const WL = WATER.cy;
type Pt = readonly [number, number];
/** Escultura de bicho (baleia ou golfinho): espinha em Bézier da cauda ao focinho e a meia-espessura ao longo dela. */
interface Beast {
  p: readonly [Pt, Pt, Pt];
  /** Meia-espessura por trecho (s de 0 = cauda a 1 = focinho). */
  w: readonly Pt[];
  /** Lado das costas: +1 à esquerda de quem vai da cauda ao focinho (no golfinho virado para a esquerda, -1). */
  back: 1 | -1;
  pal: { top: string; body: string; hi: string; belly: string; pleat?: string; fin: string; finDk: string };
  /** s da barbatana dorsal (golfinho). */
  dorsal?: number;
  /** Nadadeiras peitorais: lado (+1 costas, atrás do corpo; -1 barriga, na frente), direção e comprimento. */
  flippers: readonly { s: number; side: 1 | -1; dir: Pt; len: number }[];
  eye: number;
}
const WHALE: Beast = {
  p: [
    [0, -21],
    [-7, -43],
    [1, -63],
  ],
  w: [
    [0, 5],
    [0.15, 6.5],
    [0.4, 7],
    [0.62, 6.4],
    [0.8, 5.4],
    [0.92, 4.2],
    [1, 3.2],
  ],
  back: 1,
  pal: { top: '#2f4a73', body: '#3f6696', hi: '#6e98c6', belly: '#d6e2ea', pleat: '#a6bacb', fin: '#e6edf2', finDk: '#a9bccb' },
  // as nadadeiras longas e brancas da jubarte
  flippers: [
    { s: 0.5, side: 1, dir: [-0.85, 0.5], len: 10 },
    { s: 0.5, side: -1, dir: [0.75, 0.66], len: 13 },
  ],
  eye: 0.85,
};
const DOLPHIN_W: readonly Pt[] = [
  [0, 1.2],
  [0.12, 2],
  [0.32, 3],
  [0.5, 3.4],
  [0.7, 3],
  [0.84, 2.3],
  [0.88, 1.4],
  [1, 1.1],
];
const DOLPHIN_PAL = { top: '#56667c', body: '#8394a9', hi: '#b6c3d2', belly: '#eef2f5', fin: '#56667c', finDk: '#3f4d60' };
/** Golfinho saltando junto à borda oeste, de cabeça erguida para a baleia; o do leste é o espelho dele. */
function dolphin(flip: boolean): Beast {
  const m = (x: number) => (flip ? -x : x);
  return {
    p: [
      [m(-22), -20],
      [m(-26), -34],
      [m(-16), -43],
    ],
    w: DOLPHIN_W,
    back: flip ? -1 : 1,
    pal: DOLPHIN_PAL,
    dorsal: 0.5,
    flippers: [{ s: 0.62, side: -1, dir: [m(0.55), 0.83], len: 4 }],
    eye: 0.82,
  };
}
const DOLPHINS = [dolphin(false), dolphin(true)] as const;

/** Ponto da espinha em s: posição, tangente, normal para o lado das costas e a meia-espessura. */
function spine(b: Beast, s: number): { x: number; y: number; tx: number; ty: number; nx: number; ny: number; w: number } {
  const [p0, p1, p2] = b.p;
  const u = 1 - s;
  const x = u * u * p0[0] + 2 * u * s * p1[0] + s * s * p2[0];
  const y = u * u * p0[1] + 2 * u * s * p1[1] + s * s * p2[1];
  let tx = 2 * u * (p1[0] - p0[0]) + 2 * s * (p2[0] - p1[0]);
  let ty = 2 * u * (p1[1] - p0[1]) + 2 * s * (p2[1] - p1[1]);
  const l = Math.hypot(tx, ty) || 1;
  tx /= l;
  ty /= l;
  let w = b.w[b.w.length - 1][1];
  for (let i = 1; i < b.w.length; i++) {
    const [s1, w1] = b.w[i];
    if (s > s1) continue;
    const [s0, w0] = b.w[i - 1];
    w = w0 + ((w1 - w0) * (s - s0)) / (s1 - s0 || 1);
    break;
  }
  return { x, y, tx, ty, nx: ty * b.back, ny: -tx * b.back, w };
}
/** Boca (de onde sai a água): logo à frente do focinho. */
function mouthOf(b: Beast): Pt {
  const e = spine(b, 1);
  return [Math.round(e.x + e.tx * 1.5), Math.round(e.y + e.ty * 1.5)];
}
/** Onde os arcos dos golfinhos caem: na água diante da rocha. */
const ARC_LAND: readonly Pt[] = [
  [-10, -16],
  [10, -16],
];
/** Alguns pontos onde a chuva do jato bate na água (só para os anéis). */
const CROWN_LAND: readonly Pt[] = [
  [-17, -27],
  [16, -29],
  [-21, -18],
  [20, -17],
  [-4, -12],
  [6, -33],
];
/** Canvas da pedra: origem local (0, 0) em (OX, OY). */
const OX = 46;
const OY = 84;
const CW = 92;
const CH = 92;

const OUTLINE = '#3e4656';
const RIM = '#e6dfd1';
const RIM_HI = '#f6f2ea';
const RIM_SH = '#cdc5b5';
const SEAM = '#bdb4a3';
const INNER = '#8f877a';
const INNER_DK = '#7a7368';
const W_DEEP = '#2c76a3';
const W_MID = '#3d9bc6';
const W_LIGHT = '#6cc0e0';
const W_HI = '#a8e2f3';
const FOAM = '#eefaff';
/** Face da mureta por linha (de cima para baixo), cada uma em [luz, meio, sombra]; a linha 2 é o mosaico. */
const FACE: [string, string, string][] = [
  ['#f1ebdf', '#ddd5c6', '#c4bcad'],
  ['#d9d1c1', '#c6bdad', '#a9a091'],
  ['#4fb3a5', '#3a9c90', '#2a7a72'],
  ['#d0c8b8', '#bdb4a3', '#a1988a'],
  ['#c3baa9', '#ada493', '#91897b'],
  ['#9a9283', '#8a8274', '#756e62'],
];
const GOLD: [string, string, string] = ['#f3c95e', '#e2b44f', '#b98f37'];

const inE = (x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean => {
  const dx = (x + 0.5 - cx) / rx;
  const dy = (y + 0.5 - cy) / ry;
  return dx * dx + dy * dy <= 1;
};
const frac = (v: number) => v - Math.floor(v);
const hash = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Ponto dentro do espelho d'água da bacia (e não sob a beirada). */
const inWater = (x: number, y: number) => inE(x, y, 0, WATER.cy, WATER.rx - 0.5, WATER.ry - 0.5) && inE(x, y, 0, TOP_Y, LIP.rx - 0.5, LIP.ry - 0.5);

// ------------------------------------------------------------------ pedra (cache)

class Buf {
  readonly img = new ImageData(CW, CH);
  set(x: number, y: number, c: string, a = 255): void {
    const px = x + OX;
    const py = y + OY;
    if (px < 0 || py < 0 || px >= CW || py >= CH) return;
    const n = parseInt(c.slice(1), 16);
    const i = (py * CW + px) * 4;
    const d = this.img.data;
    d[i] = (n >> 16) & 255;
    d[i + 1] = (n >> 8) & 255;
    d[i + 2] = n & 255;
    d[i + 3] = a;
  }
  solid(x: number, y: number): boolean {
    const px = x + OX;
    const py = y + OY;
    if (px < 0 || py < 0 || px >= CW || py >= CH) return false;
    return this.img.data[(py * CW + px) * 4 + 3] === 255;
  }
  /** Contorno escuro em volta do que está opaco (sobre a sombra, por baixo de nada); `skip` deixa trechos sem. */
  outline(skip?: (x: number, y: number) => boolean): void {
    const at: [number, number][] = [];
    for (let y = -OY; y < CH - OY; y++) {
      for (let x = -OX; x < CW - OX; x++) {
        if (this.solid(x, y) || skip?.(x, y)) continue;
        if (this.solid(x - 1, y) || this.solid(x + 1, y) || this.solid(x, y - 1) || this.solid(x, y + 1)) at.push([x, y]);
      }
    }
    for (const [x, y] of at) this.set(x, y, OUTLINE);
  }
  canvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = CH;
    c.getContext('2d')!.putImageData(this.img, 0, 0);
    return c;
  }
}

/** Tom [luz, meio, sombra] conforme o x (luz vem da esquerda). */
const side = (x: number, half: number) => (x < -half * 0.4 ? 0 : x > half * 0.45 ? 2 : 1);

function waterBase(x: number, y: number): string {
  const ny = (y + 0.5 - WATER.cy) / WATER.ry;
  const h = hash(x, y);
  if (ny < -0.6) return h < 0.08 ? W_MID : W_DEEP; // sombra da mureta ao norte
  if (ny > 0.5 && h < 0.2) return W_LIGHT; // céu refletido perto da borda da frente
  return h < 0.02 ? W_LIGHT : W_MID;
}

/** Bacia de baixo: sombra, topo da mureta (com as juntas das pedras), espelho d'água e a face com mosaico. */
function paintBasin(): HTMLCanvasElement {
  const b = new Buf();
  for (let y = -OY; y < CH - OY; y++) for (let x = -OX; x < CW - OX; x++) if (inE(x, y, 5, -RY + 3, RX + 3, RY + 3)) b.set(x, y, '#1c2434', 56);
  for (let y = TOP_Y - RY - 1; y <= 2; y++) {
    for (let x = -RX; x < RX; x++) {
      if (inE(x, y, 0, TOP_Y, RX, RY)) {
        if (inE(x, y, 0, TOP_Y, LIP.rx, LIP.ry)) {
          if (inE(x, y, 0, WATER.cy, WATER.rx, WATER.ry)) b.set(x, y, waterBase(x, y));
          else b.set(x, y, y < TOP_Y - LIP.ry + 2 ? INNER_DK : INNER); // parede interna ao norte
          continue;
        }
        const nx = (x + 0.5) / RX;
        const ny = (y + 0.5 - TOP_Y) / RY;
        const r = Math.hypot(nx, ny);
        let c = RIM;
        if (r > 0.93 && ny < 0.1 && nx < 0.6) c = RIM_HI; // aresta externa voltada para a luz
        else if (nx > 0.55 && ny > -0.2) c = RIM_SH;
        if (ny > 0.2 && inE(x, y, 0, TOP_Y, LIP.rx + 1.6, LIP.ry + 1.3)) c = RIM_HI; // beirada interna da frente
        const seg = Math.atan2(ny, nx) / (Math.PI / 7);
        if (Math.abs(seg - Math.round(seg)) < 0.05) c = SEAM;
        b.set(x, y, c);
        continue;
      }
      const fx = (x + 0.5) / RX;
      if (Math.abs(fx) >= 1) continue;
      const d = y + 0.5 - (TOP_Y + RY * Math.sqrt(1 - fx * fx));
      if (d <= 0 || d > RIM_H) continue;
      const row = Math.ceil(d) - 1;
      const pal = row === 2 && (x + 200) % 4 === 0 ? GOLD : FACE[row];
      b.set(x, y, pal[side(x, RX)]);
    }
  }
  b.outline();
  return b.canvas();
}

/** Rocha no meio da bacia, de onde a baleia salta (musgo no alto, pedra molhada rente à água). */
function paintRock(b: Buf): void {
  const blobs: [number, number, number, number][] = [
    [0, -24, 7, 4.5],
    [-7, -22, 5, 3.5],
    [7, -22, 5, 3.5],
    [-3, -28, 4, 3],
    [4, -27, 4, 3],
  ];
  for (let y = -34; y <= -16; y++) {
    for (let x = -13; x <= 13; x++) {
      const hit = blobs.find(([cx, cy, rx, ry]) => inE(x, y, cx, cy, rx, ry));
      if (!hit) continue;
      const [cx, cy, rx, ry] = hit;
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const v = dx + dy;
      let c = v < -0.6 ? '#c3c9d1' : v < 0 ? '#a8afb9' : v < 0.6 ? '#8a929d' : '#6f7782';
      if (dy < -0.55 && hash(x, y) < 0.45) c = hash(y, x) < 0.5 ? '#6f9a58' : '#87b06a';
      if (y >= WL) c = '#5f6670';
      b.set(x, y, c);
    }
  }
}

/** Nadadeira: um traço que afina da raiz à ponta, com a borda de cima mais escura. */
function paintFlipper(b: Buf, beast: Beast, f: Beast['flippers'][number]): void {
  const e = spine(beast, f.s);
  const rx = e.x + e.nx * f.side * e.w * 0.7;
  const ry = e.y + e.ny * f.side * e.w * 0.7;
  const [dx, dy] = f.dir;
  for (let y = Math.floor(ry - f.len - 2); y <= ry + f.len + 2; y++) {
    for (let x = Math.floor(rx - f.len - 2); x <= rx + f.len + 2; x++) {
      const px = x + 0.5 - rx;
      const py = y + 0.5 - ry;
      const along = px * dx + py * dy;
      if (along < 0 || along > f.len) continue;
      const across = px * -dy + py * dx;
      const half = 1.7 - (along / f.len) * 1.1;
      if (Math.abs(across) > half) continue;
      b.set(x, y, across < -half * 0.3 ? beast.pal.finDk : beast.pal.fin);
    }
  }
}

/** Baleia ou golfinho: corpo pela espinha (costas escuras com brilho, barriga clara, pregas na garganta da jubarte),
 *  barbatana dorsal, nadadeiras, olho e a boca aberta na ponta do focinho. */
function paintBeast(b: Buf, beast: Beast): void {
  const N = 90;
  const pts = Array.from({ length: N + 1 }, (_, i) => ({ s: i / N, ...spine(beast, i / N) }));
  for (const f of beast.flippers) if (f.side > 0) paintFlipper(b, beast, f);
  if (beast.dorsal !== undefined) {
    // triângulo inclinado para trás, saindo das costas
    const a = spine(beast, beast.dorsal - 0.08);
    const c = spine(beast, beast.dorsal + 0.07);
    const top = spine(beast, beast.dorsal - 0.12);
    const A: Pt = [a.x + a.nx * a.w * 0.6, a.y + a.ny * a.w * 0.6];
    const C: Pt = [c.x + c.nx * c.w * 0.6, c.y + c.ny * c.w * 0.6];
    const T: Pt = [top.x + top.nx * (top.w + 4.5), top.y + top.ny * (top.w + 4.5)];
    const sgn = (p: Pt, q: Pt, r: Pt) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
    for (let y = Math.floor(Math.min(A[1], C[1], T[1])); y <= Math.max(A[1], C[1], T[1]); y++) {
      for (let x = Math.floor(Math.min(A[0], C[0], T[0])); x <= Math.max(A[0], C[0], T[0]); x++) {
        const P: Pt = [x + 0.5, y + 0.5];
        const d1 = sgn(P, A, C);
        const d2 = sgn(P, C, T);
        const d3 = sgn(P, T, A);
        if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
        b.set(x, y, beast.pal.top);
      }
    }
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  for (let y = Math.floor(Math.min(...ys) - 8); y <= Math.max(...ys) + 8; y++) {
    for (let x = Math.floor(Math.min(...xs) - 8); x <= Math.max(...xs) + 8; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let best = pts[0];
      let bd = Infinity;
      for (const p of pts) {
        const d = (px - p.x) ** 2 + (py - p.y) ** 2;
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (Math.sqrt(bd) > best.w) continue;
      const r = ((px - best.x) * best.nx + (py - best.y) * best.ny) / best.w;
      const pal = beast.pal;
      let c: string;
      if (best.s > 0.94 && Math.abs(r) < 0.3) c = '#3a2c38'; // boca aberta
      else if (r > 0.5) c = pal.top;
      else if (r > 0.25 && best.s > 0.25 && best.s < 0.62) c = pal.hi; // brilho da pedra pintada nas costas
      else if (r > -0.15) c = pal.body;
      else c = pal.pleat && best.s > 0.42 && Math.round(r * 9) % 2 === 0 ? pal.pleat : pal.belly;
      b.set(x, y, c);
    }
  }
  const eye = spine(beast, beast.eye);
  b.set(Math.floor(eye.x + eye.nx * eye.w * 0.2), Math.floor(eye.y + eye.ny * eye.w * 0.2), '#1b2130');
  for (const f of beast.flippers) if (f.side < 0) paintFlipper(b, beast, f);
}

/** A rocha com a jubarte e os dois golfinhos (por cima da água da bacia). */
function paintStatue(): HTMLCanvasElement {
  const b = new Buf();
  paintRock(b);
  paintBeast(b, WHALE);
  for (const d of DOLPHINS) paintBeast(b, d);
  // o que sai da água não leva contorno rente a ela
  b.outline((x, y) => y >= WL - 3 && inWater(x, y) && b.solid(x, y - 1));
  return b.canvas();
}

// ------------------------------------------------------------------ pássaros

type Species = 'pigeon' | 'sparrow';
type Pose = 'stand' | 'peck' | 'swallow' | 'sit' | 'preen' | 'fly1' | 'fly2' | 'glide';
type Act = 'stand' | 'peck' | 'swallow' | 'sit' | 'preen';

/** Moldes virados para a direita. b corpo, l peito, d asa/cauda, n pescoço furta-cor, h cabeça, e olho, k bico, f pés. */
const PIGEON: Record<Exclude<Pose, 'sit'>, string[]> = {
  stand: ['......hh..', '.....hehk.', '....nnhh..', '.bbbbnn...', 'ddbdbdbb..', '.dbllllb..', '...f..f...'],
  peck: ['..........', '..........', '.bbbb.....', 'ddbdbbnn..', '.dbllbnhh.', '....l..hek', '...f..f...'],
  swallow: ['.......k..', '......hh..', '......eh..', '.bbbbnnh..', 'ddbdbdbb..', '.dbllllb..', '...f..f...'],
  preen: ['..........', '..........', '...hh.....', '.bbhenn...', 'ddbdbdbb..', '.dbllllb..', '...f..f...'],
  fly1: ['....dd....', '....ddd...', '.....dd...', '.bbbbbnhh.', 'dd.bbbbhek', '.....ll...'],
  fly2: ['..........', '..........', '..........', '.bbbbbnhh.', 'dd.bbbbhek', '.....dd...', '....ddd...', '....dd....'],
  glide: ['..........', '..........', '..........', '.bbbbbnhh.', 'dddddddhek', '.....ll...'],
};
const SPARROW: Record<Exclude<Pose, 'sit' | 'glide'>, string[]> = {
  stand: ['....hh.', '...hhek', 'd.bbbh.', '.dbdbb.', '..lll..', '..f.f..'],
  peck: ['.......', 'd......', '.dbbbb.', '..dbdbh', '..lllhe', '..f.f.k'],
  swallow: ['.....k.', '....hh.', 'd..he..', '.dbbbh.', '..lll..', '..f.f..'],
  preen: ['.......', '.......', 'd.hh...', '.dhebb.', '..lll..', '..f.f..'],
  fly1: ['..dd...', '...dd..', 'dbbbhhk', '..ll...'],
  fly2: ['.......', '.......', 'dbbbhhk', '..dd...', '.dd....'],
};
const FLYING = new Set<Pose>(['fly1', 'fly2', 'glide']);

/** Paletas: pombo cinza, pombo escuro, pombo branco e pardal. */
const PALETTES: Record<string, string>[] = [
  { b: '#9ba3b3', l: '#c6ccd6', d: '#5d6578', n: '#4f9a83', m: '#8a64b0', h: '#7f879a', e: '#e8833a', k: '#3b404b', f: '#d86f63' },
  { b: '#7d8495', l: '#a6adba', d: '#454c5c', n: '#7a5aa6', m: '#4f9a83', h: '#5e6577', e: '#e8833a', k: '#3b404b', f: '#d86f63' },
  { b: '#eceef2', l: '#ffffff', d: '#bfc4ce', n: '#dfe3ea', m: '#d3d8e2', h: '#e4e7ec', e: '#c9442b', k: '#9aa0aa', f: '#e07a6c' },
  { b: '#9c6d45', l: '#e4cfaa', d: '#5e3f27', n: '#9c6d45', m: '#9c6d45', h: '#857a70', e: '#1d1f26', k: '#3a3232', f: '#b48a68' },
];

interface BirdSprite {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
}
const birdCache = new Map<string, BirdSprite>();

function birdSprite(sp: Species, pal: number, pose: Pose, flip: boolean): BirdSprite {
  const key = `${sp}:${pal}:${pose}:${flip ? 1 : 0}`;
  const hit = birdCache.get(key);
  if (hit) return hit;
  const set = sp === 'pigeon' ? PIGEON : SPARROW;
  const p = pose === 'glide' && sp === 'sparrow' ? 'fly1' : pose;
  let rows: string[];
  if (p === 'sit') {
    // sentado: o mesmo de pé, com os pés escondidos sob o peito
    const st = set.stand;
    rows = ['.'.repeat(st[0].length), ...st.slice(0, -1)];
  } else rows = (set as Record<string, string[]>)[p];
  const w = rows[0].length;
  const h = rows.length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const colors = PALETTES[pal];
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      ctx.fillStyle = ch === 'n' && (x + y) % 2 ? colors.m : colors[ch];
      ctx.fillRect(flip ? w - 1 - x : x, y, 1, 1);
    }
  });
  // no voo, a âncora fica sob o corpo; no chão, sob os pés
  const body = sp === 'pigeon' ? 5 : 3;
  const s = { canvas: c, ax: Math.floor(w / 2), ay: FLYING.has(pose) ? body : h };
  birdCache.set(key, s);
  return s;
}

/** Lugar para pousar na fonte: na borda da bacia ou nas costas de um golfinho (local, relativo à âncora da fonte). */
interface Perch {
  x: number;
  y: number;
  face: 1 | -1;
  top: boolean;
  taken: boolean;
}

export interface Bird {
  sp: Species;
  pal: number;
  /** Posição local (relativa à âncora da fonte) e altura do voo (px; na tela, y - z). */
  x: number;
  y: number;
  z: number;
  face: 1 | -1;
  state: 'in' | 'perch' | 'hop' | 'out';
  /** Pousado (ou indo pousar) na fonte. */
  perch: Perch | null;
  /** Ainda sobre a fonte (decolando dela): desenha por cima da pedra. */
  onFountain: boolean;
  /** Fica só sentado na borda (bebe pouco). */
  sitter: boolean;
  glides: boolean;
  drank: boolean;
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  tz: number;
  t0: number;
  dur: number;
  arc: number;
  p: number;
  act: Act;
  actUntil: number;
  sips: number;
  leaveAt: number;
  outAngle: number;
  ph: number;
  gone: boolean;
}

function makePerches(): Perch[] {
  const out: Perch[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    if (s < 0 && Math.abs(c) < 0.55) continue; // atrás da coluna
    out.push({ x: Math.round(c * (RX - 2.5)), y: Math.round(TOP_Y + s * (RY - 2) + 1), face: c > 0 ? -1 : 1, top: false, taken: false });
  }
  // nas costas dos golfinhos, atrás da cabeça, olhando para a baleia
  DOLPHINS.forEach((d, i) => {
    const e = spine(d, 0.72);
    out.push({ x: Math.round(e.x + e.nx * (e.w + 0.5)), y: Math.round(e.y + e.ny * (e.w + 0.5)) + 1, face: i ? -1 : 1, top: true, taken: false });
  });
  return out;
}

/** Chão da praça em volta da bacia (fora dela), puxando para a frente, onde os pássaros aparecem melhor. */
function groundOk(x: number, y: number): boolean {
  return Math.abs(x) <= 58 && y >= -RY - 52 && y <= 42 && !inE(x, y, 0, -RY, RX + 7, RY + 7);
}
function groundSpot(): { x: number; y: number } {
  for (let i = 0; i < 30; i++) {
    const x = Math.round((Math.random() * 2 - 1) * 56);
    const y = Math.round(-RY + 10 + (Math.random() * 2 - 1) * 48);
    if (groundOk(x, y)) return { x, y };
  }
  return { x: 0, y: 14 };
}

const rand = Math.random;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ------------------------------------------------------------------ renderer

export class FountainRenderer {
  private basin: HTMLCanvasElement | null = null;
  private statue: HTMLCanvasElement | null = null;
  private ext: ExteriorLayout | null = null;
  private prop: ExteriorProp | null = null;
  private perches: Perch[] = makePerches();
  readonly birds: Bird[] = [];
  private ripples: { x: number; y: number; t0: number }[] = [];
  private nextFlockAt = 0;
  private sparkles: [number, number, number][] = [];
  private reduced = false;

  /** Avança o bando (chegada, bebida, partida) e agenda o próximo. */
  update(now: number, ext: ExteriorLayout, night: number, reduced: boolean): void {
    if (ext !== this.ext) {
      this.ext = ext;
      this.prop = ext.props.find((p) => p.kind === 'fountain') ?? null;
      this.birds.length = 0;
      this.perches = makePerches();
    }
    this.reduced = reduced;
    const t = now / 1000;
    if (!this.prop || reduced) {
      this.birds.length = 0;
      return;
    }
    if (!this.nextFlockAt) this.nextFlockAt = t + 4 + rand() * 6;
    if (!this.birds.length && t >= this.nextFlockAt) {
      // passarinho não sai à noite
      if (night < 0.45) this.spawnFlock(t);
      else this.nextFlockAt = t + 30;
    }
    for (const b of this.birds) {
      if (night > 0.5 && b.state === 'perch') b.leaveAt = Math.min(b.leaveAt, t + rand() * 2);
      this.step(b, t);
    }
    if (this.birds.some((b) => b.gone)) {
      const kept = this.birds.filter((b) => !b.gone);
      this.birds.length = 0;
      this.birds.push(...kept);
      if (!kept.length) this.nextFlockAt = t + 25 + rand() * 50;
    }
    if (this.ripples.length) this.ripples = this.ripples.filter((r) => t - r.t0 < 1);
  }

  private spawnFlock(t: number): void {
    const r = rand();
    const kind = r < 0.45 ? 'pigeon' : r < 0.8 ? 'sparrow' : 'mixed';
    const n = 3 + Math.floor(rand() * 5);
    const inAngle = rand() * Math.PI * 2;
    const outAngle = rand() * Math.PI * 2;
    const stay = 14 + rand() * 16;
    // às vezes algo assusta e o bando sai todo junto
    const startle = rand() < 0.3;
    const free = this.perches.filter((p) => !p.taken && !p.top).sort(() => rand() - 0.5);
    const top = this.perches.filter((p) => p.top && !p.taken);
    for (let i = 0; i < n; i++) {
      const sp: Species = kind === 'mixed' ? (rand() < 0.5 ? 'pigeon' : 'sparrow') : kind;
      const pal = sp === 'sparrow' ? 3 : rand() < 0.12 ? 2 : rand() < 0.4 ? 1 : 0;
      const pick = rand();
      let perch: Perch | null = null;
      if (pick < 0.15 && top.length) perch = top.pop()!;
      else if (pick < 0.68 && free.length) perch = free.pop()!;
      let tx: number;
      let ty: number;
      if (perch) {
        perch.taken = true;
        tx = perch.x;
        ty = perch.y;
      } else ({ x: tx, y: ty } = groundSpot());
      const a = inAngle + (rand() - 0.5) * 0.6;
      const d = 300 + rand() * 150;
      const t0 = t + i * 0.3 + rand() * 0.9;
      const dur = d / (100 + rand() * 30);
      const sx = tx + Math.cos(a) * d;
      this.birds.push({
        sp,
        pal,
        x: sx,
        y: ty + Math.sin(a) * d * 0.6,
        z: 140,
        face: tx >= sx ? 1 : -1,
        state: 'in',
        perch,
        onFountain: !!perch,
        sitter: !!perch && (perch.top || rand() < 0.35),
        glides: rand() < 0.6,
        drank: false,
        sx,
        sy: ty + Math.sin(a) * d * 0.6,
        sz: 120 + rand() * 50,
        tx,
        ty,
        tz: 0,
        t0,
        dur,
        arc: 0,
        p: 0,
        act: 'stand',
        actUntil: 0,
        sips: 0,
        leaveAt: t0 + dur + stay + (startle ? rand() * 0.4 : rand() * 4),
        outAngle: outAngle + (rand() - 0.5) * 0.8,
        ph: rand(),
        gone: false,
      });
    }
  }

  private step(b: Bird, t: number): void {
    if (b.state === 'perch') {
      if (t >= b.leaveAt) this.takeOff(b, t);
      else if (t >= b.actUntil) this.nextAct(b, t);
      return;
    }
    const p = Math.min(1, Math.max(0, (t - b.t0) / b.dur));
    b.p = p;
    // pouso desacelera, decolagem acelera, pulinho é linear
    const e = b.state === 'in' ? 1 - (1 - p) * (1 - p) : b.state === 'out' ? p * p : p;
    b.x = lerp(b.sx, b.tx, e);
    b.y = lerp(b.sy, b.ty, e);
    if (b.state === 'in') b.z = b.sz * Math.pow(1 - p, 1.4);
    else if (b.state === 'out') b.z = b.tz * Math.pow(p, 0.7);
    else b.z = b.arc * 4 * p * (1 - p);
    if (p < 1) return;
    if (b.state === 'out') {
      b.gone = true;
      return;
    }
    b.state = 'perch';
    b.z = 0;
    b.onFountain = !!b.perch;
    if (b.perch) b.face = b.perch.face;
    b.act = b.perch && b.sitter ? 'sit' : 'stand';
    b.actUntil = t + 0.3 + rand() * 0.6;
    // quem pousa na borda chega com sede
    if (b.perch && !b.sitter) b.sips = 3 + Math.floor(rand() * 4);
  }

  private hop(b: Bird, t: number, tx: number, ty: number, dur: number, arc: number): void {
    b.state = 'hop';
    b.sx = b.x;
    b.sy = b.y;
    b.sz = 0;
    b.tx = tx;
    b.ty = ty;
    b.t0 = t;
    b.dur = dur;
    b.arc = arc;
    if (tx !== b.x) b.face = tx > b.x ? 1 : -1;
  }

  private nextAct(b: Bird, t: number): void {
    if (b.sips > 0) {
      // "golada": mergulha o bico, depois ergue a cabeça para engolir
      if (b.act === 'peck') {
        b.act = 'swallow';
        b.actUntil = t + 0.3 + rand() * 0.15;
        b.sips--;
        if (!b.sips) b.drank = true;
      } else {
        b.act = 'peck';
        b.actUntil = t + 0.45 + rand() * 0.35;
        if (b.perch && !b.perch.top) this.ripple(b, t);
      }
      return;
    }
    const r = rand();
    const perch = b.perch;
    if (perch) {
      if (!perch.top && r < (b.sitter ? 0.12 : 0.3)) {
        b.sips = 2 + Math.floor(rand() * 4);
        b.act = 'stand';
        b.actUntil = t + 0.2;
      } else if (r < 0.48) {
        b.act = b.sitter ? 'sit' : 'stand';
        b.actUntil = t + 1.2 + rand() * 2.5;
      } else if (r < 0.63) {
        b.act = 'preen';
        b.actUntil = t + 0.8 + rand() * 1.4;
      } else if (r < 0.73) {
        // vira para o outro lado na borda
        b.face = b.face > 0 ? -1 : 1;
        b.act = 'stand';
        b.actUntil = t + 0.6 + rand();
      } else if (r < 0.8 && !perch.top) {
        // desce para o chão
        let gx = Math.round(perch.x * 1.35);
        let gy = Math.round(-RY + (perch.y - TOP_Y) * 2.4 + 6);
        if (!groundOk(gx, gy)) ({ x: gx, y: gy } = groundSpot());
        perch.taken = false;
        b.perch = null;
        this.hop(b, t, gx, gy, 0.5, 7);
      } else {
        b.act = 'sit';
        b.actUntil = t + 2 + rand() * 3;
      }
      return;
    }
    if (r < 0.4) {
      b.act = b.act === 'peck' ? 'stand' : 'peck'; // cisca
      b.actUntil = t + 0.15 + rand() * 0.2;
    } else if (r < 0.62) {
      const gx = Math.round(b.x + (rand() * 2 - 1) * 10);
      const gy = Math.round(b.y + (rand() * 2 - 1) * 6);
      if (groundOk(gx, gy)) this.hop(b, t, gx, gy, 0.2, 1.5);
      else b.actUntil = t + 0.3;
    } else if (r < 0.82 && !b.drank) {
      // sobe na borda livre mais perto para beber
      const free = this.perches.filter((p) => !p.taken && !p.top);
      if (!free.length) {
        b.actUntil = t + 0.5;
        return;
      }
      const to = free.reduce((a, p) => (Math.hypot(p.x - b.x, p.y - b.y) < Math.hypot(a.x - b.x, a.y - b.y) ? p : a));
      to.taken = true;
      b.perch = to;
      b.onFountain = true;
      b.sitter = false;
      this.hop(b, t, to.x, to.y, 0.5, 9);
    } else {
      b.act = 'stand';
      b.actUntil = t + 0.5 + rand() * 1.5;
    }
  }

  private takeOff(b: Bird, t: number): void {
    if (b.perch) b.perch.taken = false;
    b.perch = null;
    b.state = 'out';
    const d = 380 + rand() * 120;
    b.sx = b.x;
    b.sy = b.y;
    b.sz = 0;
    b.tx = b.x + Math.cos(b.outAngle) * d;
    b.ty = b.y + Math.sin(b.outAngle) * d * 0.6;
    b.tz = 150 + rand() * 40;
    b.t0 = t;
    b.dur = d / (120 + rand() * 40);
    b.face = Math.cos(b.outAngle) >= 0 ? 1 : -1;
  }

  /** Ondinha onde o bico tocou a água (puxada para dentro do espelho quando o bico fica sobre a pedra). */
  private ripple(b: Bird, t: number): void {
    let x = Math.round(b.x + b.face * (b.sp === 'pigeon' ? 5 : 4));
    let y = Math.round(b.y - 1);
    for (let i = 0; i < 8 && !inWater(x, y); i++) {
      x -= Math.sign(x);
      y += Math.sign(WATER.cy - y);
    }
    if (inWater(x, y)) this.ripples.push({ x, y, t0: t });
  }

  // ---------------------------------------------------------------- desenho

  /** Profundidade de um pássaro pousado ou perto do chão; null se está voando alto (desenhado à parte) ou ainda longe. */
  depthOf(b: Bird, now: number): number | null {
    const prop = this.prop;
    if (!prop || this.hidden(b, now) || this.airborne(b)) return null;
    if (b.onFountain || b.perch) return prop.y + 0.2 + ((b.perch?.y ?? b.y) + 60) * 0.001;
    return prop.y + b.y;
  }

  private hidden(b: Bird, now: number): boolean {
    return b.state === 'in' && now / 1000 < b.t0;
  }
  private airborne(b: Bird): boolean {
    return (b.state === 'in' || b.state === 'out') && b.z > 2;
  }

  private pose(b: Bird, t: number): Pose {
    if (b.state === 'perch') return b.act;
    if (b.state === 'hop') return b.arc > 4 ? (Math.floor(t / 0.06) % 2 ? 'fly1' : 'fly2') : 'stand';
    let period = b.sp === 'pigeon' ? 0.17 : 0.1;
    if (b.state === 'in') {
      if (b.sp === 'pigeon' && b.glides && b.p > 0.3 && b.p < 0.75) return 'glide';
      if (b.p > 0.88) period *= 0.5; // bate as asas forte para frear no pouso
    }
    return Math.floor((t + b.ph) / period) % 2 ? 'fly1' : 'fly2';
  }

  drawBird(ctx: CanvasRenderingContext2D, b: Bird, now: number): void {
    const prop = this.prop;
    if (!prop) return;
    const gx = Math.round(prop.x + b.x);
    const gy = Math.round(prop.y + b.y);
    // sombra no chão (some com a altura)
    const sa = 0.24 * Math.max(0, 1 - b.z / 170);
    if (sa > 0.02) {
      ctx.fillStyle = `rgba(28,36,52,${sa.toFixed(3)})`;
      const w = b.sp === 'pigeon' ? 6 : 4;
      ctx.fillRect(gx - w / 2, gy - 1, w, 1);
      ctx.fillRect(gx - w / 2 + 1, gy, w - 2, 1);
    }
    const s = birdSprite(b.sp, b.pal, this.pose(b, now / 1000), b.face < 0);
    ctx.drawImage(s.canvas, gx - s.ax, Math.round(gy - b.z) - s.ay);
  }

  /** Pássaros voando alto (por cima das copas), depois das entidades. */
  drawFlying(ctx: CanvasRenderingContext2D, now: number): void {
    for (const b of this.birds) if (!this.hidden(b, now) && this.airborne(b)) this.drawBird(ctx, b, now);
  }

  drawFountain(ctx: CanvasRenderingContext2D, prop: ExteriorProp, now: number): void {
    this.basin ??= paintBasin();
    this.statue ??= paintStatue();
    if (!this.sparkles.length) {
      for (let i = 0; this.sparkles.length < 16 && i < 400; i++) {
        const x = Math.round((hash(i, 7) * 2 - 1) * WATER.rx);
        const y = Math.round(WATER.cy + (hash(i, 13) * 2 - 1) * WATER.ry);
        if (inWater(x, y) && Math.abs(x) > 6) this.sparkles.push([x, y, hash(i, 29) * 10]);
      }
    }
    const t = this.reduced ? 0 : now / 1000;
    const ox = Math.round(prop.x);
    const oy = Math.round(prop.y);
    const dot = (x: number, y: number) => ctx.fillRect(ox + x, oy + y, 1, 1);
    /** Anel de onda (elipse pontilhada) restrito a uma área de água. */
    const ring = (cx: number, cy: number, r: number, inside: (x: number, y: number) => boolean) => {
      const n = Math.max(8, Math.round(r * 5));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * r);
        const y = Math.round(cy + Math.sin(a) * r * 0.45);
        if (inside(x, y)) dot(x, y);
      }
    };
    ctx.drawImage(this.basin, ox - OX, oy - OY);

    // ---- espelho d'água: ondas que saem da coluna, os anéis onde as cortinas caem, brilhos e os goles dos pássaros
    ctx.fillStyle = W_LIGHT;
    for (let k = 0; k < 2; k++) {
      const ph = frac(t / 2.4 + k / 2);
      ctx.globalAlpha = 0.55 * (1 - ph);
      ring(0, WL + 2, 12 + ph * 18, inWater);
    }
    // anéis onde caem os arcos dos golfinhos e as gotas do jato da baleia
    ctx.fillStyle = W_HI;
    const splashes: Pt[] = [...ARC_LAND, ...CROWN_LAND];
    splashes.forEach(([x, y], i) => {
      const ph = frac(t * 1.3 + i * 0.37);
      ctx.globalAlpha = 0.8 * (1 - ph);
      ring(x, y, 1 + ph * 4, inWater);
    });
    ctx.fillStyle = FOAM;
    for (const r of this.ripples) {
      const ph = Math.min(1, (t - r.t0) / 0.9);
      ctx.globalAlpha = 0.9 * (1 - ph);
      ring(r.x, r.y, 1 + ph * 5, inWater);
    }
    for (const [x, y, s] of this.sparkles) {
      const on = Math.sin(t * 2.3 + s * 4.1);
      if (on < 0.55) continue;
      ctx.globalAlpha = (on - 0.55) / 0.45;
      dot(x, y);
      if (on > 0.93) {
        ctx.globalAlpha *= 0.6;
        dot(x - 1, y);
        dot(x + 1, y);
      }
    }
    ctx.globalAlpha = 1;

    ctx.drawImage(this.statue, ox - OX, oy - OY);

    // espuma em volta da rocha e das caudas dos golfinhos, onde saem da água
    ctx.fillStyle = FOAM;
    ctx.globalAlpha = 0.85;
    for (let x = -13; x <= 13; x++) {
      if (Math.sin(t * 6 + x * 1.7) > -0.2) dot(x, Math.round(WL + 2 + 3.5 * Math.sqrt(1 - (x / 14) ** 2)));
    }
    for (const d of DOLPHINS) {
      const [tx, ty] = d.p[0];
      for (let x = -3; x <= 3; x++) if (Math.sin(t * 7 + x * 2.1 + tx) > -0.1) dot(tx + x, ty + (Math.abs(x) > 1 ? 0 : 1));
    }
    ctx.globalAlpha = 1;

    /** Arco d'água de (x0, y0) a (x1, y1) subindo `h` px, com gotas correndo nele e respingos onde cai. */
    const arc = (x0: number, y0: number, x1: number, y1: number, h: number, seed: number) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0 - h) * 1.6);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const k = ((Math.floor(u * n * 0.7 - t * 22 + seed * 5) % 5) + 5) % 5;
        if (k === 4 || (u > 0.8 && k === 2)) continue; // a água se partindo em gotas no fim
        ctx.fillStyle = k === 0 ? FOAM : k === 1 ? W_HI : W_LIGHT;
        dot(Math.round(x0 + (x1 - x0) * u), Math.round(y0 + (y1 - y0) * u - h * 4 * u * (1 - u)));
      }
      ctx.fillStyle = FOAM;
      for (let j = 0; j < 3; j++) {
        const ph = frac(t * 2.2 + j * 0.37 + seed * 0.21);
        ctx.globalAlpha = 1 - ph;
        dot(Math.round(x1 + (j - 1) * 2 * ph), Math.round(y1 - Math.sin(ph * Math.PI) * 3));
      }
      ctx.globalAlpha = 1;
    };
    DOLPHINS.forEach((d, i) => {
      const [mx, my] = mouthOf(d);
      const [lx, ly] = ARC_LAND[i];
      arc(mx, my, lx, ly, 11 + Math.sin(t * 3 + i) * 0.8, i);
    });

    // ---- jato da boca da baleia e a coroa de gotas chovendo na bacia
    const [mx, my] = mouthOf(WHALE);
    const jet = 12 + Math.sin(t * 7) * 1.2 + Math.sin(t * 13) * 0.6;
    const top = my - jet;
    for (let k = 0; k <= jet; k++) {
      const y = my - k;
      ctx.fillStyle = k > jet - 3 || ((Math.floor(y + t * 30) % 3) + 3) % 3 === 0 ? FOAM : W_HI;
      dot(mx, y);
      if (k < jet * 0.6) {
        ctx.fillStyle = W_LIGHT;
        dot(mx - 1, y);
      }
    }
    for (let i = 0; i < 20; i++) {
      const ph = frac(t * 0.9 + i * 0.618);
      const a = i * 2.39996;
      const r = 9 + (i % 4) * 4.5;
      const lx = Math.cos(a) * r;
      const ly = WL + Math.sin(a) * r * 0.43;
      const x = Math.round(mx + (lx - mx) * ph);
      const y = Math.round(top + (ly - top) * ph * ph - 8 * ph * (1 - ph));
      // gota passando por trás do corpo da baleia
      if (Math.sin(a) < 0 && Math.abs(x) < 9 && y > top + 6) continue;
      ctx.globalAlpha = ph > 0.88 ? (1 - ph) / 0.12 : 1;
      ctx.fillStyle = i % 2 ? FOAM : W_HI;
      dot(x, y);
    }
    ctx.globalAlpha = 1;
  }

  /** À noite, luzes dentro da água: brilho ciano sobre a bacia e as taças. */
  drawNight(ctx: CanvasRenderingContext2D, night: number, now: number): void {
    const prop = this.prop;
    if (!prop || night < 0.2) return;
    const k = Math.min(1, (night - 0.2) / 0.4);
    const ox = Math.round(prop.x);
    const oy = Math.round(prop.y);
    const glow = glowSprite('#5fd3ff', 64);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4 * k;
    ctx.drawImage(glow, ox - 40, oy + WATER.cy - 20, 80, 40);
    ctx.globalAlpha = 0.35 * k;
    ctx.drawImage(glow, ox - 16, oy - 62, 32, 44);
    ctx.drawImage(glow, ox - 8, oy - 80, 18, 22);
    // os quatro refletores no fundo da bacia
    const t = this.reduced ? 0 : now / 1000;
    ctx.fillStyle = '#c9f6ff';
    for (const [x, y] of [
      [-18, WL - 4],
      [18, WL - 4],
      [-14, WL + 6],
      [14, WL + 6],
    ] as const) {
      ctx.globalAlpha = k * (0.45 + 0.15 * Math.sin(t * 3 + x));
      ctx.fillRect(ox + x - 1, oy + y, 3, 1);
    }
    ctx.restore();
  }
}

// Móveis da diretoria do campus: a mesa de altura regulável com o Studio Display, o MacBook no suporte, Magic
// Keyboard e Magic Mouse, caixas de som, headset e luminária; a cadeira executiva de tela; a mesa oval e as cadeiras
// de couro; o bar de chai e café; o sofá de couro; o aparador; a mesa da secretária; a placa da porta e a prateleira
// de prêmios. Nogueira escura, couro, alumínio prateado e preto. Mesmas convenções do kit (puro).
import { ramp, shade } from '../core/color';
import type { PixelBuf } from '../core/pixbuf';
import { floorSheet, rectAt, wallSheet, type BufFurniture } from '../core/sprite';
import { M, SCREEN_BG, contact, foliage, frontFace, keyboard, monitorFront, mouse, mug, papers, staticScreen, topFace, underRect, woodGrain } from './kit';

type Box = { x: number; y: number; w: number; h: number };

const WALNUT = ramp('#6e4c37', 0.065);
const WALNUT_EDGE = ramp('#4f3627', 0.06);
/** Pés e colunas da mesa de pé (aço grafite). */
const STEEL = ramp('#4b505d', 0.07);
/** Alumínio anodizado (Studio Display, MacBook, suportes). */
const ALU = ramp('#c6ccd4', 0.05);
const LEATHER = ramp('#9a5a34', 0.07);
const DARK_LEATHER = ramp('#4f3427', 0.07);
const BRASS = ramp('#c9a24e', 0.075);
const GOLD = ramp('#e2b93f', 0.08);
const CHROME = ramp('#c3c9d2', 0.07);
const SHADOW = 'rgba(40,30,30,0.28)';

/** Quanto o tampo da mesa sobe na altura de ficar em pé (px). */
export const EXEC_LIFT = 7;
/** Bulbo da luminária da mesa, em coordenadas de desenho (antes de subir). */
const LAMP_BULB = { x: 59, y: -6 };

/** Bulbo da luminária da exec_desk (px relativos à âncora: centro inferior do footprint 4x1), por estado. */
export function execDeskLamp(state: number): { dx: number; dy: number } {
  return { dx: LAMP_BULB.x - 32, dy: LAMP_BULB.y - (state >= 1 ? EXEC_LIFT : 0) - 16 };
}

/** Centro da tela do Studio Display (px relativos à âncora), por estado: o brilho noturno da tela. */
export function execDeskScreen(state: number): { dx: number; dy: number } {
  return { dx: 1, dy: -20 - (state >= 1 ? EXEC_LIFT : 0) - 16 };
}

// ------------------------------------------------------------------ mesa de altura regulável

/** Luminária de banqueiro na frente da mesa: base e haste de latão, cúpula de vidro verde e a correntinha. */
function deskLamp(b: PixelBuf, y: number): void {
  const green = ramp('#2f7a52', 0.08);
  b.hline(56, 63, y + 2, SHADOW);
  b.rect(56, y, 7, 2, BRASS.base);
  b.hline(57, 61, y, BRASS.hi);
  b.set(62, y + 1, BRASS.dd);
  b.vline(59, y - 7, y - 1, BRASS.base);
  b.vline(60, y - 7, y - 1, BRASS.dk);
  // cúpula: meio cilindro deitado, verde com brilho e a borda de baixo escura; o bulbo aparece por baixo
  b.rect(55, y - 11, 9, 4, green.base);
  b.hline(56, 62, y - 12, green.lt);
  b.hline(56, 61, y - 11, green.hi);
  b.hline(55, 63, y - 8, green.dd);
  b.set(55, y - 11, green.lt);
  b.set(63, y - 11, green.dk);
  b.hline(57, 61, y - 7, '#fff3c8');
  b.set(LAMP_BULB.x + 3, y - 6, BRASS.lt);
}

/**
 * Headset premium pendurado no suporte: arco de alumínio com a almofada de couro caramelo, hastes prateadas e as
 * conchas pretas com o anel de alumínio. `x` = canto esquerdo (9 px de largura), `y` = linha da base.
 */
function headsetStand(b: PixelBuf, x: number, y: number): void {
  b.hline(x + 2, x + 8, y + 1, SHADOW);
  b.rect(x + 2, y - 1, 6, 2, '#2a2e36');
  b.hline(x + 2, x + 7, y - 1, '#4a505c');
  b.vline(x + 4, y - 16, y - 2, ALU.dk);
  b.vline(x + 5, y - 16, y - 2, ALU.dd);
  // arco: alumínio por cima, a almofada de couro por baixo
  b.hline(x + 2, x + 6, y - 19, ALU.hi);
  b.set(x + 1, y - 18, ALU.base);
  b.set(x + 7, y - 18, ALU.base);
  b.hline(x + 2, x + 6, y - 18, LEATHER.lt);
  b.hline(x + 3, x + 5, y - 17, LEATHER.dk);
  // hastes até as conchas
  b.vline(x, y - 17, y - 15, ALU.lt);
  b.vline(x + 8, y - 17, y - 15, ALU.dk);
  for (const cx of [x - 1, x + 7]) {
    b.rect(cx, y - 14, 3, 6, '#20232a');
    b.vline(cx + (cx < x ? 2 : 0), y - 13, y - 9, LEATHER.dk);
    b.hline(cx, cx + 2, y - 14, ALU.base);
    b.set(cx + (cx < x ? 0 : 2), y - 12, ALU.lt);
  }
}

/** Caixa de som de estúdio (5x10): gabinete grafite, tweeter e woofer com aro prateado. */
function speaker(b: PixelBuf, x: number, y: number): void {
  b.hline(x + 1, x + 5, y + 10, SHADOW);
  b.rect(x, y, 5, 10, '#2b2f38');
  b.hline(x, x + 4, y, '#4a505c');
  b.vline(x, y + 1, y + 9, '#3a3f4b');
  b.vline(x + 4, y + 1, y + 9, '#1c1f26');
  b.set(x + 2, y + 2, '#d6dbe2');
  b.rect(x + 1, y + 5, 3, 3, '#8e96a3');
  b.set(x + 1, y + 5, '#d6dbe2');
  b.set(x + 2, y + 6, '#15171c');
  b.hline(x, x + 4, y + 9, '#16181d');
}

/** Studio Display: aro de alumínio, vidro preto e o pé de alumínio. Retorna o retângulo da tela. */
function studioDisplay(b: PixelBuf, x: number, y: number): Box {
  const w = 26;
  const h = 16;
  b.hline(x + 6, x + 22, y + h + 6, SHADOW);
  // pé: placa inclinada (vista de frente, só a parte de baixo aparece) e a base fina
  b.rect(x + 10, y + h, 6, 4, ALU.base);
  b.vline(x + 10, y + h, y + h + 3, ALU.lt);
  b.vline(x + 15, y + h, y + h + 3, ALU.dk);
  b.rect(x + 8, y + h + 4, 10, 2, ALU.lt);
  b.hline(x + 8, x + 17, y + h + 5, ALU.dk);
  // aro de alumínio e vidro preto
  b.rect(x, y, w, h, ALU.base);
  b.hline(x, x + w - 1, y, ALU.hi);
  b.vline(x, y + 1, y + h - 1, ALU.lt);
  b.vline(x + w - 1, y + 1, y + h - 1, ALU.dk);
  b.hline(x, x + w - 1, y + h - 1, ALU.dk);
  b.rect(x + 1, y + 1, w - 2, h - 2, '#15181e');
  const scr = { x: x + 2, y: y + 2, w: w - 4, h: h - 4 };
  b.rect(scr.x, scr.y, scr.w, scr.h, SCREEN_BG);
  for (let i = 0; i < scr.h; i++) b.set(scr.x + scr.w - 4 - i, scr.y + i, '#2f4569');
  // câmera no vidro de cima
  b.set(x + 13, y + 1, '#3a4252');
  return scr;
}

/** MacBook aberto num suporte de alumínio: tampa de frente (tela), base inclinada e as pernas do suporte. */
function macbook(b: PixelBuf, x: number, y: number, seed: number): Box {
  b.hline(x, x + 11, y + 14, SHADOW);
  // suporte
  b.vline(x + 2, y + 10, y + 13, ALU.dk);
  b.vline(x + 8, y + 10, y + 13, ALU.dk);
  b.hline(x + 1, x + 9, y + 13, ALU.base);
  // base com o teclado (vista inclinada)
  b.rect(x - 1, y + 8, 13, 2, ALU.lt);
  b.hline(x - 1, x + 11, y + 9, ALU.dk);
  for (let i = 0; i < 5; i++) b.set(x + 1 + i * 2, y + 8, '#3a3f4b');
  // tampa
  b.rect(x, y, 11, 8, ALU.base);
  b.hline(x, x + 10, y, ALU.hi);
  b.vline(x + 10, y + 1, y + 7, ALU.dk);
  b.rect(x + 1, y + 1, 9, 7, '#15181e');
  const scr = { x: x + 1, y: y + 2, w: 9, h: 5 };
  staticScreen(b, scr, 'chart', seed);
  // o "notch" da câmera
  b.hline(x + 4, x + 6, y + 1, '#0f1115');
  return scr;
}

/** Magic Keyboard: chapa fina de alumínio com teclas brancas. */
function magicKeyboard(b: PixelBuf, x: number, y: number): void {
  b.hline(x + 1, x + 16, y + 3, SHADOW);
  b.rect(x, y, 16, 3, '#d6dae1');
  for (let i = 0; i < 15; i += 2) {
    b.set(x + 1 + i, y, '#fbfcfd');
    b.set(x + i, y + 1, '#fbfcfd');
  }
  b.hline(x, x + 15, y + 2, '#a9b0bb');
  b.vline(x, y, y + 2, '#b9c0ca');
}

/** Magic Mouse: oval branco e liso. */
function magicMouse(b: PixelBuf, x: number, y: number): void {
  b.hline(x + 1, x + 3, y + 2, SHADOW);
  b.rect(x, y, 3, 2, '#f4f5f7');
  b.set(x + 1, y, '#ffffff');
  b.set(x + 2, y + 1, '#c3c8d0');
}

/** Copinho de vidro com chai (doodh patti). */
function chaiGlass(b: PixelBuf, x: number, y: number, tea = '#c99a6b'): void {
  b.hline(x + 1, x + 3, y + 4, SHADOW);
  b.hline(x, x + 2, y, 'rgba(225,240,248,0.9)');
  b.rect(x, y + 1, 3, 3, tea);
  b.set(x, y + 1, shade(tea, 0.18));
  b.vline(x + 2, y + 1, y + 3, shade(tea, -0.15));
  b.hline(x, x + 2, y + 3, shade(tea, -0.08));
}

export function execDesk(state: number, seed: number): BufFurniture {
  const L = state >= 1 ? EXEC_LIFT : 0;
  const s = floorSheet(4, 1, 30 + EXEC_LIFT);
  const b = s.buf;
  // pés: travessa no chão e coluna telescópica em cada ponta; a parte fina de cima aparece quando a mesa sobe
  for (const x of [3, 55]) {
    b.rect(x - 2, 14, 10, 2, STEEL.dk);
    b.hline(x - 2, x + 7, 14, STEEL.base);
    b.set(x - 2, 15, '#23262e');
    b.set(x + 7, 15, '#23262e');
    b.rect(x, 9, 6, 5, STEEL.base);
    b.vline(x, 9, 13, STEEL.lt);
    b.vline(x + 5, 9, 13, STEEL.dd);
    b.hline(x, x + 5, 9, STEEL.hi);
    if (L > 0) {
      b.rect(x + 1, 8 - L, 4, L + 1, STEEL.lt);
      b.vline(x + 1, 8 - L, 8, STEEL.hi);
      b.vline(x + 4, 8 - L, 8, STEEL.dk);
    }
  }
  // travessa sob o tampo (com a calha de cabos)
  b.rect(9, 8 - L, 46, 2, STEEL.dk);
  b.hline(9, 54, 8 - L, STEEL.base);
  // tampo de nogueira com a borda
  topFace(b, 0, -6 - L, 64, 12, WALNUT);
  woodGrain(b, 1, -5 - L, 62, 10, WALNUT, 13);
  b.hline(0, 63, 6 - L, WALNUT_EDGE.base);
  b.hline(0, 63, 7 - L, WALNUT_EDGE.dk);
  b.set(0, 6 - L, WALNUT_EDGE.lt);
  // painel da altura na borda frontal direita: visor azul e as duas setas
  b.rect(47, 6 - L, 9, 3, '#20242c');
  b.hline(49, 51, 7 - L, L ? '#8fd8ff' : '#5fa8d8');
  b.set(53, 7 - L, '#9aa2ae');
  b.set(54, 7 - L, '#9aa2ae');

  // em cima: luminária, headset, caixas de som, Studio Display, MacBook, teclado, mouse, bloco e chai
  const y = -L;
  headsetStand(b, 3, y - 4);
  speaker(b, 14, y - 16);
  speaker(b, 47, y - 16);
  const scr = studioDisplay(b, 20, y - 27);
  const scr2 = macbook(b, 53, y - 21, seed);
  papers(b, 3, y + 0, 6, 4);
  b.line(5, y + 1, 8, y + 2, '#2a2e36');
  chaiGlass(b, 12, y - 1);
  magicKeyboard(b, 24, y - 1);
  magicMouse(b, 42, y);
  deskLamp(b, y);
  b.outline();
  // sombras: o vão sob o tampo e o contato no chão
  underRect(b, 9, 10 - L, 46, 4 + L, 'rgba(30,34,52,0.18)');
  contact(b, -1, 13, 66, 4, 0.2);
  s.rects = {
    screen: rectAt(s, scr.x, scr.y, scr.w, scr.h),
    screen2: rectAt(s, scr2.x, scr2.y, scr2.w, scr2.h),
    glow: rectAt(s, LAMP_BULB.x - 2, LAMP_BULB.y - L - 2, 4, 4),
  };
  return { base: s };
}

// ------------------------------------------------------------------ cadeira executiva

/** Base estrela de alumínio polido com rodízios e o pistão. */
function chromeStar(b: PixelBuf, ox: number): void {
  b.hline(ox + 3, ox + 12, 13, CHROME.base);
  b.hline(ox + 4, ox + 11, 14, CHROME.dk);
  b.set(ox + 3, 13, CHROME.hi);
  for (const [x, y] of [[2, 14], [13, 14], [4, 15], [11, 15]] as const) {
    b.set(ox + x, y, '#23262e');
    b.set(ox + x + (x < 8 ? 1 : -1), y, '#23262e');
  }
  b.rect(ox + 7, 9, 2, 4, '#2f333c');
  b.vline(ox + 8, 9, 12, '#5a6070');
}

export function execChair(state: number): BufFurniture {
  // rolada para o lado (mesa em pé): o desenho todo anda para a direita, para fora de quem fica em pé à mesa
  const ox = state >= 1 ? 15 : 0;
  const oy = 0;
  const seat = ramp('#363a44', 0.07);
  const base = floorSheet(1, 1, 18, 20);
  const b = base.buf;
  chromeStar(b, ox);
  // assento (visto por trás do encosto) e os braços com apoio acolchoado
  b.rect(ox + 2, 4 + oy, 12, 6, seat.lt);
  b.hline(ox + 3, ox + 12, 4 + oy, seat.hi);
  b.hline(ox + 2, ox + 13, 8 + oy, seat.base);
  b.hline(ox + 2, ox + 13, 9 + oy, seat.dk);
  for (const x of [0, 14]) {
    b.vline(ox + x + 1, 3 + oy, 8 + oy, CHROME.dk);
    b.rect(ox + x, 1 + oy, 2, 2, '#2a2e36');
    b.set(ox + x, 1 + oy, '#4a505c');
  }
  b.outline();
  contact(b, ox + 1, 13, 14, 3, 0.22);
  // frente: encosto alto de tela (o corpo de quem senta aparece por trás da tela) e o apoio de cabeça
  const front = floorSheet(1, 1, 18, 20);
  const f = front.buf;
  const frame = '#24272e';
  const y0 = 1 + oy;
  const y1 = 12 + oy;
  f.vline(ox + 3, y0 + 1, y1, frame);
  f.vline(ox + 12, y0 + 1, y1, frame);
  f.hline(ox + 4, ox + 11, y0, frame);
  f.hline(ox + 4, ox + 11, y1, frame);
  f.set(ox + 4, y0 + 1, frame);
  f.set(ox + 11, y0 + 1, frame);
  for (let y = y0 + 1; y < y1; y++) {
    for (let x = ox + 4; x <= ox + 11; x++) {
      if (y === y0 + 1 && (x === ox + 4 || x === ox + 11)) continue;
      f.set(x, y, (x + y) % 2 ? 'rgba(34,38,48,0.72)' : 'rgba(62,68,82,0.6)');
    }
  }
  // apoio lombar e a espinha de alumínio até o assento
  f.hline(ox + 4, ox + 11, y1 - 4, '#30343e');
  f.hline(ox + 5, ox + 10, y1 - 3, 'rgba(48,52,62,0.85)');
  f.vline(ox + 7, y1 + 1, y1 + 1, CHROME.base);
  f.vline(ox + 8, y1 + 1, y1 + 1, CHROME.dk);
  // apoio de cabeça: haste de alumínio e almofada de tela
  f.vline(ox + 7, y0 - 2, y0 - 1, CHROME.lt);
  f.vline(ox + 8, y0 - 2, y0 - 1, CHROME.dk);
  f.rect(ox + 5, y0 - 5, 6, 3, 'rgba(40,44,54,0.8)');
  f.hline(ox + 5, ox + 10, y0 - 5, frame);
  f.hline(ox + 6, ox + 9, y0 - 6, frame);
  f.hline(ox + 5, ox + 10, y0 - 3, frame);
  f.set(ox + 6, y0 - 4, 'rgba(120,128,144,0.7)');
  if (!ox) return { base, front };
  // rolada para o lado ninguém senta nela: o encosto vai junto na base, e os rodízios deixam o rastro até a mesa
  b.draw(f, -f.ox, -f.oy);
  for (let x = 3; x < ox + 3; x++) {
    b.under(x, 14, 'rgba(30,34,52,0.1)');
    b.under(x + 9, 15, 'rgba(30,34,52,0.1)');
  }
  return { base };
}

// ------------------------------------------------------------------ reunião

/** Cadeira de couro caramelo com base cromada. variants: direção para onde quem senta olha. */
export function meetingChair(variant: string | undefined): BufFurniture {
  const v = variant ?? 'down';
  const s = floorSheet(1, 1, 12);
  const b = s.buf;
  const L = LEATHER;
  const seatCushion = () => {
    b.rect(2, 4, 12, 6, L.lt);
    b.hline(3, 12, 4, L.hi);
    b.hline(2, 13, 8, L.base);
    b.hline(2, 13, 9, L.dk);
    b.set(2, 4, L.base);
    b.set(13, 4, L.base);
  };
  const tufts = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0 + 1; y < y0 + h - 1; y += 3) for (let x = x0 + 2 + ((y - y0) % 2); x < x0 + w - 1; x += 3) b.set(x, y, L.dk);
  };
  if (v === 'down') {
    chromeStar(b, 0);
    b.rect(3, -8, 10, 12, L.base);
    b.hline(4, 11, -9, L.lt);
    b.rect(4, -7, 8, 9, L.lt);
    b.hline(4, 11, -7, L.hi);
    b.vline(12, -8, 3, L.dk);
    b.hline(3, 12, 3, L.dd);
    tufts(4, -7, 8, 9);
    seatCushion();
    for (const x of [1, 13]) {
      b.rect(x, 2, 2, 5, CHROME.base);
      b.set(x, 2, CHROME.hi);
    }
    b.outline();
    contact(b, 1, 13, 14, 3, 0.22);
    return { base: s };
  }
  if (v === 'up') {
    chromeStar(b, 0);
    seatCushion();
    b.outline();
    contact(b, 1, 13, 14, 3, 0.22);
    const front = floorSheet(1, 1, 12);
    const f = front.buf;
    f.rect(3, 5, 10, 8, L.base);
    f.hline(4, 11, 4, L.lt);
    f.hline(3, 12, 5, L.lt);
    f.set(4, 5, L.hi);
    f.vline(3, 6, 11, L.lt);
    f.vline(12, 5, 12, L.dk);
    f.hline(4, 11, 9, L.dk);
    f.hline(3, 12, 12, L.dd);
    for (const x of [1, 13]) f.rect(x, 6, 2, 4, CHROME.base);
    f.outline();
    return { base: s, front };
  }
  // de lado: encosto do lado oposto ao olhar
  chromeStar(b, 0);
  seatCushion();
  const bx = v === 'left' ? 11 : 2;
  b.rect(bx, -8, 3, 16, L.base);
  b.vline(bx, -7, 7, L.lt);
  b.vline(bx + 2, -7, 7, L.dk);
  b.hline(bx, bx + 2, -8, L.hi);
  b.outline();
  contact(b, 1, 13, 14, 3, 0.22);
  return { base: s };
}

/** Mesa oval de nogueira (3x2) num pé central, com jarra d'água, copos, bloco e um vasinho. */
export function ovalMeetingTable(seed: number): BufFurniture {
  const s = floorSheet(3, 2, 10);
  const b = s.buf;
  const cx = 23.5;
  const rx = 23.5;
  const ry = 11.5;
  const cy = 7.5;
  // pé central e a base no chão
  b.ellipse(cx, 29, 10, 2.2, STEEL.dk);
  b.hline(16, 31, 28, STEEL.base);
  b.rect(20, 18, 8, 11, STEEL.base);
  b.vline(20, 18, 28, STEEL.lt);
  b.vline(27, 18, 28, STEEL.dd);
  // espessura do tampo (embaixo) e o tampo
  b.ellipse(cx, cy + 2, rx, ry, WALNUT_EDGE.dk);
  b.ellipse(cx, cy + 1, rx, ry, WALNUT_EDGE.base);
  b.ellipse(cx, cy, rx, ry, WALNUT.lt);
  // veios curvos e o reflexo no lado de cima/esquerda
  for (let y = Math.ceil(cy - ry) + 2; y < cy + ry - 1; y += 3) {
    const half = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
    const off = ((y * 7 + seed * 5) % 9) - 4;
    b.hline(Math.round(cx - half * 0.6 + off), Math.round(cx + half * 0.3 + off), y, WALNUT.base);
  }
  for (let y = Math.ceil(cy - ry) + 1; y < cy - ry + 5; y++) {
    const half = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
    b.set(Math.round(cx - half) + 2, y, WALNUT.hi);
  }
  // jarra d'água no meio, copos nos quatro lugares, bloco e caneta, vasinho
  b.rect(22, -1, 3, 6, 'rgba(190,225,245,0.9)');
  b.hline(22, 24, -1, '#ffffff');
  b.rect(22, 2, 3, 3, 'rgba(150,200,235,0.95)');
  for (const [x, y] of [[11, -1], [35, -1], [11, 13], [35, 13]] as const) {
    b.rect(x, y, 2, 3, 'rgba(190,225,245,0.9)');
    b.set(x, y, '#ffffff');
  }
  papers(b, 4, 4, 6, 4);
  b.line(6, 5, 9, 6, '#2a2e36');
  b.rect(31, 5, 3, 3, M.ceramic.base);
  b.set(31, 4, '#e47aa8');
  b.set(33, 3, '#f2c14e');
  b.set(32, 3, '#4c9a55');
  b.outline();
  contact(b, 4, 27, 40, 5, 0.2);
  underRect(b, 6, 18, 36, 9, 'rgba(30,34,52,0.14)');
  return { base: s };
}

// ------------------------------------------------------------------ bar de chai e café

export function coffeeBar(state: number): BufFurniture {
  const on = state >= 1;
  const s = floorSheet(3, 1, 22);
  const b = s.buf;
  // aparador: três portas de nogueira com puxadores de latão e rodapé escuro
  frontFace(b, 0, 5, 48, 11, WALNUT);
  b.vline(0, 5, 15, WALNUT.lt);
  for (const x of [16, 32]) {
    b.vline(x - 1, 6, 13, WALNUT.dd);
    b.vline(x, 6, 13, WALNUT.lt);
  }
  for (const x of [13, 18, 29, 34]) b.rect(x, 8, 1, 3, BRASS.base);
  b.rect(1, 14, 46, 2, '#3a2a20');
  // tampo de pedra escura
  const stone = ramp('#3c3d44', 0.07);
  topFace(b, 0, -3, 48, 7, stone);
  b.hline(0, 47, 4, stone.dd);
  b.hline(0, 47, 3, stone.hi);
  for (const [x, y] of [[5, -1], [21, 1], [38, 0], [44, -2]] as const) b.set(x, y, stone.lt);

  // máquina de espresso cromada: xícaras em cima, manômetro, grupo com o porta-filtro, bandeja e a xícara
  const steel = ramp('#c3cad4', 0.06);
  topFace(b, 2, -17, 13, 3, steel);
  b.rect(4, -19, 3, 2, M.ceramic.lt);
  b.rect(8, -19, 3, 2, M.ceramic.lt);
  b.rect(2, -14, 13, 14, steel.base);
  b.vline(2, -14, -1, steel.hi);
  b.vline(14, -14, -1, steel.dd);
  b.rect(3, -13, 11, 3, '#22262f');
  b.rect(4, -12, 2, 2, '#f4f2ee');
  b.set(5, -12, on ? '#e05a5a' : '#3a3f4b');
  b.set(8, -12, on ? '#5fd07a' : '#3b4a3f');
  b.set(10, -12, on ? '#f2c14e' : '#4a4535');
  b.rect(6, -8, 5, 2, steel.dk);
  b.hline(6, 10, -8, steel.hi);
  b.rect(1, -7, 5, 1, '#1e2128');
  b.rect(8, -6, 1, 1, steel.dd);
  b.rect(4, -1, 9, 1, steel.dk);
  b.hline(4, 12, -2, steel.base);
  b.rect(7, -4, 3, 2, '#f4f2ee');
  b.set(7, -4, on ? '#6b4226' : '#f4f2ee');
  b.set(8, -4, on ? '#6b4226' : '#f4f2ee');
  if (on) b.vline(8, -5, -5, '#7a4a2a');

  // fogareiro de indução com a panelinha de chai (doodh patti): leite com chá, cabo para a direita
  b.rect(17, -2, 10, 3, '#16181d');
  b.hline(17, 26, -2, '#2c3038');
  if (on) for (const x of [19, 21, 23, 25]) b.set(x, 0, '#ff6a3a');
  const pot = ramp('#b9c0ca', 0.07);
  b.rect(18, -8, 8, 6, pot.base);
  b.vline(18, -8, -3, pot.hi);
  b.vline(25, -8, -3, pot.dk);
  b.hline(18, 25, -3, pot.dd);
  b.hline(18, 25, -9, pot.lt);
  b.hline(19, 24, -8, on ? '#d9a46f' : '#c8945e');
  if (on) {
    b.set(20, -8, '#f0d2a8');
    b.set(23, -8, '#f0d2a8');
  }
  b.hline(26, 30, -7, '#2a2e36');
  b.set(30, -6, '#2a2e36');
  // copinhos de chai
  chaiGlass(b, 29, -4);
  chaiGlass(b, 32, -3);
  // pote de vidro com biscoitos e tampa de madeira
  b.rect(36, -10, 5, 9, 'rgba(205,228,240,0.55)');
  b.hline(36, 40, -11, '#8a5a3a');
  b.hline(36, 40, -12, '#a0704a');
  for (const [x, y] of [[37, -9], [38, -6], [37, -3], [39, -8], [39, -4]] as const) {
    b.rect(x, y, 2, 2, '#d8a65a');
    b.set(x, y, '#ecc27a');
  }
  b.vline(36, -10, -2, 'rgba(255,255,255,0.7)');
  // prato de samosas
  b.ellipse(44, -1, 3.6, 1.6, '#f4f2ee');
  b.hline(41, 47, 0, '#cfcac0');
  const samosa = (x: number, y: number) => {
    b.hline(x, x + 3, y + 2, '#c27e2a');
    b.hline(x, x + 2, y + 1, '#dd9b3e');
    b.set(x, y, '#eab45a');
    b.set(x + 1, y, '#dd9b3e');
    b.set(x + 3, y + 1, '#a8691f');
  };
  samosa(41, -4);
  samosa(44, -4);
  samosa(42, -6);
  b.outline();
  contact(b, 0, 14, 48, 3, 0.2);
  return { base: s };
}

/** Pontos de onde sai o vapor do bar em uso (px relativos à âncora: centro inferior do footprint 3x1). */
export const COFFEE_BAR_STEAM: readonly { dx: number; dy: number }[] = [
  { dx: 8.5 - 24, dy: -20 - 16 },
  { dx: 21.5 - 24, dy: -10 - 16 },
  { dx: 30 - 24, dy: -5 - 16 },
];

// ------------------------------------------------------------------ sofá, aparador

/** Sofá de couro chocolate de dois lugares (de frente para a câmera), capitonê no encosto. */
export function execSofa(): BufFurniture {
  const s = floorSheet(2, 1, 14);
  const b = s.buf;
  const L = DARK_LEATHER;
  const seatL = ramp(L.lt, 0.06);
  // encosto capitonê
  b.rect(3, -11, 26, 13, L.base);
  b.hline(4, 27, -11, L.lt);
  b.hline(4, 27, -10, L.hi);
  for (let y = -8; y < 1; y += 3) for (let x = 6 + ((y + 8) % 2) * 2; x < 27; x += 4) {
    b.set(x, y, L.dd);
    b.set(x + 1, y + 1, L.lt);
  }
  b.hline(3, 28, 1, L.dd);
  // assentos
  for (let i = 0; i < 2; i++) {
    const x = 4 + i * 12;
    b.rect(x, 2, 12, 7, seatL.base);
    b.rect(x, 2, 12, 3, seatL.lt);
    b.hline(x + 1, x + 10, 2, seatL.hi);
    b.hline(x, x + 11, 8, seatL.dk);
    b.vline(x + 11, 3, 8, seatL.dk);
  }
  // base e braços enrolados
  b.rect(3, 9, 26, 5, L.dk);
  b.hline(3, 28, 9, L.base);
  b.hline(3, 28, 13, L.dd);
  for (const x of [0, 28]) {
    b.rect(x, -4, 4, 18, L.base);
    b.rect(x, -6, 4, 3, L.lt);
    b.hline(x + 1, x + 2, -6, L.hi);
    b.vline(x, -3, 13, L.lt);
    b.vline(x + 3, -5, 13, L.dk);
    b.hline(x, x + 3, 13, L.dd);
  }
  // pés de latão
  for (const x of [2, 28]) {
    b.rect(x, 14, 2, 2, BRASS.dk);
    b.set(x, 14, BRASS.lt);
  }
  b.outline();
  contact(b, -1, 13, 34, 4, 0.24);
  return { base: s };
}

/** Aparador baixo de nogueira: portas ripadas, nicho com livros e, em cima, livros, globo, troféu, foto e bonsai. */
export function execCredenza(): BufFurniture {
  const s = floorSheet(3, 1, 16);
  const b = s.buf;
  frontFace(b, 0, 3, 48, 13, WALNUT);
  b.vline(0, 3, 15, WALNUT.lt);
  // portas ripadas nas pontas e o nicho de livros no meio
  for (const [x0, x1] of [[1, 15], [33, 46]] as const) for (let x = x0 + 1; x < x1; x += 2) b.vline(x, 4, 12, WALNUT.dk);
  b.rect(17, 4, 14, 9, '#2d2019');
  const books = ['#7a2e3a', '#2f4a6b', '#c9a24e', '#3f6b52', '#8a5a3a', '#4a4f6b'];
  for (let i = 0; i < 6; i++) {
    const h = 6 + (i % 3);
    b.rect(18 + i * 2, 12 - h + 1, 2, h, books[i]);
    b.set(18 + i * 2, 12 - h + 1, shade(books[i], 0.2));
  }
  b.rect(30, 9, 1, 4, '#b9c0ca');
  b.rect(1, 13, 46, 3, '#3a2a20');
  topFace(b, 0, -3, 48, 6, WALNUT);
  b.hline(0, 47, 2, WALNUT_EDGE.base);
  // livros deitados
  b.rect(3, -5, 9, 2, '#2f4a6b');
  b.rect(4, -7, 8, 2, '#7a2e3a');
  b.hline(4, 11, -7, '#9a4a56');
  b.rect(5, -8, 6, 1, '#c9a24e');
  // globo no suporte de latão
  b.ellipse(18, -9, 3.2, 3.2, '#3f7fb0');
  b.set(17, -11, '#6fae6a');
  b.set(19, -9, '#6fae6a');
  b.set(17, -8, '#6fae6a');
  b.set(16, -10, '#7fb4dc');
  b.line(15, -12, 15, -6, BRASS.base);
  b.rect(16, -5, 5, 2, BRASS.dk);
  // troféu dourado
  b.rect(25, -12, 5, 4, GOLD.base);
  b.hline(25, 29, -12, GOLD.hi);
  b.set(24, -11, GOLD.dk);
  b.set(30, -11, GOLD.dk);
  b.rect(27, -8, 1, 2, GOLD.dk);
  b.rect(25, -6, 5, 3, '#2a2e36');
  b.hline(26, 28, -5, GOLD.lt);
  // porta-retrato
  b.rect(33, -9, 5, 6, '#2a2e36');
  b.rect(34, -8, 3, 3, '#9fd3f0');
  b.set(35, -6, '#6fae6a');
  // bonsai num vasinho raso
  b.rect(40, -4, 6, 2, '#7a5a8a');
  b.hline(40, 45, -4, '#9a7aa8');
  b.line(42, -5, 43, -8, '#5a4232');
  foliage(b, 42.5, -10, 3.5, 2.2, M.leafDark, 3);
  b.outline();
  contact(b, 0, 14, 48, 3, 0.2);
  return { base: s };
}

// ------------------------------------------------------------------ antessala

/** Mesa da secretária: impressora pequena, telefone de mesa, monitor, teclado e mouse, bandejas de documentos. */
export function secretaryDesk(): BufFurniture {
  const s = floorSheet(3, 1, 22);
  const b = s.buf;
  const top = M.white;
  const legs = M.steel;
  for (const x of [0, 45]) {
    b.rect(x, 8, 3, 8, legs.base);
    b.vline(x, 8, 15, legs.lt);
    b.vline(x + 2, 8, 15, legs.dk);
  }
  // gaveteiro sob o lado direito
  frontFace(b, 31, 8, 13, 8, ramp('#dcdbd6', 0.05));
  b.hline(31, 43, 11, '#c2c1bb');
  b.hline(35, 39, 9, '#8b939f');
  b.hline(35, 39, 13, '#8b939f');
  topFace(b, 0, -6, 48, 12, top);
  b.hline(0, 47, 6, '#d7d6d1');
  b.hline(0, 47, 7, '#b9b8b2');

  // impressora pequena no canto de trás
  const p = ramp('#d9dce2', 0.05);
  topFace(b, 1, -15, 11, 3, p);
  b.rect(1, -12, 11, 7, p.base);
  b.vline(11, -12, -6, p.dk);
  b.rect(3, -11, 7, 1, '#3a3f4b');
  b.rect(3, -9, 7, 2, '#f8f7f3');
  b.set(10, -8, '#5fd07a');
  b.hline(1, 11, -6, p.dk);
  // telefone de mesa: base escura, fone por cima, teclado e visor
  b.hline(3, 11, 2, 'rgba(40,46,70,0.3)');
  b.rect(2, -3, 9, 5, '#3a3f4b');
  b.rect(2, -4, 9, 2, '#23262e');
  b.set(2, -4, '#4a505c');
  b.set(10, -4, '#4a505c');
  for (let k = 0; k < 6; k++) b.set(3 + (k % 3) * 2, -1 + Math.floor(k / 3) * 2, '#c9ced6');
  b.rect(8, -1, 2, 2, '#7fd0ff');
  // monitor, teclado e mouse
  const scr = monitorFront(b, 15, -18, 18, 12);
  keyboard(b, 18, -1, 11, 'onLight');
  mouse(b, 31, 0, 'onLight');
  // bandejas de documentos empilhadas (duas) com papéis
  for (const ty of [-11, -6]) {
    b.rect(36, ty, 9, 4, '#2c3038');
    b.hline(36, 44, ty, '#4a505c');
    b.hline(37, 43, ty - 1, '#fbfaf6');
    b.hline(37, 42, ty + 1, '#e8e4da');
  }
  b.vline(37, -11, -3, '#2c3038');
  b.vline(43, -11, -3, '#2c3038');
  mug(b, 41, 0, '#7a2e3a');
  papers(b, 34, 1, 5, 3, 'onLight');
  b.outline();
  underRect(b, 3, 8, 28, 7, 'rgba(30,34,52,0.2)');
  contact(b, -1, 13, 50, 4, 0.2);
  s.rects = { screen: rectAt(s, scr.x, scr.y, scr.w, scr.h) };
  return { base: s };
}

/** Letras 3x5 da placa da porta. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  C: ['###', '#..', '#..', '#..', '###'],
  E: ['###', '#..', '##.', '#..', '###'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
};

/** Placa de latão com "CEO", presa na coluna de vidro ao lado da porta (na altura dos olhos). */
export function doorPlate(): BufFurniture {
  const s = floorSheet(1, 1, 24);
  const b = s.buf;
  const x = 1;
  const y = -16;
  b.rect(x, y, 15, 9, BRASS.dk);
  b.rect(x + 1, y + 1, 13, 7, BRASS.base);
  b.hline(x + 1, x + 13, y + 1, BRASS.hi);
  b.vline(x + 1, y + 2, y + 7, BRASS.lt);
  let cx = x + 2;
  for (const ch of 'CEO') {
    b.stamp(GLYPHS[ch], cx, y + 2, { '#': '#4a3216' });
    cx += 4;
  }
  b.outline();
  for (let yy = y + 1; yy <= y + 9; yy++) b.under(x + 15, yy, 'rgba(30,34,52,0.2)');
  // um sopro de sombra no pé da coluna: a placa fica presa a ela (e o sprite não "flutua" acima do tile)
  for (const xx of [6, 7, 8, 9]) b.under(xx, 14, 'rgba(30,34,52,0.06)');
  return { base: s };
}

// ------------------------------------------------------------------ parede

/** Prateleira de prêmios: dois diplomas emoldurados, prateleira flutuante, troféu, placa de cristal e uma medalha. */
export function awardWall(): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  // diplomas (moldura de nogueira, papel creme, selo dourado)
  for (const x of [2, 18]) {
    b.rect(x, -29, 12, 10, WALNUT.dk);
    b.rect(x + 1, -28, 10, 8, '#f6f0de');
    b.hline(x + 2, x + 9, -27, '#7a2e3a');
    b.hline(x + 3, x + 8, -25, '#b9b2a0');
    b.hline(x + 3, x + 7, -24, '#b9b2a0');
    b.set(x + 8, -22, GOLD.base);
    b.set(x + 9, -22, GOLD.dk);
  }
  // prateleira flutuante
  b.rect(1, -11, 30, 2, WALNUT.base);
  b.hline(1, 30, -11, WALNUT.lt);
  b.hline(1, 30, -10, WALNUT_EDGE.dk);
  // troféu
  b.rect(4, -18, 6, 4, GOLD.base);
  b.hline(4, 9, -18, GOLD.hi);
  b.set(3, -17, GOLD.dk);
  b.set(10, -17, GOLD.dk);
  b.rect(6, -14, 2, 1, GOLD.dk);
  b.rect(5, -13, 4, 2, '#2a2e36');
  // placa de cristal
  b.rect(15, -18, 3, 7, 'rgba(200,232,248,0.85)');
  b.vline(15, -18, -12, '#ffffff');
  b.set(17, -18, 'rgba(140,190,225,0.9)');
  // medalha
  b.line(23, -19, 25, -16, '#3f62a3');
  b.line(27, -19, 25, -16, '#e05a5a');
  b.rect(24, -15, 3, 3, GOLD.base);
  b.set(24, -15, GOLD.hi);
  b.outline();
  for (let yy = -28; yy <= -18; yy++) {
    b.under(14, yy, 'rgba(30,34,52,0.16)');
    b.under(30, yy, 'rgba(30,34,52,0.16)');
  }
  for (let xx = 2; xx <= 31; xx++) b.under(xx, -9, 'rgba(30,34,52,0.16)');
  return { base: s };
}

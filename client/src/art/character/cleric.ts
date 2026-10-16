// Roupas dos religiosos da mesquita (o aalim e a aalima; sim/cleric.ts), desenhadas com o rig de render.ts:
//   'qaba_aba' (top)  qaba (casaco longo até o tornozelo, em topAccent) sob a aba, a capa aberta (em top: escura,
//                     marrom ou preta), que cai dos ombros pelas costas e pelos lados; as mangas são as da aba.
//   'abaya'    (top)  túnica preta até os pés, levemente evasê, com um filete discreto na frente e nos punhos.
//   'amama'    (acessório) turbante redondo enrolado (preto, como o dos sayyids, ou branco), cobrindo o alto da cabeça.
//   'tasbih'   (item) o terço de contas pendurado na mão.
// Chamadas por render.ts (drawTorso, drawAccessory, drawItem) só dentro das funções: render.ts importa este módulo.
import type { TopStyle } from '../api';
import { luminance, ramp, shade } from '../core/color';
import type { PixelBuf, Palette } from '../core/pixbuf';
import type { HeadView } from './hair';
import type { Dc } from './render';

export const CLERIC_TOPS: ReadonlySet<TopStyle> = new Set<TopStyle>(['qaba_aba', 'abaya']);

/** Linhas do turbante na grade da cabeça (o = base, h = claro, H = brilho, d = sombra, D = dobra funda). */
const AMAMA: Readonly<Record<HeadView, { x: number; y: number; rows: readonly string[] }>> = {
  down: {
    x: 0,
    y: 0,
    rows: [
      '....oooooo....',
      '..oohhhhoooo..',
      '.ohhHHhhhoood.',
      'oDDhhhhooDDdod',
      'ohhhDDooooDDdd',
      'oooooDDDdoooDd',
      '.ddddoooodddd.',
    ],
  },
  up: {
    x: 0,
    y: 0,
    rows: [
      '....oooooo....',
      '..oohhhhoooo..',
      '.ohhhhhhooood.',
      'oDDhhoooDDdodd',
      'ohhhDDoooDDddd',
      'ooDDoooDDoooDd',
      '.dddddddddddd.',
    ],
  },
  side: {
    x: 0,
    y: 0,
    rows: [
      '.....oooooo...',
      '...oohhhhooo..',
      '..ohHHhhhoood.',
      '.oDDhhhoDDdodd',
      '.ohhhDDoooDDdd',
      '.ooooDDDdooDd.',
      '..dddooooddd..',
    ],
  },
};

/** Turbante: por cima do cabelo, na altura da testa (o rosto continua livre). */
export function drawAmama(dc: Dc, ox: number, oy: number): void {
  const it = dc.p.item;
  // turbante preto: as voltas do pano em cinza-azulado, para não sumir no cabelo escuro
  const black = luminance(it.base) < 0.2;
  const pal: Palette = black
    ? { o: it.base, h: '#3e3a47', H: '#5d5869', d: '#141218', D: '#4a4655' }
    : { o: it.base, h: it.lt, H: it.hi, d: it.dk, D: shade(it.base, -0.18) };
  const t = AMAMA[dc.r.view];
  dc.b.stamp(t.rows, ox + t.x, oy + t.y + 1, pal);
}

/** Qaba sob a aba (homens) ou abaya (mulheres): o tronco e a roupa até os pés, em pé ou sentado. */
export function drawClericTop(dc: Dc): void {
  if (dc.a.topStyle === 'abaya') drawAbaya(dc);
  else drawQabaAba(dc);
}

function drawQabaAba(dc: Dc): void {
  const { b, p, r } = dc;
  const y = 18 + r.ub;
  const lx = r.lean;
  const aba = p.top;
  const qaba = p.acc;
  // em pé vai até o tornozelo (sapatos em 29-30); sentado cai sobre o colo
  const hem = r.seated ? y + 7 : Math.min(28, y + 10);
  if (r.view === 'side') {
    // qaba de perfil (frente à esquerda) e a aba caindo pelas costas
    b.rect(8 + lx, y, 7, Math.max(1, hem - y + 1), qaba.base);
    b.vline(8 + lx, y, hem, qaba.lt);
    b.hline(8 + lx, 14 + lx, hem, qaba.dk);
    if (r.seated) {
      b.rect(7 + lx, y + 5, 8, 2, qaba.base);
      b.hline(7 + lx, 13 + lx, y + 5, qaba.lt);
      b.set(7 + lx, y + 6, qaba.dk);
    }
    for (let yy = y; yy <= Math.min(hem + 1, 29); yy++) {
      b.set(12 + lx, yy, aba.base);
      b.set(13 + lx, yy, aba.base);
      b.set(14 + lx, yy, aba.dk);
      b.set(15 + lx, yy, yy > y + 1 ? aba.dd : aba.dk);
    }
    b.hline(11 + lx, 14 + lx, y, aba.lt);
    // gola branca da qaba e o botão
    b.set(9 + lx, y, '#f1ede4');
    b.set(9 + lx, y + 3, qaba.dk);
    return;
  }
  const front = r.view === 'down';
  if (!front) {
    // de costas: a aba cobre as costas inteiras, até embaixo
    b.rect(7, y, 10, Math.max(1, hem - y + 2), aba.base);
    b.vline(7, y, hem + 1, aba.lt);
    b.vline(16, y, hem + 1, aba.dd);
    b.vline(11, y + 2, hem, aba.dk);
    b.hline(8, 15, y, aba.lt);
    b.hline(7, 16, hem + 1, aba.dd);
    return;
  }
  // de frente: qaba clara no meio (botões e a gola), a aba aberta dos dois lados, dos ombros até embaixo
  b.rect(9, y, 6, Math.max(1, hem - y + 1), qaba.base);
  b.vline(9, y, hem, qaba.lt);
  b.vline(14, y, hem, qaba.dk);
  b.hline(9, 14, hem, qaba.dk);
  b.set(11, y, '#f1ede4');
  b.set(12, y, '#f1ede4');
  for (let yy = y + 2; yy < hem; yy += 2) b.set(12, yy, qaba.dk);
  if (r.seated) b.rect(8, y + 6, 8, 2, qaba.base);
  for (const [x0, x1] of [
    [7, 9],
    [15, 17],
  ] as const) {
    for (let yy = y; yy <= hem + 1 && yy <= 29; yy++) {
      for (let x = x0; x < x1; x++) b.set(x, yy, x === x0 ? (x0 === 7 ? aba.lt : aba.base) : x0 === 7 ? aba.base : aba.dk);
    }
  }
  b.hline(7, 8, y, aba.hi);
  b.hline(15, 16, y, aba.base);
}

function drawAbaya(dc: Dc): void {
  const { b, p, r } = dc;
  const y = 18 + r.ub;
  const lx = r.lean;
  const t = p.top;
  const trim = p.acc;
  const hem = r.seated ? y + 7 : Math.min(28, y + 10);
  if (r.view === 'side') {
    b.rect(8 + lx, y, 7, Math.max(1, hem - y + 1), t.base);
    b.vline(8 + lx, y, hem, t.lt);
    b.vline(14 + lx, y, hem, t.dk);
    if (!r.seated) {
      // evasê: a barra abre um pouco para a frente e para trás
      b.hline(7 + lx, 15 + lx, hem, t.base);
      b.set(7 + lx, hem, t.lt);
      b.set(15 + lx, hem, t.dk);
      b.hline(7 + lx, 15 + lx, hem + 1, t.dk);
    } else {
      b.rect(7 + lx, y + 5, 8, 2, t.base);
      b.hline(7 + lx, 13 + lx, y + 5, t.lt);
    }
    b.vline(9 + lx, y + 1, hem - 1, trim.base);
    return;
  }
  const front = r.view === 'down';
  b.rect(8, y, 8, Math.max(1, hem - y + 1), t.base);
  b.vline(8, y, hem, t.lt);
  b.vline(15, y, hem, t.dk);
  if (!r.seated) {
    b.hline(7, 16, hem, t.base);
    b.hline(7, 16, hem + 1, t.dk);
    b.set(7, hem, t.lt);
    for (let yy = y + 7; yy < hem; yy++) {
      b.set(7, yy, t.base);
      b.set(16, yy, t.dk);
    }
  } else b.rect(8, y + 6, 8, 2, t.base);
  if (front) {
    // o filete da frente (abertura) e um bordado discreto na altura do peito
    b.vline(12, y + 1, hem - 1, trim.base);
    b.set(11, y + 2, trim.lt);
    b.set(13, y + 2, trim.lt);
  }
}

/** Terço de contas (tasbih) pendurado da mão em (x, y): um laço de contas e o pingente. */
export function drawTasbih(b: PixelBuf, x: number, y: number): void {
  const bead = ramp('#3d6b4f', 0.1);
  const pts: [number, number][] = [
    [0, 0],
    [1, 1],
    [1, 2],
    [0, 3],
    [-1, 2],
    [-1, 1],
  ];
  for (const [dx, dy] of pts) b.set(x + dx, y + dy, dx < 0 ? bead.dk : bead.base);
  b.set(x, y + 4, '#d6a53a');
  b.set(x, y + 5, '#b8862a');
}

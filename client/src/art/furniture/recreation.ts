// Móveis da recreação do campus: cápsula de dormir, rede e alambrado da quadra de tênis, refletor, placar,
// lixeira-cinzeiro, abrigo da área de fumantes e placas em poste. Mesmas convenções do kit (puro).
import { ramp } from '../core/color';
import { floorSheet, rectAt, type BufFurniture } from '../core/sprite';
import { contact, glass, M, topFace, frontFace, underRect } from './kit';

// ------------------------------------------------------------------ descanso

/** Cápsula de dormir 2x1 deitada leste-oeste, com a abertura virada para a câmera (sul). */
export function sleepPod(state: number): BufFurniture {
  const closed = state >= 1;
  const s = floorSheet(2, 1, 18, 3, 3);
  const b = s.buf;
  const shell = ramp('#e9edf3', 0.045);
  const trim = ramp('#6f83a8', 0.07);
  // Teto (visto de cima, arredondado) e face frontal.
  b.rect(1, -17, 30, 9, shell.lt);
  b.hline(2, 29, -17, shell.base);
  b.hline(1, 30, -9, shell.hi);
  b.rect(0, -8, 32, 23, shell.base);
  b.vline(0, -8, 13, shell.lt);
  b.vline(31, -8, 13, shell.dk);
  // Faixa de acabamento e rodapé.
  b.hline(0, 31, -8, trim.lt);
  b.rect(0, 12, 32, 3, trim.base);
  b.hline(0, 31, 14, trim.dk);
  // Cantos arredondados.
  for (const [x, y] of [
    [1, -17],
    [30, -17],
    [0, -8],
    [31, -8],
  ] as const) {
    b.clear(x, y);
  }
  // Abertura (moldura escura com cantos arredondados).
  const ox = 5;
  const oy = -5;
  const ow = 22;
  const oh = 16;
  b.rect(ox, oy, ow, oh, '#2c3448');
  b.hline(ox + 1, ox + ow - 2, oy - 1, trim.dk);
  b.hline(ox + 1, ox + ow - 2, oy + oh, shell.hi);
  b.vline(ox - 1, oy + 1, oy + oh - 2, trim.dk);
  b.vline(ox + ow, oy + 1, oy + oh - 2, shell.dk);
  if (closed) {
    // Visor fechado: persiana azul em lâminas, luz baixa vazando embaixo e o "não perturbe".
    const v = ramp('#4c6194', 0.07);
    b.rect(ox, oy, ow, oh, v.base);
    for (let y = oy + 1; y < oy + oh - 1; y += 2) b.hline(ox, ox + ow - 1, y, v.lt);
    b.hline(ox, ox + ow - 1, oy, v.dk);
    b.hline(ox + 1, ox + ow - 2, oy + oh - 1, 'rgba(255,207,138,0.75)');
    b.rect(ox + ow - 4, oy + 6, 2, 3, '#c9d2e3');
    b.rect(14, -11, 4, 2, '#e05a5a');
    b.set(14, -11, '#ff9a8a');
  } else {
    // Aberta: colchão, travesseiro, cobertor dobrado e a luz de leitura no canto.
    b.rect(ox, oy, ow, 6, '#3b4660');
    b.rect(ox + 1, oy + 7, ow - 2, 8, '#dfe7f2');
    b.hline(ox + 1, ox + ow - 2, oy + 7, '#f6f9fc');
    b.hline(ox + 1, ox + ow - 2, oy + 14, '#b7c3d6');
    b.rect(ox + 2, oy + 5, 5, 4, '#ffffff');
    b.hline(ox + 2, ox + 6, oy + 8, '#cfd8e6');
    b.rect(ox + 12, oy + 9, 9, 5, '#7fa3d6');
    b.hline(ox + 12, ox + 20, oy + 9, '#a9c4ea');
    b.vline(ox + 12, oy + 9, oy + 13, '#5f84bd');
    b.rect(ox + 2, oy + 1, 2, 2, '#ffd98a');
    b.set(ox + 2, oy + 1, '#fff3c8');
    b.rect(14, -11, 4, 2, '#5fd07a');
    b.set(14, -11, '#a6efb7');
  }
  // Respiros na lateral direita.
  for (let i = 0; i < 3; i++) b.hline(28, 30, -4 + i * 3, shell.dk);
  b.outline();
  contact(b, 0, 13, 32, 4, 0.24);
  return { base: s };
}

// ------------------------------------------------------------------ quadra de tênis

/** Rede da quadra (corre norte-sul: de perfil, uma faixa fina com a fita branca e os postes nas pontas). */
export function tennisNet(): BufFurniture {
  const len = 11 * 16;
  const s = floorSheet(1, 11, 16, 4, 3);
  const b = s.buf;
  const h = 10;
  // Sombra da rede no piso (sol de cima/esquerda).
  for (let y = 2; y < len - 2; y++) b.set(10, y, 'rgba(20,30,40,0.18)');
  // Malha: vista de lado, a altura sobe a partir da linha da base.
  for (let y = -h; y < len - 2; y++) {
    b.set(7, y, y % 2 ? 'rgba(236,240,244,0.55)' : 'rgba(30,38,52,0.5)');
    b.set(8, y, (y + 1) % 3 ? 'rgba(30,38,52,0.42)' : 'rgba(236,240,244,0.45)');
  }
  // Fita branca no topo (um pouco abaulada: mais baixa no meio).
  for (let y = -h; y < len - 2; y++) b.set(6, y, '#f4f6f8');
  // Postes.
  for (const y0 of [-h - 4, len - 6 - h]) {
    b.rect(6, y0, 3, h + 8, '#3a4152');
    b.vline(6, y0, y0 + h + 7, '#5e6779');
    b.set(7, y0, '#8a93a5');
  }
  b.outline();
  return { base: s };
}

/** Segmento do alambrado: tela verde-escura translúcida, travessa no topo e postes. */
export function courtFence(variant: string | undefined): BufFurniture {
  const s = floorSheet(1, 1, 22, 2, 2);
  const b = s.buf;
  const post = ramp('#4a5466', 0.07);
  const mesh = (x: number, y: number) => (((x + y) % 3 === 0 || (x - y + 30) % 3 === 0) ? 'rgba(34,62,52,0.62)' : undefined);
  if (variant === 'v') {
    // de perfil: a tela vira uma linha; postes a cada tile
    for (let y = -14; y < 18; y++) b.set(8, y, (y & 1) === 0 ? 'rgba(34,62,52,0.6)' : 'rgba(34,62,52,0.35)');
    b.vline(7, -14, 17, 'rgba(160,176,170,0.25)');
    b.rect(7, -16, 3, 5, post.base);
    b.set(7, -16, post.hi);
    b.vline(9, -15, -12, post.dk);
    b.rect(8, 6, 1, 6, post.dk);
  } else if (variant === 'post') {
    b.rect(6, -18, 4, 30, post.base);
    b.vline(6, -18, 11, post.lt);
    b.vline(9, -18, 11, post.dk);
    b.rect(5, -19, 6, 2, post.hi);
    b.hline(5, 10, 11, post.dd);
    for (let x = 0; x < 16; x++) for (let y = -13; y < 10; y++) if (x < 6 || x > 9) b.set(x, y, mesh(x, y) ? 'rgba(34,62,52,0.35)' : undefined);
  } else {
    // leste-oeste: a face inteira da tela
    for (let x = 0; x < 16; x++) for (let y = -14; y < 10; y++) b.set(x, y, mesh(x, y));
    b.hline(0, 15, -15, post.lt);
    b.hline(0, 15, -14, post.dk);
    b.hline(0, 15, 10, post.base);
    b.vline(0, -16, 11, post.base);
    b.vline(1, -16, 11, post.dk);
    b.set(0, -16, post.hi);
  }
  contact(b, 0, 10, 16, 3, 0.12);
  return { base: s };
}

/** Poste alto de refletor com a cabeça de quatro lâmpadas. */
export function floodlight(): BufFurniture {
  const s = floorSheet(1, 1, 74, 6, 3);
  const b = s.buf;
  const pole = ramp('#5a6274', 0.07);
  b.rect(6, -60, 3, 74, pole.base);
  b.vline(6, -60, 13, pole.lt);
  b.vline(8, -60, 13, pole.dk);
  b.rect(4, 11, 7, 3, pole.dk);
  b.hline(4, 10, 11, pole.lt);
  // braço e cabeça (painel com quatro lâmpadas)
  b.rect(0, -71, 16, 10, '#2f3646');
  b.hline(0, 15, -71, '#4a5368');
  for (const [x, y] of [
    [2, -69],
    [8, -69],
    [2, -65],
    [8, -65],
  ] as const) {
    b.rect(x, y, 5, 3, '#fff3c4');
    b.hline(x, x + 4, y, '#ffffff');
  }
  b.outline();
  contact(b, 3, 12, 10, 3, 0.25);
  s.rects = { glow: rectAt(s, 1, -70, 14, 8) };
  return { base: s };
}

/** Placar de pé (mostrador verde-escuro; o mundo escreve o placar em rects.screen). */
export function scoreboard(): BufFurniture {
  const s = floorSheet(2, 1, 28, 3, 3);
  const b = s.buf;
  const frame = ramp('#3a4152', 0.07);
  for (const x of [4, 26]) {
    b.rect(x, -6, 2, 20, frame.base);
    b.vline(x, -6, 13, frame.lt);
  }
  b.rect(0, -27, 32, 22, frame.base);
  b.hline(0, 31, -27, frame.hi);
  b.hline(0, 31, -6, frame.dd);
  b.rect(2, -25, 28, 17, '#183626');
  b.hline(2, 29, -25, '#21452f');
  // Faixa superior (as duas equipes) e divisória central.
  b.rect(2, -25, 14, 2, '#3f7fd8');
  b.rect(16, -25, 14, 2, '#e05a5a');
  b.outline();
  contact(b, 2, 12, 28, 3, 0.2);
  s.rects = { screen: rectAt(s, 3, -22, 26, 13) };
  return { base: s };
}

// ------------------------------------------------------------------ área de fumantes

/** Lixeira-cinzeiro de inox, com areia no topo. */
export function ashBin(): BufFurniture {
  const s = floorSheet(1, 1, 8);
  const b = s.buf;
  const steel = M.steel;
  // corpo baixo e largo de inox com anel no topo e o tampo de areia
  frontFace(b, 3, 2, 10, 12, steel);
  b.vline(3, 2, 13, steel.hi);
  b.vline(5, 3, 12, steel.lt);
  b.hline(3, 12, 8, steel.dk);
  b.ellipse(8, 1.5, 5.5, 2.4, steel.base);
  b.ellipse(8, 1.3, 4.5, 1.7, '#d8c79f');
  b.set(6, 1, '#b3a07a');
  b.set(9, 0, '#f2f0ea');
  b.set(10, 1, '#f2f0ea');
  b.set(7, 2, '#8a7a5a');
  b.outline();
  contact(b, 2, 12, 12, 3, 0.22);
  return { base: s };
}

/** Abrigo 4x1: painel de vidro ao fundo, cobertura e pilares; quem senta fica à frente. */
export function smokingShelter(): BufFurniture {
  const s = floorSheet(4, 1, 36, 4, 3);
  const b = s.buf;
  const steel = ramp('#5d6779', 0.07);
  const roof = ramp('#7b8597', 0.06);
  // Painel de vidro.
  glass(b, 2, -24, 60, 30, { alpha: 0.4, period: 13 });
  b.hline(2, 61, 5, steel.dk);
  // Pilares.
  for (const x of [1, 31, 61]) {
    b.rect(x, -28, 2, 41, steel.base);
    b.vline(x, -28, 12, steel.lt);
  }
  // Cobertura (vista de cima, com beiral claro na frente).
  topFace(b, -2, -35, 68, 7, roof);
  b.hline(-2, 65, -28, roof.dd);
  b.hline(-2, 65, -29, roof.dk);
  // Cinzeiro de parede no pilar do meio.
  b.rect(29, -6, 6, 3, M.steel.base);
  b.hline(29, 34, -6, M.steel.hi);
  b.outline();
  underRect(b, 0, 7, 64, 6, 'rgba(30,34,52,0.14)');
  contact(b, 0, 12, 64, 3, 0.2);
  return { base: s };
}

/** Placa num poste: área de fumantes (cigarro com fumaça) ou quadra de tênis (raquete e bola). */
export function recSign(variant: string | undefined): BufFurniture {
  const s = floorSheet(1, 1, 30);
  const b = s.buf;
  const pole = ramp('#5a6274', 0.07);
  b.rect(7, -12, 2, 26, pole.base);
  b.vline(7, -12, 13, pole.lt);
  b.rect(5, 12, 6, 2, pole.dk);
  if (variant === 'tennis') {
    b.rect(1, -28, 14, 14, '#2f8a55');
    b.hline(1, 14, -28, '#4fb27a');
    // raquete (aro oval com cordas) e bola amarela
    b.ellipse(6.5, -22.5, 3.5, 4, '#f4f6f8');
    b.ellipse(6.5, -22.5, 2.3, 2.8, '#2f8a55');
    for (let y = -25; y <= -20; y += 2) b.hline(5, 8, y, 'rgba(244,246,248,0.7)');
    b.vline(6, -18, -16, '#f4f6f8');
    b.rect(11, -19, 3, 3, '#e3f04a');
    b.set(11, -19, '#f7ffa8');
  } else {
    b.rect(1, -28, 14, 14, '#2f6fb0');
    b.hline(1, 14, -28, '#5a95d0');
    // cigarro aceso com fumaça subindo
    b.hline(3, 10, -19, '#f4f6f8');
    b.hline(3, 10, -18, '#c9d0da');
    b.rect(11, -19, 2, 2, '#ef6a3a');
    b.set(12, -19, '#ffc04a');
    b.set(11, -22, '#dfe6ef');
    b.set(12, -23, '#dfe6ef');
    b.set(11, -24, '#dfe6ef');
    b.set(12, -26, '#c9d0da');
  }
  b.outline();
  contact(b, 4, 12, 8, 3, 0.2);
  return { base: s };
}

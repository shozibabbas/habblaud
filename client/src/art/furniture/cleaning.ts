// Canto da limpeza (estante de produtos e tanque de serviço) e o kit que a equipe leva pelo escritório: o carrinho
// (de frente, de costas e de perfil; com ou sem o balde), o balde com espremedor e a placa de "piso molhado". O
// carrinho, o balde e a placa não são móveis do layout: o mundo os desenha onde a pessoa os deixou (world/render/
// staff.ts). Coordenadas de desenho dos móveis = footprint (base em y = h*TILE), como em common.ts.
import { ramp } from '../core/color';
import { PixelBuf } from '../core/pixbuf';
import { floorSheet, type BufFurniture, type BufSprite } from '../core/sprite';
import { M, contact, frontFace, topFace } from './kit';

/** Cores do kit (o amarelo do balde e da placa é o de sempre em limpeza: dá para ver de longe). */
const KIT = {
  yellow: ramp('#f2c14e', 0.08),
  frame: ramp('#9aa3b1', 0.07),
  bag: ramp('#4a4f5c', 0.06),
  water: '#8fc3d8',
  waterLt: '#c8e6f0',
  blue: '#4f8fe6',
  green: '#4cae6a',
  pink: '#e47aa8',
  cloth: '#36b0b0',
  paper: '#f4f2ee',
  wheel: '#2b2f3a',
} as const;

// ------------------------------------------------------------------ móveis

/** Estante alta de metal com galões, borrifadores, rolos de papel e panos dobrados. */
export function janitorShelf(): BufFurniture {
  const s = floorSheet(1, 1, 22);
  const b = s.buf;
  const st = M.steel;
  topFace(b, 0, -21, 16, 3, st);
  // colunas e prateleiras vazadas (grade): o fundo é a parede, mais escuro
  b.rect(1, -18, 14, 33, '#69707d');
  for (const x of [0, 15]) b.vline(x, -18, 15, x === 0 ? st.lt : st.dk);
  const shelves = [-9, 2, 13];
  for (const y of shelves) {
    b.hline(0, 15, y, st.lt);
    b.hline(0, 15, y + 1, st.dk);
  }
  // em cima: galões azuis e borrifadores
  for (const [x, c] of [[2, KIT.blue], [5, KIT.blue]] as const) {
    b.rect(x, -16, 3, 7, c);
    b.vline(x, -16, -10, '#7fb0f0');
    b.rect(x + 1, -17, 1, 1, '#2b3a55');
  }
  for (const [x, c] of [[9, KIT.green], [12, KIT.pink]] as const) {
    b.rect(x, -14, 2, 5, c);
    b.set(x, -15, '#f4f2ee');
    b.set(x + 1, -16, '#f4f2ee');
    b.set(x + 1, -14, '#ffffff');
  }
  // meio: rolos de papel empilhados
  for (let i = 0; i < 4; i++) {
    const x = 2 + i * 3;
    b.rect(x, -6, 3, 4, KIT.paper);
    b.set(x + 1, -5, '#cfc9bd');
    b.rect(x, -2, 3, 4, KIT.paper);
    b.set(x + 1, -1, '#cfc9bd');
  }
  // embaixo: panos dobrados e uma caixa de sacos de lixo
  for (let i = 0; i < 3; i++) {
    b.rect(2, 6 + i * 2, 5, 2, i % 2 ? KIT.cloth : KIT.yellow.base);
    b.hline(2, 6, 6 + i * 2, i % 2 ? '#5fd0d0' : KIT.yellow.lt);
  }
  b.rect(9, 7, 5, 6, M.cardboard.base);
  b.hline(9, 13, 7, M.cardboard.lt);
  b.rect(10, 9, 3, 2, KIT.bag.base);
  b.outline();
  contact(b, 0, 14, 16, 3, 0.22);
  return { base: s };
}

/** Tanque baixo de serviço (de chão), torneira na borda de trás e um mop escorrendo dentro. */
export function mopSink(): BufFurniture {
  const s = floorSheet(1, 1, 18);
  const b = s.buf;
  const tub = ramp('#e3e6ea', 0.045);
  // mop encostado: o cabo sobe na diagonal atrás do tanque
  b.line(10, 3, 13, -16, '#c3c9d2');
  b.line(11, 3, 14, -16, '#8a919d');
  b.set(13, -17, '#e0623c');
  b.set(14, -17, '#e0623c');
  // tanque: borda larga, cuba funda com água e ralo
  topFace(b, 1, 0, 14, 8, tub);
  b.rect(3, 2, 10, 5, '#aab3bf');
  b.rect(4, 3, 8, 4, KIT.water);
  b.hline(4, 11, 3, '#6f8a9b');
  b.set(6, 5, KIT.waterLt);
  b.set(9, 4, KIT.waterLt);
  frontFace(b, 1, 8, 14, 7, tub);
  b.vline(1, 8, 14, tub.lt);
  // franjas do mop dentro da cuba
  for (let x = 8; x <= 12; x++) b.set(x, 4 + (x % 2), '#ece6d6');
  // torneira na borda de trás
  b.rect(3, -4, 2, 4, '#c3cad4');
  b.hline(3, 6, -5, '#e3e7ec');
  b.set(6, -4, '#c3cad4');
  b.set(4, -5, '#ffffff');
  b.outline();
  contact(b, 0, 13, 16, 3, 0.2);
  return { base: s };
}

// ------------------------------------------------------------------ kit (desenhado pelo mundo)

/** Peças do kit; o carrinho tem três vistas (para onde é empurrado) e pode estar sem o balde. */
export type CleaningProp = 'cart_down' | 'cart_up' | 'cart_side' | 'cart_down_nobucket' | 'cart_up_nobucket' | 'cart_side_nobucket' | 'bucket' | 'sign';

export function renderCleaningProp(kind: CleaningProp): BufSprite {
  switch (kind) {
    case 'bucket':
      return bucket();
    case 'sign':
      return wetFloorSign();
    default: {
      const bucketOn = !kind.endsWith('_nobucket');
      const view = kind.startsWith('cart_side') ? 'side' : kind.startsWith('cart_up') ? 'up' : 'down';
      return cart(view, bucketOn);
    }
  }
}

/** Balde amarelo com espremedor cinza e rodinhas; água azulada por cima. (x, y) = canto sup. esquerdo. */
function drawBucket(b: PixelBuf, x: number, y: number, w = 9): void {
  const k = KIT.yellow;
  b.rect(x, y + 2, w, 6, k.base);
  b.vline(x, y + 2, y + 7, k.lt);
  b.vline(x + w - 1, y + 2, y + 7, k.dk);
  b.hline(x, x + w - 1, y + 7, k.dk);
  b.rect(x + 1, y, w - 2, 2, KIT.water);
  b.set(x + 2, y, KIT.waterLt);
  // espremedor (alça cinza) no lado direito
  b.rect(x + w - 4, y - 2, 3, 3, '#8a919d');
  b.hline(x + w - 4, x + w - 2, y - 2, '#c3c9d2');
  b.set(x + 1, y + 8, KIT.wheel);
  b.set(x + w - 2, y + 8, KIT.wheel);
}

function bucket(): BufSprite {
  const buf = new PixelBuf(13, 13);
  drawBucket(buf, 2, 3);
  buf.outline();
  buf.shadow(6.5, 11.5, 5, 1.5, '#1c2034', 0.2);
  return { buf, ax: 6, ay: 12 };
}

/** Placa amarela em "A" de piso molhado: borda escura e o boneco escorregando (estilizado). */
function wetFloorSign(): BufSprite {
  const buf = new PixelBuf(12, 17);
  const k = KIT.yellow;
  // pernas de trás (o "A" aberto, visto de 3/4)
  buf.line(3, 15, 5, 2, k.dk);
  buf.line(8, 15, 6, 2, k.dk);
  // painel da frente
  for (let y = 2; y <= 14; y++) {
    const half = 1 + Math.floor((y - 2) / 3);
    buf.hline(6 - half, 5 + half, y, k.base);
  }
  buf.hline(5, 6, 1, k.lt);
  for (let y = 3; y <= 14; y++) buf.set(5 - Math.floor((y - 2) / 3), y, k.lt);
  buf.hline(2, 9, 15, k.dk);
  // pictograma: cabeça, corpo inclinado e a perna escorregando
  buf.set(6, 5, '#2b2f3a');
  buf.line(6, 7, 5, 10, '#2b2f3a');
  buf.line(5, 10, 7, 12, '#2b2f3a');
  buf.line(5, 10, 3, 11, '#2b2f3a');
  buf.line(6, 8, 8, 8, '#2b2f3a');
  buf.hline(3, 8, 13, '#2b2f3a');
  buf.outline();
  buf.shadow(5.5, 15.5, 4, 1.2, '#1c2034', 0.2);
  return { buf, ax: 6, ay: 16 };
}

/**
 * Carrinho de limpeza: estrado com o balde (embaixo), prateleira com borrifadores e rolos (em cima), saco de lixo
 * pendurado e a alça. 'side' = de perfil, alça à direita (empurrado para a esquerda; o mundo espelha). 'down' =
 * vindo para a câmera (vemos a frente, alça atrás); 'up' = indo embora (alça e saco de lixo na frente).
 */
function cart(view: 'down' | 'up' | 'side', bucketOn: boolean): BufSprite {
  const fr = KIT.frame;
  if (view === 'side') {
    const buf = new PixelBuf(22, 22);
    // rodas
    for (const x of [3, 15]) {
      buf.rect(x, 19, 3, 2, KIT.wheel);
      buf.set(x + 1, 19, '#5a6070');
    }
    // estrado e colunas
    buf.rect(2, 16, 17, 3, fr.base);
    buf.hline(2, 18, 16, fr.lt);
    buf.hline(2, 18, 18, fr.dk);
    for (const x of [11, 18]) buf.vline(x, 5, 16, x === 18 ? fr.dk : fr.base);
    // alça
    buf.line(18, 5, 20, 2, fr.lt);
    buf.hline(19, 21, 2, '#e0623c');
    // prateleira de cima com borrifadores e rolo de papel
    buf.hline(11, 18, 8, fr.lt);
    buf.hline(11, 18, 9, fr.dk);
    buf.rect(12, 4, 2, 4, KIT.blue);
    buf.set(12, 3, KIT.paper);
    buf.rect(15, 5, 2, 3, KIT.green);
    buf.set(16, 4, KIT.paper);
    // saco de lixo cinza pendurado entre as colunas
    buf.rect(12, 10, 6, 6, KIT.bag.base);
    buf.vline(12, 10, 15, KIT.bag.lt);
    buf.set(14, 11, KIT.bag.lt);
    // balde na frente do estrado
    if (bucketOn) drawBucket(buf, 1, 8, 9);
    else {
      buf.rect(3, 13, 6, 3, KIT.cloth);
      buf.hline(3, 8, 13, '#5fd0d0');
    }
    buf.outline();
    buf.shadow(10.5, 20.5, 9, 1.8, '#1c2034', 0.22);
    return { buf, ax: 11, ay: 21 };
  }
  const buf = new PixelBuf(16, 22);
  const front = view === 'down';
  // rodas
  for (const x of [2, 11]) buf.rect(x, 19, 3, 2, KIT.wheel);
  // estrado
  buf.rect(1, 15, 14, 4, fr.base);
  buf.hline(1, 14, 15, fr.lt);
  buf.hline(1, 14, 18, fr.dk);
  // colunas e prateleira
  for (const x of [1, 14]) buf.vline(x, 5, 15, x === 1 ? fr.lt : fr.dk);
  buf.hline(1, 14, 8, fr.lt);
  buf.hline(1, 14, 9, fr.dk);
  buf.rect(3, 4, 2, 4, KIT.blue);
  buf.set(3, 3, KIT.paper);
  buf.rect(7, 5, 3, 3, KIT.paper);
  buf.rect(11, 5, 2, 3, KIT.green);
  buf.set(12, 4, KIT.paper);
  if (front) {
    // de frente: o balde ocupa o estrado; a alça fica atrás (só a barra no alto)
    buf.hline(2, 13, 2, fr.dk);
    buf.set(2, 2, '#e0623c');
    buf.set(13, 2, '#e0623c');
    if (bucketOn) drawBucket(buf, 3, 9, 10);
    else {
      buf.rect(3, 12, 10, 3, KIT.cloth);
      buf.hline(3, 12, 12, '#5fd0d0');
    }
  } else {
    // de costas: saco de lixo e a alça na frente, o balde aparece por cima
    if (bucketOn) {
      buf.rect(4, 9, 8, 2, KIT.water);
      buf.hline(4, 11, 11, KIT.yellow.base);
    }
    buf.rect(3, 11, 10, 5, KIT.bag.base);
    buf.vline(3, 11, 15, KIT.bag.lt);
    buf.set(6, 12, KIT.bag.lt);
    buf.hline(1, 14, 3, fr.lt);
    buf.hline(1, 14, 4, fr.dk);
    buf.hline(5, 10, 3, '#e0623c');
  }
  buf.outline();
  buf.shadow(8, 20.5, 7, 1.8, '#1c2034', 0.22);
  return { buf, ax: 8, ay: 21 };
}

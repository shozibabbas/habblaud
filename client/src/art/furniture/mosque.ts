// Mesquita do campus: nicho da qibla, púlpito, treliças, sapateiras, cabideiro de hijabs, cesto de topis,
// torneiras e banquinhos da ablução, estante de Alcorões e os itens de parede. Coordenadas de desenho =
// footprint (base em y = h*TILE), como em common.ts. A qibla fica a OESTE (à esquerda da tela).
import { mix, ramp, shade } from '../core/color';
import type { PixelBuf } from '../core/pixbuf';
import { floorSheet, rectAt, wallSheet, type BufFurniture } from '../core/sprite';
import { M, contact, frontFace, rngOf, topFace, underRect } from './kit';

/** Paleta da mesquita: pedra clara, verde da faixa, ouro velho, azulejo turquesa. */
export const MOSQUE = {
  stone: ramp('#f1ece0', 0.045),
  green: ramp('#2f7a5c', 0.07),
  gold: ramp('#d6a53a', 0.08),
  tile: ramp('#3a9fa0', 0.07),
  blue: ramp('#2d5fa8', 0.07),
  wood: ramp('#8a5a3c', 0.065),
} as const;

/** Sombra suave projetada na parede (abaixo/direita do objeto). */
function wallShadow(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  for (let yy = y + 1; yy <= y + h; yy++) b.under(x + w, yy, 'rgba(30,34,52,0.16)');
  for (let xx = x + 1; xx <= x + w; xx++) b.under(xx, y + h, 'rgba(30,34,52,0.16)');
}

/**
 * Arco pontudo deitado, apontando para oeste (a qibla), visto de cima: o mesmo desenho dos tapetes de oração.
 * (x, y) = canto superior esquerdo da caixa w×h.
 */
export function westArch(b: PixelBuf, x: number, y: number, w: number, h: number, edge: string, fill?: string): void {
  const cy = y + (h - 1) / 2;
  const nose = Math.max(3, Math.round(h * 0.75));
  for (let i = 0; i < w; i++) {
    // meia-largura do arco na coluna i: cresce rápido perto da ponta (curva) e fica reta no corpo
    const t = Math.min(1, i / nose);
    const half = Math.round(((h - 1) / 2) * Math.sqrt(t * (2 - t)));
    const top = Math.round(cy - half);
    const bot = Math.round(cy + half);
    if (fill && bot - top > 1) b.vline(x + i, top + 1, bot - 1, fill);
    b.set(x + i, top, edge);
    b.set(x + i, bot, edge);
  }
  b.vline(x + w - 1, y, y + h - 1, edge);
}

// ------------------------------------------------------------------ qibla

/** Nicho da qibla na parede oeste, visto de cima: recorte em arco com azulejos, moldura dourada e lamparina. */
export function mihrab(): BufFurniture {
  const s = floorSheet(1, 2, 18, 4, 3);
  const b = s.buf;
  const st = MOSQUE.stone;
  const g = MOSQUE.gold;
  const t = MOSQUE.tile;
  // Bloco da parede (engrossada no nicho) com a face do nicho voltada para leste.
  b.rect(-4, -4, 12, 36, st.base);
  b.vline(-4, -4, 31, st.dk);
  b.hline(-4, 7, -4, st.hi);
  b.vline(7, -4, 31, st.lt);
  // Recorte do nicho: arco pontudo para oeste, com fundo de azulejo e sombra interna.
  westArch(b, -2, 1, 11, 26, g.dk, t.dk);
  westArch(b, -1, 3, 9, 22, g.base, t.base);
  for (let y = 6; y < 23; y += 3) for (let x = 1; x < 7; x += 3) b.set(x + ((y / 3) % 2), y, t.lt);
  b.vline(-1, 9, 18, 'rgba(20,30,40,0.35)');
  b.vline(0, 8, 19, 'rgba(20,30,40,0.18)');
  // Colunetas na boca do nicho e soleira dourada.
  for (const y of [1, 26]) {
    b.rect(7, y - 1, 3, 3, g.base);
    b.set(7, y - 1, g.hi);
    b.set(9, y + 1, g.dk);
  }
  b.vline(10, 2, 26, g.dk);
  // Lamparina de latão pendurada (corrente subindo).
  b.vline(3, -14, -2, '#8a7a5a');
  b.rect(1, -2, 5, 6, g.base);
  b.hline(1, 5, -2, g.hi);
  b.rect(2, 0, 3, 2, '#ffe9a8');
  b.set(3, 4, g.dk);
  b.outline();
  contact(b, -4, 30, 16, 3, 0.18);
  return { base: s };
}

/** Púlpito de perfil: degraus de madeira subindo para oeste, corrimão e um dossel sobre o assento. */
export function minbar(): BufFurniture {
  const s = floorSheet(2, 1, 36, 4, 3);
  const b = s.buf;
  const w = MOSQUE.wood;
  const g = MOSQUE.gold;
  // Corpo em degraus (face sul visível): o degrau mais alto fica a oeste.
  const steps = [
    { x: 22, top: 6 },
    { x: 14, top: 0 },
    { x: 6, top: -6 },
  ];
  for (const st of steps) {
    frontFace(b, st.x, st.top, 8, 16 - st.top, w);
    b.hline(st.x, st.x + 7, st.top, w.hi);
    b.vline(st.x, st.top, 15, w.lt);
  }
  // Patamar e assento sob o dossel.
  frontFace(b, 0, -10, 8, 26, w);
  b.hline(0, 7, -10, w.hi);
  // Portal em arco no pé da escada (leste).
  b.rect(28, -4, 2, 20, w.dk);
  b.rect(29, -6, 2, 2, g.base);
  // Corrimão acompanhando a subida.
  b.line(29, -4, 6, -18, w.dd, 1);
  b.line(29, -5, 6, -19, w.lt, 1);
  for (const x of [10, 18, 25]) b.vline(x, Math.round(-18 + ((x - 6) * 14) / 23), Math.round(-18 + ((x - 6) * 14) / 23) + 6, w.dk);
  // Dossel: duas colunas finas e uma cúpula pequena com remate.
  b.vline(0, -26, -10, w.dk);
  b.vline(7, -26, -10, w.dk);
  b.rect(-1, -28, 10, 2, g.base);
  b.hline(-1, 8, -28, g.hi);
  b.ellipse(3.5, -30, 4, 3, MOSQUE.green.base);
  b.hline(1, 5, -32, MOSQUE.green.lt);
  b.vline(3, -35, -33, g.base);
  // Entalhes dourados nos painéis.
  for (const st of steps) b.rect(st.x + 3, st.top + 5, 2, 3, g.dk);
  b.rect(3, -3, 2, 4, g.dk);
  b.outline();
  contact(b, -1, 13, 34, 4, 0.22);
  return { base: s };
}

/** Treliça entalhada (jali) correndo norte-sul: topo de madeira e a face leste com o rendilhado. */
export function jaliScreen(variant: string | undefined): BufFurniture {
  const s = floorSheet(1, 1, 24, 2);
  const b = s.buf;
  const w = MOSQUE.wood;
  if (variant === 'end') {
    // Ponta: pilarete de madeira com capitel dourado.
    topFace(b, 4, 2, 8, 4, w);
    frontFace(b, 4, 6, 8, 10, w);
    b.rect(5, -20, 6, 24, w.base);
    b.vline(5, -20, 3, w.lt);
    b.vline(10, -20, 3, w.dk);
    b.rect(4, -22, 8, 3, MOSQUE.gold.base);
    b.hline(4, 11, -22, MOSQUE.gold.hi);
    b.outline();
    contact(b, 3, 13, 10, 4, 0.2);
    return { base: s };
  }
  // 'v': faixa contínua (sem contorno lateral nas emendas): topo, rendilhado em losangos e sombra.
  b.vline(4, -18, 15, w.dk);
  b.vline(5, -18, 15, w.hi);
  b.vline(6, -18, 15, w.lt);
  b.vline(7, -18, 15, w.base);
  for (let y = -18; y < 16; y++) {
    const k = ((y % 4) + 4) % 4;
    for (let x = 8; x <= 11; x++) {
      const hole = (k === 1 && (x === 9 || x === 10)) || (k === 2 && (x === 8 || x === 11)) || (k === 3 && (x === 9 || x === 10));
      b.set(x, y, hole ? 'rgba(40,24,16,0.35)' : x === 11 ? w.dk : w.base);
    }
  }
  underRect(b, 12, -16, 2, 32, 'rgba(30,34,52,0.12)');
  return { base: s };
}

// ------------------------------------------------------------------ entradas

const SHOES_M = ['#3b2a22', '#6b4a2e', '#8a5a34', '#2f3440', '#c9b79a', '#4a3a30', '#d8d4cc', '#5a3d2a'] as const;
const SHOES_F = ['#c0394b', '#d6a53a', '#e47aa8', '#8d66cf', '#3a9fa0', '#f0e6d2', '#b05f3c', '#d8648a'] as const;

/** Sapateira de madeira (2x1) encostada na parede: duas prateleiras de nichos com pares de sapatos. */
export function shoeRack(variant: string | undefined): BufFurniture {
  const s = floorSheet(2, 1, 14);
  const b = s.buf;
  const w = M.walnut;
  const r = rngOf(variant === 'f' ? 7 : 3, 11);
  const colors = variant === 'f' ? SHOES_F : SHOES_M;
  topFace(b, 0, -10, 32, 4, w);
  frontFace(b, 0, -6, 32, 22, w);
  b.vline(0, -6, 15, w.lt);
  // Nichos (4 por prateleira) com sombra interna.
  for (const sy of [-4, 5]) {
    for (let i = 0; i < 4; i++) {
      const x = 2 + i * 7;
      b.rect(x, sy, 6, 7, w.dd);
      b.hline(x, x + 5, sy, shade(w.dd, -0.15));
      if (r() < 0.78) {
        // um par: duas bicos lado a lado, com a palmilha clara
        const c = ramp(colors[Math.floor(r() * colors.length)], 0.08);
        for (const dx of [0, 3]) {
          b.rect(x + dx, sy + 3, 3, 4, c.base);
          b.set(x + dx, sy + 3, c.lt);
          b.set(x + dx + 1, sy + 4, variant === 'f' && r() < 0.5 ? MOSQUE.gold.lt : c.dk);
          b.hline(x + dx, x + dx + 2, sy + 6, c.dk);
        }
      }
    }
  }
  b.rect(0, 14, 32, 2, w.dd);
  b.outline();
  contact(b, 0, 13, 32, 4, 0.22);
  return { base: s };
}

const HIJAB_COLORS = ['#f4f1ea', '#a8c8e8', '#e8b4c4', '#b9a8dc', '#a8d8c0', '#e8d4a8', '#3f4a6b'] as const;

/** Cabideiro com hijabs pendurados (cores suaves) e uma pilha dobrada na prateleira de baixo. */
export function hijabRack(): BufFurniture {
  const s = floorSheet(2, 1, 28);
  const b = s.buf;
  const w = M.oakDark;
  // Base com prateleira baixa.
  topFace(b, 1, 6, 30, 3, w);
  frontFace(b, 1, 9, 30, 6, w);
  // Pilha dobrada.
  for (let i = 0; i < 4; i++) {
    const c = ramp(HIJAB_COLORS[(i * 2 + 1) % HIJAB_COLORS.length], 0.06);
    b.rect(4, 4 - i * 2, 9, 2, c.base);
    b.hline(4, 12, 4 - i * 2, c.lt);
    b.set(12, 5 - i * 2, c.dk);
  }
  // Montantes e barra.
  b.rect(1, -24, 2, 31, w.base);
  b.rect(29, -24, 2, 31, w.dk);
  b.rect(0, -25, 32, 2, w.lt);
  b.hline(0, 31, -25, w.hi);
  // Hijabs pendurados na barra: tecido caindo em pregas, ponta inferior irregular.
  const hang = [
    { x: 14, c: 0, len: 22 },
    { x: 19, c: 2, len: 19 },
    { x: 24, c: 4, len: 21 },
  ];
  for (const hg of hang) {
    const c = ramp(HIJAB_COLORS[hg.c], 0.06);
    for (let i = 0; i < 5; i++) {
      const len = hg.len - (i === 0 || i === 4 ? 2 : 0) - (i % 2);
      b.vline(hg.x + i, -23, -23 + len, i === 0 ? c.lt : i === 4 ? c.dk : c.base);
    }
    b.vline(hg.x + 2, -21, -23 + hg.len - 3, c.dk);
    b.hline(hg.x - 1, hg.x + 5, -23, c.hi);
  }
  b.outline();
  contact(b, 0, 13, 32, 4, 0.2);
  return { base: s };
}

/** Mesinha com um cesto de palha cheio de topis brancos de crochê. */
export function topiShelf(): BufFurniture {
  const s = floorSheet(1, 1, 16);
  const b = s.buf;
  const w = M.walnut;
  topFace(b, 0, -2, 16, 5, w);
  frontFace(b, 0, 3, 16, 9, w);
  b.rect(1, 12, 2, 4, w.dk);
  b.rect(13, 12, 2, 4, w.dk);
  // Cesto de palha.
  const straw = ramp('#d4b06a', 0.07);
  b.rect(2, -7, 12, 6, straw.base);
  for (let x = 3; x < 14; x += 2) b.vline(x, -7, -2, straw.dk);
  b.hline(2, 13, -7, straw.lt);
  b.hline(2, 13, -2, straw.dd);
  // Topis empilhados (cúpulas brancas com textura de crochê).
  for (const [cx, cy] of [[5, -9], [10, -9], [7.5, -11]] as const) {
    b.ellipse(cx, cy, 3, 2, '#f4f2ee');
    b.hline(Math.round(cx - 2), Math.round(cx + 2), Math.round(cy + 1), '#d9d4ca');
    b.set(Math.round(cx), Math.round(cy - 1), '#ffffff');
    b.set(Math.round(cx) - 1, Math.round(cy), '#e2ddd2');
    b.set(Math.round(cx) + 1, Math.round(cy), '#e2ddd2');
  }
  b.outline();
  contact(b, 0, 13, 16, 3, 0.2);
  return { base: s };
}

// ------------------------------------------------------------------ ablução (wudu)

/**
 * Trecho da mureta das torneiras (corre norte-sul): topo de mármore, a face leste em azulejo com a torneira de
 * latão e a canaleta no chão. Quem usa senta a leste, virado para oeste. state 1 = torneira aberta (o mundo
 * desenha o fio d'água).
 */
export function wuduTap(state: number): BufFurniture {
  const s = floorSheet(1, 1, 16, 2);
  const b = s.buf;
  const top = ramp('#ebe8e1', 0.04);
  const t = MOSQUE.tile;
  // Canaleta de pedra ao pé da mureta (lado leste), com água parada.
  b.rect(10, 4, 6, 12, '#a3abb6');
  b.vline(10, 4, 15, '#7d8592');
  b.rect(11, 4, 3, 12, 'rgba(120,180,220,0.55)');
  b.set(12, 8, '#ffffff');
  // Topo da mureta (contínuo entre os trechos): mármore com friso.
  b.vline(0, -12, 3, top.dk);
  b.rect(1, -12, 6, 16, top.lt);
  b.vline(2, -12, 3, top.hi);
  b.vline(6, -12, 3, top.base);
  // Face leste em azulejo (xadrez turquesa e branco) e o rodapé escuro.
  for (let y = -11; y < 6; y++) {
    for (let x = 7; x <= 9; x++) b.set(x, y, ((y >> 1) + x) % 2 === 0 ? t.base : '#f4f6f4');
  }
  b.hline(7, 9, -11, t.dk);
  b.vline(10, -11, 3, t.dk);
  // Torneira de latão saindo da face leste.
  const g = MOSQUE.gold;
  b.rect(9, -7, 3, 2, g.base);
  b.set(9, -7, g.hi);
  b.rect(11, -6, 2, 2, g.dk);
  b.set(12, -4, g.dk);
  b.set(10, -9, g.lt); // registro
  if (state === 1) {
    // Torneira aberta: a canaleta molhada brilha.
    b.vline(13, 5, 14, 'rgba(170,225,250,0.9)');
    b.set(12, 11, '#ffffff');
  }
  underRect(b, 10, -10, 1, 16, 'rgba(30,34,52,0.14)');
  return { base: s };
}

/** Banquinho baixo de pedra diante da torneira (assento). */
export function wuduStool(): BufFurniture {
  const s = floorSheet(1, 1, 4);
  const b = s.buf;
  const st = ramp('#cfd3d6', 0.05);
  topFace(b, 4, 4, 8, 4, st);
  frontFace(b, 4, 8, 8, 6, st);
  b.vline(4, 8, 13, st.lt);
  b.outline();
  contact(b, 3, 12, 10, 3, 0.2);
  return { base: s };
}

/** Estante baixa com Alcorões encadernados (verde, vinho e azul, com filete dourado). */
export function quranShelf(): BufFurniture {
  const s = floorSheet(2, 1, 14);
  const b = s.buf;
  const w = M.walnut;
  topFace(b, 0, -10, 32, 4, w);
  frontFace(b, 0, -6, 32, 22, w);
  const covers = ['#2f6b4f', '#7a2a36', '#24406e', '#2f6b4f', '#5a2a4e'] as const;
  for (const sy of [-4, 5]) {
    b.rect(2, sy, 28, 7, w.dd);
    for (let x = 3, i = sy; x < 29; x += 3, i++) {
      const c = ramp(covers[((i % covers.length) + covers.length) % covers.length], 0.07);
      b.rect(x, sy + 1, 2, 6, c.base);
      b.set(x, sy + 1, c.lt);
      b.set(x, sy + 3, MOSQUE.gold.lt);
      b.set(x + 1, sy + 3, MOSQUE.gold.dk);
    }
  }
  b.outline();
  contact(b, 0, 13, 32, 4, 0.22);
  return { base: s };
}

// ------------------------------------------------------------------ parede

/** Janela em arco pontudo com treliça; rects.glass = vidro (o mundo acende à noite). */
export function archWindow(): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const st = MOSQUE.stone;
  const x = 6;
  const w = 20;
  const yTop = -29;
  const yBot = -7;
  const cx = x + w / 2 - 0.5;
  // Silhueta do arco (moldura) e o vidro azulado com a treliça.
  for (let y = yTop; y <= yBot; y++) {
    const k = y - yTop;
    const half = k < 9 ? Math.round(Math.sqrt(k / 9) * (w / 2)) : w / 2;
    if (half <= 0) {
      b.set(Math.round(cx), y, st.dk);
      continue;
    }
    const l = Math.round(cx - half + 0.5);
    const r = Math.round(cx + half - 0.5);
    b.hline(l, r, y, st.lt);
    if (r - l > 3 && y > yTop + 1 && y < yBot) b.hline(l + 2, r - 2, y, '#7fb4d4');
  }
  for (let y = yTop + 4; y < yBot; y += 3) for (let xx = x + 3; xx < x + w - 2; xx += 3) b.set(xx + (y % 2), y, 'rgba(240,236,224,0.85)');
  b.vline(Math.round(cx), yTop + 2, yBot - 1, st.base);
  b.rect(x - 2, yBot, w + 4, 2, st.lt);
  b.hline(x - 2, x + w + 1, yBot, st.hi);
  b.hline(x - 2, x + w + 1, yBot + 1, st.dk);
  b.outline();
  wallShadow(b, x - 2, yTop, w + 4, yBot - yTop + 3);
  s.rects = { glass: rectAt(s, x + 2, yTop + 4, w - 4, yBot - yTop - 4) };
  return { base: s };
}

/** Quadro dos horários das orações: moldura dourada, fundo verde e seis mostradores (sem texto). */
export function prayerTimes(): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const g = MOSQUE.gold;
  const gr = MOSQUE.green;
  const x = 4;
  const y = -27;
  const w = 24;
  const h = 17;
  b.rect(x, y, w, h, g.base);
  b.hline(x, x + w - 1, y, g.hi);
  b.vline(x + w - 1, y, y + h - 1, g.dk);
  b.rect(x + 1, y + 1, w - 2, h - 2, gr.dk);
  b.hline(x + 2, x + w - 3, y + 5, mix(gr.dk, g.base, 0.4));
  // Seis mostradores (Fajr, Zuhr, Asr, Maghrib, Isha, Jumu'ah) com ponteiros em horas diferentes.
  const hands = [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]] as const;
  for (let i = 0; i < 6; i++) {
    const cx = x + 5 + (i % 3) * 7;
    const cy = y + 8 + Math.floor(i / 3) * 5;
    b.rect(cx - 1, cy - 1, 3, 3, '#f4f1e6');
    b.set(cx, cy, '#2b2f3a');
    b.set(cx + hands[i][0], cy + hands[i][1], '#5a6070');
  }
  b.rect(x + 9, y + 2, 6, 2, g.lt);
  b.outline();
  wallShadow(b, x - 1, y - 1, w + 2, h + 2);
  return { base: s };
}

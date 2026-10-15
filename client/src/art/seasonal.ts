// Decorações procedurais em pixel art. Mesma escala dos móveis do escritório.
// Ramadã e Eid: fanoos (lanternas), lua crescente, balões, iftar (tâmaras, água, pakoras, sharbat) e doces
// do Eid (sheer khurma, caixa de mithai). Nada de figuras de animais.
import { PixelBuf } from './core/pixbuf';
import type { BufSprite } from './core/sprite';

/** Peças de chão (no lugar das plantas): folha 40x64, âncora no centro inferior do tile. */
export type SeasonalFloorProp = 'fanoos_tall' | 'fanoos' | 'fanoos_green' | 'fanoos_teal' | 'balloons_fitr' | 'balloons_adha';
/** Enfeite pendurado acima da moldura do elevador. */
export type SeasonalWallProp = 'crescent';
/** Itens pequenos sobre mesas: folha 16x14, âncora no centro inferior do item (o tampo). */
export type SeasonalTableProp = 'dates' | 'water' | 'sharbat' | 'pakora' | 'khurma' | 'mithai' | 'fanoos_mini';
export type SeasonalProp = SeasonalFloorProp | SeasonalWallProp | SeasonalTableProp;

const TABLE_PROPS: ReadonlySet<SeasonalProp> = new Set<SeasonalProp>(['dates', 'water', 'sharbat', 'pakora', 'khurma', 'mithai', 'fanoos_mini']);

const BRASS = { dd: '#6e4a2b', dk: '#94683a', base: '#c08d45', lt: '#e2b864', hi: '#f7dc94' };
const GLASS = {
  amber: { lt: '#ffe3a1', base: '#ffc767', dk: '#e9963f' },
  green: { lt: '#e1f7c4', base: '#9fda86', dk: '#4ea567' },
  teal: { lt: '#d6f7f1', base: '#8fdcd2', dk: '#3c9f9a' },
};

/** Lua crescente aberta para a direita: disco (cx, cy, r) menos um disco deslocado. */
function crescent(b: PixelBuf, cx: number, cy: number, r: number, c: string, hi?: string): void {
  const cut = r * 0.82;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const ex = x + 0.5 - (cx + r * 0.45), ey = y + 0.5 - (cy - r * 0.1);
      if (dx * dx + dy * dy <= r * r && ex * ex + ey * ey > cut * cut) b.set(x, y, hi && dx < -r * 0.45 ? hi : c);
    }
  }
}

/** Estrela pequena (cruz de 5 px com centro claro). */
function star(b: PixelBuf, x: number, y: number, c: string, hi: string): void {
  b.set(x, y - 1, c);
  b.set(x - 1, y, c);
  b.set(x + 1, y, c);
  b.set(x, y + 1, c);
  b.set(x, y, hi);
}

/** Fanoos de chão: base, corpo de vidro em gomos, cúpula furada e argola. `cx` = centro; `bottom` = chão. */
function smallFanoos(b: PixelBuf, cx: number, bottom: number, glass: (typeof GLASS)[keyof typeof GLASS]): void {
  const y = bottom;
  b.shadow(cx, y - 1, 7, 2, '#252c39', 0.2);
  b.rect(cx - 5, y - 4, 11, 3, BRASS.dk);
  b.hline(cx - 5, cx + 5, y - 4, BRASS.lt);
  // corpo: 3 gomos de vidro entre hastes de latão
  b.rect(cx - 4, y - 14, 9, 10, glass.base);
  b.rect(cx - 1, y - 13, 3, 8, glass.lt);
  b.vline(cx - 4, y - 14, y - 5, glass.dk);
  b.vline(cx + 4, y - 14, y - 5, glass.dk);
  for (const hx of [cx - 2, cx + 2]) b.vline(hx, y - 14, y - 5, BRASS.base);
  b.hline(cx - 4, cx + 4, y - 9, BRASS.dk);
  b.set(cx, y - 11, '#ffffff');
  // cúpula e argola
  b.rect(cx - 5, y - 16, 11, 2, BRASS.base);
  b.hline(cx - 5, cx + 5, y - 16, BRASS.lt);
  b.rect(cx - 3, y - 18, 7, 2, BRASS.base);
  b.set(cx - 1, y - 17, BRASS.dd);
  b.set(cx + 1, y - 17, BRASS.dd);
  b.rect(cx - 1, y - 20, 3, 2, BRASS.lt);
  b.set(cx, y - 22, BRASS.base);
  b.set(cx - 1, y - 21, BRASS.base);
  b.set(cx + 1, y - 21, BRASS.base);
}

function balloons(b: PixelBuf, colors: readonly string[], box: string, ribbon: string): void {
  b.shadow(20, 59, 8, 2, '#252c39', 0.2);
  // peso: caixinha de presente
  b.rect(15, 52, 11, 8, box);
  b.rect(15, 52, 11, 2, ribbon);
  b.vline(20, 52, 59, ribbon);
  b.set(18, 51, ribbon);
  b.set(22, 51, ribbon);
  const spots: readonly (readonly [number, number])[] = [[12, 21], [27, 18], [19, 11], [30, 31], [10, 34]];
  spots.forEach(([cx, cy], i) => {
    const c = colors[i % colors.length];
    b.ellipse(cx, cy, 4.5, 5.5, c);
    b.rect(cx - 2, cy - 3, 2, 2, '#ffffff');
    b.set(cx - 3, cy - 1, '#ffffff');
    b.set(cx, cy + 6, c);
  });
  b.outline();
  // fios por cima do contorno (finos, sem borda)
  for (const [cx, cy] of spots) b.line(cx, cy + 7, 20, 51, '#efe7d6');
}

function renderFloor(kind: SeasonalFloorProp | SeasonalWallProp): BufSprite {
  const b = new PixelBuf(40, 64);
  const rect = (x: number, y: number, w: number, h: number, c: string) => b.rect(x, y, w, h, c);
  if (kind === 'fanoos_tall') {
    // Fanoos alto de pé: pedestal, corpo de vidro âmbar com arcos, cúpula furada e lua crescente no alto.
    const g = GLASS.amber;
    b.shadow(20, 59, 10, 3, '#252c39', 0.22);
    rect(13, 56, 15, 3, BRASS.dd);
    b.hline(13, 27, 56, BRASS.dk);
    rect(15, 54, 11, 2, BRASS.dk);
    rect(18, 47, 5, 7, BRASS.base);
    b.vline(18, 47, 53, BRASS.lt);
    b.vline(22, 47, 53, BRASS.dk);
    // cone de baixo
    rect(16, 45, 9, 2, BRASS.base);
    rect(13, 42, 15, 3, BRASS.dk);
    b.hline(13, 27, 42, BRASS.lt);
    // corpo: três gomos (o do meio claro), arcos no alto e losango vermelho/verde
    rect(13, 23, 15, 19, g.base);
    rect(18, 24, 5, 17, g.lt);
    rect(13, 23, 2, 19, g.dk);
    rect(26, 23, 2, 19, g.dk);
    for (const hx of [15, 17, 23, 25]) b.vline(hx, 23, 41, BRASS.base);
    for (const [ax, aw] of [[15, 3], [18, 5], [23, 3]] as const) {
      b.hline(ax, ax + aw - 1, 27, BRASS.base);
      b.set(ax + Math.floor(aw / 2), 26, BRASS.base);
    }
    b.set(20, 31, '#c8463d');
    b.hline(19, 21, 32, '#c8463d');
    b.set(20, 33, '#c8463d');
    b.set(20, 32, '#ffffff');
    b.set(16, 35, '#2f8f8a');
    b.set(24, 35, '#2f8f8a');
    b.hline(13, 27, 37, BRASS.dk);
    // aro de cima e cúpula
    rect(12, 20, 17, 3, BRASS.base);
    b.hline(12, 28, 20, BRASS.hi);
    rect(14, 17, 13, 3, BRASS.base);
    rect(16, 15, 9, 2, BRASS.lt);
    rect(18, 13, 5, 2, BRASS.base);
    for (const px of [15, 18, 21, 24]) b.set(px, 18, BRASS.dd);
    b.vline(20, 9, 12, BRASS.dk);
    crescent(b, 20, 6, 3.5, BRASS.lt, BRASS.hi);
  } else if (kind === 'fanoos' || kind === 'fanoos_green' || kind === 'fanoos_teal') {
    smallFanoos(b, 20, 60, kind === 'fanoos' ? GLASS.amber : kind === 'fanoos_green' ? GLASS.green : GLASS.teal);
  } else if (kind === 'balloons_fitr') {
    balloons(b, ['#3fae6a', '#f2c14e', '#f5f1e6', '#7fcf86', '#e3a93a'], '#2f8f5b', '#f2c14e');
    return { buf: b, ax: 20, ay: 60 };
  } else if (kind === 'balloons_adha') {
    balloons(b, ['#2fa3a0', '#ebb54d', '#f5f1e6', '#a8455a', '#6fcfc6'], '#227d7b', '#ebb54d');
    return { buf: b, ax: 20, ay: 60 };
  } else {
    // crescente com estrela, pendurado num fio curto
    b.vline(19, 44, 48, BRASS.dk);
    crescent(b, 19, 53, 4.5, BRASS.lt, BRASS.hi);
    star(b, 24, 50, BRASS.lt, '#fff6d6');
  }
  b.outline();
  return { buf: b, ax: 20, ay: 60 };
}

function renderTable(kind: SeasonalTableProp): BufSprite {
  const b = new PixelBuf(16, 14);
  const plate = (x0: number, x1: number) => {
    b.rect(x0, 10, x1 - x0 + 1, 2, '#f2ede2');
    b.hline(x0 + 1, x1 - 1, 12, '#cfc8b8');
    b.hline(x0 + 1, x1 - 1, 9, '#fbf8f1');
  };
  if (kind === 'dates') {
    plate(3, 12);
    for (const [x, y] of [[4, 9], [7, 9], [10, 9], [5, 8], [9, 8]] as const) {
      b.rect(x, y, 2, 1, '#6b3a22');
      b.set(x, y, '#9a5a32');
    }
  } else if (kind === 'pakora') {
    plate(3, 12);
    for (const [x, y, c] of [[4, 8, '#c98a3a'], [7, 8, '#b7782c'], [10, 8, '#d39a45'], [6, 7, '#d39a45'], [9, 7, '#c98a3a']] as const) {
      b.rect(x, y, 2, 2, c);
      b.set(x + 1, y, '#e8b866');
    }
    b.set(12, 8, '#7fbf55');
  } else if (kind === 'water' || kind === 'sharbat') {
    // copo de vidro (água) ou de sharbat de rosas
    const liquid = kind === 'water' ? '#a9d8f0' : '#d8405e';
    b.rect(6, 5, 4, 7, '#dff1f8');
    b.rect(6, 7, 4, 5, liquid);
    b.vline(6, 5, 11, '#ffffff');
    b.hline(6, 9, 12, '#b9d3df');
    if (kind === 'sharbat') b.set(8, 7, '#f28aa0');
  } else if (kind === 'khurma') {
    // tigela de sheer khurma: creme com aletria, pistache e amêndoa
    b.rect(3, 8, 10, 4, '#f4f2ee');
    b.hline(4, 11, 12, '#c9c4b8');
    b.hline(3, 12, 8, '#3f7fd8');
    b.rect(4, 6, 8, 2, '#f3e3c3');
    b.hline(5, 10, 5, '#f3e3c3');
    for (const [x, y] of [[5, 6], [8, 5], [10, 6]] as const) b.set(x, y, '#c99a5b');
    b.set(7, 6, '#8cbf5a');
    b.set(9, 6, '#8cbf5a');
    b.set(6, 5, '#e9d2a4');
  } else if (kind === 'mithai') {
    // caixa de mithai aberta: laddoo, barfi com prata e pistache
    b.rect(2, 4, 12, 3, '#f7e9ea');
    b.hline(2, 13, 4, '#d0465e');
    b.rect(2, 7, 12, 5, '#d0465e');
    b.rect(3, 7, 10, 4, '#f7efe0');
    for (const [x, c] of [[3, '#f0a040'], [6, '#f6f0e2'], [9, '#9cc56a'], [11, '#f0a040']] as const) {
      b.rect(x, 8, 2, 2, c);
      b.set(x, 8, x === 6 ? '#dfe4ea' : '#ffffff');
    }
    b.hline(3, 12, 12, '#a8354a');
  } else {
    // fanoos de mesa
    b.rect(5, 11, 6, 1, BRASS.dk);
    b.rect(6, 5, 4, 6, GLASS.amber.base);
    b.vline(7, 6, 9, GLASS.amber.lt);
    b.vline(8, 5, 10, BRASS.base);
    b.rect(5, 4, 6, 1, BRASS.base);
    b.rect(6, 3, 4, 1, BRASS.lt);
    b.set(7, 2, BRASS.base);
    b.set(8, 2, BRASS.base);
  }
  b.outline();
  return { buf: b, ax: 8, ay: 12 };
}

export function renderSeasonalProp(kind: SeasonalProp): BufSprite {
  return TABLE_PROPS.has(kind) ? renderTable(kind as SeasonalTableProp) : renderFloor(kind as SeasonalFloorProp | SeasonalWallProp);
}

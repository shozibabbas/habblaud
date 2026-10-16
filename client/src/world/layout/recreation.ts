// Recreação do campus (escritório combinado): uma faixa ao NORTE da linha 0 com o pavilhão (salão de jogos com
// quatro mesas de pingue-pongue e a sala de descanso com cápsulas de dormir), a quadra de tênis cercada a oeste e
// a área de fumantes a leste, longe das entradas dos prédios. Um calçadão corre na frente de tudo e desce, pelos
// dois lados do Commons, até as pontas do corredor dele. Só existe no campus (2+ máquinas). Puro.
//
//   x  -41 ........... -8   0 ............... 32 ....... 48        56 ....... 68
//   y -22 ┌ quadra de tênis ┐┌ salão de jogos ┬ descanso ┐
//         │   (alambrado)   ││   4 mesas      │ cápsulas │        ┌ fumantes ┐
//      -5 └──── portão ─────┘└──── portas ────┴─ porta ──┘        └──────────┘
//      -4 ══════════════════════════ calçadão ══════════════════════════════════
//                     ║ x -6 (desce até a ponta oeste)          ║ x 51 (ponta leste)
//      13 ════════════╝  [ Commons ]                            ╚════════════
import { hash32 } from '../../../../shared/hash';
import { TILE, type WallStyle } from '../../art/api';
import { CORRIDOR_H, CORRIDOR_Y } from '../constants';
import { AreaBuilder, SEATED_SORT_BIAS } from './builder';
import { COMMONS_W } from './commons';
import type { AreaLayout, ExteriorProp, FloorPatch, TileRect } from './types';
import { tr } from '../../../../shared/i18n';

export const GAMES_ID = 'rec:jogos';
export const REST_ID = 'rec:descanso';
export const COURT_ID = 'rec:quadra';
export const SMOKING_ID = 'rec:fumantes';

/** Calçadão (linha de cima e altura) na frente da faixa de recreação. */
export const REC_WALK_Y = -4;
export const REC_WALK_H = CORRIDOR_H - 2;
const WALK_H = REC_WALK_H;
/** Linha das entradas do Commons (a mesma faixa dos caminhos até os prédios). */
const ENTRY_Y = CORRIDOR_Y + 1;
/** Ligações do calçadão com as pontas do corredor do Commons (o mesmo x dos calçadões das alas: ver campus.ts). */
const EAST_LINK_X = COMMONS_W + 3;
const WEST_LINK_X = -6;

/** Pavilhão (salão de jogos + descanso), logo ao norte do calçadão, alinhado com o Commons. */
const PAV_H = 19;
const PAV_Y = REC_WALK_Y - PAV_H;
const HALL_W = 32;
const REST_W = 16;
/** Quadra (com o alambrado e os refletores) e área de fumantes. */
const COURT_RECT: TileRect = { x: -41, y: -22, w: 34, h: 18 };
const SMOKING_RECT: TileRect = { x: 56, y: -12, w: 12, h: 8 };

const HALL_WALL: WallStyle = { base: '#e6edf2', trim: '#4f7fa8', pattern: 'stripes' };
const REST_WALL: WallStyle = { base: '#d8d3e4', trim: '#7a7194', pattern: 'wood_panel' };

/** Linhas da quadra (duplas) em px de mundo e a rede (x da linha do meio). */
export interface CourtGeom {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  netX: number;
  /** Alambrado (tiles): o piso da quadra pinta tudo o que fica dentro dele. */
  fence: TileRect;
}

export interface RecreationLayout {
  areas: AreaLayout[];
  /** Calçadão e ligações (caminháveis; pintados como calçada). */
  paths: TileRect[];
  /** Tudo o que a faixa ocupa (o enquadramento do campus cresce até aqui). */
  rect: TileRect;
  court: CourtGeom;
  /** Piso externo extra (calçadas, o piso da área de fumantes) e enfeites (postes, árvores entre as áreas). */
  floors: FloorPatch[];
  props: ExteriorProp[];
  /** Onde a mata/árvores do gramado não podem nascer. */
  keepOut: TileRect[];
}

// =================================================================== pavilhão

/** Mesas de pingue-pongue do salão (canto superior esquerdo do tampo, em tiles locais). */
const TABLES: readonly (readonly [number, number])[] = [
  [6, 4],
  [21, 4],
  [6, 9],
  [21, 9],
  [13, 14],
];

export function layoutGamesHall(): AreaLayout {
  const a = new AreaBuilder(GAMES_ID, 'lounge', { x: 0, y: PAV_Y, w: HALL_W, h: PAV_H });
  a.area.rec = 'games';
  a.area.edge = 'north';
  a.area.signText = tr('Salão de jogos');
  a.floor('wood', 0, 0, HALL_W, PAV_H, 811);
  a.face(0.5, HALL_W - 1, HALL_WALL);
  a.cap(0, 0, 0.5, PAV_H, HALL_WALL);
  a.cap(HALL_W - 0.5, 0, 0.5, PAV_H, HALL_WALL);
  a.south(0.5, HALL_W - 1, PAV_H - 1, { ...HALL_WALL, exterior: true }, [
    { lx: 7, w: 2 },
    { lx: 23, w: 2 },
  ]);
  a.walk(1, 2, HALL_W - 2, PAV_H - 3);
  a.walk(7, PAV_H - 1, 2, 1);
  a.walk(23, PAV_H - 1, 2, 1);

  a.wall('sign', 16, undefined, { order: 0.9 });
  for (const [cx, i] of [
    [4, 0],
    [9, 1],
    [23, 2],
    [28, 3],
  ] as const) {
    a.wall('window', cx, undefined, { order: 0.4 + i * 0.02 });
  }
  a.wall('clock', 12.5, undefined, { order: 0.7 });
  a.wall('poster', 19.5, 'rocket', { order: 0.5 });
  a.wall('poster', 1.5, 'ship_it', { order: 0.51 });

  // as cinco mesas: duplas nas pontas (oeste/leste, dois por lado) e torcida ao norte e ao sul
  TABLES.forEach(([lx, ly], k) => {
    const group = `pingpong:salao:${k}`;
    a.rug(lx - 2.4, ly - 1.4, 7.8, 4.8, k % 2 ? '#3f6f9a' : '#3f7d5c', 820 + k);
    a.furn('pingpong_table', lx, ly, undefined, { order: 0.4 + k * 0.01 });
    const sortY = a.py(ly + 2) + SEATED_SORT_BIAS;
    // rank: 0 oeste-norte, 1 leste-norte, 2 oeste-sul, 3 leste-sul (simples usa o meio de cada ponta)
    a.spot('pingpong', lx - 1, ly, 'right', { x: a.px(lx) - 8, y: a.py(ly) + 7, group, sortY, rank: 0 });
    a.spot('pingpong', lx + 3, ly, 'left', { x: a.px(lx + 3) + 8, y: a.py(ly) + 7, group, sortY, rank: 1 });
    a.spot('pingpong', lx - 1, ly + 1, 'right', { x: a.px(lx) - 8, y: a.py(ly + 1) + 14, group, sortY, rank: 2 });
    a.spot('pingpong', lx + 3, ly + 1, 'left', { x: a.px(lx + 3) + 8, y: a.py(ly + 1) + 14, group, sortY, rank: 3 });
    const watch = `watch:${group}`;
    a.spot('watch', lx, ly - 1, 'down', { group: watch, dx: 2 });
    a.spot('watch', lx + 2, ly - 1, 'down', { group: watch, dx: -2 });
    a.spot('watch', lx, ly + 2, 'up', { group: watch, dx: 2 });
    a.spot('watch', lx + 2, ly + 2, 'up', { group: watch, dx: -2 });
  });

  // junto à parede norte: bancos, bebedouro, máquina de snacks e plantas
  a.furn('plant_tall', 1, 2, 'palm', { order: 0.2 });
  const b1 = a.furn('bench', 2, 2, undefined, { order: 0.5 });
  for (let i = 0; i < 2; i++) a.seat('bench', 'bench', 2 + i, 2, 'down', undefined, { noFurniture: true, furnitureId: b1 });
  a.furn('water_cooler', 12, 2, undefined, { order: 0.53 });
  a.spot('water', 12, 3, 'up', { dy: -3 });
  const v = a.furn('vending_machine', 13, 2, undefined, { order: 0.54 });
  a.spot('snack', 13, 3, 'up', { dy: -3, furnitureId: v });
  a.furn('plant_small', 15, 2, 'flower', { order: 0.55 });
  const b2 = a.furn('bench', 17, 2, undefined, { order: 0.5 });
  for (let i = 0; i < 2; i++) a.seat('bench', 'bench', 17 + i, 2, 'down', undefined, { noFurniture: true, furnitureId: b2 });
  const b3 = a.furn('bench', 27, 2, undefined, { order: 0.5 });
  for (let i = 0; i < 2; i++) a.seat('bench', 'bench', 27 + i, 2, 'down', undefined, { noFurniture: true, furnitureId: b3 });
  a.furn('plant_tall', 30, 2, 'monstera', { order: 0.21 });
  // meio do salão: puffs para quem só quer olhar e uma roda de conversa
  (['blue', 'yellow'] as const).forEach((c, i) => a.seat('beanbag', 'beanbag', 13 + i * 3, 6, 'down', c, { order: 0.6 + i * 0.01 }));
  a.spot('talk', 14, 9, 'right', { group: 'talk:jogos', dx: -1 });
  a.spot('talk', 15, 9, 'left', { group: 'talk:jogos', dx: 1 });
  a.furn('plant_tall', 1, PAV_H - 2, 'ficus', { order: 0.22 });
  a.furn('plant_tall', 30, PAV_H - 2, 'bonsai', { order: 0.23 });
  a.furn('trash_bin', 27, PAV_H - 2, undefined, { order: 0.6 });
  return a.build();
}

/** Cápsulas da sala de descanso (canto superior esquerdo, em tiles locais): uma fileira na parede e uma ilha. */
const PODS: readonly (readonly [number, number])[] = [
  [1, 3],
  [4, 3],
  [7, 3],
  [10, 3],
  [13, 3],
  [1, 8],
  [4, 8],
  [10, 8],
  [13, 8],
];

export function layoutRestRoom(): AreaLayout {
  const a = new AreaBuilder(REST_ID, 'lounge', { x: HALL_W, y: PAV_Y, w: REST_W, h: PAV_H });
  a.area.rec = 'rest';
  a.area.edge = 'north';
  a.area.signText = tr('Descanso');
  a.floor('carpet', 0, 0, REST_W, PAV_H, 911, '#6d7a98', '#647090');
  a.face(0.5, REST_W - 1, REST_WALL);
  a.cap(0, 0, 0.5, PAV_H, REST_WALL);
  a.cap(REST_W - 0.5, 0, 0.5, PAV_H, REST_WALL);
  a.south(0.5, REST_W - 1, PAV_H - 1, { ...REST_WALL, exterior: true }, [{ lx: 7, w: 2 }]);
  a.walk(1, 2, REST_W - 2, PAV_H - 3);
  a.walk(7, PAV_H - 1, 2, 1);
  a.wall('sign', 8, undefined, { order: 0.9 });
  a.wall('painting', 3.5, undefined, { order: 0.5 });
  a.wall('window', 13, undefined, { order: 0.4 });
  a.rug(5.6, 9.6, 4.8, 2.6, '#8b7fb0', 912);

  PODS.forEach(([lx, ly], i) => {
    const pod = a.furn('sleep_pod', lx, ly, undefined, { order: 0.3 + i * 0.02 });
    // entra pela abertura ao sul (tile da frente, à esquerda) e some lá dentro
    a.spot('pod', lx, ly + 1, 'up', { x: a.px(lx + 1), y: a.py(ly + 1) - 2, furnitureId: pod, rank: i });
  });
  a.furn('floor_lamp', 7, 8, undefined, { order: 0.35 });
  a.furn('plant_small', 8, 8, 'fern', { order: 0.36 });
  a.furn('plant_tall', 1, PAV_H - 2, 'monstera', { order: 0.2 });
  a.furn('plant_tall', 14, PAV_H - 2, 'palm', { order: 0.21 });
  return a.build();
}

// =================================================================== quadra de tênis

export function courtGeom(): CourtGeom {
  const r = COURT_RECT;
  // linhas: 24 x 11 tiles dentro do alambrado (3 tiles de fundo atrás de cada linha de base)
  const x0 = (r.x + 5) * TILE;
  const y0 = (r.y + 5) * TILE;
  return { x0, y0, x1: x0 + 24 * TILE, y1: y0 + 11 * TILE, netX: x0 + 12 * TILE, fence: { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 1 } };
}

export function layoutCourt(): AreaLayout {
  const r = COURT_RECT;
  const a = new AreaBuilder(COURT_ID, 'lounge', r);
  a.area.rec = 'court';
  a.area.signText = tr('Quadra de tênis');
  const W = r.w;
  const H = r.h;
  // alambrado: lx 1..W-2, ly 1..H-1; portão no lado sul, perto da ligação oeste do calçadão
  const gate = [W - 5, W - 4];
  for (let lx = 1; lx <= W - 2; lx++) {
    const corner = lx === 1 || lx === W - 2;
    if (lx !== 16 && lx !== 17) a.furn('court_fence', lx, 1, corner ? 'post' : 'h', { order: 0.1 });
    if (gate.includes(lx)) continue;
    a.furn('court_fence', lx, H - 1, corner || gate.includes(lx + 1) || gate.includes(lx - 1) ? 'post' : 'h', { order: 0.12 });
  }
  for (let ly = 2; ly <= H - 2; ly++) {
    a.furn('court_fence', 1, ly, 'v', { order: 0.11 });
    a.furn('court_fence', W - 2, ly, 'v', { order: 0.11 });
  }
  // placar no meio do alambrado norte (atrás da rede)
  a.furn('scoreboard', 16, 1, undefined, { order: 0.6 });
  a.walk(2, 2, W - 4, H - 3);
  a.walk(gate[0], H - 1, 2, 1);

  // rede no meio da quadra (linha entre os tiles 16 e 17)
  a.furn('tennis_net', 16, 5, undefined, { dx: TILE / 2, order: 0.5 });
  // jogadores atrás das linhas de base: 0 oeste-norte, 1 leste-norte, 2 oeste-sul, 3 leste-sul
  const group = 'tennis:quadra';
  a.spot('tennis', 4, 8, 'right', { group, rank: 0 });
  a.spot('tennis', W - 5, 8, 'left', { group, rank: 1 });
  a.spot('tennis', 4, 13, 'right', { group, rank: 2 });
  a.spot('tennis', W - 5, 13, 'left', { group, rank: 3 });
  // torcida sentada nos bancos encostados no alambrado norte (de frente para a câmera)
  let k = 0;
  for (const lx of [6, 10, 20, 24]) {
    const bench = a.furn('bench', lx, 2, undefined, { order: 0.3 + k * 0.01 });
    for (let i = 0; i < 2; i++) a.seat('watch', 'bench', lx + i, 2, 'down', undefined, { noFurniture: true, furnitureId: bench, group: `watch:${group}` });
    k++;
  }
  // refletores nas quinas, por fora do alambrado
  for (const [lx, ly] of [
    [0, 1],
    [W - 1, 1],
    [0, H - 2],
    [W - 1, H - 2],
  ] as const) {
    a.furn('floodlight', lx, ly, undefined, { order: 0.7 });
  }
  a.furn('rec_sign', W - 1, H - 4, 'tennis', { order: 0.8 });
  return a.build();
}

// =================================================================== área de fumantes

export function layoutSmoking(): AreaLayout {
  const r = SMOKING_RECT;
  const a = new AreaBuilder(SMOKING_ID, 'lounge', r);
  a.area.rec = 'smoking';
  a.area.signText = tr('Área de fumantes');
  // a cerca viva ao norte e a leste é da área externa (layoutRecreation); aberta para o calçadão
  a.walk(0, 1, r.w - 1, r.h - 1);
  a.walk(r.w - 1, 5, 1, r.h - 5);

  // abrigo com banco (lugares sentados, de frente para o calçadão)
  a.furn('smoking_shelter', 2, 1, undefined, { order: 0.3 });
  for (const lx of [2, 4]) {
    const bench = a.furn('bench', lx, 2, undefined, { order: 0.4 + lx * 0.01 });
    for (let i = 0; i < 2; i++) a.seat('smoke', 'bench', lx + i, 2, 'down', undefined, { noFurniture: true, furnitureId: bench });
  }
  // cinzeiros, cada um com um par em pé frente a frente (papo de fumante)
  for (const [lx, ly, k] of [
    [8, 3, 0],
    [4, 5, 1],
  ] as const) {
    a.furn('ash_bin', lx, ly, undefined, { order: 0.5 + k * 0.01 });
    a.spot('smoke', lx - 1, ly, 'right', { group: `smoke:${k}`, dx: 1 });
    a.spot('smoke', lx + 1, ly, 'left', { group: `smoke:${k}`, dx: -1 });
  }
  // em pé sozinho, encostado num canto
  a.spot('smoke', 1, 3, 'right');
  a.spot('smoke', 9, 6, 'left');
  a.spot('smoke', 1, 6, 'down');
  a.furn('rec_sign', r.w - 1, r.h - 2, 'smoking', { order: 0.8 });
  return a.build();
}

// =================================================================== faixa inteira

/** Áreas da faixa de recreação (fixas; calculadas uma vez). */
let cache: RecreationLayout | null = null;

export function layoutRecreation(): RecreationLayout {
  if (cache) return cache;
  const areas = [layoutGamesHall(), layoutRestRoom(), layoutCourt(), layoutSmoking()];
  const x0 = COURT_RECT.x;
  const x1 = SMOKING_RECT.x + SMOKING_RECT.w;
  const top = Math.min(COURT_RECT.y, PAV_Y);
  const paths: TileRect[] = [
    // calçadão na frente de tudo
    { x: x0, y: REC_WALK_Y, w: x1 - x0, h: WALK_H },
    // ligações até as entradas do Commons e os trechos de caminho até as pontas do corredor
    { x: EAST_LINK_X, y: REC_WALK_Y + WALK_H, w: WALK_H, h: ENTRY_Y - (REC_WALK_Y + WALK_H) },
    { x: WEST_LINK_X, y: REC_WALK_Y + WALK_H, w: WALK_H, h: ENTRY_Y - (REC_WALK_Y + WALK_H) },
    { x: COMMONS_W, y: ENTRY_Y, w: EAST_LINK_X + WALK_H - COMMONS_W, h: WALK_H },
    { x: WEST_LINK_X, y: ENTRY_Y, w: -WEST_LINK_X, h: WALK_H },
  ];
  const px = (t: number) => t * TILE;
  const floors: FloorPatch[] = [
    ...paths.map((p, i) => ({ kind: 'sidewalk' as const, x: px(p.x), y: px(p.y), w: px(p.w), h: px(p.h), seed: 880 + i })),
    { kind: 'sidewalk', x: px(SMOKING_RECT.x), y: px(SMOKING_RECT.y), w: px(SMOKING_RECT.w), h: px(SMOKING_RECT.h), seed: 890 },
  ];
  const props: ExteriorProp[] = [];
  const seed = (x: number, y: number) => hash32(`rec:${x}:${y}`);
  // postes no gramado entre o calçadão e a linha 0 (fora das ligações)
  for (let x = x0 + 3; x < x1 - 1; x += 8) {
    if (Math.abs(x - EAST_LINK_X - 1) < 3 || Math.abs(x - WEST_LINK_X - 1) < 3) continue;
    props.push({ kind: 'lamp', x: px(x) + 8, y: px(REC_WALK_Y + WALK_H) + 10, seed: seed(x, 0) });
  }
  // gramado entre a quadra e o pavilhão e entre o pavilhão e os fumantes: árvores, arbustos e flores
  const gaps: [number, number][] = [
    [COURT_RECT.x + COURT_RECT.w, 0],
    [HALL_W + REST_W, SMOKING_RECT.x],
  ];
  for (const [ga, gb] of gaps) {
    const mid = (ga + gb) / 2;
    props.push({ kind: 'tree', x: px(mid) + 2, y: px(PAV_Y + 4), seed: seed(ga, 1) });
    props.push({ kind: 'bush', x: px(mid) - 6, y: px(PAV_Y + 9), seed: seed(ga, 2) });
    props.push({ kind: 'flowers', x: px(mid) + 6, y: px(REC_WALK_Y) - 4, seed: seed(ga, 3) });
  }
  // cerca viva da área de fumantes (norte e leste)
  for (let x = SMOKING_RECT.x; x < SMOKING_RECT.x + SMOKING_RECT.w; x += 2) props.push({ kind: x % 6 === 2 ? 'flowers' : 'hedge', x: px(x) + TILE, y: px(SMOKING_RECT.y) + 12, seed: seed(x, 5) });
  for (let y = SMOKING_RECT.y + 2; y < SMOKING_RECT.y + 5; y += 1) props.push({ kind: 'hedge', x: px(SMOKING_RECT.x + SMOKING_RECT.w - 1) + 8, y: px(y) + 12, seed: seed(y, 6) });
  props.push({ kind: 'tree', x: px(SMOKING_RECT.x + 4), y: px(SMOKING_RECT.y - 3), seed: seed(1, 4) });
  props.push({ kind: 'lamp', x: px(SMOKING_RECT.x) - 6, y: px(SMOKING_RECT.y + 4), seed: seed(2, 4) });
  props.push({ kind: 'bench', x: px(SMOKING_RECT.x - 4), y: px(REC_WALK_Y) - 4, seed: seed(3, 4) });
  const rect: TileRect = { x: x0, y: top, w: x1 - x0, h: REC_WALK_Y + WALK_H - top };
  const keepOut: TileRect[] = [{ x: rect.x - 2, y: rect.y - 2, w: rect.w + 4, h: rect.h + 3 }, ...paths.slice(1).map((p) => ({ x: p.x - 1, y: p.y, w: p.w + 2, h: p.h }))];
  cache = { areas, paths, rect, court: courtGeom(), floors, props, keepOut };
  return cache;
}

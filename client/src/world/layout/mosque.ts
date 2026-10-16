// Mesquita do campus (escritório combinado): no gramado ao norte da faixa de recreação (que fica ao norte do
// Commons), centrada sobre o Commons. Puro e testável.
//
// A qibla (direção de Meca) a partir do Paquistão fica a OESTE: todas as filas de oração (safs) correm
// norte-sul e quem reza olha para a esquerda da tela, para o nicho (mihrab) na parede oeste.
//
//   x →  0                  18 19                  29
//   y 0  ┌──── face norte (janelas em arco; cúpula e minaretes por cima) ────┐
//        │ M  salão masculino  ┊ topis · sapateiras  │
//        │ I  (4 safs)         ┊ torneiras da ablução ▢ ← entrada masculina (leste)
//        │ H                   ┊                     │
//     12 ├──────────────── mureta (sem passagem) ────┤
//        │ salão feminino ┊ hijabs · ablução        │
//        │ (3 safs)       ┊ sapateiras              │
//     24 └──────────────────────────────▢────────────┘ ← entrada feminina (sul)
//
// Homens e mulheres têm entradas, sapateiras, áreas de ablução e salões separados; não há passagem
// entre as duas alas. Um caminho corre na frente da mesquita e desce pelos dois lados do pavilhão da recreação
// até o calçadão dela (que já desce até as pontas do corredor do Commons).
import { TILE, type Dir, type WallStyle } from '../../art/api';
import { AreaBuilder } from './builder';
import type { AreaLayout, ExteriorProp, FloorPatch, SpotDef, TileRect } from './types';

export const MOSQUE_W = 30;
/** Ala masculina: face norte (2) + 10 fileiras de piso + mureta divisória. */
export const MEN_H = 13;
/** Ala feminina: face (2) + 9 fileiras de piso + parede sul (com a porta). */
export const WOMEN_H = 12;
export const MOSQUE_H = MEN_H + WOMEN_H;
/** Gramado (tiles) entre o caminho da frente da mesquita e o que fica ao sul dela (a faixa de recreação). */
export const MOSQUE_GAP = 1;
/** Altura (tiles) da cúpula e dos minaretes acima da parede norte: entra no enquadramento da visão geral. */
export const MOSQUE_SKY = 8;
export const MEN_ID = 'mosque:homens';
export const WOMEN_ID = 'mosque:mulheres';

/** Seção da mesquita: 'm' = ala masculina, 'f' = ala feminina (pelo look do personagem). */
export type MosqueSection = 'm' | 'f';

export function sectionOf(look: 'm' | 'f' | undefined): MosqueSection {
  return look === 'f' ? 'f' : 'm';
}

export function sectionArea(section: MosqueSection): string {
  return section === 'f' ? WOMEN_ID : MEN_ID;
}

/** Colunas (x local) das filas e fileiras (y local na ala) de cada seção. */
// (a primeira fila fica 3 tiles atrás do lugar do imam: o imam se prostra sem encostar em ninguém)
export const SAF_X: Readonly<Record<MosqueSection, readonly number[]>> = { m: [6, 9, 12, 15], f: [6, 9, 12] };

/** Lugares dos religiosos (spots 'staff'; sim/cleric.ts): o imam diante do mihrab, o minbar, reflexão, recepção. */
export const CLERIC_IMAM = 'cleric:imam';
export const CLERIC_MINBAR = 'cleric:minbar';
export const CLERIC_SIT = 'cleric:reflexao';
export const CLERIC_GREET = 'cleric:recepcao';
export const clericGroup = (base: string, section: MosqueSection) => `${base}:${section}`;
const SAF_ROWS: Readonly<Record<MosqueSection, readonly [number, number]>> = { m: [3, 11], f: [3, 10] };

export interface MosqueSite {
  /** O prédio (as duas alas). */
  rect: TileRect;
  /** Tile do caminho diante de cada porta (fora do prédio). */
  doors: Record<MosqueSection, { x: number; y: number }>;
  /** Caminhos no gramado (caminháveis): diante da mesquita, os dois que descem até as entradas do Commons e o da porta masculina. */
  paths: TileRect[];
  /** Topo da cúpula/minaretes (tiles): o que a visão geral enquadra acima do prédio. */
  skyY: number;
}

/**
 * Lugar da mesquita: centrada sobre o Commons, com o caminho da frente logo ao norte de `southY` (o topo da faixa
 * de recreação). `walks` = x dos calçadões oeste/leste (os mesmos das ligações da recreação e das alas) e a
 * largura dos caminhos; as descidas vão até `joinY` (exclusive: o fim do calçadão da recreação).
 */
export function mosqueSite(commons: TileRect, walks: { west: number; east: number; h: number }, southY: number, joinY: number): MosqueSite {
  const ph = walks.h;
  const front = southY - MOSQUE_GAP - ph;
  const x = commons.x + Math.floor((commons.w - MOSQUE_W) / 2);
  const y = front - MOSQUE_H;
  const rect: TileRect = { x, y, w: MOSQUE_W, h: MOSQUE_H };
  const menDoorY = y + MEN_DOOR_Y;
  const paths: TileRect[] = [
    // caminho diante da mesquita, de calçadão a calçadão (passa pela porta feminina)
    { x: walks.west, y: front, w: walks.east + ph - walks.west, h: ph },
    // descidas pelos dois lados do pavilhão até o calçadão da recreação
    { x: walks.west, y: front, w: ph, h: joinY - front },
    { x: walks.east, y: front, w: ph, h: joinY - front },
    // ramal pelo lado leste até a porta masculina
    { x: x + MOSQUE_W, y: menDoorY - 1, w: ph, h: front - menDoorY + 1 },
  ];
  return {
    rect,
    doors: { m: { x: x + MOSQUE_W, y: menDoorY }, f: { x: x + WOMEN_DOOR_X, y: front } },
    paths,
    skyY: y - MOSQUE_SKY,
  };
}

/** Porta masculina: fileiras (locais) da abertura na parede leste. */
const MEN_DOOR_Y = 8;
/** Porta feminina: colunas (locais) da abertura na parede sul. */
const WOMEN_DOOR_X = 24;

const WALL: WallStyle = { base: '#f3efe4', trim: '#2f7a5c', pattern: 'tiles' };
const WALL_OUT: WallStyle = { base: '#ece6d8', trim: '#2f7a5c', pattern: 'plain', exterior: true };
/** Carpete das alas (verde-escuro e vinho), em placas com o desenho dos tapetes por cima (render/mosque.ts). */
export const CARPET: Readonly<Record<MosqueSection, [string, string]>> = { m: ['#2f6b52', '#2a6049'], f: ['#7a3443', '#6e2e3c'] };

/**
 * Fileiras de oração de uma ala: spots 'prayer' virados para oeste. A ordem (rank) enche a fila da frente
 * primeiro, do meio para as pontas, e uma fileira sim, outra não (com pouca gente, cada um com espaço e as
 * posturas legíveis); as do meio só quando a fila aperta.
 */
function safs(a: AreaBuilder, section: MosqueSection): void {
  const [r0, r1] = SAF_ROWS[section];
  const mid = (r0 + r1) / 2;
  SAF_X[section].forEach((lx, i) => {
    for (let ly = r0; ly <= r1; ly++) {
      const off = Math.abs(ly - mid);
      const tight = (ly - r0) % 2 === 1 ? 50 : 0;
      a.spot('prayer', lx, ly, 'left', { group: `saf:${section}:${i}`, rank: i * 100 + tight + Math.round(off * 4) + (ly < mid ? 1 : 0) });
    }
  });
}

/** Mureta das torneiras (coluna `lx`, fileiras ly0..ly1) com um banquinho a leste de cada torneira. */
function wudu(a: AreaBuilder, lx: number, ly0: number, ly1: number, section: MosqueSection): void {
  for (let ly = ly0; ly <= ly1; ly++) {
    const tap = a.furn('wudu_tap', lx, ly, undefined, { order: 0.3 + ly * 0.01 });
    const s = a.seat('wudu', 'wudu_stool', lx + 1, ly, 'left', undefined, { order: 0.4 + ly * 0.01, dx: -2 });
    s.group = `wudu:${section}`;
    // a torneira deste banquinho (a água corre enquanto alguém faz a ablução)
    s.deskId = tap;
  }
}

/** Jali (treliça) norte-sul na coluna `lx`, de ly0 até a ponta em `end` (a abertura fica abaixo). */
/**
 * Lugares do religioso de uma ala: o do imam (diante do mihrab, à frente da primeira fila), o assento no alto do minbar
 * (só a ala masculina; quem fala olha para leste, para quem escuta), um canto para o tasbih e a passagem para o salão.
 */
function cleric(a: AreaBuilder, section: MosqueSection): void {
  a.spot('staff', 3, 7, 'left', { group: clericGroup(CLERIC_IMAM, section) });
  if (section === 'm') {
    // no patamar do minbar (degraus a leste): os joelhos sobre o patamar, um pouco acima do piso
    a.spot('staff', 3, 3, 'right', { group: clericGroup(CLERIC_MINBAR, section), seated: true, x: a.px(1) + 6, y: a.py(3) - 9, sortY: a.py(4) + 0.5 });
    a.spot('staff', 16, 10, 'left', { group: clericGroup(CLERIC_SIT, section) });
    a.spot('staff', 17, 11, 'right', { group: clericGroup(CLERIC_GREET, section) });
  } else {
    a.spot('staff', 13, 9, 'left', { group: clericGroup(CLERIC_SIT, section) });
    a.spot('staff', 13, 10, 'right', { group: clericGroup(CLERIC_GREET, section) });
  }
}

function jali(a: AreaBuilder, lx: number, ly0: number, end: number): void {
  for (let ly = ly0; ly < end; ly++) a.furn('jali_screen', lx, ly, 'v', { order: 0.15 });
  a.furn('jali_screen', lx, end, 'end', { order: 0.16 });
}

function useSpot(a: AreaBuilder, kind: 'shoes' | 'headwear', lx: number, ly: number, section: MosqueSection, dir: Dir = 'up'): SpotDef {
  return a.spot(kind, lx, ly, dir, { group: `${kind}:${section}`, dy: -2 });
}

/** Ala masculina: salão com o mihrab e o minbar a oeste; topis, sapateiras e ablução a leste; porta leste. */
export function layoutMenHall(site: MosqueSite): AreaLayout {
  const { x, y } = site.rect;
  const a = new AreaBuilder(MEN_ID, 'mosque', { x, y, w: MOSQUE_W, h: MEN_H });
  a.area.edge = 'north';
  a.floor('carpet', 0, 0, 18.5, MEN_H, 811, ...CARPET.m);
  a.floor('marble', 18.5, 0, MOSQUE_W - 18.5, MEN_H, 812);
  a.face(0.5, MOSQUE_W - 1, WALL);
  a.cap(0, 0, 0.5, MEN_H, WALL);
  a.cap(MOSQUE_W - 0.5, 0, 0.5, MEN_DOOR_Y, WALL);
  a.cap(MOSQUE_W - 0.5, MEN_DOOR_Y + 2, 0.5, MEN_H - MEN_DOOR_Y - 2, WALL);
  a.south(0.5, MOSQUE_W - 1, MEN_H - 1, WALL);
  a.walk(1, 2, MOSQUE_W - 2, MEN_H - 3);
  a.walk(MOSQUE_W - 1, MEN_DOOR_Y, 1, 2);
  a.area.door = { x: x + MOSQUE_W - 1, y: y + MEN_DOOR_Y, w: 1, h: 2 };

  // parede da qibla: nicho e púlpito (à direita de quem olha para o nicho, ao norte)
  a.furn('mihrab', 1, 6, undefined, { order: 0.2 });
  a.furn('minbar', 1, 3, undefined, { order: 0.25 });
  for (const lx of [3.5, 8, 12.5]) a.wall('arch_window', lx, undefined, { order: 0.3 });
  a.furn('quran_shelf', 16, 2, undefined, { order: 0.3 });
  a.spot('shelf', 16, 3, 'up', { dx: 8, dy: -2 });
  cleric(a, 'm');
  safs(a, 'm');
  jali(a, 18, 2, 9);

  // entrada: topis, sapateiras, ablução, o quadro dos horários e plantas
  a.furn('topi_shelf', 19, 2, undefined, { order: 0.3 });
  a.furn('topi_shelf', 20, 2, undefined, { order: 0.31 });
  useSpot(a, 'headwear', 19, 3, 'm');
  useSpot(a, 'headwear', 20, 3, 'm');
  // estilo shia: a caixinha das turbahs ao lado dos topis (pega-se na mesma parada)
  a.furn('turbah_box', 21, 2, undefined, { order: 0.32 });
  a.wall('prayer_times', 22.5, undefined, { order: 0.6 });
  a.wall('clock', 24.5, undefined, { order: 0.7 });
  a.furn('shoe_rack', 25, 2, 'm', { order: 0.35 });
  a.furn('shoe_rack', 27, 2, 'm', { order: 0.36 });
  for (const lx of [25, 26, 27, 28]) useSpot(a, 'shoes', lx, 3, 'm');
  wudu(a, 22, 5, 10, 'm');
  a.furn('plant_tall', 28, 11, 'palm', { order: 0.4 });
  a.furn('plant_small', 19, 11, 'fern', { order: 0.41 });
  return a.build();
}

/** Ala feminina: salão a oeste; hijabs, ablução e sapateiras a leste; porta na parede sul. */
export function layoutWomenHall(site: MosqueSite): AreaLayout {
  const { x, y } = site.rect;
  const a = new AreaBuilder(WOMEN_ID, 'mosque', { x, y: y + MEN_H, w: MOSQUE_W, h: WOMEN_H });
  a.area.edge = 'south';
  a.floor('carpet', 0, 0, 14.5, WOMEN_H, 821, ...CARPET.f);
  a.floor('marble', 14.5, 0, MOSQUE_W - 14.5, WOMEN_H, 822);
  a.face(0.5, MOSQUE_W - 1, WALL);
  a.cap(0, 0, 0.5, WOMEN_H, WALL);
  a.cap(MOSQUE_W - 0.5, 0, 0.5, WOMEN_H, WALL);
  a.south(0.5, MOSQUE_W - 1, WOMEN_H - 1, WALL_OUT, [{ lx: WOMEN_DOOR_X, w: 2 }]);
  a.walk(1, 2, MOSQUE_W - 2, WOMEN_H - 3);
  a.walk(WOMEN_DOOR_X, WOMEN_H - 1, 2, 1);
  a.area.door = { x: x + WOMEN_DOOR_X, y: y + MOSQUE_H - 1, w: 2, h: 1 };

  a.wall('prayer_times', 4, undefined, { order: 0.6 });
  a.wall('clock', 8.5, undefined, { order: 0.7 });
  a.furn('quran_shelf', 10, 2, undefined, { order: 0.3 });
  a.spot('shelf', 10, 3, 'up', { dx: 8, dy: -2 });
  cleric(a, 'f');
  safs(a, 'f');
  jali(a, 14, 2, 8);

  // entrada: hijabs junto à passagem para o salão, ablução, sapateiras dos dois lados da porta
  a.furn('hijab_rack', 15, 2, undefined, { order: 0.3 });
  useSpot(a, 'headwear', 15, 3, 'f');
  useSpot(a, 'headwear', 16, 3, 'f');
  a.furn('turbah_box', 17, 2, undefined, { order: 0.32 });
  wudu(a, 17, 4, 8, 'f');
  a.furn('shoe_rack', 20, 9, 'f', { order: 0.35 });
  a.furn('shoe_rack', 27, 9, 'f', { order: 0.36 });
  for (const lx of [20, 21, 27, 28]) useSpot(a, 'shoes', lx, 10, 'f');
  a.wall('mirror', 23.5, undefined, { order: 0.6 });
  a.furn('plant_tall', 28, 2, 'monstera', { order: 0.4 });
  a.furn('plant_small', 25, 2, 'flower', { order: 0.41 });
  return a.build();
}

const cache = new Map<string, AreaLayout[]>();

/** As duas alas (calculadas uma vez por posição). */
export function mosqueAreas(site: MosqueSite): AreaLayout[] {
  const k = `${site.rect.x},${site.rect.y}`;
  let v = cache.get(k);
  if (!v) {
    v = [layoutMenHall(site), layoutWomenHall(site)];
    cache.set(k, v);
  }
  return v;
}

/** É uma área da mesquita? */
export function isMosqueArea(areaId: string): boolean {
  return areaId === MEN_ID || areaId === WOMEN_ID;
}

/**
 * Jardim da mesquita (área externa do campus): calçada dos caminhos, postes, bancos, canteiros ao lado da
 * porta feminina e árvores nos gramados a oeste e a leste do prédio (longe dos caminhos e da cúpula).
 */
export function mosqueGrounds(site: MosqueSite, rng: () => number): { floors: FloorPatch[]; props: ExteriorProp[]; keepOut: TileRect[] } {
  const px = (t: number) => t * TILE;
  const seed = () => Math.floor(rng() * 1e9);
  const floors: FloorPatch[] = site.paths.map((r, i) => ({ kind: 'sidewalk', x: px(r.x), y: px(r.y), w: px(r.w), h: px(r.h), seed: 70 + i }));
  const props: ExteriorProp[] = [];
  const r = site.rect;
  const [front, west, east] = site.paths;
  const onPath = (x: number, y: number, m = 1) => site.paths.some((p) => x >= p.x - m && y >= p.y - m && x < p.x + p.w + m && y < p.y + p.h + m);
  const nearMosque = (x: number, y: number) => x >= r.x - 3 && x < r.x + r.w + 3 && y >= site.skyY - 1 && y < r.y + r.h + 1;
  // postes na borda sul do caminho da frente (fora das portas) e ao longo das descidas
  for (let x = front.x + 3; x < front.x + front.w - 2; x += 8) props.push({ kind: 'lamp', x: px(x) + 8, y: px(front.y + front.h) + 6, seed: x * 3 + 1 });
  for (const p of [west, east]) {
    for (let y = p.y + 5; y < p.y + p.h - 6; y += 8) {
      props.push({ kind: 'lamp', x: p === west ? px(p.x + p.w) + 4 : px(p.x) - 4, y: px(y), seed: y * 5 + p.x });
      props.push({ kind: 'bench', x: p === west ? px(p.x + p.w) + 18 : px(p.x) - 18, y: px(y + 3), seed: y + p.x });
    }
  }
  // canteiros floridos dos dois lados da porta feminina e no pé da fachada sul
  const door = site.doors.f;
  for (const dx of [-3, 4]) {
    props.push({ kind: 'flowers', x: px(door.x + dx), y: px(front.y + front.h) + 14, seed: seed() });
    props.push({ kind: 'bush', x: px(door.x + dx + 1), y: px(front.y + front.h) + 14, seed: seed() });
  }
  // árvores e arbustos nos gramados dos lados (o norte é o bosque do campus)
  for (let y = r.y + 1; y < r.y + r.h; y += 3) {
    for (const x0 of [west.x + west.w + 2, r.x + r.w + 5]) {
      for (let x = x0; x < x0 + 6; x += 3) {
        const jx = x + Math.floor(rng() * 2);
        const jy = y + Math.floor(rng() * 2);
        if (onPath(jx, jy) || nearMosque(jx, jy) || rng() < 0.3) continue;
        props.push({ kind: rng() < 0.25 ? 'pine' : rng() < 0.3 ? 'bush' : 'tree', x: px(jx) + 6, y: px(jy) + 8, seed: seed() });
      }
    }
  }
  // onde a mata e os enfeites da recreação não podem ficar: o prédio com a cúpula e os minaretes, e os caminhos
  const keepOut: TileRect[] = [{ x: r.x - 3, y: site.skyY - 1, w: r.w + 6, h: r.y + r.h + 1 - (site.skyY - 1) }, ...site.paths.map((p) => ({ x: p.x - 1, y: p.y - 1, w: p.w + 2, h: p.h + 2 }))];
  return { floors, props, keepOut };
}

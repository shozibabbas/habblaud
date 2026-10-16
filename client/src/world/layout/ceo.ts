// Diretoria do campus (escritório combinado): um prediozinho executivo próprio no gramado, a leste da área de
// fumantes e logo ao norte do prédio da máquina local (o lugar 0, leste da linha 0). Entra-se pela antessala da
// secretária; a sala do dono fica atrás dela, pela porta de vidro. Na frente, um jardinzinho com canteiros e um
// caminho curto até o calçadão. Só existe no campus (2+ máquinas) e quando o snapshot traz um dono
// (OfficeSnapshot.meta.owner: as Configurações, owner.json, ou o HABBLAUD_OWNER). Puro.
//
//   x  72          83 84                            101
//   y -23 ┌── antessala ──┬──────── sala do dono (janelas ao norte) ────────┐
//         │ relógio quadro│ aparador  prêmios   janela    quadro    bar ☕  │
//         │ espera ▢ ▢    ┊         [  mesa de pé  ]                       │
//         │      [mesa da ┊            cadeira                             │
//         │      secretária]  ◇ porta de vidro (placa "CEO")               │
//         │               ┊ sofá           ( mesa oval )                   │
//      -8 └── entrada ▔▔ placa ─┴──── fachada de vidro ──────────────────────┘
//         ✿✿ canteiros ║ caminho ║ canteiros ✿✿
//      -4 ══════════════ calçadão da recreação, que se estende até aqui ══════════
//
// Spots (por kind; os ids seguem o AreaBuilder: `<área>#s<n>:<kind>`, então procure pelo kind e pelo grupo):
//   ceo:office     ceo_desk     sentado à mesa, dir 'up' (deskId = a exec_desk; a tela segue quem senta)
//                  ceo_stand    em pé à mesma mesa (mesmo tile de aproximação; deskId = a exec_desk)
//                  ceo_call     dois pontos diante da janela atrás da mesa, dir 'up', grupo 'ceo:call', rank 0 e 1
//                  ceo_meeting  quatro cadeiras da mesa oval, grupo 'ceo:meeting' (rank 0..3: NO, NE, SO, SE)
//                  ceo_coffee   diante do bar de chai e café, dir 'up' (furnitureId = o coffee_bar)
//                  ceo_guest    os dois lugares do sofá, dir 'down', grupo 'ceo:guests'
//   ceo:reception  secretary    cadeira da secretária, dir 'up' (deskId = a secretary_desk)
//                  visitor      duas cadeiras de espera, dir 'down', grupo 'ceo:visitors'
//                  ceo_door     diante da porta de vidro da sala, dir 'right'
// Estados dos móveis (render/ceo.ts): exec_desk 0 = sentado, 1 = em pé (a exec_chair rola para o lado junto);
// coffee_bar 1 = em uso (vapor). O comportamento liga os dois por Sim.furnStates (ou machineUntil, no bar).
import { hash32 } from '../../../../shared/hash';
import { tr } from '../../../../shared/i18n';
import { TILE, type WallStyle } from '../../art/api';
import { AreaBuilder } from './builder';
import type { AreaLayout, ExteriorProp, FloorPatch, SpotDef, TileRect } from './types';

export const CEO_OFFICE_ID = 'ceo:office';
export const CEO_RECEPTION_ID = 'ceo:reception';

/** Canto do prédio (tiles): 4 tiles de gramado a leste da área de fumantes; a parede sul encosta no calçadão. */
export const CEO_X = 72;
const RECEPTION_W = 12;
const OFFICE_W = 18;
export const CEO_W = RECEPTION_W + OFFICE_W;
/** Face norte (2) + 13 fileiras de piso + parede sul (com a entrada da antessala). */
export const CEO_H = 16;
/** Jardim da frente (tiles) entre a fachada sul e o calçadão, com o caminho curto até a entrada. */
export const CEO_FRONT = 3;
/** Porta de vidro entre a antessala e a sala: fileiras (locais) na coluna da divisória (x local 0 da sala). */
const DOOR_LY = 8;
/** Entrada da antessala: colunas (locais) na parede sul. */
const ENTRY_LX = 5;

const OFFICE_WALL: WallStyle = { base: '#d8cbb8', trim: '#5e4232', pattern: 'wood_panel' };
const OFFICE_OUT: WallStyle = { base: '#d3c6b3', trim: '#5e4232', pattern: 'plain', exterior: true };
const RECEPTION_WALL: WallStyle = { base: '#ece6dc', trim: '#5e4232', pattern: 'marble' };
const RECEPTION_OUT: WallStyle = { base: '#e4ddd1', trim: '#5e4232', pattern: 'plain', exterior: true };

export interface CeoSite {
  /** O prédio inteiro (antessala + sala). */
  rect: TileRect;
  /** Antessala (a oeste) e sala do dono (a leste). */
  reception: TileRect;
  office: TileRect;
  /** Tile do caminho logo à frente da entrada (fora do prédio). */
  door: { x: number; y: number };
  /**
   * Caminhos no gramado (fora de `campus.paths`): [0] o calçadão da recreação estendido até passar a diretoria,
   * [1] o caminho curto da entrada até ele.
   */
  paths: TileRect[];
}

/**
 * Lugar da diretoria. `walkY`/`walkH` = o calçadão da recreação (o jardim da frente fica entre ele e a fachada sul);
 * `walkEnd` = x (exclusive) onde ele termina: daqui em diante ele segue até passar a diretoria.
 */
export function ceoSite(walkY: number, walkH: number, walkEnd: number): CeoSite {
  const y = walkY - CEO_FRONT - CEO_H;
  const rect: TileRect = { x: CEO_X, y, w: CEO_W, h: CEO_H };
  return {
    rect,
    reception: { x: CEO_X, y, w: RECEPTION_W, h: CEO_H },
    office: { x: CEO_X + RECEPTION_W, y, w: OFFICE_W, h: CEO_H },
    door: { x: CEO_X + ENTRY_LX, y: y + CEO_H },
    paths: [
      { x: walkEnd, y: walkY, w: CEO_X + CEO_W + 2 - walkEnd, h: walkH },
      { x: CEO_X + ENTRY_LX, y: y + CEO_H, w: 2, h: CEO_FRONT },
    ],
  };
}

// =================================================================== sala do dono

export function layoutCeoOffice(site: CeoSite): AreaLayout {
  const a = new AreaBuilder(CEO_OFFICE_ID, 'executive', site.office);
  a.area.ceo = 'office';
  a.area.edge = 'north';
  const W = OFFICE_W;
  const H = CEO_H;
  a.floor('walnut', 0, 0, W, H, 1301);
  a.face(0, W - 0.5, OFFICE_WALL);
  a.cap(W - 0.5, 0, 0.5, H, OFFICE_WALL);
  a.south(0, W - 0.5, H - 1, OFFICE_OUT);
  a.walk(1, 2, W - 2, H - 3);
  a.walk(0, DOOR_LY, 1, 2);
  a.area.door = { x: site.office.x, y: site.office.y + DOOR_LY, w: 1, h: 2 };

  // parede de vidro para a antessala, com a porta e a placa do cargo na coluna ao lado
  for (let ly = 2; ly < H - 1; ly++) {
    if (ly === DOOR_LY || ly === DOOR_LY + 1) continue;
    const end = ly === DOOR_LY - 1 || ly === DOOR_LY + 2;
    a.furn('glass_partition', 0, ly, end ? 'end' : 'v', { order: 0.1 });
  }
  a.furn('door_plate', 0, DOOR_LY - 1, undefined, { dy: 1, order: 0.12 });

  // tapetes: sob a mesa, no cantinho do sofá e sob a mesa de reunião
  a.rug(4.6, 3.3, 6.8, 3.2, '#7a2e3a', 1302);
  a.rug(1.4, 8.6, 4.2, 4.6, '#2f4a6b', 1303);
  a.rug(10.1, 8.5, 5.8, 5.0, '#6e5a3c', 1304);

  // parede norte: os prêmios sobre o aparador, um quadro, as janelas grandes atrás da mesa e outra no canto
  a.wall('award_wall', 2, undefined, { order: 0.5 });
  a.wall('painting', 5.5, undefined, { order: 0.55 });
  a.wall('window', 8, undefined, { order: 0.4 });
  a.wall('window', 10.3, undefined, { order: 0.41 });
  a.wall('window', 15.6, undefined, { order: 0.42 });

  a.furn('exec_credenza', 1, 2, undefined, { order: 0.3 });
  const bar = a.furn('coffee_bar', 12, 2, undefined, { order: 0.32 });
  a.spot('ceo_coffee', 13, 3, 'up', { dy: -3, furnitureId: bar });
  a.furn('plant_tall', 16, 5, 'monstera', { order: 0.33 });

  // a mesa de pé e a cadeira executiva (centradas na linha entre os tiles 7 e 8)
  const desk = a.furn('exec_desk', 6, 4, undefined, { order: 0.45 });
  a.seat('ceo_desk', 'exec_chair', 7, 5, 'up', undefined, { order: 0.5, dx: TILE / 2, deskId: desk });
  // em pé colado à borda da mesa (4 px à frente dela): com o tampo erguido, as mãos chegam ao teclado em vez de
  // digitar no ar — vale para tudo o que ele faz ali (digitar, ligação, ler)
  a.spot('ceo_stand', 7, 5, 'up', { dx: TILE / 2, dy: -7, deskId: desk });
  // ao telefone: anda de um lado para o outro diante da janela atrás da mesa
  a.spot('ceo_call', 7, 2, 'up', { group: 'ceo:call', rank: 0, dy: -1 });
  a.spot('ceo_call', 10, 2, 'up', { group: 'ceo:call', rank: 1, dy: -1 });

  // cantinho das visitas: sofá de couro, mesa de centro, luminária e planta
  a.furn('floor_lamp', 1, 9, undefined, { order: 0.6 });
  const sofa = a.furn('exec_sofa', 2, 9, undefined, { order: 0.61 });
  for (let i = 0; i < 2; i++) a.seat('ceo_guest', 'exec_sofa', 2 + i, 9, 'down', undefined, { noFurniture: true, furnitureId: sofa, group: 'ceo:guests' });
  a.furn('plant_small', 4, 9, 'fern', { order: 0.62 });
  a.furn('coffee_table', 2, 11, undefined, { order: 0.63 });

  // cantinho de reunião: mesa oval com quatro cadeiras de couro (duas de cada lado)
  a.furn('meeting_table', 11, 10, 'oval', { order: 0.7 });
  const meet = (lx: number, ly: number, dir: 'up' | 'down', dx: number, rank: number) =>
    a.seat('ceo_meeting', 'meeting_chair', lx, ly, dir, dir, { order: 0.72 + rank * 0.01, dx, group: 'ceo:meeting', rank });
  meet(11, 9, 'down', 4, 0);
  meet(13, 9, 'down', -4, 1);
  meet(11, 12, 'up', 4, 2);
  meet(13, 12, 'up', -4, 3);

  a.furn('plant_tall', 16, H - 2, 'palm', { order: 0.8 });
  a.furn('plant_tall', 7, H - 2, 'ficus', { order: 0.81 });
  a.furn('trash_bin', 10, 5, undefined, { order: 0.5 });
  return a.build();
}

// =================================================================== antessala

export function layoutCeoReception(site: CeoSite): AreaLayout {
  const a = new AreaBuilder(CEO_RECEPTION_ID, 'reception', site.reception);
  a.area.ceo = 'reception';
  a.area.edge = 'south';
  // a placa da fachada (sobre a parede sul, à direita da entrada) com o nome do prédio
  a.area.signText = tr('Escritório executivo');
  const W = RECEPTION_W;
  const H = CEO_H;
  a.floor('marble', 0, 0, W, H, 1311);
  a.face(0.5, W - 0.5, RECEPTION_WALL);
  a.cap(0, 0, 0.5, H, RECEPTION_WALL);
  a.south(0.5, W - 0.5, H - 1, RECEPTION_OUT, [{ lx: ENTRY_LX, w: 2 }]);
  a.walk(1, 2, W - 1, H - 3);
  a.walk(ENTRY_LX, H - 1, 2, 1);
  a.area.door = { x: site.reception.x + ENTRY_LX, y: site.reception.y + H - 1, w: 2, h: 1 };

  // passadeira vermelha da entrada até a mesa da secretária e o tapete da espera
  a.rug(4.7, 8.6, 2.6, 6.4, '#7a2e3a', 1312);
  a.rug(0.6, 2.5, 4.8, 3.4, '#2f4a6b', 1313);
  a.wall('sign', 9.5, undefined, { ly: H, on: 'south', order: 0.9 });
  a.wall('shelf_wall', 6.5, undefined, { order: 0.65 });
  a.wall('clock', 2.6, undefined, { order: 0.7 });
  a.wall('painting', 10.2, undefined, { order: 0.6 });

  // espera: duas cadeiras de couro encostadas na parede norte, com uma planta no meio
  a.seat('visitor', 'meeting_chair', 1, 2, 'down', 'down', { order: 0.4, group: 'ceo:visitors' });
  a.furn('plant_small', 2, 2, 'flower', { order: 0.41 });
  a.seat('visitor', 'meeting_chair', 3, 2, 'down', 'down', { order: 0.42, group: 'ceo:visitors' });
  a.furn('coffee_table', 1, 4, undefined, { order: 0.43 });
  a.furn('binder_shelf', 9, 2, undefined, { order: 0.45 });
  a.furn('binder_shelf', 10, 2, undefined, { order: 0.46 });

  // mesa da secretária guardando a porta da sala
  const desk = a.furn('secretary_desk', 7, 6, undefined, { order: 0.5 });
  a.seat('secretary', 'office_chair', 8, 7, 'up', 'black', { order: 0.55, deskId: desk });
  a.furn('filing_cabinet', 10, 6, undefined, { order: 0.52 });
  a.spot('ceo_door', W - 1, DOOR_LY, 'right', { dx: 2 });

  a.furn('plant_tall', 1, H - 2, 'palm', { order: 0.6 });
  a.furn('floor_lamp', W - 1, H - 2, undefined, { order: 0.61 });
  a.furn('plant_small', 4, 4, 'succulent', { order: 0.63 });
  a.furn('water_cooler', W - 1, 2, undefined, { order: 0.62 });
  return a.build();
}

const cache = new Map<string, AreaLayout[]>();

/** As duas áreas (calculadas uma vez por posição). */
export function ceoAreas(site: CeoSite): AreaLayout[] {
  const k = `${site.rect.x},${site.rect.y}`;
  let v = cache.get(k);
  if (!v) {
    v = [layoutCeoReception(site), layoutCeoOffice(site)];
    cache.set(k, v);
  }
  return v;
}

/** É uma área da diretoria? */
export function isCeoArea(areaId: string): boolean {
  return areaId === CEO_OFFICE_ID || areaId === CEO_RECEPTION_ID;
}

/** Spots da diretoria de um kind (na ordem do rank, quando há). */
export function ceoSpots(spots: readonly SpotDef[], kind: SpotDef['kind']): SpotDef[] {
  return spots.filter((s) => s.kind === kind && isCeoArea(s.areaId)).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}

/**
 * Jardim da diretoria: o calçadão estendido, o caminho curto da entrada com canteiros floridos e arbustos dos dois
 * lados, cerca viva ao pé da fachada, postes, e árvores no gramado ao norte e a oeste (longe das janelas e do caminho).
 */
export function ceoGrounds(site: CeoSite): { floors: FloorPatch[]; props: ExteriorProp[]; keepOut: TileRect[] } {
  const px = (t: number) => t * TILE;
  const seed = (x: number, y: number) => hash32(`ceo:${x}:${y}`);
  const r = site.rect;
  const floors: FloorPatch[] = site.paths.map((p, i) => ({ kind: 'sidewalk', x: px(p.x), y: px(p.y), w: px(p.w), h: px(p.h), seed: 1320 + i }));
  const props: ExteriorProp[] = [];
  const [walk, entry] = site.paths;
  const front = walk.y + walk.h;
  // postes na beira sul do calçadão (o último da recreação fica em x 67)
  for (let x = walk.x + 4; x < walk.x + walk.w - 1; x += 8) props.push({ kind: 'lamp', x: px(x) + 8, y: px(front) + 10, seed: seed(x, 0) });
  // jardim da frente: canteiros floridos colados no caminho da entrada, arbustos podados e um poste de cada lado,
  // e a cerca viva baixa com flores ao longo do resto da fachada
  const gy = r.y + r.h;
  for (const [x, k] of [
    [entry.x - 1, 'flowers'],
    [entry.x + 2, 'flowers'],
    [entry.x - 3, 'bush'],
    [entry.x + 4, 'bush'],
  ] as const) {
    props.push({ kind: k, x: px(x) + 8, y: px(gy + 1) + 10, seed: seed(x, 6) });
  }
  props.push({ kind: 'lamp', x: px(entry.x) - 4, y: px(gy + 2) + 12, seed: seed(1, 7) });
  props.push({ kind: 'lamp', x: px(entry.x + 2) + 4, y: px(gy + 2) + 12, seed: seed(2, 7) });
  for (let x = entry.x + 6; x < r.x + r.w - 1; x += 2) props.push({ kind: (x / 2) % 3 === 1 ? 'flowers' : 'hedge', x: px(x) + TILE, y: px(gy) + 12, seed: seed(x, 8) });
  for (let x = r.x; x < entry.x - 4; x += 2) props.push({ kind: 'hedge', x: px(x) + TILE, y: px(gy) + 12, seed: seed(x, 9) });
  // cerca viva com flores ao pé da fachada norte (abaixo das janelas) e no lado leste
  for (let x = r.x + 1; x < r.x + r.w - 1; x += 2) props.push({ kind: (x / 2) % 3 === 1 ? 'flowers' : 'hedge', x: px(x) + TILE, y: px(r.y) - 2, seed: seed(x, 2) });
  for (let y = r.y + 2; y < r.y + r.h; y += 2) props.push({ kind: 'hedge', x: px(r.x + r.w) + 10, y: px(y) + 12, seed: seed(y, 3) });
  // árvores no gramado: duas a oeste (entre a diretoria e a área de fumantes) e um bosquinho ao norte
  props.push({ kind: 'tree', x: px(r.x - 2), y: px(r.y + 5), seed: seed(1, 4) });
  props.push({ kind: 'bush', x: px(r.x - 2) + 4, y: px(r.y + 10), seed: seed(2, 4) });
  for (let x = r.x + 2; x < r.x + r.w; x += 7) {
    props.push({ kind: x % 3 === 0 ? 'pine' : 'tree', x: px(x) + 6, y: px(r.y - 4), seed: seed(x, 5) });
  }
  props.push({ kind: 'bench', x: px(r.x + r.w + 3), y: px(r.y + 10), seed: seed(3, 4) });
  // onde a mata e os enfeites do gramado não podem ficar: o prédio (com a face norte e as copas acima) e o calçadão
  const keepOut: TileRect[] = [{ x: r.x - 1, y: r.y - 2, w: r.w + 2, h: r.h + 2 + CEO_FRONT }, ...site.paths.map((p) => ({ x: p.x, y: p.y - 1, w: p.w, h: p.h + 2 }))];
  return { floors, props, keepOut };
}

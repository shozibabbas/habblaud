// Campus do escritório combinado (2+ máquinas): o Commons no centro e um prédio de escritórios por
// máquina, ligados por caminhos no gramado. Puro e testável.
//
//          ala oeste (cresce ←)          centro              ala leste (cresce →)
//   linha 0  [salas ← saguão]  ══  [   Commons   ]  ══  [saguão → salas]   (máquina local: leste)
//   linha 1  [salas ← saguão]  ║      (praça)       ║  [saguão → salas]
//                              ╚ calçadão ═════════ ╝
//   ─────────────────────────────── rua ───────────────────────────────
//
// Cada máquina ocupa um "lugar" fixo (0 = leste da linha 0, 1 = oeste da linha 0, 2 = leste da linha 1...):
// os prédios nunca mudam de posição quando outro cresce, só o próprio fim (a ponta longe do Commons).
// Cada prédio tem a coluna do saguão (elevadores e a placa com o nome da máquina; sala de reunião ao
// sul) e as colunas das salas de projeto, montadas pelas mesmas funções do prédio único (room.ts,
// exterior.ts) e deslocadas (translate.ts).
import { hash32 } from '../../../../shared/hash';
import type { WallStyle } from '../../art/api';
import { BUILDING_H, COL_W, CORRIDOR_H, CORRIDOR_Y, NORTH_Y, ROOM_H, SOUTH_Y } from '../constants';
import { FREE, WalkGrid } from '../path/grid';
import { AreaBuilder } from './builder';
import { paintArea, type BuildingLayout } from './building';
import { COMMONS_W, commonsAreas } from './commons';
import { ELEVATOR_CX } from './core';
import { mosqueAreas, mosqueSite, type MosqueSite } from './mosque';
import { slotShell, type SlotShell } from './exterior';
import { slotColumn } from './geometry';
import { translateShell } from './translate';
import type { AreaLayout, SpotDef, TileRect } from './types';

/** Gramado entre o Commons e o saguão de cada ala (tiles). */
export const WING_GAP = 10;
/** Gramado entre duas linhas de prédios. */
export const ROW_GAP = 12;
export const ROW_PITCH = BUILDING_H + ROW_GAP;
/** Faixa (relativa ao topo da linha) dos caminhos que entram pelas pontas dos corredores. */
export const PATH_DY = CORRIDOR_Y + 1;
export const PATH_H = CORRIDOR_H - 2;
/** Calçadões verticais (x do primeiro tile) que ligam as linhas de cada ala. */
export const EAST_WALK_X = COMMONS_W + 3;
export const WEST_WALK_X = -WING_GAP + 4;

/** Cor de destaque de cada máquina (tapetes do saguão e do corredor, placa, pílula). */
export const MACHINE_ACCENTS = ['#3f7fd8', '#d9773a', '#3f9e72', '#b05fc9', '#d1a12a', '#d4566e', '#2fa3a8', '#7a8a3c'] as const;

const LOBBY_WALL: WallStyle = { base: '#e8e4dc', trim: '#8f8a80', pattern: 'wood_panel' };
const MEETING_WALL: WallStyle = { base: '#e4e8ec', trim: '#8a96a3', pattern: 'plain' };

export interface CampusMachineInput {
  id: string;
  name: string;
  local: boolean;
  online: boolean;
  /** Lugar no campus (0 = leste da linha 0, 1 = oeste da linha 0, 2 = leste da linha 1...). */
  place: number;
  /** Colunas de salas de projeto (mínimo 1). */
  cols: number;
}

export interface CampusBuilding extends CampusMachineInput {
  wing: 'east' | 'west';
  row: number;
  /** x (tiles) da coluna do saguão. */
  lobbyX: number;
  /** y (tiles) do topo do prédio. */
  y: number;
  /** O prédio inteiro (saguão + salas). */
  rect: TileRect;
  accent: string;
  lobbyId: string;
  meetingId: string;
  corridorId: string;
  /** Tile do gramado logo à frente da entrada (ponta do corredor voltada para o Commons). */
  door: { x: number; y: number };
}

export interface CampusLayout {
  buildings: CampusBuilding[];
  commons: TileRect;
  /** Caminhos caminháveis no gramado (entradas, calçadões). */
  paths: TileRect[];
  /** Retângulo de prédios + caminhos (o que a visão geral enquadra). */
  inner: TileRect;
  rows: number;
  key: string;
  /** Mesquita ao norte do Commons (layout/mosque.ts): o prédio e os caminhos dela (fora de `paths`). */
  mosque: MosqueSite;
}

export function placeOf(place: number): { wing: 'east' | 'west'; row: number } {
  const p = Math.max(0, Math.floor(place));
  return { wing: p % 2 === 0 ? 'east' : 'west', row: Math.floor(p / 2) };
}

/** Cor de uma máquina pelo lugar no campus (fixo enquanto ela existir): até 8 máquinas, todas diferentes. */
export function machineAccent(place: number): string {
  return MACHINE_ACCENTS[Math.max(0, Math.floor(place)) % MACHINE_ACCENTS.length];
}

/** x (tiles) da k-ésima coluna de salas de um prédio (k = 0 é a vizinha do saguão). */
export function roomColumnX(b: { wing: 'east' | 'west'; lobbyX: number }, k: number): number {
  return b.wing === 'east' ? b.lobbyX + COL_W * (1 + k) : b.lobbyX - COL_W * (1 + k);
}

/** Deslocamento (tiles) de uma sala montada por layoutProjectRoom (coordenadas do prédio único) até o prédio. */
export function roomOffset(b: { wing: 'east' | 'west'; lobbyX: number; y: number }, slot: number): { dx: number; dy: number } {
  const k = Math.floor(Math.max(0, slot) / 2);
  return { dx: roomColumnX(b, k) - slotColumn(slot) * COL_W, dy: b.y };
}

export function campusBuilding(m: CampusMachineInput): CampusBuilding {
  const { wing, row } = placeOf(m.place);
  const cols = Math.max(1, Math.floor(m.cols));
  const y = row * ROW_PITCH;
  const lobbyX = wing === 'east' ? COMMONS_W + WING_GAP : -WING_GAP - COL_W;
  const w = (1 + cols) * COL_W;
  const x = wing === 'east' ? lobbyX : lobbyX + COL_W - w;
  const doorY = y + PATH_DY + 1;
  return {
    ...m,
    cols,
    wing,
    row,
    lobbyX,
    y,
    rect: { x, y, w, h: BUILDING_H },
    accent: machineAccent(m.place),
    lobbyId: `campus:${m.id}:saguao`,
    meetingId: `campus:${m.id}:reuniao`,
    corridorId: `campus:${m.id}:corredor`,
    door: { x: wing === 'east' ? lobbyX - 1 : lobbyX + COL_W, y: doorY },
  };
}

export function layoutCampus(machines: readonly CampusMachineInput[]): CampusLayout {
  const buildings = [...machines].sort((a, b) => a.place - b.place).map(campusBuilding);
  const commons: TileRect = { x: 0, y: 0, w: COMMONS_W, h: BUILDING_H };
  const paths: TileRect[] = [];
  let rows = 1;
  for (const b of buildings) rows = Math.max(rows, b.row + 1);
  for (const wing of ['east', 'west'] as const) {
    const ws = buildings.filter((b) => b.wing === wing);
    if (!ws.length) continue;
    const walkX = wing === 'east' ? EAST_WALK_X : WEST_WALK_X;
    // linha 0: caminho reto do Commons até a entrada do prédio
    if (wing === 'east') paths.push({ x: COMMONS_W, y: PATH_DY, w: WING_GAP, h: PATH_H });
    else paths.push({ x: -WING_GAP, y: PATH_DY, w: WING_GAP, h: PATH_H });
    const maxRow = Math.max(...ws.map((b) => b.row));
    if (maxRow < 1) continue;
    // calçadão que desce pela ala e um ramal até cada prédio das outras linhas
    paths.push({ x: walkX, y: PATH_DY, w: PATH_H, h: maxRow * ROW_PITCH + PATH_H });
    for (const b of ws) {
      if (b.row === 0) continue;
      const y = b.y + PATH_DY;
      if (wing === 'east') paths.push({ x: walkX, y, w: b.lobbyX - walkX, h: PATH_H });
      else paths.push({ x: b.lobbyX + COL_W, y, w: walkX + PATH_H - (b.lobbyX + COL_W), h: PATH_H });
    }
  }
  const mosque = mosqueSite(commons, { west: WEST_WALK_X, east: EAST_WALK_X, rowY: PATH_DY, h: PATH_H });
  let x0 = commons.x;
  let x1 = commons.x + commons.w;
  let y1 = commons.y + commons.h;
  for (const b of buildings) {
    x0 = Math.min(x0, b.rect.x);
    x1 = Math.max(x1, b.rect.x + b.rect.w);
    y1 = Math.max(y1, b.rect.y + b.rect.h);
  }
  // a visão geral enquadra também a mesquita, com a cúpula e os minaretes
  const inner: TileRect = { x: x0, y: mosque.skyY, w: x1 - x0, h: y1 - mosque.skyY };
  const key = `campus|${buildings.map((b) => `${b.id}@${b.place}:${b.cols}:${b.online ? 1 : 0}`).join(',')}`;
  return { buildings, commons, paths, inner, rows, key, mosque };
}

// =================================================================== áreas de cada prédio

/** Saguão: elevadores (é por onde os agentes da máquina chegam e vão embora) e a placa com o nome da máquina. */
export function layoutLobby(b: CampusBuilding): AreaLayout {
  const seed = hash32(b.id);
  const a = new AreaBuilder(b.lobbyId, 'reception', { x: b.lobbyX, y: b.y + NORTH_Y, w: COL_W, h: ROOM_H });
  a.floor('marble', 0, 0, 16, 12, 600 + (seed % 97));
  a.rug(1.4, 4.4, 13.2, 1.2, b.accent, seed);
  a.rug(8.6, 7.4, 5.2, 2.6, b.accent, seed + 1);
  a.face(0.5, 15, LOBBY_WALL);
  a.cap(0, 0, 0.5, 12, LOBBY_WALL);
  a.cap(15.5, 0, 0.5, 12, LOBBY_WALL);
  a.area.edge = 'north';
  a.area.bld = b.id;
  a.area.signText = b.name;

  ELEVATOR_CX.forEach((cx, i) => {
    a.wall('elevator', cx, undefined, { order: 0.2 + i * 0.1 });
    const lx = Math.floor(cx - 0.5);
    a.spot('elevator', lx, 2, 'up', { x: a.px(cx), y: a.py(2) + 2, group: `elevator:${b.id}:${i}` });
  });
  a.wall('sign', 11, undefined, { order: 0.9 });
  a.wall('clock', 8.15, undefined, { order: 0.7 });
  a.wall('painting', 14.25, undefined, { order: 0.6 });

  a.furn('plant_tall', 1, 2, 'ficus', { order: 0.2 });
  a.furn('plant_tall', 14, 4, 'palm', { order: 0.21 });
  a.furn('filing_cabinet', 8, 6, undefined, { order: 0.42 });
  a.furn('reception_desk', 9, 6, undefined, { order: 0.4 });
  a.furn('plant_small', 12, 6, 'flower', { order: 0.45 });
  a.seat('armchair', 'armchair', 9, 9, 'right', 'right', { order: 0.6 });
  a.furn('coffee_table', 10, 9, undefined, { order: 0.58 });
  a.seat('armchair', 'armchair', 12, 9, 'left', 'left', { order: 0.61 });
  const bench = a.furn('bench', 2, 7, undefined, { order: 0.5 });
  for (let i = 0; i < 2; i++) a.seat('bench', 'bench', 2 + i, 7, 'down', undefined, { noFurniture: true, furnitureId: bench });
  a.furn('plant_small', 4, 7, 'fern', { order: 0.52 });
  a.furn('water_cooler', 1, 7, undefined, { order: 0.53 });
  a.spot('water', 1, 8, 'up', { dy: -3 });

  for (const lx of [1, 2, 3, 12, 13, 14]) a.furn('glass_partition', lx, 11, 'h', { order: 0.15 });
  a.walk(1, 2, 14, 10);
  a.spot('talk', 5, 9, 'right', { group: `talk:${b.id}:saguao`, dx: -1 });
  a.spot('talk', 6, 9, 'left', { group: `talk:${b.id}:saguao`, dx: 1 });
  return a.build();
}

/** Sala de reunião ao sul do saguão (mesa grande, quadro, estante). */
export function layoutMeeting(b: CampusBuilding): AreaLayout {
  const seed = hash32(`${b.id}:reuniao`);
  const a = new AreaBuilder(b.meetingId, 'meeting', { x: b.lobbyX, y: b.y + SOUTH_Y, w: COL_W, h: ROOM_H });
  a.floor('wood', 0, 0, 16, 12, 700 + (seed % 97));
  a.rug(3.6, 3.7, 8.8, 4.6, b.accent, seed);
  a.face(0.5, 15, MEETING_WALL, [{ lx: 7, w: 2 }]);
  a.wall('door_frame', 8, undefined, { order: 0.05 });
  a.south(0.5, 15, 11, { ...MEETING_WALL, exterior: true });
  a.cap(0, 0, 0.5, 12, MEETING_WALL);
  a.cap(15.5, 0, 0.5, 12, MEETING_WALL);
  a.walk(1, 2, 14, 9);
  a.walk(7, 0, 2, 2);
  a.area.door = { x: b.lobbyX + 7, y: b.y + SOUTH_Y, w: 2, h: 2 };
  a.area.edge = 'south';
  a.area.bld = b.id;

  a.wall('whiteboard', 3, undefined, { order: 0.6 });
  a.wall('clock', 11.5, undefined, { order: 0.7 });
  a.wall('poster', 12.6, 'ship_it', { order: 0.5 });
  a.furn('meeting_table', 5, 5, undefined, { order: 0.45 });
  a.furn('meeting_table', 8, 5, undefined, { order: 0.46 });
  for (let i = 0; i < 6; i++) {
    a.furn('office_chair_front', 5 + i, 4, 'black', { order: 0.55 + i * 0.01, dx: 0 });
    a.furn('office_chair', 5 + i, 7, 'black', { order: 0.6 + i * 0.01 });
  }
  a.furn('bookshelf', 1, 2, undefined, { order: 0.25 });
  a.spot('shelf', 1, 3, 'up', { dx: 8, dy: -2 });
  a.furn('binder_shelf', 13, 2, undefined, { order: 0.26 });
  a.furn('plant_tall', 14, 2, 'monstera', { order: 0.2 });
  a.furn('plant_tall', 1, 10, 'bonsai', { order: 0.21 });
  a.furn('plant_tall', 14, 10, 'ficus', { order: 0.22 });
  a.furn('printer', 12, 10, undefined, { order: 0.3 });
  a.furn('floor_lamp', 2, 8, undefined, { order: 0.32 });
  a.furn('plant_small', 13, 10, 'succulent', { order: 0.31 });
  return a.build();
}

const TALL = ['ficus', 'palm', 'monstera', 'bonsai'] as const;
const SMALL = ['fern', 'succulent', 'flower'] as const;

/** Corredor do prédio: entrada de vidro aberta na ponta voltada para o Commons, fachada fechada na outra. */
export function layoutBuildingCorridor(b: CampusBuilding): AreaLayout {
  const w = b.rect.w;
  const n = 1 + b.cols;
  const a = new AreaBuilder(b.corridorId, 'corridor', { x: b.rect.x, y: b.y + CORRIDOR_Y, w, h: CORRIDOR_H });
  a.area.bld = b.id;
  a.floor('concrete', 0, 0, w, CORRIDOR_H, 520 + (hash32(b.id) % 53));
  const entry = b.wing === 'east' ? 0 : w - 1;
  const far = b.wing === 'east' ? w - 1 : 0;
  for (let ly = 0; ly < CORRIDOR_H; ly++) {
    const end = ly === 0 || ly === CORRIDOR_H - 1;
    a.furn('glass_partition', far, ly, end ? 'end' : 'v', { order: 0.1 });
    if (end) a.furn('glass_partition', entry, ly, 'end', { order: 0.1 });
  }
  a.walk(1, 0, w - 2, CORRIDOR_H);
  a.walk(entry, 1, 1, CORRIDOR_H - 2);
  const lobbyCol = b.wing === 'east' ? 0 : n - 1;
  for (let c = 0; c < n; c++) {
    const x = c * COL_W;
    const k = Math.abs(c - lobbyCol) - 1;
    if (c === lobbyCol) {
      a.furn('plant_tall', x + 2, 4, 'palm', { order: 0.5 });
      a.furn('plant_small', x + 13, 4, 'flower', { order: 0.5 });
    } else if (k % 2 === 0) {
      a.furn('water_cooler', x + 3, 0, undefined, { order: 0.5 });
      a.spot('water', x + 3, 1, 'up', { dy: -3 });
      a.furn('plant_small', x + 4, 0, SMALL[k % SMALL.length], { order: 0.5 });
    } else {
      const bench = a.furn('bench', x + 11, 0, undefined, { order: 0.5 });
      for (let i = 0; i < 2; i++) a.seat('bench', 'bench', x + 11 + i, 0, 'down', undefined, { noFurniture: true, furnitureId: bench });
      a.furn('plant_tall', x + 13, 0, TALL[k % TALL.length], { order: 0.5 });
      a.furn('plant_small', x + 12, 4, SMALL[(k + 1) % SMALL.length], { order: 0.5 });
    }
    a.rug(x + 2, 1.95, COL_W - 4, 1.1, b.accent, 530 + c);
    a.spot('talk', x + 5, 2, 'right', { group: `talk:${b.id}:corredor:${c}`, dx: -1 });
    a.spot('talk', x + 6, 2, 'left', { group: `talk:${b.id}:corredor:${c}`, dx: 1 });
  }
  return a.build();
}

/** Pátios dos slots sem sala de um prédio (os dois lados de cada coluna de salas). */
export function buildingShells(b: CampusBuilding): SlotShell[] {
  const out: SlotShell[] = [];
  for (let k = 0; k < b.cols; k++) {
    for (const side of ['north', 'south'] as const) {
      const slot = k * 2 + (side === 'north' ? 0 : 1);
      const { dx, dy } = roomOffset(b, slot);
      const sh = translateShell(slotShell(slot, k === b.cols - 1, b.wing === 'west'), dx, dy);
      sh.bld = b.id;
      for (const p of sh.props) p.bld = b.id;
      out.push(sh);
    }
  }
  return out;
}

/** Áreas fixas de um prédio de máquina. */
export function buildingAreas(b: CampusBuilding): AreaLayout[] {
  return [layoutLobby(b), layoutMeeting(b), layoutBuildingCorridor(b)];
}

const areaCache = new Map<string, AreaLayout[]>();

function cachedBuildingAreas(b: CampusBuilding): AreaLayout[] {
  const k = `${b.id}|${b.place}|${b.cols}|${b.name}`;
  let v = areaCache.get(k);
  if (!v) {
    v = buildingAreas(b);
    areaCache.set(k, v);
    if (areaCache.size > 64) areaCache.delete(areaCache.keys().next().value!);
  }
  return v;
}

/** Monta o campus inteiro: áreas fixas, salas, caminhos -> grade única e spots. */
export function assembleCampus(campus: CampusLayout, rooms: readonly AreaLayout[], version = 0): BuildingLayout {
  const core = commonsAreas();
  const corridor = core.find((a) => a.kind === 'corridor')!;
  const fixed: AreaLayout[] = [...core];
  for (const b of campus.buildings) fixed.push(...cachedBuildingAreas(b));
  fixed.push(...mosqueAreas(campus.mosque));
  const r = campus.inner;
  const grid = new WalkGrid(r.w + 2, r.h + 2, version, r.x - 1, r.y - 1);
  for (const p of [...campus.paths, ...campus.mosque.paths]) grid.fill(p.x, p.y, p.w, p.h, FREE);
  const all = [...fixed, ...rooms];
  for (const a of all) paintArea(grid, a);
  const spots: SpotDef[] = [];
  for (const a of all) spots.push(...a.spots);
  return {
    cols: Math.max(1, ...campus.buildings.map((b) => b.cols)),
    rect: campus.inner,
    core: core.filter((a) => a.kind !== 'corridor'),
    corridor,
    rooms: [...rooms],
    areas: fixed,
    grid,
    spots,
    key: campus.key,
    campus,
  };
}

/** Prédio (máquina) que contém o tile, ou undefined (Commons, gramado). */
export function buildingAt(campus: CampusLayout, tx: number, ty: number): CampusBuilding | undefined {
  for (const b of campus.buildings) {
    const r = b.rect;
    if (tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h) return b;
  }
  return undefined;
}

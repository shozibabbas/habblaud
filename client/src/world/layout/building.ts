// Montagem do prédio: núcleo + corredor + salas de projeto -> grade de caminhabilidade e spots.
import { FURNITURE } from '../../art/api';
import { BUILDING_H, COL_W } from '../constants';
import { BLOCKED, FREE, SEAT, WalkGrid } from '../path/grid';
import { furnitureBlocks, furnitureIsSeat } from './builder';
import { layoutCafe, layoutLounge, layoutReception, layoutRestroom } from './core';
import { layoutCorridor } from './corridor';
import { buildingRect } from './geometry';
import type { CampusLayout } from './campus';
import type { AreaLayout, SpotDef, TileRect } from './types';

export interface BuildingLayout {
  cols: number;
  /** Retângulo do prédio (no campus: dos prédios e caminhos). */
  rect: TileRect;
  core: AreaLayout[];
  corridor: AreaLayout;
  rooms: AreaLayout[];
  /** Áreas fixas (tudo menos as salas de projeto): no prédio único, o núcleo e o corredor. */
  areas: AreaLayout[];
  grid: WalkGrid;
  spots: SpotDef[];
  /** Muda quando a forma do mundo muda (largura do prédio; no campus, prédios e larguras). */
  key: string;
  /** Escritório combinado com 2+ máquinas: o campus (Commons + um prédio por máquina). */
  campus?: CampusLayout;
}

let coreCache: AreaLayout[] | null = null;

/** Áreas fixas do núcleo (calculadas uma vez). */
export function coreAreas(): AreaLayout[] {
  return (coreCache ??= [layoutReception(), layoutRestroom(), layoutCafe(), layoutLounge()]);
}

/** Marca na grade as células caminháveis de uma área, os bloqueios e os assentos. */
export function paintArea(grid: WalkGrid, area: AreaLayout): void {
  for (const r of area.walkable) grid.fill(r.x, r.y, r.w, r.h, FREE);
  for (const r of area.blocked ?? []) grid.fill(r.x, r.y, r.w, r.h, BLOCKED);
  for (const f of area.furniture) {
    const def = FURNITURE[f.kind];
    if (def.mount !== 'floor') continue;
    const { w, h } = def.footprint;
    if (furnitureBlocks(f.kind)) grid.fill(f.tx, f.ty, w, h, BLOCKED);
    else if (furnitureIsSeat(f.kind)) {
      for (let y = f.ty; y < f.ty + h; y++) for (let x = f.tx; x < f.tx + w; x++) if (grid.get(x, y) === FREE) grid.set(x, y, SEAT);
    }
  }
}

export function buildWalkGrid(cols: number, areas: readonly AreaLayout[], version = 0): WalkGrid {
  const grid = new WalkGrid(cols * COL_W, BUILDING_H, version);
  for (const a of areas) paintArea(grid, a);
  return grid;
}

export function assembleBuilding(cols: number, rooms: readonly AreaLayout[], version = 0): BuildingLayout {
  const core = coreAreas();
  const corridor = layoutCorridor(cols);
  const all = [...core, corridor, ...rooms];
  const grid = buildWalkGrid(cols, all, version);
  const spots: SpotDef[] = [];
  for (const a of all) spots.push(...a.spots);
  return { cols, rect: buildingRect(cols), core, corridor, rooms: [...rooms], areas: [...core, corridor], grid, spots, key: `${cols}` };
}

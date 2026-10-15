import { describe, expect, it } from 'vitest';
import { FURNITURE, type RoomTheme } from '../../art/api';
import { BUILDING_H, COL_W, CORE_COLS, NORTH_Y, SOUTH_Y } from '../constants';
import {
  assembleCampus,
  buildingAt,
  buildingShells,
  campusBuilding,
  layoutCampus,
  PATH_DY,
  placeOf,
  roomColumnX,
  roomOffset,
  ROW_PITCH,
  WING_GAP,
  type CampusMachineInput,
} from './campus';
import { layoutCampusExterior } from './campus-exterior';
import { COMMONS_W, commonsAreas } from './commons';
import { CAFE_ID, LOUNGE_ID, RESTROOM_ID } from './core';
import { coreAreas } from './building';
import { layoutProjectRoom } from './room';
import { translateArea } from './translate';
import type { AreaLayout, SpotKind, TileRect } from './types';

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};

const overlap = (a: TileRect, b: TileRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function machines(n: number, cols = (i: number) => 1 + (i % 3)): CampusMachineInput[] {
  return Array.from({ length: n }, (_, i) => ({ id: i ? `m${i}` : 'local', name: i ? `server${i}` : 'Laptop', local: i === 0, online: true, place: i, cols: cols(i) }));
}

/** Salas em todos os slots de todos os prédios, já deslocadas para o campus. */
function campusRooms(ms: CampusMachineInput[]): AreaLayout[] {
  const out: AreaLayout[] = [];
  for (const m of ms) {
    const b = campusBuilding(m);
    for (let slot = 0; slot < b.cols * 2; slot++) {
      const { dx, dy } = roomOffset(b, slot);
      out.push(translateArea(layoutProjectRoom({ id: `${m.id}~/p${slot}`, slot, seed: 300 + slot * 41 + m.place }, theme), dx, dy));
    }
  }
  return out;
}

describe('lugares e molduras dos prédios', () => {
  it('lugar 0 = leste da linha 0 (máquina local), 1 = oeste, 2 = leste da linha 1...', () => {
    expect(placeOf(0)).toEqual({ wing: 'east', row: 0 });
    expect(placeOf(1)).toEqual({ wing: 'west', row: 0 });
    expect(placeOf(2)).toEqual({ wing: 'east', row: 1 });
    expect(placeOf(5)).toEqual({ wing: 'west', row: 2 });
  });

  it('a ala leste cresce para a direita e a oeste para a esquerda, sem sair do lugar do saguão', () => {
    const e1 = campusBuilding({ ...machines(1)[0], cols: 1 });
    const e4 = campusBuilding({ ...machines(1)[0], cols: 4 });
    expect(e1.lobbyX).toBe(COMMONS_W + WING_GAP);
    expect(e4.lobbyX).toBe(e1.lobbyX);
    expect(e4.rect.x).toBe(e1.rect.x);
    expect(e4.rect.w).toBe(5 * COL_W);
    const w1 = campusBuilding({ id: 'w', name: 'w', local: false, online: true, place: 1, cols: 1 });
    const w3 = campusBuilding({ id: 'w', name: 'w', local: false, online: true, place: 1, cols: 3 });
    expect(w1.lobbyX + COL_W).toBe(-WING_GAP);
    expect(w3.lobbyX).toBe(w1.lobbyX);
    expect(w3.rect.x + w3.rect.w).toBe(w1.rect.x + w1.rect.w);
    expect(w3.rect.x).toBe(w1.lobbyX - 3 * COL_W);
  });

  it('salas deslocadas caem na coluna certa do prédio, ao norte e ao sul do corredor', () => {
    const b = campusBuilding({ id: 'w', name: 'w', local: false, online: true, place: 3, cols: 2 });
    for (const slot of [0, 1, 2, 3]) {
      const { dx, dy } = roomOffset(b, slot);
      const r = translateArea(layoutProjectRoom({ id: `r${slot}`, slot, seed: 9 }, theme), dx, dy).rect;
      expect(r.x).toBe(roomColumnX(b, Math.floor(slot / 2)));
      expect(r.y).toBe(b.y + (slot % 2 ? SOUTH_Y : NORTH_Y));
      expect(r.y).toBe(ROW_PITCH + (slot % 2 ? SOUTH_Y : NORTH_Y));
    }
  });
});

describe('campus com 4 máquinas', () => {
  const ms = machines(4);
  const campus = layoutCampus(ms);
  const rooms = campusRooms(ms);
  const b = assembleCampus(campus, rooms);

  it('prédios, Commons e salas não se sobrepõem', () => {
    const rects = [campus.commons, ...campus.buildings.map((x) => x.rect)];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j]), `${i}x${j}`).toBe(false);
    for (const r of rooms) {
      const owner = campus.buildings.find((x) => overlap(x.rect, r.rect))!;
      expect(owner, r.id).toBeTruthy();
      expect(r.rect.x >= owner.rect.x && r.rect.x + r.rect.w <= owner.rect.x + owner.rect.w).toBe(true);
    }
    for (const p of campus.paths) for (const r of rects) expect(overlap(p, r)).toBe(false);
  });

  it('tudo é alcançável a partir da entrada do Commons: salas, saguões, elevadores e áreas comuns', () => {
    const start = { x: COMMONS_W, y: PATH_DY + 1 };
    expect(b.grid.walkable(start.x, start.y)).toBe(true);
    const reach = b.grid.reachableFrom(start.x, start.y);
    for (const s of b.spots) expect(reach[b.grid.key(s.tx, s.ty)], `${s.id} inalcançável`).toBe(1);
    for (const x of campus.buildings) expect(reach[b.grid.key(x.door.x, x.door.y)], `porta de ${x.id}`).toBe(1);
  });

  it('cada prédio tem os seus dois elevadores (e o Commons nenhum)', () => {
    for (const x of campus.buildings) expect(b.spots.filter((s) => s.kind === 'elevator' && s.areaId === x.lobbyId)).toHaveLength(2);
    expect(b.spots.filter((s) => s.kind === 'elevator' && s.areaId.startsWith('core:'))).toHaveLength(0);
    expect(new Set(b.spots.map((s) => s.id)).size).toBe(b.spots.length);
    const groups = b.spots.filter((s) => s.group).map((s) => `${s.group}|${s.areaId}`);
    // grupos (conversas, elevadores) não se misturam entre prédios
    const byGroup = new Map<string, Set<string>>();
    for (const g of groups) {
      const [k, area] = g.split('|');
      if (!byGroup.has(k)) byGroup.set(k, new Set());
      byGroup.get(k)!.add(area);
    }
    for (const [k, areas] of byGroup) expect(areas.size, k).toBe(1);
  });

  it('móveis de chão ficam dentro das próprias áreas', () => {
    for (const a of [...b.areas, ...rooms]) {
      for (const f of a.furniture) {
        const d = FURNITURE[f.kind];
        if (d.mount !== 'floor') continue;
        const r = a.rect;
        expect(f.tx >= r.x && f.ty >= r.y && f.tx + d.footprint.w <= r.x + r.w && f.ty + d.footprint.h <= r.y + r.h, `${f.id}`).toBe(true);
      }
    }
  });

  it('pátios dos slots: dois por coluna, nas células das salas', () => {
    for (const x of campus.buildings) {
      const sh = buildingShells(x);
      expect(sh).toHaveLength(x.cols * 2);
      for (const s of sh) expect(s.bld).toBe(x.id);
      const rs = rooms.filter((r) => r.id.startsWith(`${x.id}~`));
      for (const s of sh) expect(rs.some((r) => r.rect.x === s.rect.x && r.rect.y === s.rect.y)).toBe(true);
    }
  });

  it('buildingAt acha o prédio de um tile (e nada no Commons)', () => {
    const x = campus.buildings[1];
    expect(buildingAt(campus, x.lobbyX + 2, x.y + 4)?.id).toBe(x.id);
    expect(buildingAt(campus, 5, 5)).toBeUndefined();
  });

  it('a área externa cobre o campus e as árvores não ficam nos caminhos', () => {
    const ext = layoutCampusExterior(campus);
    const i = campus.inner;
    expect(ext.bounds.x).toBeLessThan(i.x);
    expect(ext.bounds.x + ext.bounds.w).toBeGreaterThan(i.x + i.w);
    expect(ext.bounds.y + ext.bounds.h).toBeGreaterThan(i.y + i.h + 10);
    for (const p of ext.props) {
      if (p.kind !== 'tree' && p.kind !== 'pine') continue;
      const tx = Math.floor(p.x / 16);
      const ty = Math.floor(p.y / 16) - 1;
      expect(b.grid.get(tx, ty), `árvore em ${tx},${ty}`).toBe(0);
    }
    // portões da cerca viva: só diante dos slots ao sul de cada prédio
    for (const p of ext.props) if (p.whenRoom !== undefined) expect(p.whenRoom % 2).toBe(1);
  });

  it('a chave muda quando um prédio cresce ou uma máquina cai', () => {
    const k = campus.key;
    expect(layoutCampus(machines(4, (i) => (i === 2 ? 5 : 1 + (i % 3)))).key).not.toBe(k);
    expect(layoutCampus(ms.map((m, i) => (i === 3 ? { ...m, online: false } : m))).key).not.toBe(k);
    expect(layoutCampus(ms).key).toBe(k);
  });
});

describe('Commons', () => {
  const count = (areas: AreaLayout[], id: string, kind: SpotKind) => areas.find((a) => a.id === id)!.spots.filter((s) => s.kind === kind).length;
  const big = commonsAreas();
  const small = coreAreas();

  it('é maior que o núcleo do prédio único: mais lugares, cafeteiras, cabines, pias e jogos', () => {
    expect(count(big, CAFE_ID, 'cafe_seat')).toBeGreaterThan(count(small, CAFE_ID, 'cafe_seat'));
    expect(count(big, CAFE_ID, 'coffee')).toBeGreaterThan(count(small, CAFE_ID, 'coffee'));
    expect(count(big, RESTROOM_ID, 'stall')).toBeGreaterThan(count(small, RESTROOM_ID, 'stall'));
    expect(count(big, RESTROOM_ID, 'sink')).toBeGreaterThan(count(small, RESTROOM_ID, 'sink'));
    expect(count(big, LOUNGE_ID, 'sofa')).toBeGreaterThan(count(small, LOUNGE_ID, 'sofa'));
    expect(count(big, LOUNGE_ID, 'arcade')).toBeGreaterThan(count(small, LOUNGE_ID, 'arcade'));
    expect(count(big, LOUNGE_ID, 'watch')).toBeGreaterThan(count(small, LOUNGE_ID, 'watch'));
  });

  it('mantém o que as rodas usam: TV, pingue-pongue em par, pares da copa, espelhos vizinhos', () => {
    const lounge = big.find((a) => a.id === LOUNGE_ID)!;
    expect(lounge.wallItems.some((w) => w.kind === 'tv')).toBe(true);
    expect(lounge.spots.filter((s) => s.group === 'pingpong')).toHaveLength(2);
    const sofa = lounge.spots.filter((s) => s.kind === 'sofa').map((s) => s.tx).sort((a, b) => a - b);
    expect(sofa.some((x, i) => sofa[i + 1] === x + 1)).toBe(true);
    const cafe = big.find((a) => a.id === CAFE_ID)!.spots.filter((s) => s.kind === 'cafe_seat');
    expect(cafe.some((s) => s.dir === 'down' && cafe.some((o) => o.dir === 'up' && o.tx === s.tx && o.ty === s.ty + 3))).toBe(true);
    const sinks = big.find((a) => a.id === RESTROOM_ID)!.spots.filter((s) => s.kind === 'sink').map((s) => s.tx).sort((a, b) => a - b);
    expect(sinks.some((x, i) => sinks[i + 1] === x + 1)).toBe(true);
  });

  it('cabe no retângulo do Commons (3 colunas, altura do prédio)', () => {
    for (const a of big) expect(a.rect.x >= 0 && a.rect.x + a.rect.w <= COMMONS_W && a.rect.y >= 0 && a.rect.y + a.rect.h <= BUILDING_H, a.id).toBe(true);
    expect(COMMONS_W).toBe((CORE_COLS + 1) * COL_W);
  });
});

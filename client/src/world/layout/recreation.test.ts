// Faixa de recreação do campus: fica ao norte da linha 0 sem encostar em nada, tudo é alcançável a pé a partir do
// Commons e a área externa abre espaço para ela.
import { describe, expect, it } from 'vitest';
import { assembleCampus, layoutCampus, type CampusMachineInput } from './campus';
import { layoutCampusExterior } from './campus-exterior';
import { COURT_ID, GAMES_ID, layoutRecreation, REST_ID, SMOKING_ID } from './recreation';
import type { TileRect } from './types';

const overlap = (a: TileRect, b: TileRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function machines(n: number): CampusMachineInput[] {
  return Array.from({ length: n }, (_, i) => ({ id: i ? `m${i}` : 'local', name: `m${i}`, local: i === 0, online: true, place: i, cols: 1 + (i % 3) }));
}

describe('faixa de recreação do campus', () => {
  it('fica ao norte da linha 0, sem encostar no Commons nem nos prédios, e o enquadramento cresce até ela', () => {
    for (const n of [2, 3, 4, 6]) {
      const campus = layoutCampus(machines(n));
      const rec = campus.recreation;
      expect(rec.rect.y + rec.rect.h).toBeLessThanOrEqual(0);
      // (a mesquita, ao norte da recreação, sobe o enquadramento ainda mais: layout/mosque.test.ts)
      expect(campus.inner.y).toBeLessThanOrEqual(rec.rect.y);
      for (const a of rec.areas) {
        expect(overlap(a.rect, campus.commons)).toBe(false);
        for (const b of campus.buildings) expect(overlap(a.rect, b.rect)).toBe(false);
      }
      for (const b of campus.buildings) for (const p of rec.paths) expect(overlap(p, b.rect)).toBe(false);
    }
  });

  it('salão com 4 mesas de duplas, cápsulas, quadra com 4 jogadores e torcida, pares na área de fumantes', () => {
    const rec = layoutRecreation();
    const spots = rec.areas.flatMap((a) => a.spots);
    const tables = new Set(spots.filter((s) => s.kind === 'pingpong' && s.areaId === GAMES_ID).map((s) => s.group));
    expect(tables.size).toBe(4);
    for (const g of tables) expect(spots.filter((s) => s.group === g)).toHaveLength(4);
    expect(spots.filter((s) => s.kind === 'pod' && s.areaId === REST_ID).length).toBeGreaterThanOrEqual(8);
    expect(spots.filter((s) => s.kind === 'tennis' && s.areaId === COURT_ID)).toHaveLength(4);
    expect(spots.filter((s) => s.kind === 'watch' && s.areaId === COURT_ID && s.seated).length).toBeGreaterThanOrEqual(6);
    const smoke = spots.filter((s) => s.kind === 'smoke' && s.areaId === SMOKING_ID);
    expect(smoke.filter((s) => s.group).length).toBeGreaterThanOrEqual(4);
    expect(smoke.filter((s) => s.seated).length).toBeGreaterThanOrEqual(2);
    expect(rec.areas.find((a) => a.id === COURT_ID)!.rec).toBe('court');
  });

  it('todo lugar da recreação é alcançável a pé a partir do corredor do Commons', () => {
    for (const n of [2, 5]) {
      const campus = layoutCampus(machines(n));
      const b = assembleCampus(campus, []);
      const seen = b.grid.reachableFrom(10, 14);
      for (const a of campus.recreation.areas) {
        for (const s of a.spots) {
          expect(b.grid.walkable(s.tx, s.ty), `${s.id} caminhável`).toBe(true);
          expect(seen[b.grid.key(s.tx, s.ty)], `${s.id} alcançável`).toBe(1);
        }
      }
    }
  });

  it('a área externa sobe junto (mata ao norte da faixa) e não planta árvore em cima dela', () => {
    const campus = layoutCampus(machines(3));
    const ext = layoutCampusExterior(campus);
    const rec = campus.recreation.rect;
    expect(ext.bounds.y).toBeLessThan(rec.y);
    const inside = (x: number, y: number, r: TileRect) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    for (const p of ext.props) {
      if (p.kind !== 'tree' && p.kind !== 'pine') continue;
      for (const a of campus.recreation.areas) expect(inside(p.x / 16, p.y / 16, a.rect)).toBe(false);
    }
  });
});

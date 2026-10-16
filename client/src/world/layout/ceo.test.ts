// Diretoria do campus: só existe com um dono; fica a leste da área de fumantes, ao norte do prédio da máquina local,
// sem encostar na recreação, na mesquita nem nos prédios; todo lugar dela é alcançável a pé a partir do Commons; a
// mata não nasce em cima dela; os spots que o comportamento usa estão todos lá.
import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../../art/api';
import { assembleCampus, layoutCampus, type CampusMachineInput } from './campus';
import { layoutCampusExterior } from './campus-exterior';
import { CEO_OFFICE_ID, CEO_RECEPTION_ID, ceoAreas, ceoSpots } from './ceo';
import type { TileRect } from './types';

const overlap = (a: TileRect, b: TileRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function machines(n: number): CampusMachineInput[] {
  return Array.from({ length: n }, (_, i) => ({ id: i ? `m${i}` : 'local', name: `m${i}`, local: i === 0, online: true, place: i, cols: 1 + (i % 3) }));
}

describe('diretoria no campus', () => {
  it('só aparece com um dono (e muda a chave do campus)', () => {
    const without = layoutCampus(machines(3));
    expect(without.ceo).toBeUndefined();
    expect(assembleCampus(without, []).areas.some((a) => a.ceo)).toBe(false);
    const withOwner = layoutCampus(machines(3), { ceo: true });
    expect(withOwner.ceo).toBeDefined();
    expect(withOwner.key).not.toBe(without.key);
    const ids = assembleCampus(withOwner, []).areas.filter((a) => a.ceo).map((a) => a.id);
    expect(ids.sort()).toEqual([CEO_OFFICE_ID, CEO_RECEPTION_ID]);
  });

  it('não encosta na recreação, na mesquita, no Commons nem nos prédios, e o enquadramento a inclui', () => {
    for (const n of [2, 3, 4, 6]) {
      const campus = layoutCampus(machines(n), { ceo: true });
      const ceo = campus.ceo!;
      const local = campus.buildings.find((b) => b.local)!;
      // ao norte do prédio da máquina local, com o jardim da frente entre a fachada e o calçadão da recreação
      expect(ceo.rect.y + ceo.rect.h).toBeLessThanOrEqual(local.rect.y);
      expect(ceo.rect.x).toBeGreaterThanOrEqual(local.rect.x);
      const solids: TileRect[] = [
        campus.commons,
        ...campus.buildings.map((b) => b.rect),
        ...campus.recreation.areas.map((a) => a.rect),
        campus.mosque.rect,
        ...campus.mosque.paths,
        ...campus.recreation.paths,
      ];
      for (const s of solids) expect(overlap(s, ceo.rect), `${JSON.stringify(s)}`).toBe(false);
      for (const p of ceo.paths) for (const s of [campus.commons, ...campus.buildings.map((b) => b.rect), ...campus.recreation.areas.map((a) => a.rect)]) expect(overlap(p, s)).toBe(false);
      const r = campus.inner;
      for (const t of [ceo.rect, ...ceo.paths]) {
        expect(t.x).toBeGreaterThanOrEqual(r.x);
        expect(t.y).toBeGreaterThanOrEqual(r.y);
        expect(t.x + t.w).toBeLessThanOrEqual(r.x + r.w);
        expect(t.y + t.h).toBeLessThanOrEqual(r.y + r.h);
      }
    }
  });

  it('móveis dentro das áreas, sem dois móveis que bloqueiam no mesmo tile (fora a placa presa na coluna)', () => {
    const campus = layoutCampus(machines(2), { ceo: true });
    for (const a of ceoAreas(campus.ceo!)) {
      const used = new Map<string, string>();
      for (const f of a.furniture) {
        const def = FURNITURE[f.kind];
        const { w, h } = def.footprint;
        expect(f.tx >= a.rect.x && f.ty >= a.rect.y && f.tx + w <= a.rect.x + a.rect.w && f.ty + h <= a.rect.y + a.rect.h, f.id).toBe(true);
        if (def.mount !== 'floor' || f.kind === 'door_plate') continue;
        for (let y = f.ty; y < f.ty + h; y++) {
          for (let x = f.tx; x < f.tx + w; x++) {
            const k = `${x},${y}`;
            expect(used.get(k), `${f.id} × ${used.get(k)}`).toBeUndefined();
            used.set(k, f.id);
          }
        }
      }
    }
  });

  it('todo lugar da diretoria é alcançável a pé a partir do corredor do Commons', () => {
    for (const n of [2, 5]) {
      const campus = layoutCampus(machines(n), { ceo: true });
      const b = assembleCampus(campus, []);
      const seen = b.grid.reachableFrom(10, 14);
      for (const a of ceoAreas(campus.ceo!)) {
        for (const s of a.spots) {
          expect(b.grid.walkable(s.tx, s.ty), `${s.id} caminhável`).toBe(true);
          expect(seen[b.grid.key(s.tx, s.ty)], `${s.id} alcançável`).toBe(1);
        }
      }
      expect(b.grid.walkable(campus.ceo!.door.x, campus.ceo!.door.y)).toBe(true);
    }
  });

  it('tem os spots do comportamento: mesa (sentado e em pé), telefone, reunião, café, visitas, secretária e porta', () => {
    const campus = layoutCampus(machines(2), { ceo: true });
    const spots = assembleCampus(campus, []).spots;
    const desk = ceoAreas(campus.ceo!).find((a) => a.id === CEO_OFFICE_ID)!.furniture.find((f) => f.kind === 'exec_desk')!;
    const seat = ceoSpots(spots, 'ceo_desk');
    expect(seat).toHaveLength(1);
    expect(seat[0].seated).toBe(true);
    expect(seat[0].deskId).toBe(desk.id);
    const stand = ceoSpots(spots, 'ceo_stand');
    expect(stand).toHaveLength(1);
    expect(stand[0].seated).toBeFalsy();
    expect(stand[0].deskId).toBe(desk.id);
    expect(ceoSpots(spots, 'ceo_call').map((s) => s.rank)).toEqual([0, 1]);
    const meeting = ceoSpots(spots, 'ceo_meeting');
    expect(meeting).toHaveLength(4);
    expect(new Set(meeting.map((s) => s.group)).size).toBe(1);
    expect(ceoSpots(spots, 'ceo_coffee')[0].furnitureId).toContain('coffee_bar');
    expect(ceoSpots(spots, 'ceo_guest')).toHaveLength(2);
    const sec = ceoSpots(spots, 'secretary');
    expect(sec).toHaveLength(1);
    expect(sec[0].areaId).toBe(CEO_RECEPTION_ID);
    expect(sec[0].deskId).toContain('secretary_desk');
    expect(ceoSpots(spots, 'visitor')).toHaveLength(2);
    expect(ceoSpots(spots, 'ceo_door')).toHaveLength(1);
    // os kinds da diretoria só existem nela (ninguém mais é mandado para lá)
    const kinds = new Set(['ceo_desk', 'ceo_stand', 'ceo_call', 'ceo_meeting', 'ceo_coffee', 'ceo_guest', 'ceo_door', 'secretary', 'visitor']);
    for (const s of spots) if (kinds.has(s.kind)) expect([CEO_OFFICE_ID, CEO_RECEPTION_ID]).toContain(s.areaId);
    for (const s of spots) if (s.areaId === CEO_OFFICE_ID || s.areaId === CEO_RECEPTION_ID) expect(kinds.has(s.kind), s.id).toBe(true);
  });

  it('a mata e os enfeites não nascem em cima da diretoria nem do calçadão dela', () => {
    for (const n of [2, 4]) {
      const campus = layoutCampus(machines(n), { ceo: true });
      const ext = layoutCampusExterior(campus);
      const ceo = campus.ceo!;
      for (const p of ext.props) {
        if (p.kind !== 'tree' && p.kind !== 'pine' && p.kind !== 'bush') continue;
        const t = { x: Math.floor(p.x / 16), y: Math.floor(p.y / 16), w: 1, h: 1 };
        expect(overlap(t, ceo.rect), `${p.kind} em ${t.x},${t.y}`).toBe(false);
        for (const path of ceo.paths) expect(overlap(t, path), `${p.kind} em ${t.x},${t.y}`).toBe(false);
      }
      expect(ext.bounds.x + ext.bounds.w).toBeGreaterThan(ceo.rect.x + ceo.rect.w);
    }
  });
});

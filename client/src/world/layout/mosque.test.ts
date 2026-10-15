// Lugar da mesquita no campus: ao norte da faixa de recreação, sem encostar nela, no Commons nem nos prédios; os
// caminhos dela não passam por cima de nada; o enquadramento sobe até a cúpula; nada da mata em cima dela.
import { describe, expect, it } from 'vitest';
import { assembleCampus, layoutCampus, type CampusMachineInput } from './campus';
import { layoutCampusExterior } from './campus-exterior';
import { MOSQUE_H, MOSQUE_W } from './mosque';
import type { TileRect } from './types';

const overlap = (a: TileRect, b: TileRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function machines(n: number): CampusMachineInput[] {
  return Array.from({ length: n }, (_, i) => ({ id: i ? `m${i}` : 'local', name: `m${i}`, local: i === 0, online: true, place: i, cols: 1 + (i % 3) }));
}

describe('mesquita no campus', () => {
  it('fica ao norte da recreação, sem encostar em nada, e o enquadramento sobe até a cúpula', () => {
    for (const n of [2, 3, 5, 6]) {
      const campus = layoutCampus(machines(n));
      const m = campus.mosque;
      const rec = campus.recreation;
      expect(m.rect.w).toBe(MOSQUE_W);
      expect(m.rect.h).toBe(MOSQUE_H);
      // o prédio inteiro (com a cúpula) acima da faixa de recreação, centrado sobre o Commons
      expect(m.rect.y + m.rect.h).toBeLessThan(rec.rect.y);
      expect(Math.abs(m.rect.x + m.rect.w / 2 - (campus.commons.x + campus.commons.w / 2))).toBeLessThanOrEqual(1);
      expect(campus.inner.y).toBe(m.skyY);
      const solids: TileRect[] = [campus.commons, ...campus.buildings.map((b) => b.rect), ...rec.areas.map((a) => a.rect)];
      for (const s of solids) expect(overlap(s, m.rect)).toBe(false);
      for (const p of m.paths) {
        for (const s of solids) expect(overlap(p, s), `${JSON.stringify(p)} × ${JSON.stringify(s)}`).toBe(false);
        expect(overlap(p, m.rect)).toBe(false);
      }
    }
  });

  it('a mata e os enfeites não nascem em cima da mesquita nem dos caminhos dela', () => {
    const campus = layoutCampus(machines(4));
    const ext = layoutCampusExterior(campus);
    const m = campus.mosque;
    const zone: TileRect = { x: m.rect.x - 2, y: m.skyY, w: m.rect.w + 4, h: m.rect.y + m.rect.h - m.skyY };
    for (const p of ext.props) {
      const t = { x: Math.floor(p.x / 16), y: Math.floor(p.y / 16), w: 1, h: 1 };
      if (p.kind === 'tree' || p.kind === 'pine' || p.kind === 'bush') {
        expect(overlap(t, zone), `${p.kind} em ${t.x},${t.y}`).toBe(false);
        for (const path of m.paths) expect(overlap(t, path), `${p.kind} em ${t.x},${t.y}`).toBe(false);
      }
    }
    expect(ext.bounds.y).toBeLessThan(m.skyY);
  });

  it('as portas das duas alas dão nos caminhos (caminháveis na grade montada)', () => {
    const campus = layoutCampus(machines(3));
    const b = assembleCampus(campus, []);
    for (const d of Object.values(campus.mosque.doors)) expect(b.grid.walkable(d.x, d.y)).toBe(true);
  });
});

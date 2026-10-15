import { describe, expect, it } from 'vitest';
import { renderSeasonalProp, type SeasonalProp } from './seasonal';

describe('decorações sazonais', () => {
  it('mantém decorações dentro das folhas de desenho, com margem transparente', () => {
    const kinds: SeasonalProp[] = [
      'fanoos_tall', 'fanoos', 'fanoos_green', 'fanoos_teal', 'balloons_fitr', 'balloons_adha', 'crescent',
      'dates', 'water', 'sharbat', 'pakora', 'khurma', 'mithai', 'fanoos_mini',
    ];
    for (const kind of kinds) {
      const { buf, ax, ay } = renderSeasonalProp(kind);
      const bounds = buf.bounds()!;
      expect(buf.countOpaque()).toBeGreaterThan(buf.w > 20 ? 40 : 12);
      expect(bounds.x).toBeGreaterThan(0);
      expect(bounds.y).toBeGreaterThan(0);
      expect(bounds.x + bounds.w).toBeLessThan(buf.w);
      expect(bounds.y + bounds.h).toBeLessThanOrEqual(buf.h);
      expect(ax).toBeGreaterThan(bounds.x);
      expect(ax).toBeLessThan(bounds.x + bounds.w);
      // a âncora fica na base do desenho (chão ou tampo da mesa); o crescente fica pendurado acima
      if (kind !== 'crescent') expect(bounds.y + bounds.h - ay).toBeGreaterThanOrEqual(-1);
      expect(bounds.y + bounds.h - ay).toBeLessThanOrEqual(2);
    }
  });
});

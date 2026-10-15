import { describe, expect, it } from 'vitest';
import { seasonalThemeFor } from './api';
import { hijriDateOf, hijriTheme, parseHijriParam, type HijriDate } from './hijri';

const at = (year: number, month: number, day: number, hour = 12) => new Date(year, month - 1, day, hour);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours());

/** Primeiro dia local (meio-dia) em que o Intl dá o mês/dia hijri pedido, procurando a partir de `from`. */
function firstDay(from: Date, month: number, day: number): Date {
  for (let i = 0; i < 400; i++) {
    const d = addDays(from, i);
    const h = hijriDateOf(d);
    if (h && h.month === month && h.day === day) return d;
  }
  throw new Error(`sem ${day}/${month} hijri em 400 dias`);
}

describe('tema do escritório', () => {
  it('calendário hijri (Umm al-Qura) pelo Intl, na hora local', () => {
    const h = hijriDateOf(at(2026, 3, 1));
    expect(h).toMatchObject({ year: 1447, month: 9 });
    expect(hijriDateOf(at(2026, 3, 1), ['gregory-nao-existe'])).toBeNull();
    // sem Umm al-Qura, cai no próximo da lista
    expect(hijriDateOf(at(2026, 3, 1), ['nao-existe', 'islamic-civil'])).toMatchObject({ year: 1447, month: 9 });
  });

  it('automático: Ramadã o mês inteiro, Eid al-Fitr de 1 a 3 de Shawwal, Eid al-Adha de 10 a 13 de Dhu al-Hijjah', () => {
    // 1447: o Ramadã começa por volta de 18/02/2026, o Eid al-Fitr por volta de 20/03 e o al-Adha de 27/05
    const ramadan = firstDay(at(2026, 1, 1), 9, 1);
    expect(Math.abs(ramadan.getTime() - at(2026, 2, 18).getTime())).toBeLessThanOrEqual(2 * 864e5);
    expect(seasonalThemeFor('auto', addDays(ramadan, -1))).toBe('none');
    expect(seasonalThemeFor('auto', ramadan)).toBe('ramadan');
    expect(seasonalThemeFor('auto', new Date(ramadan.getFullYear(), ramadan.getMonth(), ramadan.getDate(), 0, 1))).toBe('ramadan');
    expect(seasonalThemeFor('auto', addDays(ramadan, 15))).toBe('ramadan');

    const fitr = firstDay(ramadan, 10, 1);
    expect(Math.abs(fitr.getTime() - at(2026, 3, 20).getTime())).toBeLessThanOrEqual(2 * 864e5);
    expect(seasonalThemeFor('auto', addDays(fitr, -1))).toBe('ramadan');
    for (let i = 0; i < 3; i++) expect(seasonalThemeFor('auto', addDays(fitr, i))).toBe('eid_fitr');
    expect(seasonalThemeFor('auto', addDays(fitr, 3))).toBe('none');

    const adha = firstDay(fitr, 12, 10);
    expect(Math.abs(adha.getTime() - at(2026, 5, 27).getTime())).toBeLessThanOrEqual(2 * 864e5);
    expect(seasonalThemeFor('auto', addDays(adha, -1))).toBe('none');
    for (let i = 0; i < 4; i++) expect(seasonalThemeFor('auto', addDays(adha, i))).toBe('eid_adha');
    expect(seasonalThemeFor('auto', addDays(adha, 4))).toBe('none');

    // Natal e Halloween não existem mais
    for (const d of [at(2026, 10, 15), at(2026, 12, 24), at(2026, 7, 15)]) expect(seasonalThemeFor('auto', d)).toBe('none');
    // Sem preferência (opções antigas do mundo) vale o automático.
    expect(seasonalThemeFor(undefined, addDays(ramadan, 3))).toBe('ramadan');
  });

  it('mapa hijri -> tema', () => {
    const h = (month: number, day: number): HijriDate => ({ year: 1447, month, day });
    expect(hijriTheme(null)).toBe('none');
    expect(hijriTheme(h(8, 30))).toBe('none');
    expect(hijriTheme(h(9, 1))).toBe('ramadan');
    expect(hijriTheme(h(9, 30))).toBe('ramadan');
    expect(hijriTheme(h(10, 1))).toBe('eid_fitr');
    expect(hijriTheme(h(10, 3))).toBe('eid_fitr');
    expect(hijriTheme(h(10, 4))).toBe('none');
    expect(hijriTheme(h(12, 9))).toBe('none');
    expect(hijriTheme(h(12, 10))).toBe('eid_adha');
    expect(hijriTheme(h(12, 13))).toBe('eid_adha');
    expect(hijriTheme(h(12, 14))).toBe('none');
  });

  it('data forçada (?hijri=) vale no automático, não sobre uma escolha fixa', () => {
    const july = at(2026, 7, 15);
    expect(seasonalThemeFor('auto', july, { year: 1447, month: 9, day: 10 })).toBe('ramadan');
    expect(seasonalThemeFor('auto', july, null)).toBe('none');
    expect(seasonalThemeFor('none', july, { year: 1447, month: 9, day: 10 })).toBe('none');
  });

  it('escolha fixa vale o ano todo; temas antigos salvos voltam ao automático', () => {
    for (const date of [at(2026, 1, 1), at(2026, 10, 13), at(2026, 12, 1)]) {
      expect(seasonalThemeFor('none', date)).toBe('none');
      expect(seasonalThemeFor('ramadan', date)).toBe('ramadan');
      expect(seasonalThemeFor('eid_fitr', date)).toBe('eid_fitr');
      expect(seasonalThemeFor('eid_adha', date)).toBe('eid_adha');
      expect(seasonalThemeFor('christmas' as never, date)).toBe(seasonalThemeFor('auto', date));
    }
  });

  it('lê ?hijri= da URL', () => {
    expect(parseHijriParam('?hijri=1447-09-10')).toEqual({ year: 1447, month: 9, day: 10 });
    expect(parseHijriParam('?mock=1&hijri=1447/10/1')).toEqual({ year: 1447, month: 10, day: 1 });
    expect(parseHijriParam('?hijri=12-10')).toEqual({ year: 0, month: 12, day: 10 });
    expect(parseHijriParam('?hijri=1447-13-01')).toBeNull();
    expect(parseHijriParam('?hijri=1447-09-31')).toBeNull();
    expect(parseHijriParam('?hijri=ramadan')).toBeNull();
    expect(parseHijriParam('?mock=1')).toBeNull();
    expect(parseHijriParam('')).toBeNull();
  });
});

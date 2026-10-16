// Horários das orações em Islamabad contra valores de referência (aladhan.com, métodos 0 = Jafari e 1 = Karachi,
// Asr padrão), com tolerância de 2 minutos.
import { describe, expect, it } from 'vitest';
import { dayTimes, formatHM, prayersOn, type PrayerMethod } from './prayer-times';

const ISB = { lat: 33.6844, lon: 73.0479 };
const toMin = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

// data: Fajr, Nascer, Dhuhr, Asr, Pôr do sol, Maghrib, Isha (hora de Islamabad, UTC+5)
const REF: Record<PrayerMethod, Record<string, string[]>> = {
  jafari: {
    '2026-06-21': ['03:27', '04:58', '12:10', '15:54', '19:21', '19:39', '20:39'],
    '2026-12-21': ['05:49', '07:08', '12:06', '14:45', '17:03', '17:20', '18:12'],
    '2026-10-16': ['05:00', '06:13', '11:53', '15:07', '17:33', '17:49', '18:37'],
    '2026-03-20': ['04:59', '06:12', '12:15', '15:41', '18:19', '18:34', '19:23'],
  },
  karachi: {
    '2026-06-21': ['03:14', '04:58', '12:10', '15:54', '19:21', '19:21', '21:05'],
    '2026-12-21': ['05:39', '07:08', '12:06', '14:45', '17:03', '17:03', '18:33'],
    '2026-10-16': ['04:50', '06:13', '11:53', '15:07', '17:33', '17:33', '18:56'],
    '2026-03-20': ['04:49', '06:12', '12:15', '15:41', '18:19', '18:19', '19:42'],
  },
};
const KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'maghrib', 'isha'] as const;

describe('horários das orações', () => {
  for (const method of ['jafari', 'karachi'] as const) {
    for (const [day, ref] of Object.entries(REF[method])) {
      it(`${method} ${day} em Islamabad (±2 min)`, () => {
        const [y, m, d] = day.split('-').map(Number);
        const t = dayTimes({ y, m, d }, ISB.lat, ISB.lon, 5, method);
        KEYS.forEach((k, i) => expect(Math.abs(toMin(formatHM(t[k])) - toMin(ref[i])), `${k}: ${formatHM(t[k])} × ${ref[i]}`).toBeLessThanOrEqual(2));
      });
    }
  }

  it('Jafari: Maghrib depois do pôr do sol; Karachi: no pôr do sol; Fajr Jafari mais tarde (16° × 18°)', () => {
    const j = dayTimes({ y: 2026, m: 10, d: 16 }, ISB.lat, ISB.lon, 5, 'jafari');
    const k = dayTimes({ y: 2026, m: 10, d: 16 }, ISB.lat, ISB.lon, 5, 'karachi');
    expect(j.maghrib - j.sunset).toBeGreaterThan(0.2);
    expect(Math.abs(k.maghrib - k.sunset)).toBeLessThan(1 / 60);
    expect(j.fajr).toBeGreaterThan(k.fajr);
    expect(j.isha).toBeLessThan(k.isha);
  });

  it('prayersOn: cinco instantes do dia local, em ordem, com a chave do dia', () => {
    const now = Date.UTC(2026, 9, 16, 7, 0); // 12:00 em Islamabad
    const ps = prayersOn(now, ISB.lat, ISB.lon, 'jafari', () => 5);
    expect(ps.map((p) => p.name)).toEqual(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
    expect(ps.every((p) => p.day === '2026-10-16')).toBe(true);
    for (let i = 1; i < ps.length; i++) expect(ps[i].at).toBeGreaterThan(ps[i - 1].at);
    const dhuhr = new Date(ps[1].at + 5 * 3_600_000);
    expect(Math.abs(dhuhr.getUTCHours() * 60 + dhuhr.getUTCMinutes() - toMin('11:53'))).toBeLessThanOrEqual(2);
  });
});

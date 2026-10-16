// Horários das cinco orações calculados pela posição do sol (sem API externa): o método clássico do PrayTimes
// (declinação e equação do tempo pela data juliana; ângulos de depressão para o Fajr, o Maghrib e o Isha; a sombra para
// o Asr). Puro (sem Node nem DOM), usado no navegador e nos testes.
//
//   jafari   Shia Ithna-Ashari (Instituto de Geofísica de Qom): Fajr 16°, Maghrib 4° abaixo do horizonte, Isha 14°,
//            Asr com a sombra 1× o objeto.
//   karachi  Universidade de Ciências Islâmicas de Karachi: Fajr 18°, Isha 18°, Maghrib no pôr do sol, Asr 1×.

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const PRAYER_NAMES: readonly PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export type PrayerMethod = 'jafari' | 'karachi';

interface MethodParams {
  fajr: number;
  isha: number;
  /** Graus abaixo do horizonte; null = no pôr do sol. */
  maghrib: number | null;
  /** Fator da sombra do Asr (1 = padrão, 2 = hanafi). */
  asr: number;
}

export const METHODS: Readonly<Record<PrayerMethod, MethodParams>> = {
  jafari: { fajr: 16, isha: 14, maghrib: 4, asr: 1 },
  karachi: { fajr: 18, isha: 18, maghrib: null, asr: 1 },
};

/** Horários do dia em horas locais (0..24, fracionárias), mais o nascer e o pôr do sol. */
export interface DayTimes {
  fajr: number;
  sunrise: number;
  dhuhr: number;
  asr: number;
  sunset: number;
  maghrib: number;
  isha: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const fix = (a: number, b: number) => {
  const r = a - b * Math.floor(a / b);
  return r < 0 ? r + b : r;
};
const sin = (d: number) => Math.sin(rad(d));
const cos = (d: number) => Math.cos(rad(d));
const tan = (d: number) => Math.tan(rad(d));
const arcsin = (x: number) => deg(Math.asin(x));
const arccos = (x: number) => deg(Math.acos(Math.max(-1, Math.min(1, x))));
const arctan2 = (y: number, x: number) => deg(Math.atan2(y, x));
const arccot = (x: number) => deg(Math.atan(1 / x));

/** Data juliana do meio-dia UT de uma data do calendário gregoriano. */
export function julianDate(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

/** Declinação do sol e equação do tempo (horas) numa data juliana. */
function sunPosition(jd: number): { decl: number; eqt: number } {
  const d = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * d, 360);
  const q = fix(280.459 + 0.98564736 * d, 360);
  const l = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * d;
  const ra = arctan2(cos(e) * sin(l), cos(l)) / 15;
  return { decl: arcsin(sin(e) * sin(l)), eqt: q / 15 - fix(ra, 24) };
}

/**
 * Horários de um dia (data local `y-m-d`) em (`lat`, `lon`) com o fuso `tz` (horas a leste de UTC; Paquistão = +5).
 * Em latitudes onde o sol não chega ao ângulo (verão polar), o horário vira NaN.
 */
export function dayTimes(date: { y: number; m: number; d: number }, lat: number, lon: number, tz: number, method: PrayerMethod): DayTimes {
  const p = METHODS[method];
  const jd = julianDate(date.y, date.m, date.d) - lon / (15 * 24);
  // uma iteração a partir de horários aproximados (em horas), como o PrayTimes
  const at = (t: number) => sunPosition(jd + t / 24);
  const noon = (t: number) => fix(12 - at(t).eqt, 24);
  const angleTime = (angle: number, t: number, before: boolean) => {
    const { decl } = at(t);
    const h = arccos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
    return noon(t) + (before ? -h : h);
  };
  const asrTime = (factor: number, t: number) => {
    const { decl } = at(t);
    return angleTime(-arccot(factor + tan(Math.abs(lat - decl))), t, false);
  };
  const raw = {
    fajr: angleTime(p.fajr, 5, true),
    sunrise: angleTime(0.833, 6, true),
    dhuhr: noon(12),
    asr: asrTime(p.asr, 13),
    sunset: angleTime(0.833, 18, false),
    maghrib: p.maghrib === null ? angleTime(0.833, 18, false) : angleTime(p.maghrib, 18, false),
    isha: angleTime(p.isha, 18, false),
  };
  const shift = tz - lon / 15;
  const out = {} as DayTimes;
  for (const k of Object.keys(raw) as (keyof DayTimes)[]) out[k] = raw[k] + shift;
  return out;
}

/** "HH:MM" de um horário em horas (arredondado ao minuto). */
export function formatHM(hours: number): string {
  if (!Number.isFinite(hours)) return '--:--';
  const m = Math.round(fix(hours, 24) * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Uma oração num instante (epoch ms). */
export interface PrayerAt {
  name: PrayerName;
  at: number;
  /** Data local "aaaa-mm-dd" (chave do disparo: cada oração dispara uma vez por dia). */
  day: string;
}

/**
 * As cinco orações do dia local de `now` como instantes, usando o fuso do próprio relógio (`tzOf(ms)` em horas a leste
 * de UTC; no navegador, -getTimezoneOffset()/60).
 */
export function prayersOn(now: number, lat: number, lon: number, method: PrayerMethod, tzOf: (ms: number) => number = browserTz): PrayerAt[] {
  const tz = tzOf(now);
  const local = new Date(now + tz * 3_600_000);
  const date = { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
  const t = dayTimes(date, lat, lon, tz, method);
  const midnightUtc = Date.UTC(date.y, date.m - 1, date.d) - tz * 3_600_000;
  const day = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  return PRAYER_NAMES.filter((n) => Number.isFinite(t[n])).map((name) => ({ name, at: Math.round(midnightUtc + t[name] * 3_600_000), day }));
}

export function browserTz(ms: number): number {
  return -new Date(ms).getTimezoneOffset() / 60;
}

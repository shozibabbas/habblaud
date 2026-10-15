// Calendário hijri (puro): data islâmica de um instante na hora local e o tema do escritório que ela pede.
// Usa o Intl do navegador (Umm al-Qura; sem suporte, o islâmico astronômico ou o civil tabular). Sem nenhum
// calendário islâmico disponível, não há tema automático.
import type { SeasonalTheme } from './api';

export interface HijriDate {
  year: number;
  /** 1 = Muharram ... 9 = Ramadã, 10 = Shawwal, 12 = Dhu al-Hijjah. */
  month: number;
  day: number;
}

export const HIJRI_CALENDARS = ['islamic-umalqura', 'islamic', 'islamic-civil'] as const;

const formats = new Map<string, Intl.DateTimeFormat | null>();

function formatFor(calendar: string): Intl.DateTimeFormat | null {
  let f = formats.get(calendar);
  if (f !== undefined) return f;
  try {
    const fmt = new Intl.DateTimeFormat(`en-u-ca-${calendar}-nu-latn`, { year: 'numeric', month: 'numeric', day: 'numeric' });
    // motor sem o calendário cai no gregoriano em silêncio: não serve
    f = fmt.resolvedOptions().calendar === calendar ? fmt : null;
  } catch {
    f = null;
  }
  formats.set(calendar, f);
  return f;
}

/** Data hijri de `date` (hora local), no primeiro calendário da lista que o Intl suportar; null se nenhum. */
export function hijriDateOf(date: Date, calendars: readonly string[] = HIJRI_CALENDARS): HijriDate | null {
  for (const calendar of calendars) {
    const f = formatFor(calendar);
    if (!f) continue;
    let year = NaN, month = NaN, day = NaN;
    try {
      for (const p of f.formatToParts(date)) {
        if (p.type === 'year') year = parseInt(p.value, 10);
        else if (p.type === 'month') month = parseInt(p.value, 10);
        else if (p.type === 'day') day = parseInt(p.value, 10);
      }
    } catch {
      continue;
    }
    if (year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= 30) return { year, month, day };
  }
  return null;
}

// O mundo pergunta a cada quadro: a conversão só roda quando muda o dia local.
let lastDay = '';
let lastHijri: HijriDate | null = null;

/** hijriDateOf com os calendários padrão, memorizado por dia local. */
export function hijriToday(date: Date): HijriDate | null {
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  if (key !== lastDay) {
    lastHijri = hijriDateOf(date);
    lastDay = key;
  }
  return lastHijri;
}

/** Ramadã o mês inteiro; Eid al-Fitr de 1 a 3 de Shawwal; Eid al-Adha de 10 a 13 de Dhu al-Hijjah. */
export function hijriTheme(h: HijriDate | null): SeasonalTheme {
  if (!h) return 'none';
  if (h.month === 9) return 'ramadan';
  if (h.month === 10 && h.day <= 3) return 'eid_fitr';
  if (h.month === 12 && h.day >= 10 && h.day <= 13) return 'eid_adha';
  return 'none';
}

/**
 * Data hijri forçada pela URL para prévia (`?hijri=1447-09-10`, `1447/9/10` ou só mês e dia, `9-27`).
 * Devolve null se ausente/inválida.
 */
export function parseHijriParam(search: string | null | undefined): HijriDate | null {
  if (!search) return null;
  let raw: string | null;
  try {
    raw = new URLSearchParams(search).get('hijri');
  } catch {
    return null;
  }
  if (!raw) return null;
  const m = /^\s*(?:(\d{1,4})[-/.])?(\d{1,2})[-/.](\d{1,2})\s*$/.exec(raw);
  if (!m) return null;
  const year = m[1] === undefined ? 0 : Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 30) return null;
  return { year, month, day };
}

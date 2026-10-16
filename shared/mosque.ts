// Configuração da mesquita do campus (OfficeSnapshot.meta.mosque): o jeito de rezar, a cidade (para os horários das
// orações, calculados no navegador: shared/prayer-times.ts), o chamado automático nos horários e, no estilo shia,
// juntar Dhuhr+Asr e Maghrib+Isha. Gravada pelo servidor em <dataDir>/mosque.json (server/mosque.ts); o estilo inicial
// pode vir de HABBLAUD_PRAYER_STYLE. Puro.
import type { PrayerMethod } from './prayer-times';

/** 'sunni': mãos cruzadas no qiyam (o padrão do fork público). 'shia': mãos ao lado do corpo, turbah e qunoot. */
export type PrayerStyle = 'sunni' | 'shia';
export const PRAYER_STYLES: readonly PrayerStyle[] = ['sunni', 'shia'];

export interface MosqueSettings {
  style: PrayerStyle;
  /** Nome da cidade (só para mostrar). */
  city: string;
  lat: number;
  lon: number;
  /** Chamado para a oração automático nos cinco horários. */
  call: boolean;
  /** Estilo shia: Dhuhr+Asr e Maghrib+Isha juntos (o Asr e o Isha não chamam de novo). */
  combine: boolean;
}

/** Islamabad, até o dono configurar a cidade. */
export const DEFAULT_MOSQUE: MosqueSettings = { style: 'sunni', city: 'Islamabad', lat: 33.6844, lon: 73.0479, call: true, combine: false };

/** Método dos horários de cada estilo: Jafari (shia) ou Karachi (o padrão). */
export function methodFor(style: PrayerStyle): PrayerMethod {
  return style === 'shia' ? 'jafari' : 'karachi';
}

export function parsePrayerStyle(v: unknown): PrayerStyle | undefined {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s === 'sunni' || s === 'shia' ? s : undefined;
}

const KEYS = new Set(['style', 'city', 'lat', 'lon', 'call', 'combine']);
const CITY_MAX = 60;

/**
 * Valida a configuração (o mosque.json, o corpo do PUT). Campos ausentes vêm de `base`; um campo fora do formato
 * invalida o todo (`invalid` = o nome do campo).
 */
export function parseMosque(json: unknown, base: MosqueSettings = DEFAULT_MOSQUE): { mosque: MosqueSettings } | { invalid: string } {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { invalid: 'JSON' };
  const src = json as Record<string, unknown>;
  for (const k of Object.keys(src)) if (!KEYS.has(k)) return { invalid: k };
  const out: MosqueSettings = { ...base };
  if (src.style !== undefined) {
    const s = parsePrayerStyle(src.style);
    if (!s) return { invalid: 'style' };
    out.style = s;
  }
  if (src.city !== undefined) {
    if (typeof src.city !== 'string' || src.city.trim().length > CITY_MAX) return { invalid: 'city' };
    out.city = src.city.trim().replace(/\s+/g, ' ');
  }
  for (const [k, lim] of [
    ['lat', 90],
    ['lon', 180],
  ] as const) {
    if (src[k] === undefined) continue;
    const n = typeof src[k] === 'string' ? Number(src[k]) : src[k];
    if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > lim) return { invalid: k };
    out[k] = Math.round(n * 1e4) / 1e4;
  }
  for (const k of ['call', 'combine'] as const) {
    if (src[k] === undefined) continue;
    if (typeof src[k] !== 'boolean') return { invalid: k };
    out[k] = src[k] as boolean;
  }
  return { mosque: out };
}

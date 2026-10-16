// Chamado automático nos horários das orações (puro, com o relógio injetado): a cada verificação, diz qual oração
// chegou desde a anterior — cada uma uma vez por dia. Regras:
//   - ao abrir a página não dispara o que já passou, a não ser nos primeiros minutos depois do horário (GRACE_MS);
//   - se a página ficou sem verificar por um tempo (aba oculta, computador dormindo), o horário que passou nesse
//     intervalo vira só um aviso ("a aba estava oculta") — ou o chamado, se ainda está dentro dos primeiros minutos;
//   - no estilo shia com `combine`, o Asr e o Isha não chamam (vieram juntos com o Dhuhr e o Maghrib).
import type { MosqueSettings } from '../../../../shared/mosque';
import { methodFor } from '../../../../shared/mosque';
import { prayersOn, type PrayerAt, type PrayerName } from '../../../../shared/prayer-times';
import { skipCall } from './salat';

/** Até quanto tempo depois do horário o chamado ainda vale (ao abrir a página ou ao voltar de uma aba oculta). */
export const GRACE_MS = 5 * 60_000;
/** Intervalo entre verificações acima do qual a página "estava oculta". */
const GAP_MS = 20_000;

export interface PrayerTimeEvent {
  name: PrayerName;
  /** Horário da oração (epoch ms). */
  at: number;
  /** Disparar o chamado (minaretes, sino, todos para a mesquita). false = só o aviso. */
  call: boolean;
  /** A página estava oculta (ou sem rodar) no horário. */
  hidden: boolean;
}

export class PrayerClock {
  private fired = new Set<string>();
  private last: number | null = null;
  private cacheKey = '';
  private cache: PrayerAt[] = [];

  constructor(private readonly tzOf?: (ms: number) => number) {}

  /** Horários de hoje (cache por dia e configuração). */
  times(m: MosqueSettings, now: number): PrayerAt[] {
    const day = new Date(now + (this.tzOf ? this.tzOf(now) : -new Date(now).getTimezoneOffset() / 60) * 3_600_000).toISOString().slice(0, 10);
    const key = `${day}|${m.style}|${m.lat}|${m.lon}`;
    if (key !== this.cacheKey) {
      this.cacheKey = key;
      this.cache = prayersOn(now, m.lat, m.lon, methodFor(m.style), this.tzOf);
    }
    return this.cache;
  }

  /** O que aconteceu desde a última verificação (normalmente nada; no máximo uma oração por vez). */
  check(m: MosqueSettings, now: number, hidden = false): PrayerTimeEvent[] {
    const out: PrayerTimeEvent[] = [];
    const first = this.last === null;
    const gap = !first && now - this.last! > GAP_MS;
    for (const p of this.times(m, now)) {
      const key = `${p.day}:${p.name}`;
      if (p.at > now || this.fired.has(key)) continue;
      this.fired.add(key);
      // chamado desligado nas configurações: nem chamado nem aviso
      if (!m.call || skipCall(p.name, m.style, m.combine)) continue;
      const late = now - p.at;
      if (first) {
        // ao abrir a página: só o que acabou de acontecer
        if (late <= GRACE_MS) out.push({ name: p.name, at: p.at, call: true, hidden: false });
        continue;
      }
      if (this.last! >= p.at) continue;
      const wasHidden = hidden || gap;
      out.push({ name: p.name, at: p.at, call: late <= GRACE_MS, hidden: wasHidden });
    }
    this.last = now;
    // só a mais recente vale um chamado (duas no mesmo intervalo: a mais antiga vira só aviso)
    for (let i = 0; i < out.length - 1; i++) out[i].call = false;
    return out;
  }
}

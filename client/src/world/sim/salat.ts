// Sequências de posturas da oração (puro): quantas rak'ahs cada oração tem, o jeito de rezar (sunni: mãos cruzadas no
// qiyam; shia: mãos ao lado do corpo e o qunoot na 2ª rak'ah), o tashahhud do meio nas orações de 3 e 4 rak'ahs, duas
// orações juntas (estilo shia: Dhuhr+Asr, Maghrib+Isha) e as rak'ahs que quem chegou atrasado completa sozinho.
// Tempos encurtados, no ritmo calmo de quem reza. O fim de cada oração depende do jeito de rezar:
//   sunni  depois do tashahhud, o salam virando a cabeça à direita e depois à esquerda;
//   shia   o salam dito sentado, olhando para a qibla (sem virar a cabeça), e três takbirs sentado: as mãos sobem ao
//          lado das orelhas (palmas para a qibla) e descem às coxas, três vezes; depois levanta.
import type { PrayerStyle } from '../../../../shared/mosque';
import type { PrayerName } from '../../../../shared/prayer-times';
import type { Pose } from '../../art/api';

/** Postura da oração (as poses da arte). */
export type Posture = Extract<Pose, 'takbir' | 'qiyam' | 'sadl' | 'qunoot' | 'ruku' | 'sujood' | 'jalsa' | 'salam' | 'takbir_seated'>;

export interface PrayerPhase {
  pose: Posture;
  ms: number;
  /** Rak'ah (0, 1, ... contando as duas orações juntas) a que a postura pertence; ausente no takbir e no salam. */
  rakah?: number;
  /** Faz parte do fim da oração (o salam e, no estilo shia, os três takbirs sentado). */
  end?: boolean;
}

/** O fim da oração depois do tashahhud: o salam virando a cabeça (sunni) ou o salam sentado e os três takbirs (shia). */
export function endingPhases(style: PrayerStyle): PrayerPhase[] {
  if (style !== 'shia') return [{ pose: 'salam', ms: 2600, end: true }];
  const out: PrayerPhase[] = [{ pose: 'jalsa', ms: 1400, end: true }];
  for (let k = 0; k < 3; k++) out.push({ pose: 'takbir_seated', ms: 700, end: true }, { pose: 'jalsa', ms: k < 2 ? 500 : 900, end: true });
  return out;
}

/** Duração do fim (as fases `end` do final) de uma sequência. */
export function endingMs(seq: readonly PrayerPhase[]): number {
  let t = 0;
  for (let i = seq.length - 1; i >= 0 && seq[i].end; i--) t += seq[i].ms;
  return t;
}

/** O jeito de rezar de uma sequência (pelas posturas: em pé de mãos ao lado, qunoot, takbir sentado = shia). */
export function styleOf(seq: readonly PrayerPhase[]): PrayerStyle {
  return seq.some((p) => p.pose === 'sadl' || p.pose === 'qunoot' || p.pose === 'takbir_seated') ? 'shia' : 'sunni';
}

/** Rak'ahs das obrigatórias: Fajr 2, Dhuhr 4, Asr 4, Maghrib 3, Isha 4. */
export const RAKAHS: Readonly<Record<PrayerName, number>> = { fajr: 2, dhuhr: 4, asr: 4, maghrib: 3, isha: 4 };

/** As orações rezadas num chamado: no estilo shia com `combine`, Dhuhr traz o Asr e Maghrib traz o Isha. */
export function prayersFor(name: PrayerName, style: PrayerStyle, combine: boolean): PrayerName[] {
  if (style === 'shia' && combine) {
    if (name === 'dhuhr') return ['dhuhr', 'asr'];
    if (name === 'maghrib') return ['maghrib', 'isha'];
  }
  return [name];
}

/** O Asr e o Isha não chamam de novo quando já vieram juntos com o Dhuhr e o Maghrib. */
export function skipCall(name: PrayerName, style: PrayerStyle, combine: boolean): boolean {
  return style === 'shia' && combine && (name === 'asr' || name === 'isha');
}

/** Em pé recitando: mãos cruzadas (sunni) ou ao lado do corpo (shia). */
export function standing(style: PrayerStyle): Posture {
  return style === 'shia' ? 'sadl' : 'qiyam';
}

const jitter = (rng: () => number, ms: number, k = 0.15) => Math.round(ms * (1 - k + rng() * 2 * k));

/** As rak'ahs de uma oração (sem o takbir de abertura nem o salam), a partir da rak'ah `first`. */
function rakahPhases(rng: () => number, rakahs: number, style: PrayerStyle, first: number, recite = true): PrayerPhase[] {
  const out: PrayerPhase[] = [];
  const up = standing(style);
  for (let r = 0; r < rakahs; r++) {
    const k = first + r;
    // a 1ª e a 2ª rak'ahs têm a recitação longa; a 3ª e a 4ª, curta
    out.push({ pose: up, ms: jitter(rng, !recite ? 3200 : r === 0 ? 6500 : r === 1 ? 5000 : 3200), rakah: k });
    // estilo shia: qunoot na 2ª rak'ah, depois da recitação e antes do ruku
    if (style === 'shia' && r === 1) out.push({ pose: 'qunoot', ms: jitter(rng, 3200), rakah: k });
    out.push(
      { pose: 'ruku', ms: jitter(rng, 2600), rakah: k },
      { pose: up, ms: jitter(rng, 1300), rakah: k },
      { pose: 'sujood', ms: jitter(rng, 2600), rakah: k },
      { pose: 'jalsa', ms: jitter(rng, 1500), rakah: k },
      { pose: 'sujood', ms: jitter(rng, 2600), rakah: k },
    );
    // tashahhud do meio (depois da 2ª, em orações de 3 ou 4) e o final
    if (r === rakahs - 1) out.push({ pose: 'jalsa', ms: jitter(rng, 5500), rakah: k });
    else if (r === 1) out.push({ pose: 'jalsa', ms: jitter(rng, 3500), rakah: k });
  }
  return out;
}

/** Uma oração completa: takbir, `rakahs` rak'ahs (2 no nafl) com o tashahhud e o salam. */
export function prayerSequence(rng: () => number, rakahs = 2, style: PrayerStyle = 'sunni'): PrayerPhase[] {
  return [{ pose: 'takbir', ms: jitter(rng, 1100) }, ...rakahPhases(rng, rakahs, style, 0), ...endingPhases(style)];
}

/** Uma ou duas orações seguidas (juntas): cada uma com o seu takbir e o seu salam; as rak'ahs contam direto. */
export function sessionSequence(rng: () => number, rakahs: readonly number[], style: PrayerStyle): PrayerPhase[] {
  const out: PrayerPhase[] = [];
  let first = 0;
  rakahs.forEach((n, i) => {
    // entre as duas: um instante sentado e de pé de novo para o takbir da segunda
    if (i > 0) out.push({ pose: 'jalsa', ms: jitter(rng, 1800) });
    out.push({ pose: 'takbir', ms: jitter(rng, 1100) }, ...rakahPhases(rng, n, style, first), ...endingPhases(style));
    first += n;
  });
  return out;
}

/** O que quem chegou atrasado completa sozinho depois do salam do imam: as rak'ahs perdidas, o tashahhud e o salam. */
export function makeupSequence(rng: () => number, missed: number, style: PrayerStyle): PrayerPhase[] {
  if (missed <= 0) return [];
  return [...rakahPhases(rng, missed, style, 0, false), ...endingPhases(style)];
}

export function sequenceMs(seq: readonly PrayerPhase[]): number {
  let t = 0;
  for (const p of seq) t += p.ms;
  return t;
}

/** Postura no instante `t` (ms desde o início); null depois do fim. */
export function phaseAt(seq: readonly PrayerPhase[], t: number): { i: number; phase: PrayerPhase; left: number } | null {
  let acc = 0;
  for (let i = 0; i < seq.length; i++) {
    acc += seq[i].ms;
    if (t < acc) return { i, phase: seq[i], left: acc - t };
  }
  return null;
}

/**
 * Rak'ahs perdidas por quem entrou na oração no instante `t` da sequência do imam: as que já tinham passado do ruku
 * (pega a rak'ah quem chega até o fim do ruku dela).
 */
export function missedRakahs(seq: readonly PrayerPhase[], t: number): number {
  let acc = 0;
  const lost = new Set<number>();
  for (const p of seq) {
    acc += p.ms;
    if (p.pose === 'ruku' && p.rakah !== undefined && acc <= t) lost.add(p.rakah);
  }
  return lost.size;
}

const isUp = (p: Posture) => p === 'takbir' || p === 'qiyam' || p === 'sadl' || p === 'qunoot' || p === 'ruku';

/**
 * Chegou trabalho no meio da oração: termina depressa, sem pular o essencial. A postura atual vai até no
 * máximo 0,6 s; quem está em pé ou curvado desce em sujood; depois o tashahhud curto e o salam. Retorna a
 * sequência que começa AGORA (tempos relativos ao instante `t` da sequência antiga).
 */
export function hurrySequence(seq: readonly PrayerPhase[], t: number, style: PrayerStyle = styleOf(seq)): PrayerPhase[] {
  const at = phaseAt(seq, t);
  if (!at) return [];
  const cur = at.phase.pose;
  const out: PrayerPhase[] = [{ pose: cur, ms: Math.min(at.left, 600) }];
  if (at.phase.end) {
    // já no fim: termina o que falta dele (o salam, ou os takbirs) sem pular nada
    out[0] = { ...at.phase, ms: Math.min(at.left, 1300) };
    for (let i = at.i + 1; i < seq.length && seq[i].end; i++) out.push({ ...seq[i] });
    return out;
  }
  if (isUp(cur)) out.push({ pose: 'sujood', ms: 1000 });
  if (cur !== 'jalsa') out.push({ pose: 'jalsa', ms: 1200 });
  else out[0].ms = Math.min(at.left, 1200);
  out.push(...endingPhases(style));
  return out;
}

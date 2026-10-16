// Oração voluntária (nafl) na mesquita do campus. Parte do pessoal (fixo pela semente, ~35%, homens e mulheres)
// às vezes vai rezar no tempo livre — nunca trabalhando nem precisando do usuário:
//   entrada da própria ala -> tira os sapatos na sapateira -> ablução (wudu) no banquinho da torneira ->
//   topi (homens) ou hijab do cabideiro (mulheres) -> lugar livre num saf -> 2 rak'ahs -> salam ->
//   devolve o topi/hijab -> calça os sapatos -> volta para a mesa.
// Durante a oração ninguém interrompe; se chega trabalho de verdade, a pessoa termina depressa (senta, salam)
// e sai, devolvendo o que pegou. As peças (topi, hijab, pés descalços) são camadas de desenho (sim/wear.ts).
import { hash32 } from '../../../../shared/hash';
import type { Pose } from '../../art/api';
import { hijabColor } from '../../art/character/prayer';
import { sectionArea, sectionOf, type MosqueSection } from '../layout/mosque';
import type { SpotDef, SpotKind } from '../layout/types';
import type { Character } from './character';
import type { Sim } from './sim';
import type { Step } from './steps';
import { prayerHeadwear, putOn, shoesOff, takeOff } from './wear';

/** Postura da oração (as poses da arte). */
export type Posture = Extract<Pose, 'takbir' | 'qiyam' | 'ruku' | 'sujood' | 'jalsa' | 'salam'>;

export interface PrayerPhase {
  pose: Posture;
  ms: number;
}

/** Visita em andamento: o que a pessoa está usando e precisa devolver na saída. */
export interface PrayerVisit {
  section: MosqueSection;
  /** Sapatos na sapateira (pés descalços). */
  shoesOff: boolean;
  /** Com o topi/hijab da mesquita. */
  covered: boolean;
}

/** Fração do pessoal que reza nafl no tempo livre (fixo pela semente). */
export const PRAYER_SHARE = 0.35;
/** Intervalo entre duas idas à mesquita da mesma pessoa (ms). */
export const PRAYER_COOLDOWN_MS: readonly [number, number] = [8 * 60_000, 16 * 60_000];
/** Camadas de roupa usadas na visita. */
export const WEAR_SHOES = 'mesquita:sapatos';
export const WEAR_HEAD = 'mesquita:cabeca';

/** Esta pessoa reza no tempo livre? Determinístico pela semente (não gasta sorteios do comportamento). */
export function prays(seed: number): boolean {
  return (hash32(`nafl:${seed}`) % 1000) / 1000 < PRAYER_SHARE;
}

const jitter = (rng: () => number, ms: number, k = 0.15) => Math.round(ms * (1 - k + rng() * 2 * k));

/**
 * Sequência de posturas de `rakahs` rak'ahs (2 no nafl): takbir, qiyam (recitação), ruku, qawmah (em pé de novo),
 * sujood, jalsa, sujood; no fim, tashahhud sentado e o salam (direita e esquerda). Tempos encurtados, mas no
 * ritmo calmo de quem reza.
 */
export function prayerSequence(rng: () => number, rakahs = 2): PrayerPhase[] {
  const seq: PrayerPhase[] = [{ pose: 'takbir', ms: jitter(rng, 1100) }];
  for (let r = 0; r < rakahs; r++) {
    seq.push(
      { pose: 'qiyam', ms: jitter(rng, r === 0 ? 6500 : 5000) },
      { pose: 'ruku', ms: jitter(rng, 2600) },
      { pose: 'qiyam', ms: jitter(rng, 1300) },
      { pose: 'sujood', ms: jitter(rng, 2600) },
      { pose: 'jalsa', ms: jitter(rng, 1500) },
      { pose: 'sujood', ms: jitter(rng, 2600) },
    );
    // depois da 2ª rak'ah (e da última): tashahhud sentado
    if (r % 2 === 1 || r === rakahs - 1) seq.push({ pose: 'jalsa', ms: jitter(rng, r === rakahs - 1 ? 5500 : 3500) });
  }
  // salam: a pose tem dois quadros (cabeça à direita, depois à esquerda) de 1,3 s cada
  seq.push({ pose: 'salam', ms: 2600 });
  return seq;
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
 * Chegou trabalho no meio da oração: termina depressa, sem pular o essencial. A postura atual vai até no
 * máximo 0,6 s; quem está em pé ou curvado desce em sujood; depois o tashahhud curto e o salam. Retorna a
 * sequência que começa AGORA (tempos relativos ao instante `t` da sequência antiga).
 */
export function hurrySequence(seq: readonly PrayerPhase[], t: number): PrayerPhase[] {
  const at = phaseAt(seq, t);
  if (!at) return [];
  const cur = at.phase.pose;
  const out: PrayerPhase[] = [{ pose: cur, ms: Math.min(at.left, 600) }];
  if (cur === 'salam') {
    out[0].ms = Math.min(at.left, 1300);
    return out;
  }
  if (cur === 'takbir' || cur === 'qiyam' || cur === 'ruku') out.push({ pose: 'sujood', ms: 1000 });
  if (cur !== 'jalsa') out.push({ pose: 'jalsa', ms: 1200 });
  else out[0].ms = Math.min(at.left, 1200);
  out.push({ pose: 'salam', ms: 2600 });
  return out;
}

// =================================================================== passo de oração

/** Passo da fila: reza a sequência no lugar (não interrompível; chegando trabalho, abrevia). */
export type PrayStep = { t: 'pray'; seq: PrayerPhase[]; hurried?: boolean; base?: number };

/** Precisa sair (trabalho, usuário, ir embora)? */
function calledAway(ch: Character): boolean {
  return ch.replan || ch.mode !== 'idle' || ch.leaving;
}

/** Executa o passo 'pray' (sempre virado para a qibla, a oeste). `elapsed` = ms desde o início do passo. */
export function stepPray(ch: Character, s: PrayStep, elapsed: number): boolean {
  if (!s.hurried && calledAway(ch)) {
    s.seq = hurrySequence(s.seq, elapsed - (s.base ?? 0));
    s.base = elapsed;
    s.hurried = true;
  }
  const at = phaseAt(s.seq, elapsed - (s.base ?? 0));
  ch.dir = 'left';
  if (!at) {
    ch.setPose('stand');
    return true;
  }
  ch.setPose(at.phase.pose);
  return false;
}

// =================================================================== planejamento

const nextAt = new WeakMap<Character, number>();

function cooldown(ch: Character): number {
  const [a, b] = PRAYER_COOLDOWN_MS;
  return a + ch.rng() * (b - a);
}

/** Vai rezar agora? Só quem reza (pela semente), ocioso, fora do intervalo desde a última ida. */
export function wantsToPray(ch: Character, now: number): boolean {
  if (ch.mode !== 'idle' || ch.prayer || !prays(ch.info.seed)) return false;
  let at = nextAt.get(ch);
  if (at === undefined) {
    // a primeira ida pode vir logo (meio intervalo, sorteado)
    at = now + cooldown(ch) * 0.25 * ch.rng();
    nextAt.set(ch, at);
  }
  if (now < at) return false;
  if (ch.rng() >= 0.6) {
    nextAt.set(ch, now + 60_000);
    return false;
  }
  return true;
}

function spotsOf(sim: Sim, kind: SpotKind, group: string): SpotDef[] {
  return sim.spots.ofKind(kind).filter((s) => s.group?.startsWith(group));
}

/** Ponto de uso rápido (sapateira, topis/hijabs) que ninguém ocupa agora (sem reserva: o uso dura segundos). */
function quickSpot(sim: Sim, ch: Character, kind: 'shoes' | 'headwear', section: MosqueSection): SpotDef | null {
  const all = spotsOf(sim, kind, `${kind}:${section}`);
  if (!all.length) return null;
  const busy = sim.busyTiles(ch.id);
  const free = all.filter((s) => !busy.has(sim.building.grid.key(s.tx, s.ty)));
  const pool = free.length ? free : all;
  return pool[Math.floor(ch.rng() * pool.length)];
}

/** Lugar na fila: o de menor `rank` livre (frente para trás, meio para as pontas). */
export function pickPrayerSpot(spots: readonly SpotDef[], isFree: (id: string) => boolean): SpotDef | null {
  let best: SpotDef | null = null;
  for (const s of spots) if (s.kind === 'prayer' && isFree(s.id) && (!best || (s.rank ?? 0) < (best.rank ?? 0))) best = s;
  return best;
}

/**
 * Tile livre perto dos banquinhos da ablução para esperar a vez (chamado para a oração: mais gente que torneiras).
 * `taken` guarda os tiles já escolhidos nesta leva, para cada um esperar no seu.
 */
function queueTile(sim: Sim, ch: Character, stool: SpotDef, taken: Set<number>): { x: number; y: number } | null {
  const grid = sim.building.grid;
  const busy = sim.busyTiles(ch.id);
  const stools = new Set(sim.spots.ofKind('wudu').map((s) => grid.key(s.tx, s.ty)));
  const r = sim.building.areas.find((a) => a.id === stool.areaId)?.rect;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = stool.tx + dx;
      const y = stool.ty + dy;
      const k = grid.key(x, y);
      if (grid.get(x, y) !== 1 || busy.has(k) || taken.has(k) || stools.has(k)) continue;
      if (r && (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h)) continue;
      const d = Math.abs(dx) + Math.abs(dy) * 1.2;
      if (d >= 2 && d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  if (best) taken.add(grid.key(best.x, best.y));
  return best;
}

/**
 * Monta a ida à mesquita (retorna false se a mesquita não existe ou a ala está lotada). Com `queue` (chamado para a
 * oração), sem torneira livre a pessoa espera a vez perto da ablução em vez de desistir.
 */
export function planPrayerVisit(sim: Sim, ch: Character, now: number, opts: { queue?: Set<number> } = {}): boolean {
  if (!sim.building.campus?.mosque) return false;
  const section = sectionOf(ch.appearance.look);
  const area = sectionArea(section);
  const free = (id: string) => sim.spots.isFree(id, ch.id);
  const place = pickPrayerSpot(sim.spots.ofKind('prayer').filter((s) => s.areaId === area), free);
  const stools = sim.spots.ofKind('wudu').filter((s) => s.areaId === area);
  let stool = stools.find((s) => free(s.id) && ch.rng() < 0.7) ?? stools.find((s) => free(s.id));
  // chamado para a oração: torneiras ocupadas, espera a vez numa delas
  let wait: { x: number; y: number } | null = null;
  if (!stool && opts.queue && stools.length) {
    stool = stools[Math.floor(ch.rng() * stools.length) % stools.length];
    wait = queueTile(sim, ch, stool, opts.queue);
  }
  const shoes = quickSpot(sim, ch, 'shoes', section);
  const head = quickSpot(sim, ch, 'headwear', section);
  if (!place || !stool || !shoes || !head) return false;
  if (!sim.reserveTemp(ch, place)) return false;
  const queued = !free(stool.id);
  if (!queued && !sim.reserveTemp(ch, stool)) {
    sim.releaseTemp(ch);
    return false;
  }
  const tap = stool;
  const visit: PrayerVisit = { section, shoesOff: false, covered: false };
  ch.prayer = visit;
  nextAt.set(ch, now + cooldown(ch));
  const rng = ch.rng;
  const steps: Step[] = [];
  if (ch.atSpot) steps.push({ t: 'exit' });
  steps.push(
    // tira os sapatos e deixa na sapateira
    { t: 'go', tx: shoes.tx, ty: shoes.ty, fx: shoes.x, fy: shoes.y, dir: shoes.dir },
    { t: 'act', pose: 'use', ms: jitter(rng, 1500), dir: shoes.dir },
    { t: 'do', fn: () => takeOffShoes(ch, visit) },
  );
  if (queued) {
    // na fila da ablução: espera em pé perto das torneiras até a sua vagar
    if (wait) steps.push({ t: 'go', tx: wait.x, ty: wait.y, dir: 'left' });
    // a condição já reserva a torneira (dois na fila nunca sentam na mesma)
    steps.push({ t: 'until', cond: () => sim.spots.ownerOf(tap.id) === ch.id || sim.reserveTemp(ch, tap), minMs: 400, maxMs: 120_000, pose: 'stand' });
  }
  steps.push(
    // ablução
    { t: 'go', tx: tap.tx, ty: tap.ty },
    { t: 'enter', spot: tap.id },
    { t: 'act', pose: 'wudu', ms: jitter(rng, 8000), seated: true },
    { t: 'exit' },
    { t: 'do', fn: () => sim.spots.release(tap.id, ch.id) },
    // topi (homens) ou hijab do cabideiro (mulheres)
    { t: 'go', tx: head.tx, ty: head.ty, fx: head.x, fy: head.y, dir: head.dir },
    { t: 'act', pose: 'use', ms: jitter(rng, section === 'f' ? 1800 : 1100), dir: head.dir },
    { t: 'do', fn: () => cover(ch, visit) },
    // reza no lugar da fila, virado para a qibla
    { t: 'go', tx: place.tx, ty: place.ty, fx: place.x, fy: place.y, dir: 'left' },
    { t: 'act', pose: 'stand', ms: jitter(rng, 700), dir: 'left' },
    { t: 'pray', seq: prayerSequence(rng) },
    { t: 'do', fn: () => sim.spots.release(place.id, ch.id) },
  );
  // a saída já vai planejada: devolve o topi/hijab e calça os sapatos (os passos 'do' acima os tiram)
  steps.push(...exitSteps(sim, ch, visit, { covered: true, shoesOff: true }, false));
  ch.queue.push(...steps);
  sim.pushHome(ch, 'none');
  return true;
}

/** Devolve o topi/hijab e calça os sapatos (o fim normal da visita e a saída às pressas). */
function exitSteps(sim: Sim, ch: Character, visit: PrayerVisit, wearing: { covered: boolean; shoesOff: boolean }, hurry: boolean): Step[] {
  const steps: Step[] = [];
  const run = hurry && (ch.mode === 'wait' || ch.mode === 'work');
  if (wearing.covered) {
    const head = quickSpot(sim, ch, 'headwear', visit.section);
    if (head) steps.push({ t: 'go', tx: head.tx, ty: head.ty, fx: head.x, fy: head.y, dir: head.dir, run }, { t: 'act', pose: 'use', ms: hurry ? 500 : jitter(ch.rng, 1100), dir: head.dir });
    steps.push({ t: 'do', fn: () => uncover(ch, visit) });
  }
  if (wearing.shoesOff) {
    const shoes = quickSpot(sim, ch, 'shoes', visit.section);
    if (shoes) steps.push({ t: 'go', tx: shoes.tx, ty: shoes.ty, fx: shoes.x, fy: shoes.y, dir: shoes.dir, run }, { t: 'act', pose: 'use', ms: hurry ? 700 : jitter(ch.rng, 1800), dir: shoes.dir });
    steps.push({ t: 'do', fn: () => putShoesOn(ch, visit) });
  }
  steps.push({ t: 'do', fn: () => endVisit(ch) });
  return steps;
}

/**
 * A fila de uma visita foi descartada (trabalho chegou, a pessoa vai embora...): planeja só a saída — devolver o
 * que pegou e calçar os sapatos — antes do planejador seguir com o modo novo. Sem mesquita, devolve na hora.
 */
export function planPrayerExit(sim: Sim, ch: Character): boolean {
  const visit = ch.prayer;
  if (!visit) return false;
  if (!sim.building.campus?.mosque || (!visit.covered && !visit.shoesOff)) {
    resetPrayer(ch);
    return false;
  }
  if (ch.atSpot) ch.queue.push({ t: 'exit' });
  ch.queue.push(...exitSteps(sim, ch, visit, visit, true));
  return true;
}

function takeOffShoes(ch: Character, visit: PrayerVisit): void {
  putOn(ch, WEAR_SHOES, shoesOff(ch.appearance));
  visit.shoesOff = true;
}

function putShoesOn(ch: Character, visit: PrayerVisit): void {
  takeOff(ch, WEAR_SHOES);
  visit.shoesOff = false;
}

function cover(ch: Character, visit: PrayerVisit): void {
  putOn(ch, WEAR_HEAD, prayerHeadwear(sectionOf(ch.appearance.look), hijabColor(ch.info.seed)));
  visit.covered = true;
}

function uncover(ch: Character, visit: PrayerVisit): void {
  takeOff(ch, WEAR_HEAD);
  visit.covered = false;
}

function endVisit(ch: Character): void {
  ch.prayer = null;
}

/** Encerra a visita na hora (aba oculta, mesquita sumiu): tira as camadas da mesquita. */
export function resetPrayer(ch: Character): void {
  takeOff(ch, WEAR_SHOES);
  takeOff(ch, WEAR_HEAD);
  ch.prayer = null;
}

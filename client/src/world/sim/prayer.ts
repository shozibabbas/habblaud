// Oração voluntária (nafl) na mesquita do campus. Parte do pessoal (fixo pela semente, ~35%, homens e mulheres)
// às vezes vai rezar no tempo livre — nunca trabalhando nem precisando do usuário:
//   entrada da própria ala -> tira os sapatos na sapateira -> ablução (wudu) no banquinho da torneira ->
//   topi (homens) ou hijab do cabideiro (mulheres) -> lugar livre num saf -> 2 rak'ahs -> salam ->
//   devolve o topi/hijab -> calça os sapatos -> volta para a mesa.
// Durante a oração ninguém interrompe; se chega trabalho de verdade, a pessoa termina depressa (senta, salam)
// e sai, devolvendo o que pegou. As peças (topi, hijab, pés descalços) são camadas de desenho (sim/wear.ts).
import { hash32 } from '../../../../shared/hash';
import { hijabColor } from '../../art/character/prayer';
import { sectionArea, sectionOf, type MosqueSection } from '../layout/mosque';
import type { SpotDef, SpotKind } from '../layout/types';
import type { Character } from './character';
import type { Sim } from './sim';
import type { Step } from './steps';
import { prayerHeadwear, putOn, shoesOff, takeOff } from './wear';
import { followPose, joinable, jamaatOf, majlisOver, prayerOver, setTurbah, START_WAIT_MS, turbahSpot, type Follow } from './jamaat';
import { hurrySequence, phaseAt, prayerSequence, RAKAHS, sessionSequence, standing, type PrayerPhase, type Posture } from './salat';

// sequências e o jeito de rezar: sim/salat.ts (reexportados aqui)
export { hurrySequence, phaseAt, prayerSequence, sequenceMs, type PrayerPhase, type Posture } from './salat';

/** Visita em andamento: o que a pessoa está usando e precisa devolver na saída. */
export interface PrayerVisit {
  section: MosqueSection;
  /** Sapatos na sapateira (pés descalços). */
  shoesOff: boolean;
  /** Com o topi/hijab da mesquita (e, no estilo shia, a turbah). */
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

// =================================================================== passo de oração

/**
 * Passo da fila: reza no lugar (não interrompível; chegando trabalho, abrevia). Com `follow`, acompanha a congregação
 * (sim/jamaat.ts): as posturas vêm da linha do tempo do imam; sem ela, da própria sequência `seq`.
 */
export type PrayStep = { t: 'pray'; seq: PrayerPhase[]; hurried?: boolean; base?: number; follow?: Follow };

/** Precisa sair (trabalho, usuário, ir embora)? */
function calledAway(ch: Character): boolean {
  return ch.replan || ch.mode !== 'idle' || ch.leaving;
}

/** Executa o passo 'pray' (sempre virado para a qibla, a oeste). `elapsed` = ms desde o início do passo. */
export function stepPray(ch: Character, s: PrayStep, elapsed: number, now = elapsed): boolean {
  ch.dir = 'left';
  const f = s.follow;
  if (f) {
    const j = f.j;
    // sai da congregação e segue sozinho com `seq` a partir de agora
    const solo = (seq: PrayerPhase[]) => {
      s.follow = undefined;
      s.base = elapsed;
      s.seq = seq;
    };
    const whole = () => sessionSequence(ch.rng, j.prayers.map((p) => RAKAHS[p]), j.style);
    if (!s.hurried && calledAway(ch) && !f.lead) {
      // chamado no meio: termina depressa a partir da postura em que está
      solo(hurrySequence([{ pose: (ch.pose as Posture) ?? standing(j.style), ms: 600 }], 0));
      s.hurried = true;
    } else if (j.startAt === null && now - j.calledAt > START_WAIT_MS * 1.5) {
      // a congregação não começou (ninguém para puxar): reza sozinho
      solo(whole());
    } else if (f.joinedAt === undefined && j.startAt !== null && prayerOver(j, now)) {
      // chegou depois do fim: reza a oração inteira sozinho
      solo(whole());
    } else {
      const pose = followPose(f, now, ch.rng);
      if (pose === null) {
        ch.setPose('stand');
        return true;
      }
      ch.setPose(pose);
      return false;
    }
  }
  if (!s.hurried && calledAway(ch)) {
    s.seq = hurrySequence(s.seq, elapsed - (s.base ?? 0));
    s.base = elapsed;
    s.hurried = true;
  }
  const at = phaseAt(s.seq, elapsed - (s.base ?? 0));
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

/**
 * Lugar na fila: o de menor `rank` livre (frente para trás, meio para as pontas; sozinho, uma fileira sim, outra não).
 * Em congregação (`tight`), ombro a ombro: a fila da frente enche inteira antes da próxima.
 */
export function pickPrayerSpot(spots: readonly SpotDef[], isFree: (id: string) => boolean, tight = false): SpotDef | null {
  const rank = (s: SpotDef) => {
    const r = s.rank ?? 0;
    return tight ? Math.floor(r / 100) * 100 + (r % 50) : r;
  };
  let best: SpotDef | null = null;
  for (const s of spots) if (s.kind === 'prayer' && isFree(s.id) && (!best || rank(s) < rank(best))) best = s;
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
  // há uma congregação na ala (chamado para a oração): entra nela, nas filas da frente
  const cur = jamaatOf(sim, section);
  const j = joinable(cur, now) ? cur : undefined;
  const style = sim.mosque.style;
  const place = pickPrayerSpot(sim.spots.ofKind('prayer').filter((s) => s.areaId === area), free, !!j);
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
  if (j) j.members.add(ch.id);
  const turbah = style === 'shia';
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
    // topi (homens) ou hijab do cabideiro (mulheres); no estilo shia, também uma turbah da caixinha ao lado
    { t: 'go', tx: head.tx, ty: head.ty, fx: head.x, fy: head.y, dir: head.dir },
    { t: 'act', pose: 'use', ms: jitter(rng, (section === 'f' ? 1800 : 1100) + (turbah ? 900 : 0)), dir: head.dir },
    { t: 'do', fn: () => cover(ch, visit) },
    // reza no lugar da fila, virado para a qibla (a turbah no carpete, onde a testa encosta)
    { t: 'go', tx: place.tx, ty: place.ty, fx: place.x, fy: place.y, dir: 'left' },
    { t: 'do', fn: () => turbah && setTurbah(sim, ch, turbahSpot(place.x, place.y)) },
    { t: 'act', pose: 'stand', ms: jitter(rng, 700), dir: 'left' },
    j ? { t: 'pray', seq: [], follow: { j } } : { t: 'pray', seq: prayerSequence(rng, 2, style) },
  );
  // depois da congregação, o majlis: quem rezou fica sentado ouvindo, na sua fileira
  if (j) steps.push({ t: 'until', cond: () => majlisOver(sim, section, sim.now), minMs: 1500, maxMs: 60_000, pose: 'jalsa', dir: 'left' });
  steps.push(
    { t: 'do', fn: () => setTurbah(sim, ch, null) },
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
  const steps: Step[] = [{ t: 'do', fn: () => setTurbah(sim, ch, null) }];
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

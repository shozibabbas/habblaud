// Recreação do campus na simulação (layout/recreation.ts): a soneca nas cápsulas da sala de descanso e o cigarro na
// área de fumantes.
// - Quem está ocioso há muito tempo (behavior.isLongIdle) não cochila mais na mesa: anda até uma cápsula livre,
//   entra, o visor fecha e dorme ("Zzz" sobre a cápsula). Acorda quando o trabalho chama (sai e volta correndo) ou
//   depois de alguns minutos (espreguiça e volta para a mesa). Sem cápsula livre (ou fora do campus), cochila na mesa.
// - Quem tem o traço "Cigarro" (social/persona.ts) às vezes passa o intervalo na área de fumantes, em pé junto a um
//   cinzeiro ou sentado no abrigo, dando tragadas. Dois fumantes juntos viram uma roda ('smoke', social/social.ts).
import { FOOT_DX, FOOT_DY, TILE, WALK_SPEED } from '../constants';
import type { SpotDef } from '../layout/types';
import { hasTrait, personaFor } from '../social/persona';
import type { Character } from './character';
import type { Sim } from './sim';
import type { Step } from './steps';
import { tr } from '../../../../shared/i18n';

/** Quanto dura uma soneca na cápsula (ms) e quanto espera, de volta à mesa, até a próxima. */
export const NAP_MS: readonly [number, number] = [4 * 60_000, 9 * 60_000];
export const NAP_AGAIN_MS: readonly [number, number] = [90_000, 4 * 60_000];
/** Chance de um passeio de fumante ser o cigarro. */
export const SMOKE_OUTING_CHANCE = 0.4;

function between(rng: () => number, [a, b]: readonly [number, number]): number {
  return a + rng() * (b - a);
}

/** Próxima soneca permitida de cada personagem (ms epoch). */
const nextNap = new WeakMap<Character, number>();

export function isSmoker(ch: Character): boolean {
  return hasTrait(personaFor(ch.info.seed), 'fumo');
}

/** Cápsula livre para `ch` (a mais perto, com um pouco de acaso), ou null. */
export function freePod(sim: Sim, ch: Character): SpotDef | null {
  return sim.spots.findFree('pod', { near: { tx: ch.tx, ty: ch.ty }, by: ch.id, rng: ch.rng });
}

/**
 * Ocioso há muito tempo, na mesa: vai dormir numa cápsula (campus). Retorna true se planejou. A volta é o caminho de
 * sempre (pushHome); se o trabalho chamar no meio, o passo 'pod' acorda e o planejador leva de volta à mesa.
 */
export function planNap(sim: Sim, ch: Character, now: number, force = false): boolean {
  if (!sim.machines || ch.gathering || (!force && (nextNap.get(ch) ?? 0) > now)) return false;
  const pod = freePod(sim, ch);
  if (!pod || !sim.reserveTemp(ch, pod)) return false;
  const rng = ch.rng;
  const steps: Step[] = [];
  if (ch.atSpot) steps.push({ t: 'exit' });
  steps.push(
    { t: 'act', pose: 'stretch', ms: 1_300 },
    { t: 'go', tx: pod.tx, ty: pod.ty },
    { t: 'pod', spot: pod.id, ms: between(rng, NAP_MS), phase: 0 },
    // acordou sozinho: espreguiça na frente da cápsula e só volta a pensar em dormir daqui a pouco
    { t: 'do', fn: () => nextNap.set(ch, sim.now + between(rng, NAP_AGAIN_MS)) },
    { t: 'act', pose: 'stretch', ms: 2_000 },
  );
  ch.queue.push(...steps);
  sim.pushHome(ch, 'none');
  return true;
}

/**
 * Passo 'pod': entra pela abertura (some), dorme com o visor fechado até a hora ou até ser chamado, e sai de volta
 * para o tile da frente. Não é interrompível no meio (como a cabine do banheiro): um replanejamento acorda.
 */
export function stepPod(sim: Sim, ch: Character, s: Extract<Step, { t: 'pod' }>, dt: number, now: number): boolean {
  const spot = sim.spots.get(s.spot);
  if (!spot) {
    wakeUp(sim, ch, s.spot);
    return true;
  }
  const furn = spot.furnitureId ?? spot.id;
  if (s.phase === 0) {
    // chega à abertura, sobe e some lá dentro
    ch.dir = 'up';
    ch.setPose('walk');
    if (moveTo(ch, spot.x, spot.y, WALK_SPEED * 0.6 * dt)) ch.alpha = Math.max(0, ch.alpha - dt * 3.5);
    if (ch.alpha <= 0 || ch.replan || ch.mode !== 'idle') {
      ch.inside = true;
      ch.alpha = 0;
      sim.podBusy.add(furn);
      s.phase = 1;
      s.until = now + s.ms;
      if (ch.icon === 'zzz') ch.setIcon(null, 0, now);
    }
    return false;
  }
  if (s.phase === 1) {
    ch.setPose('sleep');
    if (now >= (s.until ?? 0) || ch.replan || ch.leaving || ch.mode !== 'idle') {
      s.phase = 2;
      sim.podBusy.delete(furn);
      ch.inside = false;
      ch.dir = 'down';
      // acordado pelo trabalho: bocejo e pressa
      if (ch.mode !== 'idle') {
        ch.chatEmoji = '🥱';
        ch.chatUntil = now + 1_300;
      }
    }
    return false;
  }
  // sai da cápsula de volta ao tile da frente
  ch.alpha = Math.min(1, ch.alpha + dt * 4);
  ch.dir = 'down';
  ch.setPose('walk');
  if (!moveTo(ch, spot.tx * TILE + FOOT_DX, spot.ty * TILE + FOOT_DY, WALK_SPEED * 0.8 * dt)) return false;
  ch.alpha = 1;
  ch.tx = spot.tx;
  ch.ty = spot.ty;
  ch.setPose('stand');
  return true;
}

/** Aba oculta, cápsula que sumiu: acorda na hora, em pé na frente da cápsula. */
export function wakeUp(sim: Sim, ch: Character, spotId: string): void {
  const spot = sim.spots.get(spotId);
  if (spot) {
    sim.podBusy.delete(spot.furnitureId ?? spot.id);
    ch.placeAtTile(spot.tx, spot.ty);
  }
  ch.inside = false;
  ch.alpha = 1;
}

function moveTo(ch: Character, x: number, y: number, step: number): boolean {
  const dx = x - ch.x;
  const dy = y - ch.y;
  const d = Math.hypot(dx, dy);
  if (d > step) {
    ch.x += (dx / d) * step;
    ch.y += (dy / d) * step;
    return false;
  }
  ch.x = x;
  ch.y = y;
  return true;
}

/**
 * Intervalo do fumante, sozinho: um lugar livre na área de fumantes (de preferência em pé, fora dos pares), três a
 * cinco tragadas e de volta à mesa. Retorna true se planejou.
 */
export function planSmoke(sim: Sim, ch: Character, force = false): boolean {
  if (!sim.machines || (!force && !isSmoker(ch))) return false;
  const rng = ch.rng;
  const s = sim.spots.findFree('smoke', { by: ch.id, rng, filter: (p) => !p.group }) ?? sim.spots.findFree('smoke', { by: ch.id, rng });
  if (!s || !sim.reserveTemp(ch, s)) return false;
  const steps: Step[] = [];
  if (ch.atSpot) steps.push({ t: 'exit' });
  if (s.seated) steps.push({ t: 'go', tx: s.tx, ty: s.ty }, { t: 'enter', spot: s.id });
  else steps.push({ t: 'go', tx: s.tx, ty: s.ty, fx: s.x, fy: s.y, dir: s.dir });
  const rest = s.seated ? 'sit' : 'stand';
  const puffs = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < puffs; i++) {
    steps.push({ t: 'act', pose: rest, held: 'cigarette', ms: 1_800 + rng() * 1_600, icon: i === puffs - 1 && rng() < 0.3 ? 'idea' : undefined });
    // sentado, a tragada é só a pausa (a pose de beber é em pé)
    steps.push({ t: 'act', pose: s.seated ? 'sit' : 'drink', held: 'cigarette', ms: 1_100 });
  }
  if (s.seated) steps.push({ t: 'exit' });
  steps.push({ t: 'do', fn: () => sim.spots.release(s.id, ch.id) });
  ch.queue.push(...steps);
  sim.pushHome(ch, 'none');
  return true;
}

/** O que a interface mostra de quem está na recreação fora de uma roda (dormindo, fumando), ou null. */
export function recreationDoing(sim: Sim, ch: Character): string | null {
  const step = ch.step;
  if (step?.t === 'pod' && step.phase === 1) return tr('💤 Dormindo numa cápsula');
  if (ch.held === 'cigarette' && sim.spots.get(ch.tempSpots.find((id) => sim.spots.get(id)?.kind === 'smoke'))) return tr('🚬 Fumando um cigarro');
  return null;
}

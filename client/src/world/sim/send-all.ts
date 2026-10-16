// "Chamar todo mundo": manda todos os agentes livres para a mesma atividade de uma vez (menu Atividades da barra
// superior). Livre = ocioso ou esperando um shell, sem estar indo embora, chegando, nem no meio de uma oração.
// Quem trabalha ou precisa do usuário fica onde está (conta como "ocupado"). Antes do novo plano, cada um é tirado do
// que fazia (passeio, roda, soneca na cápsula) e sai de onde estiver — não precisa estar na mesa.
//   prayer  chamado para a oração (campus, com a mesquita): todos, homens e mulheres, com sapatos, wudu, topi/hijab
//           e as duas rak'ahs; os safs enchem da frente para trás. Os minaretes brilham por uns segundos (sem som).
//   chai    rodas de chá/café na copa, quantas forem precisas.        tv        a TV do lounge.
//   pingpong todas as mesas (duplas onde dá); quem sobra assiste.       tennis    a quadra (campus).
//   nap     as cápsulas (campus); quem sobra cochila na mesa.           smoke     só fumantes (campus).
//   walk    um passeio pelos caminhos.                                desk      todos de volta à mesa agora.
import type { GatherKind } from '../social/gathering';
import type { TileRect } from '../layout/types';
import { planPrayerVisit } from './prayer';
import { isSmoker, planNap, planSmoke } from './recreation';
import type { Character } from './character';
import type { Sim } from './sim';
import type { Step } from './steps';
import { tr } from '../../../../shared/i18n';

/** Depois de "de volta às mesas", ninguém sai para passear por este tempo. */
export const DESK_HOLD_MS = 2 * 60_000;

export type SendActivity = 'prayer' | 'chai' | 'tv' | 'pingpong' | 'tennis' | 'nap' | 'smoke' | 'walk' | 'desk';

export interface SendActivityInfo {
  id: SendActivity;
  emoji: string;
  label: string;
}

/** Ordem do menu (no campus, o chamado para a oração vem primeiro). */
export const SEND_ACTIVITIES: readonly SendActivityInfo[] = [
  { id: 'prayer', emoji: '🕌', label: tr('Chamado para a oração') },
  { id: 'chai', emoji: '☕', label: tr('Pausa para o chai') },
  { id: 'tv', emoji: '📺', label: tr('TV do lounge') },
  { id: 'pingpong', emoji: '🏓', label: tr('Pingue-pongue') },
  { id: 'tennis', emoji: '🎾', label: tr('Tênis') },
  { id: 'nap', emoji: '😴', label: tr('Soneca nas cápsulas') },
  { id: 'smoke', emoji: '🚬', label: tr('Pausa para o cigarro') },
  { id: 'walk', emoji: '🚶', label: tr('Passeio') },
  { id: 'desk', emoji: '💻', label: tr('De volta às mesas') },
];

export interface SendAllResult {
  activity: SendActivity;
  /** Ids de quem foi mandado (inclui quem já estava lá, ex.: rezando). */
  sent: string[];
  /** Ficaram: trabalhando, precisando do usuário, chegando/saindo, no meio de uma oração. */
  busy: number;
  /** Sem lugar (safs, sofá, mesas, cápsulas e torcida cheios). */
  full: number;
  /** Fumantes só: quem não fuma ficou. */
  nonSmokers: number;
  /** Dos mandados: quem só assiste (mesas e quadra cheias) ou cochila na mesa (cápsulas cheias). */
  extra: number;
  /** Total de quem não foi (busy + full + nonSmokers). */
  skipped: number;
}

/** Atividades possíveis neste escritório (o prédio único não tem mesquita, quadra, cápsulas nem fumantes). */
export function availableActivities(sim: Sim): SendActivityInfo[] {
  const has = (kind: Parameters<Sim['spots']['ofKind']>[0]) => sim.spots.ofKind(kind).length > 0;
  return SEND_ACTIVITIES.filter((a) => {
    switch (a.id) {
      case 'prayer':
        return !!sim.building.campus?.mosque && has('prayer');
      case 'tennis':
        return has('tennis');
      case 'nap':
        return has('pod');
      case 'smoke':
        return has('smoke');
      case 'pingpong':
        return has('pingpong');
      case 'chai':
        return has('cafe_seat');
      case 'tv':
        return has('sofa');
      default:
        return true;
    }
  });
}

/** Situação de cada um diante do chamado. */
export function availability(ch: Character): 'free' | 'busy' | 'praying' {
  if (ch.gone || ch.leaving || ch.arriving || (ch.inside && ch.step?.t !== 'pod')) return 'busy';
  if (ch.mode !== 'idle' && ch.mode !== 'shell') return 'busy';
  if (ch.prayer || ch.step?.t === 'pray') return 'praying';
  // no meio de algo que não dá para largar na hora (cabine, elevador, interruptor)
  const t = ch.step?.t;
  if (t === 'stall' || t === 'elevIn' || t === 'elevOut' || t === 'switch') return 'busy';
  return 'free';
}

function result(activity: SendActivity): SendAllResult {
  return { activity, sent: [], busy: 0, full: 0, nonSmokers: 0, extra: 0, skipped: 0 };
}

/** Manda todos os livres para `activity`. Retorna quem foi e quem ficou (e por quê). */
export function sendAll(sim: Sim, activity: SendActivity, now: number): SendAllResult {
  const r = result(activity);
  if (activity === 'desk') return recallToDesks(sim, r, now);
  const free: Character[] = [];
  for (const ch of sim.chars.values()) {
    const a = availability(ch);
    if (a === 'free') free.push(ch);
    else if (activity === 'prayer' && a === 'praying') r.sent.push(ch.id);
    else r.busy++;
  }
  let go = free;
  if (activity === 'smoke') {
    go = free.filter(isSmoker);
    r.nonSmokers = free.length - go.length;
  }
  // tira cada um do que fazia (passeio, roda, cápsula): o plano novo sai de onde a pessoa está
  for (const ch of go) sim.clearPlan(ch);
  switch (activity) {
    case 'prayer':
      sim.callToPrayerAt = now;
      {
        // mais gente que torneiras: quem chega depois espera a vez da ablução (cada um num tile)
        const queue = new Set<number>();
        for (const ch of go) place(r, ch, planPrayerVisit(sim, ch, now, { queue }));
      }
      break;
    case 'chai':
      groups(sim, r, 'kitchen', go, now, partition(go.length, 2, 4));
      break;
    case 'tv':
      groups(sim, r, 'tv', go, now, go.length >= 2 ? [Math.min(go.length, 5)] : []);
      break;
    case 'pingpong':
    case 'tennis':
      games(sim, r, activity, go, now);
      break;
    case 'nap':
      for (const ch of go) {
        if (planNap(sim, ch, now, true)) r.sent.push(ch.id);
        else {
          deskNap(sim, ch);
          r.sent.push(ch.id);
          r.extra++;
        }
      }
      break;
    case 'smoke':
      smokeBreak(sim, r, go, now);
      break;
    case 'walk':
      for (const ch of go) place(r, ch, planStroll(sim, ch));
      break;
  }
  r.skipped = r.busy + r.full + r.nonSmokers;
  return r;
}

function place(r: SendAllResult, ch: Character, ok: boolean): void {
  if (ok) r.sent.push(ch.id);
  else r.full++;
}

/**
 * Tamanhos dos grupos (entre `min` e `max`) para `n` pessoas: grupos cheios e, no fim, a sobra repartida para ninguém
 * ficar sozinho (5 = 3 + 2). Com menos que `min`, um grupo só do tamanho que der. Puro.
 */
export function partition(n: number, min: number, max: number): number[] {
  if (n <= 0) return [];
  if (n < min) return [n];
  const k = Math.ceil(n / max);
  const out: number[] = [];
  let left = n;
  for (let i = k; i > 0; i--) {
    const size = Math.max(min, Math.ceil(left / i));
    out.push(Math.min(size, left));
    left -= out[out.length - 1];
  }
  return out;
}

/** Rodas (copa, TV): uma por grupo; sem lugar para o grupo inteiro, tenta grupos menores e depois entrar numa aberta. */
function groups(sim: Sim, r: SendAllResult, kind: GatherKind, people: Character[], now: number, sizes: number[]): void {
  const left = [...people];
  for (let size of sizes) {
    let started = false;
    while (!started && size >= 2 && left.length >= 2) {
      const [host, ...rest] = left.slice(0, size);
      started = sim.social.startWith(kind, host, rest, now);
      if (!started) size--;
    }
    if (!started) break;
    for (const ch of left.splice(0, size)) r.sent.push(ch.id);
  }
  for (const ch of left) {
    if (sim.social.joinOpen(kind, ch, now)) r.sent.push(ch.id);
    else if (kind === 'kitchen' && planCoffee(sim, ch)) r.sent.push(ch.id);
    else r.full++;
  }
}

/** Mesas de pingue-pongue / quadra: duplas enquanto houver quatro e uma mesa de quatro livre; quem sobra assiste. */
function games(sim: Sim, r: SendAllResult, kind: 'pingpong' | 'tennis', people: Character[], now: number): void {
  const left = [...people];
  while (left.length >= 2) {
    const host = left[0];
    let n = left.length >= 4 ? 4 : 2;
    const plan = sim.social.plan(kind, n, host);
    if (!plan) break;
    if ((plan.players ?? 2) < n) n = 2;
    if (!sim.social.startWith(kind, host, left.slice(1, n), now)) break;
    for (const ch of left.splice(0, n)) r.sent.push(ch.id);
  }
  for (const ch of left) {
    if (sim.social.joinOpen(kind, ch, now)) {
      r.sent.push(ch.id);
      r.extra++;
    } else r.full++;
  }
}

/** Fumantes: em pares nos cinzeiros enquanto der, o resto sozinho num lugar livre. */
function smokeBreak(sim: Sim, r: SendAllResult, smokers: Character[], now: number): void {
  const left = [...smokers];
  while (left.length >= 2 && sim.social.startWith('smoke', left[0], [left[1]], now)) for (const ch of left.splice(0, 2)) r.sent.push(ch.id);
  for (const ch of left) place(r, ch, planSmoke(sim, ch));
}

/** Café sozinho (sobrou um na pausa para o chai): cafeteira, um gole e de volta. */
function planCoffee(sim: Sim, ch: Character): boolean {
  const s = sim.spots.findFree('coffee', { near: { tx: ch.tx, ty: ch.ty }, by: ch.id, rng: ch.rng });
  if (!s || !sim.reserveTemp(ch, s)) return false;
  const steps: Step[] = [];
  if (ch.atSpot) steps.push({ t: 'exit' });
  steps.push(
    { t: 'go', tx: s.tx, ty: s.ty, fx: s.x, fy: s.y, dir: s.dir },
    { t: 'act', pose: 'use', ms: 1900, machine: s.furnitureId, icon: 'coffee' },
    { t: 'act', pose: 'drink', held: 'coffee', ms: 3000 },
    { t: 'do', fn: () => sim.spots.release(s.id, ch.id) },
  );
  ch.queue.push(...steps);
  sim.pushHome(ch, 'coffee');
  return true;
}

/** Cápsulas cheias: cochila na própria mesa um tempo. */
function deskNap(sim: Sim, ch: Character): void {
  const home = sim.spots.get(ch.homeSpot);
  if (ch.atSpot && ch.atSpot !== ch.homeSpot) ch.queue.push({ t: 'exit' });
  if (home && ch.atSpot !== home.id) ch.queue.push({ t: 'go', tx: home.tx, ty: home.ty }, { t: 'enter', spot: home.id });
  ch.queue.push({ t: 'act', pose: 'sleep', ms: 60_000 + ch.rng() * 60_000, icon: 'zzz', seated: true });
}

/** Onde se passeia: os caminhos do campus (e o calçadão da recreação) ou o corredor do prédio único. */
function strollAreas(sim: Sim): TileRect[] {
  const campus = sim.building.campus;
  if (campus) return [...campus.paths, ...campus.recreation.paths];
  const c = sim.building.corridor.rect;
  return [{ x: c.x + 1, y: c.y + 1, w: c.w - 2, h: c.h - 2 }];
}

/** Um passeio: dois pontos dos caminhos, uma paradinha em cada, e de volta à mesa. */
function planStroll(sim: Sim, ch: Character): boolean {
  const areas = strollAreas(sim).filter((a) => a.w > 0 && a.h > 0);
  if (!areas.length) return false;
  const grid = sim.building.grid;
  const busy = sim.busyTiles(ch.id);
  const pick = (): { x: number; y: number } | null => {
    for (let i = 0; i < 12; i++) {
      const a = areas[Math.floor(ch.rng() * areas.length) % areas.length];
      const x = a.x + Math.floor(ch.rng() * a.w);
      const y = a.y + Math.floor(ch.rng() * a.h);
      if (grid.get(x, y) !== 0 && !busy.has(grid.key(x, y))) return { x, y };
    }
    return null;
  };
  const a = pick();
  if (!a) return false;
  const steps: Step[] = [];
  if (ch.atSpot) steps.push({ t: 'exit' });
  steps.push({ t: 'go', tx: a.x, ty: a.y }, { t: 'act', pose: ch.rng() < 0.4 ? 'stretch' : 'stand', ms: 2_000 + ch.rng() * 3_000 });
  const b = pick();
  if (b) steps.push({ t: 'go', tx: b.x, ty: b.y }, { t: 'act', pose: 'stand', ms: 1_500 + ch.rng() * 2_500, icon: ch.rng() < 0.3 ? 'music' : undefined });
  ch.queue.push(...steps);
  sim.pushHome(ch, 'none');
  return true;
}

/**
 * Todos de volta à mesa agora: rodas, sonecas, passeios e visitas à mesquita acabam. Quem está rezando termina
 * depressa (senta, salam — ver prayer.hurrySequence) em vez de largar a oração no meio; quem está na cabine sai logo.
 */
function recallToDesks(sim: Sim, r: SendAllResult, now: number): SendAllResult {
  for (const ch of sim.chars.values()) {
    if (ch.gone || ch.leaving || ch.arriving || (ch.mode !== 'idle' && ch.mode !== 'shell')) {
      r.busy++;
      continue;
    }
    const t = ch.step?.t;
    const away = !!ch.step || ch.queue.length > 0 || !ch.homeSpot || ch.atSpot !== ch.homeSpot || !!ch.gathering || !!ch.prayer;
    if (!away) continue;
    if (t === 'pray' || t === 'stall' || t === 'switch' || t === 'elevIn' || t === 'elevOut') {
      // passos que não se largam: o replanejamento os encurta e depois o planejador leva para a mesa
      sim.interrupt(ch);
    } else {
      sim.clearPlan(ch);
      // a visita à mesquita (sem estar rezando) devolve o topi/hijab e calça os sapatos no próximo plano
      if (!ch.prayer) {
        if (ch.atSpot && ch.atSpot !== ch.homeSpot) ch.queue.push({ t: 'exit' });
        if (ch.atSpot !== ch.homeSpot || !ch.homeSpot) sim.pushHome(ch, 'none');
        // fica na mesa um tempo antes do próximo passeio (o chamado foi "todos para a mesa")
        ch.queue.push({ t: 'do', fn: () => (ch.nextOutingAt = sim.now + DESK_HOLD_MS) });
      }
    }
    r.sent.push(ch.id);
  }
  void now;
  r.skipped = r.busy;
  return r;
}

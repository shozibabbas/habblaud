// Oração em congregação (jamaat) na mesquita do campus: no chamado para a oração (o horário chegou ou o menu
// Atividades), cada ala ganha uma congregação. O religioso da ala (sim/cleric.ts) vai para o lugar do imam diante do
// mihrab e quem foi chamado se enfileira nos safs atrás dele, da frente para trás. Quando estão todos no lugar (ou
// depois de um tempo), o imam começa e todo mundo segue a mesma linha do tempo: as posturas mudam juntas. Quem chega
// atrasado entra na postura em que o imam está e, depois do salam dele, completa sozinho as rak'ahs perdidas.
// Depois da oração, um majlis curto (o aalim no minbar; a aalima diante das mulheres), com quem rezou sentado
// ouvindo nas fileiras. Sem religioso (equipe desligada), a congregação reza no mesmo ritmo, sem majlis.
import type { PrayerStyle } from '../../../../shared/mosque';
import type { PrayerName } from '../../../../shared/prayer-times';
import type { MosqueSection } from '../layout/mosque';
import { TURBAH_DX } from '../../art/character/prayer';
import type { Character } from './character';
import { endingMs, makeupSequence, missedRakahs, phaseAt, prayersFor, RAKAHS, sequenceMs, sessionSequence, standing, type PrayerPhase, type Posture } from './salat';
import type { Sim } from './sim';

/** Quanto o imam espera os atrasados antes de começar (o chamado leva gente do campus inteiro até a mesquita). */
export const START_WAIT_MS = 100_000;
/** Mínimo entre o chamado e o início, mesmo com todos já no lugar. */
export const START_MIN_MS = 6_000;
/** Duração do majlis/dars depois da oração. */
export const MAJLIS_MS = 32_000;
/** Tempo do takbir de quem entra no meio. */
const JOIN_TAKBIR_MS = 1_100;

export interface Jamaat {
  section: MosqueSection;
  /** Orações rezadas (uma, ou duas juntas). */
  prayers: PrayerName[];
  style: PrayerStyle;
  /** Linha do tempo do imam (todas as posturas, do takbir ao último salam). */
  seq: PrayerPhase[];
  calledAt: number;
  /** Quando o imam começou (null = esperando a fila). */
  startAt: number | null;
  /** Quem foi chamado para esta congregação. */
  members: Set<string>;
  /** O religioso que lidera (null = sem religioso: a congregação reza no mesmo ritmo, sem majlis). */
  imam: string | null;
  majlis: 'pending' | 'none' | { at: number; until: number };
}

interface State {
  sections: Map<MosqueSection, Jamaat>;
  /** Turbahs na frente de quem reza (estilo shia): id -> posição no carpete (px de mundo). */
  turbahs: Map<string, { x: number; y: number }>;
}

const states = new WeakMap<Sim, State>();

function state(sim: Sim): State {
  let s = states.get(sim);
  if (!s) states.set(sim, (s = { sections: new Map(), turbahs: new Map() }));
  return s;
}

/** A congregação em andamento numa ala (ainda esperando o imam, rezando ou no majlis), ou undefined. */
export function jamaatOf(sim: Sim, section: MosqueSection): Jamaat | undefined {
  return state(sim).sections.get(section);
}

export function jamaats(sim: Sim): Jamaat[] {
  return [...state(sim).sections.values()];
}

/** A oração (as posturas) já acabou? */
export function prayerOver(j: Jamaat, now: number): boolean {
  return j.startAt !== null && now - j.startAt >= sequenceMs(j.seq);
}

/** Dá para entrar (ainda não terminou a oração)? */
export function joinable(j: Jamaat | undefined, now: number): j is Jamaat {
  return !!j && !prayerOver(j, now);
}

/**
 * Chamado para a oração: uma congregação por ala, de `name` (e da oração junta, no estilo shia com `combine`). Uma
 * congregação que ainda não acabou continua (o chamado de novo não recomeça ninguém).
 */
export function startJamaat(sim: Sim, now: number, name: PrayerName, style: PrayerStyle, combine: boolean, rng: () => number = Math.random): void {
  const st = state(sim);
  const prayers = prayersFor(name, style, combine);
  for (const section of ['m', 'f'] as const) {
    const cur = st.sections.get(section);
    if (cur && !prayerOver(cur, now)) continue;
    st.sections.set(section, {
      section,
      prayers,
      style,
      seq: sessionSequence(rng, prayers.map((p) => RAKAHS[p]), style),
      calledAt: now,
      startAt: null,
      members: new Set(),
      imam: null,
      majlis: 'pending',
    });
  }
}

/**
 * A cada frame: o imam começa quando ele e a fila estão no lugar (ou depois de START_WAIT_MS); a congregação sai da
 * lista quando a oração e o majlis acabam. `ready(j)` diz se o imam e os chamados estão esperando nos lugares.
 */
export function tickJamaat(sim: Sim, now: number, ready: (j: Jamaat) => boolean): void {
  const st = state(sim);
  for (const [section, j] of st.sections) {
    if (j.startAt === null) {
      const waited = now - j.calledAt;
      if ((waited >= START_MIN_MS && ready(j)) || waited >= START_WAIT_MS) j.startAt = now;
      continue;
    }
    if (!prayerOver(j, now)) continue;
    if (j.majlis === 'pending' && !j.imam) j.majlis = 'none';
    const majlisDone = j.majlis === 'none' || (typeof j.majlis === 'object' && now >= j.majlis.until);
    // sem majlis em 20 s (o religioso não veio), a congregação fecha
    if (majlisDone || (j.majlis === 'pending' && now - j.startAt - sequenceMs(j.seq) > 20_000)) st.sections.delete(section);
  }
}

/** O majlis acabou (ou não vai haver): quem ficou ouvindo pode sair. */
export function majlisOver(sim: Sim, section: MosqueSection, now: number): boolean {
  const j = jamaatOf(sim, section);
  if (!j) return true;
  if (!prayerOver(j, now)) return false;
  if (j.majlis === 'none') return true;
  if (j.majlis === 'pending') return !j.imam;
  return now >= j.majlis.until;
}

// =================================================================== quem segue o imam

/** Como cada um acompanha a congregação (guardado no passo 'pray'). */
export interface Follow {
  j: Jamaat;
  /** Lidera (o imam): nunca é atrasado. */
  lead?: boolean;
  /** Instante da sequência do imam em que entrou (undefined = ainda esperando o início). */
  joinedAt?: number;
  /** Rak'ahs que vai completar depois do salam do imam, já montadas. */
  makeup?: PrayerPhase[];
}

/**
 * Postura de quem segue a congregação agora; null = terminou (o salam final, dele ou da reposição). Antes do imam
 * começar, em pé esperando.
 */
export function followPose(f: Follow, now: number, rng: () => number): Posture | 'stand' | null {
  const j = f.j;
  if (j.startAt === null) return 'stand';
  const t = now - j.startAt;
  if (f.joinedAt === undefined) {
    f.joinedAt = Math.max(0, t);
    const missed = f.lead || f.joinedAt < 400 ? 0 : missedRakahs(j.seq, f.joinedAt);
    f.makeup = makeupSequence(rng, missed, j.style);
  }
  const total = sequenceMs(j.seq);
  const late = (f.makeup?.length ?? 0) > 0;
  // quem entrou no meio faz o próprio takbir antes de acompanhar
  if (!f.lead && f.joinedAt >= 400 && t - f.joinedAt < JOIN_TAKBIR_MS && t < total) return 'takbir';
  if (!late) {
    const at = phaseAt(j.seq, t);
    return at ? at.phase.pose : null;
  }
  // atrasado: acompanha até o tashahhud final do imam (sem o fim dele: salam, takbirs) e completa sozinho
  const salam = endingMs(j.seq);
  if (t < total - salam) return phaseAt(j.seq, t)?.phase.pose ?? standing(j.style);
  const own = phaseAt(f.makeup!, t - (total - salam));
  return own ? own.phase.pose : null;
}

// =================================================================== turbahs (estilo shia)

/** Põe/tira a turbah de alguém no carpete (ela aparece diante de quem reza, onde a testa encosta no sujood). */
export function setTurbah(sim: Sim, ch: Character, at: { x: number; y: number } | null): void {
  const t = state(sim).turbahs;
  if (at) t.set(ch.id, at);
  else t.delete(ch.id);
}

/** A turbah de alguém ainda está diante dele (não saiu do lugar)? */
const before = (ch: Character, t: { x: number; y: number }) => Math.abs(Math.round(ch.x) + TURBAH_DX - t.x) <= 3 && Math.abs(Math.round(ch.y) - t.y) <= 3;

/**
 * Turbahs fixas dos lugares do imam (estilo shia): o aalim e a aalima têm a sua sempre ali, no tapete diante do
 * mihrab — para a congregação e para o nafl deles.
 */
export function imamTurbahs(sim: Sim): { x: number; y: number }[] {
  if (sim.mosque.style !== 'shia') return [];
  return sim.spots.ofKind('staff').filter((s) => s.group?.startsWith('cleric:imam:')).map((s) => turbahSpot(s.x, s.y));
}

/** Turbahs no carpete agora (para o desenho): as dos lugares do imam e as de quem está no lugar onde a pôs. */
export function turbahsOf(sim: Sim): { x: number; y: number }[] {
  const t = state(sim).turbahs;
  const out = imamTurbahs(sim);
  for (const [id, at] of t) {
    const ch = sim.chars.get(id);
    if (!ch) t.delete(id);
    else if (before(ch, at) && !out.some((o) => o.x === at.x && o.y === at.y)) out.push(at);
  }
  return out;
}

/** Há uma turbah sob a testa de quem está em (ch.x, ch.y) virado para oeste? (o sujood desenha a testa sobre ela) */
export function turbahUnder(sim: Sim, ch: Character): boolean {
  if (sim.mosque.style !== 'shia' || ch.dir !== 'left') return false;
  const mine = state(sim).turbahs.get(ch.id);
  if (mine && before(ch, mine)) return true;
  return imamTurbahs(sim).some((t) => before(ch, t));
}

/**
 * Onde a turbah fica (canto esquerdo da base) para quem reza com os pés em (x, y) virado para oeste: sob a testa no
 * sujood, no mesmo lugar onde a arte a desenha (art/character/prayer.ts, TURBAH_DX).
 */
export function turbahSpot(x: number, y: number): { x: number; y: number } {
  return { x: Math.round(x) + TURBAH_DX, y: Math.round(y) };
}

/** Esquece tudo (aba oculta: ninguém estava rezando de verdade). */
export function resetJamaat(sim: Sim): void {
  const st = state(sim);
  st.sections.clear();
  st.turbahs.clear();
}

/** O imam e todos os chamados estão no lugar (no passo 'pray' desta congregação, esperando)? */
export function readyToStart(sim: Sim, j: Jamaat): boolean {
  const waiting = (id: string) => {
    const c = sim.chars.get(id);
    if (!c || c.gone || c.leaving || !c.prayer) return true;
    const s = c.step;
    return s?.t === 'pray' && s.follow?.j === j;
  };
  // com religioso na ala, ele precisa estar no lugar do imam
  if (j.imam) {
    const c = sim.chars.get(j.imam);
    const s = c?.step;
    if (c && !(s?.t === 'pray' && s.follow?.j === j)) return false;
  } else if ([...sim.staff.members.values()].some((m) => m.role === 'cleric' && !m.leaving && !m.ch.gone && (m.state as { section?: string }).section === j.section)) return false;
  for (const id of j.members) if (!waiting(id)) return false;
  return true;
}

/**
 * A oração do chamado agora: a última que já começou hoje (antes do Fajr, o Isha da noite anterior). Usada pelo menu
 * Atividades, que chama a qualquer hora.
 */
export function currentPrayer(prayers: readonly { name: PrayerName; at: number }[], now: number): PrayerName {
  let cur: PrayerName = 'isha';
  for (const p of prayers) if (p.at <= now) cur = p.name;
  return cur;
}

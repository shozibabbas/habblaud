// A secretária do dono (uma função da equipe; ver sim/staff.ts e sim/ceo.ts): na antessala da diretoria, com o nome,
// o visual e as peças de `meta.owner.secretary`. Só existe com o dono (campus).
//   - na mesa: digitando, atendendo o telefone (o toque baixinho e a pose `phone`), arquivando no armário e na estante;
//   - recebe quem chega (um aceno) e, antes das reuniões do dono, recebe os convidados na antessala, leva-os até a
//     porta de vidro (ceo_door) e os anuncia; só então eles entram (sim/ceo.ts espera a fase 'announced');
//   - de vez em quando leva um chai do bar da sala até a mesa do dono;
//   - pausas (banheiro, água, café) só enquanto o dono está fora da diretoria (ronda, atividade, mesquita): com ele na
//     sala, a antessala nunca fica vazia; se ele volta, ela encurta a pausa;
//   - vai ao chamado para a oração (ala feminina, hijab do cabideiro) e às atividades do menu como todo mundo.
import { tr } from '../../../../shared/i18n';
import type { Appearance } from '../../art/api';
import type { SpotDef } from '../layout/types';
import { fill, pick, type Pool } from '../social/lines';
import type { Character } from './character';
import { bossAway, bossOf, inRect, suiteOf, suiteRects, tilesNear, type Meeting } from './ceo';
import { facing } from './character';
import type { SendActivity } from './send-all';
import type { StaffCrew, StaffMember, StaffRoleDef } from './staff';
import type { Step } from './steps';

export const SECRETARY_ROLE = 'secretary';

/** Pesos do trabalho na mesa. */
export const SECRETARY_WEIGHTS = { type: 62, phone: 18, filing: 12, binders: 8 } as const;
/** Intervalo (ms) entre dois chais levados ao dono. */
export const CHAI_EVERY_MS: readonly [number, number] = [360_000, 720_000];
/** Intervalo (ms) entre duas pausas (só com o dono fora). */
export const BREAK_EVERY_MS: readonly [number, number] = [240_000, 480_000];
const GREET_TILES = 6;
const GREET_AGAIN_MS = 90_000;

const LINES = {
  welcome: [tr('Bem-vindos! Por aqui, por favor.'), tr('Olá! Ele já vai recebê-los.'), tr('Sejam bem-vindos! 🙂')],
  announceOne: [tr('Com licença, {nome}: {a} chegou.'), tr('{nome}, {a} está aqui para a reunião.')],
  announceMany: [tr('Com licença, {nome}: a equipe chegou.'), tr('{nome}, {a} estão aqui para a reunião.')],
  chai: [tr('Seu chai, {nome} ☕'), tr('Chai fresquinho ☕')],
  phone: [tr('Escritório de {nome}, pois não?'), tr('Vou verificar a agenda.'), tr('Ele está em reunião, posso anotar o recado?')],
} satisfies Record<string, Pool>;

type Doing = 'desk' | 'phone' | 'filing' | 'greet' | 'escort' | 'chai' | 'break' | 'away';

export interface SecretaryState {
  doing: Doing;
  nextChaiAt: number;
  nextBreakAt: number;
  /** Alguém para cumprimentar. */
  greet: string | null;
  greeted: Map<string, number>;
}

type Clerk = StaffMember<SecretaryState>;

const between = (rng: () => number, a: number, b: number) => a + rng() * (b - a);
const span = (rng: () => number, r: readonly [number, number]) => Math.round(between(rng, r[0], r[1]));
const firstName = (name: string) => name.split(/\s+/)[0] || name;

function chairOf(crew: StaffCrew, m: Clerk): SpotDef | undefined {
  const s = crew.sim.spots.ofKind('secretary')[0];
  if (s) crew.sim.spots.reserve(s.id, m.id);
  return s;
}

function say(crew: StaffCrew, ch: Character, text: string): void {
  crew.sim.social.say(ch, text, crew.now);
}

/** Os convidados da reunião já estão todos na antessala, esperando por ela. */
function escortReady(meet: Meeting | null): meet is Meeting {
  return !!meet && meet.phase === 'arriving' && meet.guests.length > 0 && meet.guests.every((id) => meet.arrived.has(id));
}

/** Hora de levar um chai: o dono trabalhando na mesa, sem ligação nem reunião, e sem chai há um tempo. */
function chaiDue(crew: StaffCrew, s: SecretaryState, now: number): boolean {
  const b = bossOf(crew);
  if (!b || now < s.nextChaiAt || suiteOf(crew).meeting) return false;
  const bs = b.state;
  if (bs.call || bs.cup || (bs.doing !== 'desk' && bs.doing !== 'stand') || now - bs.chaiAt < 240_000) return false;
  const at = b.ch.atSpot ? crew.sim.spots.get(b.ch.atSpot) : undefined;
  return at?.kind === 'ceo_desk' || at?.kind === 'ceo_stand';
}

/** Volta para a cadeira (se não estiver nela). */
function toChair(m: Clerk, chair: SpotDef, steps: Step[]): void {
  const ch = m.ch;
  if (ch.atSpot === chair.id && !steps.length) return;
  if (ch.atSpot && !steps.length) steps.push({ t: 'exit' });
  steps.push({ t: 'go', tx: chair.tx, ty: chair.ty }, { t: 'enter', spot: chair.id });
}

/** Recebe os convidados, leva-os até a porta da sala e os anuncia. */
function planEscort(crew: StaffCrew, m: Clerk, chair: SpotDef, meet: Meeting): boolean {
  const sim = crew.sim;
  const ch = m.ch;
  const s = m.state;
  const door = sim.spots.ofKind('ceo_door')[0];
  const rects = suiteRects(sim);
  const boss = bossOf(crew);
  if (!door || !rects) return false;
  const guests = meet.guests.map((id) => sim.chars.get(id)).filter((c): c is Character => !!c);
  const first = meet.wait.get(meet.guests[0]);
  const steps: Step[] = [];
  if (ch.atSpot) steps.push({ t: 'exit' });
  if (first) {
    const [at] = tilesNear(sim, first.x, first.y - 1, 1, new Set(), m.id, 1, rects.reception);
    if (at) steps.push({ t: 'go', tx: at.x, ty: at.y });
  }
  steps.push(
    {
      t: 'do',
      fn: () => {
        s.doing = 'greet';
        if (guests[0]) ch.dir = facing(ch.x, ch.y, guests[0].x, guests[0].y);
        say(crew, ch, pick(LINES.welcome, ch.rng));
        if (meet.phase === 'arriving') meet.phase = 'escort';
      },
    },
    { t: 'act', pose: 'talk', ms: 1_600 },
    { t: 'go', tx: door.tx, ty: door.ty, fx: door.x, fy: door.y, dir: door.dir },
    {
      t: 'do',
      fn: () => {
        s.doing = 'escort';
        const names = meet.guests.map((id) => sim.chars.get(id)?.info.name).filter((n): n is string => !!n);
        const owner = boss ? firstName(boss.ch.info.name) : '';
        say(crew, ch, pick(names.length > 1 ? LINES.announceMany : LINES.announceOne, ch.rng, { nome: owner, a: names.join(', ') }));
      },
    },
    { t: 'act', pose: 'talk', ms: 2_000, dir: door.dir },
    { t: 'do', fn: () => (meet.phase === 'arriving' || meet.phase === 'escort') && (meet.phase = 'announced') },
    // "podem entrar": acena para os convidados e volta para a mesa
    { t: 'act', pose: 'raise_hand', ms: 1_000, dir: 'left' },
  );
  toChair(m, chair, steps);
  steps.push({ t: 'do', fn: () => (s.doing = 'desk') });
  ch.queue.push(...steps);
  return true;
}

/** Leva um chai do bar da sala até a mesa do dono. */
function planChai(crew: StaffCrew, m: Clerk, chair: SpotDef, now: number): boolean {
  const sim = crew.sim;
  const ch = m.ch;
  const s = m.state;
  const boss = bossOf(crew);
  const bar = sim.spots.ofKind('ceo_coffee')[0];
  const desk = sim.spots.ofKind('ceo_desk')[0];
  if (!boss || !bar || !desk) return false;
  s.nextChaiAt = now + span(ch.rng, CHAI_EVERY_MS);
  // ao lado da mesa dele (o tile de aproximação é o dele)
  const [hand] = tilesNear(sim, desk.tx - 1, desk.ty, 1, new Set([sim.building.grid.key(desk.tx, desk.ty)]), m.id, 0);
  if (!hand) return false;
  const steps: Step[] = [];
  if (ch.atSpot) steps.push({ t: 'exit' });
  steps.push(
    { t: 'do', fn: () => (s.doing = 'chai') },
    { t: 'go', tx: bar.tx, ty: bar.ty, fx: bar.x, fy: bar.y, dir: bar.dir },
    { t: 'act', pose: 'use', ms: 2_200, machine: bar.furnitureId, icon: 'coffee', dir: bar.dir },
    { t: 'do', fn: () => crew.cue('cup', ch) },
    { t: 'go', tx: hand.x, ty: hand.y, held: 'coffee' },
    {
      t: 'do',
      fn: () => {
        const bs = boss.state;
        const at = boss.ch.atSpot ? sim.spots.get(boss.ch.atSpot) : undefined;
        ch.dir = facing(ch.x, ch.y, boss.ch.x, boss.ch.y);
        // ele saiu da mesa nesse meio-tempo: deixa para a próxima (ao telefone, ele bebe quando desligar)
        if (boss.leaving || bs.call === 'video' || (at?.kind !== 'ceo_desk' && at?.kind !== 'ceo_stand')) return;
        say(crew, ch, pick(LINES.chai, ch.rng, { nome: firstName(boss.ch.info.name) }));
        bs.cup = true;
        bs.poke = true;
      },
    },
    { t: 'act', pose: 'use', ms: 1_100, held: 'coffee' },
  );
  toChair(m, chair, steps);
  steps.push({ t: 'do', fn: () => (s.doing = 'desk') });
  ch.queue.push(...steps);
  return true;
}

/** Pausa curta (o dono está fora): banheiro, água ou café; ele voltando, ela encurta e volta para a mesa. */
function planBreak(crew: StaffCrew, m: Clerk, chair: SpotDef, now: number): boolean {
  const sim = crew.sim;
  const ch = m.ch;
  const s = m.state;
  const rng = ch.rng;
  s.nextBreakAt = now + span(rng, BREAK_EVERY_MS);
  const back = () => !bossAway(crew);
  const steps: Step[] = [];
  const release = (sp: SpotDef) => steps.push({ t: 'do', fn: () => sim.spots.release(sp.id, m.id) });
  const near = { tx: ch.tx, ty: ch.ty };
  const r = rng();
  const stall = r < 0.35 ? sim.spots.findFree('stall', { by: m.id, rng, near }) : null;
  const coffee = !stall && r < 0.75 ? sim.spots.findFree('coffee', { by: m.id, near }) : null;
  const water = !stall && !coffee ? sim.spots.findFree('water', { by: m.id, near }) : null;
  if (ch.atSpot) steps.push({ t: 'exit' });
  steps.push({ t: 'do', fn: () => (s.doing = 'break') });
  // na porta da antessala, confere de novo: o dono voltou nesse meio-tempo? então fica (o planejador a põe na mesa)
  const r0 = suiteRects(sim)?.reception;
  if (r0) {
    steps.push(
      { t: 'go', tx: r0.x + 5, ty: r0.y + r0.h - 2 },
      {
        t: 'do',
        fn: () => {
          if (bossAway(crew)) return;
          ch.queue.length = 0;
          sim.releaseTemp(ch);
        },
      },
    );
  }
  if (stall && sim.reserveTemp(ch, stall)) {
    steps.push({ t: 'go', tx: stall.tx, ty: stall.ty }, { t: 'stall', spot: stall.id, ms: Math.round(between(rng, 5000, 9000)), phase: 0 });
    release(stall);
    const sink = sim.spots.findFree('sink', { by: m.id, near: { tx: stall.tx, ty: stall.ty } });
    if (sink && sim.reserveTemp(ch, sink)) {
      steps.push({ t: 'go', tx: sink.tx, ty: sink.ty, fx: sink.x, fy: sink.y, dir: sink.dir }, { t: 'act', pose: 'use', ms: 2000 });
      release(sink);
    }
  } else if (coffee && sim.reserveTemp(ch, coffee)) {
    steps.push(
      { t: 'go', tx: coffee.tx, ty: coffee.ty, fx: coffee.x, fy: coffee.y, dir: coffee.dir },
      { t: 'act', pose: 'use', ms: 1900, machine: coffee.furnitureId, icon: 'coffee' },
      { t: 'until', cond: back, minMs: 2_000, maxMs: Math.round(between(rng, 6000, 11_000)), pose: 'drink', held: 'coffee' },
    );
    release(coffee);
  } else if (water && sim.reserveTemp(ch, water)) {
    steps.push({ t: 'go', tx: water.tx, ty: water.ty, fx: water.x, fy: water.y, dir: water.dir }, { t: 'act', pose: 'use', ms: 1000 }, { t: 'act', pose: 'drink', held: 'water', ms: 3000 });
    release(water);
  } else {
    steps.push({ t: 'until', cond: back, minMs: 1_000, maxMs: 4_000, pose: 'stretch' });
  }
  toChair(m, chair, steps);
  steps.push({ t: 'do', fn: () => (s.doing = 'desk') });
  ch.queue.push(...steps);
  return true;
}

/** Tile livre na frente de um móvel da antessala (local à área), virada para ele; null se não houver. */
function frontOf(crew: StaffCrew, lx: number, ly: number): { x: number; y: number } | null {
  const r = suiteRects(crew.sim)?.reception;
  if (!r) return null;
  const x = r.x + lx;
  const y = r.y + ly;
  return crew.sim.building.grid.get(x, y) !== 0 ? { x, y } : null;
}

/** Trabalho na mesa: digitando, ao telefone, arquivando. */
function planDesk(crew: StaffCrew, m: Clerk, chair: SpotDef, now: number): boolean {
  const ch = m.ch;
  const s = m.state;
  const rng = ch.rng;
  const due = () => !!s.greet || escortReady(suiteOf(crew).meeting) || chaiDue(crew, s, crew.now) || (bossAway(crew) && crew.now >= s.nextBreakAt);
  const steps: Step[] = [];
  const w = SECRETARY_WEIGHTS;
  let r = rng() * (w.type + w.phone + w.filing + w.binders);
  // o armário de arquivo ao lado da mesa e as estantes de pastas ao fundo (layout/ceo.ts)
  const cabinet = frontOf(crew, 10, 7);
  const shelf = frontOf(crew, 9 + Math.floor(rng() * 2), 3);
  if ((r -= w.type) < 0 || (!cabinet && !shelf && r < w.filing + w.binders)) {
    toChair(m, chair, steps);
    steps.push({ t: 'do', fn: () => (s.doing = 'desk') }, { t: 'until', cond: due, minMs: 600, maxMs: Math.round(between(rng, 6000, 14_000)), pose: 'type', dir: chair.dir });
  } else if ((r -= w.phone) < 0) {
    toChair(m, chair, steps);
    const boss = bossOf(crew);
    steps.push(
      {
        t: 'do',
        fn: () => {
          s.doing = 'phone';
          crew.cue('ring', ch);
          ch.chatEmoji = '📞';
          ch.chatUntil = crew.now + 2_000;
        },
      },
      { t: 'act', pose: 'sit', ms: 1_200, dir: chair.dir, seated: true },
      { t: 'do', fn: () => say(crew, ch, pick(LINES.phone, rng, { nome: boss ? firstName(boss.ch.info.name) : undefined })) },
      { t: 'until', cond: due, minMs: 2_500, maxMs: Math.round(between(rng, 5000, 10_000)), pose: 'phone', dir: chair.dir },
    );
  } else {
    const at = (r -= w.filing) < 0 ? (cabinet ?? shelf) : (shelf ?? cabinet);
    if (!at) return planDeskType(crew, m, chair, due);
    if (ch.atSpot) steps.push({ t: 'exit' });
    steps.push(
      { t: 'do', fn: () => (s.doing = 'filing') },
      { t: 'go', tx: at.x, ty: at.y, dir: 'up' },
      { t: 'act', pose: 'use', ms: Math.round(between(rng, 1500, 3000)), dir: 'up' },
      { t: 'until', cond: due, minMs: 800, maxMs: Math.round(between(rng, 3000, 6000)), pose: 'read', held: 'papers', dir: 'down' },
    );
    toChair(m, chair, steps);
  }
  ch.queue.push(...steps);
  void now;
  return true;
}

function planDeskType(crew: StaffCrew, m: Clerk, chair: SpotDef, due: () => boolean): boolean {
  const steps: Step[] = [];
  toChair(m, chair, steps);
  steps.push({ t: 'until', cond: due, minMs: 600, maxMs: 8000, pose: 'type', dir: chair.dir });
  m.ch.queue.push(...steps);
  return true;
}

export const SECRETARY: StaffRoleDef<SecretaryState> = {
  role: SECRETARY_ROLE,
  label: (crew) => (crew?.sim.owner?.secretary?.look === 'm' ? tr('Secretário') : tr('Secretária')),
  count: (crew) => (crew.sim.owner?.secretary && crew.sim.spots.ofKind('secretary').length && crew.sim.spots.ofKind('ceo_desk').length ? 1 : 0),
  identity: (crew) => {
    const sec = crew.sim.owner?.secretary;
    return sec ? { name: sec.name, look: sec.look, ...(sec.parts ? { parts: sec.parts } : {}) } : null;
  },
  dress: (base: Appearance) => ({ ...base, lanyard: null }),

  init: (m, _crew, now) => ({
    doing: 'desk',
    nextChaiAt: now + span(m.ch.rng, CHAI_EVERY_MS) * 0.5,
    nextBreakAt: now + span(m.ch.rng, BREAK_EVERY_MS),
    greet: null,
    greeted: new Map(),
  }),

  think(m, crew, now) {
    const ch = m.ch;
    const s = m.state;
    const chair = chairOf(crew, m);
    if (!chair) {
      ch.queue.push({ t: 'act', pose: 'stand', ms: 4000 });
      return true;
    }
    const meet = suiteOf(crew).meeting;
    if (escortReady(meet) && planEscort(crew, m, chair, meet)) return true;
    if (chaiDue(crew, s, now) && planChai(crew, m, chair, now)) return true;
    if (s.greet) {
      const t = crew.sim.chars.get(s.greet);
      s.greet = null;
      if (t && ch.atSpot === chair.id) {
        ch.queue.push(
          {
            t: 'do',
            fn: () => {
              s.doing = 'greet';
              ch.chatEmoji = '👋';
              ch.chatUntil = crew.now + 1600;
            },
          },
          { t: 'act', pose: 'raise_hand', ms: 1100, dir: facing(ch.x, ch.y, t.x, t.y), seated: true },
          { t: 'act', pose: 'sit', ms: 300, dir: chair.dir, seated: true },
        );
        return true;
      }
    }
    if (bossAway(crew) && now >= s.nextBreakAt) return planBreak(crew, m, chair, now);
    return planDesk(crew, m, chair, now);
  },

  settle(m, crew) {
    const s = m.state;
    s.greet = null;
    s.doing = 'desk';
    const chair = chairOf(crew, m);
    if (chair) crew.seat(m.ch, chair);
    else crew.standNear(m.ch, m.ch.tx, m.ch.ty);
  },

  doing(m, crew) {
    const ch = m.ch;
    if (ch.prayer || ch.step?.t === 'pray') return tr('Rezando');
    if (ch.gathering) return crew.sim.social.doing(ch.id) ?? tr('Com a equipe');
    switch (m.state.doing) {
      case 'phone':
        return tr('Atendendo o telefone');
      case 'filing':
        return tr('Arquivando documentos');
      case 'greet':
        return tr('Recebendo visitas');
      case 'escort':
        return tr('Anunciando a reunião');
      case 'chai': {
        const b = bossOf(crew);
        return b ? (fill(tr('Levando um chai para {nome}'), { nome: firstName(b.ch.info.name) }) ?? tr('Preparando um chai')) : tr('Preparando um chai');
      }
      case 'break':
        return tr('Em pausa');
      case 'away':
        return tr('Fora da mesa');
      default:
        return tr('Na mesa da secretaria');
    }
  },

  joinPrayer(m) {
    m.state.doing = 'away';
    m.state.greet = null;
    return true;
  },

  joinActivity(m, _crew, activity: SendActivity) {
    // nada de cigarro nem soneca no horário (a mesa dela é a porta do dono)
    if (activity === 'smoke' || activity === 'nap' || m.ch.inside) return false;
    m.state.greet = null;
    m.state.doing = activity === 'desk' ? 'desk' : 'away';
    return true;
  },

  housekeeping(crew, now) {
    // cumprimenta quem entra na antessala (um aceno; cada pessoa de vez em quando)
    for (const m of crew.members.values()) {
      if (m.role !== SECRETARY_ROLE || m.leaving) continue;
      const clerk = m as Clerk;
      const chair = crew.sim.spots.ofKind('secretary')[0];
      const rects = suiteRects(crew.sim);
      if (!chair || !rects || clerk.ch.atSpot !== chair.id || clerk.state.greet) continue;
      const g = clerk.state.greeted;
      for (const [id, at] of g) if (now - at > GREET_AGAIN_MS * 2) g.delete(id);
      for (const c of crew.sim.chars.values()) {
        if (c === clerk.ch || c.gone || c.inside || c.leaving || c.alpha < 0.6 || crew.member(c.id)) continue;
        const moving = c.pose === 'walk' || c.pose === 'run';
        if (!moving || !inRect(rects.reception, c.tx, c.ty) || Math.max(Math.abs(c.tx - chair.tx), Math.abs(c.ty - chair.ty)) > GREET_TILES) continue;
        if (now - (g.get(c.id) ?? -Infinity) < GREET_AGAIN_MS) continue;
        g.set(c.id, now);
        clerk.state.greet = c.id;
        break;
      }
    }
  },
};

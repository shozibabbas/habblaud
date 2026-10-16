// Recepção (uma função da equipe; ver sim/staff.ts): o balcão nunca fica vazio. São duas pessoas: a recepcionista
// (índice 0), que fica no balcão digitando, atende o telefone e cumprimenta quem chega pelo elevador ou passa por perto
// (um aceno), e a substituta (índice 1), que organiza a papelada no arquivo atrás do balcão e cobre as pausas.
// Na pausa (chá, banheiro, chamado para a oração) a troca é no balcão: a substituta chega primeiro e fica ao lado da
// cadeira; só então a recepcionista levanta, e a substituta senta. Na volta é igual, ao contrário.
import { tr } from '../../../../shared/i18n';
import type { AppearanceProfile } from '../../../../shared/types';
import type { Appearance, Dir } from '../../art/api';
import { STAFF_DESK, STAFF_DESK_BACK, STAFF_DESK_SWAP } from '../layout/staff';
import type { SpotDef } from '../layout/types';
import { facing } from './character';
import { planPrayerVisit } from './prayer';
import type { StaffCrew, StaffMember, StaffRoleDef } from './staff';
import type { Step } from './steps';

// ------------------------------------------------------------------ uniforme

/** Marinho e creme, com detalhe dourado: roupa de escritório arrumada. */
export const RECEPTION_UNIFORM = { navy: '#273a59', white: '#f3f5f9', cream: '#ede4d2', gold: '#c9a24a', shoes: '#1f2330' } as const;
const NO_HATS: ReadonlySet<string> = new Set(['cap', 'beanie', 'headphones', 'sunglasses', 'topi']);

/**
 * Padrão: camisa branca com gravata marinho (homens) ou blusa marinho (mulheres), calça marinho. Perfil 'pk': kurta creme
 * com colete marinho e shalwar (homens); shalwar kameez marinho com dupatta creme (mulheres; quem sorteou hijab fica).
 */
export function receptionUniform(base: Appearance, profile: AppearanceProfile | undefined): Appearance {
  const u = RECEPTION_UNIFORM;
  const a: Appearance = { ...base, lanyard: null, shoes: u.shoes };
  if (NO_HATS.has(a.accessory)) a.accessory = 'none';
  if (profile === 'pk') {
    a.bottomStyle = 'shalwar';
    if (a.look === 'f') {
      a.topStyle = 'shalwar_kameez';
      a.top = u.navy;
      a.topAccent = u.cream;
      a.bottom = u.navy;
      a.accessory = a.accessory === 'hijab' ? 'hijab' : 'dupatta';
      a.accessoryColor = u.cream;
    } else {
      a.topStyle = 'kurta_waistcoat';
      a.top = u.cream;
      a.topAccent = u.navy;
      a.bottom = u.cream;
    }
    return a;
  }
  a.bottom = u.navy;
  a.bottomStyle = a.look === 'f' && a.bottomStyle === 'skirt' ? 'skirt' : 'pants';
  if (a.look === 'f') {
    a.topStyle = 'blouse';
    a.top = u.navy;
    a.topAccent = u.gold;
  } else {
    a.topStyle = 'shirt_tie';
    a.top = u.white;
    a.topAccent = u.navy;
  }
  return a;
}

// ------------------------------------------------------------------ o balcão

/** Quem responde pelo balcão agora e a troca em andamento. */
export interface Desk {
  holder: string | null;
  /** Quem está vindo assumir (espera ao lado da cadeira). */
  incoming: string | null;
  /** `incoming` já está ao lado da cadeira: quem está sentado pode levantar. */
  ready: boolean;
  /** Último cumprimento por pessoa (ms), para não acenar sem parar para o mesmo agente. */
  greeted: Map<string, number>;
}

const desks = new WeakMap<StaffCrew, Desk>();

export function deskOf(crew: StaffCrew): Desk {
  let d = desks.get(crew);
  if (!d) desks.set(crew, (d = { holder: null, incoming: null, ready: false, greeted: new Map() }));
  return d;
}

type Doing = 'desk' | 'phone' | 'greet' | 'swap' | 'break' | 'back';

export interface ReceptionState {
  /** A recepcionista (índice 0); a outra é a substituta. */
  primary: boolean;
  /** Fim do turno no balcão (só a recepcionista tira pausa). */
  shiftEnd: number;
  /** Chamado para a oração: vai assim que a substituta assumir. */
  wantPray: boolean;
  /** Acabou de sair do balcão: a pausa ainda não foi planejada. */
  breakPending: boolean;
  /** Alguém para cumprimentar. */
  greet: string | null;
  doing: Doing;
}

/** Turno da recepcionista entre duas pausas (ms). */
export const SHIFT_MS: readonly [number, number] = [180_000, 320_000];
/** Distância (tiles) de quem a recepcionista cumprimenta. */
const GREET_TILES = 5;
const GREET_AGAIN_MS = 90_000;

const between = (rng: () => number, a: number, b: number) => a + rng() * (b - a);

type Clerk = StaffMember<ReceptionState>;

function spots(crew: StaffCrew): { chair?: SpotDef; swap?: SpotDef; back?: SpotDef } {
  return { chair: crew.base(STAFF_DESK)[0], swap: crew.base(STAFF_DESK_SWAP)[0], back: crew.base(STAFF_DESK_BACK)[0] };
}

/** A outra pessoa da recepção (presente e trabalhando). */
function partner(crew: StaffCrew, m: Clerk): Clerk | undefined {
  for (const o of crew.members.values()) if (o !== m && o.role === RECEPTIONIST.role && !o.leaving && !o.ch.gone) return o as Clerk;
  return undefined;
}

/** Dá para chamar a substituta agora? (não está rezando nem dentro de algum lugar) */
function available(o: Clerk): boolean {
  const c = o.ch;
  return !c.prayer && c.step?.t !== 'pray' && !c.inside && c.step?.t !== 'stall' && !c.arriving;
}

/** Pausa da recepcionista: chamado para a oração, um chá na copa, o banheiro ou um copo d'água. */
function planBreak(crew: StaffCrew, m: Clerk, now: number): boolean {
  const sim = crew.sim;
  const ch = m.ch;
  const s = m.state;
  s.doing = 'break';
  if (s.wantPray) {
    s.wantPray = false;
    if (planPrayerVisit(sim, ch, now)) return true;
  }
  const rng = ch.rng;
  const steps: Step[] = [];
  const release = (sp: SpotDef) => steps.push({ t: 'do', fn: () => sim.spots.release(sp.id, m.id) });
  const r = rng();
  const stall = r < 0.35 ? sim.spots.findFree('stall', { by: m.id, rng }) : null;
  const coffee = !stall && r < 0.8 ? sim.spots.findFree('coffee', { by: m.id, rng, near: { tx: ch.tx, ty: ch.ty } }) : null;
  const water = !stall && !coffee ? sim.spots.findFree('water', { by: m.id, near: { tx: ch.tx, ty: ch.ty } }) : null;
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
      { t: 'act', pose: 'drink', held: 'coffee', ms: Math.round(between(rng, 6000, 11_000)) },
    );
    release(coffee);
  } else if (water && sim.reserveTemp(ch, water)) {
    steps.push({ t: 'go', tx: water.tx, ty: water.ty, fx: water.x, fy: water.y, dir: water.dir }, { t: 'act', pose: 'use', ms: 1000 }, { t: 'act', pose: 'drink', held: 'water', ms: 3000 });
    release(water);
  } else steps.push({ t: 'act', pose: 'stretch', ms: 2600 });
  ch.queue.push(...steps);
  return true;
}

/** No balcão: digitando, ao telefone, cumprimentando; e a troca quando alguém vem assumir. */
function holderThink(crew: StaffCrew, m: Clerk, chair: SpotDef, now: number): boolean {
  const sim = crew.sim;
  const ch = m.ch;
  const s = m.state;
  const d = deskOf(crew);
  const steps: Step[] = [];
  if (ch.atSpot !== chair.id) {
    if (ch.atSpot) steps.push({ t: 'exit' });
    steps.push({ t: 'go', tx: chair.tx, ty: chair.ty }, { t: 'enter', spot: chair.id });
    s.doing = 'desk';
    ch.queue.push(...steps);
    return true;
  }
  // quem vem assumir já está ao lado: levanta e passa o balcão
  const other = partner(crew, m);
  if (d.incoming && d.incoming !== m.id && d.ready && other?.id === d.incoming) {
    steps.push(
      { t: 'exit' },
      {
        t: 'do',
        fn: () => {
          d.holder = d.incoming;
          d.incoming = null;
          d.ready = false;
          if (other.state.primary) other.state.shiftEnd = sim.now + between(other.ch.rng, SHIFT_MS[0], SHIFT_MS[1]);
          if (s.primary) s.breakPending = true;
          other.ch.thinkAt = 0;
        },
      },
    );
    ch.queue.push(...steps);
    return true;
  }
  // fim do turno (ou chamado para a oração): chama a substituta
  if (s.primary && (now >= s.shiftEnd || s.wantPray) && !d.incoming && other && available(other)) {
    d.incoming = other.id;
    d.ready = false;
    // a substituta larga a papelada na hora
    if (other.ch.step?.t === 'until' || other.ch.step?.t === 'act') sim.clearPlan(other.ch);
  }
  if (s.greet) {
    const t = sim.chars.get(s.greet);
    s.greet = null;
    if (t) {
      const dir: Dir = facing(ch.x, ch.y, t.x, t.y);
      steps.push(
        {
          t: 'do',
          fn: () => {
            s.doing = 'greet';
            ch.chatEmoji = '👋';
            ch.chatUntil = sim.now + 1600;
          },
        },
        { t: 'act', pose: 'raise_hand', ms: 1100, dir, seated: true },
        { t: 'act', pose: 'sit', ms: 300, dir: chair.dir, seated: true },
      );
      ch.queue.push(...steps);
      return true;
    }
  }
  const canSwap = () => {
    const o = partner(crew, m);
    return !!o && available(o);
  };
  const due = () => !!s.greet || (!!d.incoming && d.ready && d.incoming !== m.id) || (s.primary && !d.incoming && (sim.now >= s.shiftEnd || s.wantPray) && canSwap());
  if (ch.rng() < 0.16) {
    // o telefone do balcão
    steps.push(
      {
        t: 'do',
        fn: () => {
          s.doing = 'phone';
          ch.chatEmoji = '📞';
          ch.chatUntil = sim.now + 1400;
        },
      },
      { t: 'until', cond: due, minMs: 2500, maxMs: Math.round(between(ch.rng, 3500, 6500)), pose: 'talk', held: 'phone', dir: chair.dir },
    );
  } else {
    steps.push({ t: 'do', fn: () => (s.doing = 'desk') }, { t: 'until', cond: due, minMs: 600, maxMs: Math.round(between(ch.rng, 6000, 12_000)), pose: 'type', dir: chair.dir });
  }
  ch.queue.push(...steps);
  return true;
}

/** Fora do balcão: vindo assumir, em pausa ou (a substituta) organizando a papelada atrás do balcão. */
function offThink(crew: StaffCrew, m: Clerk, chair: SpotDef, now: number): boolean {
  const ch = m.ch;
  const s = m.state;
  const d = deskOf(crew);
  const { swap, back } = spots(crew);
  const steps: Step[] = [];
  if (d.incoming === m.id) {
    // vem assumir: espera ao lado da cadeira até a outra pessoa levantar
    s.doing = 'swap';
    if (ch.atSpot) steps.push({ t: 'exit' });
    const at = swap ?? chair;
    if (!d.ready) {
      steps.push({ t: 'go', tx: at.tx, ty: at.ty, fx: swap ? at.x : undefined, fy: swap ? at.y : undefined, dir: at.dir }, { t: 'do', fn: () => d.incoming === m.id && (d.ready = true) });
    }
    steps.push({ t: 'until', cond: () => d.holder === m.id || d.incoming !== m.id, minMs: 200, maxMs: 30_000, pose: 'stand', dir: swap ? swap.dir : 'down' });
    ch.queue.push(...steps);
    return true;
  }
  if (s.primary) {
    if (s.breakPending) {
      s.breakPending = false;
      return planBreak(crew, m, now);
    }
    // de volta da pausa: assume o balcão (a substituta levanta quando ela chegar)
    if (!d.incoming) {
      d.incoming = m.id;
      d.ready = false;
      return offThink(crew, m, chair, now);
    }
    steps.push({ t: 'until', cond: () => !d.incoming, minMs: 500, maxMs: 4000, pose: 'stand' });
    ch.queue.push(...steps);
    return true;
  }
  // substituta de folga: papelada no arquivo, de olho no balcão
  s.doing = 'back';
  if (back && (ch.atSpot !== back.id || ch.tx !== back.tx || ch.ty !== back.ty)) {
    if (ch.atSpot) steps.push({ t: 'exit' });
    steps.push({ t: 'go', tx: back.tx, ty: back.ty, fx: back.x, fy: back.y, dir: back.dir });
  }
  const r = ch.rng();
  steps.push({
    t: 'until',
    cond: () => d.incoming === m.id,
    minMs: 500,
    maxMs: Math.round(between(ch.rng, 6000, 14_000)),
    pose: r < 0.6 ? 'read' : 'use',
    held: r < 0.6 ? 'papers' : 'none',
    dir: back?.dir ?? 'down',
  });
  ch.queue.push(...steps);
  return true;
}

// ------------------------------------------------------------------ a função

export const RECEPTIONIST: StaffRoleDef<ReceptionState> = {
  role: 'receptionist',
  label: () => tr('Recepcionista'),
  // a recepcionista e a substituta, onde houver balcão com cadeira
  count: (crew) => (crew.base(STAFF_DESK).length ? 2 : 0),
  dress: receptionUniform,

  init: (m, _crew, now) => ({
    primary: m.index === 0,
    shiftEnd: now + between(m.ch.rng, SHIFT_MS[0], SHIFT_MS[1]),
    wantPray: false,
    breakPending: false,
    greet: null,
    doing: m.index === 0 ? 'desk' : 'back',
  }),

  think(m, crew, now) {
    const d = deskOf(crew);
    const { chair } = spots(crew);
    if (!chair) {
      m.ch.queue.push({ t: 'act', pose: 'stand', ms: 4000 });
      return true;
    }
    // ninguém responde pelo balcão (carga inicial, a outra pessoa saiu): a recepcionista, ou quem estiver aqui
    const holder = crew.member(d.holder);
    if (!holder || holder.leaving || holder.ch.gone) {
      const other = partner(crew, m);
      d.holder = m.state.primary || !other ? m.id : other.id;
      d.incoming = null;
      d.ready = false;
    }
    if (d.incoming && !crew.member(d.incoming)) {
      d.incoming = null;
      d.ready = false;
    }
    return d.holder === m.id ? holderThink(crew, m, chair, now) : offThink(crew, m, chair, now);
  },

  settle(m, crew, now) {
    const d = deskOf(crew);
    const { chair, back } = spots(crew);
    const s = m.state;
    s.greet = null;
    s.breakPending = false;
    if (d.incoming === m.id) {
      d.incoming = null;
      d.ready = false;
    }
    // na volta de uma aba oculta, cada um no seu posto: a recepcionista no balcão, a substituta no arquivo
    if (s.primary || !crew.member(d.holder)) d.holder = m.id;
    if (s.shiftEnd < now) s.shiftEnd = now + between(m.ch.rng, SHIFT_MS[0], SHIFT_MS[1]);
    const at = d.holder === m.id ? chair : back;
    if (at) crew.seat(m.ch, at);
    else crew.standNear(m.ch, 8, 5);
    s.doing = d.holder === m.id ? 'desk' : 'back';
  },

  doing(m) {
    if (m.ch.prayer || m.ch.step?.t === 'pray') return tr('Rezando');
    switch (m.state.doing) {
      case 'phone':
        return tr('Atendendo o telefone');
      case 'greet':
        return tr('Cumprimentando quem chega');
      case 'swap':
        return tr('Assumindo o balcão');
      case 'break':
        return tr('Em pausa');
      case 'back':
        return tr('Organizando a papelada');
      default:
        return tr('No balcão da recepção');
    }
  },

  joinPrayer(m, crew) {
    const d = deskOf(crew);
    // a substituta cobre o balcão
    if (!m.state.primary) return false;
    // no balcão: vai depois da troca
    if (d.holder === m.id) {
      m.state.wantPray = true;
      return false;
    }
    if (d.incoming === m.id) {
      d.incoming = null;
      d.ready = false;
    }
    m.state.doing = 'break';
    return true;
  },

  dispose(m, crew) {
    const d = deskOf(crew);
    if (d.incoming === m.id) {
      d.incoming = null;
      d.ready = false;
    }
    if (d.holder === m.id) d.holder = partner(crew, m)?.id ?? null;
  },

  housekeeping(crew, now) {
    // quem está no balcão cumprimenta quem chega pelo elevador ou passa perto (um aceno; cada pessoa de vez em quando)
    const d = deskOf(crew);
    const holder = crew.member(d.holder) as Clerk | undefined;
    const chair = spots(crew).chair;
    if (!holder || !chair || holder.ch.atSpot !== chair.id || holder.state.greet || d.incoming) return;
    for (const [id, at] of d.greeted) if (now - at > GREET_AGAIN_MS * 2) d.greeted.delete(id);
    for (const c of crew.sim.chars.values()) {
      if (c === holder.ch || c.gone || c.inside || c.alpha < 0.6 || now < c.hiddenUntil || c.leaving) continue;
      if (crew.member(c.id)) continue;
      const moving = c.pose === 'walk' || c.pose === 'run' || c.arriving;
      if (!moving || Math.max(Math.abs(c.tx - chair.tx), Math.abs(c.ty - chair.ty)) > GREET_TILES) continue;
      if (now - (d.greeted.get(c.id) ?? -Infinity) < GREET_AGAIN_MS) continue;
      d.greeted.set(c.id, now);
      holder.state.greet = c.id;
      return;
    }
  },
};

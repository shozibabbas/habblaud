// Religiosos da mesquita do campus (uma função da equipe; ver sim/staff.ts): um aalim na ala masculina e uma aalima na
// feminina. Ficam na mesquita quase o tempo todo:
//   - no chamado para a oração, vão para o lugar do imam diante do mihrab e lideram a congregação da sua ala
//     (sim/jamaat.ts); depois, um majlis curto — o aalim sentado no alto do minbar, a aalima diante das mulheres —
//     com quem rezou ouvindo sentado nas fileiras;
//   - no resto do tempo: leem o Alcorão na estante, ficam em reflexão com o tasbih, recebem quem chega à passagem do
//     salão (um aceno e o salaam) e às vezes rezam um nafl.
// Nunca saem do prédio (nem para a limpeza, que trabalha em volta deles). Roupas em art/character/cleric.ts.
import { hash32 } from '../../../../shared/hash';
import { tr } from '../../../../shared/i18n';
import type { AppearanceProfile } from '../../../../shared/types';
import type { Appearance } from '../../art/api';
import { CLERIC_GREET, CLERIC_IMAM, CLERIC_MINBAR, CLERIC_SIT, clericGroup, sectionArea, type MosqueSection } from '../layout/mosque';
import type { SpotDef } from '../layout/types';
import { facing } from './character';
import { jamaatOf, MAJLIS_MS, prayerOver, setTurbah, turbahSpot, type Jamaat } from './jamaat';
import { prayerSequence } from './salat';
import { registerStaffRole, type StaffCrew, type StaffMember, type StaffRoleDef } from './staff';
import type { Step } from './steps';

/** Turbante preto (sayyid) ou branco: escolhido uma vez, de forma determinística (e o nome combina com ele). */
export const SAYYID = hash32('habblaud:aalim') % 2 === 0;

/** Nomes de exibição (curtos; nenhuma pessoa real): o aalim e a aalima. */
export const CLERIC_NAMES = {
  m: SAYYID ? 'Maulana Hassan' : 'Maulana Abbas',
  f: 'Syeda Zahra',
} as const;

type Doing = 'lead' | 'majlis' | 'quran' | 'tasbih' | 'greet' | 'nafl' | 'walk';

export interface ClericState {
  section: MosqueSection;
  doing: Doing;
  /** Alguém que acabou de entrar no salão para cumprimentar. */
  greet: string | null;
  greeted: Map<string, number>;
}

type Cleric = StaffMember<ClericState>;

const sectionOfIndex = (i: number): MosqueSection => (i === 0 ? 'm' : 'f');

/** Roupa: qaba sob a aba e o turbante (aalim); abaya e hijab pretos (aalima). Sapatos ficam na entrada: meias escuras. */
export function clericDress(base: Appearance, _profile: AppearanceProfile | undefined): Appearance {
  const a: Appearance = { ...base, lanyard: null, shoes: '#2a2830', eyes: base.eyes };
  if (a.look === 'f') {
    a.topStyle = 'abaya';
    a.top = '#1e1c22';
    a.topAccent = '#3a3742';
    a.bottom = '#1e1c22';
    a.bottomStyle = 'pants';
    a.accessory = 'hijab';
    a.accessoryColor = '#1e1c22';
    return a;
  }
  a.hairStyle = 'short';
  a.facialHair = 'beard';
  a.topStyle = 'qaba_aba';
  a.top = SAYYID ? '#1f1c21' : '#3b2a20';
  a.topAccent = '#d6cfbf';
  a.bottom = '#d6cfbf';
  a.bottomStyle = 'shalwar';
  a.accessory = 'amama';
  a.accessoryColor = SAYYID ? '#1f1d24' : '#f2efe7';
  return a;
}

function spot(crew: StaffCrew, base: string, section: MosqueSection): SpotDef | undefined {
  return crew.base(clericGroup(base, section))[0];
}

/** Ir até um spot (fino) saindo do lugar atual. */
function goTo(steps: Step[], ch: StaffMember['ch'], s: SpotDef, dir = s.dir): void {
  if (ch.atSpot) steps.push({ t: 'exit' });
  if (s.seated) steps.push({ t: 'go', tx: s.tx, ty: s.ty }, { t: 'enter', spot: s.id });
  else steps.push({ t: 'go', tx: s.tx, ty: s.ty, fx: s.x, fy: s.y, dir });
}

/** Lidera a congregação da ala: no lugar do imam, a turbah no carpete (estilo shia), e o passo 'pray' que puxa todos. */
function planLead(crew: StaffCrew, m: Cleric, j: Jamaat): boolean {
  const sim = crew.sim;
  const ch = m.ch;
  const imam = spot(crew, CLERIC_IMAM, m.state.section);
  if (!imam) return false;
  j.imam = m.id;
  m.state.doing = 'lead';
  const steps: Step[] = [];
  goTo(steps, ch, imam, 'left');
  steps.push(
    { t: 'do', fn: () => j.style === 'shia' && setTurbah(sim, ch, turbahSpot(imam.x, imam.y)) },
    { t: 'pray', seq: [], follow: { j, lead: true } },
    { t: 'do', fn: () => setTurbah(sim, ch, null) },
  );
  ch.queue.push(...steps);
  // depois do salam: o majlis
  ch.queue.push({ t: 'do', fn: () => planMajlis(crew, m, j) });
  return true;
}

/** Majlis/dars depois da oração: o aalim no alto do minbar; a aalima sentada diante das mulheres, virada para elas. */
function planMajlis(crew: StaffCrew, m: Cleric, j: Jamaat): void {
  const sim = crew.sim;
  const ch = m.ch;
  // ninguém rezou junto: sem majlis
  const listeners = [...j.members].filter((id) => sim.chars.get(id)?.prayer).length;
  if (!listeners) {
    j.majlis = 'none';
    return;
  }
  const seat = m.state.section === 'm' ? spot(crew, CLERIC_MINBAR, 'm') : spot(crew, CLERIC_IMAM, 'f');
  if (!seat) {
    j.majlis = 'none';
    return;
  }
  m.state.doing = 'majlis';
  const steps: Step[] = [];
  if (seat.seated) goTo(steps, ch, seat);
  steps.push(
    { t: 'do', fn: () => (j.majlis = { at: sim.now, until: sim.now + MAJLIS_MS }) },
    { t: 'act', pose: 'dars', ms: MAJLIS_MS, dir: 'right', seated: !!seat.seated },
  );
  if (seat.seated) steps.push({ t: 'exit' });
  ch.queue.unshift(...steps);
}

/** O que fazer no tempo livre: Alcorão, tasbih, receber quem chega ou um nafl. */
function planRoutine(crew: StaffCrew, m: Cleric): boolean {
  const sim = crew.sim;
  const ch = m.ch;
  const s = m.state;
  const rng = ch.rng;
  const steps: Step[] = [];
  const area = sectionArea(s.section);
  // alguém acabou de entrar: um aceno e o salaam
  if (s.greet) {
    const t = sim.chars.get(s.greet);
    s.greet = null;
    const g = spot(crew, CLERIC_GREET, s.section);
    if (t && g) {
      s.doing = 'greet';
      goTo(steps, ch, g);
      steps.push(
        {
          t: 'do',
          fn: () => {
            ch.dir = facing(ch.x, ch.y, t.x, t.y);
            ch.sayText = tr('Assalam-o-Alaikum');
            ch.sayAt = sim.now;
            ch.sayUntil = sim.now + 2400;
          },
        },
        { t: 'act', pose: 'raise_hand', ms: 1400 },
        { t: 'act', pose: 'stand', ms: 1500 + rng() * 1500 },
      );
      ch.queue.push(...steps);
      return true;
    }
  }
  const r = rng();
  const shelf = sim.spots.ofKind('shelf').find((p) => p.areaId === area && sim.spots.isFree(p.id, m.id));
  if (r < 0.4 && shelf && sim.reserveTemp(ch, shelf)) {
    s.doing = 'quran';
    goTo(steps, ch, shelf);
    steps.push({ t: 'act', pose: 'read', held: 'book', ms: 14_000 + rng() * 12_000 }, { t: 'do', fn: () => sim.spots.release(shelf.id, m.id) });
  } else if (r < 0.75) {
    const sit = spot(crew, CLERIC_SIT, s.section);
    if (!sit) return false;
    s.doing = 'tasbih';
    goTo(steps, ch, sit);
    steps.push({ t: 'act', pose: 'jalsa', held: 'tasbih', ms: 16_000 + rng() * 14_000, dir: sit.dir });
  } else if (r < 0.9) {
    const g = spot(crew, CLERIC_GREET, s.section);
    if (!g) return false;
    // esperando à passagem do salão, para receber quem vier
    s.doing = 'greet';
    goTo(steps, ch, g);
    steps.push({ t: 'until', cond: () => !!s.greet || !!jamaatOf(sim, s.section), minMs: 3000, maxMs: 12_000 + rng() * 8000, pose: 'stand' });
  } else {
    const imam = spot(crew, CLERIC_IMAM, s.section);
    if (!imam) return false;
    s.doing = 'nafl';
    goTo(steps, ch, imam, 'left');
    steps.push({ t: 'pray', seq: prayerSequence(rng, 2, sim.mosque.style) });
  }
  ch.queue.push(...steps);
  return true;
}

export const CLERIC: StaffRoleDef<ClericState> = {
  role: 'cleric',
  label: () => tr('Religioso da mesquita'),
  // um aalim e uma aalima, onde houver mesquita (campus)
  count: (crew) => (crew.sim.building.campus?.mosque && crew.base(clericGroup(CLERIC_IMAM, 'm')).length ? 2 : 0),
  identity: (_crew, i) => (i === 0 ? { name: CLERIC_NAMES.m, look: 'm' } : { name: CLERIC_NAMES.f, look: 'f' }),
  dress: clericDress,

  init: (m) => ({ section: sectionOfIndex(m.index), doing: 'walk', greet: null, greeted: new Map() }),

  think(m, crew, now) {
    const j = jamaatOf(crew.sim, m.state.section);
    if (j && !prayerOver(j, now) && (!j.imam || j.imam === m.id)) return planLead(crew, m, j);
    return planRoutine(crew, m);
  },

  settle(m, crew) {
    const s = spot(crew, CLERIC_SIT, m.state.section) ?? spot(crew, CLERIC_IMAM, m.state.section);
    if (s) {
      crew.standNear(m.ch, s.tx, s.ty);
      m.ch.x = s.x;
      m.ch.y = s.y;
      m.ch.dir = s.dir;
    }
    m.state.doing = 'tasbih';
  },

  doing(m) {
    switch (m.state.doing) {
      case 'lead':
        return tr('Liderando a oração');
      case 'majlis':
        return m.state.section === 'm' ? tr('Majlis no minbar') : tr('Dando um dars');
      case 'quran':
        return tr('Lendo o Alcorão');
      case 'tasbih':
        return tr('Em reflexão, com o tasbih');
      case 'greet':
        return tr('Recebendo quem chega');
      case 'nafl':
        return tr('Rezando');
      default:
        return null;
    }
  },

  labelOf: (m) => (m.index === 0 ? tr('Aalim') : tr('Aalima')),

  // os religiosos já estão na mesquita: lideram a congregação pelo próprio planejador
  joinPrayer: () => false,

  housekeeping(crew, now) {
    // quem entra no salão da ala é cumprimentado (cada pessoa de vez em quando)
    for (const mm of crew.members.values()) {
      if (mm.role !== 'cleric') continue;
      const m = mm as Cleric;
      const s = m.state;
      if (s.greet || s.doing === 'lead' || s.doing === 'majlis' || m.ch.step?.t === 'pray') continue;
      const g = spot(crew, CLERIC_GREET, s.section);
      if (!g) continue;
      for (const [id, at] of s.greeted) if (now - at > 600_000) s.greeted.delete(id);
      for (const c of crew.sim.chars.values()) {
        if (c === m.ch || c.gone || !c.prayer || c.prayer.section !== s.section || crew.member(c.id)) continue;
        if (Math.max(Math.abs(c.tx - g.tx), Math.abs(c.ty - g.ty)) > 3 || (c.pose !== 'walk' && c.pose !== 'run')) continue;
        if (s.greeted.has(c.id)) continue;
        s.greeted.set(c.id, now);
        s.greet = c.id;
        // no tasbih ou esperando à passagem: levanta para cumprimentar
        if (m.ch.step?.t === 'act' || m.ch.step?.t === 'until') crew.sim.interrupt(m.ch);
        break;
      }
    }
  },
};

registerStaffRole(CLERIC);

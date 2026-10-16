// O dono do escritório (uma função da equipe; ver sim/staff.ts): no campus com `meta.owner`, ele mesmo, com o nome, o
// visual e as peças da configuração, na sala da diretoria (layout/ceo.ts). Não é agente: não conta, não entra no
// store, e as regras dos agentes (trabalhando, precisa de você) não valem para ele: ninguém o interrompe.
//
// O dia dele é um sorteio com pesos (CEO_WEIGHTS), como o ócio dos agentes, com intervalos mínimos entre as coisas
// grandes (reunião, ronda, chai, jogo, mesquita):
//   desk     no MacBook e no Studio Display, sentado (exec_desk 0, ceo_desk)
//   stand    a mesa sobe (exec_desk 1, com o zumbido do motor), a cadeira rola para o lado: digita em pé (ceo_stand)
//   phone    o celular toca (som baixinho) e ele atende sentado, com o 📞
//   pace     atende e anda de um lado para o outro diante da janela (phone_walk entre os dois ceo_call)
//   video    videochamada com o headset (camada temporária de sim/wear.ts) e a chamada na tela
//   meeting  chama 1–3 agentes livres (ociosos, na mesa, sem nada planejado) para a mesa oval: eles vêm até a antessala,
//            a secretária os recebe e anuncia na porta, sentam (ceo_meeting) e conversam uns minutos; depois voltam
//   chai     no bar de chai e café (vapor, o tilintar da xícara) e bebe olhando a janela ou de volta à mesa
//   rounds   ronda pelo campus: para na mesa de 2–4 agentes para um dedo de prosa (quem trabalha segue digitando),
//            passa na recepção e na equipe da limpeza, e volta
//   game/tv/kitchen  por conta própria: pingue-pongue ou tênis, a TV do lounge, um papo na copa, com agentes livres
//   pray     vai à mesquita (ala masculina, topi) de vez em quando
// O menu Atividades também o leva (send-all.ts + StaffCrew.forActivity): chamado para a oração, chai, jogos, TV,
// passeio e "de volta às mesas" (que o segura no escritório por DESK_HOLD_MS). Cigarro só com `owner.smokes`.
// À noite (19h–6h pelo relógio do ciclo dia/noite, Sim.hour) ele fica até tarde: mesa, ligações e chai, com a
// luminária da mesa acesa (render/ceo.ts); nada de ronda, jogo ou reunião por conta própria (CEO_NIGHT_WEIGHTS).
import { tr } from '../../../../shared/i18n';
import type { AppearanceParts } from '../../../../shared/appearance';
import type { OwnerInfo } from '../../../../shared/types';
import type { Appearance, Dir, ScreenMode } from '../../art/api';
import { FOOT_DX, FOOT_DY, TILE } from '../constants';
import { STAFF_DESK, STAFF_REST } from '../layout/staff';
import type { SpotDef, TileRect } from '../layout/types';
import { fill, pick, type Pool } from '../social/lines';
import type { Character } from './character';
import { facing } from './character';
import { planPrayerVisit } from './prayer';
import type { SendActivity } from './send-all';
import type { Sim } from './sim';
import type { StaffCrew, StaffIdentity, StaffMember, StaffRoleDef } from './staff';
import type { Step } from './steps';
import { putOn, takeOff } from './wear';

export const CEO_ROLE = 'ceo';
/** Camada do headset das videochamadas (sim/wear.ts). */
export const WEAR_HEADSET = 'ceo:headset';
/** Depois de "de volta às mesas", fica no escritório por este tempo (o mesmo dos agentes, send-all.ts). */
const DESK_HOLD_MS = 2 * 60_000;

/** Terno padrão de quem não escolheu a roupa (o resto das peças vem da semente). */
const SUIT: AppearanceParts = { topStyle: 'suit', top: '#3d4352', topAccent: '#c0392b', bottom: '#3d4352', bottomStyle: 'pants' };

// ------------------------------------------------------------------ a rotina

export type CeoActivity = 'desk' | 'stand' | 'phone' | 'pace' | 'video' | 'meeting' | 'chai' | 'rounds' | 'game' | 'tv' | 'kitchen' | 'pray';

/** Pesos do sorteio de dia. */
export const CEO_WEIGHTS: Readonly<Record<CeoActivity, number>> = { desk: 24, stand: 15, phone: 10, pace: 8, video: 8, meeting: 10, chai: 6, rounds: 9, game: 4, tv: 2, kitchen: 3, pray: 1 };
/** À noite: até tarde na mesa (ligações, videochamadas, chai); nada de ronda, jogo ou reunião por conta própria. */
export const CEO_NIGHT_WEIGHTS: Readonly<Record<CeoActivity, number>> = { desk: 34, stand: 14, phone: 10, pace: 6, video: 12, meeting: 0, chai: 8, rounds: 0, game: 0, tv: 0, kitchen: 0, pray: 1 };
/** Intervalo mínimo (ms) até repetir as coisas grandes (sorteado entre os dois). */
export const CEO_COOLDOWN_MS: Readonly<Partial<Record<CeoActivity, readonly [number, number]>>> = {
  meeting: [240_000, 480_000],
  rounds: [300_000, 600_000],
  chai: [240_000, 420_000],
  game: [480_000, 900_000],
  tv: [480_000, 900_000],
  kitchen: [360_000, 720_000],
  pray: [1_500_000, 2_700_000],
};
/** Duração (ms) de cada bloco de trabalho na mesa, e das ligações. */
const DESK_MS: readonly [number, number] = [20_000, 45_000];
const STAND_MS: readonly [number, number] = [25_000, 50_000];
const CALL_MS: readonly [number, number] = [18_000, 40_000];
const VIDEO_MS: readonly [number, number] = [35_000, 70_000];
/** Reunião: conversa de 2 a 4 minutos depois que todos sentam. */
export const MEETING_MS: readonly [number, number] = [120_000, 240_000];
/** O motor da mesa (ms) entre as duas alturas. */
const DESK_MOVE_MS = 1_500;
/** Noite pelo relógio do ciclo dia/noite. */
export const NIGHT_FROM = 19;
export const NIGHT_UNTIL = 6;

type Doing = 'desk' | 'stand' | 'phone' | 'video' | 'meeting' | 'chai' | 'rounds' | 'visit' | 'away';

export interface CeoState {
  doing: Doing;
  last: CeoActivity | null;
  /** Próxima atividade forçada (menu Atividades "de volta às mesas", depuração). */
  next: CeoActivity | null;
  /** Ligação em andamento (a tela da mesa e o headset seguem isto). */
  call: 'phone' | 'video' | null;
  /** A secretária trouxe o chai: bebe na próxima. */
  cup: boolean;
  /** Algo novo para reagir: encurta a espera atual (o chai chegou, a reunião foi anunciada). */
  poke: boolean;
  /** Fica no escritório até isto ("de volta às mesas"). */
  holdUntil: number;
  /** Último chai (dele ou trazido). */
  chaiAt: number;
  /** Quando cada coisa grande pode voltar. */
  readyAt: Partial<Record<CeoActivity, number>>;
  /** Com quem está conversando (ronda). */
  visiting: string | null;
}

type Boss = StaffMember<CeoState>;

const between = (rng: () => number, a: number, b: number) => a + rng() * (b - a);
const span = (rng: () => number, r: readonly [number, number]) => Math.round(between(rng, r[0], r[1]));

/** Noite no relógio do mundo (Sim.hour, atualizado pela iluminação). */
export function isNight(hour: number): boolean {
  return hour >= NIGHT_FROM || hour < NIGHT_UNTIL;
}

/** Sorteio com pesos (puro). Sem nada com peso, null. */
export function pickWeighted<K extends string>(rng: () => number, weights: Readonly<Partial<Record<K, number>>>): K | null {
  let total = 0;
  for (const k in weights) total += Math.max(0, weights[k] ?? 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const k in weights) {
    r -= Math.max(0, weights[k] ?? 0);
    if (r < 0) return k;
  }
  return null;
}

// ------------------------------------------------------------------ falas

const CEO_LINES = {
  meetingOpen: [tr('Entrem, sentem-se! 🙂'), tr('Obrigado por virem. Vamos lá?'), tr('Bem-vindos! Vamos começar?')],
  meeting: [
    tr('Como está o andamento?'),
    tr('Qual é o maior bloqueio agora?'),
    tr('Ótimo trabalho nessa entrega 👏'),
    tr('Vamos priorizar isso.'),
    tr('Precisam de mais alguma coisa de mim?'),
    tr('E o prazo, está de pé?'),
    tr('Me mostrem os números 📊'),
    tr('Vamos simplificar.'),
    tr('Gostei da ideia 💡'),
  ],
  meetingClose: [tr('Perfeito, mãos à obra! 💪'), tr('Ótima reunião. Obrigado!'), tr('Combinado. Me mantenham informado.')],
  rounds: [tr('Como vai, {nome}?'), tr('Tudo certo por aqui, {nome}?'), tr('Bom trabalho, {nome}! 👍'), tr('Precisa de alguma coisa, {nome}?'), tr('Como está o projeto?')],
  roundsMore: [tr('Continue assim! 💪'), tr('Qualquer coisa, me chame.'), tr('Ótimo. Vamos em frente!')],
  staff: [tr('Tudo em ordem por aqui?'), tr('Bom trabalho! 👏'), tr('Está tudo brilhando! ✨'), tr('Bom dia, {nome}!')],
  phone: [tr('Pode mandar o contrato.'), tr('Fechado, vamos em frente.'), tr('Me liga depois da reunião.'), tr('Qual é o status?'), tr('Ótimo, ótimo…')],
  video: [tr('Estão me ouvindo? 🎧'), tr('Podem compartilhar a tela?'), tr('Próximo slide, por favor.'), tr('Concordo. Vamos aprovar.')],
  thanks: [tr('Obrigado, {nome}! ☕'), tr('Perfeito, obrigado! ☕')],
} satisfies Record<string, Pool>;

const GUEST_LINES = {
  meeting: [
    tr('Os testes estão passando ✅'),
    tr('Falta pouco para o deploy 🚀'),
    tr('Encontrei um bug chato 🐛'),
    tr('Refatorei o módulo inteiro'),
    tr('Já está em revisão'),
    tr('Precisamos de mais uma semana'),
    tr('O cliente adorou!'),
    tr('Tenho uma proposta 💡'),
    tr('Os números subiram 📈'),
  ],
  reply: [tr('Tudo ótimo! 👍'), tr('Indo bem, chefe!'), tr('Quase pronto!'), tr('Tudo sob controle 😅'), tr('Pode deixar! 🙂')],
  staffReply: [tr('Tudo em ordem! 🙂'), tr('Tudo tranquilo por aqui!'), tr('Pode deixar! 👍')],
} satisfies Record<string, Pool>;

export { CEO_LINES, GUEST_LINES };

// ------------------------------------------------------------------ a suíte (estado dividido com a secretária)

export interface Meeting {
  host: string;
  /** Agentes convidados (os que ainda estão vindo ou sentados). */
  guests: string[];
  /** Cadeira de cada um (inclui o dono). */
  seats: Map<string, string>;
  /** Onde cada convidado espera na antessala e diante da porta da sala. */
  wait: Map<string, { x: number; y: number }>;
  door: Map<string, { x: number; y: number }>;
  /** Chegaram à antessala. */
  arrived: Set<string>;
  /**
   * arriving: vindo para a antessala; escort: a secretária os leva até a porta; announced: anunciados, entrando;
   * talk: todos sentados conversando; done: acabou (todos voltam).
   */
  phase: 'arriving' | 'escort' | 'announced' | 'talk' | 'done';
  startedAt: number;
  /** Fim da conversa (fase talk). */
  until: number;
  nextLineAt: number;
  lastSpeaker: string | null;
  lastLine: string | null;
}

export interface Suite {
  meeting: Meeting | null;
}

const suites = new WeakMap<StaffCrew, Suite>();

export function suiteOf(crew: StaffCrew): Suite {
  let s = suites.get(crew);
  if (!s) suites.set(crew, (s = { meeting: null }));
  return s;
}

/** O dono (presente e trabalhando), se houver. */
export function bossOf(crew: StaffCrew): Boss | undefined {
  for (const m of crew.members.values()) if (m.role === CEO_ROLE && !m.leaving && !m.ch.gone) return m as Boss;
  return undefined;
}

/** A secretária está trazendo um chai para ele. */
function chaiComing(crew: StaffCrew): boolean {
  for (const x of crew.members.values()) if (x.role === 'secretary' && !x.leaving && (x.state as { doing?: string }).doing === 'chai') return true;
  return false;
}

/** Retângulos da diretoria (antessala e sala), se existir. */
export function suiteRects(sim: Sim): { reception: TileRect; office: TileRect; rect: TileRect } | null {
  const c = sim.building.campus?.ceo;
  return c ? { reception: c.reception, office: c.office, rect: c.rect } : null;
}

export const inRect = (r: TileRect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/**
 * O dono está fora da diretoria agora (ronda, atividade, mesquita) ou não existe. A secretária só sai para uma pausa
 * assim (a antessala nunca fica sem ninguém com ele na sala).
 */
export function bossAway(crew: StaffCrew): boolean {
  const b = bossOf(crew);
  const r = suiteRects(crew.sim);
  if (!b || !r) return true;
  return !inRect(r.rect, b.ch.tx, b.ch.ty) || !!b.ch.gathering || !!b.ch.prayer;
}

// ------------------------------------------------------------------ utilidades

interface CeoSpots {
  desk?: SpotDef;
  stand?: SpotDef;
  calls: SpotDef[];
  coffee?: SpotDef;
  meeting: SpotDef[];
}

function ceoSpots(sim: Sim): CeoSpots {
  const of = (k: SpotDef['kind']) => [...sim.spots.ofKind(k)].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  return { desk: of('ceo_desk')[0], stand: of('ceo_stand')[0], calls: of('ceo_call'), coffee: of('ceo_coffee')[0], meeting: of('ceo_meeting') };
}

/** Os lugares que são só dele (mesa sentado e em pé, a janela, o bar): reservados no nome dele. */
function claimOwn(crew: StaffCrew, m: Boss): CeoSpots {
  const sp = ceoSpots(crew.sim);
  for (const s of [sp.desk, sp.stand, sp.coffee, ...sp.calls]) if (s) crew.sim.spots.reserve(s.id, m.id);
  return sp;
}

/** Agentes livres para um convite: ociosos, na própria mesa, sem nada planejado (nunca quem trabalha ou espera). */
export function freeAgents(crew: StaffCrew, now: number): Character[] {
  const out: Character[] = [];
  for (const c of crew.sim.chars.values()) {
    if (crew.member(c.id) || c.mode !== 'idle') continue;
    if (crew.sim.social.canJoin(c, now)) out.push(c);
  }
  return out;
}

/** Até `n` tiles livres (caminháveis, sem ninguém, fora de `taken`) em anéis ao redor de (x, y), a partir do anel `minR`. */
export function tilesNear(sim: Sim, x: number, y: number, n: number, taken: Set<number>, by: string, minR = 0, within?: TileRect): { x: number; y: number }[] {
  const grid = sim.building.grid;
  const busy = sim.busyTiles(by);
  const out: { x: number; y: number }[] = [];
  for (let r = minR; r <= 5 && out.length < n; r++) {
    for (let dy = -r; dy <= r && out.length < n; dy++) {
      for (let dx = -r; dx <= r && out.length < n; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (within && !inRect(within, tx, ty)) continue;
        const k = grid.key(tx, ty);
        if (grid.get(tx, ty) === 0 || busy.has(k) || taken.has(k)) continue;
        taken.add(k);
        out.push({ x: tx, y: ty });
      }
    }
  }
  return out;
}

const tileX = (tx: number) => tx * TILE + FOOT_DX;
const tileY = (ty: number) => ty * TILE + FOOT_DY;
/** Direção de quem está no tile (tx, ty) olhando para `c`. */
const lookAt = (tx: number, ty: number, c: { x: number; y: number }): Dir => facing(tileX(tx), tileY(ty), c.x, c.y);

function say(crew: StaffCrew, ch: Character, text: string): void {
  crew.sim.social.say(ch, text, crew.now);
}

function firstName(name: string): string {
  return name.split(/\s+/)[0] || name;
}

/** Fim de qualquer ligação: tira o headset (a fila nova sempre começa sem chamada). */
function hangUp(m: Boss): void {
  m.state.call = null;
  takeOff(m.ch, WEAR_HEADSET);
}

/** Encerra a reunião dele (o plano foi trocado: atividade, oração, saída). Os convidados voltam para a mesa. */
export function endMeeting(crew: StaffCrew): void {
  const s = suiteOf(crew);
  if (s.meeting) s.meeting.phase = 'done';
  s.meeting = null;
}

/** Larga o que estava fazendo (chamada, reunião) antes de outro plano assumir. */
function relax(crew: StaffCrew, m: Boss): void {
  hangUp(m);
  m.state.visiting = null;
  m.state.cup = false;
  const meet = suiteOf(crew).meeting;
  if (meet && meet.host === m.id) endMeeting(crew);
}

// ------------------------------------------------------------------ a mesa

/**
 * Leva o dono à mesa, sentado ou em pé: muda a altura da mesa (com o motor) quando precisa. A cadeira rola para o
 * lado sozinha com a mesa alta (render/ceo.ts).
 */
function toDesk(crew: StaffCrew, m: Boss, sp: CeoSpots, standing: boolean, steps: Step[]): SpotDef | null {
  const sim = crew.sim;
  const ch = m.ch;
  const target = standing ? sp.stand : sp.desk;
  const desk = sp.desk?.deskId ?? sp.stand?.deskId;
  if (!target) return null;
  // `atSpot` do momento em que este trecho roda (o plano pode vir depois de outros passos)
  const there = steps.length === 0 && ch.atSpot === target.id && !ch.step && !ch.queue.length;
  if (there) return target;
  const want = standing ? 1 : 0;
  if (steps.length === 0 && ch.atSpot) steps.push({ t: 'exit' });
  steps.push({ t: 'go', tx: target.tx, ty: target.ty });
  // ninguém mais mexe na altura da mesa: dá para decidir agora
  if (desk && (sim.furnStates.get(desk) ?? 0) !== want) {
    steps.push(
      {
        t: 'do',
        fn: () => {
          sim.furnStates.set(desk, want);
          crew.cue('deskHum', ch);
        },
      },
      // espera o motor de pé ao lado
      { t: 'act', pose: 'stand', ms: DESK_MOVE_MS, dir: 'up' },
    );
  }
  steps.push({ t: 'enter', spot: target.id });
  return target;
}

/** Bloco de trabalho na mesa (sentado ou em pé), com pausas curtas para o celular ou um papel. */
function deskWork(crew: StaffCrew, m: Boss, sp: CeoSpots, standing: boolean, ms: number, steps: Step[]): void {
  const ch = m.ch;
  const s = m.state;
  const spot = toDesk(crew, m, sp, standing, steps);
  const due = () => s.poke || !!s.next;
  steps.push({ t: 'do', fn: () => (s.doing = standing ? 'stand' : 'desk') });
  let left = ms;
  while (left > 0) {
    const part = Math.min(left, Math.round(between(ch.rng, 8_000, 18_000)));
    left -= part;
    const r = ch.rng();
    if (r < 0.14) steps.push({ t: 'until', cond: due, minMs: 0, maxMs: Math.min(part, 5_000), pose: 'read', held: 'phone', dir: 'up' });
    else if (r < 0.22 && !standing) steps.push({ t: 'until', cond: due, minMs: 0, maxMs: Math.min(part, 6_000), pose: 'read', held: 'papers', dir: 'up' });
    else steps.push({ t: 'until', cond: due, minMs: 0, maxMs: part, pose: standing ? 'type_stand' : 'type', dir: 'up' });
  }
  void spot;
}

// ------------------------------------------------------------------ planos

function planDesk(crew: StaffCrew, m: Boss, sp: CeoSpots, standing: boolean, ms?: number): boolean {
  const steps: Step[] = [];
  deskWork(crew, m, sp, standing, ms ?? span(m.ch.rng, standing ? STAND_MS : DESK_MS), steps);
  m.ch.queue.push(...steps);
  return true;
}

/** O celular toca baixinho e ele atende. */
function ring(crew: StaffCrew, m: Boss, steps: Step[], seated: boolean): void {
  const ch = m.ch;
  steps.push(
    {
      t: 'do',
      fn: () => {
        crew.cue('ring', ch);
        ch.chatEmoji = '📞';
        ch.chatUntil = crew.now + 2_400;
      },
    },
    { t: 'act', pose: seated ? 'sit' : 'stand', ms: 1_600, dir: 'up', seated },
  );
}

function planPhone(crew: StaffCrew, m: Boss, sp: CeoSpots): boolean {
  const ch = m.ch;
  const s = m.state;
  const steps: Step[] = [];
  toDesk(crew, m, sp, false, steps);
  ring(crew, m, steps, true);
  steps.push({ t: 'do', fn: () => ((s.call = 'phone'), (s.doing = 'phone')) });
  let left = span(ch.rng, CALL_MS);
  while (left > 0) {
    const part = Math.min(left, Math.round(between(ch.rng, 5_000, 9_000)));
    left -= part;
    if (ch.rng() < 0.45) steps.push({ t: 'do', fn: () => say(crew, ch, pick(CEO_LINES.phone, ch.rng)) });
    steps.push({ t: 'act', pose: 'phone', ms: part, dir: 'up', seated: true });
  }
  steps.push({ t: 'do', fn: () => hangUp(m) });
  ch.queue.push(...steps);
  return true;
}

function planPace(crew: StaffCrew, m: Boss, sp: CeoSpots): boolean {
  const ch = m.ch;
  const s = m.state;
  const [a, b] = sp.calls;
  if (!a) return planPhone(crew, m, sp);
  const steps: Step[] = [];
  const seated = ch.seated;
  ring(crew, m, steps, seated);
  steps.push({ t: 'do', fn: () => ((s.call = 'phone'), (s.doing = 'phone')) });
  if (ch.atSpot) steps.push({ t: 'exit' });
  const legs = 3 + Math.floor(ch.rng() * 3);
  for (let i = 0; i <= legs; i++) {
    const at = i % 2 === 0 || !b ? a : b;
    steps.push({ t: 'go', tx: at.tx, ty: at.ty, fx: at.x, fy: at.y, dir: 'up', walkPose: 'phone_walk' });
    if (ch.rng() < 0.4) steps.push({ t: 'do', fn: () => say(crew, ch, pick(CEO_LINES.phone, ch.rng)) });
    steps.push({ t: 'act', pose: 'phone', ms: Math.round(between(ch.rng, 3_500, 7_500)), dir: ch.rng() < 0.7 ? 'up' : 'down' });
  }
  steps.push({ t: 'do', fn: () => hangUp(m) });
  ch.queue.push(...steps);
  return true;
}

function planVideo(crew: StaffCrew, m: Boss, sp: CeoSpots): boolean {
  const ch = m.ch;
  const s = m.state;
  // na altura em que a mesa estiver (ninguém sobe a mesa só para atender); às vezes levanta para falar em pé
  const desk = sp.desk?.deskId;
  const standing = (!!desk && (crew.sim.furnStates.get(desk) ?? 0) === 1) || ch.rng() < 0.2;
  const steps: Step[] = [];
  toDesk(crew, m, sp, standing, steps);
  ring(crew, m, steps, !standing);
  steps.push({
    t: 'do',
    fn: () => {
      s.call = 'video';
      s.doing = 'video';
      putOn(ch, WEAR_HEADSET, { accessory: 'headset', accessoryColor: '#2b2b33' });
    },
  });
  let left = span(ch.rng, VIDEO_MS);
  while (left > 0) {
    const part = Math.min(left, Math.round(between(ch.rng, 4_000, 9_000)));
    left -= part;
    const r = ch.rng();
    // de vez em quando gira na cadeira (ou dá meia-volta em pé) enquanto fala
    const dir: Dir = ch.rng() < 0.3 ? (ch.rng() < 0.5 ? 'left' : 'right') : 'up';
    if (r < 0.4) {
      steps.push({ t: 'do', fn: () => say(crew, ch, pick(CEO_LINES.video, ch.rng)) }, { t: 'act', pose: 'talk', ms: part, dir, seated: !standing });
    } else if (r < 0.55) steps.push({ t: 'act', pose: 'laugh', ms: Math.min(part, 2_400), dir, seated: !standing });
    else steps.push({ t: 'act', pose: standing ? 'stand' : 'sit', ms: part, dir: 'up', seated: !standing });
  }
  steps.push({ t: 'do', fn: () => hangUp(m) });
  ch.queue.push(...steps);
  return true;
}

/** Chai no bar da sala: vapor, a xícara, e bebe olhando a janela ou de volta à mesa. */
function planChai(crew: StaffCrew, m: Boss, sp: CeoSpots): boolean {
  const ch = m.ch;
  const s = m.state;
  const bar = sp.coffee;
  if (!bar) return false;
  const steps: Step[] = [];
  if (ch.atSpot) steps.push({ t: 'exit' });
  steps.push(
    { t: 'go', tx: bar.tx, ty: bar.ty, fx: bar.x, fy: bar.y, dir: bar.dir },
    { t: 'do', fn: () => ((s.doing = 'chai'), (s.chaiAt = crew.now)) },
    { t: 'act', pose: 'use', ms: 2_400, machine: bar.furnitureId, icon: 'coffee', dir: bar.dir },
    { t: 'do', fn: () => crew.cue('cup', ch) },
    { t: 'act', pose: 'drink', held: 'coffee', ms: Math.round(between(ch.rng, 3_000, 5_000)), dir: 'down' },
  );
  const view = sp.calls[Math.floor(ch.rng() * sp.calls.length)];
  if (view && ch.rng() < 0.5) {
    // à janela, de chai na mão
    steps.push({ t: 'go', tx: view.tx, ty: view.ty, fx: view.x, fy: view.y, dir: 'up', held: 'coffee' });
    for (let i = 0; i < 3; i++) steps.push({ t: 'act', pose: i % 2 ? 'stand' : 'drink', held: 'coffee', ms: Math.round(between(ch.rng, 3_000, 6_000)), dir: 'up' });
  } else {
    const desk = sp.desk;
    if (desk && (crew.sim.furnStates.get(desk.deskId ?? '') ?? 0) === 0) {
      steps.push({ t: 'go', tx: desk.tx, ty: desk.ty, held: 'coffee' }, { t: 'enter', spot: desk.id });
      for (let i = 0; i < 3; i++) steps.push({ t: 'act', pose: i % 2 ? 'sit' : 'drink', held: 'coffee', ms: Math.round(between(ch.rng, 3_000, 6_000)), dir: 'up', seated: true });
    } else steps.push({ t: 'act', pose: 'drink', held: 'coffee', ms: 4_000, dir: 'down' });
  }
  steps.push({ t: 'do', fn: () => crew.cue('cup', ch) });
  ch.queue.push(...steps);
  return true;
}

/** O chai que a secretária trouxe: agradece e bebe na mesa. */
function planCup(crew: StaffCrew, m: Boss, sp: CeoSpots, secretary: string | undefined): boolean {
  const ch = m.ch;
  const s = m.state;
  s.cup = false;
  s.chaiAt = crew.now;
  const seated = ch.seated;
  const steps: Step[] = [
    { t: 'do', fn: () => ((s.doing = 'chai'), say(crew, ch, pick(CEO_LINES.thanks, ch.rng, { nome: secretary ? firstName(secretary) : undefined }))) },
    { t: 'act', pose: 'drink', held: 'coffee', ms: 3_500, dir: 'up', seated },
    { t: 'do', fn: () => crew.cue('cup', ch) },
    { t: 'act', pose: seated ? 'sit' : 'stand', held: 'coffee', ms: Math.round(between(ch.rng, 5_000, 9_000)), dir: 'up', seated },
    { t: 'act', pose: 'drink', held: 'coffee', ms: 3_500, dir: 'up', seated },
  ];
  ch.queue.push(...steps);
  void sp;
  return true;
}

// ------------------------------------------------------------------ reunião

/** Convida 1–3 agentes livres para a mesa oval. false = ninguém livre (ou sem mesa). */
export function planMeeting(crew: StaffCrew, m: Boss, sp: CeoSpots, now: number, want?: number): boolean {
  const sim = crew.sim;
  const ch = m.ch;
  const suite = suiteOf(crew);
  const rects = suiteRects(sim);
  if (suite.meeting || !rects || sp.meeting.length < 2) return false;
  const free = freeAgents(crew, now);
  if (!free.length) return false;
  const n = Math.min(free.length, sp.meeting.length - 1, want ?? 1 + Math.floor(ch.rng() * 3));
  // os mais perto primeiro (ninguém atravessa o campus inteiro para uma reunião de três minutos)
  free.sort((a, b) => Math.abs(a.tx - ch.tx) + Math.abs(a.ty - ch.ty) - (Math.abs(b.tx - ch.tx) + Math.abs(b.ty - ch.ty)));
  const guests = free.slice(0, n);
  const chairs = sp.meeting.filter((c) => sim.spots.isFree(c.id, m.id));
  if (chairs.length < guests.length + 1 || !sim.reserveTemp(ch, chairs[0])) return false;
  const meet: Meeting = {
    host: m.id,
    guests: [],
    seats: new Map([[m.id, chairs[0].id]]),
    wait: new Map(),
    door: new Map(),
    arrived: new Set(),
    phase: 'arriving',
    startedAt: now,
    until: 0,
    nextLineAt: 0,
    lastSpeaker: null,
    lastLine: null,
  };
  const r = rects.reception;
  const taken = new Set<number>();
  const doorSpot = sim.spots.ofKind('ceo_door')[0];
  // a secretária anuncia de pé no lugar da porta
  if (doorSpot) taken.add(sim.building.grid.key(doorSpot.tx, doorSpot.ty));
  const waits = tilesNear(sim, r.x + 5, r.y + r.h - 4, guests.length, taken, m.id, 0, r);
  const doors = doorSpot ? tilesNear(sim, doorSpot.tx - 1, doorSpot.ty, guests.length, taken, m.id, 0, r) : [];
  guests.forEach((g, i) => {
    const chair = chairs[i + 1];
    if (!sim.reserveTemp(g, chair)) return;
    meet.guests.push(g.id);
    meet.seats.set(g.id, chair.id);
    const w = waits[i] ?? { x: r.x + 5, y: r.y + r.h - 3 };
    const d = doors[i] ?? w;
    meet.wait.set(g.id, w);
    meet.door.set(g.id, d);
    planGuest(crew, meet, g, chair, w, d);
  });
  if (!meet.guests.length) {
    sim.releaseTemp(ch);
    return false;
  }
  suite.meeting = meet;
  const s = m.state;
  const chair = chairs[0];
  const steps: Step[] = [];
  // trabalha na mesa até a secretária anunciar os convidados, depois vai para a mesa oval
  deskWork(crew, m, sp, false, 0, steps);
  steps.push(
    { t: 'do', fn: () => (s.doing = 'desk') },
    { t: 'until', cond: () => meet.phase !== 'arriving' && meet.phase !== 'escort', minMs: 0, maxMs: 120_000, pose: 'type', dir: 'up' },
    { t: 'do', fn: () => (s.doing = 'meeting') },
    { t: 'exit' },
    { t: 'go', tx: chair.tx, ty: chair.ty },
    { t: 'enter', spot: chair.id },
    {
      t: 'do',
      fn: () => {
        say(crew, ch, pick(CEO_LINES.meetingOpen, ch.rng));
        if (meet.phase === 'arriving' || meet.phase === 'escort') meet.phase = 'announced';
      },
    },
    // a conversa começa quando todos sentam (ou depois de um tempo); termina na hora marcada
    { t: 'until', cond: () => meet.phase === 'done', minMs: 0, maxMs: 6 * 60_000, pose: 'sit' },
    { t: 'do', fn: () => say(crew, ch, pick(CEO_LINES.meetingClose, ch.rng)) },
    { t: 'act', pose: 'talk', ms: 2_000, seated: true, dir: chair.dir },
    { t: 'exit' },
    { t: 'do', fn: () => (sim.spots.release(chair.id, m.id), suite.meeting === meet && (suite.meeting = null)) },
  );
  ch.queue.push(...steps);
  void s;
  return true;
}

/** O convidado: vai até a antessala, espera a secretária, entra quando anunciado, senta e volta para a mesa no fim. */
function planGuest(crew: StaffCrew, meet: Meeting, g: Character, chair: SpotDef, wait: { x: number; y: number }, door: { x: number; y: number }): void {
  const sim = crew.sim;
  const steps: Step[] = [];
  if (g.atSpot) steps.push({ t: 'exit' });
  steps.push(
    { t: 'go', tx: wait.x, ty: wait.y, dir: 'up' },
    { t: 'do', fn: () => meet.arrived.add(g.id) },
    { t: 'until', cond: () => meet.phase !== 'arriving', minMs: 300, maxMs: 60_000, pose: 'stand', dir: 'up' },
    { t: 'go', tx: door.x, ty: door.y, dir: 'right' },
    { t: 'until', cond: () => meet.phase !== 'arriving' && meet.phase !== 'escort', minMs: 300, maxMs: 30_000, pose: 'stand', dir: 'right' },
    { t: 'go', tx: chair.tx, ty: chair.ty },
    { t: 'enter', spot: chair.id },
    { t: 'until', cond: () => meet.phase === 'done', minMs: 1_000, maxMs: 8 * 60_000, pose: 'sit' },
    { t: 'exit' },
  );
  g.queue.push(...steps);
  sim.pushHome(g, 'none');
}

/** Convidado ainda na reunião (o trabalho pode ter chamado: o plano dele foi descartado e a cadeira, solta). */
function stillIn(crew: StaffCrew, meet: Meeting, id: string): boolean {
  const c = crew.sim.chars.get(id);
  const seat = meet.seats.get(id);
  return !!c && !c.gone && !c.leaving && !!seat && c.tempSpots.includes(seat);
}

/** Diretor da reunião (~1 s): quem saiu, o anúncio sem secretária, a conversa e o fim. */
function runMeeting(crew: StaffCrew, now: number): void {
  const suite = suiteOf(crew);
  const meet = suite.meeting;
  if (!meet) return;
  const boss = crew.member(meet.host) as Boss | undefined;
  if (!boss || boss.leaving || boss.state.doing === 'away' || !boss.ch.tempSpots.includes(meet.seats.get(meet.host) ?? '')) {
    endMeeting(crew);
    return;
  }
  meet.guests = meet.guests.filter((id) => stillIn(crew, meet, id));
  if (!meet.guests.length) {
    meet.phase = 'done';
    return;
  }
  // sem secretária (ou ela não veio): anunciados sozinhos quando chegam
  const hasSecretary = [...crew.members.values()].some((x) => x.role === 'secretary' && !x.leaving && !x.ch.gone && !x.ch.prayer && !x.ch.gathering);
  const allHere = meet.guests.every((id) => meet.arrived.has(id));
  if (meet.phase === 'arriving' && ((allHere && !hasSecretary) || now - meet.startedAt > 90_000)) meet.phase = 'announced';
  if (meet.phase === 'escort' && now - meet.startedAt > 120_000) meet.phase = 'announced';
  const seated = [meet.host, ...meet.guests].filter((id) => {
    const c = crew.sim.chars.get(id);
    return !!c && c.atSpot === meet.seats.get(id);
  });
  if (meet.phase === 'announced' && (seated.length === meet.guests.length + 1 || now - meet.startedAt > 180_000) && seated.includes(meet.host)) {
    meet.phase = 'talk';
    meet.until = now + span(boss.ch.rng, MEETING_MS);
    meet.nextLineAt = now + 2_500;
  }
  if (meet.phase !== 'talk') return;
  if (now >= meet.until) {
    meet.phase = 'done';
    return;
  }
  if (now < meet.nextLineAt || seated.length < 2) return;
  const rng = boss.ch.rng;
  meet.nextLineAt = now + between(rng, 3_200, 6_000);
  // o dono fala um pouco mais que cada um; ninguém fala duas vezes seguidas
  const pool = seated.filter((id) => id !== meet.lastSpeaker);
  const speaker = pool.includes(meet.host) && rng() < 0.4 ? meet.host : pool[Math.floor(rng() * pool.length) % pool.length];
  const c = crew.sim.chars.get(speaker);
  if (!c) return;
  const line = pick(speaker === meet.host ? CEO_LINES.meeting : GUEST_LINES.meeting, rng, {}, meet.lastLine);
  say(crew, c, line);
  meet.lastSpeaker = speaker;
  meet.lastLine = line;
  if (speaker !== meet.host && rng() < 0.25) {
    boss.ch.chatEmoji = rng() < 0.5 ? '👍' : '💡';
    boss.ch.chatUntil = now + 1_400;
  }
}

// ------------------------------------------------------------------ ronda

/** Uma volta pelo campus: mesas de agentes (2–4), a recepção e a equipe da limpeza. */
export function planRounds(crew: StaffCrew, m: Boss, now: number): boolean {
  const sim = crew.sim;
  const ch = m.ch;
  const s = m.state;
  const rng = ch.rng;
  const atDesk = (c: Character) => !c.gone && !c.leaving && !c.inside && !!c.homeSpot && c.atSpot === c.homeSpot;
  const cands = [...sim.chars.values()].filter((c) => !crew.member(c.id) && atDesk(c) && (c.mode === 'work' || c.mode === 'idle' || c.mode === 'shell'));
  // de salas diferentes, quando dá
  const byRoom = new Map<string, Character[]>();
  for (const c of cands) byRoom.set(c.roomId, [...(byRoom.get(c.roomId) ?? []), c]);
  const rooms = [...byRoom.values()].sort(() => rng() - 0.5);
  const picks: Character[] = [];
  const want = 2 + Math.floor(rng() * 3);
  for (let i = 0; picks.length < want && i < 3; i++) for (const list of rooms) if (picks.length < want && list[i]) picks.push(list[i]);
  // a recepção e quem da limpeza está descansando
  const chair = crew.base(STAFF_DESK)[Math.floor(rng() * Math.max(1, crew.base(STAFF_DESK).length))];
  const rest = new Set(crew.base(STAFF_REST).map((x) => x.id));
  const cleaner = [...crew.members.values()].find((x) => x.role === 'cleaner' && !!x.ch.atSpot && rest.has(x.ch.atSpot));
  if (!picks.length && !chair) return false;
  // ordem do caminho: sempre o mais perto de onde ele está
  type Stop = { kind: 'agent' | 'desk' | 'cleaner'; tx: number; ty: number; c?: Character; spot?: SpotDef };
  const stops: Stop[] = picks.map((c) => {
    const home = sim.spots.get(c.homeSpot)!;
    return { kind: 'agent', tx: home.tx, ty: home.ty, c };
  });
  if (chair) stops.push({ kind: 'desk', tx: chair.tx, ty: chair.ty, spot: chair });
  if (cleaner?.ch.atSpot) {
    const st = sim.spots.get(cleaner.ch.atSpot);
    if (st) stops.push({ kind: 'cleaner', tx: st.tx, ty: st.ty, c: cleaner.ch });
  }
  const ordered: Stop[] = [];
  let px = ch.tx;
  let py = ch.ty;
  while (stops.length) {
    let bi = 0;
    for (let i = 1; i < stops.length; i++) if (Math.abs(stops[i].tx - px) + Math.abs(stops[i].ty - py) < Math.abs(stops[bi].tx - px) + Math.abs(stops[bi].ty - py)) bi = i;
    const [st] = stops.splice(bi, 1);
    ordered.push(st);
    px = st.tx;
    py = st.ty;
  }
  const steps: Step[] = [];
  if (ch.atSpot) steps.push({ t: 'exit' });
  steps.push({ t: 'do', fn: () => (s.doing = 'rounds') });
  const taken = new Set<number>();
  const grid = sim.building.grid;
  const busy = sim.busyTiles(m.id);
  for (const st of ordered) {
    // de lado (não atrás da cadeira), quando dá; senão o tile livre mais perto
    let at: { x: number; y: number } | undefined;
    for (const dx of rng() < 0.5 ? [-1, 1] : [1, -1]) {
      const k = grid.key(st.tx + dx, st.ty);
      if (!at && grid.get(st.tx + dx, st.ty) !== 0 && !busy.has(k) && !taken.has(k)) {
        taken.add(k);
        at = { x: st.tx + dx, y: st.ty };
      }
    }
    at ??= tilesNear(sim, st.tx, st.ty, 1, taken, m.id, 1)[0];
    if (!at) continue;
    // quem está lá quando ele chega (a recepcionista pode ter trocado com a substituta)
    let who: Character | undefined;
    let skip = false;
    const find = (): Character | undefined => {
      if (st.kind === 'desk') {
        for (const x of crew.members.values()) if (x.ch.atSpot === st.spot?.id) return x.ch;
        return undefined;
      }
      const c = st.c;
      if (!c || c.gone) return undefined;
      if (st.kind === 'agent') return atDesk(c) ? c : undefined;
      return c.atSpot && rest.has(c.atSpot) ? c : undefined;
    };
    steps.push(
      { t: 'go', tx: at.x, ty: at.y },
      {
        t: 'do',
        fn: () => {
          who = find();
          skip = !who;
          if (!who) return;
          s.doing = 'visit';
          s.visiting = who.id;
          ch.dir = lookAt(at.x, at.y, who);
          const pool = st.kind === 'agent' ? CEO_LINES.rounds : CEO_LINES.staff;
          say(crew, ch, pick(pool, rng, { nome: firstName(who.info.name) }));
        },
      },
      { t: 'until', cond: () => skip, minMs: 0, maxMs: 2_600, pose: 'talk' },
      {
        t: 'do',
        fn: () => {
          // quem trabalha segue digitando: só o balão de resposta
          const c = find();
          if (!c || skip) return;
          say(crew, c, pick(st.kind === 'agent' ? GUEST_LINES.reply : GUEST_LINES.staffReply, rng));
        },
      },
      { t: 'until', cond: () => skip, minMs: 0, maxMs: 2_800, pose: 'stand' },
      { t: 'do', fn: () => !skip && rng() < 0.5 && say(crew, ch, pick(CEO_LINES.roundsMore, rng)) },
      { t: 'until', cond: () => skip, minMs: 0, maxMs: 1_800, pose: 'talk' },
      { t: 'do', fn: () => ((s.visiting = null), (s.doing = 'rounds')) },
    );
  }
  ch.queue.push(...steps);
  void now;
  return true;
}

// ------------------------------------------------------------------ atividades por conta própria

function planGame(crew: StaffCrew, m: Boss, now: number): boolean {
  const sim = crew.sim;
  const ch = m.ch;
  const free = freeAgents(crew, now);
  if (!free.length) return false;
  const kinds = (['pingpong', 'tennis'] as const).filter((k) => sim.spots.ofKind(k).length);
  if (!kinds.length) return false;
  const kind = kinds.length > 1 && ch.rng() < 0.4 ? 'tennis' : kinds[0];
  const partners = free.slice(0, free.length >= 3 && ch.rng() < 0.3 ? 3 : 1);
  return sim.social.startWith(kind, ch, partners, now);
}

function planTv(crew: StaffCrew, m: Boss, now: number): boolean {
  const sim = crew.sim;
  const ch = m.ch;
  if (!sim.spots.ofKind('sofa').length) return false;
  if (sim.social.joinOpen('tv', ch, now)) return true;
  const free = freeAgents(crew, now);
  if (!free.length) return false;
  return sim.social.startWith('tv', ch, free.slice(0, 1 + Math.floor(ch.rng() * 2)), now);
}

function planKitchen(crew: StaffCrew, m: Boss, now: number): boolean {
  const sim = crew.sim;
  const ch = m.ch;
  if (!sim.spots.ofKind('cafe_seat').length) return false;
  if (sim.social.joinOpen('kitchen', ch, now)) return true;
  const free = freeAgents(crew, now);
  if (!free.length) return false;
  return sim.social.startWith('kitchen', ch, free.slice(0, 1 + Math.floor(ch.rng() * 2)), now);
}

// ------------------------------------------------------------------ o sorteio

/** O que dá para fazer agora (pesos do dia ou da noite, sem o que está em intervalo ou sem lugar/companhia). */
export function ceoChoices(crew: StaffCrew, m: Boss, now: number): Partial<Record<CeoActivity, number>> {
  const sim = crew.sim;
  const s = m.state;
  const night = isNight(sim.hour);
  const base = night ? CEO_NIGHT_WEIGHTS : CEO_WEIGHTS;
  const out: Partial<Record<CeoActivity, number>> = {};
  const hold = now < s.holdUntil;
  const anyFree = () => freeAgents(crew, now).length > 0;
  for (const k of Object.keys(base) as CeoActivity[]) {
    let w = base[k];
    if (!w) continue;
    if ((s.readyAt[k] ?? 0) > now) continue;
    // nada de repetir o mesmo seguido (menos o trabalho na mesa)
    if (k === s.last && k !== 'desk' && k !== 'stand') continue;
    switch (k) {
      case 'meeting':
        if (hold || suiteOf(crew).meeting || !anyFree()) continue;
        break;
      case 'rounds':
        if (hold) continue;
        break;
      case 'game':
        if (hold || !anyFree() || !(sim.spots.ofKind('pingpong').length || sim.spots.ofKind('tennis').length)) continue;
        break;
      case 'tv':
        if (hold || !sim.spots.ofKind('sofa').length || !anyFree()) continue;
        break;
      case 'kitchen':
        if (hold || !sim.spots.ofKind('cafe_seat').length || !anyFree()) continue;
        break;
      case 'pray':
        if (hold || !sim.building.campus?.mosque) continue;
        break;
      case 'chai':
        if (now - s.chaiAt < 120_000) continue;
        break;
    }
    if (k === 'chai' && hold) w *= 0.5;
    out[k] = w;
  }
  return out;
}

function plan(crew: StaffCrew, m: Boss, sp: CeoSpots, a: CeoActivity, now: number): boolean {
  const sim = crew.sim;
  const ch = m.ch;
  switch (a) {
    case 'desk':
      return planDesk(crew, m, sp, false);
    case 'stand':
      return planDesk(crew, m, sp, true);
    case 'phone':
      return planPhone(crew, m, sp);
    case 'pace':
      return planPace(crew, m, sp);
    case 'video':
      return planVideo(crew, m, sp);
    case 'chai':
      return planChai(crew, m, sp);
    case 'meeting':
      return planMeeting(crew, m, sp, now);
    case 'rounds':
      return planRounds(crew, m, now);
    case 'game':
      return planGame(crew, m, now) && ((m.state.doing = 'away'), true);
    case 'tv':
      return planTv(crew, m, now) && ((m.state.doing = 'away'), true);
    case 'kitchen':
      return planKitchen(crew, m, now) && ((m.state.doing = 'away'), true);
    case 'pray':
      return planPrayerVisit(sim, ch, now) && ((m.state.doing = 'away'), true);
  }
}

// ------------------------------------------------------------------ a função

function owner(crew: StaffCrew): OwnerInfo | null {
  return crew.sim.owner;
}

/** Nome, visual e peças da configuração; sem roupa escolhida, o terno (o resto das peças vem da semente). */
export function ownerIdentity(o: OwnerInfo): StaffIdentity {
  const parts = o.parts?.topStyle ? o.parts : { ...SUIT, ...(o.parts ?? {}) };
  return { name: o.name, look: o.look, parts };
}

export const CEO: StaffRoleDef<CeoState> = {
  role: CEO_ROLE,
  // o cargo da configuração ("CEO" sem cargo)
  label: (crew) => (crew && owner(crew)?.title) || tr('CEO'),
  // só no campus com dono configurado (a diretoria existe)
  count: (crew) => (owner(crew) && crew.sim.spots.ofKind('ceo_desk').length ? 1 : 0),
  identity: (crew) => {
    const o = owner(crew);
    return o ? ownerIdentity(o) : null;
  },
  // as peças vêm da configuração (identity); só o crachá de visitante não
  dress: (base: Appearance) => ({ ...base, lanyard: null }),

  init: () => ({ doing: 'desk', last: null, next: null, call: null, cup: false, poke: false, holdUntil: 0, chaiAt: 0, readyAt: {}, visiting: null }),

  think(m, crew, now) {
    const ch = m.ch;
    const s = m.state;
    const sp = claimOwn(crew, m);
    hangUp(m);
    s.poke = false;
    s.visiting = null;
    const meet = suiteOf(crew).meeting;
    if (meet && meet.host === m.id && meet.phase !== 'done') endMeeting(crew);
    if (!sp.desk) {
      ch.queue.push({ t: 'act', pose: 'stand', ms: 4000 });
      return true;
    }
    if (s.cup) {
      const sec = [...crew.members.values()].find((x) => x.role === 'secretary');
      return planCup(crew, m, sp, sec?.ch.info.name);
    }
    // a secretária está trazendo o chai: segue na mesa esperando
    const atDesk = ch.atSpot && (ch.atSpot === sp.desk.id || ch.atSpot === sp.stand?.id);
    if (!s.next && atDesk && chaiComing(crew)) return planDesk(crew, m, sp, ch.atSpot === sp.stand?.id, 12_000);
    let a: CeoActivity | null = s.next;
    s.next = null;
    for (let tries = 0; tries < 4; tries++) {
      if (!a) a = pickWeighted(ch.rng, ceoChoices(crew, m, now)) ?? 'desk';
      s.doing = 'desk';
      if (plan(crew, m, sp, a, now)) {
        s.last = a;
        const cd = CEO_COOLDOWN_MS[a];
        if (cd) s.readyAt[a] = now + span(ch.rng, cd);
        if (a === 'chai') s.chaiAt = now;
        return true;
      }
      // não deu (ninguém livre, lugar ocupado): intervalo curto e sorteia outra
      s.readyAt[a] = now + 60_000;
      a = null;
    }
    return planDesk(crew, m, sp, false);
  },

  settle(m, crew) {
    const s = m.state;
    relax(crew, m);
    const sp = claimOwn(crew, m);
    const desk = sp.desk?.deskId;
    // de volta à mesa (na altura em que ela estiver)
    const standing = !!desk && (crew.sim.furnStates.get(desk) ?? 0) === 1;
    const at = standing ? sp.stand : sp.desk;
    if (at) crew.seat(m.ch, at);
    else crew.standNear(m.ch, m.ch.tx, m.ch.ty);
    s.doing = standing ? 'stand' : 'desk';
    // ao abrir a página (ou voltar à aba), ele está trabalhando: o sorteio vem depois deste bloco
    s.next = standing ? 'stand' : 'desk';
  },

  doing(m, crew) {
    const ch = m.ch;
    const s = m.state;
    if (ch.prayer || ch.step?.t === 'pray') return tr('Rezando');
    if (ch.gathering) return crew.sim.social.doing(ch.id) ?? tr('Com a equipe');
    switch (s.doing) {
      case 'stand':
        return tr('Trabalhando em pé');
      case 'phone':
        return tr('Numa ligação');
      case 'video':
        return tr('Numa videochamada');
      case 'meeting': {
        const meet = suiteOf(crew).meeting;
        const names = meet ? meet.guests.map((id) => crew.sim.chars.get(id)?.info.name).filter((n): n is string => !!n) : [];
        return names.length ? (fill(tr('Em reunião com {nome}'), { nome: names.join(', ') }) ?? tr('Em reunião')) : tr('Em reunião');
      }
      case 'chai':
        return tr('Tomando um chai');
      case 'rounds':
        return tr('Fazendo a ronda pelos escritórios');
      case 'visit': {
        const who = s.visiting ? crew.sim.chars.get(s.visiting)?.info.name : undefined;
        return who ? (fill(tr('Conversando com {nome}'), { nome: who }) ?? tr('Fazendo a ronda pelos escritórios')) : tr('Fazendo a ronda pelos escritórios');
      }
      case 'away':
        return tr('Fora da sala');
      default:
        return tr('Trabalhando no MacBook');
    }
  },

  screen(m, crew) {
    const s = m.state;
    if (s.call === 'video') return 'chat';
    if (s.call === 'phone') return 'docs';
    // trabalhando: a tela varia com o dia (e-mails, planilhas, código)
    const modes: readonly ScreenMode[] = ['docs', 'browser', 'tasks', 'code', 'search'];
    return modes[Math.floor(m.ch.info.seed / 7 + crew.now / 45_000) % modes.length];
  },

  joinPrayer(m, crew) {
    relax(crew, m);
    m.state.doing = 'away';
    return true;
  },

  joinActivity(m, crew, activity: SendActivity, now) {
    const s = m.state;
    if (m.ch.inside || m.ch.arriving) return false;
    if (activity === 'smoke' && !owner(crew)?.smokes) return false;
    relax(crew, m);
    if (activity === 'desk') {
      s.next = 'desk';
      s.holdUntil = now + DESK_HOLD_MS;
      s.doing = 'desk';
      return true;
    }
    s.doing = 'away';
    return true;
  },

  dispose(m, crew) {
    relax(crew, m);
    const desk = ceoSpots(crew.sim).desk?.deskId;
    if (desk) crew.sim.furnStates.delete(desk);
  },

  housekeeping(crew, now) {
    runMeeting(crew, now);
  },
};

// ------------------------------------------------------------------ depuração

/** Força a próxima atividade do dono (console: habblaud.world.debug.staff.ceo('meeting')). */
export function forceCeo(crew: StaffCrew, what: CeoActivity): boolean {
  const b = bossOf(crew);
  if (!b) return false;
  relax(crew, b);
  crew.sim.clearPlan(b.ch);
  b.state.next = what;
  b.state.readyAt[what] = 0;
  b.ch.thinkAt = 0;
  return true;
}

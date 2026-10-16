// Equipe do escritório: personagens que NÃO são agentes. Não vêm do servidor (nenhum AgentInfo de verdade), vivem só
// na simulação do navegador e nunca entram nas contas da interface (barra superior, lista, feed, estatísticas,
// timelapse, "precisa de você", menu Atividades): a interface só conhece o store, e o mundo nunca manda um id de
// equipe para ela (hover e seleção de equipe ficam no próprio canvas, com um cartãozinho).
//
// Cada pessoa da equipe é um Character comum em sim.chars (anda pelos mesmos caminhos, elevadores e reservas de spots
// que os agentes), com id `staff:<função>:<n>`, nome do conjunto de nomes ativo (sem repetir o de nenhum agente),
// aparência sorteada pela semente + o uniforme da função, e um comportamento próprio: o planejador do Sim, com a fila
// vazia, chama `think` da função (ver StaffRoleDef). Funções: registerStaffRole (a limpeza e a recepção já vêm registradas).
//
// Para criar uma função nova (ex.: 'ceo', 'secretary'): um arquivo sim/<função>.ts exportando um StaffRoleDef
// (rótulo, quantas pessoas, uniforme, estado inicial, `think` e `settle`; opcionais: `identity` para nome e peças fixos,
// `doing` para o cartão, `kit`, `joinPrayer`, `dispose`), registrado com registerStaffRole (ou uma linha em ROLES).
// Ver sim/cleaner.ts.
import type { AppearanceParts } from '../../../../shared/appearance';
import { hash32 } from '../../../../shared/hash';
import { inNameSet, pickName, type NameSet, type PersonName } from '../../../../shared/names';
import type { AgentInfo, AppearanceProfile } from '../../../../shared/types';
import type { Appearance, ArtModule } from '../../art/api';
import type { CleaningProp } from '../../art/furniture/cleaning';
import { FOOT_DX, FOOT_DY, TILE } from '../constants';
import { STAFF_REST } from '../layout/staff';
import type { SpotDef } from '../layout/types';
import { Character } from './character';
import { CLEANER } from './cleaner';
import { RECEPTIONIST } from './receptionist';
import { ShineList } from './shine';
import type { Sim } from './sim';
import type { Step } from './steps';

export const STAFF_PREFIX = 'staff:';

/** Id de alguém da equipe (nunca é agente). */
export function isStaffId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(STAFF_PREFIX);
}

export function isStaff(ch: { id: string }): boolean {
  return isStaffId(ch.id);
}

export function staffId(role: string, index: number): string {
  return `${STAFF_PREFIX}${role}:${index}`;
}

/** Peça do kit desenhada pelo mundo (carrinho, balde, placa), com os pés em (x, y). */
export interface KitItem {
  kind: CleaningProp;
  x: number;
  y: number;
  flip: boolean;
}

export interface StaffMember<S = unknown> {
  readonly id: string;
  readonly role: string;
  /** Posição na equipe da função (0, 1, ...): a ordem de chegada e das vagas. */
  readonly index: number;
  readonly ch: Character;
  /** Estado da função (criado por `init`). */
  state: S;
  /** Dispensado (a equipe diminuiu): indo embora pelo elevador. */
  leaving: boolean;
}

/** Quem a pessoa é, quando a função não sorteia (ex.: o dono do escritório, de `meta.owner`). */
export interface StaffIdentity {
  name: string;
  look: 'f' | 'm';
  /** Peças escolhidas (as mesmas do editor de personagem), por cima da aparência da semente. */
  parts?: AppearanceParts;
}

/** Uma função da equipe. Tudo é chamado pela simulação; nada aqui desenha. */
export interface StaffRoleDef<S = unknown> {
  readonly role: string;
  /** Rótulo da função no cartão ("Equipe de limpeza"). */
  label(): string;
  /** Quantas pessoas desta função o escritório tem agora (0 = nenhuma). */
  count(crew: StaffCrew): number;
  /**
   * Nome e aparência fixos da pessoa `index` (ex.: CEO e secretária vindos da configuração). Ausente/null = nome
   * sorteado do conjunto ativo, sem repetir o de nenhum agente.
   */
  identity?(crew: StaffCrew, index: number): StaffIdentity | null;
  /** Uniforme: a aparência sorteada pela semente com as peças da função por cima. */
  dress(base: Appearance, profile: AppearanceProfile | undefined): Appearance;
  /** Estado inicial de quem chega. */
  init(m: StaffMember<S>, crew: StaffCrew, now: number): S;
  /** Fila vazia: planeja o próximo passo (true = planejou; false = tenta de novo daqui a pouco). */
  think(m: StaffMember<S>, crew: StaffCrew, now: number): boolean;
  /** Carga inicial ou volta de uma aba oculta: põe a pessoa num lugar natural (sem andar). */
  settle(m: StaffMember<S>, crew: StaffCrew, now: number): void;
  /** (Opcional) Rótulo da pessoa no cartão, quando muda de pessoa para pessoa (ex.: "Aalim" / "Aalima"). */
  labelOf?(m: StaffMember<S>): string;
  /** O que está fazendo agora (2ª linha do cartão), ou null. */
  doing?(m: StaffMember<S>, crew: StaffCrew): string | null;
  /** Peças do kit que o mundo desenha (carrinho, balde, placa). */
  kit?(m: StaffMember<S>, out: KitItem[], now: number): void;
  /**
   * Chamado para a oração: prepara a pessoa para ir (estaciona o que leva) e diz se vai. false = no meio de algo que
   * não se larga (ex.: um trecho do piso sendo limpo).
   */
  joinPrayer?(m: StaffMember<S>, crew: StaffCrew, now: number): boolean;
  /** Vai embora (dispensada): devolve o que é dela. */
  dispose?(m: StaffMember<S>, crew: StaffCrew): void;
  /** Baixa frequência (~1 s): manutenção da função (ex.: a escala de limpeza). */
  housekeeping?(crew: StaffCrew, now: number): void;
}

/** Registro das funções da equipe, na ordem de chegada (a limpeza e a recepção já vêm registradas). */
const ROLES: StaffRoleDef<unknown>[] = [CLEANER as StaffRoleDef<unknown>, RECEPTIONIST as StaffRoleDef<unknown>];

/** Registra (ou substitui, pelo nome) uma função. Retorna como desfazer. */
export function registerStaffRole<S>(def: StaffRoleDef<S>): () => void {
  const d = def as unknown as StaffRoleDef<unknown>;
  const i = ROLES.findIndex((r) => r.role === d.role);
  const prev = i >= 0 ? ROLES[i] : null;
  if (i >= 0) ROLES[i] = d;
  else ROLES.push(d);
  return () => {
    const j = ROLES.indexOf(d);
    if (j < 0) return;
    if (prev) ROLES[j] = prev;
    else ROLES.splice(j, 1);
  };
}

/** Funções registradas. */
export function staffRoles(): readonly StaffRoleDef<unknown>[] {
  return ROLES;
}

function roleOf(role: string): StaffRoleDef<unknown> | undefined {
  return ROLES.find((r) => r.role === role);
}

/**
 * Conjunto de nomes ativo, deduzido dos agentes (o servidor põe `appearance: 'pk'` em todos com HABBLAUD_NAMES=pk; no
 * escritório combinado, cada máquina manda o seu: basta um).
 */
export function detectNameSet(agents: readonly Pick<AgentInfo, 'appearance' | 'name'>[]): NameSet {
  for (const a of agents) if (a.appearance === 'pk') return 'pk';
  let pk = 0;
  for (const a of agents) if (inNameSet(a.name, 'pk')) pk++;
  return pk > 0 && pk * 2 >= agents.length ? 'pk' : 'br';
}

/**
 * Nomes da equipe: na ordem dada, cada um com o nome determinístico do seu id que não seja de nenhum agente nem de
 * quem veio antes na equipe.
 */
export function staffNames(ids: readonly string[], agentNames: Iterable<string>, set: NameSet): PersonName[] {
  const used = new Set(agentNames);
  return ids.map((id) => {
    const p = pickName(id, used, set);
    used.add(p.name);
    return p;
  });
}

/** AgentInfo de faz de conta para o Character (nada disso sai do mundo). */
function staffInfo(id: string, def: StaffRoleDef<unknown>, name: PersonName, seed: number, profile: AppearanceProfile | undefined, now: number, parts?: AppearanceParts): AgentInfo {
  return {
    id,
    kind: 'main',
    roomId: '',
    name: name.name,
    look: name.look,
    role: def.label(),
    sessionId: id,
    account: '',
    status: 'idle',
    recent: [],
    tasks: [],
    startedAt: now,
    lastEventAt: now,
    statusSince: now,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed,
    ...(profile ? { appearance: profile } : {}),
    ...(parts ? { parts } : {}),
  };
}

export class StaffCrew {
  readonly members = new Map<string, StaffMember<unknown>>();
  /** Brilho do piso limpo (sim/shine.ts). */
  readonly shine = new ShineList();
  nameSet: NameSet = 'br';
  private agents: readonly AgentInfo[] = [];
  private nextHousekeeping = 0;

  constructor(
    readonly sim: Sim,
    private readonly art: ArtModule,
    private readonly enabled: () => boolean,
  ) {}

  get now(): number {
    return this.sim.now;
  }

  member(id: string | null | undefined): StaffMember<unknown> | undefined {
    return id ? this.members.get(id) : undefined;
  }

  /** Depois de cada snapshot: quem deveria estar no escritório agora, com nomes que não colidem com os dos agentes. */
  sync(agents: readonly AgentInfo[], now: number, first: boolean, instant = false): void {
    this.agents = agents;
    this.nameSet = detectNameSet(agents);
    const want: { def: StaffRoleDef<unknown>; index: number; id: string }[] = [];
    if (this.enabled()) {
      for (const def of ROLES) {
        const n = Math.max(0, Math.floor(def.count(this)));
        for (let i = 0; i < n; i++) want.push({ def, index: i, id: staffId(def.role, i) });
      }
    }
    const wanted = new Set(want.map((w) => w.id));
    for (const m of this.members.values()) if (!wanted.has(m.id) && (instant || !m.leaving)) this.dismiss(m, now, instant);
    // nomes fixos primeiro (ex.: o dono); os sorteados não repetem nenhum deles, nem os dos agentes, nem o de quem está
    // indo embora (dois "Saira" nunca se cruzam no corredor)
    const fixed = want.map((w) => w.def.identity?.(this, w.index) ?? null);
    const leavingNames = [...this.members.values()].filter((m) => m.leaving).map((m) => m.ch.info.name);
    const drawn = staffNames(
      want.filter((_, i) => !fixed[i]).map((w) => w.id),
      [...agents.map((a) => a.name), ...leavingNames, ...fixed.flatMap((f) => (f ? [f.name] : []))],
      this.nameSet,
    );
    const profile: AppearanceProfile | undefined = this.nameSet === 'pk' ? 'pk' : undefined;
    let d = 0;
    want.forEach((w, i) => {
      const f = fixed[i];
      const name: PersonName = f ? { name: f.name, look: f.look } : drawn[d++];
      const m = this.members.get(w.id);
      if (!m) this.hire(w.def, w.index, name, profile, now, first, f?.parts);
      else if (!m.leaving && (m.ch.info.name !== name.name || m.ch.info.look !== name.look || m.ch.info.appearance !== profile || JSON.stringify(m.ch.info.parts) !== JSON.stringify(f?.parts))) {
        // o nome colidiu com um agente que chegou (ou o conjunto de nomes / a configuração mudou): mesma pessoa
        m.ch.info = { ...m.ch.info, name: name.name, look: name.look, appearance: profile, parts: f?.parts };
        if (!profile) delete m.ch.info.appearance;
        if (!f?.parts) delete m.ch.info.parts;
        m.ch.appearance = this.dress(w.def, m.ch.info);
      }
    });
  }

  /**
   * Reaplica a escala sem snapshot novo (a opção da equipe mudou). Desligada pela opção, a equipe sai na hora (sem
   * ninguém atravessando o escritório até o elevador logo ao abrir a página).
   */
  resync(now: number): void {
    this.sync(this.agents, now, false, !this.enabled());
  }

  private dress(def: StaffRoleDef<unknown>, info: AgentInfo): Appearance {
    let base: Appearance;
    try {
      base = this.art.appearanceFromSeed(info.seed, { look: info.look, profile: info.appearance, parts: info.parts });
    } catch {
      base = { skin: '#d69f78', hair: '#2b2530', hairStyle: 'short', eyes: '#2b2236', top: '#1f8a8a', topAccent: '#e9f4f2', topStyle: 'polo', bottom: '#2c3e5c', shoes: '#2b2f3a', accessory: 'none', accessoryColor: '#1f8a8a', lanyard: null, look: info.look };
    }
    return def.dress(base, info.appearance);
  }

  private hire(def: StaffRoleDef<unknown>, index: number, name: PersonName, profile: AppearanceProfile | undefined, now: number, first: boolean, parts?: AppearanceParts): void {
    const id = staffId(def.role, index);
    const info = staffInfo(id, def, name, hash32(id), profile, now, parts);
    const ch = new Character(info, this.dress(def, info));
    const m: StaffMember<unknown> = { id, role: def.role, index, ch, state: undefined, leaving: false };
    m.state = def.init(m, this, now);
    this.members.set(id, m);
    this.sim.chars.set(id, ch);
    // na carga inicial já estão no lugar; depois chegam pelo elevador, como todo mundo
    if (first || !this.arrive(ch, now)) def.settle(m, this, now);
  }

  /** Sai do elevador mais perto da base (o planejador assume depois). */
  private arrive(ch: Character, now: number): boolean {
    const el = this.elevatorNear(this.base(STAFF_REST)[0]);
    const spot = el && this.sim.spots.get(el.spotId);
    if (!el || !spot) return false;
    ch.placeAtTile(spot.tx, spot.ty);
    ch.x = spot.x;
    ch.y = spot.y - 6;
    ch.dir = 'down';
    ch.alpha = 0;
    ch.inside = true;
    ch.arriving = true;
    ch.hiddenUntil = el.reserveAppear(now) + Math.floor(ch.rng() * 400);
    ch.queue.push({ t: 'elevOut', elev: el.index, phase: 0 });
    return true;
  }

  private elevatorNear(s: SpotDef | undefined): Sim['elevators'][number] | undefined {
    let best: Sim['elevators'][number] | undefined;
    let bestD = Infinity;
    for (const e of this.sim.elevators) {
      const es = this.sim.spots.get(e.spotId);
      if (!es) continue;
      const d = s ? Math.abs(es.tx - s.tx) + Math.abs(es.ty - s.ty) : 0;
      if (d + e.load * 4 < bestD) {
        bestD = d + e.load * 4;
        best = e;
      }
    }
    return best;
  }

  /** A equipe diminuiu (ou foi desligada): a pessoa devolve o que é dela e vai embora pelo elevador. */
  private dismiss(m: StaffMember<unknown>, now: number, instant = false): void {
    if (!m.leaving) roleOf(m.role)?.dispose?.(m, this);
    m.leaving = true;
    this.sim.clearPlan(m.ch);
    m.ch.thinkAt = 0;
    if (instant) {
      m.ch.gone = true;
      this.sim.spots.releaseAll(m.id);
    }
    void now;
  }

  private planExit(m: StaffMember<unknown>): boolean {
    const ch = m.ch;
    ch.leaving = true;
    this.sim.spots.releaseAll(ch.id);
    const el = this.elevatorNear(undefined);
    const es = el && this.sim.spots.get(el.spotId);
    const steps: Step[] = [];
    if (ch.atSpot) steps.push({ t: 'exit' });
    if (el && es) {
      steps.push({ t: 'go', tx: es.tx, ty: es.ty, fx: es.tx * TILE + FOOT_DX + (es.x - (es.tx * TILE + FOOT_DX)) * 0.5, fy: es.ty * TILE + FOOT_DY - 2, dir: 'up' }, { t: 'elevIn', elev: el.index, phase: 0 });
    }
    steps.push({ t: 'remove' });
    ch.queue.push(...steps);
    return true;
  }

  // ------------------------------------------------------------------ chamado pelo Sim

  /** Planejador (fila vazia). */
  think(ch: Character, now: number): boolean {
    const m = this.members.get(ch.id);
    if (!m) {
      ch.gone = true;
      return false;
    }
    ch.arriving = false;
    if (m.leaving) return this.planExit(m);
    const def = roleOf(m.role);
    return def ? def.think(m, this, now) : false;
  }

  /** Volta de uma aba oculta (fastForward): cada um num lugar natural. */
  settle(ch: Character, now: number): void {
    const m = this.members.get(ch.id);
    if (!m) return;
    if (m.leaving) {
      ch.gone = true;
      return;
    }
    roleOf(m.role)?.settle(m, this, now);
  }

  /** A cada frame (barato): quem saiu deixa a equipe; manutenção de baixa frequência. */
  update(now: number): void {
    for (const [id, m] of this.members) {
      if (m.ch.gone || this.sim.chars.get(id) !== m.ch) this.members.delete(id);
      // ninguém da equipe "cochila de tédio": o relógio do status (ocioso há muito tempo) não corre
      else m.ch.info.statusSince = now;
    }
    if (now >= this.nextHousekeeping) {
      this.nextHousekeeping = now + 1000;
      this.shine.prune(now);
      for (const def of ROLES) def.housekeeping?.(this, now);
    }
  }

  /** Chamado para a oração (menu Atividades): quem está livre vai junto. Retorna quem foi (fora das contas da UI). */
  callToPrayer(now: number, plan: (ch: Character) => boolean): string[] {
    const sent: string[] = [];
    for (const m of this.members.values()) {
      const ch = m.ch;
      if (m.leaving || ch.gone || ch.inside || ch.arriving || ch.prayer || ch.step?.t === 'pray') continue;
      const t = ch.step?.t;
      if (t === 'stall' || t === 'elevIn' || t === 'elevOut' || t === 'switch' || t === 'pod') continue;
      const def = roleOf(m.role);
      if (def?.joinPrayer && !def.joinPrayer(m, this, now)) continue;
      this.sim.clearPlan(ch);
      if (ch.atSpot) ch.queue.push({ t: 'exit' });
      if (plan(ch)) sent.push(ch.id);
    }
    return sent;
  }

  /** Peças do kit de todos, para o desenho (reaproveita `out`). */
  kit(out: KitItem[], now: number): KitItem[] {
    out.length = 0;
    for (const m of this.members.values()) roleOf(m.role)?.kit?.(m, out, now);
    return out;
  }

  /** Cartão do canvas: "Saira · Equipe de limpeza" e o que está fazendo. */
  card(id: string): { name: string; role: string; doing: string | null; color: string } | null {
    const m = this.members.get(id);
    if (!m) return null;
    const def = roleOf(m.role);
    return { name: m.ch.info.name, role: def?.labelOf?.(m) ?? def?.label() ?? m.ch.info.role, doing: def?.doing?.(m, this) ?? null, color: m.ch.appearance.top };
  }

  // ------------------------------------------------------------------ base (canto da limpeza)

  /** Spots 'staff' de um grupo (descanso, tanque, vagas de carrinho). */
  base(group: string): SpotDef[] {
    return this.sim.spots.ofKind('staff').filter((s) => s.group === group);
  }

  /**
   * Lugar fixo da pessoa num grupo (banqueta, vaga do carrinho): o mesmo enquanto existir, reservado em nome dela.
   * Prefere o de índice igual ao da pessoa (cada um sempre na sua banqueta).
   */
  claim(m: StaffMember<unknown>, group: string): SpotDef | null {
    const list = this.base(group);
    for (const s of list) if (this.sim.spots.ownerOf(s.id) === m.id) return s;
    const pref = list[m.index];
    if (pref && this.sim.spots.reserve(pref.id, m.id)) return pref;
    for (const s of list) if (this.sim.spots.reserve(s.id, m.id)) return s;
    return null;
  }

  /** Põe a pessoa sentada/encaixada num spot na hora (carga inicial, volta da aba oculta). */
  seat(ch: Character, s: SpotDef): void {
    ch.tx = s.tx;
    ch.ty = s.ty;
    ch.x = s.x;
    ch.y = s.y;
    ch.dir = s.dir;
    ch.atSpot = s.id;
    ch.seated = !!s.seated;
    ch.sortY = s.sortY ?? null;
    ch.setPose(s.seated ? 'sit' : 'stand');
  }

  /** Tile livre perto de (tx, ty) para quem não tem lugar (sem a base no layout). */
  standNear(ch: Character, tx: number, ty: number): void {
    const n = this.sim.building.grid.nearestWalkable(tx, ty) ?? { x: tx, y: ty };
    ch.atSpot = null;
    ch.seated = false;
    ch.sortY = null;
    ch.placeAtTile(n.x, n.y);
  }
}

// Recreação do campus na simulação: partidas de simples e duplas (pingue-pongue e tênis), a soneca nas cápsulas e os
// fumantes (traço por semente, só eles vão à área de fumantes).
import { describe, expect, it } from 'vitest';
import type { AgentInfo, MachineRef, MachineStatus, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { GAMES_ID, COURT_ID, REST_ID, SMOKING_ID } from '../layout/recreation';
import { kindWeight, players } from '../social/gathering';
import { personaFor, SMOKER_CHANCE } from '../social/persona';
import { planSmoke } from './recreation';
import { Sim } from './sim';

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};
const appearance = { look: 'm' } as unknown as Appearance;
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;
const T0 = 1_700_000_000_000;
const LAPTOP: MachineRef = { id: 'local', name: 'Laptop' };
const SRV: MachineRef = { id: 'server1', name: 'server1' };
const MACHINES: MachineStatus[] = [
  { ...LAPTOP, online: true, since: T0, local: true },
  { ...SRV, online: true, since: T0 },
];

const isSmokerSeed = (seed: number) => personaFor(seed).traits.includes('fumo');
/** Primeira semente (a partir de `from`) fumante ou não. */
function seedWhere(smoker: boolean, from = 1): number {
  for (let s = from; ; s++) if (isSmokerSeed(s * 7919) === smoker) return s * 7919;
}

function room(id: string, slot: number, m?: MachineRef): RoomInfo {
  return { id, name: id, path: id, slot, seed: slot * 99 + 7, createdAt: T0, ...(m ? { machine: m, baseName: id } : {}) };
}

function agent(id: string, roomId: string, status: AgentInfo['status'], extra: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id,
    kind: 'main',
    roomId,
    name: id,
    look: 'f',
    role: 'Agente principal',
    sessionId: `s-${id}`,
    account: '.claude',
    status,
    recent: [],
    tasks: [],
    startedAt: T0,
    lastEventAt: T0,
    statusSince: T0,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: seedWhere(false, id.charCodeAt(0) * 3),
    machine: LAPTOP,
    ...extra,
  };
}

function snap(rooms: RoomInfo[], agents: AgentInfo[], machines?: MachineStatus[], rev = 1): OfficeSnapshot {
  return {
    rev,
    serverTime: T0,
    rooms,
    agents,
    accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: true, sources: [], startedAt: T0, version: 't', ...(machines ? { machines } : {}) },
  };
}

function run(sim: Sim, clock: { now: number }, seconds: number, until?: () => boolean): void {
  const steps = Math.round(seconds * 30);
  for (let i = 0; i < steps; i++) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
    if (until?.()) return;
  }
}

const newSim = () => new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
const IDS = ['ana', 'bia', 'caio', 'duda'];

function campusWith(ids: string[], status: AgentInfo['status'] = 'idle', extra: Partial<AgentInfo> = {}, machines: MachineStatus[] | null = MACHINES) {
  const sim = newSim();
  const clock = { now: T0 };
  sim.applySnapshot(snap([room('/a', 0, machines ? LAPTOP : undefined)], ids.map((id) => agent(id, '/a', status, extra)), machines ?? undefined), clock.now);
  run(sim, clock, 0.3);
  return { sim, clock };
}

describe('pingue-pongue e tênis: simples ou duplas', () => {
  it('com quatro livres, duplas numa mesa do salão de jogos (2 contra 2); com dois, simples', () => {
    const { sim, clock } = campusWith(IDS);
    expect(sim.social.force('pingpong', clock.now, IDS)).toHaveLength(4);
    const g = [...sim.social.gatherings][0];
    const ps = players(g);
    expect(ps).toHaveLength(4);
    expect(ps.map((m) => m.side)).toEqual([0, 1, 0, 1]);
    expect(new Set(ps.map((m) => sim.spots.get(m.spot)!.areaId))).toEqual(new Set([GAMES_ID]));
    expect(new Set(ps.map((m) => sim.spots.get(m.spot)!.group)).size).toBe(1);

    const two = campusWith(IDS.slice(0, 2));
    two.sim.social.force('pingpong', two.clock.now, IDS.slice(0, 2));
    expect(players([...two.sim.social.gatherings][0])).toHaveLength(2);
  });

  it('o planejador escolhe duplas só quando são quatro ou mais', () => {
    const { sim } = campusWith(IDS);
    const ch = sim.chars.get('ana')!;
    expect(sim.social.plan('pingpong', 4, ch)!.players).toBe(4);
    expect(sim.social.plan('pingpong', 3, ch)!.players).toBe(2);
    expect(sim.social.plan('tennis', 2, ch)!.players).toBe(2);
    expect(sim.social.plan('tennis', 5, ch)!.players).toBe(4);
  });

  it('partida de tênis em duplas vai até o fim: games, troféu e o evento com os dois nomes', () => {
    const { sim, clock } = campusWith(IDS);
    sim.social.force('tennis', clock.now, IDS);
    const g = [...sim.social.gatherings][0];
    expect(g.kind).toBe('tennis');
    expect(players(g).every((m) => sim.spots.get(m.spot)!.areaId === COURT_ID)).toBe(true);
    let started = false;
    run(sim, clock, 400, () => {
      started ||= g.phase === 'run';
      return g.phase === 'final' || g.phase === 'ended';
    });
    expect(started).toBe(true);
    expect(Math.max(...g.score)).toBe(2);
    expect(sim.social.events.some((e) => e.icon === '🎾' && / e /.test(e.text))).toBe(true);
  });

  it('fora do campus não há quadra nem mesas de duplas', () => {
    const { sim } = campusWith(IDS, 'idle', {}, null);
    const ch = sim.chars.get('ana')!;
    expect(sim.social.plan('tennis', 2, ch)).toBeNull();
    expect(sim.social.plan('pingpong', 4, ch)?.players ?? 2).toBe(2);
  });
});

describe('cápsulas de dormir', () => {
  const sleepy = { statusSince: T0 - 11 * 60_000 };

  it('ocioso há muito tempo vai dormir numa cápsula livre e acorda quando o trabalho chama', () => {
    const { sim, clock } = campusWith(['ana'], 'idle', sleepy);
    const ana = sim.chars.get('ana')!;
    run(sim, clock, 90, () => ana.step?.t === 'pod' && ana.step.phase === 1);
    expect(ana.step?.t).toBe('pod');
    expect(ana.inside).toBe(true);
    expect(sim.podBusy.size).toBe(1);
    const pod = sim.spots.get((ana.step as { spot: string }).spot)!;
    expect(pod.areaId).toBe(REST_ID);
    expect(sim.social.doing('ana')).toContain('💤');
    // chegou trabalho: sai da cápsula e volta à mesa
    sim.applySnapshot(snap([room('/a', 0, LAPTOP)], [agent('ana', '/a', 'working', { statusSince: clock.now })], MACHINES, 2), clock.now);
    run(sim, clock, 90, () => ana.atSpot === ana.homeSpot && !ana.step);
    expect(sim.podBusy.size).toBe(0);
    expect(ana.inside).toBe(false);
    expect(ana.atSpot).toBe(ana.homeSpot);
  });

  it('plano descartado no meio da soneca (roda forçada, mudança de prédio): sai da cápsula na hora', () => {
    const { sim, clock } = campusWith(['ana'], 'idle', sleepy);
    const ana = sim.chars.get('ana')!;
    run(sim, clock, 90, () => ana.step?.t === 'pod' && ana.step.phase === 1);
    expect(ana.inside).toBe(true);
    sim.clearPlan(ana);
    expect(ana.inside).toBe(false);
    expect(ana.alpha).toBe(1);
    expect(sim.podBusy.size).toBe(0);
  });

  it('cada um na sua cápsula; quem trabalha nunca dorme', () => {
    const { sim, clock } = campusWith(IDS, 'idle', sleepy);
    const busy = campusWith(['bia'], 'working', sleepy);
    run(sim, clock, 120, () => sim.podBusy.size === IDS.length);
    expect(sim.podBusy.size).toBe(IDS.length);
    run(busy.sim, busy.clock, 60);
    expect(busy.sim.podBusy.size).toBe(0);
  });

  it('no prédio único (sem cápsulas) segue cochilando na mesa', () => {
    const { sim, clock } = campusWith(['ana'], 'idle', sleepy, null);
    const ana = sim.chars.get('ana')!;
    run(sim, clock, 20);
    expect(ana.atSpot).toBe(ana.homeSpot);
    expect(ana.pose).toBe('sleep');
  });
});

describe('fumantes', () => {
  it('traço por semente: minoria (~15–20%), sempre o mesmo para a mesma pessoa', () => {
    let n = 0;
    const N = 4000;
    for (let i = 1; i <= N; i++) if (isSmokerSeed(i * 104729)) n++;
    expect(n / N).toBeGreaterThan(0.12);
    expect(n / N).toBeLessThan(SMOKER_CHANCE + 0.03);
    expect(isSmokerSeed(seedWhere(true))).toBe(isSmokerSeed(seedWhere(true)));
  });

  it('só fumantes acendem um cigarro (sozinhos ou na roda de fumantes)', () => {
    const smoker = seedWhere(true);
    const clean = seedWhere(false);
    expect(kindWeight('smoke', personaFor(clean))).toBe(0);
    expect(kindWeight('smoke', personaFor(smoker))).toBeGreaterThan(0);
    const { sim } = campusWith(['ana', 'bia'], 'idle');
    sim.chars.get('ana')!.info.seed = smoker;
    sim.chars.get('bia')!.info.seed = clean;
    expect(planSmoke(sim, sim.chars.get('bia')!)).toBe(false);
    const ana = sim.chars.get('ana')!;
    expect(planSmoke(sim, ana)).toBe(true);
    const go = ana.queue.find((s) => s.t === 'go') as { tx: number; ty: number };
    const spot = [...sim.spots.ofKind('smoke')].find((s) => s.tx === go.tx && s.ty === go.ty)!;
    expect(spot.areaId).toBe(SMOKING_ID);
    expect(ana.queue.some((s) => s.t === 'act' && s.held === 'cigarette')).toBe(true);
  });
});

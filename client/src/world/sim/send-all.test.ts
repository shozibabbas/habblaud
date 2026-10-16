// "Chamar todo mundo" (sim/send-all.ts): quem vai e quem fica, safs enchendo da frente, mesas em duplas com a sobra na
// torcida, cápsulas com a sobra na mesa, só fumantes no cigarro, e a volta às mesas sem cortar uma oração no meio.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, MachineRef, MachineStatus, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { MEN_ID, WOMEN_ID } from '../layout/mosque';
import { players } from '../social/gathering';
import { personaFor } from '../social/persona';
import { planPrayerVisit } from './prayer';
import { availableActivities, partition, sendAll, SEND_ACTIVITIES } from './send-all';
import { Sim } from './sim';

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};
const look = (l: 'm' | 'f'): Appearance =>
  ({ look: l, skin: '#c68642', hair: '#2b1d14', hairStyle: 'short', accessory: 'none', accessoryColor: '#333333', shoes: '#222222' }) as unknown as Appearance;
const art = { appearanceFromSeed: (_s: number, o?: { look?: 'm' | 'f' }) => look(o?.look ?? 'm'), roomTheme: () => theme } as unknown as ArtModule;
const T0 = 1_700_000_000_000;
const LAPTOP: MachineRef = { id: 'local', name: 'Laptop' };
const SRV: MachineRef = { id: 'server1', name: 'server1' };
const MACHINES: MachineStatus[] = [
  { ...LAPTOP, online: true, since: T0, local: true },
  { ...SRV, online: true, since: T0 },
];

interface Who {
  id: string;
  look?: 'm' | 'f';
  status?: AgentInfo['status'];
  seed?: number;
  room?: string;
}

function agent(w: Who, campus: boolean): AgentInfo {
  return {
    id: w.id,
    kind: 'main',
    roomId: w.room ?? '/a',
    name: w.id,
    look: w.look ?? 'm',
    role: 'Agente principal',
    sessionId: `s-${w.id}`,
    account: '.claude',
    status: w.status ?? 'idle',
    recent: [],
    tasks: [],
    startedAt: T0,
    lastEventAt: T0,
    statusSince: T0,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: w.seed ?? w.id.length * 7919 + w.id.charCodeAt(0) * 31 + w.id.charCodeAt(w.id.length - 1),
    ...(campus ? { machine: LAPTOP } : {}),
  };
}

const ROOMS = ['/a', '/b', '/c', '/d'];

function snap(who: Who[], campus = true, rev = 1): OfficeSnapshot {
  return {
    rev,
    serverTime: T0,
    rooms: ROOMS.map((id, slot) => ({ id, name: id, path: id, slot, seed: 7 + slot * 13, createdAt: T0, ...(campus ? { machine: LAPTOP, baseName: id } : {}) }) as RoomInfo),
    agents: who.map((w) => agent(w, campus)),
    accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: false, sources: [], startedAt: T0, version: 't', ...(campus ? { machines: MACHINES } : {}) },
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

/** n agentes ociosos espalhados pelas salas. */
const crowd = (n: number, extra: Partial<Who> = {}): Who[] => Array.from({ length: n }, (_, i) => ({ id: `ag${i}`, look: i % 2 ? 'f' : 'm', room: ROOMS[i % ROOMS.length], ...extra }));

function office(who: Who[], campus = true) {
  const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
  const clock = { now: T0 };
  sim.applySnapshot(snap(who, campus), clock.now);
  run(sim, clock, 0.5);
  return { sim, clock };
}

describe('menu de atividades: o que existe em cada escritório', () => {
  it('campus: tudo, com o chamado para a oração primeiro; prédio único: chai, TV, pingue-pongue, passeio e mesas', () => {
    const campus = office(crowd(2)).sim;
    expect(availableActivities(campus).map((a) => a.id)).toEqual(SEND_ACTIVITIES.map((a) => a.id));
    expect(availableActivities(campus)[0].id).toBe('prayer');
    const single = office(crowd(2), false).sim;
    expect(availableActivities(single).map((a) => a.id)).toEqual(['chai', 'tv', 'pingpong', 'walk', 'desk']);
  });

  it('grupos de 2 a 4 sem ninguém sozinho', () => {
    expect(partition(1, 2, 4)).toEqual([1]);
    expect(partition(2, 2, 4)).toEqual([2]);
    expect(partition(5, 2, 4)).toEqual([3, 2]);
    expect(partition(6, 2, 4)).toEqual([3, 3]);
    expect(partition(8, 2, 4)).toEqual([4, 4]);
    expect(partition(9, 2, 4)).toEqual([3, 3, 3]);
    expect(partition(0, 2, 4)).toEqual([]);
  });
});

describe('chamado para a oração', () => {
  it('todos os livres vão (homens e mulheres, cada um na sua ala, da frente para trás); quem trabalha fica', () => {
    const who = [...crowd(8), { id: 'w1', status: 'working' as const }, { id: 'w2', status: 'waiting' as const }];
    const { sim, clock } = office(who);
    const res = sendAll(sim, 'prayer', clock.now);
    expect(res.sent).toHaveLength(8);
    expect(res.busy).toBe(2);
    expect(res.skipped).toBe(2);
    expect(sim.callToPrayerAt).toBe(clock.now);
    for (const id of res.sent) expect(sim.chars.get(id)!.prayer).not.toBeNull();
    expect(sim.chars.get('w1')!.prayer).toBeNull();
    // safs: as vagas reservadas são as de menor rank em cada ala
    for (const area of [MEN_ID, WOMEN_ID]) {
      const rows = sim.spots.ofKind('prayer').filter((s) => s.areaId === area);
      const taken = rows.filter((s) => sim.spots.ownerOf(s.id)).map((s) => s.rank ?? 0).sort((a, b) => a - b);
      expect(taken).toEqual(rows.map((s) => s.rank ?? 0).sort((a, b) => a - b).slice(0, 4));
    }
    // e de fato chegam lá e rezam
    let praying = 0;
    run(sim, clock, 120, () => (praying = res.sent.filter((id) => sim.chars.get(id)!.step?.t === 'pray').length) === 8);
    expect(praying).toBe(8);
  });

  it('quem já está rezando conta como indo e não é interrompido', () => {
    const { sim, clock } = office(crowd(3));
    const a = sim.chars.get('ag0')!;
    expect(planPrayerVisit(sim, a, clock.now)).toBe(true);
    const step = () => a.step;
    run(sim, clock, 3);
    const before = step();
    const res = sendAll(sim, 'prayer', clock.now);
    expect(res.sent).toContain('ag0');
    expect(step()).toBe(before);
  });
});

describe('jogos, copa e TV', () => {
  it('pingue-pongue: duplas nas mesas do salão; quem sobra vai para a torcida', () => {
    const { sim, clock } = office(crowd(9));
    const res = sendAll(sim, 'pingpong', clock.now);
    const games = [...sim.social.gatherings].filter((g) => g.kind === 'pingpong');
    expect(games).toHaveLength(2);
    for (const g of games) expect(players(g)).toHaveLength(4);
    expect(res.sent).toHaveLength(9);
    expect(res.extra).toBe(1);
    expect(res.full).toBe(0);
  });

  it('tênis: uma dupla contra outra na quadra, a sobra assiste dos bancos', () => {
    const { sim, clock } = office(crowd(6));
    const res = sendAll(sim, 'tennis', clock.now);
    const g = [...sim.social.gatherings].find((x) => x.kind === 'tennis')!;
    expect(players(g)).toHaveLength(4);
    expect(g.members.filter((m) => m.role === 'watcher')).toHaveLength(2);
    expect(res.extra).toBe(2);
  });

  it('chai: rodas na copa até todos terem lugar (7 = 4 + 3)', () => {
    const { sim, clock } = office(crowd(7));
    const res = sendAll(sim, 'chai', clock.now);
    const rodas = [...sim.social.gatherings].filter((g) => g.kind === 'kitchen');
    expect(rodas.map((g) => g.members.length).sort()).toEqual([3, 4]);
    expect(res.sent).toHaveLength(7);
  });

  it('funciona no prédio único (chai, TV, pingue-pongue)', () => {
    const { sim, clock } = office(crowd(3), false);
    expect(sendAll(sim, 'tv', clock.now).sent).toHaveLength(3);
    expect([...sim.social.gatherings].some((g) => g.kind === 'tv')).toBe(true);
  });

  it('quem está fora da mesa (dormindo numa cápsula) também é chamado, de onde está', () => {
    const { sim, clock } = office(crowd(4));
    sendAll(sim, 'nap', clock.now);
    run(sim, clock, 90, () => sim.podBusy.size === 4);
    expect(sim.podBusy.size).toBe(4);
    const res = sendAll(sim, 'pingpong', clock.now);
    expect(res.sent).toHaveLength(4);
    expect(sim.podBusy.size).toBe(0);
    for (const id of res.sent) expect(sim.chars.get(id)!.inside).toBe(false);
  });
});

describe('cápsulas, cigarro, passeio e mesas', () => {
  it('soneca: enche as cápsulas; quem sobra cochila na mesa', () => {
    const pods = office(crowd(2)).sim.spots.ofKind('pod').length;
    const { sim, clock } = office(crowd(pods + 3));
    const res = sendAll(sim, 'nap', clock.now);
    expect(res.sent).toHaveLength(pods + 3);
    expect(res.extra).toBe(3);
    run(sim, clock, 120, () => sim.podBusy.size === pods);
    expect(sim.podBusy.size).toBe(pods);
  });

  it('cigarro: só fumantes vão; os outros ficam e são contados', () => {
    const seeds = (smoker: boolean, n: number) => {
      const out: number[] = [];
      for (let s = 1; out.length < n; s++) if (personaFor(s * 7907).traits.includes('fumo') === smoker) out.push(s * 7907);
      return out;
    };
    const who = [...seeds(true, 3).map((seed, i) => ({ id: `fum${i}`, seed })), ...seeds(false, 4).map((seed, i) => ({ id: `nao${i}`, seed }))];
    const { sim, clock } = office(who);
    const res = sendAll(sim, 'smoke', clock.now);
    expect(res.nonSmokers).toBe(4);
    expect(res.sent.sort()).toEqual(['fum0', 'fum1', 'fum2']);
    for (const id of ['nao0', 'nao1']) expect(sim.chars.get(id)!.queue.length).toBe(0);
  });

  it('passeio: todos saem e voltam para a mesa', () => {
    const { sim, clock } = office(crowd(3));
    const res = sendAll(sim, 'walk', clock.now);
    expect(res.sent).toHaveLength(3);
    const ana = sim.chars.get('ag0')!;
    expect(ana.queue.some((s) => s.t === 'go')).toBe(true);
    run(sim, clock, 120, () => ana.atSpot === ana.homeSpot && !ana.step && !ana.queue.length);
    expect(ana.atSpot).toBe(ana.homeSpot);
  });

  it('de volta às mesas: rodas e passeios acabam; a oração termina depressa (sem cortar o sujood) e todos voltam', () => {
    const { sim, clock } = office(crowd(5));
    const imam = sim.chars.get('ag0')!;
    expect(planPrayerVisit(sim, imam, clock.now)).toBe(true);
    run(sim, clock, 120, () => imam.step?.t === 'pray' && imam.stepT > 2_500);
    expect(imam.step?.t).toBe('pray');
    sendAll(sim, 'chai', clock.now);
    run(sim, clock, 2);
    const res = sendAll(sim, 'desk', clock.now);
    expect(res.sent).toContain('ag0');
    // ainda rezando: abreviado, não interrompido
    expect(imam.step?.t).toBe('pray');
    const t0 = clock.now;
    run(sim, clock, 10, () => imam.step?.t !== 'pray');
    expect(clock.now - t0).toBeLessThan(7_000);
    expect([...sim.social.gatherings].filter((g) => g.phase !== 'ended')).toHaveLength(0);
    const home = new Set<string>();
    run(sim, clock, 180, () => {
      for (const c of sim.chars.values()) if (c.atSpot === c.homeSpot && !c.prayer && !c.step) home.add(c.id);
      return home.size === sim.chars.size;
    });
    expect(home.size).toBe(sim.chars.size);
    expect(imam.prayer).toBeNull();
  });
});

describe('chamado para a oração com mais gente que torneiras', () => {
  it('ninguém fica de fora: quem chega depois espera a vez da ablução e todos rezam', () => {
    const who = Array.from({ length: 14 }, (_, i) => ({ id: `m${i}`, look: 'm' as const, room: ROOMS[i % ROOMS.length] }));
    const { sim, clock } = office(who);
    const stools = sim.spots.ofKind('wudu').filter((s) => s.areaId === MEN_ID).length;
    expect(stools).toBeLessThan(14);
    const res = sendAll(sim, 'prayer', clock.now);
    expect(res.sent).toHaveLength(14);
    expect(res.full).toBe(0);
    const prayed = new Set<string>();
    run(sim, clock, 400, () => {
      for (const c of sim.chars.values()) if (c.step?.t === 'pray') prayed.add(c.id);
      return prayed.size === 14;
    });
    expect(prayed.size).toBe(14);
  });
});

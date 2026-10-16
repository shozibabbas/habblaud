// Campus do escritório combinado na simulação: um prédio por máquina, vagas e mudanças por prédio, chegada pelo
// elevador do próprio prédio, passeio até o Commons e o prédio único intacto sem meta.machines.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, MachineRef, MachineStatus, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { campusMockFrom, mockCampusSnapshot } from '../campus-mock';
import { COMMONS_W } from '../layout/commons';
import { inRect } from '../layout/geometry';
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
const SRV2: MachineRef = { id: 'server2', name: 'server2' };

function room(id: string, slot: number, m?: MachineRef): RoomInfo {
  const base = id.replace(/^.*\//, '');
  return { id, name: m ? `${m.name} · ${base}` : base, path: id, slot, seed: slot * 99 + 7, createdAt: T0, ...(m ? { machine: m, baseName: base } : {}) };
}

function agent(id: string, roomId: string, status: AgentInfo['status'], m?: MachineRef, extra: Partial<AgentInfo> = {}): AgentInfo {
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
    seed: id.length * 1234567,
    ...(m ? { machine: m } : {}),
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

const status = (m: MachineRef, online = true, local = false): MachineStatus => ({ ...m, online, since: T0, ...(local ? { local: true } : {}) });
const MACHINES = [status(LAPTOP, true, true), status(SRV), status(SRV2)];

function run(sim: Sim, clock: { now: number }, seconds: number, until?: () => boolean): void {
  const steps = Math.round(seconds * 30);
  for (let i = 0; i < steps; i++) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
    if (until?.()) return;
  }
}

const newSim = () => new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);

describe('campus (escritório combinado)', () => {
  it('sem meta.machines (ou com uma só máquina): o prédio único de sempre', () => {
    const sim = newSim();
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')], [status(LAPTOP, true, true)]), T0);
    expect(sim.machines).toBeNull();
    expect(sim.building.campus).toBeUndefined();
    expect(sim.building.key).toBe(String(sim.building.cols));
    expect(sim.rooms.get('/a')!.layout.rect.x).toBe(2 * 16);
  });

  it('cada sala vai para o prédio da sua máquina, com vagas a partir do 0 em cada prédio', () => {
    const sim = newSim();
    const rooms = [room('/a', 0, LAPTOP), room('server1~/b', 1, SRV), room('server1~/c', 2, SRV), room('/d', 3, LAPTOP)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working', LAPTOP), agent('server1~bia', 'server1~/b', 'working', SRV)], MACHINES), T0);
    const campus = sim.building.campus!;
    expect(campus).toBeTruthy();
    expect(campus.buildings.map((b) => b.id)).toEqual(['local', 'server1', 'server2']);
    // a máquina local fica a leste do Commons, a primeira outra a oeste
    expect(campus.buildings[0].wing).toBe('east');
    expect(campus.buildings[1].wing).toBe('west');
    const a = sim.rooms.get('/a')!;
    const d = sim.rooms.get('/d')!;
    const b = sim.rooms.get('server1~/b')!;
    const c = sim.rooms.get('server1~/c')!;
    expect([a.slot, d.slot]).toEqual([0, 1]);
    expect([b.slot, c.slot]).toEqual([0, 1]);
    for (const [r, bld] of [
      [a, 'local'],
      [d, 'local'],
      [b, 'server1'],
      [c, 'server1'],
    ] as const) {
      const bd = campus.buildings.find((x) => x.id === bld)!;
      expect(r.bld).toBe(bld);
      expect(r.layout.bld).toBe(bld);
      expect(inRect(bd.rect, r.layout.rect.x, r.layout.rect.y)).toBe(true);
    }
    // carga inicial: todos já no lugar, dentro do prédio da sua máquina
    run(sim, { now: T0 }, 0.3);
    const bia = sim.chars.get('server1~bia')!;
    expect(bia.atSpot).toBe(bia.homeSpot);
    expect(inRect(campus.buildings[1].rect, bia.tx, bia.ty)).toBe(true);
    // máquina sem salas: prédio pequeno (uma coluna de salas vazia)
    expect(campus.buildings[2].cols).toBe(1);
  });

  it('quem chega sai do elevador do saguão do prédio da própria máquina e vai até a mesa', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0, LAPTOP), room('server1~/b', 1, SRV)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working', LAPTOP)], MACHINES), clock.now);
    run(sim, clock, 0.3);
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working', LAPTOP), agent('server1~caio', 'server1~/b', 'working', SRV)], MACHINES, 2), clock.now);
    const caio = sim.chars.get('server1~caio')!;
    const step = caio.step ?? caio.queue[0];
    expect(step?.t).toBe('elevOut');
    const el = sim.elevators[(step as { elev: number }).elev];
    const lobby = sim.building.campus!.buildings.find((b) => b.id === 'server1')!.lobbyId;
    expect(sim.spots.get(el.spotId)!.areaId).toBe(lobby);
    run(sim, clock, 60, () => !!caio.homeSpot && caio.atSpot === caio.homeSpot && !caio.step && !caio.queue.length);
    expect(caio.atSpot).toBe(caio.homeSpot);
    expect(sim.spots.get(caio.homeSpot)!.areaId).toBe('server1~/b');
  });

  it('ocioso vai até o Commons (café, banheiro, lounge...) pelos caminhos, sem teletransporte', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('server1~/b', 0, SRV)];
    sim.applySnapshot(snap(rooms, [agent('server1~bia', 'server1~/b', 'idle', SRV, { statusSince: T0 })], MACHINES), clock.now);
    run(sim, clock, 0.3);
    const bia = sim.chars.get('server1~bia')!;
    let visited = false;
    let jump = 0;
    let last = { x: bia.tx, y: bia.ty };
    for (let k = 0; k < 6 && !visited; k++) {
      bia.nextOutingAt = 1;
      run(sim, clock, 60, () => {
        const d = Math.abs(bia.tx - last.x) + Math.abs(bia.ty - last.y);
        jump = Math.max(jump, d);
        last = { x: bia.tx, y: bia.ty };
        visited ||= bia.tx >= 0 && bia.tx < COMMONS_W && bia.ty >= 0 && bia.ty < 29;
        return visited;
      });
    }
    expect(visited).toBe(true);
    expect(jump).toBeLessThanOrEqual(2);
  });

  it('compactação por prédio: a sala mais distante se muda para a vaga livre do mesmo prédio', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0, LAPTOP), room('/b', 1, LAPTOP), room('/c', 2, LAPTOP), room('server1~/x', 3, SRV)];
    const agents = [agent('ana', '/a', 'working', LAPTOP), agent('bia', '/b', 'working', LAPTOP), agent('caio', '/c', 'working', LAPTOP), agent('server1~xu', 'server1~/x', 'working', SRV)];
    sim.applySnapshot(snap(rooms, agents, MACHINES), clock.now);
    run(sim, clock, 0.3);
    expect(sim.rooms.get('/c')!.slot).toBe(2);
    // a sala /a (vaga 0) fecha: /c (a mais distante do prédio local) se muda para lá; a do server1 não mexe
    sim.applySnapshot(snap(rooms.slice(1), agents.slice(1).concat(), MACHINES, 2), clock.now);
    sim.applySnapshot(snap(rooms.slice(1), [agent('ana', '/a', 'offline', LAPTOP), ...agents.slice(1)], MACHINES, 3), clock.now);
    run(sim, clock, 120, () => sim.rooms.get('/c')!.slot === 0);
    expect(sim.rooms.get('/c')!.slot).toBe(0);
    expect(sim.rooms.get('/c')!.bld).toBe('local');
    expect(sim.rooms.get('server1~/x')!.slot).toBe(0);
  });

  it('máquina desconectada: o prédio fica apagado (machineOffline) e a chave do campus muda', () => {
    const sim = newSim();
    const rooms = [room('/a', 0, LAPTOP), room('server1~/b', 1, SRV)];
    sim.applySnapshot(snap(rooms, [], MACHINES), T0);
    const k = sim.building.key;
    expect(sim.machineOffline('server1')).toBe(false);
    sim.applySnapshot(snap(rooms, [], [status(LAPTOP, true, true), status(SRV, false), status(SRV2)], 2), T0 + 1000);
    expect(sim.machineOffline('server1')).toBe(true);
    expect(sim.machineOffline('local')).toBe(false);
    expect(sim.building.key).not.toBe(k);
    expect(sim.building.campus!.buildings.find((b) => b.id === 'server1')!.online).toBe(false);
  });

  it('o prédio cresce com as salas e a máquina mantém o lugar quando outra entra', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('server1~/b', 0, SRV)];
    sim.applySnapshot(snap(rooms, [], MACHINES), clock.now);
    const place = sim.building.campus!.buildings.find((b) => b.id === 'server1')!.place;
    const more = [...rooms, room('server1~/c', 1, SRV), room('server1~/d', 2, SRV)];
    const m4 = [...MACHINES, status({ id: 'server3', name: 'server3' })];
    sim.applySnapshot(snap(more, [], m4, 2), clock.now);
    const s1 = sim.building.campus!.buildings.find((b) => b.id === 'server1')!;
    expect(s1.place).toBe(place);
    expect(s1.cols).toBe(2);
    expect(sim.building.campus!.buildings.map((b) => b.place)).toEqual([0, 1, 2, 3]);
  });
});

describe('demonstração do campus no mock', () => {
  it('?machines=N&offline=K', () => {
    expect(campusMockFrom('?mock=1')).toBeNull();
    expect(campusMockFrom('?machines=1')).toBeNull();
    expect(campusMockFrom('?machines=4&offline=2')).toEqual({ machines: 4, offline: 2 });
  });

  it('salas e agentes ganham a máquina, a etiqueta no nome e meta.machines', () => {
    const s = snap([room('/a', 0), room('/b', 1), room('/c', 2)], [agent('ana', '/a', 'working'), agent('bia', '/b', 'idle')]);
    const out = mockCampusSnapshot(s, { machines: 3, offline: 1 });
    const ms = out.meta.machines!;
    expect(ms).toHaveLength(3);
    expect(ms[0].local).toBe(true);
    expect(ms[1].online).toBe(false);
    for (const r of out.rooms) {
      expect(r.machine).toBeTruthy();
      expect(r.name).toBe(`${r.machine!.name} · ${r.baseName}`);
    }
    for (const a of out.agents) expect(a.machine).toEqual(out.rooms.find((r) => r.id === a.roomId)!.machine);
  });

  it('com um dono (meta.owner) o campus ganha a diretoria; sem dono, ou no prédio único, nada muda', () => {
    const sim = newSim();
    const rooms = [room('/p/a', 0, LAPTOP), room('/p/b', 1, SRV)];
    const withOwner = (s: OfficeSnapshot): OfficeSnapshot => ({ ...s, meta: { ...s.meta, owner: { name: 'Ana', look: 'f' } } });
    sim.applySnapshot(snap(rooms, [], MACHINES), T0);
    expect(sim.building.campus?.ceo).toBeUndefined();
    sim.applySnapshot(withOwner(snap(rooms, [], MACHINES, 2)), T0 + 1000);
    expect(sim.building.campus?.ceo).toBeDefined();
    expect(sim.building.areas.filter((a) => a.ceo).map((a) => a.id).sort()).toEqual(['ceo:office', 'ceo:reception']);
    expect(sim.spots.ofKind('ceo_desk')).toHaveLength(1);
    sim.applySnapshot(snap(rooms, [], MACHINES, 3), T0 + 2000);
    expect(sim.building.campus?.ceo).toBeUndefined();
    expect(sim.spots.ofKind('ceo_desk')).toHaveLength(0);
    // prédio único: o dono não cria nada
    const single = newSim();
    single.applySnapshot(withOwner(snap([room('/p/a', 0)], [])), T0);
    expect(single.building.campus).toBeUndefined();
    expect(single.spots.ofKind('ceo_desk')).toHaveLength(0);
    // o mock inventa um dono com owner=1
    expect(campusMockFrom('?machines=4&owner=1')).toEqual({ machines: 4, owner: true });
    expect(mockCampusSnapshot(snap(rooms, []), { machines: 2, owner: true }).meta.owner?.name).toBeTruthy();
    expect(mockCampusSnapshot(snap(rooms, []), { machines: 2 }).meta.owner).toBeUndefined();
  });
});

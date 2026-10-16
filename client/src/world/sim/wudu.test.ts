// Fila da ablução: com mais gente que torneiras, todas as torneiras são usadas, a fila anda na ordem de chegada (a
// primeira torneira que vaga vai para o primeiro da fila), ninguém espera com uma torneira livre, cada um espera num
// lugar só seu e duas pessoas nunca vão para a mesma torneira.
import { describe, expect, it } from 'vitest';
import { DEFAULT_MOSQUE } from '../../../../shared/mosque';
import type { AgentInfo, MachineRef, MachineStatus, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { MEN_ID } from '../layout/mosque';
import { wuduQueueOrder } from './prayer';
import { sendAll } from './send-all';
import { Sim } from './sim';

const theme: RoomTheme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' };
const look = (l: 'm' | 'f'): Appearance =>
  ({ look: l, skin: '#c68642', hair: '#2b1d14', hairStyle: 'short', accessory: 'none', accessoryColor: '#333333', shoes: '#222222', top: '#3355aa' }) as unknown as Appearance;
const art = { appearanceFromSeed: (_s: number, o?: { look?: 'm' | 'f' }) => look(o?.look ?? 'm'), roomTheme: () => theme } as unknown as ArtModule;
const T0 = 1_700_000_000_000;
const LAPTOP: MachineRef = { id: 'local', name: 'Laptop' };
const MACHINES: MachineStatus[] = [
  { ...LAPTOP, online: true, since: T0, local: true },
  { id: 'server1', name: 'server1', online: true, since: T0 },
];
const ROOMS = ['/a', '/b', '/c', '/d'];

function agent(id: string, room: string): AgentInfo {
  return {
    id, kind: 'main', roomId: room, name: id, look: 'm', role: 'Agente principal', sessionId: `s-${id}`, account: '.claude', status: 'idle',
    recent: [], tasks: [], startedAt: T0, lastEventAt: T0, statusSince: T0, stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: id.length * 7919 + id.charCodeAt(1) * 31 + id.charCodeAt(id.length - 1), machine: LAPTOP,
  };
}

describe('fila da ablução', () => {
  it('mais gente que torneiras: todas usadas, a fila anda em ordem, ninguém espera com torneira livre', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm', staff: false }), null);
    const clock = { now: T0 };
    const n = 14;
    const rooms: RoomInfo[] = ROOMS.map((id, slot) => ({ id, name: id, path: id, slot, seed: 7 + slot * 13, createdAt: T0, machine: LAPTOP, baseName: id }));
    const snap: OfficeSnapshot = {
      rev: 1, serverTime: T0, rooms, agents: Array.from({ length: n }, (_, i) => agent(`m${i}`, ROOMS[i % 4])),
      accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
      meta: { demo: false, sources: [], startedAt: T0, version: 't', machines: MACHINES, mosque: { ...DEFAULT_MOSQUE } },
    };
    sim.applySnapshot(snap, clock.now);
    for (let i = 0; i < 30; i++) {
      clock.now += 1000 / 30;
      sim.update(1 / 30, clock.now);
    }
    const res = sendAll(sim, 'prayer', clock.now, { prayer: 'dhuhr' });
    expect(res.sent).toHaveLength(n);
    const taps = sim.spots.ofKind('wudu').filter((s) => s.areaId === MEN_ID);
    expect(taps.length).toBeLessThan(n);
    const usedTaps = new Set<string>();
    const queueOrder: string[] = [];
    const tapOrder: string[] = [];
    const waitedWithFreeTap: string[] = [];
    let maxQueue = 0;
    const waiting = new Map<string, number>();
    for (let i = 0; i < 30 * 300; i++) {
      clock.now += 1000 / 30;
      sim.update(1 / 30, clock.now);
      // quem está na fila (no passo de espera da ablução)
      const order = wuduQueueOrder(sim, 'm');
      for (const id of order) if (!queueOrder.includes(id)) queueOrder.push(id);
      const inQueue = [...sim.chars.values()].filter((c) => order.includes(c.id) && c.step?.t === 'until');
      maxQueue = Math.max(maxQueue, inQueue.length);
      // ninguém esperando com uma torneira livre por mais de um instante (a vez passa no frame seguinte)
      const freeTap = taps.some((t) => !sim.spots.ownerOf(t.id));
      for (const c of inQueue) {
        const w = freeTap ? (waiting.get(c.id) ?? 0) + 1 : 0;
        waiting.set(c.id, w);
        if (w > 3 && !waitedWithFreeTap.includes(c.id)) waitedWithFreeTap.push(c.id);
      }
      // duas pessoas nunca na mesma torneira, e cada uma num tile de espera só seu
      const owners = taps.map((t) => sim.spots.ownerOf(t.id)).filter(Boolean);
      expect(new Set(owners).size).toBe(owners.length);
      const tiles = inQueue.filter((c) => c.step?.t === 'until').map((c) => `${c.tx},${c.ty}`);
      expect(new Set(tiles).size).toBe(tiles.length);
      for (const c of sim.chars.values()) {
        if (c.pose !== 'wudu' || !c.atSpot) continue;
        usedTaps.add(c.atSpot);
        if (!tapOrder.includes(c.id)) tapOrder.push(c.id);
      }
      if (tapOrder.length === n) break;
    }
    expect(tapOrder).toHaveLength(n);
    expect(usedTaps.size).toBe(taps.length);
    expect(maxQueue).toBeGreaterThan(0);
    expect(waitedWithFreeTap).toEqual([]);
    // a fila anda em ordem: quem entrou antes na fila chega antes à torneira
    const served = tapOrder.filter((id) => queueOrder.includes(id));
    expect(served).toEqual(queueOrder);
  });
});

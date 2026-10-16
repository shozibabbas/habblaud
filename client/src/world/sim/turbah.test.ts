// Estilo shia: em todo sujood — de agentes, da equipe (limpeza, recepção), do dono e da secretária e dos religiosos
// (liderando a congregação ou no nafl) — há uma turbah no carpete exatamente sob a testa, e a arte desenha a testa
// sobre ela. No estilo sunni, nenhuma.
import { describe, expect, it } from 'vitest';
import { DEFAULT_MOSQUE, type MosqueSettings } from '../../../../shared/mosque';
import type { AgentInfo, MachineRef, MachineStatus, OfficeSnapshot, OwnerInfo, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { appearanceFromSeed } from '../../art/character/appearance';
import { TURBAH_DX } from '../../art/character/prayer';
import { CHAR_AY, renderCharacter } from '../../art/character/render';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { imamTurbahs, turbahsOf, turbahSpot, turbahUnder } from './jamaat';
import { prayerSequence } from './salat';
import { sendAll } from './send-all';
import { Sim } from './sim';
import { isStaff } from './staff';

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
const OWNER: OwnerInfo = { name: 'Shozib', title: 'CEO', look: 'm', secretary: { name: 'Mehwish', look: 'f' } };

function agent(id: string, l: 'm' | 'f'): AgentInfo {
  return {
    id, kind: 'main', roomId: '/a', name: id, look: l, role: 'Agente principal', sessionId: `s-${id}`, account: '.claude', status: 'idle',
    recent: [], tasks: [], startedAt: T0, lastEventAt: T0, statusSince: T0, stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: id.length * 7919 + id.charCodeAt(1) * 31, machine: LAPTOP,
  };
}

function office(style: MosqueSettings['style']) {
  const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm', staff: true }), null);
  const clock = { now: T0 };
  const room: RoomInfo = { id: '/a', name: '/a', path: '/a', slot: 0, seed: 7, createdAt: T0, machine: LAPTOP, baseName: '/a' };
  const snap: OfficeSnapshot = {
    rev: 1, serverTime: T0, rooms: [room], agents: Array.from({ length: 6 }, (_, i) => agent(`a${i}`, i % 2 ? 'f' : 'm')),
    accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: false, sources: [], startedAt: T0, version: 't', machines: MACHINES, owner: OWNER, mosque: { ...DEFAULT_MOSQUE, style } },
  };
  sim.applySnapshot(snap, clock.now);
  return { sim, clock };
}

function run(sim: Sim, clock: { now: number }, seconds: number, each?: () => boolean | void): void {
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
    if (each?.()) return;
  }
}

/** Quem é (para contar cada grupo). */
function kind(sim: Sim, id: string): string {
  if (!isStaff({ id })) return 'agent';
  return sim.staff.member(id)?.role ?? 'staff';
}

describe('turbah no sujood (estilo shia)', () => {
  it('a arte desenha a turbah sob a testa, no mesmo lugar da do carpete', () => {
    const a = appearanceFromSeed(5, { look: 'm' });
    const s = renderCharacter({ appearance: a, dir: 'left', pose: 'sujood', frame: 0, held: 'turbah' });
    const without = renderCharacter({ appearance: a, dir: 'left', pose: 'sujood', frame: 0 });
    const clay = (b: typeof s.buf, x: number, y: number) => {
      const i = (y * b.w + x) * 4;
      return b.data[i] === 0x9a && b.data[i + 1] === 0x8e && b.data[i + 2] === 0x7e;
    };
    // linha da base, no deslocamento TURBAH_DX dos pés
    const x0 = s.ax + TURBAH_DX;
    expect(clay(s.buf, x0, CHAR_AY - 1)).toBe(true);
    expect(clay(without.buf, x0, CHAR_AY - 1)).toBe(false);
  });

  it('agentes, equipe, o dono e a secretária e os religiosos: toda prostração tem a turbah sob a testa', () => {
    const { sim, clock } = office('shia');
    run(sim, clock, 2);
    const res = sendAll(sim, 'prayer', clock.now, { prayer: 'fajr' });
    expect(res.sent.length).toBeGreaterThan(0);
    const seen = new Map<string, number>();
    const bad: string[] = [];
    run(sim, clock, 420, () => {
      const drawn = turbahsOf(sim);
      for (const c of sim.chars.values()) {
        if (c.step?.t !== 'pray' || c.pose !== 'sujood') continue;
        const k = kind(sim, c.id);
        seen.set(k, (seen.get(k) ?? 0) + 1);
        const want = turbahSpot(c.x, c.y);
        if (!turbahUnder(sim, c) || !drawn.some((t) => t.x === want.x && t.y === want.y)) bad.push(`${c.id}@${clock.now}`);
      }
    });
    expect(bad).toEqual([]);
    for (const k of ['agent', 'cleric', 'cleaner', 'ceo', 'secretary']) expect(seen.get(k) ?? 0, k).toBeGreaterThan(0);
  });

  it('o nafl dos religiosos também (a turbah fica sempre no lugar do imam); no estilo sunni, nenhuma turbah', () => {
    const { sim, clock } = office('shia');
    run(sim, clock, 2);
    const imams = imamTurbahs(sim);
    expect(imams).toHaveLength(2);
    // o aalim e a aalima rezam um nafl sozinhos no lugar do imam
    for (const m of sim.staff.members.values()) {
      if (m.role !== 'cleric') continue;
      sim.clearPlan(m.ch);
      const s = sim.spots.ofKind('staff').find((p) => p.group === `cleric:imam:${m.index === 0 ? 'm' : 'f'}`)!;
      m.ch.queue.push({ t: 'go', tx: s.tx, ty: s.ty, fx: s.x, fy: s.y, dir: 'left' }, { t: 'pray', seq: prayerSequence(m.ch.rng, 2, 'shia') });
    }
    let sujood = 0;
    run(sim, clock, 90, () => {
      for (const m of sim.staff.members.values()) {
        if (m.role !== 'cleric' || m.ch.pose !== 'sujood') continue;
        sujood++;
        expect(turbahUnder(sim, m.ch)).toBe(true);
      }
    });
    expect(sujood).toBeGreaterThan(0);
    const sunni = office('sunni');
    run(sunni.sim, sunni.clock, 2);
    sendAll(sunni.sim, 'prayer', sunni.clock.now, { prayer: 'fajr' });
    let any = 0;
    run(sunni.sim, sunni.clock, 200, () => {
      any += turbahsOf(sunni.sim).length;
      for (const c of sunni.sim.chars.values()) if (c.pose === 'sujood') expect(turbahUnder(sunni.sim, c)).toBe(false);
    });
    expect(any).toBe(0);
  });
});

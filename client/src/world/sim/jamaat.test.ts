// Oração em congregação e os religiosos da mesquita: sequências sunni × shia (mãos, qunoot, rak'ahs de cada oração,
// orações juntas, reposição de quem chega atrasado), o relógio dos horários (uma vez por oração, carga da página, aba
// oculta), o aalim e a aalima (função, nomes, lugares) e a congregação no mesmo ritmo do imam, com turbahs no estilo shia.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../../shared/hash';
import { DEFAULT_MOSQUE, type MosqueSettings } from '../../../../shared/mosque';
import type { PrayerAt } from '../../../../shared/prayer-times';
import type { AgentInfo, MachineRef, MachineStatus, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { CLERIC_IMAM, clericGroup, MEN_ID, WOMEN_ID } from '../layout/mosque';
import { CLERIC_NAMES } from './cleric';
import { currentPrayer, followPose, imamTurbahs, jamaatOf, startJamaat, turbahsOf, type Follow, type Jamaat } from './jamaat';
import { GRACE_MS, PrayerClock } from './prayer-clock';
import { endingMs, endingPhases, hurrySequence, makeupSequence, missedRakahs, prayersFor, prayerSequence, RAKAHS, sequenceMs, sessionSequence, skipCall } from './salat';
import { sendAll } from './send-all';
import { Sim } from './sim';
import { staffRoles } from './staff';

const rng = () => mulberry32(7);

describe('sequências: sunni × shia', () => {
  it('sunni: mãos cruzadas (qiyam), sem qunoot; shia: mãos ao lado (sadl) e qunoot na 2ª rak\'ah antes do ruku', () => {
    const sunni = prayerSequence(rng(), 2, 'sunni');
    expect(sunni.some((p) => p.pose === 'qiyam')).toBe(true);
    expect(sunni.some((p) => p.pose === 'sadl' || p.pose === 'qunoot')).toBe(false);
    const shia = prayerSequence(rng(), 4, 'shia');
    expect(shia.some((p) => p.pose === 'qiyam')).toBe(false);
    expect(shia.some((p) => p.pose === 'sadl')).toBe(true);
    const q = shia.filter((p) => p.pose === 'qunoot');
    expect(q).toHaveLength(1);
    expect(q[0].rakah).toBe(1);
    const i = shia.indexOf(q[0]);
    expect(shia[i - 1].pose).toBe('sadl');
    expect(shia[i + 1].pose).toBe('ruku');
  });

  it("rak'ahs: Fajr 2, Dhuhr/Asr/Isha 4, Maghrib 3; tashahhud no meio (depois da 2ª) e no fim", () => {
    expect(RAKAHS).toEqual({ fajr: 2, dhuhr: 4, asr: 4, maghrib: 3, isha: 4 });
    for (const [n, style] of [
      [2, 'sunni'],
      [3, 'shia'],
      [4, 'sunni'],
    ] as const) {
      const seq = prayerSequence(rng(), n, style);
      expect(seq.filter((p) => p.pose === 'ruku')).toHaveLength(n);
      expect(seq.filter((p) => p.pose === 'sujood')).toHaveLength(2 * n);
      const tashahhud = seq.filter((p, i) => p.pose === 'jalsa' && !p.end && seq[i + 1]?.pose !== 'sujood');
      expect(tashahhud).toHaveLength(n > 2 ? 2 : 1);
      expect(seq.at(-1)!.end).toBe(true);
    }
  });

  it('o fim: sunni = salam virando a cabeça; shia = salam sentado olhando a qibla e três takbirs sentado (mãos às orelhas e às coxas)', () => {
    const sunni = prayerSequence(rng(), 2, 'sunni');
    expect(sunni.filter((p) => p.end).map((p) => p.pose)).toEqual(['salam']);
    expect(sunni.some((p) => p.pose === 'takbir_seated')).toBe(false);
    const shia = prayerSequence(rng(), 2, 'shia');
    const end = shia.filter((p) => p.end).map((p) => p.pose);
    expect(end).toEqual(['jalsa', 'takbir_seated', 'jalsa', 'takbir_seated', 'jalsa', 'takbir_seated', 'jalsa']);
    // sem virar a cabeça: nenhuma pose 'salam' (a que vira a cabeça) no estilo shia
    expect(shia.some((p) => p.pose === 'salam')).toBe(false);
    // o fim vem depois do tashahhud final
    const first = shia.findIndex((p) => p.end);
    expect(shia[first - 1].pose).toBe('jalsa');
    expect(endingPhases('shia').reduce((a, p) => a + p.ms, 0)).toBe(endingMs(shia));
    // atrasado e chamado no meio: também terminam do jeito do estilo
    expect(makeupSequence(rng(), 1, 'shia').filter((p) => p.pose === 'takbir_seated')).toHaveLength(3);
    expect(hurrySequence(shia, 2000).filter((p) => p.pose === 'takbir_seated')).toHaveLength(3);
    expect(hurrySequence(sunni, 2000).at(-1)!.pose).toBe('salam');
    // no meio dos takbirs: termina os que faltam, sem recomeçar
    const t = shia.slice(0, shia.findIndex((p) => p.pose === 'takbir_seated') + 1).reduce((a, p) => a + p.ms, 0) + 100;
    expect(hurrySequence(shia, t).filter((p) => p.pose === 'takbir_seated')).toHaveLength(2);
  });

  it('orações juntas (shia, combine): Dhuhr+Asr e Maghrib+Isha, dois takbirs e dois salams; Asr e Isha não chamam', () => {
    expect(prayersFor('dhuhr', 'shia', true)).toEqual(['dhuhr', 'asr']);
    expect(prayersFor('maghrib', 'shia', true)).toEqual(['maghrib', 'isha']);
    expect(prayersFor('dhuhr', 'shia', false)).toEqual(['dhuhr']);
    expect(prayersFor('dhuhr', 'sunni', true)).toEqual(['dhuhr']);
    expect(skipCall('asr', 'shia', true)).toBe(true);
    expect(skipCall('asr', 'shia', false)).toBe(false);
    const seq = sessionSequence(rng(), [4, 4], 'shia');
    expect(seq.filter((p) => p.pose === 'takbir')).toHaveLength(2);
    // cada oração termina com os seus três takbirs sentado
    expect(seq.filter((p) => p.pose === 'takbir_seated')).toHaveLength(6);
    expect(sessionSequence(rng(), [4, 4], 'sunni').filter((p) => p.pose === 'salam')).toHaveLength(2);
    expect(seq.filter((p) => p.pose === 'ruku')).toHaveLength(8);
  });

  it("quem chega depois do ruku perde a rak'ah e repõe sozinho depois do salam do imam", () => {
    const seq = sessionSequence(rng(), [4], 'sunni');
    expect(missedRakahs(seq, 0)).toBe(0);
    // logo depois do 1º ruku: perdeu 1
    let t = 0;
    for (const p of seq) {
      t += p.ms;
      if (p.pose === 'ruku') break;
    }
    expect(missedRakahs(seq, t - 1)).toBe(0);
    expect(missedRakahs(seq, t + 1)).toBe(1);
    expect(missedRakahs(seq, sequenceMs(seq) - 3000)).toBe(4);
    const mk = makeupSequence(rng(), 2, 'sunni');
    expect(mk.filter((p) => p.pose === 'ruku')).toHaveLength(2);
    expect(mk.at(-1)!.pose).toBe('salam');
    expect(makeupSequence(rng(), 0, 'sunni')).toEqual([]);
  });

  it('quem segue: espera em pé antes do início, acompanha o imam e o atrasado completa as rak\'ahs', () => {
    const j: Jamaat = { section: 'm', prayers: ['fajr'], style: 'shia', seq: sessionSequence(rng(), [2], 'shia'), calledAt: 0, startAt: null, members: new Set(), imam: null, majlis: 'none' };
    const onTime: Follow = { j };
    expect(followPose(onTime, 100, rng())).toBe('stand');
    j.startAt = 1000;
    const total = sequenceMs(j.seq);
    for (let t = 0; t < total; t += 700) {
      const imam = j.seq.reduce<{ acc: number; pose: string | null }>((s, p) => (s.pose === null && t < s.acc + p.ms ? { acc: s.acc, pose: p.pose } : { acc: s.acc + p.ms, pose: s.pose }), { acc: 0, pose: null }).pose;
      expect(followPose(onTime, 1000 + t, rng())).toBe(imam);
    }
    expect(followPose(onTime, 1000 + total + 10, rng())).toBeNull();
    // atrasado (entrou na 2ª rak'ah depois do ruku dela): termina depois do imam
    const late: Follow = { j };
    expect(followPose(late, 1000 + total - 4000, rng())).toBe('takbir');
    expect(followPose(late, 1000 + total + 10, rng())).not.toBeNull();
    expect(late.makeup!.filter((p) => p.pose === 'ruku').length).toBe(2);
  });
});

describe('horários: o chamado automático', () => {
  const day = (h: number, m = 0) => Date.UTC(2026, 9, 16, h - 5, m);
  const times: PrayerAt[] = [
    { name: 'fajr', at: day(5), day: '2026-10-16' },
    { name: 'dhuhr', at: day(11, 53), day: '2026-10-16' },
    { name: 'asr', at: day(15, 7), day: '2026-10-16' },
    { name: 'maghrib', at: day(17, 49), day: '2026-10-16' },
    { name: 'isha', at: day(18, 37), day: '2026-10-16' },
  ];
  const clock = () => {
    const c = new PrayerClock(() => 5);
    (c as unknown as { times: () => PrayerAt[] }).times = () => times;
    return c;
  };
  const m: MosqueSettings = { ...DEFAULT_MOSQUE, style: 'shia' };

  it('dispara uma vez por oração, no horário', () => {
    const c = clock();
    expect(c.check(m, day(11, 53) - 5000)).toEqual([]);
    const ev = c.check(m, day(11, 53) + 500);
    expect(ev).toEqual([{ name: 'dhuhr', at: times[1].at, call: true, hidden: false }]);
    expect(c.check(m, day(11, 53) + 1500)).toEqual([]);
    expect(c.check(m, day(11, 54))).toEqual([]);
  });

  it('ao abrir a página: não chama o que passou, só nos primeiros minutos depois do horário', () => {
    expect(clock().check(m, day(12, 30))).toEqual([]);
    expect(clock().check(m, day(11, 53) + GRACE_MS - 1000).map((e) => e.name)).toEqual(['dhuhr']);
  });

  it('aba oculta no horário: avisa (e só chama se ainda está nos primeiros minutos)', () => {
    const c = clock();
    c.check(m, day(11, 0));
    expect(c.check(m, day(11, 55))).toEqual([{ name: 'dhuhr', at: times[1].at, call: true, hidden: true }]);
    const c2 = clock();
    c2.check(m, day(11, 0));
    expect(c2.check(m, day(12, 30))).toEqual([{ name: 'dhuhr', at: times[1].at, call: false, hidden: true }]);
  });

  it('combine: o Asr não chama; chamado desligado: nada', () => {
    const c = clock();
    c.check({ ...m, combine: true }, day(15, 0));
    expect(c.check({ ...m, combine: true }, day(15, 7) + 500)).toEqual([]);
    const off = clock();
    off.check({ ...m, call: false }, day(11, 50));
    expect(off.check({ ...m, call: false }, day(11, 53) + 500)).toEqual([]);
  });

  it('a oração da hora atual (menu Atividades): a última que já começou; antes do Fajr, o Isha', () => {
    expect(currentPrayer(times, day(12))).toBe('dhuhr');
    expect(currentPrayer(times, day(4))).toBe('isha');
    expect(currentPrayer(times, day(19))).toBe('isha');
  });
});

// =================================================================== simulação

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

function agent(id: string, l: 'm' | 'f'): AgentInfo {
  return {
    id, kind: 'main', roomId: '/a', name: id, look: l, role: 'Agente principal', sessionId: `s-${id}`, account: '.claude', status: 'idle',
    recent: [], tasks: [], startedAt: T0, lastEventAt: T0, statusSince: T0, stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: id.length * 7919 + id.charCodeAt(1) * 31, machine: LAPTOP,
  };
}

function office(n: number, style: MosqueSettings['style']) {
  const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm', staff: true }), null);
  const clock = { now: T0 };
  const room: RoomInfo = { id: '/a', name: '/a', path: '/a', slot: 0, seed: 7, createdAt: T0, machine: LAPTOP, baseName: '/a' };
  const snap: OfficeSnapshot = {
    rev: 1, serverTime: T0, rooms: [room], agents: Array.from({ length: n }, (_, i) => agent(`a${i}`, i % 2 ? 'f' : 'm')),
    accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: false, sources: [], startedAt: T0, version: 't', machines: MACHINES, mosque: { ...DEFAULT_MOSQUE, style } },
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

describe('religiosos e congregação', () => {
  it('função cleric registrada: um aalim e uma aalima no campus, com nome curto e o rótulo de cada um', () => {
    expect(staffRoles().some((r) => r.role === 'cleric')).toBe(true);
    const { sim } = office(2, 'shia');
    const clerics = [...sim.staff.members.values()].filter((m) => m.role === 'cleric');
    expect(clerics).toHaveLength(2);
    expect(clerics.map((m) => m.ch.info.name).sort()).toEqual([CLERIC_NAMES.m, CLERIC_NAMES.f].sort());
    expect(clerics.map((m) => m.ch.info.look).sort()).toEqual(['f', 'm']);
    expect(sim.staff.card(clerics[0].id)!.role).toBe('Aalim');
    expect(sim.staff.card(clerics[1].id)!.role).toBe('Aalima');
    // roupas: qaba, aba e turbante; abaya e hijab
    expect(clerics[0].ch.appearance).toMatchObject({ topStyle: 'qaba_aba', accessory: 'amama', facialHair: 'beard' });
    expect(clerics[1].ch.appearance).toMatchObject({ topStyle: 'abaya', accessory: 'hijab' });
  });

  it('chamado (shia): o imam na frente, todos no mesmo ritmo dele, turbahs no carpete, majlis depois e cada um na sua ala', () => {
    const { sim, clock } = office(8, 'shia');
    run(sim, clock, 1);
    const res = sendAll(sim, 'prayer', clock.now, { prayer: 'fajr' });
    expect(res.sent).toHaveLength(8);
    const jm = jamaatOf(sim, 'm')!;
    const jf = jamaatOf(sim, 'f')!;
    expect(jm.prayers).toEqual(['fajr']);
    let synced = 0;
    let checked = 0;
    let turbahs = 0;
    let majlis = false;
    const imamSpot = sim.spots.ofKind('staff').find((s) => s.group === clericGroup(CLERIC_IMAM, 'm'))!;
    run(sim, clock, 400, () => {
      for (const j of [jm, jf]) {
        if (j.startAt === null || !j.imam) continue;
        const imam = sim.chars.get(j.imam)!;
        if (imam.step?.t !== 'pray') continue;
        for (const id of j.members) {
          const c = sim.chars.get(id)!;
          if (c.step?.t !== 'pray' || !c.step.follow || c.step.follow.makeup?.length) continue;
          checked++;
          if (c.pose === imam.pose) synced++;
          expect(c.dir).toBe('left');
        }
      }
      turbahs = Math.max(turbahs, [...turbahsOf(sim)].length);
      if (typeof jm.majlis === 'object') majlis = true;
      return !jamaatOf(sim, 'm') && !jamaatOf(sim, 'f') && majlis;
    });
    expect(jm.startAt).not.toBeNull();
    expect(checked).toBeGreaterThan(100);
    expect(synced / checked).toBeGreaterThan(0.97);
    // o imam (o aalim) liderou do lugar dele; cada um rezou na sua ala
    expect(sim.staff.member(jm.imam)!.ch.info.name).toBe(CLERIC_NAMES.m);
    expect(sim.staff.member(jf.imam)!.ch.info.name).toBe(CLERIC_NAMES.f);
    expect(imamSpot.areaId).toBe(MEN_ID);
    for (const id of jm.members) expect(sim.chars.get(id)!.appearance.look).toBe('m');
    for (const id of jf.members) expect(sim.chars.get(id)!.appearance.look).toBe('f');
    expect(turbahs).toBeGreaterThanOrEqual(8);
    expect(majlis).toBe(true);
    // todos levantam, devolvem a turbah e saem: ficam só as turbahs fixas dos dois lugares do imam
    run(sim, clock, 8);
    expect(turbahsOf(sim)).toEqual(imamTurbahs(sim));
    expect(imamTurbahs(sim)).toHaveLength(2);
    void WOMEN_ID;
  });

  it('sunni: sem turbah, e as posturas em pé são o qiyam de mãos cruzadas', () => {
    const { sim, clock } = office(4, 'sunni');
    run(sim, clock, 1);
    sendAll(sim, 'prayer', clock.now, { prayer: 'maghrib' });
    const poses = new Set<string>();
    let turbahs = 0;
    run(sim, clock, 300, () => {
      for (const c of sim.chars.values()) if (c.step?.t === 'pray') poses.add(c.pose);
      turbahs = Math.max(turbahs, [...turbahsOf(sim)].length);
      return !jamaatOf(sim, 'm') && poses.has('salam');
    });
    expect(poses.has('qiyam')).toBe(true);
    expect(poses.has('sadl')).toBe(false);
    expect(poses.has('qunoot')).toBe(false);
    // o fim sunni: o salam virando a cabeça, sem os takbirs sentado
    expect(poses.has('salam')).toBe(true);
    expect(poses.has('takbir_seated')).toBe(false);
    expect(turbahs).toBe(0);
  });

  it('o chamado de novo no meio de uma congregação não a recomeça', () => {
    const { sim, clock } = office(2, 'shia');
    startJamaat(sim, clock.now, 'dhuhr', 'shia', true);
    const j = jamaatOf(sim, 'm')!;
    expect(j.prayers).toEqual(['dhuhr', 'asr']);
    startJamaat(sim, clock.now + 1000, 'asr', 'shia', false);
    expect(jamaatOf(sim, 'm')).toBe(j);
  });
});

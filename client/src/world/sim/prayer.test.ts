// Mesquita do campus: sequência da oração (nafl), saída às pressas, quem reza, seções por look, camadas de roupa
// (topi/hijab/pés descalços) e a visita completa na simulação, inclusive quando o trabalho chama no meio.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../../shared/hash';
import type { AgentInfo, MachineRef, MachineStatus, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, Pose, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { MEN_ID, WOMEN_ID, sectionArea, sectionOf } from '../layout/mosque';
import { inRect } from '../layout/geometry';
import { hurrySequence, phaseAt, PRAYER_SHARE, prayerSequence, prays, sequenceMs, planPrayerVisit, WEAR_HEAD, WEAR_SHOES } from './prayer';
import { Sim } from './sim';
import { prayerHeadwear, putOn, takeOff, wornAppearance, type WearLook } from './wear';

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};

const look = (l: 'm' | 'f'): Appearance =>
  ({ look: l, skin: '#c68642', hair: '#2b1d14', hairStyle: 'short', accessory: 'glasses', accessoryColor: '#333333', shoes: '#222222' }) as unknown as Appearance;
const art = { appearanceFromSeed: (_s: number, o?: { look?: 'm' | 'f' }) => look(o?.look ?? 'm'), roomTheme: () => theme } as unknown as ArtModule;
const T0 = 1_700_000_000_000;
const LAPTOP: MachineRef = { id: 'local', name: 'Laptop' };
const SRV: MachineRef = { id: 'server1', name: 'server1' };
const MACHINES: MachineStatus[] = [
  { ...LAPTOP, online: true, since: T0, local: true },
  { ...SRV, online: true, since: T0 },
];

function agent(id: string, l: 'm' | 'f', status: AgentInfo['status'] = 'idle'): AgentInfo {
  return {
    id,
    kind: 'main',
    roomId: '/a',
    name: id,
    look: l,
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
    seed: id.length * 7919 + id.charCodeAt(0),
    machine: LAPTOP,
  };
}

const ROOM: RoomInfo = { id: '/a', name: 'Laptop · a', path: '/a', slot: 0, seed: 7, createdAt: T0, machine: LAPTOP, baseName: 'a' };

function snap(agents: AgentInfo[], rev = 1): OfficeSnapshot {
  return {
    rev,
    serverTime: T0,
    rooms: [ROOM],
    agents,
    accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: true, sources: [], startedAt: T0, version: 't', machines: MACHINES },
  };
}

function run(sim: Sim, clock: { now: number }, seconds: number, each?: () => boolean | void): void {
  const steps = Math.round(seconds * 30);
  for (let i = 0; i < steps; i++) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
    if (each?.()) return;
  }
}

const newSim = () => new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm', staff: false }), null);

describe('oração: sequência', () => {
  it('2 rak\'ahs: takbir, qiyam, ruku, 2 sujood por rak\'ah, tashahhud e salam no fim', () => {
    const seq = prayerSequence(mulberry32(3));
    expect(seq[0].pose).toBe('takbir');
    expect(seq.at(-1)!.pose).toBe('salam');
    expect(seq.at(-2)!.pose).toBe('jalsa');
    expect(seq.filter((p) => p.pose === 'ruku')).toHaveLength(2);
    expect(seq.filter((p) => p.pose === 'sujood')).toHaveLength(4);
    // cada ruku vem depois de um qiyam e é seguido do qawmah (em pé de novo) e do sujood
    seq.forEach((p, i) => {
      if (p.pose !== 'ruku') return;
      expect(seq[i - 1].pose).toBe('qiyam');
      expect(seq[i + 1].pose).toBe('qiyam');
      expect(seq[i + 2].pose).toBe('sujood');
    });
    const ms = sequenceMs(seq);
    expect(ms).toBeGreaterThan(30_000);
    expect(ms).toBeLessThan(60_000);
  });

  it('phaseAt percorre a sequência e termina em null', () => {
    const seq = [
      { pose: 'takbir', ms: 1000 },
      { pose: 'qiyam', ms: 2000 },
    ] as const;
    expect(phaseAt([...seq], 0)?.phase.pose).toBe('takbir');
    expect(phaseAt([...seq], 999)?.phase.pose).toBe('takbir');
    expect(phaseAt([...seq], 1000)?.phase.pose).toBe('qiyam');
    expect(phaseAt([...seq], 2500)?.left).toBe(500);
    expect(phaseAt([...seq], 3000)).toBeNull();
  });

  it('chamado no meio: termina depressa sem pular o essencial (sujood, tashahhud, salam)', () => {
    const seq = prayerSequence(mulberry32(5));
    const atQiyam = seq.findIndex((p, i) => i > 0 && p.pose === 'qiyam');
    const t = seq.slice(0, atQiyam).reduce((a, p) => a + p.ms, 0) + 100;
    const h = hurrySequence(seq, t);
    expect(h.map((p) => p.pose)).toEqual(['qiyam', 'sujood', 'jalsa', 'salam']);
    expect(h[0].ms).toBeLessThanOrEqual(600);
    expect(sequenceMs(h)).toBeLessThan(6_000);
    // já sentado: só o fim
    const atJalsa = seq.findIndex((p) => p.pose === 'jalsa');
    const tj = seq.slice(0, atJalsa).reduce((a, p) => a + p.ms, 0) + 10;
    expect(hurrySequence(seq, tj).map((p) => p.pose)).toEqual(['jalsa', 'salam']);
    // no salam: só termina o salam
    expect(hurrySequence(seq, sequenceMs(seq) - 100).map((p) => p.pose)).toEqual(['salam']);
    expect(hurrySequence(seq, sequenceMs(seq) + 1)).toEqual([]);
  });

  it('quem reza é fixo pela semente e é uma parte razoável do pessoal', () => {
    let n = 0;
    for (let s = 1; s <= 4000; s++) if (prays(s)) n++;
    expect(n / 4000).toBeGreaterThan(PRAYER_SHARE - 0.05);
    expect(n / 4000).toBeLessThan(PRAYER_SHARE + 0.05);
    expect(prays(1234)).toBe(prays(1234));
  });
});

describe('oração: seções e roupas', () => {
  it('seção pelo look: homens na ala masculina, mulheres na feminina', () => {
    expect(sectionOf('m')).toBe('m');
    expect(sectionOf('f')).toBe('f');
    expect(sectionOf(undefined)).toBe('m');
    expect(sectionArea('m')).toBe(MEN_ID);
    expect(sectionArea('f')).toBe(WOMEN_ID);
  });

  it('camadas de roupa só no desenho: tirar devolve exatamente a aparência de antes', () => {
    const base = look('f');
    const snapshot = JSON.stringify(base);
    const ch: { appearance: Appearance; wear: Map<string, WearLook> | null } = { appearance: base, wear: null };
    expect(wornAppearance(ch)).toBe(base);
    putOn(ch, WEAR_SHOES, { shoes: '#d0a080' });
    putOn(ch, WEAR_HEAD, prayerHeadwear('f', '#9fc0e4'));
    const worn = wornAppearance(ch);
    expect(worn).not.toBe(base);
    expect(worn.shoes).toBe('#d0a080');
    expect(worn.accessory).toBe('hijab');
    expect(worn.accessoryColor).toBe('#9fc0e4');
    // estável (as caches da arte usam a identidade/chave da aparência)
    expect(wornAppearance(ch)).toBe(worn);
    takeOff(ch, WEAR_HEAD);
    expect(wornAppearance(ch).accessory).toBe('glasses');
    takeOff(ch, WEAR_SHOES);
    expect(ch.wear).toBeNull();
    expect(wornAppearance(ch)).toBe(base);
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it('cobertura de oração: topi branco para homens, hijab para mulheres', () => {
    const m = prayerHeadwear('m', '#123456');
    expect(m.accessory).toBe('topi');
    expect(m.accessoryColor).toBe('#f4f2ee');
    const f = prayerHeadwear('f', '#9fc0e4');
    expect(f.accessory).toBe('hijab');
    expect(f.accessoryColor).toBe('#9fc0e4');
  });
});

describe('oração: mesquita no campus', () => {
  it('só no campus; alas separadas, cada uma com entrada, sapateiras, ablução e safs virados para oeste', () => {
    const single = newSim();
    single.applySnapshot({ ...snap([agent('ana', 'f')]), meta: { demo: true, sources: [], startedAt: T0, version: 't' } }, T0);
    expect(single.spots.ofKind('prayer')).toHaveLength(0);

    const sim = newSim();
    sim.applySnapshot(snap([agent('ana', 'f')]), T0);
    const site = sim.building.campus!.mosque;
    for (const [area, sec] of [
      [MEN_ID, 'm'],
      [WOMEN_ID, 'f'],
    ] as const) {
      const spots = [...sim.spots.all()].filter((s) => s.areaId === area);
      const prayer = spots.filter((s) => s.kind === 'prayer');
      expect(prayer.length).toBeGreaterThan(10);
      for (const s of prayer) {
        expect(s.dir).toBe('left');
        expect(inRect(site.rect, s.tx, s.ty)).toBe(true);
      }
      for (const kind of ['shoes', 'headwear', 'wudu'] as const) {
        const ks = spots.filter((s) => s.kind === kind);
        expect(ks.length, `${area} ${kind}`).toBeGreaterThan(0);
        for (const s of ks) expect(s.group).toContain(`:${sec}`);
      }
      // tudo alcançável a partir do saguão do prédio da máquina
      const lobby = sim.spots.ofKind('elevator')[0];
      const out: number[] = [];
      for (const s of spots) expect(sim.finder.find(lobby.tx, lobby.ty, s.tx, s.ty, out), `${s.id}`).toBe(true);
    }
    // não há passagem interna entre as alas: o caminho de uma para a outra sai do prédio
    const m = sim.spots.ofKind('prayer').find((s) => s.areaId === MEN_ID)!;
    const f = sim.spots.ofKind('prayer').find((s) => s.areaId === WOMEN_ID)!;
    const path: number[] = [];
    expect(sim.finder.find(m.tx, m.ty, f.tx, f.ty, path)).toBe(true);
    let outside = false;
    for (let i = 0; i < path.length; i += 2) if (!inRect(site.rect, path[i], path[i + 1])) outside = true;
    expect(outside).toBe(true);
  });

  it('visita completa: sapatos, ablução, hijab, as posturas virada para a qibla, devolve tudo e volta à mesa', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([agent('ana', 'f')]), clock.now);
    run(sim, clock, 0.5);
    const ana = sim.chars.get('ana')!;
    expect(ana.atSpot).toBe(ana.homeSpot);
    expect(planPrayerVisit(sim, ana, clock.now)).toBe(true);
    const seen = new Set<Pose>();
    let barefootPraying = false;
    let coveredPraying = false;
    let wuduSeated = false;
    let inWomenHall = true;
    const women = sim.building.areas.find((a) => a.id === WOMEN_ID)!.rect;
    run(sim, clock, 240, () => {
      if (ana.step?.t === 'pray') {
        seen.add(ana.pose);
        expect(ana.dir).toBe('left');
        const a = wornAppearance(ana);
        barefootPraying = a.shoes !== ana.appearance.shoes;
        coveredPraying = a.accessory === 'hijab';
        if (!inRect(women, ana.tx, ana.ty)) inWomenHall = false;
      }
      if (ana.pose === 'wudu') wuduSeated = ana.seated;
      return !ana.prayer && ana.atSpot === ana.homeSpot && seen.size > 0;
    });
    expect([...seen].sort()).toEqual(['jalsa', 'qiyam', 'ruku', 'salam', 'sujood', 'takbir']);
    expect(barefootPraying).toBe(true);
    expect(coveredPraying).toBe(true);
    expect(wuduSeated).toBe(true);
    expect(inWomenHall).toBe(true);
    expect(ana.prayer).toBeNull();
    expect(ana.wear).toBeNull();
    expect(wornAppearance(ana)).toBe(ana.appearance);
    expect(ana.atSpot).toBe(ana.homeSpot);
  });

  it('trabalho chega no meio da oração: termina depressa, devolve o topi, calça os sapatos e vai trabalhar', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([agent('bilal', 'm')]), clock.now);
    run(sim, clock, 0.5);
    const b = sim.chars.get('bilal')!;
    expect(planPrayerVisit(sim, b, clock.now)).toBe(true);
    run(sim, clock, 180, () => b.step?.t === 'pray' && b.pose === 'qiyam' && b.stepT > 3000);
    expect(b.step?.t).toBe('pray');
    expect(wornAppearance(b).accessory).not.toBe('glasses');
    sim.applySnapshot(snap([agent('bilal', 'm', 'working')], 2), clock.now);
    const t0 = clock.now;
    run(sim, clock, 10, () => b.step?.t !== 'pray');
    expect(clock.now - t0).toBeLessThan(6_500);
    // saindo: passa pela cesta de topis e pela sapateira antes da mesa
    run(sim, clock, 120, () => !b.prayer && b.atSpot === b.homeSpot);
    expect(b.prayer).toBeNull();
    expect(b.wear).toBeNull();
    expect(b.atSpot).toBe(b.homeSpot);
    run(sim, clock, 1);
    expect(b.pose).toBe('type');
  });

  it('sozinhos, no tempo livre: só quem reza (pela semente) vai, e alguns vão em poucos minutos', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const ids = Array.from({ length: 14 }, (_, i) => `p${i}${'x'.repeat(i)}`);
    sim.applySnapshot(snap(ids.map((id, i) => agent(id, i % 2 ? 'f' : 'm'))), clock.now);
    const went = new Set<string>();
    run(sim, clock, 12 * 60, () => {
      for (const c of sim.chars.values()) if (c.prayer) went.add(c.id);
    });
    const devout = ids.filter((id) => prays(sim.chars.get(id)!.info.seed));
    expect(devout.length).toBeGreaterThan(0);
    expect(went.size).toBeGreaterThan(0);
    for (const id of went) expect(devout).toContain(id);
  });
});

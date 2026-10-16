// Equipe do escritório (sim/staff.ts) e a limpeza (sim/cleaner.ts): quem é da equipe nunca vira agente (contas do menu,
// rodas, amizades, snapshot), a escala começa pelas áreas mais antigas, o brilho do piso some e sai da lista, os nomes
// não colidem com os dos agentes, o uniforme e o kit.
import { describe, expect, it } from 'vitest';
import { NAME_SETS, inNameSet } from '../../../../shared/names';
import type { AgentInfo, MachineRef, MachineStatus, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { appearanceFromSeed } from '../../art/character/appearance';
import { renderCleaningProp } from '../../art/furniture/cleaning';
import { DEFAULT_WORLD_OPTIONS, type WorldOptions } from '../api';
import { STAFF_REST } from '../layout/staff';
import { AREA_MS, cartAt, cleanerUniform, cleaningAreas, isWashroom, lastCleanedOf, nextArea, oldestArea, schedule, spreadPatches, UNIFORM, WASHROOM_MS, type CleanerState } from './cleaner';
import { deskOf, receptionUniform, RECEPTION_UNIFORM, type ReceptionState } from './receptionist';
import { STAFF_DESK, STAFF_DESK_SWAP } from '../layout/staff';
import { MAX_SHINE, SHINE_FADE_MS, ShineList, shineExpired, shineLevel, type ShinePatch } from './shine';
import { sendAll } from './send-all';
import { Sim } from './sim';
import { detectNameSet, isStaff, isStaffId, registerStaffRole, staffNames, type KitItem } from './staff';

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};
const art = {
  appearanceFromSeed: (s: number, o?: { look?: 'm' | 'f'; profile?: 'pk' }) => appearanceFromSeed(s, o),
  roomTheme: () => theme,
} as unknown as ArtModule;
const T0 = 1_700_000_000_000;
const LAPTOP: MachineRef = { id: 'local', name: 'Laptop' };
const machines = (n: number): MachineStatus[] =>
  Array.from({ length: n }, (_, i) => (i === 0 ? { ...LAPTOP, online: true, since: T0, local: true } : { id: `srv${i}`, name: `srv${i}`, online: true, since: T0 }));

function agent(id: string, opts: Partial<AgentInfo> & { campus?: boolean } = {}): AgentInfo {
  const { campus, ...extra } = opts;
  return {
    id,
    kind: 'main',
    roomId: '/a',
    name: id,
    look: 'm',
    role: 'Agente principal',
    sessionId: `s-${id}`,
    account: '.claude',
    status: 'idle',
    recent: [],
    tasks: [],
    startedAt: T0,
    lastEventAt: T0,
    statusSince: T0,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: id.length * 7919 + id.charCodeAt(0) * 31,
    ...(campus ? { machine: LAPTOP } : {}),
    ...extra,
  };
}

function snap(agents: AgentInfo[], nMachines = 0, rev = 1): OfficeSnapshot {
  const campus = nMachines >= 2;
  return {
    rev,
    serverTime: T0,
    rooms: ['/a', '/b'].map((id, slot) => ({ id, name: id, path: id, slot, seed: 7 + slot * 13, createdAt: T0, ...(campus ? { machine: LAPTOP, baseName: id } : {}) }) as RoomInfo),
    agents,
    accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: false, sources: [], startedAt: T0, version: 't', ...(campus ? { machines: machines(nMachines) } : {}) },
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

function office(agents: AgentInfo[], nMachines = 0, opts: Partial<WorldOptions> = {}) {
  const options = { ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' as const, ...opts };
  const sim = new Sim(art, () => options, null);
  const clock = { now: T0 };
  sim.applySnapshot(snap(agents, nMachines), clock.now);
  run(sim, clock, 0.5);
  return { sim, clock, options };
}

const staffOf = (sim: Sim) => [...sim.chars.values()].filter(isStaff);
const cleanersOf = (sim: Sim) => staffOf(sim).filter((c) => c.id.startsWith('staff:cleaner:'));
const clerksOf = (sim: Sim) => staffOf(sim).filter((c) => c.id.startsWith('staff:receptionist:'));
const cleanerState = (sim: Sim, id: string) => sim.staff.member(id)!.state as CleanerState;

describe('equipe: quem é e quantos', () => {
  it('ids próprios; 2 no prédio único, 3 no campus e 4 a partir de 4 prédios; desligável', () => {
    expect(isStaffId('staff:cleaner:0')).toBe(true);
    expect(isStaffId('.claude:123')).toBe(false);
    expect(isStaffId(null)).toBe(false);
    expect(cleanersOf(office([agent('ana')]).sim)).toHaveLength(2);
    expect(cleanersOf(office([agent('ana', { campus: true })], 2).sim)).toHaveLength(3);
    expect(cleanersOf(office([agent('ana', { campus: true })], 4).sim)).toHaveLength(4);
    // recepção: a recepcionista e a substituta, nos dois tipos de escritório
    expect(clerksOf(office([agent('ana')]).sim)).toHaveLength(2);
    expect(clerksOf(office([agent('ana', { campus: true })], 2).sim)).toHaveLength(2);
    expect(staffOf(office([agent('ana')], 0, { staff: false }).sim)).toHaveLength(0);
  });

  it('na carga inicial cada um está na sua banqueta do canto da limpeza; desligar tira todos', () => {
    const { sim, clock, options } = office([agent('ana')]);
    const rest = new Set(sim.spots.ofKind('staff').filter((s) => s.group === STAFF_REST).map((s) => s.id));
    const seats = cleanersOf(sim).map((c) => c.atSpot);
    expect(seats.every((id) => !!id && rest.has(id))).toBe(true);
    expect(new Set(seats).size).toBe(seats.length);
    options.staff = false;
    sim.staff.resync(clock.now);
    run(sim, clock, 0.2);
    expect(staffOf(sim)).toHaveLength(0);
    expect(sim.chars.has('ana')).toBe(true);
    expect(sim.spots.ofKind('staff').every((s) => !sim.spots.ownerOf(s.id))).toBe(true);
    // religada: voltam (pelo elevador)
    options.staff = true;
    sim.staff.resync(clock.now);
    expect(cleanersOf(sim)).toHaveLength(2);
    expect(clerksOf(sim)).toHaveLength(2);
    run(sim, clock, 60, () => staffOf(sim).every((c) => !c.inside && c.alpha >= 1));
    expect(staffOf(sim).every((c) => !c.inside)).toBe(true);
  });
});

describe('equipe: funções registradas', () => {
  it('uma função nova entra pelo registro, com nome fixo (ex.: o dono) e o próprio comportamento', () => {
    let thought = 0;
    const off = registerStaffRole<{ n: number }>({
      role: 'ceo',
      label: () => 'CEO',
      count: () => 1,
      identity: () => ({ name: 'Rafael', look: 'm', parts: { topStyle: 'shirt_tie' } }),
      dress: (a) => a,
      init: () => ({ n: 0 }),
      think: (m) => {
        thought++;
        m.state.n++;
        m.ch.queue.push({ t: 'act', pose: 'stand', ms: 1000 });
        return true;
      },
      settle: (m, crew) => crew.standNear(m.ch, 5, 5),
    });
    try {
      const { sim, clock } = office([agent('ana', { name: 'Rafael' })]);
      const ceo = sim.chars.get('staff:ceo:0')!;
      expect(ceo.info.name).toBe('Rafael');
      expect(ceo.appearance.topStyle).toBe('shirt_tie');
      expect(sim.staff.card('staff:ceo:0')?.role).toBe('CEO');
      // os sorteados não repetem o nome fixo
      for (const c of staffOf(sim)) if (c !== ceo) expect(c.info.name).not.toBe('Rafael');
      run(sim, clock, 3);
      expect(thought).toBeGreaterThan(1);
    } finally {
      off();
    }
    expect(staffOf(office([agent('ana')]).sim).some((c) => c.id.startsWith('staff:ceo'))).toBe(false);
  });
});

describe('equipe: nunca conta como agente', () => {
  it('fica fora do snapshot, das contas do menu Atividades, das rodas e das amizades', () => {
    const agents = [agent('ana', { campus: true }), agent('bia', { campus: true, look: 'f' }), agent('caio', { campus: true, status: 'working' })];
    const s = snap(agents, 2);
    const { sim, clock } = office(agents, 2);
    sim.applySnapshot(s, clock.now);
    // o snapshot (o que a interface conta) não muda
    expect(s.agents.map((a) => a.id)).toEqual(['ana', 'bia', 'caio']);
    expect(cleanersOf(sim).length).toBe(3);
    // menu: livres + ocupados = só os agentes
    const tv = sendAll(sim, 'tv', clock.now)!;
    expect(tv.sent.every((id) => !isStaffId(id))).toBe(true);
    expect(tv.sent.length + tv.busy + tv.full).toBe(3);
    // rodas e amizades
    for (const c of staffOf(sim)) expect(sim.social.canJoin(c, clock.now)).toBe(false);
    for (const b of sim.social.info('ana')?.bonds ?? []) expect(isStaffId(b.id)).toBe(false);
    // ninguém da equipe some por "não estar no snapshot"
    run(sim, clock, 10);
    expect(staffOf(sim).every((c) => c.missingSince === null && !c.leaving)).toBe(true);
  });

  it('chamado para a oração: a equipe vai junto, fora das contas do resultado', () => {
    const agents = [agent('ana', { campus: true }), agent('bia', { campus: true, look: 'f' })];
    const { sim, clock } = office(agents, 2);
    const res = sendAll(sim, 'prayer', clock.now)!;
    expect(res.sent.sort()).toEqual(['ana', 'bia']);
    expect(res.busy).toBe(0);
    const praying = cleanersOf(sim).filter((c) => !!c.prayer);
    expect(praying.length).toBe(3);
    // e depois voltam ao trabalho
    run(sim, clock, 240, () => cleanersOf(sim).every((c) => !c.prayer));
    expect(cleanersOf(sim).every((c) => !c.prayer)).toBe(true);
  });

  it('quem está no meio de um trecho de piso termina a limpeza em vez de ir rezar', () => {
    const { sim, clock } = office([agent('ana', { campus: true })], 2);
    const id = 'staff:cleaner:0';
    cleanerState(sim, id).nextRoundAt = clock.now;
    sim.clearPlan(sim.chars.get(id)!);
    const ch = sim.chars.get(id)!;
    run(sim, clock, 90, () => ch.step?.t === 'act' && (ch.step.pose === 'mop' || ch.step.pose === 'vacuum'));
    expect(ch.step?.t).toBe('act');
    sendAll(sim, 'prayer', clock.now);
    expect(ch.prayer).toBeNull();
    expect(ch.step?.t).toBe('act');
  });
});

describe('escala da limpeza', () => {
  it('a área de há mais tempo sem limpeza vem primeiro (pulando as reservadas)', () => {
    const areas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const last: Record<string, number> = { a: 300, b: 100, c: 200 };
    expect(oldestArea(areas, (id) => last[id], () => false)?.id).toBe('b');
    expect(oldestArea(areas, (id) => last[id], (x) => x.id === 'b')?.id).toBe('c');
    expect(oldestArea(areas, (id) => last[id], () => true)).toBeNull();
  });

  it('na simulação: a primeira ronda vai para a área mais antiga e a escala anda', () => {
    const { sim, clock } = office([agent('ana')]);
    const sched = schedule(sim.staff);
    const areas = cleaningAreas(sim.staff);
    expect(areas.length).toBeGreaterThan(4);
    // todas "limpas" agora, menos a copa (há uma hora) e o lounge (há meia hora)
    for (const a of areas) sched.last.set(a.id, clock.now);
    sched.last.set('core:copa', clock.now - 3_600_000);
    sched.last.set('core:lounge', clock.now - 1_800_000);
    const [first, second] = ['staff:cleaner:0', 'staff:cleaner:1'];
    cleanerState(sim, first).nextRoundAt = clock.now;
    cleanerState(sim, second).nextRoundAt = clock.now + 500;
    run(sim, clock, 2);
    expect(cleanerState(sim, first).area).toBe('core:copa');
    expect(cleanerState(sim, second).area).toBe('core:lounge');
    // termina e a copa sai do topo da fila
    run(sim, clock, 240, () => cleanerState(sim, first).area === null);
    expect(lastCleanedOf(sched.last, 'core:copa', clock.now)).toBeGreaterThan(T0);
    // limpou de verdade: brilho no piso da copa
    const copa = areas.find((a) => a.id === 'core:copa')!.layout.rect;
    expect(sim.staff.shine.items.some((p) => p.x >= copa.x * 16 && p.x < (copa.x + copa.w) * 16)).toBe(true);
  });

  it('trechos espalhados pela área, longe uns dos outros', () => {
    const tiles = [];
    for (let y = 0; y < 10; y++) for (let x = 0; x < 14; x++) tiles.push({ x, y });
    let s = 1;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const p = spreadPatches(tiles, 4, rng);
    expect(p).toHaveLength(4);
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) expect(Math.abs(p[i].x - p[j].x) + Math.abs(p[i].y - p[j].y)).toBeGreaterThanOrEqual(3);
    expect(spreadPatches([], 3, rng)).toEqual([]);
  });

  it('não limpa em cima de quem está parado nem nos lugares de uso, e leva o kit', () => {
    const { sim, clock } = office([agent('ana', { status: 'working' })]);
    const id = 'staff:cleaner:0';
    cleanerState(sim, id).forced = '/a';
    sim.clearPlan(sim.chars.get(id)!);
    const ch = sim.chars.get(id)!;
    const kit: KitItem[] = [];
    let sawSign = false;
    let sawBucket = false;
    run(sim, clock, 200, () => {
      sim.staff.kit(kit, clock.now);
      sawSign ||= kit.some((k) => k.kind === 'sign');
      sawBucket ||= kit.some((k) => k.kind === 'bucket');
      if (ch.step?.t === 'act' && ch.step.pose === 'mop') {
        for (const s of sim.spots.all()) if (s.tx === ch.tx && s.ty === ch.ty) throw new Error(`limpando no spot ${s.id}`);
        expect(ch.tx === sim.chars.get('ana')!.tx && ch.ty === sim.chars.get('ana')!.ty).toBe(false);
      }
      return cleanerState(sim, id).area === null && sawSign;
    });
    expect(sawSign).toBe(true);
    expect(sawBucket).toBe(true);
  });
});

describe('brilho do piso', () => {
  const patch = (at: number, x = 100, y = 100): ShinePatch => ({ x, y, rx: 22, ry: 11, at, grow: 8000, seed: 7, carpet: false });

  it('cresce durante a limpeza, fica no máximo ao terminar e some suave', () => {
    const p = patch(0);
    expect(shineLevel(p, -1)).toBe(0);
    expect(shineLevel(p, 4000)).toBeGreaterThan(shineLevel(p, 1000));
    expect(shineLevel(p, 8000)).toBeCloseTo(1, 5);
    let prev = 1;
    for (let t = 8000; t <= 8000 + SHINE_FADE_MS; t += 5000) {
      const l = shineLevel(p, t);
      expect(l).toBeLessThanOrEqual(prev);
      prev = l;
    }
    expect(shineLevel(p, 8000 + SHINE_FADE_MS * 0.5)).toBeGreaterThan(0.3);
    expect(shineLevel(p, 8000 + SHINE_FADE_MS)).toBe(0);
    expect(shineExpired(p, 8000 + SHINE_FADE_MS)).toBe(true);
    expect(SHINE_FADE_MS).toBeGreaterThanOrEqual(120_000);
    expect(SHINE_FADE_MS).toBeLessThanOrEqual(180_000);
  });

  it('sai da lista quando some, fica de fora fora da tela e tem limite', () => {
    const list = new ShineList();
    list.add(patch(0, 100, 100));
    list.add(patch(100_000, 2000, 100));
    const view = { x0: 0, y0: 0, x1: 400, y1: 300 };
    const out: ShinePatch[] = [];
    expect(list.visible(view, 20_000, out).map((p) => p.x)).toEqual([100]);
    list.prune(8000 + SHINE_FADE_MS + 1);
    expect(list.items.map((p) => p.x)).toEqual([2000]);
    expect(list.visible({ x0: 1900, y0: 0, x1: 2100, y1: 300 }, 8000 + SHINE_FADE_MS + 1, out)).toHaveLength(1);
    for (let i = 0; i < MAX_SHINE + 10; i++) list.add(patch(200_000 + i));
    expect(list.items.length).toBe(MAX_SHINE);
    expect(list.items[0].at).toBe(200_010);
  });
});

describe('nomes da equipe', () => {
  it('nunca repetem o nome de um agente nem entre si', () => {
    const ids = ['staff:cleaner:0', 'staff:cleaner:1', 'staff:cleaner:2', 'staff:cleaner:3'];
    const first = staffNames(ids, [], 'br');
    // agora todos os nomes que a equipe teria estão ocupados por agentes
    const taken = first.map((p) => p.name);
    const again = staffNames(ids, taken, 'br');
    const names = again.map((p) => p.name);
    expect(new Set(names).size).toBe(4);
    for (const n of names) expect(taken).not.toContain(n);
    // pool quase esgotado: sufixo numérico, ainda sem colisão
    const all = NAME_SETS.pk.map((p) => p.name);
    const tight = staffNames(ids, all.slice(1), 'pk');
    expect(new Set(tight.map((p) => p.name)).size).toBe(4);
    for (const p of tight) expect(all.slice(1)).not.toContain(p.name);
  });

  it('conjunto de nomes pelos agentes (pk) e troca de nome quando um agente chega com o mesmo', () => {
    expect(detectNameSet([{ name: 'Ana' }])).toBe('br');
    expect(detectNameSet([{ name: 'Ana', appearance: 'pk' }])).toBe('pk');
    expect(detectNameSet([{ name: 'Ayesha' }, { name: 'Bilal' }])).toBe('pk');
    const { sim, clock } = office([agent('ana', { name: 'Ayesha', appearance: 'pk' })]);
    const staff = staffOf(sim);
    for (const c of staff) expect(inNameSet(c.info.name, 'pk')).toBe(true);
    const clash = staff[0].info.name;
    sim.applySnapshot(snap([agent('ana', { name: 'Ayesha', appearance: 'pk' }), agent('bilal', { name: clash, appearance: 'pk' })], 0, 2), clock.now);
    const names = [...sim.chars.values()].map((c) => c.info.name);
    expect(new Set(names).size).toBe(names.length);
    expect(staffOf(sim)[0].info.name).not.toBe(clash);
  });
});

describe('uniforme e kit', () => {
  const base: Appearance = appearanceFromSeed(42, { look: 'f' });
  it('padrão: polo, calça marinho e boné; pk: shalwar kameez com dupatta / kurta-shalwar, na cor do uniforme', () => {
    const d = cleanerUniform({ ...base, hairStyle: 'afro' }, undefined);
    expect([d.topStyle, d.top, d.bottom, d.accessory, d.lanyard]).toEqual(['polo', UNIFORM.main, UNIFORM.navy, 'cap', null]);
    expect(d.hairStyle).not.toBe('afro');
    const f = cleanerUniform({ ...base, look: 'f', accessory: 'earrings' }, 'pk');
    expect([f.topStyle, f.bottomStyle, f.top, f.bottom, f.accessory]).toEqual(['shalwar_kameez', 'shalwar', UNIFORM.main, UNIFORM.main, 'dupatta']);
    const m = cleanerUniform({ ...appearanceFromSeed(7, { look: 'm' }), look: 'm' }, 'pk');
    expect([m.topStyle, m.bottomStyle, m.top, m.bottom]).toEqual(['kurta', 'shalwar', UNIFORM.main, UNIFORM.main]);
    // não mexe na aparência original
    expect(base.topStyle).not.toBe(undefined);
  });

  it('carrinho na frente de quem empurra, nas quatro direções; peças do kit desenham', () => {
    expect(cartAt(100, 100, 'down').y).toBeGreaterThan(100);
    expect(cartAt(100, 100, 'up').y).toBeLessThan(100);
    expect(cartAt(100, 100, 'left')).toMatchObject({ view: 'side', flip: false });
    expect(cartAt(100, 100, 'right')).toMatchObject({ view: 'side', flip: true });
    for (const kind of ['cart_down', 'cart_up', 'cart_side', 'cart_down_nobucket', 'cart_up_nobucket', 'cart_side_nobucket', 'bucket', 'sign'] as const) {
      const s = renderCleaningProp(kind);
      expect(s.buf.countOpaque(), kind).toBeGreaterThan(30);
      expect(s.ay).toBeLessThanOrEqual(s.buf.h);
    }
  });
});

describe('banheiros: mais vezes e com rotina própria', () => {
  it('um banheiro sem limpeza há mais de WASHROOM_MS passa na frente de qualquer sala, mesmo mais antiga', () => {
    const office = { id: 'sala', layout: { kind: 'room' } as never };
    const wc = { id: 'wc', layout: { kind: 'restroom' } as never };
    const wudu = { id: 'wudu', layout: { kind: 'mosque' } as never, look: 'm' as const };
    expect(isWashroom(wc)).toBe(true);
    expect(isWashroom(wudu)).toBe(true);
    expect(isWashroom(office)).toBe(false);
    const now = 10_000_000;
    const last: Record<string, number> = { sala: now - 60 * 60_000, wc: now - WASHROOM_MS - 1000, wudu: now - 60_000 };
    expect(nextArea([office, wc, wudu], now, (id) => last[id], () => false)?.id).toBe('wc');
    // limpo há pouco: a sala mais antiga vem primeiro
    last.wc = now - WASHROOM_MS / 3;
    expect(nextArea([office, wc, wudu], now, (id) => last[id], () => false)?.id).toBe('sala');
    // dois banheiros vencidos: o mais antigo
    last.wc = now - WASHROOM_MS * 2;
    last.wudu = now - WASHROOM_MS * 3;
    expect(nextArea([office, wc, wudu], now, (id) => last[id], () => false)?.id).toBe('wudu');
    // tudo limpo há pouco: ninguém (descanso); a sala só volta depois de AREA_MS, bem mais que o banheiro
    Object.assign(last, { sala: now - AREA_MS / 2, wc: now - WASHROOM_MS / 2, wudu: now - WASHROOM_MS / 2 });
    expect(nextArea([office, wc, wudu], now, (id) => last[id], () => false)).toBeNull();
    expect(WASHROOM_MS).toBeLessThanOrEqual(AREA_MS / 2);
  });

  it('numa simulação de 30 min o banheiro é limpo mais vezes que qualquer outra área', () => {
    const { sim, clock } = office([agent('ana')]);
    const sched = schedule(sim.staff);
    const counts = new Map<string, number>();
    const seen = new Map<string, number>();
    for (let i = 0; i < 30 * 60 * 10; i++) {
      clock.now += 100;
      sim.update(0.1, clock.now);
      if (i % 10) continue;
      for (const [id, at] of sched.last) {
        if (seen.get(id) !== at) {
          if (seen.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
          seen.set(id, at);
        }
      }
    }
    const wc = counts.get('core:banheiros') ?? 0;
    expect(wc).toBeGreaterThanOrEqual(3);
    for (const [id, n] of counts) if (id !== 'core:banheiros') expect(n, id).toBeLessThan(wc);
  });

  it('cabines, pias e espelhos com brilho, reposição e placa na porta; nunca entra numa cabine ocupada', () => {
    const { sim, clock } = office([agent('ana')]);
    const id = 'staff:cleaner:0';
    const ch = sim.chars.get(id)!;
    const stalls = sim.spots.ofKind('stall').filter((sp) => sp.areaId === 'core:banheiros');
    expect(stalls.length).toBeGreaterThan(1);
    // alguém na primeira cabine (a porta fecha) durante toda a limpeza
    const busy = stalls[0];
    sim.spots.reserve(busy.id, 'ana');
    sim.stallBusy.add(busy.furnitureId!);
    cleanerState(sim, id).forced = 'core:banheiros';
    sim.clearPlan(ch);
    const scrubbed = new Set<string>();
    const poses = new Set<string>();
    let signNearDoor = false;
    const door = sim.building.core.find((a) => a.id === 'core:banheiros')!.door!;
    const kit: KitItem[] = [];
    run(sim, clock, 300, () => {
      poses.add(ch.pose);
      if (ch.pose === 'scrub') {
        const near = stalls.find((sp) => sp.tx === ch.tx && sp.ty === ch.ty);
        if (near) scrubbed.add(near.id);
      }
      sim.staff.kit(kit, clock.now);
      const sign = kit.find((k) => k.kind === 'sign');
      if (sign && Math.abs(sign.x / 16 - (door.x + door.w / 2)) < 3 && Math.abs(sign.y / 16 - (door.y + door.h)) < 3) signNearDoor = true;
      return cleanerState(sim, id).area === null && poses.has('mop');
    });
    expect(scrubbed.has(busy.id)).toBe(false);
    expect(scrubbed.size).toBe(stalls.length - 1);
    expect(poses.has('wipe')).toBe(true);
    expect(poses.has('use')).toBe(true); // reposição no carrinho
    expect(signNearDoor).toBe(true);
    const gleams = sim.staff.shine.items.filter((p) => p.gleam);
    const mirrors = sim.building.core.find((a) => a.id === 'core:banheiros')!.wallItems.filter((w) => w.kind === 'mirror').length;
    // um no vaso de cada cabine limpa, um em cada pia e um em cada espelho
    expect(gleams.length).toBeGreaterThanOrEqual(stalls.length - 1 + mirrors);
    expect(sim.staff.shine.items.some((p) => !p.gleam)).toBe(true);
    // e a cabine ocupada continua de quem está nela
    expect(sim.spots.ownerOf(busy.id)).toBe('ana');
  });

  it('não para numa pia em uso: deixa para depois', () => {
    const { sim, clock } = office([agent('ana')]);
    const id = 'staff:cleaner:0';
    const ch = sim.chars.get(id)!;
    const sinks = sim.spots.ofKind('sink').filter((sp) => sp.areaId === 'core:banheiros');
    sim.spots.reserve(sinks[0].id, 'ana');
    cleanerState(sim, id).forced = 'core:banheiros';
    sim.clearPlan(ch);
    let wipedBusy = false;
    run(sim, clock, 300, () => {
      if (ch.pose === 'wipe' && ch.tx === sinks[0].tx && ch.ty === sinks[0].ty) wipedBusy = true;
      return cleanerState(sim, id).area === null && sim.staff.shine.items.some((p) => !p.gleam);
    });
    expect(wipedBusy).toBe(false);
  });
});

describe('recepção', () => {
  const chairOf = (sim: Sim) => sim.spots.ofKind('staff').find((sp) => sp.group === STAFF_DESK)!;
  /** Alguém da recepção sentado na cadeira do balcão ou ao lado dela (na troca). */
  const staffed = (sim: Sim) => {
    const chair = chairOf(sim);
    return clerksOf(sim).some((c) => c.atSpot === chair.id || Math.max(Math.abs(c.tx - chair.tx), Math.abs(c.ty - chair.ty)) <= 1);
  };

  it('na carga inicial a recepcionista está sentada no balcão e a substituta no arquivo; uniforme arrumado', () => {
    for (const machines of [0, 2]) {
      const { sim } = office([agent('ana', { campus: machines > 0 })], machines);
      const [a, b] = ['staff:receptionist:0', 'staff:receptionist:1'].map((id) => sim.chars.get(id)!);
      expect(a.atSpot).toBe(chairOf(sim).id);
      expect(a.seated).toBe(true);
      expect(b.atSpot).not.toBe(chairOf(sim).id);
      expect(deskOf(sim.staff).holder).toBe(a.id);
      expect(sim.staff.card(a.id)?.role).toBe('Recepcionista');
    }
    const m = receptionUniform(appearanceFromSeed(3, { look: 'm' }), undefined);
    expect([m.topStyle, m.top, m.topAccent]).toEqual(['shirt_tie', RECEPTION_UNIFORM.white, RECEPTION_UNIFORM.navy]);
    const f = receptionUniform({ ...appearanceFromSeed(4, { look: 'f' }), look: 'f' }, 'pk');
    expect([f.topStyle, f.bottomStyle, f.accessory === 'dupatta' || f.accessory === 'hijab']).toEqual(['shalwar_kameez', 'shalwar', true]);
    const k = receptionUniform({ ...appearanceFromSeed(5, { look: 'm' }), look: 'm' }, 'pk');
    expect(k.topStyle).toBe('kurta_waistcoat');
  });

  it('o balcão nunca fica vazio numa pausa: a substituta chega primeiro, a recepcionista sai e depois volta', () => {
    const { sim, clock } = office([agent('ana')]);
    const a = sim.chars.get('staff:receptionist:0')!;
    const b = sim.chars.get('staff:receptionist:1')!;
    const sa = sim.staff.member(a.id)!.state as ReceptionState;
    const chair = chairOf(sim);
    const swap = sim.spots.ofKind('staff').find((sp) => sp.group === STAFF_DESK_SWAP)!;
    sa.shiftEnd = clock.now;
    let reliefSat = false;
    let primaryAway = false;
    let backAgain = false;
    let leftBeforeRelief = false;
    for (let i = 0; i < 300 * 30 && !backAgain; i++) {
      clock.now += 1000 / 30;
      sim.update(1 / 30, clock.now);
      expect(staffed(sim), `balcão vazio em ${i}`).toBe(true);
      // quando a recepcionista levanta, a substituta já está ao lado da cadeira
      if (a.step?.t === 'exit' && a.atSpot === chair.id && !(b.tx === swap.tx && b.ty === swap.ty)) leftBeforeRelief = true;
      if (b.atSpot === chair.id) reliefSat = true;
      if (Math.abs(a.tx - chair.tx) + Math.abs(a.ty - chair.ty) > 4) primaryAway = true;
      if (primaryAway && reliefSat && a.atSpot === chair.id) backAgain = true;
    }
    expect(leftBeforeRelief).toBe(false);
    expect(reliefSat).toBe(true);
    expect(primaryAway).toBe(true);
    expect(backAgain).toBe(true);
    expect(deskOf(sim.staff).holder).toBe(a.id);
    // a substituta volta para a papelada
    run(sim, clock, 10);
    expect(b.atSpot).not.toBe(chair.id);
  });

  it('chamado para a oração: a substituta cobre o balcão e a recepcionista vai depois da troca', () => {
    const { sim, clock } = office([agent('ana', { campus: true })], 2);
    const a = sim.chars.get('staff:receptionist:0')!;
    const b = sim.chars.get('staff:receptionist:1')!;
    sendAll(sim, 'prayer', clock.now);
    expect(b.prayer).toBeNull();
    let prayed = false;
    for (let i = 0; i < 120 * 30 && !prayed; i++) {
      clock.now += 1000 / 30;
      sim.update(1 / 30, clock.now);
      expect(staffed(sim)).toBe(true);
      if (a.prayer) prayed = true;
    }
    expect(prayed).toBe(true);
    run(sim, clock, 5);
    expect(staffed(sim)).toBe(true);
    expect(b.atSpot).toBe(chairOf(sim).id);
    expect(b.prayer).toBeNull();
  });

  it('cumprimenta quem chega pelo elevador (aceno), sem contar como agente', () => {
    const { sim, clock } = office([agent('ana')]);
    const a = sim.chars.get('staff:receptionist:0')!;
    sim.applySnapshot(snap([agent('ana'), agent('bia', { look: 'f' })], 0, 2), clock.now);
    let waved = false;
    run(sim, clock, 20, () => (waved ||= a.pose === 'raise_hand' && a.chatEmoji === '👋'));
    expect(waved).toBe(true);
    const tv = sendAll(sim, 'tv', clock.now)!;
    expect(tv.sent.length + tv.busy + tv.full).toBe(2);
  });
});

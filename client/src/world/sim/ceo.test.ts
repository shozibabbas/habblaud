// O dono e a secretária (sim/ceo.ts, sim/secretary.ts): nascem de meta.owner (nome, look e peças da configuração), a
// mesa de pé sobe e desce, a reunião só chama agentes livres, o dono vai junto em todas as atividades do menu, a
// antessala nunca fica sem ninguém com ele na sala, e nenhum dos dois conta como agente.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, MachineRef, MachineStatus, OfficeSnapshot, OwnerInfo, RoomInfo } from '../../../../shared/types';
import type { ArtModule, RoomTheme } from '../../art/api';
import { appearanceFromSeed } from '../../art/character/appearance';
import { DEFAULT_WORLD_OPTIONS, type WorldOptions } from '../api';
import { bossAway, ceoChoices, CEO_NIGHT_WEIGHTS, forceCeo, inRect, isNight, LEAN_PX, pickWeighted, suiteOf, suiteRects, TUCK_PX, WEAR_HEADSET, type CeoState } from './ceo';
import type { SecretaryState } from './secretary';
import { WEAR_HEAD } from './prayer';
import { sendAll } from './send-all';
import { Sim } from './sim';
import { isStaff } from './staff';

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};
const art = {
  appearanceFromSeed: (s: number, o?: Parameters<typeof appearanceFromSeed>[1]) => appearanceFromSeed(s, o),
  roomTheme: () => theme,
} as unknown as ArtModule;
const T0 = 1_700_000_000_000;
const LAPTOP: MachineRef = { id: 'local', name: 'Laptop' };
const machines = (n: number): MachineStatus[] =>
  Array.from({ length: n }, (_, i) => (i === 0 ? { ...LAPTOP, online: true, since: T0, local: true } : { id: `srv${i}`, name: `srv${i}`, online: true, since: T0 }));

const PARTS = {
  topStyle: 'suit',
  top: '#3d4352',
  topAccent: '#c0392b',
  bottom: '#3d4352',
  bottomStyle: 'pants',
  skin: '#d69f78',
  hair: '#2b2530',
  hairStyle: 'side_part',
  facialHair: 'short_beard',
  accessory: 'glasses',
  accessoryColor: '#2b2b33',
} as const;
const OWNER: OwnerInfo = { name: 'Shozib', title: 'CEO', look: 'm', parts: { ...PARTS }, secretary: { name: 'Hira', look: 'f', parts: { accessory: 'hijab', accessoryColor: '#7b2d44' } } };

function agent(id: string, extra: Partial<AgentInfo> = {}): AgentInfo {
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
    machine: LAPTOP,
    ...extra,
  };
}

function snap(agents: AgentInfo[], owner: OwnerInfo | null = OWNER, nMachines = 2): OfficeSnapshot {
  const campus = nMachines >= 2;
  return {
    rev: 1,
    serverTime: T0,
    rooms: ['/a', '/b'].map((id, slot) => ({ id, name: id, path: id, slot, seed: 7 + slot * 13, createdAt: T0, ...(campus ? { machine: LAPTOP, baseName: id } : {}) }) as RoomInfo),
    agents: campus ? agents : agents.map(({ machine: _m, ...a }) => a),
    accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: false, sources: [], startedAt: T0, version: 't', ...(campus ? { machines: machines(nMachines) } : {}), ...(owner ? { owner } : {}) },
  };
}

function run(sim: Sim, clock: { now: number }, seconds: number, until?: () => boolean, fps = 20): boolean {
  const steps = Math.round(seconds * fps);
  for (let i = 0; i < steps; i++) {
    clock.now += 1000 / fps;
    sim.update(1 / fps, clock.now);
    if (until?.()) return true;
  }
  return false;
}

function office(agents: AgentInfo[], owner: OwnerInfo | null = OWNER, nMachines = 2, opts: Partial<WorldOptions> = {}) {
  const options = { ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' as const, ...opts };
  const sim = new Sim(art, () => options, null);
  const clock = { now: T0 };
  sim.applySnapshot(snap(agents, owner, nMachines), clock.now);
  run(sim, clock, 0.5);
  return { sim, clock };
}

const CEO_ID = 'staff:ceo:0';
const SEC_ID = 'staff:secretary:0';
const ceoOf = (sim: Sim) => sim.chars.get(CEO_ID)!;
const ceoState = (sim: Sim) => sim.staff.member(CEO_ID)!.state as CeoState;
const secOf = (sim: Sim) => sim.chars.get(SEC_ID)!;
const spot = (sim: Sim, kind: Parameters<Sim['spots']['ofKind']>[0]) => sim.spots.ofKind(kind)[0];

describe('o dono e a secretária: quem são', () => {
  it('nascem de meta.owner com o nome, o look e as peças configurados; o card mostra o cargo e o que faz', () => {
    const { sim } = office([agent('ana')]);
    const ceo = ceoOf(sim);
    const sec = secOf(sim);
    expect(ceo.info.name).toBe('Shozib');
    expect(ceo.info.look).toBe('m');
    expect(ceo.info.parts).toEqual(PARTS);
    expect(ceo.appearance.topStyle).toBe('suit');
    expect(ceo.appearance.topAccent).toBe('#c0392b');
    expect(ceo.appearance.facialHair).toBe('short_beard');
    expect(ceo.appearance.accessory).toBe('glasses');
    expect(sec.info.name).toBe('Hira');
    expect(sec.info.look).toBe('f');
    expect(sec.appearance.accessory).toBe('hijab');
    const card = sim.staff.card(CEO_ID)!;
    expect(card.name).toBe('Shozib');
    expect(card.role).toBe('CEO');
    expect(card.doing).toBeTruthy();
    expect(sim.staff.card(SEC_ID)?.role).toBe('Secretária');
    // na carga inicial: ele à mesa, ela na cadeira da antessala
    expect(ceo.atSpot).toBe(spot(sim, 'ceo_desk').id);
    expect(sec.atSpot).toBe(spot(sim, 'secretary').id);
  });

  it('o cargo vem da configuração; sem roupa escolhida, terno; sem dono ou fora do campus, ninguém', () => {
    const { sim } = office([agent('ana')], { name: 'Ana', title: 'Diretora', look: 'f' });
    expect(sim.staff.card(CEO_ID)?.role).toBe('Diretora');
    expect(ceoOf(sim).appearance.topStyle).toBe('suit');
    // sem secretária configurada: só o dono
    expect(sim.chars.has(SEC_ID)).toBe(false);
    expect(office([agent('ana')], null).sim.chars.has(CEO_ID)).toBe(false);
    expect(office([agent('ana')], OWNER, 0).sim.chars.has(CEO_ID)).toBe(false);
  });

  it('nunca conta como agente: fora do snapshot, das rodas e das contas do menu', () => {
    const agents = [agent('ana'), agent('bia', { look: 'f' }), agent('caio', { status: 'working' })];
    const s = snap(agents);
    const { sim, clock } = office(agents);
    sim.applySnapshot(s, clock.now);
    expect(s.agents.map((a) => a.id)).toEqual(['ana', 'bia', 'caio']);
    for (const id of [CEO_ID, SEC_ID]) {
      expect(isStaff(sim.chars.get(id)!)).toBe(true);
      expect(sim.social.canJoin(sim.chars.get(id)!, clock.now)).toBe(false);
    }
    const r = sendAll(sim, 'walk', clock.now);
    expect(r.sent.some((id) => id.startsWith('staff:'))).toBe(false);
    expect(r.sent.length + r.skipped).toBe(3);
    expect(r.crew).toEqual(expect.arrayContaining([CEO_ID, SEC_ID]));
  });
});

describe('o dono: a rotina', () => {
  it('a mesa de pé sobe (em pé, type_stand) e desce (sentado), com o motor', () => {
    const { sim, clock } = office([agent('ana')]);
    const ceo = ceoOf(sim);
    const desk = spot(sim, 'ceo_desk').deskId!;
    expect(sim.furnStates.get(desk) ?? 0).toBe(0);
    forceCeo(sim.staff, 'stand');
    expect(run(sim, clock, 30, () => ceo.atSpot === spot(sim, 'ceo_stand').id && ceo.pose === 'type_stand')).toBe(true);
    expect(sim.furnStates.get(desk)).toBe(1);
    expect(ceo.seated).toBe(false);
    expect(sim.staff.cues.some((c) => c.kind === 'deskHum')).toBe(true);
    expect(sim.staff.card(CEO_ID)?.doing).toBe('Trabalhando em pé');
    forceCeo(sim.staff, 'desk');
    expect(run(sim, clock, 30, () => ceo.atSpot === spot(sim, 'ceo_desk').id && ceo.seated)).toBe(true);
    expect(sim.furnStates.get(desk)).toBe(0);
    expect(sim.staff.cues.filter((c) => c.kind === 'deskHum').length).toBe(2);
  });

  it('videochamada com o headset (camada temporária) e a chamada na tela; tirado no fim', () => {
    const { sim, clock } = office([agent('ana')]);
    const ceo = ceoOf(sim);
    forceCeo(sim.staff, 'video');
    expect(run(sim, clock, 20, () => ceoState(sim).call === 'video')).toBe(true);
    expect(ceo.wear?.get(WEAR_HEADSET)?.accessory).toBe('headset');
    expect(ceo.appearance.accessory).toBe('glasses');
    expect(sim.staff.screen(CEO_ID)).toBe('chat');
    expect(sim.staff.cues.some((c) => c.kind === 'ring')).toBe(true);
    expect(run(sim, clock, 120, () => ceoState(sim).call === null)).toBe(true);
    expect(ceo.wear?.has(WEAR_HEADSET) ?? false).toBe(false);
  });

  it('ao telefone andando diante da janela (phone_walk)', () => {
    const { sim, clock } = office([agent('ana')]);
    const ceo = ceoOf(sim);
    forceCeo(sim.staff, 'pace');
    expect(run(sim, clock, 30, () => ceo.pose === 'phone_walk')).toBe(true);
    expect(ceoState(sim).call).toBe('phone');
    expect(sim.staff.card(CEO_ID)?.doing).toBe('Numa ligação');
  });

  it('a reunião só chama agentes livres; a secretária os anuncia na porta e eles sentam à mesa oval', () => {
    const agents = [agent('ana'), agent('bia', { look: 'f' }), agent('caio', { status: 'working' }), agent('davi', { status: 'waiting' }), agent('eva', { look: 'f', status: 'shell' })];
    const { sim, clock } = office(agents);
    const free = new Set(['ana', 'bia']);
    forceCeo(sim.staff, 'meeting');
    run(sim, clock, 1);
    const meet = suiteOf(sim.staff).meeting!;
    expect(meet).toBeTruthy();
    expect(meet.guests.length).toBeGreaterThan(0);
    for (const id of meet.guests) expect(free.has(id)).toBe(true);
    const guests = [...meet.guests];
    const sec = secOf(sim);
    let escorted = false;
    const door = spot(sim, 'ceo_door');
    const ok = run(sim, clock, 240, () => {
      if (sec.tx === door.tx && sec.ty === door.ty) escorted = true;
      return meet.phase === 'talk';
    });
    expect(ok).toBe(true);
    expect(escorted).toBe(true);
    const chairs = new Set(sim.spots.ofKind('ceo_meeting').map((s) => s.id));
    for (const id of guests) expect(chairs.has(sim.chars.get(id)!.atSpot ?? '')).toBe(true);
    expect(chairs.has(ceoOf(sim).atSpot ?? '')).toBe(true);
    // falas na mesa, e no fim todos voltam para a mesa deles
    expect(run(sim, clock, 30, () => guests.some((id) => !!sim.chars.get(id)!.sayText))).toBe(true);
    expect(run(sim, clock, 400, () => meet.phase === 'done')).toBe(true);
    expect(run(sim, clock, 120, () => guests.every((id) => sim.chars.get(id)!.atSpot === sim.chars.get(id)!.homeSpot))).toBe(true);
    expect(suiteOf(sim.staff).meeting).toBeNull();
  });

  it('sem ninguém livre, não há reunião', () => {
    const { sim, clock } = office([agent('caio', { status: 'working' }), agent('davi', { status: 'waiting' })]);
    forceCeo(sim.staff, 'meeting');
    run(sim, clock, 2);
    expect(suiteOf(sim.staff).meeting).toBeNull();
    expect(ceoChoices(sim.staff, sim.staff.member(CEO_ID) as never, clock.now).meeting).toBeUndefined();
  });

  it('na ronda para na mesa de um agente para conversar (quem trabalha segue digitando)', () => {
    const { sim, clock } = office([agent('caio', { status: 'working' })]);
    const caio = sim.chars.get('caio')!;
    run(sim, clock, 5);
    forceCeo(sim.staff, 'rounds');
    expect(run(sim, clock, 180, () => ceoState(sim).visiting === 'caio')).toBe(true);
    const ceo = ceoOf(sim);
    expect(Math.max(Math.abs(ceo.tx - caio.tx), Math.abs(ceo.ty - caio.ty))).toBeLessThanOrEqual(3);
    expect(sim.staff.card(CEO_ID)?.doing).toContain('caio');
    expect(run(sim, clock, 6, () => !!caio.sayText)).toBe(true);
    expect(caio.atSpot).toBe(caio.homeSpot);
    expect(caio.pose).toBe('type');
  });

  it('à noite fica até tarde na mesa: sem ronda, jogo ou reunião por conta própria', () => {
    expect(isNight(22)).toBe(true);
    expect(isNight(13)).toBe(false);
    expect(CEO_NIGHT_WEIGHTS.rounds + CEO_NIGHT_WEIGHTS.game + CEO_NIGHT_WEIGHTS.meeting).toBe(0);
    const { sim, clock } = office([agent('ana'), agent('bia')]);
    sim.hour = 22;
    const c = ceoChoices(sim.staff, sim.staff.member(CEO_ID) as never, clock.now);
    expect(c.rounds).toBeUndefined();
    expect(c.game).toBeUndefined();
    expect(c.meeting).toBeUndefined();
    expect(c.desk).toBeGreaterThan(0);
    const rng = (() => {
      let i = 0;
      return () => ((i = (i * 9301 + 49297) % 233280) / 233280);
    })();
    for (let i = 0; i < 50; i++) expect(['desk', 'stand', 'phone', 'pace', 'video', 'chai', 'pray', 'tv', 'kitchen']).toContain(pickWeighted(rng, c));
  });
});

describe('o dono junto da mesa', () => {
  /** Sentado: puxa a cadeira; para sair, empurra a cadeira de volta e só então levanta. */
  function tuckedAtDesk() {
    const ctx = office([agent('ana'), agent('bia', { look: 'f' })]);
    const { sim, clock } = ctx;
    const ceo = ceoOf(sim);
    const desk = spot(sim, 'ceo_desk');
    forceCeo(sim.staff, 'desk');
    expect(run(sim, clock, 30, () => ceo.atSpot === desk.id && ceo.pose === 'type')).toBe(true);
    run(sim, clock, 1);
    return { ...ctx, ceo, desk };
  }

  it('sentado, puxa a cadeira até a mesa: ele e a cadeira andam juntos, na frente da mesa', () => {
    const { sim, ceo, desk } = tuckedAtDesk();
    expect(ceoState(sim).tuck.v).toBe(1);
    expect(ceo.y).toBeCloseTo(desk.y - TUCK_PX, 5);
    expect(ceo.x).toBeCloseTo(desk.x, 5);
    expect(ceo.depth()).toBe(desk.sortY);
    expect(sim.furnShift.get(desk.furnitureId!)).toEqual({ dx: 0, dy: -TUCK_PX });
  });

  for (const how of ['plano dele', 'menu Atividades'] as const) {
    it(`para levantar, empurra a cadeira antes (${how})`, () => {
      const { sim, clock, ceo, desk } = tuckedAtDesk();
      if (how === 'plano dele') forceCeo(sim.staff, 'pace');
      else sendAll(sim, 'walk', clock.now);
      let untuckedFirst = true;
      let sawPushBack = false;
      const ok = run(sim, clock, 10, () => {
        const v = ceoState(sim).tuck.v;
        if (ceo.atSpot === desk.id && ceo.seated && v > 0 && v < 1) sawPushBack = true;
        // a saída do lugar (de pé, a caminho) só depois da cadeira de volta
        if (ceo.atSpot === desk.id && ceo.step?.t === 'exit' && (v > 0 || sim.furnShift.has(desk.furnitureId!))) untuckedFirst = false;
        return ceo.atSpot !== desk.id;
      });
      expect(ok).toBe(true);
      expect(sawPushBack).toBe(true);
      expect(untuckedFirst).toBe(true);
      expect(sim.furnShift.has(desk.furnitureId!)).toBe(false);
    });
  }

  it('em pé à mesa erguida, encostado no tampo e desenhado na frente dela; a cadeira não anda', () => {
    const { sim, clock } = office([agent('ana')]);
    const ceo = ceoOf(sim);
    const desk = spot(sim, 'ceo_desk');
    const stand = spot(sim, 'ceo_stand');
    forceCeo(sim.staff, 'stand');
    expect(run(sim, clock, 30, () => ceo.atSpot === stand.id && ceo.pose === 'type_stand')).toBe(true);
    run(sim, clock, 1);
    expect(ceo.y).toBeCloseTo(stand.y - LEAN_PX, 5);
    expect(ceo.depth()).toBe(desk.sortY);
    expect(sim.furnShift.has(desk.furnitureId!)).toBe(false);
    // e volta a sentar: a mesa desce, ele senta e puxa a cadeira
    forceCeo(sim.staff, 'desk');
    expect(run(sim, clock, 30, () => ceo.atSpot === desk.id && ceoState(sim).tuck.v === 1)).toBe(true);
    expect(sim.furnStates.get(desk.deskId!)).toBe(0);
  });
});

describe('o dono vai junto nas atividades do menu', () => {
  it('pingue-pongue: puxa a partida (fora das contas); sem aposta com ele', () => {
    const { sim, clock } = office([agent('ana'), agent('bia', { look: 'f' })]);
    const r = sendAll(sim, 'pingpong', clock.now);
    expect(r.crew).toContain(CEO_ID);
    expect(r.sent).not.toContain(CEO_ID);
    const g = ceoOf(sim).gathering;
    expect(g?.kind).toBe('pingpong');
    expect(g?.bet).toBe(0);
  });

  it('chamado para a oração: ele na ala masculina (topi), ela na feminina (hijab)', () => {
    const { sim, clock } = office([agent('ana')]);
    const r = sendAll(sim, 'prayer', clock.now);
    expect(r.crew).toEqual(expect.arrayContaining([CEO_ID, SEC_ID]));
    expect(ceoOf(sim).prayer?.section).toBe('m');
    expect(secOf(sim).prayer?.section).toBe('f');
    expect(run(sim, clock, 120, () => ceoOf(sim).wear?.get(WEAR_HEAD)?.accessory === 'topi')).toBe(true);
  });

  it('chai, TV, passeio e de volta às mesas; cigarro só com `smokes`', () => {
    for (const act of ['chai', 'tv', 'walk'] as const) {
      const { sim, clock } = office([agent('ana'), agent('bia', { look: 'f' }), agent('caio')]);
      const r = sendAll(sim, act, clock.now);
      expect(r.crew).toContain(CEO_ID);
      if (act !== 'walk') expect(ceoOf(sim).gathering?.kind).toBe(act === 'chai' ? 'kitchen' : 'tv');
    }
    {
      const { sim, clock } = office([agent('ana')]);
      expect(sendAll(sim, 'smoke', clock.now).crew).not.toContain(CEO_ID);
    }
    {
      const { sim, clock } = office([agent('ana')], { ...OWNER, smokes: true });
      expect(sendAll(sim, 'smoke', clock.now).crew).toContain(CEO_ID);
    }
    const { sim, clock } = office([agent('ana')]);
    sendAll(sim, 'walk', clock.now);
    run(sim, clock, 5);
    const r = sendAll(sim, 'desk', clock.now);
    expect(r.crew).toContain(CEO_ID);
    expect(run(sim, clock, 90, () => ceoOf(sim).atSpot === spot(sim, 'ceo_desk').id)).toBe(true);
    expect(ceoState(sim).holdUntil).toBeGreaterThan(clock.now);
  });
});

describe('a secretária', () => {
  it('só sai para a pausa com o dono fora da diretoria (a antessala nunca fica vazia com ele na sala)', () => {
    const { sim, clock } = office([agent('ana'), agent('caio', { status: 'working' })]);
    const sec = secOf(sim);
    const st = sim.staff.member(SEC_ID)!.state as SecretaryState;
    const suite = suiteRects(sim)!.rect;
    // pausa vencida, mas o dono está na sala: fica
    st.nextBreakAt = clock.now;
    let wasIn = true;
    let leftWhileBossIn = 0;
    let breaks = 0;
    const watch = () => {
      const nowIn = inRect(suite, sec.tx, sec.ty);
      if (wasIn && !nowIn) {
        breaks++;
        if (!bossAway(sim.staff)) leftWhileBossIn++;
      }
      wasIn = nowIn;
      return false;
    };
    run(sim, clock, 60, watch);
    expect(breaks).toBe(0);
    // o dono sai para a ronda: agora ela pode
    forceCeo(sim.staff, 'rounds');
    st.nextBreakAt = clock.now;
    run(sim, clock, 240, watch);
    expect(breaks).toBeGreaterThan(0);
    expect(leftWhileBossIn).toBe(0);
  });

  it('leva um chai até a mesa dele; ele agradece e bebe', () => {
    const { sim, clock } = office([agent('ana')]);
    const st = sim.staff.member(SEC_ID)!.state as SecretaryState;
    const boss = ceoState(sim);
    forceCeo(sim.staff, 'desk');
    run(sim, clock, 5);
    boss.chaiAt = clock.now - 600_000;
    st.nextChaiAt = clock.now;
    const ceo = ceoOf(sim);
    expect(run(sim, clock, 120, () => ceo.held === 'coffee' && ceo.pose === 'drink')).toBe(true);
    expect(sim.staff.cues.some((c) => c.kind === 'cup')).toBe(true);
  });
});

describe('um dia inteiro', () => {
  it('20 minutos sem travar: o dono varia o que faz, a secretária trabalha e ninguém vira agente', () => {
    const agents = ['ana', 'bia', 'caio', 'davi', 'eva', 'fabio'].map((id, i) => agent(id, { look: i % 2 ? 'f' : 'm', roomId: i % 2 ? '/a' : '/b', status: i === 2 ? 'working' : 'idle' }));
    const { sim, clock } = office(agents, OWNER, 3);
    const did = new Set<string>();
    const sec = new Set<string>();
    let lastStep = clock.now;
    let stuck = 0;
    run(
      sim,
      clock,
      20 * 60,
      () => {
        const c = ceoOf(sim);
        did.add(ceoState(sim).last ?? '');
        sec.add((sim.staff.member(SEC_ID)!.state as SecretaryState).doing);
        if (c.step || c.queue.length) lastStep = clock.now;
        else if (clock.now - lastStep > 5_000) stuck++;
        return false;
      },
      10,
    );
    expect(stuck).toBe(0);
    expect(did.size).toBeGreaterThanOrEqual(6);
    expect(sec.size).toBeGreaterThanOrEqual(2);
    expect(sim.chars.get(CEO_ID)?.gone).toBe(false);
    // a interface só conhece os agentes do snapshot
    expect(agents.every((a) => sim.chars.has(a.id))).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../shared/types';
import type { ConnectionState, OfficeStore } from '../net/store';
import { EmbedBridge, embedRequested, embedSummary, parseEmbedCommand, SUMMARY_HEARTBEAT_MS, SUMMARY_MIN_MS } from './embed';

function agent(p: Partial<AgentInfo> & Pick<AgentInfo, 'id'>): AgentInfo {
  return {
    kind: 'main',
    name: p.id,
    look: 'f',
    role: 'Agente principal',
    sessionId: `s-${p.id}`,
    roomId: 'api',
    account: '.claude',
    status: 'working',
    recent: [],
    tasks: [],
    startedAt: 0,
    lastEventAt: 0,
    statusSince: 0,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: 1,
    ...p,
  };
}

const room = (id: string, slot: number): RoomInfo => ({ id, name: id, path: `/projetos/${id}`, slot, seed: slot, createdAt: 0 });

function snapOf(agents: AgentInfo[]): OfficeSnapshot {
  return { rooms: [room('api', 0), room('site', 1)], agents } as unknown as OfficeSnapshot;
}

describe('modo embutido: funções puras', () => {
  it('?embed=1 liga; outros valores não', () => {
    expect(embedRequested('?embed=1')).toBe(true);
    expect(embedRequested('?mock=1&embed=1')).toBe(true);
    expect(embedRequested('?embed=0')).toBe(false);
    expect(embedRequested('?embed')).toBe(false);
    expect(embedRequested('')).toBe(false);
  });

  it('comandos válidos e malformados', () => {
    expect(parseEmbedCommand({ type: 'habblaud:embed', compact: true })).toEqual({ type: 'habblaud:embed', compact: true });
    expect(parseEmbedCommand({ type: 'habblaud:embed', compact: false, extra: 1 })).toEqual({ type: 'habblaud:embed', compact: false });
    expect(parseEmbedCommand({ type: 'habblaud:overview' })).toEqual({ type: 'habblaud:overview' });
    for (const bad of [null, undefined, 'habblaud:overview', 42, [], {}, { type: 'habblaud:embed' }, { type: 'habblaud:embed', compact: 'true' }, { type: 'outra' }]) {
      expect(parseEmbedCommand(bad)).toBeNull();
    }
  });

  it('resumo: os contadores da barra superior, só números e o estado da conexão', () => {
    const s = embedSummary(
      snapOf([
        agent({ id: 'a' }),
        agent({ id: 'b', status: 'waiting' }),
        agent({ id: 'c', kind: 'sub', parentId: 'a' }),
        agent({ id: 'd', status: 'offline' }),
      ]),
      'open',
      1_000,
    );
    expect(s).toEqual({ type: 'habblaud:summary', rooms: 2, agents: 3, working: 2, subagents: 1, needsYou: 1, shells: 0, connection: 'open' });
    expect(embedSummary(null, 'connecting', 0)).toEqual({ type: 'habblaud:summary', rooms: 0, agents: 0, working: 0, subagents: 0, needsYou: 0, shells: 0, connection: 'connecting' });
  });
});

describe('EmbedBridge', () => {
  type Listener = (v: unknown) => void;
  let listeners: Record<string, Listener[]>;
  let store: { snapshot: OfficeSnapshot | null; liveSnapshot: OfficeSnapshot | null; connection: ConnectionState; replaying: boolean; on: (ev: string, fn: Listener) => () => void };
  let posted: unknown[];
  let onMessage: ((e: MessageEvent) => void) | undefined;
  let parent: { postMessage: (msg: unknown, origin: string) => void };
  let win: Window;
  let compact: boolean[];
  let overviews: number;

  const emit = (ev: string) => listeners[ev]?.forEach((fn) => fn(undefined));
  const setAgents = (agents: AgentInfo[]) => {
    store.snapshot = store.liveSnapshot = snapOf(agents);
    emit('snapshot');
  };
  const summaries = () => posted.filter((m) => (m as { type: string }).type === 'habblaud:summary') as { needsYou: number; agents: number }[];

  beforeEach(() => {
    vi.useFakeTimers();
    listeners = {};
    posted = [];
    compact = [];
    overviews = 0;
    store = {
      snapshot: null,
      liveSnapshot: null,
      connection: 'open',
      replaying: false,
      on: (ev, fn) => {
        (listeners[ev] ??= []).push(fn);
        return () => {};
      },
    };
    parent = { postMessage: (msg, origin) => (expect(origin).toBe('*'), posted.push(msg)) };
    win = {
      parent,
      addEventListener: (type: string, fn: (e: MessageEvent) => void) => {
        if (type === 'message') onMessage = fn;
      },
    } as unknown as Window;
  });
  afterEach(() => {
    vi.useRealTimers();
    onMessage = undefined;
  });

  const create = () =>
    new EmbedBridge({ store: store as unknown as OfficeStore, now: () => Date.now(), onCompact: (c) => compact.push(c), onOverview: () => overviews++, win });

  it('fora de um iframe não faz nada', () => {
    const self = { addEventListener: vi.fn() } as unknown as Window & { parent: unknown };
    self.parent = self;
    const bridge = new EmbedBridge({ store: store as unknown as OfficeStore, now: () => 0, onCompact: () => {}, onOverview: () => {}, win: self });
    bridge.ready();
    expect(self.addEventListener).not.toHaveBeenCalled();
  });

  it('ready: avisa e manda o primeiro resumo', () => {
    create().ready();
    expect(posted[0]).toEqual({ type: 'habblaud:ready' });
    expect(summaries()).toHaveLength(1);
  });

  it('só aceita comandos de window.parent', () => {
    create();
    onMessage!({ source: {}, data: { type: 'habblaud:embed', compact: false } } as MessageEvent);
    onMessage!({ source: parent, data: { type: 'habblaud:embed', compact: 'no' } } as MessageEvent);
    expect(compact).toEqual([]);
    onMessage!({ source: parent, data: { type: 'habblaud:embed', compact: false } } as MessageEvent);
    onMessage!({ source: parent, data: { type: 'habblaud:overview' } } as MessageEvent);
    expect(compact).toEqual([false]);
    expect(overviews).toBe(1);
  });

  it('no máximo um resumo por segundo; "precisa de você" sai na hora; batimento a cada 5 s', () => {
    create().ready();
    setAgents([agent({ id: 'a' })]);
    setAgents([agent({ id: 'a' }), agent({ id: 'b' })]);
    expect(summaries()).toHaveLength(1);
    vi.advanceTimersByTime(SUMMARY_MIN_MS);
    expect(summaries()).toHaveLength(2);
    expect(summaries()[1].agents).toBe(2);
    // Mudou o "precisa de você": não espera o intervalo.
    setAgents([agent({ id: 'a' }), agent({ id: 'b', status: 'waiting' })]);
    expect(summaries()).toHaveLength(3);
    expect(summaries()[2].needsYou).toBe(1);
    // Nada mudou: nenhum resumo extra até o batimento.
    setAgents([agent({ id: 'a' }), agent({ id: 'b', status: 'waiting' })]);
    expect(summaries()).toHaveLength(3);
    vi.advanceTimersByTime(SUMMARY_HEARTBEAT_MS);
    expect(summaries().length).toBeGreaterThanOrEqual(4);
  });
});

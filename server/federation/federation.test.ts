import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { AgentInfo, FeedItem, OfficeSnapshot, RoomInfo } from '../../shared/types';
import { machineName, normalizeOrigin, parsePeers } from './config';
import { Federation, OFFLINE_GRACE_MS } from './federation';
import { peerAgent, peerOutbox, peerTerminalInit, prefixId, SlotAllocator, splitId } from './merge';
import type { RequestFn } from './peer';

const room = (id: string, slot: number, name = id.split('/').pop() ?? id): RoomInfo => ({ id, name, path: id, slot, seed: 1, createdAt: 0 });
const agent = (id: string, roomId: string, extra: Partial<AgentInfo> = {}): AgentInfo => ({
  id,
  kind: 'main',
  roomId,
  name: 'Marina',
  look: 'f',
  role: 'dev',
  sessionId: 's',
  account: '.claude',
  status: 'working',
  recent: [{ id: `${id}#busy:1`, at: 1, kind: 'edit', icon: 'x', text: 't' }],
  tasks: [],
  startedAt: 0,
  lastEventAt: 0,
  statusSince: 0,
  stats: {} as AgentInfo['stats'],
  seed: 1,
  ...extra,
});
const snap = (rooms: RoomInfo[], agents: AgentInfo[], rev = 1): OfficeSnapshot => ({
  rev,
  serverTime: 0,
  rooms,
  agents,
  accounts: [{ id: '.claude', short: 'A', name: 'Conta A', color: '#000', configDir: '/x', sessions: agents.length, usageStatus: 'disabled' }],
  meta: { demo: false, sources: [], startedAt: 0, version: '0.11.0' },
});

/** Par falso: cada pedido devolve um stream SSE controlado pelo teste. */
function fakePeer() {
  const streams: PassThrough[] = [];
  const paths: string[] = [];
  const hosts: string[] = [];
  const request: RequestFn = (url, opts, cb) => {
    paths.push(url.pathname);
    hosts.push(String((opts.headers as Record<string, string>).Host));
    const req = new EventEmitter() as ClientRequest;
    const res = new PassThrough() as unknown as IncomingMessage & PassThrough;
    res.statusCode = 200;
    Object.assign(req, {
      end: () => {
        streams.push(res);
        queueMicrotask(() => cb(res));
      },
      destroy: () => res.destroy(),
      setTimeout: () => req,
    });
    return req;
  };
  const send = (event: string, data: unknown, i = streams.length - 1) => streams[i].write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  return { request, send, streams, paths, hosts };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('federation: configuração', () => {
  it('lê HABBLAUD_PEERS e recusa itens inválidos', () => {
    expect(parsePeers('srv1=http://127.0.0.1:4801, notebook=http://host.docker.internal:4802/')).toEqual({
      peers: [
        { id: 'srv1', name: 'srv1', url: 'http://127.0.0.1:4801' },
        { id: 'notebook', name: 'notebook', url: 'http://host.docker.internal:4802' },
      ],
      invalid: [],
    });
    const r = parsePeers('ok=http://a:1 local=http://b:2 Bad_Id=http://c:3 x=ftp://d nocolon dup=http://e:1 dup=http://f:1 p=http://g:1/path');
    expect(r.peers.map((p) => p.id)).toEqual(['ok', 'dup']);
    expect(r.invalid).toEqual(['local=http://b:2', 'Bad_Id=http://c:3', 'x=ftp://d', 'nocolon', 'dup=http://f:1', 'p=http://g:1/path']);
    expect(parsePeers(undefined).peers).toEqual([]);
    expect(normalizeOrigin('http://u:p@h:1')).toBeUndefined();
  });

  it('nome da máquina: HABBLAUD_MACHINE_NAME ou o hostname sem domínio', () => {
    expect(machineName({ HABBLAUD_MACHINE_NAME: ' Mac ' })).toBe('Mac');
    expect(machineName({}, () => 'macbook.local')).toBe('macbook');
  });
});

describe('federation: ids e vagas', () => {
  it('prefixa e separa ids', () => {
    expect(prefixId('alice', '.claude:12')).toBe('alice~.claude:12');
    expect(splitId('alice~.claude:12')).toEqual({ peer: 'alice', id: '.claude:12' });
    expect(splitId('.claude:12')).toBeUndefined();
  });

  it('agente do par: ids, sala, conta e atividades com prefixo', () => {
    const a = peerAgent(agent('.claude:1', '/srv', { parentId: '.claude:0' }), { id: 'alice', name: 'alice' });
    expect(a).toMatchObject({ id: 'alice~.claude:1', parentId: 'alice~.claude:0', roomId: 'alice~/srv', account: 'alice~.claude', machine: { id: 'alice' } });
    expect(a.recent[0].id).toBe('alice~.claude:1#busy:1');
  });

  it('agente do par mantém o perfil da aparência da máquina dele (e quem não tem continua sem)', () => {
    const m = { id: 'alice', name: 'alice' };
    expect(peerAgent(agent('.claude:1', '/srv', { appearance: 'pk' }), m).appearance).toBe('pk');
    expect(peerAgent(agent('.claude:1', '/srv'), m)).not.toHaveProperty('appearance');
  });

  it('o que a página manda de volta também ganha o prefixo: pedido de permissão, mensagem e terminal', () => {
    const m = { id: 'alice', name: 'alice' };
    const permission = { id: 'p-1', tool: 'Bash', title: 'Bash(ls)', text: 't', icon: 'x', createdAt: 0, expiresAt: 1 };
    expect(peerAgent(agent('.claude:1', '/srv', { permission }), m).permission).toEqual({ ...permission, id: 'alice~p-1' });
    expect(peerAgent(agent('.claude:1', '/srv'), m).permission).toBeUndefined();
    expect(peerOutbox({ id: 'm-1', agentId: '.claude:1', status: 'queued', createdAt: 0, updatedAt: 0 }, m)).toMatchObject({ id: 'alice~m-1', agentId: 'alice~.claude:1' });
    expect(peerTerminalInit({ agentId: '.claude:1', entries: [], truncated: false }, m).agentId).toBe('alice~.claude:1');
  });

  it('vagas estáveis, menor livre, e espera antes de reaproveitar', () => {
    const s = new SlotAllocator(1000);
    expect(s.assign([room('a', 0), room('b', 0), room('c', 5)], 0).map((r) => r.slot)).toEqual([0, 1, 2]);
    // "b" sai: a vaga 1 espera; "d" pega a 3.
    expect(s.assign([room('a', 0), room('c', 0), room('d', 0)], 10).map((r) => r.slot)).toEqual([0, 2, 3]);
    // Depois da espera, a vaga 1 volta a valer.
    expect(s.assign([room('a', 0), room('c', 0), room('d', 0), room('e', 0)], 2000).map((r) => r.slot)).toEqual([0, 2, 3, 1]);
  });
});

describe('federation: escritório combinado', () => {
  it('junta o snapshot do par com a etiqueta da máquina e reage a mudanças', async () => {
    const peer = fakePeer();
    const onChange = vi.fn();
    const fed = new Federation({ machineName: 'Mac', peers: [{ id: 'alice', name: 'alice', url: 'http://p:1' }], request: peer.request });
    fed.onChange(onChange);
    fed.start();
    await tick();
    expect(peer.paths).toEqual(['/api/stream']);
    expect(peer.hosts).toEqual(['localhost']);

    const local = snap([room('/Users/me/app', 0)], [agent('.claude:7', '/Users/me/app')]);
    let m = fed.merge(local, true);
    expect(m.snapshot.rooms.map((r) => r.name)).toEqual(['Mac · app']);
    expect(m.snapshot.meta.machines?.map((x) => [x.id, x.online])).toEqual([['local', true], ['alice', false]]);

    peer.send('snapshot', snap([room('/srv/api', 0)], [agent('.claude:1', '/srv/api')]));
    await tick();
    expect(onChange).toHaveBeenCalled();
    m = fed.merge(local, false);
    expect(m.changed).toBe(true);
    expect(m.snapshot.rooms.map((r) => [r.id, r.name, r.slot])).toEqual([
      ['/Users/me/app', 'Mac · app', 0],
      ['alice~/srv/api', 'alice · api', 1],
    ]);
    expect(m.snapshot.agents.map((a) => a.id)).toEqual(['.claude:7', 'alice~.claude:1']);
    expect(m.snapshot.accounts.map((a) => [a.id, a.name])).toEqual([
      ['.claude', 'Conta A'],
      ['alice~.claude', 'alice · Conta A'],
    ]);
    // Sem mudança em lugar nenhum: o mesmo snapshot, mesmo rev.
    const again = fed.merge(local, false);
    expect(again.changed).toBe(false);
    expect(again.snapshot.rev).toBe(m.snapshot.rev);
    expect(fed.owner('alice~.claude:1')).toMatchObject({ peer: { id: 'alice' }, id: '.claude:1' });
    expect(fed.owner('.claude:7')).toBeUndefined();
    fed.stop();
  });

  it('feed sem repetir o que a reconexão reenvia; avisos com a máquina', async () => {
    const peer = fakePeer();
    const fed = new Federation({ machineName: 'Mac', peers: [{ id: 'srv', name: 'srv', url: 'http://p:1' }], request: peer.request });
    fed.start();
    await tick();
    const item: FeedItem = { id: 'f1', agentId: '.claude:1', roomId: '/srv', agentName: 'Luan', roomName: 'srv', activity: { id: 'a1', at: 5, kind: 'edit', icon: 'x', text: 't' } };
    peer.send('feed', [item]);
    peer.send('notice', { id: 'n1', level: 'info', text: 'Luan chegou', agentId: '.claude:1', at: 5 });
    await tick();
    expect(fed.mergeFeed([]).map((f) => [f.id, f.roomName])).toEqual([['srv~f1', 'srv · srv']]);
    expect(fed.mergeNotices([]).map((n) => [n.agentId, n.text])).toEqual([['srv~.claude:1', 'srv: Luan chegou']]);
    peer.send('feed', [item]);
    await tick();
    expect(fed.mergeFeed([])).toEqual([]);
    expect(fed.recentFeed([], 10).map((f) => f.id)).toEqual(['srv~f1']);
    fed.stop();
  });

  it('par que cai: fica marcado como offline e sai depois da tolerância', async () => {
    let now = 1_000;
    const peer = fakePeer();
    const fed = new Federation({ machineName: 'Mac', peers: [{ id: 'srv', name: 'srv', url: 'http://p:1' }], request: peer.request, now: () => now });
    fed.start();
    await tick();
    peer.send('snapshot', snap([room('/srv', 0)], []));
    await tick();
    const local = snap([], []);
    expect(fed.merge(local, true).snapshot.rooms).toHaveLength(1);
    peer.streams[0].end();
    await tick();
    let m = fed.merge(local, false);
    expect(m.snapshot.meta.machines?.[1]).toMatchObject({ id: 'srv', online: false });
    expect(m.snapshot.rooms).toHaveLength(1);
    now += OFFLINE_GRACE_MS + 1;
    m = fed.merge(local, true);
    expect(m.snapshot.rooms).toHaveLength(0);
    fed.stop();
  });
});

// Escritório combinado, fase 2: ações repassadas ao par dono (forward.ts) e a presença de quem olha (presence.ts).
// O "par" é um servidor HTTP de verdade numa porta livre do 127.0.0.1 que grava os pedidos e responde o que o teste
// mandar; a frente é a API de verdade (guard + app.ts) com o escritório combinado apontando para ele.
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OfficeSnapshot } from '../../shared/types';
import { AccountsService } from '../accounts/service';
import { createApiHandler, sendJson, type ApiDeps } from '../http/app';
import { createRequestGuard } from '../http/guard';
import { createPtyRoutes } from '../http/pty';
import { Hub } from '../http/sse';
import type { TerminalStreams } from '../http/terminal';
import { setQuiet } from '../log';
import { NameStore } from '../model/names';
import { Office } from '../model/office';
import type { PtyManager } from '../pty/manager';
import { tempDir } from '../test/fixtures';
import { FEDERATION_HEADER } from './config';
import { Federation } from './federation';
import { rewriteEvent } from './forward';
import { parsePresence, PRESENCE_TTL_MS, RemotePresence } from './presence';

setQuiet(true);

interface Seen {
  method: string;
  path: string;
  host?: string;
  federation?: string;
  type?: string;
  body: string;
}

type PeerHandler = (req: IncomingMessage, res: ServerResponse, body: string) => void;

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function closeServer(server: http.Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((ok) => server.close(() => ok()));
}

/** Par falso: grava cada pedido e responde com `handler` (padrão: 200 {ok: true}). */
async function fakePeer() {
  const seen: Seen[] = [];
  const closed: string[] = [];
  let handler: PeerHandler = (_req, res) => sendJson(res, 200, { ok: true });
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      seen.push({
        method: req.method ?? '',
        path: req.url ?? '',
        host: req.headers.host,
        federation: req.headers[FEDERATION_HEADER] as string | undefined,
        type: req.headers['content-type'],
        body,
      });
      res.on('close', () => closed.push(req.url ?? ''));
      handler(req, res, body);
    });
  });
  const url = await listen(server);
  return { url, seen, closed, server, on: (h: PeerHandler) => (handler = h) };
}

function makeOffice(): Office {
  return new Office({ names: new NameStore(null), version: 't', startedAt: Date.now(), accounts: () => [], sources: () => [], accountName: () => undefined });
}

/** A frente: API de verdade com o escritório combinado e rotas locais falsas que gravam o que recebem. */
async function front(peerUrl: string, extra: Partial<ApiDeps> = {}) {
  const tmp = tempDir();
  const office = makeOffice();
  const federation = new Federation({ machineName: 'Mac', peers: [{ id: 'srv', name: 'srv', url: peerUrl }] });
  const hub = new Hub(office, { throttleMs: 10, federation });
  const local: { path: string; body?: unknown }[] = [];
  const readBody = (req: IncomingMessage) =>
    new Promise<unknown>((ok) => {
      let raw = '';
      req.on('data', (c: Buffer) => (raw += c));
      req.on('end', () => ok(raw ? JSON.parse(raw) : undefined));
    });
  const localRoute = (req: IncomingMessage, res: ServerResponse, path: string) =>
    void readBody(req).then((body) => {
      local.push({ path, body });
      sendJson(res, 200, { local: true });
    });
  const renamed: string[] = [];
  const api = createApiHandler({
    office,
    hub,
    federation,
    accounts: new AccountsService({ dirs: [], home: tmp.dir, env: {}, onChange: () => {} }),
    sources: () => [],
    version: 't',
    inDocker: false,
    terminal: true,
    terminals: { attach: (_req: IncomingMessage, res: ServerResponse, id: string) => sendJson(res, 200, { localTerminal: id }) } as unknown as TerminalStreams,
    permissions: localRoute,
    messages: localRoute,
    pty: createPtyRoutes({ stop: async () => {} } as unknown as PtyManager, federation),
    renameRoom: (id, name) => (renamed.push(id), name),
    ...extra,
  });
  const guard = createRequestGuard({ allowedHosts: new Set(['habblaud.lan']) });
  const server = http.createServer((req, res) => {
    if (guard(req, res)) return;
    if (!api(req, res, new URL(req.url ?? '/', 'http://x'))) res.writeHead(404).end();
  });
  const base = await listen(server);
  return {
    base,
    hub,
    local,
    renamed,
    close: async () => {
      hub.stop();
      await closeServer(server);
      tmp.cleanup();
    },
  };
}

/** Requisição crua (o fetch não deixa trocar o cabeçalho Host). */
function raw(base: string, path: string, opts: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  const u = new URL(base);
  const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const read = !opts.method || opts.method === 'GET';
  const headers = { ...(read ? {} : { 'Content-Type': 'application/json' }), ...opts.headers };
  return new Promise((ok, fail) => {
    const req = http.request({ host: u.hostname, port: u.port, path, method: opts.method ?? 'GET', headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => {
        let parsed: unknown = body || undefined;
        try {
          parsed = body ? JSON.parse(body) : undefined;
        } catch {
          // texto puro (o guard responde assim)
        }
        ok({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    req.on('error', fail);
    req.end(data);
  });
}

const until = async (cond: () => boolean, ms = 2_000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('tempo esgotado');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('federation: ações repassadas ao par dono', () => {
  let peer: Awaited<ReturnType<typeof fakePeer>>;
  let env: Awaited<ReturnType<typeof front>>;
  beforeEach(async () => {
    peer = await fakePeer();
    env = await front(peer.url);
  });
  afterEach(async () => {
    await env.close();
    await closeServer(peer.server);
  });

  it('pedido de permissão: detalhe e decisão vão ao par com o id original; a resposta volta prefixada', async () => {
    peer.on((_req, res) => sendJson(res, 200, { id: 'p-1', tool: 'Bash', title: 'Bash(ls)', text: 't', icon: 'x', createdAt: 0, expiresAt: 1 }));
    const d = await raw(env.base, `/api/permissions/${encodeURIComponent('srv~p-1')}`, { headers: { Host: 'localhost' } });
    expect(d).toMatchObject({ status: 200, body: { id: 'srv~p-1', tool: 'Bash' } });
    expect(peer.seen[0]).toMatchObject({ method: 'GET', path: '/api/permissions/p-1', host: 'localhost', federation: '1' });

    peer.on((_req, res) => sendJson(res, 200, { ok: true }));
    const r = await raw(env.base, '/api/permissions/srv~p-1/decision', { method: 'POST', headers: { Host: 'localhost' }, body: { behavior: 'allow' } });
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(peer.seen[1]).toMatchObject({ method: 'POST', path: '/api/permissions/p-1/decision', type: 'application/json', body: '{"behavior":"allow"}' });

    // O erro do par volta com o mesmo status.
    peer.on((_req, res) => sendJson(res, 409, { error: 'este pedido já foi respondido' }));
    expect(await raw(env.base, '/api/permissions/srv~p-1/decision', { method: 'POST', headers: { Host: 'localhost' }, body: { behavior: 'deny' } })).toEqual({
      status: 409,
      body: { error: 'este pedido já foi respondido' },
    });
    // Ids locais (e a espera do hook, que é só local) ficam aqui.
    await raw(env.base, '/api/permissions/p-9/decision', { method: 'POST', headers: { Host: 'localhost' }, body: { behavior: 'allow' } });
    await raw(env.base, '/api/permissions/srv~p-1/wait', { headers: { Host: 'localhost' } });
    expect(env.local.map((l) => l.path)).toEqual(['/api/permissions/p-9/decision', '/api/permissions/srv~p-1/wait']);
    expect(peer.seen).toHaveLength(3);
  });

  it('a trava local vale antes de repassar', async () => {
    const r = await raw(env.base, '/api/permissions/srv~p-1/decision', { method: 'POST', headers: { Host: 'habblaud.lan' }, body: { behavior: 'allow' } });
    expect(r.status).toBe(403);
    expect((await raw(env.base, '/api/messages', { method: 'POST', headers: { Host: 'habblaud.lan' }, body: { agentId: 'srv~.claude:1', text: 'oi' } })).status).toBe(403);
    expect((await raw(env.base, '/api/agents/srv~.claude:1/terminal', { headers: { Host: 'habblaud.lan' } })).status).toBe(403);
    expect((await raw(env.base, '/api/agents/srv~.claude:1/character', { method: 'DELETE', headers: { Host: 'habblaud.lan' } })).status).toBe(403);
    expect(peer.seen).toEqual([]);
  });

  it('mensagens: o destinatário vai sem prefixo; a mensagem e a situação dela voltam prefixadas', async () => {
    peer.on((req, res) =>
      req.method === 'POST'
        ? sendJson(res, 201, { id: 'm-1', agentId: '.claude:1', status: 'queued', createdAt: 1, updatedAt: 1 })
        : sendJson(res, 200, { id: 'm-1', agentId: '.claude:1', status: 'delivered', createdAt: 1, updatedAt: 2 }),
    );
    const sent = await raw(env.base, '/api/messages', { method: 'POST', headers: { Host: 'localhost' }, body: { agentId: 'srv~.claude:1', text: 'oi' } });
    expect(sent).toMatchObject({ status: 201, body: { id: 'srv~m-1', agentId: 'srv~.claude:1', status: 'queued' } });
    expect(JSON.parse(peer.seen[0].body)).toEqual({ agentId: '.claude:1', text: 'oi' });
    const st = await raw(env.base, `/api/messages/${encodeURIComponent('srv~m-1')}`, { headers: { Host: 'localhost' } });
    expect(st).toMatchObject({ status: 200, body: { id: 'srv~m-1', status: 'delivered' } });
    expect(peer.seen[1]).toMatchObject({ method: 'GET', path: '/api/messages/m-1' });
    // Agente local: a rota local recebe o corpo inteiro.
    expect(await raw(env.base, '/api/messages', { method: 'POST', headers: { Host: 'localhost' }, body: { agentId: '.claude:7', text: 'aqui' } })).toEqual({
      status: 200,
      body: { local: true },
    });
    expect(env.local).toEqual([{ path: '/api/messages', body: { agentId: '.claude:7', text: 'aqui' } }]);
  });

  it('personagem, sala e encerrar o agente', async () => {
    const parts = { name: 'Ana', seed: 1, parts: {} };
    expect((await raw(env.base, '/api/agents/srv~.claude:1/character', { method: 'PUT', headers: { Host: 'localhost' }, body: parts })).status).toBe(200);
    expect((await raw(env.base, '/api/agents/srv~.claude:1/character', { method: 'DELETE', headers: { Host: 'localhost' } })).status).toBe(200);
    expect(await raw(env.base, '/api/rooms/rename', { method: 'POST', headers: { Host: 'localhost' }, body: { id: 'srv~/srv/api', name: 'API' } })).toEqual({
      status: 200,
      body: { ok: true },
    });
    peer.on((_req, res) => res.writeHead(204).end());
    expect((await raw(env.base, '/api/agents/srv~.claude:1/stop', { method: 'POST', headers: { Host: 'localhost' }, body: {} })).status).toBe(204);
    expect(peer.seen.map((s) => [s.method, s.path, s.body])).toEqual([
      ['PUT', '/api/agents/.claude%3A1/character', JSON.stringify(parts)],
      ['DELETE', '/api/agents/.claude%3A1/character', ''],
      ['POST', '/api/rooms/rename', '{"id":"/srv/api","name":"API"}'],
      ['POST', '/api/agents/.claude%3A1/stop', '{}'],
    ]);
    // Assumir a sessão de outra máquina não dá; a sala local é renomeada aqui.
    expect((await raw(env.base, '/api/agents/srv~.claude:1/takeover', { method: 'POST', headers: { Host: 'localhost' }, body: {} })).status).toBe(400);
    expect((await raw(env.base, '/api/rooms/rename', { method: 'POST', headers: { Host: 'localhost' }, body: { id: '/p/loja', name: 'Loja' } })).body).toEqual({ name: 'Loja' });
    expect(env.renamed).toEqual(['/p/loja']);
    expect(peer.seen).toHaveLength(4);
  });

  it('terminal: o stream do par passa evento a evento, com o agentId do init prefixado, e fecha junto', async () => {
    peer.on((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
      res.write('retry: 2000\n\n');
      res.write(`event: init\ndata: ${JSON.stringify({ agentId: '.claude:1', entries: [], truncated: false })}\n\n`);
      res.write(': ping\n\n');
    });
    const ctrl = new AbortController();
    const res = await fetch(`${env.base}/api/agents/${encodeURIComponent('srv~.claude:1')}/terminal`, { signal: ctrl.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = '';
    while (!text.includes(': ping')) text += dec.decode((await reader.read()).value, { stream: true });
    expect(text).toBe('retry: 2000\n\nevent: init\ndata: {"agentId":"srv~.claude:1","entries":[],"truncated":false}\n\n: ping\n\n');
    expect(peer.seen[0]).toMatchObject({ path: '/api/agents/.claude%3A1/terminal', host: 'localhost' });
    ctrl.abort();
    await until(() => peer.closed.length === 1);
  });

  it('terminal: erro do par antes do stream volta como JSON', async () => {
    peer.on((_req, res) => sendJson(res, 403, { error: 'terminal desligado' }));
    expect(await raw(env.base, '/api/agents/srv~.claude:1/terminal', { headers: { Host: 'localhost' } })).toEqual({ status: 403, body: { error: 'terminal desligado' } });
    // Agente local: o terminal daqui.
    expect((await raw(env.base, '/api/agents/.claude:7/terminal', { headers: { Host: 'localhost' } })).body).toEqual({ localTerminal: '.claude:7' });
  });

  it('par fora do ar: 502 com o motivo', async () => {
    await closeServer(peer.server);
    const r = await raw(env.base, '/api/permissions/srv~p-1/decision', { method: 'POST', headers: { Host: 'localhost' }, body: { behavior: 'allow' } });
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/não respondeu/);
  });
});

describe('federation: rewriteEvent', () => {
  it('reescreve só o data JSON e mantém o resto', () => {
    const map = (e: string, d: unknown) => (e === 'init' ? { ...(d as object), x: 1 } : d);
    expect(rewriteEvent('event: init\nid: 3\ndata: {"a":1}', map)).toBe('event: init\nid: 3\ndata: {"a":1,"x":1}\n\n');
    expect(rewriteEvent(': ping', map)).toBe(': ping\n\n');
    expect(rewriteEvent('event: x\ndata: não-json', map)).toBe('event: x\ndata: não-json\n\n');
  });
});

describe('federation: presença de quem olha', () => {
  it('informes valem por PRESENCE_TTL_MS e o formato é conferido', () => {
    let now = 0;
    const p = new RemotePresence(() => now);
    p.report({ from: 'a', viewers: 2 });
    now = 10_000;
    p.report({ from: 'b', viewers: 1 });
    expect(p.count()).toBe(3);
    p.report({ from: 'a', viewers: 0 });
    expect(p.count()).toBe(1);
    now += PRESENCE_TTL_MS + 1;
    expect(p.count()).toBe(0);
    expect(parsePresence({ from: 'abc', viewers: 1 })).toEqual({ from: 'abc', viewers: 1 });
    for (const bad of [null, {}, { from: 'a b', viewers: 1 }, { from: 'a', viewers: -1 }, { from: 'a', viewers: 1.5 }, { from: 'a', viewers: '1' }]) {
      expect(parsePresence(bad)).toBeUndefined();
    }
  });

  it('o stream de um escritório combinado não conta como página olhando; o informe dele, sim', async () => {
    const office = makeOffice();
    const hub = new Hub(office, { throttleMs: 10 });
    const presence = new RemotePresence();
    const tmp = tempDir();
    const api = createApiHandler({
      office,
      hub,
      presence,
      accounts: new AccountsService({ dirs: [], home: tmp.dir, env: {}, onChange: () => {} }),
      sources: () => [],
      version: 't',
      inDocker: false,
    });
    const guard = createRequestGuard();
    const server = http.createServer((req, res) => {
      if (guard(req, res)) return;
      if (!api(req, res, new URL(req.url ?? '/', 'http://x'))) res.writeHead(404).end();
    });
    const base = await listen(server);
    const u = new URL(base);
    const open = (headers: Record<string, string>) =>
      new Promise<http.ClientRequest>((ok) => {
        const req = http.get({ host: u.hostname, port: u.port, path: '/api/stream', headers: { Host: 'localhost', ...headers } }, (res) => res.once('data', () => ok(req)));
      });
    const fed = await open({ [FEDERATION_HEADER]: '1' });
    expect(hub.localSize).toBe(0);
    const page = await open({});
    expect(hub.localSize).toBe(1);

    expect(await raw(base, '/api/federation/presence', { method: 'POST', headers: { Host: 'localhost' }, body: { from: 'mac', viewers: 2 } })).toEqual({ status: 200, body: { ok: true } });
    expect(presence.count()).toBe(2);
    expect((await raw(base, '/api/federation/presence', { method: 'POST', headers: { Host: 'localhost' }, body: { from: 'mac' } })).status).toBe(400);
    expect((await raw(base, '/api/federation/presence', { method: 'POST', headers: { Host: '10.0.0.5' }, body: { from: 'x', viewers: 9 } })).status).toBe(403);
    expect(presence.count()).toBe(2);

    fed.destroy();
    page.destroy();
    hub.stop();
    await closeServer(server);
    tmp.cleanup();
  });

  it('o escritório combinado informa a contagem a cada par conectado: na hora quando muda, senão a cada 10 s', async () => {
    const snap: OfficeSnapshot = { rev: 1, serverTime: 0, rooms: [], agents: [], accounts: [], meta: { demo: false, sources: [], startedAt: 0, version: 't' } };
    const peer = await fakePeer();
    peer.on((req, res) => {
      if (req.url === '/api/stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
      } else sendJson(res, 200, { ok: true });
    });
    let now = 1_000;
    let viewers = 1;
    const fed = new Federation({ machineName: 'Mac', peers: [{ id: 'srv', name: 'srv', url: peer.url }], viewers: () => viewers, now: () => now });
    fed.start();
    const posts = () => peer.seen.filter((s) => s.path === '/api/federation/presence');
    // Antes de conectar: nada.
    fed.sendPresence();
    await until(() => fed.merge(snap, true).snapshot.meta.machines?.[1].online === true);
    fed.sendPresence();
    await until(() => posts().length === 1);
    expect(posts()[0]).toMatchObject({ method: 'POST', host: 'localhost', type: 'application/json' });
    const from = JSON.parse(posts()[0].body).from;
    expect(JSON.parse(posts()[0].body)).toEqual({ from, viewers: 1 });
    fed.sendPresence();
    viewers = 0;
    fed.sendPresence();
    await until(() => posts().length === 2);
    expect(JSON.parse(posts()[1].body)).toEqual({ from, viewers: 0 });
    now += 10_000;
    fed.sendPresence();
    await until(() => posts().length === 3);
    fed.stop();
    await closeServer(peer.server);
  });
});

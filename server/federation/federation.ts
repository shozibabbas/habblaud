// Escritório combinado: junta o escritório local com os dos pares (HABBLAUD_PEERS) num só snapshot.
//
// O Hub (http/sse.ts) chama merge() a cada commit do Office: as salas, agentes e contas locais ganham a etiqueta da
// máquina (sem mudar de id), os dos pares ganham também o prefixo "<par>~" nos ids, e as vagas são renumeradas.
// Um par desconectado continua no escritório por OFFLINE_GRACE_MS (com o último estado conhecido) e depois sai.
// As ações sobre o que é de um par (responder pedidos, mandar mensagens, o terminal, o personagem, renomear a sala,
// encerrar o agente) são repassadas a ele (forward.ts); quantas páginas olham daqui vai para cada par (presence.ts).
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  AccountInfo,
  AgentDetail,
  AgentInfo,
  FeedItem,
  MachineRef,
  MachineStatus,
  Notice,
  OfficeSnapshot,
  OutboxMessage,
  PermissionRequestInfo,
  TerminalInit,
} from '../../shared/types';
import { tr } from '../../shared/i18n';
import { HttpError, readJson, sendJson } from '../http/app';
import { LOCAL_MACHINE, type PeerConfig } from './config';
import { forwardJson, forwardStream } from './forward';
import {
  localFeedItem,
  localRoom,
  peerAccount,
  peerAgent,
  peerDetail,
  peerFeedItem,
  peerNotice,
  peerOutbox,
  peerPermission,
  peerRoom,
  peerTerminalInit,
  SlotAllocator,
  splitId,
} from './merge';
import { fetchPeerJson, PeerClient, type RequestFn } from './peer';
import { PRESENCE_CHECK_MS, PRESENCE_SEND_MS } from './presence';

/** Um par desconectado fica no escritório (com o último estado) por este tempo. */
export const OFFLINE_GRACE_MS = 90_000;
/** Ids de itens do feed já repassados (cada reconexão repete os recentes). */
const SEEN_FEED_MAX = 2_000;
const RECENT_FEED_MAX = 200;

/** Ações sobre algo de um par com o id no caminho (ids nunca contêm '/'). */
const PERMISSION_ITEM = /^\/api\/permissions\/([^/]+)(\/decision)?$/;
const MESSAGE_ITEM = /^\/api\/messages\/([^/]+)$/;
const AGENT_ACTION = /^\/api\/agents\/([^/]+)\/(terminal|character|stop|takeover)$/;

export interface FederationOptions {
  machineName: string;
  peers: PeerConfig[];
  /**
   * Páginas abertas aqui que podem responder pedidos de permissão: vai para cada par (POST /api/federation/presence),
   * que só desvia os pedidos do terminal quando alguém olha. Ausente = não informa.
   */
  viewers?: () => number;
  request?: RequestFn;
  now?: () => number;
}

export class Federation {
  readonly local: MachineRef;
  private readonly clients: PeerClient[];
  private readonly slots = new SlotAllocator();
  private readonly changeCbs = new Set<() => void>();
  private readonly seenFeed = new Set<string>();
  /** Últimos itens dos pares (já combinados), para o feed inicial de quem conecta. */
  private recentPeerFeed: FeedItem[] = [];
  private readonly now: () => number;
  private readonly request: RequestFn | undefined;
  private dirty = true;
  private rev = 0;
  private last: OfficeSnapshot | undefined;
  private readonly viewers: (() => number) | undefined;
  /** Quem informa a presença aos pares (sorteado a cada início: um informe velho expira sozinho). */
  private readonly instance = randomBytes(6).toString('hex');
  private readonly presenceSent = new Map<string, { viewers: number; at: number }>();
  private presenceTimer: ReturnType<typeof setInterval> | undefined;

  constructor(opts: FederationOptions) {
    this.now = opts.now ?? Date.now;
    this.request = opts.request;
    this.viewers = opts.viewers;
    this.local = { id: LOCAL_MACHINE, name: opts.machineName };
    this.clients = opts.peers.map(
      (p) =>
        new PeerClient(p, {
          request: opts.request,
          now: this.now,
          onChange: () => {
            this.dirty = true;
            for (const cb of this.changeCbs) cb();
          },
        }),
    );
  }

  get peers(): readonly PeerConfig[] {
    return this.clients.map((c) => c.config);
  }

  start(): void {
    for (const c of this.clients) c.start();
    if (this.viewers && !this.presenceTimer) {
      this.presenceTimer = setInterval(() => this.sendPresence(), PRESENCE_CHECK_MS);
      this.presenceTimer.unref?.();
    }
  }

  stop(): void {
    for (const c of this.clients) c.stop();
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    this.presenceTimer = undefined;
  }

  /**
   * Informa a cada par conectado quantas páginas olham daqui: na hora, se a contagem mudou; senão a cada
   * PRESENCE_SEND_MS (o par esquece o informe em PRESENCE_TTL_MS).
   */
  sendPresence(): void {
    if (!this.viewers) return;
    const viewers = this.viewers();
    const now = this.now();
    for (const c of this.clients) {
      if (!c.state.online) {
        this.presenceSent.delete(c.config.id);
        continue;
      }
      const last = this.presenceSent.get(c.config.id);
      if (last && last.viewers === viewers && now - last.at < PRESENCE_SEND_MS) continue;
      this.presenceSent.set(c.config.id, { viewers, at: now });
      fetchPeerJson(c.config, '/api/federation/presence', { request: this.request, method: 'POST', body: { from: this.instance, viewers } })
        .then((r) => {
          if (r.status !== 200) this.presenceSent.delete(c.config.id);
        })
        .catch(() => this.presenceSent.delete(c.config.id));
    }
  }

  /** Avisado quando algum par muda (o Hub agenda um commit). */
  onChange(cb: () => void): () => void {
    this.changeCbs.add(cb);
    return () => void this.changeCbs.delete(cb);
  }

  /** O id pertence a um par conhecido? Devolve o par e o id original. */
  owner(id: string): { peer: PeerConfig; id: string } | undefined {
    const s = splitId(id);
    if (!s) return undefined;
    const peer = this.clients.find((c) => c.config.id === s.peer)?.config;
    return peer && { peer, id: s.id };
  }

  /**
   * Snapshot combinado. `localChanged` = o Office mudou desde a última chamada; sem mudança em lugar nenhum, devolve
   * o último combinado (com o mesmo `rev`) e `changed: false`.
   */
  merge(local: OfficeSnapshot, localChanged: boolean): { snapshot: OfficeSnapshot; changed: boolean } {
    if (!localChanged && !this.dirty && this.last) return { snapshot: this.last, changed: false };
    this.dirty = false;
    const now = this.now();
    const rooms = local.rooms.map((r) => localRoom(r, this.local));
    const agents: AgentInfo[] = local.agents.map((a) => ({ ...a, machine: this.local }));
    const accounts: AccountInfo[] = local.accounts.map((a) => ({ ...a, machine: this.local }));
    const machines: MachineStatus[] = [{ ...this.local, local: true, online: true, since: local.meta.startedAt, version: local.meta.version }];
    for (const c of this.clients) {
      const m: MachineRef = { id: c.config.id, name: c.config.name };
      const snap = c.snapshot;
      machines.push({ ...m, online: c.state.online, since: c.state.since, version: snap?.meta.version, ...(c.state.error && !c.state.online ? { error: c.state.error } : {}) });
      if (!snap) continue;
      if (!c.state.online && now - c.state.since > OFFLINE_GRACE_MS) continue;
      rooms.push(...snap.rooms.map((r) => peerRoom(r, m)));
      agents.push(...snap.agents.map((a) => peerAgent(a, m)));
      accounts.push(...snap.accounts.map((a) => peerAccount(a, m)));
    }
    const snapshot: OfficeSnapshot = {
      ...local,
      rev: ++this.rev,
      rooms: this.slots.assign(rooms, now),
      agents,
      accounts,
      meta: { ...local.meta, machines },
    };
    this.last = snapshot;
    return { snapshot, changed: true };
  }

  /** Itens do feed: os locais (com a etiqueta) mais os novos dos pares. */
  mergeFeed(local: FeedItem[]): FeedItem[] {
    const out = local.map((f) => localFeedItem(f, this.local));
    for (const c of this.clients) {
      const m: MachineRef = { id: c.config.id, name: c.config.name };
      for (const f of c.drainFeed()) {
        const item = peerFeedItem(f, m);
        if (this.seenFeed.has(item.id)) continue;
        this.remember(item.id);
        out.push(item);
        this.recentPeerFeed.push(item);
      }
    }
    if (this.recentPeerFeed.length > RECENT_FEED_MAX) this.recentPeerFeed = this.recentPeerFeed.slice(-RECENT_FEED_MAX);
    return out;
  }

  /** Avisos: os locais mais os novos dos pares. */
  mergeNotices(local: Notice[]): Notice[] {
    const out = [...local];
    for (const c of this.clients) {
      const m: MachineRef = { id: c.config.id, name: c.config.name };
      out.push(...c.drainNotices().map((n) => peerNotice(n, m)));
    }
    return out;
  }

  /** Feed recente para quem acaba de conectar: o local e o dos pares, em ordem de tempo, os `n` últimos. */
  recentFeed(local: FeedItem[], n: number): FeedItem[] {
    const all = [...local.map((f) => localFeedItem(f, this.local)), ...this.recentPeerFeed];
    all.sort((a, b) => a.activity.at - b.activity.at);
    return all.slice(-n);
  }

  /** Detalhes de um agente de um par (GET /api/agents/:id no par), com os ids trazidos para cá. */
  async detail(id: string): Promise<AgentDetail | undefined> {
    const o = this.owner(id);
    if (!o) return undefined;
    const r = await fetchPeerJson(o.peer, `/api/agents/${encodeURIComponent(o.id)}`, { request: this.request });
    if (r.status !== 200 || !r.body || typeof r.body !== 'object') return undefined;
    return peerDetail(r.body as AgentDetail, { id: o.peer.id, name: o.peer.name });
  }

  /**
   * Repassa ao par dono uma ação com o id no caminho (a trava local já foi conferida em http/app.ts):
   *   GET  /api/permissions/:id, POST /api/permissions/:id/decision, GET /api/messages/:id,
   *   GET  /api/agents/:id/terminal (stream), PUT|DELETE /api/agents/:id/character, POST /api/agents/:id/stop.
   * Devolve false, sem tocar em nada, quando o id é deste computador (ou a rota não é uma destas).
   */
  forward(req: IncomingMessage, res: ServerResponse, path: string): boolean {
    const method = req.method ?? 'GET';
    let m = PERMISSION_ITEM.exec(path);
    if (m) {
      const o = this.ownerOf(m[1]);
      if (!o) return false;
      const target = `/api/permissions/${encodeURIComponent(o.id)}${m[2] ?? ''}`;
      if (m[2]) this.forwardWithBody(req, res, o.peer, target);
      else this.relay(req, res, o.peer, target, undefined, (b) => peerPermission(b as PermissionRequestInfo, this.machine(o.peer)));
      return true;
    }
    m = MESSAGE_ITEM.exec(path);
    if (m) {
      const o = this.ownerOf(m[1]);
      if (!o) return false;
      this.relay(req, res, o.peer, `/api/messages/${encodeURIComponent(o.id)}`, undefined, (b) => peerOutbox(b as OutboxMessage, this.machine(o.peer)));
      return true;
    }
    m = AGENT_ACTION.exec(path);
    if (m) {
      const o = this.ownerOf(m[1]);
      if (!o) return false;
      const target = `/api/agents/${encodeURIComponent(o.id)}/${m[2]}`;
      if (m[2] === 'takeover') {
        req.resume();
        sendJson(res, 400, { error: tr('assumir a sessão só funciona no computador onde ela roda') });
      } else if (m[2] === 'terminal') {
        if (method !== 'GET') req.resume();
        const machine = this.machine(o.peer);
        forwardStream(req, res, { peer: o.peer, method, path: target }, {
          request: this.request,
          map: (event, data) => (event === 'init' ? peerTerminalInit(data as TerminalInit, machine) : data),
        });
      } else if (method === 'PUT' || method === 'POST') this.forwardWithBody(req, res, o.peer, target);
      else this.relay(req, res, o.peer, target);
      return true;
    }
    return false;
  }

  /**
   * POST /api/messages {agentId, text} para um agente de um par (o corpo já lido pela rota): repassa com o agentId
   * original e devolve true; false = o agente é deste computador.
   */
  forwardMessage(res: ServerResponse, body: unknown): boolean {
    const b = body as { agentId?: unknown } | null;
    const o = typeof b?.agentId === 'string' ? this.owner(b.agentId) : undefined;
    if (!o) return false;
    const machine = this.machine(o.peer);
    forwardJson(res, { peer: o.peer, method: 'POST', path: '/api/messages', body: { ...(b as object), agentId: o.id } }, {
      request: this.request,
      map: (r) => peerOutbox(r as OutboxMessage, machine),
    });
    return true;
  }

  /** POST /api/rooms/rename {id, name} para uma sala de um par (o corpo já lido): como forwardMessage. */
  forwardRename(res: ServerResponse, body: unknown): boolean {
    const b = body as { id?: unknown } | null;
    const o = typeof b?.id === 'string' ? this.owner(b.id) : undefined;
    if (!o) return false;
    forwardJson(res, { peer: o.peer, method: 'POST', path: '/api/rooms/rename', body: { ...(b as object), id: o.id } }, { request: this.request });
    return true;
  }

  private machine(peer: PeerConfig): MachineRef {
    return { id: peer.id, name: peer.name };
  }

  /** owner() a partir do id ainda codificado no caminho (inválido = não é de um par). */
  private ownerOf(raw: string): { peer: PeerConfig; id: string } | undefined {
    try {
      return this.owner(decodeURIComponent(raw));
    } catch {
      return undefined;
    }
  }

  private relay(req: IncomingMessage, res: ServerResponse, peer: PeerConfig, path: string, body?: unknown, map?: (body: unknown) => unknown): void {
    if (body === undefined) req.resume();
    forwardJson(res, { peer, method: req.method ?? 'GET', path, body }, { request: this.request, map });
  }

  private forwardWithBody(req: IncomingMessage, res: ServerResponse, peer: PeerConfig, path: string): void {
    readJson(req).then(
      (body) => forwardJson(res, { peer, method: req.method ?? 'POST', path, body }, { request: this.request }),
      (err: unknown) => {
        if (res.headersSent) return;
        if (err instanceof HttpError) sendJson(res, err.status, { error: err.message });
        else sendJson(res, 500, { error: tr('erro interno') });
      },
    );
  }

  private remember(id: string): void {
    this.seenFeed.add(id);
    if (this.seenFeed.size > SEEN_FEED_MAX) {
      const first = this.seenFeed.values().next().value;
      if (first !== undefined) this.seenFeed.delete(first);
    }
  }
}

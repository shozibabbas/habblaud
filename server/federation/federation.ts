// Escritório combinado: junta o escritório local com os dos pares (HABBLAUD_PEERS) num só snapshot.
//
// O Hub (http/sse.ts) chama merge() a cada commit do Office: as salas, agentes e contas locais ganham a etiqueta da
// máquina (sem mudar de id), os dos pares ganham também o prefixo "<par>~" nos ids, e as vagas são renumeradas.
// Um par desconectado continua no escritório por OFFLINE_GRACE_MS (com o último estado conhecido) e depois sai.
import type { AccountInfo, AgentDetail, AgentInfo, FeedItem, MachineRef, MachineStatus, Notice, OfficeSnapshot } from '../../shared/types';
import { LOCAL_MACHINE, type PeerConfig } from './config';
import { localFeedItem, localRoom, peerAccount, peerAgent, peerDetail, peerFeedItem, peerNotice, peerRoom, SlotAllocator, splitId } from './merge';
import { fetchPeerJson, PeerClient, type RequestFn } from './peer';

/** Um par desconectado fica no escritório (com o último estado) por este tempo. */
export const OFFLINE_GRACE_MS = 90_000;
/** Ids de itens do feed já repassados (cada reconexão repete os recentes). */
const SEEN_FEED_MAX = 2_000;
const RECENT_FEED_MAX = 200;

export interface FederationOptions {
  machineName: string;
  peers: PeerConfig[];
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

  constructor(opts: FederationOptions) {
    this.now = opts.now ?? Date.now;
    this.request = opts.request;
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
  }

  stop(): void {
    for (const c of this.clients) c.stop();
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

  private remember(id: string): void {
    this.seenFeed.add(id);
    if (this.seenFeed.size > SEEN_FEED_MAX) {
      const first = this.seenFeed.values().next().value;
      if (first !== undefined) this.seenFeed.delete(first);
    }
  }
}

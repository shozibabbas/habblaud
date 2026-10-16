// Transmissão em tempo real (Server-Sent Events) em GET /api/stream.
// Eventos nomeados: snapshot | feed | notice (o `data` é o JSON do protocolo em shared/types.ts).
// Snapshots saem com throttle (~200 ms); feed e avisos vão em lote logo depois do snapshot.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { OfficeSnapshot } from '../../shared/types';
import { FEDERATION_HEADER } from '../federation/config';
import type { Federation } from '../federation/federation';
import type { Office } from '../model/office';
import { isLoopbackHost } from './guard';

/** Cliente lento demais (buffer acumulado acima disto) é desconectado; o EventSource reconecta. */
const MAX_BUFFERED = 8 * 1024 * 1024;

export class Hub {
  private clients = new Set<ServerResponse>();
  /**
   * Clientes que pediram só o escritório local (`?scope=local`): outro escritório combinado seguindo este. Recebem o
   * snapshot do Office sem os pares deste — senão um par apareceria duas vezes (e dois hubs se seguiriam em laço).
   */
  private localScope = new WeakSet<ServerResponse>();
  /** Último snapshot só do Office (sem a federação). */
  private lastLocal: OfficeSnapshot | null = null;
  /** Clientes que abriram a página por um Host local (os únicos que podem responder pedidos de permissão). */
  private local = new WeakSet<ServerResponse>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pinger: ReturnType<typeof setInterval> | null = null;
  private lastFlush = 0;
  private unsubscribe: (() => void) | null = null;
  private snapshotCbs = new Set<(snap: OfficeSnapshot) => void>();
  private readonly throttleMs: number;
  private readonly pingMs: number;
  /** Quem pode responder pelo escritório; padrão: Host local. A porta remota (http/remote.ts) troca a regra. */
  private readonly canAnswer: (req: IncomingMessage) => boolean;
  /** Escritório combinado (HABBLAUD_PEERS): junta os pares a cada commit. */
  private readonly federation: Federation | undefined;
  private unsubscribeFederation: (() => void) | null = null;

  constructor(
    private readonly office: Office,
    opts: { throttleMs?: number; pingMs?: number; canAnswer?: (req: IncomingMessage) => boolean; federation?: Federation } = {},
  ) {
    this.throttleMs = opts.throttleMs ?? 200;
    this.pingMs = opts.pingMs ?? 15_000;
    this.canAnswer = opts.canAnswer ?? ((req) => isLoopbackHost(req.headers.host));
    this.federation = opts.federation;
  }

  start(): void {
    this.unsubscribe = this.office.onChange(() => this.schedule());
    this.unsubscribeFederation = this.federation?.onChange(() => this.schedule()) ?? null;
    this.pinger = setInterval(() => this.writeAll(PING), this.pingMs);
    this.pinger.unref?.();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.unsubscribeFederation?.();
    this.unsubscribeFederation = null;
    if (this.timer) clearTimeout(this.timer);
    if (this.pinger) clearInterval(this.pinger);
    this.timer = null;
    this.pinger = null;
    for (const c of this.clients) c.end();
    this.clients.clear();
  }

  get size(): number {
    return this.clients.size;
  }

  /** Avisado a cada snapshot novo transmitido (ex.: o gravador da linha do tempo). */
  onSnapshot(cb: (snap: OfficeSnapshot) => void): () => void {
    this.snapshotCbs.add(cb);
    return () => void this.snapshotCbs.delete(cb);
  }

  /**
   * Páginas conectadas por um Host local (localhost/127.x): quem pode responder pelo escritório. O stream de um
   * escritório combinado (FEDERATION_HEADER) não conta: ele informa à parte quem olha por lá (federation/presence.ts).
   */
  get localSize(): number {
    let n = 0;
    for (const c of this.clients) if (this.local.has(c) && !c.destroyed && !c.writableEnded) n++;
    return n;
  }

  /** Conecta um cliente: snapshot completo + últimos 50 itens do feed, depois o fluxo ao vivo. */
  attach(req: IncomingMessage, res: ServerResponse, opts: { localScope?: boolean } = {}): void {
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const local = !!opts.localScope && !!this.federation;
    const snapshot = local ? this.currentLocal() : this.current();
    res.write('retry: 2000\n\n');
    res.write(frame('snapshot', snapshot));
    res.write(frame('feed', this.federation && !local ? this.federation.recentFeed(this.office.recentFeed(50), 50) : this.office.recentFeed(50)));
    this.clients.add(res);
    if (local) this.localScope.add(res);
    if (this.canAnswer(req) && !req.headers[FEDERATION_HEADER]) this.local.add(res);
    const drop = () => this.clients.delete(res);
    req.on('close', drop);
    res.on('close', drop);
    res.on('error', drop);
  }

  /** Fecha a revisão agora e transmite o que houver. Devolve o snapshot atual. */
  flush(): OfficeSnapshot {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.lastFlush = Date.now();
    const raw = this.office.commit();
    this.lastLocal = raw.snapshot;
    const r = this.combine(raw);
    if (this.federation) {
      // quem segue só o local recebe o Office puro
      if (raw.changed) this.writeAll(frame('snapshot', raw.snapshot), true);
      if (raw.feed.length) this.writeAll(frame('feed', raw.feed), true);
      for (const n of raw.notices) this.writeAll(frame('notice', n), true);
    }
    if (r.changed) {
      this.writeAll(frame('snapshot', r.snapshot));
      for (const cb of this.snapshotCbs) {
        try {
          cb(r.snapshot);
        } catch {
          // quem escuta não atrapalha a transmissão
        }
      }
    }
    if (r.feed.length) this.writeAll(frame('feed', r.feed));
    for (const n of r.notices) this.writeAll(frame('notice', n));
    return r.snapshot;
  }

  /** Com o escritório combinado, junta os pares ao commit do Office (snapshot, feed e avisos). */
  private combine(r: ReturnType<Office['commit']>): ReturnType<Office['commit']> {
    const fed = this.federation;
    if (!fed) return r;
    const merged = fed.merge(r.snapshot, r.changed);
    return { ...r, changed: merged.changed, snapshot: merged.snapshot, feed: fed.mergeFeed(r.feed), notices: fed.mergeNotices(r.notices) };
  }

  /** Snapshot atual (depois de transmitir o que estiver pendente), com `serverTime` de agora. */
  current(): OfficeSnapshot {
    return { ...this.flush(), serverTime: Date.now() };
  }

  /** Snapshot só do escritório local (sem os pares), para outro escritório combinado (`?scope=local`). */
  currentLocal(): OfficeSnapshot {
    const merged = this.flush();
    return { ...(this.lastLocal ?? merged), serverTime: Date.now() };
  }

  private schedule(): void {
    if (this.timer) return;
    const wait = Math.max(0, this.lastFlush + this.throttleMs - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, wait);
    this.timer.unref?.();
  }

  /** Escreve para os clientes do escopo pedido: `localScope` true = só os que seguem o local; false = os demais. */
  private writeAll(chunk: string, localScope = false): void {
    for (const c of this.clients) {
      if (this.localScope.has(c) !== localScope && chunk !== PING) continue;
      if (c.destroyed || c.writableEnded) {
        this.clients.delete(c);
        continue;
      }
      if (c.writableLength > MAX_BUFFERED) {
        this.clients.delete(c);
        c.destroy();
        continue;
      }
      c.write(chunk);
    }
  }
}

const PING = ': ping\n\n';

export function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Escritório combinado: a conexão com um par (outro Habblaud). Segue o GET /api/stream dele (SSE) e guarda o último
// snapshot, os itens novos do feed e os avisos; reconecta sozinho, com espera crescente.
//
// O pedido sai com `Host: localhost`: o par só libera terminal, respostas e mensagens para o próprio computador, e é
// assim que ele o enxerga através de um túnel (ssh -L) até o loopback dele.
import { request as httpRequest, type ClientRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { FeedItem, Notice, OfficeSnapshot } from '../../shared/types';
import { FEDERATION_HEADER, type PeerConfig } from './config';

/** Sem nada do par (nem o ping de 15 s) por este tempo: a conexão é dada como morta e refeita. */
const STALL_MS = 45_000;
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;
/** Teto de um evento SSE (um snapshot grande cabe com folga). */
const MAX_EVENT_BYTES = 32 * 1024 * 1024;

export type RequestFn = (url: URL, opts: RequestOptions, cb: (res: IncomingMessage) => void) => ClientRequest;

export const defaultRequest: RequestFn = (url, opts, cb) => (url.protocol === 'https:' ? httpsRequest(url, opts, cb) : httpRequest(url, opts, cb));

/** Cabeçalhos de todo pedido a um par. */
export function peerHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Host: 'localhost', 'User-Agent': 'habblaud-federation', [FEDERATION_HEADER]: '1', ...extra };
}

export interface PeerState {
  online: boolean;
  since: number;
  error?: string;
}

export class PeerClient {
  snapshot: OfficeSnapshot | undefined;
  state: PeerState;
  private feed: FeedItem[] = [];
  private notices: Notice[] = [];
  private req: ClientRequest | undefined;
  private retryMs = RETRY_MIN_MS;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private stallTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private readonly onChange: () => void;
  private readonly request: RequestFn;
  private readonly now: () => number;

  constructor(
    readonly config: PeerConfig,
    opts: { onChange: () => void; request?: RequestFn; now?: () => number },
  ) {
    this.onChange = opts.onChange;
    this.request = opts.request ?? defaultRequest;
    this.now = opts.now ?? Date.now;
    this.state = { online: false, since: this.now() };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.retryTimer = this.stallTimer = undefined;
    this.req?.destroy();
    this.req = undefined;
  }

  /** Itens do feed chegados desde a última chamada. */
  drainFeed(): FeedItem[] {
    const out = this.feed;
    this.feed = [];
    return out;
  }

  /** Avisos chegados desde a última chamada. */
  drainNotices(): Notice[] {
    const out = this.notices;
    this.notices = [];
    return out;
  }

  private setState(online: boolean, error?: string): void {
    if (this.state.online === online && this.state.error === error) return;
    const since = this.state.online === online ? this.state.since : this.now();
    this.state = { online, since, ...(error ? { error } : {}) };
    this.onChange();
  }

  private connect(): void {
    if (this.stopped) return;
    // só o escritório do par, sem os pares dele (um par que também é escritório combinado não se repete aqui, e dois
    // escritórios combinados podem seguir um ao outro sem laço)
    const url = new URL('/api/stream?scope=local', this.config.url);
    let req: ClientRequest;
    try {
      req = this.request(url, { method: 'GET', headers: peerHeaders({ Accept: 'text/event-stream' }) }, (res) => this.onResponse(req, res));
    } catch (err) {
      this.fail(String((err as Error).message ?? err));
      return;
    }
    this.req = req;
    req.on('error', (err) => {
      if (this.req === req) this.fail(err.message);
    });
    req.end();
    this.armStall(req);
  }

  private onResponse(req: ClientRequest, res: IncomingMessage): void {
    if (this.req !== req) return void res.resume();
    if (res.statusCode !== 200) {
      res.resume();
      this.fail(`HTTP ${res.statusCode}`);
      return;
    }
    res.setEncoding('utf8');
    let buf = '';
    res.on('data', (chunk: string) => {
      if (this.req !== req) return;
      this.armStall(req);
      buf += chunk;
      if (buf.length > MAX_EVENT_BYTES) {
        this.fail('evento grande demais');
        return;
      }
      let sep: number;
      while ((sep = buf.search(/\r?\n\r?\n/)) >= 0) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + (buf[sep] === '\r' ? 4 : 2));
        this.onEvent(block);
      }
    });
    res.on('end', () => {
      if (this.req === req) this.fail('conexão encerrada pelo par');
    });
    res.on('error', (err) => {
      if (this.req === req) this.fail(err.message);
    });
  }

  private onEvent(block: string): void {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) continue;
      const i = line.indexOf(':');
      const field = i < 0 ? line : line.slice(0, i);
      const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (!data.length) return;
    let payload: unknown;
    try {
      payload = JSON.parse(data.join('\n'));
    } catch {
      return;
    }
    if (event === 'snapshot' && isSnapshot(payload)) {
      this.snapshot = payload;
      this.retryMs = RETRY_MIN_MS;
      this.setState(true);
      this.onChange();
    } else if (event === 'feed' && Array.isArray(payload)) {
      // O primeiro feed de cada conexão repete os itens recentes: só entra o que ainda não veio.
      this.feed.push(...(payload as FeedItem[]));
      this.onChange();
    } else if (event === 'notice' && payload && typeof payload === 'object') {
      this.notices.push(payload as Notice);
      this.onChange();
    }
  }

  private armStall(req: ClientRequest): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = setTimeout(() => {
      if (this.req === req) this.fail('sem resposta do par');
    }, STALL_MS);
    this.stallTimer.unref?.();
  }

  private fail(error: string): void {
    this.req?.destroy();
    this.req = undefined;
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = undefined;
    this.setState(false, error);
    if (this.stopped) return;
    const wait = this.retryMs;
    this.retryMs = Math.min(RETRY_MAX_MS, this.retryMs * 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.connect();
    }, wait);
    this.retryTimer.unref?.();
  }
}

function isSnapshot(v: unknown): v is OfficeSnapshot {
  const s = v as OfficeSnapshot | null;
  return !!s && typeof s === 'object' && Array.isArray(s.rooms) && Array.isArray(s.agents) && Array.isArray(s.accounts) && !!s.meta;
}

/** Pedido JSON a um par (GET dos detalhes de um agente, POST da presença...), com prazo. */
export function fetchPeerJson(
  peer: PeerConfig,
  path: string,
  opts: { request?: RequestFn; timeoutMs?: number; method?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const request = opts.request ?? defaultRequest;
  const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const headers = peerHeaders({
    Accept: 'application/json',
    ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(data)) }),
  });
  return new Promise((resolve, reject) => {
    const url = new URL(path, peer.url);
    const req = request(url, { method: opts.method ?? 'GET', headers }, (res) => {
      res.setEncoding('utf8');
      let raw = '';
      res.on('data', (c: string) => {
        raw += c;
        if (raw.length > MAX_EVENT_BYTES) req.destroy(new Error('resposta grande demais'));
      });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 502, body: raw ? JSON.parse(raw) : undefined });
        } catch {
          reject(new Error('resposta inválida do par'));
        }
      });
      res.on('error', reject);
    });
    req.setTimeout(opts.timeoutMs ?? 5_000, () => req.destroy(new Error('o par não respondeu a tempo')));
    req.on('error', reject);
    req.end(data);
  });
}

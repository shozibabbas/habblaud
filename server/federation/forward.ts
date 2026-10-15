// Escritório combinado: repassa ao par dono as ações sobre o que é dele (agentes, salas, pedidos, mensagens).
//
// A trava local (recurso ligado, Host local ou o que HABBLAUD_REMOTE_ALLOW liberar) é conferida em http/app.ts ANTES,
// exatamente como para os agentes deste computador. Aqui o pedido sai para o par com o mesmo método, o caminho e o
// corpo JSON com os ids originais (sem o "<par>~") e `Host: localhost` (o par só libera essas rotas para o próprio
// computador, e é assim que ele enxerga o túnel). Na volta, os ids da resposta ganham o prefixo de novo; um stream SSE
// é repassado evento a evento e o pedido ao par fecha junto com a página.
import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http';
import { tr } from '../../shared/i18n';
import { sendJson } from '../http/app';
import type { PeerConfig } from './config';
import { defaultRequest, peerHeaders, type RequestFn } from './peer';

/** Prazo de uma ação repassada (resposta inteira) e da abertura de um stream (até os cabeçalhos). */
export const FORWARD_TIMEOUT_MS = 10_000;
/** Teto da resposta de uma ação repassada. */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
/** Teto de um evento do stream repassado. */
const MAX_EVENT_BYTES = 8 * 1024 * 1024;

export interface ForwardTarget {
  peer: PeerConfig;
  method: string;
  /** Caminho no par, já com o id original. */
  path: string;
  /** Corpo JSON, já com os ids originais (ausente = sem corpo). */
  body?: unknown;
}

export interface ForwardOptions {
  request?: RequestFn;
  timeoutMs?: number;
}

function unreachable(res: ServerResponse, err: unknown): void {
  if (res.headersSent) return void res.destroy();
  sendJson(res, 502, { error: tr('a máquina do agente não respondeu ({0})', [String((err as Error)?.message ?? err)]) });
}

function open(t: ForwardTarget, accept: string, request: RequestFn, cb: (up: IncomingMessage) => void): ClientRequest {
  const data = t.body === undefined ? undefined : JSON.stringify(t.body);
  // O guard do par exige JSON em tudo o que não é leitura, mesmo sem corpo (DELETE).
  const read = t.method === 'GET' || t.method === 'HEAD';
  const headers = peerHeaders({
    Accept: accept,
    ...(read ? {} : { 'Content-Type': 'application/json', 'Content-Length': String(data === undefined ? 0 : Buffer.byteLength(data)) }),
  });
  const req = request(new URL(t.path, t.peer.url), { method: t.method, headers }, cb);
  req.end(data);
  return req;
}

/** Lê a resposta inteira do par (com teto). */
function readAll(up: IncomingMessage, onDone: (raw: string) => void, onFail: (err: Error) => void): void {
  const chunks: Buffer[] = [];
  let size = 0;
  up.on('data', (c: Buffer) => {
    size += c.length;
    if (size > MAX_RESPONSE_BYTES) return void up.destroy(new Error('resposta grande demais'));
    chunks.push(c);
  });
  up.on('end', () => onDone(Buffer.concat(chunks).toString('utf8')));
  up.on('error', onFail);
}

/** Devolve à página a resposta JSON do par (mesmo status); `map` traz os ids das respostas de sucesso para cá. */
function relayJson(res: ServerResponse, status: number, raw: string, map?: (body: unknown) => unknown): void {
  if (!raw.trim()) {
    res.writeHead(status, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJson(res, 502, { error: tr('resposta inválida da máquina do agente') });
    return;
  }
  sendJson(res, status, map && status >= 200 && status < 300 ? map(body) : body);
}

/**
 * Repassa uma ação ao par e devolve a resposta JSON dele. A ação vai até o fim mesmo que a página feche antes (uma
 * decisão já enviada não deve se perder no meio do caminho).
 */
export function forwardJson(res: ServerResponse, t: ForwardTarget, opts: ForwardOptions & { map?: (body: unknown) => unknown } = {}): void {
  let done = false;
  const fail = (err: unknown) => {
    if (done) return;
    done = true;
    unreachable(res, err);
  };
  let req: ClientRequest;
  try {
    req = open(t, 'application/json', opts.request ?? defaultRequest, (up) =>
      readAll(
        up,
        (raw) => {
          if (done) return;
          done = true;
          relayJson(res, up.statusCode ?? 502, raw, opts.map);
        },
        fail,
      ),
    );
  } catch (err) {
    return fail(err);
  }
  req.setTimeout(opts.timeoutMs ?? FORWARD_TIMEOUT_MS, () => req.destroy(new Error('o par não respondeu a tempo')));
  req.on('error', fail);
}

/**
 * Repassa um stream SSE do par (ex.: o terminal de um agente). `map` reescreve o `data` de cada evento (JSON); o
 * resto (comentários, `retry:`) passa como veio. Erro antes do stream: a resposta JSON do par, com o mesmo status.
 */
export function forwardStream(
  req: IncomingMessage,
  res: ServerResponse,
  t: ForwardTarget,
  opts: ForwardOptions & { map?: (event: string, data: unknown) => unknown } = {},
): void {
  let up: ClientRequest;
  let streaming = false;
  const close = () => up?.destroy();
  const fail = (err: unknown) => {
    if (streaming) return void res.end();
    if (!res.writableEnded) unreachable(res, err);
  };
  try {
    up = open(t, 'text/event-stream', opts.request ?? defaultRequest, (upRes) => {
      const status = upRes.statusCode ?? 502;
      if (status !== 200 || !/^text\/event-stream/i.test(String(upRes.headers['content-type'] ?? ''))) {
        readAll(upRes, (raw) => !res.writableEnded && relayJson(res, status, raw), fail);
        return;
      }
      streaming = true;
      up.setTimeout(0);
      req.socket.setTimeout(0);
      req.socket.setNoDelay(true);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      upRes.setEncoding('utf8');
      let buf = '';
      upRes.on('data', (chunk: string) => {
        buf += chunk;
        if (buf.length > MAX_EVENT_BYTES) return void upRes.destroy(new Error('evento grande demais'));
        let sep: number;
        while ((sep = buf.search(/\r?\n\r?\n/)) >= 0) {
          const block = buf.slice(0, sep);
          buf = buf.slice(sep + (buf[sep] === '\r' ? 4 : 2));
          if (!res.writableEnded) res.write(rewriteEvent(block, opts.map));
        }
      });
      upRes.on('end', () => res.end());
      upRes.on('error', () => res.end());
    });
  } catch (err) {
    return fail(err);
  }
  up.setTimeout(opts.timeoutMs ?? FORWARD_TIMEOUT_MS, () => up.destroy(new Error('o par não respondeu a tempo')));
  up.on('error', fail);
  // A página fechou o stream: fecha também o do par.
  req.on('close', close);
  res.on('close', close);
}

/** Um bloco SSE com o `data` reescrito por `map` (blocos sem `data` JSON passam como vieram). */
export function rewriteEvent(block: string, map?: (event: string, data: unknown) => unknown): string {
  if (!map) return `${block}\n\n`;
  let event = 'message';
  const data: string[] = [];
  const other: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    const i = line.indexOf(':');
    const field = i < 0 ? line : line.slice(0, i);
    const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
    if (field === 'data') data.push(value);
    else {
      if (field === 'event') event = value;
      other.push(line);
    }
  }
  if (!data.length) return `${block}\n\n`;
  let payload: unknown;
  try {
    payload = JSON.parse(data.join('\n'));
  } catch {
    return `${block}\n\n`;
  }
  return `${[...other, `data: ${JSON.stringify(map(event, payload))}`].join('\n')}\n\n`;
}

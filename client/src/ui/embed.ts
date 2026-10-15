// Modo embutido (?embed=1): a página dentro de um iframe de outra página (um painel com vários escritórios).
// Dois estados: compacto (só o escritório, sem barra superior, lista lateral, feed nem avisos de versão) e completo
// (a interface normal). A página de fora troca o estado e pede a visão geral por postMessage; esta página manda de
// volta um resumo só com números (nada de nomes, pastas ou textos das conversas).
//
// Protocolo (as mensagens de fora só valem vindas de window.parent):
//   fora -> aqui:  {type:'habblaud:embed', compact:boolean}   {type:'habblaud:overview'}
//   aqui -> fora:  {type:'habblaud:ready'} (uma vez)   {type:'habblaud:summary', rooms, agents, working, subagents,
//                  needsYou, shells, connection} (ao carregar, a cada mudança no máximo 1/s, na hora quando o
//                  "precisa de você" muda, e a cada 5 s mesmo sem mudança, para a página de fora saber que está viva)
import type { OfficeSnapshot } from '../../../shared/types';
import type { ConnectionState, OfficeStore } from '../net/store';
import { computeCounters } from './model';

/** No máximo um resumo por este intervalo (o "precisa de você" passa na frente). */
export const SUMMARY_MIN_MS = 1_000;
/** Resumo repetido mesmo sem mudança: a página de fora considera o escritório perdido sem notícias por 15 s. */
export const SUMMARY_HEARTBEAT_MS = 5_000;

export interface EmbedSummary {
  type: 'habblaud:summary';
  rooms: number;
  agents: number;
  working: number;
  subagents: number;
  /** Agentes esperando você (permissão, pergunta ou fim de turno). */
  needsYou: number;
  shells: number;
  connection: ConnectionState;
}

export type EmbedCommand = { type: 'habblaud:embed'; compact: boolean } | { type: 'habblaud:overview' };

/** A página foi aberta para ser embutida (?embed=1). */
export function embedRequested(search: string): boolean {
  return new URLSearchParams(search).get('embed') === '1';
}

/** Resumo do escritório para a página de fora: os mesmos contadores da barra superior. */
export function embedSummary(snap: Pick<OfficeSnapshot, 'rooms' | 'agents'> | null, connection: ConnectionState, now: number): EmbedSummary {
  const c = computeCounters(snap, now);
  return { type: 'habblaud:summary', rooms: c.rooms, agents: c.agents, working: c.working, subagents: c.subagents, needsYou: c.waiting, shells: c.shells, connection };
}

/** Comando da página de fora; qualquer outra coisa (inclusive mensagens malformadas) vira null. */
export function parseEmbedCommand(data: unknown): EmbedCommand | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { type?: unknown; compact?: unknown };
  if (d.type === 'habblaud:embed' && typeof d.compact === 'boolean') return { type: 'habblaud:embed', compact: d.compact };
  if (d.type === 'habblaud:overview') return { type: 'habblaud:overview' };
  return null;
}

function sameSummary(a: EmbedSummary | null, b: EmbedSummary): boolean {
  return !!a && a.rooms === b.rooms && a.agents === b.agents && a.working === b.working && a.subagents === b.subagents && a.needsYou === b.needsYou && a.shells === b.shells && a.connection === b.connection;
}

export interface EmbedBridgeOptions {
  store: OfficeStore;
  /** Relógio do servidor (o mesmo da barra superior). */
  now(): number;
  onCompact(compact: boolean): void;
  onOverview(): void;
  /** Para os testes; padrão: window. */
  win?: Window;
}

/** Ponte com a página de fora (só faz algo dentro de um iframe). */
export class EmbedBridge {
  private win: Window;
  private last: EmbedSummary | null = null;
  private lastAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: EmbedBridgeOptions) {
    this.win = opts.win ?? window;
    if (!this.framed) return;
    this.win.addEventListener('message', (e) => this.onMessage(e));
    opts.store.on('snapshot', () => this.schedule());
    opts.store.on('connection', () => this.schedule());
    setInterval(() => this.send(), SUMMARY_HEARTBEAT_MS);
  }

  private get framed(): boolean {
    return this.win.parent !== this.win;
  }

  /** A interface está montada: avisa a página de fora e manda o primeiro resumo. */
  ready(): void {
    if (!this.framed) return;
    this.post({ type: 'habblaud:ready' });
    this.send();
  }

  private onMessage(e: MessageEvent): void {
    if (e.source !== this.win.parent) return;
    const cmd = parseEmbedCommand(e.data);
    if (cmd?.type === 'habblaud:embed') this.opts.onCompact(cmd.compact);
    else if (cmd?.type === 'habblaud:overview') this.opts.onOverview();
  }

  private current(): EmbedSummary {
    const { store } = this.opts;
    // No timelapse a tela mostra o dia reproduzido; o resumo é sempre o de agora.
    return embedSummary(store.liveSnapshot, store.connection, store.replaying ? Date.now() : this.opts.now());
  }

  /** Mudou algo: manda já se o "precisa de você" mudou; senão respeita o intervalo mínimo. */
  private schedule(): void {
    const next = this.current();
    if (sameSummary(this.last, next)) return;
    const wait = this.lastAt + SUMMARY_MIN_MS - Date.now();
    if (next.needsYou !== this.last?.needsYou || wait <= 0) return this.send(next);
    this.timer ??= setTimeout(() => this.send(), wait);
  }

  private send(summary = this.current()): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.last = summary;
    this.lastAt = Date.now();
    this.post(summary);
  }

  private post(msg: object): void {
    try {
      // '*': o resumo não tem nada sensível, e a origem da página de fora varia (túneis, portas).
      this.win.parent.postMessage(msg, '*');
    } catch {
      // Página de fora indisponível: o próximo resumo tenta de novo.
    }
  }
}

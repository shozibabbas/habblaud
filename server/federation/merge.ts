// Escritório combinado: funções puras que trazem o estado de um par para o escritório local.
// Os ids do par ganham o prefixo "<par>~" (agentes, salas, contas, atividades, avisos), as salas e contas ganham a
// etiqueta da máquina no nome e as vagas (slot) são renumeradas para todas as salas caberem no mesmo prédio.
import type {
  AccountInfo,
  AgentDetail,
  AgentInfo,
  FeedItem,
  MachineRef,
  Notice,
  OutboxMessage,
  PermissionRequestInfo,
  RoomInfo,
  TerminalInit,
} from '../../shared/types';
import { PEER_SEP } from './config';

export function prefixId(peer: string, id: string): string {
  return `${peer}${PEER_SEP}${id}`;
}

/** "par~id" -> { peer, id }; undefined para ids locais. */
export function splitId(id: string): { peer: string; id: string } | undefined {
  const i = id.indexOf(PEER_SEP);
  if (i <= 0) return undefined;
  return { peer: id.slice(0, i), id: id.slice(i + 1) };
}

export function tagName(machine: MachineRef, name: string): string {
  return `${machine.name} · ${name}`;
}

export function peerRoom(r: RoomInfo, m: MachineRef): RoomInfo {
  return { ...r, id: prefixId(m.id, r.id), name: tagName(m, r.name), baseName: r.name, machine: m };
}

export function localRoom(r: RoomInfo, m: MachineRef): RoomInfo {
  return { ...r, name: tagName(m, r.name), baseName: r.name, machine: m };
}

function prefixActivityId<T extends { id: string }>(peer: string, a: T): T {
  return { ...a, id: prefixId(peer, a.id) };
}

export function peerAgent(a: AgentInfo, m: MachineRef): AgentInfo {
  const p = m.id;
  return {
    ...a,
    id: prefixId(p, a.id),
    parentId: a.parentId === undefined ? undefined : prefixId(p, a.parentId),
    roomId: prefixId(p, a.roomId),
    account: prefixId(p, a.account),
    activity: a.activity && prefixActivityId(p, a.activity),
    recent: a.recent.map((x) => prefixActivityId(p, x)),
    permission: a.permission && peerPermission(a.permission, m),
    machine: m,
  };
}

/** Pedido de permissão do par (no snapshot e em GET /api/permissions/:id): a decisão volta pelo id prefixado. */
export function peerPermission(p: PermissionRequestInfo, m: MachineRef): PermissionRequestInfo {
  return { ...p, id: prefixId(m.id, p.id) };
}

/** Mensagem mandada a um agente do par (POST /api/messages, GET /api/messages/:id): a situação volta pelo id prefixado. */
export function peerOutbox(o: OutboxMessage, m: MachineRef): OutboxMessage {
  return { ...o, id: prefixId(m.id, o.id), agentId: prefixId(m.id, o.agentId) };
}

/** Evento `init` do terminal de um agente do par. */
export function peerTerminalInit(t: TerminalInit, m: MachineRef): TerminalInit {
  return { ...t, agentId: prefixId(m.id, t.agentId) };
}

export function peerAccount(acc: AccountInfo, m: MachineRef): AccountInfo {
  return { ...acc, id: prefixId(m.id, acc.id), name: tagName(m, acc.name), machine: m };
}

export function peerFeedItem(f: FeedItem, m: MachineRef): FeedItem {
  const p = m.id;
  return {
    ...f,
    id: prefixId(p, f.id),
    agentId: prefixId(p, f.agentId),
    roomId: prefixId(p, f.roomId),
    roomName: tagName(m, f.roomName),
    account: f.account === undefined ? undefined : prefixId(p, f.account),
    activity: prefixActivityId(p, f.activity),
  };
}

export function localFeedItem(f: FeedItem, m: MachineRef): FeedItem {
  return { ...f, roomName: tagName(m, f.roomName) };
}

export function peerNotice(n: Notice, m: MachineRef): Notice {
  const p = m.id;
  return {
    ...n,
    id: prefixId(p, n.id),
    agentId: n.agentId === undefined ? undefined : prefixId(p, n.agentId),
    roomId: n.roomId === undefined ? undefined : prefixId(p, n.roomId),
    text: `${m.name}: ${n.text}`,
  };
}

export function peerDetail(d: AgentDetail, m: MachineRef): AgentDetail {
  return { agent: peerAgent(d.agent, m), history: d.history.map((x) => prefixActivityId(m.id, x)) };
}

/**
 * Vagas das salas no prédio combinado: cada sala mantém a sua enquanto existir; sala nova pega a menor vaga livre
 * (uma vaga liberada espera `cooldownMs` antes de ser reaproveitada, como no Office, para a sala que saiu poder
 * apagar as luzes antes de outra montar no lugar).
 */
export class SlotAllocator {
  private slots = new Map<string, number>();
  private released = new Map<number, number>();

  constructor(private readonly cooldownMs = 20_000) {}

  /** Atribui as vagas na ordem dada (a de chegada: quem já tinha vaga mantém). */
  assign(rooms: RoomInfo[], now: number): RoomInfo[] {
    const present = new Set(rooms.map((r) => r.id));
    for (const [id, slot] of this.slots) {
      if (!present.has(id)) {
        this.slots.delete(id);
        this.released.set(slot, now);
      }
    }
    for (const [slot, at] of this.released) if (now - at >= this.cooldownMs) this.released.delete(slot);
    const used = new Set(this.slots.values());
    return rooms.map((r) => {
      let slot = this.slots.get(r.id);
      if (slot === undefined) {
        slot = 0;
        while (used.has(slot) || this.released.has(slot)) slot++;
        this.slots.set(r.id, slot);
        used.add(slot);
      }
      return slot === r.slot ? r : { ...r, slot };
    });
  }
}

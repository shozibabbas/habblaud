// Escritório combinado: configuração dos pares (outros Habblauds que este junta no próprio escritório).
//
// HABBLAUD_PEERS="servidor1=http://127.0.0.1:4801, notebook=http://host.docker.internal:4802"
//   - id: letras minúsculas, números e '-' (vira o prefixo dos ids: "servidor1~.claude:123");
//   - url: http(s)://host[:porta] do Habblaud do par, sem caminho. Use um túnel até o loopback do par (ssh -L): é por
//     lá que o par libera terminal, respostas e mensagens.
// HABBLAUD_MACHINE_NAME: nome deste computador no escritório combinado (padrão: o hostname, sem o domínio).
import { hostname } from 'node:os';

export interface PeerConfig {
  id: string;
  /** Nome exibido (o próprio id). */
  name: string;
  /** Origem do Habblaud do par, sem barra no fim. */
  url: string;
}

export interface PeersParse {
  peers: PeerConfig[];
  invalid: string[];
}

/** Separador entre o id do par e o id original (agentes, salas, contas). Nunca aparece nos ids do Habblaud. */
export const PEER_SEP = '~';
/** Id da máquina local no escritório combinado. */
export const LOCAL_MACHINE = 'local';

const PEER_ID = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export function parsePeers(raw: string | undefined): PeersParse {
  const peers: PeerConfig[] = [];
  const invalid: string[] = [];
  for (const item of (raw ?? '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)) {
    const eq = item.indexOf('=');
    const id = eq > 0 ? item.slice(0, eq).trim().toLowerCase() : '';
    const url = eq > 0 ? normalizeOrigin(item.slice(eq + 1).trim()) : undefined;
    if (!id || !PEER_ID.test(id) || id === LOCAL_MACHINE || !url || peers.some((p) => p.id === id)) {
      invalid.push(item);
      continue;
    }
    peers.push({ id, name: id, url });
  }
  return { peers, invalid };
}

/** "http://host:porta" sem caminho, query nem credenciais; undefined se não for isso. */
export function normalizeOrigin(raw: string): string | undefined {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
  if (u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return undefined;
  return u.origin;
}

export function machineName(env: NodeJS.ProcessEnv = process.env, host: () => string = hostname): string {
  const explicit = env.HABBLAUD_MACHINE_NAME?.trim();
  if (explicit) return explicit.slice(0, 32);
  const h = (() => {
    try {
      return host();
    } catch {
      return '';
    }
  })();
  return (h.split('.')[0] || 'local').slice(0, 32);
}

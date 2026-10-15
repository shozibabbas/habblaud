// Escritório combinado: quem olha este escritório por outra máquina.
//
// O pedido de permissão só é desviado do terminal quando há alguém para responder (PermissionRegistry.viewers). O
// stream que um escritório combinado segue não conta como página aberta (FEDERATION_HEADER); em vez disso, ele informa
// a cada PRESENCE_SEND_MS quantas páginas locais tem abertas (POST /api/federation/presence {from, viewers}), e cada
// informe vale por PRESENCE_TTL_MS. Quem olha aqui = as páginas locais + os informes ainda válidos.

/** Um informe vale por este tempo (o escritório combinado reenvia bem antes). */
export const PRESENCE_TTL_MS = 30_000;
/** O escritório combinado reenvia o informe pelo menos a cada... */
export const PRESENCE_SEND_MS = 10_000;
/** ...e confere a contagem local a cada (mudou: informa na hora). */
export const PRESENCE_CHECK_MS = 2_000;
/** Escritórios combinados acompanhados ao mesmo tempo (os mais antigos saem). */
const MAX_REPORTERS = 32;
const MAX_VIEWERS = 1_000;

export interface PresenceReport {
  /** Id do escritório combinado que informa (sorteado a cada início). */
  from: string;
  viewers: number;
}

/** Corpo de POST /api/federation/presence; undefined se fora do formato. */
export function parsePresence(body: unknown): PresenceReport | undefined {
  const b = body as { from?: unknown; viewers?: unknown } | null;
  if (!b || typeof b !== 'object') return undefined;
  if (typeof b.from !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(b.from)) return undefined;
  if (typeof b.viewers !== 'number' || !Number.isInteger(b.viewers) || b.viewers < 0 || b.viewers > MAX_VIEWERS) return undefined;
  return { from: b.from, viewers: b.viewers };
}

export class RemotePresence {
  private reports = new Map<string, { viewers: number; at: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  report(r: PresenceReport): void {
    this.reports.delete(r.from);
    this.reports.set(r.from, { viewers: r.viewers, at: this.now() });
    if (this.reports.size > MAX_REPORTERS) {
      const first = this.reports.keys().next().value;
      if (first !== undefined) this.reports.delete(first);
    }
  }

  /** Páginas abertas noutras máquinas, pelos informes ainda válidos. */
  count(): number {
    const now = this.now();
    let n = 0;
    for (const [from, r] of this.reports) {
      if (now - r.at > PRESENCE_TTL_MS) this.reports.delete(from);
      else n += r.viewers;
    }
    return n;
  }
}

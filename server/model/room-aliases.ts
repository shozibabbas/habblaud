// Nomes de sala escolhidos pelo usuário (botão direito > Renomear), persistidos por pasta em <dataDir>/rooms.json.
// Sem apelido, a sala usa o nome da pasta (model/rooms.ts roomDisplayNames); `defaults` dá nomes fixos a pastas
// conhecidas (a pasta de assets aparece como "Arquiteto"). As salas de sessão (HABBLAUD_ROOMS=auto/session, id
// "<pasta>#<sessão>") guardam o apelido pelo id da sala, em `sessions`, com a data do último uso: como os nomes de
// names.json, o que fica 60 dias sem aparecer some (a sessão acabou; o apelido da pasta não expira).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { errMsg, log } from '../log';
import { tr } from '../../shared/i18n';

export const ROOM_NAME_MAX = 40;
/** Apelido de sala de sessão sem uso há mais que isto é esquecido (o mesmo prazo dos nomes em names.json). */
export const SESSION_ALIAS_MAX_AGE_MS = 60 * 24 * 3_600_000;
const SESSION_ALIAS_MAX = 500;
/** O último uso de um apelido de sessão só é regravado depois disto (a sala o consulta a cada mudança de nome). */
const SESSION_TOUCH_MS = 24 * 3_600_000;

interface SessionAlias {
  name: string;
  /** Último uso (renomear ou a sala presente), para a expiração. */
  at: number;
}

/** Chave comparável de um caminho (barras normais, sem barra final, sem diferença de maiúsculas). */
export function pathKey(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export class RoomAliases {
  private aliases = new Map<string, string>();
  private sessions = new Map<string, SessionAlias>();
  private readonly defaults = new Map<string, string>();

  /** `file` null = só em memória (testes). */
  constructor(
    private readonly file: string | null,
    private readonly now: () => number = Date.now,
  ) {}

  load(): void {
    if (!this.file) return;
    try {
      const j = JSON.parse(readFileSync(this.file, 'utf8')) as { aliases?: Record<string, unknown>; sessions?: Record<string, unknown> };
      for (const [k, v] of Object.entries(j.aliases ?? {})) if (typeof v === 'string' && v.trim()) this.aliases.set(pathKey(k), v.trim().slice(0, ROOM_NAME_MAX));
      const now = this.now();
      for (const [k, v] of Object.entries(j.sessions && typeof j.sessions === 'object' ? j.sessions : {})) {
        const e = v as Partial<SessionAlias> | null;
        if (typeof e?.name !== 'string' || !e.name.trim() || typeof e.at !== 'number' || now - e.at >= SESSION_ALIAS_MAX_AGE_MS) continue;
        this.sessions.set(k, { name: e.name.trim().slice(0, ROOM_NAME_MAX), at: e.at });
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.warn(tr('rooms.json ilegível ({0}); sem nomes de sala personalizados.', [errMsg(err)]));
    }
  }

  /** Nome fixo para uma pasta quando o usuário não escolheu outro. */
  setDefault(path: string, name: string): void {
    this.defaults.set(pathKey(path), name);
  }

  get(path: string): string | undefined {
    const k = pathKey(path);
    return this.aliases.get(k) ?? this.defaults.get(k);
  }

  /** Define o nome da sala da pasta; vazio volta ao padrão. Devolve o nome em uso. */
  set(path: string, name: string): string | undefined {
    const k = pathKey(path);
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, ROOM_NAME_MAX);
    if (clean) this.aliases.set(k, clean);
    else this.aliases.delete(k);
    this.save();
    return this.get(path);
  }

  /** Apelido da sala de sessão `roomId` (o id inteiro, "<pasta>#<sessão>"). Consultar conta como uso: renova a expiração. */
  getSession(roomId: string): string | undefined {
    const e = this.sessions.get(roomId);
    if (!e) return undefined;
    const now = this.now();
    if (now - e.at > SESSION_TOUCH_MS) {
      e.at = now;
      this.save();
    }
    return e.name;
  }

  /** Define o nome da sala de sessão; vazio volta ao automático (o título da sessão). Devolve o apelido em uso. */
  setSession(roomId: string, name: string): string | undefined {
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, ROOM_NAME_MAX);
    if (clean) this.sessions.set(roomId, { name: clean, at: this.now() });
    else this.sessions.delete(roomId);
    this.save();
    return this.getSession(roomId);
  }

  /**
   * A sala de sessão `from` continua com a sessão nova do mesmo processo (/clear, /resume): o apelido passa a valer
   * também para o id que a sala terá depois de um reinício ("<pasta>#<sessão nova>").
   */
  followSession(from: string, to: string): void {
    const e = this.sessions.get(from);
    if (!e || from === to || this.sessions.get(to)?.name === e.name) return;
    this.sessions.set(to, { name: e.name, at: this.now() });
    this.save();
  }

  private save(): void {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const now = this.now();
      const sessions = [...this.sessions]
        .filter(([, e]) => now - e.at < SESSION_ALIAS_MAX_AGE_MS)
        .sort((a, b) => b[1].at - a[1].at)
        .slice(0, SESSION_ALIAS_MAX);
      this.sessions = new Map(sessions);
      const data: { version: 1; aliases: Record<string, string>; sessions?: Record<string, SessionAlias> } = { version: 1, aliases: Object.fromEntries(this.aliases) };
      if (sessions.length) data.sessions = Object.fromEntries(sessions);
      writeFileSync(`${this.file}.tmp`, JSON.stringify(data, null, 2));
      renameSync(`${this.file}.tmp`, this.file);
    } catch (err) {
      log.warn(tr('Não consegui gravar {0}: {1}', [this.file, errMsg(err)]));
    }
  }
}

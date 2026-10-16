// Dono do escritório: o nome, o cargo, o look e as peças do personagem (as mesmas do editor) e, se quiser, a
// secretária. Com ele, o campus ganha a sala da diretoria (OfficeSnapshot.meta.owner). Fica em <dataDir>/owner.json,
// gravado pelas Configurações (PUT/DELETE /api/owner); HABBLAUD_OWNER (o mesmo JSON) é só o valor inicial, enquanto
// o owner.json não existe:
//
//   HABBLAUD_OWNER='{"name":"Ana","title":"CEO","look":"f","parts":{"topStyle":"jacket"},
//                    "secretary":{"name":"Rafael","look":"m"}}'
//
// `smokes: true` (opcional) leva o dono junto na pausa para o cigarro do menu Atividades (client/src/world/sim/ceo.ts).
//
// Qualquer campo fora do formato invalida o todo: melhor nenhuma diretoria do que uma meio configurada.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseAppearanceParts, parseCharacterName, type AppearanceParts } from '../shared/appearance';
import { tr } from '../shared/i18n';
import type { OwnerInfo } from '../shared/types';
import { errMsg, log } from './log';

/** Resultado da leitura: o dono, ou o motivo de ter sido ignorado (`invalid` = o campo, ou "JSON"). */
export interface OwnerParse {
  owner?: OwnerInfo;
  invalid?: string;
}

const KEYS = new Set(['name', 'title', 'look', 'parts', 'secretary', 'smokes']);
const SECRETARY_KEYS = new Set(['name', 'look', 'parts']);

type Person = { name: string; look: 'f' | 'm'; parts?: AppearanceParts };

/** Nome, look (padrão 'm') e peças de uma pessoa; devolve o campo inválido (com o prefixo) quando falha. */
function person(src: Record<string, unknown>, keys: ReadonlySet<string>, prefix: string): Person | string {
  for (const k of Object.keys(src)) if (!keys.has(k)) return `${prefix}${k}`;
  const name = parseCharacterName(src.name);
  if (!name) return `${prefix}name`;
  const look = src.look ?? 'm';
  if (look !== 'f' && look !== 'm') return `${prefix}look`;
  let parts: AppearanceParts | undefined;
  if (src.parts !== undefined) {
    const p = parseAppearanceParts(src.parts);
    if (!p) return `${prefix}parts`;
    if (Object.keys(p).length) parts = p;
  }
  return { name, look, ...(parts ? { parts } : {}) };
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** HABBLAUD_OWNER (texto JSON). Vazio = sem dono e sem aviso. */
export function parseOwner(raw: string | undefined): OwnerParse {
  const text = raw?.trim();
  if (!text) return {};
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { invalid: 'JSON' };
  }
  return parseOwnerValue(json);
}

/** O dono já como objeto (o JSON de HABBLAUD_OWNER, o owner.json, o corpo do PUT). */
export function parseOwnerValue(json: unknown): OwnerParse {
  if (!isObject(json)) return { invalid: 'JSON' };
  const owner = person(json, KEYS, '');
  if (typeof owner === 'string') return { invalid: owner };
  let title: string | undefined;
  if (json.title !== undefined) {
    const t = parseCharacterName(json.title);
    if (!t) return { invalid: 'title' };
    title = t;
  }
  if (json.smokes !== undefined && typeof json.smokes !== 'boolean') return { invalid: 'smokes' };
  let secretary: Person | undefined;
  if (json.secretary !== undefined) {
    if (!isObject(json.secretary)) return { invalid: 'secretary' };
    const s = person(json.secretary, SECRETARY_KEYS, 'secretary.');
    if (typeof s === 'string') return { invalid: s };
    secretary = s;
  }
  return { owner: { name: owner.name, ...(title ? { title } : {}), look: owner.look, ...(owner.parts ? { parts: owner.parts } : {}), ...(secretary ? { secretary } : {}), ...(json.smokes ? { smokes: true } : {}) } };
}

/**
 * Corpo do PUT /api/owner (o formulário das Configurações): nome vazio tira o dono (`owner: null`, a diretoria some);
 * cargo vazio e secretária sem nome são omitidos. O resto passa pela mesma validação do HABBLAUD_OWNER.
 */
export function ownerFromBody(body: unknown): { owner: OwnerInfo | null } | { invalid: string } {
  if (!isObject(body)) return { invalid: 'JSON' };
  const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim());
  if (blank(body.name)) return { owner: null };
  const clean: Record<string, unknown> = { ...body };
  if (blank(clean.title)) delete clean.title;
  if (clean.secretary === null || (isObject(clean.secretary) && blank(clean.secretary.name))) delete clean.secretary;
  const r = parseOwnerValue(clean);
  return r.owner ? { owner: r.owner } : { invalid: r.invalid ?? 'JSON' };
}

/** De onde vem o dono em uso: as Configurações (owner.json), o HABBLAUD_OWNER ou nenhum. */
export type OwnerSource = 'settings' | 'env' | 'none';

/**
 * Dono guardado em <dataDir>/owner.json (`{version: 1, owner: OwnerInfo | null}`). Enquanto o arquivo não existe, vale o
 * `fallback` (HABBLAUD_OWNER); depois dele, o arquivo manda (inclusive `owner: null`, que tira a diretoria).
 */
export class OwnerStore {
  private owner: OwnerInfo | null = null;
  private stored = false;

  /** `file` null = só em memória (testes). */
  constructor(
    private readonly file: string | null,
    private readonly fallback?: OwnerInfo,
  ) {}

  load(): void {
    if (!this.file) return;
    try {
      const j = JSON.parse(readFileSync(this.file, 'utf8')) as { owner?: unknown };
      if (j.owner === null || j.owner === undefined) {
        this.owner = null;
      } else {
        const r = parseOwnerValue(j.owner);
        if (!r.owner) throw new Error(tr('campo "{0}" fora do formato', [r.invalid ?? 'JSON']));
        this.owner = r.owner;
      }
      this.stored = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.warn(tr('owner.json ilegível ({0}); vale o HABBLAUD_OWNER, se houver.', [errMsg(err)]));
    }
  }

  get(): OwnerInfo | undefined {
    return (this.stored ? this.owner : this.fallback) ?? undefined;
  }

  source(): OwnerSource {
    if (this.stored) return this.owner ? 'settings' : 'none';
    return this.fallback ? 'env' : 'none';
  }

  /** Grava o dono (null = sem dono). */
  set(owner: OwnerInfo | null): void {
    this.owner = owner;
    this.stored = true;
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(`${this.file}.tmp`, JSON.stringify({ version: 1, owner }, null, 2));
      renameSync(`${this.file}.tmp`, this.file);
    } catch (err) {
      log.warn(tr('Não consegui gravar {0}: {1}', [this.file, errMsg(err)]));
    }
  }
}

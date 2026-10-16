// Dono do escritório (HABBLAUD_OWNER): um JSON com o nome, o cargo, o look e as peças do personagem (as mesmas do
// editor) e, se quiser, a secretária. Com ele, o campus ganha a sala da diretoria (OfficeSnapshot.meta.owner).
//
//   HABBLAUD_OWNER='{"name":"Ana","title":"CEO","look":"f","parts":{"topStyle":"jacket"},
//                    "secretary":{"name":"Rafael","look":"m"}}'
//
// Qualquer campo fora do formato invalida o todo: melhor nenhuma diretoria do que uma meio configurada.
import { parseAppearanceParts, parseCharacterName, type AppearanceParts } from '../shared/appearance';
import type { OwnerInfo } from '../shared/types';

/** Resultado da leitura: o dono, ou o motivo de ter sido ignorado (`invalid` = o campo, ou "JSON"). */
export interface OwnerParse {
  owner?: OwnerInfo;
  invalid?: string;
}

const KEYS = new Set(['name', 'title', 'look', 'parts', 'secretary']);
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

export function parseOwner(raw: string | undefined): OwnerParse {
  const text = raw?.trim();
  if (!text) return {};
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { invalid: 'JSON' };
  }
  if (!isObject(json)) return { invalid: 'JSON' };
  const owner = person(json, KEYS, '');
  if (typeof owner === 'string') return { invalid: owner };
  let title: string | undefined;
  if (json.title !== undefined) {
    const t = parseCharacterName(json.title);
    if (!t) return { invalid: 'title' };
    title = t;
  }
  let secretary: Person | undefined;
  if (json.secretary !== undefined) {
    if (!isObject(json.secretary)) return { invalid: 'secretary' };
    const s = person(json.secretary, SECRETARY_KEYS, 'secretary.');
    if (typeof s === 'string') return { invalid: s };
    secretary = s;
  }
  return { owner: { name: owner.name, ...(title ? { title } : {}), look: owner.look, ...(owner.parts ? { parts: owner.parts } : {}), ...(secretary ? { secretary } : {}) } };
}

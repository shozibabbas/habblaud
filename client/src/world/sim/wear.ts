// Peças usadas só durante uma atividade (topi e hijab na mesquita, pés descalços depois da sapateira): camadas
// sobrepostas à aparência do personagem NA HORA DO DESENHO. Nada disso é salvo nem muda `ch.appearance`; tirar a
// camada devolve exatamente a aparência de antes. Puro (sem DOM).
import { ACCESSORIES } from '../../../../shared/appearance';
import type { Appearance } from '../../art/api';
import { barefoot } from '../../art/character/prayer';

/** Uma camada: campos da aparência substituídos enquanto ela estiver vestida. */
export type WearLook = Partial<Appearance>;

/** Quem pode vestir camadas (o personagem da simulação). */
export interface Wearer {
  appearance: Appearance;
  wear: ReadonlyMap<string, WearLook> | null;
}

/** Veste (ou troca) a camada `id`. */
export function putOn(ch: { wear: Map<string, WearLook> | null }, id: string, look: WearLook): void {
  (ch.wear ??= new Map()).set(id, look);
}

/** Tira a camada `id` (sem efeito se não estiver vestida). */
export function takeOff(ch: { wear: Map<string, WearLook> | null }, id: string): void {
  if (!ch.wear) return;
  ch.wear.delete(id);
  if (!ch.wear.size) ch.wear = null;
}

const merged = new WeakMap<Appearance, Map<string, Appearance>>();

/**
 * Aparência para desenhar agora: a do personagem com as camadas por cima (na ordem em que foram vestidas). O
 * objeto é estável para a mesma combinação (as caches da arte usam a identidade/chave da aparência).
 */
export function wornAppearance(ch: Wearer): Appearance {
  const layers = ch.wear;
  if (!layers || !layers.size) return ch.appearance;
  let key = '';
  for (const [id, look] of layers) key += `${id}:${JSON.stringify(look)};`;
  let byKey = merged.get(ch.appearance);
  if (!byKey) merged.set(ch.appearance, (byKey = new Map()));
  let a = byKey.get(key);
  if (!a) {
    a = { ...ch.appearance };
    for (const look of layers.values()) Object.assign(a, look);
    if (byKey.size > 32) byKey.clear();
    byKey.set(key, a);
  }
  return a;
}

const KNOWN: ReadonlySet<string> = new Set<string>(ACCESSORIES);
const CAP_WHITE = '#f4f2ee';

/**
 * Cobertura de cabeça para rezar: topi branco (homens) ou hijab (mulheres). Enquanto o renderer não conhece
 * 'topi'/'hijab' (as roupas paquistanesas chegam em outro ramo), o homem usa um gorro branco ('beanie') e a
 * mulher um hijab desenhado provisoriamente pela arte (character/prayer.ts), com o cabelo escondido.
 */
export function prayerHeadwear(look: 'm' | 'f', color: string): WearLook {
  if (look === 'f') {
    if (KNOWN.has('hijab')) return { accessory: 'hijab' as Appearance['accessory'], accessoryColor: color };
    return { accessory: 'hijab' as Appearance['accessory'], accessoryColor: color, hairStyle: 'bald' };
  }
  return { accessory: (KNOWN.has('topi') ? 'topi' : 'beanie') as Appearance['accessory'], accessoryColor: CAP_WHITE };
}

/** Sem sapatos (ficaram na sapateira): pés descalços/meias no tom da pele. */
export function shoesOff(a: Appearance): WearLook {
  return { shoes: barefoot(a.skin) };
}

// Salas do escritório: identidade (cwd normalizado), nome exibido e posição (slot) no prédio.

/** cwd normalizado: sem barras repetidas nem barra final. */
export function normalizeCwd(cwd: string): string {
  const p = cwd.trim().replace(/\/{2,}/g, '/');
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

function segments(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean);
}

/**
 * Nome de cada sala: o basename do caminho; salas com o mesmo basename ganham o(s) diretório(s)
 * pai até ficarem distintas (ex.: "applications/app" e "outro/app").
 */
export function roomDisplayNames(rooms: ReadonlyMap<string, string>): Map<string, string> {
  const segs = new Map([...rooms].map(([id, path]) => [id, segments(path)]));
  const depth = new Map([...rooms.keys()].map((id) => [id, 1]));
  const nameOf = (id: string) => {
    const s = segs.get(id)!;
    return s.length ? s.slice(-depth.get(id)!).join('/') : rooms.get(id) || '/';
  };
  for (let guard = 0; guard < 16; guard++) {
    const groups = new Map<string, string[]>();
    for (const id of rooms.keys()) {
      const n = nameOf(id);
      groups.set(n, [...(groups.get(n) ?? []), id]);
    }
    let grew = false;
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      for (const id of ids) {
        if (depth.get(id)! < segs.get(id)!.length) {
          depth.set(id, depth.get(id)! + 1);
          grew = true;
        }
      }
    }
    if (!grew) break;
  }
  return new Map([...rooms.keys()].map((id) => [id, nameOf(id)]));
}

/**
 * Distribui slots: a sala nova pega o menor slot livre que não esteja em espera.
 * Um slot liberado só volta a ser usado após `cooldownMs` (tempo da animação de saída).
 */
export class SlotAllocator {
  private slots = new Map<string, number>();
  private freedAt = new Map<number, number>();

  constructor(private readonly cooldownMs = 30_000) {}

  /** Ajusta as alocações ao conjunto atual de salas. Devolve true se algo mudou. */
  sync(ids: Iterable<string>, now: number): boolean {
    const live = new Set(ids);
    let changed = false;
    for (const [id, slot] of [...this.slots]) {
      if (live.has(id)) continue;
      this.slots.delete(id);
      this.freedAt.set(slot, now);
      changed = true;
    }
    for (const id of live) {
      if (this.slots.has(id)) continue;
      this.slots.set(id, this.firstFree(now));
      changed = true;
    }
    return changed;
  }

  slotOf(id: string): number | undefined {
    return this.slots.get(id);
  }

  private firstFree(now: number): number {
    const used = new Set(this.slots.values());
    for (let slot = 0; ; slot++) {
      if (used.has(slot)) continue;
      const freed = this.freedAt.get(slot);
      if (freed !== undefined && now - freed < this.cooldownMs) continue;
      this.freedAt.delete(slot);
      return slot;
    }
  }
}

// ---------------------------------------------------------------- nome das salas de sessão (HABBLAUD_ROOMS)

/** Tamanho máximo do nome de sala tirado do título da sessão (cortado numa fronteira de palavra). */
export const TITLE_ROOM_MAX = 26;

// Começos que não dizem nada do trabalho ("I am making a…", "can you…", "please…"), tirados um depois do outro.
// Inglês primeiro; alguns do português, espanhol e francês. Comparados sem caixa, com o apóstrofo normalizado.
const LEADING = [
  'i want to', 'i want', "i'd like to", 'i would like to', 'i need you to', 'i need to', 'i need', 'i am', "i'm", 'im',
  'i have', 'we are', "we're", 'we need to', 'we want to', 'we have', 'please', 'pls', 'kindly', 'can you', 'could you',
  'would you', 'will you', 'can we', 'could we', 'help me to', 'help me', "let's", 'lets', 'let us', 'go ahead and',
  'now', 'ok', 'okay', 'so', 'hey', 'hi', 'hello', 'make', 'making', 'create', 'creating', 'add', 'adding', 'build',
  'building', 'write', 'writing', 'do', 'doing', 'work on', 'working on', 'try to', 'trying to', 'going to', 'gonna',
  'look at', 'take a look at', 'have a look at', 'and', 'then', 'also',
  'por favor', 'quero que você', 'quero que voce', 'quero', 'preciso que você', 'preciso', 'você pode', 'voce pode',
  'pode', 'vamos', 'faça', 'faca', 'crie', 'criar', 'adicione', 'adicionar', 'fazer', 'quiero que', 'quiero',
  'necesito', 'puedes', 'podrías', 'haz', 'crea', 'añade', 'agrega', 'je veux', 'je voudrais', "j'aimerais",
  'peux-tu', 'pouvez-vous', "s'il te plaît", "s'il vous plaît", 'fais', 'crée', 'ajoute',
]
  .map((p) => p.split(' '))
  .sort((a, b) => b.length - a.length);

// Enchimento tirado de qualquer lugar: artigos e expressões vazias ("for the following:" vira só o ":").
const FILLER_PHRASES = [['for', 'the', 'following'], ['the', 'following'], ['as', 'follows'], ['following']];
const FILLER = new Set([
  'a', 'an', 'the', 'some', 'just', 'really', 'very', 'basically', 'actually', 'simply',
  'o', 'os', 'as', 'um', 'uma', 'el', 'los', 'las', 'un', 'una', 'le', 'les', 'une',
]);
// Palavras pequenas: minúsculas no meio do nome e nunca no fim dele.
const SMALL = new Set([
  'of', 'for', 'and', 'or', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'vs', 'into', 'about', 'via',
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'para', 'com', 'del', 'y', 'con', 'en', 'et', 'du', 'des',
  'pour', 'au', 'la',
]);

interface Word {
  core: string;
  /** Pontuação que segue a palavra e vale manter (":" separa; "+"/"#" de C++ e C#). */
  trail: string;
}

const lower = (w: Word) => w.core.toLowerCase().replace(/[’`]/g, "'");

function wordsOf(text: string): Word[] {
  const out: Word[] = [];
  for (const raw of text.split(' ')) {
    const m = /^[^\p{L}\p{N}]*(.*?)([^\p{L}\p{N}]*)$/su.exec(raw);
    const core = m?.[1] ?? '';
    const tail = m?.[2] ?? '';
    const trail = tail.includes(':') ? ':' : /^[+#]+$/.test(tail) ? tail : '';
    if (core) out.push({ core, trail });
    // Só pontuação (marcador de lista "*", "-", "—"): o ":" dela vai para a palavra anterior.
    else if (trail === ':' && out.length && !out[out.length - 1].trail) out[out.length - 1].trail = ':';
  }
  return out;
}

function startsWith(words: Word[], at: number, phrase: string[]): boolean {
  return phrase.every((p, i) => words[at + i] !== undefined && lower(words[at + i]) === p);
}

function dropLeading(words: Word[]): Word[] {
  let w = words;
  for (let guard = 0; guard < 12 && w.length; guard++) {
    const p = LEADING.find((ph) => startsWith(w, 0, ph));
    if (!p) break;
    w = w.slice(p.length);
  }
  return w;
}

function dropFiller(words: Word[]): Word[] {
  const out: Word[] = [];
  for (let i = 0; i < words.length; ) {
    const phrase = FILLER_PHRASES.find((ph) => startsWith(words, i, ph));
    const n = phrase?.length ?? (FILLER.has(lower(words[i])) ? 1 : 0);
    if (!n) {
      out.push({ ...words[i] });
      i++;
      continue;
    }
    // O ":" do que saiu fica com a palavra anterior ("product for the following:" -> "product:").
    if (words[i + n - 1].trail === ':' && out.length && !out[out.length - 1].trail) out[out.length - 1].trail = ':';
    i += n;
  }
  return out;
}

function capitalize(core: string): string {
  // Siglas e nomes com maiúscula no meio ("VA", "iOS", "GitHub") ficam como estão.
  if ([...core].slice(1).some((c) => c !== c.toLowerCase())) return core;
  return core
    .split('-')
    .map((part) => {
      const chars = [...part];
      return chars.length ? chars[0].toLocaleUpperCase() + chars.slice(1).join('') : part;
    })
    .join('-');
}

/**
 * Nome curto de uma sala de sessão a partir do título da sessão (o título do Claude Code ou o primeiro pedido), sem
 * mandar o texto a lugar nenhum: tira começos como "I am making a"/"can you"/"please", artigos e "for the following",
 * põe em Title Case e corta em ~26 caracteres numa fronteira de palavra, sem terminar em "of"/"for"/":".
 * Determinístico; texto sem espaços (chinês, japonês) é só cortado. undefined = não sobrou nada.
 * Ex.: "I am making a product for the following: * training of sales" -> "Product: Training of Sales".
 */
export function titleRoomName(title: string | undefined, max = TITLE_ROOM_MAX): string | undefined {
  if (!title) return undefined;
  let text = title
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[*_`#>|~]+(?=\s|$)|(?<=\s|^)[*_`#>|~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Só a primeira frase: "Fix the build. Then deploy." -> "Fix the build".
  const end = /[.!?](\s|$)|[。！？]/u.exec(text);
  if (end && end.index > 0) text = text.slice(0, end.index);
  const words = dropLeading(dropFiller(dropLeading(wordsOf(text))));
  if (!words.length) return undefined;
  const shown = words.map((w, i) => ({
    text: (i > 0 && SMALL.has(lower(w)) ? w.core.toLowerCase() : capitalize(w.core)) + w.trail,
    small: SMALL.has(lower(w)),
  }));
  const first = [...shown[0].text];
  if (first.length > max) return `${first.slice(0, max - 1).join('')}…`;
  const kept: typeof shown = [];
  let len = 0;
  for (const w of shown) {
    const add = (kept.length ? 1 : 0) + [...w.text].length;
    if (len + add > max) break;
    kept.push(w);
    len += add;
  }
  while (kept.length > 1 && kept[kept.length - 1].small) kept.pop();
  const name = kept
    .map((w) => w.text)
    .join(' ')
    .replace(/:$/, '');
  return /[\p{L}\p{N}]/u.test(name) ? name : undefined;
}

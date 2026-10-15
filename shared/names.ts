import { hash32 } from './hash';

export interface PersonName {
  name: string;
  look: 'f' | 'm';
}

// Conjuntos de nomes para os personagens (HABBLAUD_NAMES; padrão: br). Sem duplicatas e sem variações quase iguais
// (ex.: Thiago/Tiago, Omar/Umar), para que cada personagem seja inconfundível no escritório.

// Nomes brasileiros (o padrão).
const F = [
  'Ana', 'Beatriz', 'Camila', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Júlia',
  'Larissa', 'Mariana', 'Natália', 'Olívia', 'Paula', 'Rebeca', 'Sofia', 'Tatiana', 'Valentina', 'Yasmin',
  'Alice', 'Bianca', 'Cecília', 'Débora', 'Elisa', 'Flávia', 'Giovana', 'Heloísa', 'Iara', 'Jéssica',
  'Lívia', 'Manuela', 'Melissa', 'Nina', 'Priscila', 'Rafaela', 'Sabrina', 'Teresa', 'Vitória', 'Zoe',
  'Aline', 'Bruna', 'Clara', 'Estela', 'Fabiana', 'Glória', 'Ingrid', 'Joana', 'Kátia', 'Lara',
  'Maitê', 'Mirela', 'Noemi', 'Pietra', 'Renata', 'Simone', 'Sara', 'Vanessa', 'Luana', 'Marina',
];
const M = [
  'Arthur', 'Bruno', 'Caio', 'Diego', 'Enzo', 'Felipe', 'Gustavo', 'Henrique', 'Igor', 'João',
  'Kauã', 'Lucas', 'Mateus', 'Nicolas', 'Otávio', 'Pedro', 'Rafael', 'Samuel', 'Thiago', 'Vinícius',
  'Bernardo', 'Danilo', 'Davi', 'Emanuel', 'Fábio', 'Gael', 'Heitor', 'Hugo', 'Joaquim', 'Jorge',
  'Leonardo', 'Lorenzo', 'Luan', 'Marcelo', 'Murilo', 'Noah', 'Otto', 'Raul', 'Renato', 'Ricardo',
  'Rodrigo', 'Sérgio', 'Theo', 'Tomás', 'Ulisses', 'Vicente', 'Wagner', 'Yuri', 'Augusto', 'Benício',
  'César', 'Douglas', 'Elias', 'Francisco', 'Guilherme', 'Ícaro', 'Jonas', 'Leandro', 'Miguel', 'Paulo',
];

// Nomes paquistaneses.
const PK_F = [
  'Ayesha', 'Fatima', 'Zainab', 'Maryam', 'Hira', 'Sana', 'Mahnoor', 'Iqra', 'Amna', 'Areeba',
  'Bushra', 'Saba', 'Nida', 'Rabia', 'Sadia', 'Mehwish', 'Kiran', 'Sidra', 'Anum', 'Zara',
  'Alishba', 'Laiba', 'Hafsa', 'Mahira', 'Noor', 'Saira', 'Uzma', 'Farah', 'Nimra', 'Aiman',
  'Minal', 'Esha', 'Javeria', 'Kinza', 'Ramsha', 'Sehrish', 'Tahira', 'Shazia', 'Samina', 'Nazia',
  'Rubina', 'Fozia', 'Asma', 'Humaira', 'Sumbul', 'Komal', 'Aleena', 'Dua', 'Hareem', 'Inaya',
  'Mehreen', 'Sundas', 'Tooba', 'Yusra', 'Zoya', 'Lubna', 'Naila', 'Rukhsana', 'Ghazala', 'Shiza',
];
const PK_M = [
  'Ahmed', 'Ali', 'Bilal', 'Danish', 'Faisal', 'Hamza', 'Hassan', 'Imran', 'Junaid', 'Kamran',
  'Usman', 'Omar', 'Zain', 'Saad', 'Talha', 'Fahad', 'Asad', 'Waqas', 'Adnan', 'Shahid',
  'Tariq', 'Yasir', 'Zubair', 'Rizwan', 'Arslan', 'Haris', 'Ibrahim', 'Jibran', 'Kashif', 'Mohsin',
  'Nabeel', 'Owais', 'Qasim', 'Raza', 'Salman', 'Shoaib', 'Taimoor', 'Waleed', 'Zeeshan', 'Abdullah',
  'Babar', 'Daniyal', 'Ehsan', 'Farhan', 'Hammad', 'Irfan', 'Jawad', 'Khalid', 'Luqman', 'Moiz',
  'Noman', 'Rehan', 'Sameer', 'Shahzad', 'Uzair', 'Wahab', 'Yousaf', 'Zaheer', 'Sohail', 'Aamir',
];

/** Intercala para que nomes vizinhos no pool alternem a dica visual. */
function interleave(f: readonly string[], m: readonly string[]): readonly PersonName[] {
  return Object.freeze(f.flatMap((n, i) => [{ name: n, look: 'f' as const }, ...(m[i] ? [{ name: m[i], look: 'm' as const }] : [])]));
}

export type NameSet = 'br' | 'pk';

export const NAME_SETS: Readonly<Record<NameSet, readonly PersonName[]>> = Object.freeze({
  br: interleave(F, M),
  pk: interleave(PK_F, PK_M),
});

/** O conjunto padrão (brasileiro). */
export const NAME_POOL: readonly PersonName[] = NAME_SETS.br;

/** HABBLAUD_NAMES -> conjunto de nomes; vazio ou desconhecido = br. */
export function parseNameSet(raw: string | undefined): NameSet {
  const v = raw?.trim().toLowerCase();
  return v === 'pk' ? 'pk' : 'br';
}

/**
 * O nome é de OUTRO conjunto que não `set` (trocar HABBLAUD_NAMES renomeia esses)? Nomes que não são de conjunto
 * nenhum (escolhidos no editor de personagem) ficam.
 */
export function fromOtherNameSet(name: string, set: NameSet): boolean {
  return !inNameSet(name, set) && (Object.keys(NAME_SETS) as NameSet[]).some((other) => other !== set && inNameSet(name, other));
}

/** O nome (sem o sufixo numérico de desempate, "Ana 2") é do conjunto? */
export function inNameSet(name: string, set: NameSet): boolean {
  const base = name.replace(/ \d+$/, '');
  return NAME_SETS[set].some((p) => p.name === base);
}

/**
 * Escolhe um nome determinístico para `id`, evitando os já usados.
 * Se o pool esgotar, acrescenta um sufixo numérico ("Ana 2").
 */
export function pickName(id: string, used: ReadonlySet<string>, set: NameSet = 'br'): PersonName {
  const pool = NAME_SETS[set];
  const n = pool.length;
  const start = hash32(id) % n;
  for (let i = 0; i < n; i++) {
    const cand = pool[(start + i) % n];
    if (!used.has(cand.name)) return cand;
  }
  const base = pool[start];
  for (let k = 2; ; k++) {
    const name = `${base.name} ${k}`;
    if (!used.has(name)) return { name, look: base.look };
  }
}

// Equipe de limpeza (uma função da equipe; ver sim/staff.ts). De tempos em tempos (escalonado entre as pessoas), cada
// uma pega a área que está há mais tempo sem limpeza — salas de projeto, recepção, copa, banheiros, lounge, corredor,
// saguões dos prédios e, no campus, o salão de jogos, a sala de descanso e a mesquita (só o piso da ablução e das
// sapateiras, nunca o carpete da oração) —, vai até lá empurrando o carrinho, estaciona na entrada (com a placa de
// "piso molhado" quando o piso é duro), passa o mop (ou o aspirador, no carpete e nos tapetes) em alguns trechos
// espalhados pela área e volta ao carrinho. Cada trecho limpo brilha e o brilho some em ~2,5 min (sim/shine.ts).
// Entre as rondas a pessoa guarda o carrinho, enxágua o mop no tanque e descansa na sua banqueta do canto da limpeza.
// Nunca limpa em cima de quem está parado nem nos lugares de uso (mesas, máquinas, assentos), e não entra numa ala da
// mesquita durante uma oração nem na sala de descanso com alguém dormindo.
import { hash32 } from '../../../../shared/hash';
import { tr } from '../../../../shared/i18n';
import type { AppearanceProfile } from '../../../../shared/types';
import type { Appearance, Dir, HeldItem } from '../../art/api';
import { TILE } from '../constants';
import { inRect } from '../layout/geometry';
import { MEN_ID, WOMEN_ID } from '../layout/mosque';
import { STAFF_CART, STAFF_REST, STAFF_SINK } from '../layout/staff';
import type { AreaLayout } from '../layout/types';
import { FREE } from '../path/grid';
import { planPrayerVisit, prays, wantsToPray } from './prayer';
import type { KitItem, StaffCrew, StaffMember, StaffRoleDef } from './staff';
import type { Step } from './steps';

// ------------------------------------------------------------------ uniforme

/** Verde-azulado do uniforme, o tom mais fundo (dupatta/hijab), o claro da gola e o marinho da calça. */
export const UNIFORM = { main: '#1f7f86', deep: '#145a60', light: '#d7eeeb', navy: '#273a59', shoes: '#2b2f3a' } as const;
const TALL_HAIR: ReadonlySet<string> = new Set(['afro', 'bun', 'mohawk', 'pigtails']);

/**
 * Uniforme sobre a aparência sorteada. Padrão: polo verde-azulada, calça marinho e boné. Perfil 'pk': kurta-shalwar
 * (homens) e shalwar kameez com dupatta (mulheres; quem sorteou hijab fica com ele), tudo na cor do uniforme.
 */
export function cleanerUniform(base: Appearance, profile: AppearanceProfile | undefined): Appearance {
  const a: Appearance = { ...base, lanyard: null, shoes: UNIFORM.shoes };
  if (profile === 'pk') {
    a.top = UNIFORM.main;
    a.bottom = UNIFORM.main;
    a.bottomStyle = 'shalwar';
    if (a.look === 'f') {
      a.topStyle = 'shalwar_kameez';
      a.topAccent = UNIFORM.deep;
      a.accessory = a.accessory === 'hijab' ? 'hijab' : 'dupatta';
      a.accessoryColor = UNIFORM.deep;
    } else {
      a.topStyle = 'kurta';
      a.topAccent = UNIFORM.light;
      a.accessory = a.accessory === 'glasses' ? 'glasses' : 'none';
    }
    return a;
  }
  a.topStyle = 'polo';
  a.top = UNIFORM.main;
  a.topAccent = UNIFORM.light;
  a.bottomStyle = 'pants';
  a.bottom = UNIFORM.navy;
  a.accessory = 'cap';
  a.accessoryColor = UNIFORM.main;
  // boné não combina com cabelo alto (ver HATS em appearance.ts): preso para o trabalho
  if (TALL_HAIR.has(a.hairStyle)) a.hairStyle = a.look === 'f' ? 'ponytail' : 'short';
  return a;
}

// ------------------------------------------------------------------ áreas e escala

/** Uma área que a equipe limpa. */
export interface CleanArea {
  id: string;
  name: string;
  layout: AreaLayout;
  /** Ala da mesquita: só quem tem este look entra para limpar. */
  look?: 'm' | 'f';
  /** Só o piso duro (mesquita: o carpete da oração não). */
  hardOnly: boolean;
}

const CORE_NAMES: Readonly<Record<string, string>> = {
  'core:recepcao': tr('Recepção'),
  'core:banheiros': tr('Banheiros'),
  'core:copa': tr('Copa'),
  'core:lounge': tr('Lounge'),
  'core:corredor': tr('Corredor'),
  [MEN_ID]: tr('Mesquita'),
  [WOMEN_ID]: tr('Ala feminina'),
};

function areaName(a: AreaLayout): string {
  if (CORE_NAMES[a.id]) return CORE_NAMES[a.id];
  if (a.kind === 'corridor') return tr('Corredor');
  if (a.kind === 'meeting') return tr('Reunião');
  // saguão do prédio de uma máquina (a placa tem o nome da máquina)
  if (a.kind === 'reception' && a.bld) return tr('Saguão de {0}', [a.signText ?? a.bld]);
  return a.signText ?? tr('Área comum');
}

/** Áreas limpáveis agora: as fixas (menos as ao ar livre e as de máquinas desconectadas) e as salas prontas e acesas. */
export function cleaningAreas(crew: StaffCrew): CleanArea[] {
  const sim = crew.sim;
  const out: CleanArea[] = [];
  for (const a of sim.building.areas) {
    if (a.rec === 'court' || a.rec === 'smoking') continue;
    if (a.bld && sim.machineOffline(a.bld)) continue;
    const mosque = a.id === MEN_ID || a.id === WOMEN_ID;
    out.push({ id: a.id, name: areaName(a), layout: a, look: mosque ? (a.id === MEN_ID ? 'm' : 'f') : undefined, hardOnly: mosque });
  }
  for (const r of sim.rooms.values()) {
    if (!r.present || r.ghost || r.phase !== 'ready' || !r.lightOn) continue;
    if (r.bld && sim.machineOffline(r.bld)) continue;
    out.push({ id: r.id, name: r.info.baseName ?? r.info.name, layout: r.layout, hardOnly: false });
  }
  return out;
}

/** A área de há mais tempo sem limpeza (entre as que não são puladas). */
export function oldestArea<T extends { id: string }>(areas: readonly T[], lastCleaned: (id: string) => number, skip: (a: T) => boolean): T | null {
  let best: T | null = null;
  let bestAt = Infinity;
  for (const a of areas) {
    if (skip(a)) continue;
    const at = lastCleaned(a.id);
    if (at < bestAt) {
      best = a;
      bestAt = at;
    }
  }
  return best;
}

/** Escala da equipe: quando cada área foi limpa e quem está com qual. */
export interface Schedule {
  last: Map<string, number>;
  claims: Map<string, string>;
}

const schedules = new WeakMap<StaffCrew, Schedule>();

/** Escala da equipe (quando cada área foi limpa, quem está com qual): a depuração lê. */
export function schedule(crew: StaffCrew): Schedule {
  let s = schedules.get(crew);
  if (!s) schedules.set(crew, (s = { last: new Map(), claims: new Map() }));
  return s;
}

/**
 * Última limpeza de uma área. A primeira vez que a escala a vê, ela "foi limpa" há 8–30 min (fixo pelo id): as
 * primeiras rondas já têm uma ordem, e uma sala nova entra na fila sem furar as que esperam há mais tempo.
 */
export function lastCleanedOf(last: Map<string, number>, id: string, now: number): number {
  let at = last.get(id);
  if (at === undefined) last.set(id, (at = now - (8 + (hash32(`limpeza:${id}`) % 23)) * 60_000));
  return at;
}

// ------------------------------------------------------------------ estado de cada pessoa

type Doing = 'rest' | 'going' | 'mop' | 'vacuum' | 'back';

/** Carrinho: com a pessoa (empurrando) ou estacionado; `tx/ty/dir` = de onde se empurra para pegá-lo de volta. */
interface Cart {
  withMe: boolean;
  home: boolean;
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Dir;
}

export interface CleanerState {
  /** Próxima ronda (ms). */
  nextRoundAt: number;
  /** Áreas que ainda faltam nesta ronda (1–2 por ronda). */
  roundLeft: number;
  /** Área em andamento (reservada na escala). */
  area: string | null;
  areaName: string;
  cart: Cart;
  /** Balde no chão ao lado de quem passa o mop. */
  bucket: { x: number; y: number } | null;
  /** Placa de piso molhado na entrada da área. */
  sign: { x: number; y: number } | null;
  doing: Doing;
  /** Depois de uma ronda: enxágua o mop no tanque antes de sentar. */
  rinse: boolean;
  /** Depuração: área pedida agora ('' = a próxima da escala). */
  forced: string | null;
}

/** Descanso entre as rondas (ms). */
export const REST_MS: readonly [number, number] = [100_000, 190_000];
/** Primeira ronda depois de abrir a página: a 1ª pessoa logo, as outras escalonadas. */
const FIRST_ROUND_MS = 6_000;
const STAGGER_MS = 40_000;

const between = (rng: () => number, a: number, b: number) => a + rng() * (b - a);

// ------------------------------------------------------------------ geometria do kit

/** Carrinho empurrado por quem está em (x, y) olhando para `dir`: posição dos pés do carrinho e a vista. */
export function cartAt(x: number, y: number, dir: Dir): { x: number; y: number; view: 'down' | 'up' | 'side'; flip: boolean } {
  switch (dir) {
    case 'down':
      return { x, y: y + 10, view: 'down', flip: false };
    case 'up':
      return { x, y: y - 6, view: 'up', flip: false };
    case 'left':
      return { x: x - 15, y: y + 1, view: 'side', flip: false };
    default:
      return { x: x + 15, y: y + 1, view: 'side', flip: true };
  }
}

/** Centro do trecho passado no mop por quem está em (x, y) olhando para `dir`. */
function patchCenter(x: number, y: number, dir: Dir): { x: number; y: number } {
  if (dir === 'left') return { x: x - 6, y: y + 2 };
  if (dir === 'right') return { x: x + 6, y: y + 2 };
  return { x, y: y + 3 };
}


/** Carpete ou tapete sob o tile (aspirador em vez de mop). */
export function carpetAt(a: AreaLayout, tx: number, ty: number): boolean {
  const px = tx * TILE + TILE / 2;
  const py = ty * TILE + TILE / 2;
  for (const r of a.rugs) if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) return true;
  let carpet = false;
  // o último piso pintado vence (ex.: o mármore da ablução por cima do carpete da mesquita)
  for (const f of a.floors) if (px >= f.x && px < f.x + f.w && py >= f.y && py < f.y + f.h) carpet = f.kind === 'carpet';
  return carpet;
}

/**
 * Trechos espalhados (o mais longe possível uns dos outros) entre os tiles candidatos: o primeiro sorteado, cada
 * próximo o de maior distância até os já escolhidos.
 */
export function spreadPatches(tiles: readonly { x: number; y: number }[], k: number, rng: () => number): { x: number; y: number }[] {
  if (!tiles.length || k <= 0) return [];
  const out = [tiles[Math.floor(rng() * tiles.length) % tiles.length]];
  while (out.length < k) {
    let best: { x: number; y: number } | null = null;
    let bestD = -1;
    for (const t of tiles) {
      let d = Infinity;
      for (const o of out) d = Math.min(d, Math.abs(t.x - o.x) + Math.abs(t.y - o.y));
      if (d > bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best || bestD < 3) break;
    out.push(best);
  }
  return out;
}

// ------------------------------------------------------------------ planejamento

type Cleaner = StaffMember<CleanerState>;

function findArea(crew: StaffCrew, id: string): CleanArea | undefined {
  return cleaningAreas(crew).find((a) => a.id === id);
}

/** Dá para limpar agora? (ala da mesquita do mesmo look, ninguém rezando nela, ninguém dormindo nas cápsulas) */
function canClean(crew: StaffCrew, m: Cleaner, a: CleanArea): boolean {
  if (a.look && a.look !== m.ch.info.look) return false;
  const sim = crew.sim;
  if (a.layout.rec === 'rest' && sim.podBusy.size > 0) return false;
  if (a.look) {
    for (const c of sim.chars.values()) if ((c.step?.t === 'pray' || c.prayer) && inRect(a.layout.rect, c.tx, c.ty)) return false;
  }
  return true;
}

/** Tiles onde dá para limpar: livres (sem móvel nem assento), sem spot de uso e sem ninguém parado ou indo parar. */
function cleanTiles(crew: StaffCrew, m: Cleaner, a: CleanArea): { x: number; y: number }[] {
  const sim = crew.sim;
  const grid = sim.building.grid;
  const busy = sim.busyTiles(m.id);
  const spotTiles = new Set<number>();
  for (const s of sim.spots.all()) if (inRect(a.layout.rect, s.tx, s.ty)) spotTiles.add(grid.key(s.tx, s.ty));
  const r = a.layout.rect;
  const out: { x: number; y: number }[] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (grid.get(x, y) !== FREE) continue;
      const k = grid.key(x, y);
      if (busy.has(k) || spotTiles.has(k)) continue;
      if (a.hardOnly && carpetAt(a.layout, x, y)) continue;
      // piso aberto: o mop, o balde e o brilho precisam de espaço (nada de cantinho entre vasos)
      if (openness(grid, x, y) < 7) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/** Quantos dos 8 vizinhos são piso livre. */
function openness(grid: StaffCrew['sim']['building']['grid'], x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && grid.get(x + dx, y + dy) === FREE) n++;
  return n;
}

/** Onde estacionar o carrinho: o tile limpável mais perto de quem chega, com espaço à frente para o carrinho. */
function parkingTile(crew: StaffCrew, tiles: readonly { x: number; y: number }[], from: { x: number; y: number }, a: CleanArea): { x: number; y: number; dir: Dir } | null {
  const grid = crew.sim.building.grid;
  const r = a.layout.rect;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  let best: { x: number; y: number; dir: Dir } | null = null;
  let bestD = Infinity;
  for (const t of tiles) {
    // o carrinho fica à frente, apontando para dentro da área
    const dir: Dir = Math.abs(cx - t.x) > Math.abs(cy - t.y) ? (cx > t.x ? 'right' : 'left') : cy > t.y ? 'down' : 'up';
    const fx = t.x + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0);
    const fy = t.y + (dir === 'down' ? 1 : dir === 'up' ? -1 : 0);
    if (grid.get(fx, fy) !== FREE || openness(grid, fx, fy) < 8) continue;
    const d = Math.abs(t.x - from.x) + Math.abs(t.y - from.y);
    if (d < bestD) {
      bestD = d;
      best = { x: t.x, y: t.y, dir };
    }
  }
  return best;
}

/**
 * Onde fica a placa de piso molhado: num tile livre colado ao do carrinho (o da frente de quem estaciona), do lado do
 * meio da área; pés da placa no centro do tile.
 */
function signSpot(crew: StaffCrew, park: { x: number; y: number; dir: Dir }, a: CleanArea): { x: number; y: number } | null {
  const grid = crew.sim.building.grid;
  const fx = park.x + (park.dir === 'right' ? 1 : park.dir === 'left' ? -1 : 0);
  const fy = park.y + (park.dir === 'down' ? 1 : park.dir === 'up' ? -1 : 0);
  const r = a.layout.rect;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const cands = [
    [fx + 1, fy],
    [fx - 1, fy],
    [fx, fy + 1],
    [fx, fy - 1],
  ].filter(([x, y]) => (x !== park.x || y !== park.y) && grid.get(x, y) === FREE && openness(grid, x, y) >= 6);
  cands.sort((p, q) => Math.abs(p[0] - cx) + Math.abs(p[1] - cy) - (Math.abs(q[0] - cx) + Math.abs(q[1] - cy)));
  const t = cands[0];
  return t ? { x: t[0] * TILE + TILE / 2, y: t[1] * TILE + 13 } : null;
}

function homeCart(crew: StaffCrew, m: Cleaner): void {
  const park = crew.claim(m, STAFF_CART);
  const c = m.state.cart;
  c.withMe = false;
  c.home = true;
  if (park) {
    // na vaga: o carrinho fica no tile dela (bloqueado), encostado na parede; quem senta ao lado continua à vista
    Object.assign(c, { x: park.x, y: park.y, tx: park.tx, ty: park.ty, dir: park.dir });
  } else {
    // sem canto da limpeza no layout: o carrinho fica ao lado da pessoa
    const p = cartAt(m.ch.x, m.ch.y, 'down');
    Object.assign(c, { x: p.x, y: p.y, tx: m.ch.tx, ty: m.ch.ty, dir: 'down' as Dir });
  }
}

function release(crew: StaffCrew, m: Cleaner): void {
  const s = m.state;
  if (s.area && schedule(crew).claims.get(s.area) === m.id) schedule(crew).claims.delete(s.area);
  s.area = null;
}

/** Vai até o carrinho estacionado e pega (empurrando a partir dali). */
function fetchCart(m: Cleaner, steps: Step[]): void {
  const c = m.state.cart;
  if (c.withMe) return;
  steps.push(
    { t: 'go', tx: c.tx, ty: c.ty, dir: c.dir },
    {
      t: 'do',
      fn: () => {
        c.withMe = true;
        c.home = false;
      },
    },
  );
}

/** Planeja a limpeza de uma área: carrinho até a entrada, placa, trechos com mop/aspirador e de volta ao carrinho. */
function planArea(crew: StaffCrew, m: Cleaner, a: CleanArea): boolean {
  const ch = m.ch;
  const s = m.state;
  const rng = ch.rng;
  const tiles = cleanTiles(crew, m, a);
  const k = Math.max(2, Math.min(5, Math.round(tiles.length / 28)));
  const patches = spreadPatches(tiles, k, rng);
  const from = s.cart.withMe ? { x: ch.tx, y: ch.ty } : { x: s.cart.tx, y: s.cart.ty };
  const park = patches.length ? parkingTile(crew, tiles, from, a) : null;
  if (!park) {
    // nada a fazer aqui agora (área lotada): conta como limpa e segue a escala
    finishArea(crew, m);
    return false;
  }
  s.areaName = a.name;
  const steps: Step[] = [];
  if (ch.atSpot) steps.push({ t: 'exit' });
  steps.push({ t: 'do', fn: () => (s.doing = 'going') });
  fetchCart(m, steps);
  const hard = patches.some((p) => !carpetAt(a.layout, p.x, p.y));
  steps.push(
    { t: 'go', tx: park.x, ty: park.y, dir: park.dir, walkPose: 'push' },
    {
      t: 'do',
      fn: () => {
        const p = cartAt(ch.x, ch.y, park.dir);
        Object.assign(s.cart, { withMe: false, home: false, x: p.x, y: p.y, tx: park.x, ty: park.y, dir: park.dir });
        if (hard) s.sign = signSpot(crew, park, a);
      },
    },
  );
  let tool: HeldItem = 'mop';
  for (const p of patches) {
    const carpet = carpetAt(a.layout, p.x, p.y);
    tool = carpet ? 'vacuum' : 'mop';
    const dir: Dir = (['left', 'right', 'down', 'down'] as const)[Math.floor(rng() * 4) % 4];
    const ms = Math.round(carpet ? between(rng, 5000, 7000) : between(rng, 6500, 9500));
    const pose = carpet ? 'vacuum' : 'mop';
    steps.push(
      { t: 'go', tx: p.x, ty: p.y, held: tool },
      {
        t: 'do',
        fn: () => {
          s.doing = pose;
          ch.dir = dir;
          const c = patchCenter(ch.x, ch.y, dir);
          crew.shine.add({ x: c.x, y: c.y, rx: 22, ry: 11, at: crew.now, grow: ms, seed: hash32(`${m.id}:${crew.now}`), carpet });
          // o balde fica no chão do outro lado (de quem passa o mop)
          if (!carpet) s.bucket = dir === 'left' ? { x: ch.x + 11, y: ch.y + 1 } : dir === 'right' ? { x: ch.x - 11, y: ch.y + 1 } : { x: ch.x + 12, y: ch.y - 1 };
        },
      },
      { t: 'act', pose, ms, dir },
      { t: 'do', fn: () => (s.bucket = null) },
    );
  }
  steps.push(
    { t: 'do', fn: () => (s.doing = 'back') },
    { t: 'go', tx: park.x, ty: park.y, dir: park.dir, held: tool },
    {
      t: 'do',
      fn: () => {
        s.cart.withMe = true;
        s.sign = null;
        finishArea(crew, m);
      },
    },
  );
  ch.queue.push(...steps);
  return true;
}

/** Área terminada: entra na escala com a hora de agora; a ronda acaba depois da última área. */
function finishArea(crew: StaffCrew, m: Cleaner): void {
  const s = m.state;
  if (s.area) schedule(crew).last.set(s.area, crew.now);
  release(crew, m);
  s.rinse = true;
  if (--s.roundLeft <= 0) {
    s.roundLeft = 0;
    s.nextRoundAt = crew.now + between(m.ch.rng, REST_MS[0], REST_MS[1]);
  }
}

/** Fora da ronda: guarda o carrinho, enxágua o mop e senta na banqueta até a próxima. */
function planRest(crew: StaffCrew, m: Cleaner, now: number): boolean {
  const ch = m.ch;
  const s = m.state;
  const sim = crew.sim;
  const steps: Step[] = [];
  const park = crew.claim(m, STAFF_CART);
  if (!s.cart.home && park) {
    if (ch.atSpot) steps.push({ t: 'exit' });
    steps.push({ t: 'do', fn: () => (s.doing = 'back') });
    fetchCart(m, steps);
    steps.push({ t: 'go', tx: park.tx, ty: park.ty, dir: park.dir, walkPose: 'push' }, { t: 'do', fn: () => homeCart(crew, m) });
    ch.queue.push(...steps);
    return true;
  }
  const seat = crew.claim(m, STAFF_REST);
  if (s.rinse) {
    s.rinse = false;
    const sink = crew.base(STAFF_SINK)[0];
    if (sink && !sim.busyTiles(m.id).has(sim.building.grid.key(sink.tx, sink.ty))) {
      if (ch.atSpot) steps.push({ t: 'exit' });
      steps.push({ t: 'go', tx: sink.tx, ty: sink.ty, fx: sink.x, fy: sink.y, dir: sink.dir, held: 'mop' }, { t: 'act', pose: 'use', ms: 2600, dir: sink.dir, machine: sink.furnitureId });
    }
  }
  s.doing = 'rest';
  // no campus, quem reza às vezes vai à mesquita no intervalo (como qualquer pessoa do escritório)
  if (!steps.length && sim.machines && prays(ch.info.seed) && wantsToPray(ch, now) && planPrayerVisit(sim, ch, now)) return true;
  if (seat && ch.atSpot !== seat.id) {
    if (ch.atSpot) steps.push({ t: 'exit' });
    steps.push({ t: 'go', tx: seat.tx, ty: seat.ty }, { t: 'enter', spot: seat.id });
  }
  const wait = Math.max(1500, s.nextRoundAt - now);
  const due = () => sim.now >= s.nextRoundAt || s.forced !== null;
  // descansa: sentado, às vezes olhando o celular
  if (ch.rng() < 0.4) steps.push({ t: 'until', cond: due, minMs: 1000, maxMs: Math.min(wait, 25_000), pose: seat ? 'read' : 'stand', held: 'phone', dir: seat?.dir });
  else steps.push({ t: 'until', cond: due, minMs: 1000, maxMs: Math.min(wait, 40_000), dir: seat?.dir });
  ch.queue.push(...steps);
  return true;
}

// ------------------------------------------------------------------ a função

export const CLEANER: StaffRoleDef<CleanerState> = {
  role: 'cleaner',
  label: () => tr('Equipe de limpeza'),
  // prédio único: 2; campus: 3, e 4 a partir de 4 prédios
  count: (crew) => (crew.sim.machines ? (crew.sim.machines.size >= 4 ? 4 : 3) : 2),
  dress: cleanerUniform,

  init: (m, _crew, now) => ({
    nextRoundAt: now + FIRST_ROUND_MS + m.index * STAGGER_MS,
    roundLeft: 0,
    area: null,
    areaName: '',
    cart: { withMe: false, home: true, x: 0, y: 0, tx: 0, ty: 0, dir: 'down' },
    bucket: null,
    sign: null,
    doing: 'rest',
    rinse: false,
    forced: null,
  }),

  think(m, crew, now) {
    const ch = m.ch;
    const s = m.state;
    const sched = schedule(crew);
    crew.claim(m, STAFF_REST);
    s.bucket = null;
    // carrinho largado num lugar que deixou de existir (a sala foi desmontada): alguém o levou de volta
    const c = s.cart;
    if (c.home || (!c.withMe && !crew.sim.building.grid.walkable(c.tx, c.ty))) homeCart(crew, m);
    // área em andamento (interrompida por um chamado à oração, uma sala que mudou de lugar...): continua
    if (s.area) {
      const a = findArea(crew, s.area);
      if (a && canClean(crew, m, a)) return planArea(crew, m, a);
      release(crew, m);
    }
    const forced = s.forced;
    if (forced !== null || now >= s.nextRoundAt || s.roundLeft > 0) {
      s.forced = null;
      const areas = cleaningAreas(crew);
      const want = forced ? areas.find((a) => a.id === forced || a.name.toLowerCase() === forced.toLowerCase()) : undefined;
      const pick =
        want ??
        oldestArea(
          areas,
          (id) => lastCleanedOf(sched.last, id, now),
          (a) => (!!sched.claims.get(a.id) && sched.claims.get(a.id) !== m.id) || !canClean(crew, m, a),
        );
      if (pick) {
        if (s.roundLeft <= 0) s.roundLeft = ch.rng() < 0.5 ? 2 : 1;
        sched.claims.set(pick.id, m.id);
        s.area = pick.id;
        if (planArea(crew, m, pick)) return true;
      } else {
        s.roundLeft = 0;
        s.nextRoundAt = now + between(ch.rng, REST_MS[0], REST_MS[1]) * 0.5;
      }
    }
    return planRest(crew, m, now);
  },

  settle(m, crew, now) {
    const ch = m.ch;
    const s = m.state;
    release(crew, m);
    s.bucket = null;
    s.sign = null;
    s.roundLeft = 0;
    s.doing = 'rest';
    homeCart(crew, m);
    if (s.nextRoundAt < now) s.nextRoundAt = now + FIRST_ROUND_MS + m.index * STAGGER_MS;
    const seat = crew.claim(m, STAFF_REST);
    if (seat) crew.seat(ch, seat);
    else {
      const r = crew.sim.building.core[0]?.rect;
      crew.standNear(ch, r ? r.x + 2 + m.index : 2, r ? r.y + 8 : 8);
    }
  },

  doing(m) {
    const s = m.state;
    if (m.ch.prayer || m.ch.step?.t === 'pray') return tr('Rezando');
    switch (s.doing) {
      case 'going':
        return tr('Indo limpar: {0}', [s.areaName]);
      case 'mop':
        return tr('Passando o mop: {0}', [s.areaName]);
      case 'vacuum':
        return tr('Aspirando: {0}', [s.areaName]);
      case 'back':
        return s.area ? tr('Limpando: {0}', [s.areaName]) : tr('Guardando o carrinho');
      default:
        return tr('Descansando');
    }
  },

  kit(m, out, now) {
    const ch = m.ch;
    const s = m.state;
    const c = s.cart;
    const bucketOut = !!s.bucket;
    if (c.withMe) {
      if (!ch.inside && ch.alpha > 0.5 && now >= ch.hiddenUntil) {
        const p = cartAt(ch.x + ch.offX, ch.y + ch.offY, ch.dir);
        out.push({ kind: `cart_${p.view}${bucketOut ? '_nobucket' : ''}` as KitItem['kind'], x: p.x, y: p.y, flip: p.flip });
      }
    } else if (c.x || c.y) {
      const p = cartAt(c.x, c.y, c.dir);
      out.push({ kind: `cart_${p.view}${bucketOut ? '_nobucket' : ''}` as KitItem['kind'], x: c.x, y: c.y, flip: p.flip });
    }
    if (s.bucket) out.push({ kind: 'bucket', x: s.bucket.x, y: s.bucket.y, flip: false });
    if (s.sign) out.push({ kind: 'sign', x: s.sign.x, y: s.sign.y, flip: false });
  },

  joinPrayer(m, crew) {
    const ch = m.ch;
    const s = m.state;
    // no meio de um trecho de piso: termina a limpeza (só esse passo segura a pessoa)
    if (ch.step?.t === 'act' && (ch.step.pose === 'mop' || ch.step.pose === 'vacuum')) return false;
    s.bucket = null;
    if (s.cart.withMe) {
      const p = cartAt(ch.x, ch.y, ch.dir);
      Object.assign(s.cart, { withMe: false, home: false, x: p.x, y: p.y, tx: ch.tx, ty: ch.ty, dir: ch.dir });
    }
    void crew;
    return true;
  },

  dispose(m, crew) {
    release(crew, m);
    m.state.bucket = null;
    m.state.sign = null;
    homeCart(crew, m);
  },
};

/** Depuração: manda alguém da limpeza (por nome ou id; padrão: quem descansa há mais tempo) limpar agora. */
export function cleanNow(crew: StaffCrew, who?: string, area?: string): string | null {
  const list = [...crew.members.values()].filter((m) => m.role === CLEANER.role && !m.leaving) as Cleaner[];
  const w = who?.toLowerCase();
  const m = w ? list.find((x) => x.id === who || x.ch.info.name.toLowerCase() === w) : list.find((x) => !x.state.area) ?? list[0];
  if (!m) return null;
  release(crew, m);
  m.state.forced = area ?? '';
  m.state.roundLeft = 0;
  crew.sim.clearPlan(m.ch);
  m.ch.thinkAt = 0;
  return m.ch.info.name;
}


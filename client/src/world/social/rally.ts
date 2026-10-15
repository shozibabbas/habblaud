// Ralis do pingue-pongue e do tênis — funções PURAS (testáveis sem DOM): quem joga com quem nas duplas, os
// lugares de cada um na mesa/quadra, onde cada jogador está a cada instante (cobrindo a sua metade, indo buscar a
// bola), a bola (saque, voo com arco, quique e sombra no chão) e a contagem do tênis.
//
// Linha do tempo de um ponto (a partir de `at`): saque (a bola sobe e desce sobre quem saca) e depois os golpes,
// um a cada `shot` ms, alternando os lados. Nas duplas do pingue-pongue os parceiros se revezam a cada golpe do
// lado deles (regra do esporte); no tênis rebate quem cobre a metade da quadra em que a bola cai.
import type { Bond } from './persona';
import type { SpotDef } from '../layout/types';
import { tr } from '../../../../shared/i18n';

export type RallyKind = 'table' | 'tennis';

/** Ritmo de cada jogo (ms): saque, um golpe (a bola cruzando de um lado ao outro) e a pausa entre pontos. */
export const RALLY_MS: Readonly<Record<RallyKind, { serve: number; shot: number; pause: number }>> = {
  table: { serve: 450, shot: 820, pause: 700 },
  tennis: { serve: 850, shot: 1250, pause: 1100 },
};

/** Jogador na mesa/quadra: lado (0 = oeste, 1 = leste) e o lugar "de casa" (px de mundo, pés). */
export interface RallyPlayer {
  id: string;
  side: 0 | 1;
  hx: number;
  hy: number;
}

export interface RallyState {
  kind: RallyKind;
  players: RallyPlayer[];
  /** Faixa (y, px) que cada lado cobre: [lado 0, lado 1]. */
  span: [[number, number], [number, number]];
  /** Início do ponto atual (saque), em ms; antes disso, pausa entre pontos (sem bola). */
  at: number;
  /** Lado de quem saca e quem saca nas duplas (índice no time, de norte a sul). */
  server: 0 | 1;
  serverIdx: number;
  /** Tênis: pontos do game em andamento [lado 0, lado 1]. */
  points: [number, number];
  /** Pontos jogados (alterna o saque). */
  played: number;
  seed: number;
}

export interface BallPos {
  /** Bola (px de mundo, já com a altura). */
  x: number;
  y: number;
  /** Sombra no chão (ou no tampo da mesa). */
  sx: number;
  sy: number;
  /** Altura acima do chão/tampo (px). */
  h: number;
}

// ---------------------------------------------------------------- times e lugares

/**
 * Ordem dos participantes de uma partida: [anfitrião, adversário, parceiro, adversário]. Com três convidados o
 * parceiro do anfitrião é um amigo dele (se houver) e um rival vai para o outro lado; com um, simples.
 */
export function teamUp<T>(host: T, guests: readonly T[], bond: (a: T, b: T) => Bond | null): T[] {
  if (guests.length < 3) return [host, ...guests];
  const [a, b, c, ...rest] = guests;
  const trio = [a, b, c];
  const partner = trio.find((g) => bond(host, g) === 'amizade') ?? trio.find((g) => bond(host, g) !== 'rivalidade') ?? b;
  const opps = trio.filter((g) => g !== partner);
  // um rival do anfitrião vai na frente (é o "capitão" do outro lado: a aposta é com ele)
  opps.sort((x, y) => Number(bond(host, y) === 'rivalidade') - Number(bond(host, x) === 'rivalidade'));
  return [host, opps[0], partner, opps[1], ...rest];
}

/** Lado de cada jogador pela posição na ordem de teamUp (0, 1, 0, 1). */
export function sideOf(index: number): 0 | 1 {
  return (index % 2) as 0 | 1;
}

/**
 * Lugares dos jogadores numa mesa/quadra (spots de um grupo): duplas = [oeste-norte, leste-norte, oeste-sul,
 * leste-sul]; simples = [oeste, leste]. null se o grupo não comporta.
 */
export function courtSeats(group: readonly SpotDef[], players: number): SpotDef[] | null {
  if (group.length < 2) return null;
  const cx = group.reduce((a, s) => a + s.x, 0) / group.length;
  const west = group.filter((s) => s.x < cx).sort((a, b) => a.y - b.y);
  const east = group.filter((s) => s.x >= cx).sort((a, b) => a.y - b.y);
  if (!west.length || !east.length) return null;
  if (players >= 4) return west.length >= 2 && east.length >= 2 ? [west[0], east[0], west[1], east[1]] : null;
  return [west[0], east[east.length - 1]];
}

/** Começa o rali: casa de cada jogador (simples: no meio do seu lado) e a faixa que cada lado cobre. */
export function newRally(kind: RallyKind, players: readonly { id: string; side: 0 | 1; spot: SpotDef }[], group: readonly SpotDef[], seed: number, at: number): RallyState {
  const cx = group.reduce((a, s) => a + s.x, 0) / Math.max(1, group.length);
  const pad = kind === 'tennis' ? 20 : 4;
  const span: [[number, number], [number, number]] = [
    [Infinity, -Infinity],
    [Infinity, -Infinity],
  ];
  const sideX: [number[], number[]] = [[], []];
  for (const s of group) {
    const side = s.x < cx ? 0 : 1;
    span[side][0] = Math.min(span[side][0], s.y - pad);
    span[side][1] = Math.max(span[side][1], s.y + pad);
    sideX[side].push(s.x);
  }
  for (const side of [0, 1] as const) {
    if (!Number.isFinite(span[side][0])) span[side] = [span[1 - side][0], span[1 - side][1]];
  }
  const mean = (a: number[], d: number) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : d);
  const count: [number, number] = [0, 0];
  for (const p of players) count[p.side]++;
  const out: RallyPlayer[] = players.map((p) => {
    const solo = count[p.side] < 2;
    const [y0, y1] = span[p.side];
    return { id: p.id, side: p.side, hx: solo ? mean(sideX[p.side], p.spot.x) : p.spot.x, hy: solo ? (y0 + y1) / 2 : p.spot.y };
  });
  return { kind, players: out, span, at, server: (seed & 1) as 0 | 1, serverIdx: 0, points: [0, 0], played: 0, seed: seed >>> 0 };
}

/** Alguém saiu no meio da partida: o lado dele segue com quem ficou (no meio do seu lado). */
export function dropPlayer(st: RallyState, id: string): void {
  const i = st.players.findIndex((p) => p.id === id);
  if (i < 0) return;
  const side = st.players[i].side;
  st.players.splice(i, 1);
  const rest = st.players.filter((p) => p.side === side);
  if (rest.length === 1) rest[0].hy = (st.span[side][0] + st.span[side][1]) / 2;
}

/** Jogadores de um lado, de norte a sul. */
export function team(st: RallyState, side: 0 | 1): RallyPlayer[] {
  return st.players.filter((p) => p.side === side).sort((a, b) => a.hy - b.hy);
}

/** Próximo ponto: pausa curta, saque alternando (nas duplas, revezando quem saca). */
export function nextPoint(st: RallyState, now: number): void {
  st.played++;
  st.at = now + RALLY_MS[st.kind].pause;
  // pingue-pongue troca o saque a cada 2 pontos; tênis, a cada game (aqui: a cada 4 pontos jogados)
  const every = st.kind === 'table' ? 2 : 4;
  if (st.played % every === 0) {
    st.server = (1 - st.server) as 0 | 1;
    if (st.server === 0) st.serverIdx++;
  }
}

// ---------------------------------------------------------------- bola e jogadores

/** Número pseudoaleatório em [0, 1) para o golpe k deste ponto (determinístico). */
function unit(st: RallyState, k: number): number {
  let h = (st.seed ^ Math.imul(Math.floor(st.at) | 0, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Lado que dá o golpe k. */
export function shotSide(st: RallyState, k: number): 0 | 1 {
  return (st.server ^ (k & 1)) as 0 | 1;
}

/** Quem dá o golpe k (k = 0 é o saque). */
export function hitter(st: RallyState, k: number): RallyPlayer | undefined {
  const side = shotSide(st, k);
  const t = team(st, side);
  if (t.length <= 1) return t[0];
  if (k === 0) return t[st.serverIdx % t.length];
  if (st.kind === 'table') {
    // duplas do pingue-pongue: os parceiros se revezam a cada golpe do lado deles
    const start = side === st.server ? st.serverIdx : st.serverIdx + 1;
    return t[(start + Math.floor(k / 2)) % t.length];
  }
  // tênis: quem cobre a metade em que a bola do golpe anterior cai
  const y = landY(st, k - 1);
  let best = t[0];
  for (const p of t) if (Math.abs(p.hy - y) < Math.abs(best.hy - y)) best = p;
  return best;
}

/** y (px) em que a bola do golpe k quica do outro lado (onde quem recebe vai buscá-la). */
export function landY(st: RallyState, k: number): number {
  const recv = (1 - shotSide(st, k)) as 0 | 1;
  const [y0, y1] = st.span[recv];
  const u = unit(st, k);
  if (st.kind === 'table') {
    // a bola vai na direção de quem vai rebater (revezamento fixo); só um pouquinho de variação
    const t = team(st, recv);
    const r = t.length <= 1 ? t[0] : t[((recv === st.server ? st.serverIdx : st.serverIdx + 1) + Math.floor((k + 1) / 2)) % t.length];
    const base = r ? r.hy : (y0 + y1) / 2;
    return base + (u - 0.5) * 8;
  }
  return y0 + (y1 - y0) * (0.12 + u * 0.76);
}

function ease(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function shotsStart(st: RallyState): number {
  return st.at + RALLY_MS[st.kind].serve;
}

/** Instante do golpe k. */
export function shotAt(st: RallyState, k: number): number {
  return shotsStart(st) + k * RALLY_MS[st.kind].shot;
}

/** Onde o jogador rebate o golpe j (k = 0: o saque, em casa). */
function hitY(st: RallyState, p: RallyPlayer, j: number): number {
  if (j <= 0) return p.hy;
  const [y0, y1] = st.span[p.side];
  return Math.max(y0, Math.min(y1, landY(st, j - 1)));
}

/**
 * Posição do jogador (px de mundo, pés) no instante `now`: vai até onde a bola vai cair, dá um passo à frente no
 * golpe e volta para o meio do seu lado quando a bola não é dele.
 */
export function playerPos(st: RallyState, id: string, now: number): { x: number; y: number } | null {
  const p = st.players.find((q) => q.id === id);
  if (!p) return null;
  if (now < st.at) return { x: p.hx, y: p.hy };
  const shot = RALLY_MS[st.kind].shot;
  const k0 = Math.max(0, Math.floor((now - shotsStart(st)) / shot));
  // golpes deste jogador em volta do instante atual (anterior e próximo)
  let prev = -1;
  let next = -1;
  for (let k = Math.max(0, k0 - 4); k <= k0 + 6; k++) {
    if (hitter(st, k) !== p) continue;
    if (shotAt(st, k) <= now) prev = k;
    else if (next < 0) next = k;
  }
  const t0 = prev >= 0 ? shotAt(st, prev) : st.at;
  const y0 = prev >= 0 ? hitY(st, p, prev) : p.hy;
  let y = p.hy;
  if (next >= 0) {
    const t1 = shotAt(st, next);
    const y1 = hitY(st, p, next);
    // longe do próximo golpe: volta para casa e só sai quando a bola vem
    if (t1 - t0 > shot * 2.5) {
      if (now < t0 + shot) y = y0 + (p.hy - y0) * ease((now - t0) / shot);
      else if (now > t1 - shot) y = p.hy + (y1 - p.hy) * ease((now - (t1 - shot)) / shot);
    } else y = y0 + (y1 - y0) * ease((now - t0) / (t1 - t0));
  } else if (prev >= 0) y = y0 + (p.hy - y0) * ease((now - t0) / shot);
  // passo à frente na hora do golpe (em direção à rede)
  const lunge = st.kind === 'tennis' ? 6 : 3;
  let dx = 0;
  for (const k of [prev, next]) {
    if (k < 0) continue;
    const d = Math.abs(now - shotAt(st, k));
    if (d < 260) dx = Math.max(dx, lunge * (1 - d / 260));
  }
  return { x: p.hx + (p.side === 0 ? dx : -dx), y };
}

/** Raquete (px) de quem rebate no instante t: um pouco à frente e acima dos pés. */
function racket(st: RallyState, p: RallyPlayer, t: number): { x: number; y: number; gy: number } {
  const pos = playerPos(st, p.id, t) ?? { x: p.hx, y: p.hy };
  const fwd = st.kind === 'tennis' ? 7 : 6;
  return { x: pos.x + (p.side === 0 ? fwd : -fwd), y: pos.y, gy: pos.y };
}

/**
 * A bola agora (null na pausa entre pontos). Pingue-pongue: a altura é sobre o tampo (a sombra fica no tampo, 9 px
 * acima dos pés); tênis: sobre a quadra, com arco alto e o quique do lado de quem recebe.
 */
export function ballAt(st: RallyState, now: number): BallPos | null {
  if (now < st.at || !st.players.length) return null;
  const ms = RALLY_MS[st.kind];
  const table = st.kind === 'table';
  const lift = table ? 9 : 0;
  if (now < shotsStart(st)) {
    // saque: a bola sobe da mão de quem saca e desce até a raquete
    const p = hitter(st, 0);
    if (!p) return null;
    const r = racket(st, p, now);
    const u = (now - st.at) / ms.serve;
    const top = table ? 14 : 34;
    const h = (table ? 6 : 12) + Math.sin(Math.PI * u) * (top - (table ? 6 : 12));
    return { x: r.x, y: r.gy - lift - h, sx: r.x, sy: r.gy - lift + (table ? 0 : 1), h };
  }
  const k = Math.floor((now - shotsStart(st)) / ms.shot);
  const a = hitter(st, k);
  const b = hitter(st, k + 1);
  if (!a || !b) return null;
  const t0 = shotAt(st, k);
  const u = (now - t0) / ms.shot;
  const ra = racket(st, a, t0);
  const rb = racket(st, b, t0 + ms.shot);
  const x = ra.x + (rb.x - ra.x) * u;
  const gy = ra.gy + (rb.gy - ra.gy) * u;
  // um quique do lado de quem recebe
  const ub = table ? 0.6 : 0.7;
  const h0 = table ? 5 : 12;
  const peak = table ? 9 + unit(st, k + 50) * 4 : 22 + unit(st, k + 50) * 14;
  const h1 = table ? 5 : 10;
  let h: number;
  if (u < ub) {
    const v = u / ub;
    h = h0 * (1 - v) + Math.sin(Math.PI * v) * peak;
  } else {
    const v = (u - ub) / (1 - ub);
    h = Math.sin((Math.PI / 2) * v) * h1 + Math.sin(Math.PI * v) * (table ? 3 : 6);
  }
  h = Math.max(0, h);
  return { x, y: gy - lift - h, sx: x, sy: gy - lift + (table ? 0 : 1), h };
}

// ---------------------------------------------------------------- contagem do tênis

const CALLS = ['0', '15', '30', '40'] as const;

/**
 * Marca um ponto do tênis para `side`: devolve true se fechou o game (os pontos voltam a zero e os games
 * em `games` sobem). Game = 4 pontos com 2 de vantagem.
 */
export function tennisPoint(points: [number, number], games: [number, number], side: 0 | 1): boolean {
  points[side]++;
  const o = 1 - side;
  if (points[side] >= 4 && points[side] - points[o] >= 2) {
    games[side]++;
    points[0] = 0;
    points[1] = 0;
    return true;
  }
  return false;
}

/** Como o placar do game é cantado ("30–15", "Iguais!", "Vantagem!"). */
export function tennisCall(points: readonly [number, number]): string {
  const [a, b] = points;
  if (a >= 3 && b >= 3) return a === b ? tr('Iguais!') : tr('Vantagem!');
  return `${CALLS[Math.min(3, a)]}–${CALLS[Math.min(3, b)]}`;
}

/** Placar curto do game para o mostrador ("30 15", "AD 40", "40 40"). */
export function tennisBoard(points: readonly [number, number]): [string, string] {
  const [a, b] = points;
  if (a >= 3 && b >= 3) {
    if (a === b) return ['40', '40'];
    return a > b ? ['ad', '40'] : ['40', 'ad'];
  }
  return [CALLS[Math.min(3, a)], CALLS[Math.min(3, b)]];
}

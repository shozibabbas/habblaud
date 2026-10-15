// Ralis (puro): times das duplas, lugares na mesa/quadra, revezamento dos parceiros, a bola e a contagem do tênis.
import { describe, expect, it } from 'vitest';
import type { SpotDef } from '../layout/types';
import { ballAt, courtSeats, dropPlayer, hitter, newRally, nextPoint, playerPos, RALLY_MS, shotAt, teamUp, tennisBoard, tennisCall, tennisPoint } from './rally';

const spot = (id: string, x: number, y: number): SpotDef => ({ id, kind: 'pingpong', areaId: 'a', tx: 0, ty: 0, x, y, dir: 'right', group: 'g' });
/** Mesa de duplas: oeste x=0, leste x=80; norte y=0, sul y=18. */
const QUAD = [spot('wn', 0, 0), spot('en', 80, 0), spot('ws', 0, 18), spot('es', 80, 18)];

describe('times e lugares', () => {
  it('duplas: o amigo joga com o anfitrião e o rival fica do outro lado (e é o capitão adversário)', () => {
    const bonds: Record<string, string> = { 'h:b': 'amizade', 'h:c': 'rivalidade' };
    const bond = (x: string, y: string) => (bonds[`${x}:${y}`] ?? null) as never;
    expect(teamUp('h', ['a', 'b', 'c'], bond)).toEqual(['h', 'c', 'b', 'a']);
    expect(teamUp('h', ['a'], bond)).toEqual(['h', 'a']);
    expect(teamUp('h', ['a', 'b', 'c', 'w'], () => null)).toEqual(['h', 'b', 'a', 'c', 'w']);
  });

  it('simples usa uma ponta de cada lado; duplas, as quatro', () => {
    expect(courtSeats(QUAD, 2)!.map((s) => s.id)).toEqual(['wn', 'es']);
    expect(courtSeats(QUAD, 4)!.map((s) => s.id)).toEqual(['wn', 'en', 'ws', 'es']);
    expect(courtSeats(QUAD.slice(0, 2), 4)).toBeNull();
    expect(courtSeats(QUAD.slice(0, 2), 2)!.map((s) => s.id)).toEqual(['wn', 'en']);
  });

  it('simples joga no meio do seu lado; duplas, cada um na sua metade', () => {
    const single = newRally('table', [
      { id: 'a', side: 0, spot: QUAD[0] },
      { id: 'b', side: 1, spot: QUAD[3] },
    ], QUAD, 7, 0);
    expect(single.players.map((p) => p.hy)).toEqual([9, 9]);
    const dbl = newRally('table', QUAD.map((s, i) => ({ id: s.id, side: (i % 2) as 0 | 1, spot: s })), QUAD, 7, 0);
    expect(dbl.players.map((p) => p.hy)).toEqual([0, 0, 18, 18]);
  });
});

describe('rali', () => {
  const dbl = () => newRally('table', QUAD.map((s, i) => ({ id: s.id, side: (i % 2) as 0 | 1, spot: s })), QUAD, 2, 1_000);

  it('lados alternam a cada golpe e, nas duplas do pingue-pongue, os parceiros se revezam', () => {
    const st = dbl();
    const seq = Array.from({ length: 8 }, (_, k) => hitter(st, k)!.id);
    for (let k = 0; k < 8; k++) expect(hitter(st, k)!.side).toBe((st.server ^ (k & 1)) as 0 | 1);
    // cada lado: os dois parceiros em sequência, sem repetir
    for (let k = 0; k + 2 < 8; k++) expect(seq[k]).not.toBe(seq[k + 2]);
    expect(new Set(seq).size).toBe(4);
  });

  it('a bola vai da raquete de um lado à do outro, com sombra, e some na pausa entre pontos', () => {
    const st = dbl();
    expect(ballAt(st, 999)).toBeNull();
    const ms = RALLY_MS.table;
    const k = 2;
    const a = hitter(st, k)!;
    const b = hitter(st, k + 1)!;
    const p0 = ballAt(st, shotAt(st, k) + 1)!;
    const p1 = ballAt(st, shotAt(st, k) + ms.shot - 1)!;
    expect(Math.sign(p0.x - 40)).toBe(a.side === 0 ? -1 : 1);
    expect(Math.sign(p1.x - 40)).toBe(b.side === 0 ? -1 : 1);
    const mid = ballAt(st, shotAt(st, k) + ms.shot * 0.3)!;
    expect(mid.h).toBeGreaterThan(0);
    expect(mid.y).toBeLessThan(mid.sy);
    nextPoint(st, 5_000);
    expect(ballAt(st, 5_000 + ms.pause - 1)).toBeNull();
    expect(ballAt(st, 5_000 + ms.pause + 10)).not.toBeNull();
  });

  it('tênis: quem recebe vai buscar a bola dentro da sua metade; simples cobre o lado inteiro', () => {
    const court = [spot('wn', 0, 100), spot('en', 400, 100), spot('ws', 0, 180), spot('es', 400, 180)];
    const st = newRally('tennis', [
      { id: 'a', side: 0, spot: court[0] },
      { id: 'b', side: 1, spot: court[3] },
    ], court, 11, 0);
    const ms = RALLY_MS.tennis;
    const ys: number[] = [];
    for (let k = 1; k < 12; k++) {
      const p = hitter(st, k)!;
      const pos = playerPos(st, p.id, shotAt(st, k))!;
      expect(pos.y).toBeGreaterThanOrEqual(st.span[p.side][0]);
      expect(pos.y).toBeLessThanOrEqual(st.span[p.side][1]);
      ys.push(pos.y);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(20);
    void ms;
  });

  it('alguém sai no meio das duplas: o parceiro joga sozinho no meio do lado', () => {
    const st = dbl();
    dropPlayer(st, 'ws');
    const wn = st.players.find((p) => p.id === 'wn')!;
    expect(wn.hy).toBe(9);
    for (let k = 0; k < 6; k++) expect(hitter(st, k)).toBeTruthy();
  });
});

describe('contagem do tênis', () => {
  it('15, 30, 40, iguais, vantagem e game', () => {
    const pts: [number, number] = [0, 0];
    const games: [number, number] = [0, 0];
    expect(tennisCall(pts)).toBe('0–0');
    tennisPoint(pts, games, 0);
    tennisPoint(pts, games, 1);
    tennisPoint(pts, games, 0);
    expect(tennisCall(pts)).toBe('30–15');
    tennisPoint(pts, games, 1);
    tennisPoint(pts, games, 1);
    tennisPoint(pts, games, 0);
    expect(tennisCall(pts)).toBe('Iguais!');
    tennisPoint(pts, games, 0);
    expect(tennisCall(pts)).toBe('Vantagem!');
    expect(tennisBoard(pts)).toEqual(['ad', '40']);
    expect(tennisPoint(pts, games, 0)).toBe(true);
    expect(games).toEqual([1, 0]);
    expect(pts).toEqual([0, 0]);
  });
});

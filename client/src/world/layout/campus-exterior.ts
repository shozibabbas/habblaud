// Área externa do campus: gramado, caminhos e calçadões entre os prédios, a praça sob o Commons, a rua
// com os carros ao sul, árvores, postes, bancos e totens nas entradas. Mesmo formato de layoutExterior
// (o render e a iluminação não distinguem um do outro). Puro.
import { mulberry32 } from '../../../../shared/hash';
import { BUILDING_H, COL_W, CORRIDOR_Y, EXT_EAST, EXT_NORTH, EXT_SOUTH, EXT_WEST, TILE } from '../constants';
import { PATH_DY, PATH_H, ROW_PITCH, roomColumnX, type CampusLayout } from './campus';
import { ceoGrounds } from './ceo';
import type { ExteriorLayout } from './exterior';
import { mosqueGrounds } from './mosque';
import type { ExteriorProp, FloorPatch, TileRect } from './types';

const hit = (r: TileRect, x: number, y: number, m = 0) => x >= r.x - m && y >= r.y - m && x < r.x + r.w + m && y < r.y + r.h + m;

export function layoutCampusExterior(campus: CampusLayout): ExteriorLayout {
  const inner = campus.inner;
  const bottom = inner.y + inner.h;
  // topo do campus: 0, ou a faixa de recreação ao norte da linha 0 (recreation.ts); a mata sobe junto
  const northY = inner.y;
  const bounds: TileRect = { x: inner.x - EXT_WEST, y: northY - EXT_NORTH, w: inner.w + EXT_WEST + EXT_EAST, h: bottom - northY + EXT_NORTH + EXT_SOUTH };
  const px = (t: number) => t * TILE;
  const floors: FloorPatch[] = [];
  const props: ExteriorProp[] = [];
  const rng = mulberry32(0xca4b + inner.w * 7 + inner.h);
  const seed = () => Math.floor(rng() * 1e9);
  const solids: TileRect[] = [campus.commons, ...campus.buildings.map((b) => b.rect)];
  /** Tile livre para árvore/arbusto: longe dos prédios (com folga para as copas) e fora dos caminhos. */
  const clear = (x: number, y: number, m = 2) => !solids.some((r) => hit(r, x, y, m)) && !campus.paths.some((r) => hit(r, x, y, 1)) && y < bottom + 1;

  floors.push({ kind: 'grass', x: px(bounds.x), y: px(bounds.y), w: px(bounds.w), h: px(bounds.h), seed: 11 });
  // rua ao sul, como no prédio único
  floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(bottom + 2), w: px(bounds.w), h: px(2), seed: 12 });
  floors.push({ kind: 'street', x: px(bounds.x), y: px(bottom + 4), w: px(bounds.w), h: px(5), seed: 13 });
  floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(bottom + 9), w: px(bounds.w), h: px(2), seed: 14 });
  // caminhos entre os prédios (os mesmos tiles que os agentes percorrem)
  campus.paths.forEach((r, i) => floors.push({ kind: 'sidewalk', x: px(r.x), y: px(r.y), w: px(r.w), h: px(r.h), seed: 20 + i }));
  // calçada diante da fachada sul de cada linha que não dá para a rua, e o caminho do Commons até a rua
  for (let row = 0; row < campus.rows - 1; row++) {
    const y = row * ROW_PITCH + BUILDING_H + 2;
    const xs = campus.buildings.filter((b) => b.row === row).map((b) => b.rect);
    if (!xs.length) continue;
    const x0 = Math.min(...xs.map((r) => r.x));
    const x1 = Math.max(...xs.map((r) => r.x + r.w));
    floors.push({ kind: 'sidewalk', x: px(x0), y: px(y), w: px(x1 - x0), h: px(2), seed: 40 + row });
  }
  const cx = campus.commons.x + campus.commons.w / 2;
  floors.push({ kind: 'sidewalk', x: px(cx - 1), y: px(BUILDING_H + 2), w: px(2), h: px(bottom - BUILDING_H), seed: 45 });

  // praça sob o Commons (quando há uma segunda linha): cruz de caminhos, canteiros, bancos e árvores
  if (campus.rows > 1) {
    const top = BUILDING_H + 4;
    const h = bottom - top - 1;
    const midY = top + Math.floor(h / 2);
    floors.push({ kind: 'sidewalk', x: px(campus.commons.x + 3), y: px(midY - 1), w: px(campus.commons.w - 6), h: px(2), seed: 46 });
    floors.push({ kind: 'sidewalk', x: px(cx - 4), y: px(midY - 4), w: px(8), h: px(8), seed: 47 });
    for (const [dx, dy] of [
      [-6, -5],
      [5, -5],
      [-6, 4],
      [5, 4],
    ] as const) {
      props.push({ kind: 'flowers', x: px(cx + dx) + 8, y: px(midY + dy) + 10, seed: seed() });
      props.push({ kind: 'bush', x: px(cx + dx + 1) + 8, y: px(midY + dy) + 12, seed: seed() });
    }
    props.push({ kind: 'rock', x: px(cx) - 6, y: px(midY) + 2, seed: seed() });
    props.push({ kind: 'rock', x: px(cx) + 8, y: px(midY) + 6, seed: seed() });
    for (const bx of [-12, -7, 6, 11]) props.push({ kind: 'bench', x: px(cx + bx), y: px(midY - 2) + 6, seed: seed() });
    for (let x = campus.commons.x + 3; x < campus.commons.x + campus.commons.w - 2; x += 6) {
      if (Math.abs(x - cx) < 6) continue;
      props.push({ kind: rng() < 0.3 ? 'pine' : 'tree', x: px(x) + 6, y: px(top + 2), seed: seed() });
      props.push({ kind: 'tree', x: px(x) + 2, y: px(bottom - 2), seed: seed() });
    }
    for (const lx of [cx - 5, cx + 5]) props.push({ kind: 'lamp', x: px(lx), y: px(midY - 3) + 6, seed: seed() });
    // bosquinho nos quatro canteiros da praça (longe dos caminhos)
    for (let y = top + 5; y < bottom - 3; y += 4) {
      for (let x = campus.commons.x + 3; x < campus.commons.x + campus.commons.w - 2; x += 5) {
        const jx = x + Math.floor(rng() * 3);
        const jy = y + Math.floor(rng() * 2);
        if (Math.abs(jx - cx) < 6 || Math.abs(jy - midY) < 3 || rng() < 0.35) continue;
        props.push({ kind: rng() < 0.25 ? 'pine' : rng() < 0.3 ? 'bush' : 'tree', x: px(jx) + 6, y: px(jy) + 8, seed: seed() });
      }
    }
  }

  // árvores: bosque ao norte e nas laterais, e uma fileira no gramado entre as linhas de prédios
  for (let x = bounds.x + 1; x < bounds.x + bounds.w - 1; x += 4 + Math.floor(rng() * 3)) {
    props.push({ kind: rng() < 0.25 ? 'pine' : 'tree', x: px(x) + Math.floor(rng() * 8), y: px(northY - 3) - Math.floor(rng() * 20), seed: seed() });
    if (rng() < 0.6) props.push({ kind: 'bush', x: px(x + 2), y: px(northY - 1) - 2, seed: seed() });
  }
  for (const [row, gap] of [
    [-6, 5],
    [-10, 6],
    [-14, 8],
  ] as const) {
    for (let x = bounds.x + 2; x < bounds.x + bounds.w - 1; x += gap + Math.floor(rng() * 4)) {
      props.push({ kind: rng() < 0.3 ? 'pine' : 'tree', x: px(x) + Math.floor(rng() * 8), y: px(northY + row) - Math.floor(rng() * 12), seed: seed() });
    }
  }
  for (const side of [-1, 1]) {
    for (const band of [0, 7, 13]) {
      const baseX = side < 0 ? inner.x - 6 - band : inner.x + inner.w + 4 + band;
      for (let y = northY + 1; y < bottom; y += 3 + Math.floor(rng() * 3)) {
        props.push({ kind: rng() < 0.3 ? 'pine' : 'tree', x: px(baseX + Math.floor(rng() * 5)), y: px(y + 1), seed: seed() });
      }
    }
  }
  for (let row = 1; row < campus.rows; row++) {
    // gramado entre a linha de cima e esta: fileira de árvores ao norte da fachada, arbustos soltos
    const top = row * ROW_PITCH;
    for (let x = inner.x + 1; x < inner.x + inner.w - 1; x += 4 + Math.floor(rng() * 3)) {
      const ty = top - 3;
      if (clear(x, ty, 1)) props.push({ kind: rng() < 0.3 ? 'pine' : 'tree', x: px(x) + Math.floor(rng() * 8), y: px(ty) + Math.floor(rng() * 6), seed: seed() });
      if (rng() < 0.4 && clear(x + 2, top - 6, 1)) props.push({ kind: 'bush', x: px(x + 2), y: px(top - 6), seed: seed() });
    }
  }

  // cerca viva + flores ao longo da fachada sul de cada prédio (com o portão do jardim de cada slot ao sul)
  const hedge = (x0: number, x1: number, y: number, gate: (x: number) => number | undefined, bld?: string) => {
    for (let x = x0; x < x1; x += 2) {
      const g = gate(x);
      props.push({ kind: (x / 2) % 3 === 1 ? 'flowers' : 'hedge', x: px(x) + TILE, y: px(y + 1) + 10, seed: x * 7 + y * 13 + 3, whenRoom: g, bld: g === undefined ? undefined : bld });
    }
  };
  hedge(campus.commons.x, campus.commons.x + campus.commons.w, BUILDING_H, () => undefined);
  for (const b of campus.buildings) {
    hedge(b.rect.x, b.rect.x + b.rect.w, b.y + BUILDING_H, (x) => {
      for (let k = 0; k < b.cols; k++) {
        const lx = x - roomColumnX(b, k);
        if (lx === 6 || lx === 8) return k * 2 + 1;
      }
      return undefined;
    }, b.id);
  }

  // postes: na calçada da rua, ao longo dos caminhos e dos calçadões
  for (let x = bounds.x + 4; x < bounds.x + bounds.w; x += 10) props.push({ kind: 'lamp', x: px(x), y: px(bottom + 3) + 6, seed: x });
  for (const r of campus.paths) {
    if (r.w >= r.h) {
      for (let x = r.x + 2; x < r.x + r.w - 1; x += 7) props.push({ kind: 'lamp', x: px(x), y: px(r.y) - 2, seed: x * 3 + r.y });
    } else {
      for (let y = r.y + 6; y < r.y + r.h - 4; y += 8) {
        props.push({ kind: 'lamp', x: px(r.x) - 4, y: px(y), seed: y * 5 + r.x });
        if ((y / 8) % 2 < 1) props.push({ kind: 'bench', x: px(r.x + r.w) + 10, y: px(y + 2), seed: y + r.x });
      }
    }
  }

  // totens: o da marca nas duas entradas do Commons e um em cada prédio (ao lado da entrada)
  const totemY = px(CORRIDOR_Y + 1) - 2;
  props.push({ kind: 'totem', x: px(campus.commons.x - 2) + 6, y: totemY, seed: 2 });
  props.push({ kind: 'totem', x: px(campus.commons.x + campus.commons.w + 2) - 6, y: totemY, seed: 3 });
  for (const b of campus.buildings) {
    const tx = b.wing === 'east' ? b.lobbyX - 2 : b.lobbyX + COL_W + 2;
    props.push({ kind: 'totem', x: px(tx) + (b.wing === 'east' ? 6 : -6), y: px(b.y + PATH_DY) - 2, seed: 4 + b.place });
    props.push({ kind: 'bush', x: px(tx) + (b.wing === 'east' ? -2 : 2), y: px(b.y + PATH_DY + PATH_H) + 14, seed: seed() });
  }

  // faixa de recreação: o piso dela, os enfeites e nada da mata em cima das áreas e caminhos
  const rec = campus.recreation;
  floors.push(...rec.floors);
  const kept = props.filter((p) => !rec.keepOut.some((r) => hit(r, p.x / TILE, p.y / TILE)));
  props.length = 0;
  props.push(...kept, ...rec.props);
  // mesquita ao norte da recreação: caminhos, postes, bancos, canteiros e árvores (layout/mosque.ts); a mata e os
  // enfeites da recreação saem de cima do prédio, da cúpula e dos caminhos
  const grounds = mosqueGrounds(campus.mosque, rng);
  floors.push(...grounds.floors);
  const clearOfMosque = props.filter((p) => !grounds.keepOut.some((r) => hit(r, p.x / TILE, p.y / TILE)));
  props.length = 0;
  props.push(...clearOfMosque, ...grounds.props);
  // diretoria (layout/ceo.ts, só com um dono): o calçadão estendido, os canteiros e as árvores dela
  if (campus.ceo) {
    const ceo = ceoGrounds(campus.ceo);
    floors.push(...ceo.floors);
    const clearOfCeo = props.filter((p) => !ceo.keepOut.some((r) => hit(r, p.x / TILE, p.y / TILE)));
    props.length = 0;
    props.push(...clearOfCeo, ...ceo.props);
  }

  const streetY = px(bottom + 4);
  const streetH = px(5);
  return {
    bounds,
    floors,
    props,
    lanes: [
      { y: streetY + Math.round(streetH * 0.36), dir: 1 },
      { y: streetY + Math.round(streetH * 0.86), dir: -1 },
    ],
    streetY,
    streetH,
  };
}

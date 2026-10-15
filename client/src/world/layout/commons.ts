// Commons: o prédio das áreas comuns no centro do campus (escritório combinado). Agentes de todas as
// máquinas dividem a recepção, a copa, os banheiros e o lounge, então tudo é maior que no núcleo do
// prédio único: mais lugares, mesas, sofás, cafeteiras, fliperamas e espelhos. Os ids das áreas são
// os mesmos do núcleo (core.ts): a vida social (rodas de TV, videogame, pingue-pongue, copa, espelho,
// jokenpô...) funciona sem mudanças, agora com gente de máquinas diferentes. Puro.
//
//   colunas 0–2 (48 tiles): recepção (col. 0, norte) | copa (cols. 1–2, norte)
//                           corredor aberto nas duas pontas (entradas leste e oeste)
//                           banheiros (col. 0, sul)  | lounge (cols. 1–2, sul)
import { COL_W, CORRIDOR_H, CORRIDOR_Y, NORTH_Y, ROOM_H, SOUTH_Y, TILE } from '../constants';
import { AreaBuilder, SEATED_SORT_BIAS } from './builder';
import { CAFE_ID, CORE_WALLS, LOUNGE_ID, RECEPTION_ID, RESTROOM_ID } from './core';
import type { AreaLayout } from './types';

/** Colunas do Commons. */
export const COMMONS_COLS = 3;
export const COMMONS_W = COMMONS_COLS * COL_W;
export const COMMONS_CORRIDOR_ID = 'core:corredor';

const RUNNERS = ['#8b9bb0', '#8597ab', '#909fb3'] as const;

export function layoutCommonsReception(): AreaLayout {
  const b = new AreaBuilder(RECEPTION_ID, 'reception', { x: 0, y: NORTH_Y, w: COL_W, h: ROOM_H });
  const wall = CORE_WALLS.reception;
  b.floor('marble', 0, 0, 16, 12, 111);
  b.rug(4.5, 3.6, 7, 1.9, '#3d5a80', 112);
  b.rug(1.4, 6.4, 6.2, 3.4, '#b65f3a', 113);
  b.rug(9.4, 6.4, 5.2, 3.4, '#7c6aa6', 114);
  b.face(0.5, 15, wall);
  b.cap(0, 0, 0.5, 12, wall);
  b.cap(15.5, 0, 0.5, 12, wall);
  b.area.edge = 'north';

  // a placa grande com a marca no meio da parede; janelas dos lados
  b.wall('sign', 8, undefined, { order: 0.9 });
  b.wall('window', 3, undefined, { order: 0.4 });
  b.wall('window', 13, undefined, { order: 0.45 });
  b.wall('clock', 5.4, undefined, { order: 0.7 });
  b.wall('painting', 10.75, undefined, { order: 0.6 });
  b.spot('window', 2, 2, 'up', { dx: 8, dy: 1 });
  b.spot('window', 12, 2, 'up', { dx: 8, dy: 1 });

  b.furn('plant_tall', 1, 2, 'monstera', { order: 0.2 });
  b.furn('plant_tall', 14, 2, 'palm', { order: 0.21 });
  // balcão da recepção (de frente para quem entra pelo corredor)
  b.furn('filing_cabinet', 5, 4, undefined, { order: 0.4 });
  b.furn('reception_desk', 6, 4, undefined, { order: 0.42 });
  b.furn('plant_small', 9, 4, 'flower', { order: 0.44 });
  b.furn('filing_cabinet', 10, 4, undefined, { order: 0.43 });

  // espera: duas poltronas em volta de uma mesinha (oeste) e um sofá virado para a câmera (leste)
  b.seat('armchair', 'armchair', 2, 8, 'right', 'right', { order: 0.6 });
  b.furn('coffee_table', 3, 8, undefined, { order: 0.58 });
  b.seat('armchair', 'armchair', 5, 8, 'left', 'left', { order: 0.61 });
  b.furn('floor_lamp', 1, 7, undefined, { order: 0.3 });
  const sofa = b.furn('sofa', 10, 7, 'down', { order: 0.55 });
  for (let i = 0; i < 3; i++) b.seat('bench', 'sofa', 10 + i, 7, 'down', 'down', { noFurniture: true, furnitureId: sofa });
  b.furn('coffee_table', 10, 9, undefined, { dx: TILE / 2, order: 0.57 });
  b.block(12, 9, 1, 1);
  b.furn('plant_small', 13, 7, 'fern', { order: 0.5 });
  b.furn('water_cooler', 14, 7, undefined, { order: 0.53 });
  b.spot('water', 14, 8, 'up', { dy: -3 });

  // aberta para o corredor: divisórias de vidro nas pontas
  for (const lx of [1, 2, 3, 12, 13, 14]) b.furn('glass_partition', lx, 11, 'h', { order: 0.15 });
  b.walk(1, 2, 14, 10);
  b.spot('talk', 7, 6, 'right', { group: 'talk:recepcao', dx: -1 });
  b.spot('talk', 8, 6, 'left', { group: 'talk:recepcao', dx: 1 });
  b.spot('talk', 7, 9, 'right', { group: 'talk:recepcao:2', dx: -1 });
  b.spot('talk', 8, 9, 'left', { group: 'talk:recepcao:2', dx: 1 });
  return b.build();
}

export function layoutCommonsRestroom(): AreaLayout {
  const b = new AreaBuilder(RESTROOM_ID, 'restroom', { x: 0, y: SOUTH_Y, w: COL_W, h: ROOM_H });
  const wall = CORE_WALLS.restroom;
  b.floor('tile_white', 0, 0, 16, 12, 211);
  b.rug(1, 3.15, 4, 0.85, '#6fa3b8', 212);
  b.face(0.5, 15, wall, [{ lx: 6, w: 2 }]);
  b.wall('door_frame', 7, undefined, { order: 0.05 });
  b.south(0.5, 15, 11, { ...wall, exterior: true });
  b.cap(0, 0, 0.5, 12, wall);
  b.cap(15.5, 0, 0.5, 12, wall);
  b.walk(1, 2, 14, 9);
  b.walk(6, 0, 2, 2);
  b.area.door = { x: 6, y: SOUTH_Y, w: 2, h: 2 };
  b.area.edge = 'south';

  // quatro pias lado a lado (o espelho comporta duplas: rodas de "ajeitar o cabelo")
  for (let i = 0; i < 4; i++) {
    b.wall('mirror', 1.5 + i, undefined, { order: 0.3 });
    b.furn('sink', 1 + i, 2, undefined, { order: 0.35 });
    b.spot('sink', 1 + i, 3, 'up', { dy: -3 });
  }
  b.furn('trash_bin', 5, 2, undefined, { order: 0.4 });
  b.wall('clock', 4.9, undefined, { order: 0.5 });

  // duas fileiras de cabines: encostadas na parede norte e uma ilha no meio
  for (const ly of [2, 6]) {
    for (let i = 0; i < 3; i++) {
      const lx = 9 + i * 2;
      const stall = b.furn('toilet_stall', lx, ly, undefined, { order: 0.3 + i * 0.05 + (ly - 2) * 0.01 });
      b.spot('stall', lx, ly + 2, 'up', { furnitureId: stall, x: b.px(lx + 1), y: b.py(ly + 2) - 3, sortY: b.py(ly + 2) - 0.5 });
    }
  }
  b.furn('plant_tall', 1, 10, 'ficus', { order: 0.21 });
  b.furn('plant_tall', 14, 10, 'monstera', { order: 0.22 });
  b.furn('plant_small', 1, 6, 'flower', { order: 0.24 });
  const bench = b.furn('bench', 3, 9, undefined, { order: 0.5 });
  for (let i = 0; i < 2; i++) b.seat('bench', 'bench', 3 + i, 9, 'down', undefined, { noFurniture: true, furnitureId: bench });
  b.rug(2.5, 9.9, 3, 0.9, '#9cc3cf', 213);
  b.furn('trash_bin', 6, 10, undefined, { order: 0.6 });
  return b.build();
}

export function layoutCommonsCafe(): AreaLayout {
  const W = 2 * COL_W;
  const b = new AreaBuilder(CAFE_ID, 'cafe', { x: COL_W, y: NORTH_Y, w: W, h: ROOM_H });
  const wall = CORE_WALLS.cafe;
  b.floor('tile_check', 0, 0, W, 12, 311);
  b.face(0.5, 16.5, CORE_WALLS.cafeSplash);
  b.face(17, W - 17.5, wall);
  b.cap(0, 0, 0.5, 12, wall);
  b.cap(W - 0.5, 0, 0.5, 12, wall);
  b.area.edge = 'north';

  // bancada comprida encostada na parede norte: quatro cafeteiras, duas geladeiras, máquinas de snacks
  b.furn('fridge', 1, 2, undefined, { order: 0.2 });
  b.spot('fridge', 1, 3, 'up', { dy: -3 });
  b.furn('counter', 2, 2, 'drawers', { order: 0.21 });
  b.furn('counter_sink', 3, 2, undefined, { order: 0.22 });
  b.spot('sink', 3, 3, 'up', { dy: -3 });
  b.furn('counter', 4, 2, 'plain', { order: 0.23 });
  for (const lx of [5, 6, 7, 8]) {
    const m = b.furn('coffee_machine', lx, 2, undefined, { order: 0.24 + lx * 0.005 });
    b.spot('coffee', lx, 3, 'up', { dy: -3, furnitureId: m });
  }
  b.furn('microwave', 9, 2, undefined, { order: 0.3 });
  b.furn('microwave', 10, 2, undefined, { order: 0.31 });
  b.furn('counter', 11, 2, 'drawers', { order: 0.32 });
  b.furn('fridge', 12, 2, undefined, { order: 0.33 });
  b.spot('fridge', 12, 3, 'up', { dy: -3 });
  for (const lx of [14, 15]) {
    const v = b.furn('vending_machine', lx, 2, undefined, { order: 0.34 + lx * 0.005 });
    b.spot('snack', lx, 3, 'up', { dy: -3, furnitureId: v });
  }
  b.furn('water_cooler', 16, 2, undefined, { order: 0.36 });
  b.spot('water', 16, 3, 'up', { dy: -3 });
  b.wall('shelf_wall', 3, undefined, { order: 0.4 });
  b.wall('poster', 6.5, 'coffee', { order: 0.45 });
  b.wall('clock', 9.5, undefined, { order: 0.6 });
  b.wall('shelf_wall', 12, undefined, { order: 0.41 });

  // janelas sobre as mesinhas bistrô (nada alto na frente delas)
  for (const [cx, i] of [
    [20, 0],
    [24, 1],
    [28, 2],
  ] as const) {
    b.wall('window', cx, undefined, { order: 0.4 + i * 0.02 });
    b.spot('window', cx - 1, 2, 'up', { dx: 8, dy: 1 });
  }

  // duas mesas comunitárias compridas (pares frente a frente: a roda da copa usa os pares norte/sul)
  for (const [x0, k] of [
    [2, 0],
    [10, 1],
  ] as const) {
    b.rug(x0 - 1.4, 4.15, 8.8, 3.7, k ? '#a77b52' : '#b98a5e', 312 + k);
    b.furn('meeting_table', x0, 5, undefined, { order: 0.5 + k * 0.02 });
    b.furn('meeting_table', x0 + 3, 5, undefined, { order: 0.51 + k * 0.02 });
    for (let i = 0; i < 6; i++) {
      const lx = x0 + i;
      b.seat('cafe_seat', 'cafe_chair', lx, 4, 'down', 'down', { order: 0.55 + k * 0.1 + i * 0.01 });
      b.seat('cafe_seat', 'cafe_chair', lx, 7, 'up', 'up', { order: 0.6 + k * 0.1 + i * 0.01 });
    }
  }

  // mesinhas bistrô junto às janelas (pares oeste/leste)
  let i = 0;
  for (const lx of [20, 24, 28]) {
    for (const ly of [5, 8]) {
      b.furn('cafe_table', lx, ly, undefined, { order: 0.75 + i * 0.01 });
      b.seat('cafe_seat', 'cafe_chair', lx - 1, ly, 'right', 'right', { order: 0.76 + i * 0.01 });
      b.seat('cafe_seat', 'cafe_chair', lx + 1, ly, 'left', 'left', { order: 0.77 + i * 0.01 });
      i++;
    }
  }
  b.furn('plant_tall', 1, 10, 'monstera', { order: 0.2 });
  b.furn('plant_tall', 30, 10, 'ficus', { order: 0.21 });
  b.furn('plant_tall', 30, 2, 'palm', { order: 0.22 });
  b.furn('plant_small', 18, 2, 'flower', { order: 0.23 });
  b.furn('trash_bin', 1, 6, undefined, { order: 0.6 });
  b.furn('trash_bin', 17, 6, undefined, { order: 0.61 });

  // aberta para o corredor, com vidro e duas passagens largas
  for (let lx = 1; lx < W - 1; lx++) if ((lx < 6 || lx > 9) && (lx < 22 || lx > 25)) b.furn('glass_partition', lx, 11, 'h', { order: 0.15 });
  b.walk(1, 2, W - 2, 10);
  b.spot('talk', 7, 9, 'right', { group: 'talk:copa', dx: -1 });
  b.spot('talk', 8, 9, 'left', { group: 'talk:copa', dx: 1 });
  b.spot('talk', 17, 9, 'right', { group: 'talk:copa:2', dx: -1 });
  b.spot('talk', 18, 9, 'left', { group: 'talk:copa:2', dx: 1 });
  return b.build();
}

export function layoutCommonsLounge(): AreaLayout {
  const W = 2 * COL_W;
  const b = new AreaBuilder(LOUNGE_ID, 'lounge', { x: COL_W, y: SOUTH_Y, w: W, h: ROOM_H });
  const wall = CORE_WALLS.lounge;
  b.floor('wood', 0, 0, W, 12, 411);
  b.rug(1.5, 3.2, 8, 5.2, '#4f8a5b', 412);
  b.rug(10.6, 4.4, 6.8, 5.2, '#d7c8a8', 413);
  b.rug(18.6, 4.6, 6.2, 4, '#8a5b4f', 414);
  // parede com a TV a oeste, passagem larga, vidro a leste
  b.face(0.5, 12.5, wall);
  b.face(16, W - 16.5, CORE_WALLS.glass);
  b.south(0.5, W - 1, 11, { ...wall, exterior: true });
  b.cap(0, 0, 0.5, 12, wall);
  b.cap(W - 0.5, 0, 0.5, 12, wall);
  b.walk(1, 2, W - 2, 9);
  b.walk(13, 0, 3, 2);
  b.area.door = { x: COL_W + 13, y: SOUTH_Y, w: 3, h: 2 };
  b.area.edge = 'south';

  b.wall('tv', 5, undefined, { order: 0.4 });
  b.wall('painting', 1.75, undefined, { order: 0.5 });
  b.wall('painting', 9.5, undefined, { order: 0.51 });

  // dois sofás lado a lado de costas para a câmera, de frente para a TV (6 lugares)
  for (const lx of [2, 5]) {
    const sofa = b.furn('sofa', lx, 6, 'up', { order: 0.5 + lx * 0.005 });
    for (let i = 0; i < 3; i++) b.seat('sofa', 'sofa', lx + i, 6, 'up', 'up', { noFurniture: true, furnitureId: sofa });
  }
  b.furn('coffee_table', 3, 4, undefined, { order: 0.45 });
  b.furn('coffee_table', 5, 4, undefined, { order: 0.46 });
  b.seat('armchair', 'armchair', 2, 4, 'right', 'right', { order: 0.55 });
  b.seat('armchair', 'armchair', 7, 4, 'left', 'left', { order: 0.56 });

  // pingue-pongue (jogadores nas pontas oeste/leste) com torcida dos dois lados
  b.furn('pingpong_table', 12, 6, undefined, { order: 0.4 });
  const ppY = b.py(7) + 5;
  const ppSort = b.py(8) + SEATED_SORT_BIAS;
  b.spot('pingpong', 11, 7, 'right', { x: b.px(12) - 8, y: ppY, group: 'pingpong', sortY: ppSort });
  b.spot('pingpong', 15, 7, 'left', { x: b.px(15) + 8, y: ppY, group: 'pingpong', sortY: ppSort });
  b.spot('watch', 12, 5, 'down', { group: 'watch:pingpong', dx: 2 });
  b.spot('watch', 14, 5, 'down', { group: 'watch:pingpong', dx: -2 });
  b.spot('watch', 12, 9, 'up', { group: 'watch:pingpong', dx: 2 });
  b.spot('watch', 14, 9, 'up', { group: 'watch:pingpong', dx: -2 });

  // fliperamas e estantes na parede de vidro
  for (const lx of [24, 25, 26, 27]) {
    b.furn('arcade', lx, 2, undefined, { order: 0.3 + lx * 0.002 });
    b.spot('arcade', lx, 3, 'up', { dy: -3 });
  }
  b.furn('bookshelf', 17, 2, undefined, { order: 0.3 });
  b.spot('shelf', 17, 3, 'up', { dx: 8, dy: -2 });
  b.furn('bookshelf', 20, 2, undefined, { order: 0.31 });
  b.spot('shelf', 20, 3, 'up', { dx: 8, dy: -2 });
  b.furn('binder_shelf', 22, 2, undefined, { order: 0.32 });
  b.furn('plant_small', 1, 2, 'fern', { order: 0.2 });
  b.furn('plant_tall', 11, 2, 'palm', { order: 0.21 });
  b.furn('plant_tall', 30, 2, 'monstera', { order: 0.22 });
  b.furn('printer', 1, 10, undefined, { order: 0.3 });
  b.furn('floor_lamp', 1, 8, undefined, { order: 0.32 });
  b.furn('plant_tall', 30, 10, 'ficus', { order: 0.23 });

  // cantinho de leitura a leste: poltronas em volta de uma mesa de centro (não contam como lugares da TV)
  b.seat('beanbag', 'armchair', 19, 6, 'right', 'right', { order: 0.62 });
  b.furn('coffee_table', 20, 6, undefined, { order: 0.6 });
  b.seat('beanbag', 'armchair', 22, 6, 'left', 'left', { order: 0.63 });
  b.furn('floor_lamp', 23, 5, undefined, { order: 0.33 });
  b.seat('beanbag', 'armchair', 20, 8, 'up', 'up', { order: 0.64 });
  b.seat('beanbag', 'armchair', 21, 8, 'up', 'up', { order: 0.65 });

  // puffs
  (['red', 'blue', 'yellow', 'green', 'red'] as const).forEach((c, i) => {
    b.seat('beanbag', 'beanbag', 2 + i * 2, 10, 'down', c, { order: 0.66 + i * 0.01 });
  });
  b.spot('talk', 26, 7, 'right', { group: 'talk:lounge', dx: -1 });
  b.spot('talk', 27, 7, 'left', { group: 'talk:lounge', dx: 1 });
  b.spot('talk', 26, 9, 'right', { group: 'talk:lounge:2', dx: -1 });
  b.spot('talk', 27, 9, 'left', { group: 'talk:lounge:2', dx: 1 });
  return b.build();
}

/** Corredor do Commons: aberto nas duas pontas (entradas para as alas leste e oeste do campus). */
export function layoutCommonsCorridor(): AreaLayout {
  const w = COMMONS_W;
  const b = new AreaBuilder(COMMONS_CORRIDOR_ID, 'corridor', { x: 0, y: CORRIDOR_Y, w, h: CORRIDOR_H });
  b.floor('concrete', 0, 0, w, CORRIDOR_H, 511);
  // portas de vidro nas pontas: colunas nas quinas, vão aberto no meio
  for (const lx of [0, w - 1]) {
    b.furn('glass_partition', lx, 0, 'end', { order: 0.1 });
    b.furn('glass_partition', lx, CORRIDOR_H - 1, 'end', { order: 0.1 });
  }
  b.walk(0, 1, w, CORRIDOR_H - 2);
  b.walk(1, 0, w - 2, CORRIDOR_H);
  for (let c = 0; c < COMMONS_COLS; c++) {
    const x = c * COL_W;
    if (c === 0) {
      b.furn('plant_tall', x + 2, 4, 'palm', { order: 0.5 });
      b.furn('plant_small', x + 13, 4, 'flower', { order: 0.5 });
    } else if (c === 1) {
      const bench = b.furn('bench', x + 2, 0, undefined, { order: 0.5 });
      for (let i = 0; i < 2; i++) b.seat('bench', 'bench', x + 2 + i, 0, 'down', undefined, { noFurniture: true, furnitureId: bench });
      b.furn('plant_small', x + 11, 4, 'succulent', { order: 0.5 });
    } else {
      const bench = b.furn('bench', x + 11, 0, undefined, { order: 0.5 });
      for (let i = 0; i < 2; i++) b.seat('bench', 'bench', x + 11 + i, 0, 'down', undefined, { noFurniture: true, furnitureId: bench });
      b.furn('plant_tall', x + 13, 0, 'monstera', { order: 0.5 });
      b.furn('plant_tall', x + 13, 4, 'ficus', { order: 0.5 });
    }
    b.rug(x + 2, 1.95, COL_W - 4, 1.1, RUNNERS[c % RUNNERS.length], 512 + c);
    b.spot('talk', x + 5, 2, 'right', { group: `talk:corredor:${c}`, dx: -1 });
    b.spot('talk', x + 6, 2, 'left', { group: `talk:corredor:${c}`, dx: 1 });
  }
  return b.build();
}

let commonsCache: AreaLayout[] | null = null;

/** Áreas do Commons na origem do mundo (calculadas uma vez). */
export function commonsAreas(): AreaLayout[] {
  return (commonsCache ??= [layoutCommonsReception(), layoutCommonsRestroom(), layoutCommonsCafe(), layoutCommonsLounge(), layoutCommonsCorridor()]);
}

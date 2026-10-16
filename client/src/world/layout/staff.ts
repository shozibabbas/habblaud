// Canto da limpeza: a base da equipe (world/sim/staff.ts) dentro do banheiro do núcleo (prédio único) ou do Commons
// (campus). Estante de produtos, tanque de serviço, banquetas para descansar entre as rondas e as vagas dos
// carrinhos (tiles bloqueados: ninguém passa por cima de um carrinho estacionado). Os spots são do tipo 'staff' e
// nenhum agente os usa; o grupo diz para que servem. Puro.
import type { Dir } from '../../art/api';
import type { AreaBuilder } from './builder';

/** Grupos dos spots 'staff'. */
export const STAFF_REST = 'staff:descanso';
export const STAFF_SINK = 'staff:tanque';
export const STAFF_CART = 'staff:carrinho';
/** Recepção: a cadeira atrás do balcão, onde quem assume espera a troca, e o arquivo (quem está de folga fica ali). */
export const STAFF_DESK = 'staff:recepcao';
export const STAFF_DESK_SWAP = 'staff:recepcao:troca';
export const STAFF_DESK_BACK = 'staff:recepcao:arquivo';

type At = readonly [lx: number, ly: number];
type AtDir = readonly [lx: number, ly: number, dir: Dir];

export interface JanitorCornerSpec {
  shelf: At;
  sink: At;
  /** Onde se fica para usar o tanque (em pé, virado para ele). */
  sinkSpot: AtDir;
  /** Banquetas de descanso (uma por pessoa da equipe). */
  seats: readonly AtDir[];
  /** Vagas dos carrinhos: o tile do carrinho (bloqueado) e o tile de onde se estaciona/pega (caminhável). */
  park: readonly (readonly [lx: number, ly: number, ax: number, ay: number])[];
}

/**
 * Monta o canto no banheiro. Chamado no FIM do layout da área (os ids dos móveis e spots que já existiam não
 * mudam: o sufixo de cada id é a ordem de criação).
 */
export function janitorCorner(b: AreaBuilder, spec: JanitorCornerSpec): void {
  b.furn('janitor_shelf', spec.shelf[0], spec.shelf[1], undefined, { order: 0.7 });
  const sink = b.furn('mop_sink', spec.sink[0], spec.sink[1], undefined, { order: 0.72 });
  const [sx, sy, sd] = spec.sinkSpot;
  b.spot('staff', sx, sy, sd, { group: STAFF_SINK, furnitureId: sink });
  spec.seats.forEach(([lx, ly, dir], i) => b.seat('staff', 'stool', lx, ly, dir, undefined, { group: STAFF_REST, order: 0.74 + i * 0.01 }));
  for (const [lx, ly, ax, ay] of spec.park) {
    // aproximação no tile vizinho; a posição final (o carrinho) é o centro do tile bloqueado
    const dir: Dir = ax < lx ? 'right' : ax > lx ? 'left' : ay < ly ? 'down' : 'up';
    b.spot('staff', ax, ay, dir, { group: STAFF_CART, x: b.px(lx + 0.5), y: b.py(ly + 1) - 2 });
    b.block(lx, ly, 1, 1);
  }
}

/** Banheiro do prédio único: canto sudeste, encostado na parede leste (2 pessoas). */
export const CORE_JANITOR_CORNER: JanitorCornerSpec = {
  shelf: [14, 7],
  sink: [14, 8],
  sinkSpot: [13, 8, 'right'],
  seats: [
    [13, 7, 'down'],
    [13, 9, 'down'],
  ],
  park: [
    [12, 7, 12, 8],
    [12, 9, 12, 8],
  ],
};

/** Banheiro do Commons: fileira ao longo da parede sul, a leste do banco (até 4 pessoas). */
export const COMMONS_JANITOR_CORNER: JanitorCornerSpec = {
  shelf: [9, 10],
  sink: [10, 10],
  sinkSpot: [10, 9, 'down'],
  seats: [
    [11, 9, 'down'],
    [12, 9, 'down'],
    [13, 9, 'down'],
    [8, 9, 'down'],
  ],
  park: [
    [11, 10, 11, 9],
    [12, 10, 12, 9],
    [13, 10, 13, 9],
    [7, 10, 7, 9],
  ],
};

export interface ReceptionDeskSpec {
  /** Cadeira atrás do balcão (virada para quem chega). */
  chair: At;
  /** Ao lado da cadeira: quem vai assumir espera ali até a outra pessoa levantar. */
  swap: AtDir;
  /** Diante do arquivo, atrás do balcão: quem está de folga organiza a papelada ali. */
  back: AtDir;
}

/** Cadeira e pontos da equipe da recepção atrás do balcão. Chamado no FIM do layout da recepção. */
export function receptionDesk(b: AreaBuilder, spec: ReceptionDeskSpec): void {
  b.seat('staff', 'office_chair_front', spec.chair[0], spec.chair[1], 'down', 'black', { group: STAFF_DESK, order: 0.43 });
  // um pouco para fora: quem espera não cobre quem está sentado
  b.spot('staff', spec.swap[0], spec.swap[1], spec.swap[2], { group: STAFF_DESK_SWAP, dx: 5 });
  b.spot('staff', spec.back[0], spec.back[1], spec.back[2], { group: STAFF_DESK_BACK });
}

/** Recepção do prédio único: balcão em (9..11, 5), arquivo em (8, 5). */
export const CORE_RECEPTION_DESK: ReceptionDeskSpec = { chair: [10, 4], swap: [11, 4, 'left'], back: [8, 4, 'down'] };

/** Recepção do Commons: balcão em (6..8, 4), arquivos em (5, 4) e (10, 4). */
export const COMMONS_RECEPTION_DESK: ReceptionDeskSpec = { chair: [7, 3], swap: [8, 3, 'left'], back: [5, 3, 'down'] };

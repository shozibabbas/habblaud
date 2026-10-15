// Perfil regional 'pk' (paquistanês; servidor com HABBLAUD_NAMES=pk, ver AgentInfo.appearance): só troca as tabelas e
// os pesos do sorteio de appearance.ts. A ordem e a quantidade de sorteios são as mesmas do padrão.
// As cores repetem as das tabelas padrão (o editor do personagem continua achando a peça sorteada na paleta).
import type { ProfileTables } from './appearance';

export const PROFILE_PK: ProfileTables = {
  // Tons médios e morenos dominam; um pouco do claro-rosado e do marrom mais escuro; sem os extremos.
  skins: [
    ['#f6cfb0', 5],
    ['#eab894', 20],
    ['#d69f78', 28],
    ['#bd8560', 24],
    ['#9a6444', 12],
    ['#7a4a31', 3],
  ],
  // Preto e castanho-escuro; algum castanho; um pouco de grisalho e branco. Sem loiro, ruivo nem cores "divertidas"
  // (o sorteio de cor divertida cai aqui também).
  hair: [
    ['#2b2530', 9], // preto
    ['#3f2c22', 7], // castanho-escuro
    ['#5f3c28', 2.5], // castanho
    ['#87593a', 0.4], // castanho-claro
    ['#8f929b', 0.9], // grisalho
    ['#d9dbe0', 0.3], // branco
  ],
  // Castanho-escuro e quase preto; verde é raro.
  eyes: [
    ['#2b2236', 5],
    ['#4a2f22', 6],
    ['#5a3b22', 3],
    ['#3c7a52', 0.35],
  ],
  hairStyle: {
    m: {
      short: 22, buzz: 10, spiky: 3, side_part: 20, curly: 3, afro: 0.2, bob: 0, long: 0.5, ponytail: 0.2, bun: 0.1,
      pigtails: 0, mohawk: 0.2, bald: 5, wavy: 12,
    },
    f: {
      short: 1.5, buzz: 0.1, spiky: 0.2, side_part: 5, curly: 3, afro: 0.1, bob: 6, long: 22, ponytail: 16, bun: 12,
      pigtails: 0.3, mohawk: 0, bald: 0, wavy: 14,
    },
  },
  topStyle: {
    m: { tshirt: 12, hoodie: 6, shirt_tie: 16, sweater: 14, jacket: 14, blouse: 0, polo: 16 },
    f: { tshirt: 8, hoodie: 5, shirt_tie: 3, sweater: 14, jacket: 12, blouse: 22, polo: 6 },
  },
  accessory: {
    m: { none: 44, glasses: 24, sunglasses: 4, headphones: 12, cap: 4, beanie: 3, earrings: 0, bow: 0 },
    f: { none: 38, glasses: 18, sunglasses: 3, headphones: 8, cap: 1, beanie: 2, earrings: 22, bow: 2 },
  },
  // ~65% com barba ou bigode (só vale para o look 'm').
  facialHair: { none: 35, stubble: 20, beard: 26, mustache: 12, goatee: 7 },
  bottomStyle: {
    m: { pants: 100, shorts: 0, skirt: 0 },
    f: { pants: 88, shorts: 0, skirt: 12 },
  },
};

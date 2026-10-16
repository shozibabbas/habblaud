// Tipos do layout do escritório. Módulos de layout são PUROS (sem DOM): geram descrições
// que o render transforma em pixels e a simulação usa para caminhos e pontos de interesse.
import type { Dir, FloorKind, FurnitureKind, WallStyle } from '../../art/api';

export type AreaKind = 'reception' | 'restroom' | 'cafe' | 'lounge' | 'room' | 'corridor' | 'meeting'
  | 'mosque' // (aditivo) salão de oração do campus (layout/mosque.ts)
  | 'executive'; // (aditivo) sala da diretoria do campus (layout/ceo.ts); a antessala é 'reception'

/** Retângulo em tiles (coordenadas absolutas do mundo). */
export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Móvel de chão posicionado. */
export interface FurniturePlacement {
  id: string;
  kind: FurnitureKind;
  variant?: string;
  /** Canto superior esquerdo do footprint, em tiles absolutos. */
  tx: number;
  ty: number;
  /** Deslocamento do desenho em px (ex.: cadeira centralizada numa mesa de 2 tiles). Não afeta o footprint. */
  dx?: number;
  dy?: number;
  /** Ordem relativa na animação de montagem (0..1). */
  order: number;
  /** Para mesas: índice do lugar (a tela segue a atividade de quem senta ali). */
  seat?: string;
}

/** Item montado em parede. `cx` = centro em px de mundo; `baseY` = linha do rodapé em px. */
export interface WallItemPlacement {
  id: string;
  kind: FurnitureKind;
  variant?: string;
  cx: number;
  baseY: number;
  /** 'face' = face da parede norte; 'south' = sobre a mureta da parede sul. */
  on: 'face' | 'south';
  order: number;
}

export interface Doorway {
  x: number;
  w: number;
}

/** Trecho de parede em px de mundo. */
export type WallSegment =
  | { kind: 'face'; x: number; y: number; w: number; style: WallStyle; doorways?: Doorway[] }
  | { kind: 'south'; x: number; y: number; w: number; style: WallStyle; doorways?: Doorway[] }
  | { kind: 'cap'; x: number; y: number; w: number; h: number; style: WallStyle };

export interface FloorPatch {
  kind: FloorKind;
  /** px de mundo */
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
  tint?: string;
  tint2?: string;
}

export interface RugPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  seed: number;
}

export type SpotKind =
  | 'desk' // lugar de trabalho (mesa + cadeira)
  | 'stool' // banqueta da mesa de reunião
  | 'nook' // poltrona/puff dentro da sala de projeto (lugar extra de trabalho, com notebook)
  | 'stand' // ponto em pé dentro da sala (trabalho sem mesa)
  | 'switch' // interruptor de luz
  | 'whiteboard'
  | 'coffee'
  | 'water'
  | 'snack'
  | 'fridge'
  | 'cafe_seat'
  | 'sofa'
  | 'armchair'
  | 'beanbag'
  | 'bench'
  | 'pingpong'
  | 'arcade'
  | 'shelf'
  | 'window'
  | 'stall'
  | 'sink'
  | 'elevator'
  | 'talk'
  | 'watch' // ponto em pé da torcida (assistir a uma partida); sentado nos bancos da quadra de tênis
  // --- recreação do campus (layout/recreation.ts)
  | 'tennis' // jogador na quadra de tênis (4 por quadra: duas duplas)
  | 'pod' // cápsula de dormir (quem entra some e a cápsula fecha)
  | 'smoke' // lugar na área de fumantes (em pé junto ao cinzeiro ou no banco do abrigo)
  // --- mesquita (aditivo; layout/mosque.ts)
  | 'shoes' // diante da sapateira (tirar/calçar os sapatos)
  | 'headwear' // diante do cesto de topis / cabideiro de hijabs
  | 'wudu' // banquinho da ablução (assento virado para a torneira)
  | 'prayer' // lugar na fila (saf), virado para a qibla
  // --- diretoria (aditivo; layout/ceo.ts). Só o dono e a secretária usam: ninguém mais é mandado para cá
  | 'ceo_desk' // dono sentado à mesa (cadeira executiva)
  | 'ceo_stand' // dono em pé à mesma mesa, com o tampo erguido (a cadeira rola para o lado)
  | 'ceo_call' // junto à janela, andando de um lado para o outro ao telefone (dois pontos, rank 0 e 1)
  | 'ceo_meeting' // cadeira da mesa oval do cantinho de reunião (quatro, um grupo)
  | 'ceo_coffee' // diante do bar de chai e café
  | 'ceo_guest' // lugar no sofá de visitas da sala (dois, um grupo)
  | 'ceo_door' // na antessala, diante da porta de vidro da sala (bater, anunciar alguém, receber)
  | 'secretary' // cadeira da secretária (mesa com monitor)
  | 'visitor'; // cadeira de espera da antessala (duas, um grupo)

/**
 * Ponto de interesse. O personagem anda até o tile de aproximação (tx, ty), caminhável,
 * e então "encaixa" na posição final (x, y) em px, virado para `dir`.
 */
export interface SpotDef {
  id: string;
  kind: SpotKind;
  areaId: string;
  tx: number;
  ty: number;
  x: number;
  y: number;
  dir: Dir;
  seated?: boolean;
  /** Móvel associado (cadeira, máquina, cabine...). */
  furnitureId?: string;
  /** Profundidade a usar quando ocupado (assentos: logo depois do móvel). */
  sortY?: number;
  /** Spots em par (ping-pong, conversa) compartilham o grupo. */
  group?: string;
  /** Mesa cuja tela acompanha quem está sentado aqui. */
  deskId?: string;
  /** Ordem de preferência (mesas). */
  rank?: number;
  /** Lado da ilha: 'S' = de costas (tela visível), 'N' = de frente (desk_back). */
  side?: 'S' | 'N';
}

export interface AreaLayout {
  id: string;
  kind: AreaKind;
  /** Retângulo da área em tiles absolutos. */
  rect: TileRect;
  floors: FloorPatch[];
  rugs: RugPatch[];
  walls: WallSegment[];
  wallItems: WallItemPlacement[];
  furniture: FurniturePlacement[];
  spots: SpotDef[];
  /** Tiles caminháveis (absolutos), além dos que são bloqueados por móveis. */
  walkable: TileRect[];
  /** Tiles explicitamente bloqueados (divisórias desenhadas como piso, etc.). */
  blocked?: TileRect[];
  /** Tiles da porta (absolutos). */
  door?: TileRect;
  /** Para salas de projeto: o lado do corredor em que está. */
  side?: 'north' | 'south';
  /** Tom (cor hex) aplicado de leve sobre o piso, para cada sala ter identidade própria. */
  floorTint?: string;
  /** Retângulo (px) escurecido quando a luz está apagada. */
  shade?: { x: number; y: number; w: number; h: number };
  /** Retângulo (px) da placa com o nome. */
  signId?: string;
  /**
   * Fachada externa da área: 'north' = parede norte dá para o gramado (janelas), 'south' = mureta sul dá para
   * o jardim. Sem o campo, vale a regra do prédio único (y = 0 ao norte, fim do prédio ao sul).
   */
  edge?: 'north' | 'south';
  /** Campus (escritório combinado): prédio da máquina a que a área pertence (ausente = Commons/prédio único). */
  bld?: string;
  /** Texto da placa de uma área comum (ex.: o nome da máquina no saguão do prédio dela). */
  signText?: string;
  /**
   * Campus: área de recreação (layout/recreation.ts). 'court' e 'smoking' ficam ao ar livre (a iluminação as
   * trata como gramado, com os refletores da quadra à noite); 'rest' (cápsulas) fica na penumbra.
   */
  rec?: 'games' | 'rest' | 'court' | 'smoking';
  /** Campus: área da diretoria (layout/ceo.ts): 'office' = sala do dono, 'reception' = antessala da secretária. */
  ceo?: 'office' | 'reception';
}

/** Elemento decorativo externo (árvore, arbusto, poste...) desenhado pelo próprio mundo. */
export interface ExteriorProp {
  kind: 'tree' | 'pine' | 'bush' | 'flowers' | 'lamp' | 'bench' | 'rock' | 'hedge' | 'parasol' | 'totem' | 'paving';
  /** px de mundo: ponto central inferior (base). */
  x: number;
  y: number;
  seed: number;
  /** Slot ao qual pertence (some quando há sala ali). */
  slot?: number;
  /** O contrário: só aparece quando HÁ sala neste slot (ex.: cerca viva que fecha o caminho do jardim). */
  whenRoom?: number;
  /** Campus: prédio (máquina) a que `slot`/`whenRoom` se referem. */
  bld?: string;
}

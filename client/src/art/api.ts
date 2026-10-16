// CONTRATO do módulo de arte (pixel art procedural).
//
// - Implementação: client/src/art/index.ts (+ arquivos internos de art/).
// - Consumidores: client/src/world/** (render do escritório) e client/src/ui/** (avatares).
// - Regra: mudanças aqui devem ser ADITIVAS. Não renomeie/remova tipos, kinds ou funções.
//
// Convenções gerais
// - Mundo em "pixels de mundo"; 1 tile = TILE px. Tudo é pixel art em 1x, ampliado pela câmera
//   com imageSmoothingEnabled = false.
// - Perspectiva: top-down 3/4, como em tilesets de escritório moderno em pixel art. Ver DIREÇÃO DE ARTE abaixo. Vemos o topo e a FRENTE (face sul)
//   dos objetos. Paredes norte mostram a face (2 tiles de altura); paredes laterais e sul aparecem
//   só como "tampa" fina para não esconder o interior das salas.
// - Luz vem de cima/esquerda: topos mais claros, faces frontais mais escuras, sombra suave embaixo.
// - Sprites são HTMLCanvasElement em cache (gere uma vez, reutilize sempre).

// DIREÇÃO DE ARTE (pixel art top-down 3/4 de escritório moderno, claro e detalhado)
// - Escritório claro e limpo: porcelanato claro com rejunte sutil, madeira quente no lounge, paredes claras,
//   divisórias de vidro azulado, estantes com pastas coloridas, plantas em vasos, quadros, placa com o nome.
// - Ilhas de mesas com 1–2 monitores de tela azulada brilhante, teclado, mouse, caneca, papéis; cadeiras grafite.
// - Copa com bancada clara e frontão de mármore, pia inox, cafeteira, geladeira; bebedouro com galão azul.
// - Lounge com sofá azul/cinza-azulado e almofadas laranja, tapete, mesa de centro, bonsai, impressora grande.
// - Paleta clara (neutros frios + madeira quente + acentos saturados nos objetos); contorno 1px cinza-azulado
//   escuro (não preto); 3–4 tons por material; brilhos especulares; sombras de contato; muitos detalhes pequenos.

import type { AppearanceParts } from '../../../shared/appearance';
import type { AppearanceProfile } from '../../../shared/types';

export const TILE = 16;

export type Dir = 'down' | 'up' | 'left' | 'right';

/**
 * Poses do personagem. Entre parênteses: nº de frames esperado.
 * Poses "sentadas" (sit/type/sleep) assumem que o personagem está sobre um assento: as pernas
 * ficam escondidas/dobradas e o corpo fica ~4px mais baixo que em pé.
 */
export type Pose =
  | 'stand' // em pé parado, respiração sutil (2)
  | 'walk' // andando (4)
  | 'run' // correndo, passos mais largos e corpo inclinado (4)
  | 'sit' // sentado parado (2)
  | 'type' // sentado digitando — normalmente dir 'up', de costas para a câmera, braços alternando (4)
  | 'sleep' // sentado cochilando: cabeça baixa (2)
  | 'drink' // em pé levando o copo à boca (2) — use com held 'coffee' ou 'water'
  | 'use' // em pé operando máquina: braço estendido para frente (2)
  | 'raise_hand' // braço levantado acenando — pedindo atenção (2); funciona em pé e sentado (opts.seated)
  | 'talk' // em pé conversando, gesticulando (2)
  | 'stretch' // em pé se espreguiçando, braços para cima (2)
  | 'read' // em pé ou sentado segurando livro/papéis à frente (2)
  | 'play' // ping-pong: raquete na mão, alternando braço (2)
  | 'wait' // sentado esperando algo terminar (ex.: um shell), recostado (2). Com held 'popcorn': mão do balde à boca, comendo pipoca; sem item: braços cruzados, dedos/pé batendo
  // --- vida social (aditivo)
  | 'cheer' // comemorando: os dois braços para o alto, punhos cerrados, boca aberta, pulinho no quadro 1 (2). Em pé ou sentado (opts.seated)
  | 'laugh' // gargalhando: olhos fechados em arco, boca aberta, uma mão na barriga, corpo sacudindo 1px (2). Em pé ou sentado
  | 'game' // jogando videogame: controle (held 'controller') nas duas mãos à frente do peito, polegares mexendo, corpo inclinado para a tela (2). Em pé ou sentado
  | 'rps' // pedra-papel-tesoura. held 'none': punho fechado subindo (quadro 0) e descendo (1) na contagem "jo-ken-pô"; held 'rock'|'paper'|'scissors': braço estendido à frente mostrando o gesto (2). Em pé (sentado também funciona)
  | 'groom' // diante do espelho (normalmente dir 'up', de costas): uma mão perto do rosto/cabelo indo e voltando — batom, pente, ajeitar o cabelo (2). held opcional 'lipstick'|'comb'. Em pé
  | 'sulk' // chateado (perdeu a aposta/partida): ombros caídos, cabeça baixa, olhos semicerrados, braços pendurados (2). Em pé ou sentado
  // --- mesquita (aditivo): oração voluntária (nafl), sempre de perfil virado para a qibla (dir 'left' = oeste).
  // Desenhadas em character/prayer.ts com as mesmas peças do corpo (roupas e acessórios acompanham a postura).
  | 'takbir' // em pé, mãos abertas na altura das orelhas (1)
  | 'qiyam' // em pé, mãos cruzadas à frente (abaixo do umbigo; look 'f': no peito) (1)
  | 'ruku' // curvado, costas retas na horizontal, mãos nos joelhos (1)
  | 'sujood' // prostrado: ajoelhado, testa e mãos no chão (1)
  | 'jalsa' // ajoelhado sentado sobre os calcanhares, mãos nas coxas (jalsa/tashahhud) (1)
  | 'salam' // ajoelhado, cabeça virada à direita (quadro 0) e depois à esquerda (1) (2)
  | 'wudu' // ablução: sentado no banquinho diante da torneira, mãos na água (0) e no rosto (1) (2)
  // --- ligações e mesa alta (aditivo)
  | 'phone' // falando ao celular: aparelho na orelha, a outra mão gesticulando e a boca mexendo (3). Em pé ou sentado (opts.seated); held é ignorado
  | 'phone_walk' // andando de um lado para o outro ao celular: passos de 'walk' com o aparelho na orelha (4). Sempre em pé
  | 'type_stand' // em pé diante da mesa alta, digitando — normalmente dir 'up', de costas, braços alternando como em 'type' (4). Sempre em pé
  // --- equipe de limpeza (aditivo; character/cleaning.ts): sempre em pé
  | 'mop' // passando o mop: as duas mãos no cabo, a ponta indo e voltando no chão à frente (4)
  | 'vacuum' // o mesmo vaivém com o aspirador vertical (carpete) (4)
  | 'push' // andando e empurrando o carrinho de limpeza (o carrinho é desenhado pelo mundo) (4)
  | 'scrub' // escova de vaso subindo e descendo (normalmente dir 'up', na porta da cabine) (4)
  | 'wipe' // pano na mão indo e voltando (pia, espelho, torneira) (4)
  // --- mesquita, estilo shia e os religiosos (aditivo; character/prayer.ts)
  | 'sadl' // qiyam com as mãos ao lado do corpo (estilo shia) (1)
  | 'qunoot' // em pé, as duas mãos erguidas diante do rosto com as palmas para cima (2ª rak'ah, antes do ruku) (1)
  | 'dars' // ajoelhado falando para quem escuta: uma mão gesticulando e a boca mexendo (majlis/dars) (2)

export type HeldItem = 'none' | 'coffee' | 'water' | 'papers' | 'laptop' | 'book' | 'box' | 'paddle' | 'popcorn'
  // --- vida social (aditivo)
  | 'controller' // controle de videogame (pose 'game'; em pé/andando, numa mão)
  | 'rock' // pose 'rps': mão fechada (pedra)
  | 'paper' // pose 'rps': mão aberta, palma para baixo (papel)
  | 'scissors' // pose 'rps': indicador e médio em V (tesoura)
  | 'phone' // celular (com 'read' ou 'sit': olhando a tela, polegar rolando; tela acesa azulada)
  | 'lipstick' // batom (pose 'groom')
  | 'comb' // pente (pose 'groom')
  // --- recreação do campus (aditivo)
  | 'racket' // raquete de tênis (pose 'play': a mesma rotina da raquete de ping-pong, cabo mais longo e aro com cordas)
  | 'cigarette' // cigarro aceso entre os dedos (pose 'drink' leva à boca; 'stand'/'sit' segura ao lado). A fumaça é do mundo
  // --- equipe de limpeza (aditivo): carregados em pé ao lado do corpo ('stand'/'walk'/'run')
  | 'mop'
  | 'vacuum'
  // --- mesquita (aditivo; character/cleric.ts)
  | 'tasbih' // terço de contas pendurado na mão (também nas posturas ajoelhadas da oração)
  | 'turbah'; // (só no sujood) a turbah/sajdagah no chão sob a testa, estilo shia: a testa encosta nela

export type HairStyle =
  | 'short' | 'buzz' | 'spiky' | 'side_part' | 'curly' | 'afro' | 'bob' | 'long' | 'ponytail' | 'bun' | 'pigtails'
  | 'mohawk' | 'bald' | 'wavy'
  | 'braid'; // (aditivo) trança única caindo nas costas

export type TopStyle = 'tshirt' | 'hoodie' | 'shirt_tie' | 'sweater' | 'jacket' | 'blouse' | 'polo'
  // --- roupas do sul da Ásia (aditivo): batas até o joelho, desenhadas por cima da parte de baixo
  | 'kurta' // bata solta com gola curta, carcela e fendas laterais; topAccent = gola/botões
  | 'shalwar_kameez' // kameez com barrado bordado e dupatta nos ombros, ambos em topAccent
  | 'kurta_waistcoat' // kurta (top) com colete sem mangas por cima (topAccent)
  // --- (aditivo)
  | 'suit' // terno: paletó (top) com lapelas sobre camisa clara e gravata (topAccent); a cor da camisa sai da gravata
  // --- religiosos da mesquita (aditivo; character/cleric.ts)
  | 'qaba_aba' // qaba (casaco longo, em topAccent) sob a aba aberta (capa, em top), até o tornozelo
  | 'abaya'; // túnica longa até os pés (em top), com filete discreto (topAccent)

export type Accessory = 'none' | 'glasses' | 'sunglasses' | 'headphones' | 'cap' | 'beanie' | 'earrings' | 'bow'
  // --- (aditivo)
  | 'dupatta' // lenço solto sobre a cabeça e os ombros (o cabelo da frente aparece)
  | 'hijab' // cobre cabelo, orelhas e pescoço, emoldurando o rosto (o cabelo não é desenhado)
  | 'topi' // gorrinho redondo no alto da cabeça (de oração ou karakul)
  | 'headset' // fone de ouvido acolchoado com microfone de haste diante da boca (atendimento, ligações)
  | 'amama'; // (aditivo) turbante enrolado dos religiosos (preto: sayyid; branco), cobrindo o alto da cabeça

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  eyes: string;
  top: string;
  topAccent: string;
  topStyle: TopStyle;
  bottom: string;
  shoes: string;
  accessory: Accessory;
  accessoryColor: string;
  /** Crachá/cordão no pescoço (usado para distinguir subagentes). null = sem crachá. */
  lanyard: string | null;
  look: 'f' | 'm';
  /** (Opcional, aditivo) Barba/bigode — só sorteado para look 'm'. Ausente = sem pelos faciais. */
  facialHair?: 'none' | 'stubble' | 'beard' | 'mustache' | 'goatee' | 'short_beard'; // short_beard (aditivo): barba aparada rente ao queixo, com bigode
  /** (Opcional, aditivo) Parte de baixo da roupa. Ausente = calça. */
  bottomStyle?: 'pants' | 'shorts' | 'skirt' | 'shalwar';
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Regiões dinâmicas dentro de um sprite (em px do sprite, relativas ao canto superior esquerdo). */
export type SpriteRectName = 'screen' | 'board' | 'glass' | 'face' | 'tv' | 'sign' | 'art' | 'glow'
  /**
   * (Aditivo) 2º monitor/notebook da `desk`, quando existe. O sprite já traz um conteúdo fixo
   * escurecido (planilha/editor/painel); o mundo PODE desenhar por cima (ex.: drawScreen 'off'
   * quando a sala apaga, ou outro modo quando o dono trabalha). Ignorar também funciona.
   */
  | 'screen2';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Ponto de ancoragem dentro do sprite (px). Ver convenções em FurnitureDef / characterSprite. */
  ax: number;
  ay: number;
  rects?: Partial<Record<SpriteRectName, Rect>>;
}

/** `front` é desenhado POR CIMA de quem está sentado/dentro (ex.: encosto da cadeira, porta da cabine). */
export interface FurnitureSprites {
  base: Sprite;
  front?: Sprite;
}

export interface CharacterFrameRequest {
  appearance: Appearance;
  dir: Dir;
  pose: Pose;
  frame: number;
  held?: HeldItem;
  /** Para poses que podem ser em pé ou sentado (raise_hand, read, talk). */
  seated?: boolean;
}

export type FurnitureKind =
  // --- escritório (salas de projeto)
  | 'desk' // 2x1. Mesa com monitor virado para o SUL (tela visível para a câmera), teclado e caneca. rects.screen = área da tela.
  | 'desk_back' // 2x1. Mesa vista pelo outro lado: vemos a TRASEIRA do monitor; a pessoa senta ao NORTE dela, virada para baixo (rosto visível). Para ilhas de mesas face a face. Mesmas variants de desk.
  | 'office_chair_front' // 1x1 assento virado para BAIXO (encosto ao norte, desenhado ANTES do personagem; sem front). Par da desk_back.
  | 'office_chair' // 1x1 assento. Encosto ao sul (personagem senta virado para cima, de costas). front = encosto.
  | 'bookshelf' // 2x1 encostada na parede norte. Livros coloridos.
  | 'filing_cabinet' // 1x1 arquivo de gavetas.
  | 'printer' // 1x1 impressora sobre móvel baixo.
  | 'trash_bin' // 1x1 lixeira pequena (pode ser bem menor que o tile).
  | 'plant_small' // 1x1 vaso pequeno. variants: 'fern' | 'succulent' | 'flower'
  | 'plant_tall' // 1x1 planta alta (até ~2 tiles de altura). variants: 'palm' | 'ficus' | 'monstera' | 'bonsai'
  | 'glass_partition' // 1x1 segmento de divisória de vidro sobre base branca (meia-parede + vidro azulado com reflexo). variants: 'h' (corre leste-oeste) | 'v' (corre norte-sul) | 'end' (ponta/coluna)
  | 'binder_shelf' // 1x1 estante alta e estreita com pastas coloridas (azul/laranja/verde) e caixas.
  | 'meeting_table' // 3x2 mesa de reunião/bancada para subagentes. (Aditivo) variants: 'rect' (padrão) | 'oval' (mesa oval de nogueira da diretoria, para 4)
  | 'stool' // 1x1 assento simples (banqueta). Personagem pode sentar em qualquer direção.
  | 'floor_lamp' // 1x1 luminária de chão. rects.glow = centro da luz.
  | 'water_cooler' // 1x1 bebedouro com galão azul. Uso: personagem fica ao SUL, virado para cima.
  // --- montados na parede norte (mount: 'wall')
  | 'whiteboard' // 3 tiles de largura. Quadro kanban. rects.board = área onde o render desenha post-its.
  | 'window' // 2 tiles. Janela; rects.glass = vidro (o render desenha o céu antes da moldura).
  | 'clock' // 1 tile. Relógio; rects.face = mostrador (ponteiros desenhados pelo render).
  | 'poster' // 1 tile. variants: 'code' | 'coffee' | 'rocket' | 'cat' | 'bug' | 'ship_it'
  | 'painting' // 2 tiles. Quadro com moldura; rects.art = área da pintura (pode receber imagem gerada por IA).
  | 'tv' // 2 tiles. TV de parede; rects.tv = tela.
  | 'light_switch' // 1 tile (o sprite é pequeno). variants: 'on' | 'off'
  | 'elevator' // 2 tiles. Porta de elevador; state 0..4 = porta fechada .. totalmente aberta. Inclui luz/seta acima.
  | 'door_frame' // 2 tiles. Batente desenhado sobre a passagem na face da parede norte.
  | 'sign' // 3 tiles. Placa com o nome da sala; rects.sign = área do texto (o render escreve o nome).
  | 'mirror' // 1 tile. Espelho (acima das pias do banheiro). (Aditivo) rects.glass = área refletora (o mundo pode desenhar o reflexo de quem está na frente).
  | 'shelf_wall' // 2 tiles. Prateleira de parede com objetos.
  // --- copa / café
  | 'counter' // 1x1 segmento de bancada (encostado na parede norte). variants: 'plain' | 'drawers'
  | 'counter_sink' // 1x1 bancada com pia.
  | 'coffee_machine' // 1x1 bancada com cafeteira em cima. Uso: personagem ao SUL, virado para cima. state 0 = parada, 1 = passando café.
  | 'microwave' // 1x1 bancada com micro-ondas.
  | 'fridge' // 1x1 geladeira alta.
  | 'vending_machine' // 1x1 máquina de snacks alta e iluminada.
  | 'cafe_table' // 1x1 mesinha redonda.
  | 'cafe_chair' // 1x1 assento. variant = direção para onde quem senta olha: 'up' | 'down' | 'left' | 'right'. front quando 'up'.
  // --- lounge
  | 'sofa' // 3x1 assento. variant 'down' (de frente p/ câmera) | 'up' (de costas, front = encosto).
  | 'armchair' // 1x1 assento. variants como cafe_chair.
  | 'coffee_table' // 2x1 mesa de centro.
  | 'pingpong_table' // 3x2 mesa de ping-pong (rede vertical no meio; jogadores nas pontas oeste/leste).
  | 'beanbag' // 1x1 puff (assento). variants de cor: 'red' | 'blue' | 'yellow' | 'green'
  | 'arcade' // 1x1 fliperama (uso como máquina: personagem ao sul virado para cima). (Aditivo) rects.screen = tela (o mundo pode desenhar drawScreen 'game' por cima durante uma partida).
  // --- banheiro
  | 'toilet_stall' // 2x2 cabine com vaso. Personagem entra pela porta (lado SUL) e some. front = divisória/porta. state 0 = livre (porta entreaberta), 1 = ocupada (porta fechada, indicador vermelho).
  | 'sink' // 1x1 pia com gabinete (encostada na parede norte; use 'mirror' na parede acima).
  // --- recepção
  | 'reception_desk' // 3x1 balcão de recepção.
  | 'bench' // 2x1 banco de espera (assento, olhando para baixo).
  // --- recreação do campus (aditivo; art/furniture/recreation.ts)
  | 'sleep_pod' // 2x1 cápsula de dormir com a abertura ao SUL. state 0 = livre (visor aberto, colchão à mostra), 1 = ocupada (visor fechado, luz baixa por dentro).
  | 'tennis_net' // 1x11 rede da quadra de tênis (corre norte-sul; postes nas pontas). Use dx = TILE/2 para centrar na linha do meio.
  | 'court_fence' // 1x1 alambrado da quadra. variants: 'h' (leste-oeste) | 'v' (norte-sul) | 'post' (quina/batente do portão)
  | 'floodlight' // 1x1 poste alto de refletor (cabeça virada para a quadra). rects.glow = lâmpadas.
  | 'scoreboard' // 2x1 placar de pé. rects.screen = mostrador (o mundo escreve o placar).
  | 'ash_bin' // 1x1 lixeira-cinzeiro de inox com areia no topo.
  | 'smoking_shelter' // 4x1 abrigo da área de fumantes: painel de vidro ao fundo e cobertura (quem senta fica à frente/sul).
  | 'rec_sign' // 1x1 placa num poste. variants: 'smoking' (cigarro) | 'tennis' (raquete e bola)
  // --- mesquita (aditivo; campus). A qibla fica a oeste: quem reza olha para a esquerda.
  | 'mihrab' // 1x2 nicho da qibla encostado na parede oeste (arco pontudo, azulejos, lamparina).
  | 'minbar' // 2x1 púlpito de perfil: degraus subindo para oeste e um pequeno dossel.
  | 'jali_screen' // 1x1 treliça de madeira entalhada (divisória). variants: 'v' (corre norte-sul) | 'end' (ponta)
  | 'shoe_rack' // 2x1 sapateira de madeira com sapatos. variants: 'm' | 'f'
  | 'hijab_rack' // 2x1 cabideiro com hijabs pendurados e uma pilha dobrada.
  | 'topi_shelf' // 1x1 mesinha com um cesto de topis brancos.
  | 'wudu_tap' // 1x1 mureta azulejada com torneira de latão (quem usa senta a leste, virado para oeste). state 1 = água correndo.
  | 'wudu_stool' // 1x1 banquinho baixo de pedra (assento) diante da torneira.
  | 'quran_shelf' // 2x1 estante baixa com Alcorões encadernados (verde/vinho, filete dourado).
  | 'arch_window' // (parede) 2 tiles. Janela em arco com treliça; à noite o mundo acende o vidro.
  | 'prayer_times' // (parede) 2 tiles. Quadro com os horários das orações (seis mostradores, sem texto).
  // --- diretoria (aditivo; campus art/furniture/ceo.ts). Nogueira escura, couro, alumínio prateado e preto.
  | 'exec_desk' // 4x1 mesa de altura regulável (pés telescópicos de aço grafite, tampo de nogueira): Studio Display no meio (rects.screen), caixas de som dos dois lados, MacBook aberto num suporte (rects.screen2), Magic Keyboard, Magic Mouse, headset no suporte e luminária de mesa (rects.glow). state 0 = altura de sentar, 1 = altura de ficar em pé (tampo e tudo em cima ~7px mais alto, colunas mais longas)
  | 'exec_chair' // 1x1 assento: cadeira executiva ergonômica de tela com apoio de cabeça, virada para cima (front = encosto alto). state 0 = junto à mesa, 1 = rolada para o lado (mesa em pé)
  | 'meeting_chair' // 1x1 assento: cadeira de reunião de couro caramelo com base cromada. variants como cafe_chair ('up' tem front)
  | 'coffee_bar' // 3x1 aparador de nogueira com máquina de espresso, chaleira de chai (doodh patti) no fogareiro, xícaras e copinhos, pote de biscoitos e prato de samosas. state 1 = em uso (o mundo desenha o vapor)
  | 'exec_sofa' // 2x1 assento: sofá de couro de dois lugares, de frente para a câmera
  | 'exec_credenza' // 3x1 aparador baixo de nogueira encostado na parede norte: livros, globo, troféu e porta-retrato
  | 'secretary_desk' // 3x1 mesa da secretária: monitor (rects.screen), telefone de mesa, bandejas de documentos e impressora pequena
  | 'door_plate' // 1x1 placa de latão com "CEO" presa na coluna de vidro ao lado da porta (divide o tile com a coluna: dy +1)
  | 'award_wall' // (parede) 2 tiles. Prateleira de prêmios: diplomas emoldurados, troféu e placa de cristal
  // --- canto da limpeza (aditivo; furniture/cleaning.ts)
  | 'janitor_shelf' // 1x1 estante alta de metal com produtos de limpeza, rolos de papel e panos dobrados.
  | 'mop_sink' // 1x1 tanque baixo de serviço com torneira e um mop escorrendo ao lado.
  // --- mesquita, estilo shia (aditivo)
  | 'turbah_box'; // 1x1 caixinha de madeira com as turbahs (tabletes de barro) para a prostração

export interface FurnitureDef {
  mount: 'floor' | 'wall';
  /**
   * Floor: tiles ocupados no chão (w x h).
   * Wall: largura em tiles na face da parede (h ignorado).
   */
  footprint: { w: number; h: number };
  /** Floor: se os tiles bloqueiam a passagem. Assentos não bloqueiam (o personagem "entra" neles). */
  blocks: boolean;
  /** É um assento (personagem pode sentar sobre ele). */
  seat?: boolean;
  variants?: readonly string[];
  /** Quantidade de estados visuais (ex.: elevator 5, toilet_stall 2). */
  states?: number;
}

/**
 * Catálogo de móveis. Ancoragem (ax, ay) dos sprites de móveis:
 * - mount 'floor': (ax, ay) corresponde ao ponto CENTRAL INFERIOR do footprint no mundo,
 *   ou seja, (x0 + w*TILE/2, y0 + h*TILE) onde (x0, y0) é o canto superior esquerdo do footprint.
 *   O sprite pode se estender para cima (altura) e um pouco para os lados.
 * - mount 'wall': (ax, ay) corresponde ao ponto CENTRAL INFERIOR do trecho de parede, isto é,
 *   na linha do rodapé (base da face da parede). O sprite "flutua" na altura certa por conta própria.
 * Ordenação de profundidade: por y da âncora no mundo (maior y = desenhado depois).
 */
export const FURNITURE: Readonly<Record<FurnitureKind, FurnitureDef>> = {
  desk: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true, variants: ['wood', 'white', 'dark'] },
  desk_back: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true, variants: ['wood', 'white', 'dark'] },
  office_chair_front: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['black', 'blue', 'red', 'green', 'gray'] },
  office_chair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['black', 'blue', 'red', 'green', 'gray'] },
  bookshelf: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true },
  filing_cabinet: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  printer: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  trash_bin: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  plant_small: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['fern', 'succulent', 'flower'] },
  plant_tall: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['palm', 'ficus', 'monstera', 'bonsai'] },
  glass_partition: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['h', 'v', 'end'] },
  binder_shelf: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  meeting_table: { mount: 'floor', footprint: { w: 3, h: 2 }, blocks: true, variants: ['rect', 'oval'] },
  stool: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true },
  floor_lamp: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  water_cooler: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  whiteboard: { mount: 'wall', footprint: { w: 3, h: 0 }, blocks: false },
  window: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  clock: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false },
  poster: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false, variants: ['code', 'coffee', 'rocket', 'cat', 'bug', 'ship_it'] },
  painting: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  tv: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  light_switch: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false, variants: ['on', 'off'] },
  elevator: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false, states: 5 },
  door_frame: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  sign: { mount: 'wall', footprint: { w: 3, h: 0 }, blocks: false },
  mirror: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false },
  shelf_wall: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  counter: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['plain', 'drawers'] },
  counter_sink: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  coffee_machine: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, states: 2 },
  microwave: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  fridge: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  vending_machine: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  cafe_table: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  cafe_chair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['up', 'down', 'left', 'right'] },
  sofa: { mount: 'floor', footprint: { w: 3, h: 1 }, blocks: false, seat: true, variants: ['down', 'up'] },
  armchair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['up', 'down', 'left', 'right'] },
  coffee_table: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true },
  pingpong_table: { mount: 'floor', footprint: { w: 3, h: 2 }, blocks: true },
  beanbag: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['red', 'blue', 'yellow', 'green'] },
  arcade: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  toilet_stall: { mount: 'floor', footprint: { w: 2, h: 2 }, blocks: true, states: 2 },
  sink: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  reception_desk: { mount: 'floor', footprint: { w: 3, h: 1 }, blocks: true },
  bench: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: false, seat: true },
  sleep_pod: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true, states: 2 },
  tennis_net: { mount: 'floor', footprint: { w: 1, h: 11 }, blocks: true },
  court_fence: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['h', 'v', 'post'] },
  floodlight: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  scoreboard: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true },
  ash_bin: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  smoking_shelter: { mount: 'floor', footprint: { w: 4, h: 1 }, blocks: true },
  rec_sign: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['smoking', 'tennis'] },
  mihrab: { mount: 'floor', footprint: { w: 1, h: 2 }, blocks: true },
  minbar: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true },
  jali_screen: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['v', 'end'] },
  shoe_rack: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true, variants: ['m', 'f'] },
  hijab_rack: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true },
  topi_shelf: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  wudu_tap: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, states: 2 },
  wudu_stool: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true },
  quran_shelf: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true },
  arch_window: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  prayer_times: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  exec_desk: { mount: 'floor', footprint: { w: 4, h: 1 }, blocks: true, states: 2 },
  exec_chair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, states: 2 },
  meeting_chair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['up', 'down', 'left', 'right'] },
  coffee_bar: { mount: 'floor', footprint: { w: 3, h: 1 }, blocks: true, states: 2 },
  exec_sofa: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: false, seat: true },
  exec_credenza: { mount: 'floor', footprint: { w: 3, h: 1 }, blocks: true },
  secretary_desk: { mount: 'floor', footprint: { w: 3, h: 1 }, blocks: true },
  door_plate: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  award_wall: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  janitor_shelf: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  mop_sink: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  turbah_box: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
};

export type FloorKind =
  | 'carpet' // salas de projeto (usa tint/tint2 do tema da sala)
  | 'wood' // lounge
  | 'tile_check' // copa (xadrez)
  | 'tile_white' // banheiro
  | 'concrete' // corredor (cimento queimado/polido)
  | 'marble' // recepção
  | 'grass' // área externa
  | 'sidewalk' // calçada externa
  | 'street' // rua externa (faixas desenhadas pelo render se quiser)
  | 'walnut'; // (aditivo) tábuas de nogueira escura (sala da diretoria)

export type WallPattern = 'plain' | 'stripes' | 'tiles' | 'wood_panel' | 'brick' | 'glass' | 'marble';

export interface WallStyle {
  /** Cor base da face da parede. */
  base: string;
  /** Cor de detalhes (rodapé/faixa). */
  trim?: string;
  pattern?: WallPattern;
  /** Parede externa do prédio (tom mais sóbrio, pode ter textura de tijolo/concreto). */
  exterior?: boolean;
}

export interface Doorway {
  /** Início da passagem em px de mundo (absoluto) e largura em px. */
  x: number;
  w: number;
}

export type ScreenMode =
  | 'off' // monitor desligado (azul-marinho fosco com reflexo diagonal; nunca quase preto)
  | 'standby' // (aditivo) ligado sem uso: fundo azul com logo pulsando devagar — p.ex. mesa vaga com a sala acesa
  | 'idle' // descanso de tela suave
  | 'code' // editor com linhas de código coloridas rolando
  | 'terminal' // terminal escuro com texto verde surgindo
  | 'browser' // página web (barra de endereço + blocos)
  | 'search' // resultados de busca / lupa
  | 'chat' // conversa (balões alternados)
  | 'docs' // documento de texto
  | 'tasks' // lista de checkboxes
  | 'alert' // tela piscando em âmbar (precisa de atenção)
  | 'progress' // terminal escuro com uma barra de progresso/spinner andando (esperando um comando terminar)
  // --- vida social (aditivo; pensados para a TV do lounge e o fliperama, mas valem para qualquer tela)
  | 'show' // programa de TV animado; mapeamento FIXO pelo `seed`: seed % 3 === 0 futebol (campo, jogadores, bola; de tempos em tempos a bola entra no gol e a tela pisca "GOL"), 1 novela (dois rostos em close, corações), 2 desenho animado (cores vivas)
  | 'game'; // videogame (dois jogadores); mapeamento FIXO pelo `seed`: seed % 2 === 0 corrida em tela dividida (dois carrinhos na pista), 1 luta (dois bonecos e barras de vida)

export interface RoomTheme {
  carpet: string;
  carpet2: string;
  wall: WallStyle;
  accent: string;
  deskVariant: string;
  chairVariant: string;
}

/** Ícones pixel art pequenos (~8–12px) para estados acima da cabeça. */
export type IconName = 'alert' | 'question' | 'zzz' | 'check' | 'heart' | 'coffee' | 'music' | 'idea' | 'sweat' | 'star' | 'lightning' | 'chat' | 'box' | 'wave'
  | 'hourglass' // ampulheta (esperando um shell)
  | 'hourglass_flip' // a mesma ampulheta virando (alterne com 'hourglass' para animar)
  | 'cobweb' // teia de aranha (~12px) para o canto da cadeira/personagem quando a espera fica longa
  | 'storm' // nuvenzinha de chuva com raio (algo falhou)
  // --- vida social (aditivo)
  | 'coin' // moeda dourada com brilho (~8px) — ganhou dinheiro
  | 'sparkle' // brilho de 4 pontas (~9px) — ficou arrumado(a) no espelho
  | 'trophy' // troféu dourado (~10px) — venceu a partida/aposta
  | 'hand_rock' // gesto de pedra (punho) (~10px) — revelação do jokenpô
  | 'hand_paper' // gesto de papel (mão aberta) (~10px)
  | 'hand_scissors'; // gesto de tesoura (V) (~10px)

/** Assinatura que art/index.ts deve exportar (o mundo e a UI dependem disto). */
export interface ArtModule {
  /** `profile`: perfil regional das tabelas do sorteio (AgentInfo.appearance); ausente = o padrão. */
  appearanceFromSeed(seed: number, opts?: { look?: 'f' | 'm'; sub?: boolean; parts?: AppearanceParts; profile?: AppearanceProfile }): Appearance;
  /** Ancoragem: (ax, ay) = centro dos pés (ponto no chão). Personagem ocupa ~14–18px de largura e ~24–28px de altura. */
  characterSprite(req: CharacterFrameRequest): Sprite;
  poseFrameCount(pose: Pose): number;
  /** Duração de cada frame da pose em ms. */
  poseFrameDuration(pose: Pose): number;
  /**
   * `opts.seed` (opcional, aditivo) varia os detalhes de itens repetidos (objetos sobre a mesa, livros da
   * estante, pastas...). Sem seed, usa a variação 0. Sprites continuam em cache por (kind, variant, state, seed % N).
   */
  furnitureSprites(kind: FurnitureKind, variant?: string, state?: number, opts?: { seed?: number }): FurnitureSprites;
  /** Desenha uma área de piso (px de mundo, múltiplos de TILE). `seed` varia detalhes por tile. */
  drawFloor(ctx: CanvasRenderingContext2D, kind: FloorKind, x: number, y: number, w: number, h: number, opts: { seed: number; tint?: string; tint2?: string }): void;
  /** Tapete decorativo sobre o piso. */
  drawRug(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, seed: number): void;
  /** Face de parede norte: altura 2*TILE a partir de y, com "tampa" escura no topo e rodapé na base. */
  drawWallFace(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, style: WallStyle, opts?: { doorways?: Doorway[] }): void;
  /** Tampa de parede (laterais e trechos sem face), retângulo arbitrário. */
  drawWallTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, style: WallStyle): void;
  /** Parede sul: 1 tile de altura (tampa + mureta curta), com passagens opcionais. */
  drawSouthWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, style: WallStyle, opts?: { doorways?: Doorway[] }): void;
  /** Conteúdo animado de tela (monitor/TV). `r` em px de mundo. `t` em ms. */
  drawScreen(ctx: CanvasRenderingContext2D, r: Rect, mode: ScreenMode, t: number, seed: number): void;
  /** Post-its do quadro kanban (colunas: a fazer / fazendo / feito). */
  drawBoard(ctx: CanvasRenderingContext2D, r: Rect, items: readonly { status: 'pending' | 'in_progress' | 'completed' }[], t: number): void;
  /** Céu + horizonte visto pela janela conforme a hora local (0–24, fracionária). */
  drawWindowView(ctx: CanvasRenderingContext2D, r: Rect, hour: number, t: number, seed: number): void;
  drawClock(ctx: CanvasRenderingContext2D, r: Rect, date: Date): void;
  roomTheme(seed: number): RoomTheme;
  iconSprite(name: IconName): Sprite;
  /**
   * (Opcional, aditivo) Lance do futebol de drawScreen('show') com seed % 3 === 0, no instante `t`:
   * a partir de `progress >= goalAt` a tela pisca "GOL" (bola no gol da direita se `right`). O mundo
   * usa para a torcida comemorar junto com a TV.
   */
  footballLance?(t: number, seed: number): { lance: number; progress: number; right: boolean; period: number; goalAt: number };
  /** Avatar (cabeça + ombros) ampliado para a UI. `parts`: peças do personagem editado (ver AgentInfo.parts). */
  avatarCanvas(seed: number, opts?: { look?: 'f' | 'm'; sub?: boolean; scale?: number; parts?: AppearanceParts; profile?: AppearanceProfile }): HTMLCanvasElement;
}

// Posturas da oração (nafl) e da ablução, desenhadas com as MESMAS peças do corpo de render.ts (tronco, roupa,
// cabeça, cabelo, acessório, braços), para que qualquer peça de roupa nova acompanhe a postura sozinha.
// Sempre de perfil virado para a qibla (oeste = esquerda); dir 'right' é o espelho.
//
// Curvado (ruku) e prostrado (sujood): o tronco e a cabeça são desenhados em pé num buffer à parte e girados
// 90° em torno do quadril (rotação exata de pixel art, sem reamostrar). O que a roupa desenha abaixo do quadril
// (barra de uma bata longa) fica pendurado no lugar, sem girar.
import type { CharacterFrameRequest, Pose } from '../api';
import { mix, shade } from '../core/color';
import { PixelBuf } from '../core/pixbuf';
import type { BufSprite } from '../core/sprite';
import type { HeadView } from './hair';
import { CHAR_AX, CHAR_AY, CHAR_H, CHAR_PARTS as P, type Arm, type Dc, type Rig } from './render';

export type PrayerPose = Extract<Pose, 'takbir' | 'qiyam' | 'ruku' | 'sujood' | 'jalsa' | 'salam' | 'wudu' | 'sadl' | 'qunoot' | 'dars' | 'takbir_seated'>;

const PRAYER_POSES: ReadonlySet<string> = new Set<PrayerPose>(['takbir', 'qiyam', 'ruku', 'sujood', 'jalsa', 'salam', 'wudu', 'sadl', 'qunoot', 'dars', 'takbir_seated']);

export function isPrayerPose(pose: Pose): pose is PrayerPose {
  return PRAYER_POSES.has(pose);
}

/** Folha mais larga que a padrão: a cabeça de quem se curva/prostra vai até ~22 px à frente dos pés. */
export const PRAYER_W = 40;
/** Deslocamento das coordenadas padrão (folha de 24 px) dentro da folha da oração. */
const DX = 12;
/**
 * Âncora (pés) na folha da oração: DX + CHAR_AX. Literal de propósito: render.ts importa este módulo, então nada
 * vindo de render.ts pode ser lido no carregamento (só dentro das funções).
 */
export const PRAYER_AX = DX + 12;
/** Linha do quadril em pé (coordenadas padrão): o eixo das rotações. */
const HIP_Y = 24;

export function renderPrayer(req: CharacterFrameRequest): BufSprite {
  if (req.dir === 'right') {
    const left = renderPrayer({ ...req, dir: 'left' });
    return { buf: left.buf.flipped(), ax: PRAYER_W - left.ax, ay: left.ay };
  }
  const pose = req.pose as PrayerPose;
  const f = Math.max(0, Math.floor(req.frame)) % (pose === 'salam' || pose === 'wudu' || pose === 'dars' ? 2 : 1);
  const out = new PixelBuf(PRAYER_W, CHAR_H);
  out.ox = DX;
  const dc = context(req, out, pose === 'wudu');
  switch (pose) {
    case 'takbir':
    case 'qiyam':
    case 'sadl':
    case 'qunoot':
      drawStanding(dc, pose);
      break;
    case 'dars':
      drawKneeling(dc, 'side', req.held, f);
      break;
    case 'takbir_seated':
      drawKneeling(dc, 'side', req.held, -1, true);
      break;
    case 'ruku':
      drawRuku(dc);
      break;
    case 'sujood':
      drawSujood(dc, req.held === 'turbah');
      break;
    case 'jalsa':
    case 'salam':
      drawKneeling(dc, pose === 'salam' ? (f === 0 ? 'up' : 'down') : 'side', req.held);
      break;
    case 'wudu':
      drawWudu(dc, f);
      break;
  }
  out.ox = 0;
  out.outline();
  if (pose === 'takbir' || pose === 'qiyam' || pose === 'sadl' || pose === 'qunoot' || pose === 'ruku') out.shadow(DX + CHAR_AX, CHAR_AY - 0.5, 6, 2, '#1c2034', 0.2);
  else if (pose === 'sujood') out.shadow(DX + CHAR_AX - 8, CHAR_AY - 0.5, 13, 2, '#1c2034', 0.2);
  else if (pose !== 'wudu') out.shadow(DX + CHAR_AX - 1, CHAR_AY - 0.5, 8, 2, '#1c2034', 0.2);
  return { buf: out, ax: PRAYER_AX, ay: CHAR_AY };
}

// ---------------------------------------------------------------- montagem

/** Contexto de desenho em perfil (rig de quem está em pé, sem item, olhos baixos). */
function context(req: CharacterFrameRequest, b: PixelBuf, seated: boolean): Dc {
  const r = P.makeRig({ ...req, pose: seated ? 'sit' : 'stand', frame: 0, held: 'none', seated }, 'side');
  r.eyes = 'half';
  r.mouth = 'none';
  r.hd = 0;
  return { b, a: req.appearance, p: P.paletteOf(req.appearance), r };
}

function withRig(dc: Dc, patch: Partial<Rig>, b: PixelBuf = dc.b): Dc {
  return { ...dc, b, r: { ...dc.r, ...patch } };
}

/** Cabeça completa (cabelo de trás, rosto, barba, cabelo da frente, acessório). */
function head(dc: Dc, view: HeadView = 'side'): void {
  const d = view === dc.r.view ? dc : withRig(dc, { view });
  P.drawHair(d, 'back');
  P.drawHead(d);
  P.drawFacialHair(d);
  P.drawHair(d, 'front');
  P.drawAccessory(d);
}

function arms(dc: Dc, far: Arm, near: Arm, sleeve = P.sleeveLength(dc.a)): { far: () => void; near: () => void } {
  return {
    far: () => P.drawArm(dc, far, dc.p.top, sleeve, 0.08),
    near: () => P.drawArm(dc, near, dc.p.top, sleeve, 0, true),
  };
}

/**
 * Em pé: takbir (mãos abertas junto às orelhas), qiyam (mãos cruzadas abaixo do umbigo; mulheres, no peito), sadl
 * (estilo shia: braços soltos ao lado do corpo) ou qunoot (as duas mãos erguidas diante do rosto, palmas para cima).
 */
function drawStanding(dc: Dc, pose: 'takbir' | 'qiyam' | 'sadl' | 'qunoot'): void {
  const fem = dc.a.look === 'f';
  const a =
    pose === 'takbir'
      ? arms(dc, P.arm([12, 18], [14, 16], [13, 11]), P.arm([10, 18], [7, 17], [7, 11]))
      : pose === 'sadl'
        ? arms(dc, P.arm([12, 18], [12, 22]), P.arm([10, 18], [10, 22]))
        : pose === 'qunoot'
          ? arms(dc, P.arm([12, 18], [10, 20], [6, 17]), P.arm([10, 18], [8, 20], [4, 17]))
          : fem
        ? arms(dc, P.arm([12, 18], [12, 20], [8, 19]), P.arm([10, 18], [10, 20], [7, 19]))
        : arms(dc, P.arm([12, 18], [12, 21], [8, 22]), P.arm([10, 18], [10, 21], [7, 22]));
  a.far();
  P.drawLegs(dc);
  P.drawTorso(dc);
  head(dc);
  if (pose === 'takbir') {
    // palma aberta virada para a qibla: o polegar junto ao lóbulo da orelha
    a.near();
    palm(dc, 0);
    return;
  }
  a.near();
  if (pose === 'qunoot') {
    // palmas abertas para cima, juntas diante do rosto (a borda clara de cima é a palma)
    const sk = dc.p.skin;
    for (const x of [3, 4, 5, 6, 7]) dc.b.set(x, 16 + dc.r.ub, x < 5 ? sk.lt : sk.base);
  }
}

/**
 * Tronco + cabeça desenhados em pé num buffer à parte e girados 90° (cabeça para a frente/oeste, rosto para
 * baixo) em torno do quadril, com o topo do quadril em (hx, hy) na folha final. A barra abaixo do quadril
 * fica pendurada no lugar (deslocada junto com o quadril).
 */
function bowedUpperBody(dc: Dc, hx: number, hy: number): void {
  const u = new PixelBuf(24, CHAR_H);
  const d = withRig(dc, { ub: 0, lean: 0 }, u);
  P.drawHair(d, 'back');
  P.drawTorso(d);
  P.drawHead(d);
  P.drawFacialHair(d);
  P.drawHair(d, 'front');
  P.drawAccessory(d);
  const px = 11;
  const out = dc.b;
  for (let y = 0; y < u.h; y++) {
    for (let x = 0; x < u.w; x++) {
      const i = (y * u.w + x) * 4;
      if (!u.data[i + 3]) continue;
      const c = `rgba(${u.data[i]},${u.data[i + 1]},${u.data[i + 2]},${u.data[i + 3] / 255})`;
      if (y < HIP_Y) out.set(hx + (y - HIP_Y), hy - (x - px) - 1, c);
      else out.set(hx + (x - px), hy + (y - HIP_Y), c);
    }
  }
}

/** Ruku: pernas retas (quadril 3 px mais alto: pernas esticadas), costas na horizontal e mãos nos joelhos. */
function drawRuku(dc: Dc): void {
  const lift = 3;
  const legs = withRig(dc, { ub: -lift });
  const hy = HIP_Y - lift;
  // braço de trás (o ombro fica à frente do quadril depois de girar; a mão desce até o joelho)
  const sl = Math.min(P.sleeveLength(dc.a), 3);
  const z = withRig(dc, { ub: 0, lean: 0 });
  P.drawArm(z, P.arm([6, hy - 1], [9, hy + 3]), dc.p.top, sl, 0.08);
  P.drawLegs(legs);
  bowedUpperBody(dc, 11, hy);
  P.drawArm(z, P.arm([5, hy], [8, hy + 4]), dc.p.top, sl, 0, true);
}

/** Pernas ajoelhadas (prostração): coxas quase na vertical, canelas no chão e os dedos dos pés dobrados atrás. */
function kneelLegsUpright(dc: Dc, hipX: number, hipY: number): void {
  const { b, p } = dc;
  const pants = p.bottom;
  const skinLeg = dc.a.bottomStyle === 'shorts' || dc.a.bottomStyle === 'skirt';
  // coxa: do quadril até o joelho no chão, um pouco à frente
  for (let y = hipY; y <= 29; y++) {
    const k = (y - hipY) / Math.max(1, 29 - hipY);
    const x = Math.round(hipX - 2 * k);
    b.set(x, y, pants.lt);
    b.set(x + 1, y, pants.base);
    b.set(x + 2, y, pants.base);
    b.set(x + 3, y, pants.dk);
  }
  // canela deitada no chão, do joelho até o peito do pé
  const shin = skinLeg ? p.skin : pants;
  b.rect(hipX - 2, 29, 9, 2, shin.base);
  b.hline(hipX - 2, hipX + 6, 29, shin.lt);
  b.hline(hipX - 2, hipX + 6, 30, shin.dk);
  // pé de pé, dedos apoiados no chão (sapatos ficaram na sapateira: o "sapato" é a meia/pele)
  const sh = p.shoes;
  b.rect(hipX + 7, 27, 2, 4, sh.base);
  b.set(hipX + 7, 27, sh.lt);
  b.set(hipX + 8, 30, sh.dk);
}

/** Pernas dobradas sentado sobre os calcanhares (jalsa/tashahhud, salam). */
function kneelLegsSitting(dc: Dc): void {
  const { b, p, a } = dc;
  const pants = p.bottom;
  const skinLeg = a.bottomStyle === 'shorts' || a.bottomStyle === 'skirt';
  // coxa na horizontal (quadril -> joelho, à frente/esquerda) por cima da canela
  b.rect(5, 26, 9, 3, pants.base);
  b.hline(5, 13, 26, pants.lt);
  b.set(5, 27, pants.lt);
  b.hline(6, 13, 28, pants.dk);
  // canela no chão, do joelho até o pé atrás
  const shin = skinLeg ? p.skin : pants;
  b.rect(4, 29, 12, 2, shin.base);
  b.hline(4, 15, 30, shin.dk);
  b.set(4, 29, shin.lt);
  const sh = p.shoes;
  if (a.look === 'f') {
    // mulheres: os pés para o lado, deitados
    b.rect(15, 29, 3, 2, sh.base);
    b.set(17, 30, sh.dk);
  } else {
    // homens: pé direito de pé, dedos dobrados no chão
    b.rect(15, 26, 2, 5, sh.base);
    b.set(15, 26, sh.lt);
    b.set(16, 30, sh.dk);
  }
}

/** Sujood: ajoelhado, tronco à frente na horizontal, testa e nariz no chão, mãos espalmadas ao lado da cabeça. */
function drawSujood(dc: Dc, turbah = false): void {
  const hx = 12;
  // com a turbah, a cabeça fica 2 px mais alta: a testa repousa sobre ela
  const hy = HIP_Y + 1 - (turbah ? 2 : 0);
  if (turbah) drawTurbah(dc.b, TURBAH_X, CHAR_AY);
  const fem = dc.a.look === 'f';
  const z = withRig(dc, { ub: 0, lean: 0 });
  const sl = Math.min(P.sleeveLength(dc.a), 3);
  // braço de trás: antebraço no chão (mulheres) ou cotovelo erguido (homens)
  P.drawArm(z, fem ? P.arm([6, hy], [3, 28], [-2, 29]) : P.arm([6, hy - 1], [3, 24], [-1, 29]), dc.p.top, sl, 0.08);
  kneelLegsUpright(dc, hx - 3, hy - 1);
  bowedUpperBody(dc, hx, hy);
  P.drawArm(z, fem ? P.arm([5, hy], [2, 28], [-3, 29]) : P.arm([5, hy - 1], [2, 25], [-2, 29]), dc.p.top, sl, 0, true);
}

/**
 * Turbah (sajdagah) sob a testa no sujood, em coordenadas padrão: (x, y) = canto esquerdo da linha de baixo. O mundo
 * desenha a do carpete no mesmo lugar (render/mosque.ts, TURBAH_DX), então as duas coincidem.
 */
export const TURBAH_X = -6;
/**
 * Deslocamento (px) do canto esquerdo da turbah em relação aos pés de quem reza virado para oeste: TURBAH_X - CHAR_AX.
 * Literal de propósito (render.ts importa este módulo; nada dele pode ser lido no carregamento). A base fica nos pés.
 */
export const TURBAH_DX = -18;

export function drawTurbah(b: PixelBuf, x: number, baseY: number): void {
  // tablete redondo de barro (8 x 3), visto de lado: topo claro, borda escura embaixo
  b.hline(x + 1, x + 6, baseY - 2, '#c2b6a5');
  b.rect(x, baseY - 1, 8, 1, '#9a8e7e');
  b.hline(x + 1, x + 6, baseY, '#71675a');
  b.set(x + 2, baseY - 1, '#b3a797');
}

/**
 * Palma aberta virada para a qibla junto à orelha (takbir em pé e sentado): dedos para cima, o polegar no lóbulo.
 * Desenhada por cima da manga, para ler mesmo com a aba e o chador escuros.
 */
function palm(dc: Dc, dy: number): void {
  const sk = dc.p.skin;
  for (let y = 8; y <= 12; y++) {
    dc.b.set(5, y + dy, y === 8 ? sk.base : sk.lt);
    dc.b.set(6, y + dy, y < 10 ? sk.base : sk.dk);
  }
  dc.b.set(7, 12 + dy, sk.base);
}

/** Jalsa/tashahhud (cabeça de perfil) e salam (cabeça virada: 'up' = à direita/norte, 'down' = à esquerda/sul). */
function drawKneeling(dc: Dc, view: HeadView, held: CharacterFrameRequest['held'] = 'none', talk = -1, takbir = false): void {
  const drop = 5;
  const d = withRig(dc, { ub: drop, mouth: talk === 0 ? 'open' : 'none', eyes: talk >= 0 ? 'open' : dc.r.eyes });
  // dars: a mão de perto gesticula (na altura do peito e um pouco mais alta); takbir: as duas mãos junto às orelhas
  const near = takbir
    ? P.arm([10, 18], [7, 17], [7, 11])
    : talk < 0
      ? P.arm([10, 18], [10, 21], [7, 22])
      : talk === 0
        ? P.arm([10, 18], [8, 20], [5, 19])
        : P.arm([10, 18], [8, 19], [5, 16]);
  const a = arms(d, takbir ? P.arm([12, 18], [14, 16], [13, 11]) : P.arm([12, 18], [12, 21], [8, 22]), near);
  a.far();
  kneelLegsSitting(d);
  P.drawTorso(d);
  head(d, view);
  a.near();
  if (takbir) palm(dc, drop);
  // o terço na mão que descansa na coxa (a de trás, no dars)
  if (held === 'tasbih') P.drawTasbih(dc.b, talk < 0 ? 7 : 9, 23 + drop);
}

/** Ablução sentado no banquinho: mãos na água da torneira (0) e no rosto (1), mangas arregaçadas. */
function drawWudu(dc: Dc, f: number): void {
  const d = dc;
  const a =
    f === 0
      ? arms(d, P.arm([12, 18], [10, 21], [5, 21]), P.arm([10, 18], [8, 21], [3, 20]), 1)
      : arms(d, P.arm([12, 18], [11, 20], [7, 18]), P.arm([10, 18], [7, 18], [6, 14]), 1);
  a.far();
  P.drawLegs(d);
  P.drawTorso(d);
  head(d);
  a.near();
  if (f === 0) {
    // gotas nas mãos
    dc.b.set(3, 22 + d.r.ub, 'rgba(170,220,250,0.95)');
    dc.b.set(5, 23 + d.r.ub, 'rgba(170,220,250,0.8)');
  }
}

// ---------------------------------------------------------------- cores

/** Cor de um hijab pela semente (tons suaves de tecido). */
export function hijabColor(seed: number): string {
  // tons de tecido que não se confundem com cabelo (nem branco/creme, nem escuros)
  const tones = ['#9fc0e4', '#e2a3b7', '#b5a3dc', '#93cdb0', '#6fb2b0', '#7b8fd0'];
  return tones[Math.abs(seed) % tones.length];
}

/** Tom de pele dos pés descalços/meias: usado como "sapato" enquanto os sapatos estão na sapateira. */
export function barefoot(skin: string): string {
  return mix(shade(skin, -0.04), '#e9e4da', 0.08);
}


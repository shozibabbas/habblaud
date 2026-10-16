// Poses da equipe de limpeza (personagens que não são agentes; ver world/sim/staff.ts): passar o mop e o aspirador
// (vaivém no chão à frente), empurrar o carrinho (o carrinho é desenhado pelo mundo) e carregar o mop ou o aspirador
// andando. Desenhadas com as MESMAS peças do corpo de render.ts (CHAR_PARTS), como as posturas da oração: qualquer
// roupa nova (o uniforme também) acompanha sozinha. Folha padrão (24x34, âncora nos pés); dir 'right' = espelho.
//
// Import cycle: render.ts importa este módulo. Nada de render.ts pode ser lido no carregamento (só nas funções).
import type { CharacterFrameRequest, HeldItem, Pose } from '../api';
import { PixelBuf } from '../core/pixbuf';
import type { BufSprite } from '../core/sprite';
import type { HeadView } from './hair';
import { CHAR_PARTS as P, isSeated, type Arm, type Dc } from './render';

export type CleaningPose = Extract<Pose, 'mop' | 'vacuum' | 'push'>;
export type CleaningTool = Extract<HeldItem, 'mop' | 'vacuum'>;

const POSES: ReadonlySet<string> = new Set<CleaningPose>(['mop', 'vacuum', 'push']);
const TOOLS: ReadonlySet<string> = new Set<CleaningTool>(['mop', 'vacuum']);

/** Quadros das poses de limpeza (POSE_FRAMES em render.ts): o vaivém e a passada têm 4. */
const FRAMES = 4;

/** Literais de propósito (ver o aviso do import cycle): os mesmos de render.ts. */
const W = 24;
const H = 34;
const AX = 12;
const AY = 31;

export function isCleaningPose(pose: Pose): pose is CleaningPose {
  return POSES.has(pose);
}

export function isCleaningTool(held: HeldItem | undefined): held is CleaningTool {
  return !!held && TOOLS.has(held);
}

/** Pedido que este módulo desenha: uma pose de limpeza ou alguém em pé/andando com o mop/aspirador na mão. */
export function isCleaningRequest(req: CharacterFrameRequest): boolean {
  if (isCleaningPose(req.pose)) return true;
  return isCleaningTool(req.held) && (req.pose === 'walk' || req.pose === 'run' || req.pose === 'stand') && !isSeated(req.pose, req.seated);
}

/** Cores das ferramentas (fixas: o uniforme muda, o material não). */
const TOOL = {
  pole: '#c3c9d2',
  poleDk: '#8a919d',
  grip: '#e0623c',
  mop: '#ece6d6',
  mopDk: '#bdb39d',
  mopWet: '#a9b6bf',
  vac: '#d94f3a',
  vacLt: '#f07a5c',
  vacDk: '#9c3326',
  base: '#3c4251',
  baseLt: '#6b7385',
} as const;

export function renderCleaning(req: CharacterFrameRequest): BufSprite {
  if (req.dir === 'right') {
    const left = renderCleaning({ ...req, dir: 'left' });
    return { buf: left.buf.flipped(), ax: W - left.ax, ay: left.ay };
  }
  const view: HeadView = req.dir === 'up' ? 'up' : req.dir === 'down' ? 'down' : 'side';
  const b = new PixelBuf(W, H);
  const pose = req.pose;
  const n = isCleaningPose(pose) ? FRAMES : 1;
  const f = ((Math.floor(req.frame) % n) + n) % n;
  if (pose === 'mop' || pose === 'vacuum') drawSweep(req, b, view, pose, f);
  else if (pose === 'push') drawPush(req, b, view, f);
  else drawCarry(req, b, view);
  b.outline();
  b.shadow(AX, AY - 0.5, 6, 2, '#1c2034', 0.2);
  return { buf: b, ax: AX, ay: AY };
}

// ---------------------------------------------------------------- montagem

function context(req: CharacterFrameRequest, b: PixelBuf, view: HeadView, pose: Pose, frame: number): Dc {
  const r = P.makeRig({ ...req, pose, frame, held: 'none', seated: false }, view);
  return { b, a: req.appearance, p: P.paletteOf(req.appearance), r };
}

function headStack(dc: Dc): void {
  P.drawHead(dc);
  P.drawFacialHair(dc);
  P.drawHair(dc, 'front');
  P.drawAccessory(dc);
}

function arm(dc: Dc, a: Arm, far = false): void {
  P.drawArm(dc, a, dc.p.top, P.sleeveLength(dc.a), far ? 0.08 : 0, !far && dc.r.view === 'side');
}

/** Cabo de (x0, y0) a (x1, y1) com o lado sombreado; `grip` = pegador colorido na ponta de cima. */
function pole(b: PixelBuf, x0: number, y0: number, x1: number, y1: number, grip: boolean): void {
  b.line(x0, y0, x1, y1, TOOL.pole);
  b.line(x0 + 1, y0, x1 + 1, y1, TOOL.poleDk);
  if (grip) {
    b.set(x1, y1, TOOL.grip);
    b.set(x1 + 1, y1, TOOL.grip);
  }
}

/** Cabeça do mop no chão (franjas), centrada em x, com o topo em y. Perfil: mais estreita. */
function mopHead(b: PixelBuf, cx: number, y: number, side: boolean, wet: boolean): void {
  const half = side ? 2 : 3;
  b.hline(cx - half + 1, cx + half - 1, y, TOOL.poleDk);
  for (let x = cx - half; x <= cx + half; x++) {
    b.set(x, y + 1, TOOL.mop);
    b.set(x, y + 2, (x + y) % 2 ? TOOL.mopDk : TOOL.mop);
  }
  if (wet) for (let x = cx - half; x <= cx + half; x += 2) b.set(x, y + 3, TOOL.mopWet);
}

/** Bocal do aspirador vertical no chão + o corpo (saco) ao longo do cabo. */
function vacuumBody(b: PixelBuf, cx: number, y: number, side: boolean, bodyX: number, bodyY: number): void {
  const half = side ? 2 : 3;
  b.rect(cx - half, y, half * 2 + 1, 2, TOOL.base);
  b.hline(cx - half, cx + half, y, TOOL.baseLt);
  b.set(cx + half, y + 1, '#ffd36b'); // luzinha do bocal
  b.rect(bodyX - 1, bodyY, 3, 6, TOOL.vac);
  b.vline(bodyX - 1, bodyY, bodyY + 5, TOOL.vacLt);
  b.vline(bodyX + 1, bodyY, bodyY + 5, TOOL.vacDk);
}

/**
 * Passando o mop (ou o aspirador): as duas mãos no cabo, a ponta no chão à frente indo e voltando. De frente a
 * ponta fica entre os pés (no chão, à frente); de costas, atrás das pernas; de perfil, à frente dos pés.
 */
function drawSweep(req: CharacterFrameRequest, b: PixelBuf, view: HeadView, pose: 'mop' | 'vacuum', f: number): void {
  const dc = context(req, b, view, 'stand', 0);
  const s = [-1, 0, 1, 0][f];
  const vac = pose === 'vacuum';
  dc.r.eyes = 'half';
  dc.r.ub = f === 1 || f === 3 ? 1 : 0;
  const ub = dc.r.ub;
  if (view === 'down') {
    const hx = 11 + s * 3;
    P.drawHair(dc, 'back');
    P.drawLegs(dc);
    P.drawTorso(dc);
    headStack(dc);
    // cabo da ponta no chão até acima das mãos (na frente do peito)
    const gx = 12 + s;
    if (vac) vacuumBody(b, hx, 30, false, Math.round((hx + gx) / 2), 22 + ub);
    else mopHead(b, hx, 29, false, true);
    pole(b, hx, vac ? 30 : 29, gx, 16 + ub, true);
    arm(dc, P.arm([6, 18], [8, 20], [gx - 1, 19]));
    arm(dc, P.arm([16, 18], [15, 21], [gx, 22]));
    return;
  }
  if (view === 'up') {
    // de costas: a ponta vai e volta no chão à frente (atrás das pernas na tela) e aparece dos lados no vaivém
    const hx = 11 + s * 6;
    if (vac) vacuumBody(b, hx, 26, false, hx, 20);
    else mopHead(b, hx, 25, false, true);
    pole(b, hx, 25, 12 + s, 14 + ub, true);
    P.drawLegs(dc);
    P.drawTorso(dc);
    arm(dc, P.arm([6, 18], [6, 20], [8 + s, 19]));
    arm(dc, P.arm([16, 18], [16, 20], [14 + s, 19]));
    P.drawHair(dc, 'back');
    headStack(dc);
    return;
  }
  // perfil (virado para a esquerda): ponta à frente dos pés, indo e voltando
  const hx = 4 + s * 2;
  arm(dc, P.arm([12, 18], [10, 19], [8 + s, 18]), true);
  P.drawHair(dc, 'back');
  P.drawLegs(dc);
  P.drawTorso(dc);
  headStack(dc);
  if (vac) vacuumBody(b, hx, 30, true, hx + 2, 23);
  else mopHead(b, hx, 29, true, true);
  pole(b, hx + 1, vac ? 30 : 29, 9 + s, 15 + ub, true);
  arm(dc, P.arm([10, 18], [9, 21], [7 + s, 21]));
}

/** Empurrando o carrinho: pernas da caminhada, as duas mãos à frente na alça (o carrinho é do mundo). */
function drawPush(req: CharacterFrameRequest, b: PixelBuf, view: HeadView, f: number): void {
  const dc = context(req, b, view, 'walk', f);
  P.drawHair(dc, 'back');
  if (view === 'side') {
    arm(dc, P.arm([12, 18], [9, 20], [5, 20]), true);
    P.drawLegs(dc);
    P.drawTorso(dc);
    headStack(dc);
    arm(dc, P.arm([10, 18], [8, 21], [4, 21]));
    return;
  }
  if (view === 'up') {
    P.drawLegs(dc);
    P.drawTorso(dc);
    arm(dc, P.arm([6, 18], [6, 20], [7, 18]));
    arm(dc, P.arm([16, 18], [16, 20], [15, 18]));
    headStack(dc);
    return;
  }
  P.drawLegs(dc);
  P.drawTorso(dc);
  headStack(dc);
  arm(dc, P.arm([6, 18], [6, 21], [8, 23]));
  arm(dc, P.arm([16, 18], [16, 21], [14, 23]));
}

/** Em pé ou andando com o mop/aspirador numa mão, em pé ao lado do corpo (ponta para baixo, quase no chão). */
function drawCarry(req: CharacterFrameRequest, b: PixelBuf, view: HeadView): void {
  const pose = req.pose === 'run' ? 'run' : req.pose === 'walk' ? 'walk' : 'stand';
  const dc = context(req, b, view, pose, req.frame);
  const vac = req.held === 'vacuum';
  const tool = (x: number): void => {
    if (vac) {
      vacuumBody(b, x, 30, view === 'side', x, 20);
      pole(b, x, 30, x, 12, true);
    } else {
      mopHead(b, x, 28, view === 'side', false);
      pole(b, x, 28, x, 11, true);
    }
  };
  if (view === 'side') {
    arm(dc, dc.r.armA, true);
    P.drawHair(dc, 'back');
    P.drawLegs(dc);
    P.drawTorso(dc);
    headStack(dc);
    tool(7);
    arm(dc, P.arm([10, 18], [9, 20], [7, 20]));
    return;
  }
  if (view === 'up') {
    // de costas, a mão direita da tela segura a ferramenta do lado de fora do corpo
    P.drawLegs(dc);
    P.drawTorso(dc);
    arm(dc, dc.r.armA);
    P.drawHair(dc, 'back');
    headStack(dc);
    tool(18);
    arm(dc, P.arm([16, 18], [17, 20], [17, 21]));
    return;
  }
  P.drawHair(dc, 'back');
  P.drawLegs(dc);
  P.drawTorso(dc);
  arm(dc, dc.r.armA);
  headStack(dc);
  tool(18);
  arm(dc, P.arm([16, 18], [17, 20], [17, 21]));
}

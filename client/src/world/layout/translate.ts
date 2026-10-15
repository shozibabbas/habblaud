// Translação de layouts prontos (salas, corredores, pátios) para outro ponto do mundo. O campus do
// escritório combinado monta cada prédio com as mesmas funções do prédio único e depois o desloca:
// assim as salas são idênticas nos dois modos. Puro.
import { TILE } from '../constants';
import type { SlotShell } from './exterior';
import type { AreaLayout, ExteriorProp, TileRect } from './types';

const moveRect = (r: TileRect, dx: number, dy: number): TileRect => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });

/** Cópia da área deslocada (dx, dy) tiles. Ids, ordem dos spots e sementes não mudam. */
export function translateArea(a: AreaLayout, dx: number, dy: number): AreaLayout {
  if (!dx && !dy) return a;
  const px = dx * TILE;
  const py = dy * TILE;
  return {
    ...a,
    rect: moveRect(a.rect, dx, dy),
    floors: a.floors.map((f) => ({ ...f, x: f.x + px, y: f.y + py })),
    rugs: a.rugs.map((r) => ({ ...r, x: r.x + px, y: r.y + py })),
    walls: a.walls.map((w) => ({ ...w, x: w.x + px, y: w.y + py, ...('doorways' in w && w.doorways ? { doorways: w.doorways.map((d) => ({ x: d.x + px, w: d.w })) } : {}) })),
    wallItems: a.wallItems.map((w) => ({ ...w, cx: w.cx + px, baseY: w.baseY + py })),
    furniture: a.furniture.map((f) => ({ ...f, tx: f.tx + dx, ty: f.ty + dy })),
    spots: a.spots.map((s) => ({ ...s, tx: s.tx + dx, ty: s.ty + dy, x: s.x + px, y: s.y + py, sortY: s.sortY === undefined ? undefined : s.sortY + py })),
    walkable: a.walkable.map((r) => moveRect(r, dx, dy)),
    blocked: a.blocked?.map((r) => moveRect(r, dx, dy)),
    door: a.door && moveRect(a.door, dx, dy),
    shade: a.shade && { x: a.shade.x + px, y: a.shade.y + py, w: a.shade.w, h: a.shade.h },
  };
}

export function translateProp(p: ExteriorProp, dx: number, dy: number): ExteriorProp {
  return { ...p, x: p.x + dx * TILE, y: p.y + dy * TILE };
}

/** Pátio de um slot vazio deslocado (dx, dy) tiles. */
export function translateShell(sh: SlotShell, dx: number, dy: number): SlotShell {
  const px = dx * TILE;
  const py = dy * TILE;
  return {
    ...sh,
    rect: moveRect(sh.rect, dx, dy),
    walls: sh.walls.map((w) => ({ ...w, x: w.x + px, y: w.y + py })),
    windows: sh.windows.map((w) => ({ ...w, cx: w.cx + px, baseY: w.baseY + py })),
    floors: sh.floors.map((f) => ({ ...f, x: f.x + px, y: f.y + py })),
    props: sh.props.map((p) => translateProp(p, dx, dy)),
  };
}

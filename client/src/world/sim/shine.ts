// Brilho do piso recém-limpo (equipe de limpeza, sim/cleaner.ts): cada trecho passado no mop ganha um verniz que
// aparece enquanto a pessoa limpa, fica no máximo logo depois e some devagar em ~2,5 min. Carpete aspirado ganha as
// listras do aspirador no lugar do verniz. Uma lista só, sem alocação por frame; o render desenha só o que está na
// tela (render/staff.ts). Puro (sem DOM).

/** Um trecho limpo (px de mundo: centro e raios da elipse). */
export interface ShinePatch {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** Quando a limpeza do trecho começou (ms). */
  at: number;
  /** Duração da limpeza (ms): o brilho cresce durante ela. */
  grow: number;
  /** Variação determinística (posição dos brilhinhos, inclinação do reflexo). */
  seed: number;
  /** Carpete (aspirador): listras em vez de verniz molhado. */
  carpet: boolean;
  /** Brilho de louça, espelho ou metal (vaso, pia, torneira): pequeno, desenhado por cima dos móveis. */
  gleam?: boolean;
}

/** Quanto tempo o brilho leva para sumir depois da limpeza. */
export const SHINE_FADE_MS = 150_000;
/** Carpete aspirado: só um "recém-aspirado" sutil e curto. */
export const CARPET_FADE_MS = 40_000;
/** Mais que isto e os trechos mais antigos saem (já estão quase apagados). */
export const MAX_SHINE = 160;

/** Intensidade (0..1) no instante `now`: cresce durante a limpeza, 1 ao terminar e cai suave até 0. */
export function shineLevel(p: ShinePatch, now: number): number {
  const t = now - p.at;
  if (t <= 0) return 0;
  if (t < p.grow) return 0.35 + 0.65 * (t / p.grow);
  const k = (t - p.grow) / (p.carpet ? CARPET_FADE_MS : SHINE_FADE_MS);
  if (k >= 1) return 0;
  // começa a cair devagar e termina suave (smoothstep invertido)
  return 1 - k * k * (3 - 2 * k);
}

/** O trecho já sumiu de vez? */
export function shineExpired(p: ShinePatch, now: number): boolean {
  return now - p.at >= p.grow + (p.carpet ? CARPET_FADE_MS : SHINE_FADE_MS);
}

export interface ShineView {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class ShineList {
  readonly items: ShinePatch[] = [];

  add(p: ShinePatch): ShinePatch {
    if (this.items.length >= MAX_SHINE) this.items.shift();
    this.items.push(p);
    return p;
  }

  /** Tira os que já sumiram (chamado com pouca frequência). */
  prune(now: number): void {
    let n = 0;
    for (const p of this.items) if (!shineExpired(p, now)) this.items[n++] = p;
    this.items.length = n;
  }

  /** Trechos visíveis com brilho, para o desenho (reaproveita `out`). */
  visible(view: ShineView, now: number, out: ShinePatch[]): ShinePatch[] {
    out.length = 0;
    for (const p of this.items) {
      if (p.x + p.rx < view.x0 || p.x - p.rx > view.x1 || p.y + p.ry < view.y0 - 4 || p.y - p.ry > view.y1 + 4) continue;
      if (shineLevel(p, now) > 0.004) out.push(p);
    }
    return out;
  }

  clear(): void {
    this.items.length = 0;
  }
}

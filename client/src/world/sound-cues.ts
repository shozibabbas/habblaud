// Sons do ambiente sugeridos pelo mundo: teclado de quem trabalha à vista, "ding" quando a porta de
// um elevador abre (alguém chega ou sai), as rodas (raquetadas e quiques do pingue-pongue e do tênis no ritmo da
// bola desenhada, fliperama, moedinhas das apostas), as pausas (água do wudu, ronco nas cápsulas, isqueiro e
// baforadas, xícaras na cozinha, a TV), a diretoria (o celular do dono tocando, o motor da mesa de pé, a xícara de
// chai) e os carros da rua. Só observa a simulação e a câmera; quem decide se toca
// (preferência, volume, aba oculta) é a UI.
import type { SoundCue } from './api';
import type { Camera } from './camera';
import { RALLY_MS, shotAt } from './social/rally';
import type { Character } from './sim/character';
import type { Sim } from './sim/sim';

/** Carro da rua visto pelos sons (render/renderer.ts). */
export interface CarLike {
  x: number;
  y: number;
  dir: number;
}

/** Reavalia quem está digitando a cada isto (ms). */
const KEYS_TICK_MS = 160;
/** Período (ms) de uma ida da bolinha do pingue-pongue (o mesmo do desenho). */
const PINGPONG_PERIOD = 1_100;

interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class SoundCues {
  private doors: number[] = [];
  private keysAt = 0;
  private nextKeysAt = 0;
  private nextArcadeAt = 0;
  private rally = new Map<number, number>();
  private nextCupAt = 0;
  private nextTvAt = 0;
  private nextSnoreAt = 0;
  private nextWaterAt = 0;
  /** Quem estava com o cigarro e em que pose (isqueiro ao acender, baforada ao tirar da boca). */
  private smokers = new Map<string, string>();
  private coinsSeen = 0;
  private staffSeen = 0;
  private carsSeen = new WeakSet<object>();

  constructor(
    private readonly sim: Sim,
    private readonly camera: Camera,
    private readonly rng: () => number = Math.random,
    private readonly cars: () => readonly CarLike[] = () => [],
  ) {}

  update(now: number, emit: (cue: SoundCue) => void): void {
    const a = this.camera.screenToWorld(0, 0);
    const b = this.camera.screenToWorld(this.camera.viewW, this.camera.viewH);
    const view = { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    // de longe (zoom baixo) tudo fica mais baixinho
    const near = Math.max(0.45, Math.min(1, 0.25 + this.camera.zoom * 0.25));
    this.elevators(view, emit);
    this.keys(now, view, near, emit);
    this.social(now, view, near, emit);
    this.breaks(now, view, near, emit);
    this.coins(view, near, emit);
    this.staffCues(view, near, emit);
    this.traffic(view, near, emit);
  }

  private pan(x: number, v: ViewRect): number {
    const half = Math.max(1, (v.x1 - v.x0) / 2);
    return Math.max(-0.7, Math.min(0.7, ((x - (v.x0 + v.x1) / 2) / half) * 0.7));
  }

  private inView(x: number, y: number, v: ViewRect, m = 16): boolean {
    return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
  }

  /** "Ding" quando a porta começa a abrir; fora da tela, mais baixo (ainda avisa que alguém chegou). */
  private elevators(view: ViewRect, emit: (cue: SoundCue) => void): void {
    this.sim.elevators.forEach((e, i) => {
      const prev = this.doors[i];
      this.doors[i] = e.door;
      if (prev === undefined || prev > 0.01 || e.door <= 0.01) return;
      const spot = this.sim.spots.get(e.spotId);
      if (!spot) return;
      emit({ kind: 'elevator', gain: this.inView(spot.x, spot.y, view, 24) ? 1 : 0.5, pan: this.pan(spot.x, view) });
    });
  }

  /** Rajadas de teclas, mais frequentes quanto mais gente digita na tela. */
  private keys(now: number, view: ViewRect, near: number, emit: (cue: SoundCue) => void): void {
    if (now - this.keysAt < KEYS_TICK_MS) return;
    this.keysAt = now;
    let n = 0;
    let sx = 0;
    for (const ch of this.sim.chars.values()) {
      if (!typing(ch) || !this.inView(ch.x, ch.y, view)) continue;
      n++;
      sx += ch.x;
    }
    if (!n || now < this.nextKeysAt) return;
    if (this.rng() > Math.min(0.8, 0.3 + 0.12 * n)) return;
    this.nextKeysAt = now + (700 + this.rng() * 1500) / Math.sqrt(Math.min(n, 6));
    emit({ kind: 'keys', gain: near * Math.min(1, 0.6 + 0.1 * n), pan: this.pan(sx / n, view), count: 2 + Math.floor(this.rng() * 5) });
  }

  /**
   * Rodas: pingue-pongue e tênis (raquetada a cada golpe e quique no meio, no ritmo do rali desenhado), fliperama e
   * videogame (arpejos), cozinha (xícaras) e TV (narração, e a torcida de vez em quando no futebol).
   */
  private social(now: number, view: ViewRect, near: number, emit: (cue: SoundCue) => void): void {
    const alive = new Set<number>();
    for (const g of this.sim.social.gatherings) {
      if (g.phase !== 'run') continue;
      let x = 0;
      let y = 0;
      let k = 0;
      for (const m of g.members) {
        if (m.left) continue;
        if ((g.kind === 'pingpong' || g.kind === 'tennis' || g.kind === 'arcade') && m.role !== 'player') continue;
        const ch = this.sim.chars.get(m.id);
        if (!ch) continue;
        x += ch.x;
        y += ch.y;
        k++;
      }
      if (!k) continue;
      x /= k;
      y /= k;
      if (!this.inView(x, y, view, 24)) continue;
      const pan = this.pan(x, view);
      if (g.kind === 'pingpong' || g.kind === 'tennis') {
        alive.add(g.id);
        const seg = this.rallySegment(g.rally, g.startAt, now);
        const prev = this.rally.get(g.id);
        this.rally.set(g.id, seg);
        if (seg < 0 || prev === undefined || prev === seg) continue;
        const hit = seg % 2 === 0;
        if (g.kind === 'tennis') emit({ kind: hit ? 'tennis' : 'bounce', gain: near, pan });
        else emit({ kind: hit ? 'pingpong' : 'table', gain: near, pan });
      } else if (g.kind === 'arcade' || g.kind === 'videogame') {
        if (now < this.nextArcadeAt) continue;
        this.nextArcadeAt = now + 500 + this.rng() * 900;
        emit({ kind: 'arcade', gain: near * (g.kind === 'videogame' ? 0.6 : 0.8), pan });
      } else if (g.kind === 'kitchen') {
        if (now < this.nextCupAt) continue;
        this.nextCupAt = now + 2_200 + this.rng() * 3_500;
        emit({ kind: 'cup', gain: near * 0.9, pan });
      } else if (g.kind === 'tv') {
        if (now < this.nextTvAt) continue;
        this.nextTvAt = now + 2_600 + this.rng() * 2_000;
        const goal = g.program === 'futebol' && this.rng() < 0.12;
        emit({ kind: goal ? 'cheer' : 'tv', gain: near * 0.8, pan });
      }
    }
    for (const id of this.rally.keys()) if (!alive.has(id)) this.rally.delete(id);
  }

  /**
   * Meio-golpe atual do rali (par = raquetada, ímpar = quique), ou -1 entre pontos. Sem rali (prédio antigo), o
   * ritmo fixo da bolinha desenhada.
   */
  private rallySegment(st: Parameters<typeof shotAt>[0] | undefined, startAt: number, now: number): number {
    if (!st) return Math.floor(((now - startAt) % (PINGPONG_PERIOD * 2)) / (PINGPONG_PERIOD / 2));
    const t0 = shotAt(st, 0);
    if (now < st.at) return -1;
    const shot = RALLY_MS[st.kind].shot;
    if (now < t0) return 0;
    return 2 * Math.floor((now - t0) / shot) + ((now - t0) % shot >= shot / 2 ? 1 : 0) + 2;
  }

  /** Pausas: água do wudu, ronco de quem dorme, isqueiro e baforadas na área de fumantes. */
  private breaks(now: number, view: ViewRect, near: number, emit: (cue: SoundCue) => void): void {
    let wudu = 0;
    let wx = 0;
    let sleep = 0;
    let sx = 0;
    const smoking = new Set<string>();
    for (const ch of this.sim.chars.values()) {
      // quem dorme na cápsula fica escondido lá dentro (alpha 0), mas ronca do mesmo jeito
      const inPod = ch.step?.t === 'pod' && ch.pose === 'sleep';
      if (ch.gone || (ch.alpha < 0.5 && !inPod) || !this.inView(ch.x, ch.y, view)) continue;
      if (ch.pose === 'wudu') {
        wudu++;
        wx += ch.x;
      } else if (ch.pose === 'sleep') {
        sleep++;
        sx += ch.x;
      }
      if (ch.held === 'cigarette') {
        smoking.add(ch.id);
        const prev = this.smokers.get(ch.id);
        if (prev === undefined) emit({ kind: 'lighter', gain: near * 0.9, pan: this.pan(ch.x, view) });
        else if (prev === 'drink' && ch.pose !== 'drink') emit({ kind: 'exhale', gain: near * 0.8, pan: this.pan(ch.x, view) });
        this.smokers.set(ch.id, ch.pose);
      }
    }
    for (const id of this.smokers.keys()) if (!smoking.has(id)) this.smokers.delete(id);
    if (wudu && now >= this.nextWaterAt) {
      this.nextWaterAt = now + 1_100 + this.rng() * 500;
      emit({ kind: 'water', gain: near * Math.min(1, 0.6 + 0.15 * wudu), pan: this.pan(wx / wudu, view) });
    }
    if (sleep && now >= this.nextSnoreAt) {
      this.nextSnoreAt = now + (3_000 + this.rng() * 3_500) / Math.sqrt(Math.min(sleep, 4));
      emit({ kind: 'snore', gain: near * 0.8, pan: this.pan(sx / sleep, view) });
    }
  }

  /** Moedinhas quando uma aposta é paga (o efeito das moedas voando entre os dois). */
  private coins(view: ViewRect, near: number, emit: (cue: SoundCue) => void): void {
    for (const e of this.sim.effects) {
      if (e.kind !== 'coins' || e.at <= this.coinsSeen) continue;
      this.coinsSeen = e.at;
      const ch = this.sim.chars.get(e.charId);
      if (ch && this.inView(ch.x, ch.y, view, 24)) emit({ kind: 'coins', gain: near, pan: this.pan(ch.x, view) });
    }
  }

  /** Sons pedidos pela equipe (sim/staff.ts `cue`): só os de quem está à vista. */
  private staffCues(view: ViewRect, near: number, emit: (cue: SoundCue) => void): void {
    for (const c of this.sim.staff.cues) {
      if (c.seq <= this.staffSeen) continue;
      this.staffSeen = c.seq;
      if (!this.inView(c.x, c.y, view, 24)) continue;
      emit({ kind: c.kind, gain: near * (c.kind === 'deskHum' ? 0.8 : 1), pan: this.pan(c.x, view) });
    }
  }

  /** Supercarro entrando na tela: o ronco passa do lado de onde ele vem. */
  private traffic(view: ViewRect, near: number, emit: (cue: SoundCue) => void): void {
    for (const car of this.cars()) {
      if (this.carsSeen.has(car)) continue;
      if (car.y < view.y0 - 20 || car.y > view.y1 + 20) continue;
      if (car.x < view.x0 - 60 || car.x > view.x1 + 60) continue;
      this.carsSeen.add(car);
      emit({ kind: 'car', gain: near, pan: car.dir > 0 ? -0.5 : 0.5 });
    }
  }
}

/** Sentado na própria mesa, digitando. */
function typing(ch: Character): boolean {
  return ch.mode === 'work' && ch.seated && ch.pose === 'type' && !ch.leaving && !ch.inside && ch.alpha > 0.5;
}

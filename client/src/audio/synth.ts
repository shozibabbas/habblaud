// Sons sintetizados com WebAudio (sem arquivos de áudio): curtos, baixos e de timbre suave.
import type { SoundKind } from './scheduler';

export interface VoiceOpts {
  /** Ganho final (já com o volume mestre). */
  gain: number;
  /** -1 .. 1 (esquerda .. direita). */
  pan?: number;
  /** Teclado: teclas na rajada. */
  count?: number;
  rng: () => number;
  /** Ruído branco curto (teclas). */
  noise: AudioBuffer | null;
}

/** Envelope percussivo: ataque curto e queda exponencial. */
function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(ac: AudioContext, out: AudioNode, type: OscillatorType, freq: number, t: number, peak: number, attack: number, decay: number, toFreq?: number): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + Math.min(decay, 0.08));
  env(g, t, peak, attack, decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

/** Cria um buffer de ruído branco (base das teclas). */
export function makeNoise(ac: AudioContext): AudioBuffer | null {
  try {
    const len = Math.floor(ac.sampleRate * 0.06);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  } catch {
    return null;
  }
}

/** Toca `kind` em `t` (tempo do AudioContext) na saída `dest`. */
export function playVoice(ac: AudioContext, dest: AudioNode, kind: SoundKind, t: number, o: VoiceOpts): void {
  let out: AudioNode = dest;
  if (o.pan && typeof ac.createStereoPanner === 'function') {
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    p.connect(dest);
    out = p;
  }
  const g = o.gain;
  switch (kind) {
    case 'chime':
      // sino suave: duas parciais e uma terceira nota logo depois, com decaimento longo
      tone(ac, out, 'sine', 880, t, 0.16 * g, 0.012, 1.1);
      tone(ac, out, 'sine', 1318.5, t, 0.08 * g, 0.012, 1.1);
      tone(ac, out, 'sine', 1174.7, t + 0.14, 0.1 * g, 0.012, 1.1);
      return;
    case 'pop':
      // "pop": varredura curta para baixo
      tone(ac, out, 'triangle', 740, t, 0.14 * g, 0.008, 0.15, 330);
      return;
    case 'elevator':
      // "ding" de elevador: uma nota redonda com o brilho de sino sumindo antes
      tone(ac, out, 'sine', 784, t, 0.11 * g, 0.004, 1.5);
      tone(ac, out, 'sine', 1568, t, 0.025 * g, 0.004, 0.7);
      tone(ac, out, 'sine', 2164, t, 0.012 * g, 0.004, 0.25);
      return;
    case 'keys':
      keys(ac, out, t, o);
      return;
    case 'pingpong':
      // raquetada: "tok" agudo com a altura caindo
      tone(ac, out, 'sine', 1250, t, 0.09 * g, 0.002, 0.06, 880);
      return;
    case 'table':
      // quique na mesa: mais grave e mais curto
      tone(ac, out, 'sine', 760, t, 0.06 * g, 0.002, 0.045, 520);
      return;
    case 'arcade': {
      // fliperama: arpejo de três notas em onda quadrada, filtrado para não ferir
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      lp.connect(out);
      const scale = [1046.5, 1318.5, 1568, 1760, 2093];
      for (let i = 0; i < 3; i++) {
        const f = scale[Math.floor(o.rng() * scale.length)];
        tone(ac, lp, 'square', f, t + i * 0.055, 0.03 * g, 0.003, 0.05);
      }
      return;
    }
    case 'tennis':
      // raquetada de tênis: "pok" encorpado (corda) com um estalo de ruído por cima
      tone(ac, out, 'triangle', 420, t, 0.12 * g, 0.002, 0.09, 230);
      burst(ac, out, o, t, { freq: 2400, q: 0.9, peak: 0.07 * g, decay: 0.03 });
      return;
    case 'bounce':
      // quique da bolinha de tênis na quadra: grave e abafado
      tone(ac, out, 'sine', 210, t, 0.08 * g, 0.002, 0.07, 140);
      return;
    case 'coins': {
      // moedinhas: três "plins" metálicos em sequência
      for (let i = 0; i < 3; i++) {
        const f = 2350 + o.rng() * 500;
        tone(ac, out, 'sine', f, t + i * 0.07, 0.05 * g, 0.002, 0.18);
        tone(ac, out, 'sine', f * 1.51, t + i * 0.07, 0.02 * g, 0.002, 0.1);
      }
      return;
    }
    case 'water':
      // torneira do wudu: fio d'água (ruído filtrado, com o volume oscilando de leve)
      flow(ac, out, o, t, { freq: 1600, q: 0.7, peak: 0.05 * g, dur: 1.2, wobble: 7 });
      return;
    case 'snore':
      // ronco baixinho na cápsula: uma inspiração grave e arrastada
      flow(ac, out, o, t, { freq: 260, q: 1.6, peak: 0.07 * g, dur: 0.9, wobble: 22 });
      tone(ac, out, 'sawtooth', 82, t + 0.1, 0.012 * g, 0.25, 0.55);
      return;
    case 'lighter':
      // isqueiro: o "clic" da pedra e a chama acendendo
      burst(ac, out, o, t, { freq: 3800, q: 2.2, peak: 0.09 * g, decay: 0.015 });
      flow(ac, out, o, t + 0.05, { freq: 900, q: 0.6, peak: 0.025 * g, dur: 0.35, wobble: 0 });
      return;
    case 'exhale':
      // baforada: sopro longo e suave
      flow(ac, out, o, t, { freq: 700, q: 0.5, peak: 0.035 * g, dur: 1.0, wobble: 0 });
      return;
    case 'cup':
      // xícara no pires: "tin" de porcelana
      tone(ac, out, 'sine', 3150 + o.rng() * 400, t, 0.05 * g, 0.001, 0.22);
      tone(ac, out, 'sine', 4700, t, 0.018 * g, 0.001, 0.12);
      return;
    case 'tv':
      // TV: murmúrio de narração e torcida ao fundo
      flow(ac, out, o, t, { freq: 1100, q: 0.4, peak: 0.022 * g, dur: 1.6, wobble: 3 });
      tone(ac, out, 'square', 180 + o.rng() * 60, t + 0.2, 0.006 * g, 0.05, 0.25);
      return;
    case 'cheer':
      // gol na TV: a torcida sobe e desce
      flow(ac, out, o, t, { freq: 1300, q: 0.35, peak: 0.06 * g, dur: 2.2, wobble: 5 });
      return;
    case 'prayerCall':
      // chamado à oração: três notas suaves de sino (sem imitar o azan), espaçadas
      for (const [i, f] of [587.3, 740, 880].entries()) {
        tone(ac, out, 'sine', f, t + i * 0.42, 0.09 * g, 0.02, 1.6);
        tone(ac, out, 'sine', f * 2, t + i * 0.42, 0.015 * g, 0.02, 0.8);
      }
      return;
    case 'ring':
      // celular tocando baixinho: dois trinados curtos (duas notas alternando rápido)
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < 6; i++) tone(ac, out, 'sine', i % 2 ? 1568 : 1319, t + r * 0.55 + i * 0.05, 0.035 * g, 0.004, 0.045);
      }
      return;
    case 'deskHum':
      // motor da mesa de pé: zumbido grave e contínuo, subindo de leve
      flow(ac, out, o, t, { freq: 180, q: 3.5, peak: 0.03 * g, dur: 1.4, wobble: 0 });
      tone(ac, out, 'sawtooth', 96, t, 0.008 * g, 0.12, 1.3, 104);
      return;
    case 'car':
      carPass(ac, out, o, t);
      return;
  }
}

/** Estalo curto de ruído filtrado (raquetada, isqueiro). */
function burst(ac: AudioContext, out: AudioNode, o: VoiceOpts, t: number, p: { freq: number; q: number; peak: number; decay: number }): void {
  if (!o.noise) return;
  const src = ac.createBufferSource();
  src.buffer = o.noise;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = p.freq;
  bp.Q.value = p.q;
  const g = ac.createGain();
  env(g, t, p.peak, 0.001, p.decay);
  src.connect(bp).connect(g).connect(out);
  src.start(t, 0, 0.05);
}

/**
 * Som contínuo de ruído filtrado (água, sopro, torcida): o buffer curto fica em loop, sobe e desce suave em `dur`
 * segundos; `wobble` (Hz) faz o volume oscilar (a água correndo, o ronco).
 */
function flow(ac: AudioContext, out: AudioNode, o: VoiceOpts, t: number, p: { freq: number; q: number; peak: number; dur: number; wobble: number }): void {
  if (!o.noise) return;
  const src = ac.createBufferSource();
  src.buffer = o.noise;
  src.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = p.freq;
  bp.Q.value = p.q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, p.peak), t + p.dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
  let node: AudioNode = g;
  if (p.wobble > 0) {
    const trem = ac.createGain();
    trem.gain.value = 0.7;
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = p.wobble;
    depth.gain.value = 0.3;
    lfo.connect(depth).connect(trem.gain);
    lfo.start(t);
    lfo.stop(t + p.dur + 0.05);
    g.connect(trem);
    node = trem;
  }
  src.connect(bp).connect(g);
  node.connect(out);
  src.start(t, o.rng() * 0.05);
  src.stop(t + p.dur + 0.05);
}

/** Supercarro passando: o ronco do motor sobe e cai (efeito Doppler) com o vento por cima. */
function carPass(ac: AudioContext, out: AudioNode, o: VoiceOpts, t: number): void {
  const dur = 1.6;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(500, t);
  lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.45);
  lp.frequency.linearRampToValueAtTime(400, t + dur);
  lp.connect(out);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.06 * o.gain), t + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(lp);
  const base = 105 + o.rng() * 30;
  for (const [mult, lvl] of [
    [1, 1],
    [2.01, 0.45],
  ] as const) {
    const osc = ac.createOscillator();
    const og = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * mult * 1.12, t);
    osc.frequency.linearRampToValueAtTime(base * mult * 1.18, t + dur * 0.4);
    osc.frequency.linearRampToValueAtTime(base * mult * 0.82, t + dur);
    og.gain.value = lvl;
    osc.connect(og).connect(g);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  flow(ac, out, o, t + 0.2, { freq: 1800, q: 0.4, peak: 0.02 * o.gain, dur: dur - 0.3, wobble: 0 });
}

/** Rajada de teclas: estalos de ruído filtrado com intervalos irregulares, como digitação de verdade. */
function keys(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts): void {
  if (!o.noise) return;
  const n = Math.max(1, Math.min(8, o.count ?? 4));
  let at = t;
  for (let i = 0; i < n; i++) {
    const src = ac.createBufferSource();
    src.buffer = o.noise;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900 + o.rng() * 1500;
    bp.Q.value = 1.4;
    const g = ac.createGain();
    env(g, at, 0.08 * o.gain * (0.6 + o.rng() * 0.4), 0.0015, 0.022 + o.rng() * 0.012);
    src.connect(bp).connect(g).connect(out);
    src.start(at, o.rng() * 0.02, 0.04);
    at += 0.06 + o.rng() * 0.08 + (o.rng() < 0.15 ? 0.12 : 0);
  }
}

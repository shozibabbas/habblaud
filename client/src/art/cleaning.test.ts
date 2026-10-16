// Poses da equipe de limpeza (character/cleaning.ts): folha padrão, vaivém animado, ferramenta à vista e espelho.
import { describe, expect, it } from 'vitest';
import type { Dir, Pose } from './api';
import { appearanceFromSeed } from './character/appearance';
import { isCleaningRequest } from './character/cleaning';
import { CHAR_AX, CHAR_AY, CHAR_H, CHAR_W, POSE_DURATION, POSE_FRAMES, renderCharacter } from './character/render';
import { cleanerUniform } from '../world/sim/cleaner';

const DIRS: Dir[] = ['down', 'up', 'left', 'right'];
const digest = (d: Uint8ClampedArray) => {
  let h = 0;
  for (let i = 0; i < d.length; i++) h = (Math.imul(h, 31) + d[i]) | 0;
  return h;
};
/** Pixels das cores das ferramentas (pegador, cabo, franjas do mop, corpo do aspirador): só elas usam. */
const TOOL_RGB = [0xe0623c, 0xc3c9d2, 0xece6d6, 0xd94f3a];
const grips = (d: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && TOOL_RGB.includes((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])) n++;
  return n;
};

describe('poses da limpeza', () => {
  const cast = [cleanerUniform(appearanceFromSeed(3, { look: 'f' }), undefined), cleanerUniform(appearanceFromSeed(9, { look: 'm', profile: 'pk' }), 'pk'), cleanerUniform(appearanceFromSeed(5, { look: 'f', profile: 'pk' }), 'pk')];

  it('mop, aspirador e carrinho: 4 quadros, folha padrão, quadros diferentes (vaivém)', () => {
    for (const pose of ['mop', 'vacuum', 'push'] as Pose[]) {
      expect(POSE_FRAMES[pose]).toBe(4);
      expect(POSE_DURATION[pose]).toBeGreaterThan(100);
      for (const a of cast) {
        for (const dir of DIRS) {
          const f = [0, 1, 2, 3].map((frame) => renderCharacter({ appearance: a, dir, pose, frame }));
          for (const s of f) {
            expect([s.buf.w, s.buf.h, s.ax, s.ay]).toEqual([CHAR_W, CHAR_H, CHAR_AX, CHAR_AY]);
            expect(s.buf.countOpaque()).toBeGreaterThan(150);
          }
          expect(digest(f[0].buf.data), `${pose}/${dir}`).not.toBe(digest(f[2].buf.data));
          // a ferramenta aparece (de costas, só nas pontas do vaivém)
          if (pose !== 'push') expect(f.reduce((n, s) => n + grips(s.buf.data), 0), `${pose}/${dir}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('carregando o mop/aspirador em pé e andando; sentado, a ferramenta não aparece', () => {
    const a = cast[0];
    for (const held of ['mop', 'vacuum'] as const) {
      for (const pose of ['stand', 'walk'] as Pose[]) {
        for (const dir of DIRS) {
          expect(isCleaningRequest({ appearance: a, dir, pose, frame: 0, held })).toBe(true);
          expect(grips(renderCharacter({ appearance: a, dir, pose, frame: 1, held }).buf.data), `${held}/${pose}/${dir}`).toBeGreaterThan(0);
        }
      }
      expect(isCleaningRequest({ appearance: a, dir: 'down', pose: 'sit', frame: 0, held })).toBe(false);
    }
  });

  it('direita é o espelho da esquerda', () => {
    const a = cast[1];
    const l = renderCharacter({ appearance: a, dir: 'left', pose: 'mop', frame: 1 });
    const r = renderCharacter({ appearance: a, dir: 'right', pose: 'mop', frame: 1 });
    expect(digest(r.buf.data)).toBe(digest(l.buf.flipped().data));
  });
});

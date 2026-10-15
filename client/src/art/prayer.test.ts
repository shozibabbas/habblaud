// Posturas da oração (character/prayer.ts): perfil virado para a qibla, as mesmas roupas e acessórios do corpo,
// silhuetas distintas (em pé, curvado, prostrado, ajoelhado), salam virando a cabeça, hijab e topi.
import { describe, expect, it } from 'vitest';
import type { Appearance, Pose } from './api';
import { appearanceFromSeed } from './character/appearance';
import { PRAYER_AX, PRAYER_W } from './character/prayer';
import { CHAR_AX, CHAR_H, renderCharacter } from './character/render';
import type { PixelBuf } from './core/pixbuf';

const POSTURES: readonly Pose[] = ['takbir', 'qiyam', 'ruku', 'sujood', 'jalsa', 'salam', 'wudu'];
const draw = (a: Appearance, pose: Pose, frame = 0, dir: 'left' | 'right' = 'left') => renderCharacter({ appearance: a, dir, pose, frame, seated: pose === 'wudu' });
const box = (b: PixelBuf) => b.bounds()!;

describe('posturas da oração', () => {
  const men = [3, 11, 58].map((s) => appearanceFromSeed(s, { look: 'm' }));
  const women = [4, 23, 71].map((s) => appearanceFromSeed(s, { look: 'f' }));

  it('todas desenham numa folha larga, com os pés na âncora', () => {
    expect(PRAYER_AX).toBe(12 + CHAR_AX);
    for (const a of [...men, ...women]) {
      for (const pose of POSTURES) {
        for (const frame of [0, 1]) {
          const s = draw(a, pose, frame);
          expect(s.buf.w).toBe(PRAYER_W);
          expect(s.buf.h).toBe(CHAR_H);
          expect(s.buf.countOpaque(), pose).toBeGreaterThan(150);
        }
      }
    }
  });

  it('silhuetas: curvado é mais baixo e comprido que em pé; prostrado é o mais baixo, com a cabeça bem à frente', () => {
    for (const a of [...men, ...women]) {
      const stand = box(draw(a, 'qiyam').buf);
      const ruku = box(draw(a, 'ruku').buf);
      const sujood = box(draw(a, 'sujood').buf);
      const jalsa = box(draw(a, 'jalsa').buf);
      expect(ruku.h).toBeLessThan(stand.h);
      expect(ruku.w).toBeGreaterThan(stand.w + 6);
      expect(sujood.h).toBeLessThan(ruku.h);
      expect(sujood.x).toBeLessThan(stand.x - 6); // cabeça à frente (oeste) dos pés
      expect(jalsa.h).toBeLessThan(stand.h);
      expect(jalsa.y).toBeGreaterThan(stand.y);
    }
  });

  it('dir right é o espelho de left (a qibla é sempre a oeste; o espelho fica disponível)', () => {
    const a = men[0];
    const l = draw(a, 'sujood');
    const r = draw(a, 'sujood', 0, 'right');
    expect(r.ax).toBe(PRAYER_W - l.ax);
    expect(box(r.buf).w).toBe(box(l.buf).w);
  });

  it('salam vira a cabeça: quadros diferentes (direita, depois esquerda)', () => {
    const a = women[0];
    const f0 = draw(a, 'salam', 0).buf;
    const f1 = draw(a, 'salam', 1).buf;
    expect(f0.data.some((v, i) => v !== f1.data[i])).toBe(true);
  });

  it('a roupa acompanha a postura: a cor do tronco aparece em todas', () => {
    const a = { ...men[1], top: '#e0306a' };
    const hasTop = (b: PixelBuf) => {
      for (let i = 0; i < b.data.length; i += 4) if (b.data[i] === 0xe0 && b.data[i + 1] === 0x30 && b.data[i + 2] === 0x6a) return true;
      return false;
    };
    for (const pose of POSTURES) expect(hasTop(draw(a, pose).buf), pose).toBe(true);
  });

  it('o hijab e o topi de verdade acompanham as posturas (o hijab esconde o cabelo)', () => {
    const count = (b: PixelBuf, hex: string) => {
      const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      let n = 0;
      for (let i = 0; i < b.data.length; i += 4) if (b.data[i] === r && b.data[i + 1] === g && b.data[i + 2] === bl) n++;
      return n;
    };
    const w = { ...women[1], accessory: 'hijab', accessoryColor: '#9fc0e4', hair: '#d03030' } as Appearance;
    const m = { ...men[0], accessory: 'topi', accessoryColor: '#f4f2ee' } as Appearance;
    for (const pose of ['stand', 'walk', ...POSTURES] as Pose[]) {
      const bw = renderCharacter({ appearance: w, dir: 'left', pose, frame: 0, seated: pose === 'wudu' }).buf;
      expect(count(bw, '#9fc0e4'), pose).toBeGreaterThan(15);
      expect(count(bw, '#d03030'), pose).toBe(0);
      expect(count(renderCharacter({ appearance: m, dir: 'left', pose, frame: 0, seated: pose === 'wudu' }).buf, '#f4f2ee'), pose).toBeGreaterThan(3);
    }
  });
});

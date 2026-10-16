// Posturas da oração (character/prayer.ts): perfil virado para a qibla, as mesmas roupas e acessórios do corpo,
// silhuetas distintas (em pé, curvado, prostrado, ajoelhado), salam virando a cabeça, hijab e topi.
import { describe, expect, it } from 'vitest';
import type { Appearance, Pose } from './api';
import { appearanceFromSeed } from './character/appearance';
import { PRAYER_AX, PRAYER_W } from './character/prayer';
import { CHAR_AX, CHAR_H, renderCharacter } from './character/render';
import type { PixelBuf } from './core/pixbuf';

const POSTURES: readonly Pose[] = ['takbir', 'qiyam', 'sadl', 'qunoot', 'ruku', 'sujood', 'jalsa', 'salam', 'wudu', 'dars', 'takbir_seated'];
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

  it('shia: no sadl os braços ficam soltos (nada diante da barriga); no qunoot as mãos sobem diante do rosto', () => {
    const a = { ...men[0], skin: '#d29a6e' } as Appearance;
    const skinIn = (b: PixelBuf, x0: number, x1: number, y0: number, y1: number) => {
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * b.w + x) * 4;
        if (b.data[i] === 0xd2 && b.data[i + 1] === 0x9a && b.data[i + 2] === 0x6e) n++;
      }
      return n;
    };
    // coordenadas da folha da oração: os pés em x = 24; o rosto fica à esquerda (oeste)
    const front = (pose: Pose) => skinIn(draw(a, pose).buf, 16, 22, 19, 24);
    expect(front('qiyam')).toBeGreaterThan(0);
    expect(front('sadl')).toBe(0);
    expect(skinIn(draw(a, 'qunoot').buf, 14, 20, 14, 19)).toBeGreaterThan(front('sadl'));
  });

  it('religiosos: qaba sob a aba, turbante (amama) e o tasbih na mão; abaya com hijab', () => {
    const has = (b: PixelBuf, hex: string) => {
      const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      for (let i = 0; i < b.data.length; i += 4) if (b.data[i] === r && b.data[i + 1] === g && b.data[i + 2] === bl) return true;
      return false;
    };
    const aalim = { ...men[0], topStyle: 'qaba_aba', top: '#3b2a20', topAccent: '#d6cfbf', accessory: 'amama', accessoryColor: '#f2efe7', facialHair: 'beard' } as Appearance;
    for (const dir of ['down', 'up', 'left'] as const) {
      const b = renderCharacter({ appearance: aalim, dir, pose: 'stand', frame: 0 }).buf;
      expect(has(b, '#3b2a20'), dir).toBe(true);
      expect(has(b, '#f2efe7'), dir).toBe(true);
    }
    expect(has(renderCharacter({ appearance: aalim, dir: 'down', pose: 'stand', frame: 0 }).buf, '#d6cfbf')).toBe(true);
    const beads = (b: PixelBuf) => has(b, '#d6a53a');
    expect(beads(renderCharacter({ appearance: aalim, dir: 'left', pose: 'jalsa', frame: 0, held: 'tasbih' }).buf)).toBe(true);
    expect(beads(renderCharacter({ appearance: aalim, dir: 'down', pose: 'sit', frame: 0, held: 'tasbih', seated: true }).buf)).toBe(true);
    const aalima = { ...women[0], topStyle: 'abaya', top: '#1e1c22', accessory: 'hijab', accessoryColor: '#25232b', hair: '#d03030' } as Appearance;
    for (const pose of ['stand', 'walk', 'sadl', 'sujood', 'dars', 'takbir_seated'] as Pose[]) {
      const b = renderCharacter({ appearance: aalima, dir: 'left', pose, frame: 0 }).buf;
      expect(has(b, '#1e1c22'), pose).toBe(true);
      expect(has(b, '#d03030'), pose).toBe(false);
    }
  });
});

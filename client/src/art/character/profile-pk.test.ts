import { describe, expect, it } from 'vitest';
import { hash32 } from '../../../../shared/hash';
import type { Appearance } from '../api';
import { appearanceFromSeed, SKINS } from './appearance';

const N = 4000;
const pk = (seed: number, look?: 'f' | 'm'): Appearance => appearanceFromSeed(seed, { profile: 'pk', ...(look ? { look } : {}) });
const share = (list: Appearance[], ok: (a: Appearance) => boolean): number => list.filter(ok).length / list.length;

describe('perfil da aparência pk', () => {
  it('o padrão não mudou: as mesmas aparências de antes do perfil existir', () => {
    // Assinatura de 6000 aparências calculada antes do perfil regional (mudar isto muda todos os personagens).
    const sig: string[] = [];
    for (let i = 0; i < 2000; i++) {
      for (const a of [appearanceFromSeed((i * 2654435761) >>> 0), appearanceFromSeed(i, { look: 'f', sub: true }), appearanceFromSeed(i, { look: 'm' })]) {
        sig.push([
          a.skin, a.hair, a.hairStyle, a.eyes, a.top, a.topAccent, a.topStyle, a.bottom, a.shoes, a.accessory, a.accessoryColor,
          a.lanyard ?? '-', a.look, a.facialHair ?? '-', a.bottomStyle ?? '-',
        ].join('|'));
      }
    }
    expect(hash32(sig.join('\n'))).toBe(1634718553);
    // Perfil ausente ou desconhecido (servidor mais novo) = o padrão.
    expect(appearanceFromSeed(42, { profile: undefined })).toEqual(appearanceFromSeed(42));
    expect(appearanceFromSeed(42, { profile: 'xx' as never })).toEqual(appearanceFromSeed(42));
  });

  it('determinístico, mesmo look sorteado que o padrão e as peças do editor por cima', () => {
    for (let i = 0; i < 200; i++) {
      expect(pk(i)).toEqual(pk(i));
      expect(pk(i).look).toBe(appearanceFromSeed(i).look);
    }
    expect(appearanceFromSeed(5, { profile: 'pk', parts: { skin: '#ffe2cc' } }).skin).toBe('#ffe2cc');
  });

  it('pele: tons médios e morenos, sem os extremos da paleta', () => {
    const all = Array.from({ length: N }, (_, i) => pk(i));
    const idx = (a: Appearance) => (SKINS as readonly string[]).indexOf(a.skin);
    expect(all.every((a) => idx(a) >= 1 && idx(a) <= 6)).toBe(true);
    expect(share(all, (a) => idx(a) >= 2 && idx(a) <= 5)).toBeGreaterThan(0.85);
    for (const i of [2, 3, 4, 5]) expect(share(all, (a) => idx(a) === i)).toBeGreaterThan(0.1);
  });

  it('cabelo: preto e castanho; sem loiro, ruivo nem cores divertidas', () => {
    const all = Array.from({ length: N }, (_, i) => pk(i));
    const banned = ['#b0703c', '#8e3b2b', '#d6ae68', '#ebdcb0', '#e47aa8', '#5b8fe0', '#8f6ad8', '#3fb3a0', '#e0584e', '#7cc45a', '#f0a24a'];
    expect(all.some((a) => banned.includes(a.hair))).toBe(false);
    expect(share(all, (a) => a.hair === '#2b2530' || a.hair === '#3f2c22')).toBeGreaterThan(0.7);
    expect(share(all, (a) => a.eyes === '#2f5f9e')).toBe(0);
    expect(share(all, (a) => a.eyes === '#3c7a52')).toBeLessThan(0.05);
  });

  it('barba ou bigode em ~65% dos homens; estilos e roupas mais comuns por lá', () => {
    const men = Array.from({ length: N }, (_, i) => pk(i, 'm'));
    const women = Array.from({ length: N }, (_, i) => pk(i, 'f'));
    const facial = share(men, (a) => a.facialHair !== 'none');
    expect(facial).toBeGreaterThan(0.6);
    expect(facial).toBeLessThan(0.7);
    expect(women.every((a) => a.facialHair === 'none')).toBe(true);
    expect(share(men, (a) => ['mohawk', 'afro', 'pigtails', 'bun', 'long', 'ponytail', 'bob'].includes(a.hairStyle))).toBeLessThan(0.02);
    expect(share(women, (a) => ['long', 'ponytail', 'bun', 'wavy', 'braid'].includes(a.hairStyle))).toBeGreaterThan(0.75);
    expect(share(women, (a) => ['mohawk', 'buzz', 'bald', 'afro', 'pigtails'].includes(a.hairStyle))).toBeLessThan(0.02);
    expect([...men, ...women].some((a) => a.bottomStyle === 'shorts')).toBe(false);
    expect(men.some((a) => a.bottomStyle === 'skirt' || a.accessory === 'earrings' || a.accessory === 'bow')).toBe(false);
    expect(share(women, (a) => a.bottomStyle === 'skirt')).toBeLessThan(0.2);
    expect(share(men, (a) => a.topStyle === 'hoodie')).toBeLessThan(0.1);
  });

  it('roupas regionais: ~1/3 dos homens de kurta, mais da metade das mulheres de shalwar kameez ou kurta', () => {
    const men = Array.from({ length: N }, (_, i) => pk(i, 'm'));
    const women = Array.from({ length: N }, (_, i) => pk(i, 'f'));
    const long = (a: { topStyle: string }) => ['kurta', 'kurta_waistcoat', 'shalwar_kameez'].includes(a.topStyle);
    expect(share(men, long)).toBeGreaterThan(0.25);
    expect(share(men, long)).toBeLessThan(0.42);
    expect(share(women, long)).toBeGreaterThan(0.5);
    const all = [...men, ...women];
    expect(all.filter((a) => a.topStyle === 'shalwar_kameez').every((a) => a.bottomStyle === 'shalwar')).toBe(true);
    expect(all.filter((a) => a.bottomStyle === 'shalwar').every(long)).toBe(true);
    expect(all.filter(long).some((a) => a.bottomStyle === 'skirt')).toBe(false);
    expect(men.some((a) => a.accessory === 'hijab' || a.accessory === 'dupatta')).toBe(false);
    expect(share(women, (a) => a.accessory === 'hijab')).toBeGreaterThan(0.05);
  });
});

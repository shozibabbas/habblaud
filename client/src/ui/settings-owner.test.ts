import { describe, expect, it } from 'vitest';
import { ownerBody } from './settings-owner';

describe('formulário do dono (Configurações)', () => {
  const form = { name: ' Ana ', title: ' ', look: 'f' as const, secName: 'Rafael', secLook: 'm' as const };

  it('nome vazio tira o dono', () => {
    expect(ownerBody({ ...form, name: '  ' }, undefined)).toEqual({ name: '' });
  });

  it('mantém as peças que já existiam (do dono e da secretária); cargo vazio e secretária sem nome somem', () => {
    const current = { name: 'Ana', look: 'f' as const, parts: { topStyle: 'jacket' as const }, secretary: { name: 'Rafael', look: 'm' as const, parts: { accessory: 'glasses' as const } } };
    expect(ownerBody(form, current)).toEqual({
      name: 'Ana',
      look: 'f',
      parts: { topStyle: 'jacket' },
      secretary: { name: 'Rafael', look: 'm', parts: { accessory: 'glasses' } },
    });
    expect(ownerBody({ ...form, title: 'CEO', secName: '' }, undefined)).toEqual({ name: 'Ana', title: 'CEO', look: 'f' });
  });
});

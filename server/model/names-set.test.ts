import { describe, expect, it } from 'vitest';
import { inNameSet, NAME_POOL, NAME_SETS, parseNameSet, pickName } from '../../shared/names';
import { NameStore } from './names';

describe('conjuntos de nomes (HABBLAUD_NAMES)', () => {
  it('br é o padrão; pk escolhe nomes paquistaneses', () => {
    expect(parseNameSet(undefined)).toBe('br');
    expect(parseNameSet(' PK ')).toBe('pk');
    expect(parseNameSet('xx')).toBe('br');
    expect(NAME_POOL).toBe(NAME_SETS.br);
    expect(inNameSet(pickName('sessão-1', new Set(), 'pk').name, 'pk')).toBe(true);
    expect(inNameSet(pickName('sessão-1', new Set()).name, 'br')).toBe(true);
    expect(inNameSet('Ayesha 2', 'pk')).toBe(true);
    expect(inNameSet('Marina', 'pk')).toBe(false);
  });

  it('cada conjunto: sem nomes repetidos e com a dica de aparência coerente', () => {
    for (const pool of Object.values(NAME_SETS)) {
      const names = pool.map((p) => p.name);
      expect(new Set(names).size).toBe(names.length);
      expect(pool.some((p) => p.look === 'f') && pool.some((p) => p.look === 'm')).toBe(true);
    }
    expect(NAME_SETS.pk.find((p) => p.name === 'Zainab')?.look).toBe('f');
    expect(NAME_SETS.pk.find((p) => p.name === 'Hamza')?.look).toBe('m');
  });

  it('trocar o conjunto renomeia quem tinha um nome do outro; quem já é do conjunto mantém', () => {
    const br = new NameStore(null);
    const old = br.assign('s1', new Set());
    expect(inNameSet(old.name, 'br')).toBe(true);

    const pk = new NameStore(null, { nameSet: 'pk' });
    pk.remember('s1', old);
    const renamed = pk.assign('s1', new Set());
    expect(inNameSet(renamed.name, 'pk')).toBe(true);
    expect(pk.assign('s1', new Set())).toEqual(renamed);
    // Nome escolhido no editor (de conjunto nenhum) fica.
    pk.remember('s2', { name: 'Zé', look: 'm' });
    expect(pk.assign('s2', new Set()).name).toBe('Zé');
  });
});

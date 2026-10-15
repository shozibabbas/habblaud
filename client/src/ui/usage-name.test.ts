import { describe, expect, it } from 'vitest';
import type { OfficeSnapshot } from '../../../shared/types';
import { splitAccountName } from './usage';

const meta = (machines?: { id: string; name: string; local?: boolean }[]): OfficeSnapshot['meta'] =>
  ({ demo: false, sources: [], startedAt: 0, version: 't', ...(machines ? { machines: machines.map((m) => ({ ...m, online: true, since: 0 })) } : {}) }) as OfficeSnapshot['meta'];

describe('splitAccountName (escritório combinado)', () => {
  it('fora do escritório combinado: o nome como está, sem máquina', () => {
    expect(splitAccountName({ name: 'Conta A' }, meta())).toEqual({ machine: null, name: 'Conta A' });
  });

  it('conta de outra máquina: a etiqueta sai do nome e vira a máquina', () => {
    expect(splitAccountName({ name: 'apps-12nexusbpo · Conta A', machine: { id: 'apps-12nexusbpo', name: 'apps-12nexusbpo' } }, meta())).toEqual({
      machine: 'apps-12nexusbpo',
      name: 'Conta A',
    });
  });

  it('conta local com outras máquinas no escritório: ganha o nome da máquina local', () => {
    const m = meta([
      { id: 'local', name: 'Laptop', local: true },
      { id: 'alice', name: 'alice' },
    ]);
    expect(splitAccountName({ name: 'Conta C' }, m)).toEqual({ machine: 'Laptop', name: 'Conta C' });
  });
});

import { describe, expect, it } from 'vitest';
import { DemoSimulator } from '../../shared/demo/simulator';
import { appearanceProfileOf, inNameSet, NAME_POOL, NAME_SETS, parseNameSet, pickName, type NameSet } from '../../shared/names';
import { compactAgent, toAgentInfo } from '../../shared/timeline';
import type { AgentInfo } from '../../shared/types';
import { NameStore } from './names';
import { Office } from './office';

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

  it('perfil da aparência: o Office põe appearance=pk em todo agente só com o conjunto pk', () => {
    const run = (nameSet?: NameSet) => {
      const office = new Office({
        names: new NameStore(null, { nameSet }),
        ...(nameSet ? { nameSet } : {}),
        version: 't',
        startedAt: 0,
        accounts: () => [],
        sources: () => [],
        accountName: () => undefined,
      });
      office.addMain({ id: 'acc:1', account: 'acc', sessionId: 's1', cwd: '/p/a', role: 'Agente principal', startedAt: 0, status: 'idle' });
      office.addSub({ id: 's1:sub', parentId: 'acc:1', sessionId: 's1', role: 'Explore', background: false, startedAt: 0 });
      office.setDemo(true);
      const snap = office.commit().snapshot;
      return { office, agents: snap.agents };
    };
    expect(appearanceProfileOf('pk')).toBe('pk');
    expect(appearanceProfileOf('br')).toBeUndefined();
    const pk = run('pk');
    expect(pk.agents.length).toBeGreaterThan(2);
    expect(pk.agents.every((a) => a.appearance === 'pk')).toBe(true);
    expect(pk.office.detail('acc:1')?.agent.appearance).toBe('pk');
    // Demo do servidor com pk: nomes paquistaneses também.
    expect(pk.agents.filter((a) => a.id.startsWith('demo:')).every((a) => inNameSet(a.name, 'pk'))).toBe(true);
    for (const set of [undefined, 'br'] as const) expect(run(set).agents.some((a) => 'appearance' in a)).toBe(false);
  });

  it('perfil da aparência: o timelapse grava e devolve o campo', () => {
    const first = (nameSet?: NameSet): AgentInfo => new DemoSimulator({ seed: 3, ...(nameSet ? { nameSet } : {}) }, 10_000).snapshot(10_000).agents[0];
    const a = first('pk');
    expect(a.appearance).toBe('pk');
    expect(compactAgent(a).appearance).toBe('pk');
    expect(toAgentInfo(compactAgent(a)).appearance).toBe('pk');
    const b = first();
    expect('appearance' in compactAgent(b)).toBe(false);
    expect('appearance' in toAgentInfo(compactAgent(b))).toBe(false);
  });
});

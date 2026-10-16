import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { setQuiet } from './log';
import { ownerFromBody, OwnerStore, parseOwner } from './owner';
import { tempDir } from './test/fixtures';

setQuiet(true);

describe('HABBLAUD_OWNER', () => {
  it('sem valor: sem dono e sem aviso', () => {
    expect(parseOwner(undefined)).toEqual({});
    expect(parseOwner('  ')).toEqual({});
  });

  it('lê nome, cargo, look, peças e a secretária', () => {
    const raw = JSON.stringify({
      name: '  Ana   Souza ',
      title: 'CEO',
      look: 'f',
      parts: { topStyle: 'jacket', hair: '#2B1B12' },
      secretary: { name: 'Rafael', look: 'm', parts: { accessory: 'glasses' } },
    });
    expect(parseOwner(raw)).toEqual({
      owner: {
        name: 'Ana Souza',
        title: 'CEO',
        look: 'f',
        parts: { hair: '#2b1b12', topStyle: 'jacket' },
        secretary: { name: 'Rafael', look: 'm', parts: { accessory: 'glasses' } },
      },
    });
  });

  it('look ausente vale "m"; peças vazias e cargo ausente somem', () => {
    expect(parseOwner('{"name":"Sam","parts":{}}')).toEqual({ owner: { name: 'Sam', look: 'm' } });
  });

  it('qualquer campo fora do formato ignora tudo e diz qual', () => {
    expect(parseOwner('{nope')).toEqual({ invalid: 'JSON' });
    expect(parseOwner('["Ana"]')).toEqual({ invalid: 'JSON' });
    expect(parseOwner('{"look":"f"}')).toEqual({ invalid: 'name' });
    expect(parseOwner('{"name":"Ana","look":"x"}')).toEqual({ invalid: 'look' });
    expect(parseOwner('{"name":"Ana","title":""}')).toEqual({ invalid: 'title' });
    expect(parseOwner('{"name":"Ana","parts":{"hairStyle":"mullet"}}')).toEqual({ invalid: 'parts' });
    expect(parseOwner('{"name":"Ana","boss":true}')).toEqual({ invalid: 'boss' });
    expect(parseOwner('{"name":"Ana","secretary":"Rafael"}')).toEqual({ invalid: 'secretary' });
    expect(parseOwner('{"name":"Ana","secretary":{"name":"Rafael","look":"x"}}')).toEqual({ invalid: 'secretary.look' });
    expect(parseOwner('{"name":"Ana","secretary":{"name":"Rafael","title":"PA"}}')).toEqual({ invalid: 'secretary.title' });
    expect(parseOwner(`{"name":"${'x'.repeat(30)}"}`)).toEqual({ invalid: 'name' });
  });
});

describe('owner.json (OwnerStore)', () => {
  it('sem arquivo vale o HABBLAUD_OWNER; gravado, o arquivo manda (também o "sem dono")', () => {
    const tmp = tempDir();
    try {
      const file = join(tmp.dir, 'data', 'owner.json');
      const env = { name: 'Env', look: 'm' as const };
      const a = new OwnerStore(file, env);
      a.load();
      expect([a.get(), a.source()]).toEqual([env, 'env']);
      a.set({ name: 'Ana', look: 'f' });
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ version: 1, owner: { name: 'Ana', look: 'f' } });
      const b = new OwnerStore(file, env);
      b.load();
      expect([b.get(), b.source()]).toEqual([{ name: 'Ana', look: 'f' }, 'settings']);
      b.set(null);
      const c = new OwnerStore(file, env);
      c.load();
      expect([c.get(), c.source()]).toEqual([undefined, 'none']);
    } finally {
      tmp.cleanup();
    }
  });

  it('arquivo ilegível ou fora do formato: vale o HABBLAUD_OWNER', () => {
    const tmp = tempDir();
    try {
      mkdirSync(tmp.dir, { recursive: true });
      const file = join(tmp.dir, 'owner.json');
      for (const body of ['{nope', JSON.stringify({ version: 1, owner: { name: 'Ana', look: 'x' } })]) {
        writeFileSync(file, body);
        const s = new OwnerStore(file, { name: 'Env', look: 'm' });
        s.load();
        expect(s.source()).toBe('env');
      }
    } finally {
      tmp.cleanup();
    }
  });

  it('corpo do PUT: nome vazio tira o dono; cargo vazio e secretária sem nome somem', () => {
    expect(ownerFromBody({ name: '  ' })).toEqual({ owner: null });
    expect(ownerFromBody({})).toEqual({ owner: null });
    expect(ownerFromBody({ name: 'Ana', title: ' ', look: 'f', secretary: { name: '', look: 'm' } })).toEqual({ owner: { name: 'Ana', look: 'f' } });
    expect(ownerFromBody({ name: 'Ana', look: 'f', secretary: null })).toEqual({ owner: { name: 'Ana', look: 'f' } });
    expect(ownerFromBody('Ana')).toEqual({ invalid: 'JSON' });
  });
});

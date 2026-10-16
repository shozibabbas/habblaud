import { describe, expect, it } from 'vitest';
import { parseOwner } from './owner';

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

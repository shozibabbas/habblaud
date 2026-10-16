import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RoomAliases, SESSION_ALIAS_MAX_AGE_MS } from './room-aliases';

const ASSETS = String.raw`C:\Users\x\.habblaud\assets`;
const DASH = String.raw`C:\repos\dash`;

describe('RoomAliases', () => {
  it('padrão, apelido por pasta (barras e maiúsculas tanto faz), vazio volta ao padrão e persiste', () => {
    const dir = mkdtempSync(join(tmpdir(), 'habblaud-rooms-'));
    try {
      const file = join(dir, 'rooms.json');
      const a = new RoomAliases(file);
      a.setDefault(ASSETS, 'Arquiteto');
      expect(a.get('c:/users/x/.habblaud/assets/')).toBe('Arquiteto');
      expect(a.set(DASH, '  Painel   do  Dash ')).toBe('Painel do Dash');
      expect(a.set(ASSETS, 'Oficina')).toBe('Oficina');
      const b = new RoomAliases(file);
      b.load();
      expect(b.get('c:/repos/dash')).toBe('Painel do Dash');
      b.setDefault(ASSETS, 'Arquiteto');
      expect(b.set(ASSETS, '')).toBe('Arquiteto');
      expect(b.get('/outro')).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('salas de sessão: apelido pelo id da sala, persistido ao lado dos das pastas, segue o /clear e expira sem uso', () => {
    const dir = mkdtempSync(join(tmpdir(), 'habblaud-rooms-'));
    try {
      const file = join(dir, 'rooms.json');
      let now = 1_000_000;
      const a = new RoomAliases(file, () => now);
      a.set('/srv', 'Servidor');
      expect(a.setSession('/srv#s1', '  Vendas  ')).toBe('Vendas');
      expect(a.setSession('/srv#s2', 'Kimai')).toBe('Kimai');
      a.followSession('/srv#s1', '/srv#s1b');
      expect(a.getSession('/srv#s1b')).toBe('Vendas');
      expect(a.get('/srv#s1')).toBeUndefined();
      expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ aliases: { '/srv': 'Servidor' }, sessions: { '/srv#s1': { name: 'Vendas', at: now } } });
      expect(a.setSession('/srv#s2', '')).toBeUndefined();

      // Reinício 59 dias depois: tudo volta; consultar renova o prazo de quem ainda aparece.
      now += SESSION_ALIAS_MAX_AGE_MS - 86_400_000;
      const b = new RoomAliases(file, () => now);
      b.load();
      expect(b.get('/srv')).toBe('Servidor');
      expect(b.getSession('/srv#s1')).toBe('Vendas');
      expect(b.getSession('/srv#s2')).toBeUndefined();
      // Mais 2 dias: /srv#s1b nunca mais apareceu e expira; /srv#s1 foi consultado e fica. O da pasta não expira.
      now += 2 * 86_400_000;
      const c = new RoomAliases(file, () => now);
      c.load();
      expect(c.getSession('/srv#s1b')).toBeUndefined();
      expect(c.getSession('/srv#s1')).toBe('Vendas');
      expect(c.get('/srv')).toBe('Servidor');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

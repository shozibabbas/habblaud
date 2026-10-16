// Configuração da mesquita: padrão (Islamabad, sunni, chamado ligado), HABBLAUD_PRAYER_STYLE como estilo inicial,
// PUT parcial gravado no mosque.json e campos fora do formato recusados.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MOSQUE, methodFor, parseMosque, parsePrayerStyle } from '../shared/mosque';
import { MosqueStore } from './mosque';

describe('mesquita (configuração)', () => {
  it('padrão: sunni em Islamabad, chamado ligado; o estilo do env vale até haver mosque.json', () => {
    expect(new MosqueStore(null).get()).toEqual(DEFAULT_MOSQUE);
    expect(new MosqueStore(null).source()).toBe('default');
    const env = new MosqueStore(null, 'shia');
    expect(env.get().style).toBe('shia');
    expect(env.source()).toBe('env');
    expect(parsePrayerStyle(' Shia ')).toBe('shia');
    expect(parsePrayerStyle('x')).toBeUndefined();
    expect(methodFor('shia')).toBe('jafari');
    expect(methodFor('sunni')).toBe('karachi');
  });

  it('PUT parcial: mistura com o que está em uso, grava e recarrega', () => {
    const dir = mkdtempSync(join(tmpdir(), 'habblaud-mosque-'));
    const file = join(dir, 'mosque.json');
    const s = new MosqueStore(file, 'shia');
    const r = s.update({ city: '  Lahore ', lat: '31.5204', lon: 74.3587, combine: true });
    expect(r).toEqual({ mosque: { ...DEFAULT_MOSQUE, style: 'shia', city: 'Lahore', lat: 31.5204, lon: 74.3587, combine: true } });
    expect(JSON.parse(readFileSync(file, 'utf8')).mosque.city).toBe('Lahore');
    const again = new MosqueStore(file);
    again.load();
    expect(again.get().style).toBe('shia');
    expect(again.source()).toBe('settings');
  });

  it('recusa campos fora do formato', () => {
    expect(parseMosque({ style: 'wahhabi' })).toEqual({ invalid: 'style' });
    expect(parseMosque({ lat: 91 })).toEqual({ invalid: 'lat' });
    expect(parseMosque({ call: 'yes' })).toEqual({ invalid: 'call' });
    expect(parseMosque({ extra: 1 })).toEqual({ invalid: 'extra' });
    expect(parseMosque([])).toEqual({ invalid: 'JSON' });
  });
});

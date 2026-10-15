import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { tempDir } from '../test/fixtures';
import { createStaticHandler, frameHeaders, parseFrameAncestors, type StaticOptions } from './static';

describe('HABBLAUD_FRAME_ANCESTORS', () => {
  it('aceita origens separadas por espaço ou vírgula, normalizadas e sem repetir', () => {
    expect(parseFrameAncestors('http://localhost:4700 http://127.0.0.1:4700,https://Painel.Lan/')).toEqual({
      origins: ['http://localhost:4700', 'http://127.0.0.1:4700', 'https://painel.lan'],
      invalid: [],
    });
    expect(parseFrameAncestors('http://localhost:4700, http://localhost:4700').origins).toEqual(['http://localhost:4700']);
    expect(parseFrameAncestors('http://[::1]:4700').origins).toEqual(['http://[::1]:4700']);
  });

  it('ignora o que não é uma origem http(s): curinga, caminho, outro esquema, usuário, lixo', () => {
    const r = parseFrameAncestors("* http://*.lan https://x.lan/painel ftp://x.lan javascript:alert(1) 'self' http://u:p@x.lan localhost:4700 http://x.lan?a=1");
    expect(r.origins).toEqual([]);
    expect(r.invalid).toHaveLength(9);
  });

  it('vazio ou ausente: nenhuma origem', () => {
    expect(parseFrameAncestors(undefined)).toEqual({ origins: [], invalid: [] });
    expect(parseFrameAncestors(' , ')).toEqual({ origins: [], invalid: [] });
  });

  it('cabeçalhos: sem origens, DENY; com origens, só o frame-ancestors', () => {
    expect(frameHeaders([])).toEqual({ 'X-Frame-Options': 'DENY' });
    expect(frameHeaders(['http://localhost:4700', 'http://127.0.0.1:4700'])).toEqual({
      'Content-Security-Policy': 'frame-ancestors http://localhost:4700 http://127.0.0.1:4700',
    });
  });

  it('vem do ambiente para a configuração', () => {
    const cfg = loadConfig({ HOME: '/tmp/nada', HABBLAUD_FRAME_ANCESTORS: 'http://localhost:4700 https://x.lan/p' }, []);
    expect(cfg.frameAncestors).toEqual(['http://localhost:4700']);
    expect(cfg.frameAncestorsInvalid).toEqual(['https://x.lan/p']);
    expect(loadConfig({ HOME: '/tmp/nada' }, []).frameAncestors).toEqual([]);
  });
});

describe('estáticos: enquadramento', () => {
  const cleanups: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function serve(opts?: StaticOptions): Promise<string> {
    const tmp = tempDir();
    cleanups.push(tmp.cleanup);
    const dist = join(tmp.dir, 'dist');
    mkdirSync(join(dist, 'bundle'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Habblaud</title>');
    writeFileSync(join(dist, 'bundle', 'main-abc12345.js'), 'console.log(1)');
    const handler = createStaticHandler(dist, opts);
    const server = http.createServer((req, res) => handler(req, res, new URL(req.url ?? '/', 'http://x').pathname));
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    cleanups.push(() => new Promise<void>((ok) => server.close(() => ok())));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('padrão: X-Frame-Options DENY e nenhum frame-ancestors', async () => {
    const base = await serve();
    const page = await fetch(`${base}/?embed=1`);
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    expect(page.headers.get('content-security-policy')).toBeNull();
  });

  it('com origens: frame-ancestors na página, nos arquivos e no 304, sem X-Frame-Options', async () => {
    const base = await serve({ frameAncestors: ['http://localhost:4700'] });
    const page = await fetch(`${base}/?embed=1`);
    expect(page.status).toBe(200);
    expect(page.headers.get('x-frame-options')).toBeNull();
    expect(page.headers.get('content-security-policy')).toBe('frame-ancestors http://localhost:4700');
    const bundle = await fetch(`${base}/bundle/main-abc12345.js`);
    expect(bundle.headers.get('content-security-policy')).toBe('frame-ancestors http://localhost:4700');
    const again = await fetch(`${base}/`, { headers: { 'If-None-Match': page.headers.get('etag')! } });
    expect(again.status).toBe(304);
    expect(again.headers.get('content-security-policy')).toBe('frame-ancestors http://localhost:4700');
    expect(again.headers.get('x-frame-options')).toBeNull();
  });
});

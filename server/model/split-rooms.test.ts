// Salas por sessão (HABBLAUD_ROOMS=auto/session): quem vai para qual sala, nomes, renomear, personagem e vagas.
import { describe, expect, it } from 'vitest';
import { roomFolderOf, sessionRoomId, type RoomMode } from '../../shared/rooms';
import { parseRoomMode } from '../config';
import { setQuiet } from '../log';
import { NameStore } from './names';
import { Office, OFFLINE_GRACE_MS, SLOT_COOLDOWN_MS } from './office';
import { RoomAliases } from './room-aliases';
import { titleRoomName } from './rooms';

setQuiet(true);

function makeOffice(rooms: RoomMode, names = new NameStore(null)) {
  let clock = 1_000_000;
  const aliases = new RoomAliases(null, () => clock);
  const office = new Office({
    names,
    rooms,
    roomAlias: (path) => aliases.get(path),
    sessionRoomAlias: (id) => aliases.getSession(id),
    followSessionRoom: (from, to) => aliases.followSession(from, to),
    version: 't',
    startedAt: clock,
    accounts: () => [],
    sources: () => [],
    accountName: () => undefined,
    now: () => clock,
  });
  const add = (n: number, cwd = '/srv', title?: string) => {
    office.addMain({ id: `acc:${n}`, account: 'acc', sessionId: `s${n}`, cwd, role: 'Agente principal', startedAt: clock, status: 'working' });
    if (title) office.applyTranscript(`acc:${n}`, { title, tasks: [], stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 } });
  };
  /** Igual ao index.ts: sala de sessão grava pelo id da sala, a da pasta pela pasta. */
  const rename = (id: string, name: string) => {
    const path = office.roomPath(id);
    if (!path) return undefined;
    if (office.isSessionRoom(id)) aliases.setSession(id, name);
    else aliases.set(path, name);
    office.refreshRoomNames();
    return office.roomName(id);
  };
  const rooms_ = () => office.commit().snapshot.rooms;
  const roomOf = (n: number) => office.get(`acc:${n}`)!.roomId;
  const leave = (n: number) => office.closeMain(`acc:${n}`);
  const pass = (ms: number) => {
    clock += ms;
    office.tick();
  };
  return { office, aliases, add, rename, rooms: rooms_, roomOf, leave, pass, names };
}

const summary = (title: string, roomTitle?: string) => ({ title, ...(roomTitle ? { roomTitle } : {}), tasks: [], stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 } });

describe('HABBLAUD_ROOMS', () => {
  it('lê o modo: vazio e desconhecido valem folder (o desconhecido volta para o aviso)', () => {
    expect(parseRoomMode(undefined)).toEqual({ mode: 'folder' });
    expect(parseRoomMode(' Auto ')).toEqual({ mode: 'auto' });
    expect(parseRoomMode('session')).toEqual({ mode: 'session' });
    expect(parseRoomMode('sessions')).toEqual({ mode: 'folder', invalid: 'sessions' });
  });

  it('id da sala de sessão: "<pasta>#<sessão>", e a pasta volta a partir dele', () => {
    expect(sessionRoomId('/srv', 'abc-123')).toBe('/srv#abc-123');
    expect(roomFolderOf('/srv#abc-123')).toBe('/srv');
    expect(roomFolderOf('/srv')).toBe('/srv');
    // '#' no meio do caminho (com barra depois) não é sala de sessão.
    expect(roomFolderOf('/p/c#/app')).toBe('/p/c#/app');
  });
});

describe('salas: folder (padrão)', () => {
  it('sessões na mesma pasta dividem a sala, como sempre', () => {
    const t = makeOffice('folder');
    t.add(1);
    t.add(2);
    t.add(3);
    expect(t.rooms().map((r) => [r.id, r.name])).toEqual([['/srv', 'srv']]);
    expect(t.rooms()[0]).not.toHaveProperty('sessionId');
  });
});

describe('salas: session', () => {
  it('cada principal na sua sala, com o caminho da pasta; subagentes na do pai', () => {
    const t = makeOffice('session');
    t.add(1, '/srv/');
    t.add(2, '/srv', 'Training tool improvements');
    t.office.addSub({ id: 'acc:2:sub', parentId: 'acc:2', sessionId: 's2', role: 'Explore', background: false, startedAt: 0 });
    expect(t.office.get('acc:2:sub')!.roomId).toBe('/srv#s2');
    expect(t.rooms().map((r) => [r.id, r.path, r.name, r.sessionId])).toEqual([
      ['/srv#s1', '/srv', 'srv', 's1'],
      ['/srv#s2', '/srv', 'Training Tool Improvements', 's2'],
    ]);
  });
});

describe('salas: auto', () => {
  it('sozinha na pasta: a sala da pasta; a segunda sessão divide (a primeira se muda uma vez)', () => {
    const t = makeOffice('auto');
    t.add(1, '/srv', 'I am making a product for the following:\n* training of sales');
    t.add(9, '/p/loja');
    expect(t.roomOf(1)).toBe('/srv');
    expect(t.rooms().map((r) => r.name)).toEqual(['srv', 'loja']);
    t.add(2, '/srv', 'can you do the kimai VA check-in for today?');
    expect(t.roomOf(1)).toBe('/srv#s1');
    expect(t.roomOf(2)).toBe('/srv#s2');
    expect(t.roomOf(9)).toBe('/p/loja');
    expect(t.rooms().map((r) => [r.id, r.name])).toEqual(
      expect.arrayContaining([
        ['/srv#s1', 'Product: Training of Sales'],
        ['/srv#s2', 'Kimai VA Check-In'],
        ['/p/loja', 'loja'],
      ]),
    );
    expect(t.rooms().some((r) => r.id === '/srv')).toBe(false);
    // Os subagentes vão junto com o pai.
    t.office.addSub({ id: 'acc:2:sub', parentId: 'acc:2', sessionId: 's2', role: 'Explore', background: false, startedAt: 0 });
    t.add(3);
    expect(t.office.get('acc:2:sub')!.roomId).toBe('/srv#s2');
    expect(t.roomOf(3)).toBe('/srv#s3');
  });

  it('ao dividir, a sala nova de quem estava na da pasta já nasce com o título, e o feed dele vai junto', () => {
    const t = makeOffice('auto');
    t.add(1, '/srv', 'Training tool improvements');
    t.office.addActivity('acc:1', { id: 'a1', at: 1, kind: 'prompt', icon: '💬', text: 'x' }, true);
    t.office.commit();
    t.add(2);
    const { notices } = t.office.commit();
    expect(notices.map((n) => n.text)).toContain('🏗️ Nova sala: Training Tool Improvements');
    expect(t.office.recentFeed(5).map((f) => [f.roomId, f.roomName])).toEqual([['/srv#s1', 'Training Tool Improvements']]);
  });

  it('subagentes de quem estava na sala da pasta se mudam junto', () => {
    const t = makeOffice('auto');
    t.add(1);
    t.office.addSub({ id: 'acc:1:sub', parentId: 'acc:1', sessionId: 's1', role: 'Explore', background: false, startedAt: 0 });
    t.add(2);
    expect(t.office.get('acc:1:sub')!.roomId).toBe('/srv#s1');
  });

  it('sem vai-e-vem: quem sobra fica na sala dele; pasta vazia volta a ser uma sala só', () => {
    const t = makeOffice('auto');
    t.add(1);
    t.add(2);
    t.leave(2);
    t.pass(OFFLINE_GRACE_MS + 1);
    expect(t.roomOf(1)).toBe('/srv#s1');
    // Ainda há alguém na pasta: quem chega ganha a própria sala.
    t.add(3);
    expect(t.roomOf(3)).toBe('/srv#s3');
    t.leave(1);
    t.leave(3);
    t.pass(OFFLINE_GRACE_MS + 1);
    expect(t.rooms()).toEqual([]);
    t.add(4);
    expect(t.roomOf(4)).toBe('/srv');
  });

  it('a mesma sessão reaberta noutro processo (período de graça) não divide nem troca de sala', () => {
    const t = makeOffice('auto');
    t.add(1);
    t.leave(1);
    t.office.addMain({ id: 'acc:1b', account: 'acc', sessionId: 's1', cwd: '/srv', role: 'Agente principal', startedAt: 0, status: 'working' });
    expect(t.office.get('acc:1b')!.roomId).toBe('/srv');
    // Numa pasta dividida, a sessão reaberta volta para a sala dela.
    t.add(2);
    t.add(3);
    t.leave(2);
    t.office.addMain({ id: 'acc:2b', account: 'acc', sessionId: 's2', cwd: '/srv', role: 'Agente principal', startedAt: 0, status: 'working' });
    expect(t.office.get('acc:2b')!.roomId).toBe('/srv#s2');
  });

  it('vagas: cada sala de sessão pega a sua e mantém enquanto existir', () => {
    const t = makeOffice('auto');
    t.add(9, '/p/loja');
    t.add(1);
    const first = t.rooms();
    expect(first.map((r) => [r.id, r.slot])).toEqual([
      ['/p/loja', 0],
      ['/srv', 1],
    ]);
    t.add(2);
    t.add(3);
    // A sala da pasta saiu (a vaga 1 espera o fim da animação); as de sessão pegam as seguintes.
    const slots = new Map(t.rooms().map((r) => [r.id, r.slot]));
    expect(slots).toEqual(
      new Map([
        ['/p/loja', 0],
        ['/srv#s1', 2],
        ['/srv#s2', 3],
        ['/srv#s3', 4],
      ]),
    );
    t.leave(2);
    t.pass(OFFLINE_GRACE_MS + 1);
    t.pass(SLOT_COOLDOWN_MS + 1);
    t.add(4);
    const after = new Map(t.rooms().map((r) => [r.id, r.slot]));
    expect(after.get('/srv#s1')).toBe(2);
    expect(after.get('/srv#s3')).toBe(4);
    expect(after.get('/srv#s4')).toBe(1);
  });
});

describe('salas de sessão: nomes', () => {
  it('sem título: o nome da pasta numerado na ordem de chegada; nomes nunca se repetem', () => {
    const t = makeOffice('session');
    t.add(1);
    t.add(2);
    t.add(3, '/srv', 'Training tool improvements');
    t.add(4, '/srv', 'training tool improvements!');
    t.add(5, '/p/srv');
    expect(t.rooms().map((r) => r.name)).toEqual(['srv', 'srv 2', 'Training Tool Improvements', 'Training Tool Improvements 2', 'p/srv']);
  });

  it('as linhas do feed de uma sala de sessão acompanham o nome quando o título chega', () => {
    const t = makeOffice('session');
    t.add(1);
    t.office.addActivity('acc:1', { id: 'a1', at: 1, kind: 'prompt', icon: '💬', text: 'x' }, true);
    t.office.applyTranscript('acc:1', summary('Training tool improvements'));
    const { feed } = t.office.commit();
    expect(feed.map((f) => f.roomName)).toEqual(['Training Tool Improvements']);
    expect(t.office.recentFeed(5).map((f) => f.roomName)).toEqual(['Training Tool Improvements']);
  });

  it('o nome vem do primeiro pedido (roomTitle) e não muda a cada pedido novo', () => {
    const t = makeOffice('session');
    t.add(1);
    t.office.applyTranscript('acc:1', summary('fix the tests', 'Sales training product naming'));
    t.office.applyTranscript('acc:1', summary('now deploy it', 'Sales training product naming'));
    expect(t.office.get('acc:1')!.title).toBe('now deploy it');
    expect(t.rooms()[0].name).toBe('Sales Training Product');
  });

  it('/clear: a sala fica com o processo e com o nome até a sessão nova ter um título', () => {
    const t = makeOffice('session');
    t.add(1, '/srv', 'Training tool improvements');
    t.office.switchSession('acc:1', 's1b');
    t.office.applyTranscript('acc:1', { tasks: [], stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 } });
    expect(t.roomOf(1)).toBe('/srv#s1');
    expect(t.rooms()[0].name).toBe('Training Tool Improvements');
    t.office.applyTranscript('acc:1', summary('please review the invoices export'));
    expect(t.rooms()[0].name).toBe('Review Invoices Export');
  });

  it('renomear: grava pelo id da sala de sessão, vale enquanto a sessão existir e vazio volta ao automático', () => {
    const t = makeOffice('auto');
    t.add(1, '/srv', 'Training tool improvements');
    t.add(2);
    expect(t.rename('/srv#s2', 'Planilhas')).toBe('Planilhas');
    // Outro nome igual a um que já existe ganha número.
    expect(t.rename('/srv#s1', 'planilhas')).toBe('planilhas 2');
    expect(t.rooms().find((r) => r.id === '/srv#s1')).toMatchObject({ name: 'planilhas 2', defaultName: 'Training Tool Improvements', sessionId: 's1' });
    expect(t.rename('/srv#s1', '')).toBe('Training Tool Improvements');
    // A pasta não ganhou apelido.
    expect(t.aliases.get('/srv')).toBeUndefined();
    // /clear: o apelido segue para o id que a sala terá depois de um reinício.
    t.office.switchSession('acc:2', 's2b');
    expect(t.aliases.getSession('/srv#s2b')).toBe('Planilhas');
    expect(t.rename('/nada#x', 'X')).toBeUndefined();
  });

  it('a sala da pasta (auto, sozinha) continua com o apelido da pasta', () => {
    const t = makeOffice('auto');
    t.add(1);
    expect(t.rename('/srv', 'Servidor')).toBe('Servidor');
    expect(t.aliases.get('/srv')).toBe('Servidor');
    // Ao dividir, as salas sem título ficam com o nome da pasta numerado.
    t.add(2);
    expect(t.rooms().map((r) => r.name)).toEqual(['Servidor', 'Servidor 2']);
  });
});

describe('salas de sessão: personagem', () => {
  it('salvo numa sala de sessão fica com ela; a sala sem personagem próprio usa o da pasta', () => {
    const names = new NameStore(null);
    names.setCharacter('/srv', { name: 'Zara', look: 'f', seed: 7 });
    const t = makeOffice('session', names);
    t.add(1);
    expect(t.office.get('acc:1')).toMatchObject({ name: 'Zara', custom: true });
    expect(names.character('/srv')?.owner).toBe('s1');
    // O nome não se repete: a segunda sessão fica com o sorteado.
    t.add(2);
    expect(t.office.get('acc:2')!.name).not.toBe('Zara');
    // Mudar o visual mantendo o nome não esbarra no personagem da pasta que ele mesmo usa.
    expect(t.office.setCharacter('acc:1', { name: 'Zara', seed: 9, parts: {} })).toEqual({ result: 'ok' });
    expect(names.character('/srv#s1')).toMatchObject({ name: 'Zara', seed: 9, owner: 's1' });
    expect(t.office.setCharacter('acc:2', { name: 'Yuri', seed: 3, parts: {} })).toEqual({ result: 'ok' });
    expect(names.character('/srv#s2')?.name).toBe('Yuri');
    expect(t.office.setCharacter('acc:2', { name: 'Zara', seed: 3, parts: {} })).toMatchObject({ result: 'conflict' });
  });
});

describe('titleRoomName', () => {
  it.each([
    ['I am making a product for the following:\n* training of sales', 'Product: Training of Sales'],
    ['can you do the kimai VA check-in for today?', 'Kimai VA Check-In'],
    ['Training tool improvements', 'Training Tool Improvements'],
    ['Sales training product naming', 'Sales Training Product'],
    ['please fix the login redirect bug on staging', 'Fix Login Redirect Bug'],
    ['Add dark mode to the settings page. Then ship it.', 'Dark Mode to Settings Page'],
    ['hey, can you look at https://github.com/x/y/issues/12 and fix it', 'Fix It'],
    ['Make the C++ build work with GitHub Actions', 'C++ Build Work with GitHub'],
    ['Quero que você crie uma página de login para o app', 'Página de Login para App'],
    ['Je voudrais une page pour les factures', 'Page pour Factures'],
    ['ログイン画面を作って、テストも書いてください。それからデプロイ', 'ログイン画面を作って、テストも書いてください'],
    ['Supercalifragilisticexpialidociousword thing', 'Supercalifragilisticexpia…'],
  ])('%j -> %j', (title, name) => {
    expect(titleRoomName(title)).toBe(name);
  });

  it('nada que preste: undefined (a sala fica com o nome da pasta)', () => {
    expect(titleRoomName(undefined)).toBeUndefined();
    expect(titleRoomName('please')).toBeUndefined();
    expect(titleRoomName('  * — ')).toBeUndefined();
  });

  it('determinístico e nunca maior que o limite', () => {
    const long = 'implement the new federation handshake between the office servers and the hub';
    expect(titleRoomName(long)).toBe(titleRoomName(long));
    expect([...titleRoomName(long)!].length).toBeLessThanOrEqual(26);
  });
});

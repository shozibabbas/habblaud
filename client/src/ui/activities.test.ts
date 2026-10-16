// Menu "Atividades": o aviso com quem foi e quem ficou e quando o menu está desligado.
import { describe, expect, it } from 'vitest';
import type { SendAllResult } from '../world/api';
import { SEND_ACTIVITIES } from '../world/sim/send-all';
import { activitiesBlocked, activityToast } from './activities';

const info = (id: string) => SEND_ACTIVITIES.find((a) => a.id === id)!;
const res = (p: Partial<SendAllResult> & Pick<SendAllResult, 'activity'>): SendAllResult => ({ sent: [], busy: 0, full: 0, nonSmokers: 0, extra: 0, skipped: 0, crew: [], ...p });

describe('aviso das atividades', () => {
  it('chamado para a oração: quantos vão e quantos ocupados ficaram', () => {
    expect(activityToast(info('prayer'), res({ activity: 'prayer', sent: ['a', 'b', 'c'], busy: 2 }))).toBe('🕌 Chamado para a oração: 3 a caminho da mesquita · 2 ocupados ficaram');
  });

  it('jogos contam a torcida; soneca, quem cochila na mesa; cigarro, os não fumantes', () => {
    expect(activityToast(info('pingpong'), res({ activity: 'pingpong', sent: ['a', 'b', 'c', 'd', 'e'], extra: 1 }))).toBe('🏓 Pingue-pongue: 4 jogando · 1 na torcida');
    expect(activityToast(info('nap'), res({ activity: 'nap', sent: ['a', 'b'], extra: 2 }))).toBe('😴 Soneca nas cápsulas: 2 cochilando na mesa');
    expect(activityToast(info('smoke'), res({ activity: 'smoke', sent: ['a'], nonSmokers: 4 }))).toBe('🚬 Pausa para o cigarro: 1 indo fumar · 4 não fumantes ficaram');
  });

  it('ninguém livre / todos já na mesa / sem lugar', () => {
    expect(activityToast(info('tv'), res({ activity: 'tv', busy: 3 }))).toBe('📺 TV do lounge: ninguém livre agora · 3 ocupados ficaram');
    expect(activityToast(info('desk'), res({ activity: 'desk' }))).toBe('💻 De volta às mesas: todos já estão na mesa');
    expect(activityToast(info('tennis'), res({ activity: 'tennis', sent: ['a', 'b'], full: 3 }))).toBe('🎾 Tênis: 2 jogando · 3 sem lugar');
  });

  it('desligado no timelapse, com os agentes de demonstração e sem atividades', () => {
    const ok = { hasApi: true, replay: false, demo: false, count: 5 };
    expect(activitiesBlocked(ok)).toBeNull();
    expect(activitiesBlocked({ ...ok, replay: true })).toMatch(/timelapse/);
    expect(activitiesBlocked({ ...ok, demo: true })).toMatch(/demonstração/);
    expect(activitiesBlocked({ ...ok, count: 0 })).not.toBeNull();
    expect(activitiesBlocked({ ...ok, hasApi: false })).not.toBeNull();
  });
});

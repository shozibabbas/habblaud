// Depuração da equipe do escritório (console: `habblaud.world.debug.staff`): quem é, o que está fazendo, a escala de
// limpeza, mandar limpar agora e envelhecer o brilho do piso (para ver o brilho novo ao lado de um quase apagado).
import { TILE } from '../art/api';
import type { Camera } from './camera';
import { cleanNow, cleaningAreas, lastCleanedOf, schedule, type CleanerState } from './sim/cleaner';
import type { Sim } from './sim/sim';

export interface StaffDebug {
  /** A equipe: id, nome, função, o que faz e onde está. */
  list(): { id: string; name: string; role: string; doing: string | null; tile: [number, number]; step: string | null }[];
  /** Escala da limpeza: cada área, há quantos minutos foi limpa e quem está com ela agora (as mais antigas primeiro). */
  areas(): { id: string; name: string; minutesAgo: number; by: string | null }[];
  /** Manda alguém da limpeza (nome ou id; padrão: quem está livre) limpar agora a área `area` (id ou nome; padrão: a da escala). */
  clean(who?: string, area?: string): string | null;
  /** Todo mundo da limpeza começa a próxima ronda agora. */
  hurry(): void;
  /** Envelhece todo o brilho do piso em `seconds` (negativo rejuvenesce). Retorna quantos trechos há. */
  ageShine(seconds: number): number;
  /** Câmera acompanhando alguém da equipe (nome ou id). */
  lookAt(who: string, zoom?: number): void;
}

export function createStaffDebug(sim: Sim, camera: Camera, onCameraMoved: () => void, now: () => number): StaffDebug {
  const crew = sim.staff;
  const find = (who: string) => {
    const w = who.toLowerCase();
    return [...crew.members.values()].find((m) => m.id === who || m.ch.info.name.toLowerCase() === w);
  };
  return {
    list: () =>
      [...crew.members.values()].map((m) => ({
        id: m.id,
        name: m.ch.info.name,
        role: m.role,
        doing: crew.card(m.id)?.doing ?? null,
        tile: [m.ch.tx, m.ch.ty] as [number, number],
        step: m.ch.step?.t ?? null,
      })),
    areas: () => {
      const t = now();
      const s = schedule(crew);
      return cleaningAreas(crew)
        .map((a) => ({ id: a.id, name: a.name, minutesAgo: Math.round(((t - lastCleanedOf(s.last, a.id, t)) / 60_000) * 10) / 10, by: crew.member(s.claims.get(a.id))?.ch.info.name ?? null }))
        .sort((a, b) => b.minutesAgo - a.minutesAgo);
    },
    clean: (who, area) => cleanNow(crew, who, area),
    hurry: () => {
      for (const m of crew.members.values()) {
        if (m.role !== 'cleaner') continue;
        (m.state as CleanerState).nextRoundAt = now();
        if (m.ch.step?.t === 'until') sim.clearPlan(m.ch);
      }
    },
    ageShine: (seconds) => {
      for (const p of crew.shine.items) p.at -= seconds * 1000;
      return crew.shine.items.length;
    },
    lookAt: (who, zoom = 3) => {
      const m = find(who);
      if (!m) return;
      onCameraMoved();
      camera.stop();
      camera.x = m.ch.x;
      camera.y = m.ch.y - TILE;
      camera.zoom = zoom;
      camera.clamp();
      // a câmera acompanha a pessoa (clicar no mapa ou arrastar solta)
      camera.follow = m.id;
    },
  };
}

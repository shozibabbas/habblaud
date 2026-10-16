// Demonstração do campus no modo mock: `?mock=1&machines=4` transforma o snapshot do simulador num
// escritório combinado (como o servidor faz com HABBLAUD_PEERS): cada sala vai para uma máquina, ganha a
// etiqueta "máquina · sala" e `baseName`, os agentes herdam a máquina da sala e `meta.machines` lista
// todas. `offline=N` deixa a N-ésima máquina (1 = a primeira depois da local) desconectada e `owner=1` inventa um
// dono (meta.owner, como HABBLAUD_OWNER), para a diretoria aparecer; `owner=Nome` ou `owner=Nome,Secretária` dá os
// nomes. Puro.
import { hash32 } from '../../../shared/hash';
import type { AppearanceParts } from '../../../shared/appearance';
import type { MachineRef, MachineStatus, OfficeSnapshot, OwnerInfo } from '../../../shared/types';

const NAMES = ['Laptop', 'server1', 'server2', 'server3', 'server4', 'server5'] as const;

export interface CampusMockOptions {
  machines: number;
  offline?: number;
  /** Inventa um dono (a diretoria aparece no campus): true = o do mock, ou os nomes [dono, secretária]. */
  owner?: boolean | readonly [string, string?];
}

/** De terno grafite e gravata vermelha, óculos e barba curta. */
const MOCK_OWNER_PARTS: AppearanceParts = {
  topStyle: 'suit',
  top: '#3d4352',
  topAccent: '#c0392b',
  bottom: '#3d4352',
  bottomStyle: 'pants',
  skin: '#d69f78',
  hair: '#2b2530',
  hairStyle: 'side_part',
  facialHair: 'short_beard',
  accessory: 'glasses',
  accessoryColor: '#2b2b33',
  shoes: '#2b2b33',
};

/** Dono de mentira do mock (`owner=1`). */
export const MOCK_OWNER: OwnerInfo = { name: 'Rafael', title: 'CEO', look: 'm', parts: MOCK_OWNER_PARTS, secretary: { name: 'Marina', look: 'f' } };

function mockOwner(o: CampusMockOptions['owner']): OwnerInfo | null {
  if (!o) return null;
  if (o === true) return MOCK_OWNER;
  return { ...MOCK_OWNER, name: o[0], secretary: { name: o[1] || MOCK_OWNER.secretary!.name, look: 'f' } };
}

/** Opções da query string (null = sem demonstração do campus). */
export function campusMockFrom(search: string): CampusMockOptions | null {
  const p = new URLSearchParams(search);
  const n = Number(p.get('machines'));
  if (!Number.isFinite(n) || n < 2) return null;
  const off = Number(p.get('offline'));
  const owner = p.get('owner');
  return {
    machines: Math.min(NAMES.length, Math.floor(n)),
    ...(Number.isFinite(off) && off >= 1 ? { offline: Math.floor(off) } : {}),
    ...(owner && owner !== '0' ? { owner: owner === '1' ? true : ([...owner.split(',').map((s) => s.trim().slice(0, 24))] as [string, string?]) } : {}),
  };
}

export function mockCampusSnapshot(snap: OfficeSnapshot, opts: CampusMockOptions): OfficeSnapshot {
  const ms: MachineRef[] = NAMES.slice(0, opts.machines).map((name, i) => ({ id: i === 0 ? 'local' : name, name }));
  const status: MachineStatus[] = ms.map((m, i) => ({ ...m, ...(i === 0 ? { local: true } : {}), online: i !== opts.offline, since: snap.serverTime - 60_000 }));
  // a local fica com mais salas (o computador onde o Habblaud roda)
  const machineOf = (roomId: string): MachineRef => {
    const h = hash32(roomId) % (ms.length + 1);
    return ms[h >= ms.length ? 0 : h];
  };
  const byRoom = new Map(snap.rooms.map((r) => [r.id, machineOf(r.id)]));
  return {
    ...snap,
    rooms: snap.rooms.map((r) => {
      const m = byRoom.get(r.id)!;
      return { ...r, name: `${m.name} · ${r.name}`, baseName: r.name, machine: m };
    }),
    agents: snap.agents.map((a) => ({ ...a, machine: byRoom.get(a.roomId) ?? ms[0] })),
    meta: { ...snap.meta, machines: status, ...(mockOwner(opts.owner) ? { owner: mockOwner(opts.owner)! } : {}) },
  };
}

// Ids das salas. A sala de uma pasta tem como id o cwd normalizado ("/srv"); com HABBLAUD_ROOMS=auto ou session, uma
// sessão pode ganhar a sua própria sala dentro da pasta, com o id "<cwd>#<id da sessão>" ("/srv#3f2a…"). O caminho
// (RoomInfo.path) continua sendo o cwd. O '#' não vai em URL nenhuma: as salas só aparecem em corpos JSON
// (POST /api/rooms/rename) e no prefixo "<par>~" do escritório combinado, que separa no primeiro '~'.

/** Separador entre a pasta e a sessão no id de uma sala de sessão. */
export const SESSION_ROOM_SEP = '#';

/** Como as salas são montadas (HABBLAUD_ROOMS): por pasta (padrão), por sessão só quando a pasta tem várias, ou sempre por sessão. */
export type RoomMode = 'folder' | 'auto' | 'session';

export const ROOM_MODES: readonly RoomMode[] = ['folder', 'auto', 'session'];

export function sessionRoomId(folder: string, sessionId: string): string {
  return `${folder}${SESSION_ROOM_SEP}${sessionId}`;
}

/**
 * Pasta da sala a partir do id (para nomes de reserva, como o das estatísticas do dia): tira o "#<sessão>" do fim.
 * Só corta quando o resto parece um id de sessão (sem barra), para uma pasta com '#' no nome continuar inteira.
 */
export function roomFolderOf(roomId: string): string {
  const i = roomId.lastIndexOf(SESSION_ROOM_SEP);
  if (i <= 0) return roomId;
  const tail = roomId.slice(i + 1);
  return tail && !/[\\/]/.test(tail) ? roomId.slice(0, i) : roomId;
}

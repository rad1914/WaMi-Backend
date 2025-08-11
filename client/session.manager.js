// @path: client/session.manager.js
import { createSocket } from './socketFactory.js';
import { initAuthState } from '../utils/session.js';
const sessions = new Map();

export async function initSession(id, force = false) {
  if (!force && sessions.has(id)) return sessions.get(id);
  const { state, saveCreds } = await initAuthState(id);
  const sock = await createSocket({
    authState: { ...state, saveCreds },
    sessionId: id,
    browserName: 'MultiBaileys',
    reinit: () => initSession(id, true)
  });
  return sessions.set(id, { sock, saveCreds }).get(id);
}

export function getSession(id) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session '${id}' not found`);
  return session.sock;
}

export async function deleteSession(id) {
  const session = sessions.get(id);
  if (session?.sock?.logout) await session.sock.logout();
  sessions.delete(id);

  const path = (await import('path')).resolve('.sessions', id);
  const fs = await import('fs');
  if (fs.existsSync(path)) fs.rmSync(path, { recursive: true, force: true });
}

export function updateSession(id, data) {
    const session = sessions.get(id);
    if (!session) throw new Error(`Session '${id}' not found`);
    sessions.set(id, { ...session, ...data });
}

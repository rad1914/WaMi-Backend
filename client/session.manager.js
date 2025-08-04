// @path: client/session.manager.js
import { createSocket } from './socketFactory.js';
import { initAuthState } from '../utils/session.js';
import { store } from '../store/store.js';
import { saveStore } from '../utils/store.js';

const sessions = new Map();

export async function initSession(id, force = false) {
  if (!force && sessions.has(id)) {
    return sessions.get(id);
  }

  const { state, saveCreds } = await initAuthState(id);
  const sock = await createSocket({
    authState:  { ...state, saveCreds },
    sessionId:  id,
    browserName:'MultiBaileys',
    reinit:     () => initSession(id, true)
  });

  store.bind(sock.ev);
  sock.ev.on('creds.update', () => saveStore(store));

  const entry = { sock, saveCreds };
  sessions.set(id, entry);
  return entry;
}

export function getSession(id) {
  const entry = sessions.get(id);
  if (!entry) throw new Error(`Session '${id}' not found`);
  return entry.sock;
}

export async function deleteSession(id) {
  const entry = sessions.get(id);
  if (entry?.sock?.logout) await entry.sock.logout();
  sessions.delete(id);
  const dir = await import('path').then(p => p.resolve('.sessions', id));
  await import('fs').then(fs => {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  });
}

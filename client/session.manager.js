// @path: client/session.manager.js
import path from 'path';
import fs from 'fs';
import { initAuthState } from '../utils/sessionInit.js';
import { createSocket } from './socketFactory.js';

const sessions = new Map();

export async function initSession(id, force = false) {
  if (sessions.has(id) && !force) {
    return sessions.get(id);
  }
  const authDir = path.resolve('.sessions', id);
  const { state, saveCreds } = await initAuthState(authDir);
  const sock = await createSocket({
    authState: { ...state, saveCreds },
    sessionId: id,
    browserName: 'MultiBaileys',
    reinit: () => initSession(id, true)
  });
  sessions.set(id, { sock, saveCreds });
  return { sock, saveCreds };
}

export function getSession(id) {
  const entry = sessions.get(id);
  if (!entry) throw new Error(`Session '${id}' not found`);
  return entry.sock;
}

export async function deleteSession(id) {
  const entry = sessions.get(id);
  if (entry?.sock?.logout) {
    await entry.sock.logout();
  }
  sessions.delete(id);
  const dir = path.resolve('.sessions', id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

export function getSessions() {
  return [...sessions.keys()];
}

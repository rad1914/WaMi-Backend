// @path: client/session.manager.js
import path from 'path';
import fs from 'fs';
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys';
import { registerSocketEvents } from '../utils/helpers.js';
import { initAuthState } from '../utils/sessionInit.js';

const sessions = new Map();

export const getSession = id => {
  const s = sessions.get(id);
  if (!s) throw new Error(`Session '${id}' not found`);
  return s.sock;
};

export const initSession = async (id, force = false) => {

  if (sessions.has(id) && !force) {
    return sessions.get(id);
  }

  try {

    const authDir = path.resolve('.sessions', id);
    const { state, saveCreds } = await initAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.macOS('MultiBaileys'),
      shouldSyncHistoryMessage: false,
      printQRInTerminal: false
    });

    registerSocketEvents(
      sock,
      id,
      saveCreds,

      () => initSession(id, true)
    );

    sessions.set(id, { sock, saveCreds });
    return { sock, saveCreds };
  } catch (err) {
    console.error(`❌ Error initializing session '${id}':`, err);
    throw new Error(`Failed to initialize session: ${err.message}`);
  }
};

export const deleteSession = async id => {
  const entry = sessions.get(id);
  if (entry?.sock?.logout) {
    await entry.sock.logout();
  }
  sessions.delete(id);

  const dir = path.resolve('.sessions', id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

export const getSessions = () => [...sessions.keys()];

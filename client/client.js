// @path: client/client.js

import fs from 'fs';
import path from 'path';
import { initAuthState } from '../utils/sessionInit.js';
import { createSocket } from './socketFactory.js';
import { store } from '../store/store.js';
import logger from '../utils/logger.js';
import { initSession } from './session.manager.js'; 

let sharedClient = null;

export async function initClient() {

  const sessionsDir = path.resolve('.sessions');
  if (fs.existsSync(sessionsDir)) {
    const subdirs = fs.readdirSync(sessionsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)

      .filter(name => name !== 'auth');

    for (const sessionId of subdirs) {
      try {
        await initSession(sessionId);
        logger.info(`🔄 [bootstrap] reloaded session '${sessionId}'`);
      } catch (err) {
        logger.warn(`⚠️ [bootstrap] failed to reload session '${sessionId}': ${err.message}`);
      }
    }
  }

  const { state, saveCreds } = await initAuthState('auth');
  const sock = await createSocket({
    authState: { ...state, saveCreds },
    sessionId: 'shared',
    browserName: 'BaileysAPI',
    reinit: initClient
  });

  store.bind(sock.ev);
  sharedClient = sock;
}

export function getClient() {
  if (!sharedClient) throw new Error('Client not initialized');
  return sharedClient;
}

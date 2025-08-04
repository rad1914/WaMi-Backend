// @path: client/client.js
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { store } from '../store/store.js';
import { saveStore } from '../store/store.js';
import { createSocket } from './socketFactory.js';
import { initAuthState } from '../utils/session.js';
import { initSession } from './session.manager.js';
import { SESSION_BASE_DIR } from '../config/config.js';

let sharedClient = null;

export async function initClient() {

  const { state, saveCreds } = await initAuthState('auth');
  const sock = await createSocket({
    authState: { ...state, saveCreds },
    sessionId: 'shared',
    browserName: 'BaileysAPI',
    reinit: initClient
  });

  store.bind(sock.ev);
  sock.ev.on('creds.update', () => {
    logger.info('Shared credentials updated');
    saveStore(store);
  });

  sharedClient = sock;

  try {
    const entries = fs.readdirSync(SESSION_BASE_DIR, { withFileTypes: true });
    const sessionDirs = entries
      .filter(entry => entry.isDirectory() && entry.name !== 'auth')
      .map(entry => entry.name);

    for (const sessionId of sessionDirs) {
      try {
        await initSession(sessionId);
        logger.info(`✅ [${sessionId}] session restored`);
      } catch (err) {
        logger.warn(`⚠️ Failed to restore session '${sessionId}':`, err.message);
      }
    }
  } catch (err) {
    logger.error('❌ Failed to scan session directories:', err.message);
  }
}

export function getClient() {
  if (!sharedClient) throw new Error('Client not initialized');
  return sharedClient;
}

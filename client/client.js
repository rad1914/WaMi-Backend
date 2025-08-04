// @path: client/client.js
import logger from '../utils/logger.js';
import { store } from '../store/store.js';
import { saveStore } from '../utils/store.js';
import { createSocket } from './socketFactory.js';
import { initAuthState } from '../utils/session.js';

let sharedClient = null;

export async function initClient() {
  const { state, saveCreds } = await initAuthState('auth');
  const sock = await createSocket({
    authState:  { ...state, saveCreds },
    sessionId:  'shared',
    browserName:'BaileysAPI',
    reinit:     initClient
  });

  store.bind(sock.ev);
  sock.ev.on('creds.update', () => {
    logger.info('Shared credentials updated');
    saveStore(store);
  });

  sharedClient = sock;
}

export function getClient() {
  if (!sharedClient) throw new Error('Client not initialized');
  return sharedClient;
}

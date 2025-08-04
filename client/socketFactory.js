// @path: client/socketFactory.js
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys';
import { registerSocketEvents } from '../utils/helpers.js';
import { store } from '../store/store.js'; 

let cachedVersion = null;

async function getBaileysVersion() {
  if (!cachedVersion) {
    const { version } = await fetchLatestBaileysVersion();
    cachedVersion = version;
  }
  return cachedVersion;
}

export async function createSocket({ authState, sessionId, browserName, reinit }) {
  const version = await getBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: authState,                      
    browser: Browsers.macOS(browserName),
    shouldSyncHistoryMessage: true,       
    printQRInTerminal: false
  });

  registerSocketEvents(sock, sessionId, authState.saveCreds, reinit);

  store.bind(sock.ev);

  return sock;
}

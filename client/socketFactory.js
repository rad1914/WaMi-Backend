// @path: client/socketFactory.js
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys';
import { registerSocketEvents } from '../utils/helpers.js';
import { store, saveStore } from '../store/store.js';

let cachedVersion = null;
async function getBaileysVersion() {
  if (!cachedVersion) {
    const { version } = await fetchLatestBaileysVersion();
    cachedVersion = version;
  }
  return cachedVersion;
}

export async function createSocket({ authState, sessionId, browserName, reinit }) {
  const sock = makeWASocket({
    version: await getBaileysVersion(),
    auth: authState,
    browser: Browsers.macOS(browserName),
    shouldSyncHistoryMessage: () => true,
    printQRInTerminal: false
  });

  registerSocketEvents(sock, sessionId, authState.saveCreds, reinit);
  store.bind(sock.ev);

  sock.ev.on('messaging-history.set', ({ chats, messages, contacts }) => {
    for (const chat of chats) {
      store.chats.upsert(chat);
    }
    for (const msg of messages) {

      store.messages.upsert(msg);
    }
    for (const contact of contacts) {
      store.contacts.upsert(contact);
    }
    saveStore(store);
  });

  sock.ev.on('creds.update', () => saveStore(store));
  sock.ev.on('chats.set',      () => saveStore(store));
  sock.ev.on('chats.upsert',   () => saveStore(store));
  sock.ev.on('chats.update',   () => saveStore(store));

  return sock;
}

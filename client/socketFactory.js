
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
    chats.forEach(chat    => store.chats.upsert(chat));
    messages.forEach(msg   => store.messages.upsert(msg));
    contacts.forEach(contact => store.contacts.upsert(contact));
    saveStore();
  });

  ['creds.update','chats.set','chats.upsert','chats.update'].forEach(evt =>
    sock.ev.on(evt, () => saveStore())
  );

  return sock;
}

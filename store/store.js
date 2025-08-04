// @path: store/store.js
import { existsSync, readFileSync, writeFileSync } from 'fs';
import baileys from '@whiskeysockets/baileys';
import { registerSocketEvents } from '../utils/helpers.js';
import { initAuthState } from '../utils/sessionInit.js';
import logger from '../utils/logger.js';

const { makeInMemoryStore, makeCacheableSignalKeyStore } = baileys;
const STORE_PATH = './.sessions/store.json';
export const store = makeInMemoryStore({ logger });

store.bind = ev => {
  ev.on('creds.update', () => persist());
};

function persist() {
  try {
    writeFileSync(
      STORE_PATH,
      JSON.stringify({
        chats: [...store.chats.entries()],
        contacts: store.contacts
      })
    );
  } catch (e) {
    console.warn('⚠️ Error persisting store:', e);
  }
}

if (existsSync(STORE_PATH)) {
  try {
    const { chats, contacts } = JSON.parse(
      readFileSync(STORE_PATH, 'utf-8')
    );
    if (Array.isArray(chats)) store.chats = new Map(chats);
    if (contacts) store.contacts = contacts;
  } catch (e) {
    console.warn('⚠️ Error loading store:', e);
  }
}

export async function initAuthStore() {
  const { state, saveCreds } = await initAuthState('auth');
  const signalKeyStore = makeCacheableSignalKeyStore(
    state.signalKeyStore || {},
    saveCreds
  );
  registerSocketEvents(store, 'shared', saveCreds, initAuthStore);
  return { authState: state, signalKeyStore };
}

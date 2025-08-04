// @path: store/store.js
import { existsSync, readFileSync } from 'fs';
import baileys from '@whiskeysockets/baileys';
import logger from '../utils/logger.js';

const { makeInMemoryStore, makeCacheableSignalKeyStore } = baileys;
const STORE_PATH = './.sessions/store.json';

export const store = makeInMemoryStore({ logger });

if (existsSync(STORE_PATH)) {
  try {
    const { chats, contacts } = JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
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

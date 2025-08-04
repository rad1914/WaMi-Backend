// @path: store/store.js
import fs from 'fs';
import { makeInMemoryStore, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import logger from '../utils/logger.js';
import { STORE_FILE, SESSION_BASE_DIR } from '../config/config.js';

function getEntries(maybeMap) {

  if (maybeMap?.entries && typeof maybeMap.entries === 'function') {
    return [...maybeMap.entries()];
  }

  if (maybeMap && typeof maybeMap === 'object') {
    return Object.entries(maybeMap);
  }

  return [];
}

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, { encoding: 'utf-8' });
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn('⚠️ Could not read store file:', e);
  }

  return {};
}

export function saveStore(store) {
  try {
    const data = {
      chats: getEntries(store.chats),
      contacts: getEntries(store.contacts),
    };

    if (!fs.existsSync(SESSION_BASE_DIR)) {
      fs.mkdirSync(SESSION_BASE_DIR, { recursive: true });
    }

    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('⚠️ Error persisting store:', e);
  }
}

export const store = makeInMemoryStore({ logger });

const { chats, contacts } = loadStore();
if (Array.isArray(chats)) {
  store.chats = new Map(chats);
}
if (contacts) {

  store.contacts = contacts;
}

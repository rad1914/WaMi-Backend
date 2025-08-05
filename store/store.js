// @path: store/store.js
import fs from 'fs';
import { makeInMemoryStore } from '@whiskeysockets/baileys';
import logger from '../utils/logger.js';
import { STORE_FILE, SESSION_BASE_DIR } from '../config/config.js';

function entriesOf(maybeMapOrObj) {
  if (maybeMapOrObj?.entries && typeof maybeMapOrObj.entries === 'function') {
    return [...maybeMapOrObj.entries()];
  }
  if (maybeMapOrObj && typeof maybeMapOrObj === 'object') {
    return Object.entries(maybeMapOrObj);
  }
  return [];
}

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, 'utf-8');
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
      chats:    entriesOf(store.chats),
      contacts: entriesOf(store.contacts),
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
} else {
  store.chats = new Map();
}

if (Array.isArray(contacts)) {
  store.contacts = new Map(contacts);
} else {
  store.contacts = new Map();
}

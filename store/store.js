
// @path: store/store.js

import fs from 'fs';
import { makeInMemoryStore } from '@whiskeysockets/baileys';
import logger from '../utils/logger.js';
import { STORE_FILE, SESSION_BASE_DIR } from '../config/config.js';

function createSubStore() {
  const data = new Map();
  return {
    upsert: obj => {
      const id = obj?.id || obj?.jid || obj?.key?.id;
      if (id) data.set(id, obj);
    },
    get: id => data.get(id),
    all: () => Array.from(data.values())
  };
}

export const store = makeInMemoryStore({ logger });

store.chats    = createSubStore();
store.contacts = createSubStore();
store.messages = createSubStore();

export function saveStore() {
  try {
    const data = {
      chats:    store.chats.all(),
      contacts: store.contacts.all(),
      messages: store.messages.all()
    };
    if (!fs.existsSync(SESSION_BASE_DIR)) {
      fs.mkdirSync(SESSION_BASE_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('⚠️ Error persisting store:', e);
  }
}

// @path: store/store.js
import fs from 'fs';
import { makeInMemoryStore } from '@whiskeysockets/baileys';
import logger from '../utils/logger.js';
import { STORE_FILE, SESSION_BASE_DIR } from '../config/config.js';

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('⚠️ Could not read store file:', e);
  }
  return {};
}

export function saveStore(store) {
  try {
    const data = {
      chats:    store.chats.all ? store.chats.all() : [],
      contacts: store.contacts.all ? store.contacts.all() : [],
      messages: store.messages.all ? store.messages.all() : []
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

store.messages = {
  data: new Map(),
  upsert(msg) {
    const id = msg?.key?.id;
    if (id) this.data.set(id, msg);
  },
  get(id) {
    return this.data.get(id);
  },
  all() {
    return Array.from(this.data.values());
  }
};

store.contacts = {
  data: new Map(),
  upsert(contact) {
    const id = contact?.id || contact?.jid;
    if (id) this.data.set(id, contact);
  },
  get(id) {
    return this.data.get(id);
  },
  all() {
    return Array.from(this.data.values());
  }
};

const loaded = loadStore();

if (Array.isArray(loaded.chats)) {
  for (const chat of loaded.chats) {
    if (chat.id) {
      store.chats.upsert(chat);
    }
  }
}

if (Array.isArray(loaded.contacts)) {
  for (const contact of loaded.contacts) {
    store.contacts.upsert(contact);
  }
}

if (Array.isArray(loaded.messages)) {
  for (const msg of loaded.messages) {
    store.messages.upsert(msg);
  }
}

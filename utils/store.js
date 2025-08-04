// @path: utils/store.js
import fs from 'fs';
import { STORE_FILE, SESSION_BASE_DIR } from '../config/config.js';

export function loadStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
  } catch (e) {
    console.warn('⚠️ Error loading store:', e);
    return {};
  }
}

export function saveStore(store) {
  try {
    const data = {
      chats:    [...store.chats.entries()],
      contacts: store.contacts
    };
    if (!fs.existsSync(SESSION_BASE_DIR)) fs.mkdirSync(SESSION_BASE_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(data));
  } catch (e) {
    console.warn('⚠️ Error persisting store:', e);
  }
}

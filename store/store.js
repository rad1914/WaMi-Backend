// @path: store/store.js
import { makeInMemoryStore, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import logger from '../utils/logger.js';
import { loadStore } from '../utils/store.js';

export const store = makeInMemoryStore({ logger });

const { chats, contacts } = loadStore();
if (Array.isArray(chats))  store.chats    = new Map(chats);
if (contacts)              store.contacts = contacts;

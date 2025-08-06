// @path: client/store.js
import fs from 'fs'
import { makeInMemoryStore } from '@whiskeysockets/baileys'
import logger from '../utils/logger.js'
import { STORE_FILE, SESSION_BASE_DIR } from '../config/config.js'

export const store = makeInMemoryStore({ logger })

const mapStore = () => {
  const data = new Map()
  return {
    upsert: i => {
      const id = i?.id || i?.jid || i?.key?.id
      if (id) data.set(id, i)
    },
    all: () => [...data.values()]
  }
}

store.contacts = mapStore()
store.messages = mapStore()

const load = () => fs.existsSync(STORE_FILE) ? JSON.parse(fs.readFileSync(STORE_FILE)) : {}
export const saveStore = () => {
  if (!fs.existsSync(SESSION_BASE_DIR)) fs.mkdirSync(SESSION_BASE_DIR, { recursive: true })
  fs.writeFileSync(STORE_FILE, JSON.stringify({
    chats: store.chats.all(),
    contacts: store.contacts.all(),
    messages: store.messages.all()
  }, null, 2))
}

const loaded = load()
loaded.chats?.forEach(c => c.id && store.chats.upsert(c))
loaded.contacts?.forEach(store.contacts.upsert)
loaded.messages?.forEach(store.messages.upsert)

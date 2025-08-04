// @path: store/store.js
import { existsSync, readFileSync, writeFileSync } from 'fs'
import baileys from '@whiskeysockets/baileys'
import { registerSocketEvents } from '../utils/helpers.js'
import { initAuthState } from '../utils/sessionInit.js'

const { makeInMemoryStore, makeCacheableSignalKeyStore } = baileys
const STORE_PATH = './.sessions/store.json'
import logger from '../utils/logger.js'

export const store = makeInMemoryStore({ logger })

let started = false
const persist = () => {
  if (started) return
  started = true
  setInterval(() => {
    try {
      writeFileSync(STORE_PATH, JSON.stringify({
        chats: [...store.chats.entries()],
        contacts: store.contacts
      }))
    } catch (e) {
      console.warn('⚠️ Error persistiendo store:', e)
    }
  }, 10_000)
}

if (existsSync(STORE_PATH)) {
  try {
    const { chats, contacts } = JSON.parse(readFileSync(STORE_PATH, 'utf-8'))
    if (Array.isArray(chats)) store.chats = new Map(chats)
    if (contacts) store.contacts = contacts
  } catch (e) {
    console.warn('⚠️ Error cargando store:', e)
  }
}

const original = store.bind.bind(store)
store.bind = e => {
  original(e)
  persist()
}

export const initAuthStore = async () => {
  const { state, saveCreds } = await initAuthState('auth')
  const signalKeyStore = makeCacheableSignalKeyStore(state.signalKeyStore || {}, saveCreds)
  registerSocketEvents(store, 'shared', saveCreds, initAuthStore)
  return { authState: state, signalKeyStore }
}

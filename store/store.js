// @path: store/store.js
import { existsSync, readFileSync, writeFileSync } from 'fs'
import baileys from '@whiskeysockets/baileys'
import { registerSocketEvents } from '../utils/helpers.js'
import { initAuthState } from '../utils/sessionInit.js'

const { makeInMemoryStore, makeCacheableSignalKeyStore } = baileys
const STORE_PATH = './.sessions/store.json'
export const store = makeInMemoryStore({})

let persistenceStarted = false
const startPersistence = () => {
  if (persistenceStarted) return
  persistenceStarted = true
  setInterval(() => {
    try {
      writeFileSync(STORE_PATH,
        JSON.stringify({
          chats: [...store.chats.entries()],
          contacts: store.contacts
        }, null, 2)
      )
    } catch (err) {
      console.warn('⚠️ Error persistiendo store:', err)
    }
  }, 10_000)
}

if (existsSync(STORE_PATH)) {
  try {
    const { chats, contacts } = JSON.parse(readFileSync(STORE_PATH, 'utf-8'))
    if (Array.isArray(chats)) store.chats = new Map(chats)
    if (contacts && typeof contacts === 'object') store.contacts = contacts
  } catch (err) {
    console.warn('⚠️ Error cargando store:', err)
  }
}

const originalBind = store.bind.bind(store)
store.bind = ev => {
  originalBind(ev)
  startPersistence()
}

export const initAuthStore = async () => {
  const { state, saveCreds } = await initAuthState('auth')
  const signalKeyStore = makeCacheableSignalKeyStore(state.signalKeyStore || {}, saveCreds)
  registerSocketEvents(store, 'shared', saveCreds, initAuthStore)
  return { authState: state, signalKeyStore }
}

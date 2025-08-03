// @path: store/store.js
import path from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import baileys from '@whiskeysockets/baileys'

const { makeInMemoryStore, useMultiFileAuthState, makeCacheableSignalKeyStore } = baileys
const STORE_PATH = './.sessions/store.json'
const store = makeInMemoryStore({})

/**
 * Arranca la persistencia periódica solo cuando el store
 * está correctamente ligado a un socket.
 */
function setupPersistence() {
  if (setupPersistence._started) return
  setupPersistence._started = true

  setInterval(() => {
    const chats   = store.chats instanceof Map ? [...store.chats.entries()] : []
    const contacts = store.contacts || {}

    const payload = { chats, contacts }
    try {
      writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2))
    } catch (err) {
      /* No bloquea la app si falla el guardado */
      console.warn('⚠️ Error al escribir store.json:', err)
    }
  }, 10000)
}

// Si existe un dump previo, lo cargamos en el store
if (existsSync(STORE_PATH)) {
  try {
    const data = JSON.parse(readFileSync(STORE_PATH))
    if (Array.isArray(data.chats)) {
      store.chats = new Map(data.chats)
    }
    if (data.contacts && typeof data.contacts === 'object') {
      store.contacts = data.contacts
    }
  } catch (err) {
    console.warn('⚠️ Error al leer o parsear store.json:', err)
  }
}

/**
 * Para el uso en la capa de autenticación de Baileys
 */
export const initAuthStore = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const signalKeyStore = makeCacheableSignalKeyStore(state.signalKeyStore || {}, saveCreds)
  return { authState: state, signalKeyStore }
}

// Override de store.bind para arrancar la persistencia solo cuando se ligue el evento
const originalBind = store.bind.bind(store)
store.bind = ev => {
  originalBind(ev)
  setupPersistence()
}

export { store }

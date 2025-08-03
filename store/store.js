// @path: store/store.js

import path from 'path'
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
    const chats   = store.chats instanceof Map ? [...store.chats.entries()] : []
    const contacts = store.contacts || {}
    const payload = { chats, contacts }

    try {
      writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2))
    } catch (err) {
      console.warn('⚠️ Error al escribir store.json:', err)
    }
  }, 10_000)
}

if (existsSync(STORE_PATH)) {
  try {
    const { chats, contacts } = JSON.parse(readFileSync(STORE_PATH, 'utf-8'))
    if (Array.isArray(chats)) store.chats = new Map(chats)
    if (contacts && typeof contacts === 'object') store.contacts = contacts
  } catch (err) {
    console.warn('⚠️ Error al leer o parsear store.json:', err)
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

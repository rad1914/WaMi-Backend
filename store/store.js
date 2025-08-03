// @path: store/store.js
import path from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import baileys from '@whiskeysockets/baileys'

const { makeInMemoryStore, useMultiFileAuthState, makeCacheableSignalKeyStore } = baileys
const STORE_PATH = './auth/store.json'
const store = makeInMemoryStore({})

setInterval(() => {
  writeFileSync(STORE_PATH, JSON.stringify({
    chats: [...store.chats.entries()],
    contacts: store.contacts
  }, null, 2))
}, 10000)

if (existsSync(STORE_PATH)) {
  const data = JSON.parse(readFileSync(STORE_PATH))
  if (data.chats) store.chats = new Map(data.chats)
  if (data.contacts) store.contacts = data.contacts
}

export const initAuthStore = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const signalKeyStore = makeCacheableSignalKeyStore(state.signalKeyStore || {}, saveCreds)
  return { authState: state, signalKeyStore }
}

export { store }

import path from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import baileys from '@whiskeysockets/baileys'

const {
  makeInMemoryStore,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore
} = baileys

const STORE_PATH = path.resolve('./auth/store.json')
const store = makeInMemoryStore({})

setInterval(() => {
  writeFileSync(
    STORE_PATH,
    JSON.stringify(
      {
        chats: store.chats,
        contacts: store.contacts
      },
      (_, val) => (val instanceof Map ? [...val.entries()] : val),
      2
    )
  )
}, 10000)

if (existsSync(STORE_PATH)) {
  const data = JSON.parse(readFileSync(STORE_PATH, 'utf-8'))
  if (data.chats) store.chats = new Map(data.chats)
  if (data.contacts) store.contacts = new Map(data.contacts)
}

let authState, saveCreds

export const initAuthStore = async () => {
  const { state, saveCreds: _saveCreds } = await useMultiFileAuthState('auth')
  authState = state
  saveCreds = _saveCreds

  const signalKeyStore = makeCacheableSignalKeyStore(
    state.signalKeyStore || {},
    updated => saveCreds(updated)
  )

  return { authState, signalKeyStore }
}

export { store }

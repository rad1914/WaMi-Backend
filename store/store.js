// src/store/store.js

import {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys'

let authState, saveCreds

/**
 * Initialize authentication state and signal-key store.
 * Call this before creating the Baileys socket.
 */
export const initAuthStore = async () => {
  const { state, saveCreds: _saveCreds } = await useMultiFileAuthState('auth')
  authState = state
  saveCreds = _saveCreds

  const signalKeyStore = makeCacheableSignalKeyStore(
    authState.signalKeyStore || {},
    (updated) => saveCreds(updated)
  )

  return { authState, signalKeyStore }
}

/**
 * Minimal in-memory chat store. Replace with persistent storage if needed.
 */
export const chatStore = {
  _chats: new Map(),

  get(jid) {
    return this._chats.get(jid)
  },

  set(jid, data) {
    this._chats.set(jid, data)
  },

  all() {
    return Array.from(this._chats.values())
  }
}

export default {
  initAuthStore,
  chatStore
}

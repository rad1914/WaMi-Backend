// @path: client/client.js
import fs from 'fs'
import path from 'path'
import { initAuthState } from '../utils/session.js'
import { createSocket } from './socketFactory.js'
import { store } from '../store/store.js'
import logger from '../utils/logger.js'

let sharedClient = null

export async function initClient() {
  const { state, saveCreds } = await initAuthState('auth')

  const sock = await createSocket({
    authState: { ...state, saveCreds },
    sessionId: 'shared',
    browserName: 'BaileysAPI',
    reinit: initClient
  })

  store.bind(sock.ev)

  sock.ev.on('creds.update', () => {
    try {
      fs.writeFileSync(
        './.sessions/store.json',
        JSON.stringify({
          chats: [...store.chats.entries()],
          contacts: store.contacts
        })
      )
    } catch (e) {
      logger.warn('⚠️ Error persisting store:', e)
    }
  })

  sharedClient = sock
}

export function getClient() {
  if (!sharedClient) throw new Error('Client not initialized')
  return sharedClient
}

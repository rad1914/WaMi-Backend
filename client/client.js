// @path: client/client.js
import { Boom } from '@hapi/boom'
import { makeWASocket, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys'
import { registerSocketEvents } from '../utils/helpers.js'
import { initAuthState } from '../utils/sessionInit.js'
import { store } from '../store/store.js'
import logger from '../utils/logger.js'

let clientSocket = null

export const initClient = async () => {
  const { state, saveCreds } = await initAuthState('auth')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS('BaileysAPI')
  })

  store.bind(sock.ev)
  registerSocketEvents(sock, 'shared', saveCreds, initClient)
  clientSocket = sock
}

export const getClient = () => {
  if (!clientSocket) throw new Error('Client not initialized')
  return clientSocket
}

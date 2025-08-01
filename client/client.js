// src/client/client.js

import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import store from '../store/store.js'
import logger from '../utils/logger.js'

let clientSocket = null

export const initClient = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth')

  const sock = makeWASocket({
    version: await fetchLatestBaileysVersion(),
    auth: state,
    browser: Browsers.macOS('BaileysAPI')
  })

  // bind Baileys' in-memory store
  store.bind(sock.ev)

  // persist credentials
  sock.ev.on('creds.update', saveCreds)

  // connection updates (handles QR, reconnect, etc.)
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      // your QR handler—show or serve this string/image
      console.log('📱 Scan this QR code:', qr)
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      logger.warn(`Disconnected with code ${code}`)

      if (code !== DisconnectReason.loggedOut) {
        logger.info('Reconnecting to WhatsApp…')
        initClient()
      } else {
        logger.error('Logged out of WhatsApp—please re-authenticate.')
      }
    }

    if (connection === 'open') {
      logger.info('✅ WhatsApp connection open.')
    }
  })

  clientSocket = sock
}

// getter for the socket
export const getClient = () => {
  if (!clientSocket) throw new Error('Client not initialized—call initClient() first.')
  return clientSocket
}

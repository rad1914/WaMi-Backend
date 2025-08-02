// @path: client/client.js
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

  store.bind(sock.ev)

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('📱 Scan QR Code:', qr)
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      logger.warn(`Disconnected with code ${code}`)

      if (code !== DisconnectReason.loggedOut) {
        logger.info('Reconnecting to WhatsApp...')
        initClient()
      } else {
        logger.error('Logged out. Please re-authenticate.')
      }
    }

    if (connection === 'open') {
      logger.info('✅ Connected to WhatsApp Web')
    }
  })

  clientSocket = sock
}

export const getClient = () => {
  if (!clientSocket) {
    throw new Error('WhatsApp client not initialized. Call initClient() first.')
  }
  return clientSocket
}

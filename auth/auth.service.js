// @path: auth/auth.service.js
import { getClient, initClient } from '../client/client.js'
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  jidNormalizedUser,
  jidDecode,
} from '@whiskeysockets/baileys';

let qrCode = null
let pairingCode = null
let isLoggedIn = false

export const getQRCode = async () => {
  if (!clientSocket?.ws) {
    await initClient()
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('QR timeout')), 20000)

    clientSocket.ev.once('connection.update', (update) => {
      if (update.qr) {
        clearTimeout(timeout)
        qrCode = update.qr
        resolve(qrCode)
      } else if (update.connection === 'open') {
        clearTimeout(timeout)
        isLoggedIn = true
        resolve('already connected')
      }
    })
  })
}

export const getPairingCode = async () => {
  if (!clientSocket?.ws) {
    await initClient()
  }

  return new Promise(async (resolve, reject) => {
    try {
      const code = await clientSocket.requestPairingCode()
      pairingCode = code
      resolve(code)
    } catch (err) {
      reject(err)
    }
  })
}

export const getAuthStatus = async () => {
  return !!(clientSocket?.user?.id || isLoggedIn)
}

export const logoutSession = async () => {
  if (clientSocket?.logout) {
    await clientSocket.logout()
    isLoggedIn = false
  }
}

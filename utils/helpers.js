// @path: utils/helpers.js

import { Boom } from '@hapi/boom'
import { DisconnectReason } from '@whiskeysockets/baileys'
import logger from './logger.js'

const pendingQRs = new Map()

export const getPendingQR = sessionId => pendingQRs.get(sessionId) || null

export const registerSocketEvents = (sock, sessionId, saveCreds, reinitFn) => {
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log(`[${sessionId}] QR: ${qr}`)

      pendingQRs.set(sessionId, qr)

      setTimeout(() => pendingQRs.delete(sessionId), 30_000)
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      logger[code === DisconnectReason.loggedOut ? 'error' : 'warn'](
        `[${sessionId}] Disconnected (${code})`
      )
      if (code !== DisconnectReason.loggedOut) reinitFn(sessionId)
    }

    if (connection === 'open') {
      logger.info(`[${sessionId}] Connected`)
    }
  })
}

export const wrapController = fn => async (req, res) => {
  try {
    const input = req.method === 'GET' ? req.query : req.body
    res.json(await fn(input))
  } catch (err) {
    const payload = { error: err.message }
    if (process.env.NODE_ENV === 'development') {
      payload.stack = err.stack
    }
    res.status(500).json(payload)
  }
}

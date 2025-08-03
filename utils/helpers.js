// @path: utils/helpers.js

import { Boom } from '@hapi/boom'
import { DisconnectReason } from '@whiskeysockets/baileys'
import logger from './logger.js'

export const wrapController = fn => async (req, res) => {
  try {
    const input = req.method === 'GET' ? req.query : req.body
    res.json(await fn(input))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const registerSocketEvents = (sock, sessionId, saveCreds, reinitFn) => {
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) console.log(`[${sessionId}] QR: ${qr}`)

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

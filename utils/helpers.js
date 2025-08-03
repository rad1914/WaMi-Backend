// @path: utils/helpers.js

import { Boom } from '@hapi/boom'
import { DisconnectReason } from '@whiskeysockets/baileys'
import logger from '../utils/logger.js'

export const wrapController = serviceFn => async (req, res) => {
  try {
    const data = await serviceFn(req.method === 'GET' ? req.query : req.body)
    res.status(200).json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const registerSocketEvents = (sock, sessionId, saveCreds, reinitFn) => {
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', update => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log(`[${sessionId}] QR: ${qr}`)
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      logger.warn(`[${sessionId}] Disconnected (${code})`)
      if (code !== DisconnectReason.loggedOut) {
        reinitFn(sessionId)
      } else {
        logger.error(`[${sessionId}] Logged out`)
      }
    }

    if (connection === 'open') {
      logger.info(`[${sessionId}] Connected`)
    }
  })
}

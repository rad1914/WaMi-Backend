// @path: utils/helpers.js
import { Boom } from '@hapi/boom'
import { DisconnectReason } from '@whiskeysockets/baileys'
import logger from './logger.js'

const pendingQRs = new Map()
export const getPendingQR = id => pendingQRs.get(id) || null

export const registerSocketEvents = (sock, id, saveCreds, reinit) => {
  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection !== 'close') return
    const err = lastDisconnect?.error
    const reconnect = !err || (err instanceof Boom && err.output?.statusCode !== DisconnectReason.loggedOut)
    logger.warn(`❌ [${id}] desconectado (${err?.message}). Reconnect=${reconnect}`)
    try { await saveCreds() } catch (e) { logger.error(`🔒 [${id}] fallo al guardar credenciales: ${e.message}`) }
    if (reconnect) try { await reinit?.(id) } catch (e) { logger.error(`❌ [${id}] reinit falló: ${e.message}`) }
  })
}

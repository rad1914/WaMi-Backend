import { Boom } from '@hapi/boom';
import { DisconnectReason } from '@whiskeysockets/baileys';
import logger from './logger.js';

const pendingQRs = new Map();
export const getPendingQR = id => pendingQRs.get(id) || null;

export const registerSocketEvents = (sock, id, saveCreds, reinit) => {
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      pendingQRs.set(id, qr);
      logger.info(`📱 [${id}] QR received`);
    }

    if (connection === 'open') {
      logger.info(`✅ [${id}] connected`);
      pendingQRs.delete(id);
    }

    if (connection === 'close') {
      const err = lastDisconnect?.error;
      const reconnect = !err || (err instanceof Boom && err.output?.statusCode !== DisconnectReason.loggedOut);

      logger.warn(`❌ [${id}] disconnected (${err?.message}). Reconnect=${reconnect}`);

      try {
        await saveCreds();
        logger.info(`💾 [${id}] credentials saved`);
      } catch (e) {
        logger.error(`🔒 [${id}] failed to save credentials`, e);
      }

      if (reconnect && typeof reinit === 'function') {
        try {
          await reinit(id);
          logger.info(`🔄 [${id}] reinitialized`);
        } catch (e) {
          logger.error(`❌ [${id}] reinit failed`, e);
        }
      }
    }
  });
};

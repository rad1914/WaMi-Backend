// @path: utils/helpers.js
import { Boom } from '@hapi/boom';
import { DisconnectReason } from '@whiskeysockets/baileys';
import logger from './logger.js';

const pendingQRs = new Map();

export const getPendingQR = sessionId => pendingQRs.get(sessionId) || null;

export const registerSocketEvents = (sock, sessionId, saveCreds, reinitFn) => {
  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      pendingQRs.set(sessionId, qr);
      logger.info(`📱 [${sessionId}] QR received`);
    }

    if (connection === 'open') {
      logger.info(`✅ [${sessionId}] connected`);
      pendingQRs.delete(sessionId);
    }

    if (connection === 'close') {
      const shouldReconnect =
        !lastDisconnect?.error ||
        (lastDisconnect.error instanceof Boom &&
          lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut);

      logger.warn(
        `❌ [${sessionId}] disconnected (${lastDisconnect?.error?.message}). Reconnect=${shouldReconnect}`
      );

      try {
        await saveCreds();
        logger.info(`💾 [${sessionId}] credentials saved`);
      } catch (e) {
        logger.error(`🔒 [${sessionId}] failed to save credentials`, e);
      }

      if (shouldReconnect && typeof reinitFn === 'function') {
        try {
          await reinitFn(sessionId);
          logger.info(`🔄 [${sessionId}] reinitialized`);
        } catch (err) {
          logger.error(`❌ [${sessionId}] reinit failed`, err);
        }
      }
    }
  });
};

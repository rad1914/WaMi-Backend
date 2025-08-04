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
      // cache the latest QR so /api/auth/qr can return it
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

      // persist creds on every disconnect
      try {
        await saveCreds();
        logger.info(`💾 [${sessionId}] credentials saved`);
      } catch (e) {
        logger.error(`🔒 [${sessionId}] failed to save credentials`, e);
      }

      if (shouldReconnect && typeof reinitFn === 'function') {
        try {
          // force-reinit this single session
          await reinitFn(sessionId);
          logger.info(`🔄 [${sessionId}] reinitialized`);
        } catch (err) {
          logger.error(`❌ [${sessionId}] reinit failed`, err);
        }
      }
    }
  });
};

export const wrapController = fn => async (req, res) => {
  try {
    const input = req.method === 'GET' ? req.query : req.body;

    res.json(await fn(input, req));
  } catch (err) {
    const payload = { error: err.message };
    if (process.env.NODE_ENV === 'development') {
      payload.stack = err.stack;
    }
    res.status(500).json(payload);
  }
};
// utils/helpers.js
import { Boom } from '@hapi/boom';
import { DisconnectReason } from '@whiskeysockets/baileys';
import logger from './logger.js';

const pendingQRs = new Map();
export const getPendingQR = id => pendingQRs.get(id) || null;

export const registerSocketEvents = (sock, id, saveCreds, reinit) => {
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      pendingQRs.set(id, qr); // store latest QR for that session
      logger.warn(`📲 [${id}] QR updated`);
    }

    if (connection === 'close') {
      const err = lastDisconnect?.error;
      const reconnect = !err || (err instanceof Boom && err.output?.statusCode !== DisconnectReason.loggedOut);
      logger.warn(`❌ [${id}] disconnected (${err?.message}). Reconnect=${reconnect}`);
      try { await saveCreds(); } 
      catch (e) { logger.error(`🔒 [${id}] failed to save creds: ${e.message}`); }
      if (reconnect) try { await reinit?.(id); } 
      catch (e) { logger.error(`❌ [${id}] reinit failed: ${e.message}`); }
    }
  });
};

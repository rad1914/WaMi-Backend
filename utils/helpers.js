// @path: utils/helpers.js
import { Boom } from '@hapi/boom';
import { DisconnectReason } from '@whiskeysockets/baileys';

const pendingQRs = new Map();
export const getPendingQR = id => pendingQRs.get(id) || null;

export const registerSocketEvents = (sock, id, saveCreds, reinit) => {
  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection !== 'close') return;
    const err = lastDisconnect?.error;
    const reconnect = !err || (err instanceof Boom && err.output?.statusCode !== DisconnectReason.loggedOut);
    try { await saveCreds(); } catch {}
    if (reconnect) try { await reinit?.(id); } catch {}
  });
};

import { Boom } from '@hapi/boom';
import { DisconnectReason } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

const pendingQRs = new Map();
const retryCounts = new Map();
const MAX_RETRIES = 5;

export const getPendingQR = id => pendingQRs.get(id) ?? null;

export const registerSocketEvents = (sock, id, saveCreds, reinit) => {
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) pendingQRs.set(id, qr);
    if (connection === 'open') return retryCounts.delete(id);
    if (connection !== 'close') return;

    const err = lastDisconnect?.error;
    const reconnect = !err || (
      err instanceof Boom && err.output?.statusCode !== DisconnectReason.loggedOut
    );

    try { await saveCreds(); } catch {}

    const retries = (retryCounts.get(id) ?? 0) + 1;
    retryCounts.set(id, retries);

    // 🔍 Check for specific "Connection Failure" message
    const isConnectionFailure = err?.message?.includes?.('Connection Failure');

    if (retries > MAX_RETRIES || isConnectionFailure) {
      try {
        const { deleteSession } = await import('../client/session.manager.js');
        await deleteSession(id);
      } catch {}
      retryCounts.delete(id);
      pendingQRs.delete(id);
      return;
    }

    if (reconnect) {
      try { await reinit?.(id); } catch {}
    }
  });
};

export const deleteEmptyDirs = dir => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) deleteEmptyDirs(path.join(dir, e.name));
  }
  const files = fs.readdirSync(dir);
  if (files.length === 0 || (files.length === 1 && files[0] === 'creds.json')) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
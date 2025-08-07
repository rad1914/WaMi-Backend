// @path: utils/helpers.js
import { Boom } from '@hapi/boom';
import { DisconnectReason } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

export const deleteEmptyDirs = dir => {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) deleteEmptyDirs(path.join(dir, entry.name));
  }
  const files = fs.readdirSync(dir);
  if (files.length === 0 || (files.length === 1 && files[0] === 'creds.json')) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const pendingQRs = new Map();

export const getPendingQR = id => pendingQRs.get(id) ?? null;

export const registerSocketEvents = (sock, id, saveCreds, reinit) => {
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) pendingQRs.set(id, qr);
    if (connection !== 'close') return;

    const err = lastDisconnect?.error;
    const reconnect =
      !err || (err instanceof Boom && err.output?.statusCode !== DisconnectReason.loggedOut);

    try { await saveCreds(); } catch {}
    if (reconnect) try { await reinit?.(id); } catch {}
  });
};

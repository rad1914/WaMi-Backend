// whatsapp.js

import { makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason } from '@whiskeysockets/baileys';
import qrCode from 'qrcode';
import { insertMessage } from './database.js';
import { logger } from './logger.js';

let isAuthenticated = false;
let latestQR = null;

const { state, saveCreds } = await useMultiFileAuthState(process.env.AUTH_DIR || './auth');
const sock = makeWASocket({
  auth: state,
  logger,
  browser: Browsers.ubuntu('MinimalWA'),
  syncFullHistory: true,
});

sock.ev.on('creds.update', saveCreds);
sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
  if (qr) {
    latestQR = await qrCode.toDataURL(qr);
    logger.info('New QR code stored');
  }
  if (connection === 'open') {
    isAuthenticated = true;
    logger.info('WhatsApp connection opened');
  }
  if (connection === 'close') {
    isAuthenticated = false;
    const code = lastDisconnect?.error?.output?.statusCode;
    if (code !== DisconnectReason.loggedOut) {
      setTimeout(() => process.exit(1), 5000);
    }
    logger.warn({ code }, 'WhatsApp connection closed');
  }
});

sock.ev.on('messages.upsert', ({ messages }) => {
  const msg = messages[0];
  const timestamp = msg.messageTimestamp * 1000;
  insertMessage(msg.key.id, msg.key.remoteJid, msg.message?.text || '', 0, 'received', timestamp);
  logger.info({ jid: msg.key.remoteJid, text: msg.message?.text }, 'Incoming message stored');
});

async function sendMessage(jid, text, io) {
  const sent = await sock.sendMessage(jid, { text });
  const timestamp = Date.now();
  const info = insertMessage(sent.key.id, jid, text, 1, 'sent', timestamp);
  io.emit('whatsapp-message', { id: info.lastInsertRowid, jid, text, timestamp, fromMe: true });
  logger.info({ id: info.lastInsertRowid }, 'Message sent and stored');
}

export { sock, isAuthenticated, latestQR, sendMessage };

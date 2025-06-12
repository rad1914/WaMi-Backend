// index.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import {
  makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion,
  Browsers, makeCacheableSignalKeyStore, DisconnectReason, jidDecode
} from '@whiskeysockets/baileys';
import qrCode from 'qrcode';
import {
  insertMessage, getMessagesByJid, updateMessageStatus,
  upsertChat, getChats
} from './database.js';
import { logger } from './logger.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

let isAuthenticated = false, latestQR = null;

const normalizeJid = input => {
  if (!input) return null;
  const cleaned = input.replace(/^\+/, '');
  if (/^[0-9]+$/.test(cleaned)) return `${cleaned}@s.whatsapp.net`;
  const [user, domain] = cleaned.split('@');
  return /^[0-9]+$/.test(user) && domain === 's.whatsapp.net' ? `${user}@${domain}` : null;
};

async function runBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const sock = makeWASocket({
    version,
    browser: Browsers.macOS('Desktop'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    emitOwnEvents: true,
    getMessage: async key => (await loadMessage(key.id))?.message || { conversation: null }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
    if (qr) latestQR = await qrCode.toDataURL(qr);
    if (connection === 'open') isAuthenticated = true;
    if (connection === 'close') {
      isAuthenticated = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) setTimeout(runBot, 5000);
    }
  });

  async function sendMessage(jidInput, text) {
    const fullJid = normalizeJid(jidInput);
    if (!fullJid || !jidDecode(fullJid)?.user) throw new Error(`Invalid JID: ${jidInput}`);

    const sent = await sock.sendMessage(fullJid, { text });
    const timestamp = Date.now();

    insertMessage.run({ message_id: sent.key.id, jid: fullJid, text, isOutgoing: 1, status: 'sent', timestamp });
    upsertChat.run({ jid: fullJid, name: sent.pushName, last_message: text, last_message_timestamp: timestamp });

    const msg = { id: sent.key.id, jid: fullJid, text, timestamp, fromMe: true };
    io.emit('whatsapp-message', [msg]);
    return { id: sent.key.id, timestamp };
  }

  sock.ev.on('messages.upsert', ({ messages }) => {
    const msg = messages[0];
    if (msg.key.fromMe) return;

    const text = msg.message?.extendedTextMessage?.text || msg.message?.conversation;
    if (!text) return;

    const timestamp = Number(msg.messageTimestamp) * 1000;
    const { id, remoteJid } = msg.key;

    insertMessage.run({ message_id: id, jid: remoteJid, text, isOutgoing: 0, status: 'received', timestamp });
    upsertChat.run({ jid: remoteJid, name: msg.pushName || remoteJid.split('@')[0], last_message: text, last_message_timestamp: timestamp });

    io.emit('whatsapp-message', [{ id, jid: remoteJid, text, timestamp, fromMe: false }]);
  });

  sock.ev.on('messages.update', updates => {
    updates.forEach(({ key, update }) => {
      const statusMap = { 4: 'delivered', 5: 'read' };
      const status = statusMap[update?.status] || 'sent';
      updateMessageStatus.run({ status, id: key.id });
      io.emit('whatsapp-message-status-update', { id: key.id, status });
    });
  });

  app.use(express.json());
  app.use((req, _, next) => {
    logger.info(`API Request: ${req.method} ${req.url} - Body: ${JSON.stringify(req.body)}`);
    next();
  });

  app.get('/status', (_, res) => res.json({ connected: isAuthenticated, qr: latestQR }));

  app.get('/chats', (_, res) => {
    try {
      res.json(getChats.all());
    } catch (err) {
      logger.error('Failed to fetch chats:', err);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/history/:jid', (req, res) => {
    const fullJid = normalizeJid(decodeURIComponent(req.params.jid));
    if (!fullJid) return res.status(400).json({ error: 'Invalid JID parameter' });

    try {
      const limit = req.query.limit || 200;
      const rows = getMessagesByJid.all({ jid: fullJid, limit });
      res.json(rows.map(r => ({ ...r, id: r.message_id })));
    } catch (err) {
      logger.error('History fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  app.post('/send', async (req, res) => {
    const { jid, text, tempId } = req.body;
    if (!jid || !text || !tempId) return res.status(400).json({ error: 'JID, text, and tempId are required' });

    try {
      const { id, timestamp } = await sendMessage(jid, text);
      res.json({ success: true, messageId: id, tempId, timestamp });
    } catch (e) {
      logger.error(`Send error: ${e.stack || e.message}`);
      res.status(500).json({ success: false, error: e.message, tempId });
    }
  });
}

const PORT = process.env.PORT || 3007;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  runBot();
});

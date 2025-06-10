// index.js

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  jidDecode
} from '@whiskeysockets/baileys';
import qrCode from 'qrcode';
import {
  insertMessage,
  getMessagesByJid,
  updateMessageStatus,
  upsertChat,
  getChats
} from './database.js';
import { logger } from './logger.js'; // Assuming you have a logger.js file

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

let isAuthenticated = false;
let latestQR = null;

async function runBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      browser: Browsers.macOS('Desktop'),
      version,
      emitOwnEvents: true,
      getMessage: async key => (await loadMessage(key.id))?.message || { conversation: null }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
      if (qr) {
        latestQR = await qrCode.toDataURL(qr);
        logger.info('Received new QR code');
      }
      if (connection === 'open') {
        isAuthenticated = true;
        logger.info('WhatsApp connection open');
      }
      if (connection === 'close') {
        isAuthenticated = false;
        logger.warn('WhatsApp connection closed');
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) {
            // Restart on connection closed, unless logged out
            setTimeout(runBot, 5000);
        }
      }
    });

    const bareJidRegex = /^[0-9]+$/;
    function normalizeJidInput(input) {
      if (!input) return null;
      const withoutPlus = input.replace(/^\+/, '');
      if (!withoutPlus.includes('@')) {
        if (!bareJidRegex.test(withoutPlus)) return null;
        return `${withoutPlus}@s.whatsapp.net`;
      }
      const [user, domain] = withoutPlus.split('@');
      if (!bareJidRegex.test(user) || domain !== 's.whatsapp.net') return null;
      return `${user}@${domain}`;
    }

    async function sendMessage(jidInput, text) {
      const fullJid = normalizeJidInput(jidInput);
      if (!fullJid) {
        throw new Error(`Invalid JID: ${jidInput}`);
      }
      const parsed = jidDecode(fullJid);
      if (!parsed || !parsed.user) {
        throw new Error(`Invalid JID format: ${fullJid}`);
      }

      const sent = await sock.sendMessage(fullJid, { text });
      const timestamp = Date.now();
      
      insertMessage.run({
        message_id: sent.key.id,
        jid: fullJid,
        text,
        isOutgoing: 1,
        status: 'sent',
        timestamp
      });
      
      upsertChat.run({
          jid: fullJid,
          name: sent.pushName, // This might be null
          last_message: text,
          last_message_timestamp: timestamp
      });

      const messageData = {
        id: sent.key.id,
        jid: fullJid,
        text,
        timestamp,
        fromMe: true
      };
      
      io.emit('whatsapp-message', [messageData]);
      logger.info(`Message sent to ${fullJid}: ${text}`);
      
      return { id: sent.key.id, timestamp };
    }

    sock.ev.on('messages.upsert', ({ messages }) => {
      const msg = messages[0];
      if (msg.key.fromMe) return;

      const text = msg.message?.extendedTextMessage?.text || msg.message?.conversation || '';
      if (!text) return;
      
      const timestamp = Number(msg.messageTimestamp) * 1000;
      const remoteJid = msg.key.remoteJid;
      logger.info(`Received message: id=${msg.key.id}, from=${remoteJid}`);

      try {
        insertMessage.run({
          message_id: msg.key.id,
          jid: remoteJid,
          text,
          isOutgoing: 0,
          status: 'received',
          timestamp: timestamp
        });

        upsertChat.run({
            jid: remoteJid,
            name: msg.pushName || remoteJid.split('@')[0],
            last_message: text,
            last_message_timestamp: timestamp
        });

        io.emit('whatsapp-message', [{
          id: msg.key.id,
          jid: remoteJid,
          text,
          timestamp: timestamp,
          fromMe: false
        }]);
      } catch (err) {
        logger.error('Error processing incoming message:', err);
      }
    });

    sock.ev.on('messages.update', updates => {
      for (const { key, update } of updates) {
        const newStatus = update?.status;
        const messageId = key.id;

        if (newStatus && messageId) {
          let statusString = 'sent';
          if (newStatus === 4) statusString = 'delivered';
          if (newStatus === 5) statusString = 'read';

          logger.info(`Updating status for message ${messageId} to ${statusString}`);
          updateMessageStatus.run({ status: statusString, id: messageId });

          io.emit('whatsapp-message-status-update', { id: messageId, status: statusString });
        }
      }
    });

    app.use(express.json());
    app.use((req, res, next) => {
      logger.info(`API Request: ${req.method} ${req.url} - Body: ${JSON.stringify(req.body)}`);
      next();
    });

    // --- API Endpoints ---
    app.get('/status', (_, res) => res.json({ connected: isAuthenticated, qr: latestQR }));

    app.get('/chats', (_, res) => {
        try {
            const conversations = getChats.all();
            res.json(conversations);
        } catch (err) {
            logger.error('Failed to fetch chats:', err);
            res.status(500).json({ error: 'Failed to fetch conversations' });
        }
    });

    app.get('/history/:jid', async (req, res) => {
      const fullJid = normalizeJidInput(decodeURIComponent(req.params.jid));
      if (!fullJid) return res.status(400).json({ error: 'Invalid JID parameter' });

      try {
        const rows = getMessagesByJid.all({ jid: fullJid, limit: req.query.limit || 200 });
        res.json(rows.map(r => ({
          id: r.message_id,
          jid: r.jid,
          text: r.text,
          isOutgoing: r.isOutgoing,
          status: r.status,
          timestamp: r.timestamp
        })));
      } catch (err) {
        logger.error('History fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch history' });
      }
    });

    app.post('/send', async (req, res) => {
      const { jid, text, tempId } = req.body;
      if (!jid || !text || !tempId) {
        return res.status(400).json({ error: 'JID, text, and tempId are required' });
      }

      try {
        const { id: messageId, timestamp } = await sendMessage(jid, text);
        res.json({ success: true, messageId, tempId, timestamp });
      } catch (e) {
        logger.error(`Failed to send message: ${e.stack || e.message}`);
        res.status(500).json({ success: false, error: e.message, tempId });
      }
    });
}

const PORT = process.env.PORT || 3007;
server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    runBot(); // Start the bot
});


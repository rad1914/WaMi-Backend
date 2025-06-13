import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion,
  Browsers, makeCacheableSignalKeyStore, DisconnectReason, jidDecode, jidNormalizedUser,
  downloadMediaMessage
} from '@whiskeysockets/baileys';
import qrCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import {
  insertMessage, getMessagesByJid, updateMessageStatus,
  upsertChat, getChats, resetChatUnreadCount
} from './database.js';
import { logger } from './logger.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Sessions are stored in-memory. For production, consider a persistent store like Redis.
const sessions = new Map();
const SESSIONS_DIR = './auth_sessions';

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR);
}

const isGroup = (jid) => jid?.endsWith('@g.us');

const normalizeJid = (input) => {
  if (!input) return null;
  const jid = jidNormalizedUser(input);
  if (!jid || (jid.includes('@g.us') ? !jid.split('@')[0].match(/^\d{18,}$/) : !jid.includes('@s.whatsapp.net'))) return null;
  return jid;
};

const getMessageType = (message) => {
    if (message.imageMessage) return 'image';
    if (message.videoMessage) return 'video';
    if (message.audioMessage) return 'audio';
    if (message.documentMessage) return 'document';
    return 'text';
};

async function createWhatsappSession(session) {
  const sessionPath = path.join(SESSIONS_DIR, session.id);
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    version,
    browser: Browsers.macOS('Desktop'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    emitOwnEvents: true,
    getMessage: async (key) => (await loadMessage(key.id))?.message || { conversation: null }
  });

  session.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      try {
        session.latestQR = await qrCode.toDataURL(qr);
      } catch (e) {
        logger.error(`[${session.id}] Failed to generate QR code`, e);
        session.latestQR = null;
      }
    }
    if (connection === 'open') {
      session.isAuthenticated = true;
      session.latestQR = null;
    }
    if (connection === 'close') {
      session.isAuthenticated = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut && sessions.has(session.id)) {
        logger.info(`[${session.id}] Connection closed (${DisconnectReason[code]}), reconnecting...`);
        setTimeout(() => createWhatsappSession(session), 5000);
      } else {
        logger.info(`[${session.id}] Session closed or logged out. Cleaning up.`);
        fs.rmSync(sessionPath, { recursive: true, force: true });
        sessions.delete(session.id);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const messageType = getMessageType(msg.message);
    const text = msg.message?.extendedTextMessage?.text || msg.message?.conversation || msg.message[messageType + 'Message']?.caption;
    const timestamp = Number(msg.messageTimestamp) * 1000;
    const { id, remoteJid, fromMe } = msg.key;
    const isOutgoing = fromMe;
    const groupJid = isGroup(remoteJid) ? remoteJid : null;
    const participant = !isOutgoing && groupJid ? msg.key.participant : null;
    let chatName = msg.pushName || remoteJid.split('@')[0];
    
    let media_url = null;
    let mimetype = null;

    if (messageType !== 'text') {
        const messageContent = msg.message[messageType + 'Message'];
        mimetype = messageContent.mimetype;
        const media = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
        const fileName = `${id}.${mimetype.split('/')[1]}`;
        const mediaPath = path.join('media', session.id);
        if (!fs.existsSync(mediaPath)) fs.mkdirSync(mediaPath, { recursive: true });
        media_url = `/media/${session.id}/${fileName}`;
        fs.writeFileSync(`.${media_url}`, media);
    }

    if (groupJid) {
        try {
            const metadata = await sock.groupMetadata(groupJid);
            chatName = metadata.subject;
        } catch (e) {
            logger.error(`[${session.id}] Failed to fetch group metadata for ${groupJid}`, e);
        }
    }

    insertMessage.run({
        message_id: id,
        session_id: session.id,
        jid: remoteJid,
        text,
        isOutgoing: isOutgoing ? 1 : 0,
        status: isOutgoing ? 'sent' : 'received',
        timestamp,
        participant,
        media_url,
        mimetype
    });
    
    upsertChat.run({
        session_id: session.id,
        jid: remoteJid,
        name: chatName,
        is_group: groupJid ? 1 : 0,
        last_message: text || `${messageType.charAt(0).toUpperCase() + messageType.slice(1)}`,
        last_message_timestamp: timestamp,
        increment_unread: isOutgoing ? 0 : 1
    });
    
    const socketMsg = { id, jid: remoteJid, text, timestamp, fromMe: isOutgoing, participant, media_url, mimetype };
    session.io.emit('whatsapp-message', [socketMsg]);
  });

  sock.ev.on('messages.update', (updates) => {
    updates.forEach(({ key, update }) => {
      if (!key.fromMe) return;
      const statusMap = { 4: 'delivered', 5: 'read' };
      const status = statusMap[update?.status] || 'sent';
      if (status !== 'sent') {
        updateMessageStatus.run({ status, id: key.id });
        session.io.emit('whatsapp-message-status-update', { id: key.id, status });
      }
    });
  });
}

// Middleware to validate session token
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  const sessionId = authHeader.substring(7);
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized: Invalid session token' });
  }
  req.session = session;
  next();
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(path.join(process.cwd(), 'media')));

app.use((req, _, next) => {
    const sessionId = req.headers.authorization?.substring(7) || 'N/A';
    logger.info(`[${sessionId}] API Request: ${req.method} ${req.url} - Body: ${JSON.stringify(req.body)}`);
    next();
});

io.on('connection', (socket) => {
  const sessionId = socket.handshake.auth.token;
  if (sessionId && sessions.has(sessionId)) {
    logger.info(`[${sessionId}] Client connected to Socket.IO room`);
    socket.join(sessionId);
  } else {
    logger.warn(`Client connection rejected. Invalid or missing session token.`);
    socket.disconnect(true);
  }
});

// PUBLIC ENDPOINTS (No Auth Required)
app.post('/session/create', (req, res) => {
  const sessionId = uuidv4();
  const session = {
    id: sessionId,
    sock: null,
    isAuthenticated: false,
    latestQR: null,
    io: io.to(sessionId)
  };
  sessions.set(sessionId, session);
  createWhatsappSession(session);
  logger.info(`[${sessionId}] New session created.`);
  res.json({ sessionId });
});

// PROTECTED ENDPOINTS (Auth Required)
app.use(['/status', '/chats', '/history/:jid', '/send', '/session/logout', '/session/export'], authMiddleware);

app.get('/status', (req, res) => {
  res.json({
    connected: req.session.isAuthenticated,
    qr: req.session.latestQR
  });
});

app.post('/session/logout', async (req, res) => {
  const { session } = req;
  try {
    await session.sock?.logout();
  } catch (e) {
    logger.error(`[${session.id}] Error during logout:`, e);
  } finally {
    const sessionPath = path.join(SESSIONS_DIR, session.id);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
    sessions.delete(session.id);
    logger.info(`[${session.id}] Session logged out and cleaned up.`);
    res.json({ success: true, message: 'Session logged out' });
  }
});

app.get('/session/export', (req, res) => {
  const { session } = req;
  const sessionPath = path.join(SESSIONS_DIR, session.id);

  if (!fs.existsSync(sessionPath)) {
    return res.status(404).json({ error: 'Session data not found.' });
  }

  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  archive.on('warning', function(err) {
    if (err.code === 'ENOENT') {
      logger.warn(`[${session.id}] Archiver warning: `, err);
    } else {
      throw err;
    }
  });
  
  archive.on('error', function(err) {
    logger.error(`[${session.id}] Archiver error: `, err);
    res.status(500).send({error: err.message});
  });

  res.attachment(`wami-session-${session.id}.zip`);
  archive.pipe(res);
  archive.directory(sessionPath, false);
  archive.finalize();
});

app.get('/chats', (req, res) => {
  try {
    res.json(getChats.all({ session_id: req.session.id }));
  } catch (err) {
    logger.error('Failed to fetch chats:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/history/:jid', (req, res) => {
  const fullJid = normalizeJid(decodeURIComponent(req.params.jid));
  if (!fullJid) return res.status(400).json({ error: 'Invalid JID parameter' });

  resetChatUnreadCount.run({ session_id: req.session.id, jid: fullJid });

  try {
    const limit = req.query.limit || 200;
    const rows = getMessagesByJid.all({ session_id: req.session.id, jid: fullJid, limit });
    res.json(rows.map(r => ({ ...r, id: r.message_id })));
  } catch (err) {
    logger.error('History fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.post('/send', async (req, res) => {
  const { session } = req;
  const { jid, text, tempId } = req.body;
  if (!jid || !text || !tempId) return res.status(400).json({ error: 'JID, text, and tempId are required' });
  if (!session.isAuthenticated || !session.sock) return res.status(409).json({ error: 'Session not authenticated' });

  try {
    const fullJid = normalizeJid(jid);
    if (!fullJid || !jidDecode(fullJid)?.user) throw new Error(`Invalid JID: ${jid}`);
    
    const sent = await session.sock.sendMessage(fullJid, { text });
    res.json({ success: true, messageId: sent.key.id, tempId, timestamp: Date.now() });
  } catch (e) {
    logger.error(`[${session.id}] Send error: ${e.stack || e.message}`);
    res.status(500).json({ success: false, error: e.message, tempId });
  }
});

const PORT = process.env.PORT || 3007;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

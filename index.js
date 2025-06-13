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
import multer from 'multer';
import unzipper from 'unzipper';
import { body, validationResult } from 'express-validator';
import dotenv from 'dotenv';

// --- Local Imports ---
// Ensure you have a database.js file that exports these functions.
import { insertMessage, getMessagesByJid, updateMessageStatus, upsertChat, getChats, resetChatUnreadCount } from './database.js';
// Ensure you have a logger.js file that exports a logger object.
import { logger } from './logger.js';

// --- Configuration ---
dotenv.config();
const PORT = process.env.PORT || 3007;
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';
const MEDIA_DIR = process.env.MEDIA_DIR || './media';


// --- Express & Server Setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const sessions = new Map();
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR);

const upload = multer({ storage: multer.memoryStorage() });


// --- Utility Functions ---
const isGroup = (jid) => jid?.endsWith('@g.us');

const normalizeJid = (input) => {
  if (!input) return null;
  try {
    const jid = jidNormalizedUser(input);
    const decoded = jidDecode(jid);
    if (!decoded?.user || !decoded?.server) {
        return null;
    }
    return jid;
  } catch (e) {
    logger.error(`Failed to normalize JID: ${input}`, e);
    return null;
  }
};

const getMessageType = (message) => {
    if (message.reactionMessage) return 'reaction';
    if (message.stickerMessage) return 'sticker';
    if (message.imageMessage) return 'image';
    if (message.videoMessage) return 'video';
    if (message.audioMessage) return 'audio';
    if (message.documentMessage) return 'document';
    if (message.locationMessage) return 'location';
    if (message.contactMessage) return 'contact';
    if (message.extendedTextMessage) return 'text';
    if (message.conversation) return 'text';
    return null;
};


// --- WhatsApp Service ---
async function createWhatsappSession(session) {
  const sessionPath = path.join(SESSIONS_DIR, session.id);
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    version,
    browser: Browsers.macOS('Desktop'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    emitOwnEvents: true,
    getMessage: async (key) => (await getMessagesByJid.get({ message_id: key.id, session_id: session.id }))?.message || undefined
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
      logger.info(`[${session.id}] Session connected.`);
    }
    if (connection === 'close') {
      session.isAuthenticated = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut && sessions.has(session.id)) {
        logger.info(`[${session.id}] Connection closed (${code}), reconnecting...`);
        setTimeout(() => createWhatsappSession(session), 5000);
      } else {
        logger.info(`[${session.id}] Session logged out or removed. Cleaning up.`);
        fs.rmSync(sessionPath, { recursive: true, force: true });
        sessions.delete(session.id);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
        if (!msg.message) continue;

        const messageType = getMessageType(msg.message);
        if (!messageType) {
            logger.info(`[${session.id}] Skipping unhandled message type in message ${msg.key.id}`);
            continue;
        }

        const messageContent = msg.message[messageType + 'Message'] || msg.message;
        const text = msg.message?.extendedTextMessage?.text || msg.message?.conversation || messageContent?.caption;
        const timestamp = Number(msg.messageTimestamp) * 1000;
        const { id, remoteJid, fromMe } = msg.key;
        const isOutgoing = fromMe;
        const groupJid = isGroup(remoteJid) ? remoteJid : null;
        const participant = !isOutgoing && groupJid ? msg.key.participant : null;
        let chatName = msg.pushName || remoteJid.split('@')[0];

        const contextInfo = messageContent?.contextInfo;
        const quoted_message_id = contextInfo?.stanzaId || null;
        const quoted_message_text = contextInfo?.quotedMessage?.conversation || contextInfo?.quotedMessage?.extendedTextMessage?.text || null;

        let media_url = null;
        let mimetype = null;

        if (['image', 'video', 'audio', 'document'].includes(messageType)) {
            mimetype = messageContent.mimetype;
            try {
                const media = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
                const fileName = `${id}.${mimetype.split('/')[1] || 'bin'}`;
                const mediaPath = path.join(MEDIA_DIR, session.id);
                if (!fs.existsSync(mediaPath)) fs.mkdirSync(mediaPath, { recursive: true });
                const fullMediaPath = path.join(mediaPath, fileName);
                await fs.promises.writeFile(fullMediaPath, media);
                media_url = `/media/${session.id}/${fileName}`;
            } catch(e) {
                logger.error(`[${session.id}] Failed to download media for message ${id}`, e);
            }
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
            mimetype,
            quoted_message_id,
            quoted_message_text
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
        
        const socketMsg = { id, jid: remoteJid, text, timestamp, fromMe: isOutgoing, participant, media_url, mimetype, quoted_message_id, quoted_message_text };
        session.io.emit('whatsapp-message', [socketMsg]);
    }
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

// --- Middleware ---
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

// --- Express App Configuration ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(path.join(process.cwd(), MEDIA_DIR)));

app.use((req, _, next) => {
    const sessionId = req.headers.authorization?.substring(7) || 'N/A';
    logger.info(`[${sessionId}] API Request: ${req.method} ${req.url} - Body: ${JSON.stringify(req.body)}`);
    next();
});


// --- Socket.IO Connection ---
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


// --- API Routes ---
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

const commonAuthMiddleware = [authMiddleware];

app.get('/status', commonAuthMiddleware, (req, res) => {
  res.json({
    connected: req.session.isAuthenticated,
    qr: req.session.latestQR
  });
});

app.post('/session/logout', commonAuthMiddleware, async (req, res) => {
  const { session } = req;
  try {
    await session.sock?.logout();
  } catch (e) {
    logger.error(`[${session.id}] Error during logout:`, e);
  } finally {
    res.json({ success: true, message: 'Session logout initiated' });
  }
});

app.get('/session/export', commonAuthMiddleware, (req, res) => {
  const { session } = req;
  const sessionPath = path.join(SESSIONS_DIR, session.id);
  if (!fs.existsSync(sessionPath)) {
    return res.status(404).json({ error: 'Session data not found.' });
  }
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => res.status(500).send({error: err.message}));
  res.attachment(`wami-session-${session.id}.zip`);
  archive.pipe(res);
  archive.directory(sessionPath, false);
  archive.finalize();
});

app.post('/session/import', commonAuthMiddleware, upload.single('sessionFile'), async (req, res) => {
    const { session } = req;
    if (!req.file) {
        return res.status(400).json({ error: 'No session file uploaded.' });
    }

    logger.info(`[${session.id}] Starting session import...`);
    const sessionPath = path.join(SESSIONS_DIR, session.id);

    try {
        await session.sock?.logout();
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        fs.mkdirSync(sessionPath);
        
        await new Promise((resolve, reject) => {
            const stream = unzipper.Extract({ path: sessionPath });
            stream.on('finish', resolve);
            stream.on('error', reject);
            stream.end(req.file.buffer);
        });

        logger.info(`[${session.id}] Session file unzipped. Re-initializing.`);
        await createWhatsappSession(session);
        
        res.json({ success: true, message: 'Session imported successfully. Please poll for connection status.' });
    } catch (e) {
        logger.error(`[${session.id}] Failed to import session:`, e);
        res.status(500).json({ error: `Failed to import session: ${e.message}` });
    }
});


app.get('/chats', commonAuthMiddleware, (req, res) => {
  try {
    res.json(getChats.all({ session_id: req.session.id }));
  } catch (err) {
    logger.error('Failed to fetch chats:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/history/:jid', commonAuthMiddleware, (req, res) => {
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

app.post('/send',
  commonAuthMiddleware,
  body('jid').isString().notEmpty(),
  body('text').isString().notEmpty(),
  body('tempId').isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { session } = req;
    const { jid, text, tempId } = req.body;
    if (!session.isAuthenticated || !session.sock) return res.status(409).json({ error: 'Session not authenticated' });
    
    try {
        const fullJid = normalizeJid(jid);
        if (!fullJid) throw new Error(`Invalid JID provided: ${jid}`);
        const sent = await session.sock.sendMessage(fullJid, { text });
        res.json({ success: true, messageId: sent.key.id, tempId, timestamp: Date.now() });
    } catch (e) {
        logger.error(`[${session.id}] Send error: ${e.stack || e.message}`);
        res.status(500).json({ success: false, error: e.message, tempId });
    }
  }
);

app.post('/send/media',
  commonAuthMiddleware,
  upload.single('file'),
  body('jid').isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { session } = req;
    const { jid, caption } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'File is required' });
    if (!session.isAuthenticated || !session.sock) return res.status(409).json({ error: 'Session not authenticated' });

    try {
        const fullJid = normalizeJid(jid);
        if (!fullJid) throw new Error(`Invalid JID provided: ${jid}`);

        let messageOptions;
        if (file.mimetype.startsWith('image/')) {
            messageOptions = { image: file.buffer, caption, mimetype: file.mimetype };
        } else if (file.mimetype.startsWith('video/')) {
            messageOptions = { video: file.buffer, caption, mimetype: file.mimetype };
        } else {
            messageOptions = { document: file.buffer, mimetype: file.mimetype, fileName: file.originalname };
        }

        const sent = await session.sock.sendMessage(fullJid, messageOptions);
        res.json({ success: true, messageId: sent.key.id });
    } catch (e) {
        logger.error(`[${session.id}] Send media error: ${e.stack || e.message}`);
        res.status(500).json({ success: false, error: e.message });
    }
  }
);


// --- Server Initialization ---
function initializeSessionsOnStartup() {
  try {
    const sessionFiles = fs.readdirSync(SESSIONS_DIR);
    logger.info(`Found ${sessionFiles.length} sessions to re-initialize.`);
    for (const sessionId of sessionFiles) {
      const sessionPath = path.join(SESSIONS_DIR, sessionId);
      if (fs.statSync(sessionPath).isDirectory()) {
        logger.info(`Initializing session: ${sessionId}`);
        const session = {
          id: sessionId,
          sock: null,
          isAuthenticated: false,
          latestQR: null,
          io: io.to(sessionId)
        };
        sessions.set(sessionId, session);
        createWhatsappSession(session);
      }
    }
  } catch (e) {
      logger.error('Error initializing sessions on startup:', e);
  }
}

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  initializeSessionsOnStartup();
});

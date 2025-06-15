// index.js (EndPoint) 

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import multer from 'multer';
import unzipper from 'unzipper';
import { body, validationResult } from 'express-validator';
import dotenv from 'dotenv';

import { createWhatsappSession, normalizeJid } from './whatsapp-service.js';
import { getMessagesByJid, getChats, resetChatUnreadCount } from './database.js';
import { logger } from './logger.js';

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3007;
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';
const MEDIA_DIR = process.env.MEDIA_DIR || './media';
const sessions = new Map();

[SESSIONS_DIR, MEDIA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

const upload = multer({ storage: multer.memoryStorage() });

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const session = sessions.get(token);
  if (!token || !session) return res.status(401).json({ error: 'Unauthorized' });
  req.session = session;
  next();
};

app.use(express.json());
app.use('/media', express.static(path.join(process.cwd(), MEDIA_DIR)));

app.use((req, _, next) => {
  const sessionId = req.headers.authorization?.split(' ')[1] || 'N/A';
  logger.info(`[${sessionId}] ${req.method} ${req.url} - ${JSON.stringify(req.body)}`);
  next();
});

io.on('connection', socket => {
  const sessionId = socket.handshake.auth.token;
  if (sessions.has(sessionId)) {
    socket.join(sessionId);
    logger.info(`[${sessionId}] Socket.IO connected`);
  } else {
    socket.disconnect(true);
  }
});

app.post('/session/create', (req, res) => {
  const sessionId = uuidv4();
  const session = { id: sessionId, sock: null, isAuthenticated: false, latestQR: null, io: io.to(sessionId) };
  sessions.set(sessionId, session);
  createWhatsappSession(session, () => {
    fs.rmSync(path.join(SESSIONS_DIR, sessionId), { recursive: true, force: true });
    sessions.delete(sessionId);
  });
  res.json({ sessionId });
});

app.get('/status', authMiddleware, (req, res) => {
  res.json({ connected: req.session.isAuthenticated, qr: req.session.latestQR });
});

app.post('/session/logout', authMiddleware, async (req, res) => {
  try { await req.session.sock?.logout(); } catch {}
  res.json({ success: true });
});

app.get('/session/export', authMiddleware, (req, res) => {
  const sessionPath = path.join(SESSIONS_DIR, req.session.id);
  if (!fs.existsSync(sessionPath)) return res.status(404).json({ error: 'Not found' });
  res.attachment(`wami-session-${req.session.id}.zip`);
  archiver('zip', { zlib: { level: 9 } }).directory(sessionPath, false).pipe(res).finalize();
});

app.post('/session/import', authMiddleware, upload.single('sessionFile'), async (req, res) => {
  const { session, file } = req;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const sessionPath = path.join(SESSIONS_DIR, session.id);
  try {
    await session.sock?.logout();
    fs.rmSync(sessionPath, { recursive: true, force: true });
    fs.mkdirSync(sessionPath);
    await unzipper.Extract({ path: sessionPath }).promise(file.buffer);
    await createWhatsappSession(session, () => sessions.delete(session.id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/chats', authMiddleware, async (req, res) => {
  try {
    const chats = getChats.all({ session_id: req.session.id });
    const chatsWithAvatars = await Promise.all(
      chats.map(async (chat) => {
        let avatarUrl = null;
        if (req.session.sock) {
          try {
            avatarUrl = await req.session.sock.profilePictureUrl(chat.jid, 'image');
          } catch (e) { /* Fails if no avatar is set, which is fine. */ }
        }
        return { ...chat, avatarUrl };
      })
    );
    res.json(chatsWithAvatars);
  } catch (e) {
    logger.error(`[${req.session.id}] /chats failed:`, e);
    res.status(500).json({ error: 'Fetch failed' });
  }
});

app.get('/history/:jid', authMiddleware, (req, res) => {
  const jid = normalizeJid(decodeURIComponent(req.params.jid));
  if (!jid) return res.status(400).json({ error: 'Invalid JID' });
  resetChatUnreadCount.run({ session_id: req.session.id, jid });
  try {
    const rows = getMessagesByJid.all({ session_id: req.session.id, jid, limit: req.query.limit || 200 });
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Fetch failed' });
  }
});

app.post('/send',
  authMiddleware,
  body('jid').isString(), body('text').isString(), body('tempId').isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { jid, text, tempId } = req.body;
    const { session } = req;
    if (!session.isAuthenticated || !session.sock) return res.status(409).json({ error: 'Not authenticated' });
    try {
      const fullJid = normalizeJid(jid);
      const sent = await session.sock.sendMessage(fullJid, { text });
      res.json({ success: true, messageId: sent.key.id, tempId, timestamp: Date.now() });
    } catch (e) {
      res.status(500).json({ error: e.message, tempId });
    }
  });

app.post('/send/media',
  authMiddleware,
  upload.single('file'),
  body('jid').isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { session, file } = req;
    const { jid, caption } = req.body;
    if (!file || !session.isAuthenticated || !session.sock) return res.status(409).json({ error: 'Invalid request' });

    try {
      const fullJid = normalizeJid(jid);
      const type = file.mimetype.startsWith('image/') ? 'image' :
                   file.mimetype.startsWith('video/') ? 'video' : 'document';
      const content = { [type]: file.buffer, mimetype: file.mimetype };
      if (type === 'image' || type === 'video') content.caption = caption;
      if (type === 'document') content.fileName = file.originalname;
      const sent = await session.sock.sendMessage(fullJid, content);
      res.json({ success: true, messageId: sent.key.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

app.post('/send/reaction',
  authMiddleware,
  body('jid').isString(),
  body('messageId').isString(),
  body('fromMe').isBoolean(),
  body('emoji').isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { session } = req;
    if (!session.isAuthenticated || !session.sock) return res.status(409).json({ error: 'Not authenticated' });
    
    try {
      const { jid, messageId, fromMe, emoji } = req.body;
      const fullJid = normalizeJid(jid);

      const messageKey = {
        remoteJid: fullJid,
        id: messageId,
        fromMe: fromMe
      };

      await session.sock.sendMessage(fullJid, {
        react: {
          text: emoji,
          key: messageKey
        }
      });
      
      res.json({ success: true });
    } catch (e) {
      logger.error(`[${req.session.id}] /send/reaction failed:`, e);
      res.status(500).json({ error: e.message });
    }
  });

function restoreSessions() {
  try {
    const sessionFolders = fs.readdirSync(SESSIONS_DIR);
    logger.info(`Found ${sessionFolders.length} session(s) to restore.`);

    for (const id of sessionFolders) {
      const sessionPath = path.join(SESSIONS_DIR, id);
      if (fs.statSync(sessionPath).isDirectory()) {
        logger.info(`Restoring session: ${id}`);
        const session = { id, sock: null, isAuthenticated: false, latestQR: null, io: io.to(id) };
        sessions.set(id, session);
        createWhatsappSession(session, () => {
          logger.info(`Session ${id} was logged out and removed.`);
          fs.rmSync(path.join(SESSIONS_DIR, id), { recursive: true, force: true });
          sessions.delete(id);
        });
      }
    }
  } catch (e) {
    if (e.code === 'ENOENT') {
      logger.info('Sessions directory not found, skipping restore.');
    } else {
      logger.error('Startup restore failed:', e);
    }
  }
}

server.listen(PORT, () => {
  logger.info(`Listening on ${PORT}`);
  restoreSessions();
});

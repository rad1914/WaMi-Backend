// @path: index.js
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
import { getMessagesByJid, getChats, resetChatUnreadCount, db } from './database.js';
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100 MB limit
  },
  fileFilter: (req, file, cb) => {
    const isSessionImport = req.path.includes('/session/import');
    if (isSessionImport && file.mimetype !== 'application/zip') {
      return cb(new Error('Session import only accepts .zip files.'));
    }
    cb(null, true);
  }
});

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
  const bodyToLog = req.path.includes('/send/media') ? { ...req.body, file: '...omitted...' } : req.body;
  logger.info(`[${sessionId}] ${req.method} ${req.url} - ${JSON.stringify(bodyToLog)}`);
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

const createOnLogout = (sessionId) => {
  return () => {
    logger.info(`Session ${sessionId} was logged out and removed.`);
    const sessionAuthPath = path.join(SESSIONS_DIR, sessionId);
    const sessionMediaPath = path.join(MEDIA_DIR, sessionId);

    fs.rmSync(sessionAuthPath, { recursive: true, force: true });
    fs.rmSync(sessionMediaPath, { recursive: true, force: true });
    
    sessions.delete(sessionId);
  };
};

app.post('/session/create', (req, res) => {
  const sessionId = uuidv4();
  const session = { id: sessionId, sock: null, isAuthenticated: false, latestQR: null, io: io.to(sessionId) };
  sessions.set(sessionId, session);
  createWhatsappSession(session, createOnLogout(sessionId));
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
    createWhatsappSession(session, createOnLogout(session.id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/chats', authMiddleware, (req, res) => {
  try {
    const chats = getChats.all({ session_id: req.session.id });
    res.json(chats);
  } catch (e) {
    logger.error(`[${req.session.id}] /chats failed:`, e);
    res.status(500).json({ error: 'Fetch failed' });
  }
});

app.get('/avatar/:jid', authMiddleware, async (req, res) => {
  try {
    const { jid } = req.params;
    const url = await req.session.sock.profilePictureUrl(jid, 'image');
    res.redirect(url);
  } catch (e) {
    const placeholder = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': placeholder.length
    });
    res.end(placeholder);
  }
});

app.get('/history/:jid', authMiddleware, (req, res) => {
  const jid = normalizeJid(decodeURIComponent(req.params.jid));
  if (!jid) return res.status(400).json({ error: 'Invalid JID' });
  
  resetChatUnreadCount.run({ session_id: req.session.id, jid });
  
  try {
    const rows = getMessagesByJid.all({ session_id: req.session.id, jid, limit: req.query.limit || 200 });
    
    const messages = rows.map(msg => ({
      ...msg,
      reactions: msg.reactions ? JSON.parse(msg.reactions) : {}
    })).reverse();

    res.json(messages);
  } catch(e) {
    logger.error(`[${req.session.id}] /history/:jid failed:`, e)
    res.status(500).json({ error: 'Fetch failed' });
  }
});

app.post('/history/sync/:jid', authMiddleware, async (req, res) => {
  const { session } = req;
  const { jid } = req.params;

  if (!session.isAuthenticated || !session.sock) {
    return res.status(409).json({ error: 'Not authenticated' });
  }

  try {
    const count = await session.fetchMoreMessages(jid);
    res.json({ success: true, message: `History fetch initiated. Fetched ${count} older messages.` });
  } catch (e) {
    logger.error(`[${session.id}] /history/sync failed:`, e);
    res.status(500).json({ error: e.message || 'Failed to fetch history' });
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
  body('jid').isString(), body('messageId').isString(),
  body('fromMe').isBoolean(), body('emoji').isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { session } = req;
    if (!session.isAuthenticated || !session.sock) return res.status(409).json({ error: 'Not authenticated' });
    
    try {
      const { jid, messageId, fromMe, emoji } = req.body;
      const fullJid = normalizeJid(jid);
      const messageKey = { remoteJid: fullJid, id: messageId, fromMe: fromMe };
      await session.sock.sendMessage(fullJid, { react: { text: emoji, key: messageKey } });
      res.json({ success: true });
    } catch (e) {
      logger.error(`[${session.id}] /send/reaction failed:`, e);
      res.status(500).json({ error: e.message });
    }
  });

function restoreSessions() {
  try {
    const sessionFolders = fs.readdirSync(SESSIONS_DIR);
    logger.info(`Found ${sessionFolders.length} session(s) to restore.`);

    for (const id of sessionFolders) {
      if (fs.statSync(path.join(SESSIONS_DIR, id)).isDirectory()) {
        logger.info(`Restoring session: ${id}`);
        const session = { id, sock: null, isAuthenticated: false, latestQR: null, io: io.to(id) };
        sessions.set(id, session);
        createWhatsappSession(session, createOnLogout(id));
      }
    }
  } catch (e) {
    if (e.code === 'ENOENT') logger.info('Sessions directory not found, skipping restore.');
    else logger.error('Startup restore failed:', e);
  }
}

const listener = server.listen(PORT, () => {
  logger.info(`Listening on ${PORT}`);
  restoreSessions();
});

const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  listener.close(() => {
    logger.info('HTTP server closed.');
    sessions.forEach(session => session.sock?.end(new Error('Server shutting down.')));
    db.close((err) => {
      if (err) logger.error('Error closing database:', err.message);
      else logger.info('Database connection closed.');
    });
    logger.info('Shutdown complete.');
    process.exit(0);
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

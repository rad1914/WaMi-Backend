// @path: index.js (ENDPOINT)
import express from 'express';
import http from 'http';
import https from 'https';
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
import {
  getMessagesByJid,
  getChats,
  resetChatUnreadCount,
  db,
  getOldMediaForCleanup,
  countMessagesBySha256,
  deleteOldMessages,
  deleteOldReactions
} from './database.js';
import { logger } from './logger.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3007;
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';
const MEDIA_DIR = process.env.MEDIA_DIR || './media';
const CLEANUP_DAYS = parseInt(process.env.CLEANUP_DAYS || '30', 10);
const sessions = new Map();

[SESSIONS_DIR, MEDIA_DIR].forEach(dir => !fs.existsSync(dir) && fs.mkdirSync(dir));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (req.path.includes('/session/import') && file.mimetype !== 'application/zip') {
      return cb(new Error('Only .zip allowed'));
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

app.use((req, _, next) => {
  const sid = req.headers.authorization?.split(' ')[1] || 'N/A';
  const logBody = req.path.includes('/send/media') ? { ...req.body, file: '...omitted...' } : req.body;
  logger.info(`[${sid}] ${req.method} ${req.url} - ${JSON.stringify(logBody)}`);
  next();
});

io.on('connection', socket => {
  const sid = socket.handshake.auth.token;
  if (sessions.has(sid)) {
    socket.join(sid);
    logger.info(`[${sid}] Socket connected`);
  } else {
    socket.disconnect(true);
  }
});

const createOnLogout = (id) => () => {
  logger.info(`Session ${id} logged out`);
  fs.rmSync(path.join(SESSIONS_DIR, id), { recursive: true, force: true });
  fs.rmSync(path.join(MEDIA_DIR, id), { recursive: true, force: true });
  sessions.delete(id);
};

app.post('/session/create', (req, res) => {
  const id = uuidv4();
  const session = { id, sock: null, isAuthenticated: false, latestQR: null, io: io.to(id) };
  sessions.set(id, session);
  createWhatsappSession(session, createOnLogout(id));
  res.json({ sessionId: id });
});

app.get('/status', authMiddleware, (req, res) => {
  res.json({ connected: req.session.isAuthenticated, qr: req.session.latestQR });
});

app.post('/session/logout', authMiddleware, async (req, res) => {
  try { await req.session.sock?.logout(); } catch {}
  res.json({ success: true });
});

app.get('/session/export', authMiddleware, (req, res) => {
  const dir = path.join(SESSIONS_DIR, req.session.id);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Not found' });
  res.attachment(`session-${req.session.id}.zip`);
  archiver('zip', { zlib: { level: 9 } }).directory(dir, false).pipe(res).finalize();
});

app.post('/session/import', authMiddleware, upload.single('sessionFile'), async (req, res) => {
  const { session, file } = req;
  if (!file) return res.status(400).json({ error: 'No file' });

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
    res.json(getChats.all({ session_id: req.session.id }));
  } catch (e) {
    logger.error(`/chats failed`, e);
    res.status(500).json({ error: 'Fetch failed' });
  }
});

const sendPlaceholder = (res) => {
  const img = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': img.length });
  res.end(img);
};

app.get('/avatar/:jid', authMiddleware, async (req, res) => {
  try {
    const url = await req.session.sock.profilePictureUrl(req.params.jid, 'preview');
    https.get(url, r => {
      if (r.statusCode >= 400) return sendPlaceholder(res);
      res.writeHead(r.statusCode, {
        'Content-Type': r.headers['content-type'],
        'Cache-Control': 'public, max-age=86400'
      });
      r.pipe(res);
    }).on('error', () => sendPlaceholder(res));
  } catch {
    sendPlaceholder(res);
  }
});

const serveMedia = (res, session, fileName) => {
  const filePath = path.resolve(path.join(MEDIA_DIR, session.id, fileName));
  if (!filePath.startsWith(path.resolve(path.join(MEDIA_DIR, session.id)))) {
    logger.warn(`[${session.id}] Forbidden attempt to access media path: ${filePath}`);
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (fs.existsSync(filePath)) {
    logger.info(`[${session.id}] Serving media file: ${filePath}`);
    res.sendFile(filePath);
  } else {
    logger.error(`[${session.id}] Media file not found: ${filePath}`);
    res.status(404).json({ error: 'Not found' });
  }
};

app.get('/media/:fileName', authMiddleware, (req, res) => {
  serveMedia(res, req.session, req.params.fileName);
});

app.get('/media/:sessionId/:fileName', authMiddleware, (req, res) => {
  if (req.session.id !== req.params.sessionId)
    return res.status(403).json({ error: 'Forbidden' });
  serveMedia(res, req.session, req.params.fileName);
});

app.get('/history/:jid', authMiddleware, (req, res) => {
  const jid = normalizeJid(decodeURIComponent(req.params.jid));
  if (!jid) return res.status(400).json({ error: 'Invalid JID' });
  resetChatUnreadCount.run({ session_id: req.session.id, jid });

  try {
    const rows = getMessagesByJid.all({ session_id: req.session.id, jid, limit: req.query.limit || 200 });
    const messages = rows.map(m => ({ ...m, reactions: m.reactions ? JSON.parse(m.reactions) : {} })).reverse();
    res.json(messages);
  } catch (e) {
    logger.error(`/history failed`, e);
    res.status(500).json({ error: 'Fetch failed' });
  }
});

app.post('/history/sync/:jid', authMiddleware, async (req, res) => {
  try {
    const count = await req.session.fetchMoreMessages(req.params.jid);
    res.json({ success: true, message: `Fetched ${count} messages.` });
  } catch (e) {
    logger.error(`/history/sync failed`, e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/send',
  authMiddleware,
  body('jid').isString(), body('text').isString(), body('tempId').isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const { jid, text, tempId } = req.body;
      const fullJid = normalizeJid(jid);
      const msg = await req.session.sock.sendMessage(fullJid, { text });
      res.json({ success: true, messageId: msg.key.id, tempId, timestamp: Date.now() });
    } catch (e) {
      res.status(500).json({ error: e.message, tempId: req.body.tempId });
    }
  });

app.post('/send/media',
  authMiddleware,
  upload.single('file'),
  body('jid').isString(),
  body('tempId').isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { session, file } = req;
    const { jid, caption, tempId } = req.body;
    const type = file.mimetype.startsWith('image/') ? 'image' :
                 file.mimetype.startsWith('video/') ? 'video' : 'document';

    const content = { [type]: file.buffer, mimetype: file.mimetype };
    if (type === 'image' || type === 'video') content.caption = caption;
    if (type === 'document') content.fileName = file.originalname;

    try {
      const sent = await session.sock.sendMessage(normalizeJid(jid), content);
      res.json({ success: true, messageId: sent.key.id, tempId });
    } catch (e) {
      res.status(500).json({ error: e.message, tempId: req.body.tempId });
    }
  });

app.post('/send/reaction',
  authMiddleware,
  body('jid').isString(), body('messageId').isString(),
  body('fromMe').isBoolean(), body('emoji').isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { jid, messageId, fromMe, emoji } = req.body;
      const key = { remoteJid: normalizeJid(jid), id: messageId, fromMe };
      await req.session.sock.sendMessage(key.remoteJid, { react: { text: emoji, key } });
      res.json({ success: true });
    } catch (e) {
      logger.error(`/send/reaction failed`, e);
      res.status(500).json({ error: e.message });
    }
  });

function restoreSessions() {
  try {
    const ids = fs.readdirSync(SESSIONS_DIR).filter(d => fs.statSync(path.join(SESSIONS_DIR, d)).isDirectory());
    ids.forEach(id => {
      const session = { id, sock: null, isAuthenticated: false, latestQR: null, io: io.to(id) };
      sessions.set(id, session);
      createWhatsappSession(session, createOnLogout(id));
    });
  } catch (e) {
    if (e.code !== 'ENOENT') logger.error('Restore failed', e);
  }
}

/**
 * Periodically cleans up old messages and orphaned media files.
 */
async function autoCleanup() {
  if (CLEANUP_DAYS <= 0) {
    logger.info('Auto cleanup is disabled as CLEANUP_DAYS is set to 0 or less.');
    return;
  }

  logger.info(`Starting auto cleanup for messages and media older than ${CLEANUP_DAYS} days.`);
  const cutoffTimestamp = Date.now() - (CLEANUP_DAYS * 24 * 60 * 60 * 1000);

  try {
    const mediaToPotentiallyDelete = getOldMediaForCleanup.all({ cutoffTimestamp });
    logger.info(`Found ${mediaToPotentiallyDelete.length} media files from old messages to evaluate.`);

    const cleanupDb = db.transaction(() => {
      const reactionResult = deleteOldReactions.run({ cutoffTimestamp });
      const messageResult = deleteOldMessages.run({ cutoffTimestamp });
      if (messageResult.changes > 0 || reactionResult.changes > 0) {
        logger.info(`Deleted ${messageResult.changes} old messages and ${reactionResult.changes} associated reactions.`);
      }
      return messageResult.changes;
    });
    const deletedMessagesCount = cleanupDb();

    if (deletedMessagesCount === 0 && mediaToPotentiallyDelete.length === 0) {
        logger.info('Auto cleanup finished. No old items to process.');
        return;
    }

    let deletedFilesCount = 0;
    const checkedShas = new Set();
    for (const media of mediaToPotentiallyDelete) {
      if (!media.media_sha256 || checkedShas.has(media.media_sha256)) continue;

      const { count } = countMessagesBySha256.get({ media_sha256: media.media_sha256 });
      checkedShas.add(media.media_sha256);

      if (count === 0) {
        const fileName = path.basename(media.media_url);
        const filePath = path.join(MEDIA_DIR, media.session_id, fileName);
        try {
          if (fs.existsSync(filePath)) {
            fs.rmSync(filePath);
            deletedFilesCount++;
            logger.info(`[${media.session_id}] Deleted orphaned media file: ${filePath}`);
          }
        } catch (e) {
          logger.error(`[${media.session_id}] Failed to delete media file ${filePath}`, e);
        }
      }
    }

    logger.info(`Auto cleanup finished. Deleted ${deletedFilesCount} orphaned media files.`);
  } catch (e) {
    logger.error('Auto cleanup process failed', e);
  }
}

const listener = server.listen(PORT, () => {
  logger.info(`Listening on ${PORT}`);
  restoreSessions();
  
  logger.info(`Auto cleanup scheduled to run every 12 hours.`);
  setTimeout(autoCleanup, 30 * 1000);
  setInterval(autoCleanup, 96 * 60 * 60 * 1000);
});

const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Closing...`);
  listener.close(() => {
    sessions.forEach(s => s.sock?.end(new Error('Shutting down')));
    db.close(() => process.exit(0));
  });
};

['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => gracefulShutdown(sig)));

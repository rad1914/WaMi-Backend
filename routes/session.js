// @path: routes/session.js
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import multer from 'multer';
import unzipper from 'unzipper';

import { sessions, createOnLogout } from '../app.js';
import { createWhatsappSession } from '../whatsapp-service.js';
import { logger } from '../logger.js';
import auth from '../middleware/auth.js';

const router = express.Router();
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/zip') {
      return cb(new Error('Only .zip files are allowed for session import.'));
    }
    cb(null, true);
  }
});

router.post('/create', (req, res) => {
  const id = uuidv4();
  const session = { id, sock: null, isAuthenticated: false, latestQR: null, io: req.app.get('io').to(id) };
  sessions.set(id, session);
  createWhatsappSession(session, createOnLogout(id));
  res.json({ sessionId: id });
});

// FIX: Removed 'auth' middleware and added manual token check
router.get('/status', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const session = sessions.get(token);

  if (!token || !session) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing session token.' });
  }

  res.json({ connected: session.isAuthenticated, qr: session.latestQR });
});

router.post('/logout', auth, async (req, res) => {
  try {
    await req.session.sock?.logout();
    createOnLogout(req.session.id)(); // Perform cleanup
    res.json({ success: true, message: "Session logged out and files removed." });
  } catch (e) {
    logger.error(`[${req.session.id}] /logout failed`, e);
    res.status(500).json({ success: false, error: 'Failed to logout session.' });
  }
});

router.get('/export', auth, (req, res) => {
  const dir = path.join(SESSIONS_DIR, req.session.id);
  if (!fs.existsSync(dir)) {
    return res.status(404).json({ error: 'Session directory not found.' });
  }
  res.attachment(`session-${req.session.id}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => res.status(500).send({ error: err.message }));
  archive.pipe(res);
  archive.directory(dir, false);
  archive.finalize();
});

router.post('/import', auth, upload.single('sessionFile'), async (req, res) => {
  const { session, file } = req;
  if (!file) {
    return res.status(400).json({ error: 'No session file provided.' });
  }

  const sessionPath = path.join(SESSIONS_DIR, session.id);
  try {
    await session.sock?.logout(); // Logout current connection first
    fs.rmSync(sessionPath, { recursive: true, force: true });
    fs.mkdirSync(sessionPath);
    
    const directory = await unzipper.Open.buffer(file.buffer);
    await directory.extract({ path: sessionPath, concurrency: 5 });

    createWhatsappSession(session, createOnLogout(session.id));
    res.json({ success: true, message: "Session imported successfully." });
  } catch (e) {
    logger.error(`[${session.id}] /import failed`, e);
    res.status(500).json({ error: e.message });
  }
});

export default router;

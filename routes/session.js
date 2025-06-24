// @path: routes/session.js
import express from 'express';
import { v4 as uuidv4 } from 'uuid';

import { sessions, createOnLogout } from '../app.js';
import { createWhatsappSession } from '../whatsapp-service.js';
import { logger } from '../logger.js';
import auth from '../middleware/auth.js';

const router = express.Router();
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';

router.post('/create', (req, res) => {
  const id = uuidv4();

  const session = { id, sock: null, isAuthenticated: false, latestQR: null, io: req.app.get('io').to(id) };
  sessions.set(id, session);
  createWhatsappSession(session, createOnLogout(id));
  res.json({ sessionId: id });
});

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

    createOnLogout(req.session.id)(); 
    res.json({ success: true, message: "Session logged out and files removed." });
  } catch (e) {
    logger.error(`[${req.session.id}] /logout failed`, e);
    res.status(500).json({ success: false, error: 'Failed to logout session.' });
  }
});

export default router;

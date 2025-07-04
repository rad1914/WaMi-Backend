import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { sessions, createOnLogout } from '../app.js';
import { createWhatsappSession } from '../whatsapp-service.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.post('/create', (req, res) => {
  const id = uuidv4();
  const session = {
    id,
    sock: null,
    isAuthenticated: false,
    latestQR: null,
    io: req.app.get('io').to(id)
  };
  sessions.set(id, session);
  createWhatsappSession(session, createOnLogout(id));
  res.json({ sessionId: id });
});

router.get('/status', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const session = sessions.get(token);
  if (!token || !session) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ connected: session.isAuthenticated, qr: session.latestQR });
});

router.post('/logout', auth, async (req, res) => {
  try {
    await req.session.sock?.logout();
    createOnLogout(req.session.id)();
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

export default router;

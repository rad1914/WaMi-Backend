// @path: chats/chats.routes.js
import { Router } from 'express';
import { extractSock } from '../utils/session.js';
import * as ctrl from './chats.controller.js';

const router = Router();

router.use((req, res, next) => {
  try {
    req.sock = extractSock(req);
    next();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/', ctrl.getAllChats);
router.get('/:jid', ctrl.getChatByJid);

export default router;

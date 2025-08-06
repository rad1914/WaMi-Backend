// @path: message/message.routes.js
import { Router } from 'express';
import { extractSock } from '../utils/session.js';
import { controllers } from './message.controller.js';

const router = Router();

router.use((req, res, next) => {
  try {
    req.sock = extractSock(req);
    next();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

Object.keys(controllers).forEach(action =>
  router.post(`/${action}`, controllers[action])
);

export default router;

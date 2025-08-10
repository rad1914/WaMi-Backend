// @path: middlewares/attachSession.js
import { getSession } from '../client/session.manager.js';

export function attachSession(req, res, next) {
  const id = req.headers['x-session-id'] || req.body?.sessionId || req.query?.sessionId;
  if (!id) return res.status(400).json({ error: 'sessionId is required' });

  try {
    req.sock = getSession(id);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid sessionId' });
  }
}

// @path: middlewares/checkSession.js
import { getSession } from '../client/session.manager.js';

export function checkSession(req, res, next) {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  try {

    req.sock = getSession(sessionId);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid sessionId' });
  }
}

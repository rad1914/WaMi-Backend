// @path: middlewares/attachSession.js
import { extractSock } from '../utils/session.js';

export function attachSession(req, res, next) {
  try {
    req.sock = extractSock(req);
    next();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

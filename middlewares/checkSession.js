// @path: middlewares/checkSession.js
import { getValidatedSessionId, safeGetSession } from '../utils/sessionUtil.js';

export function checkSession(req, res, next) {
  let sessionId;
  try {
    sessionId = getValidatedSessionId(req);
    req.sock = safeGetSession(sessionId);
    return next();
  } catch (err) {
    const status = err.message === 'sessionId is required' ? 400 : 401;
    return res.status(status).json({ error: err.message });
  }
}

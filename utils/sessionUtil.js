// @path: utils/sessionUtil.js
import { requireSessionId } from './errorGuards.js';
import { getSession as _getSession } from '../client/session.manager.js';

export function getValidatedSessionId(req) {

  const sessionId =
    req.headers['x-session-id'] ||
    req.body?.sessionId ||
    req.query?.sessionId;
  return requireSessionId(sessionId);
}

export function safeGetSession(sessionId) {
  try {
    return _getSession(sessionId);
  } catch {
    throw new Error('Invalid sessionId');
  }
}

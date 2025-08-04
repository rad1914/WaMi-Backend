// @path: utils/session.js (merged)
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { getSession as _getSession } from '../client/session.manager.js';
import { requireSessionId } from './errorGuards.js';

export function extractSock(req) {
  const sessionId =
    req.headers['x-session-id'] ||
    req.body?.sessionId ||
    req.query?.sessionId;

  if (!sessionId) {
    const err = new Error('sessionId is required');
    err.status = 400;
    throw err;
  }

  try {
    return _getSession(sessionId);
  } catch {
    const err = new Error('Invalid sessionId');
    err.status = 401;
    throw err;
  }
}

export const initAuthState = async (sessionPath) => {
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  return { state, saveCreds };
};

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

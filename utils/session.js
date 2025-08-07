// @path: utils/session.js

import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { getSession } from '../client/session.manager.js';
import { SESSION_BASE_DIR } from '../config/config.js';

export function extractSock(req) {
  const id =
    req.headers['x-session-id'] ||
    req.body?.sessionId ||
    req.query?.sessionId;

  if (!id) {
    const err = new Error('sessionId is required');
    err.status = 400;
    throw err;
  }

  try {
    return getSession(id);
  } catch {
    const err = new Error('Invalid sessionId');
    err.status = 401;
    throw err;
  }
}

export async function initAuthState(subDir = 'auth') {
  const dir = path.resolve(SESSION_BASE_DIR, subDir);
  return useMultiFileAuthState(dir);
}

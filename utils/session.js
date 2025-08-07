// @path: utils/session.js

import path from 'path';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { getSession } from '../client/session.manager.js';
import { SESSION_BASE_DIR } from '../config/config.js';

export function extractSock(req) {
  const id = req.headers['x-session-id'] || req.body?.sessionId || req.query?.sessionId;
  if (!id) throw Object.assign(new Error('sessionId is required'), { status: 400 });

  try {
    return getSession(id);
  } catch {
    throw Object.assign(new Error('Invalid sessionId'), { status: 401 });
  }
}

export const initAuthState = (subDir = 'auth') =>
  useMultiFileAuthState(path.resolve(SESSION_BASE_DIR, subDir));

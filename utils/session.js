import path from 'path';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { SESSION_BASE_DIR } from '../config/config.js';

export const initAuthState = (subDir = 'auth') =>
  useMultiFileAuthState(path.resolve(SESSION_BASE_DIR, subDir));

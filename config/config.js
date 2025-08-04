// @path: config/config.js
import path from 'path';

export const SESSION_BASE_DIR = path.resolve('.sessions');
export const STORE_FILE        = path.join(SESSION_BASE_DIR, 'store.json');

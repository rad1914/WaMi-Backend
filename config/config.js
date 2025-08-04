// @path: config/config.js
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const SESSION_BASE_DIR = path.join(ROOT_DIR, '.sessions');
export const STORE_FILE        = path.join(SESSION_BASE_DIR, 'store.json');

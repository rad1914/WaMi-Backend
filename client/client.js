// @path: client/client.js

import fs from 'fs';
import path from 'path';
import { initSession } from './session.manager.js';
import { SESSION_BASE_DIR } from '../config/config.js';
import { deleteEmptyDirs } from '../utils/helpers.js'; 

export async function initClient() {

  fs.mkdirSync(SESSION_BASE_DIR, { recursive: true });

  deleteEmptyDirs(SESSION_BASE_DIR);

  try {
    for (const d of fs.readdirSync(SESSION_BASE_DIR, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name === 'auth') continue;
      const sessionPath = path.join(SESSION_BASE_DIR, d.name);
      deleteEmptyDirs(sessionPath);
      if (!fs.existsSync(sessionPath)) continue;
      try {
        await initSession(d.name);
      } catch {
        deleteEmptyDirs(sessionPath);
      }
    }
  } catch {}
}

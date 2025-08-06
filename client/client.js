// @path: client/client.js
import fs from 'fs';
import path from 'path';
import { initSession } from './session.manager.js';
import { SESSION_BASE_DIR } from '../config/config.js';

const deleteEmptyDirs = dir => {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      deleteEmptyDirs(path.join(dir, entry.name));
    }
  }

  const remaining = fs.readdirSync(dir);
  if (
    remaining.length === 0 ||
    (remaining.length === 1 && remaining[0] === 'creds.json')
  ) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};


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

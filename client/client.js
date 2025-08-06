// @path: client/client.js
import fs from 'fs'
import path from 'path'
import logger from '../utils/logger.js'
import { initSession } from './session.manager.js'
import { SESSION_BASE_DIR } from '../config/config.js'

const deleteEmptyDirs = dir => {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    if (fs.statSync(fullPath).isDirectory()) deleteEmptyDirs(fullPath)
  }
  const files = fs.readdirSync(dir)
  if (!files.length || (files.length === 1 && files[0] === 'creds.json'))
    fs.rmSync(dir, { recursive: true, force: true })
}

export async function initClient() {
  fs.mkdirSync(SESSION_BASE_DIR, { recursive: true })
  deleteEmptyDirs(SESSION_BASE_DIR)
  try {
    for (const d of fs.readdirSync(SESSION_BASE_DIR, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name === 'auth') continue
      const sessionPath = path.join(SESSION_BASE_DIR, d.name)
      deleteEmptyDirs(sessionPath)
      if (!fs.existsSync(sessionPath)) continue
      try {
        await initSession(d.name)
      } catch (err) {
        logger.warn(`⚠️ Falló restaurar sesión '${d.name}': ${err.message}`)
        deleteEmptyDirs(sessionPath)
      }
    }
  } catch (err) {
    logger.error(`❌ Error al escanear sesiones: ${err.message}`)
  }
}

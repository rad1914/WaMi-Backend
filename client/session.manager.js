// @path: client/session.manager.js
import path from 'path'
import fs from 'fs'
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys'
import { registerSocketEvents } from '../utils/helpers.js'
import { initAuthState } from '../utils/sessionInit.js'

const sessions = new Map()

export const getSession = id => {
  const s = sessions.get(id)
  if (!s) {
    throw new Error(`Session '${id}' not found`)
  }
  return s
}

export const initSession = async id => {
  if (sessions.has(id)) {
    return sessions.get(id)
  }

  try {
    const { state, saveCreds } = await initAuthState(path.resolve('.sessions', id))
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.macOS('MultiBaileys')
    })

    await new Promise(resolve => setTimeout(resolve, 1500))
    registerSocketEvents(sock, id, saveCreds, initSession)

    sessions.set(id, sock)
    return sock
  } catch (err) {
    console.error(`❌ Error initializing session '${id}':`, err)
    throw new Error(`Failed to initialize session: ${err.message}`)
  }
}

export const deleteSession = async id => {
  const s = sessions.get(id)
  if (s?.logout) {
    await s.logout()
  }
  sessions.delete(id)

  const dir = path.resolve('.sessions', id)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }

}

export const getSessions = () => [...sessions.keys()]

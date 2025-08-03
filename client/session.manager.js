// @path: client/session.manager.js
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeInMemoryStore,
  Browsers
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import path from 'path'
import fs from 'fs'

const sessions = new Map()

export const getSession = sessionId => {
  const session = sessions.get(sessionId)
  if (!session) throw new Error(`Session '${sessionId}' not found`)
  return session
}

export const initSession = async sessionId => {
  if (sessions.has(sessionId)) return sessions.get(sessionId)
  const store = makeInMemoryStore({})
  const sessionPath = path.resolve('.sessions', sessionId)
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS('MultiBaileys')
  })
  store.bind(sock.ev)
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) console.log(`[${sessionId}] QR: ${qr}`)
    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      console.warn(`[${sessionId}] Disconnected (${code})`)
      if (code !== DisconnectReason.loggedOut) {
        initSession(sessionId)
      } else {
        sessions.delete(sessionId)
        console.error(`[${sessionId}] Logged out`)
      }
    }
    if (connection === 'open') {
      console.info(`[${sessionId}] Connected`)
    }
  })
  sessions.set(sessionId, sock)
  return sock
}

export const deleteSession = async sessionId => {
  const sock = sessions.get(sessionId)
  if (sock?.logout) await sock.logout()
  sessions.delete(sessionId)
  const dir = path.resolve('sessions', sessionId)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

export const getSessions = () => Array.from(sessions.keys())

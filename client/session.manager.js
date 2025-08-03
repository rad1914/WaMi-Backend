// @path: client/session.manager.js

import path from 'path'
import fs from 'fs'
import { makeWASocket, fetchLatestBaileysVersion, makeInMemoryStore, Browsers } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { registerSocketEvents } from '../utils/helpers.js'
import { initAuthState } from '../utils/sessionInit.js'

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
  const { state, saveCreds } = await initAuthState(sessionPath)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS('MultiBaileys')
  })

  store.bind(sock.ev)

  registerSocketEvents(sock, sessionId, saveCreds, initSession)

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

// @path: auth/auth.service.js
import { initSession, deleteSession, getSession } from '../client/session.manager.js'
import { randomUUID } from 'crypto'

let pairingCode = null

export const createSession = async () => {
  const sessionId = randomUUID()
  await initSession(sessionId)
  return { sessionId }
}

export const removeSession = async ({ sessionId }) => {
  if (!sessionId) throw new Error('sessionId is required')
  await deleteSession(sessionId)
  return { success: true }
}

export const getQRCode = async ({ sessionId }) => {
  if (!sessionId) throw new Error('sessionId is required')
  const client = await initSession(sessionId)

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('QR timeout')), 20000)
    const handler = update => {
      if (update.qr) {
        clearTimeout(timeout)
        client.ev.off('connection.update', handler)
        resolve({ qr: update.qr })
      } else if (update.connection === 'open') {
        clearTimeout(timeout)
        client.ev.off('connection.update', handler)
        resolve({ success: true })
      }
    }
    client.ev.on('connection.update', handler)
  })
}

export const checkAuth = async ({ sessionId }) => {
  if (!sessionId) throw new Error('sessionId is required')
  const client = getSession(sessionId)
  return { authenticated: !!client?.user?.id }
}

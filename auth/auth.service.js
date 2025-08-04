// @path: auth/auth.service.js

import { initSession, deleteSession, getSession } from '../client/session.manager.js'
import { randomUUID } from 'crypto'
import { getPendingQR } from '../utils/helpers.js'

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

  if (client?.user?.id) {
    return { success: true }
  }

  const cached = getPendingQR(sessionId)
  if (cached) {
    return { qr: cached }
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('QR timeout')), 20_000)

    const handler = update => {
      if (update.qr || update.connection === 'open') {
        clearTimeout(timeout)
        client.ev.off('connection.update', handler)
        resolve(update.qr ? { qr: update.qr } : { success: true })
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

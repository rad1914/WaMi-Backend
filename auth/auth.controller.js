import { initSession, deleteSession } from '../client/session.manager.js'
import { randomUUID } from 'crypto'

const respond = (res, fn) =>
  fn().then(data => res.json(data)).catch(err => res.status(500).json({ error: err.message }))

export const createSession = (req, res) => respond(res, async () => {
  const sessionId = randomUUID()
  await initSession(sessionId)
  return { sessionId }
})

export const removeSession = (req, res) => respond(res, async () => {
  const { sessionId } = req.body
  if (!sessionId) throw new Error('sessionId is required')
  await deleteSession(sessionId)
  return { success: true }
})

export const getQRCode = (req, res) => respond(res, async () => {
  const { sessionId } = req.query
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
})

export const checkAuth = (req, res) => respond(res, async () => {
  const { sessionId } = req.query
  if (!sessionId) throw new Error('sessionId is required')
  const client = await import('../client/session.manager.js').then(m => m.getSession(sessionId))
  return { authenticated: !!client?.user?.id }
})

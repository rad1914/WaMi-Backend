// @path: auth/auth.service.js
import { initClient, getClient } from '../client/client.js'

let qrCode = null
let pairingCode = null
let isLoggedIn = false

export const getQRCode = async () => {
  const client = await ensureClient()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('QR timeout')), 20000)
    client.ev.once('connection.update', (u) => {
      clearTimeout(timeout)
      if (u.qr) resolve(qrCode = u.qr)
      else if (u.connection === 'open') resolve(isLoggedIn = true)
    })
  })
}

export const getPairingCode = async () => {
  const client = await ensureClient()
  return client.requestPairingCode().then(c => pairingCode = c)
}

export const getAuthStatus = () => {
  const client = getClient()
  return !!(client?.user?.id || isLoggedIn)
}

export const logoutSession = async () => {
  const client = getClient()
  if (client?.logout) {
    await client.logout()
    isLoggedIn = false
  }
}

const ensureClient = async () => {
  let client = getClient()
  if (!client?.ws) await initClient()
  return getClient()
}

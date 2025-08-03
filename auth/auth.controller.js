// @path: auth/auth.controller.js
import { getQRCode, getPairingCode, getAuthStatus, logoutSession } from './auth.service.js'

const respond = (res, fn) =>
  fn().then(data => res.json(data)).catch(err => res.status(500).json({ error: err.message }))

export const qrLogin = (req, res) => respond(res, async () => ({ qr: await getQRCode() }))
export const pairingLogin = (req, res) => respond(res, async () => ({ pairingCode: await getPairingCode() }))
export const checkAuth = (req, res) => respond(res, async () => ({ authenticated: await getAuthStatus() }))
export const logout = (req, res) => respond(res, async () => (await logoutSession(), { success: true }))

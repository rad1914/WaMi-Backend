// @path: auth/auth.controller.js
import {
  getQRCode,
  getPairingCode,
  getAuthStatus,
  logoutSession
} from './auth.service.js'

export const qrLogin = async (req, res) => {
  try {
    const qr = await getQRCode()
    res.status(200).json({ qr })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const pairingLogin = async (req, res) => {
  try {
    const code = await getPairingCode()
    res.status(200).json({ pairingCode: code })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const checkAuth = async (req, res) => {
  try {
    const status = await getAuthStatus()
    res.status(200).json({ authenticated: status })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const logout = async (req, res) => {
  try {
    await logoutSession()
    res.status(200).json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

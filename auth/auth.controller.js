// @path: auth/auth.controller.js
import {
  createSession as svcCreate,
  removeSession as svcRemove,
  getQRCode as svcGetQr,
  checkAuth as svcCheckAuth
} from './auth.service.js'

const respond = fn => async (req, res) => {
  try {
    const data = await fn(req)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const createSession = respond(async req => svcCreate())

export const removeSession = respond(async req => svcRemove(req.body))

export const getQRCode = respond(async req => svcGetQr(req.query))

export const checkAuth = respond(async req => svcCheckAuth(req.query))

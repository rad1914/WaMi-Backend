import { Router } from 'express'
import {
  qrLogin,
  pairingLogin,
  checkAuth,
  logout
} from './auth.controller.js'

const router = Router()

router.get('/qr', qrLogin)
router.post('/pairing', pairingLogin)
router.get('/status', checkAuth)
router.delete('/logout', logout)

export default router

// @path: message/message.routes.js
import { Router } from 'express'
import { checkSession } from '../middlewares/checkSession.js'
import {
  send,
  reply,
  forward,
  react,
  remove,
  edit
} from './message.controller.js'

const router = Router()

router.use(checkSession)

router.post('/send', send)
router.post('/reply', reply)
router.post('/forward', forward)
router.post('/react', react)
router.post('/delete', remove)
router.post('/edit', edit)

export default router

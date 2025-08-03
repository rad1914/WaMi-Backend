// @path: routes.js
import { Router } from 'express'
import auth from './auth/auth.routes.js'
import message from './message/message.routes.js'

export default Router()
  .use('/auth', auth)
  .use('/message', message)

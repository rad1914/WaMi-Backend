// @path: auth/auth.controller.js

import {
  createSession as svcCreate,
  removeSession as svcRemove,
  getQRCode as svcGetQr,
  checkAuth as svcCheckAuth
} from './auth.service.js'
import { wrapController } from '../utils/helpers.js'

export const createSession = wrapController(async () => svcCreate())
export const removeSession = wrapController(async body => svcRemove(body))
export const getQRCode     = wrapController(async query => svcGetQr(query))
export const checkAuth     = wrapController(async query => svcCheckAuth(query))

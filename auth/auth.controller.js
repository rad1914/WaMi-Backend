import * as service from './auth.service.js';
import { wrapController } from '../utils/utils.js';

export const createSession = wrapController(async () => service.createSession());
export const removeSession = wrapController(async body =>
  service.removeSession(body)
);
export const getQRCode = wrapController(async query =>
  service.getQRCode(query)
);
export const checkAuth = wrapController(async query =>
  service.checkAuth(query)
);
export const reload = wrapController(
  async body => {
    const { sessionId } = body;
    if (!sessionId) throw new Error('sessionId is required');
    await service.createSession(sessionId, true);
    return { reloaded: true };
  },
  { input: 'body' }
);

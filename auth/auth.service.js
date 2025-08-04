// @path: auth/auth.service.js
import { initSession, deleteSession, getSession } from '../client/session.manager.js';
import { randomUUID } from 'crypto';
import { getPendingQR } from '../utils/helpers.js';
import { requireSessionId } from '../utils/errorGuards.js';

export async function createSession() {
  const sessionId = randomUUID();
  await initSession(sessionId);
  return { sessionId };
}

export async function removeSession({ sessionId }) {
  requireSessionId(sessionId);
  await deleteSession(sessionId);
  return { success: true };
}

export async function getQRCode({ sessionId }) {
  requireSessionId(sessionId);
  const client = await initSession(sessionId);
  if (client.sock.user?.id) return { success: true };
  const cached = getPendingQR(sessionId);
  if (cached) return { qr: cached };
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('QR timeout')), 20000);
    const handler = update => {
      if (update.qr || update.connection === 'open') {
        clearTimeout(timeout);
        client.sock.ev.off('connection.update', handler);
        resolve(update.qr ? { qr: update.qr } : { success: true });
      }
    };
    client.sock.ev.on('connection.update', handler);
  });
}

export function checkAuth({ sessionId }) {
  requireSessionId(sessionId);
  const client = getSession(sessionId);
  return { authenticated: !!client.user?.id };
}

import { initSession, deleteSession, getSession } from '../client/session.manager.js';
import { getPendingQR } from '../utils/helpers.js';
import { randomUUID } from 'crypto';

export async function createSession() {
  const sessionId = randomUUID();
  await initSession(sessionId);
  return { sessionId };
}

export async function removeSession({ sessionId }) {
  if (!sessionId) throw Object.assign(new Error('sessionId is required'), { status: 400 });
  await deleteSession(sessionId);
  return { success: true };
}

export async function getQRCode({ sessionId }) {
  if (!sessionId) throw Object.assign(new Error('sessionId is required'), { status: 400 });
  const { sock } = await initSession(sessionId);
  if (sock.user?.id) return { success: true };
  const qr = getPendingQR(sessionId);
  if (qr) return { qr };
  throw Object.assign(new Error('QR not yet available'), { status: 404 });
}

export function checkAuth({ sessionId }) {
  if (!sessionId) throw Object.assign(new Error('sessionId is required'), { status: 400 });
  const client = getSession(sessionId);
  return { authenticated: !!client.user?.id };
}

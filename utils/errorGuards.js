// @path: utils/errorGuards.js
export function requireSessionId(sessionId) {
  if (!sessionId) throw new Error('sessionId is required');
  return sessionId;
}

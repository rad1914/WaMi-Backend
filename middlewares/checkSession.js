// @path: middlewares/checkSession.js

export function checkSession(req, res, next) {
  const sessionId = req.headers['x-session-id']

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' })
  }

  try {

    import('../client/session.manager.js').then(({ getSession }) => {
      getSession(sessionId)
      next()
    }).catch(err => {
      return res.status(401).json({ error: 'Invalid sessionId' })
    })
  } catch (err) {
    return res.status(401).json({ error: 'Invalid sessionId' })
  }
}

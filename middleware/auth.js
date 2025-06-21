// @path: middleware/auth.js
import { sessions } from '../app.js';

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const session = sessions.get(token);

  if (!token || !session) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing session token.' });
  }

  if (!session.sock || !session.isAuthenticated) {
    return res.status(401).json({ error: 'Unauthorized: Session is not authenticated.' });
  }

  req.session = session;
  next();
};

export default auth;

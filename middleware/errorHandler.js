// @path: middleware/errorHandler.js
import { logger } from '../logger.js';

const errorHandler = (err, req, res, next) => {
  logger.error('An unexpected error occurred', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });
  
  if (res.headersSent) {
    return next(err);
  }

  const message = process.env.NODE_ENV === 'production' 
    ? 'An internal server error occurred.'
    : err.message;

  res.status(500).json({ success: false, error: message });
};

export default errorHandler;

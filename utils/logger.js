// @path: utils/logger.js
import pino from 'pino';
export default pino({ level: process.env.LOG_LEVEL || 'warn' });

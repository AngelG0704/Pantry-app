import { logger } from '../logger.js';

export function errorHandler(err, req, res, next) {
  const status = err.status ?? 500;

  if (status >= 500) {
    (req.log ?? logger).error({ err }, 'request failed');
  }

  if (res.headersSent) {
    return next(err);
  }

  res.status(status).json({
    error: status >= 500 ? 'Something went wrong' : err.message,
  });
}
import { rateLimit }from 'express-rate-limit';
import { config } from '../config.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export function createLimiter({
  windowMs,
  limit,
  message,
  skipSuccessfulRequests = false,
}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    message: { error: message },
  });
}

export const generalLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: config.rateLimits.general,
  message: 'Too many requests. Please slow down and try again later.',
});

export const loginLimiter = createLimiter({
  windowMs: FIFTEEN_MINUTES,
  limit: config.rateLimits.login,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Please try again later.',
});

export const registerLimiter = createLimiter({
  windowMs: ONE_HOUR,
  limit: config.rateLimits.register,
  message: 'Too many accounts created from this address. Please try again later.',
});
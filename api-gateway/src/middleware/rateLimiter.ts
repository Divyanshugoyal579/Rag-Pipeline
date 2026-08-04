import rateLimit from 'express-rate-limit';
import { config } from '../config';
import logger from '../services/logger';

export const globalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} on route ${req.originalUrl}`);
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
    });
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Strict limit for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Auth Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many authentication attempts. Please try again in 15 minutes.',
    });
  },
});

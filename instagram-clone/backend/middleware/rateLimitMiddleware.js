import rateLimit from 'express-rate-limit';

// Strict limiter for login and register — 10 attempts per 15 minutes per IP.
// This is the primary defence against credential-stuffing and brute-force.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many login attempts from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiter for register — slightly looser than login but still tight.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    success: false,
    message: 'Too many accounts created from this IP, please try again after 1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiter for forgot-password (email send) — 5 requests per hour per IP.
// Prevents email-flooding.
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many password reset requests, please try again after 1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiter for reset-password token submission — 10 per hour per IP.
// Slightly more permissive than the email sender so legitimate token use
// isn't blocked by the same counter as the email trigger.
export const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again after 1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Kept for backward-compat — aliases to the forgot-password limiter.
export const passwordResetLimiter = forgotPasswordLimiter;

// Kept for backward-compat with any future auth routes that still import it.
export const authLimiter = loginLimiter;

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: {
    success: false,
    message: 'Too many requests, please slow down',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

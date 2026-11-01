import express from 'express';
import {
  register,
  login,
  logout,
  getMe,
  verifyEmail,
  forgotPassword,
  resetPassword,
} from '../controllers/authController.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';
import { registerValidator, loginValidator, forgotPasswordValidator, resetPasswordValidator } from '../utils/validators.js';
import { loginLimiter, registerLimiter, forgotPasswordLimiter, resetPasswordLimiter } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

router.post('/register', registerLimiter, registerValidator, register);
router.post('/login', loginLimiter, loginValidator, login);
router.post('/logout', optionalAuth, logout);
router.get('/me', protect, getMe);
router.get('/verify-email/:token', verifyEmail);
router.post('/forgotpassword', forgotPasswordLimiter, forgotPasswordValidator, forgotPassword);
router.put('/resetpassword/:token', resetPasswordLimiter, resetPasswordValidator, resetPassword);

export default router;

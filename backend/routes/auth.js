import { Router } from 'express';
import { createInvite, register, login, getMe } from '../controllers/authController.js';
import { verifyInterviewerToken } from '../middleware/auth.js';

const router = Router();

// Admin route (unprotected for now - only you know about it)
router.post('/invite', createInvite);

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/me', verifyInterviewerToken, getMe);

export default router;
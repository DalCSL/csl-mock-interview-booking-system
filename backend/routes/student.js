import { Router } from 'express';
import { requestCode, verifyCode, getMe } from '../controllers/studentController.js';
import { verifyStudentToken } from '../middleware/auth.js';

const router = Router();

// Public routes (no auth needed)
router.post('/request-code', requestCode);
router.post('/verify-coe', verifyCode);

// Protected routes (need vali student token);
router.get('/me', verifyStudentToken, getMe);

export default router;
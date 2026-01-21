import { Router } from 'express';
import { 
  getMySlots, 
  createSlot, 
  deleteSlot, 
  getAvailableSlots,
  getInterviewTypes 
} from '../controllers/slotsController.js';
import { verifyInterviewerToken, verifyStudentToken } from '../middleware/auth.js';

const router = Router();

// Public route
router.get('/types', getInterviewTypes);

// Student route (needs student auth)
router.get('/available', verifyStudentToken, getAvailableSlots);

// Interviewer routes (needs interviewer auth)
router.get('/', verifyInterviewerToken, getMySlots);
router.post('/', verifyInterviewerToken, createSlot);
router.delete('/:id', verifyInterviewerToken, deleteSlot);

export default router;
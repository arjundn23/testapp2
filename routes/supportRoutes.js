import express from 'express';
import { sendSupportEmail } from '../controller/supportController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Route for sending support emails
router.route('/').post(protect, sendSupportEmail);

export default router;

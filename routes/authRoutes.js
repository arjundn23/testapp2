import express from 'express';
import { getAccessToken } from '../controller/authController.js';

const router = express.Router();

router.get('/token', getAccessToken);

export default router;

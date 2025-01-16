import express from 'express';
import {
  uploadFile,
  getRecentFiles,
  getFilesByType,
  getFilesByCategory,
  getFileById,
  updateFile,
  deleteFile,
  shareFile,
  removeAccess,
  fileUploadMiddleware
} from '../controller/fileController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/recent', getRecentFiles);
router.get('/type/:fileType', getFilesByType);
router.get('/category/:categoryName', getFilesByCategory);

// Protected routes
router.route('/upload')
  .post(protect, fileUploadMiddleware, uploadFile);

router.route('/:id')
  .get(protect, getFileById)
  .put(protect, updateFile)
  .delete(protect, deleteFile);

router.post('/:id/share', protect, shareFile);
router.post('/:id/remove-access', protect, removeAccess);

export default router;

import express from 'express';
import {
  uploadFile,
  getRecentFiles,
  getFilesByType,
  getFilesByCategory,
  getFileById,
  getFileUrls,
  updateFile,
  deleteFile,
  shareFile,
  removeAccess,
  generateSharingLink,
  fileUploadMiddleware
} from '../controller/fileController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protected routes - all routes should require authentication
router.use(protect);

// File routes
router.get('/recent', getRecentFiles);
router.get('/type/:fileType', getFilesByType);
router.get('/category/:id', getFilesByCategory);

router.route('/upload')
  .post(fileUploadMiddleware, uploadFile);

// Make sure protect middleware is applied to these routes
router.route('/:id')
  .get(protect, getFileById)  
  .put(updateFile)
  .delete(deleteFile);

router.get('/:id/urls', getFileUrls);
router.post('/:id/share', shareFile);
router.post('/:id/share-link', generateSharingLink);
router.post('/:id/remove-access', removeAccess);

export default router;

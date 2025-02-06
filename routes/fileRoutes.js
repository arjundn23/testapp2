import express from 'express';
import {
  uploadFile,
  getAllFiles,
  getRecentFiles,
  getSharedFiles,
  getDownloadedFiles,
  getFilesByType,
  getFilesByCategory,
  getFileById,
  getFileUrls,
  updateFile,
  deleteFile,
  shareFile,
  removeAccess,
  generateSharingLink,
  fileUploadMiddleware,
  getFavoriteFiles,
  toggleFavorite,
  trackDownload
} from '../controller/fileController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protected routes - all routes should require authentication
router.use(protect);

// File routes
router.get('/all', getAllFiles);
router.get('/recent', getRecentFiles);
router.get('/shared', getSharedFiles);
router.get('/downloaded', getDownloadedFiles);
router.get('/type/:fileType', getFilesByType);
router.get('/category/:id', getFilesByCategory);
router.get('/favourites', getFavoriteFiles);
router.post('/:id/favorite', toggleFavorite);
router.post('/:id/track-download', trackDownload);

router.route('/upload')
  .post(fileUploadMiddleware, uploadFile);

// Make sure protect middleware is applied to these routes
router.route('/:id')
  .get(getFileById)  
  .put(updateFile)
  .delete(deleteFile);

router.get('/:id/urls', getFileUrls);
router.post('/:id/share', shareFile);
router.post('/:id/share-link', generateSharingLink);
router.post('/:id/remove-access', removeAccess);

export default router;

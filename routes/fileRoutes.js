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
  thumbnailUploadMiddleware,
  getFavoriteFiles,
  toggleFavorite,
  getPinnedFiles,
  togglePin,
  trackDownload,
  searchFiles
} from '../controller/fileController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { testStreaming } from '../controller/fileController.js';

// Test route for streaming

const router = express.Router();

// Test streaming route (unprotected for testing)
router.get('/test-stream', testStreaming);

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
router.get('/pinned', getPinnedFiles);
router.post('/:id/pin', togglePin);
router.post('/:id/track-download', trackDownload);
router.get('/search', searchFiles);

router.route('/upload')
  .post(fileUploadMiddleware, uploadFile);

// Make sure protect middleware is applied to these routes
router.route('/:id')
  .get(getFileById)  
  .put(thumbnailUploadMiddleware, updateFile)
  .delete(deleteFile);

router.get('/:id/urls', getFileUrls);
router.post('/:id/share', shareFile);
router.post('/:id/share-link', generateSharingLink);
router.post('/:id/remove-access', removeAccess);

export default router;

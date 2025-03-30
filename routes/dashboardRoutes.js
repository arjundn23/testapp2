import express from 'express';
import {
  getRecentDownloads,
  getActiveUsers,
  getDownloadStats,
  getCategoryStats,
  getTopDownloads,
  getRecentUploads,
  getSpaceUsage,
  trackUserActivity,
} from '../controller/dashboardController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protected routes
router.use(protect);

// Admin only routes
// router.get('/recent-downloads', admin, getRecentDownloads);
// router.get('/active-users', admin, getActiveUsers);
// router.get('/download-stats', admin, getDownloadStats);
// router.get('/category-stats', admin, getCategoryStats);
// router.get('/top-downloads', admin, getTopDownloads);
// router.get('/recent-uploads', admin, getRecentUploads);

router.get('/recent-downloads', protect, getRecentDownloads);
router.get('/active-users', protect, getActiveUsers);
router.get('/download-stats', protect, getDownloadStats);
router.get('/category-stats', protect, getCategoryStats);
router.get('/top-downloads', protect, getTopDownloads);
router.get('/recent-uploads', protect, getRecentUploads);
router.get('/space-usage', protect, getSpaceUsage);
router.post('/track-activity', protect, trackUserActivity);

export default router;

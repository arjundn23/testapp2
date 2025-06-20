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

router.get('/recent-downloads', protect, admin, getRecentDownloads);
router.get('/active-users', protect, admin, getActiveUsers);
router.get('/download-stats', protect, admin, getDownloadStats);
router.get('/category-stats', protect, admin, getCategoryStats);
router.get('/top-downloads', protect, admin, getTopDownloads);
router.get('/recent-uploads', protect, admin, getRecentUploads);
router.get('/space-usage', protect, admin, getSpaceUsage);
router.post('/track-activity', protect, admin, trackUserActivity);

export default router;

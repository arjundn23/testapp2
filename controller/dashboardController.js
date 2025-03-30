import asyncHandler from 'express-async-handler';
import File from '../models/fileModel.js';
import User from '../models/userModel.js';
import UserActivity from '../models/userActivityModel.js';
import mongoose from 'mongoose';
import sharePointService from '../services/sharePointService.js'; // Assuming this service is defined elsewhere

// @desc    Get recent downloads
// @route   GET /api/dashboard/recent-downloads
// @access  Private/Admin
export const getRecentDownloads = asyncHandler(async (req, res) => {
  const recentDownloads = await File.find()
    .sort({ lastDownloadedAt: -1 })
    .limit(5)
    .populate('user', 'name email')
    .populate('categories', 'name');

  res.json(recentDownloads);
});

// @desc    Get active users
// @route   GET /api/dashboard/active-users
// @access  Private/Admin
export const getActiveUsers = asyncHandler(async (req, res) => {
  const activeUsers = await User.find({ isOnline: true })
    .sort({ lastActiveAt: -1 })
    .limit(5)
    .select('username email lastActiveAt');

  res.json(activeUsers);
});

// @desc    Get download statistics
// @route   GET /api/dashboard/download-stats
// @access  Private/Admin
export const getDownloadStats = asyncHandler(async (req, res) => {
  const { period = 'weekly' } = req.query;
  const now = new Date();
  let startDate;

  if (period === 'weekly') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'monthly') {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const downloads = await UserActivity.aggregate([
    {
      $match: {
        activityType: 'download',
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  res.json(downloads);
});

// @desc    Get category-wise downloads
// @route   GET /api/dashboard/category-stats
// @access  Private/Admin
export const getCategoryStats = asyncHandler(async (req, res) => {
  const categoryStats = await File.aggregate([
    {
      $unwind: '$categories'
    },
    {
      $lookup: {
        from: 'categories',
        localField: 'categories',
        foreignField: '_id',
        as: 'categoryInfo'
      }
    },
    {
      $unwind: '$categoryInfo'
    },
    {
      $group: {
        _id: '$categories',
        categoryName: { $first: '$categoryInfo.name' },
        totalDownloads: { $sum: '$downloadCount' }
      }
    },
    {
      $sort: { totalDownloads: -1 }
    }
  ]);

  res.json(categoryStats);
});

// @desc    Get top downloaded files
// @route   GET /api/dashboard/top-downloads
// @access  Private/Admin
export const getTopDownloads = asyncHandler(async (req, res) => {
  const topFiles = await File.find()
    .sort({ downloadCount: -1 })
    .limit(10)
    .populate('user', 'username')
    .populate('categories', 'name')
    .select('name downloadCount categories');

  res.json(topFiles);
});

// @desc    Get recently uploaded files
// @route   GET /api/dashboard/recent-uploads
// @access  Private/Admin
export const getRecentUploads = asyncHandler(async (req, res) => {
  const recentUploads = await File.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('user', 'username')
    .populate('categories', 'name')
    .select('name user categories createdAt');

  res.json(recentUploads);
});

// @desc    Get SharePoint space usage
// @route   GET /api/dashboard/space-usage
// @access  Private/Admin
export const getSpaceUsage = asyncHandler(async (req, res) => {
  try {
    const spaceUsed = await sharePointService.getSpaceUsage();
    res.json({
      used: spaceUsed.used,
      remaining: spaceUsed.remaining,
      total: spaceUsed.total,
      deleted: spaceUsed.deleted,
      state: spaceUsed.state,
      percentage: spaceUsed.percentage
    });
  } catch (error) {
    console.error('Error in getSpaceUsage:', error);
    res.status(500).json({ message: 'Failed to get space usage' });
  }
});

// @desc    Update user activity
// @route   POST /api/dashboard/track-activity
// @access  Private
export const trackUserActivity = asyncHandler(async (req, res) => {
  const { activityType, fileId } = req.body;

  // Update user's last active time
  await User.findByIdAndUpdate(req.user._id, {
    lastActiveAt: new Date(),
    isOnline: true
  });

  // Create activity record
  if (activityType) {
    await UserActivity.create({
      user: req.user._id,
      activityType,
      fileId,
      timestamp: new Date()
    });
  }

  res.status(200).json({ message: 'Activity tracked' });
});

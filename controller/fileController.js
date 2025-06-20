import express from 'express';
import multer from 'multer';
import sharePointService from '../services/sharePointService.js';
import redisService from '../services/redisService.js';
import msalService from '../services/msalService.js';
import File from '../models/fileModel.js';
import Category from '../models/categoryModel.js';
import mongoose from 'mongoose'; 
import User from '../models/userModel.js'; 
import emailService from '../services/emailService.js'; 
import crypto from 'crypto'; 
import UserActivity from '../models/userActivityModel.js';

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 2048 * 1024 * 1024 // 2GB limit
  }
});

// Middleware for file upload
export const fileUploadMiddleware = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

// Upload file
export const uploadFile = async (req, res) => {
  try {
    const mainFile = req.files['file']?.[0];
    const thumbnail = req.files['thumbnail']?.[0];

    if (!mainFile) {
      return res.status(400).json({ message: 'No file provided' });
    }

    // Generate unique filenames
    const timestamp = Date.now();
    const mainFileExt = mainFile.originalname.split('.').pop();
    const uniqueMainFileName = `m${timestamp}_${mainFile.originalname.replace(/\s+/g, '_')}`;
    
    let uniqueThumbnailName = null;
    if (thumbnail) {
      const thumbnailExt = thumbnail.originalname.split('.').pop();
      uniqueThumbnailName = `t${timestamp}_thumbnail.${thumbnailExt}`;
    }

    // Simple response headers
    res.setHeader('Content-Type', 'application/json');

    // Get site and drive information
    const { siteId, driveId } = await sharePointService.getSiteAndDriveInfo();

    // Upload main file with progress updates
    console.log('Uploading main file to SharePoint...');
    const fileResponse = await sharePointService.uploadFile(
      siteId,
      driveId,
      { ...mainFile, originalname: uniqueMainFileName }
    );
    console.log('Main file upload complete');

    let thumbnailResponse = null;
    if (thumbnail) {
      // Upload thumbnail if provided
      thumbnailResponse = await sharePointService.uploadFile(
        siteId,
        driveId,
        { ...thumbnail, originalname: uniqueThumbnailName }
      );
    }

    // Parse file metadata
    let fileTypes = [];
    let categories = [];
    try {
      fileTypes = JSON.parse(req.body.fileTypes || '[]');
      categories = JSON.parse(req.body.categories || '[]');
    } catch (error) {
      console.error('Error parsing file metadata:', error);
    }

    const fileData = {
      name: req.body.name || mainFile.originalname,
      originalName: mainFile.originalname,
      description: req.body.description || '',
      fileTypes: fileTypes,
      categories: categories,
      sharePointFileId: fileResponse.id,
      sharePointThumbnailId: thumbnailResponse?.id || null,
      mimeType: mainFile.mimetype,
      size: mainFile.size,
      uploadedBy: req.body.userId,
      user: req.user._id
    };

    const fileRecord = await File.create(fileData);

    // Get fresh URLs for the response
    const urls = await sharePointService.getFileUrls(fileResponse.id, thumbnailResponse?.id);

    // Send success response
    res.json({ 
      message: 'File uploaded successfully',
      fileId: fileResponse.id,
      fileName: fileResponse.name,
      thumbnailId: thumbnailResponse?.id,
      record: {
        ...fileRecord.toObject(),
        publicDownloadUrl: urls.fileUrl,
        publicThumbnailDownloadUrl: urls.thumbnailUrl
      }
    });
  } catch (error) {
    console.error('Error in file upload:', error);
    // Log detailed error for debugging
    if (error.response) {
      console.error('SharePoint response:', error.response);
    }
    
    res.status(500).json({ 
      error: true,
      message: error.message || 'Failed to upload file. Please try again.'
    });
  }
};

// Get all files
export const getAllFiles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build query based on user role
    let query = {};
    if (!req.user.isAdmin) {
      // Get the current user with their allowed categories
      const currentUser = await User.findById(req.user._id).lean();
      
      if (currentUser.allowedCategories && currentUser.allowedCategories.length > 0) {
        // User can see files that are either:
        // 1. Shared with them directly
        // 2. Belong to one of their allowed categories
        query = {
          $or: [
            { sharedWith: req.user._id },
            { categories: { $in: currentUser.allowedCategories } }
          ]
        };
      } else {
        // If user has no allowed categories, they can only see files shared with them
        query = {
          sharedWith: req.user._id
        };
      }
    }

    // Get total count for pagination
    const totalFiles = await File.countDocuments(query);
    const totalPages = Math.ceil(totalFiles / limit);

    // Get paginated files
    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('categories', 'name')
      .populate('user', 'username email')
      .populate('sharedWith', 'username email')
      .lean();

    // Get URLs for all files in parallel
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        try {
          const urls = await sharePointService.getFileUrls(
            file.sharePointFileId,
            file.sharePointThumbnailId
          );
          return {
            ...file,
            publicDownloadUrl: urls.fileUrl,
            publicThumbnailDownloadUrl: urls.thumbnailUrl
          };
        } catch (error) {
          console.error(`Error getting URLs for file ${file._id}:`, error);
          return {
            ...file,
            publicDownloadUrl: '',
            publicThumbnailDownloadUrl: ''
          };
        }
      })
    );

    res.json({
      files: filesWithUrls,
      currentPage: page,
      totalPages,
      totalFiles
    });
  } catch (error) {
    console.error('Error getting all files:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get recent files
export const getRecentFiles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build query based on user role
    let query = {};
    if (!req.user.isAdmin) {
      // Get the current user with their allowed categories
      const currentUser = await User.findById(req.user._id).lean();
      
      if (currentUser.allowedCategories && currentUser.allowedCategories.length > 0) {
        // User can see files that are either:
        // 1. Shared with them directly
        // 2. Belong to one of their allowed categories
        query = {
          $or: [
            { sharedWith: req.user._id },
            { categories: { $in: currentUser.allowedCategories } }
          ]
        };
      } else {
        // If user has no allowed categories, they can only see files shared with them
        query = {
          sharedWith: req.user._id
        };
      }
    }

    // Get total count for pagination
    const totalFiles = await File.countDocuments(query);
    const totalPages = Math.ceil(totalFiles / limit);

    // Get paginated files
    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('categories', 'name')
      .populate('user', 'username email')
      .populate('sharedWith', 'username email')
      .lean();

    // Get URLs for all files in parallel
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        try {
          const urls = await sharePointService.getFileUrls(
            file.sharePointFileId,
            file.sharePointThumbnailId
          );
          return {
            ...file,
            publicDownloadUrl: urls.fileUrl,
            publicThumbnailDownloadUrl: urls.thumbnailUrl
          };
        } catch (error) {
          console.error(`Error getting URLs for file ${file._id}:`, error);
          return {
            ...file,
            publicDownloadUrl: '',
            publicThumbnailDownloadUrl: ''
          };
        }
      })
    );

    res.json({
      files: filesWithUrls,
      currentPage: page,
      totalPages,
      totalFiles
    });
  } catch (error) {
    console.error('Error getting recent files:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get shared files
export const getSharedFiles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build query based on sharedWith
    let query = {
      sharedWith: req.user._id,
      // user: { $ne: req.user._id } // Exclude files owned by the user
    };

    // Get total count for pagination
    const totalFiles = await File.countDocuments(query);
    const totalPages = Math.ceil(totalFiles / limit);

    // Get paginated files
    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('categories', 'name')
      .populate('user', 'username email')
      .populate('sharedWith', 'username email')
      .lean();

    // Get URLs for all files in parallel
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        try {
          const urls = await sharePointService.getFileUrls(
            file.sharePointFileId,
            file.sharePointThumbnailId
          );
          return {
            ...file,
            publicDownloadUrl: urls.fileUrl,
            publicThumbnailDownloadUrl: urls.thumbnailUrl
          };
        } catch (error) {
          console.error(`Error getting URLs for file ${file._id}:`, error);
          return {
            ...file,
            publicDownloadUrl: '',
            publicThumbnailDownloadUrl: ''
          };
        }
      })
    );

    res.json({
      files: filesWithUrls,
      currentPage: page,
      totalPages,
      totalFiles
    });
  } catch (error) {
    console.error('Error getting shared files:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get downloaded files
export const getDownloadedFiles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build query based on downloads
    let query = {
      downloads: req.query.userId,
    };
    
    // Add category permission filtering for non-admin users
    if (!req.user.isAdmin) {
      // Get the current user with their allowed categories
      const currentUser = await User.findById(req.user._id).lean();
      
      if (currentUser.allowedCategories && currentUser.allowedCategories.length > 0) {
        // User can see downloaded files that are either:
        // 1. Shared with them directly
        // 2. Belong to one of their allowed categories
        query = {
          downloads: req.query.userId,
          $or: [
            { sharedWith: req.user._id },
            { categories: { $in: currentUser.allowedCategories } }
          ]
        };
      } else {
        // If user has no allowed categories, they can only see files shared with them
        query = {
          downloads: req.query.userId,
          sharedWith: req.user._id
        };
      }
    }

    // Get total count for pagination
    const totalFiles = await File.countDocuments(query);
    const totalPages = Math.ceil(totalFiles / limit);

    // Get paginated files
    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('categories', 'name')
      .populate('user', 'username email')
      .populate('downloads', 'username email')
      .lean();

    // Get URLs for all files in parallel
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        try {
          const urls = await sharePointService.getFileUrls(
            file.sharePointFileId,
            file.sharePointThumbnailId
          );
          return {
            ...file,
            publicDownloadUrl: urls.fileUrl,
            publicThumbnailDownloadUrl: urls.thumbnailUrl
          };
        } catch (error) {
          console.error(`Error getting URLs for file ${file._id}:`, error);
          return {
            ...file,
            publicDownloadUrl: '',
            publicThumbnailDownloadUrl: ''
          };
        }
      })
    );

    res.json({
      files: filesWithUrls,
      currentPage: page,
      totalPages,
      totalFiles
    });
  } catch (error) {
    console.error('Error getting downloads files:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get files by type
export const getFilesByType = async (req, res) => {
  try {
    const { fileType } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Handle undefined or invalid file type
    if (!fileType) {
      return res.status(400).json({ message: 'File type is required' });
    }

    // Use $in operator to match any of the fileTypes array elements
    let query = { 
      fileTypes: { $in: [new RegExp(fileType, 'i')] }
    };

    // Add user-specific filters if not admin
    if (!req.user.isAdmin) {
      // Get the current user with their allowed categories
      const currentUser = await User.findById(req.user._id).lean();
      
      if (currentUser.allowedCategories && currentUser.allowedCategories.length > 0) {
        // User can see files that are either:
        // 1. Shared with them directly
        // 2. Belong to one of their allowed categories
        query.$or = [
          { sharedWith: req.user._id },
          { categories: { $in: currentUser.allowedCategories } }
        ];
      } else {
        // If user has no allowed categories, they can only see files shared with them
        query.sharedWith = req.user._id;
      }
    }

    // Get total count for pagination
    const totalFiles = await File.countDocuments(query);
    const totalPages = Math.ceil(totalFiles / limit);

    // Get paginated files
    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('categories', 'name')
      .populate('user', 'username email')
      .populate('sharedWith', 'username email')
      .lean();

    // Get URLs for all files in parallel
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        try {
          const urls = await sharePointService.getFileUrls(
            file.sharePointFileId,
            file.sharePointThumbnailId
          );
          return {
            ...file,
            publicDownloadUrl: urls.fileUrl,
            publicThumbnailDownloadUrl: urls.thumbnailUrl
          };
        } catch (error) {
          console.error(`Error getting URLs for file ${file._id}:`, error);
          return {
            ...file,
            publicDownloadUrl: '',
            publicThumbnailDownloadUrl: ''
          };
        }
      })
    );

    res.json({
      files: filesWithUrls,
      currentPage: page,
      totalPages,
      totalFiles
    });
  } catch (error) {
    console.error('Error getting files by type:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get files by category
export const getFilesByCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid category ID' });
    }

    // Check if category exists
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    // If user is not admin, check if they have permission to access this category
    if (!req.user.isAdmin) {
      const currentUser = await User.findById(req.user._id).lean();
      
      // Check if user has permission for this category
      const hasPermission = currentUser.allowedCategories && 
        currentUser.allowedCategories.some(catId => 
          catId.toString() === id.toString()
        );
      
      if (!hasPermission) {
        return res.status(403).json({ message: 'You do not have permission to access this page' });
      }
    }

    // Build query based on user role and category
    let query = { categories: id };
    
    // For non-admin users, we already verified they have access to this category
    // No need for additional filtering since we've already checked category permission
    // This allows users to see all files in their allowed categories

    // Get total count for pagination
    const totalFiles = await File.countDocuments(query);
    const totalPages = Math.ceil(totalFiles / limit);

    // Get paginated files
    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('categories', 'name')
      .populate('user', 'username email')
      .populate('sharedWith', 'username email')
      .lean();

    // Get URLs for all files in parallel
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        try {
          const urls = await sharePointService.getFileUrls(
            file.sharePointFileId,
            file.sharePointThumbnailId
          );
          return {
            ...file,
            publicDownloadUrl: urls.fileUrl,
            publicThumbnailDownloadUrl: urls.thumbnailUrl
          };
        } catch (error) {
          console.error(`Error getting URLs for file ${file._id}:`, error);
          return {
            ...file,
            publicDownloadUrl: '',
            publicThumbnailDownloadUrl: ''
          };
        }
      })
    );

    res.json({
      files: filesWithUrls,
      currentPage: page,
      totalPages,
      totalFiles
    });
  } catch (error) {
    console.error('Error getting files by category:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get file by ID
export const getFileById = async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      res.status(401);
      throw new Error('Not authorized, no token');
    }

    const file = await File.findById(req.params.id)
      .lean()
      .populate('categories')
      .populate('user', 'username email profilePicture')
      .populate('sharedWith', 'username email profilePicture');

    if (!file) {
      res.status(404);
      throw new Error('File not found');
    }
    
    // Get the current user with their allowed categories
    const currentUser = await User.findById(req.user._id).populate('allowedCategories');
    
    // Check if user has permission to access this file
    // Admins can access any file
    if (!currentUser.isAdmin) {
      // Check if user is specifically shared with this file
      const isSharedWithUser = file.sharedWith.some(user => 
        user._id.toString() === currentUser._id.toString()
      );
      
      if (!isSharedWithUser) {
        // Check if user has permission for any of the file's categories
        const hasPermission = file.categories.some(fileCategory => {
          // If user has no allowed categories, they can't access any files by category
          if (!currentUser.allowedCategories || currentUser.allowedCategories.length === 0) {
            return false;
          }
          
          // Check if this file category is in user's allowed categories
          return currentUser.allowedCategories.some(userCategory => 
            userCategory._id.toString() === fileCategory._id.toString()
          );
        });
        
        if (!hasPermission) {
          res.status(403);
          throw new Error('File not found');
        }
      }
    }

    // Get fresh URLs
    const urls = await sharePointService.getFileUrls(
      file.sharePointFileId,
      file.sharePointThumbnailId
    );

    // Add URLs to the response
    file.publicDownloadUrl = urls.fileUrl;
    file.publicThumbnailDownloadUrl = urls.thumbnailUrl;

    res.json(file);
  } catch (error) {
    console.error('Error getting file:', error);
    res.status(error.status || 500).json({ 
      message: error.message || 'Error getting file'
    });
  }
};

// Get fresh download URLs for a file
export const getFileUrls = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const urls = await sharePointService.getFileUrls(
      file.sharePointFileId,
      file.sharePointThumbnailId
    );

    res.json({
      ...file.toObject(),
      publicDownloadUrl: urls.fileUrl,
      publicThumbnailDownloadUrl: urls.thumbnailUrl
    });
  } catch (error) {
    console.error('Error getting file URLs:', error);
    res.status(500).json({ message: error.message });
  }
};

// Share file with user
export const shareFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { emails } = req.body;

    // First get the file to send emails
    const file = await File.findById(id);
    if (!file) {
      res.status(404);
      throw new Error('File not found');
    }

    // Check if user has permission to share
    if (!file.user.equals(req.user._id) && !req.user.isAdmin) {
      res.status(403);
      throw new Error('Not authorized to share this file');
    }

    // Get users and add them to sharedWith
    const userPromises = emails.map(async (email) => {
      let user = await User.findOne({ email: email.toLowerCase() });
      
      if (user) {
        // Get fresh URLs for the email
        const urls = await sharePointService.getFileUrls(
          file.sharePointFileId,
          file.sharePointThumbnailId
        );

        // Send notification email to existing user
        const subject = 'A File has been shared with You';
        const html = `
          <p>Hi,</p>
          <p>A file has been shared with you via the Independents by Sodexo Digital Portal.</p>
          <p>File Name: ${file.name}</p>
          <p>You can:</p>
          <p><a href="${process.env.FRONTEND_URL}/viewfile/${file._id}">View the file here</a></p>
          <p><a href="${urls.fileUrl}">Download the file here</a></p>
          <p>If you weren’t expecting this file, please check with your team lead.</p>
          <p>Best regards,<br/>Independents by Sodexo Digital Portal Team</p>
        `;
        await emailService.sendMail(email, subject, html);
        return user._id;
      }
      return null;
    });

    const userIds = (await Promise.all(userPromises)).filter(id => id !== null);
    
    if (userIds.length === 0) {
      return res.status(400).json({ message: 'No valid users to share with' });
    }

    // Use findOneAndUpdate with the existing user field
    const updatedFile = await File.findOneAndUpdate(
      { _id: id },
      {
        $addToSet: { sharedWith: { $each: userIds } }
      },
      {
        new: true,
        runValidators: false
      }
    ).populate([
      {
        path: 'sharedWith',
        select: '_id username email profilePicture'
      },
      {
        path: 'user',
        select: '_id username email'
      }
    ]);

    if (!updatedFile) {
      res.status(404);
      throw new Error('File not found');
    }

    res.json(updatedFile);
  } catch (error) {
    console.error('Error sharing file:', error);
    res.status(500).json({ 
      message: 'Error sharing file',
      error: error.message 
    });
  }
};

// Remove access
export const removeAccess = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if user has permission to remove access
    if (!file.user.equals(req.user._id) && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized to remove access' });
    }

    const { userId } = req.body;
    file.sharedWith = file.sharedWith.filter(id => id.toString() !== userId);
    await file.save();

    // Fetch updated file with populated fields
    const updatedFile = await File.findById(file._id)
      .populate({
        path: 'user',
        select: 'username email profilePicture'
      })
      .populate({
        path: 'sharedWith',
        select: 'username email profilePicture'
      })
      .populate('categories');

    res.json(updatedFile);
  } catch (error) {
    console.error('Error removing access:', error);
    res.status(500).json({ message: error.message });
  }
};

// Delete file
export const deleteFile = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid file ID format' });
    }

    const file = await File.findById(id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Delete file from SharePoint
    try {
      await msalService.deleteFile(file.sharePointFileId);
    } catch (error) {
      console.error('Error deleting file from SharePoint:', error);
      // Continue with deletion from database even if SharePoint delete fails
    }

    // Delete file from database
    await file.deleteOne();

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ 
      message: 'Error deleting file',
      error: error.message 
    });
  }
};

// Update file
// Middleware for thumbnail upload only (for file updates)
export const thumbnailUploadMiddleware = upload.fields([
  { name: 'thumbnail', maxCount: 1 }
]);

export const updateFile = async (req, res) => {
  try {
    const { id } = req.params;
    const thumbnail = req.files?.['thumbnail']?.[0];
    const fileTypes = req.body.fileTypes ? JSON.parse(req.body.fileTypes) : null;
    const categories = req.body.categories ? JSON.parse(req.body.categories) : null;
    const { name, description } = req.body;

    // Check if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid file ID format' });
    }

    const file = await File.findById(id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Update fields
    if (name) file.name = name;
    if (description) file.description = description;
    if (fileTypes) file.fileTypes = fileTypes;
    if (categories) {
      // Validate categories
      const validCategories = await Category.find({ _id: { $in: categories } });
      if (validCategories.length !== categories.length) {
        return res.status(400).json({ message: 'One or more invalid category IDs' });
      }
      file.categories = categories;
    }

    // Handle thumbnail update if provided
    if (thumbnail) {
      try {
        // Generate unique filename for thumbnail
        const timestamp = Date.now();
        const thumbnailExt = thumbnail.originalname.split('.').pop();
        const uniqueThumbnailName = `t${timestamp}_thumbnail.${thumbnailExt}`;
        
        // Get site and drive information
        const { siteId, driveId } = await sharePointService.getSiteAndDriveInfo();
        
        // Upload thumbnail to SharePoint
        const thumbnailUploadResult = await sharePointService.uploadFile(
          siteId,
          driveId,
          { ...thumbnail, originalname: uniqueThumbnailName }
        );
        
        // Update file record with new thumbnail info
        file.thumbnailName = uniqueThumbnailName;
        file.sharePointThumbnailId = thumbnailUploadResult.id;
        file.thumbnailUrl = thumbnailUploadResult.webUrl;
        
        // Invalidate Redis cache for this file's URLs
        await redisService.invalidateFileUrlsCache(file.sharePointFileId);
        if (file.sharePointThumbnailId) {
          await redisService.invalidateFileUrlsCache(file.sharePointThumbnailId);
        }
      } catch (thumbnailError) {
        console.error('Error uploading thumbnail:', thumbnailError);
        return res.status(500).json({ 
          message: 'Error uploading thumbnail',
          error: thumbnailError.message 
        });
      }
    }

    const updatedFile = await file.save();
    
    // Make sure cache is invalidated before generating fresh URLs
    await redisService.invalidateFileUrlsCache(file.sharePointFileId);
    if (file.sharePointThumbnailId) {
      await redisService.invalidateFileUrlsCache(file.sharePointThumbnailId);
    }
    
    // Generate fresh download URLs to avoid caching issues
    const urls = await sharePointService.getFileUrls(
      file.sharePointFileId,
      file.sharePointThumbnailId
    );
    
    // Return the updated file with fresh URLs
    res.json({
      ...updatedFile.toObject(),
      publicDownloadUrl: urls.fileUrl,
      publicThumbnailDownloadUrl: urls.thumbnailUrl
    });
  } catch (error) {
    console.error('Error updating file:', error);
    res.status(500).json({ 
      message: 'Error updating file',
      error: error.message 
    });
  }
};

// Generate sharing link
export const generateSharingLink = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if user has permission to share
    if (!file.user.equals(req.user._id) && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized to share this file' });
    }

    const { expirationDays } = req.body;
    const shareLink = await sharePointService.createFileShareLink(
      file.sharePointFileId,
      expirationDays
    );

    res.json({
      shareUrl: shareLink.shareUrl,
      expiresAt: shareLink.expiresAt
    });
  } catch (error) {
    console.error('Error generating sharing link:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get favorite files
export const getFavoriteFiles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get files where user is in favourites array
    const query = {
      favourites: req.user._id
    };

    // Get total count for pagination
    const totalFiles = await File.countDocuments(query);
    const totalPages = Math.ceil(totalFiles / limit);

    // Get paginated files
    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('categories', 'name')
      .populate('user', 'username email')
      .populate('sharedWith', 'username email')
      .lean();

    // Get URLs for all files in parallel
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        try {
          const urls = await sharePointService.getFileUrls(
            file.sharePointFileId,
            file.sharePointThumbnailId
          );
          return {
            ...file,
            publicDownloadUrl: urls.fileUrl,
            publicThumbnailDownloadUrl: urls.thumbnailUrl
          };
        } catch (error) {
          console.error(`Error getting URLs for file ${file._id}:`, error);
          return {
            ...file,
            publicDownloadUrl: '',
            publicThumbnailDownloadUrl: ''
          };
        }
      })
    );

    res.json({
      files: filesWithUrls,
      currentPage: page,
      totalPages,
      totalFiles
    });
  } catch (error) {
    console.error('Error getting favorite files:', error);
    res.status(500).json({ message: error.message });
  }
};

// Toggle favorite status
export const toggleFavorite = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const userIndex = file.favourites.indexOf(req.user._id);
    
    if (userIndex === -1) {
      // Add to favourites
      file.favourites.push(req.user._id);
      await file.save();
      res.json({ message: 'Added to favourites', isFavorite: true });
    } else {
      // Remove from favourites
      file.favourites.pull(req.user._id);
      await file.save();
      res.json({ message: 'Removed from favourites', isFavorite: false });
    }
  } catch (error) {
    console.error('Error toggling favorite:', error);
    res.status(500).json({ message: error.message });
  }
};

// Toggle pin status
export const togglePin = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const userIndex = file.pinnedBy ? file.pinnedBy.indexOf(req.user._id) : -1;
    
    if (userIndex === -1) {
      // Add to pinned
      if (!file.pinnedBy) {
        file.pinnedBy = [];
      }
      file.pinnedBy.push(req.user._id);
      await file.save();
      res.json({ message: 'File pinned successfully', isPinned: true });
    } else {
      // Remove from pinned
      file.pinnedBy.pull(req.user._id);
      await file.save();
      res.json({ message: 'File unpinned successfully', isPinned: false });
    }
  } catch (error) {
    console.error('Error toggling pin status:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get pinned files
export const getPinnedFiles = async (req, res) => {
  try {
    const files = await File.find({ pinnedBy: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate('user', 'name email')
      .populate('categories');

    // Add download URLs to each file
    const filesWithUrls = await Promise.all(files.map(async (file) => {
      const fileObj = file.toObject();
      try {
        // Generate signed URLs for the file using sharePointService
        const urls = await sharePointService.getFileUrls(
          file.sharePointFileId,
          file.sharePointThumbnailId
        );
        fileObj.publicDownloadUrl = urls.fileUrl;
        fileObj.publicThumbnailDownloadUrl = urls.thumbnailUrl;
      } catch (err) {
        console.error(`Error generating URLs for file ${file._id}:`, err);
        fileObj.publicDownloadUrl = '';
        fileObj.publicThumbnailDownloadUrl = '';
      }
      return fileObj;
    }));

    res.json(filesWithUrls);
  } catch (error) {
    console.error('Error getting pinned files:', error);
    res.status(500).json({ message: error.message });
  }
};

// Track file download
export const trackDownload = async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.user._id;

    // Check if user has already downloaded this file
    const file = await File.findById(fileId);
    const hasDownloaded = file.downloadHistory.some(
      download => download.userId.toString() === userId.toString()
    );

    // Only update download count if it's a new download
    if (!hasDownloaded) {
      await File.findByIdAndUpdate(fileId, {
        $inc: { downloadCount: 1 },
        $push: { 
          downloadHistory: {
            userId,
            downloadedAt: new Date()
          }
        },
        lastDownloadedAt: new Date()
      });

      // Create user activity record
      await UserActivity.create({
        user: userId,
        activityType: 'download',
        fileId,
        timestamp: new Date()
      });

      // Update user's downloaded files
      await User.findByIdAndUpdate(userId, {
        $push: {
          downloadedFiles: {
            fileId,
            downloadedAt: new Date()
          }
        }
      });
    }

    res.status(200).json({ 
      message: 'Download tracked successfully',
      isNewDownload: !hasDownloaded 
    });
  } catch (error) {
    console.error('Error tracking download:', error);
    res.status(500).json({ message: error.message });
  }
};

// Search files
export const searchFiles = async (req, res) => {
  try {
    const searchTerm = req.query.searchTerm || '';
    const limit = parseInt(req.query.limit) || 10;

    let query = {};
    if (!req.user.isAdmin) {
      // Get the current user with their allowed categories
      const currentUser = await User.findById(req.user._id).lean();
      
      if (currentUser.allowedCategories && currentUser.allowedCategories.length > 0) {
        // User can see files that are either:
        // 1. Shared with them directly
        // 2. Belong to one of their allowed categories
        query.$or = [
          { sharedWith: req.user._id },
          { categories: { $in: currentUser.allowedCategories } }
        ];
      } else {
        // If user has no allowed categories, they can only see files shared with them
        query.sharedWith = req.user._id;
      }
    }

    // Add search term to query
    if (searchTerm) {
      // If we already have permission filters with $or
      if (query.$or) {
        // We need to use $and to combine the existing $or with the search $or
        query = {
          $and: [
            { $or: query.$or },  // Permission filters
            { $or: [
                { name: { $regex: searchTerm, $options: 'i' } },
                { description: { $regex: searchTerm, $options: 'i' } }
              ]
            }
          ]
        };
      } else {
        // If no existing $or, we can simply add the search $or
        query.$or = [
          { name: { $regex: searchTerm, $options: 'i' } },
          { description: { $regex: searchTerm, $options: 'i' } }
        ];
      }
    }

    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('categories', 'name')
      .populate('user', 'username email')
      .lean();

    // Get URLs for all files in parallel
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        try {
          const urls = await sharePointService.getFileUrls(
            file.sharePointFileId,
            file.sharePointThumbnailId
          );
          return {
            ...file,
            publicDownloadUrl: urls.fileUrl,
            publicThumbnailDownloadUrl: urls.thumbnailUrl
          };
        } catch (error) {
          console.error(`Error getting URLs for file ${file._id}:`, error);
          return {
            ...file,
            publicDownloadUrl: '',
            publicThumbnailDownloadUrl: ''
          };
        }
      })
    );

    res.json({ files: filesWithUrls });
  } catch (error) {
    console.error('Error searching files:', error);
    res.status(500).json({ message: error.message });
  }
};

// Test streaming endpoint
export const testStreaming = async (req, res) => {
  // Set headers for streaming
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Transfer-Encoding': 'chunked',
    'X-Accel-Buffering': 'no',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Send 10 progress updates
  for(let i = 0; i <= 10; i++) {
    res.write(JSON.stringify({ progress: i * 10 }) + '\n');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  res.end();
};

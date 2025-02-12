import express from 'express';
import multer from 'multer';
import sharePointService from '../services/sharePointService.js';
import msalService from '../services/msalService.js';
import File from '../models/fileModel.js';
import Category from '../models/categoryModel.js';
import mongoose from 'mongoose'; 
import User from '../models/userModel.js'; 
import emailService from '../services/emailService.js'; 
import crypto from 'crypto'; 

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
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

    // Set headers to prevent buffering
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked',
      'X-Accel-Buffering': 'no',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Progress callback function
    const onProgress = async (progress) => {
      try {
        res.write(JSON.stringify({ progress }) + '\n');
        await new Promise(resolve => setTimeout(resolve, 500)); // Increased delay to prevent small packet buffering
      } catch (error) {
        console.error('Error sending progress:', error);
      }
    };

    // Send initial progress
    await onProgress(0);

    // Get site and drive information
    const { siteId, driveId } = await sharePointService.getSiteAndDriveInfo();

    // Upload main file with progress updates
    const fileResponse = await sharePointService.uploadFile(
      siteId,
      driveId,
      { ...mainFile, originalname: uniqueMainFileName },
      null,
      onProgress
    );

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

    // Send final success response
    res.write(JSON.stringify({ 
      progress: 100,
      done: true,
      message: 'File uploaded successfully',
      fileId: fileResponse.id,
      fileName: fileResponse.name,
      thumbnailId: thumbnailResponse?.id,
      record: {
        ...fileRecord.toObject(),
        publicDownloadUrl: urls.fileUrl,
        publicThumbnailDownloadUrl: urls.thumbnailUrl
      }
    }) + '\n');
    
    res.end();
  } catch (error) {
    console.error('Error in file upload:', error);
    res.write(`data: ${JSON.stringify({ 
      error: true,
      message: error.message || 'Failed to upload file'
    })}\n\n`);
    res.end();
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
      query = {
        $or: [
          { user: req.user._id },
          { sharedWith: req.user._id }
        ]
      };
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
      query = {
        $or: [
          { user: req.user._id },
          { sharedWith: req.user._id }
        ]
      };
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
      fileTypes: { 
        $in: [fileType.toLowerCase()]
      } 
    };

    // If not admin, only show own and shared files
    if (!req.user.isAdmin) {
      query = {
        fileTypes: { 
          $in: [fileType.toLowerCase()]
        },
        $or: [
          { user: req.user._id },
          { sharedWith: req.user._id }
        ]
      };
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

    // Build query based on user role and category
    let query = { categories: id };
    if (!req.user.isAdmin) {
      query = {
        categories: id,
        $or: [
          { user: req.user._id },
          { sharedWith: req.user._id }
        ]
      };
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

    // Check access permissions
    const userId = req.user._id;
    const isAdmin = req.user.isAdmin;

    // If user is admin, allow access regardless of ownership
    if (!isAdmin) {
      // Only check ownership and sharing if not admin
      const isOwner = file.user && file.user._id && file.user._id.toString() === userId.toString();
      const isSharedWith = file.sharedWith && file.sharedWith.some(user => user._id.toString() === userId.toString());

      if (!isOwner && !isSharedWith) {
        res.status(403);
        throw new Error('You do not have permission to access this file');
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
        const subject = 'File Shared With You';
        const html = `
          <h2>File Shared</h2>
          <p>A file has been shared with you on our platform.</p>
          <p>File Name: ${file.name}</p>
          <p>View the file here: <a href="${process.env.FRONTEND_URL}/viewfile/${file._id}">${process.env.FRONTEND_URL}/viewfile/${file._id}</a></p>
          <p>Direct download: <a href="${urls.fileUrl}">Download ${file.name}</a></p>
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
export const updateFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, categories } = req.body;

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
    if (categories) {
      // Validate categories
      const validCategories = await Category.find({ _id: { $in: categories } });
      if (validCategories.length !== categories.length) {
        return res.status(400).json({ message: 'One or more invalid category IDs' });
      }
      file.categories = categories;
    }

    const updatedFile = await file.save();

    res.json(updatedFile);
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

// Track file download
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

export const trackDownload = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if user has already downloaded
    const userIndex = file.downloads.indexOf(req.user._id);
    
    if (userIndex === -1) {
      // Add user to downloads array if not already present
      file.downloads.push(req.user._id);
      await file.save();
    }

    res.json({ 
      message: 'Download tracked successfully',
      downloadCount: file.downloads.length 
    });
  } catch (error) {
    console.error('Error tracking download:', error);
    res.status(500).json({ message: error.message });
  }
};

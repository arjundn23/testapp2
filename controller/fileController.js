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

const validateFileType = (fileType, allowedTypes) => {
  if (!allowedTypes || allowedTypes === '*') return true;
  const mimeTypes = {
    'documents': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    'images': ['image/jpeg', 'image/png', 'image/gif'],
    'videos': ['video/mp4', 'video/quicktime', 'video/x-msvideo']
  };
  return mimeTypes[fileType]?.includes(allowedTypes);
};

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

    // Set up SSE for progress updates
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Progress callback function
    const onProgress = (progress) => {
      res.write(`data: ${JSON.stringify({ progress })}\n\n`);
    };

    // Get site and drive information
    const { siteId, driveId } = await sharePointService.getSiteAndDriveInfo(await msalService.getAccessToken());

    // Upload main file with progress updates
    const fileResponse = await sharePointService.uploadFile(
      siteId,
      driveId,
      mainFile,
      await msalService.getAccessToken(),
      onProgress
    );

    let thumbnailResponse = null;
    if (thumbnail) {
      // Upload thumbnail if provided
      thumbnailResponse = await sharePointService.uploadFile(
        siteId,
        driveId,
        thumbnail,
        await msalService.getAccessToken()
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
      thumbnailUrl: thumbnailResponse ? thumbnailResponse.webUrl : null,
      fileUrl: fileResponse.webUrl,
      downloadUrl: fileResponse['@microsoft.graph.downloadUrl'] || '',
      mimeType: mainFile.mimetype,
      size: mainFile.size,
      sharePointFileId: fileResponse.id,
      uploadedBy: req.body.userId, // Get user ID from form data
      user: req.user._id // Add user from auth middleware
    };

    const fileRecord = await File.create(fileData);

    // Send final success response
    res.write(`data: ${JSON.stringify({ 
      done: true,
      message: 'File uploaded successfully',
      fileId: fileResponse.id,
      fileName: fileResponse.name,
      thumbnailId: thumbnailResponse?.id,
      record: fileRecord
    })}\n\n`);
    
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

// Get recent files
export const getRecentFiles = async (req, res) => {
  try {
    const files = await File.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('categories', 'name');

    res.json(files);
  } catch (error) {
    console.error('Error getting recent files:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get files by type
export const getFilesByType = async (req, res) => {
  try {
    const { fileType } = req.params;
    let query = {};

    // Handle special cases for Sell It and Operate It Collateral
    if (fileType === 'Sell It Collateral') {
      query = { fileTypes: 'documents' };
    } else if (fileType === 'Operate It Collateral') {
      query = { fileTypes: 'documents' };
    } else {
      query = { fileTypes: fileType.toLowerCase() };
    }

    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .populate('categories', 'name');

    res.json(files);
  } catch (error) {
    console.error('Error getting files by type:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get files by category
export const getFilesByCategory = async (req, res) => {
  try {
    const { categoryName } = req.params;
    
    // First find the category by name
    const category = await Category.findOne({ name: categoryName });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Then find all files in that category
    const files = await File.find({ categories: category._id })
      .sort({ createdAt: -1 })
      .populate('categories', 'name');

    res.json(files);
  } catch (error) {
    console.error('Error getting files by category:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get file by ID
export const getFileById = async (req, res) => {
  try {
    const file = await File.findById(req.params.id)
      .populate('categories')
      .populate('sharedWith', 'username email profilePicture');

    if (file) {
      res.json(file);
    } else {
      res.status(404);
      throw new Error('File not found');
    }
  } catch (error) {
    console.error('Error getting file:', error);
    res.status(500).json({ 
      message: 'Error getting file',
      error: error.message 
    });
  }
};

// Share file with users
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

    // Get users and add them to sharedWith
    const userPromises = emails.map(async (email) => {
      let user = await User.findOne({ email: email.toLowerCase() });
      
      if (user) {
        // Send notification email to existing user
        const subject = 'File Shared With You';
        const html = `
          <p>Hello ${user.username},</p>
          <p>A file has been shared with you on our platform.</p>
          <p>File Name: ${file.name}</p>
          <p>View the file here: <a href="${file.fileUrl}">${file.name}</a></p>
          <p>Download the file here: <a href="${file.downloadUrl}">Download ${file.name}</a></p>
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

// Remove user access
export const removeAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    // Use findOneAndUpdate to avoid validation issues
    const file = await File.findOneAndUpdate(
      { _id: id },
      { $pull: { sharedWith: userId } },
      { 
        new: true, // Return updated document
        runValidators: false // Disable validation
      }
    ).populate('sharedWith', 'username email profilePicture');

    if (!file) {
      res.status(404);
      throw new Error('File not found');
    }

    res.json(file);
  } catch (error) {
    console.error('Error removing access:', error);
    res.status(500).json({ 
      message: 'Error removing access',
      error: error.message 
    });
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

import sharePointService from './sharePointService.js';
import File from '../models/fileModel.js';
import { sendUploadProgress, sendUploadComplete, sendUploadError } from '../utils/websocket.js';
import fs from 'fs/promises';

class UploadProcessingService {
  async processUpload(uploadData) {
    const {
      uploadId,
      mainFile,
      thumbnail,
      userId,
      user,
      fileTypes,
      categories,
      name,
      description
    } = uploadData;

    try {
      // Get site and drive information
      const { siteId, driveId } = await sharePointService.getSiteAndDriveInfo();

      // Progress callback function
      const onProgress = async (progress) => {
        try {
          console.log(`Progress callback: ${progress}% for upload ID:`, uploadId);
          sendUploadProgress(uploadId, progress);
        } catch (error) {
          console.error('Error sending progress:', error);
        }
      };

      // Send initial progress
      await onProgress(0);

      // Upload main file with progress updates
      const fileResponse = await sharePointService.uploadFile(
        siteId,
        driveId,
        mainFile,
        null,
        onProgress
      );

      // Clean up main file after successful upload
      try {
        if (mainFile.path) {
          await fs.unlink(mainFile.path);
          console.log(`Cleaned up main file: ${mainFile.path}`);
        }
      } catch (cleanupError) {
        console.error('Error cleaning up main file:', cleanupError);
      }

      let thumbnailResponse = null;
      if (thumbnail) {
        // Upload thumbnail if provided
        thumbnailResponse = await sharePointService.uploadFile(
          siteId,
          driveId,
          thumbnail
        );

        // Clean up thumbnail after successful upload
        try {
          if (thumbnail.path) {
            await fs.unlink(thumbnail.path);
            console.log(`Cleaned up thumbnail: ${thumbnail.path}`);
          }
        } catch (cleanupError) {
          console.error('Error cleaning up thumbnail:', cleanupError);
        }
      }

      // Create file record in database
      const fileData = {
        name: name || mainFile.originalname,
        originalName: mainFile.originalname,
        description: description || '',
        fileTypes: fileTypes || [],
        categories: categories || [],
        sharePointFileId: fileResponse.id,
        sharePointThumbnailId: thumbnailResponse?.id || null,
        mimeType: mainFile.mimetype,
        size: mainFile.size,
        uploadedBy: userId,
        user: user
      };

      const fileRecord = await File.create(fileData);

      // Get fresh URLs for the response
      const urls = await sharePointService.getFileUrls(fileResponse.id, thumbnailResponse?.id);

      const responseData = {
        fileId: fileResponse.id,
        fileName: fileResponse.name,
        thumbnailId: thumbnailResponse?.id,
        record: {
          ...fileRecord.toObject(),
          publicDownloadUrl: urls.fileUrl,
          publicThumbnailDownloadUrl: urls.thumbnailUrl
        }
      };

      console.log('Upload complete, sending final response for ID:', uploadId);
      sendUploadComplete(uploadId, responseData);

    } catch (error) {
      console.error('Error in background upload processing:', error);
      
      // Clean up files in case of error
      try {
        if (mainFile?.path) {
          await fs.unlink(mainFile.path);
          console.log(`Cleaned up main file after error: ${mainFile.path}`);
        }
        if (thumbnail?.path) {
          await fs.unlink(thumbnail.path);
          console.log(`Cleaned up thumbnail after error: ${thumbnail.path}`);
        }
      } catch (cleanupError) {
        console.error('Error cleaning up files after error:', cleanupError);
      }

      sendUploadError(uploadId, error.message || 'Failed to upload file');
    }
  }
}

export default new UploadProcessingService();

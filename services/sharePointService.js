import dotenv from 'dotenv';
import msalService from './msalService.js';
import fetch from 'node-fetch';
import FormData from 'form-data';
import redisService from './redisService.js';

dotenv.config();

class SharePointService {
  constructor() {
    this.config = {
      siteId: process.env.SHAREPOINT_SITE_ID || 'serendipityint.sharepoint.com',
      hostWebUrl: process.env.SHAREPOINT_HOST_URL || 'https://serendipityint.sharepoint.com/sites/ResourcePortal'
    };
  }

  async ensureValidToken() {
    try {
      const token = await msalService.getAccessToken();
      const tokenData = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      
      // Check if token is expired or about to expire (within 5 minutes)
      const expirationTime = tokenData.exp * 1000; // Convert to milliseconds
      const currentTime = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (currentTime + fiveMinutes >= expirationTime) {
        // Token is expired or about to expire, get a new one
        return await msalService.getAccessToken(true); // Force refresh with skipCache
      }
      
      return token;
    } catch (error) {
      console.error('Error ensuring valid token:', error);
      // Always get a fresh token if there's an error
      return await msalService.getAccessToken(true);
    }
  }

  async getSiteAndDriveInfo() {
    try {
      const accessToken = await this.ensureValidToken();
      // Get SharePoint site ID
      const siteResponse = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${this.config.siteId}:/sites/ResourcePortal`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );
      
      if (!siteResponse.ok) {
        const error = await siteResponse.json();
        throw new Error(error.message || 'Failed to get site information');
      }
      const siteData = await siteResponse.json();

      // Get the default document library (drive)
      const drivesResponse = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteData.id}/drives`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      if (!drivesResponse.ok) {
        const error = await drivesResponse.json();
        throw new Error(error.message || 'Failed to get drives');
      }
      const drivesData = await drivesResponse.json();
      
      // Find the Documents drive
      const documentsDrive = drivesData.value.find(drive => 
        drive.name === 'Documents' || drive.name === 'Shared Documents'
      );

      if (!documentsDrive) {
        throw new Error('Documents library not found');
      }

      return {
        siteId: siteData.id,
        driveId: documentsDrive.id
      };
    } catch (error) {
      console.error('Error in getSiteAndDriveInfo:', error);
      throw error;
    }
  }

  async createUploadSession(siteId, driveId, fileName) {
    try {
      const accessToken = await this.ensureValidToken();
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${fileName}:/createUploadSession`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            item: {
              '@microsoft.graph.conflictBehavior': 'replace'
            }
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create upload session');
      }

      return await response.json();
    } catch (error) {
      console.error('Error in createUploadSession:', error);
      throw error;
    }
  }

  async uploadChunk(uploadUrl, chunk, startByte, totalSize) {
    try {
      const endByte = startByte + chunk.length - 1;
      const contentRange = `bytes ${startByte}-${endByte}/${totalSize}`;

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': chunk.length,
          'Content-Range': contentRange,
        },
        body: chunk
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload chunk');
      }

      return response.status === 201 || response.status === 200 
        ? await response.json() 
        : null;
    } catch (error) {
      console.error('Error in uploadChunk:', error);
      throw error;
    }
  }

  async uploadFile(siteId, driveId, file) {
    try {
      const accessToken = await this.ensureValidToken();
      if (!file || !file.buffer) {
        throw new Error('Invalid file data');
      }

      // For files smaller than 4MB, use simple upload
      if (file.size < 4 * 1024 * 1024) {
        return await this.simpleUpload(siteId, driveId, file, accessToken);
      }

      // For larger files, use large file upload session
      return await this.largeFileUpload(siteId, driveId, file, accessToken);
    } catch (error) {
      console.error('Error in uploadFile:', error);
      throw error;
    }
  }

  async simpleUpload(siteId, driveId, file, accessToken) {
    const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${file.originalname}:/content`;
    
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': file.mimetype
      },
      body: file.buffer
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to upload file');
    }

    return await response.json();
  }

  async largeFileUpload(siteId, driveId, file, accessToken) {
    // Create upload session
    const sessionUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${file.originalname}:/createUploadSession`;
    
    const sessionResponse = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        "@microsoft.graph.conflictBehavior": "rename"
      })
    });

    if (!sessionResponse.ok) {
      const error = await sessionResponse.json();
      throw new Error(error.message || 'Failed to create upload session');
    }

    const { uploadUrl } = await sessionResponse.json();

    // Upload file in chunks
    const maxChunkSize = 4 * 1024 * 1024; // 4MB chunks
    const fileBuffer = file.buffer;
    const fileSize = fileBuffer.length;
    let uploadedBytes = 0;

    while (uploadedBytes < fileSize) {
      const chunk = fileBuffer.slice(
        uploadedBytes,
        Math.min(uploadedBytes + maxChunkSize, fileSize)
      );

      const chunkResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': chunk.length,
          'Content-Range': `bytes ${uploadedBytes}-${uploadedBytes + chunk.length - 1}/${fileSize}`
        },
        body: chunk
      });

      if (!chunkResponse.ok) {
        const error = await chunkResponse.json();
        throw new Error(error.message || 'Failed to upload file chunk');
      }

      uploadedBytes += chunk.length;

      // Get the response for the last chunk
      if (uploadedBytes === fileSize) {
        return await chunkResponse.json();
      }
    }
  }

  async createSharingLink(siteId, driveId, itemId, expirationTime = '7') {
    try {
      const accessToken = await this.ensureValidToken();
      
      // Get the download URL directly
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${itemId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error getting download URL:', errorData);
        throw new Error(errorData.message || 'Failed to get download URL');
      }

      const data = await response.json();
      const downloadUrl = data['@microsoft.graph.downloadUrl'];

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + parseInt(expirationTime) * 24 * 60 * 60 * 1000);
      
      return {
        shareId: data.id,
        shareUrl: downloadUrl,
        expiresAt: expiresAt.toISOString()
      };
    } catch (error) {
      console.error('Error in createSharingLink:', error);
      throw error;
    }
  }

  async createFileShareLink(fileId, expirationDays = '7') {
    try {
      const { siteId, driveId } = await this.getSiteAndDriveInfo();
      return await this.createSharingLink(siteId, driveId, fileId, expirationDays);
    } catch (error) {
      console.error('Error creating file share link:', error);
      throw error;
    }
  }

  async getDownloadUrl(siteId, driveId, itemId) {
    try {
      const accessToken = await this.ensureValidToken();
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${itemId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error getting download URL:', errorData);
        throw new Error(errorData.message || 'Failed to get download URL');
      }

      const data = await response.json();
      return data['@microsoft.graph.downloadUrl'];
    } catch (error) {
      console.error('Error in getDownloadUrl:', error);
      throw error;
    }
  }

  async getFileUrls(fileId, thumbnailId = null) {
    try {
      // Check cache first
      const cachedUrls = await redisService.getFileUrls(fileId);
      
      // If cached and not expired, return cached URLs
      if (cachedUrls && !await redisService.needsRefresh(fileId)) {
        return {
          fileUrl: cachedUrls.fileUrl,
          thumbnailUrl: cachedUrls.thumbnailUrl
        };
      }

      // If URLs need refresh but are still valid, trigger background refresh
      if (cachedUrls && await redisService.needsRefresh(fileId)) {
        this.refreshUrlsInBackground(fileId, thumbnailId);
        return {
          fileUrl: cachedUrls.fileUrl,
          thumbnailUrl: cachedUrls.thumbnailUrl
        };
      }

      // Generate new URLs
      const { siteId, driveId } = await this.getSiteAndDriveInfo();
      
      const [fileUrl, thumbnailUrl] = await Promise.all([
        this.getDownloadUrl(siteId, driveId, fileId),
        thumbnailId ? this.getDownloadUrl(siteId, driveId, thumbnailId) : Promise.resolve(null)
      ]);

      // Store in cache
      await redisService.storeFileUrls(fileId, {
        fileUrl,
        thumbnailUrl
      });

      return {
        fileUrl,
        thumbnailUrl
      };
    } catch (error) {
      console.error('Error getting file URLs:', error);
      
      // If error occurs but we have cached URLs, return those
      const cachedUrls = await redisService.getFileUrls(fileId);
      if (cachedUrls) {
        return {
          fileUrl: cachedUrls.fileUrl,
          thumbnailUrl: cachedUrls.thumbnailUrl
        };
      }
      
      throw error;
    }
  }

  async refreshUrlsInBackground(fileId, thumbnailId) {
    try {
      // Mark as refreshing to prevent multiple refreshes
      const marked = await redisService.markUrlAsRefreshing(fileId);
      if (!marked) return;

      const { siteId, driveId } = await this.getSiteAndDriveInfo();
      
      const [fileUrl, thumbnailUrl] = await Promise.all([
        this.getDownloadUrl(siteId, driveId, fileId),
        thumbnailId ? this.getDownloadUrl(siteId, driveId, thumbnailId) : Promise.resolve(null)
      ]);

      await redisService.storeFileUrls(fileId, {
        fileUrl,
        thumbnailUrl
      });
    } catch (error) {
      console.error('Error refreshing URLs in background:', error);
    }
  }
}

export default new SharePointService();

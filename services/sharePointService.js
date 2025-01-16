import fetch from 'node-fetch';
import FormData from 'form-data';

class SharePointService {
  constructor() {
    this.config = {
      siteId: process.env.SHAREPOINT_SITE_ID || 'serendipityint.sharepoint.com',
      hostWebUrl: process.env.SHAREPOINT_HOST_URL || 'https://serendipityint.sharepoint.com/sites/ResourcePortal'
    };
  }

  async getSiteAndDriveInfo(accessToken) {
    try {
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

  async createUploadSession(siteId, driveId, fileName, accessToken) {
    try {
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

  async uploadFile(siteId, driveId, file, accessToken, onProgress) {
    try {
      if (!file || !file.buffer) {
        throw new Error('Invalid file data');
      }

      // For files smaller than 4MB, use simple upload
      if (file.size < 4 * 1024 * 1024) {
        // Send initial progress
        onProgress && onProgress(0);
        const result = await this.simpleUpload(siteId, driveId, file, accessToken);
        onProgress && onProgress(100);
        return result;
      }

      // For larger files, use large file upload session
      return await this.largeFileUpload(siteId, driveId, file, accessToken, onProgress);
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

  async largeFileUpload(siteId, driveId, file, accessToken, onProgress) {
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

    // Send initial progress
    onProgress && onProgress(0);

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
      const progress = Math.round((uploadedBytes / fileSize) * 100);
      onProgress && onProgress(progress);

      // Get the response for the last chunk
      if (uploadedBytes === fileSize) {
        return await chunkResponse.json();
      }
    }
  }
}

export default new SharePointService();

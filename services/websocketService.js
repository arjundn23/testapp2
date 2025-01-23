import { WebSocketServer } from 'ws';
import redisService from './redisService.js';
import jwt from 'jsonwebtoken';

class WebSocketService {
  constructor() {
    this.wss = null;
    this.connections = new Map();
  }

  initialize(server) {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', async (ws, req) => {
      try {
        // Get token from query string
        const token = new URL(req.url, 'http://localhost').searchParams.get('token');
        if (!token) {
          ws.close();
          return;
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Generate connection ID
        const connectionId = Math.random().toString(36).substring(7);
        
        // Store connection
        this.connections.set(connectionId, { ws, userId });
        await redisService.storeWebSocketConnection(userId, connectionId);

        ws.on('close', async () => {
          this.connections.delete(connectionId);
          await redisService.removeWebSocketConnection(userId, connectionId);
        });

      } catch (error) {
        console.error('WebSocket connection error:', error);
        ws.close();
      }
    });
  }

  // Broadcast to all connections of specific users
  async broadcastToUsers(userIds, message) {
    try {
      for (const userId of userIds) {
        const connectionIds = await redisService.getUserConnections(userId);
        for (const connectionId of connectionIds) {
          const connection = this.connections.get(connectionId);
          if (connection && connection.ws.readyState === 1) {
            connection.ws.send(JSON.stringify(message));
          }
        }
      }
    } catch (error) {
      console.error('Error broadcasting message:', error);
    }
  }

  // Broadcast file update
  async broadcastFileUpdate(file, userIds) {
    const message = {
      type: 'FILE_UPDATED',
      payload: {
        _id: file._id,
        name: file.name,
        size: file.size,
        fileTypes: file.fileTypes,
        categories: file.categories,
        user: file.user,
        publicDownloadUrl: file.publicDownloadUrl,
        publicThumbnailDownloadUrl: file.publicThumbnailDownloadUrl,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt
      }
    };

    await this.broadcastToUsers(userIds, message);
  }

  // Broadcast file deletion
  async broadcastFileDeletion(fileId, userIds) {
    const message = {
      type: 'FILE_DELETED',
      payload: { fileId }
    };

    await this.broadcastToUsers(userIds, message);
  }
}

export default new WebSocketService();

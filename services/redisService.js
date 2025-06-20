import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

class RedisService {
  constructor() {
    const config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    };

    // Only add password if it's set in env
    if (process.env.REDIS_PASSWORD) {
      config.password = process.env.REDIS_PASSWORD;
    }

    this.client = new Redis(config);

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
    });
  }

  // Store URL with metadata
  async storeFileUrls(fileId, urls, expiresIn = 3600) {
    const data = {
      ...urls,
      generatedAt: Date.now(),
      expiresAt: Date.now() + (expiresIn * 1000),
      isRefreshing: false
    };

    await this.client.setex(`file:${fileId}:urls`, expiresIn, JSON.stringify(data));
    return data;
  }

  // Get stored URLs
  async getFileUrls(fileId) {
    const data = await this.client.get(`file:${fileId}:urls`);
    if (!data) return null;
    return JSON.parse(data);
  }

  // Mark URL as refreshing
  async markUrlAsRefreshing(fileId) {
    const data = await this.getFileUrls(fileId);
    if (!data) return false;

    data.isRefreshing = true;
    await this.client.setex(
      `file:${fileId}:urls`,
      Math.ceil((data.expiresAt - Date.now()) / 1000),
      JSON.stringify(data)
    );
    return true;
  }

  // Check if URL needs refresh (>80% of lifetime)
  async needsRefresh(fileId) {
    const data = await this.getFileUrls(fileId);
    if (!data) return true;

    const lifetime = data.expiresAt - data.generatedAt;
    const age = Date.now() - data.generatedAt;
    return (age > lifetime * 0.8) && !data.isRefreshing;
  }

  // Store WebSocket connections
  async storeWebSocketConnection(userId, connectionId) {
    await this.client.sadd(`user:${userId}:connections`, connectionId);
  }

  // Remove WebSocket connection
  async removeWebSocketConnection(userId, connectionId) {
    await this.client.srem(`user:${userId}:connections`, connectionId);
  }

  // Get all WebSocket connections for a user
  async getUserConnections(userId) {
    return await this.client.smembers(`user:${userId}:connections`);
  }
  
  // Invalidate file URLs cache
  async invalidateFileUrlsCache(fileId) {
    return await this.client.del(`file:${fileId}:urls`);
  }
}

export default new RedisService();

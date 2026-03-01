import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private memoryStore = new Map<string, { value: string; expiresAt: number | null }>();
  private inMemoryMode = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.inMemoryMode = true;
      console.warn('[redis] REDIS_URL missing, using in-memory fallback');
      return;
    }
    try {
      const url = new URL(redisUrl);
      const tls = url.protocol === 'rediss:' ? { rejectUnauthorized: false } : undefined;
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        tls,
        lazyConnect: true,
      });
      await this.client.connect();
    } catch (error: any) {
      this.client = null;
      this.inMemoryMode = true;
      console.warn('[redis] Redis unavailable, using in-memory fallback:', error?.message || error);
    }
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.quit();
    }
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not available');
    }
    return this.client;
  }

  isReady() {
    return Boolean(this.client) && !this.inMemoryMode;
  }

  getConnectionOptions() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is required');
    }
    const url = new URL(redisUrl);
    const tls = url.protocol === 'rediss:' ? { rejectUnauthorized: false } : undefined;
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      tls,
    };
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (this.inMemoryMode || !this.client) {
      const record = this.memoryStore.get(key);
      if (!record) return null;
      if (record.expiresAt && Date.now() > record.expiresAt) {
        this.memoryStore.delete(key);
        return null;
      }
      return JSON.parse(record.value) as T;
    }
    const raw = await this.client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    if (this.inMemoryMode || !this.client) {
      const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
      this.memoryStore.set(key, { value: JSON.stringify(value), expiresAt });
      return;
    }
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
}

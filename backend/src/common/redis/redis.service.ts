import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is required');
    }
    const url = new URL(redisUrl);
    const tls = url.protocol === 'rediss:' ? { rejectUnauthorized: false } : undefined;
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      tls,
    });
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.quit();
    }
  }

  getClient(): Redis {
    return this.client;
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
    const raw = await this.client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
}

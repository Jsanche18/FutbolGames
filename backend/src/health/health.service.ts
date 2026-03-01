import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ApiFootballClient } from '../football/api-football.client';

@Injectable()
export class HealthService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private api: ApiFootballClient,
  ) {}

  async getDepsHealth() {
    const startedAt = Date.now();
    const db = await this.checkDatabase();
    const redis = await this.checkRedis();
    const api = await this.checkApiFootball();
    const ok = db.ok && redis.ok && api.ok;
    return {
      ok,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      deps: { db, redis, apiFootball: api },
    };
  }

  private async checkDatabase() {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { ok: true, durationMs: Date.now() - startedAt };
    } catch (error: any) {
      return {
        ok: false,
        durationMs: Date.now() - startedAt,
        error: error?.code || error?.message || 'db_error',
      };
    }
  }

  private async checkRedis() {
    const startedAt = Date.now();
    try {
      const mode = this.redis.isReady() ? 'remote' : 'memory_fallback';
      return { ok: true, mode, durationMs: Date.now() - startedAt };
    } catch (error: any) {
      return {
        ok: false,
        durationMs: Date.now() - startedAt,
        error: error?.code || error?.message || 'redis_error',
      };
    }
  }

  private async checkApiFootball() {
    const startedAt = Date.now();
    try {
      const data = await this.api.getCountries();
      const count = Array.isArray((data as any)?.response) ? (data as any).response.length : 0;
      return { ok: true, countries: count, durationMs: Date.now() - startedAt };
    } catch (error: any) {
      return {
        ok: false,
        durationMs: Date.now() - startedAt,
        error: error?.response?.status || error?.code || error?.message || 'api_error',
      };
    }
  }
}

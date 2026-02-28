import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    let urlOverride: string | undefined;
    if (databaseUrl) {
      try {
        const url = new URL(databaseUrl);
        if (!url.searchParams.has('connect_timeout')) {
          url.searchParams.set('connect_timeout', '300');
          urlOverride = url.toString();
        }
      } catch {
        urlOverride = undefined;
      }
    }

    super(
      urlOverride
        ? {
            datasources: {
              db: { url: urlOverride },
            },
          }
        : undefined,
    );
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

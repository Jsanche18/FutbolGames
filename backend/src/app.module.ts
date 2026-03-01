import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { FootballModule } from './football/football.module';
import { SyncModule } from './sync/sync.module';
import { GamesModule } from './games/games.module';
import { MultiplayerModule } from './multiplayer/multiplayer.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    FootballModule,
    SyncModule,
    GamesModule,
    MultiplayerModule,
    HealthModule,
  ],
})
export class AppModule {}

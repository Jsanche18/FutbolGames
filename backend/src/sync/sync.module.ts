import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { ApiFootballClient } from '../football/api-football.client';

@Module({
  controllers: [SyncController],
  providers: [SyncService, ApiFootballClient],
})
export class SyncModule {}

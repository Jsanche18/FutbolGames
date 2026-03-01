import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ApiFootballClient } from '../football/api-football.client';

@Module({
  controllers: [HealthController],
  providers: [HealthService, ApiFootballClient],
})
export class HealthModule {}

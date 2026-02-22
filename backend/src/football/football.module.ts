import { Module } from '@nestjs/common';
import { FootballController } from './football.controller';
import { FootballService } from './football.service';
import { ApiFootballClient } from './api-football.client';
import { ApiFootballTrophyProvider } from './trophy.provider';

@Module({
  controllers: [FootballController],
  providers: [FootballService, ApiFootballClient, ApiFootballTrophyProvider],
  exports: [FootballService],
})
export class FootballModule {}

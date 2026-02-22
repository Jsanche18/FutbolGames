import { Controller, Post, Query, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SyncService } from './sync.service';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Post('leagues')
  syncLeagues(@Query('season') season?: string) {
    return this.syncService.enqueueLeagues(season ? Number(season) : undefined);
  }

  @Post('teams')
  syncTeams(@Query('leagueApiId') leagueApiId: string, @Query('season') season?: string) {
    return this.syncService.enqueueTeams(Number(leagueApiId), season ? Number(season) : undefined);
  }

  @Post('players')
  syncPlayers(@Query('teamApiId') teamApiId: string, @Query('season') season?: string) {
    return this.syncService.enqueuePlayers(Number(teamApiId), season ? Number(season) : undefined);
  }

  @Post('player/:apiId')
  syncPlayer(@Param('apiId') apiId: string, @Query('season') season?: string) {
    return this.syncService.enqueuePlayer(Number(apiId), season ? Number(season) : undefined);
  }
}

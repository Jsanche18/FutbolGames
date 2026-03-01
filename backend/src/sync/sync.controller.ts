import { Controller, Get, Post, Query, Param } from '@nestjs/common';
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

  @Post('bootstrap')
  syncBootstrap(@Query('season') season?: string) {
    return this.syncService.enqueueBootstrap(season ? Number(season) : undefined);
  }

  @Post('guarantee')
  syncGuarantee(@Query('season') season?: string) {
    return this.syncService.enqueueGuarantee(season ? Number(season) : undefined);
  }

  @Post('preload')
  syncPreload(@Query('season') season?: string) {
    return this.syncService.enqueuePreload(season ? Number(season) : undefined);
  }

  @Get('coverage')
  coverage() {
    return this.syncService.getCoverage();
  }

  @Get('important-coverage')
  importantCoverage(@Query('season') season?: string, @Query('repair') repair?: string) {
    return this.syncService.getImportantCoverage(
      season ? Number(season) : undefined,
      repair === 'true',
    );
  }

  @Post('important/sync')
  syncImportant(@Query('season') season?: string) {
    return this.syncService.syncImportantPlayers(season ? Number(season) : undefined);
  }
}

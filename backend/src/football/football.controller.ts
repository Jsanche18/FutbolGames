import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FootballService } from './football.service';

@ApiTags('football')
@Controller()
export class FootballController {
  constructor(private footballService: FootballService) {}

  @Get('countries')
  getCountries() {
    return this.footballService.getCountries();
  }

  @Get('leagues')
  getLeagues(
    @Query('countryCode') countryCode?: string,
    @Query('season') season?: string,
    @Query('page') page?: string,
  ) {
    return this.footballService.getLeagues(
      countryCode,
      season ? Number(season) : undefined,
      page ? Number(page) : undefined,
    );
  }

  @Get('teams')
  getTeams(
    @Query('leagueApiId') leagueApiId?: string,
    @Query('season') season?: string,
    @Query('page') page?: string,
  ) {
    return this.footballService.getTeams(
      leagueApiId ? Number(leagueApiId) : undefined,
      season ? Number(season) : undefined,
      page ? Number(page) : undefined,
    );
  }

  @Get('players/search')
  searchPlayers(
    @Query('q') q?: string,
    @Query('teamApiId') teamApiId?: string,
    @Query('leagueApiId') leagueApiId?: string,
    @Query('season') season?: string,
    @Query('page') page?: string,
  ) {
    return this.footballService.searchPlayersNormalized(
      q,
      teamApiId ? Number(teamApiId) : undefined,
      leagueApiId ? Number(leagueApiId) : undefined,
      season ? Number(season) : undefined,
      page ? Number(page) : undefined,
    );
  }

  @Get('players/:apiId')
  getPlayer(@Param('apiId') apiId: string, @Query('season') season?: string) {
    return this.footballService.getPlayerByApiId(Number(apiId), season ? Number(season) : undefined);
  }
}

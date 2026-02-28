import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GamesService } from './games.service';
import {
  CreateLineupTemplateDto,
  SubmitLineupDto,
  HangmanStartDto,
  HangmanGuessDto,
  SortStartDto,
  SortSubmitDto,
} from './dto/games.dto';

@ApiTags('games')
@Controller('games')
export class GamesController {
  constructor(private gamesService: GamesService) {}

  @Post('lineup/templates')
  createTemplate(@Body() dto: CreateLineupTemplateDto) {
    return this.gamesService.createLineupTemplate(dto.name, dto.rulesJson);
  }

  @Get('lineup/templates')
  listTemplates() {
    return this.gamesService.listLineupTemplates();
  }

  @Post('lineup/submit')
  submitLineup(@Body() dto: SubmitLineupDto) {
    return this.gamesService.submitLineup(dto.templateId, dto.playerApiIds, dto.lineupSlots);
  }

  @Post('hangman/start')
  hangmanStart(@Body() dto: HangmanStartDto) {
    return this.gamesService.hangmanStart(dto.teamApiId, dto.leagueApiId);
  }

  @Post('hangman/guess')
  hangmanGuess(@Body() dto: HangmanGuessDto) {
    return this.gamesService.hangmanGuess(dto.sessionId, dto.guess);
  }

  @Post('sort/start')
  sortStart(@Body() dto: SortStartDto) {
    return this.gamesService.sortStart(dto.stat, dto.leagueApiId, dto.teamApiId, dto.count);
  }

  @Get('sort/start')
  sortStartQuery(
    @Query('stat') stat?: 'goals' | 'assists' | 'appearances',
    @Query('leagueApiId') leagueApiId?: string,
    @Query('teamApiId') teamApiId?: string,
    @Query('count') count?: string,
  ) {
    return this.gamesService.sortStart(
      (stat || 'goals') as any,
      leagueApiId ? Number(leagueApiId) : undefined,
      teamApiId ? Number(teamApiId) : undefined,
      count ? Number(count) : undefined,
    );
  }

  @Post('sort/submit')
  sortSubmit(@Body() dto: SortSubmitDto) {
    return this.gamesService.sortSubmit(dto.sessionId, dto.orderedPlayerApiIds);
  }
}

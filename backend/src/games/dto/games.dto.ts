import { IsArray, IsInt, IsOptional, IsString, IsNumber, IsObject } from 'class-validator';

export class CreateLineupTemplateDto {
  @IsString()
  name!: string;

  @IsObject()
  rulesJson!: Record<string, any>;
}

export class SubmitLineupDto {
  @IsInt()
  templateId!: number;

  @IsArray()
  playerApiIds!: number[];

  @IsOptional()
  @IsArray()
  lineupSlots?: { playerApiId: number; slotPosition: string }[];
}

export class HangmanStartDto {
  @IsOptional()
  @IsNumber()
  teamApiId?: number;

  @IsOptional()
  @IsNumber()
  leagueApiId?: number;

  @IsOptional()
  @IsString()
  pool?: 'important' | 'all';
}

export class HangmanGuessDto {
  @IsInt()
  sessionId!: number;

  @IsString()
  guess!: string;
}

export class SortStartDto {
  @IsString()
  stat!: 'goals' | 'assists' | 'appearances';

  @IsOptional()
  @IsNumber()
  leagueApiId?: number;

  @IsOptional()
  @IsNumber()
  teamApiId?: number;

  @IsOptional()
  @IsNumber()
  count?: number;

  @IsOptional()
  @IsString()
  pool?: 'important' | 'all';
}

export class SortSubmitDto {
  @IsInt()
  sessionId!: number;

  @IsArray()
  orderedPlayerApiIds!: number[];
}

export class MarketStartDto {
  @IsOptional()
  @IsNumber()
  leagueApiId?: number;

  @IsOptional()
  @IsString()
  pool?: 'important' | 'all';
}

export class MarketGuessDto {
  @IsInt()
  sessionId!: number;

  @IsNumber()
  guessValueM!: number;
}

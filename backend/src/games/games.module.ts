import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [SyncModule],
  controllers: [GamesController],
  providers: [GamesService],
})
export class GamesModule {}

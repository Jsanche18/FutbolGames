import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { RedisService } from '../common/redis/redis.service';
import { ApiFootballClient } from '../football/api-football.client';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class SyncService implements OnModuleInit {
  private queue!: Queue;

  constructor(
    private redis: RedisService,
    private api: ApiFootballClient,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    const connection = this.redis.getConnectionOptions();
    this.queue = new Queue('sync', { connection });

    new Worker(
      'sync',
      async (job) => {
        switch (job.name) {
          case 'sync-leagues':
            return this.handleLeagues(job.data.season);
          case 'sync-teams':
            return this.handleTeams(job.data.leagueApiId, job.data.season);
          case 'sync-players':
            return this.handlePlayers(job.data.teamApiId, job.data.season);
          case 'sync-player':
            return this.handlePlayer(job.data.apiId, job.data.season);
          default:
            return null;
        }
      },
      { connection },
    );
  }

  enqueueLeagues(season?: number) {
    return this.queue.add('sync-leagues', { season });
  }

  enqueueTeams(leagueApiId: number, season?: number) {
    return this.queue.add('sync-teams', { leagueApiId, season });
  }

  enqueuePlayers(teamApiId: number, season?: number) {
    return this.queue.add('sync-players', { teamApiId, season });
  }

  enqueuePlayer(apiId: number, season?: number) {
    return this.queue.add('sync-player', { apiId, season });
  }

  private async handleLeagues(season?: number) {
    const data = await this.api.getLeagues({ season });
    const response = (data as any)?.response || [];
    const leagues = response.map((item: any) => ({
      apiId: item.league?.id,
      name: item.league?.name,
      countryCode: item.country?.code,
      season: item.seasons?.[0]?.year || season,
      logoUrl: item.league?.logo,
    })).filter((l: any) => l.apiId);
    await this.prisma.league.createMany({ data: leagues, skipDuplicates: true });
  }

  private async handleTeams(leagueApiId: number, season?: number) {
    const data = await this.api.getTeams({ league: leagueApiId, season });
    const response = (data as any)?.response || [];
    const teams = response.map((item: any) => ({
      apiId: item.team?.id,
      name: item.team?.name,
      countryCode: item.team?.country,
      leagueApiId,
      season,
      logoUrl: item.team?.logo,
      isNational: item.team?.national || false,
    })).filter((t: any) => t.apiId);
    await this.prisma.team.createMany({ data: teams, skipDuplicates: true });
  }

  private async handlePlayers(teamApiId: number, season?: number) {
    const data = await this.api.getPlayers({ team: teamApiId, season });
    const response = (data as any)?.response || [];
    for (const item of response) {
      const player = item.player;
      const stats = item.statistics?.[0];
      await this.prisma.player.upsert({
        where: { apiId: player.id },
        update: {
          name: player.name,
          firstname: player.firstname,
          lastname: player.lastname,
          age: player.age,
          nationality: player.nationality,
          photoUrl: player.photo,
          position: stats?.games?.position,
          teamApiId: stats?.team?.id,
          leagueApiId: stats?.league?.id,
          season: stats?.league?.season,
        },
        create: {
          apiId: player.id,
          name: player.name,
          firstname: player.firstname,
          lastname: player.lastname,
          age: player.age,
          nationality: player.nationality,
          photoUrl: player.photo,
          position: stats?.games?.position,
          teamApiId: stats?.team?.id,
          leagueApiId: stats?.league?.id,
          season: stats?.league?.season,
        },
      });
      if (stats) {
        await this.prisma.playerStat.upsert({
          where: {
            playerApiId_leagueApiId_season_teamApiId: {
              playerApiId: player.id,
              leagueApiId: stats.league?.id || 0,
              season: stats.league?.season || 0,
              teamApiId: stats.team?.id || 0,
            },
          },
          update: {
            appearances: stats.games?.appearances ?? stats.games?.appearences,
            goals: stats.goals?.total,
            assists: stats.goals?.assists,
            minutes: stats.games?.minutes,
            rating: stats.games?.rating,
          },
          create: {
            playerApiId: player.id,
            season: stats.league?.season,
            leagueApiId: stats.league?.id,
            teamApiId: stats.team?.id,
            appearances: stats.games?.appearances ?? stats.games?.appearences,
            goals: stats.goals?.total,
            assists: stats.goals?.assists,
            minutes: stats.games?.minutes,
            rating: stats.games?.rating,
          },
        });
      }
    }
  }

  private async handlePlayer(apiId: number, season?: number) {
    const data = await this.api.getPlayer({ id: apiId, season });
    const response = (data as any)?.response || [];
    const item = response[0];
    if (!item) return;
    const player = item.player;
    const stats = item.statistics?.[0];
    await this.prisma.player.upsert({
      where: { apiId: player.id },
      update: {
        name: player.name,
        firstname: player.firstname,
        lastname: player.lastname,
        age: player.age,
        nationality: player.nationality,
        photoUrl: player.photo,
        position: stats?.games?.position,
        teamApiId: stats?.team?.id,
        leagueApiId: stats?.league?.id,
        season: stats?.league?.season,
      },
      create: {
        apiId: player.id,
        name: player.name,
        firstname: player.firstname,
        lastname: player.lastname,
        age: player.age,
        nationality: player.nationality,
        photoUrl: player.photo,
        position: stats?.games?.position,
        teamApiId: stats?.team?.id,
        leagueApiId: stats?.league?.id,
        season: stats?.league?.season,
      },
    });
  }
}

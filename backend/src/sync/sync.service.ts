import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { RedisService } from '../common/redis/redis.service';
import { ApiFootballClient } from '../football/api-football.client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SyncService implements OnModuleInit {
  private queue!: Queue;

  constructor(
    private redis: RedisService,
    private api: ApiFootballClient,
    private prisma: PrismaService,
    private configService: ConfigService,
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
          case 'sync-league-players':
            return this.handleLeaguePlayers(job.data.leagueApiId, job.data.season);
          case 'sync-bootstrap':
            return this.handleBootstrap(job.data.season);
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

  enqueueLeaguePlayers(leagueApiId: number, season?: number) {
    return this.queue.add('sync-league-players', { leagueApiId, season });
  }

  enqueueBootstrap(season?: number) {
    return this.queue.add('sync-bootstrap', { season });
  }

  private async handleLeagues(season?: number) {
    await this.throttle();
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
    return leagues.map((l: any) => l.apiId).filter(Boolean);
  }

  private async handleTeams(leagueApiId: number, season?: number) {
    await this.throttle();
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
    return teams.map((t: any) => t.apiId).filter(Boolean);
  }

  private async handlePlayers(teamApiId: number, season?: number) {
    await this.throttle();
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
    await this.throttle();
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

  private async handleLeaguePlayers(leagueApiId: number, season?: number) {
    const teamApiIds = await this.handleTeams(leagueApiId, season);
    for (const teamApiId of teamApiIds) {
      await this.handlePlayers(teamApiId, season);
      await this.throttle();
    }
  }

  private async handleBootstrap(season?: number) {
    const resolvedSeason = season ?? this.getDefaultSeason();
    const leagues = await this.api.getLeagues({ season: resolvedSeason });
    const response = (leagues as any)?.response || [];
    const allowed = this.getBootstrapLeagueNames();

    const selected = response
      .map((item: any) => ({
        apiId: item.league?.id,
        name: item.league?.name,
        country: item.country?.name,
        logoUrl: item.league?.logo,
        season: item.seasons?.[0]?.year || resolvedSeason,
        countryCode: item.country?.code,
      }))
      .filter((l: any) => l.apiId && this.matchesLeague(l.name, allowed));

    if (selected.length > 0) {
      await this.prisma.league.createMany({
        data: selected.map((l: any) => ({
          apiId: l.apiId,
          name: l.name,
          countryCode: l.countryCode,
          season: l.season,
          logoUrl: l.logoUrl,
        })),
        skipDuplicates: true,
      });
    }

    for (const league of selected) {
      await this.handleLeaguePlayers(league.apiId, resolvedSeason);
      await this.throttle();
    }
  }

  private getDefaultSeason() {
    const raw = this.configService.get<string>('DEFAULT_SEASON');
    if (raw && Number(raw)) return Number(raw);
    return 2025;
  }

  private getBootstrapLeagueNames() {
    const raw = this.configService.get<string>('BOOTSTRAP_LEAGUES');
    if (raw) {
      return raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    }
    return ['La Liga', 'Premier League', 'Serie A', 'Bundesliga', 'Ligue 1', 'Major League Soccer', 'MLS'];
  }

  private matchesLeague(name: string | undefined, allowed: string[]) {
    if (!name) return false;
    const normalized = name.toLowerCase();
    return allowed.some((candidate) => normalized === candidate.toLowerCase());
  }

  private async throttle() {
    const raw = this.configService.get<string>('SYNC_DELAY_MS');
    const delayMs = raw ? Number(raw) : 1200;
    if (!delayMs || delayMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

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
          case 'sync-guarantee':
            return this.handleGuarantee(job.data.season);
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

  enqueueGuarantee(season?: number) {
    return this.queue.add('sync-guarantee', { season });
  }

  async getCoverage() {
    const leagueIds = [...this.getBootstrapLeagueIds()];
    const leagues = await this.prisma.league.findMany({
      where: { apiId: { in: leagueIds } },
      select: { apiId: true, name: true, countryCode: true },
      orderBy: { name: 'asc' },
    });

    const coverage = [];
    for (const league of leagues) {
      const players = await this.prisma.player.count({ where: { leagueApiId: league.apiId } });
      const stats = await this.prisma.playerStat.count({ where: { leagueApiId: league.apiId } });
      const playersWithStats = await this.prisma.player.count({
        where: {
          leagueApiId: league.apiId,
          stats: { some: { leagueApiId: league.apiId } },
        },
      });
      coverage.push({
        leagueApiId: league.apiId,
        leagueName: league.name,
        countryCode: league.countryCode,
        players,
        stats,
        playersWithStats,
        playersWithoutStats: Math.max(players - playersWithStats, 0),
      });
    }

    return {
      leaguesConfigured: leagueIds,
      leaguesFound: coverage.length,
      coverage,
    };
  }

  async getImportantCoverage(season?: number, repair = false) {
    const resolvedSeason = season ?? this.getDefaultSeason();
    const missingBefore = await this.findMissingImportantPlayers();
    if (repair && missingBefore.length > 0) {
      await this.repairImportantPlayers(missingBefore, resolvedSeason);
    }
    const missingAfter = await this.findMissingImportantPlayers();
    return {
      season: resolvedSeason,
      totalImportant: this.getImportantPlayersList().length,
      missingBefore: missingBefore.length,
      missingAfter: missingAfter.length,
      missingPlayers: missingAfter,
    };
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
    const response = await this.fetchAllTeams(leagueApiId, season);
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
    const response = await this.fetchAllPlayers(teamApiId, season);
    for (const item of response) {
      await this.upsertPlayerFromApiItem(item, teamApiId);
    }
  }

  private async handlePlayer(apiId: number, season?: number) {
    await this.throttle();
    const data = await this.api.getPlayer({ id: apiId, season });
    const response = (data as any)?.response || [];
    const item = response[0];
    if (!item) return;
    await this.upsertPlayerFromApiItem(item);
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
    const allowedIds = this.getBootstrapLeagueIds();

    const selected = response
      .map((item: any) => ({
        apiId: item.league?.id,
        name: item.league?.name,
        country: item.country?.name,
        logoUrl: item.league?.logo,
        season: item.seasons?.[0]?.year || resolvedSeason,
        countryCode: item.country?.code,
      }))
      .filter(
        (l: any) =>
          l.apiId &&
          (allowedIds.has(Number(l.apiId)) || this.matchesLeague(l.name, l.country, allowed)),
      );

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

  private async handleGuarantee(season?: number) {
    const resolvedSeason = season ?? this.getDefaultSeason();
    const leagueIds = [...this.getBootstrapLeagueIds()];
    const leagueResults = [];

    for (const leagueApiId of leagueIds) {
      try {
        const teamApiIds = await this.handleTeams(leagueApiId, resolvedSeason);
        for (const teamApiId of teamApiIds) {
          await this.handlePlayers(teamApiId, resolvedSeason);
        }
        const players = await this.prisma.player.count({ where: { leagueApiId } });
        const stats = await this.prisma.playerStat.count({ where: { leagueApiId } });
        leagueResults.push({ leagueApiId, ok: true, teams: teamApiIds.length, players, stats });
      } catch (error: any) {
        leagueResults.push({
          leagueApiId,
          ok: false,
          error: error?.message || 'sync failed',
        });
      }
    }

    const missingBefore = await this.findMissingImportantPlayers();
    if (missingBefore.length > 0) {
      await this.repairImportantPlayers(missingBefore, resolvedSeason);
    }
    const missingAfter = await this.findMissingImportantPlayers();

    return {
      season: resolvedSeason,
      leagues: leagueResults,
      importantMissingBefore: missingBefore.length,
      importantMissingAfter: missingAfter.length,
      importantMissingNames: missingAfter,
    };
  }

  private async fetchAllTeams(leagueApiId: number, season?: number) {
    const all: any[] = [];
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      await this.throttle();
      const data = await this.api.getTeams({ league: leagueApiId, season, page });
      const response = (data as any)?.response || [];
      all.push(...response);
      totalPages = Number((data as any)?.paging?.total || 1);
      page += 1;
    }
    return all;
  }

  private async fetchAllPlayers(teamApiId: number, season?: number) {
    const all: any[] = [];
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      await this.throttle();
      const data = await this.api.getPlayers({ team: teamApiId, season, page });
      const response = (data as any)?.response || [];
      all.push(...response);
      totalPages = Number((data as any)?.paging?.total || 1);
      page += 1;
    }
    return all;
  }

  private async upsertPlayerFromApiItem(item: any, preferredTeamApiId?: number) {
    const player = item?.player;
    if (!player?.id) return;
    const statistics = (item?.statistics || []) as any[];
    const preferredStats =
      statistics.find((entry) => entry?.team?.id === preferredTeamApiId) ||
      statistics.find((entry) => entry?.games?.position) ||
      statistics[0];
    const fullName = this.buildPlayerName(player?.name, player?.firstname, player?.lastname);

    await this.prisma.player.upsert({
      where: { apiId: player.id },
      update: {
        name: fullName,
        firstname: player.firstname,
        lastname: player.lastname,
        age: player.age,
        nationality: player.nationality,
        photoUrl: player.photo,
        position: preferredStats?.games?.position,
        teamApiId: preferredStats?.team?.id,
        leagueApiId: preferredStats?.league?.id,
        season: preferredStats?.league?.season,
      },
      create: {
        apiId: player.id,
        name: fullName,
        firstname: player.firstname,
        lastname: player.lastname,
        age: player.age,
        nationality: player.nationality,
        photoUrl: player.photo,
        position: preferredStats?.games?.position,
        teamApiId: preferredStats?.team?.id,
        leagueApiId: preferredStats?.league?.id,
        season: preferredStats?.league?.season,
      },
    });

    for (const stats of statistics) {
      if (!stats?.league?.id || !stats?.team?.id) continue;
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
    return [
      'Spain|La Liga',
      'France|Ligue 1',
      'Saudi-Arabia|Pro League',
      'USA|Major League Soccer',
      'Argentina|Liga Profesional Argentina',
      'Brazil|Serie A',
      'England|Premier League',
      'Germany|Bundesliga',
      'Italy|Serie A',
      'MLS',
    ];
  }

  private getBootstrapLeagueIds() {
    const raw = this.configService.get<string>('BOOTSTRAP_LEAGUE_IDS');
    if (raw) {
      const ids = raw
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
      return new Set(ids);
    }
    return new Set([140, 61, 307, 253, 128, 71, 39, 78, 135]);
  }

  private getImportantPlayersList() {
    return [
      'Kylian Mbappe',
      'Thibaut Courtois',
      'Erling Haaland',
      'Vinicius Junior',
      'Jude Bellingham',
      'Kevin De Bruyne',
      'Harry Kane',
      'Mohamed Salah',
      'Rodri',
      'Lautaro Martinez',
      'Robert Lewandowski',
      'Bukayo Saka',
      'Pedri',
      'Florian Wirtz',
      'Jamal Musiala',
      'Lionel Messi',
      'Cristiano Ronaldo',
      'Neymar',
      'Antoine Griezmann',
      'Federico Valverde',
    ];
  }

  private async findMissingImportantPlayers() {
    const players = await this.prisma.player.findMany({
      select: { name: true, firstname: true, lastname: true },
    });
    const normalizedInDb = new Set(
      players.map((player) =>
        this.normalizeText(
          this.buildPlayerName(player.name, player.firstname || undefined, player.lastname || undefined),
        ),
      ),
    );
    return this.getImportantPlayersList().filter((name) => !normalizedInDb.has(this.normalizeText(name)));
  }

  private async repairImportantPlayers(missingNames: string[], season: number) {
    for (const name of missingNames) {
      await this.throttle();
      const data = await this.api.getPlayers({ search: name, season, page: 1 });
      const response = (data as any)?.response || [];
      for (const item of response) {
        await this.upsertPlayerFromApiItem(item);
      }
    }
  }

  private matchesLeague(name: string | undefined, country: string | undefined, allowed: string[]) {
    if (!name) return false;
    const normalizedName = name.toLowerCase();
    const normalizedCountry = (country || '').toLowerCase();
    return allowed.some((candidate) => {
      const parts = candidate.split('|').map((value) => value.trim());
      if (parts.length === 2) {
        return (
          normalizedCountry === parts[0].toLowerCase() &&
          (normalizedName === parts[1].toLowerCase() ||
            normalizedName.includes(parts[1].toLowerCase()) ||
            parts[1].toLowerCase().includes(normalizedName))
        );
      }
      return (
        normalizedName === candidate.toLowerCase() ||
        normalizedName.includes(candidate.toLowerCase()) ||
        candidate.toLowerCase().includes(normalizedName)
      );
    });
  }

  private buildPlayerName(name?: string, firstname?: string, lastname?: string) {
    const first = (firstname || '').trim();
    const last = (lastname || '').trim();
    const fallback = (name || '').trim();
    if (first && last) return `${first} ${last}`;
    if (first) return first;
    if (last) return last;
    return fallback;
  }

  private normalizeText(value: string) {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async throttle() {
    const raw = this.configService.get<string>('SYNC_DELAY_MS');
    const delayMs = raw ? Number(raw) : 1200;
    if (!delayMs || delayMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

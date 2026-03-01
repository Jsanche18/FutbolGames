import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { RedisService } from '../common/redis/redis.service';
import { ApiFootballClient } from '../football/api-football.client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  IMPORTANT_PLAYERS_CATALOG,
  normalizeImportantName,
} from '../common/important-players.catalog';

@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private queue: Queue | null = null;
  private queueEnabled = false;
  private importantCandidatesCache = new Map<string, any[]>();
  private directRefreshTimer: NodeJS.Timeout | null = null;
  private autoPreloadInProgress = false;

  constructor(
    private redis: RedisService,
    private api: ApiFootballClient,
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    try {
      if (!this.redis.isReady()) {
        this.queueEnabled = false;
        console.warn('[sync] Queue disabled: Redis unavailable');
      } else {
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
              case 'sync-preload':
                return this.handlePreload(job.data.season);
              default:
                return null;
            }
          },
          { connection },
        );
        this.queueEnabled = true;
      }
    } catch (error: any) {
      this.queueEnabled = false;
      console.warn('[sync] Queue init failed, using direct mode:', error?.message || error);
    }

    void this.tryAutoPreloadOnBoot();
    void this.scheduleAutoRefresh();
  }

  onModuleDestroy() {
    if (this.directRefreshTimer) {
      clearInterval(this.directRefreshTimer);
      this.directRefreshTimer = null;
    }
  }

  async enqueueLeagues(season?: number) {
    if (!this.queueEnabled || !this.queue) {
      await this.handleLeagues(season);
      return { mode: 'direct', job: 'sync-leagues', season };
    }
    return this.queue.add('sync-leagues', { season });
  }

  async enqueueTeams(leagueApiId: number, season?: number) {
    if (!this.queueEnabled || !this.queue) {
      await this.handleTeams(leagueApiId, season);
      return { mode: 'direct', job: 'sync-teams', leagueApiId, season };
    }
    return this.queue.add('sync-teams', { leagueApiId, season });
  }

  async enqueuePlayers(teamApiId: number, season?: number) {
    if (!this.queueEnabled || !this.queue) {
      await this.handlePlayers(teamApiId, season);
      return { mode: 'direct', job: 'sync-players', teamApiId, season };
    }
    return this.queue.add('sync-players', { teamApiId, season });
  }

  async enqueuePlayer(apiId: number, season?: number) {
    if (!this.queueEnabled || !this.queue) {
      await this.handlePlayer(apiId, season);
      return { mode: 'direct', job: 'sync-player', apiId, season };
    }
    return this.queue.add('sync-player', { apiId, season });
  }

  async enqueueLeaguePlayers(leagueApiId: number, season?: number) {
    if (!this.queueEnabled || !this.queue) {
      await this.handleLeaguePlayers(leagueApiId, season);
      return { mode: 'direct', job: 'sync-league-players', leagueApiId, season };
    }
    return this.queue.add('sync-league-players', { leagueApiId, season });
  }

  async enqueueBootstrap(season?: number) {
    if (!this.queueEnabled || !this.queue) {
      await this.handleBootstrap(season);
      return { mode: 'direct', job: 'sync-bootstrap', season };
    }
    return this.queue.add('sync-bootstrap', { season });
  }

  async enqueueGuarantee(season?: number) {
    if (!this.queueEnabled || !this.queue) {
      const result = await this.handleGuarantee(season);
      return { mode: 'direct', job: 'sync-guarantee', result };
    }
    return this.queue.add('sync-guarantee', { season });
  }

  async enqueuePreload(season?: number) {
    if (!this.queueEnabled || !this.queue) {
      const result = await this.handlePreload(season);
      return { mode: 'direct', job: 'sync-preload', result };
    }
    return this.queue.add('sync-preload', { season });
  }

  private async tryAutoPreloadOnBoot() {
    const enabled = this.configService.get<string>('AUTO_PRELOAD_ON_BOOT');
    const isEnabled = enabled ? enabled.toLowerCase() !== 'false' : true;
    if (!isEnabled) return;
    const season = Number(this.configService.get<string>('AUTO_PRELOAD_SEASON') || this.getDefaultSeason());
    if (!this.queueEnabled || !this.queue || !this.redis.isReady()) {
      if (this.autoPreloadInProgress) return;
      this.autoPreloadInProgress = true;
      try {
        await this.enqueuePreload(season);
        console.log(`[sync] Auto preload (direct mode) executed for season ${season}`);
      } finally {
        this.autoPreloadInProgress = false;
      }
      return;
    }

    const delayMs = Number(this.configService.get<string>('AUTO_PRELOAD_DELAY_MS') || 8000);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const lockSeconds = Number(this.configService.get<string>('AUTO_PRELOAD_LOCK_SECONDS') || 43200);
    const lockKey = `sync:preload:boot:${season}`;

    try {
      const lock = await this.redis
        .getClient()
        .set(lockKey, String(Date.now()), 'EX', Math.max(60, lockSeconds), 'NX');
      if (lock !== 'OK') {
        return;
      }
      await this.enqueuePreload(season);
      console.log(`[sync] Auto preload enqueued for season ${season}`);
    } catch (error: any) {
      console.error('[sync] Auto preload failed:', error?.message || error);
    }
  }

  private async scheduleAutoRefresh() {
    const enabled = this.configService.get<string>('AUTO_REFRESH_ENABLED');
    const isEnabled = enabled ? enabled.toLowerCase() !== 'false' : true;
    if (!isEnabled) return;
    const season = Number(this.configService.get<string>('AUTO_REFRESH_SEASON') || this.getDefaultSeason());
    const intervalMinutes = Number(this.configService.get<string>('AUTO_REFRESH_INTERVAL_MINUTES') || 360);
    const intervalMs = Math.max(15, intervalMinutes) * 60 * 1000;
    if (!this.queueEnabled || !this.queue) {
      if (this.directRefreshTimer) {
        clearInterval(this.directRefreshTimer);
      }
      this.directRefreshTimer = setInterval(async () => {
        try {
          await this.enqueuePreload(season);
          console.log(`[sync] Auto refresh (direct mode) executed for season ${season}`);
        } catch (error: any) {
          console.error('[sync] Auto refresh direct run failed:', error?.message || error);
        }
      }, intervalMs);
      console.log(
        `[sync] Auto refresh scheduled in direct mode every ${Math.round(intervalMs / 60000)} minutes for season ${season}`,
      );
      return;
    }

    try {
      await this.queue.add(
        'sync-preload',
        { season },
        {
          jobId: `sync-preload:repeat:${season}`,
          repeat: { every: intervalMs },
          removeOnComplete: true,
          removeOnFail: 10,
        },
      );
      console.log(
        `[sync] Auto refresh scheduled every ${Math.round(intervalMs / 60000)} minutes for season ${season}`,
      );
    } catch (error: any) {
      console.error('[sync] Auto refresh schedule failed:', error?.message || error);
    }
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

  async syncImportantPlayers(season?: number) {
    const resolvedSeason = season ?? this.getDefaultSeason();
    this.importantCandidatesCache.clear();
    const rows = [];
    for (const seed of IMPORTANT_PLAYERS_CATALOG) {
      const match = await this.resolveImportantSeed(seed, resolvedSeason);
      if (match) {
        this.applySeedIdentity(match, seed.name);
        await this.upsertPlayerFromApiItem(match);
        rows.push({
          name: seed.name,
          club: seed.club,
          marketValueM: seed.marketValueM,
          found: true,
          apiId: match?.player?.id,
          resolvedName: this.buildPlayerName(match?.player?.name, match?.player?.firstname, match?.player?.lastname),
          resolvedTeam: match?.statistics?.[0]?.team?.name,
          photoUrl: match?.player?.photo,
        });
      } else {
        rows.push({
          name: seed.name,
          club: seed.club,
          marketValueM: seed.marketValueM,
          found: false,
          apiId: null,
          resolvedName: null,
          resolvedTeam: null,
          photoUrl: null,
        });
      }
    }
    return {
      season: resolvedSeason,
      total: rows.length,
      found: rows.filter((row) => row.found).length,
      missing: rows.filter((row) => !row.found).length,
      rows,
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

  private async handlePreload(season?: number) {
    const resolvedSeason = season ?? this.getDefaultSeason();
    const guarantee = await this.handleGuarantee(resolvedSeason);
    const important = await this.syncImportantPlayers(resolvedSeason);
    return {
      season: resolvedSeason,
      guarantee,
      important: {
        total: important.total,
        found: important.found,
        missing: important.missing,
      },
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
    return IMPORTANT_PLAYERS_CATALOG.map((item) => item.name);
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
      const seed = IMPORTANT_PLAYERS_CATALOG.find(
        (item) => normalizeImportantName(item.name) === normalizeImportantName(name),
      );
      if (seed) {
        const match = await this.resolveImportantSeed(seed, season);
        if (match) {
          this.applySeedIdentity(match, seed.name);
          await this.upsertPlayerFromApiItem(match);
          continue;
        }
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

  private pickBestPlayerMatch(candidates: any[], name: string, club: string) {
    const targetName = this.normalizeText(name);
    const targetClub = this.normalizeText(club);
    const targetTokens = targetName.split(' ').filter(Boolean);
    const targetLast = targetTokens[targetTokens.length - 1] || targetName;
    let best: any = null;
    let bestScore = -1;
    for (const candidate of candidates || []) {
      const player = candidate?.player || {};
      const stats = candidate?.statistics?.[0] || {};
      const playerName = this.normalizeText(
        this.buildPlayerName(player?.name, player?.firstname, player?.lastname),
      );
      const teamName = this.normalizeText(stats?.team?.name || '');
      const playerTokens = playerName.split(' ').filter(Boolean);
      const playerLast = playerTokens[playerTokens.length - 1] || playerName;
      let score = 0;
      if (playerName === targetName) score += 4;
      if (playerName.includes(targetName) || targetName.includes(playerName)) score += 2;
      if (targetLast && playerLast === targetLast) score += 2;
      if (targetTokens.length === 1 && playerName.includes(targetTokens[0])) score += 2;
      if (teamName === targetClub) score += 3;
      if (teamName.includes(targetClub) || targetClub.includes(teamName)) score += 1;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return bestScore >= 1 ? best : null;
  }

  private async resolveImportantSeed(
    seed: { name: string; club: string },
    season: number,
  ): Promise<any | null> {
    const dbCandidate = await this.resolveImportantFromDb(seed);
    if (dbCandidate) {
      return {
        player: {
          id: dbCandidate.apiId,
          name: dbCandidate.name,
          firstname: dbCandidate.firstname,
          lastname: dbCandidate.lastname,
          age: dbCandidate.age,
          nationality: dbCandidate.nationality,
          photo: dbCandidate.photoUrl,
        },
        statistics: [
          {
            team: { id: dbCandidate.teamApiId, name: dbCandidate.team?.name },
            league: { id: dbCandidate.leagueApiId, season: dbCandidate.season },
            games: { position: dbCandidate.position },
            goals: {},
          },
        ],
      };
    }

    const apiCandidates = await this.resolveImportantFromApiByTeam(seed.club, season, seed.name);
    return this.pickBestPlayerMatch(apiCandidates, seed.name, seed.club);
  }

  private async resolveImportantFromDb(seed: { name: string; club: string }) {
    const candidates = await this.prisma.player.findMany({
      where: {
        OR: [
          { name: { contains: seed.name, mode: 'insensitive' } },
          { firstname: { contains: seed.name.split(' ')[0], mode: 'insensitive' } },
          { lastname: { contains: seed.name.split(' ').slice(-1)[0], mode: 'insensitive' } },
        ],
      },
      include: { team: true },
      take: 20,
    });
    const normalizedName = this.normalizeText(seed.name);
    const normalizedClub = this.normalizeText(seed.club);
    let best: any = null;
    let bestScore = -1;
    for (const candidate of candidates) {
      const fullName = this.normalizeText(
        this.buildPlayerName(candidate.name, candidate.firstname || undefined, candidate.lastname || undefined),
      );
      const teamName = this.normalizeText(candidate.team?.name || '');
      let score = 0;
      if (fullName === normalizedName) score += 4;
      if (fullName.includes(normalizedName) || normalizedName.includes(fullName)) score += 2;
      if (teamName === normalizedClub) score += 3;
      if (teamName.includes(normalizedClub) || normalizedClub.includes(teamName)) score += 1;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return bestScore >= 2 ? best : null;
  }

  private async resolveImportantFromApiByTeam(club: string, season: number, playerName?: string) {
    const cacheKey = `${this.normalizeText(club)}:${season}`;
    const cached = this.importantCandidatesCache.get(cacheKey);
    if (cached && cached.length > 0) {
      return cached;
    }

    const config = this.getClubResolutionConfig(club);
    const teams: any[] = [];
    for (const term of config.terms) {
      await this.throttle();
      const teamsData = await this.api.getTeams({ search: term });
      teams.push(...(((teamsData as any)?.response || []).map((entry: any) => ({ ...entry, __term: term }))));
    }

    const normalizedClub = this.normalizeText(club);
    const selectedTeam = teams
      .map((entry: any) => ({
        apiId: entry?.team?.id,
        name: entry?.team?.name || '',
        country: entry?.team?.country || entry?.country?.name || '',
      }))
      .filter((team: any) => team.apiId)
      .sort((a: any, b: any) => {
        const aName = this.normalizeText(a.name);
        const bName = this.normalizeText(b.name);
        const aExact = this.getTeamNameScore(aName, normalizedClub);
        const bExact = this.getTeamNameScore(bName, normalizedClub);
        const aCountry = this.normalizeText(a.country);
        const bCountry = this.normalizeText(b.country);
        const expectedCountry = this.normalizeText(config.country || '');
        const aCountryScore = expectedCountry && aCountry === expectedCountry ? 2 : 0;
        const bCountryScore = expectedCountry && bCountry === expectedCountry ? 2 : 0;
        return bCountryScore - aCountryScore || bExact - aExact;
      })[0];

    if (!selectedTeam?.apiId) return [];
    const candidates = await this.fetchAllPlayers(selectedTeam.apiId, season);
    if (candidates.length > 0) {
      this.importantCandidatesCache.set(cacheKey, candidates);
      return candidates;
    }

    if (playerName) {
      const squadCandidates = await this.fetchSquadPlayers(selectedTeam.apiId, selectedTeam.name);
      if (squadCandidates.length > 0) {
        this.importantCandidatesCache.set(cacheKey, squadCandidates);
      }
      const filtered = squadCandidates
        .filter((entry: any) => {
          const fullName = this.normalizeText(entry?.player?.name || '');
          const target = this.normalizeText(playerName);
          return fullName === target || fullName.includes(target) || target.includes(fullName);
        })
        .slice(0, 5);
      return filtered;
    }
    return [];
  }

  private getClubResolutionConfig(club: string) {
    const key = this.normalizeText(club);
    const map: Record<string, { terms: string[]; country?: string }> = {
      'fc barcelona': { terms: ['Barcelona', 'FC Barcelona'], country: 'Spain' },
      'real madrid': { terms: ['Real Madrid'], country: 'Spain' },
      'athletic club': { terms: ['Athletic Club', 'Ath Bilbao'], country: 'Spain' },
      'real sociedad': { terms: ['Real Sociedad'], country: 'Spain' },
      'bayern munich': { terms: ['Bayern Munich', 'Bayern'], country: 'Germany' },
      'borussia dortmund': { terms: ['Borussia Dortmund', 'Dortmund'], country: 'Germany' },
      'bayer leverkusen': { terms: ['Bayer Leverkusen', 'Leverkusen'], country: 'Germany' },
      inter: { terms: ['Inter', 'Inter Milan'], country: 'Italy' },
      'ac milan': { terms: ['AC Milan', 'Milan'], country: 'Italy' },
      juventus: { terms: ['Juventus'], country: 'Italy' },
      napoli: { terms: ['Napoli'], country: 'Italy' },
      roma: { terms: ['Roma'], country: 'Italy' },
      bologna: { terms: ['Bologna'], country: 'Italy' },
      psg: { terms: ['Paris Saint Germain', 'PSG', 'Paris'], country: 'France' },
      marseille: { terms: ['Marseille'], country: 'France' },
      lille: { terms: ['Lille'], country: 'France' },
      lyon: { terms: ['Lyon'], country: 'France' },
      'sporting cp': { terms: ['Sporting CP', 'Sporting'], country: 'Portugal' },
      'fc porto': { terms: ['FC Porto', 'Porto'], country: 'Portugal' },
      benfica: { terms: ['Benfica'], country: 'Portugal' },
      'al-nassr': { terms: ['Nassr', 'Al Nassr', 'Al-Nassr'], country: 'Saudi-Arabia' },
      'al-ittihad': { terms: ['Ittihad', 'Al Ittihad', 'Al-Ittihad'], country: 'Saudi-Arabia' },
      'al-hilal': { terms: ['Hilal', 'Al Hilal', 'Al-Hilal'], country: 'Saudi-Arabia' },
      'inter miami': { terms: ['Inter Miami', 'Inter Miami CF'], country: 'USA' },
      'la galaxy': { terms: ['Los Angeles Galaxy', 'LA Galaxy', 'Galaxy'], country: 'USA' },
      'toronto fc': { terms: ['Toronto FC', 'Toronto'], country: 'Canada' },
    };
    return map[key] || { terms: [club] };
  }

  private getTeamNameScore(teamName: string, normalizedClub: string) {
    let score = 0;
    if (teamName === normalizedClub) score += 4;
    else if (teamName.includes(normalizedClub) || normalizedClub.includes(teamName)) score += 2;
    if (teamName.includes(' women') || teamName.endsWith(' w')) score -= 5;
    const youth = ['u17', 'u18', 'u19', 'u20', 'u21', 'u23', ' ii', ' iii', ' b'];
    if (youth.some((token) => teamName.includes(token))) score -= 4;
    return score;
  }

  private async fetchSquadPlayers(teamApiId: number, teamName?: string) {
    await this.throttle();
    const data = await this.api.getPlayersSquads({ team: teamApiId });
    const response = (data as any)?.response || [];
    const players = response?.[0]?.players || [];
    return players.map((player: any) => ({
      player: {
        id: player?.id,
        name: player?.name,
        firstname: undefined,
        lastname: undefined,
        age: player?.age,
        nationality: player?.nationality,
        photo: player?.photo,
      },
      statistics: [
        {
          team: { id: teamApiId, name: teamName },
          league: {},
          games: {},
          goals: {},
        },
      ],
    }));
  }

  private applySeedIdentity(item: any, seedName: string) {
    if (!item?.player) return;
    const parts = seedName.split(' ').filter(Boolean);
    const firstname = parts.slice(0, -1).join(' ');
    const lastname = parts.slice(-1).join('');
    item.player.name = seedName;
    item.player.firstname = firstname || item.player.firstname;
    item.player.lastname = lastname || item.player.lastname;
  }

  private async throttle() {
    const raw = this.configService.get<string>('SYNC_DELAY_MS');
    const delayMs = raw ? Number(raw) : 1200;
    if (!delayMs || delayMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

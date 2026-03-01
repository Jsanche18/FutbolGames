import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ApiFootballClient } from './api-football.client';
import { ApiFootballTrophyProvider } from './trophy.provider';
import { mapAllowedPositions } from './positions';
import { ConfigService } from '@nestjs/config';
import { getImportantPlayersMap, IMPORTANT_PLAYERS_CATALOG } from '../common/important-players.catalog';

const CACHE_TTL = 60 * 60;

@Injectable()
export class FootballService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private api: ApiFootballClient,
    private trophies: ApiFootballTrophyProvider,
    private configService: ConfigService,
  ) {}

  async getCountries() {
    const cacheKey = 'countries:all';
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;
    const data = await this.api.getCountries();
    await this.redis.setJson(cacheKey, data, CACHE_TTL);
    if (Array.isArray((data as any)?.response)) {
      const countries = (data as any).response.map((c: any) => ({
        name: c.name,
        code: c.code,
      }));
      await this.prisma.country.createMany({ data: countries, skipDuplicates: true });
    }
    return data;
  }

  async getLeagues(countryCode?: string, season?: number, page?: number) {
    const cacheKey = `leagues:v4:${countryCode || 'all'}:${season || 'all'}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;
    const data = await this.api.getLeagues({ season });
    const responseAll = (data as any)?.response || [];
    const filtered = countryCode
      ? responseAll.filter((item: any) => {
          const code = item.country?.code || '';
          const name = item.country?.name || '';
          return code === countryCode || name.toLowerCase() === countryCode.toLowerCase();
        })
      : responseAll;
    const result = { ...(data as any), response: filtered };
    await this.redis.setJson(cacheKey, result, CACHE_TTL);
    const leagues = filtered.map((item: any) => ({
      apiId: item.league?.id,
      name: item.league?.name,
      countryCode: item.country?.code,
      season: item.seasons?.[0]?.year || season,
      logoUrl: item.league?.logo,
    })).filter((l: any) => l.apiId);
    await this.prisma.league.createMany({ data: leagues, skipDuplicates: true });
    return result;
  }

  async getTeams(leagueApiId?: number, season?: number, page?: number) {
    const cacheKey = `teams:${leagueApiId || 'all'}:${season || 'all'}:${page || 1}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;
    const data = await this.api.getTeams({ league: leagueApiId, season, page });
    await this.redis.setJson(cacheKey, data, CACHE_TTL);
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
    return data;
  }

  private getDefaultSeason() {
    const raw = this.configService.get<string>('DEFAULT_SEASON');
    if (raw && Number(raw)) return Number(raw);
    return 2025;
  }

  async searchPlayers(q?: string, teamApiId?: number, leagueApiId?: number, season?: number, page?: number) {
    const resolvedSeason = season ?? this.getDefaultSeason();
    const cacheKey = `players:search:${q || 'all'}:${teamApiId || 'all'}:${leagueApiId || 'all'}:${resolvedSeason || 'all'}:${page || 1}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;
    const data = await this.api.getPlayers({
      search: q,
      team: teamApiId,
      league: leagueApiId,
      season: resolvedSeason,
      page,
    });
    await this.redis.setJson(cacheKey, data, CACHE_TTL);
    return data;
  }

  async searchPlayersNormalized(
    q?: string,
    teamApiId?: number,
    leagueApiId?: number,
    season?: number,
    page?: number,
    nationality?: string,
    position?: string,
    importantOnly?: boolean,
  ) {
    const correctedQuery = this.correctQuery(q);
    const data = await this.searchPlayers(correctedQuery, teamApiId, leagueApiId, season, page);
    let response = (data as any)?.response || [];
    if (response.length === 0 && correctedQuery !== q) {
      const fallbackData = await this.searchPlayers(q, teamApiId, leagueApiId, season, page);
      response = (fallbackData as any)?.response || [];
    }
    const apiItems = response.map((item: any) => {
      const player = item.player || {};
      const stats = item.statistics?.[0] || {};
      const primaryPosition = stats?.games?.position || player.position || '';
      const rating = Number(stats?.games?.rating || 0) || 0;
      const minutes = Number(stats?.games?.minutes || 0) || 0;
      const goals = Number(stats?.goals?.total || 0) || 0;
      const assists = Number(stats?.goals?.assists || 0) || 0;
      return {
        apiId: player.id,
        name: this.buildPlayerName(player.name, player.firstname, player.lastname),
        photoUrl: player.photo,
        nationality: player.nationality,
        teamApiId: stats?.team?.id,
        leagueApiId: stats?.league?.id,
        teamName: stats?.team?.name,
        primaryPosition,
        allowedPositions: mapAllowedPositions(primaryPosition),
        goals,
        assists,
        minutes,
        rating,
      };
    });
    const dbPlayers = await this.prisma.player.findMany({
      where: {
        ...(correctedQuery
          ? {
              OR: [
                { name: { contains: correctedQuery, mode: 'insensitive' } },
                { firstname: { contains: correctedQuery, mode: 'insensitive' } },
                { lastname: { contains: correctedQuery, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(teamApiId ? { teamApiId } : {}),
        ...(leagueApiId ? { leagueApiId } : {}),
        ...(nationality ? { nationality: { contains: nationality, mode: 'insensitive' } } : {}),
        ...(position ? { position: { contains: position, mode: 'insensitive' } } : {}),
      },
      include: { team: true, stats: true },
      take: 50,
    });

    const dbItems = dbPlayers.map((player) => {
      const bestStat = (player.stats || []).reduce((acc, curr) => {
        const accMinutes = Number(acc?.minutes || 0) || 0;
        const currMinutes = Number(curr?.minutes || 0) || 0;
        return currMinutes > accMinutes ? curr : acc;
      }, null as any);
      return {
        apiId: player.apiId,
        name: this.buildPlayerName(player.name, player.firstname ?? undefined, player.lastname ?? undefined),
        photoUrl: player.photoUrl ?? undefined,
        nationality: player.nationality ?? undefined,
        teamApiId: player.teamApiId ?? undefined,
        leagueApiId: player.leagueApiId ?? undefined,
        teamName: player.team?.name ?? undefined,
        primaryPosition: player.position ?? undefined,
        allowedPositions: mapAllowedPositions(player.position),
        goals: Number(bestStat?.goals || 0) || 0,
        assists: Number(bestStat?.assists || 0) || 0,
        minutes: Number(bestStat?.minutes || 0) || 0,
        rating: Number(bestStat?.rating || 0) || 0,
      };
    });

    const mergedByApiId = new Map<number, any>();
    for (const item of [...apiItems, ...dbItems]) {
      if (!item?.apiId) continue;
      if (!mergedByApiId.has(item.apiId)) {
        mergedByApiId.set(item.apiId, item);
      }
    }

    let items = [...mergedByApiId.values()];
    if (correctedQuery) {
      const normalizedQuery = this.normalizeText(correctedQuery);
      items = items.filter((item) => this.matchesQuery(item, normalizedQuery));
    }
    if (teamApiId) {
      items = items.filter((item) => Number(item.teamApiId) === teamApiId);
    }
    if (leagueApiId) {
      items = items.filter((item) => Number(item.leagueApiId) === leagueApiId);
    }
    if (nationality) {
      const normalizedNationality = this.normalizeText(nationality);
      items = items.filter((item) =>
        this.normalizeText(String(item.nationality || '')).includes(normalizedNationality),
      );
    }
    if (position) {
      const normalizedPosition = this.normalizeText(position);
      items = items.filter((item) =>
        this.normalizeText(String(item.primaryPosition || '')).includes(normalizedPosition),
      );
    }
    if (importantOnly) {
      items = items.filter((item) => this.isImportantPlayer(item));
    }

    items.sort((a, b) => this.computeImportanceScore(b) - this.computeImportanceScore(a));

    return {
      items: items.slice(0, 20).map((item) => ({
        apiId: item.apiId,
        name: item.name,
        photoUrl: item.photoUrl,
        nationality: item.nationality,
        teamName: item.teamName,
        primaryPosition: item.primaryPosition,
        allowedPositions: item.allowedPositions,
      })),
    };
  }

  async getPlayerByApiId(apiId: number, season?: number) {
    const cacheKey = `player:${apiId}:${season || 'all'}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;
    const [playerData, trophies] = await Promise.all([
      this.api.getPlayer({ id: apiId, season }),
      this.trophies.getPlayerTrophies(apiId),
    ]);
    const result = {
      ...(playerData as any),
      trophies,
    };
    await this.redis.setJson(cacheKey, result, CACHE_TTL);
    return result;
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

  private correctQuery(value?: string) {
    const normalized = this.normalizeText(value || '');
    const aliases: Record<string, string> = {
      coutois: 'courtois',
      curtuois: 'courtois',
      mbappe: 'mbappe',
      mbape: 'mbappe',
      kylian: 'kylian',
    };
    return aliases[normalized] || (value || '').trim();
  }

  private computeImportanceScore(item: any) {
    const rating = Number(item?.rating || 0) || 0;
    const goals = Number(item?.goals || 0) || 0;
    const assists = Number(item?.assists || 0) || 0;
    const minutes = Number(item?.minutes || 0) || 0;
    const starBonus = this.isStarByName(item?.name) ? 100 : 0;
    return starBonus + rating * 12 + goals * 4 + assists * 3 + minutes / 120;
  }

  private isImportantPlayer(item: any) {
    if (!item) return false;
    if (this.isStarByName(item.name)) return true;
    const rating = Number(item.rating || 0) || 0;
    const goals = Number(item.goals || 0) || 0;
    const assists = Number(item.assists || 0) || 0;
    const minutes = Number(item.minutes || 0) || 0;
    return rating >= 7.2 || goals >= 10 || assists >= 8 || minutes >= 1400;
  }

  private isStarByName(name?: string) {
    const normalized = this.normalizeText(name || '');
    if (getImportantPlayersMap().has(normalized)) return true;
    for (const seed of IMPORTANT_PLAYERS_CATALOG) {
      const seedName = this.normalizeText(seed.name);
      if (normalized === seedName) return true;
      if (normalized.length >= 4 && (seedName.includes(normalized) || normalized.includes(seedName))) {
        return true;
      }
      const seedTokens = seedName.split(' ').filter(Boolean);
      const lastSeedToken = seedTokens[seedTokens.length - 1];
      if (lastSeedToken && normalized === lastSeedToken) {
        return true;
      }
    }
    return false;
  }

  private matchesQuery(item: any, normalizedQuery: string) {
    const baseName = this.normalizeText(item?.name || '');
    if (baseName.includes(normalizedQuery)) return true;

    const tokens = baseName.split(' ').filter(Boolean);
    if (tokens.some((token) => token.includes(normalizedQuery) || normalizedQuery.includes(token))) {
      return true;
    }

    const correctedFromQuery = this.correctQuery(normalizedQuery);
    const correctedNormalized = this.normalizeText(correctedFromQuery);
    if (correctedNormalized && baseName.includes(correctedNormalized)) {
      return true;
    }
    return false;
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ApiFootballClient } from './api-football.client';
import { ApiFootballTrophyProvider } from './trophy.provider';
import { mapAllowedPositions } from './positions';
import { ConfigService } from '@nestjs/config';

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

  async searchPlayersNormalized(q?: string, teamApiId?: number, leagueApiId?: number, season?: number, page?: number) {
    const data = await this.searchPlayers(q, teamApiId, leagueApiId, season, page);
    const response = (data as any)?.response || [];
    const items = response.map((item: any) => {
      const player = item.player || {};
      const stats = item.statistics?.[0] || {};
      const primaryPosition = stats?.games?.position || player.position || '';
      return {
        apiId: player.id,
        name: player.name,
        photoUrl: player.photo,
        nationality: player.nationality,
        teamName: stats?.team?.name,
        primaryPosition,
        allowedPositions: mapAllowedPositions(primaryPosition),
      };
    });
    if (items.length > 0 || !q) {
      return { items };
    }

    const dbPlayers = await this.prisma.player.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
        ...(teamApiId ? { teamApiId } : {}),
        ...(leagueApiId ? { leagueApiId } : {}),
      },
      include: { team: true },
      take: 10,
    });

    return {
      items: dbPlayers.map((player) => ({
        apiId: player.apiId,
        name: player.name,
        photoUrl: player.photoUrl ?? undefined,
        nationality: player.nationality ?? undefined,
        teamName: player.team?.name ?? undefined,
        primaryPosition: player.position ?? undefined,
        allowedPositions: mapAllowedPositions(player.position),
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
}

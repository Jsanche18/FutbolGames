import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ApiFootballClient } from './api-football.client';
import { ApiFootballTrophyProvider } from './trophy.provider';
import { mapAllowedPositions } from './positions';
import { ConfigService } from '@nestjs/config';
import {
  IMPORTANT_PLAYERS_CATALOG,
  getImportantPlayersMap,
  normalizeImportantName,
} from '../common/important-players.catalog';

const CACHE_TTL = 60 * 60;
const IMPORTANT_SEED_ENTRIES = IMPORTANT_PLAYERS_CATALOG.map((entry) => ({
  ...entry,
  normalizedName: normalizeImportantName(entry.name),
  normalizedClub: normalizeImportantName(entry.club),
}));
const IMPORTANT_HYDRATE_CACHE_TTL_MS = 1000 * 60 * 30;

@Injectable()
export class FootballService {
  private importantHydrateCache = new Map<string, { item: any; expiresAt: number }>();

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
    const resolvedSeason = season ?? this.getDefaultSeason();
    const shouldCallApi = Boolean(correctedQuery || teamApiId || leagueApiId);
    let apiItems: any[] = [];
    if (shouldCallApi) {
      const data = await this.searchPlayers(correctedQuery, teamApiId, leagueApiId, season, page);
      let response = (data as any)?.response || [];
      if (response.length === 0 && correctedQuery !== q) {
        const fallbackData = await this.searchPlayers(q, teamApiId, leagueApiId, season, page);
        response = (fallbackData as any)?.response || [];
      }
      apiItems = response.map((item: any) => {
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
    }

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
      take: importantOnly ? 200 : 50,
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
      items = items.filter((item) => this.isCatalogImportant(item.name, item.teamName));
      items = await this.hydrateImportantResults(items, {
        query: correctedQuery,
        season: resolvedSeason,
        teamApiId,
        leagueApiId,
        nationality,
        position,
      });
    }
    items = items.map((item) => ({
      ...item,
      name: this.toCanonicalImportantName(item.name, item.teamName),
    }));

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
    const starBonus = this.isCatalogImportant(item?.name, item?.teamName) ? 100 : 0;
    return starBonus + rating * 12 + goals * 4 + assists * 3 + minutes / 120;
  }

  private toCanonicalImportantName(name?: string, teamName?: string) {
    const seed = this.findBestImportantSeed(name, teamName);
    if (seed) return seed.name;
    return name || '';
  }

  private isCatalogImportant(name?: string, teamName?: string) {
    return Boolean(this.findBestImportantSeed(name, teamName));
  }

  private findBestImportantSeed(name?: string, teamName?: string) {
    const normalized = this.normalizeText(name || '');
    if (!normalized) return null;
    const normalizedTeam = this.normalizeText(teamName || '');

    if (getImportantPlayersMap().has(normalized)) {
      if (!normalizedTeam) {
        return IMPORTANT_SEED_ENTRIES.find((seed) => seed.normalizedName === normalized) || null;
      }
      const seeds = IMPORTANT_SEED_ENTRIES.filter((seed) => seed.normalizedName === normalized);
      if (seeds.length === 0) return null;
      return seeds.find((seed) => this.matchesClub(normalizedTeam, seed.normalizedClub)) || null;
    }

    let bestScore = -1;
    let bestSeed: (typeof IMPORTANT_SEED_ENTRIES)[number] | null = null;
    for (const seed of IMPORTANT_SEED_ENTRIES) {
      const score = this.scoreImportantNameCandidate(normalized, seed.normalizedName);
      if (score > bestScore) {
        bestScore = score;
        bestSeed = seed;
      }
    }

    if (bestScore < 4) {
      return null;
    }

    if (!normalizedTeam) {
      return bestScore >= 5 ? bestSeed : null;
    }

    if (!bestSeed) return null;
    return this.matchesClub(normalizedTeam, bestSeed.normalizedClub) ? bestSeed : null;
  }

  private matchesQuery(item: any, normalizedQuery: string) {
    const baseName = this.normalizeText(item?.name || '');
    if (baseName.includes(normalizedQuery)) {
      return true;
    }

    const queryTokens = normalizedQuery.split(' ').filter(Boolean);
    if (queryTokens.length > 0) {
      const baseTokens = baseName.split(' ').filter(Boolean);
      const allTokensPresent = queryTokens.every((queryToken) =>
        baseTokens.some((baseToken) => baseToken === queryToken || baseToken.startsWith(queryToken)),
      );
      if (allTokensPresent) {
        return true;
      }
    }

    const correctedFromQuery = this.correctQuery(normalizedQuery);
    const correctedNormalized = this.normalizeText(correctedFromQuery);
    if (correctedNormalized && correctedNormalized !== normalizedQuery && baseName.includes(correctedNormalized)) {
      return true;
    }
    return false;
  }

  private scoreImportantNameCandidate(normalizedName: string, normalizedSeedName: string) {
    if (!normalizedName || !normalizedSeedName) return 0;
    if (normalizedName === normalizedSeedName) return 6;
    if (normalizedName.startsWith(`${normalizedSeedName} `)) return 5;
    if (normalizedSeedName.startsWith(`${normalizedName} `)) return 2;
    return 0;
  }

  private matchesClub(normalizedTeamName: string, normalizedSeedClub: string) {
    if (!normalizedTeamName || !normalizedSeedClub) return false;
    return (
      normalizedTeamName === normalizedSeedClub ||
      normalizedTeamName.includes(normalizedSeedClub) ||
      normalizedSeedClub.includes(normalizedTeamName)
    );
  }

  private async hydrateImportantResults(
    currentItems: any[],
    params: {
      query?: string;
      season: number;
      teamApiId?: number;
      leagueApiId?: number;
      nationality?: string;
      position?: string;
    },
  ) {
    const mergedByApiId = new Map<number, any>();
    for (const item of currentItems) {
      if (item?.apiId) {
        mergedByApiId.set(item.apiId, item);
      }
    }

    if (mergedByApiId.size >= 20) {
      return [...mergedByApiId.values()];
    }

    const normalizedQuery = this.normalizeText(params.query || '');
    const candidateSeeds = IMPORTANT_SEED_ENTRIES
      .filter((seed) => {
        if (!normalizedQuery) return true;
        return (
          seed.normalizedName.includes(normalizedQuery) ||
          normalizedQuery.includes(seed.normalizedName)
        );
      })
      .sort((a, b) => Number(b.marketValueM || 0) - Number(a.marketValueM || 0))
      .slice(0, normalizedQuery ? 40 : 25);

    let apiCalls = 0;
    for (const seed of candidateSeeds) {
      if (mergedByApiId.size >= 30) break;
      const alreadyPresent = [...mergedByApiId.values()].some((item) =>
        this.isSameImportantSeed(item, seed.normalizedName, seed.normalizedClub),
      );
      if (alreadyPresent) continue;

      if (apiCalls >= 8) continue;
      const hydrated = await this.fetchImportantFromApi(seed, params.season);
      apiCalls += 1;
      if (!hydrated) continue;
      if (!this.applyPlayerFilters(hydrated, params)) continue;
      mergedByApiId.set(hydrated.apiId, hydrated);
    }

    return [...mergedByApiId.values()];
  }

  private isSameImportantSeed(item: any, seedName: string, seedClub: string) {
    const normalizedName = this.normalizeText(item?.name || '');
    const normalizedClub = this.normalizeText(item?.teamName || '');
    return (
      this.scoreImportantNameCandidate(normalizedName, seedName) >= 5 &&
      (!normalizedClub || this.matchesClub(normalizedClub, seedClub))
    );
  }

  private async fetchImportantFromApi(
    seed: { normalizedName: string; normalizedClub: string; name: string },
    season: number,
  ) {
    const cacheKey = `${seed.normalizedName}:${season}`;
    const now = Date.now();
    const cached = this.importantHydrateCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.item;
    }

    try {
      const data = await this.api.getPlayers({
        search: seed.name,
        season,
        page: 1,
      });
      const response = (data as any)?.response || [];
      const candidates = response.map((entry: any) => {
        const player = entry?.player || {};
        const stats = entry?.statistics?.[0] || {};
        return {
          apiId: player?.id,
          name: this.buildPlayerName(player?.name, player?.firstname, player?.lastname),
          photoUrl: player?.photo,
          nationality: player?.nationality,
          teamApiId: stats?.team?.id,
          leagueApiId: stats?.league?.id,
          teamName: stats?.team?.name,
          primaryPosition: stats?.games?.position || player?.position || '',
          allowedPositions: mapAllowedPositions(stats?.games?.position || player?.position || ''),
          goals: Number(stats?.goals?.total || 0) || 0,
          assists: Number(stats?.goals?.assists || 0) || 0,
          minutes: Number(stats?.games?.minutes || 0) || 0,
          rating: Number(stats?.games?.rating || 0) || 0,
          _raw: entry,
        };
      });
      const best = candidates
        .filter((item: any) => this.isSameImportantSeed(item, seed.normalizedName, seed.normalizedClub))
        .sort((a: any, b: any) => this.computeImportanceScore(b) - this.computeImportanceScore(a))[0];
      if (best?.apiId) {
        this.importantHydrateCache.set(cacheKey, {
          item: best,
          expiresAt: now + IMPORTANT_HYDRATE_CACHE_TTL_MS,
        });
        await this.upsertHydratedApiPlayer(best._raw);
        return best;
      }
    } catch {
      return null;
    }
    return null;
  }

  private applyPlayerFilters(
    item: any,
    params: {
      teamApiId?: number;
      leagueApiId?: number;
      nationality?: string;
      position?: string;
    },
  ) {
    if (params.teamApiId && Number(item?.teamApiId) !== params.teamApiId) return false;
    if (params.leagueApiId && Number(item?.leagueApiId) !== params.leagueApiId) return false;
    if (params.nationality) {
      const normalizedNationality = this.normalizeText(params.nationality);
      if (!this.normalizeText(String(item?.nationality || '')).includes(normalizedNationality)) return false;
    }
    if (params.position) {
      const normalizedPosition = this.normalizeText(params.position);
      if (!this.normalizeText(String(item?.primaryPosition || '')).includes(normalizedPosition)) return false;
    }
    return true;
  }

  private async upsertHydratedApiPlayer(rawItem: any) {
    const player = rawItem?.player;
    const stats = rawItem?.statistics?.[0] || {};
    if (!player?.id) return;
    await this.prisma.player.upsert({
      where: { apiId: player.id },
      update: {
        name: this.buildPlayerName(player?.name, player?.firstname, player?.lastname),
        firstname: player?.firstname,
        lastname: player?.lastname,
        age: player?.age,
        nationality: player?.nationality,
        photoUrl: player?.photo,
        position: stats?.games?.position || player?.position,
        teamApiId: stats?.team?.id,
        leagueApiId: stats?.league?.id,
        season: stats?.league?.season,
      },
      create: {
        apiId: player.id,
        name: this.buildPlayerName(player?.name, player?.firstname, player?.lastname),
        firstname: player?.firstname,
        lastname: player?.lastname,
        age: player?.age,
        nationality: player?.nationality,
        photoUrl: player?.photo,
        position: stats?.games?.position || player?.position,
        teamApiId: stats?.team?.id,
        leagueApiId: stats?.league?.id,
        season: stats?.league?.season,
      },
    });
  }
}

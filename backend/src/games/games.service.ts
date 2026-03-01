import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { GameType, SessionStatus } from '@prisma/client';
import { LineupRulesSchema } from './lineup.rules';
import { SyncService } from '../sync/sync.service';
import {
  IMPORTANT_PLAYERS_CATALOG,
  ImportantPlayerSeed,
  getImportantPlayersMap,
  normalizeImportantName,
} from '../common/important-players.catalog';

const HANGMAN_TTL = 60 * 15;
const HANGMAN_LETTER_ATTEMPTS = 10;
const HANGMAN_SOLVE_ATTEMPTS = 2;
const SORT_TTL = 60 * 15;
const MARKET_TTL = 60 * 15;
const IMPORTANT_SEED_ENTRIES = IMPORTANT_PLAYERS_CATALOG.map((entry) => ({
  ...entry,
  normalizedName: normalizeImportantName(entry.name),
  normalizedClub: normalizeImportantName(entry.club),
}));

@Injectable()
export class GamesService {
  private recentMarketSeedKeys: string[] = [];

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private syncService: SyncService,
  ) {}

  async createLineupTemplate(name: string, rulesJson: Record<string, any>) {
    const rules = LineupRulesSchema.parse(rulesJson);
    return this.prisma.lineupTemplate.create({ data: { name, rulesJson: rules } });
  }

  listLineupTemplates() {
    return this.prisma.lineupTemplate.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async submitLineup(
    templateId: number,
    playerApiIds: number[],
    lineupSlots?: { playerApiId: number; slotPosition: string }[],
  ) {
    const template = await this.prisma.lineupTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new NotFoundException('Template not found');
    if (playerApiIds.length !== 11) throw new BadRequestException('Must select 11 players');
    if (new Set(playerApiIds).size !== 11) throw new BadRequestException('Players must be unique');

    const players = await this.prisma.player.findMany({
      where: { apiId: { in: playerApiIds } },
    });
    if (players.length !== 11) throw new BadRequestException('Some players not found');

    const rules = LineupRulesSchema.parse(template.rulesJson as any);
    const allowedNationalities = rules?.allowedNationalities as string[] | undefined;
    const allowedLeagues = rules?.allowedLeagueApiIds as number[] | undefined;
    const allowedTeams = rules?.allowedTeamApiIds as number[] | undefined;
    const maxFromTeam = rules?.maxFromTeam as number | undefined;
    const requiredPositions = rules?.requiredPositions;
    const minAge = rules?.minAge;
    const maxAge = rules?.maxAge;
    const requireUniqueTeams = rules?.requireUniqueTeams;
    const requireUniqueNationalities = rules?.requireUniqueNationalities;

    if (allowedNationalities) {
      const invalid = players.find((p) => !allowedNationalities.includes(p.nationality || ''));
      if (invalid) throw new BadRequestException('Nationality rule failed');
    }
    if (allowedLeagues) {
      const invalid = players.find((p) => !allowedLeagues.includes(p.leagueApiId || -1));
      if (invalid) throw new BadRequestException('League rule failed');
    }
    if (allowedTeams) {
      const invalid = players.find((p) => !allowedTeams.includes(p.teamApiId || -1));
      if (invalid) throw new BadRequestException('Team rule failed');
    }
    if (maxFromTeam) {
      const counts: Record<string, number> = {};
      for (const p of players) {
        const key = String(p.teamApiId || 0);
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] > maxFromTeam) {
          throw new BadRequestException('Max from team rule failed');
        }
      }
    }
    if (minAge) {
      const invalid = players.find((p) => (p.age || 0) < minAge);
      if (invalid) throw new BadRequestException('Min age rule failed');
    }
    if (maxAge) {
      const invalid = players.find((p) => (p.age || 0) > maxAge);
      if (invalid) throw new BadRequestException('Max age rule failed');
    }
    if (requireUniqueTeams) {
      const teams = players.map((p) => p.teamApiId).filter(Boolean);
      if (new Set(teams as number[]).size !== teams.length) {
        throw new BadRequestException('Players must be from unique teams');
      }
    }
    if (requireUniqueNationalities) {
      const nats = players.map((p) => p.nationality).filter(Boolean);
      if (new Set(nats as string[]).size !== nats.length) {
        throw new BadRequestException('Players must be from unique nationalities');
      }
    }
    if (requiredPositions) {
      const normalized = players.map((p) => this.normalizePosition(p.position || ''));
      const counts = normalized.reduce((acc, pos) => {
        if (!pos) return acc;
        acc[pos] = (acc[pos] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      for (const [pos, qty] of Object.entries(requiredPositions)) {
        if ((counts[pos] || 0) < qty) {
          throw new BadRequestException(`Position rule failed: ${pos}`);
        }
      }
    }

    if (lineupSlots && lineupSlots.length === 11) {
      for (const slot of lineupSlots) {
        const player = players.find((p) => p.apiId === slot.playerApiId);
        if (!player) throw new BadRequestException('Player slot not found');
      }
    }

    const stats = await this.prisma.playerStat.findMany({
      where: { playerApiId: { in: playerApiIds } },
    });
    const score = this.computeLineupScore(stats);
    return { score, players };
  }

  async hangmanStart(teamApiId?: number, leagueApiId?: number, pool: 'important' | 'all' = 'important') {
    const candidates = await this.prisma.player.findMany({
      where: {
        ...(teamApiId ? { teamApiId } : {}),
        ...(leagueApiId ? { leagueApiId } : {}),
      },
      include: { stats: true, team: true },
      take: pool === 'important' ? 3000 : 600,
    });
    const filtered =
      pool === 'important'
        ? candidates.filter((player) => this.isImportantPlayer(player, player.stats || []))
        : candidates;

    if (filtered.length === 0 && pool === 'important') {
      const statsFallback = await this.prisma.playerStat.findMany({
        where: {
          ...(leagueApiId ? { leagueApiId } : {}),
          ...(teamApiId ? { teamApiId } : {}),
          OR: [{ goals: { gt: 0 } }, { assists: { gt: 0 } }, { appearances: { gt: 0 } }, { minutes: { gt: 0 } }],
        },
        include: {
          player: {
            include: { team: true, stats: true },
          },
        },
        take: 6000,
      });
      const fallbackPlayersByApiId = new Map<number, any>();
      for (const entry of statsFallback) {
        const player = entry.player;
        if (!player?.apiId) continue;
        if (!fallbackPlayersByApiId.has(player.apiId)) {
          fallbackPlayersByApiId.set(player.apiId, player);
        }
      }
      const fallbackFiltered = [...fallbackPlayersByApiId.values()].filter((player) =>
        this.isImportantPlayer(player, player.stats || []),
      );
      if (fallbackFiltered.length > 0) {
        const player = fallbackFiltered[Math.floor(Math.random() * fallbackFiltered.length)];
        const session = await this.prisma.gameSession.create({
          data: { gameType: GameType.HANGMAN, status: SessionStatus.ACTIVE },
        });

        const baseName = `${player?.firstname || ''} ${player?.lastname || ''}`.trim() || player?.name || '';
        const secret = String(baseName).toLowerCase();
        const masked = secret.replace(/[a-z]/g, '_');
        const payload = {
          secret,
          masked,
          letterAttemptsLeft: HANGMAN_LETTER_ATTEMPTS,
          solveAttemptsLeft: HANGMAN_SOLVE_ATTEMPTS,
          guessed: [] as string[],
        };
        await this.redis.setJson(`hangman:${session.id}`, payload, HANGMAN_TTL);
        return {
          sessionId: session.id,
          masked,
          letterAttemptsLeft: HANGMAN_LETTER_ATTEMPTS,
          solveAttemptsLeft: HANGMAN_SOLVE_ATTEMPTS,
          attemptsLeft: HANGMAN_LETTER_ATTEMPTS + HANGMAN_SOLVE_ATTEMPTS,
        };
      }
    }

    if (filtered.length === 0) {
      await this.requestDataRefresh(teamApiId, leagueApiId);
      throw new NotFoundException('No players found. Sync queued, try again shortly.');
    }
    const player = filtered[Math.floor(Math.random() * filtered.length)];
    const session = await this.prisma.gameSession.create({
      data: { gameType: GameType.HANGMAN, status: SessionStatus.ACTIVE },
    });

    const baseName = `${player?.firstname || ''} ${player?.lastname || ''}`.trim() || player?.name || '';
    const secret = String(baseName).toLowerCase();
    const masked = secret.replace(/[a-z]/g, '_');
    const payload = {
      secret,
      masked,
      letterAttemptsLeft: HANGMAN_LETTER_ATTEMPTS,
      solveAttemptsLeft: HANGMAN_SOLVE_ATTEMPTS,
      guessed: [] as string[],
    };
    await this.redis.setJson(`hangman:${session.id}`, payload, HANGMAN_TTL);
    return {
      sessionId: session.id,
      masked,
      letterAttemptsLeft: HANGMAN_LETTER_ATTEMPTS,
      solveAttemptsLeft: HANGMAN_SOLVE_ATTEMPTS,
      attemptsLeft: HANGMAN_LETTER_ATTEMPTS + HANGMAN_SOLVE_ATTEMPTS,
    };
  }

  async hangmanGuess(sessionId: number, guess: string) {
    const key = `hangman:${sessionId}`;
    const state = await this.redis.getJson<any>(key);
    if (!state) throw new NotFoundException('Session not found');
    const normalized = guess.toLowerCase().trim();
    let updatedMasked = state.masked;
    state.letterAttemptsLeft = Number(state.letterAttemptsLeft ?? HANGMAN_LETTER_ATTEMPTS);
    state.solveAttemptsLeft = Number(state.solveAttemptsLeft ?? HANGMAN_SOLVE_ATTEMPTS);

    if (normalized.length === 1) {
      if (!state.guessed.includes(normalized)) {
        state.guessed.push(normalized);
      }
      if (!state.secret.includes(normalized)) {
        state.letterAttemptsLeft -= 1;
      } else {
        let chars = updatedMasked.split('');
        for (let i = 0; i < state.secret.length; i++) {
          if (state.secret[i] === normalized) {
            chars[i] = normalized;
          }
        }
        updatedMasked = chars.join('');
      }
    } else {
      if (normalized === state.secret) {
        updatedMasked = state.secret;
      } else {
        state.solveAttemptsLeft -= 1;
      }
    }

    const solved = updatedMasked === state.secret;
    const failed = state.letterAttemptsLeft <= 0 || state.solveAttemptsLeft <= 0;
    state.masked = updatedMasked;
    await this.redis.setJson(key, state, HANGMAN_TTL);

    if (solved || failed) {
      await this.prisma.gameSession.update({
        where: { id: sessionId },
        data: { status: SessionStatus.FINISHED },
      });
    }

    return {
      masked: updatedMasked,
      letterAttemptsLeft: state.letterAttemptsLeft,
      solveAttemptsLeft: state.solveAttemptsLeft,
      attemptsLeft: Number(state.letterAttemptsLeft || 0) + Number(state.solveAttemptsLeft || 0),
      solved,
      failed,
      answer: failed ? state.secret : undefined,
    };
  }

  async sortStart(
    stat: 'goals' | 'assists' | 'appearances',
    leagueApiId?: number,
    teamApiId?: number,
    count = 5,
    pool: 'important' | 'all' = 'important',
  ) {
    const stats = await this.prisma.playerStat.findMany({
      where: {
        ...(leagueApiId ? { leagueApiId } : {}),
        ...(teamApiId ? { teamApiId } : {}),
        ...(stat === 'goals' ? { goals: { gt: 0 } } : {}),
        ...(stat === 'assists' ? { assists: { gt: 0 } } : {}),
        ...(stat === 'appearances' ? { appearances: { gt: 0 } } : {}),
      },
      include: { player: { include: { team: true } } },
      take: 800,
    });
    const filteredStats =
      pool === 'important'
        ? stats.filter((entry) => this.isImportantPlayer(entry.player, [entry]))
        : stats;
    if (filteredStats.length < Math.max(3, count)) {
      await this.requestDataRefresh(teamApiId, leagueApiId);
      throw new NotFoundException('Not enough stats found. Sync queued, try again shortly.');
    }
    const shuffled = filteredStats.sort(() => 0.5 - Math.random()).slice(0, count);
    const order = [...shuffled].sort((a, b) => (Number((b as any)[stat]) || 0) - (Number((a as any)[stat]) || 0));
    const session = await this.prisma.gameSession.create({
      data: { gameType: GameType.SORT, status: SessionStatus.ACTIVE },
    });
    const payload = {
      stat,
      pool,
      order: order.map((s) => s.player.apiId),
      values: Object.fromEntries(
        shuffled.map((s) => [String(s.player.apiId), Number((s as any)[stat]) || 0]),
      ),
    };
    await this.redis.setJson(`sort:${session.id}`, payload, SORT_TTL);
    return {
      sessionId: session.id,
      stat,
      players: shuffled.map((s) => ({
        apiId: s.player.apiId,
        name: s.player.name,
        photoUrl: s.player.photoUrl,
        value: (s as any)[stat] || 0,
      })),
    };
  }

  async sortSubmit(sessionId: number, orderedPlayerApiIds: number[]) {
    const key = `sort:${sessionId}`;
    const state = await this.redis.getJson<any>(key);
    if (!state) throw new NotFoundException('Session not found');
    const correctOrder = state.order as number[];
    const statValues = (state.values || {}) as Record<string, number>;

    let isCorrect = orderedPlayerApiIds.join(',') === correctOrder.join(',');
    if (Object.keys(statValues).length > 0) {
      const expected = new Set(correctOrder);
      const submitted = new Set(orderedPlayerApiIds);
      const hasExpectedLength = orderedPlayerApiIds.length === correctOrder.length;
      const hasNoDuplicates = submitted.size === orderedPlayerApiIds.length;
      const hasSamePlayers = hasExpectedLength && hasNoDuplicates && [...submitted].every((id) => expected.has(id));

      if (hasSamePlayers) {
        isCorrect = true;
        for (let i = 1; i < orderedPlayerApiIds.length; i++) {
          const prev = statValues[String(orderedPlayerApiIds[i - 1])] ?? Number.NEGATIVE_INFINITY;
          const curr = statValues[String(orderedPlayerApiIds[i])] ?? Number.NEGATIVE_INFINITY;
          if (prev < curr) {
            isCorrect = false;
            break;
          }
        }
      } else {
        isCorrect = false;
      }
    }

    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.FINISHED },
    });

    return { correct: isCorrect, correctOrder };
  }

  async marketStart(leagueApiId?: number, pool: 'important' | 'all' = 'important') {
    const seed = await this.pickMarketSeed(leagueApiId);
    if (!seed) {
      await this.requestDataRefresh(undefined, leagueApiId);
      throw new NotFoundException('No market candidates found. Sync queued, try again shortly.');
    }
    const targetValueM = Number(seed.marketValueM || 0);
    const dbPlayer = await this.findDbPlayerForMarketSeed(seed, leagueApiId);
    const displayName = dbPlayer ? this.getPlayerDisplayName(dbPlayer) : seed.name;
    const session = await this.prisma.gameSession.create({
      data: { gameType: GameType.SORT, status: SessionStatus.ACTIVE },
    });

    await this.redis.setJson(
      `market:${session.id}`,
      {
        playerApiId: dbPlayer?.apiId || null,
        targetValueM,
      },
      MARKET_TTL,
    );

    return {
      sessionId: session.id,
      player: {
        apiId: dbPlayer?.apiId || Math.round(Math.random() * 1_000_000_000),
        name: displayName,
        photoUrl: dbPlayer?.photoUrl || undefined,
        teamName: dbPlayer?.team?.name || seed.club || 'Sin equipo',
        leagueApiId: dbPlayer?.leagueApiId || leagueApiId || null,
      },
    };
  }

  async marketGuess(sessionId: number, guessValueM: number) {
    const state = await this.redis.getJson<any>(`market:${sessionId}`);
    if (!state) throw new NotFoundException('Session not found');
    const target = Number(state.targetValueM || 0);
    const guess = Number(guessValueM || 0);
    const diff = Math.abs(target - guess);
    const correct = diff <= 5;
    const veryClose = diff <= 10;

    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.FINISHED },
    });

    return {
      correct,
      veryClose,
      targetValueM: target,
      diffM: diff,
    };
  }

  private computeLineupScore(stats: any[]) {
    const byPlayer: Record<string, any[]> = {};
    for (const stat of stats) {
      const key = String(stat.playerApiId);
      byPlayer[key] = byPlayer[key] || [];
      byPlayer[key].push(stat);
    }
    let total = 0;
    for (const playerId of Object.keys(byPlayer)) {
      const best = byPlayer[playerId].reduce((acc, curr) => {
        const accValue = (acc.goals || 0) + (acc.assists || 0) + (acc.appearances || 0);
        const currValue = (curr.goals || 0) + (curr.assists || 0) + (curr.appearances || 0);
        return currValue > accValue ? curr : acc;
      });
      total += (best.goals || 0) * 4 + (best.assists || 0) * 3 + (best.appearances || 0);
    }
    return total;
  }

  private normalizePosition(position: string) {
    const value = position.toLowerCase();
    if (value.includes('goal')) return 'GK';
    if (value.includes('def')) return 'DEF';
    if (value.includes('mid')) return 'MID';
    if (value.includes('att') || value.includes('forw') || value.includes('strik')) return 'FWD';
    return null;
  }

  private isImportantPlayer(player: any, stats: any[]) {
    if (!player) return false;
    return Boolean(this.findImportantSeedForPlayer(player));
  }

  private computeStatImportance(stat: any) {
    const rating = Number(stat?.rating || 0) || 0;
    const goals = Number(stat?.goals || 0) || 0;
    const assists = Number(stat?.assists || 0) || 0;
    const appearances = Number(stat?.appearances || 0) || 0;
    const minutes = Number(stat?.minutes || 0) || 0;
    return rating * 4 + goals * 1.8 + assists * 1.5 + appearances * 0.5 + minutes / 180;
  }

  private getFeaturedPlayerNames() {
    return new Set([...getImportantPlayersMap().keys()]);
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

  private computeFallbackMarketValue(stats: any[]) {
    const best = (stats || []).reduce(
      (acc, curr) => {
        const accScore = this.computeStatImportance(acc);
        const currScore = this.computeStatImportance(curr);
        return currScore > accScore ? curr : acc;
      },
      {} as any,
    );
    const score = this.computeStatImportance(best);
    return Math.min(120, Math.max(8, score));
  }

  private async requestDataRefresh(teamApiId?: number, leagueApiId?: number) {
    if (teamApiId) {
      await this.syncService.enqueuePlayers(teamApiId);
      return;
    }
    if (leagueApiId) {
      await this.syncService.enqueueLeaguePlayers(leagueApiId);
      return;
    }
    await this.syncService.enqueueBootstrap();
  }

  private findImportantSeedForPlayer(player: any) {
    const fullName = this.normalizeText(
      `${player?.firstname || ''} ${player?.lastname || ''}`.trim() || player?.name || '',
    );
    const teamName = this.normalizeText(player?.team?.name || '');
    if (!fullName) return null;

    let best: (typeof IMPORTANT_SEED_ENTRIES)[number] | null = null;
    let bestScore = -1;
    for (const seed of IMPORTANT_SEED_ENTRIES) {
      const score = this.scoreImportantNameCandidate(fullName, seed.normalizedName);
      if (score < 5) continue;
      if (teamName && !this.matchesClub(teamName, seed.normalizedClub)) continue;
      if (score > bestScore) {
        best = seed;
        bestScore = score;
      }
    }
    return best;
  }

  private async pickMarketSeed(leagueApiId?: number) {
    const dedupBySeed = new Map<string, ImportantPlayerSeed>();
    for (const entry of IMPORTANT_PLAYERS_CATALOG) {
      const key = `${normalizeImportantName(entry.name)}|${normalizeImportantName(entry.club)}`;
      const current = dedupBySeed.get(key);
      if (!current || Number(entry.marketValueM || 0) > Number(current.marketValueM || 0)) {
        dedupBySeed.set(key, entry);
      }
    }
    let seeds = [...dedupBySeed.values()].filter((entry) => Number(entry.marketValueM || 0) > 0);

    if (leagueApiId) {
      const dbPlayers = await this.prisma.player.findMany({
        where: { leagueApiId },
        include: { team: true },
        take: 3000,
      });
      const availableKeys = new Set<string>();
      for (const player of dbPlayers) {
        const seed = this.findImportantSeedForPlayer(player);
        if (!seed) continue;
        const key = `${seed.normalizedName}|${seed.normalizedClub}`;
        availableKeys.add(key);
      }
      const leagueSeeds = seeds.filter((entry) =>
        availableKeys.has(`${normalizeImportantName(entry.name)}|${normalizeImportantName(entry.club)}`),
      );
      if (leagueSeeds.length > 0) {
        seeds = leagueSeeds;
      }
    }

    const nonRecent = seeds.filter(
      (entry) =>
        !this.recentMarketSeedKeys.includes(`${normalizeImportantName(entry.name)}|${normalizeImportantName(entry.club)}`),
    );
    const source = nonRecent.length > 0 ? nonRecent : seeds;
    if (source.length === 0) return null;

    const picked = source[Math.floor(Math.random() * source.length)];
    const pickedKey = `${normalizeImportantName(picked.name)}|${normalizeImportantName(picked.club)}`;
    this.recentMarketSeedKeys = [pickedKey, ...this.recentMarketSeedKeys.filter((key) => key !== pickedKey)].slice(0, 32);
    return picked;
  }

  private async findDbPlayerForMarketSeed(seed: ImportantPlayerSeed, leagueApiId?: number) {
    const tokens = String(seed.name || '')
      .split(' ')
      .map((token) => token.trim())
      .filter(Boolean);
    const first = tokens[0] || seed.name;
    const last = tokens[tokens.length - 1] || seed.name;
    const candidates = await this.prisma.player.findMany({
      where: {
        ...(leagueApiId ? { leagueApiId } : {}),
        OR: [
          { name: { contains: first, mode: 'insensitive' } },
          { firstname: { contains: first, mode: 'insensitive' } },
          { lastname: { contains: last, mode: 'insensitive' } },
        ],
      },
      include: { team: true },
      take: 200,
    });
    const normalizedSeedName = this.normalizeText(seed.name);
    const normalizedSeedClub = this.normalizeText(seed.club);
    let best: any = null;
    let bestScore = -1;
    for (const candidate of candidates) {
      const candidateName = this.normalizeText(this.getPlayerDisplayName(candidate));
      const candidateClub = this.normalizeText(candidate?.team?.name || '');
      let score = 0;
      if (candidateName === normalizedSeedName) score += 6;
      if (this.scoreImportantNameCandidate(candidateName, normalizedSeedName) >= 5) score += 3;
      if (candidateClub && this.matchesClub(candidateClub, normalizedSeedClub)) score += 2;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return bestScore >= 4 ? best : null;
  }

  private getPlayerDisplayName(player: any) {
    const fullname = `${player?.firstname || ''} ${player?.lastname || ''}`.trim();
    if (fullname) return fullname;
    return String(player?.name || '').trim();
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
}

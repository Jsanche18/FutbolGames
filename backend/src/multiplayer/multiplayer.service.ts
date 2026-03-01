import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { GameType, RoomStatus, SessionStatus } from '@prisma/client';
import { Server } from 'socket.io';

type RoomState = {
  roomId: number;
  hostUserId: number;
  sessionId: number;
  roundNumber: number;
  roundId?: number;
  secretPlayer: {
    apiId: number;
    name: string;
    nationality?: string | null;
    position?: string | null;
    photoUrl?: string | null;
    teamName?: string | null;
    leagueName?: string | null;
  };
  hintIndex: number;
  hintsSent: { key: string; value: any }[];
  roundResolved?: boolean;
  awaitingNextRound?: boolean;
  recentSecretApiIds: number[];
  interval?: NodeJS.Timeout;
  roundTimeout?: NodeJS.Timeout;
};

@Injectable()
export class MultiplayerService {
  private roomStates = new Map<string, RoomState>();

  constructor(private prisma: PrismaService, private redis: RedisService) {}

  async createRoom(userId: number) {
    const code = this.generateCode();
    const room = await this.prisma.room.create({
      data: { code, status: RoomStatus.OPEN },
    });
    await this.prisma.roomPlayer.create({
      data: { roomId: room.id, userId },
    });
    return room;
  }

  async joinRoom(code: string, userId: number) {
    const room = await this.prisma.room.findUnique({ where: { code } });
    if (!room) throw new NotFoundException('Room not found');
    const current = await this.prisma.roomPlayer.findMany({ where: { roomId: room.id } });
    if (current.length >= 4) {
      throw new NotFoundException('Room is full');
    }
    await this.prisma.roomPlayer.upsert({
      where: { roomId_userId: { roomId: room.id, userId } },
      update: {},
      create: { roomId: room.id, userId },
    });
    return room;
  }

  async getRoomPlayers(roomId: number) {
    const hostUserId = await this.getHostUserId(roomId);
    const players = await this.prisma.roomPlayer.findMany({
      where: { roomId },
      include: { user: { include: { profile: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return {
      hostUserId,
      players: players.map((p) => ({
        userId: p.userId,
        nickname: p.user.profile?.nickname || `Usuario ${p.userId}`,
        score: p.score,
      })),
    };
  }

  async startGame(code: string, requestedByUserId: number, io: Server) {
    const room = await this.prisma.room.findUnique({ where: { code } });
    if (!room) throw new NotFoundException('Room not found');
    const players = await this.prisma.roomPlayer.findMany({ where: { roomId: room.id } });
    const hostUserId = await this.getHostUserId(room.id);
    if (!hostUserId || requestedByUserId !== hostUserId) {
      throw new ForbiddenException('Only the host can start the match');
    }
    if (players.length < 2 || players.length > 4) {
      throw new NotFoundException('Room must have between 2 and 4 players');
    }
    if (room.status === RoomStatus.IN_PROGRESS || this.roomStates.has(code)) {
      throw new NotFoundException('Game already in progress');
    }
    await this.prisma.room.update({ where: { id: room.id }, data: { status: RoomStatus.IN_PROGRESS } });
    const session = await this.prisma.gameSession.create({
      data: { gameType: GameType.MULTIPLAYER, status: SessionStatus.ACTIVE },
    });
    await this.startRound(room.code, room.id, hostUserId, session.id, 1, io);
    return { room, sessionId: session.id };
  }

  async startRound(
    code: string,
    roomId: number,
    hostUserId: number,
    sessionId: number,
    roundNumber: number,
    io: Server,
  ) {
    const previousState = this.roomStates.get(code);
    const previousRecent = previousState?.recentSecretApiIds || [];
    const secret = await this.pickSecretPlayer(previousRecent);
    const round = await this.prisma.gameRound.create({
      data: {
        sessionId,
        roundNumber,
        secretPlayerApiId: secret.apiId,
        startAt: new Date(),
        endAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const state: RoomState = {
      roomId,
      hostUserId,
      sessionId,
      roundNumber,
      roundId: round.id,
      secretPlayer: secret,
      hintIndex: 0,
      hintsSent: [],
      roundResolved: false,
      awaitingNextRound: false,
      recentSecretApiIds: [secret.apiId, ...previousRecent].slice(0, 32),
    };
    this.roomStates.set(code, state);

    this.scheduleHints(code, io);
    io.to(code).emit('game:start', { roundNumber });
    io.to(code).emit('round:result', { roundId: round.id, started: true, roundNumber });
  }

  async submitAnswer(code: string, userId: number, guessText: string, io: Server) {
    const state = this.roomStates.get(code);
    if (!state) {
      return { ok: false, reason: 'not_started' };
    }
    if (state.roundResolved) {
      return { ok: false, reason: 'already_solved' };
    }
    const cooldownKey = `cooldown:${code}:${userId}`;
    const redisClient = this.redis.getClient();
    const isCooling = await redisClient.get(cooldownKey);
    if (isCooling) {
      return { ok: false, reason: 'cooldown' };
    }
    await redisClient.set(cooldownKey, '1', 'PX', 1500);

    await this.prisma.guessLog.create({
      data: {
        roomId: state.roomId,
        sessionId: state.sessionId,
        userId,
        guessText,
      },
    });

    const normalized = guessText.toLowerCase().trim();
    const correct = this.matchesPlayerGuess(normalized, state.secretPlayer.name);
    if (!correct) {
      return { ok: true, correct: false };
    }

    state.roundResolved = true;
    state.awaitingNextRound = true;
    this.clearInterval(code);
    await this.prisma.roomPlayer.update({
      where: { roomId_userId: { roomId: state.roomId, userId } },
      data: { score: { increment: 1 } },
    });

    const scores = await this.prisma.roomPlayer.findMany({
      where: { roomId: state.roomId },
      include: { user: { include: { profile: true } } },
    });
    io.to(code).emit('game:score', {
      scores: scores.map((s) => ({
        userId: s.userId,
        score: s.score,
        nickname: s.user.profile?.nickname || `Usuario ${s.userId}`,
      })),
    });
    const winnerProfile = scores.find((s) => s.userId === userId)?.user?.profile?.nickname;
    io.to(code).emit('round:result', {
      winnerUserId: userId,
      winnerNickname: winnerProfile || `Usuario ${userId}`,
      answer: state.secretPlayer.name,
      photoUrl: state.secretPlayer.photoUrl,
      hints: state.hintsSent,
      roundNumber: state.roundNumber,
      awaitingNextRound: true,
    });

    const winner = scores.find((s) => s.userId === userId);
    if (winner && winner.score >= 5) {
      await this.finishGame(code, io, userId, scores);
      return { ok: true, correct: true, finished: true };
    }

    return { ok: true, correct: true };
  }

  async nextRound(code: string, requestedByUserId: number, io: Server) {
    const state = this.roomStates.get(code);
    if (!state) throw new NotFoundException('Round not started');
    if (requestedByUserId !== state.hostUserId) {
      throw new ForbiddenException('Only the host can start the next round');
    }
    if (!state.awaitingNextRound) {
      return { ok: false, reason: 'not_ready' };
    }
    await this.startRound(code, state.roomId, state.hostUserId, state.sessionId, state.roundNumber + 1, io);
    return { ok: true };
  }

  private async finishGame(code: string, io: Server, winnerUserId: number, scores: any[]) {
    const state = this.roomStates.get(code);
    if (!state) return;
    this.clearInterval(code);
    this.clearRoundTimeout(code);
    await this.prisma.gameSession.update({
      where: { id: state.sessionId },
      data: { status: SessionStatus.FINISHED },
    });
    await this.prisma.matchHistory.create({
      data: {
        gameType: GameType.MULTIPLAYER,
        winnerUserId,
        finalScoreJson: scores,
      },
    });
    await this.prisma.room.update({
      where: { id: state.roomId },
      data: { status: RoomStatus.OPEN },
    });
    io.to(code).emit('game:finish', { winnerUserId, scores });
    this.roomStates.delete(code);
  }

  private scheduleHints(code: string, io: Server) {
    this.clearInterval(code);
    const state = this.roomStates.get(code);
    if (!state) return;
    const hints = [
      { key: 'nationality', value: state.secretPlayer.nationality },
      { key: 'league', value: state.secretPlayer.leagueName },
      { key: 'team', value: state.secretPlayer.teamName },
      { key: 'position', value: state.secretPlayer.position },
      { key: 'photoUrl', value: state.secretPlayer.photoUrl },
      { key: 'name', value: state.secretPlayer.name },
    ];

    state.interval = setInterval(() => {
      const hint = hints[state.hintIndex];
      if (!hint) {
        this.clearInterval(code);
        return;
      }
      state.hintsSent.push(hint);
      io.to(code).emit('round:hint', { step: state.hintIndex + 1, hint });
      state.hintIndex += 1;
    }, 10000);
  }

  private clearInterval(code: string) {
    const state = this.roomStates.get(code);
    if (state?.interval) {
      clearInterval(state.interval);
      state.interval = undefined;
    }
  }

  private scheduleRoundTimeout(code: string, io: Server) {
    return;
  }

  private clearRoundTimeout(code: string) {
    return;
  }

  private async pickSecretPlayer(recentSecretApiIds: number[]) {
    const where = { stats: { some: {} } } as any;
    const total = await this.prisma.player.count({ where });
    if (total === 0) throw new NotFoundException('No players available');
    const recentSet = new Set((recentSecretApiIds || []).map((id) => Number(id)));
    let picked: any = null;

    for (let i = 0; i < 24; i++) {
      const skip = total > 1 ? Math.floor(Math.random() * total) : 0;
      const candidate = await this.prisma.player.findFirst({
        where,
        orderBy: { apiId: 'asc' },
        skip,
      });
      if (!candidate) continue;
      if (!recentSet.has(Number(candidate.apiId))) {
        picked = candidate;
        break;
      }
      if (!picked) picked = candidate;
    }

    const player =
      picked ||
      (await this.prisma.player.findFirst({
        where,
        orderBy: { apiId: 'asc' },
      }));
    if (!player) throw new NotFoundException('No players available');
    const team = player.teamApiId
      ? await this.prisma.team.findUnique({ where: { apiId: player.teamApiId } })
      : null;
    const league = player.leagueApiId
      ? await this.prisma.league.findUnique({ where: { apiId: player.leagueApiId } })
      : null;

    return {
      apiId: player.apiId,
      name: this.formatPlayerName(player),
      nationality: player.nationality,
      position: player.position,
      photoUrl: player.photoUrl,
      teamName: team?.name,
      leagueName: league?.name,
    };
  }

  private async getHostUserId(roomId: number) {
    const host = await this.prisma.roomPlayer.findFirst({
      where: { roomId },
      orderBy: { joinedAt: 'asc' },
      select: { userId: true },
    });
    return host?.userId || null;
  }

  private maskName(name: string) {
    return name
      .split('')
      .map((ch) => (/[a-zA-Z]/.test(ch) ? '_' : ch))
      .join('');
  }

  private generateCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  private normalizeText(value: string) {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\.\-']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatPlayerName(player: any) {
    const firstname = String(player?.firstname || '').trim();
    const lastname = String(player?.lastname || '').trim();
    const fullName = `${firstname} ${lastname}`.trim();
    if (fullName) return fullName;
    return String(player?.name || '').trim();
  }

  private matchesPlayerGuess(guess: string, answer: string) {
    const normalizedGuess = this.normalizeText(guess);
    const normalizedAnswer = this.normalizeText(answer);
    if (!normalizedGuess || !normalizedAnswer) return false;
    if (normalizedGuess === normalizedAnswer) return true;

    const answerTokens = normalizedAnswer.split(' ').filter(Boolean);
    const guessTokens = normalizedGuess.split(' ').filter(Boolean);
    if (guessTokens.length === 0 || answerTokens.length === 0) return false;

    const allTokensMatch = guessTokens.every(
      (guessToken) =>
        guessToken.length >= 3 &&
        answerTokens.some((answerToken) => answerToken === guessToken || answerToken.startsWith(guessToken)),
    );
    if (allTokensMatch) return true;

    if (guessTokens.length === 1) {
      const token = guessTokens[0];
      if (token.length >= 3 && answerTokens.some((answerToken) => answerToken.includes(token))) {
        return true;
      }
    }

    return false;
  }
}

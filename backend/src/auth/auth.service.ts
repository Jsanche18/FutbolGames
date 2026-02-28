import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(email: string, password: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('Email already in use');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        profile: {
          create: {
            nickname: email.split('@')[0],
          },
        },
      },
      include: { profile: true },
    });
    const accessToken = this.signAccessToken(user.id, user.email);
    const refreshToken = await this.issueRefreshToken(user.id, user.email);
    return { user, accessToken, refreshToken };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const accessToken = this.signAccessToken(user.id, user.email);
    const refreshToken = await this.issueRefreshToken(user.id, user.email);
    return { user, accessToken, refreshToken };
  }

  async me(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
  }

  async refreshAccessToken(refreshToken: string) {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) throw new UnauthorizedException('Missing refresh secret');
    try {
      const payload = this.jwtService.verify(refreshToken, { secret: refreshSecret }) as {
        sub: number;
        email: string;
        jti: string;
      };
      const records = await this.prisma.refreshToken.findMany({
        where: { userId: payload.sub, revokedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      const match = await this.findMatchingRefresh(records, payload.jti);
      if (!match || match.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token expired');
      }
      await this.prisma.refreshToken.update({
        where: { id: match.id },
        data: { revokedAt: new Date() },
      });
      const accessToken = this.signAccessToken(payload.sub, payload.email);
      const newRefreshToken = await this.issueRefreshToken(payload.sub, payload.email);
      return { accessToken, refreshToken: newRefreshToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(refreshToken: string) {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) return;
    try {
      const payload = this.jwtService.verify(refreshToken, { secret: refreshSecret }) as {
        sub: number;
        jti: string;
      };
      const records = await this.prisma.refreshToken.findMany({
        where: { userId: payload.sub, revokedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      const match = await this.findMatchingRefresh(records, payload.jti);
      if (match) {
        await this.prisma.refreshToken.update({
          where: { id: match.id },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      return;
    }
  }

  private signAccessToken(userId: number, email: string) {
    return this.jwtService.sign(
      { sub: userId, email },
      { expiresIn: '8h' },
    );
  }

  private async issueRefreshToken(userId: number, email: string) {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const days = Number(this.configService.get<string>('REFRESH_TOKEN_DAYS') || 7);
    if (!refreshSecret) {
      throw new UnauthorizedException('Missing refresh secret');
    }
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const token = this.jwtService.sign(
      { sub: userId, email, jti },
      { secret: refreshSecret, expiresIn: `${days}d` },
    );
    const tokenHash = await bcrypt.hash(jti, 10);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
    return token;
  }

  private async findMatchingRefresh(records: any[], jti: string) {
    for (const record of records) {
      const match = await bcrypt.compare(jti, record.tokenHash);
      if (match) return record;
    }
    return null;
  }
}

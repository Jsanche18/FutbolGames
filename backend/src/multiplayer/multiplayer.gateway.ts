import {
  WebSocketGateway,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MultiplayerService } from './multiplayer.service';
import { ConfigService } from '@nestjs/config';

type SocketWithUser = Socket & { userId?: number };

const normalizeOrigin = (value?: string | null) => {
  if (!value) return '';
  return value.replace(/\/$/, '');
};

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      const envUrl = normalizeOrigin(process.env.FRONTEND_URL);
      const allowed = new Set(
        [
          'http://localhost:3000',
          'https://futbol-games.vercel.app',
          envUrl,
        ].filter(Boolean) as string[],
      );
      if (!origin) return callback(null, true);
      const normalized = normalizeOrigin(origin);
      if (allowed.has(normalized)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  },
})
export class MultiplayerGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private server!: Server;

  constructor(
    private jwtService: JwtService,
    private multiplayerService: MultiplayerService,
    private configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.server = server;
  }

  handleConnection(client: SocketWithUser) {
    const origin = client.handshake.headers.origin as string | undefined;
    const frontendUrl = normalizeOrigin(this.configService.get<string>('FRONTEND_URL'));
    const normalizedOrigin = normalizeOrigin(origin);
    if (frontendUrl && normalizedOrigin && normalizedOrigin !== frontendUrl) {
      client.disconnect();
      return;
    }

    const authHeader = client.handshake.headers.authorization as string | undefined;
    const token =
      client.handshake.auth?.token ||
      (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);

    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify(token) as { sub: number };
      client.userId = payload.sub;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: SocketWithUser) {
    client.disconnect();
  }

  @SubscribeMessage('room:create')
  async onCreateRoom(@ConnectedSocket() client: SocketWithUser) {
    const room = await this.multiplayerService.createRoom(client.userId!);
    client.join(room.code);
    return { code: room.code };
  }

  @SubscribeMessage('room:join')
  async onJoinRoom(@ConnectedSocket() client: SocketWithUser, @MessageBody() data: { code: string }) {
    const room = await this.multiplayerService.joinRoom(data.code, client.userId!);
    client.join(room.code);
    this.server.to(room.code).emit('room:joined', { userId: client.userId });
    return { code: room.code };
  }

  @SubscribeMessage('game:start')
  async onGameStart(@MessageBody() data: { code: string }) {
    return this.multiplayerService.startGame(data.code, this.server);
  }

  @SubscribeMessage('round:answer')
  async onRoundAnswer(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() data: { code: string; guess: string },
  ) {
    return this.multiplayerService.submitAnswer(data.code, client.userId!, data.guess, this.server);
  }
}

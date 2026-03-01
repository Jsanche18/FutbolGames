import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'net';

function parseHostPort(urlValue?: string) {
  if (!urlValue) return null;
  try {
    const parsed = new URL(urlValue);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 5432),
    };
  } catch {
    return null;
  }
}

async function canConnectTcp(host: string, port: number, timeoutMs = 3500) {
  return new Promise<boolean>((resolve) => {
    const socket = new Socket();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function resolveDatabaseUrlBeforeBoot() {
  const primary = process.env.DATABASE_URL;
  const fallback = process.env.DIRECT_URL;
  if (!primary || !fallback || primary === fallback) return;

  const primaryTarget = parseHostPort(primary);
  const fallbackTarget = parseHostPort(fallback);
  if (!primaryTarget || !fallbackTarget) return;

  const primaryOk = await canConnectTcp(primaryTarget.host, primaryTarget.port);
  if (primaryOk) {
    console.log(`[boot] DB primary reachable: ${primaryTarget.host}:${primaryTarget.port}`);
    return;
  }

  const fallbackOk = await canConnectTcp(fallbackTarget.host, fallbackTarget.port);
  if (fallbackOk) {
    process.env.DATABASE_URL = fallback;
    console.log(`[boot] DB fallback selected: ${fallbackTarget.host}:${fallbackTarget.port}`);
  } else {
    console.warn(
      `[boot] DB not reachable on primary or fallback (${primaryTarget.host}:${primaryTarget.port} / ${fallbackTarget.host}:${fallbackTarget.port})`,
    );
  }
}

async function bootstrap() {
  await resolveDatabaseUrlBeforeBoot();
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const frontendUrl = configService.get<string>('FRONTEND_URL');

  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = new Set(
        [
          'http://localhost:3000',
          'https://futbol-games.vercel.app',
          frontendUrl,
        ].filter(Boolean) as string[],
      );
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'Origin',
      'X-Requested-With',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Credentials',
      'x-socket-id',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Futbol-11 API')
    .setDescription('REST API for Futbol-11')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = configService.get<number>('PORT') || 4000;
  await app.listen(port);
}

bootstrap();

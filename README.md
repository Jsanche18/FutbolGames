# Futbol-11 (Monorepo)

Monorepo con:
- `frontend/` Next.js (App Router) + TailwindCSS
- `backend/` NestJS + Prisma + Socket.IO + BullMQ

## Requisitos
- Node.js 18+
- Cuenta en Supabase, Render y Vercel
- API Key de API-FOOTBALL

## Variables de entorno

Backend (`backend/.env`):
```
DATABASE_URL=
DIRECT_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
API_FOOTBALL_KEY=
API_FOOTBALL_BASE_URL=
REDIS_URL=
FRONTEND_URL=
PORT=4000
REFRESH_TOKEN_DAYS=7
```

Frontend (`frontend/.env`):
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

## Desarrollo local
1. Backend:
```
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```
2. Frontend:
```
cd frontend
npm install
npm run dev
```

## Deploy paso a paso
1. **GitHub**: Subir el repo con este monorepo.
2. **Supabase Postgres**:
   - Crear proyecto.
   - Copiar `DATABASE_URL`.
3. **Render Key Value (Redis)**:
   - Crear Redis.
   - Copiar `REDIS_URL`.
4. **Render Web Service (Backend)**:
   - Root: `backend`
   - Build command: `npm install && npm run build && npm run prisma:generate`
   - Start command: `npm run start`
   - Env vars: `DATABASE_URL`, `JWT_SECRET`, `API_FOOTBALL_KEY`, `API_FOOTBALL_BASE_URL`, `REDIS_URL`, `FRONTEND_URL`, `PORT`
   - CORS y Socket.IO: `FRONTEND_URL` debe ser la URL de Vercel.
5. **Vercel (Frontend)**:
   - Root: `frontend`
   - Env vars: `NEXT_PUBLIC_API_BASE_URL` (URL del backend), `NEXT_PUBLIC_SOCKET_URL` (URL del backend)
6. **Migraciones en producción**:
   - En Render, ejecutar: `npx prisma migrate deploy`
7. **Realtime en producción**:
   - Abrir `/multiplayer` en dos navegadores.
   - Iniciar sesión, crear sala y unirse con el código.

## Sync de datos
Para poblar la base de datos:
- `POST /sync/leagues?season=2024`
- `POST /sync/teams?leagueApiId=140&season=2024`
- `POST /sync/players?teamApiId=529&season=2024`

## Swagger
Disponible en `/docs` en el backend.

## Refresh tokens
- `POST /auth/refresh` con `refreshToken` en el body.
- `POST /auth/logout` para revocar.

## Mapeo de posiciones
El backend normaliza posiciones en `backend/src/football/positions.ts` y devuelve
`primaryPosition` y `allowedPositions` en `/players/search`. El frontend usa
`allowedPositions` para resaltar slots compatibles y validar la colocación.

## Probar Alineador
1. Arranca backend y frontend.
2. Ve a `/lineup`, busca un jugador y colócalo en un slot compatible.
3. Completa 11/11 y pulsa “Guardar alineación”.

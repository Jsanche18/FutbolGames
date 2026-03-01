'use client';

import { useEffect, useMemo, useState } from 'react';
import { socket } from '@/lib/socket';
import Panel from '@/components/Panel';
import PlayerSearch, { SearchPlayer } from '@/components/PlayerSearch';

type Score = { userId: number; score: number; nickname?: string };
type RoomPlayer = { userId: number; nickname: string; score: number };
type Hint = { key: string; value: any };

function parseUserIdFromToken(token: string | null) {
  if (!token) return null;
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(padded));
    const value = Number(parsed?.sub);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export default function MultiplayerPage() {
  const [code, setCode] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [hints, setHints] = useState<Hint[]>([]);
  const [guess, setGuess] = useState('');
  const [scores, setScores] = useState<Score[]>([]);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [roundActive, setRoundActive] = useState(false);
  const [screen, setScreen] = useState<'lobby' | 'room'>('lobby');
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [hostUserId, setHostUserId] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [answerPhoto, setAnswerPhoto] = useState<string | null>(null);
  const [answerName, setAnswerName] = useState<string | null>(null);
  const [answerHints, setAnswerHints] = useState<Hint[]>([]);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [gameStarted, setGameStarted] = useState(false);
  const [awaitingNextRound, setAwaitingNextRound] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      socket.auth = { token };
      socket.connect();
      setReady(true);
      setCurrentUserId(parseUserIdFromToken(token));
    }

    socket.on('round:hint', (data) => {
      setHints((prev) => [...prev, data.hint]);
    });
    socket.on('game:score', (data) => {
      setScores(data.scores);
    });
    socket.on('room:state', (data) => {
      setPlayers(data.players || []);
      setHostUserId(Number(data.hostUserId || 0) || null);
    });
    socket.on('game:start', () => {
      setRoundActive(true);
      setMessage('');
      setAnswerPhoto(null);
      setAnswerName(null);
      setAnswerHints([]);
      setHints([]);
      setGameStarted(true);
      setAwaitingNextRound(false);
    });
    socket.on('round:result', (data) => {
      if (data?.started) {
        setRoundActive(true);
        setAwaitingNextRound(false);
        if (data?.roundNumber) setCurrentRound(data.roundNumber);
        return;
      }
      setRoundActive(false);
      setAnswerPhoto(data?.photoUrl || null);
      setAnswerName(data?.answer || null);
      setAnswerHints(data?.hints || []);
      setAwaitingNextRound(!!data?.awaitingNextRound);
      if (data?.roundNumber) setCurrentRound(data.roundNumber);
      if (data?.winnerUserId) {
        const winnerLabel = data?.winnerNickname || `Usuario ${data.winnerUserId}`;
        setMessage(`Ganador de ronda: ${winnerLabel}`);
      }
    });
    socket.on('game:finish', (data) => {
      const winner = players.find((player) => player.userId === data.winnerUserId);
      const winnerLabel = winner?.nickname || `Usuario ${data.winnerUserId}`;
      setMessage(`Ganador: ${winnerLabel}`);
      setGameStarted(false);
      setAwaitingNextRound(false);
      setRoundActive(false);
      setScreen('lobby');
      setRoomCode('');
      setHints([]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = async () => {
    const res = await socket.emitWithAck('room:create');
    setRoomCode(res.code);
    setHints([]);
    setScreen('room');
  };

  const joinRoom = async () => {
    const res = await socket.emitWithAck('room:join', { code });
    setRoomCode(res.code);
    setHints([]);
    setScreen('room');
  };

  const startGame = async () => {
    try {
      await socket.emitWithAck('game:start', { code: roomCode });
      setHints([]);
      setMessage('');
    } catch (err: any) {
      setMessage(err?.message || 'No se pudo iniciar la partida.');
    }
  };

  const nextRound = async () => {
    try {
      await socket.emitWithAck('round:next', { code: roomCode });
      setMessage('');
      setAnswerName(null);
      setAnswerPhoto(null);
      setAnswerHints([]);
      setHints([]);
      setAwaitingNextRound(false);
    } catch (err: any) {
      setMessage(err?.message || 'No se pudo iniciar la siguiente ronda.');
    }
  };

  const isHost = currentUserId !== null && hostUserId !== null && currentUserId === hostUserId;

  const sendGuess = async () => {
    if (!roomCode) return;
    if (!roundActive) {
      setMessage('La ronda no ha empezado todavía.');
      return;
    }
    const res = await socket.emitWithAck('round:answer', { code: roomCode, guess });
    if (res?.reason === 'not_started') {
      setMessage('La ronda no ha empezado todavía.');
      return;
    }
    if (res?.reason === 'already_solved') {
      setMessage('La ronda ya fue resuelta.');
      return;
    }
    setGuess('');
  };

  const scoreBoard = useMemo(() => {
    if (players.length === 0) return [];
    const scoreMap = new Map<number, number>();
    scores.forEach((s) => scoreMap.set(s.userId, s.score));
    return players.map((p) => ({
      ...p,
      score: scoreMap.get(p.userId) ?? p.score ?? 0,
    }));
  }, [players, scores]);

  return (
    <main className="min-h-screen bg-pitch px-6 py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-3xl font-display font-bold text-clay">Multiplayer</h1>
          <p className="text-clay/70">Crea o únete a una sala y adivina el jugador.</p>
        </header>

        {!ready && (
          <Panel title="Necesitas iniciar sesión">
            <p className="text-clay/70">
              Este modo requiere token JWT. Inicia sesión para conectarte al servidor de sockets.
            </p>
          </Panel>
        )}

        {ready && screen === 'lobby' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Crear sala">
              <button className="rounded-full bg-lime px-6 py-2 text-ink" onClick={createRoom}>
                Crear
              </button>
            </Panel>
            <Panel title="Unirse">
              <input
                className="mt-2 w-full rounded-lg bg-black/40 px-4 py-2 text-clay"
                placeholder="Código"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <button className="mt-4 rounded-full bg-lime px-6 py-2 text-ink" onClick={joinRoom}>
                Unirse
              </button>
            </Panel>
          </div>
        )}

        {roomCode && screen === 'room' && (
          <Panel title={`Sala ${roomCode}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-clay/30 px-3 py-1 text-xs text-clay/70">
                Ronda {currentRound}
              </span>
              <button
                className="rounded-full bg-lime px-6 py-2 text-ink"
                onClick={startGame}
                disabled={gameStarted || roundActive || !isHost}
              >
                {isHost ? 'Empezar partida' : 'Solo host puede empezar'}
              </button>
              {awaitingNextRound && (
                <button
                  className="rounded-full border border-clay/30 px-6 py-2 text-clay"
                  onClick={nextRound}
                  disabled={!isHost}
                >
                  Siguiente ronda
                </button>
              )}
            </div>

            <div className="mt-6">
              <h4 className="text-lg font-display text-clay">Jugadores (2-4)</h4>
              <p className="text-xs text-clay/60">
                Host: {players.find((player) => player.userId === hostUserId)?.nickname || 'Sin definir'}
              </p>
              <ul className="mt-2 space-y-1 text-clay/80">
                {scoreBoard.map((p) => (
                  <li key={p.userId}>
                    {p.nickname}: {p.score}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6">
              <h4 className="text-lg font-display text-clay">Pistas</h4>
              <ul className="mt-2 space-y-2 text-clay/80">
                {hints.map((hint, index) => (
                  <li key={index}>
                    {hint.key === 'photoUrl' && hint.value ? (
                      <span className="flex items-center gap-2">
                        foto:
                        <img src={hint.value} alt="Pista" className="h-12 w-12 rounded-full object-cover" />
                      </span>
                    ) : hint.key === 'name' ? (
                      <span>nombre: {hint.value}</span>
                    ) : (
                      <span>
                        {hint.key}: {hint.value}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex gap-2">
              <div className="flex-1">
                <PlayerSearch
                  onSelect={(player: SearchPlayer) => {
                    setGuess(player.name);
                  }}
                />
                <input
                  className="mt-2 w-full rounded-lg bg-black/40 px-4 py-2 text-clay"
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  placeholder="Tu respuesta"
                />
              </div>
              <button
                className="rounded-full bg-lime px-6 py-2 text-ink"
                onClick={sendGuess}
                disabled={!roundActive}
              >
                Enviar
              </button>
            </div>

            {answerName && (
              <div className="mt-6 rounded-xl border border-clay/10 bg-black/40 p-4 text-clay/80">
                <p className="text-sm text-clay/60">Respuesta de la ronda</p>
                <div className="mt-2 flex items-center gap-3">
                  {answerPhoto ? (
                    <img src={answerPhoto} alt={answerName} className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-lime/20" />
                  )}
                  <div>
                    <p className="text-lg text-clay">{answerName}</p>
                    <ul className="mt-1 text-xs text-clay/60">
                      {answerHints.map((hint, idx) => (
                        <li key={idx}>
                          {hint.key === 'photoUrl' ? 'foto revelada' : `${hint.key}: ${hint.value}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {scores.length > 0 && (
              <div className="mt-6">
                <h4 className="text-lg font-display text-clay">Marcador</h4>
                <ul className="mt-2 space-y-1 text-clay/80">
                  {scores.map((s) => (
                    <li key={s.userId}>
                      Usuario {s.userId}: {s.score}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {message && <p className="mt-4 text-lime">{message}</p>}
          </Panel>
        )}
      </div>
    </main>
  );
}

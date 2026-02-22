'use client';

import { useEffect, useState } from 'react';
import { socket } from '@/lib/socket';
import Panel from '@/components/Panel';

type Score = { userId: number; score: number };

export default function MultiplayerPage() {
  const [code, setCode] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [hints, setHints] = useState<any[]>([]);
  const [guess, setGuess] = useState('');
  const [scores, setScores] = useState<Score[]>([]);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      socket.auth = { token };
      socket.connect();
      setReady(true);
    }

    socket.on('round:hint', (data) => {
      setHints((prev) => [...prev, data.hint]);
    });
    socket.on('game:score', (data) => {
      setScores(data.scores);
    });
    socket.on('game:finish', (data) => {
      setMessage(`Ganador: ${data.winnerUserId}`);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = async () => {
    const res = await socket.emitWithAck('room:create');
    setRoomCode(res.code);
    setHints([]);
  };

  const joinRoom = async () => {
    const res = await socket.emitWithAck('room:join', { code });
    setRoomCode(res.code);
    setHints([]);
  };

  const startGame = async () => {
    await socket.emitWithAck('game:start', { code: roomCode });
    setHints([]);
  };

  const sendGuess = async () => {
    if (!roomCode) return;
    await socket.emitWithAck('round:answer', { code: roomCode, guess });
    setGuess('');
  };

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

        {ready && (
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

        {roomCode && (
          <Panel title={`Sala ${roomCode}`}>
            <button className="rounded-full bg-lime px-6 py-2 text-ink" onClick={startGame}>
              Empezar partida
            </button>

            <div className="mt-6">
              <h4 className="text-lg font-display text-clay">Pistas</h4>
              <ul className="mt-2 space-y-2 text-clay/80">
                {hints.map((hint, index) => (
                  <li key={index}>
                    {hint.key}: {hint.value}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex gap-2">
              <input
                className="flex-1 rounded-lg bg-black/40 px-4 py-2 text-clay"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="Tu respuesta"
              />
              <button className="rounded-full bg-lime px-6 py-2 text-ink" onClick={sendGuess}>
                Enviar
              </button>
            </div>

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

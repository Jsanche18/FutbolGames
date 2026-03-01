'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import Panel from '@/components/Panel';

const TOP_LEAGUES = [
  { label: 'Todas las ligas', value: '' },
  { label: 'España - La Liga', value: '140' },
  { label: 'Francia - Ligue 1', value: '61' },
  { label: 'Arabia Saudita - Pro League', value: '307' },
  { label: 'EE.UU. - MLS', value: '253' },
  { label: 'Argentina - Liga Profesional', value: '128' },
  { label: 'Brasil - Serie A', value: '71' },
  { label: 'Inglaterra - Premier League', value: '39' },
  { label: 'Alemania - Bundesliga', value: '78' },
  { label: 'Italia - Serie A', value: '135' },
];

export default function HangmanPage() {
  const [leagueApiId, setLeagueApiId] = useState<string>('');
  const [pool, setPool] = useState<'important' | 'all'>('important');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [masked, setMasked] = useState('');
  const [letterAttempts, setLetterAttempts] = useState(0);
  const [solveAttempts, setSolveAttempts] = useState(0);
  const [letterGuess, setLetterGuess] = useState('');
  const [solveGuess, setSolveGuess] = useState('');
  const [message, setMessage] = useState('');

  const start = async () => {
    const res = await api.post('/games/hangman/start', {
      pool,
      ...(leagueApiId ? { leagueApiId: Number(leagueApiId) } : {}),
    });
    setSessionId(res.data.sessionId);
    setMasked(res.data.masked);
    setLetterAttempts(res.data.letterAttemptsLeft ?? 10);
    setSolveAttempts(res.data.solveAttemptsLeft ?? 2);
    setMessage('');
    setLetterGuess('');
    setSolveGuess('');
  };

  const sendLetterGuess = async () => {
    if (!sessionId) return;
    if (!letterGuess.trim()) return;
    const res = await api.post('/games/hangman/guess', { sessionId, guess: letterGuess.trim().slice(0, 1) });
    setMasked(res.data.masked);
    setLetterAttempts(res.data.letterAttemptsLeft);
    setSolveAttempts(res.data.solveAttemptsLeft);
    if (res.data.solved) setMessage('¡Correcto!');
    if (res.data.failed) setMessage(`Perdiste. El jugador era ${res.data.answer}`);
    setLetterGuess('');
  };

  const sendSolveGuess = async () => {
    if (!sessionId) return;
    if (!solveGuess.trim()) return;
    const res = await api.post('/games/hangman/guess', { sessionId, guess: solveGuess.trim() });
    setMasked(res.data.masked);
    setLetterAttempts(res.data.letterAttemptsLeft);
    setSolveAttempts(res.data.solveAttemptsLeft);
    if (res.data.solved) setMessage('¡Correcto!');
    if (res.data.failed) setMessage(`Perdiste. El jugador era ${res.data.answer}`);
    setSolveGuess('');
  };

  return (
    <main className="min-h-screen bg-pitch px-6 py-12">
      <div className="mx-auto max-w-xl space-y-6">
        <header>
          <h1 className="text-3xl font-display font-bold text-clay">Hangman</h1>
          <p className="text-clay/70">10 intentos de letras y 2 intentos para resolver.</p>
        </header>
        <Panel title="Partida">
          <div className="mb-4 flex flex-wrap gap-2">
            <select
              className="rounded-lg bg-black/40 px-4 py-2 text-clay"
              value={leagueApiId}
              onChange={(e) => setLeagueApiId(e.target.value)}
            >
              {TOP_LEAGUES.map((league) => (
                <option key={league.label} value={league.value}>
                  {league.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg bg-black/40 px-4 py-2 text-clay"
              value={pool}
              onChange={(e) => setPool(e.target.value as 'important' | 'all')}
            >
              <option value="important">Jugadores importantes</option>
              <option value="all">Todos los jugadores</option>
            </select>
          </div>
          <button className="rounded-full bg-lime px-6 py-2 text-ink" onClick={start}>
            Empezar
          </button>
          {sessionId && (
            <div className="mt-6">
              <p className="text-2xl tracking-[0.4em] text-clay">{masked}</p>
              <p className="mt-2 text-clay/70">Intentos letras: {letterAttempts}</p>
              <p className="text-clay/70">Intentos resolver: {solveAttempts}</p>
              <div className="mt-4 flex gap-2">
                <input
                  className="flex-1 rounded-lg bg-black/40 px-4 py-2 text-clay"
                  value={letterGuess}
                  onChange={(e) => setLetterGuess(e.target.value)}
                  placeholder="Introduce una letra"
                />
                <button className="rounded-full bg-lime px-4 py-2 text-ink" onClick={sendLetterGuess}>
                  Probar letra
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  className="flex-1 rounded-lg bg-black/40 px-4 py-2 text-clay"
                  value={solveGuess}
                  onChange={(e) => setSolveGuess(e.target.value)}
                  placeholder="Resolver nombre completo"
                />
                <button className="rounded-full bg-lime px-4 py-2 text-ink" onClick={sendSolveGuess}>
                  Resolver
                </button>
              </div>
              {message && <p className="mt-4 text-lime">{message}</p>}
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}

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

export default function MarketGamePage() {
  const [leagueApiId, setLeagueApiId] = useState('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [player, setPlayer] = useState<any>(null);
  const [guess, setGuess] = useState('');
  const [result, setResult] = useState<any>(null);

  const start = async () => {
    const res = await api.post('/games/market/start', {
      pool: 'important',
      ...(leagueApiId ? { leagueApiId: Number(leagueApiId) } : {}),
    });
    setSessionId(res.data.sessionId);
    setPlayer(res.data.player);
    setResult(null);
    setGuess('');
  };

  const submit = async () => {
    if (!sessionId) return;
    const value = Number(guess);
    if (!Number.isFinite(value) || value <= 0) return;
    const res = await api.post('/games/market/guess', { sessionId, guessValueM: value });
    setResult(res.data);
  };

  return (
    <main className="min-h-screen bg-pitch px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-3xl font-display font-bold text-clay">Adivina Valor</h1>
          <p className="text-clay/70">¿Cuánto vale este jugador en millones de euros?</p>
        </header>

        <Panel title="Partida">
          <div className="flex flex-wrap gap-3">
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
            <button className="rounded-full bg-lime px-6 py-2 text-ink" onClick={start}>
              Nueva ronda
            </button>
          </div>

          {player && (
            <div className="mt-6 rounded-xl border border-clay/10 bg-black/40 p-4 text-clay">
              <div className="flex items-center gap-3">
                {player.photoUrl ? (
                  <img src={player.photoUrl} alt={player.name} className="h-16 w-16 rounded-full object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-lime/30 text-ink">
                    {String(player.name || '')
                      .split(' ')
                      .slice(0, 2)
                      .map((part: string) => part[0] || '')
                      .join('')}
                  </div>
                )}
                <div>
                  <p className="text-xl">{player.name}</p>
                  <p className="text-sm text-clay/70">{player.teamName || 'Sin equipo'}</p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  className="flex-1 rounded-lg bg-black/50 px-4 py-2 text-clay outline-none"
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  placeholder="Ej: 80"
                />
                <button className="rounded-full bg-lime px-4 py-2 text-ink" onClick={submit}>
                  Comprobar
                </button>
              </div>

              {result && (
                <div className="mt-4 text-sm text-clay">
                  <p className="text-lime">
                    {result.correct ? 'Muy bien, acertaste (±5M).' : result.veryClose ? 'Cerca (±10M).' : 'No.'}
                  </p>
                  <p>Valor real: €{result.targetValueM}M</p>
                  <p>Diferencia: €{result.diffM}M</p>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}

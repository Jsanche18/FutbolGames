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

export default function SortPage() {
  const [stat, setStat] = useState<'goals' | 'assists' | 'appearances'>('goals');
  const [leagueApiId, setLeagueApiId] = useState<string>('');
  const [pool, setPool] = useState<'important' | 'all'>('important');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [order, setOrder] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const start = async () => {
    try {
      const res = await api.post('/games/sort/start', {
        stat,
        count: 5,
        pool,
        ...(leagueApiId ? { leagueApiId: Number(leagueApiId) } : {}),
      });
      setSessionId(res.data.sessionId);
      setPlayers(res.data.players);
      setOrder(res.data.players);
      setResult(null);
      setMessage('');
    } catch (err: any) {
      setPlayers([]);
      setOrder([]);
      setSessionId(null);
      setResult(null);
      setMessage(
        err?.response?.data?.message ||
          'Sin datos todavía. Estamos sincronizando, intenta de nuevo en unos segundos.',
      );
    }
  };

  const submit = async () => {
    if (!sessionId) return;
    const ids = order.map((p) => p.apiId);
    const res = await api.post('/games/sort/submit', {
      sessionId,
      orderedPlayerApiIds: ids,
    });
    setResult(res.data);
  };

  const onDragStart = (index: number) => {
    setDragIndex(index);
  };

  const onDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    const updated = [...order];
    const [item] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, item);
    setOrder(updated);
    setDragIndex(null);
  };

  return (
    <main className="min-h-screen bg-pitch px-6 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-display font-bold text-clay">Ordénalo</h1>
          <p className="text-clay/70">Ordena de mayor a menor.</p>
        </header>

        <Panel title="Partida">
          <div className="flex flex-wrap items-center gap-4">
            <select
              className="rounded-lg bg-black/40 px-4 py-2 text-clay"
              value={stat}
              onChange={(e) => setStat(e.target.value as any)}
            >
              <option value="goals">Goles</option>
              <option value="assists">Asistencias</option>
              <option value="appearances">Partidos</option>
            </select>
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
            <button className="rounded-full bg-lime px-6 py-2 text-ink" onClick={start}>
              Iniciar
            </button>
          </div>
          {players.length > 0 && (
            <div className="mt-6">
              <p className="text-sm text-clay/70">Arrastra las tarjetas al orden correcto.</p>
              <div className="mt-4 space-y-2">
                {order.map((p, index) => (
                  <div
                    key={p.apiId}
                    draggable
                    onDragStart={() => onDragStart(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(index)}
                    className="cursor-move rounded-xl border border-clay/10 bg-black/40 px-4 py-3 text-clay/80 hover:border-lime/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        {p.photoUrl ? (
                          <img src={p.photoUrl} alt={p.name} className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lime/30 text-xs text-ink">
                            {String(p.name || '')
                              .split(' ')
                              .slice(0, 2)
                              .map((part: string) => part[0] || '')
                              .join('')}
                          </span>
                        )}
                        <span>{p.name}</span>
                      </span>
                      <span className="text-xs text-clay/60">?</span>
                    </div>
                  </div>
                ))}
              </div>
              <button className="mt-4 rounded-full bg-lime px-6 py-2 text-ink" onClick={submit}>
                Comprobar orden
              </button>
            </div>
          )}
          {message && <p className="mt-4 text-sm text-lime">{message}</p>}
          {result && (
            <div className="mt-6 space-y-4">
              <p className="text-lime">
                {result.correct ? '¡Correcto!' : 'Incorrecto. Este es el orden correcto:'}
              </p>
              <div>
                <h4 className="text-sm text-clay/70">Tu orden</h4>
                <div className="mt-2 space-y-2">
                  {order.map((p) => (
                    <div
                      key={p.apiId}
                      className="rounded-xl border border-clay/10 bg-black/40 px-4 py-2 text-clay/80"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          {p.photoUrl ? (
                            <img src={p.photoUrl} alt={p.name} className="h-7 w-7 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lime/30 text-[10px] text-ink">
                              {String(p.name || '')
                                .split(' ')
                                .slice(0, 2)
                                .map((part: string) => part[0] || '')
                                .join('')}
                            </span>
                          )}
                          <span>{p.name}</span>
                        </span>
                        <span className="text-xs text-lime">{p.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm text-clay/70">Orden correcto</h4>
                <div className="mt-2 space-y-2">
                  {(result.correctOrder || []).map((id: number) => {
                    const player = players.find((p) => p.apiId === id);
                    if (!player) return null;
                    return (
                      <div
                        key={player.apiId}
                        className="rounded-xl border border-lime/30 bg-black/40 px-4 py-2 text-clay/80"
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            {player.photoUrl ? (
                              <img
                                src={player.photoUrl}
                                alt={player.name}
                                className="h-7 w-7 rounded-full object-cover"
                              />
                            ) : (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lime/30 text-[10px] text-ink">
                                {String(player.name || '')
                                  .split(' ')
                                  .slice(0, 2)
                                  .map((part: string) => part[0] || '')
                                  .join('')}
                              </span>
                            )}
                            <span>{player.name}</span>
                          </span>
                          <span className="text-xs text-lime">{player.value}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}

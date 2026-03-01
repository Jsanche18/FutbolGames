'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/Panel';
import PitchBoard from '@/components/PitchBoard';
import PlayerSearch, { SearchPlayer } from '@/components/PlayerSearch';
import SelectedPlayerBanner from '@/components/SelectedPlayerBanner';
import { api } from '@/lib/api';

type Slot = {
  slotId: string;
  position: string;
  player?: SearchPlayer | null;
};

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

export default function LineupPage() {
  const [formation, setFormation] = useState<'433' | '442'>('433');
  const [selectedPlayer, setSelectedPlayer] = useState<SearchPlayer | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<string>('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const templates = useMemo(
    () => [
      {
        name: 'Argentina XI',
        rulesJson: {
          allowedNationalities: ['Argentina'],
          maxFromTeam: 3,
        },
      },
    ],
    [],
  );

  const slotLayout = useMemo(() => {
    if (formation === '442') {
      return [
        { slotId: 'gk', position: 'GK' },
        { slotId: 'lb', position: 'LB' },
        { slotId: 'cb1', position: 'CB' },
        { slotId: 'cb2', position: 'CB' },
        { slotId: 'rb', position: 'RB' },
        { slotId: 'lm', position: 'LM' },
        { slotId: 'cm1', position: 'CM' },
        { slotId: 'cm2', position: 'CM' },
        { slotId: 'rm', position: 'RM' },
        { slotId: 'st1', position: 'ST' },
        { slotId: 'st2', position: 'ST' },
      ];
    }
    return [
      { slotId: 'gk', position: 'GK' },
      { slotId: 'lb', position: 'LB' },
      { slotId: 'cb1', position: 'CB' },
      { slotId: 'cb2', position: 'CB' },
      { slotId: 'rb', position: 'RB' },
      { slotId: 'cm1', position: 'CM' },
      { slotId: 'cm2', position: 'CM' },
      { slotId: 'cm3', position: 'CM' },
      { slotId: 'lw', position: 'LW' },
      { slotId: 'st', position: 'ST' },
      { slotId: 'rw', position: 'RW' },
    ];
  }, [formation]);

  useEffect(() => {
    setSlots(slotLayout.map((slot) => ({ ...slot, player: null })));
  }, [slotLayout]);

  useEffect(() => {
    const createTemplate = async () => {
      const res = await api.post('/games/lineup/templates', templates[0]);
      setTemplateId(res.data.id);
    };
    createTemplate();
  }, [templates]);

  const onSlotClick = (slot: Slot) => {
    if (!selectedPlayer) return;
    const allowed = selectedPlayer.allowedPositions.includes(slot.position);
    if (!allowed) {
      setMessage('Posición no válida.');
      return;
    }
    setSlots((prev) =>
      prev.map((s) =>
        s.slotId === slot.slotId ? { ...s, player: selectedPlayer } : s,
      ),
    );
    setSelectedPlayer(null);
    setMessage('');
  };

  const removePlayer = (slotId: string) => {
    setSlots((prev) => prev.map((s) => (s.slotId === slotId ? { ...s, player: null } : s)));
  };

  const submit = async () => {
    if (!templateId) return;
    const players = slots.filter((s) => s.player).map((s) => s.player!.apiId);
    if (players.length !== 11) {
      setMessage('Debes completar los 11 jugadores.');
      return;
    }
    try {
      await api.post('/games/lineup/submit', {
        templateId,
        playerApiIds: players,
        lineupSlots: slots.map((s) => ({ playerApiId: s.player?.apiId, slotPosition: s.position })),
      });
      setMessage('¡Felicidades, completaste el reto!');
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Ese jugador es erróneo.');
    }
  };

  const clearAll = () => {
    setSlots(slotLayout.map((slot) => ({ ...slot, player: null })));
    setMessage('');
  };

  const filledCount = slots.filter((s) => s.player).length;

  return (
    <main className="min-h-screen bg-pitch px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-4xl font-display font-bold text-clay">Alineador</h1>
          <p className="text-clay/70">Selecciona jugadores y colócalos en el campo.</p>
        </header>

        <Panel title="Campo">
          <div className="mb-4 flex items-center gap-3">
            {(['433', '442'] as const).map((f) => (
              <button
                key={f}
                className={`rounded-full px-4 py-2 text-sm ${
                  formation === f ? 'bg-lime text-ink' : 'border border-clay/30 text-clay'
                }`}
                onClick={() => setFormation(f)}
              >
                {f}
              </button>
            ))}
            <span className="text-sm text-clay/60">{filledCount}/11</span>
          </div>
          <PitchBoard formation={formation} selectedPlayer={selectedPlayer} slots={slots} onSlotClick={onSlotClick} />
        </Panel>

        <Panel title="Buscar jugador">
          <SelectedPlayerBanner player={selectedPlayer} onClear={() => setSelectedPlayer(null)} />
          <div className="mt-4">
            <label className="mb-2 block text-sm text-clay/70">Liga</label>
            <select
              className="w-full rounded-lg bg-black/50 px-4 py-3 text-clay outline-none"
              value={selectedLeague}
              onChange={(e) => setSelectedLeague(e.target.value)}
            >
              {TOP_LEAGUES.map((league) => (
                <option key={league.label} value={league.value}>
                  {league.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4">
            <PlayerSearch
              onSelect={setSelectedPlayer}
              leagueApiId={selectedLeague ? Number(selectedLeague) : undefined}
            />
          </div>
          <div className="mt-4 flex gap-3">
            <button className="rounded-full bg-lime px-6 py-2 text-ink" onClick={submit}>
              Guardar alineación
            </button>
            <button className="rounded-full border border-clay/30 px-6 py-2 text-clay" onClick={clearAll}>
              Limpiar
            </button>
          </div>
          {message && <p className="mt-4 text-lime">{message}</p>}
        </Panel>

        <Panel title="Gestionar jugadores">
          <div className="grid gap-2 md:grid-cols-2">
            {slots.map((slot) => (
              <div key={slot.slotId} className="rounded-lg border border-clay/10 bg-black/40 p-3 text-clay/80">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-clay/50">{slot.position}</p>
                    <p>{slot.player?.name || 'Vacío'}</p>
                  </div>
                  {slot.player && (
                    <button className="text-xs text-lime" onClick={() => removePlayer(slot.slotId)}>
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </main>
  );
}

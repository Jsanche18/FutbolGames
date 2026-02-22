import { useMemo } from 'react';

type Slot = {
  id: string;
  position: string;
  x: number;
  y: number;
};

type Player = {
  apiId: number;
  name: string;
  photoUrl?: string;
  allowedPositions: string[];
};

type SlotAssignment = {
  slotId: string;
  position: string;
  player?: Player | null;
};

type Props = {
  formation: '433' | '442';
  selectedPlayer: Player | null;
  slots: SlotAssignment[];
  onSlotClick: (slot: SlotAssignment) => void;
};

const formations: Record<'433' | '442', Slot[]> = {
  '433': [
    { id: 'gk', position: 'GK', x: 50, y: 88 },
    { id: 'lb', position: 'LB', x: 15, y: 70 },
    { id: 'cb1', position: 'CB', x: 38, y: 70 },
    { id: 'cb2', position: 'CB', x: 62, y: 70 },
    { id: 'rb', position: 'RB', x: 85, y: 70 },
    { id: 'cm1', position: 'CM', x: 25, y: 48 },
    { id: 'cm2', position: 'CM', x: 50, y: 48 },
    { id: 'cm3', position: 'CM', x: 75, y: 48 },
    { id: 'lw', position: 'LW', x: 25, y: 20 },
    { id: 'st', position: 'ST', x: 50, y: 20 },
    { id: 'rw', position: 'RW', x: 75, y: 20 },
  ],
  '442': [
    { id: 'gk', position: 'GK', x: 50, y: 88 },
    { id: 'lb', position: 'LB', x: 15, y: 70 },
    { id: 'cb1', position: 'CB', x: 38, y: 70 },
    { id: 'cb2', position: 'CB', x: 62, y: 70 },
    { id: 'rb', position: 'RB', x: 85, y: 70 },
    { id: 'lm', position: 'LM', x: 15, y: 48 },
    { id: 'cm1', position: 'CM', x: 38, y: 48 },
    { id: 'cm2', position: 'CM', x: 62, y: 48 },
    { id: 'rm', position: 'RM', x: 85, y: 48 },
    { id: 'st1', position: 'ST', x: 35, y: 20 },
    { id: 'st2', position: 'ST', x: 65, y: 20 },
  ],
};

function initials(name: string) {
  const parts = name.split(' ').filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export default function PitchBoard({ formation, selectedPlayer, slots, onSlotClick }: Props) {
  const layout = formations[formation];

  const slotMap = useMemo(() => {
    const map = new Map<string, SlotAssignment>();
    slots.forEach((slot) => map.set(slot.slotId, slot));
    return map;
  }, [slots]);

  return (
    <div className="relative h-[520px] rounded-2xl border border-clay/10 bg-[linear-gradient(180deg,#0f6b3b_0%,#0b1f14_100%)]">
      <div className="absolute inset-6 rounded-xl border border-clay/20" />
      <div className="absolute left-1/2 top-6 h-[calc(100%-48px)] w-px -translate-x-1/2 bg-clay/20" />
      {layout.map((slot) => {
        const assigned = slotMap.get(slot.id);
        const isCompatible =
          selectedPlayer?.allowedPositions?.includes(slot.position) ?? false;
        return (
          <button
            key={slot.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-2 text-xs ${
              assigned?.player
                ? 'bg-black/70 text-clay border-lime/40'
                : 'bg-black/50 text-clay/80 border-clay/30'
            } ${selectedPlayer ? (isCompatible ? 'ring-2 ring-lime/60' : 'opacity-40') : ''}`}
            style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: '90px', height: '90px' }}
            onClick={() => onSlotClick({ slotId: slot.id, position: slot.position, player: assigned?.player })}
          >
            <div className="flex h-full flex-col items-center justify-center gap-1">
              {assigned?.player ? (
                assigned.player.photoUrl ? (
                  <img
                    src={assigned.player.photoUrl}
                    alt={assigned.player.name}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-lime/30 text-[10px] text-ink">
                    {initials(assigned.player.name)}
                  </div>
                )
              ) : null}
              <span className="text-[10px] text-clay/80">{slot.position}</span>
              <span className="text-[10px] text-clay">
                {assigned?.player ? assigned.player.name.split(' ')[0] : 'Vacío'}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

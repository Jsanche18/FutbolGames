import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export type SearchPlayer = {
  apiId: number;
  name: string;
  photoUrl?: string;
  nationality?: string;
  teamName?: string;
  primaryPosition?: string;
  allowedPositions: string[];
};

type Props = {
  onSelect: (player: SearchPlayer) => void;
};

export default function PlayerSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchPlayer[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const timer = useRef<NodeJS.Timeout | null>(null);

  const search = async (value: string) => {
    if (!value) {
      setResults([]);
      return;
    }
    const res = await api.get('/players/search', { params: { q: value } });
    const items = res.data?.items || [];
    setResults(items.slice(0, 10));
    setActiveIndex(0);
    setOpen(true);
  };

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      search(query);
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const player = results[activeIndex];
      if (player) {
        onSelect(player);
        setOpen(false);
        setQuery('');
      }
    }
  };

  return (
    <div className="relative">
      <input
        className="w-full rounded-lg bg-black/50 px-4 py-3 text-clay outline-none"
        placeholder="Buscar jugador..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-clay/20 bg-black/80 text-sm text-clay/80">
          {results.map((player, index) => (
            <button
              key={player.apiId}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/10 ${
                index === activeIndex ? 'bg-white/10' : ''
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                onSelect(player);
                setOpen(false);
                setQuery('');
              }}
            >
              {player.photoUrl ? (
                <img src={player.photoUrl} alt={player.name} className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-lime/30 text-xs text-ink">
                  {player.name
                    .split(' ')
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join('')}
                </div>
              )}
              <div>
                <p className="text-clay">{player.name}</p>
                <p className="text-xs text-clay/60">
                  {player.teamName || 'Sin equipo'} · {player.primaryPosition || 'N/A'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

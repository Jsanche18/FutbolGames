import { SearchPlayer } from './PlayerSearchAutocomplete';

export default function SelectedPlayerBanner({
  player,
  onClear,
}: {
  player: SearchPlayer | null;
  onClear: () => void;
}) {
  if (!player) return null;
  return (
    <div className="rounded-xl border border-lime/30 bg-black/50 p-4 text-clay">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-clay/60">Jugador seleccionado</p>
          <p className="text-lg font-semibold">{player.name}</p>
          <p className="text-xs text-clay/60">
            Posiciones: {player.allowedPositions.join(', ') || 'N/A'}
          </p>
        </div>
        <button className="rounded-full border border-clay/30 px-3 py-1 text-xs" onClick={onClear}>
          Quitar
        </button>
      </div>
      <p className="mt-2 text-xs text-clay/60">Haz click en un slot compatible para colocarlo.</p>
    </div>
  );
}

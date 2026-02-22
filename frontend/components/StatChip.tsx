export default function StatChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-clay/20 bg-black/30 px-3 py-1 text-xs text-clay/80">
      {label}
    </span>
  );
}

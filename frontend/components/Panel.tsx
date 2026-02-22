import { ReactNode } from 'react';

export default function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-clay/10 bg-white/5 p-6">
      <h2 className="text-xl font-display text-clay">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

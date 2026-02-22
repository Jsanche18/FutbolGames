import Link from 'next/link';
import StatChip from '@/components/StatChip';

const cards = [
  {
    title: 'Lineup Builder',
    description: 'Crea un XI temático y valida reglas.',
    href: '/lineup',
  },
  {
    title: 'Hangman',
    description: 'Adivina el jugador letra a letra.',
    href: '/hangman',
  },
  {
    title: 'Sort by Stats',
    description: 'Ordena jugadores por estadísticas.',
    href: '/sort',
  },
  {
    title: 'Multiplayer',
    description: 'Duelo en tiempo real con pistas.',
    href: '/multiplayer',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0f6b3b_0%,#0b1f14_55%,#08130c_100%)]">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10">
          <p className="text-lime text-sm uppercase tracking-[0.3em]">Futbol-11</p>
          <h1 className="text-4xl md:text-6xl font-display font-bold text-clay">
            Mini-juegos de fútbol con datos reales
          </h1>
          <p className="mt-4 max-w-2xl text-clay/80">
            Inspirado en futbol-11.com, con modos individuales y multijugador en tiempo real.
          </p>
          <div className="mt-6 flex gap-4">
            <Link
              href="/auth/login"
              className="rounded-full bg-lime px-6 py-2 text-ink font-semibold shadow-glow"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/auth/register"
              className="rounded-full border border-clay/30 px-6 py-2 text-clay"
            >
              Crear cuenta
            </Link>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          {cards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="rounded-2xl border border-clay/10 bg-white/5 p-6 backdrop-blur transition hover:border-lime/50 hover:bg-white/10"
            >
              <h3 className="text-2xl font-display font-semibold text-clay">{card.title}</h3>
              <p className="mt-2 text-clay/70">{card.description}</p>
              <span className="mt-4 inline-block text-lime">Jugar ahora →</span>
            </Link>
          ))}
        </section>

        <section className="mt-12 rounded-2xl border border-clay/10 bg-white/5 p-6">
          <h2 className="text-xl font-display text-clay">Cómo funciona</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <StatChip label="Datos reales API-FOOTBALL" />
            <StatChip label="Multiplayer en tiempo real" />
            <StatChip label="Puntuación por rendimiento" />
            <StatChip label="Reglas personalizadas" />
          </div>
          <p className="mt-4 text-clay/70">
            Sin exponer la API key en frontend. Todo pasa por el backend con caché y rate limit.
          </p>
        </section>
      </div>
    </main>
  );
}

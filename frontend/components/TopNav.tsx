'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function TopNav() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem('token'));
  }, []);

  return (
    <nav className="sticky top-0 z-20 border-b border-clay/10 bg-pitch/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-display font-bold text-clay">
          Futbol-11
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/lineup" className="text-clay/80 hover:text-lime">
            Lineup
          </Link>
          <Link href="/hangman" className="text-clay/80 hover:text-lime">
            Hangman
          </Link>
          <Link href="/sort" className="text-clay/80 hover:text-lime">
            Sort
          </Link>
          <Link href="/market" className="text-clay/80 hover:text-lime">
            Market Value
          </Link>
          <Link href="/multiplayer" className="text-clay/80 hover:text-lime">
            Multiplayer
          </Link>
          {token ? (
            <span className="rounded-full border border-lime/40 px-3 py-1 text-lime">Conectado</span>
          ) : (
            <Link href="/auth/login" className="rounded-full bg-lime px-3 py-1 text-ink">
              Entrar
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

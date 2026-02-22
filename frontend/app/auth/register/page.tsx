'use client';

import { useState } from 'react';
import { api, setAuthToken } from '@/lib/api';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/auth/register', { email, password });
      const token = res.data.accessToken;
      const refresh = res.data.refreshToken;
      localStorage.setItem('token', token);
      localStorage.setItem('refreshToken', refresh);
      setAuthToken(token);
      setMessage('Registro correcto');
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Error de registro');
    }
  };

  return (
    <main className="min-h-screen bg-pitch px-6 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-clay/10 bg-white/5 p-6">
        <h1 className="text-3xl font-display font-bold text-clay">Crear cuenta</h1>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <input
            className="w-full rounded-lg bg-black/40 px-4 py-3 text-clay outline-none"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full rounded-lg bg-black/40 px-4 py-3 text-clay outline-none"
            placeholder="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="w-full rounded-full bg-lime px-6 py-3 text-ink font-semibold">
            Crear cuenta
          </button>
        </form>
        {message && <p className="mt-4 text-sm text-lime">{message}</p>}
      </div>
    </main>
  );
}

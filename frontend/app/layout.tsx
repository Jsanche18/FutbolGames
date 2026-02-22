import './globals.css';
import type { Metadata } from 'next';
import TopNav from '@/components/TopNav';
import ClientAuthInit from '@/components/ClientAuthInit';

export const metadata: Metadata = {
  title: 'Futbol-11',
  description: 'Mini-juegos de fútbol',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ClientAuthInit />
        <TopNav />
        {children}
      </body>
    </html>
  );
}

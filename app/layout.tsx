import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lokalnie | Asystent dokumentacji',
  description: 'Rozmowa z lokalnym asystentem dokumentacji.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
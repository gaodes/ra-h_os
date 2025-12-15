import './globals.css';

export const metadata = {
  title: 'RA-H Open Source',
  description: 'Local-first research workspace with a BYO-key AI orchestrator',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

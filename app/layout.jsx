import './globals.css';

export const metadata = {
  title: 'Digital Thank You Wall',
  description:
    'A cinematic Delft Blue appreciation wall for Givewall partners and sponsors.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

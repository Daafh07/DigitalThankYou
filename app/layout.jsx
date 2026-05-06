import './globals.css';

export const metadata = {
  title: 'Digital Thank You Wall',
  description:
    'A cinematic Delft Blue appreciation wall for Givewall partners and sponsors.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

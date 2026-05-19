'use client';

import dynamic from 'next/dynamic';

const DigitalThankYouWall = dynamic(() => import('@/components/DigitalThankYouWall'), {
  ssr: false,
});

export default function Home() {
  return <DigitalThankYouWall />;
}

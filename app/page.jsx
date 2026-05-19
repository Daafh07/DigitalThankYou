'use client';

import dynamic from 'next/dynamic';

const DigitalThankYouWall = dynamic(() => import('@/components/digital-thank-you-wall'), {
  ssr: false,
});

export default function Home() {
  return <DigitalThankYouWall />;
}

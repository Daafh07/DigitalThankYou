'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import HeroScene from './HeroScene';

const FALLBACK_PARTNERS = [
  { name: 'Givewall', logo: '/assets/logos/givewall-placeholder.svg', tileStyle: 'classic' },
  { name: 'Studio Delft', logo: '/assets/logos/partner-placeholder.svg', tileStyle: 'floral' },
  { name: 'North Sea Fund', logo: '/assets/logos/partner-placeholder.svg', tileStyle: 'crest' },
  { name: 'Museum Circle', logo: '/assets/logos/partner-placeholder.svg', tileStyle: 'classic' },
];

export default function DigitalThankYouWall() {
  const [partners, setPartners] = useState(FALLBACK_PARTNERS);

  useEffect(() => {
    fetch('/assets/data/partners.json')
      .then((response) => (response.ok ? response.json() : FALLBACK_PARTNERS))
      .then((data) => setPartners(Array.isArray(data) && data.length ? data : FALLBACK_PARTNERS))
      .catch(() => setPartners(FALLBACK_PARTNERS));
  }, []);

  const primaryPartner = useMemo(() => partners[0] ?? FALLBACK_PARTNERS[0], [partners]);

  return (
    <main className="experience-shell">
      <div className="livewall-stage" aria-label="LiveWall Your Place on the Wall">
        <img className="livewall-room" src="/assets/figma/livewall-room.png" alt="" />
        <div className="livewall-title">Your Place on the Wall</div>
        <div className="livewall-wall">
          <Suspense fallback={<div className="loading">Preparing the wall</div>}>
            <HeroScene partners={partners} primaryPartner={primaryPartner} />
          </Suspense>
        </div>
        <img className="livewall-logo" src="/assets/figma/livewall-logo.png" alt="LiveWall" />
      </div>
    </main>
  );
}

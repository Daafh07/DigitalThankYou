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
      <Suspense fallback={<div className="loading">Preparing the wall</div>}>
        <HeroScene partners={partners} primaryPartner={primaryPartner} />
      </Suspense>

      <div className="brand-mark" aria-label="Digital Thank You Wall by Givewall">
        <span>Givewall</span>
        <strong>Digital Thank You Wall</strong>
      </div>
      <div className="sound-hint">Click to enable sound</div>
    </main>
  );
}

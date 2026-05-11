'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import HeroScene from './HeroScene';
import LoadingAnimation from './LoadingAnimation';

const FALLBACK_PARTNERS = [
  { name: 'Givewall', logo: '/assets/logos/givewall-placeholder.svg', tileStyle: 'classic' },
  { name: 'Studio Delft', logo: '/assets/logos/partner-placeholder.svg', tileStyle: 'floral' },
  { name: 'North Sea Fund', logo: '/assets/logos/partner-placeholder.svg', tileStyle: 'crest' },
  { name: 'Museum Circle', logo: '/assets/logos/partner-placeholder.svg', tileStyle: 'classic' },
];

const CACHE_VERSION = 'v1';
const LOADING_BACKGROUND = `/assets/figma/achtergrondloading.svg?${CACHE_VERSION}`;

export default function DigitalThankYouWall() {
  const [partners, setPartners] = useState(FALLBACK_PARTNERS);
  const [assetsReady, setAssetsReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [minimumTimePassed, setMinimumTimePassed] = useState(false);
  const [focusOverlayVisible, setFocusOverlayVisible] = useState(true);
  const [revealLightVisible, setRevealLightVisible] = useState(false);

  useEffect(() => {
    fetch('/assets/data/partners.json')
      .then((response) => (response.ok ? response.json() : FALLBACK_PARTNERS))
      .then((data) => setPartners(Array.isArray(data) && data.length ? data : FALLBACK_PARTNERS))
      .catch(() => setPartners(FALLBACK_PARTNERS));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // const minimumTimer = window.setTimeout(() => {
    //   if (!cancelled) setMinimumTimePassed(true);
    // }, 950);

    const loadImage = (src) => new Promise((resolve) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = resolve;
      image.src = src;
      if (image.decode) image.decode().then(resolve).catch(resolve);
    });

    Promise.all([
      loadImage(`/assets/figma/livewall-room.png?${CACHE_VERSION}`),
      loadImage(`/assets/figma/livewall-logo.png?${CACHE_VERSION}`),
      loadImage(LOADING_BACKGROUND),
    ]).then(() => {
      if (!cancelled) setAssetsReady(true);
    });

    return () => {
      cancelled = true;
      // window.clearTimeout(minimumTimer);
    };
  }, []);

  const primaryPartner = useMemo(() => partners[0] ?? FALLBACK_PARTNERS[0], [partners]);
  const handleSceneReady = useCallback(() => {
    setSceneReady(true);
  }, []);
  const handleLoadingComplete = useCallback(() => {
  setMinimumTimePassed(true);
}, []);
  const loadingComplete = assetsReady && sceneReady && minimumTimePassed;
  

  return (
    <main className="experience-shell">
      <div className="livewall-stage" aria-label="LiveWall Your Place on the Wall">
        <img className="livewall-room" src={`/assets/figma/livewall-room.png?${CACHE_VERSION}`} alt="" />
        <div className="livewall-title">Your Place on the Wall</div>
        <div className={`focus-overlay${focusOverlayVisible ? ' focus-overlay-visible' : ''}`} />
        <div className={`reveal-light-overlay${revealLightVisible ? ' reveal-light-overlay-visible' : ''}`} />
        <div className="livewall-wall">
          <Suspense fallback={<div className="loading">Preparing the wall</div>}>
            <HeroScene
              partners={partners}
              primaryPartner={primaryPartner}
              onReady={handleSceneReady}
              onFocusOverlayChange={setFocusOverlayVisible}
              onRevealLightChange={setRevealLightVisible}
            />
          </Suspense>
        </div>
        <img className="livewall-logo" src={`/assets/figma/livewall-logo.png?${CACHE_VERSION}`} alt="LiveWall" />
        <div className={`livewall-loader${loadingComplete ? ' livewall-loader-hidden' : ''}`} aria-hidden={loadingComplete}>
          {/* <img className="livewall-loader-bg" src={LOADING_BACKGROUND} alt="" />
          <img className="livewall-loader-logo" src={`/assets/figma/livewall-logo.png?${CACHE_VERSION}`} alt="" />
          <div className="livewall-loader-line" /> */}
         <LoadingAnimation onComplete={handleLoadingComplete} />
        </div>
      </div>
    </main>
  );
}

'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import EntryBuildingModel, { preloadEntryBuildingModel } from './EntryBuildingModel';
import HeroScene from './HeroScene';
import LoadingAnimation from './LoadingAnimation';

const FALLBACK_PARTNERS = [
  { name: 'Givewall', logo: '/assets/logos/givewall-placeholder.svg', tileStyle: 'classic' },
  { name: 'Studio Delft', logo: '/assets/logos/partner-placeholder.svg', tileStyle: 'floral' },
  { name: 'North Sea Fund', logo: '/assets/logos/partner-placeholder.svg', tileStyle: 'crest' },
  { name: 'Museum Circle', logo: '/assets/logos/partner-placeholder.svg', tileStyle: 'classic' },
];

const CACHE_VERSION = 'v3';
const LOADING_BACKGROUND = `/assets/figma/achtergrondloading.svg?${CACHE_VERSION}`;
const ENTRY_BUILDING_MODEL = '/assets/models/buildings/Livewall-gebouw.glb';
const ENTRY_TRANSITION_DURATION = 4200;

export default function DigitalThankYouWall() {
  const [partners, setPartners] = useState(FALLBACK_PARTNERS);
  const [assetsReady, setAssetsReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [minimumTimePassed, setMinimumTimePassed] = useState(false);
  const [entryTransitionVisible, setEntryTransitionVisible] = useState(false);
  const [entryTransitionDone, setEntryTransitionDone] = useState(false);
  const [entryBuildingReady, setEntryBuildingReady] = useState(false);
  const [buildingEntered, setBuildingEntered] = useState(false);
  const [wallAnimationStarted, setWallAnimationStarted] = useState(false);
  const [focusOverlayVisible, setFocusOverlayVisible] = useState(true);
  const [revealLightVisible, setRevealLightVisible] = useState(false);

  useEffect(() => {
    preloadEntryBuildingModel();

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
    const loadModel = (src) => fetch(src, { cache: 'force-cache' }).then((response) => response.blob()).catch(() => null);

    Promise.all([
      loadImage(`/assets/figma/livewall-room.png?${CACHE_VERSION}`),
      loadImage(`/assets/figma/newLogo.svg?${CACHE_VERSION}`),
      loadImage(`/assets/figma/interstitial-building.png?${CACHE_VERSION}`),
   
      loadImage(LOADING_BACKGROUND),
      loadModel(ENTRY_BUILDING_MODEL),
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
  const handleEntryBuildingReady = useCallback(() => {
    setEntryBuildingReady(true);
  }, []);
  const loadingComplete = assetsReady && sceneReady && minimumTimePassed;
  

  useEffect(() => {
    if (!loadingComplete || entryTransitionDone) return undefined;

    setEntryBuildingReady(false);
    setEntryTransitionVisible(true);
    return undefined;
  }, [entryTransitionDone, loadingComplete]);

  useEffect(() => {
    if (!entryTransitionVisible || !entryBuildingReady || entryTransitionDone) return undefined;

    const transitionTimer = window.setTimeout(() => {
      setEntryTransitionDone(true);
      setEntryTransitionVisible(false);
      setBuildingEntered(true);
      // hide the overlays when the entry animation finishes so the room with the wall is visible
      setFocusOverlayVisible(false);
      setRevealLightVisible(false);
    }, ENTRY_TRANSITION_DURATION);
    return () => {
      window.clearTimeout(transitionTimer);
    };
  }, [entryBuildingReady, entryTransitionDone, entryTransitionVisible]);

  return (
    <main className="experience-shell">
      <div className="livewall-stage" aria-label="LiveWall Your Place on the Wall">
        <img className="livewall-room" src={`/assets/figma/livewall-room.png?${CACHE_VERSION}`} alt="" />
        <div className="livewall-title">Your Place on the Wall</div>
        <div className={`focus-overlay${focusOverlayVisible && !buildingEntered ? ' focus-overlay-visible' : ''}`} />
        <div className={`reveal-light-overlay${revealLightVisible && !buildingEntered ? ' reveal-light-overlay-visible' : ''}`} />
        <div className={`livewall-wall${buildingEntered ? ' livewall-wall-visible' : ''}`}>
          <Suspense fallback={<div className="loading">Preparing the wall</div>}>
            <HeroScene
              partners={partners}
              primaryPartner={primaryPartner}
              onReady={handleSceneReady}
              onFocusOverlayChange={setFocusOverlayVisible}
              onRevealLightChange={setRevealLightVisible}
              externalFocusOverlayVisible={focusOverlayVisible && !buildingEntered}
              startIntro={wallAnimationStarted}
              startWallEntrance={buildingEntered}
              onStartIntroRequest={() => setWallAnimationStarted(true)}
            />
          </Suspense>
        </div>
        <img className="livewall-logo" src={`/assets/figma/newLogo.svg?${CACHE_VERSION}`} alt="LiveWall" />
        <div className={`livewall-loader${loadingComplete ? ' livewall-loader-hidden' : ''}`} aria-hidden={loadingComplete}>
         <LoadingAnimation onComplete={handleLoadingComplete} />
        </div>
      </div>
      <div className={`entry-transition${entryTransitionVisible ? ' entry-transition-visible' : ''}`} aria-hidden={!entryTransitionVisible || entryTransitionDone}>
        <div className="entry-transition-frame">
          <img className="entry-transition-viewport-bg" src={LOADING_BACKGROUND} alt="" />
          {entryTransitionVisible && !entryTransitionDone ? (
            <EntryBuildingModel onReady={handleEntryBuildingReady} />
          ) : null}
          <img className="entry-transition-logo" src={`/assets/figma/newLogo.svg?${CACHE_VERSION}`} alt="" />
          <div className="entry-transition-title">Your Place on the Wall</div>
        </div>
      </div>
    </main>
  );
}

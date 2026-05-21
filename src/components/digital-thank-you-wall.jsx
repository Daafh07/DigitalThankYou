"use client";

// DigitalThankYouWall is de root component van de hele ervaring.
// Het beheert de volgorde van schermen: laadscherm → gebouw-ingang → de muurscène.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import EntryBuildingModel, { preloadEntryBuildingModel } from './entry-building-model';
import HeroScene from './hero-scene';
import LoadingAnimation from './loading-animation';
import RoomDecorModels from './room-decor-models';

gsap.registerPlugin(SplitText);

// ─── Constants ───────────────────────────────────────────────────────────────

// Cache-versie wordt achter asset-URLs gezet zodat de browser oude versies niet
// hergebruikt na een deploy (bijv. /assets/figma/newLogo.svg?v3).
const CACHE_VERSION = "v3";

const LOADING_BACKGROUND = `/assets/figma/achtergrondloading.svg?${CACHE_VERSION}`;
const ENTRY_BUILDING_MODEL = "/assets/models/buildings/Livewall-gebouw.glb";

// Hoe lang de gebouw-ingangsanimatie duurt voordat de muur zichtbaar wordt (ms).
const ENTRY_TRANSITION_DURATION = 4200;

// Nooddata als partners.json niet laadbaar is (bijv. offline of tijdens ontwikkeling).
const FALLBACK_PARTNERS = [
  {
    name: "Givewall",
    logo: "/assets/logos/givewall-placeholder.svg",
    tileStyle: "classic",
  },
  {
    name: "Studio Delft",
    logo: "/assets/logos/partner-placeholder.svg",
    tileStyle: "floral",
  },
  {
    name: "North Sea Fund",
    logo: "/assets/logos/partner-placeholder.svg",
    tileStyle: "crest",
  },
  {
    name: "Museum Circle",
    logo: "/assets/logos/partner-placeholder.svg",
    tileStyle: "classic",
  },
];

// ─── Asset helpers ────────────────────────────────────────────────────────────

// Laadt een afbeelding voor en wacht tot die volledig gedecodeerd is.
// Zo verdwijnt het laadscherm pas als alle plaatjes klaar zijn om te tonen.
function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve; // ook bij een fout doorgaan, zodat het laadscherm niet vastloopt
    image.src = src;
    if (image.decode) image.decode().then(resolve).catch(resolve);
  });
}

// Haalt het 3D-gebouwmodel op en slaat het op in de browsercache.
// Three.js kan het daarna direct uit de cache lezen zonder extra netwerkverzoek.
function loadModel(src) {
  return fetch(src, { cache: "force-cache" })
    .then((res) => res.blob())
    .catch(() => null);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DigitalThankYouWall() {
  // Lijst van partners die op de muur worden getoond.
  // Begint met nooddata; wordt vervangen zodra partners.json geladen is.
  const [partners, setPartners] = useState(FALLBACK_PARTNERS);

  // De drie "poorten" die allemaal open moeten zijn voordat het laadscherm verdwijnt:
  // 1. assetsReady       – alle afbeeldingen en het 3D-model zijn voorgeladen
  // 2. sceneReady        – de WebGL-muurscène heeft zijn eerste frame getekend
  // 3. minimumTimePassed – de laadanimatie heeft zijn wipe-overgang afgerond
  const [assetsReady, setAssetsReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [minimumTimePassed, setMinimumTimePassed] = useState(false);

  // Staat voor de gebouw-ingangsanimatie (de scène waarbij je "naar binnen loopt").
  const [entryTransitionVisible, setEntryTransitionVisible] = useState(false);
  const [entryTransitionDone, setEntryTransitionDone] = useState(false);
  const [entryBuildingReady, setEntryBuildingReady] = useState(false);
  const [buildingEntered, setBuildingEntered] = useState(false);

  // Staat voor de muurscène zelf.
  const [wallAnimationStarted, setWallAnimationStarted] = useState(false);
  const [introComplete,        setIntroComplete]         = useState(false);
  const [tileInserted,         setTileInserted]          = useState(false);
  const [focusOverlayVisible,  setFocusOverlayVisible]  = useState(true);  // donkere vignette
  const [revealLightVisible,   setRevealLightVisible]   = useState(false); // gouden lichtstralen
  const [decorImpactSignal,    setDecorImpactSignal]    = useState(0);
  const [wallEntranceReady,    setWallEntranceReady]     = useState(false);
  const [lockedGlowReady,      setLockedGlowReady]       = useState(false);

  // Vazen zijn zichtbaar zodra het gebouw betreden is.
  // Muur gaat pas bewegen na 9s (nadat de vaas-animatie klaar is).
  const vasesVisible = buildingEntered;

  // Bij het mounten: start alvast het voorladen van het 3D-model en haal partnerdata op.
  // Het model is zwaar (GLB), dus zo vroeg mogelijk beginnen bespaart wachttijd later.
  useEffect(() => {
    preloadEntryBuildingModel();

    fetch("/assets/data/partners.json")
      .then((res) => (res.ok ? res.json() : FALLBACK_PARTNERS))
      .then((data) =>
        setPartners(
          Array.isArray(data) && data.length ? data : FALLBACK_PARTNERS,
        ),
      )
      .catch(() => setPartners(FALLBACK_PARTNERS));
  }, []);

  // Laad alle zichtbare afbeeldingen én het 3D-model parallel voor.
  // Pas als ze allemaal klaar zijn, zetten we assetsReady op true.
  // De `cancelled` vlag voorkomt een setState op een al unmounted component.
  useEffect(() => {
    let cancelled = false;

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
    };
  }, []);

  // De eerste partner (index 0) is altijd de "hoofdsponsor" die centraal op de muur staat.
  const primaryPartner = useMemo(
    () => partners[0] ?? FALLBACK_PARTNERS[0],
    [partners],
  );

  const hintRef        = useRef(null);
  const hintSplit      = useRef(null);
  const hintSwapTimer  = useRef(null);

  const revealHintText = (el, text) => {
    hintSplit.current?.revert();
    // innerHTML zodat <br> regeleinden mogelijk zijn voor lange zinnen
    el.innerHTML = text;
    hintSplit.current = new SplitText(el, { type: 'chars' });
    gsap.set(el, { visibility: 'visible', opacity: 1, y: 0 });
    gsap.fromTo(
      hintSplit.current.chars,
      { opacity: 0, y: 5, rotateX: -18 },
      { opacity: 1, y: 0, rotateX: 0, duration: 1.1, ease: 'power2.out', stagger: 0.04 },
    );
  };

  const hideHintText = (el, onDone) => {
    gsap.killTweensOf(el);
    gsap.to(el, {
      opacity: 0, y: -6, duration: 0.4, ease: 'power2.in',
      onComplete: () => {
        gsap.set(el, { visibility: 'hidden' });
        hintSplit.current?.revert();
        hintSplit.current = null;
        onDone?.();
      },
    });
  };

  // GSAP SplitText reveal wanneer de vrije fase start, hide wanneer tegel geplaatst is.
  useEffect(() => {
    const el = hintRef.current;
    if (!el) return;

    if (introComplete && !tileInserted) {
      gsap.killTweensOf(el);
      if (hintSwapTimer.current) { hintSwapTimer.current.kill(); hintSwapTimer.current = null; }

      revealHintText(el, 'Discover your tile');

      // Na 6s: fade out en swap naar de instructietekst
      hintSwapTimer.current = gsap.delayedCall(6, () => {
        hideHintText(el, () => revealHintText(
          el,
          'Click on the wall to add your tile to the LiveWall,<br>or click "Let\'s take a look back" for a personalised experience',
        ));
      });
    } else if (tileInserted) {
      if (hintSwapTimer.current) { hintSwapTimer.current.kill(); hintSwapTimer.current = null; }
      hideHintText(el, () => revealHintText(el, 'Explore the tile wall'));
    }

    return () => {
      if (hintSwapTimer.current) { hintSwapTimer.current.kill(); hintSwapTimer.current = null; }
    };
  }, [introComplete, tileInserted]);

  const lockHintRef   = useRef(null);
  const lockHintSplit = useRef(null);

  // "Unlock your tile" — appears once the locked glow is active, disappears on tile click.
  useEffect(() => {
    const el = lockHintRef.current;
    if (!el) return;

    if (lockedGlowReady && !wallAnimationStarted) {
      gsap.killTweensOf(el);
      lockHintSplit.current?.revert();
      lockHintSplit.current = new SplitText(el, { type: 'chars' });

      gsap.set(el, { visibility: 'visible', opacity: 1, y: 0 });
      gsap.fromTo(
        lockHintSplit.current.chars,
        { opacity: 0, y: 5, rotateX: -18 },
        { opacity: 1, y: 0, rotateX: 0, duration: 1.1, ease: 'power2.out', stagger: 0.07 },
      );
    } else if (wallAnimationStarted) {
      gsap.to(el, {
        opacity: 0, y: -6, duration: 0.4, ease: 'power2.in',
        onComplete: () => {
          gsap.set(el, { visibility: 'hidden' });
          lockHintSplit.current?.revert();
          lockHintSplit.current = null;
        },
      });
    }
  }, [lockedGlowReady, wallAnimationStarted]);

  // Stabiele callbacks zodat onderliggende componenten niet onnodig opnieuw renderen.
  const handleSceneReady           = useCallback(() => setSceneReady(true),                              []);
  const handleLoadingComplete      = useCallback(() => setMinimumTimePassed(true),                       []);
  const handleEntryBuildingReady   = useCallback(() => setEntryBuildingReady(true),                      []);
  const handleTileImpact           = useCallback(() => setDecorImpactSignal((value) => value + 1),       []);
  const handleWallEntranceComplete = useCallback(() => {/* muur is klaar, niets meer te doen */},        []);
  const handleIntroComplete        = useCallback(() => setIntroComplete(true),                           []);
  const handleTileInserted         = useCallback(() => { setTileInserted(true); setIntroComplete(false); }, []);

  // Alle drie de poorten zijn open → het laadscherm mag weg.
  const loadingComplete = assetsReady && sceneReady && minimumTimePassed;

  // Zodra het laden klaar is: verberg het laadscherm en toon de gebouw-ingang.
  // entryTransitionDone voorkomt dat dit effect opnieuw vuurt na de overgang.
  useEffect(() => {
    if (!loadingComplete || entryTransitionDone) return undefined;

    setEntryBuildingReady(false); // reset de ready-vlag zodat het 3D-gebouw opnieuw inlaadt
    setEntryTransitionVisible(true);
    return undefined;
  }, [entryTransitionDone, loadingComplete]);

  // Start de timer zodra het 3D-gebouw zijn eerste frame heeft getekend.
  // Na ENTRY_TRANSITION_DURATION ms gaan we door naar de muurscène.
  useEffect(() => {
    if (!entryTransitionVisible || !entryBuildingReady || entryTransitionDone)
      return undefined;

    const timer = window.setTimeout(() => {
      setEntryTransitionDone(true);
      setEntryTransitionVisible(false);
      setBuildingEntered(true); // dit maakt de muur zichtbaar
      setFocusOverlayVisible(false);
      setRevealLightVisible(false);
    }, ENTRY_TRANSITION_DURATION);

    return () => window.clearTimeout(timer);
  }, [entryBuildingReady, entryTransitionDone, entryTransitionVisible]);

  // Muur start pas na 9s (vaas-animatie duurt 7s + kleine buffer).
  useEffect(() => {
    if (!buildingEntered) {
      setWallEntranceReady(false);
      setLockedGlowReady(false);
      return undefined;
    }

    const wallTimer = window.setTimeout(() => setWallEntranceReady(true), 5000);
    const glowTimer = window.setTimeout(() => setLockedGlowReady(true),   14500);

    return () => {
      window.clearTimeout(wallTimer);
      window.clearTimeout(glowTimer);
    };
  }, [buildingEntered]);

  return (
    <main className="experience-shell">
      {/* De livewall-stage is de 16:10 bak waar alles in zit.
          De achtergrondafbeelding van de kamer staat hieronder als een gewone <img>. */}
      <div className={`livewall-stage${wallAnimationStarted && !introComplete && !tileInserted ? ' livewall-stage-unlocking' : ''}`} aria-label="LiveWall Your Place on the Wall">
        <img className="livewall-room" src={`/assets/figma/livewall-room.png?${CACHE_VERSION}`} alt="" />
        <RoomDecorModels
          active={entryTransitionVisible || buildingEntered}
          visible={buildingEntered}
          vasesVisible={vasesVisible}
          impactSignal={decorImpactSignal}
        />
        <div className="livewall-title">Your Place on the Wall</div>


        {/* Donkere vignette die de aandacht naar het midden trekt.
            Verdwijnt automatisch als de gebruiker zijn tegel in de muur plaatst. */}
        <div
          className={`focus-overlay${focusOverlayVisible && !buildingEntered ? " focus-overlay-visible" : ""}`}
        />

        {/* Gouden lichtgloed die verschijnt tijdens de tegel-onthulling. */}
        <div
          className={`reveal-light-overlay${revealLightVisible && !buildingEntered ? " reveal-light-overlay-visible" : ""}`}
        />

        {/* De WebGL-muurscène, verborgen totdat het gebouw betreden is.
            Suspense vangt de lazy-import op terwijl Three.js laadt. */}
        <div
          className={`livewall-wall${buildingEntered ? " livewall-wall-visible" : ""}`}
        >
          <Suspense
            fallback={<div className="loading">Preparing the wall</div>}
          >
            <HeroScene
              partners={partners}
              primaryPartner={primaryPartner}
              onReady={handleSceneReady}
              onFocusOverlayChange={setFocusOverlayVisible}
              onRevealLightChange={setRevealLightVisible}
              externalFocusOverlayVisible={
                focusOverlayVisible && !buildingEntered
              }
              startIntro={wallAnimationStarted}
              startWallEntrance={wallEntranceReady}
              lockedGlowEnabled={lockedGlowReady}
              unlockDimEnabled={wallAnimationStarted && !introComplete && !tileInserted}
              onStartIntroRequest={() => setWallAnimationStarted(true)}
              onWallEntranceComplete={handleWallEntranceComplete}
              onTileImpact={handleTileImpact}
              onIntroComplete={handleIntroComplete}
              onTileInserted={handleTileInserted}
            />
          </Suspense>
        </div>

        {/* Unlock hint — visible during locked glow, disappears on tile click */}
        <div ref={lockHintRef} className="tile-hint">
          Unlock your tile
        </div>

        {/* Vrije-fase hint — tekst wordt dynamisch gezet via GSAP SplitText */}
        <div ref={hintRef} className="tile-hint" />

        {/* Logo linksonder in de kamer, altijd zichtbaar over de scène heen. */}
        <img
          className="livewall-logo"
          src={`/assets/figma/newLogo.svg?${CACHE_VERSION}`}
          alt="LiveWall"
        />

        {/* Laadscherm bovenop alles. Verdwijnt met een fade zodra loadingComplete true is. */}
        <div
          className={`livewall-loader${loadingComplete ? " livewall-loader-hidden" : ""}`}
          aria-hidden={loadingComplete}
        >
          <LoadingAnimation onComplete={handleLoadingComplete} />
        </div>
      </div>

      {/* De gebouw-ingangsscène: een apart fullscreen-overlay met het 3D-gebouw.
          Wordt pas gemount als entryTransitionVisible true is, zodat Three.js
          niet onnodig draait terwijl het laadscherm nog zichtbaar is. */}
      <div
        className={`entry-transition${entryTransitionVisible ? " entry-transition-visible" : ""}`}
        aria-hidden={!entryTransitionVisible || entryTransitionDone}
      >
        <div className="entry-transition-frame">
          <img
            className="entry-transition-viewport-bg"
            src={LOADING_BACKGROUND}
            alt=""
          />
          {entryTransitionVisible && !entryTransitionDone && (
            <EntryBuildingModel onReady={handleEntryBuildingReady} />
          )}
          <img
            className="entry-transition-logo"
            src={`/assets/figma/newLogo.svg?${CACHE_VERSION}`}
            alt=""
          />
          <div className="entry-transition-title">Your Place on the Wall</div>
        </div>
      </div>
    </main>
  );
}

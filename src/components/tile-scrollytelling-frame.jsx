"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Timing values for the auto-scroll sequence (all in ms).
const AUTOPLAY_DELAY = 1400;
const AUTOPLAY_DURATION = 44000;
const END_HOLD_DURATION = 1600;
const RETURN_DURATION = 3300;

// Copy content for each panel in order.
const STORY_COPY = [
  {
    kicker: "Placed",
    title: "Your tile settles into the wall.",
    body: "The moment the ceramic surface closes, the wall opens into the story behind every thank you.",
    tone: "blue",
  },
  {
    kicker: "Gathered",
    title: "Every name becomes part of the same pattern.",
    body: "Partners, moments and gestures line up as one continuous Delft blue memory.",
    tone: "white",
  },
  {
    kicker: "Remembered",
    title: "A look back, held inside the frame.",
    body: "The tile grid becomes a moving window for the personalised experience.",
    tone: "gold",
  },
];

// Helper: initials for the partner tiles.
function getInitials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function TileScrollytellingFrame({
  active,
  partners = [],
  primaryPartner,
  onComplete,
} = {}) {
  const finishTimerRef = useRef(null);
  const [returning, setReturning] = useState(false);

  // Partner list used in the scrollytelling grid and ribbon (max 6 items).
  const visiblePartners = useMemo(() => {
    const source = partners.length ? partners : [primaryPartner].filter(Boolean);
    return source.slice(0, 6);
  }, [partners, primaryPartner]);

  // Panel copy with personalized title for the first slide.
  const panels = useMemo(() => {
    const leadName = primaryPartner?.name ?? visiblePartners[0]?.name ?? "Givewall";
    return STORY_COPY.map((panel, index) => ({
      ...panel,
      title: index === 0 ? `${leadName}, your place is set.` : panel.title,
    }));
  }, [primaryPartner, visiblePartners]);

  // Auto-run the scrollytelling sequence and notify when done.
  useEffect(() => {
    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }

    if (!active) {
      setReturning(false);
      return undefined;
    }

    setReturning(false);

    finishTimerRef.current = window.setTimeout(() => {
      setReturning(true);
      finishTimerRef.current = window.setTimeout(() => onComplete?.(), RETURN_DURATION);
    }, AUTOPLAY_DELAY + AUTOPLAY_DURATION + END_HOLD_DURATION);

    return () => {
      if (finishTimerRef.current) {
        window.clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }
    };
  }, [active, onComplete]);

  // Track and panel sizing derived from panel count (CSS drives animation).
  const trackStyle = {
    "--story-delay": `${AUTOPLAY_DELAY}ms`,
    "--story-duration": `${AUTOPLAY_DURATION}ms`,
    "--story-end": `${-((panels.length - 1) / panels.length) * 100}%`,
    width: `${panels.length * 100}%`,
  };

  const panelStyle = {
    flexBasis: `${100 / panels.length}%`,
  };

  return (
    <section
      className={`tile-scrolly-frame${active ? " tile-scrolly-frame-active" : ""}${returning ? " tile-scrolly-frame-returning" : ""}`}
      aria-hidden={!active}
    >
      {/* Reverse melt veil that rises when scrollytelling exits. */}
      <div className="tile-melt-veil-return" aria-hidden="true">
        {[
          { left: 3,  delay: 0,   height: 58, width: 1.4 },
          { left: 8,  delay: 200, height: 40, width: 0.9 },
          { left: 14, delay: 80,  height: 75, width: 1.1 },
          { left: 19, delay: 330, height: 46, width: 1.6 },
          { left: 25, delay: 130, height: 63, width: 0.8 },
          { left: 30, delay: 480, height: 35, width: 1.2 },
          { left: 36, delay: 50,  height: 82, width: 1.0 },
          { left: 41, delay: 270, height: 51, width: 1.5 },
          { left: 47, delay: 170, height: 69, width: 0.9 },
          { left: 52, delay: 420, height: 43, width: 1.3 },
          { left: 58, delay: 100, height: 77, width: 1.1 },
          { left: 63, delay: 360, height: 38, width: 0.8 },
          { left: 69, delay: 210, height: 60, width: 1.6 },
          { left: 74, delay: 60,  height: 47, width: 1.0 },
          { left: 80, delay: 390, height: 85, width: 1.2 },
          { left: 85, delay: 145, height: 55, width: 0.9 },
          { left: 91, delay: 290, height: 41, width: 1.4 },
          { left: 96, delay: 30,  height: 70, width: 1.1 },
        ].map((drip, index) => (
          <span
            key={index}
            style={{
              "--drip-delay": `${drip.delay}ms`,
              "--drip-left": `${drip.left}%`,
              "--drip-height": `${drip.height}%`,
              "--drip-width": `${drip.width}cqw`,
            }}
          />
        ))}
      </div>

      {/* Background drip veil effect layered behind the panels. */}
      <div className="tile-melt-veil" aria-hidden="true">
        {[
          { left: 3,  delay: 0,   height: 55, width: 1.4 },
          { left: 8,  delay: 180, height: 38, width: 0.9 },
          { left: 14, delay: 70,  height: 72, width: 1.1 },
          { left: 19, delay: 310, height: 44, width: 1.6 },
          { left: 25, delay: 120, height: 61, width: 0.8 },
          { left: 30, delay: 450, height: 33, width: 1.2 },
          { left: 36, delay: 45,  height: 80, width: 1.0 },
          { left: 41, delay: 250, height: 49, width: 1.5 },
          { left: 47, delay: 160, height: 67, width: 0.9 },
          { left: 52, delay: 400, height: 41, width: 1.3 },
          { left: 58, delay: 90,  height: 74, width: 1.1 },
          { left: 63, delay: 340, height: 36, width: 0.8 },
          { left: 69, delay: 200, height: 58, width: 1.6 },
          { left: 74, delay: 55,  height: 45, width: 1.0 },
          { left: 80, delay: 370, height: 82, width: 1.2 },
          { left: 85, delay: 135, height: 53, width: 0.9 },
          { left: 91, delay: 270, height: 39, width: 1.4 },
          { left: 96, delay: 25,  height: 68, width: 1.1 },
        ].map((drip, index) => (
          <span
            key={index}
            style={{
              "--drip-delay": `${drip.delay}ms`,
              "--drip-left": `${drip.left}%`,
              "--drip-height": `${drip.height}%`,
              "--drip-width": `${drip.width}cqw`,
            }}
          />
        ))}
      </div>

      {/* Viewport crops the animated track; track slides horizontally. */}
      <div className="tile-scrolly-viewport">
        <div className="tile-scrolly-track" style={trackStyle}>
          {/* Panel 1: intro copy + hero texture stack. */}
          <article className="tile-scrolly-panel tile-scrolly-panel-intro" style={panelStyle}>
            <div className="tile-scrolly-copy">
              <span>{panels[0].kicker}</span>
              <h2>{panels[0].title}</h2>
              <p>{panels[0].body}</p>
            </div>
            <div className="tile-scrolly-hero-stack" aria-hidden="true">
              <img src="/assets/textures/currentbrand.svg" alt="" />
              <img src="/assets/textures/rituals.svg" alt="" />
              <img src="/assets/textures/burgerking.svg" alt="" />
            </div>
          </article>

          {/* Panel 2: partner grid with initials tiles. */}
          <article className="tile-scrolly-panel tile-scrolly-panel-partners" style={panelStyle}>
            <div className="tile-scrolly-copy">
              <span>{panels[1].kicker}</span>
              <h2>{panels[1].title}</h2>
              <p>{panels[1].body}</p>
            </div>
            <div className="tile-scrolly-partner-grid" aria-hidden="true">
              {visiblePartners.map((partner, index) => (
                <div key={`${partner.name}-${index}`} className="tile-scrolly-partner-tile">
                  <img src="/assets/textures/emptytile.svg" alt="" />
                  <strong>{getInitials(partner.name)}</strong>
                </div>
              ))}
            </div>
          </article>

          {/* Panel 3: memory ribbon list with partner names. */}
          <article className="tile-scrolly-panel tile-scrolly-panel-memory" style={panelStyle}>
            <div className="tile-scrolly-copy">
              <span>{panels[2].kicker}</span>
              <h2>{panels[2].title}</h2>
              <p>{panels[2].body}</p>
            </div>
            <div className="tile-scrolly-ribbon" aria-hidden="true">
              {visiblePartners.map((partner, index) => (
                <div key={`${partner.name}-ribbon-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{partner.name}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

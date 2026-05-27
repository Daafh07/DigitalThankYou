"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Timing values for the auto-scroll sequence (all in ms).
const AUTOPLAY_DELAY = 1400;
const AUTOPLAY_DURATION = 44000;
const END_HOLD_DURATION = 1600;
const RETURN_DURATION = 1700;

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
      {/* Background drip veil effect layered behind the panels. */}
      <div className="tile-melt-veil" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, index) => (
          <span
            key={index}
            style={{
              "--drip-delay": `${index * 46}ms`,
              "--drip-left": `${6 + index * 8}%`,
              "--drip-height": `${28 + (index % 4) * 13}%`,
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

# Digital Thank You Wall

Next.js WebGL experience for Livewall: a premium Delft Blue appreciation wall where partner tiles become part of a cinematic digital monument.

## AI Product Brief

Build an immersive premium web experience called **Digital Thank You Wall** for Livewall.

The experience should feel like a mix between a luxury interactive museum installation, a cinematic WebGL website, a premium Dutch Delft Blue digital artwork, and an interactive appreciation wall for partners and sponsors.

The user enters a dark cinematic environment. In the center is a large Delft Blue tiled wall made of many glossy ceramic tiles. Each tile represents a partner. The wall should feel premium, slightly mysterious, artistic, alive and reactive. This is not a game and not a normal website. It should feel elegant, emotional and expensive.

One special tile floats in front of the wall. The user can hover, inspect, rotate and subtly move it with pointer or touch. After a few seconds or after interaction, the tile slowly moves toward the wall. When it enters the wall, nearby tiles push outward, a circular shockwave travels through the ceramic surface, particles appear, warm golden light leaks between seams, and a minimal ceramic sound confirms the moment.

The visual direction is Delft Blue ceramic, Dutch luxury, museum lighting, soft fog, dark navy atmosphere, white ceramic surfaces, warm gold highlights and handcrafted imperfections. Motion should be slow, physical and cinematic, never explosive, arcade-like or cartoonish.

Use placeholder assets everywhere so final logos, textures, videos, branding and audio can be replaced later without changing the codebase.

## Stack

- Next.js App Router
- React
- Three.js
- React Three Fiber
- GSAP
- Drei
- Postprocessing

## Component Structure

- `HeroScene`
- `TileWall`
- `InteractiveTile`
- `ShockwaveAnimation`
- `AmbientParticles`
- `CinematicLighting`
- `LogoLoader`
- `AudioManager`

## Replaceable Content

Assets live in `public/assets`:

- `logos`
- `textures`
- `audio`
- `data`
- `videos`


## Development

```bash
npm install
npm run dev
```

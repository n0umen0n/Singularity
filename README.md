# Singularity Monorepo

This repository contains the Singularity landing page and a clickable mock platform app.

## Apps

- `apps/landing` - the existing cinematic WebGL landing page for `singularity.diy`.
- `apps/app` - the mock platform app intended for `app.singularity.diy`.
- `packages/ui` - shared brand primitives such as the Singularity logo, glass cards, and status pills.

## How To Run

Install dependencies:

```bash
npm install
```

Run the platform app:

```bash
npm run dev:app
```

Then visit:

```text
http://127.0.0.1:8094
```

Run the landing page:

```bash
npm run dev:landing
```

Then visit:

```text
http://127.0.0.1:8092
```

Build for production:

```bash
npm run build
```

## Stack

- Monorepo workspaces + Turborepo
- Landing: React + TypeScript + Vite + Three.js
- Platform app: Next.js App Router + React + TypeScript
- Shared local mock data for first-version product exploration

## Why This Version Is Smoother

MP4 scroll scrubbing is limited by video encoding and browser seeking. If the video has sparse keyframes, scroll can look like still images changing.

This version avoids that problem by rendering the structure in WebGL:

- The camera moves continuously through a real 3D scene.
- The structure can rotate, pulse, glow, and respond to scroll every frame.
- Text remains HTML/CSS, so it is sharp, editable, accessible, and responsive.
- Chapter stops are UI sections layered over the 3D scene.

## Visual Storyboard

1. Singularity / origin point.
2. The hourglass wireframe structure resolves.
3. The camera enters from the lower opening.
4. Each ring becomes a stop point.
5. The center compresses attention around the key message.
6. The final expansion leads into the CTA section.

## Content Strategy

The strongest architecture is still:

```text
real-time WebGL / cinematic asset underneath
live HTML/CSS content above it
```

Keep main text, navigation, CTAs, and chapter content in code. Only bake text into video or 3D textures when it is decorative and non-essential.

## Optional Production Directions

If you later want a fully art-directed cinematic version, there are three strong paths:

- Keep this WebGL approach and refine the geometry, materials, and camera path.
- Render a Blender/Cinema 4D image sequence and draw it to canvas for frame-perfect scroll.
- Combine both: WebGL structure for interaction, rendered video/image sequence for intro or background atmosphere.

## Legacy MP4 Prototype

The provided MP4 is still in the folder as a reference asset:

`apps/landing/hf_20260424_205243_850495a8-16b4-4d8d-a28d-3526278d8385.mp4`

The old `apps/landing/server.py` file remains available if you want to test MP4 byte-range scrubbing again, but the main landing experience now runs through Vite.

## Files

- `apps/landing/src/main.tsx` - landing React app, WebGL scene, scroll camera, and chapter data.
- `apps/landing/src/styles.css` - landing page styling and responsive overlays.
- `apps/app/app` - Next.js App Router pages for the mock platform.
- `apps/app/components/platform.tsx` - clickable mock product UI components.
- `apps/app/lib/mock-data.ts` - local mock missions, investors, balances, and funding requests.
- `UI_SPECIFICATION.md` - detailed product UI specification.

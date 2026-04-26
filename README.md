# Singularity Scroll WebGL Landing Page

This folder contains a modern scroll-reactive landing page prototype inspired by the reference image and the provided video.

The current version no longer relies on MP4 timeline scrubbing for the main effect. It renders the singularity/hourglass structure in real time with WebGL, then moves a camera through that structure based on scroll progress.

## How To Run

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
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

- React + TypeScript + Vite
- Three.js + React Three Fiber
- Drei helpers for stars and adaptive DPR
- Postprocessing bloom for the glow pass
- GSAP utilities for damped scroll interpolation
- CSS overlays for typography, chapters, and responsive layout

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

`hf_20260424_205243_850495a8-16b4-4d8d-a28d-3526278d8385.mp4`

The old `server.py` file remains available if you want to test MP4 byte-range scrubbing again, but the main experience now runs through Vite.

## Files

- `src/main.tsx` - React app, WebGL scene, scroll camera, and chapter data.
- `src/styles.css` - professional landing page styling and responsive overlays.
- `index.html` - Vite entry point.
- `package.json` - app scripts and dependencies.
- `server.py` - legacy local server for MP4 byte-range experiments.
- `hf_20260424_205243_850495a8-16b4-4d8d-a28d-3526278d8385.mp4` - provided reference video.

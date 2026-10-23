# Continuous visual system

The renderer treats a reel as one persistent illustrated world. Content beats remain narration structure; they do not create independent visual scenes.

## Contract

`VisualStory` version 2 contains:

- `world`: stable objects created once for the reel;
- `timeline`: narration-anchored actions that reveal, transform, connect, reflow, focus, or remove those objects;
- `camera`: restrained framing actions with a maximum 1.15× zoom;
- validated image intents and bounded composite primitives.

Every object must be introduced before use. It remains visible until an explicit removal. Position changes require a `reflow` action containing destination boxes, so the timeline evaluator interpolates the old and new layouts instead of teleporting objects.

## Illustration system

`src/automation/rendering/components.ts` renders trusted SVG components for browsers, clients, services, APIs, databases, queues, locks, files, badges, counters, code cards, tables, images, and approved composites. Stable object-ID seeds create slightly irregular outlines that remain identical on every frame.

Objects use internal layers. Timeline actions can insert database rows, advance queues, move lock shackles, highlight code, change semantic states, and settle components. Common technical objects therefore animate internally instead of behaving like labelled rectangles.

## Motion

`src/automation/rendering/timeline.ts` compiles exact narration phrases into real word times. Trusted motion presets provide deterministic easing for entry, path drawing, travel, state changes, internal actions, layout rearrangement, focus, settling, and exit.

The evaluator produces complete object, connector, and camera state for any timestamp. Repeated evaluation of the same story and time returns the same frame state. Connector routing tests multiple cubic curves and selects the route with the fewest sampled collisions against other visible objects.

## Rendering and quality

Playwright receives frame state; it does not run an animation clock. Curved SVG connectors draw progressively, packets follow the same cubic path, semantic colors blend, and camera transforms interpolate smoothly. FFmpeg still owns 1080×1920/60-fps encoding and audio mixing.

Deterministic motion scoring captures only `#scene`, so caption changes cannot make a static diagram pass. Geometry checks use the interpolated layout, and focused objects must remain inside the camera frame. The multimodal critic separately grades continuity, illustration quality, and motion coherence from ordered sampled frames.

## Planner rules

The Gemini planner must:

- output version 2 data only;
- use one continuous world;
- introduce every object once;
- keep 2–7 meaningful visible objects;
- start each beat's first motion within its first six spoken words;
- use explicit reflow for position changes;
- prefer component-specific internal actions;
- use camera motion only when it improves readability;
- avoid scene resets, generic card layouts, decorative motion, and executable code.

## Local review

Render the self-contained continuous browser → API → database fixture with:

```bash
npm run preview:continuous
```

The output is `previews/continuous-visual.mp4`. It uses synthetic audio and no network providers. Run the timeline and real renderer fixtures with `npm run test:continuous`.

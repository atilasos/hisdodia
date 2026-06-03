# Design

## Design Direction

The chosen direction is "Atelier de papel": a warm, tactile, calm reading environment for 6 to 8 year old children. It should feel like opening a preserved paper folder of stories, with the recovered original illustrations carrying the personality.

Physical scene: a child is sitting in a quiet reading corner during the afternoon, using a tablet or shared computer, curious but not rushed, choosing today's story and listening while following the text.

## Color

Use OKLCH colors. Avoid pure black and pure white.

Color strategy: restrained to committed. The main surface uses warm paper tones; accents can carry amber, olive, and soft green. The palette should feel archival and tactile, not beige by default and not brightly gamified.

Suggested tokens:

- Paper: `oklch(0.96 0.025 82)`
- Paper shadow: `oklch(0.88 0.045 103)`
- Ink: `oklch(0.24 0.045 76)`
- Muted ink: `oklch(0.43 0.04 76)`
- Amber action: `oklch(0.64 0.16 47)`
- Olive support: `oklch(0.59 0.10 105)`
- Soft recovery green: `oklch(0.72 0.08 145)`
- Warning clay: `oklch(0.62 0.12 35)`

## Typography

Typography should support early readers and long Portuguese text. Use a readable humanist sans or schoolbook-adjacent text face for story copy, paired with a warmer display face only if it does not compete with original illustrations.

Avoid reflex decorative choices and keep body line length around 65 characters on desktop, shorter on small screens. Story text needs generous line height, clear paragraph spacing, and no dense all-caps copy.

## Layout

The first screen prioritizes the current day's story. It should include the date, story title, recovered illustration, simple read/listen controls, and a clear path to the archive.

The archive uses a calendar-first model with month and day navigation. It should expose availability states without turning the page into a technical dashboard. Story pages should support reading, listening, glossary terms, provenance, and recovered print/PDF links where available.

## Components

- Story of today panel with illustration, date, title, and read/listen actions.
- Calendar archive with simple month navigation and availability markers.
- Story reader with original text, glossary highlights, provenance notes, and audio controls.
- Recovery badge set: original text, original illustration, original audio, rerecorded narration, PDF, incomplete.
- Asset fallback area that explains missing recovered material without visual shame.
- Search and filters for later phases, kept secondary to browsing by day.

## Motion

Motion should be quiet and optional. Use short ease-out transitions for opening archive sections, moving between story pages, or revealing provenance details. Respect reduced motion. Do not animate layout in ways that interrupt reading.

## Imagery

Recovered original illustrations and icons are the preferred imagery. If an original illustration is missing, use a calm paper treatment plus a provenance message rather than inventing a replacement by default. Any later generated or newly commissioned illustration must be labelled separately from recovered archive material.

## Accessibility

Use large touch targets, keyboard focus, visible labels, and audio transcripts. The reader must work without audio. Rerecorded audio must be labelled as rerecorded, and original SWF-derived audio must be labelled as original when converted.

# Historia do Dia Reconstruction Design

## Summary

Recreate `historiadodia.pt` as a modern, accessible, heritage-first story site. The original was Flash-era and partially preserved through Wayback Machine snapshots. The new site should keep the original content as the source of truth while replacing the interaction model with readable HTML, modern audio, responsive layout, and transparent recovery metadata.

The first product goal is autonomous exploration by children aged 6 to 8. A child should be able to open the story of the day, read it or hear it read aloud, and explore stories from other dates.

## Confirmed Decisions

- Scope is B plus C: reconstruct original content as exhaustively as practical, with editorial adaptations where they help autonomous reading.
- Execution approach is hybrid: build an inventory pipeline for all 366 dates while using a representative recovered sample to shape the first navigable experience.
- Primary audience is autonomous child exploration, not teacher-led classroom operation.
- Initial age target is 6 to 8.
- Visual direction is "Atelier de papel": warm, tactile, calm, and gently enchanted.
- Original illustrations should be reused wherever recoverable. New invented visual material should not compete with the archive.
- Missing original audio may be replaced by new narration, clearly labelled as rerecorded.

## Archive Evidence So Far

The Wayback archive confirms useful recoverable structure:

- The site has a frame-era `/pt/` surface and archive pages such as `/pt/arquivo.aspx`.
- Month archive pages list story entries by day, including title, optional day context, date, icon, and link to `historias/MM/DD/historia.aspx`.
- A sample January page lists "Moleiros e Carvoeiros" for 1 January, "A Ovelha Generosa" for 2 January, "O Relogio do Senhor Tulio" for 3 January, and "Quiterio Atrevido" for 4 January.
- Individual story pages contain title, author, illustrator, layered text pages, glossary tooltip terms, original background imagery, print PDFs, voting links, proposal/activity links, and Flash audio references.
- CDX results show story assets such as background JPEGs, icon JPEGs, `imprimir.pdf`, proposal pages, and SWF audio references under `sons.historiadodia.pt`.

## Product Shape

### Primary Entry

The homepage should make "today's story" obvious. It should show:

- Today's date.
- Story title.
- Recovered illustration or an honest missing-image state.
- Main actions: read, listen, browse archive.
- Recovery badges showing what is available for that story.

### Archive

The archive should be calendar-first. Children can choose a month and then a day. The archive should show availability with simple labels or icons:

- Text recovered.
- Original illustration recovered.
- Audio original available.
- Rerecorded narration available.
- PDF recovered.
- Incomplete.

Filters can exist, but browsing by date should remain the main path.

### Story Reader

The story page should support both reading and listening:

- Large readable text.
- Optional page-by-page mode for younger readers.
- Continuous text mode for adults and older children.
- Audio player with clear original or rerecorded label.
- Glossary terms presented inline without fragile hover-only behavior.
- Credits for author and illustrator.
- Links to recovered print PDF and activity/proposal material when present.
- Provenance panel listing source snapshots and recovered assets.

## Editorial Model

Each story should have structured metadata:

- Date: month and day.
- Title.
- Original day context, when present.
- Author.
- Illustrator.
- Text segments.
- Glossary terms and definitions.
- Asset list.
- Source snapshots.
- Recovery status.
- Editorial notes.

Recovered text should remain the canonical story text. Editorial changes are allowed only to support usability, for example paragraph normalization, conversion from layered Flash-era pages, or accessibility labels. Any completion, rerecording, or adaptation must be marked.

## Data And Recovery Strategy

The recovery pipeline should:

1. Query CDX for archive pages, story pages, images, PDFs, SWFs, and proposal material.
2. Build a date inventory for 366 dates.
3. Fetch month archive pages from multiple snapshots when a month is missing or incomplete.
4. Fetch story pages and parse titles, credits, text layers, glossary terms, asset references, and PDF links.
5. Fetch recoverable assets and store source URLs plus local paths.
6. Convert or flag Flash audio assets for later handling.
7. Produce a confidence report per story.

The site should be able to display partial recovery without treating it as failure.

## Visual Direction

"Atelier de papel" uses warm paper surfaces, gentle contrast, and recovered illustration as the main art direction. The interface should avoid generic children's app patterns, mascots, reward systems, heavy animation, or museum-style density.

Color strategy is restrained to committed:

- Warm paper background.
- Dark tinted ink for text.
- Amber for primary actions.
- Olive and soft green for archive and recovery details.
- Clay warning for incomplete provenance.

Typography should be friendly, legible, and early-reader-safe. Avoid decorative display choices that make Portuguese text harder to read.

## Key States

- Story fully recovered.
- Text recovered but audio missing.
- Text recovered with rerecorded narration.
- Story missing original illustration.
- Story incomplete.
- Story known from archive listing but page missing.
- Story assets loading.
- Asset fetch failed.
- Search returns no results.
- Reduced motion preference enabled.

## Interaction Model

Children should be able to use large, obvious controls:

- Read story.
- Listen to story.
- Go to today.
- Choose a month.
- Choose a day.
- Continue to next text segment.
- See a simple word explanation.

No essential action should require hover. Audio controls should be standard and accessible. Calendar browsing should work by keyboard and touch.

## Implementation Notes

The first implementation plan should split work into:

- Archive inventory and extraction scripts.
- Structured story data model.
- Static or app framework setup.
- First sample stories from January plus at least one story from another month.
- Reader UI.
- Archive UI.
- Audio provenance and rerecording slots for stories without recovered original audio.
- Verification report for recovered content.

No new dependency should be added without a concrete reason. Flash content should be treated as source material to extract or convert, not embedded as runtime UI.

## Open Questions

- Which framework should be used for the final site, once the empty project is initialized?
- How should rerecorded narration be produced and stored?
- Should the final site support Portuguese only at first, or preserve the original English alternate links where recoverable?
- What legal or rights constraints apply to republishing original stories, illustrations, PDFs, and audio?

## Acceptance Criteria

- A child can open the story of the current date and choose read or listen.
- The archive exposes all known dates with clear recovery status.
- At least one representative story renders from recovered source text, not hardcoded UI copy.
- Missing assets are labelled honestly.
- Original recovered illustrations are preferred over invented imagery.
- Rerecorded audio is labelled as rerecorded.
- The interface works on desktop, tablet, and mobile.
- Keyboard navigation and reduced motion are supported.

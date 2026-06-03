# Audio Recovery

The original site audio is not safely recoverable by assuming one SWF per day. Audio may be split across numbered SWFs under:

```text
http://sons.historiadodia.pt/MM/DD/*.swf
```

Use:

```bash
npm run recover:audio -- --day 01-05
```

The recovery flow:

1. Query Wayback CDX by day prefix (`sons.historiadodia.pt/MM/DD/`) because wildcard CDX can return 503.
2. Select the latest successful capture for each `.swf` segment.
3. Sort segment names in story order (`um`, `dois`, `tres`, ...).
4. Inspect every SWF for Flash audio tags:
   - `DefineSound` (`14`)
   - `SoundStreamHead` (`18`)
   - `SoundStreamHead2` (`45`)
   - `SoundStreamBlock` (`19`)
5. Extract only SWFs with recoverable audio using `ffmpeg`.
6. Concatenate extracted segments into `data/audio-recovery/MM-DD/MM-DD-recovered.mp3`.
7. Use TTS/rerecording only when the full day inventory has no recoverable SWF audio.

Validation evidence:

- `01-05/um.swf`: no recoverable audio tags.
- `01-05/dois.swf`: `SoundStreamHead` present and `2179` `SoundStreamBlock` tags.
- `01-05`: extracted recovered MP3 at `data/audio-recovery/01-05/01-05-recovered.mp3`, duration approximately `00:03:01`.
- `01-01`: day inventory found only `um.swf`; no `DefineSound`, `SoundStreamHead`, or `SoundStreamBlock` tags. The current 01-01 page therefore uses synthesized pt-PT narration, explicitly labelled as non-original.

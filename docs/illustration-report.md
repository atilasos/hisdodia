# Illustrated edition production report

## Outcome

- Archive stories: 366.
- Stories with illustrated-edition metadata: 366.
- Planning model: `gpt-5.4-mini` for all 366 stories.
- Art-direction version: `2` for all 366 current editions.
- Edition states: 364 complete and 2 failed because their opening image reached the two-attempt technical limit.
- Planned scenes: 1,809.
- Scene states: 1,791 complete, 11 failed, 7 pending, and 0 generating.
- Failed scenes: 2 openings and 9 non-opening scenes.
- The 7 pending scenes are untouched zero-attempt dependants of failed openings: `05-02/scene-2` through `scene-5`, and `10-30/scene-2` through `scene-4`.

No aesthetic selection, editorial selection, or manual correction of generated images was performed. A raster was retried only after a technical or moderation error, with the same prompt and references, up to the two-attempt limit.

## Asset inventory

The current v2 illustrated editions contain 1,791 WebP files totalling 57,859,354 bytes. The largest file is `src/site/public/assets/06-05/illustrated/v2/opening.webp` at 76,152 bytes and 768 × 512 pixels. The maximum side of every current image is 768 pixels; the largest current pixel area is 615 × 768, or 472,320 pixels.

Across every tracked `illustrated` version there are 1,805 WebP files totalling 58,382,314 bytes. This includes 14 preserved v1 pilot assets totalling 522,960 bytes: 4 for `01-01`, 5 for `08-20`, and 5 for `09-28`. The maximum side across current and legacy assets is 768 pixels. No WebP exceeds 204,800 bytes or 768 pixels on either side.

## Monthly inventory

`WebP v2` counts the current edition assets and equals the number of complete scenes. `WebP all` also includes preserved v1 pilot assets.

| Month | Stories | Planned scenes | Complete | Failed opening | Failed non-opening | Pending | WebP v2 / bytes | WebP all / bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 01 | 31 | 150 | 150 | 0 | 0 | 0 | 150 / 4,393,464 | 154 / 4,552,528 |
| 02 | 29 | 145 | 143 | 0 | 2 | 0 | 143 / 4,750,920 | 143 / 4,750,920 |
| 03 | 31 | 159 | 159 | 0 | 0 | 0 | 159 / 4,804,732 | 159 / 4,804,732 |
| 04 | 30 | 159 | 158 | 0 | 1 | 0 | 158 / 5,415,136 | 158 / 5,415,136 |
| 05 | 31 | 164 | 155 | 1 | 4 | 4 | 155 / 5,312,772 | 155 / 5,312,772 |
| 06 | 30 | 152 | 152 | 0 | 0 | 0 | 152 / 5,079,662 | 152 / 5,079,662 |
| 07 | 31 | 151 | 151 | 0 | 0 | 0 | 151 / 4,617,438 | 151 / 4,617,438 |
| 08 | 31 | 152 | 152 | 0 | 0 | 0 | 152 / 4,981,736 | 157 / 5,157,212 |
| 09 | 30 | 151 | 151 | 0 | 0 | 0 | 151 / 5,324,016 | 156 / 5,512,436 |
| 10 | 31 | 138 | 134 | 1 | 0 | 3 | 134 / 4,128,264 | 134 / 4,128,264 |
| 11 | 30 | 134 | 133 | 0 | 1 | 0 | 133 / 4,194,578 | 133 / 4,194,578 |
| 12 | 31 | 154 | 153 | 0 | 1 | 0 | 153 / 4,856,636 | 153 / 4,856,636 |
| **Total** | **366** | **1,809** | **1,791** | **2** | **9** | **7** | **1,791 / 57,859,354** | **1,805 / 58,382,314** |

## Failed scenes

Every failed scene has exactly two recorded HTTP 400 `moderation_blocked` errors and no third attempt. Request IDs and moderation details below are copied from the persisted public briefs.

| Story and scene | Attempt 1 | Attempt 2 |
|---|---|---|
| `02-05/scene-2` | input; sexual; `0ef785b2-35b7-4ce8-8587-169689101181` | input; sexual; `052c9715-207f-400f-8592-88aa8b18d9c8` |
| `02-05/scene-3` | input; sexual; `8c7810eb-5c93-4754-ae28-2f9b735b1189` | input; sexual; `30fa01e9-45c1-4977-b2dc-8beb4a6899fe` |
| `04-04/scene-3` | input; self-harm; request ID unavailable because the function-call error was truncated | input; self-harm; `494027c7-99d5-4a47-ab7f-50b084cb5b9e` |
| `05-02/opening` | output; sexual; `430ce950-4a68-4539-898f-0684bd0ef820` | output; sexual; `c2960acf-1951-414b-b1c8-17057735dc7c` |
| `05-06/scene-2` | input; self-harm; `a13d66f6-24a8-47f4-ab71-f2c91fe64f3a` | input; self-harm; `46b81e73-82fd-4075-ae47-6f8647fd31ab` |
| `05-06/scene-3` | input; self-harm; `1d65b54e-e845-4027-a974-81c4ae9125dc` | input; self-harm; `af0e5873-9903-4f0f-8702-24278b5ec4f6` |
| `05-25/scene-5` | input; self-harm and abuse; `a4db9af8-aa4d-49a2-86c2-d1e21b9520c6` | input; self-harm; `6c1c9911-bcc5-446c-824f-02dd77dff36a` |
| `05-25/scene-6` | input; self-harm; `598ca8fd-f22d-4842-82c5-797c071ecdb8` | input; self-harm; `9f170db6-26bf-466a-b5ab-611240fcc749` |
| `10-30/opening` | input; sexual; `e7b1c1cf-eba2-4483-9af7-cb2836c5ae38` | input; sexual; `1e99b07d-39c9-42dd-b4e8-9a9dc271fecd` |
| `11-05/scene-2` | input; self-harm; `10404534-78e6-47ff-92f0-2df5b806afe6` | input; self-harm; `1e045c92-67d9-458e-9ecd-66967113811c` |
| `12-17/scene-2` | output; other; `d642dfca-29c8-40e9-9a51-cd099abea1b2` | output; other; `0f7a5698-7c22-4846-94b9-316ee84399ca` |

The failed openings are `05-02/opening` and `10-30/opening`. Their original recovered readers remain available. All 9 failed non-opening scenes leave their completed sibling illustrations available in the illustrated reader.

## Verification

- `npm run illustrations:audit -- --all`: passed — 366 stories, 1,791 complete scenes, 2 failed openings, and 9 failed non-opening scenes.
- `node --test tests/illustration/jobs.test.mjs`: passed — 39/39 tests.
- `npm test`: passed — 202/202 tests across 24 suites.
- `npm run build`: passed and wrote `dist/`.
- `git diff --check`: passed with no output.
- Monthly reconciliation found no missing completed assets, unexpected v2 WebPs, duplicate current WebP content, or temporary illustration files.

The explicit `--all` audit scope was added during closeout because the documented whole-archive command was not accepted by the CLI. Its regression test and the complete verification above passed before this report was written.

# Archive batch download

Run date: 2026-06-03

The raw Wayback recovery is stored under `archive/0000/MM/DD/`. The downloader uses three global CDX indexes and groups captures locally by day:

- `www.historiadodia.pt/pt/historias/`
- `www.historiadodia.pt/pt/Historias/`
- `sons.historiadodia.pt/`

This avoids the earlier per-day strategy that would require more than one thousand CDX requests and quickly hit Wayback rate limits.

## Batch result

- Days processed: 366
- CDX captures inspected: 11,887
- Selected unique captures: 1,658
- New files downloaded: 1,391
- Existing files reused: 267
- CDX errors: 0
- Technical day errors: 0
- Raw archive size after batch: 53 MB

## Local archive coverage

Useful files now exist for 331 day directories. The remaining 35 days had no matching captures in the global CDX index:

`01-25`, `01-29`, `02-19`, `02-23`, `03-17`, `03-25`, `03-28`, `03-30`, `03-31`, `04-09`, `04-16`, `04-19`, `05-09`, `06-12`, `08-10`, `08-16`, `08-17`, `08-18`, `08-21`, `08-23`, `08-24`, `08-25`, `08-26`, `08-27`, `08-29`, `09-10`, `09-11`, `09-16`, `09-17`, `09-18`, `09-19`, `09-24`, `09-28`, `11-15`, `11-22`.

## File categories

- `html`: 824
- `images`: 755
- `pdf`: 261
- `audio`: 208
- `other`: 21
- `proposals`: 7

The authoritative machine-readable manifest is `archive/0000/download-manifest.json`.

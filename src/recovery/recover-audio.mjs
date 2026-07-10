import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchCdx } from './cdx.mjs';
import { audioSwfPattern, audioSwfPrefix, extractAudioFromSwf, inspectSwfAudio } from './swf-audio.mjs';

const SEGMENT_ORDER = new Map([
  ['um', 1],
  ['dois', 2],
  ['tres', 3],
  ['três', 3],
  ['quatro', 4],
  ['cinco', 5],
  ['seis', 6],
  ['sete', 7],
  ['oito', 8],
  ['nove', 9],
  ['dez', 10],
  ['onze', 11],
  ['doze', 12]
]);

export function segmentSortKey(value) {
  const basename = path.basename(new URL(value, 'http://local.test').pathname, '.swf').toLowerCase();
  return SEGMENT_ORDER.get(basename) || Number.MAX_SAFE_INTEGER;
}

export function captureReplayUrl(capture) {
  if (capture.archive === 'arquivo.pt') {
    return `https://arquivo.pt/wayback/${capture.timestamp}id_/${capture.original}`;
  }
  return `https://web.archive.org/web/${capture.timestamp}id_/${capture.original}`;
}

export function selectAudioCaptures(captures) {
  const latestByOriginal = new Map();

  for (const capture of captures) {
    if (capture.statuscode !== '200' || !/\.swf$/i.test(capture.original)) {
      continue;
    }

    const previous = latestByOriginal.get(capture.original);
    if (!previous || capture.timestamp > previous.timestamp) {
      latestByOriginal.set(capture.original, capture);
    }
  }

  return [...latestByOriginal.values()].sort(
    (a, b) => segmentSortKey(a.original) - segmentSortKey(b.original) || a.original.localeCompare(b.original)
  );
}

async function downloadBinary(url, outPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed with ${response.status} for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outPath, buffer);
  return outPath;
}

async function concatMp3Segments(segmentPaths, outPath) {
  if (segmentPaths.length === 1) {
    await cp(segmentPaths[0], outPath);
    return outPath;
  }

  const concatInput = segmentPaths
    .map((segmentPath) => `file '${path.resolve(segmentPath).replaceAll("'", "'\\''")}'`)
    .join('\n');
  const listPath = `${outPath}.concat.txt`;
  await writeFile(listPath, concatInput);

  const { spawn } = await import('node:child_process');
  await new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg concat failed with ${code}: ${stderr}`));
    });
  });

  return outPath;
}

export async function recoverDayAudio({ month, day, outDir = 'data/audio-recovery', captures: providedCaptures }) {
  const id = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dayDir = path.join(outDir, id);
  const swfDir = path.join(dayDir, 'swf');
  const extractedDir = path.join(dayDir, 'extracted');
  await mkdir(swfDir, { recursive: true });
  await mkdir(extractedDir, { recursive: true });

  const captures = providedCaptures
    ? selectAudioCaptures(providedCaptures.map((capture) => ({ statuscode: '200', ...capture })))
    : selectAudioCaptures(
        await fetchCdx(audioSwfPrefix({ month, day }), { matchType: 'prefix', collapse: false })
      );
  const extractedSegments = [];
  const segmentReports = [];

  for (const capture of captures) {
    const filename = path.basename(new URL(capture.original).pathname);
    const swfPath = path.join(swfDir, filename);
    await downloadBinary(captureReplayUrl(capture), swfPath);
    const audio = await inspectSwfAudio(swfPath);
    const segmentReport = {
      original: capture.original,
      timestamp: capture.timestamp,
      archive: capture.archive ?? 'web.archive.org',
      replayUrl: captureReplayUrl(capture),
      swfPath,
      audio
    };

    if (audio.hasAudio) {
      const mp3Path = path.join(extractedDir, filename.replace(/\.swf$/i, '.mp3'));
      const result = await extractAudioFromSwf({ swfPath, outPath: mp3Path });
      if (result.extracted) {
        extractedSegments.push(result.outPath);
        segmentReport.mp3Path = result.outPath;
      }
    }

    segmentReports.push(segmentReport);
  }

  const finalAudio = extractedSegments.length ? path.join(dayDir, `${id}-recovered.mp3`) : null;
  if (finalAudio) {
    await concatMp3Segments(extractedSegments, finalAudio);
  }

  const manifest = {
    id,
    pattern: audioSwfPattern({ month, day }),
    captures: captures.length,
    recoveredAudio: Boolean(finalAudio),
    finalAudio,
    segments: segmentReports
  };
  await writeFile(path.join(dayDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

function parseDay(value) {
  const match = /^(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) {
    throw new Error('Use --day MM-DD');
  }
  return { month: Number(match[1]), day: Number(match[2]) };
}

async function readCapturesManifest(filePath, id) {
  const manifest = JSON.parse(await readFile(filePath, 'utf8'));
  const captures = Array.isArray(manifest) ? manifest : manifest[id];
  if (!captures?.length) {
    throw new Error(`No captures for ${id} in ${filePath}`);
  }
  return captures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dayArg = process.argv[process.argv.indexOf('--day') + 1];
  const day = parseDay(dayArg);
  const capturesIndex = process.argv.indexOf('--captures');
  if (capturesIndex >= 0) {
    day.captures = await readCapturesManifest(process.argv[capturesIndex + 1], dayArg);
  }
  const manifest = await recoverDayAudio(day);
  console.log(JSON.stringify(manifest, null, 2));
}

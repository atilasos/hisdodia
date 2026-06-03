import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { formatStoryId } from './calendar.mjs';

const TAGS = {
  DEFINE_SOUND: 14,
  SOUND_STREAM_HEAD: 18,
  SOUND_STREAM_BLOCK: 19,
  SOUND_STREAM_HEAD_2: 45
};

export function audioSwfPattern({ month, day }) {
  const [monthPart, dayPart] = formatStoryId(month, day).split('-');
  return `sons.historiadodia.pt/${monthPart}/${dayPart}/*.swf`;
}

export function audioSwfPrefix({ month, day }) {
  const [monthPart, dayPart] = formatStoryId(month, day).split('-');
  return `sons.historiadodia.pt/${monthPart}/${dayPart}/`;
}

function swfBody(buffer) {
  const signature = buffer.subarray(0, 3).toString('ascii');

  if (signature === 'FWS') {
    return buffer.subarray(8);
  }

  if (signature === 'CWS') {
    return inflateSync(buffer.subarray(8));
  }

  throw new Error(`Unsupported SWF signature: ${signature}`);
}

function rectByteLength(firstByte) {
  const bitsPerValue = firstByte >> 3;
  return Math.ceil((5 + bitsPerValue * 4) / 8);
}

export async function parseSwfTags(filePath) {
  const buffer = await readFile(filePath);
  const body = swfBody(buffer);
  let offset = rectByteLength(body[0]) + 4;
  const tags = [];

  while (offset + 2 <= body.length) {
    const header = body.readUInt16LE(offset);
    offset += 2;

    const code = header >> 6;
    let length = header & 0x3f;

    if (length === 0x3f) {
      if (offset + 4 > body.length) {
        throw new Error(`Truncated long SWF tag header in ${filePath}`);
      }
      length = body.readUInt32LE(offset);
      offset += 4;
    }

    if (offset + length > body.length) {
      throw new Error(`Truncated SWF tag ${code} in ${filePath}`);
    }

    tags.push({ code, length, offset });
    offset += length;

    if (code === 0) {
      break;
    }
  }

  return tags;
}

export async function inspectSwfAudio(filePath) {
  const tags = await parseSwfTags(filePath);
  const defineSounds = tags.filter((tag) => tag.code === TAGS.DEFINE_SOUND).length;
  const streamHeads = tags.filter(
    (tag) => tag.code === TAGS.SOUND_STREAM_HEAD || tag.code === TAGS.SOUND_STREAM_HEAD_2
  ).length;
  const streamBlocks = tags.filter((tag) => tag.code === TAGS.SOUND_STREAM_BLOCK).length;

  return {
    hasAudio: defineSounds > 0 || streamHeads > 0 || streamBlocks > 0,
    hasDefineSound: defineSounds > 0,
    hasSoundStreamHead: streamHeads > 0,
    defineSounds,
    soundStreamHeads: streamHeads,
    soundStreamBlocks: streamBlocks
  };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with ${code}: ${stderr || stdout}`));
    });
  });
}

export async function extractAudioFromSwf({ swfPath, outPath, ffmpeg = 'ffmpeg' }) {
  const audio = await inspectSwfAudio(swfPath);

  if (!audio.hasAudio) {
    return { extracted: false, outPath: null, audio };
  }

  await run(ffmpeg, ['-y', '-i', swfPath, '-vn', outPath]);
  return { extracted: true, outPath, audio };
}

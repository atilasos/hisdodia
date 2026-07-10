import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STORIES_DIR = 'data/stories';
const DEFAULT_PUBLIC_ASSETS_DIR = 'src/site/public/assets';
const DEFAULT_TTS_DATA_DIR = 'data/tts';
const DEFAULT_VOICE = 'pt-PT-RaquelNeural';
const DEFAULT_SAY_VOICE = 'Joana';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_OPENAI_VOICE = 'cedar';
const DEFAULT_OPENAI_VOICE_ROTATION = [
  'cedar',
  'marin',
  'cedar',
  'marin',
  'coral',
  'nova',
  'fable',
  'shimmer'
];
const DEFAULT_OPENAI_INSTRUCTIONS = [
  'Le em portugues de Portugal, como uma contadora de historias para criancas dos 6 aos 10 anos.',
  'Usa ritmo natural, pausas suaves, entoacao expressiva e calorosa.',
  'Nos dialogos, diferencia ligeiramente as personagens sem exagero teatral.',
  'Mantem diccao clara, pronuncia europeia e evita soar como locucao comercial.'
].join(' ');

export function hasNarratableText(story) {
  return Boolean(story.recovery?.text !== 'pending-extraction'
    && story.textSegments?.some((segment) => segment.paragraphs?.length));
}

export function needsSyntheticAudio(story) {
  const hasRecoveredText = hasNarratableText(story);
  const hasModernAudio = Boolean(story.assets?.recoveredAudio || story.assets?.rerecordedAudio);

  return Boolean(hasRecoveredText && !hasModernAudio);
}

export function shouldReplaceSyntheticAudio(story) {
  return Boolean(
    hasNarratableText(story)
      && story.assets?.rerecordedAudio
      && !story.assets?.recoveredAudio
      && !String(story.recovery?.rerecordedAudio ?? '').startsWith('openai-')
  );
}

export function selectOpenAiVoice(story, voices = DEFAULT_OPENAI_VOICE_ROTATION) {
  const hash = [...story.id].reduce((total, character) => total + character.charCodeAt(0), 0);
  return voices[hash % voices.length];
}

export function narrationTextForStory(story) {
  const paragraphs = story.textSegments
    .flatMap((segment) => segment.paragraphs ?? [])
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return [story.title, ...paragraphs].filter(Boolean).join('\n\n');
}

export function applySyntheticAudioMetadata(story, {
  audioPath = `/assets/${story.id}/narracao-tts.mp3`,
  captionsPath = `/assets/${story.id}/narracao-tts.vtt`,
  recoveryValue = 'tts-pt-pt'
} = {}) {
  const notes = story.provenance?.notes || 'História recuperada a partir do arquivo original.';
  const ttsNote = 'A narração disponível foi sintetizada em pt-PT a partir do texto recuperado; não é o áudio original.';
  const editorialNotes = story.editorialNotes ?? [];
  const hasTtsNote = /narração (disponível foi )?sintetizada em pt-PT/.test(notes);

  return {
    ...story,
    assets: {
      ...(story.assets ?? {}),
      rerecordedAudio: audioPath,
      captions: captionsPath
    },
    recovery: {
      ...(story.recovery ?? {}),
      rerecordedAudio: recoveryValue
    },
    provenance: {
      ...(story.provenance ?? {}),
      notes: hasTtsNote ? notes : `${notes} ${ttsNote}`
    },
    editorialNotes: editorialNotes.includes(ttsNote) ? editorialNotes : [...editorialNotes, ttsNote]
  };
}

export async function loadStories(storiesDir = DEFAULT_STORIES_DIR) {
  const files = (await readdir(storiesDir)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(files.map(async (file) => {
    const filePath = path.join(storiesDir, file);
    return {
      filePath,
      story: JSON.parse(await readFile(filePath, 'utf8'))
    };
  }));
}

export async function generateTtsAudio({
  storiesDir = DEFAULT_STORIES_DIR,
  publicAssetsDir = DEFAULT_PUBLIC_ASSETS_DIR,
  ttsDataDir = DEFAULT_TTS_DATA_DIR,
  voice = DEFAULT_VOICE,
  engine = 'edge',
  storyId,
  replaceSynthetic = false,
  outputBase = 'narracao-tts',
  openaiModel = DEFAULT_OPENAI_MODEL,
  openaiInstructions = DEFAULT_OPENAI_INSTRUCTIONS,
  limit = Infinity,
  dryRun = false,
  retries = 3,
  concurrency = 1
} = {}) {
  const entries = await loadStories(storiesDir);
  const candidates = storyId
    ? entries.filter(({ story }) => story.id === storyId)
    : replaceSynthetic
      ? entries.filter(({ story }) => shouldReplaceSyntheticAudio(story))
    : entries.filter(({ story }) => needsSyntheticAudio(story));
  const targets = candidates.slice(0, limit);
  const results = [];
  const failures = [];
  let cursor = 0;

  async function processNext() {
    while (cursor < targets.length) {
      const index = cursor;
      cursor += 1;
      await processEntry(targets[index], index);
    }
  }

  async function processEntry(entry, index) {
    const { story, filePath } = entry;
    const assetDir = path.join(publicAssetsDir, story.id);
    const ttsDir = path.join(ttsDataDir, story.id);
    const textPath = path.join(ttsDir, 'narration-text.txt');
    const mediaPath = path.join(assetDir, `${outputBase}.mp3`);
    const subtitlesPath = path.join(assetDir, `${outputBase}.vtt`);
    const aiffPath = path.join(ttsDir, `${outputBase}.aiff`);
    const narrationText = narrationTextForStory(story);

    try {
      if (!dryRun) {
        await mkdir(assetDir, { recursive: true });
        await mkdir(ttsDir, { recursive: true });
        await writeFile(textPath, narrationText);
        await rm(mediaPath, { force: true });
        await rm(subtitlesPath, { force: true });
        if (engine === 'say') {
          await rm(aiffPath, { force: true });
          await runLocalSayTts({
            voice: voice === DEFAULT_VOICE ? DEFAULT_SAY_VOICE : voice,
            textPath,
            aiffPath,
            mediaPath
          });
          await rm(aiffPath, { force: true });
          await writeFile(subtitlesPath, vttForStory(story));
        } else if (engine === 'openai') {
          const openAiVoice = voice === DEFAULT_VOICE || voice === 'auto'
            ? selectOpenAiVoice(story)
            : voice;
          await runOpenAiTts({
            apiKey: await openAiApiKey(),
            model: openaiModel,
            voice: openAiVoice,
            input: narrationText,
            instructions: openaiInstructions,
            mediaPath
          });
          await writeFile(subtitlesPath, vttForStory(story));
        } else {
          await runEdgeTtsWithRetries({ voice, textPath, mediaPath, subtitlesPath, retries });
        }
        await writeFile(filePath, `${JSON.stringify(applySyntheticAudioMetadata(story, {
          audioPath: `/assets/${story.id}/${outputBase}.mp3`,
          captionsPath: `/assets/${story.id}/${outputBase}.vtt`,
          recoveryValue: engine === 'openai' ? `openai-${openaiModel}-${voice === DEFAULT_VOICE || voice === 'auto' ? selectOpenAiVoice(story) : voice}` : 'tts-pt-pt'
        }), null, 2)}\n`);
        console.error(`[${index + 1}/${targets.length}] generated ${story.id} ${story.title}`);
      }

      results.push({
        id: story.id,
        title: story.title,
        textPath,
        mediaPath,
        subtitlesPath,
        engine,
        voice: engine === 'openai' && (voice === DEFAULT_VOICE || voice === 'auto') ? selectOpenAiVoice(story) : voice,
        characters: narrationText.length,
        generated: !dryRun
      });
    } catch (error) {
      failures.push({
        id: story.id,
        title: story.title,
        error: error.message
      });
      console.error(`[${index + 1}/${targets.length}] failed ${story.id} ${story.title}: ${error.message}`);
    }
  }

  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, targets.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => processNext()));

  return {
    totalTargets: targets.length,
    results,
    failures
  };
}

export function vttForStory(story) {
  const paragraphs = story.textSegments
    .flatMap((segment) => segment.paragraphs ?? [])
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  let cursor = 0;
  const cues = paragraphs.map((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean).length;
    const duration = Math.max(4, Math.ceil(words / 2.4));
    const start = formatVttTime(cursor);
    cursor += duration;
    const end = formatVttTime(cursor);
    return `${start} --> ${end}\n${paragraph}`;
  });

  return ['WEBVTT', '', ...cues, ''].join('\n\n');
}

function formatVttTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.000`;
}

async function runLocalSayTts({ voice, textPath, aiffPath, mediaPath }) {
  await runCommand('say', ['-v', voice, '-f', textPath, '-o', aiffPath]);
  await runCommand('ffmpeg', ['-y', '-i', aiffPath, '-codec:a', 'libmp3lame', '-q:a', '4', mediaPath]);
}

async function openAiApiKey(envPath = '.env') {
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  try {
    const env = await readFile(envPath, 'utf8');
    const match = env.match(/^OPENAI_API_KEY=(.*)$/m);
    const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (value) {
      return value;
    }
  } catch {
    // Fall through to the explicit error below.
  }

  throw new Error('OPENAI_API_KEY is missing from the environment or .env');
}

async function runOpenAiTts({ apiKey, model, voice, input, instructions, mediaPath }) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      voice,
      input,
      instructions
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI speech request failed with ${response.status}: ${message}`);
  }

  await writeFile(mediaPath, Buffer.from(await response.arrayBuffer()));
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function runEdgeTtsWithRetries({ retries, ...options }) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await runEdgeTts(options);
      return;
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await new Promise((resolve) => {
          setTimeout(resolve, attempt * 2000);
        });
      }
    }
  }

  throw lastError;
}

async function runEdgeTts({ voice, textPath, mediaPath, subtitlesPath }) {
  await new Promise((resolve, reject) => {
    const child = spawn('edge-tts', [
      '--voice', voice,
      '--file', textPath,
      '--write-media', mediaPath,
      '--write-subtitles', subtitlesPath
    ], { stdio: 'inherit' });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`edge-tts exited with code ${code}`));
    });
  });
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: Infinity
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--limit') {
      args.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--voice') {
      args.voice = argv[index + 1];
      index += 1;
    } else if (arg === '--story') {
      args.storyId = argv[index + 1];
      index += 1;
    } else if (arg === '--replace-synthetic') {
      args.replaceSynthetic = true;
    } else if (arg === '--output-base') {
      args.outputBase = argv[index + 1];
      index += 1;
    } else if (arg === '--engine') {
      args.engine = argv[index + 1];
      index += 1;
    } else if (arg === '--openai-model') {
      args.openaiModel = argv[index + 1];
      index += 1;
    } else if (arg === '--openai-instructions') {
      args.openaiInstructions = argv[index + 1];
      index += 1;
    } else if (arg === '--retries') {
      args.retries = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--concurrency') {
      args.concurrency = Number(argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await generateTtsAudio(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({
    totalTargets: result.totalTargets,
    generated: result.results.filter((entry) => entry.generated).length,
    failed: result.failures.length,
    failures: result.failures,
    ids: result.results.map((entry) => entry.id)
  }, null, 2));
}

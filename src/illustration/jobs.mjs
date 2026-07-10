#!/usr/bin/env node

import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_ATTEMPTS = 2;
const MAX_BYTES = 204800;
const COMPRESSION_ATTEMPTS = [
  { maxSide: 768, quality: 72 },
  { maxSide: 768, quality: 60 },
  { maxSide: 768, quality: 48 },
  { maxSide: 640, quality: 48 },
  { maxSide: 512, quality: 48 }
];

function execute(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function dimensions(filename) {
  const { stdout } = await execute('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filename]);
  const width = Number(stdout.match(/pixelWidth:\s*(\d+)/u)?.[1]);
  const height = Number(stdout.match(/pixelHeight:\s*(\d+)/u)?.[1]);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`Invalid raster: ${filename}`);
  }
  return { width, height };
}

async function writeJsonAtomically(filename, value) {
  const directory = path.dirname(filename);
  await mkdir(directory, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(directory, '.illustration-job-'));
  const temporaryFile = path.join(temporaryDirectory, path.basename(filename));
  try {
    await writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporaryFile, filename);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function pathsFor(options, storyId) {
  const storiesDir = options.storiesDir ?? 'data/stories';
  const publicDir = options.publicDir ?? 'src/site/public';
  return {
    story: path.join(storiesDir, `${storyId}.json`),
    brief: path.join(publicDir, 'assets', storyId, 'illustrated', 'brief.json'),
    image: (sceneId) => path.join(publicDir, 'assets', storyId, 'illustrated', `${sceneId}.webp`)
  };
}

async function loadJob(options) {
  const files = pathsFor(options, options.storyId);
  const story = JSON.parse(await readFile(files.story, 'utf8'));
  const scenes = story.illustratedEdition?.scenes;
  const scene = scenes?.find(({ id }) => id === options.sceneId);
  if (!scene) throw new Error(`Illustration scene not found: ${options.storyId}/${options.sceneId}`);
  return { files, story, scene };
}

function finalizeEdition(story) {
  const scenes = story.illustratedEdition.scenes;
  const opening = scenes.find(({ id }) => id === 'opening');
  if (opening?.status === 'failed') {
    story.illustratedEdition.status = 'failed';
  } else if (scenes.every(({ status }) => status === 'complete' || status === 'failed')) {
    story.illustratedEdition.status = 'complete';
  } else {
    story.illustratedEdition.status = 'generating';
  }
}

export async function nextIllustrationJob(options = {}) {
  const storiesDir = options.storiesDir ?? 'data/stories';
  const workDir = options.workDir ?? 'tmp/illustrations';
  const filenames = (await readdir(storiesDir))
    .filter((filename) => /^\d{2}-\d{2}\.json$/u.test(filename))
    .filter((filename) => !options.storyId || filename === `${options.storyId}.json`)
    .filter((filename) => !options.month || filename.startsWith(`${options.month}-`))
    .sort();

  for (const filename of filenames) {
    const storyPath = path.join(storiesDir, filename);
    const story = JSON.parse(await readFile(storyPath, 'utf8'));
    if (story.illustratedEdition?.status !== 'generating') continue;
    const scene = story.illustratedEdition.scenes?.find(
      (candidate) => (candidate.status === 'pending' || candidate.status === 'generating')
        && candidate.attempts < MAX_ATTEMPTS
    );
    if (!scene) continue;

    const files = pathsFor(options, story.id);
    const brief = JSON.parse(await readFile(files.brief, 'utf8'));
    const briefScene = brief.scenes?.find(({ id }) => id === scene.id);
    if (!briefScene?.prompt) throw new Error(`Illustration prompt not found: ${story.id}/${scene.id}`);

    scene.status = 'generating';
    await writeJsonAtomically(storyPath, story);
    return {
      storyId: story.id,
      sceneId: scene.id,
      prompt: briefScene.prompt,
      alt: scene.alt,
      references: scene.id === 'opening'
        ? []
        : [`src/site/public/assets/${story.id}/illustrated/opening.webp`],
      sourceOutput: path.join(workDir, story.id, `${scene.id}.png`)
    };
  }
  return null;
}

export async function compressIllustration(sourcePath, destinationPath) {
  const source = await dimensions(sourcePath);
  await mkdir(path.dirname(destinationPath), { recursive: true });

  for (let index = 0; index < COMPRESSION_ATTEMPTS.length; index += 1) {
    const { maxSide, quality } = COMPRESSION_ATTEMPTS[index];
    const temporaryPath = `${destinationPath}.${process.pid}-${index}.tmp.webp`;
    const args = ['-quiet', '-q', String(quality)];
    if (source.width > maxSide || source.height > maxSide) {
      args.push('-resize', source.width >= source.height ? String(maxSide) : '0', source.width >= source.height ? '0' : String(maxSide));
    }
    args.push(sourcePath, '-o', temporaryPath);

    try {
      await execute('cwebp', args);
      const output = await dimensions(temporaryPath);
      const outputStat = await stat(temporaryPath);
      if (output.width <= maxSide && output.height <= maxSide && outputStat.size <= MAX_BYTES) {
        await rename(temporaryPath, destinationPath);
        return { ...output, size: outputStat.size };
      }
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  throw new Error(`Could not compress ${sourcePath} below 200 KB`);
}

export async function completeIllustrationJob(options) {
  const { files, story, scene } = await loadJob(options);
  const compress = options.compress ?? compressIllustration;
  await compress(options.sourcePath, files.image(scene.id));
  const workDir = path.resolve(options.workDir ?? 'tmp/illustrations');
  const sourcePath = path.resolve(options.sourcePath);
  if (sourcePath.startsWith(`${workDir}${path.sep}`)) {
    await rm(sourcePath, { force: true });
  }
  scene.attempts += 1;
  scene.status = 'complete';
  finalizeEdition(story);
  await writeJsonAtomically(files.story, story);
  return scene;
}

export async function failIllustrationJob(options) {
  const { files, story, scene } = await loadJob(options);
  if (scene.attempts >= MAX_ATTEMPTS) return scene;
  const brief = JSON.parse(await readFile(files.brief, 'utf8'));
  scene.attempts += 1;
  scene.status = scene.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
  brief.errors = Array.isArray(brief.errors) ? brief.errors : [];
  brief.errors.push({ sceneId: scene.id, attempt: scene.attempts, message: options.message });
  finalizeEdition(story);
  await writeJsonAtomically(files.brief, brief);
  await writeJsonAtomically(files.story, story);
  return scene;
}

export async function deferIllustrationJob(options) {
  const { files, story, scene } = await loadJob(options);
  scene.status = 'pending';
  finalizeEdition(story);
  await writeJsonAtomically(files.story, story);
  return scene;
}

export async function auditIllustrations(options = {}) {
  const storiesDir = options.storiesDir ?? 'data/stories';
  const publicDir = options.publicDir ?? 'src/site/public';
  const filenames = (await readdir(storiesDir))
    .filter((filename) => /^\d{2}-\d{2}\.json$/u.test(filename))
    .filter((filename) => !options.storyId || filename === `${options.storyId}.json`)
    .filter((filename) => !options.month || filename.startsWith(`${options.month}-`))
    .sort();
  const problems = [];
  const counts = { stories: filenames.length, completeScenes: 0, failedOpenings: 0, failedScenes: 0 };

  if (options.storyId && filenames.length === 0) {
    problems.push(`${options.storyId}: story not found`);
  }

  for (const filename of filenames) {
    const story = JSON.parse(await readFile(path.join(storiesDir, filename), 'utf8'));
    const edition = story.illustratedEdition;
    if (!edition) {
      problems.push(`${story.id}: missing illustrated edition`);
      continue;
    }
    const scenes = edition.scenes;
    if (!Array.isArray(scenes) || scenes.length < 3 || scenes.length > 6) {
      problems.push(`${story.id}: invalid scene count`);
      continue;
    }

    let brief;
    try {
      brief = JSON.parse(await readFile(path.join(publicDir, 'assets', story.id, 'illustrated', 'brief.json'), 'utf8'));
    } catch {
      problems.push(`${story.id}: missing visual brief`);
      brief = { errors: [] };
    }
    const errors = Array.isArray(brief.errors) ? brief.errors : [];
    const opening = scenes.find(({ id }) => id === 'opening');
    const openingErrors = errors.filter(({ sceneId }) => sceneId === 'opening');
    if (opening?.status === 'failed' && opening.attempts === MAX_ATTEMPTS && openingErrors.length === MAX_ATTEMPTS) {
      counts.failedOpenings += 1;
      continue;
    }

    for (const scene of scenes) {
      const label = `${story.id}/${scene.id}`;
      if (scene.status === 'pending' || scene.status === 'generating') {
        problems.push(`${label}: pending scene`);
      } else if (scene.status === 'complete') {
        counts.completeScenes += 1;
        const imagePath = path.join(publicDir, 'assets', story.id, 'illustrated', `${scene.id}.webp`);
        let imageStat;
        try {
          imageStat = await stat(imagePath);
        } catch {
          problems.push(`${label}: completed scene has a missing file`);
          continue;
        }
        if (imageStat.size > MAX_BYTES) {
          problems.push(`${label}: file is over 200 KB`);
        }
        try {
          const imageDimensions = await dimensions(imagePath);
          if (imageDimensions.width > 768 || imageDimensions.height > 768) {
            problems.push(`${label}: raster is longer than 768 px`);
          }
        } catch {
          problems.push(`${label}: file is not a valid raster`);
        }
      } else if (scene.status === 'failed') {
        if (scene.id === 'opening') counts.failedOpenings += 1;
        else counts.failedScenes += 1;
        const sceneErrors = errors.filter(({ sceneId }) => sceneId === scene.id);
        if (scene.attempts !== MAX_ATTEMPTS || sceneErrors.length !== MAX_ATTEMPTS) {
          problems.push(`${label}: failed scene does not have exactly two recorded technical errors`);
        }
      } else {
        problems.push(`${label}: invalid scene status ${scene.status}`);
      }
    }
  }

  return {
    problems,
    summary: `Illustration audit passed: ${counts.stories} stories, ${counts.completeScenes} complete scenes, ${counts.failedOpenings} failed openings, ${counts.failedScenes} failed non-opening scenes.`,
    ...counts
  };
}

function help() {
  return `Usage: node src/illustration/jobs.mjs <next|complete|fail|defer|audit> [options]

Commands:
  next [--story MM-DD | --month MM]
  complete --story MM-DD --scene ID --source PATH
  fail --story MM-DD --scene ID --message TEXT
  defer --story MM-DD --scene ID [--message TEXT]
  audit [--story MM-DD | --month MM]

Options:
  --help  Show this help`;
}

function parseArguments(argv) {
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--story') {
      options.storyId = argv[index += 1];
    } else if (argument === '--month') {
      options.month = argv[index += 1];
    } else if (argument === '--scene') {
      options.sceneId = argv[index += 1];
    } else if (argument === '--source') {
      options.sourcePath = argv[index += 1];
    } else if (argument === '--message') {
      options.message = argv[index += 1];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.storyId && !/^\d{2}-\d{2}$/u.test(options.storyId)) throw new Error('--story requires MM-DD');
  if (options.month && !/^\d{2}$/u.test(options.month)) throw new Error('--month requires MM');
  if (options.storyId && options.month) throw new Error('Choose at most one scope: --story or --month');
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (options.help || command === '--help' || command === '-h') {
    console.log(help());
    return;
  }
  if (command === 'next') {
    console.log(JSON.stringify(await nextIllustrationJob(options)));
  } else if (command === 'complete') {
    if (!options.storyId || !options.sceneId || !options.sourcePath) {
      throw new Error('complete requires --story, --scene, and --source');
    }
    console.log(JSON.stringify(await completeIllustrationJob(options)));
  } else if (command === 'fail') {
    if (!options.storyId || !options.sceneId || !options.message) {
      throw new Error('fail requires --story, --scene, and --message');
    }
    console.log(JSON.stringify(await failIllustrationJob(options)));
  } else if (command === 'defer') {
    if (!options.storyId || !options.sceneId) throw new Error('defer requires --story and --scene');
    console.log(JSON.stringify(await deferIllustrationJob(options)));
  } else if (command === 'audit') {
    const result = await auditIllustrations(options);
    if (result.problems.length > 0) {
      result.problems.forEach((problem) => console.error(problem));
      process.exitCode = 1;
    } else {
      console.log(result.summary);
    }
  } else {
    throw new Error(command ? `Unknown command: ${command}` : help());
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

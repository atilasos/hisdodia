#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ART_DIRECTION_VERSION,
  assertStoryIdMatches,
  illustrationAssetDirectory,
  PLANNING_MODEL,
  validateScenePlan,
  validateStoryId
} from './edition.mjs';

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

async function rasterMetadata(filename, executeImpl = execute) {
  const { stdout } = await executeImpl('sips', ['-g', 'format', '-g', 'pixelWidth', '-g', 'pixelHeight', filename]);
  const format = stdout.match(/format:\s*([^\s]+)/u)?.[1]?.toLowerCase() ?? null;
  const width = Number(stdout.match(/pixelWidth:\s*(\d+)/u)?.[1]);
  const height = Number(stdout.match(/pixelHeight:\s*(\d+)/u)?.[1]);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`Invalid raster: ${filename}`);
  }
  return { format, width, height };
}

export async function inspectFinalAsset(filename, options = {}) {
  let fileStat;
  try {
    fileStat = await stat(filename);
  } catch {
    return {
      valid: false,
      exists: false,
      format: null,
      width: null,
      height: null,
      size: null,
      problems: ['missing file']
    };
  }

  let raster;
  try {
    raster = await rasterMetadata(filename, options.executeImpl ?? execute);
  } catch {
    return {
      valid: false,
      exists: true,
      format: null,
      width: null,
      height: null,
      size: fileStat.size,
      problems: ['invalid raster']
    };
  }
  const problems = [];
  if (raster.format !== 'webp') problems.push('format is not webp');
  if (raster.width > 768 || raster.height > 768) problems.push('raster is longer than 768 px');
  if (fileStat.size > MAX_BYTES) problems.push('file is over 200 KB');
  return {
    valid: problems.length === 0,
    exists: true,
    ...raster,
    size: fileStat.size,
    problems
  };
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

function storyPathFor(options, storyId) {
  const storiesDir = options.storiesDir ?? 'data/stories';
  return path.join(storiesDir, `${validateStoryId(storyId)}.json`);
}

function pathsFor(options, story) {
  const publicDir = options.publicDir ?? 'src/site/public';
  const assetDirectory = illustrationAssetDirectory(
    story.id,
    story.illustratedEdition?.artDirectionVersion
  );
  const assetParts = assetDirectory.split('/').filter(Boolean);
  const versionParts = assetParts.slice(3);
  const assetPath = path.join(publicDir, ...assetParts);
  return {
    story: storyPathFor(options, story.id),
    brief: path.join(assetPath, 'brief.json'),
    briefUrl: `${assetDirectory}/brief.json`,
    image: (sceneId) => path.join(assetPath, `${sceneId}.webp`),
    imageUrl: (sceneId) => `${assetDirectory}/${sceneId}.webp`,
    referenceImage: (sceneId) => path.resolve(publicDir, ...assetParts, `${sceneId}.webp`),
    sourceImage: (workDir, sceneId) => path.join(workDir, story.id, ...versionParts, `${sceneId}.png`)
  };
}

async function afterStage(options, stage) {
  await options.afterStage?.(stage);
}

async function reconcileTechnicalError(files, story, options = {}) {
  const journal = story.illustratedEdition?.lastTechnicalError;
  if (!journal) return story;
  const writeJson = options.writeJsonImpl ?? writeJsonAtomically;
  const brief = JSON.parse(await readFile(files.brief, 'utf8'));
  brief.errors = Array.isArray(brief.errors) ? brief.errors : [];
  const error = {
    sceneId: journal.sceneId,
    attempt: journal.attempt,
    message: journal.message
  };
  brief.errors = brief.errors.filter(
    (candidate) => candidate.sceneId !== error.sceneId || candidate.attempt !== error.attempt
  );
  brief.errors.push(error);
  await writeJson(files.brief, brief);
  await afterStage(options, 'brief-error-upserted');
  delete story.illustratedEdition.lastTechnicalError;
  await writeJson(files.story, story);
  await afterStage(options, 'story-error-cleared');
  return story;
}

async function loadJob(options) {
  const requestedStoryId = validateStoryId(options.storyId);
  const story = JSON.parse(await readFile(storyPathFor(options, requestedStoryId), 'utf8'));
  assertStoryIdMatches(story, requestedStoryId);
  const files = pathsFor(options, story);
  await reconcileTechnicalError(files, story, options);
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

function sameAnchor(left, right) {
  if (left === null || right === null) return left === right;
  const leftIsObject = typeof left === 'object' && left !== null && !Array.isArray(left);
  const rightIsObject = typeof right === 'object' && right !== null && !Array.isArray(right);
  if (!leftIsObject || !rightIsObject) return false;
  return left.segment === right.segment
    && left?.paragraph === right?.paragraph
    && Object.keys(left).length === 2
    && Object.keys(right).length === 2;
}

function metadataMatchesBrief(story, brief) {
  const metadataScenes = story.illustratedEdition?.scenes;
  const briefScenes = brief?.scenes;
  return Array.isArray(metadataScenes)
    && Array.isArray(briefScenes)
    && metadataScenes.length === briefScenes.length
    && metadataScenes.every((scene, index) => {
      const planned = briefScenes[index];
      return scene.id === planned?.id
        && scene.layout === planned?.layout
        && scene.alt === planned?.alt
        && sameAnchor(scene.after, planned?.after);
    });
}

function expectedEditionStatus(scenes) {
  if (!Array.isArray(scenes)) return null;
  if (scenes.find((scene) => scene?.id === 'opening')?.status === 'failed') return 'failed';
  if (scenes.some((scene) => scene?.status === 'pending' || scene?.status === 'generating')) return 'generating';
  return 'complete';
}

function assertCurrentGeneratingEdition(story) {
  const edition = story.illustratedEdition;
  illustrationAssetDirectory(story.id, edition.artDirectionVersion);
  if (edition.artDirectionVersion !== ART_DIRECTION_VERSION) {
    throw new Error(`${story.id}: art direction version must be ${ART_DIRECTION_VERSION}`);
  }
  if (edition.planningModel !== PLANNING_MODEL) {
    throw new Error(`${story.id}: planning model must be ${PLANNING_MODEL}`);
  }
  const expectedStatus = expectedEditionStatus(edition.scenes);
  if (expectedStatus === null) throw new Error(`${story.id}: invalid illustrated edition scenes`);
  if (edition.status !== expectedStatus) {
    throw new Error(`${story.id}: edition status ${edition.status} does not match ${expectedStatus}`);
  }
}

function validateMonth(month) {
  if (month !== undefined && !/^(?:0[1-9]|1[0-2])$/u.test(month)) {
    throw new Error('month must be 01 through 12');
  }
}

function hasExactTechnicalErrors(errors, sceneId) {
  const attempts = errors
    .filter((error) => error.sceneId === sceneId)
    .map((error) => error.attempt)
    .sort();
  return attempts.length === MAX_ATTEMPTS && attempts[0] === 1 && attempts[1] === 2;
}

async function safeRemoveWorkFile(workDir, candidatePath) {
  let candidateInfo;
  try {
    candidateInfo = await lstat(candidatePath);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (!candidateInfo.isFile()) return false;
  let realWorkDir;
  let realCandidate;
  try {
    [realWorkDir, realCandidate] = await Promise.all([
      realpath(workDir),
      realpath(candidatePath)
    ]);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  const relativeCandidate = path.relative(realWorkDir, realCandidate);
  const isStrictDescendant = relativeCandidate !== ''
    && relativeCandidate !== '..'
    && !relativeCandidate.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativeCandidate);
  if (!isStrictDescendant) return false;
  let realCandidateInfo;
  try {
    realCandidateInfo = await lstat(realCandidate);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (!realCandidateInfo.isFile()) return false;
  await rm(realCandidate, { force: true });
  return true;
}

export async function nextIllustrationJob(options = {}) {
  validateMonth(options.month);
  if (options.storyId !== undefined) validateStoryId(options.storyId);
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
    assertStoryIdMatches(story, filename.slice(0, -5));
    if (story.illustratedEdition?.status !== 'generating') continue;
    assertCurrentGeneratingEdition(story);
    const files = pathsFor(options, story);
    const brief = JSON.parse(await readFile(files.brief, 'utf8'));
    validateScenePlan(story, brief);
    if (!metadataMatchesBrief(story, brief)) {
      throw new Error(`Illustration metadata does not match visual brief: ${story.id}`);
    }
    await reconcileTechnicalError(files, story, options);
    while (story.illustratedEdition.status === 'generating') {
      const scene = story.illustratedEdition.scenes?.find(
        (candidate) => (candidate.status === 'pending' || candidate.status === 'generating')
          && candidate.attempts < MAX_ATTEMPTS
      );
      if (!scene) break;

      const inspect = options.inspectFinalAssetImpl ?? inspectFinalAsset;
      const published = await inspect(files.image(scene.id));
      if (published.valid) {
        await safeRemoveWorkFile(workDir, files.sourceImage(workDir, scene.id));
        scene.attempts += 1;
        scene.status = 'complete';
        finalizeEdition(story);
        await (options.writeJsonImpl ?? writeJsonAtomically)(storyPath, story);
        continue;
      }

      const briefScene = brief.scenes?.find(({ id }) => id === scene.id);
      if (!briefScene?.prompt) throw new Error(`Illustration prompt not found: ${story.id}/${scene.id}`);

      scene.status = 'generating';
      await (options.writeJsonImpl ?? writeJsonAtomically)(storyPath, story);
      return {
        storyId: story.id,
        sceneId: scene.id,
        prompt: briefScene.prompt,
        alt: scene.alt,
        references: scene.id === 'opening'
          ? []
          : [files.referenceImage('opening')],
        sourceOutput: files.sourceImage(workDir, scene.id)
      };
    }
  }
  return null;
}

export async function compressIllustration(sourcePath, destinationPath, options = {}) {
  const executeImpl = options.executeImpl ?? execute;
  const inspect = options.inspectFinalAssetImpl ?? inspectFinalAsset;
  const source = await rasterMetadata(sourcePath, executeImpl);
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
      await executeImpl('cwebp', args);
      const output = await inspect(temporaryPath, { executeImpl });
      if (output.valid && output.width <= maxSide && output.height <= maxSide) {
        await rename(temporaryPath, destinationPath);
        return output;
      }
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  throw new Error(`Could not compress ${sourcePath} below 200 KB`);
}

export async function completeIllustrationJob(options) {
  const { files, story, scene } = await loadJob(options);
  const inspect = options.inspectFinalAssetImpl ?? inspectFinalAsset;
  if (scene.status === 'complete') {
    const existing = await inspect(files.image(scene.id));
    if (existing.valid) return scene;
    throw new Error(`Cannot complete terminal scene with an invalid final asset: ${options.storyId}/${options.sceneId}`);
  }
  if (scene.status === 'failed') {
    throw new Error(`Cannot complete terminal scene: ${options.storyId}/${options.sceneId}`);
  }
  if (scene.status !== 'generating') {
    throw new Error(`Scene must be generating before complete: ${options.storyId}/${options.sceneId}`);
  }
  if (scene.attempts >= MAX_ATTEMPTS) {
    throw new Error(`Cannot complete terminal scene: ${options.storyId}/${options.sceneId}`);
  }
  const existingBeforeCompression = await inspect(files.image(scene.id));
  if (existingBeforeCompression.exists) {
    if (existingBeforeCompression.valid) {
      throw new Error(`A valid final asset already exists: ${files.image(scene.id)}`);
    }
    throw new Error(`A final asset already exists and regeneration is unsupported: ${files.image(scene.id)}`);
  }
  const compress = options.compress ?? compressIllustration;
  const incomingPath = `${files.image(scene.id)}.incoming-${randomUUID()}.webp`;
  await compress(options.sourcePath, incomingPath);
  const published = await inspect(incomingPath);
  if (!published.valid) {
    await rm(incomingPath, { force: true });
    throw new Error(`Compressed output is invalid: ${published.problems.join(', ')}`);
  }
  try {
    await link(incomingPath, files.image(scene.id));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const racedAsset = await inspect(files.image(scene.id));
    if (racedAsset.valid) {
      throw new Error(`A valid final asset already exists: ${files.image(scene.id)}`);
    }
    throw new Error(`A final asset already exists and regeneration is unsupported: ${files.image(scene.id)}`);
  } finally {
    await rm(incomingPath, { force: true });
  }
  await options.afterStage?.('asset-published');
  await safeRemoveWorkFile(options.workDir ?? 'tmp/illustrations', options.sourcePath);
  scene.attempts += 1;
  scene.status = 'complete';
  finalizeEdition(story);
  await (options.writeJsonImpl ?? writeJsonAtomically)(files.story, story);
  return scene;
}

export async function failIllustrationJob(options) {
  const { files, story, scene } = await loadJob(options);
  const brief = JSON.parse(await readFile(files.brief, 'utf8'));
  if (scene.status === 'failed' && scene.attempts === MAX_ATTEMPTS) {
    const recorded = brief.errors?.find(
      (error) => error.sceneId === scene.id && error.attempt === scene.attempts
    );
    if (recorded?.message === options.message) return scene;
    throw new Error(`Cannot fail terminal scene: ${options.storyId}/${options.sceneId}`);
  }
  if (scene.status === 'complete' || scene.status === 'failed' || scene.attempts >= MAX_ATTEMPTS) {
    throw new Error(`Cannot fail terminal scene: ${options.storyId}/${options.sceneId}`);
  }
  if (scene.status !== 'generating') {
    throw new Error(`Scene must be generating before fail: ${options.storyId}/${options.sceneId}`);
  }
  scene.attempts += 1;
  scene.status = scene.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
  story.illustratedEdition.lastTechnicalError = {
    sceneId: scene.id,
    attempt: scene.attempts,
    message: options.message
  };
  finalizeEdition(story);
  await (options.writeJsonImpl ?? writeJsonAtomically)(files.story, story);
  await afterStage(options, 'story-error-journaled');
  await reconcileTechnicalError(files, story, options);
  return scene;
}

export async function deferIllustrationJob(options) {
  const { files, story, scene } = await loadJob(options);
  if (scene.status === 'pending') return scene;
  if (scene.status === 'complete' || scene.status === 'failed') {
    throw new Error(`Cannot defer terminal scene: ${options.storyId}/${options.sceneId}`);
  }
  if (scene.status !== 'generating') {
    throw new Error(`Scene must be generating before defer: ${options.storyId}/${options.sceneId}`);
  }
  scene.status = 'pending';
  finalizeEdition(story);
  await (options.writeJsonImpl ?? writeJsonAtomically)(files.story, story);
  return scene;
}

export async function auditIllustrations(options = {}) {
  validateMonth(options.month);
  if (options.storyId !== undefined) validateStoryId(options.storyId);
  const storiesDir = options.storiesDir ?? 'data/stories';
  const filenames = (await readdir(storiesDir))
    .filter((filename) => /^\d{2}-\d{2}\.json$/u.test(filename))
    .filter((filename) => !options.storyId || filename === `${options.storyId}.json`)
    .filter((filename) => !options.month || filename.startsWith(`${options.month}-`))
    .sort();
  const problems = [];
  const counts = { stories: filenames.length, completeScenes: 0, failedOpenings: 0, failedScenes: 0 };

  if ((options.storyId || options.month) && filenames.length === 0) {
    problems.push(`${options.storyId ?? options.month}: no stories matched requested scope`);
  }

  for (const filename of filenames) {
    const story = JSON.parse(await readFile(path.join(storiesDir, filename), 'utf8'));
    assertStoryIdMatches(story, filename.slice(0, -5));
    const edition = story.illustratedEdition;
    if (!edition) {
      problems.push(`${story.id}: missing illustrated edition`);
      continue;
    }
    const files = pathsFor(options, story);
    await reconcileTechnicalError(files, story, options);
    if (edition.visualBrief !== files.briefUrl) {
      problems.push(`${story.id}: visual brief URL does not match art direction version`);
    }
    if (options.all && edition.artDirectionVersion !== ART_DIRECTION_VERSION) {
      problems.push(`${story.id}: art direction version must be ${ART_DIRECTION_VERSION}`);
    }
    if (options.all && edition.planningModel !== PLANNING_MODEL) {
      problems.push(`${story.id}: planning model must be ${PLANNING_MODEL}`);
    }
    const scenes = edition.scenes;
    if (!Array.isArray(scenes) || scenes.length < 3 || scenes.length > 6) {
      problems.push(`${story.id}: invalid scene count`);
      continue;
    }

    let brief;
    try {
      brief = JSON.parse(await readFile(files.brief, 'utf8'));
    } catch {
      problems.push(`${story.id}: missing visual brief`);
      brief = { errors: [] };
    }
    try {
      validateScenePlan(story, brief);
    } catch (error) {
      problems.push(`${story.id}: visual brief violates the canonical scene contract: ${error.message}`);
    }
    if (!metadataMatchesBrief(story, brief)) {
      problems.push(`${story.id}: illustration metadata does not match visual brief`);
    }
    const errors = Array.isArray(brief.errors) ? brief.errors : [];
    const opening = scenes.find(({ id }) => id === 'opening');
    const degradedOpening = opening?.status === 'failed'
      && opening.attempts === MAX_ATTEMPTS
      && hasExactTechnicalErrors(errors, 'opening');
    if (opening?.status === 'failed' && opening.attempts === MAX_ATTEMPTS && edition.status !== 'failed') {
      problems.push(`${story.id}: edition status must be failed after opening failure`);
    }
    if (degradedOpening) {
      counts.failedOpenings += 1;
    }
    const expectedStatus = expectedEditionStatus(scenes);
    if (edition.status !== expectedStatus) {
      problems.push(`${story.id}: edition status ${edition.status} does not match ${expectedStatus}`);
    }

    for (const scene of scenes) {
      const label = `${story.id}/${scene.id}`;
      if (scene.image !== files.imageUrl(scene.id)) {
        problems.push(`${label}: image URL does not match art direction version`);
      }
      if (scene.status === 'pending' || scene.status === 'generating') {
        const untouchedDependent = degradedOpening
          && scene.id !== 'opening'
          && scene.status === 'pending'
          && scene.attempts === 0;
        if (!untouchedDependent) problems.push(`${label}: pending scene`);
      } else if (scene.status === 'complete') {
        counts.completeScenes += 1;
        const imagePath = files.image(scene.id);
        const inspect = options.inspectFinalAssetImpl ?? inspectFinalAsset;
        const asset = await inspect(imagePath);
        if (!asset.exists) {
          problems.push(`${label}: completed scene has a missing file`);
          continue;
        }
        for (const assetProblem of asset.problems) {
          if (assetProblem === 'invalid raster') problems.push(`${label}: file is not a valid raster`);
          else if (assetProblem === 'format is not webp') problems.push(`${label}: file format is not webp`);
          else problems.push(`${label}: ${assetProblem}`);
        }
      } else if (scene.status === 'failed') {
        if (scene.id === 'opening') {
          if (!degradedOpening) counts.failedOpenings += 1;
        } else {
          counts.failedScenes += 1;
        }
        if (scene.attempts !== MAX_ATTEMPTS || !hasExactTechnicalErrors(errors, scene.id)) {
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
  audit [--story MM-DD | --month MM | --all]

Options:
  --help  Show this help

Existing final assets are never replaced; regeneration is unsupported by this command.`;
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
      if (!/^\d{2}-\d{2}$/u.test(options.storyId ?? '')) throw new Error('--story requires MM-DD');
    } else if (argument === '--month') {
      options.month = argv[index += 1];
      if (!/^(?:0[1-9]|1[0-2])$/u.test(options.month ?? '')) throw new Error('--month requires 01 through 12');
    } else if (argument === '--all') {
      options.all = true;
    } else if (argument === '--scene') {
      options.sceneId = argv[index += 1];
      if (!options.sceneId || options.sceneId.startsWith('--')) throw new Error('--scene requires an ID');
    } else if (argument === '--source') {
      options.sourcePath = argv[index += 1];
      if (!options.sourcePath || options.sourcePath.startsWith('--')) throw new Error('--source requires a path');
    } else if (argument === '--message') {
      options.message = argv[index += 1];
      if (!options.message || options.message.startsWith('--')) throw new Error('--message requires text');
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if ([options.storyId, options.month, options.all].filter(Boolean).length > 1) {
    throw new Error('Choose at most one scope: --story, --month, or --all');
  }
  if (options.all && command !== 'audit') throw new Error('--all is only supported by audit');
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

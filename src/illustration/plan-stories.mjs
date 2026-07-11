#!/usr/bin/env node

import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ART_DIRECTION_VERSION,
  applyScenePlan,
  assertStoryIdMatches,
  buildCanonicalScenePrompt,
  buildSceneEvidenceContext,
  canonicalSceneAlt,
  illustrationAssetDirectory,
  PLANNING_MODEL,
  validatePlanningModel,
  validateScenePlan
} from './edition.mjs';

const DIRECTION = `Plan a contemporary illustrated edition of this Portuguese children's story as strict JSON.
Choose three to six visually useful beats by final paragraph ref and layout only. The first scene must be the opening. Return one evidenceRef for each scene. For every later scene, select the evidenceRef of the exact final paragraph of the depicted narrative beat, so the illustration appears after the event. Opening evidenceRef is best effort and the application canonicalizes it to the first non-empty paragraph. The application adds up to two preceding paragraphs as visual context. Image content comes exclusively from fixed directions and original story text. The application adds repository-owned art, continuity, and safety directions: no words, lettering, logos, or signatures. Never use text after the selected ref. Do not return composition, description, alternative text, prompts, or image instructions.`;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSchemaPath = path.join(moduleDir, 'scene-plan.schema.json');
const DEFAULT_PLANNER_TIMEOUT = 180_000;

export function buildPlanningPrompt(story) {
  const narrative = {
    id: story.id,
    title: story.title,
    textSegments: (story.textSegments ?? []).map((segment, segmentIndex) => ({
      ...(segment?.layer === undefined ? {} : { layer: segment.layer }),
      paragraphs: (segment?.paragraphs ?? []).map((paragraph, paragraphIndex) => ({
        ref: `s${segmentIndex}p${paragraphIndex}`,
        text: paragraph
      }))
    }))
  };
  return `${DIRECTION}\n\n${JSON.stringify(narrative, null, 2)}`;
}

function execute(command, args, options, execFileImpl) {
  return new Promise((resolve, reject) => {
    let callbackResult;
    let spawnComplete = false;
    let settled = false;
    const finish = (error, stdout, stderr) => {
      if (settled) return;
      settled = true;
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        const diagnostics = [
          stdout ? `stdout:\n${stdout}` : '',
          stderr ? `stderr:\n${stderr}` : ''
        ].filter(Boolean).join('\n');
        if (diagnostics) error.message = `${error.message}\n${diagnostics}`;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    };
    const callback = (...result) => {
      if (!spawnComplete) {
        callbackResult = result;
        return;
      }
      finish(...result);
    };
    const finishTransportFailure = (transportError, secondaryErrorProperty) => {
      spawnComplete = true;
      if (!callbackResult) {
        finish(transportError);
        return;
      }

      const [callbackError, stdout, stderr] = callbackResult;
      if (!callbackError) {
        finish(transportError, stdout, stderr);
        return;
      }
      try {
        callbackError[secondaryErrorProperty] = transportError;
      } catch {
        // Preserve the planner process error even when it cannot be annotated.
      }
      finish(callbackError, stdout, stderr);
    };

    let child;
    try {
      child = execFileImpl(command, args, options, callback);
    } catch (error) {
      finishTransportFailure(error, 'spawnError');
      return;
    }
    try {
      child?.stdin?.end();
    } catch (error) {
      finishTransportFailure(error, 'stdinCloseError');
      return;
    }
    spawnComplete = true;
    if (callbackResult) finish(...callbackResult);
  });
}

export async function runLunaPlanner(prompt, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const execFileImpl = options.execFileImpl ?? execFile;
  const rmImpl = options.rmImpl ?? rm;
  const schemaPath = options.schemaPath ?? defaultSchemaPath;
  const planningModel = validatePlanningModel(
    options.planningModel === undefined ? PLANNING_MODEL : options.planningModel
  );
  const timeout = options.timeout ?? DEFAULT_PLANNER_TIMEOUT;
  const temporaryDir = await mkdtemp(path.join(tmpdir(), 'hisdodia-luna-'));
  const outputPath = path.join(temporaryDir, 'plan.json');
  const args = [
    'exec',
    '--ephemeral',
    '--sandbox', 'read-only',
    '--model', planningModel,
    '--config', 'model_reasoning_effort="low"',
    '--output-schema', schemaPath,
    '--output-last-message', outputPath,
    '--cd', cwd,
    prompt
  ];
  let operationFailed = false;
  let primaryError;

  try {
    const { stdout, stderr } = await execute('codex', args, { cwd, timeout }, execFileImpl);
    let output;
    try {
      output = await readFile(outputPath, 'utf8');
    } catch (cause) {
      const diagnostics = [
        stdout ? `stdout:\n${stdout}` : '',
        stderr ? `stderr:\n${stderr}` : ''
      ].filter(Boolean).join('\n');
      throw new Error([
        'Codex planner did not produce structured output.',
        diagnostics
      ].filter(Boolean).join('\n'), { cause });
    }
    return JSON.parse(output);
  } catch (error) {
    operationFailed = true;
    primaryError = error;
    throw error;
  } finally {
    try {
      await rmImpl(temporaryDir, { recursive: true, force: true });
    } catch (cleanupError) {
      if (!operationFailed) throw cleanupError;
      try {
        primaryError.cleanupError = cleanupError;
      } catch {
        // Preserve the primary error even when it cannot be annotated.
      }
    }
  }
}

function selectedFilename(filename, { storyId, month, all }) {
  if (!/^\d{2}-\d{2}\.json$/u.test(filename)) return false;
  if (storyId) return filename === `${storyId}.json`;
  if (month) return filename.startsWith(`${month}-`);
  return all === true;
}

function approvedSceneFields(scene) {
  return {
    id: scene?.id,
    evidenceRef: scene?.evidenceRef,
    layout: scene?.layout
  };
}

function canonicalLaterSceneId(scene, index, usedIds) {
  const rawId = scene?.id;
  if (
    rawId !== 'opening'
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(rawId ?? '')
    && !usedIds.has(rawId)
  ) {
    return rawId;
  }

  const base = `scene-${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function deriveScenes(story, scenes) {
  if (!Array.isArray(scenes)) return scenes;
  const openingContext = buildSceneEvidenceContext(story, undefined, { opening: true });
  const usedIds = new Set(['opening']);
  const ordered = scenes.map((rawScene, index) => {
    if (index === 0) {
      return {
        ...approvedSceneFields(rawScene),
        id: 'opening',
        ...openingContext,
        layout: 'opening'
      };
    }
    const scene = approvedSceneFields(rawScene);
    scene.id = canonicalLaterSceneId(scene, index, usedIds);
    usedIds.add(scene.id);
    if (scene.layout === 'opening') scene.layout = 'vignette';
    return scene;
  });

  return ordered.map((rawScene, index) => {
    const scene = index === 0 ? rawScene : approvedSceneFields(rawScene);
    if (index === 0) {
      const derived = { ...scene, ...openingContext };
      return {
        ...derived,
        alt: canonicalSceneAlt(story, derived),
        prompt: buildCanonicalScenePrompt(story, derived)
      };
    }
    if (typeof scene.evidenceRef !== 'string' || !/^s(?:0|[1-9]\d*)p(?:0|[1-9]\d*)$/u.test(scene.evidenceRef)) {
      throw new Error('Scene evidence ref must be a canonical paragraph reference');
    }
    let context;
    try {
      context = buildSceneEvidenceContext(story, scene.evidenceRef);
    } catch (cause) {
      throw new Error('Scene evidence ref must identify an existing non-empty story paragraph', { cause });
    }
    const derived = {
      ...scene,
      ...context
    };
    return {
      ...derived,
      alt: canonicalSceneAlt(story, derived),
      prompt: buildCanonicalScenePrompt(story, derived)
    };
  });
}

async function writeJsonAtomically(filename, value) {
  const directory = path.dirname(filename);
  const temporaryDir = await mkdtemp(path.join(directory, '.illustration-plan-'));
  const temporaryFile = path.join(temporaryDir, path.basename(filename));
  try {
    await writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporaryFile, filename);
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}

export async function planStories(options = {}) {
  const {
    storyId,
    month,
    all = false,
    force = false,
    storiesDir = 'data/stories',
    publicDir = 'src/site/public'
  } = options;
  const scopeCount = Number(Boolean(storyId)) + Number(Boolean(month)) + Number(all);
  if (scopeCount !== 1) {
    throw new Error('Choose exactly one scope: --story, --month, or --all');
  }
  const planningModel = validatePlanningModel(
    options.planningModel === undefined ? PLANNING_MODEL : options.planningModel
  );

  const runPlanner = options.runPlanner
    ?? ((prompt, plannerOptions) => runLunaPlanner(prompt, {
      cwd: options.cwd ?? process.cwd(),
      timeout: options.timeout,
      ...plannerOptions
    }));
  const writeJson = options.writeJsonImpl ?? writeJsonAtomically;
  const filenames = (await readdir(storiesDir))
    .filter((filename) => selectedFilename(filename, { storyId, month, all }))
    .sort();

  if (storyId && filenames.length === 0) {
    throw new Error(`Story not found: ${storyId}`);
  }

  const planned = [];
  const skipped = [];
  for (const filename of filenames) {
    const storyPath = path.join(storiesDir, filename);
    const story = JSON.parse(await readFile(storyPath, 'utf8'));
    assertStoryIdMatches(story, filename.slice(0, -5));
    if (story.illustratedEdition && story.illustratedEdition.status !== 'planning' && !force) {
      skipped.push(story.id);
      continue;
    }

    const returnedPlan = await runPlanner(buildPlanningPrompt(story), { planningModel });
    const derivedScenes = deriveScenes(story, returnedPlan?.scenes);
    const plan = {
      characters: returnedPlan?.characters,
      environment: returnedPlan?.environment,
      palette: returnedPlan?.palette,
      recurringObjects: returnedPlan?.recurringObjects,
      scenes: derivedScenes
    };
    validateScenePlan(story, plan);

    const plannedStory = applyScenePlan(story, plan, { planningModel });
    const assetDirectory = illustrationAssetDirectory(story.id, ART_DIRECTION_VERSION);
    const briefDir = path.join(publicDir, ...assetDirectory.split('/').filter(Boolean));
    await mkdir(briefDir, { recursive: true });
    await writeJson(storyPath, {
      ...story,
      illustratedEdition: { status: 'planning' }
    });
    await writeJson(path.join(briefDir, 'brief.json'), { ...plan, errors: [] });
    await writeJson(storyPath, plannedStory);
    planned.push(story.id);
  }

  return { planned, skipped };
}

function help() {
  return `Usage: node src/illustration/plan-stories.mjs (--story MM-DD | --month MM | --all) [--model <slug>] [--force]

Scopes:
  --story MM-DD  Plan one story
  --month MM     Plan every story in a month
  --all          Plan every story

Options:
  --model <slug>  Select the planning model (default: ${PLANNING_MODEL})
  --force        Replan stories that already have an illustrated edition
  --help         Show this help`;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--force') {
      options.force = true;
    } else if (argument === '--all') {
      options.all = true;
    } else if (argument === '--story') {
      options.storyId = argv[index += 1];
      if (!/^\d{2}-\d{2}$/u.test(options.storyId ?? '')) {
        throw new Error('--story requires MM-DD');
      }
    } else if (argument === '--month') {
      options.month = argv[index += 1];
      if (!/^\d{2}$/u.test(options.month ?? '')) {
        throw new Error('--month requires MM');
      }
    } else if (argument === '--model') {
      options.planningModel = argv[index += 1];
      validatePlanningModel(options.planningModel);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(help());
    return;
  }
  const result = await planStories(options);
  console.log(`Planned ${result.planned.length}; skipped ${result.skipped.length}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

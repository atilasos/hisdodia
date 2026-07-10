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
  applyScenePlan,
  buildCanonicalScenePrompt,
  validateScenePlan
} from './edition.mjs';

const DIRECTION = `Plan a contemporary illustrated edition of this Portuguese children's story as strict JSON.
Choose three to six scenes, including exactly one opening first. Anchor every later scene after a zero-based segment and paragraph. Use observable media traits only: soft watercolour, pencil texture, irregular fine lines, warm paper, pale incomplete backgrounds, expressive lightly caricatured anatomy, gentle humour, and generous negative space. Keep characters, clothes, recurring objects, setting, and palette consistent within the story. Every image prompt must say: no words, lettering, logos, or signatures. Never name or imitate a specific artist. Alternative text must be concise European Portuguese.`;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSchemaPath = path.join(moduleDir, 'scene-plan.schema.json');

export function buildPlanningPrompt(story) {
  const narrative = {
    id: story.id,
    title: story.title,
    textSegments: story.textSegments
  };
  return `${DIRECTION}\n\n${JSON.stringify(narrative, null, 2)}`;
}

function execute(command, args, options, execFileImpl) {
  return new Promise((resolve, reject) => {
    execFileImpl(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export async function runLunaPlanner(prompt, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const execFileImpl = options.execFileImpl ?? execFile;
  const schemaPath = options.schemaPath ?? defaultSchemaPath;
  const temporaryDir = await mkdtemp(path.join(tmpdir(), 'hisdodia-luna-'));
  const outputPath = path.join(temporaryDir, 'plan.json');
  const args = [
    'exec',
    '--ephemeral',
    '--sandbox', 'read-only',
    '--model', 'gpt-5.6-luna',
    '--config', 'model_reasoning_effort="low"',
    '--output-schema', schemaPath,
    '--output-last-message', outputPath,
    '--cd', cwd,
    prompt
  ];

  try {
    await execute('codex', args, { cwd }, execFileImpl);
    return JSON.parse(await readFile(outputPath, 'utf8'));
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}

function selectedFilename(filename, { storyId, month, all }) {
  if (!/^\d{2}-\d{2}\.json$/u.test(filename)) return false;
  if (storyId) return filename === `${storyId}.json`;
  if (month) return filename.startsWith(`${month}-`);
  return all === true;
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

  const runPlanner = options.runPlanner
    ?? ((prompt) => runLunaPlanner(prompt, { cwd: options.cwd ?? process.cwd() }));
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
    if (story.illustratedEdition && story.illustratedEdition.status !== 'planning' && !force) {
      skipped.push(story.id);
      continue;
    }

    const returnedPlan = await runPlanner(buildPlanningPrompt(story));
    const plan = {
      ...returnedPlan,
      scenes: Array.isArray(returnedPlan?.scenes)
        ? returnedPlan.scenes.map((scene) => ({
          ...scene,
          prompt: buildCanonicalScenePrompt(story, scene)
        }))
        : returnedPlan?.scenes
    };
    validateScenePlan(story, plan);

    const briefDir = path.join(publicDir, 'assets', story.id, 'illustrated');
    await mkdir(briefDir, { recursive: true });
    await writeJson(storyPath, {
      ...story,
      illustratedEdition: { status: 'planning' }
    });
    await writeJson(path.join(briefDir, 'brief.json'), { ...plan, errors: [] });
    await writeJson(storyPath, applyScenePlan(story, plan));
    planned.push(story.id);
  }

  return { planned, skipped };
}

function help() {
  return `Usage: node src/illustration/plan-stories.mjs (--story MM-DD | --month MM | --all) [--force]

Scopes:
  --story MM-DD  Plan one story
  --month MM     Plan every story in a month
  --all          Plan every story

Options:
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

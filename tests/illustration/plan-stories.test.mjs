import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  buildPlanningPrompt,
  planStories,
  runLunaPlanner
} from '../../src/illustration/plan-stories.mjs';
import { buildCanonicalScenePrompt } from '../../src/illustration/edition.mjs';

const root = 'tmp/illustration-planner';
const execFileAsync = promisify(execFile);

after(() => rm(root, { recursive: true, force: true }));

function fixtureStory() {
  return {
    id: '01-01',
    title: 'Teste',
    textSegments: [{ paragraphs: ['Primeiro.', 'Segundo.'] }]
  };
}

function validPlan(source = fixtureStory()) {
  const result = {
    characters: [],
    environment: 'A village road.',
    palette: ['warm paper', 'soft blue'],
    recurringObjects: ['mill'],
    scenes: [
      { id: 'opening', after: null, layout: 'opening', description: 'Opening.', alt: 'Opening scene.', prompt: '' },
      { id: 'middle', after: { segment: 0, paragraph: 0 }, layout: 'marginal', description: 'Middle.', alt: 'Middle scene.', prompt: '' },
      { id: 'ending', after: { segment: 0, paragraph: 1 }, layout: 'vignette', description: 'Ending.', alt: 'Ending scene.', prompt: '' }
    ]
  };
  result.scenes = result.scenes.map((scene) => ({
    ...scene,
    prompt: buildCanonicalScenePrompt(source, scene)
  }));
  return result;
}

function planWithPrompt(prompt) {
  const result = validPlan();
  result.scenes[1] = { ...result.scenes[1], prompt };
  return result;
}

async function writeStory(directory, illustratedEdition) {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/01-01.json`, JSON.stringify({
    id: '01-01',
    title: 'Teste',
    textSegments: [{ paragraphs: ['Primeiro.', 'Segundo.'] }],
    assets: {},
    ...(illustratedEdition ? { illustratedEdition } : {})
  }));
}

async function writeStoryWithId(directory, id) {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${id}.json`, JSON.stringify({
    id,
    title: `Teste ${id}`,
    textSegments: [{ paragraphs: ['Primeiro.', 'Segundo.'] }],
    assets: {}
  }));
}

function failingAtomicWriter(failAfter) {
  let writes = 0;
  return async (filename, value) => {
    const temporary = `${filename}.injected`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, filename);
    writes += 1;
    if (writes === failAfter) throw new Error(`Injected failure after write ${failAfter}`);
  };
}

describe('Luna planner', () => {
  it('uses a Codex-compatible nullable after schema', async () => {
    const schemaPath = fileURLToPath(new URL('../../src/illustration/scene-plan.schema.json', import.meta.url));
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
    const afterSchema = schema.properties.scenes.items.properties.after;

    assert.equal('oneOf' in afterSchema, false);
    assert.deepEqual(afterSchema.anyOf.map((branch) => branch.type), ['null', 'object']);
    assert.deepEqual(afterSchema.anyOf[1].required, ['segment', 'paragraph']);
    assert.equal(afterSchema.anyOf[1].additionalProperties, false);
  });

  it('builds a prompt from narrative content without illustrator identity', () => {
    const prompt = buildPlanningPrompt({
      id: '01-01',
      title: 'Teste',
      illustrator: 'Cristina Malaquias',
      textSegments: [{ paragraphs: ['Primeiro.', 'Segundo.'] }]
    });
    assert.match(prompt, /three to six scenes/);
    assert.match(prompt, /Primeiro\./);
    assert.doesNotMatch(prompt, /Cristina Malaquias/);
    assert.match(prompt, /no words, lettering, logos, or signatures/);
  });

  it('invokes ephemeral Luna by default with a three-minute timeout', async () => {
    let call;
    const execFileImpl = (command, args, options, callback) => {
      call = { command, args, options };
      writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify(validPlan()))
        .then(() => callback(null, '', ''));
    };
    const cwd = process.cwd();
    const prompt = 'prompt';
    const result = await runLunaPlanner(prompt, { cwd, execFileImpl });
    const schemaPath = fileURLToPath(new URL('../../src/illustration/scene-plan.schema.json', import.meta.url));
    const outputPath = call.args[call.args.indexOf('--output-last-message') + 1];
    assert.equal(call.command, 'codex');
    assert.deepEqual(call.args, [
      'exec',
      '--ephemeral',
      '--sandbox', 'read-only',
      '--model', 'gpt-5.6-luna',
      '--config', 'model_reasoning_effort="low"',
      '--output-schema', schemaPath,
      '--output-last-message', outputPath,
      '--cd', cwd,
      prompt
    ]);
    assert.deepEqual(call.options, { cwd, timeout: 180_000 });
    assert.deepEqual(result, validPlan());
  });

  it('closes the Codex child stdin once while preserving the positional prompt and callback output', async () => {
    const prompt = 'prompt supplied as the final positional argument';
    let call;
    let stdinEndCalls = 0;
    const execFileImpl = (command, args, options, callback) => {
      call = { command, args, options };
      writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify(validPlan()))
        .then(() => callback(null, 'planner stdout', 'planner stderr'));
      return {
        stdin: {
          end() {
            stdinEndCalls += 1;
          }
        }
      };
    };

    const result = await runLunaPlanner(prompt, { execFileImpl });

    assert.equal(stdinEndCalls, 1);
    assert.equal(call.args.at(-1), prompt);
    assert.deepEqual(result, validPlan());
  });

  it('rejects a synchronous stdin-close error even when the spawn callback fires first', async () => {
    const closeError = new Error('Could not close planner stdin');
    let callbackCalls = 0;
    let stdinEndCalls = 0;
    const execFileImpl = (_command, args, _options, callback) => {
      const outputPath = args[args.indexOf('--output-last-message') + 1];
      writeFileSync(outputPath, JSON.stringify(validPlan()));
      callbackCalls += 1;
      callback(null, 'planner stdout', 'planner stderr');
      return {
        stdin: {
          end() {
            stdinEndCalls += 1;
            throw closeError;
          }
        }
      };
    };

    await assert.rejects(
      () => runLunaPlanner('prompt', { execFileImpl }),
      (error) => {
        assert.equal(error, closeError);
        assert.equal(error.stdout, 'planner stdout');
        assert.equal(error.stderr, 'planner stderr');
        return true;
      }
    );
    assert.equal(callbackCalls, 1);
    assert.equal(stdinEndCalls, 1);
  });

  it('preserves a synchronous planner error when closing stdin also fails', async () => {
    const plannerError = new Error('Planner process failed');
    const closeError = new Error('Could not close planner stdin');
    const execFileImpl = (_command, _args, _options, callback) => {
      callback(plannerError, 'partial planner output', 'planner process diagnostics');
      return {
        stdin: {
          end() {
            throw closeError;
          }
        }
      };
    };

    await assert.rejects(
      () => runLunaPlanner('prompt', { execFileImpl }),
      (error) => {
        assert.equal(error, plannerError);
        assert.equal(error.stdinCloseError, closeError);
        assert.equal(error.stdout, 'partial planner output');
        assert.equal(error.stderr, 'planner process diagnostics');
        assert.match(error.message, /partial planner output/);
        assert.match(error.message, /planner process diagnostics/);
        return true;
      }
    );
  });

  it('passes an explicit model and timeout to codex without retrying planner errors', async () => {
    const plannerError = new Error('Selected model is at capacity');
    let call;
    let calls = 0;
    const execFileImpl = (command, args, options, callback) => {
      calls += 1;
      call = { command, args, options };
      callback(plannerError, '', '');
    };

    await assert.rejects(
      () => runLunaPlanner('prompt', {
        planningModel: 'gpt-5.4-mini',
        timeout: 1_234,
        execFileImpl
      }),
      (error) => error === plannerError
    );

    assert.equal(calls, 1);
    assert.equal(call.args[call.args.indexOf('--model') + 1], 'gpt-5.4-mini');
    assert.equal(call.options.timeout, 1_234);
  });

  it('preserves subprocess diagnostics without retrying', async () => {
    const plannerError = new Error('Codex exited with status 1');
    let calls = 0;
    const execFileImpl = (_command, _args, _options, callback) => {
      calls += 1;
      callback(plannerError, 'partial planner output', 'invalid_json_schema: oneOf is not permitted');
    };

    await assert.rejects(
      () => runLunaPlanner('prompt', { execFileImpl }),
      (error) => {
        assert.equal(error, plannerError);
        assert.match(error.message, /partial planner output/);
        assert.match(error.message, /invalid_json_schema: oneOf is not permitted/);
        assert.equal(error.stdout, 'partial planner output');
        assert.equal(error.stderr, 'invalid_json_schema: oneOf is not permitted');
        return true;
      }
    );
    assert.equal(calls, 1);
  });

  it('preserves a primary planner error when temporary cleanup also fails', async () => {
    const plannerError = new Error('Codex exited with status 1');
    const cleanupError = new Error('Temporary cleanup failed');
    let calls = 0;
    const execFileImpl = (_command, _args, _options, callback) => {
      calls += 1;
      callback(plannerError, '', 'planner failed');
    };
    const rmImpl = async (...args) => {
      await rm(...args);
      throw cleanupError;
    };

    await assert.rejects(
      () => runLunaPlanner('prompt', { execFileImpl, rmImpl }),
      (error) => {
        assert.equal(error, plannerError);
        assert.equal(error.cleanupError, cleanupError);
        return true;
      }
    );
    assert.equal(calls, 1);
  });

  it('throws a temporary cleanup error when planning succeeds', async () => {
    const cleanupError = new Error('Temporary cleanup failed');
    const execFileImpl = (_command, args, _options, callback) => {
      writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify(validPlan()))
        .then(() => callback(null, '', ''));
    };
    const rmImpl = async (...args) => {
      await rm(...args);
      throw cleanupError;
    };

    await assert.rejects(
      () => runLunaPlanner('prompt', { execFileImpl, rmImpl }),
      (error) => error === cleanupError
    );
  });

  it('reports missing structured output with subprocess diagnostics instead of raw ENOENT', async () => {
    const execFileImpl = (_command, _args, _options, callback) => {
      callback(null, 'planner completed', 'planner warning');
    };

    await assert.rejects(
      () => runLunaPlanner('prompt', { execFileImpl }),
      (error) => {
        assert.match(error.message, /did not produce structured output/);
        assert.match(error.message, /planner completed/);
        assert.match(error.message, /planner warning/);
        assert.equal(error.cause?.code, 'ENOENT');
        return true;
      }
    );
  });

  it('propagates an explicit model to the planner and story metadata', async () => {
    const base = `${root}/explicit-model`;
    const directory = `${base}/stories`;
    await rm(base, { recursive: true, force: true });
    await writeStory(directory);
    let plannerOptions;

    await planStories({
      storyId: '01-01',
      planningModel: 'gpt-5.4-mini',
      storiesDir: directory,
      publicDir: `${base}/public`,
      runPlanner: async (_prompt, options) => {
        plannerOptions = options;
        return validPlan();
      }
    });

    const story = JSON.parse(await readFile(`${directory}/01-01.json`, 'utf8'));
    assert.deepEqual(plannerOptions, { planningModel: 'gpt-5.4-mini' });
    assert.equal(story.illustratedEdition.planningModel, 'gpt-5.4-mini');
  });

  it('rejects unsafe model slugs before planner execution or writes', async () => {
    for (const planningModel of ['', '--model', 'gpt 5', 'vendor/model']) {
      let plannerCalls = 0;
      let writes = 0;
      await assert.rejects(
        () => planStories({
          storyId: '01-01',
          planningModel,
          runPlanner: async () => { plannerCalls += 1; return validPlan(); },
          writeJsonImpl: async () => { writes += 1; }
        }),
        /planningModel must be a safe model slug/
      );
      assert.equal(plannerCalls, 0);
      assert.equal(writes, 0);
    }
  });

  it('documents the explicit model CLI option', async () => {
    const script = fileURLToPath(new URL('../../src/illustration/plan-stories.mjs', import.meta.url));
    const { stdout } = await execFileAsync(process.execPath, [script, '--help']);

    assert.match(stdout, /--model <slug>/);
  });

  it('writes a public brief and initializes story state without replanning by default', async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(`${root}/stories`, { recursive: true });
    await writeFile(`${root}/stories/01-01.json`, JSON.stringify({
      id: '01-01',
      title: 'Teste',
      textSegments: [{ paragraphs: ['Primeiro.', 'Segundo.'] }],
      assets: {}
    }));
    let calls = 0;
    const runPlanner = async () => { calls += 1; return validPlan(); };
    await planStories({ storyId: '01-01', storiesDir: `${root}/stories`, publicDir: `${root}/public`, runPlanner });
    await planStories({ storyId: '01-01', storiesDir: `${root}/stories`, publicDir: `${root}/public`, runPlanner });
    const story = JSON.parse(await readFile(`${root}/stories/01-01.json`, 'utf8'));
    const brief = JSON.parse(await readFile(`${root}/public/assets/01-01/illustrated/brief.json`, 'utf8'));
    assert.equal(calls, 1);
    assert.equal(story.illustratedEdition.status, 'generating');
    assert.equal(brief.scenes.length, 3);
  });

  it('replans an existing illustrated edition only with force', async () => {
    const directory = `${root}/force/stories`;
    await rm(`${root}/force`, { recursive: true, force: true });
    await writeStory(directory, { status: 'generating' });
    let calls = 0;
    const runPlanner = async () => { calls += 1; return validPlan(); };

    await planStories({ storyId: '01-01', storiesDir: directory, publicDir: `${root}/force/public`, runPlanner });
    await planStories({ storyId: '01-01', force: true, storiesDir: directory, publicDir: `${root}/force/public`, runPlanner });

    assert.equal(calls, 1);
    const story = JSON.parse(await readFile(`${directory}/01-01.json`, 'utf8'));
    assert.equal(story.illustratedEdition.status, 'generating');
    assert.equal(story.illustratedEdition.scenes.length, 3);
  });

  it('requires exactly one story scope', async () => {
    await assert.rejects(
      () => planStories({ storyId: '01-01', month: '01', all: true }),
      /exactly one scope/
    );
  });

  it('overwrites different unsafe Luna prompts with the same canonical prompt', async () => {
    const prompts = [
      'Quentin Blake style; no words, lettering, logos, or signatures.',
      'Use the visual language of Maurice Sendak; no words, lettering, logos, or signatures.'
    ];
    const canonicalPrompts = [];

    for (const [index, prompt] of prompts.entries()) {
      const base = `${root}/canonical-${index}`;
      const directory = `${base}/stories`;
      await rm(base, { recursive: true, force: true });
      await writeStory(directory);
      await planStories({
        storyId: '01-01',
        storiesDir: directory,
        publicDir: `${base}/public`,
        runPlanner: async () => planWithPrompt(prompt)
      });
      const brief = JSON.parse(await readFile(`${base}/public/assets/01-01/illustrated/brief.json`, 'utf8'));
      canonicalPrompts.push(brief.scenes[1].prompt);
      assert.doesNotMatch(brief.scenes[1].prompt, /Quentin Blake|Maurice Sendak/);
    }

    assert.equal(canonicalPrompts[0], canonicalPrompts[1]);
    assert.equal(
      canonicalPrompts[0],
      buildCanonicalScenePrompt({
        id: '01-01',
        title: 'Teste',
        textSegments: [{ paragraphs: ['Primeiro.', 'Segundo.'] }]
      }, validPlan().scenes[1])
    );
  });

  it('selects month and all scopes in sorted sequential order', async () => {
    const base = `${root}/scopes`;
    const directory = `${base}/stories`;
    await rm(base, { recursive: true, force: true });
    for (const id of ['02-01', '01-02', '01-01']) await writeStoryWithId(directory, id);
    const calls = [];
    let active = 0;
    let maxActive = 0;
    const runPlanner = async (prompt) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      calls.push(JSON.parse(prompt.slice(prompt.indexOf('{'))).id);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return validPlan();
    };

    await planStories({ month: '01', storiesDir: directory, publicDir: `${base}/public`, runPlanner });
    assert.deepEqual(calls, ['01-01', '01-02']);

    calls.length = 0;
    await planStories({ all: true, force: true, storiesDir: directory, publicDir: `${base}/public`, runPlanner });
    assert.deepEqual(calls, ['01-01', '01-02', '02-01']);
    assert.equal(maxActive, 1);
  });

  it('resumes forced replanning after either transaction write is interrupted', async () => {
    for (const failAfter of [1, 2]) {
      const base = `${root}/transaction-${failAfter}`;
      const directory = `${base}/stories`;
      const publicDir = `${base}/public`;
      await rm(base, { recursive: true, force: true });
      await writeStory(directory, { status: 'generating', scenes: [{ id: 'old' }] });
      let calls = 0;
      const runPlanner = async () => { calls += 1; return validPlan(); };

      await assert.rejects(
        () => planStories({
          storyId: '01-01',
          force: true,
          storiesDir: directory,
          publicDir,
          runPlanner,
          writeJsonImpl: failingAtomicWriter(failAfter)
        }),
        new RegExp(`Injected failure after write ${failAfter}`)
      );
      const interrupted = JSON.parse(await readFile(`${directory}/01-01.json`, 'utf8'));
      assert.equal(interrupted.illustratedEdition.status, 'planning');

      await planStories({ storyId: '01-01', storiesDir: directory, publicDir, runPlanner });

      const story = JSON.parse(await readFile(`${directory}/01-01.json`, 'utf8'));
      const brief = JSON.parse(await readFile(`${publicDir}/assets/01-01/illustrated/brief.json`, 'utf8'));
      assert.equal(calls, 2);
      assert.equal(story.illustratedEdition.status, 'generating');
      assert.equal(story.illustratedEdition.visualBrief, '/assets/01-01/illustrated/brief.json');
      assert.deepEqual(
        story.illustratedEdition.scenes.map(({ id, alt }) => ({ id, alt })),
        brief.scenes.map(({ id, alt }) => ({ id, alt }))
      );
    }
  });
});

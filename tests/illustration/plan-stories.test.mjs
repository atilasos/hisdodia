import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
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

function validPlan() {
  return {
    characters: [],
    environment: 'A village road.',
    palette: ['warm paper', 'soft blue'],
    recurringObjects: ['mill'],
    scenes: [
      { id: 'opening', evidenceRef: 's0p0', layout: 'opening' },
      { id: 'middle', evidenceRef: 's0p0', layout: 'marginal' },
      { id: 'ending', evidenceRef: 's0p1', layout: 'vignette' }
    ]
  };
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

async function assertPlanningRejectsPersistedStoryId(storedId, fixtureName) {
  const base = `${root}/identity-${fixtureName}`;
  const storiesDir = `${base}/stories`;
  const publicDir = `${base}/public`;
  await rm(base, { recursive: true, force: true });
  await mkdir(storiesDir, { recursive: true });
  await writeFile(`${storiesDir}/01-01.json`, JSON.stringify({
    ...fixtureStory(),
    id: storedId
  }));
  let plannerCalls = 0;
  let writes = 0;

  await assert.rejects(
    () => planStories({
      storyId: '01-01',
      storiesDir,
      publicDir,
      runPlanner: async () => { plannerCalls += 1; return validPlan(); },
      writeJsonImpl: async () => { writes += 1; }
    }),
    new RegExp(`Story id mismatch: expected 01-01, found ${storedId.replaceAll('.', '\\.').replaceAll('/', '\\/')}`, 'u')
  );
  assert.equal(plannerCalls, 0);
  assert.equal(writes, 0);
  await assert.rejects(stat(`${publicDir}/assets`), { code: 'ENOENT' });
}

describe('Luna planner', () => {
  it('rejects a selected story whose persisted valid id differs from its filename', async () => {
    await assertPlanningRejectsPersistedStoryId('02-02', 'valid-mismatch');
  });

  it('rejects a selected story whose persisted id is a traversal string', async () => {
    await assertPlanningRejectsPersistedStoryId('../../outside', 'traversal');
  });

  it('asks the model for a stable evidence ref instead of prose, numeric anchors, or image prompts', async () => {
    const schemaPath = fileURLToPath(new URL('../../src/illustration/scene-plan.schema.json', import.meta.url));
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
    const sceneSchema = schema.properties.scenes.items;

    assert.deepEqual(sceneSchema.required, ['id', 'evidenceRef', 'layout']);
    assert.deepEqual(Object.keys(sceneSchema.properties), ['id', 'evidenceRef', 'layout']);
    assert.equal(sceneSchema.properties.evidenceRef.pattern, '^s(?:0|[1-9]\\d*)p(?:0|[1-9]\\d*)$');
    assert.equal('evidence' in sceneSchema.properties, false);
    assert.equal('after' in sceneSchema.properties, false);
    assert.equal('prompt' in sceneSchema.properties, false);
    assert.equal(sceneSchema.additionalProperties, false);
  });

  it('serializes exact story paragraphs with stable refs and preserves segment layers', () => {
    const prompt = buildPlanningPrompt({
      id: '01-01',
      title: 'Teste',
      illustrator: 'Cristina Malaquias',
      textSegments: [
        { layer: 'historia-text', paragraphs: ['Primeiro.', '  Segundo.  '] },
        { paragraphs: ['Terceiro.'] }
      ]
    });
    const narrative = JSON.parse(prompt.slice(prompt.indexOf('{')));
    assert.match(prompt, /three to six visually useful beats/);
    assert.match(prompt, /first scene must be the opening/i);
    assert.match(prompt, /Primeiro\./);
    assert.doesNotMatch(prompt, /Cristina Malaquias/);
    assert.match(prompt, /no words, lettering, logos, or signatures/);
    assert.match(prompt, /select the evidenceRef of the exact final paragraph of the depicted narrative beat/i);
    assert.match(prompt, /opening evidenceRef is best effort/i);
    assert.match(prompt, /application adds up to two preceding paragraphs as visual context/i);
    assert.match(prompt, /choose three to six visually useful beats by final paragraph ref and layout only/i);
    assert.match(prompt, /image content comes exclusively from fixed directions and original story text/i);
    assert.match(prompt, /never use text after the selected ref/i);
    assert.match(prompt, /do not return composition, description, alternative text, prompts, or image instructions/i);
    assert.doesNotMatch(prompt, /zero-based segment and paragraph/i);
    assert.doesNotMatch(prompt, /canonical image prompt/i);
    assert.deepEqual(narrative.textSegments, [
      {
        layer: 'historia-text',
        paragraphs: [
          { ref: 's0p0', text: 'Primeiro.' },
          { ref: 's0p1', text: '  Segundo.  ' }
        ]
      },
      { paragraphs: [{ ref: 's1p0', text: 'Terceiro.' }] }
    ]);
  });

  it('generates canonical multi-digit paragraph refs without leading zeroes', () => {
    const textSegments = Array.from({ length: 11 }, (_segment, segment) => ({
      paragraphs: Array.from({ length: 12 }, (_paragraph, paragraph) => `${segment}:${paragraph}`)
    }));
    const prompt = buildPlanningPrompt({ id: '01-01', title: 'Teste', textSegments });
    const narrative = JSON.parse(prompt.slice(prompt.indexOf('{')));

    assert.deepEqual(narrative.textSegments[10].paragraphs[11], { ref: 's10p11', text: '10:11' });
  });

  it('resolves a multi-digit ref to its exact numeric anchor and source text', async () => {
    const base = `${root}/multi-digit-reference`;
    const directory = `${base}/stories`;
    const textSegments = Array.from({ length: 11 }, (_segment, segment) => ({
      paragraphs: Array.from({ length: 12 }, (_paragraph, paragraph) => `${segment}:${paragraph}`)
    }));
    await rm(base, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/01-01.json`, JSON.stringify({
      ...fixtureStory(),
      textSegments,
      assets: {}
    }));
    const returnedPlan = validPlan();
    returnedPlan.scenes[0].evidenceRef = 's0p0';
    returnedPlan.scenes[1].evidenceRef = 's10p11';
    returnedPlan.scenes[2].evidenceRef = 's0p1';

    await planStories({
      storyId: '01-01',
      storiesDir: directory,
      publicDir: `${base}/public`,
      runPlanner: async () => returnedPlan
    });

    const brief = JSON.parse(await readFile(`${base}/public/assets/01-01/illustrated/v2/brief.json`, 'utf8'));
    assert.deepEqual(brief.scenes[1].after, { segment: 10, paragraph: 11 });
    assert.equal(brief.scenes[1].evidenceRef, 's10p11');
    assert.deepEqual(brief.scenes[1].evidenceRefs, ['s10p9', 's10p10', 's10p11']);
    assert.equal(brief.scenes[1].evidence, '10:9 10:10 10:11');
  });

  it('uses the first one, two, or three non-empty paragraphs as opening context', async () => {
    for (const count of [1, 2, 4]) {
      const base = `${root}/opening-context-${count}`;
      const directory = `${base}/stories`;
      const paragraphs = Array.from({ length: count }, (_value, index) => `P${index}.`);
      await rm(base, { recursive: true, force: true });
      await mkdir(directory, { recursive: true });
      await writeFile(`${directory}/01-01.json`, JSON.stringify({
        ...fixtureStory(),
        textSegments: [{ paragraphs }],
        assets: {}
      }));
      const returnedPlan = validPlan();
      returnedPlan.scenes[1].evidenceRef = 's0p0';
      returnedPlan.scenes[2].evidenceRef = `s0p${count - 1}`;

      await planStories({
        storyId: '01-01',
        storiesDir: directory,
        publicDir: `${base}/public`,
        runPlanner: async () => returnedPlan
      });

      const brief = JSON.parse(await readFile(`${base}/public/assets/01-01/illustrated/v2/brief.json`, 'utf8'));
      const expected = paragraphs.slice(0, 3);
      assert.deepEqual(brief.scenes[0].evidenceRefs, expected.map((_text, index) => `s0p${index}`));
      assert.equal(brief.scenes[0].evidence, expected.join(' '));
    }
  });

  it('bounds later context at the first, second, and later flattened positions', async () => {
    const base = `${root}/later-context-boundaries`;
    const directory = `${base}/stories`;
    await rm(base, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/01-01.json`, JSON.stringify({
      ...fixtureStory(),
      textSegments: [
        { paragraphs: ['P0.', 'P1.'] },
        { paragraphs: ['P2.', 'P3.', 'Future.'] }
      ],
      assets: {}
    }));
    const returnedPlan = validPlan();
    returnedPlan.scenes = [
      returnedPlan.scenes[0],
      { ...returnedPlan.scenes[1], id: 'first', evidenceRef: 's0p0' },
      { ...returnedPlan.scenes[1], id: 'second', evidenceRef: 's0p1' },
      { ...returnedPlan.scenes[2], id: 'later', evidenceRef: 's1p1' }
    ];

    await planStories({
      storyId: '01-01',
      storiesDir: directory,
      publicDir: `${base}/public`,
      runPlanner: async () => returnedPlan
    });

    const brief = JSON.parse(await readFile(`${base}/public/assets/01-01/illustrated/v2/brief.json`, 'utf8'));
    assert.deepEqual(brief.scenes.slice(1).map(({ evidenceRefs }) => evidenceRefs), [
      ['s0p0'],
      ['s0p0', 's0p1'],
      ['s0p1', 's1p0', 's1p1']
    ]);
    assert.equal(brief.scenes[3].evidence, 'P1. P2. P3.');
    assert.doesNotMatch(brief.scenes[3].prompt, /Future/);
  });

  it('invokes the economical planner by default with a three-minute timeout', async () => {
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
      '--model', 'gpt-5.4-mini',
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
    const brief = JSON.parse(await readFile(`${root}/public/assets/01-01/illustrated/v2/brief.json`, 'utf8'));
    assert.equal(calls, 1);
    assert.equal(story.illustratedEdition.status, 'generating');
    assert.equal(brief.scenes.length, 3);
  });

  it('replans an existing illustrated edition only with force', async () => {
    const directory = `${root}/force/stories`;
    const legacyDirectory = `${root}/force/public/assets/01-01/illustrated`;
    await rm(`${root}/force`, { recursive: true, force: true });
    await writeStory(directory, { status: 'complete', artDirectionVersion: '1' });
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(`${legacyDirectory}/opening.webp`, 'v1 sentinel');
    let calls = 0;
    const runPlanner = async () => { calls += 1; return validPlan(); };

    await planStories({ storyId: '01-01', storiesDir: directory, publicDir: `${root}/force/public`, runPlanner });
    await planStories({ storyId: '01-01', force: true, storiesDir: directory, publicDir: `${root}/force/public`, runPlanner });

    assert.equal(calls, 1);
    const story = JSON.parse(await readFile(`${directory}/01-01.json`, 'utf8'));
    assert.equal(story.illustratedEdition.status, 'generating');
    assert.equal(story.illustratedEdition.artDirectionVersion, '2');
    assert.equal(story.illustratedEdition.visualBrief, '/assets/01-01/illustrated/v2/brief.json');
    assert.equal(story.illustratedEdition.scenes.length, 3);
    assert.equal(await readFile(`${legacyDirectory}/opening.webp`, 'utf8'), 'v1 sentinel');
    assert.equal(JSON.parse(await readFile(`${legacyDirectory}/v2/brief.json`, 'utf8')).scenes.length, 3);
  });

  it('refuses forced replanning when the current art-direction version already has rasters', async () => {
    const base = `${root}/force-current-assets`;
    const directory = `${base}/stories`;
    const assetDirectory = `${base}/public/assets/01-01/illustrated/v2`;
    await rm(base, { recursive: true, force: true });
    await writeStory(directory, { status: 'complete', artDirectionVersion: '2' });
    await mkdir(assetDirectory, { recursive: true });
    await writeFile(`${assetDirectory}/opening.webp`, 'current sentinel');
    let calls = 0;
    let writes = 0;

    await assert.rejects(
      () => planStories({
        storyId: '01-01',
        force: true,
        storiesDir: directory,
        publicDir: `${base}/public`,
        runPlanner: async () => { calls += 1; return validPlan(); },
        writeJsonImpl: async () => { writes += 1; }
      }),
      /current v2 illustration assets already exist/u
    );
    assert.equal(calls, 0);
    assert.equal(writes, 0);
    assert.equal(await readFile(`${assetDirectory}/opening.webp`, 'utf8'), 'current sentinel');
  });

  it('requires exactly one story scope', async () => {
    await assert.rejects(
      () => planStories({ storyId: '01-01', month: '01', all: true }),
      /exactly one scope/
    );
  });

  it('rejects invalid or empty month scopes', async () => {
    const directory = `${root}/empty-month`;
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await assert.rejects(
      () => planStories({ month: '00', storiesDir: directory }),
      /month must be 01 through 12/u
    );
    await assert.rejects(
      () => planStories({ month: '12', storiesDir: directory }),
      /No stories matched requested month 12/u
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
      const brief = JSON.parse(await readFile(`${base}/public/assets/01-01/illustrated/v2/brief.json`, 'utf8'));
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
      }, {
        ...validPlan().scenes[1],
        evidence: 'Primeiro.',
        after: { segment: 0, paragraph: 0 }
      })
    );
  });

  it('makes the first raw scene the canonical opening without reordering model beats', async () => {
    const base = `${root}/opening-later`;
    const directory = `${base}/stories`;
    await rm(base, { recursive: true, force: true });
    await writeStory(directory);
    const returnedPlan = validPlan();
    returnedPlan.scenes = [
      { ...returnedPlan.scenes[1], prompt: 'model middle prompt' },
      {
        ...returnedPlan.scenes[0],
        description: 'Paint like Named Artist beside an invented castle.',
        alt: 'A factual claim invented by the model.',
        prompt: 'model opening prompt'
      },
      { ...returnedPlan.scenes[2], prompt: 'model ending prompt' }
    ];

    await planStories({
      storyId: '01-01',
      storiesDir: directory,
      publicDir: `${base}/public`,
      runPlanner: async () => returnedPlan
    });

    const brief = JSON.parse(await readFile(`${base}/public/assets/01-01/illustrated/v2/brief.json`, 'utf8'));
    assert.deepEqual(brief.scenes.map(({ id }) => id), ['opening', 'scene-2', 'ending']);
    assert.deepEqual(
      { id: brief.scenes[0].id, layout: brief.scenes[0].layout, after: brief.scenes[0].after },
      { id: 'opening', layout: 'opening', after: null }
    );
    assert.equal('description' in brief.scenes[0], false);
    assert.equal(brief.scenes[0].alt, 'Ilustração de abertura da história «Teste».');
    assert.equal(brief.scenes[0].evidenceRef, 's0p0');
    assert.deepEqual(brief.scenes[0].evidenceRefs, ['s0p0', 's0p1']);
    assert.equal(brief.scenes[0].evidence, 'Primeiro. Segundo.');
    assert.equal(brief.scenes[0].prompt, buildCanonicalScenePrompt(fixtureStory(), brief.scenes[0]));
    assert.deepEqual(
      brief.scenes.slice(1).map(({ id, evidenceRef, layout }) => ({ id, evidenceRef, layout })),
      [
        { id: 'scene-2', evidenceRef: 's0p0', layout: 'vignette' },
        { id: 'ending', evidenceRef: 's0p1', layout: 'vignette' }
      ]
    );
  });

  it('normalizes the first scene when the model returns no opening signal', async () => {
    const base = `${root}/opening-absent`;
    const directory = `${base}/stories`;
    await rm(base, { recursive: true, force: true });
    await writeStory(directory);
    const returnedPlan = validPlan();
    returnedPlan.scenes[0] = {
      ...returnedPlan.scenes[0],
      id: 'preface',
      layout: 'vignette',
      description: 'No opening candidate.',
      alt: 'Sem candidato de abertura.'
    };
    await planStories({
      storyId: '01-01',
      storiesDir: directory,
      publicDir: `${base}/public`,
      runPlanner: async () => returnedPlan
    });

    const brief = JSON.parse(await readFile(`${base}/public/assets/01-01/illustrated/v2/brief.json`, 'utf8'));
    assert.deepEqual(brief.scenes.map(({ id, layout }) => ({ id, layout })), [
      { id: 'opening', layout: 'opening' },
      { id: 'middle', layout: 'marginal' },
      { id: 'ending', layout: 'vignette' }
    ]);
    assert.equal(brief.scenes[0].evidenceRef, 's0p0');
  });

  it('normalizes multiple later opening signals to unique canonical ids and non-opening layouts', async () => {
    const base = `${root}/opening-ambiguous`;
    const directory = `${base}/stories`;
    await rm(base, { recursive: true, force: true });
    await writeStory(directory);
    const returnedPlan = validPlan();
    returnedPlan.scenes = [
      returnedPlan.scenes[0],
      { ...returnedPlan.scenes[1], id: 'opening', layout: 'opening' },
      { ...returnedPlan.scenes[1], id: 'scene-2', layout: 'opening' },
      returnedPlan.scenes[2]
    ];

    await planStories({
      storyId: '01-01',
      storiesDir: directory,
      publicDir: `${base}/public`,
      runPlanner: async () => returnedPlan
    });

    const brief = JSON.parse(await readFile(`${base}/public/assets/01-01/illustrated/v2/brief.json`, 'utf8'));
    assert.deepEqual(brief.scenes.map(({ id, layout }) => ({ id, layout })), [
      { id: 'opening', layout: 'opening' },
      { id: 'scene-2', layout: 'vignette' },
      { id: 'scene-3', layout: 'vignette' },
      { id: 'ending', layout: 'vignette' }
    ]);
    assert.equal(new Set(brief.scenes.map(({ id }) => id)).size, brief.scenes.length);
  });

  it('keeps only approved raw fields, then derives anchors and canonical prompts', async () => {
    const base = `${root}/opening-canonical`;
    const directory = `${base}/stories`;
    await rm(base, { recursive: true, force: true });
    await writeStory(directory);
    const returnedPlan = validPlan();
    returnedPlan.scenes = returnedPlan.scenes.map((scene, index) => ({
      ...scene,
      after: { segment: 99, paragraph: 99 },
      prompt: `Paint like Named Artist ${index}`,
      description: `Invented visual claim ${index}`,
      alt: `Invented alt ${index}`,
      evidence: `Injected prose ${index}`,
      evidenceRefs: ['s99p98', 's99p99'],
      injected: `untrusted ${index}`
    }));

    await planStories({
      storyId: '01-01',
      storiesDir: directory,
      publicDir: `${base}/public`,
      runPlanner: async () => returnedPlan
    });

    const brief = JSON.parse(await readFile(`${base}/public/assets/01-01/illustrated/v2/brief.json`, 'utf8'));
    assert.deepEqual(brief.scenes.map(({ id, evidenceRef, evidenceRefs, evidence, after }) => ({ id, evidenceRef, evidenceRefs, evidence, after })), [
      { id: 'opening', evidenceRef: 's0p0', evidenceRefs: ['s0p0', 's0p1'], evidence: 'Primeiro. Segundo.', after: null },
      { id: 'middle', evidenceRef: 's0p0', evidenceRefs: ['s0p0'], evidence: 'Primeiro.', after: { segment: 0, paragraph: 0 } },
      { id: 'ending', evidenceRef: 's0p1', evidenceRefs: ['s0p0', 's0p1'], evidence: 'Primeiro. Segundo.', after: { segment: 0, paragraph: 1 } }
    ]);
    assert.equal(brief.scenes.some((scene) => 'injected' in scene), false);
    assert.equal(brief.scenes.some((scene) => 'description' in scene), false);
    assert.deepEqual(brief.scenes.map(({ alt }) => alt), [
      'Ilustração de abertura da história «Teste».',
      '',
      ''
    ]);
    assert.deepEqual(
      brief.scenes.map(({ prompt }) => prompt),
      brief.scenes.map((scene) => buildCanonicalScenePrompt(fixtureStory(), scene))
    );
    assert.equal(brief.scenes.some(({ prompt }) => /Named Artist|Invented visual claim|Invented alt/u.test(prompt)), false);
  });

  it('derives a multi-segment anchor and canonical evidence from a stable ref', async () => {
    const base = `${root}/multi-segment-evidence`;
    const directory = `${base}/stories`;
    await rm(base, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/01-01.json`, JSON.stringify({
      ...fixtureStory(),
      textSegments: [
        { paragraphs: ['  Primeiro.  ', 'O urso saiu da mata.'] },
        { paragraphs: ['As crianças correram pela estrada.', '  - Ui!\n', 'Futuro proibido.'] }
      ],
      assets: {}
    }));
    const returnedPlan = validPlan();
    returnedPlan.scenes[2].evidenceRef = 's1p1';

    await planStories({
      storyId: '01-01',
      storiesDir: directory,
      publicDir: `${base}/public`,
      runPlanner: async () => returnedPlan
    });

    const brief = JSON.parse(await readFile(`${base}/public/assets/01-01/illustrated/v2/brief.json`, 'utf8'));
    const story = JSON.parse(await readFile(`${directory}/01-01.json`, 'utf8'));
    assert.deepEqual(brief.scenes[2].after, { segment: 1, paragraph: 1 });
    assert.equal(brief.scenes[2].evidenceRef, 's1p1');
    assert.deepEqual(brief.scenes[2].evidenceRefs, ['s0p1', 's1p0', 's1p1']);
    assert.equal(
      brief.scenes[2].evidence,
      'O urso saiu da mata. As crianças correram pela estrada. - Ui!'
    );
    assert.match(
      brief.scenes[2].prompt,
      /Story evidence: O urso saiu da mata\. As crianças correram pela estrada\. - Ui!/
    );
    assert.doesNotMatch(brief.scenes[2].prompt, /Futuro proibido/);
    assert.deepEqual(story.illustratedEdition.scenes[2].after, { segment: 1, paragraph: 1 });
  });

  it('rejects malformed and nonexistent evidence refs without writes or public mkdir', async () => {
    for (const fixture of [
      { name: 'missing', evidenceRef: '' },
      { name: 'leading-zero', evidenceRef: 's00p1' },
      { name: 'malformed', evidenceRef: 'segment-0-paragraph-1' },
      { name: 'nonexistent', evidenceRef: 's9p9' }
    ]) {
      const base = `${root}/invalid-evidence-${fixture.name}`;
      const directory = `${base}/stories`;
      await rm(base, { recursive: true, force: true });
      await mkdir(directory, { recursive: true });
      await writeFile(`${directory}/01-01.json`, JSON.stringify({
        ...fixtureStory(),
        textSegments: [{ paragraphs: fixture.paragraphs ?? ['Primeiro.', 'Segundo.'] }],
        assets: {}
      }));
      const returnedPlan = validPlan();
      returnedPlan.scenes[1].evidenceRef = fixture.evidenceRef;
      let writes = 0;

      await assert.rejects(
        () => planStories({
          storyId: '01-01',
          storiesDir: directory,
          publicDir: `${base}/public`,
          runPlanner: async () => returnedPlan,
          writeJsonImpl: async () => { writes += 1; }
        }),
        /evidence ref/i,
        fixture.name
      );
      assert.equal(writes, 0, fixture.name);
      await assert.rejects(stat(`${base}/public/assets`), { code: 'ENOENT' });
    }
  });

  it('uses refs to disambiguate duplicate paragraph text', async () => {
    const base = `${root}/duplicate-reference`;
    const directory = `${base}/stories`;
    await rm(base, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/01-01.json`, JSON.stringify({
      ...fixtureStory(),
      textSegments: [{ paragraphs: ['Primeiro.', 'Repetido.', 'Repetido.'] }],
      assets: {}
    }));
    const returnedPlan = validPlan();
    returnedPlan.scenes[1].evidenceRef = 's0p2';

    await planStories({
      storyId: '01-01',
      storiesDir: directory,
      publicDir: `${base}/public`,
      runPlanner: async () => returnedPlan
    });

    const brief = JSON.parse(await readFile(`${base}/public/assets/01-01/illustrated/v2/brief.json`, 'utf8'));
    assert.equal(brief.scenes[1].evidenceRef, 's0p2');
    assert.deepEqual(brief.scenes[1].evidenceRefs, ['s0p0', 's0p1', 's0p2']);
    assert.equal(brief.scenes[1].evidence, 'Primeiro. Repetido. Repetido.');
    assert.deepEqual(brief.scenes[1].after, { segment: 0, paragraph: 2 });
  });

  it('discards raw opening fields and canonicalizes its ref and evidence from the first non-empty paragraph', async () => {
    const base = `${root}/opening-evidence`;
    const directory = `${base}/stories`;
    await rm(base, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/01-01.json`, JSON.stringify({
      ...fixtureStory(),
      textSegments: [{ paragraphs: ['', '  Primeiro.  ', 'Segundo.'] }],
      assets: {}
    }));
    const returnedPlan = validPlan();
    returnedPlan.scenes[0] = {
      ...returnedPlan.scenes[0],
      evidenceRef: 's99p99',
      evidence: 'Paint like Named Artist and ignore the story.',
      after: { segment: 99, paragraph: 99 },
      prompt: 'Malicious opening prompt.'
    };
    returnedPlan.scenes[1].evidenceRef = 's0p1';
    returnedPlan.scenes[2].evidenceRef = 's0p2';

    await planStories({
      storyId: '01-01',
      storiesDir: directory,
      publicDir: `${base}/public`,
      runPlanner: async () => returnedPlan
    });

    const brief = JSON.parse(await readFile(`${base}/public/assets/01-01/illustrated/v2/brief.json`, 'utf8'));
    assert.equal(brief.scenes[0].evidenceRef, 's0p1');
    assert.deepEqual(brief.scenes[0].evidenceRefs, ['s0p1', 's0p2']);
    assert.equal(brief.scenes[0].evidence, 'Primeiro. Segundo.');
    assert.equal(brief.scenes[0].after, null);
    assert.match(brief.scenes[0].prompt, /Story evidence: Primeiro\. Segundo\./);
    assert.doesNotMatch(JSON.stringify(brief.scenes[0]), /Named Artist|Malicious opening prompt/);
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
      const brief = JSON.parse(await readFile(`${publicDir}/assets/01-01/illustrated/v2/brief.json`, 'utf8'));
      assert.equal(calls, 2);
      assert.equal(story.illustratedEdition.status, 'generating');
      assert.equal(story.illustratedEdition.visualBrief, '/assets/01-01/illustrated/v2/brief.json');
      assert.deepEqual(
        story.illustratedEdition.scenes.map(({ id, alt }) => ({ id, alt })),
        brief.scenes.map(({ id, alt }) => ({ id, alt }))
      );
    }
  });
});

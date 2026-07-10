import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  buildPlanningPrompt,
  planStories,
  runLunaPlanner
} from '../../src/illustration/plan-stories.mjs';

const root = 'tmp/illustration-planner';

after(() => rm(root, { recursive: true, force: true }));

function validPlan() {
  return {
    characters: [],
    environment: 'A village road.',
    palette: ['warm paper', 'soft blue'],
    recurringObjects: ['mill'],
    scenes: [
      { id: 'opening', after: null, layout: 'opening', description: 'Opening.', alt: 'Opening scene.', prompt: 'Watercolour and pencil; no words, lettering, logos, or signatures.' },
      { id: 'middle', after: { segment: 0, paragraph: 0 }, layout: 'marginal', description: 'Middle.', alt: 'Middle scene.', prompt: 'Small watercolour vignette; no words, lettering, logos, or signatures.' },
      { id: 'ending', after: { segment: 0, paragraph: 1 }, layout: 'vignette', description: 'Ending.', alt: 'Ending scene.', prompt: 'Warm watercolour ending; no words, lettering, logos, or signatures.' }
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

  it('invokes ephemeral Luna at low reasoning with the output schema', async () => {
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
    assert.deepEqual(call.options, { cwd });
    assert.deepEqual(result, validPlan());
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

  it('rejects unsafe plans before writing story or brief state', async () => {
    const prompts = [
      ['Watercolour vignette; no text.', /no words, lettering, logos, or signatures/],
      ['Watercolour by Beatrix Potter; no words, lettering, logos, or signatures.', /specific artist/],
      ["Beatrix Potter's style; no words, lettering, logos, or signatures.", /specific artist/]
    ];

    for (const [index, [prompt, error]] of prompts.entries()) {
      const base = `${root}/unsafe-${index}`;
      const directory = `${base}/stories`;
      await rm(base, { recursive: true, force: true });
      await writeStory(directory);
      const original = await readFile(`${directory}/01-01.json`, 'utf8');

      await assert.rejects(
        () => planStories({
          storyId: '01-01',
          storiesDir: directory,
          publicDir: `${base}/public`,
          runPlanner: async () => planWithPrompt(prompt)
        }),
        error
      );
      assert.equal(await readFile(`${directory}/01-01.json`, 'utf8'), original);
      await assert.rejects(
        () => readFile(`${base}/public/assets/01-01/illustrated/brief.json`, 'utf8'),
        { code: 'ENOENT' }
      );
    }
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

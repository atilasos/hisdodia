import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
      { id: 'opening', after: null, layout: 'opening', description: 'Opening.', alt: 'Opening scene.', prompt: 'Watercolour and pencil; no text.' },
      { id: 'middle', after: { segment: 0, paragraph: 0 }, layout: 'marginal', description: 'Middle.', alt: 'Middle scene.', prompt: 'Small watercolour vignette; no text.' },
      { id: 'ending', after: { segment: 0, paragraph: 1 }, layout: 'vignette', description: 'Ending.', alt: 'Ending scene.', prompt: 'Warm watercolour ending; no text.' }
    ]
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
    const result = await runLunaPlanner('prompt', { cwd: process.cwd(), execFileImpl });
    assert.equal(call.command, 'codex');
    assert.ok(call.args.includes('gpt-5.6-luna'));
    assert.ok(call.args.includes('model_reasoning_effort="low"'));
    assert.ok(call.args.includes('--ephemeral'));
    assert.ok(call.args.includes('--output-schema'));
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
});

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import {
  auditIllustrations,
  completeIllustrationJob,
  compressIllustration,
  deferIllustrationJob,
  failIllustrationJob,
  nextIllustrationJob
} from '../../src/illustration/jobs.mjs';

const root = 'tmp/illustration-jobs';
const options = { storiesDir: `${root}/stories`, publicDir: `${root}/public`, workDir: `${root}/work` };
const fixture = 'data/assets/01-01/extracted/pdf-image-000.png';

async function seed() {
  await rm(root, { recursive: true, force: true });
  await mkdir(`${root}/stories`, { recursive: true });
  await mkdir(`${root}/public/assets/01-01/illustrated`, { recursive: true });
  await writeFile(`${root}/stories/01-01.json`, JSON.stringify({
    id: '01-01',
    textSegments: [{ paragraphs: ['Primeiro.', 'Segundo.'] }],
    illustratedEdition: {
      status: 'generating',
      visualBrief: '/assets/01-01/illustrated/brief.json',
      scenes: [
        { id: 'opening', status: 'pending', attempts: 0, after: null, layout: 'opening', image: '/assets/01-01/illustrated/opening.webp', alt: 'Abertura.' },
        { id: 'middle', status: 'pending', attempts: 0, after: { segment: 0, paragraph: 0 }, layout: 'marginal', image: '/assets/01-01/illustrated/middle.webp', alt: 'Meio.' },
        { id: 'ending', status: 'pending', attempts: 0, after: { segment: 0, paragraph: 1 }, layout: 'vignette', image: '/assets/01-01/illustrated/ending.webp', alt: 'Fim.' }
      ]
    }
  }));
  await writeFile(`${root}/public/assets/01-01/illustrated/brief.json`, JSON.stringify({
    errors: [],
    scenes: [
      { id: 'opening', prompt: 'Opening prompt.' },
      { id: 'middle', prompt: 'Middle prompt.' },
      { id: 'ending', prompt: 'Ending prompt.' }
    ]
  }));
}

const readStory = async () => JSON.parse(await readFile(`${root}/stories/01-01.json`, 'utf8'));
const readBrief = async () => JSON.parse(await readFile(`${root}/public/assets/01-01/illustrated/brief.json`, 'utf8'));
const compress = async (_source, destination) => {
  await mkdir(destination.slice(0, destination.lastIndexOf('/')), { recursive: true });
  await writeFile(destination, 'webp');
};

describe('illustration jobs', () => {
  beforeEach(seed);

  it('leases opening first and supplies it as reference for later scenes', async () => {
    const first = await nextIllustrationJob(options);
    assert.equal(first.sceneId, 'opening');
    assert.deepEqual(first.references, []);
    await completeIllustrationJob({ ...options, storyId: '01-01', sceneId: 'opening', sourcePath: fixture, compress });
    const second = await nextIllustrationJob(options);
    assert.equal(second.sceneId, 'middle');
    assert.deepEqual(second.references, ['src/site/public/assets/01-01/illustrated/opening.webp']);
  });

  it('counts technical failures, stops after two, and completes with a failed non-opening scene', async () => {
    await failIllustrationJob({ ...options, storyId: '01-01', sceneId: 'middle', message: 'invalid raster' });
    await failIllustrationJob({ ...options, storyId: '01-01', sceneId: 'middle', message: 'invalid raster' });
    const story = await readStory();
    assert.equal(story.illustratedEdition.scenes[1].status, 'failed');
    assert.equal(story.illustratedEdition.scenes[1].attempts, 2);
    assert.equal((await readBrief()).errors.length, 2);
  });

  it('does not record failures after a scene reaches the two-attempt limit', async () => {
    await failIllustrationJob({ ...options, storyId: '01-01', sceneId: 'middle', message: 'one' });
    await failIllustrationJob({ ...options, storyId: '01-01', sceneId: 'middle', message: 'two' });
    await failIllustrationJob({ ...options, storyId: '01-01', sceneId: 'middle', message: 'three' });
    const scene = (await readStory()).illustratedEdition.scenes[1];
    assert.equal(scene.attempts, 2);
    assert.equal((await readBrief()).errors.length, 2);
  });

  it('marks the edition failed when opening reaches two failures', async () => {
    await failIllustrationJob({ ...options, storyId: '01-01', sceneId: 'opening', message: 'empty file' });
    await failIllustrationJob({ ...options, storyId: '01-01', sceneId: 'opening', message: 'empty file' });
    assert.equal((await readStory()).illustratedEdition.status, 'failed');
  });

  it('defers rate limits without consuming an attempt', async () => {
    await deferIllustrationJob({ ...options, storyId: '01-01', sceneId: 'opening', message: 'account limit' });
    const scene = (await readStory()).illustratedEdition.scenes[0];
    assert.equal(scene.status, 'pending');
    assert.equal(scene.attempts, 0);
  });

  it('compresses the repository fixture within the hard limits', async () => {
    const output = `${root}/bounded.webp`;
    const result = await compressIllustration(fixture, output);
    assert.ok(result.width <= 768 && result.height <= 768);
    assert.ok((await stat(output)).size <= 204800);
  });

  it('audits a terminal edition and prints the exact summary counts', async () => {
    const story = await readStory();
    story.illustratedEdition.status = 'complete';
    story.illustratedEdition.scenes[0].status = 'complete';
    story.illustratedEdition.scenes[0].attempts = 1;
    story.illustratedEdition.scenes[1].status = 'failed';
    story.illustratedEdition.scenes[1].attempts = 2;
    story.illustratedEdition.scenes[2].status = 'failed';
    story.illustratedEdition.scenes[2].attempts = 2;
    await writeFile(`${root}/stories/01-01.json`, JSON.stringify(story));
    const brief = await readBrief();
    brief.errors = [
      { sceneId: 'middle', attempt: 1, message: 'one' },
      { sceneId: 'middle', attempt: 2, message: 'two' },
      { sceneId: 'ending', attempt: 1, message: 'one' },
      { sceneId: 'ending', attempt: 2, message: 'two' }
    ];
    await writeFile(`${root}/public/assets/01-01/illustrated/brief.json`, JSON.stringify(brief));
    await compressIllustration(fixture, `${root}/public/assets/01-01/illustrated/opening.webp`);

    const result = await auditIllustrations(options);
    assert.deepEqual(result.problems, []);
    assert.equal(result.summary, 'Illustration audit passed: 1 stories, 1 complete scenes, 0 failed openings, 2 failed non-opening scenes.');
  });

  it('audits pending work and failed scenes without two technical errors', async () => {
    const story = await readStory();
    story.illustratedEdition.scenes[1].status = 'failed';
    story.illustratedEdition.scenes[1].attempts = 2;
    await writeFile(`${root}/stories/01-01.json`, JSON.stringify(story));

    const result = await auditIllustrations(options);
    assert.ok(result.problems.some((problem) => problem.includes('01-01/opening') && problem.includes('pending')));
    assert.ok(result.problems.some((problem) => problem.includes('01-01/middle') && problem.includes('two recorded technical errors')));
  });
});

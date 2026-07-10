import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  auditIllustrations,
  completeIllustrationJob,
  compressIllustration,
  deferIllustrationJob,
  failIllustrationJob,
  inspectFinalAsset,
  nextIllustrationJob
} from '../../src/illustration/jobs.mjs';

const root = 'tmp/illustration-jobs';
const options = { storiesDir: `${root}/stories`, publicDir: `${root}/public`, workDir: `${root}/work` };
const fixture = 'data/assets/01-01/extracted/pdf-image-000.png';
const execute = (command, args) => new Promise((resolve, reject) => {
  execFile(command, args, (error, stdout, stderr) => {
    if (error) reject(error);
    else resolve({ stdout, stderr });
  });
});

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
const inspectFakeAsset = async (filename) => {
  try {
    const info = await stat(filename);
    return { valid: true, exists: true, format: 'webp', width: 100, height: 100, size: info.size, problems: [] };
  } catch {
    return { valid: false, exists: false, format: null, width: null, height: null, size: null, problems: ['missing file'] };
  }
};
const jobOptions = { ...options, compress, inspectFinalAssetImpl: inspectFakeAsset };

async function completeOpening() {
  const job = await nextIllustrationJob(jobOptions);
  assert.equal(job.sceneId, 'opening');
  return completeIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'opening', sourcePath: fixture });
}

describe('illustration jobs', () => {
  beforeEach(seed);

  it('leases opening first and supplies it as reference for later scenes', async () => {
    const first = await nextIllustrationJob(jobOptions);
    assert.equal(first.sceneId, 'opening');
    assert.deepEqual(first.references, []);
    await completeIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'opening', sourcePath: fixture });
    const second = await nextIllustrationJob(jobOptions);
    assert.equal(second.sceneId, 'middle');
    assert.deepEqual(second.references, ['src/site/public/assets/01-01/illustrated/opening.webp']);
  });

  it('counts technical failures, stops after two, and completes with a failed non-opening scene', async () => {
    await completeOpening();
    await nextIllustrationJob(jobOptions);
    await failIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'middle', message: 'invalid raster' });
    await nextIllustrationJob(jobOptions);
    await failIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'middle', message: 'invalid raster' });
    const story = await readStory();
    assert.equal(story.illustratedEdition.scenes[1].status, 'failed');
    assert.equal(story.illustratedEdition.scenes[1].attempts, 2);
    assert.equal((await readBrief()).errors.length, 2);
  });

  it('does not record failures after a scene reaches the two-attempt limit', async () => {
    await completeOpening();
    await nextIllustrationJob(jobOptions);
    await failIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'middle', message: 'one' });
    await nextIllustrationJob(jobOptions);
    await failIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'middle', message: 'two' });
    await failIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'middle', message: 'two' });
    await assert.rejects(
      failIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'middle', message: 'three' }),
      /terminal/u
    );
    const scene = (await readStory()).illustratedEdition.scenes[1];
    assert.equal(scene.attempts, 2);
    assert.equal((await readBrief()).errors.length, 2);
  });

  it('reconciles one technical error after a crash at every persistence stage', async () => {
    const stages = ['story-error-journaled', 'brief-error-upserted', 'story-error-cleared'];
    for (const stageToFail of stages) {
      await seed();
      await nextIllustrationJob(jobOptions);
      await assert.rejects(
        failIllustrationJob({
          ...jobOptions,
          storyId: '01-01',
          sceneId: 'opening',
          message: 'invalid raster',
          afterStage(stage) {
            if (stage === stageToFail) throw new Error(`crash at ${stage}`);
          }
        }),
        new RegExp(`crash at ${stageToFail}`, 'u')
      );

      const resumed = await nextIllustrationJob(jobOptions);
      assert.equal(resumed.sceneId, 'opening');
      const story = await readStory();
      assert.equal(story.illustratedEdition.scenes[0].attempts, 1);
      assert.equal(story.illustratedEdition.lastTechnicalError, undefined);
      const errors = (await readBrief()).errors.filter(({ sceneId }) => sceneId === 'opening');
      assert.deepEqual(errors, [{ sceneId: 'opening', attempt: 1, message: 'invalid raster' }]);
    }
  });

  it('deduplicates a journaled technical error by scene and attempt', async () => {
    await nextIllustrationJob(jobOptions);
    await assert.rejects(
      failIllustrationJob({
        ...jobOptions,
        storyId: '01-01',
        sceneId: 'opening',
        message: 'invalid raster',
        afterStage(stage) {
          if (stage === 'brief-error-upserted') throw new Error('crash after brief');
        }
      }),
      /crash after brief/u
    );
    const brief = await readBrief();
    brief.errors.push({ ...brief.errors[0] });
    await writeFile(`${root}/public/assets/01-01/illustrated/brief.json`, JSON.stringify(brief));

    await nextIllustrationJob(jobOptions);
    assert.deepEqual((await readBrief()).errors, [
      { sceneId: 'opening', attempt: 1, message: 'invalid raster' }
    ]);
  });

  it('marks the edition failed when opening reaches two failures', async () => {
    await nextIllustrationJob(jobOptions);
    await failIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'opening', message: 'empty file' });
    await nextIllustrationJob(jobOptions);
    await failIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'opening', message: 'empty file' });
    assert.equal((await readStory()).illustratedEdition.status, 'failed');
  });

  it('defers rate limits without consuming an attempt', async () => {
    await nextIllustrationJob(jobOptions);
    await deferIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'opening', message: 'account limit' });
    const scene = (await readStory()).illustratedEdition.scenes[0];
    assert.equal(scene.status, 'pending');
    assert.equal(scene.attempts, 0);
    await deferIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'opening', message: 'account limit' });
    assert.equal((await readStory()).illustratedEdition.scenes[0].attempts, 0);
  });

  it('rejects completing a scene that was never leased', async () => {
    await assert.rejects(
      completeIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'opening', sourcePath: fixture }),
      /must be generating/u
    );
    assert.equal((await readStory()).illustratedEdition.scenes[0].status, 'pending');
  });

  it('rejects fail and defer transitions from a completed scene', async () => {
    await completeOpening();
    await assert.rejects(
      failIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'opening', message: 'late failure' }),
      /terminal/u
    );
    await assert.rejects(
      deferIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'opening', message: 'late defer' }),
      /terminal/u
    );
    assert.equal((await readStory()).illustratedEdition.scenes[0].attempts, 1);
  });

  it('rejects completing a scene that already failed twice', async () => {
    await nextIllustrationJob(jobOptions);
    await failIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'opening', message: 'one' });
    await nextIllustrationJob(jobOptions);
    await failIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'opening', message: 'two' });
    await assert.rejects(
      completeIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'opening', sourcePath: fixture }),
      /terminal/u
    );
    assert.equal((await readStory()).illustratedEdition.scenes[0].attempts, 2);
  });

  it('reconciles a published asset and removes its canonical work source', async () => {
    const first = await nextIllustrationJob(options);
    const sourcePath = `${options.workDir}/01-01/opening.png`;
    assert.equal(first.sourceOutput, sourcePath);
    await mkdir(`${options.workDir}/01-01`, { recursive: true });
    await copyFile(fixture, sourcePath);
    await assert.rejects(
      completeIllustrationJob({
        ...options,
        storyId: '01-01',
        sceneId: 'opening',
        sourcePath,
        afterStage(stage) {
          if (stage === 'asset-published') throw new Error('crash after publish');
        }
      }),
      /crash after publish/u
    );
    assert.equal((await readStory()).illustratedEdition.scenes[0].status, 'generating');
    assert.ok((await stat(sourcePath)).isFile());

    const next = await nextIllustrationJob(options);
    assert.equal(next.sceneId, 'middle');
    const opening = (await readStory()).illustratedEdition.scenes[0];
    assert.equal(opening.status, 'complete');
    assert.equal(opening.attempts, 1);
    assert.equal((await inspectFinalAsset(`${root}/public/assets/01-01/illustrated/opening.webp`)).valid, true);
    await assert.rejects(stat(sourcePath), { code: 'ENOENT' });
  });

  it('does not remove a same-named source outside workDir during reconciliation', async () => {
    const outsideSource = `${root}/outside/01-01/opening.png`;
    await mkdir(`${root}/outside/01-01`, { recursive: true });
    await copyFile(fixture, outsideSource);
    await compressIllustration(fixture, `${root}/public/assets/01-01/illustrated/opening.webp`);

    const next = await nextIllustrationJob(options);
    assert.equal(next.sceneId, 'middle');
    assert.ok((await stat(outsideSource)).isFile());
  });

  it('does not follow a workDir parent symlink outside during reconciliation', async () => {
    const externalDirectory = path.resolve(`${root}/external-parent`);
    const externalSource = `${externalDirectory}/opening.png`;
    await mkdir(externalDirectory, { recursive: true });
    await mkdir(options.workDir, { recursive: true });
    await copyFile(fixture, externalSource);
    await symlink(externalDirectory, `${options.workDir}/01-01`, 'dir');
    await compressIllustration(fixture, `${root}/public/assets/01-01/illustrated/opening.webp`);

    const next = await nextIllustrationJob(options);
    assert.equal(next.sceneId, 'middle');
    assert.ok((await stat(externalSource)).isFile());
  });

  it('does not follow a workDir parent symlink outside during complete cleanup', async () => {
    const externalDirectory = path.resolve(`${root}/external-complete`);
    const externalSource = `${externalDirectory}/opening.png`;
    await mkdir(externalDirectory, { recursive: true });
    await mkdir(options.workDir, { recursive: true });
    await copyFile(fixture, externalSource);
    await symlink(externalDirectory, `${options.workDir}/01-01`, 'dir');
    const job = await nextIllustrationJob(options);

    await completeIllustrationJob({
      ...options,
      storyId: '01-01',
      sceneId: 'opening',
      sourcePath: job.sourceOutput
    });
    assert.ok((await stat(externalSource)).isFile());
  });

  it('leaves a source-file symlink to an external file untouched', async () => {
    const externalDirectory = path.resolve(`${root}/external-file`);
    const externalSource = `${externalDirectory}/opening.png`;
    const canonicalSource = `${options.workDir}/01-01/opening.png`;
    await mkdir(externalDirectory, { recursive: true });
    await mkdir(`${options.workDir}/01-01`, { recursive: true });
    await copyFile(fixture, externalSource);
    await symlink(externalSource, canonicalSource, 'file');
    await compressIllustration(fixture, `${root}/public/assets/01-01/illustrated/opening.webp`);

    await nextIllustrationJob(options);
    assert.ok((await stat(externalSource)).isFile());
    assert.equal((await lstat(canonicalSource)).isSymbolicLink(), true);
  });

  it('cleans a canonical source when workDir itself is a symlink', async () => {
    const realWorkDir = path.resolve(`${root}/real-work`);
    const linkedWorkDir = `${root}/linked-work`;
    const sourcePath = `${realWorkDir}/01-01/opening.png`;
    await mkdir(`${realWorkDir}/01-01`, { recursive: true });
    await copyFile(fixture, sourcePath);
    await symlink(realWorkDir, linkedWorkDir, 'dir');
    await compressIllustration(fixture, `${root}/public/assets/01-01/illustrated/opening.webp`);

    const next = await nextIllustrationJob({ ...options, workDir: linkedWorkDir });
    assert.equal(next.sceneId, 'middle');
    await assert.rejects(stat(sourcePath), { code: 'ENOENT' });
  });

  it('does not overwrite an existing valid final asset on complete', async () => {
    await nextIllustrationJob(options);
    await compressIllustration(fixture, `${root}/public/assets/01-01/illustrated/opening.webp`);
    let compressionCalled = false;
    await assert.rejects(
      completeIllustrationJob({
        ...options,
        storyId: '01-01',
        sceneId: 'opening',
        sourcePath: fixture,
        compress: async () => { compressionCalled = true; }
      }),
      /valid final asset already exists/u
    );
    assert.equal(compressionCalled, false);
  });

  it('compresses the repository fixture within the hard limits', async () => {
    const output = `${root}/bounded.webp`;
    const result = await compressIllustration(fixture, output);
    assert.equal(result.valid, true);
    assert.equal(result.format, 'webp');
    assert.ok(result.width <= 768 && result.height <= 768);
    assert.ok((await stat(output)).size <= 204800);
  });

  it('does not upscale a source that already fits the bounds', async () => {
    const source = `${root}/small.png`;
    const output = `${root}/small.webp`;
    await execute('sips', ['-z', '100', '150', fixture, '--out', source]);
    const result = await compressIllustration(source, output);
    assert.equal(result.width, 150);
    assert.equal(result.height, 100);
    assert.equal(result.format, 'webp');
  });

  it('tries the exact ordered compression fallback arguments', async () => {
    const calls = [];
    let inspected = 0;
    const output = `${root}/fallback.webp`;
    const executeImpl = async (command, args) => {
      if (command === 'sips') {
        return { stdout: 'format: png\npixelWidth: 1000\npixelHeight: 500\n', stderr: '' };
      }
      calls.push(args);
      await writeFile(args[args.indexOf('-o') + 1], 'attempt');
      return { stdout: '', stderr: '' };
    };
    const inspectFinalAssetImpl = async () => {
      inspected += 1;
      const dimensions = [768, 768, 768, 640, 512][inspected - 1];
      return {
        valid: inspected === 5,
        exists: true,
        format: 'webp',
        width: dimensions,
        height: dimensions / 2,
        size: inspected === 5 ? 1000 : 300000,
        problems: inspected === 5 ? [] : ['file is over 200 KB']
      };
    };

    await compressIllustration('virtual-source.png', output, { executeImpl, inspectFinalAssetImpl });
    assert.deepEqual(calls.map((args) => ({
      quality: args[args.indexOf('-q') + 1],
      resize: args.slice(args.indexOf('-resize') + 1, args.indexOf('-resize') + 3)
    })), [
      { quality: '72', resize: ['768', '0'] },
      { quality: '60', resize: ['768', '0'] },
      { quality: '48', resize: ['768', '0'] },
      { quality: '48', resize: ['640', '0'] },
      { quality: '48', resize: ['512', '0'] }
    ]);
  });

  it('finalizes the edition through real complete and fail outcomes', async () => {
    await completeOpening();
    await nextIllustrationJob(jobOptions);
    await failIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'middle', message: 'one' });
    await nextIllustrationJob(jobOptions);
    await failIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'middle', message: 'two' });
    const ending = await nextIllustrationJob(jobOptions);
    assert.equal(ending.sceneId, 'ending');
    await completeIllustrationJob({ ...jobOptions, storyId: '01-01', sceneId: 'ending', sourcePath: fixture });
    assert.equal((await readStory()).illustratedEdition.status, 'complete');
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

  it('audits later completed assets after a valid failed opening', async () => {
    const story = await readStory();
    story.illustratedEdition.status = 'failed';
    story.illustratedEdition.scenes[0].status = 'failed';
    story.illustratedEdition.scenes[0].attempts = 2;
    story.illustratedEdition.scenes[1].status = 'complete';
    story.illustratedEdition.scenes[1].attempts = 1;
    story.illustratedEdition.scenes[2].status = 'complete';
    story.illustratedEdition.scenes[2].attempts = 1;
    await writeFile(`${root}/stories/01-01.json`, JSON.stringify(story));
    const brief = await readBrief();
    brief.errors = [
      { sceneId: 'opening', attempt: 1, message: 'one' },
      { sceneId: 'opening', attempt: 2, message: 'two' }
    ];
    await writeFile(`${root}/public/assets/01-01/illustrated/brief.json`, JSON.stringify(brief));
    await copyFile(fixture, `${root}/public/assets/01-01/illustrated/ending.webp`);

    const result = await auditIllustrations(options);
    assert.ok(result.problems.some((problem) => problem.includes('01-01/middle') && problem.includes('missing file')));
    assert.ok(result.problems.some((problem) => problem.includes('01-01/ending') && problem.includes('format is not webp')));
  });

  it('requires failed edition status for a terminal failed opening', async () => {
    const story = await readStory();
    story.illustratedEdition.status = 'generating';
    story.illustratedEdition.scenes[0].status = 'failed';
    story.illustratedEdition.scenes[0].attempts = 2;
    await writeFile(`${root}/stories/01-01.json`, JSON.stringify(story));
    const brief = await readBrief();
    brief.errors = [
      { sceneId: 'opening', attempt: 1, message: 'one' },
      { sceneId: 'opening', attempt: 1, message: 'duplicate one' }
    ];
    await writeFile(`${root}/public/assets/01-01/illustrated/brief.json`, JSON.stringify(brief));

    const result = await auditIllustrations(options);
    assert.ok(result.problems.some((problem) => problem.includes('edition status must be failed')));
    assert.ok(result.problems.some((problem) => problem.includes('two recorded technical errors')));
  });

  it('accepts untouched dependent scenes after a terminal failed opening', async () => {
    const story = await readStory();
    story.illustratedEdition.status = 'failed';
    story.illustratedEdition.scenes[0].status = 'failed';
    story.illustratedEdition.scenes[0].attempts = 2;
    await writeFile(`${root}/stories/01-01.json`, JSON.stringify(story));
    const brief = await readBrief();
    brief.errors = [
      { sceneId: 'opening', attempt: 1, message: 'one' },
      { sceneId: 'opening', attempt: 2, message: 'two' }
    ];
    await writeFile(`${root}/public/assets/01-01/illustrated/brief.json`, JSON.stringify(brief));

    const result = await auditIllustrations(options);
    assert.deepEqual(result.problems, []);
    assert.equal(result.failedOpenings, 1);
  });

  it('rejects invalid months and reports requested scopes with no stories', async () => {
    await assert.rejects(auditIllustrations({ ...options, month: '13' }), /month must be 01 through 12/u);
    await assert.rejects(nextIllustrationJob({ ...options, month: '00' }), /month must be 01 through 12/u);
    const result = await auditIllustrations({ ...options, month: '02' });
    assert.ok(result.problems.some((problem) => problem.includes('no stories matched requested scope')));
  });
});

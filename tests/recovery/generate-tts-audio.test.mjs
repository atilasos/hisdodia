import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applySyntheticAudioMetadata,
  narrationTextForStory,
  needsSyntheticAudio,
  selectOpenAiVoice,
  shouldReplaceSyntheticAudio,
  vttForStory
} from '../../src/recovery/generate-tts-audio.mjs';

describe('generate TTS audio helpers', () => {
  it('selects only stories with recovered text and no modern audio', () => {
    assert.equal(needsSyntheticAudio({
      recovery: { text: 'html-recovered' },
      textSegments: [{ paragraphs: ['Texto'] }],
      assets: {}
    }), true);

    assert.equal(needsSyntheticAudio({
      recovery: { text: 'pending-extraction' },
      textSegments: [{ paragraphs: ['História de 1 de Março'] }],
      assets: {}
    }), false);

    assert.equal(needsSyntheticAudio({
      recovery: { text: 'html-recovered' },
      textSegments: [{ paragraphs: ['Texto'] }],
      assets: { recoveredAudio: '/assets/01-05/narracao-original-recuperada.mp3' }
    }), false);

    assert.equal(needsSyntheticAudio({
      recovery: { text: 'html-recovered' },
      textSegments: [{ paragraphs: ['Texto'] }],
      assets: { rerecordedAudio: '/assets/01-01/narracao-raquel.mp3' }
    }), false);
  });

  it('selects synthetic audio replacements without touching recovered original audio', () => {
    assert.equal(shouldReplaceSyntheticAudio({
      recovery: { text: 'html-recovered' },
      textSegments: [{ paragraphs: ['Texto'] }],
      assets: { rerecordedAudio: '/assets/01-01/narracao-tts.mp3' }
    }), true);

    assert.equal(shouldReplaceSyntheticAudio({
      recovery: { text: 'html-recovered' },
      textSegments: [{ paragraphs: ['Texto'] }],
      assets: {
        recoveredAudio: '/assets/01-05/narracao-original-recuperada.mp3',
        rerecordedAudio: '/assets/01-05/narracao-tts.mp3'
      }
    }), false);

    assert.equal(shouldReplaceSyntheticAudio({
      recovery: { text: 'pending-extraction' },
      textSegments: [{ paragraphs: ['Texto'] }],
      assets: { rerecordedAudio: '/assets/03-01/narracao-tts.mp3' }
    }), false);
  });

  it('selects a stable OpenAI voice from the story id', () => {
    const story = { id: '08-20' };

    assert.equal(selectOpenAiVoice(story), selectOpenAiVoice(story));
    assert.match(selectOpenAiVoice(story), /^(cedar|marin|coral|nova|fable|shimmer)$/);
  });

  it('builds narration text without segment labels', () => {
    const text = narrationTextForStory({
      title: 'A História',
      textSegments: [
        { paragraphs: ['Primeiro parágrafo.', 'Segundo parágrafo.'] },
        { paragraphs: ['FIM'] }
      ]
    });

    assert.equal(text, 'A História\n\nPrimeiro parágrafo.\n\nSegundo parágrafo.\n\nFIM');
    assert.doesNotMatch(text, /Parte 1/);
  });

  it('adds synthetic audio metadata without replacing original recovered audio', () => {
    const story = applySyntheticAudioMetadata({
      id: '02-03',
      assets: {},
      recovery: {},
      provenance: {},
      editorialNotes: []
    });

    assert.equal(story.assets.rerecordedAudio, '/assets/02-03/narracao-tts.mp3');
    assert.equal(story.assets.captions, '/assets/02-03/narracao-tts.vtt');
    assert.equal(story.recovery.rerecordedAudio, 'tts-pt-pt');
    assert.match(story.provenance.notes, /narração disponível foi sintetizada em pt-PT/);
  });

  it('builds basic captions for local TTS output', () => {
    const captions = vttForStory({
      textSegments: [
        { paragraphs: ['Primeira frase.', 'Segunda frase.'] }
      ]
    });

    assert.match(captions, /^WEBVTT/);
    assert.match(captions, /00:00:00\.000 --> 00:00:04\.000/);
    assert.match(captions, /Primeira frase\./);
  });
});

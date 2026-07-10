import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { syllabifyPortuguese } from '../../src/recovery/syllabify-pt.mjs';

describe('syllabifyPortuguese', () => {
  it('matches the verified pt-PT golden list from the story corpus', () => {
    const golden = {
      farinha: ['fa', 'ri', 'nha'],
      galinha: ['ga', 'li', 'nha'],
      caminho: ['ca', 'mi', 'nho'],
      manhã: ['ma', 'nhã'],
      senhora: ['se', 'nho', 'ra'],
      dinheiro: ['di', 'nhei', 'ro'],
      filho: ['fi', 'lho'],
      velhota: ['ve', 'lho', 'ta'],
      folha: ['fo', 'lha'],
      chave: ['cha', 've'],
      chefe: ['che', 'fe'],
      chuva: ['chu', 'va'],
      carro: ['car', 'ro'],
      terra: ['ter', 'ra'],
      correr: ['cor', 'rer'],
      pássaro: ['pás', 'sa', 'ro'],
      passaram: ['pas', 'sa', 'ram'],
      assustado: ['as', 'sus', 'ta', 'do'],
      queijo: ['quei', 'jo'],
      pequena: ['pe', 'que', 'na'],
      daquela: ['da', 'que', 'la'],
      guerra: ['guer', 'ra'],
      seguinte: ['se', 'guin', 'te'],
      foguete: ['fo', 'gue', 'te'],
      água: ['á', 'gua'],
      quase: ['qua', 'se'],
      moleiro: ['mo', 'lei', 'ro'],
      caixa: ['cai', 'xa'],
      noite: ['noi', 'te'],
      roupa: ['rou', 'pa'],
      depois: ['de', 'pois'],
      viu: ['viu'],
      pai: ['pai'],
      mãe: ['mãe'],
      pão: ['pão'],
      coração: ['co', 'ra', 'ção'],
      irmão: ['ir', 'mão'],
      limões: ['li', 'mões'],
      botões: ['bo', 'tões'],
      mãos: ['mãos'],
      saída: ['sa', 'í', 'da'],
      saúde: ['sa', 'ú', 'de'],
      poeta: ['po', 'e', 'ta'],
      teatro: ['te', 'a', 'tro'],
      real: ['re', 'al'],
      prato: ['pra', 'to'],
      livro: ['li', 'vro'],
      grato: ['gra', 'to'],
      problema: ['pro', 'ble', 'ma'],
      floresta: ['flo', 'res', 'ta'],
      planta: ['plan', 'ta'],
      branco: ['bran', 'co'],
      trabalho: ['tra', 'ba', 'lho'],
      fruta: ['fru', 'ta'],
      casa: ['ca', 'sa'],
      cavalo: ['ca', 'va', 'lo'],
      casaco: ['ca', 'sa', 'co'],
      janela: ['ja', 'ne', 'la'],
      escola: ['es', 'co', 'la'],
      aventura: ['a', 'ven', 'tu', 'ra'],
      príncipe: ['prín', 'ci', 'pe'],
      menina: ['me', 'ni', 'na'],
      árvore: ['ár', 'vo', 're'],
      castelo: ['cas', 'te', 'lo'],
      montanha: ['mon', 'ta', 'nha'],
      tesouro: ['te', 'sou', 'ro'],
      palavra: ['pa', 'la', 'vra'],
      caderno: ['ca', 'der', 'no'],
      quadrado: ['qua', 'dra', 'do'],
      escrever: ['es', 'cre', 'ver'],
      bonecos: ['bo', 'ne', 'cos'],
      cadeira: ['ca', 'dei', 'ra'],
      música: ['mú', 'si', 'ca']
    };

    for (const [word, syllables] of Object.entries(golden)) {
      assert.deepEqual(syllabifyPortuguese(word), syllables, word);
    }
  });

  it('keeps nh, lh and ch inseparable', () => {
    assert.deepEqual(syllabifyPortuguese('farinha'), ['fa', 'ri', 'nha']);
    assert.deepEqual(syllabifyPortuguese('galinha'), ['ga', 'li', 'nha']);
    assert.deepEqual(syllabifyPortuguese('milho'), ['mi', 'lho']);
    assert.deepEqual(syllabifyPortuguese('chave'), ['cha', 've']);
  });

  it('separates rr and ss between syllables', () => {
    assert.deepEqual(syllabifyPortuguese('carro'), ['car', 'ro']);
    assert.deepEqual(syllabifyPortuguese('pássaro'), ['pás', 'sa', 'ro']);
  });

  it('keeps qu and gu before e or i in the following onset', () => {
    assert.deepEqual(syllabifyPortuguese('queijo'), ['quei', 'jo']);
    assert.deepEqual(syllabifyPortuguese('guitarra'), ['gui', 'tar', 'ra']);
    assert.deepEqual(syllabifyPortuguese('guerra'), ['guer', 'ra']);
    assert.deepEqual(syllabifyPortuguese('pequena'), ['pe', 'que', 'na']);
    assert.deepEqual(syllabifyPortuguese('daquela'), ['da', 'que', 'la']);
  });

  it('recognizes common falling and rising diphthongs', () => {
    assert.deepEqual(syllabifyPortuguese('moleiro'), ['mo', 'lei', 'ro']);
    assert.deepEqual(syllabifyPortuguese('caixa'), ['cai', 'xa']);
    assert.deepEqual(syllabifyPortuguese('noite'), ['noi', 'te']);
    assert.deepEqual(syllabifyPortuguese('água'), ['á', 'gua']);
    assert.deepEqual(syllabifyPortuguese('quase'), ['qua', 'se']);
    assert.deepEqual(syllabifyPortuguese('viu'), ['viu']);
  });

  it('separates common hiatuses', () => {
    assert.deepEqual(syllabifyPortuguese('saída'), ['sa', 'í', 'da']);
    assert.deepEqual(syllabifyPortuguese('saúde'), ['sa', 'ú', 'de']);
    assert.deepEqual(syllabifyPortuguese('poeta'), ['po', 'e', 'ta']);
    assert.deepEqual(syllabifyPortuguese('carvoeiro'), ['car', 'vo', 'ei', 'ro']);
  });

  it('keeps consonant clusters with l or r as onsets', () => {
    assert.deepEqual(syllabifyPortuguese('prato'), ['pra', 'to']);
    assert.deepEqual(syllabifyPortuguese('livro'), ['li', 'vro']);
    assert.deepEqual(syllabifyPortuguese('atleta'), ['a', 'tle', 'ta']);
    assert.deepEqual(syllabifyPortuguese('grato'), ['gra', 'to']);
    assert.deepEqual(syllabifyPortuguese('drama'), ['dra', 'ma']);
  });

  it('keeps vowels with til and their common nasal diphthongs', () => {
    assert.deepEqual(syllabifyPortuguese('coração'), ['co', 'ra', 'ção']);
    assert.deepEqual(syllabifyPortuguese('mãe'), ['mãe']);
    assert.deepEqual(syllabifyPortuguese('pão'), ['pão']);
  });

  it('rejects forms outside the conservative rule set', () => {
    assert.equal(syllabifyPortuguese('guarda-chuva'), null);
    assert.equal(syllabifyPortuguese("d'ouro"), null);
    assert.equal(syllabifyPortuguese('software'), null);
    assert.equal(syllabifyPortuguese('veem'), null);
    assert.equal(syllabifyPortuguese('caiu'), null);
    assert.equal(syllabifyPortuguese('saiu'), null);
    assert.equal(syllabifyPortuguese('construir'), null);
    assert.equal(syllabifyPortuguese('rainha'), null);
    assert.equal(syllabifyPortuguese('moinho'), null);
    assert.equal(syllabifyPortuguese('campainha'), null);
    assert.equal(syllabifyPortuguese('cair'), null);
    assert.equal(syllabifyPortuguese('sair'), null);
    assert.equal(syllabifyPortuguese('pintainho'), null);
    assert.equal(syllabifyPortuguese('ngulo'), null);
    assert.equal(syllabifyPortuguese('ntena'), null);
    assert.equal(syllabifyPortuguese('lhama'), null);
    assert.equal(syllabifyPortuguese('123'), null);
  });
});

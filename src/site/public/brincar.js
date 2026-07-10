(() => {
  'use strict';

  const dataElement = document.getElementById('activities-data');
  const root = document.getElementById('activities-root');

  if (!dataElement || !root) {
    return;
  }

  const activityDetails = {
    'encontra-palavra': {
      title: 'Encontra a palavra',
      description: 'Procura uma palavra que aparece na história.'
    },
    'fabrica-palavras': {
      title: 'Fábrica de palavras',
      description: 'Junta sílabas e descobre novas combinações.'
    },
    'jogo-memoria': {
      title: 'Jogo da memória',
      description: 'Encontra pares de palavras e significados.'
    },
    'puzzle-ilustracao': {
      title: 'Puzzle da ilustração',
      description: 'Reconstrói a ilustração original da história.'
    },
    'ordena-historia': {
      title: 'Ordena a história',
      description: 'Põe os acontecimentos pela ordem em que sucederam.'
    }
  };

  const activityRenderers = {
    'encontra-palavra': renderFindWord,
    'fabrica-palavras': renderWordFactory,
    'jogo-memoria': renderMemory,
    'puzzle-ilustracao': renderPuzzle,
    'ordena-historia': renderStoryOrder
  };

  let activities;

  try {
    const data = JSON.parse(dataElement.textContent);
    activities = Array.isArray(data.activities)
      ? data.activities.filter((activity) => activityRenderers[activity.type])
      : [];
  } catch {
    root.textContent = 'Não foi possível preparar estes jogos. Podes voltar à história.';
    return;
  }

  function element(tagName, className, text) {
    const node = document.createElement(tagName);

    if (className) {
      node.className = className;
    }

    if (text !== undefined) {
      node.textContent = text;
    }

    return node;
  }

  function makeButton(label, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;

    if (className) {
      button.className = className;
    }

    return button;
  }

  function makeLiveRegion() {
    const live = element('p', 'play-feedback');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    return live;
  }

  function focusCompletion(completion) {
    completion.tabIndex = -1;
    completion.focus();
  }

  function shuffle(items) {
    const result = [...items];

    for (let index = result.length - 1; index > 0; index -= 1) {
      const otherIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[otherIndex]] = [result[otherIndex], result[index]];
    }

    return result;
  }

  function shuffleOutOfOrder(items, isInOriginalPlace) {
    const shuffled = shuffle(items);

    if (shuffled.length > 1 && shuffled.every(isInOriginalPlace)) {
      shuffled.push(shuffled.shift());
    }

    return shuffled;
  }

  function renderActivityList(focusIndex = null) {
    root.replaceChildren();
    root.append(element('p', 'play-intro', 'Escolhe um jogo. Podes experimentar com calma e voltar quando quiseres.'));

    const groups = [
      ['descobrir', 'Para descobrir'],
      ['aprofundar', 'Para aprofundar']
    ];

    groups.forEach(([level, label]) => {
      const entries = activities
        .map((activity, index) => ({ activity, index }))
        .filter((entry) => entry.activity.level === level);

      if (!entries.length) {
        return;
      }

      const group = element('section', 'play-level');
      group.append(element('h3', 'play-level-title', label));
      const choices = element('div', 'play-choices');

      entries.forEach(({ activity, index }) => {
        const details = activityDetails[activity.type];
        const button = makeButton('', 'play-choice');
        button.dataset.activityIndex = String(index);
        button.append(
          element('strong', 'play-choice-title', details.title),
          element('span', 'play-choice-description', details.description)
        );
        button.addEventListener('click', () => openActivity(activity, index));
        choices.append(button);
      });

      group.append(choices);
      root.append(group);
    });

    if (!activities.length) {
      root.append(element('p', 'play-empty', 'Ainda não há jogos disponíveis para esta história.'));
    }

    if (focusIndex !== null) {
      root.querySelector(`[data-activity-index="${focusIndex}"]`)?.focus();
    }
  }

  function openActivity(activity, activityIndex) {
    root.replaceChildren();

    const backButton = makeButton('← Voltar aos jogos', 'play-back');
    backButton.addEventListener('click', () => renderActivityList(activityIndex));

    const heading = element('h3', 'game-title', activityDetails[activity.type].title);
    const stage = element('div', 'game-stage');
    const live = makeLiveRegion();

    root.append(backButton, heading, stage, live);
    activityRenderers[activity.type](activity, stage, live);
    backButton.focus();
  }

  function unavailable(stage, live) {
    const message = 'Este jogo não ficou completo. Escolhe outro para continuares.';
    stage.replaceChildren(element('p', 'game-instruction', message));
    live.textContent = message;
  }

  function renderFindWord(activity, stage, live) {
    const rounds = Array.isArray(activity.rounds) ? activity.rounds : [];
    let roundIndex = 0;

    if (!rounds.length) {
      unavailable(stage, live);
      return;
    }

    function showRound() {
      const round = rounds[roundIndex];
      const target = String(round.target ?? '');
      const choices = shuffle([target, ...(Array.isArray(round.distractors) ? round.distractors : [])]);

      stage.replaceChildren();
      stage.append(element('p', 'game-instruction', 'Encontra o cartão igual à palavra em destaque.'));

      const model = element('p', 'word-model');
      model.append(element('span', '', target));
      stage.append(model);

      const cards = element('div', 'word-options');

      choices.forEach((choice) => {
        const button = makeButton(String(choice), 'paper-card word-card');
        button.addEventListener('click', () => {
          if (choice !== target) {
            live.textContent = 'Ainda não. Olha outra vez com atenção.';
            return;
          }

          cards.querySelectorAll('button').forEach((card) => {
            card.disabled = true;
          });
          button.classList.add('is-success');

          const context = `Está na história: “${String(round.sentence ?? '')}”`;
          stage.append(element('p', 'story-context is-success', context));

          if (roundIndex < rounds.length - 1) {
            live.textContent = `${context} Quando quiseres, continua.`;
            const nextButton = makeButton('Continuar', 'game-action');
            nextButton.addEventListener('click', () => {
              roundIndex += 1;
              live.textContent = '';
              showRound();
            });
            stage.append(nextButton);
            nextButton.focus();
          } else {
            const message = 'Encontraste todas as palavras.';
            const completion = element('p', 'game-complete is-success', message);
            stage.append(completion);
            live.textContent = `${context} ${message}`;
            focusCompletion(completion);
          }
        });
        cards.append(button);
      });

      stage.append(cards);
    }

    showRound();
  }

  function renderWordFactory(activity, stage, live) {
    const compose = Array.isArray(activity.compose) ? activity.compose : [];
    const recombine = Array.isArray(activity.recombine) ? activity.recombine : [];
    const recombinePool = compose.flatMap((entry) => Array.isArray(entry.syllables) ? entry.syllables : []);
    let phase = 'compose';
    let itemIndex = 0;

    if (!compose.length) {
      unavailable(stage, live);
      return;
    }

    function finish() {
      const message = 'Formaste palavras novas com as sílabas que já conheces.';
      const completion = element('p', 'game-complete is-success', message);
      stage.replaceChildren(completion);
      live.textContent = message;
      focusCompletion(completion);
    }

    function advance() {
      const items = phase === 'compose' ? compose : recombine;
      itemIndex += 1;

      if (itemIndex < items.length) {
        showTask();
        return;
      }

      if (phase === 'compose' && recombine.length) {
        phase = 'recombine';
        itemIndex = 0;
        live.textContent = 'Agora vais formar palavras novas com sílabas que já conheces.';
        showTask();
        return;
      }

      finish();
    }

    function showTask() {
      const item = (phase === 'compose' ? compose : recombine)[itemIndex];
      const expected = Array.isArray(item.syllables) ? item.syllables.map(String) : [];
      const source = phase === 'compose' ? expected : recombinePool.map(String);
      const tokens = shuffle(source.map((value, index) => ({ value, id: `${index}-${value}` })));
      const selected = [];

      if (!expected.length) {
        advance();
        return;
      }

      stage.replaceChildren();
      stage.append(
        element('p', 'game-phase', phase === 'compose' ? 'Compor' : 'Recombinar'),
        element(
          'p',
          'game-instruction',
          phase === 'compose'
            ? 'Escolhe as sílabas pela ordem da palavra-modelo.'
            : 'Usa as sílabas conhecidas para formar esta palavra nova.'
        )
      );

      const model = element('p', 'word-model');
      model.append(element('span', '', String(item.word ?? '')));
      stage.append(model);

      const selection = element('div', 'syllable-selection');
      selection.setAttribute('aria-label', 'Sílabas escolhidas');
      const board = element('div', 'syllable-board');
      board.setAttribute('aria-label', 'Sílabas disponíveis');

      function checkSelection() {
        if (selected.length !== expected.length) {
          return;
        }

        const isCorrect = selected.every((token, index) => token.value === expected[index]);

        if (!isCorrect) {
          live.textContent = 'Ainda não. Olha outra vez com atenção. Podes retirar uma sílaba e tentar de novo.';
          return;
        }

        selection.querySelectorAll('button').forEach((button) => {
          button.disabled = true;
        });
        board.querySelectorAll('button').forEach((button) => {
          button.disabled = true;
        });
        selection.classList.add('is-success');
        live.textContent = `Formaste a palavra ${String(item.word ?? '')}.`;

        const nextButton = makeButton(
          phase === 'compose' && itemIndex === compose.length - 1 && recombine.length
            ? 'Descobrir palavras novas'
            : 'Continuar',
          'game-action'
        );
        nextButton.addEventListener('click', advance);
        stage.append(nextButton);
        nextButton.focus();
      }

      function updateSelection() {
        selection.replaceChildren();

        if (!selected.length) {
          selection.append(element('span', 'selection-placeholder', 'A palavra começa aqui.'));
        }

        selected.forEach((token) => {
          const button = makeButton(token.value, 'syllable-card is-selected');
          button.setAttribute('aria-label', `Retirar a sílaba ${token.value}`);
          button.addEventListener('click', () => {
            selected.splice(selected.indexOf(token), 1);
            live.textContent = `Retiraste a sílaba ${token.value}.`;
            updateSelection();
          });
          selection.append(button);
        });

        board.querySelectorAll('button').forEach((button) => {
          button.disabled = selected.some((token) => token.id === button.dataset.tokenId);
        });
        checkSelection();
      }

      tokens.forEach((token) => {
        const button = makeButton(token.value, 'syllable-card');
        button.dataset.tokenId = token.id;
        button.addEventListener('click', () => {
          if (selected.length >= expected.length) {
            live.textContent = 'A palavra já tem todas as sílabas. Retira uma para mudares a ordem.';
            return;
          }

          selected.push(token);
          live.textContent = `Juntaste a sílaba ${token.value}.`;
          updateSelection();
        });
        board.append(button);
      });

      stage.append(selection, board);
      updateSelection();
    }

    showTask();
  }

  function renderMemory(activity, stage, live) {
    const pairs = Array.isArray(activity.pairs) ? activity.pairs : [];
    const cards = shuffle(pairs.flatMap((pair, pairIndex) => [
      { id: `${pairIndex}-a`, pairIndex, text: String(pair.a ?? '') },
      { id: `${pairIndex}-b`, pairIndex, text: String(pair.b ?? '') }
    ]));
    const faceUp = new Set();
    const matched = new Set();
    let waitingToTurn = false;

    if (!pairs.length) {
      unavailable(stage, live);
      return;
    }

    function showBoard(focusCard = null) {
      stage.replaceChildren(element('p', 'game-instruction', 'Vira duas cartas e procura o par. Não há limite de tentativas.'));
      const board = element('div', 'memory-board');

      cards.forEach((card, index) => {
        const isVisible = faceUp.has(card.id) || matched.has(card.pairIndex);
        const button = makeButton(isVisible ? card.text : '?', 'memory-card paper-card');
        button.dataset.cardIndex = String(index);
        button.setAttribute('aria-pressed', String(isVisible));
        button.setAttribute(
          'aria-label',
          isVisible ? `Carta ${index + 1}: ${card.text}` : `Carta ${index + 1}, virada para baixo`
        );
        button.disabled = matched.has(card.pairIndex);
        button.classList.toggle('is-face-up', isVisible);
        button.classList.toggle('is-success', matched.has(card.pairIndex));
        button.addEventListener('click', () => turnCard(card, index));
        board.append(button);
      });

      stage.append(board);

      if (waitingToTurn) {
        const turnAgain = makeButton('Virar novamente', 'game-action');
        turnAgain.addEventListener('click', () => {
          const firstFaceUpId = faceUp.values().next().value;
          const firstFaceUpIndex = cards.findIndex((card) => card.id === firstFaceUpId);
          faceUp.clear();
          waitingToTurn = false;
          live.textContent = 'As cartas estão novamente viradas para baixo.';
          showBoard(firstFaceUpIndex);
        });
        stage.append(turnAgain);
        turnAgain.focus();
      }

      if (matched.size === pairs.length) {
        const message = 'Encontraste todos os pares. Podes voltar aos jogos quando quiseres.';
        const completion = element('p', 'game-complete is-success', message);
        stage.append(completion);
        live.textContent = message;
        focusCompletion(completion);
      } else if (focusCard !== null) {
        stage.querySelector(`[data-card-index="${focusCard}"]`)?.focus();
      }
    }

    function turnCard(card, cardIndex) {
      if (waitingToTurn || faceUp.has(card.id) || matched.has(card.pairIndex)) {
        return;
      }

      faceUp.add(card.id);

      if (faceUp.size < 2) {
        live.textContent = `Viraste a carta ${card.text}. Escolhe mais uma.`;
        showBoard(cardIndex);
        return;
      }

      const [firstId, secondId] = [...faceUp];
      const first = cards.find((candidate) => candidate.id === firstId);
      const second = cards.find((candidate) => candidate.id === secondId);

      if (first.pairIndex === second.pairIndex) {
        matched.add(first.pairIndex);
        faceUp.clear();
        live.textContent = 'Encontraste um par.';
        const nextCardIndex = cards.findIndex((candidate) => !matched.has(candidate.pairIndex));
        showBoard(nextCardIndex >= 0 ? nextCardIndex : null);
        return;
      }

      waitingToTurn = true;
      live.textContent = 'Ainda não. Olha outra vez com atenção. Quando estiveres pronto, vira as cartas novamente.';
      showBoard();
    }

    showBoard();
  }

  function renderPuzzle(activity, stage, live) {
    const columns = Number(activity.grid?.[0]);
    const rows = Number(activity.grid?.[1]);
    const image = String(activity.image ?? '');
    const pieceCount = columns * rows;

    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || !image.startsWith('/')) {
      unavailable(stage, live);
      return;
    }

    const pieces = shuffleOutOfOrder(
      Array.from({ length: pieceCount }, (_, index) => index),
      (piece, index) => piece === index
    );
    let selectedIndex = null;
    let complete = false;

    function showPuzzle(focusIndex = null) {
      stage.replaceChildren(element('p', 'game-instruction', 'Escolhe duas peças para trocares os seus lugares. Usa as setas para percorrer a grelha e Enter para escolher.'));
      const board = element('div', 'puzzle-board');
      board.style.setProperty('--puzzle-columns', String(columns));
      board.style.setProperty('--puzzle-ratio', `${columns} / ${rows}`);

      pieces.forEach((piece, index) => {
        const pieceColumn = piece % columns;
        const pieceRow = Math.floor(piece / columns);
        const x = columns === 1 ? 0 : (pieceColumn / (columns - 1)) * 100;
        const y = rows === 1 ? 0 : (pieceRow / (rows - 1)) * 100;
        const button = makeButton('', 'puzzle-piece');

        button.dataset.pieceIndex = String(index);
        button.setAttribute('aria-label', `Peça na posição ${index + 1} de ${pieceCount}`);
        button.setAttribute('aria-pressed', String(selectedIndex === index));
        button.style.backgroundImage = `url("${image}")`;
        button.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
        button.style.backgroundPosition = `${x}% ${y}%`;
        button.disabled = complete;
        button.classList.toggle('is-selected', selectedIndex === index);
        button.addEventListener('click', () => choosePiece(index));
        button.addEventListener('keydown', (event) => movePuzzleFocus(event, index, board));
        board.append(button);
      });

      stage.append(board);

      if (complete) {
        const credit = String(activity.credit ?? 'autoria não identificada');
        const caption = `Esta é a ilustração original de ${credit}.`;
        const completion = element('p', 'puzzle-caption is-success', caption);
        stage.append(completion);
        live.textContent = caption;
        focusCompletion(completion);
      } else if (focusIndex !== null) {
        board.querySelector(`[data-piece-index="${focusIndex}"]`)?.focus();
      }
    }

    function choosePiece(index) {
      if (selectedIndex === null) {
        selectedIndex = index;
        live.textContent = 'Escolheste uma peça. Escolhe outra para as trocares.';
        showPuzzle(index);
        return;
      }

      if (selectedIndex === index) {
        selectedIndex = null;
        live.textContent = 'A peça deixou de estar escolhida.';
        showPuzzle(index);
        return;
      }

      [pieces[selectedIndex], pieces[index]] = [pieces[index], pieces[selectedIndex]];
      selectedIndex = null;
      complete = pieces.every((piece, pieceIndex) => piece === pieceIndex);
      live.textContent = complete
        ? 'A ilustração ficou completa.'
        : 'As peças trocaram de lugar. Continua a observar a ilustração.';
      showPuzzle(index);
    }

    function movePuzzleFocus(event, index, board) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      let nextIndex = index;

      if (event.key === 'ArrowLeft' && column > 0) nextIndex -= 1;
      if (event.key === 'ArrowRight' && column < columns - 1) nextIndex += 1;
      if (event.key === 'ArrowUp' && row > 0) nextIndex -= columns;
      if (event.key === 'ArrowDown' && row < rows - 1) nextIndex += columns;

      if (nextIndex !== index) {
        event.preventDefault();
        board.querySelector(`[data-piece-index="${nextIndex}"]`)?.focus();
      }
    }

    showPuzzle();
  }

  function renderStoryOrder(activity, stage, live) {
    const sentences = Array.isArray(activity.sentences) ? activity.sentences.map(String) : [];
    const ordered = shuffleOutOfOrder(
      sentences.map((text, originalIndex) => ({ text, originalIndex })),
      (sentence, index) => sentence.originalIndex === index
    );
    let complete = false;

    if (sentences.length < 2) {
      unavailable(stage, live);
      return;
    }

    function moveSentence(index, direction) {
      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= ordered.length) {
        return;
      }

      [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
      live.textContent = direction < 0 ? 'Moveste a frase para cima.' : 'Moveste a frase para baixo.';
      showSentences(nextIndex, direction);
    }

    function checkOrder() {
      complete = ordered.every((sentence, index) => sentence.originalIndex === index);

      if (!complete) {
        live.textContent = 'Ainda não. Olha outra vez com atenção.';
        return;
      }

      live.textContent = 'A história está pela ordem certa.';
      showSentences();
    }

    function showSentences(focusIndex = null, focusDirection = null) {
      stage.replaceChildren(element('p', 'game-instruction', 'Move as frases até os acontecimentos ficarem pela ordem da história.'));
      const list = element('ol', 'story-order-list');

      ordered.forEach((sentence, index) => {
        const item = element('li', 'story-order-item');
        item.append(element('p', 'story-order-sentence', sentence.text));

        const controls = element('div', 'story-order-controls');
        const up = makeButton('↑', 'move-button');
        const down = makeButton('↓', 'move-button');
        up.dataset.moveIndex = String(index);
        up.dataset.direction = 'up';
        down.dataset.moveIndex = String(index);
        down.dataset.direction = 'down';
        up.setAttribute('aria-label', `Mover a frase ${index + 1} para cima`);
        down.setAttribute('aria-label', `Mover a frase ${index + 1} para baixo`);
        up.disabled = complete || index === 0;
        down.disabled = complete || index === ordered.length - 1;
        up.addEventListener('click', () => moveSentence(index, -1));
        down.addEventListener('click', () => moveSentence(index, 1));
        controls.append(up, down);
        item.append(controls);
        list.append(item);
      });

      stage.append(list);

      if (complete) {
        const summary = element('div', 'story-summary is-success');
        summary.append(
          element('h4', '', 'A história, por ordem'),
          element('p', '', ordered.map((sentence) => sentence.text).join(' '))
        );
        stage.append(summary);
        focusCompletion(summary);
      } else {
        const checkButton = makeButton('Ver a ordem', 'game-action');
        checkButton.addEventListener('click', checkOrder);
        stage.append(checkButton);
      }

      if (focusIndex !== null) {
        stage.querySelector(
          `[data-move-index="${focusIndex}"][data-direction="${focusDirection < 0 ? 'up' : 'down'}"]`
        )?.focus();
      }
    }

    showSentences();
  }

  renderActivityList();
})();

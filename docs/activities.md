# Atividades pedagógicas por história ("Brincar")

Espec fechada para o gerador de atividades e para a UI dos jogos. Fundamentos pedagógicos: MEM / aprendizagem funcional da leitura e da escrita (Niza, Alves Martins, Camps, Colomer; wiki do vault: "Ensino da Leitura e da Escrita", "Método das 28 Palavras").

## Princípios (não negociáveis)

1. **Sentido antes de técnica.** Todas as atividades partem da história que a criança acabou de ler ou ouvir. As palavras dos jogos vêm do texto da história (ou do glossário). Nunca usar listas de palavras genéricas.
2. **Voltar ao texto.** Sempre que possível, a atividade devolve a criança à história ("esta palavra está na história — procura-a"). O jogo não substitui a leitura; prolonga-a.
3. **Generalização, não repetição.** O critério de sucesso do trabalho silábico é ler/formar palavras *novas* com sílabas conhecidas, não memorizar formas. O jogo de sílabas inclui sempre uma fase de recombinação.
4. **Sem gamificação de pontos.** Proibido: pontuações, cronómetros, estrelas, rankings, mascotes. Feedback intrínseco e caloroso: a palavra completa-se, a ilustração recompõe-se, a frase ganha sentido. Erro tratado com serenidade ("Ainda não. Olha outra vez com atenção.") e nova tentativa ilimitada.
5. **Dois níveis, sem rótulos de idade na UI.** Nível `descobrir` (leitura global, sílabas, memória — iniciação, ~6-8) e nível `aprofundar` (ordenação da história, palavras novas, glossário — fluência/compreensão, ~8-10). Na UI os níveis aparecem como agrupamento visual suave, nunca como "para pequenos/grandes".
6. **Funciona sem som, sem rato e sem animação.** Teclado completo, foco visível, `aria-live` para feedback, `prefers-reduced-motion` respeitado, alvos ≥ 44px. Sem áudio obrigatório em nenhum passo.
7. **Honestidade de proveniência.** O bloco Brincar declara: "Jogos criados a partir do texto recuperado desta história. Não faziam parte do site original."

## Tipos de atividade

### 1. `encontra-palavra` — leitura global (descobrir)
Reconhecimento global de palavras da história entre distratores visualmente próximos.
- 4 rondas. Em cada ronda: palavra-modelo em destaque (tipografia grande) + 4 cartões; um é a palavra igual, os 3 distratores são palavras reais da mesma história com forma parecida (mesma letra inicial ou comprimento ±1) — nunca pseudo-palavras.
- Ao acertar: a palavra insere-se numa frase real da história onde ocorre, apresentada de imediato ("Está na história: '…frase…'").

### 2. `fabrica-palavras` — sílabas e recombinação (descobrir)
Ciclo do global ao silábico, como no Método das 28 Palavras bem implementado.
- Fase A (compor): 3 palavras da história, uma de cada vez, com as sílabas baralhadas em cartões; a criança ordena as sílabas para formar a palavra (a palavra-modelo é visível — é composição guiada, não adivinha).
- Fase B (recombinar/generalizar): com as sílabas das palavras da fase A disponíveis num "tabuleiro", propõem-se 2-3 palavras novas formáveis com essas sílabas (pré-calculadas pelo gerador, validadas contra lexicón pt-PT). A criança forma-as. Texto de fecho: "Formaste palavras novas com as sílabas que já conheces."

### 3. `jogo-memoria` — memória (descobrir e aprofundar)
- Nível descobrir: 6 cartas = 3 pares palavra↔palavra (mesma palavra, reforço da forma global).
- Nível aprofundar (só se a história tem glossário com ≥4 entradas válidas): 8 cartas = 4 pares termo↔significado do glossário.
- Cartas viradas com clique/Enter; sem limite de tentativas; ao terminar, mensagem calma.

### 4. `puzzle-ilustracao` — puzzle (descobrir)
A ilustração original recuperada cortada em grelha 3×2. Recomposição por troca de peças (clicar duas peças troca-as; teclado: setas + Enter). Só existe se a história tem ilustração local recuperada. Legenda ao completar: "Esta é a ilustração original de {ilustrador}."

### 5. `ordena-historia` — compreensão/macroprocessos (aprofundar)
3 a 5 frases-chave da história (extraídas na ordem do texto), baralhadas; a criança ordena-as pela ordem dos acontecimentos. Ao completar, as frases leem-se de seguida como resumo. Só para histórias com ≥3 parágrafos com frases utilizáveis.

## Modelo de dados

`data/activities/MM-DD.json` (um por história com texto legível):

```json
{
  "id": "01-01",
  "generatedFrom": "recovered-text",
  "generatorVersion": 1,
  "activities": [
    {
      "type": "encontra-palavra",
      "level": "descobrir",
      "rounds": [
        { "target": "moleiro", "distractors": ["moinho", "moeda", "molhado"], "sentence": "…um moleiro, todo enfarinhado…" }
      ]
    },
    {
      "type": "fabrica-palavras",
      "level": "descobrir",
      "compose": [ { "word": "farinha", "syllables": ["fa", "ri", "nha"] } ],
      "recombine": [ { "word": "faca", "syllables": ["fa", "ca"] } ]
    },
    {
      "type": "jogo-memoria",
      "level": "descobrir",
      "pairs": [ { "a": "moinho", "b": "moinho" } ]
    },
    {
      "type": "jogo-memoria",
      "level": "aprofundar",
      "pairs": [ { "a": "zaragata", "b": "confusão ou briga" } ]
    },
    {
      "type": "puzzle-ilustracao",
      "level": "descobrir",
      "image": "/assets/01-01/illustration-original.jpg",
      "grid": [3, 2],
      "credit": "Cristina Malaquias"
    },
    {
      "type": "ordena-historia",
      "level": "aprofundar",
      "sentences": ["Primeira frase…", "Frase do meio…", "Frase final…"]
    }
  ]
}
```

Regras do gerador:
- Só gera para histórias cujo `textSegments` não seja placeholder (`layer != "archive-placeholder"`).
- Cada atividade só é incluída se os dados a suportarem (ex.: sem glossário → sem memória aprofundar; sem ilustração local → sem puzzle). Mínimo para publicar o bloco: 2 atividades.
- Seleção de palavras significativas: palavras de conteúdo (excluir stopwords pt), 4-9 letras, sem nomes próprios se possível, priorizar as que ocorrem ≥2 vezes ou constam do glossário; determinístico (ordenação estável, sem aleatoriedade — o baralhar acontece na UI em runtime).
- Silabificação pt-PT por algoritmo determinístico (regras de divisão silábica do português europeu; tratar dígrafos nh/lh/ch/rr/ss/qu/gu, grupos consonânticos pr/br/tr/…, ditongos). Palavras com hífen, apóstrofo ou irregulares que o algoritmo não cubra com confiança são excluídas — preferir menos palavras a sílabas erradas.
- `recombine`: validar palavras novas contra o lexicón do corpus — a união de todas as palavras (normalizadas, minúsculas) que ocorrem nos `textSegments` legíveis das 366 histórias, construída em memória pelo gerador. Assim, as "palavras novas" pertencem sempre ao universo vocabular das histórias; nunca inventar nem usar listas externas.
- Frases para `encontra-palavra`/`ordena-historia`: frases completas do texto com 40-140 caracteres; truncagem com "…" apenas nas extremidades.

## Integração no site

- `render.mjs`: se existir `data/activities/{id}.json`, a página da história ganha `<section id="brincar" class="play-corner">` após o glossário, com os dados embebidos em `<script type="application/json" id="activities-data">` (JSON escapado: `</` → `<\/`).
- `src/site/public/brincar.js` (novo, carregado com `defer` apenas nas páginas com atividades): lê o JSON embebido e constrói os jogos no DOM. Sem dependências externas. O baralhar usa aleatoriedade em runtime.
- Sem JS: o bloco mostra `<noscript>` com sugestão de brincar no papel (ex.: "Imprime a história e rodeia as palavras que já conheces.") e os jogos não aparecem quebrados.
- Estética: tokens OKLCH do DESIGN.md (papel, âmbar para ação, verde-recuperação para sucesso suave), cartões com sombra de papel, cantos suaves; nada de cores saturadas de "app de jogos".
- Homepage e arquivo não mudam (o Brincar vive na página da história); apenas um link-âncora "Brincar" pode aparecer nas ações da história.

Limitação conhecida (aceite por agora): o texto recuperado é anterior ao AO90; palavras com grafia pré-acordo (ex.: "director", "insectos") podem entrar nos jogos de sílabas tal como estão no original. A proveniência honesta cobre o texto; uma filtragem AO90 nos jogos fica para iteração futura se se justificar.

## Testes exigidos

- Unitários da silabificação (casos: nh/lh/ch, rr/ss, qu/gu, ditongos, hiatos comuns, grupos consonânticos; ex.: mo-lei-ro, fa-ri-nha, car-vo-ei-ro ou exclusão se ambíguo, ga-li-nha, quei-jo, pás-sa-ro).
- Unitários do gerador (histórias com/sem glossário, com/sem ilustração, placeholder → sem ficheiro; mínimo 2 atividades; determinismo: duas execuções → mesmo output).
- Render: página com atividades contém `#brincar` e JSON válido; página sem atividades não contém `#brincar`; JSON embebido resiste a `</script>` no conteúdo.
- Acessibilidade estática: todos os controlos dos jogos são `<button>` ou têm role/tabindex corretos (verificável por teste de string no HTML gerado do template).

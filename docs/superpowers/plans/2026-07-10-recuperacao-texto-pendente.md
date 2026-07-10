# Recuperação de Texto Pendente — Plano de Implementação

> **Para agentes:** executar este plano nesta sessão, passo a passo, sem commits nem push, conforme a restrição explícita da tarefa.

**Objetivo:** Recuperar ou marcar honestamente o texto das 133 histórias inventariadas, validar a qualidade, regenerar atividades e deixar testes e build verdes.

**Arquitetura:** Um único módulo ESM lê o inventário e atualiza cada história de forma determinística. A rota PDF invoca `pdftotext -layout` página a página e passa cada página por funções puras de limpeza/validação; a rota HTML reutiliza `parseStoryPage`; qualquer fonte que falhe é convertida para o mesmo estado `text-lost` usado pela rota `missing`.

**Tecnologia:** Node.js ESM, `node:test`, Poppler `pdftotext`, JSON existente do projeto.

## Restrições globais

- Não adicionar dependências.
- Não apagar assets nem ficheiros de arquivo.
- Não fazer commit nem push.
- Preservar campos não relacionados das histórias.
- Produzir escrita idempotente e determinística com JSON formatado a dois espaços e newline final.

---

### Tarefa 1: Contrato testado da limpeza de PDF

**Ficheiros:**
- Criar: `tests/fixtures/recovery/pdf-page-layout.txt`
- Criar: `tests/recovery/extract-pending-text.test.mjs`
- Criar: `src/recovery/extract-pending-text.mjs`

**Interface:**
- `cleanPdfPage(text, { title, author }) -> string[]`
- `validateParagraphs(paragraphs) -> { valid: boolean, issues: string[] }`

- [ ] Criar uma fixture representativa com título, créditos, capitular separada, parágrafos quebrados, hifenização, número de página e rodapé.
- [ ] Criar testes que exijam remoção do lixo e reconstrução fiel dos parágrafos.
- [ ] Executar `node --test tests/recovery/extract-pending-text.test.mjs` e confirmar falha por módulo em falta.
- [ ] Implementar apenas as funções puras necessárias.
- [ ] Repetir o teste focado até ficar verde.

### Tarefa 2: Orquestração das três rotas

**Ficheiros:**
- Modificar: `src/recovery/extract-pending-text.mjs`
- Modificar: `src/recovery/parse-story-page.mjs` apenas se for necessária uma exportação do parser já existente.
- Modificar: `package.json`

**Interface:**
- `extractPendingText(options?) -> resumo serializável`
- CLI: `npm run extract:pending-text`

- [ ] Ler e ordenar as entradas do inventário por `id`.
- [ ] Para PDF, extrair uma página de cada vez com `pdftotext -layout`, limpar, validar e criar layers `pdf-page-N`.
- [ ] Para HTML, ler em `latin1`, chamar `parseStoryPage`, agregar apenas os parágrafos narrativos e criar um layer `archive-html`.
- [ ] Para `missing` ou falha validada, gravar exatamente a mensagem pedida no layer `archive-missing`.
- [ ] Atualizar apenas `textSegments`, campos de recuperação/proveniência/notas pedidos e anular os PDF anti-bot de `04-18`.
- [ ] Acrescentar `extract:pending-text` ao `package.json`.

### Tarefa 3: Execução, auditoria e correções orientadas à causa

**Ficheiros:**
- Gerados: `data/stories/*.json`

- [ ] Executar `npm run extract:pending-text` e guardar o resumo/exit code.
- [ ] Executar o modo de validação automática sobre todos os resultados e guardar o resumo/exit code.
- [ ] Inspecionar cinco PDF e cinco HTML, comparando os dois primeiros parágrafos com a fonte.
- [ ] Corrigir apenas problemas reproduzidos; se uma fonte continuar inválida, reclassificá-la como `text-lost` com justificação.
- [ ] Reexecutar a extração para provar idempotência por ausência de diff adicional.

### Tarefa 4: Atividades e verificação global

**Ficheiros:**
- Regenerados: `data/activities/*.json`

- [ ] Executar `npm run generate:activities` e contar `data/activities/*.json`.
- [ ] Executar `npm test` e diagnosticar qualquer falha antes de repetir.
- [ ] Executar `npm run build` e diagnosticar qualquer falha antes de repetir.
- [ ] Auditar as contagens finais, `04-18`, ficheiros alterados e ausência de commits.
- [ ] Produzir o relatório AO90 com contagens, dez amostras, falhas e a evidência comando → resultado/exit code.

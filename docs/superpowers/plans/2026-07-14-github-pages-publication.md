# Publicação no GitHub Pages

**Objetivo:** publicar a edição ilustrada em `https://atilasos.github.io/hisdodia/`, com licença CC BY-SA 4.0 e identificação clara do conteúdo gerado com IA.

## 1. Tornar os URLs compatíveis com um project site

- Alterar `src/site/render.mjs` para aceitar `basePath` e usar `SITE_BASE_PATH` no comando de build.
- Prefixar apenas URLs locais (`/styles.css`, histórias, arquivos, imagens, áudio e PDF); preservar URLs externas e a segurança existente.
- Acrescentar primeiro testes em `tests/site/render.test.mjs` para o prefixo `/hisdodia` e executar o teste para confirmar a falha esperada antes da implementação.

## 2. Declarar licença, proveniência e uso de IA

- Acrescentar um aviso global no rodapé e uma nota específica na edição ilustrada.
- Aplicar CC BY-SA 4.0 aos textos e novas ilustrações do projeto, sem pretender relicenciar materiais históricos recuperados ou de terceiros.
- Criar `LICENSE.md` com atribuição, âmbito e link para o texto legal oficial.
- Cobrir a redação e os links com testes de renderização.

## 3. Configurar a publicação automatizada

- Criar `.github/workflows/pages.yml` usando o fluxo oficial de artefactos do GitHub Pages.
- Obter o caminho base dinamicamente de `actions/configure-pages` e passá-lo ao build.
- Executar os testes no workflow antes de construir e publicar `dist/`.
- Acrescentar um teste estrutural simples do workflow, sem novas dependências.

## 4. Verificar e publicar

- Executar `npm test`, `npm run build` com `SITE_BASE_PATH=/hisdodia` e inspeções dos URLs, licença e identificação de IA.
- Confirmar que não há ficheiros individuais acima do limite do GitHub e registar o tamanho do artefacto.
- Criar o repositório público `atilasos/hisdodia`, enviar a branch, integrar na `main` e ativar Pages com `build_type=workflow`.
- Acompanhar a execução do GitHub Actions até terminar e testar por HTTP a página inicial, o arquivo, uma história e um recurso estático.

# Edição Ilustrada Contemporânea — Especificação

## Objetivo

Transformar as 366 histórias numa edição digital ilustrada com ritmo de livro infantil. Cada história combina texto HTML acessível com uma abertura ilustrada e duas a cinco cenas adicionais. As novas imagens devem preservar a identidade calorosa, delicada e artesanal do arquivo sem serem apresentadas como obras da ilustradora original.

O projeto abrange todas as histórias, incluindo as que já têm ilustração recuperada. Os originais permanecem disponíveis numa vista histórica separada e conservam os respetivos créditos e metadados de proveniência.

## Restrições aprovadas

- Gerar as imagens através das ferramentas disponíveis na conta Codex, sem exigir uma chave de API separada.
- Usar `gpt-5.6-luna`, com raciocínio baixo, para planeamento de cenas, fichas visuais, prompts, texto alternativo, metadados e coordenação do processamento.
- Usar a ferramenta de geração e edição de imagem do Codex para produzir os bitmaps.
- Não introduzir seleção, correção ou aprovação editorial manual no processo normal.
- Usar imagens pequenas e comprimidas para limitar armazenamento, transferência e recursos de geração.
- Manter todo o texto narrativo em HTML; não incluir parágrafos, títulos, legendas ou logótipos dentro das imagens.
- Não adicionar dependências sem autorização.
- Preservar os materiais originais recuperados e distingui-los claramente da nova edição.

## Direção artística

A nova edição deve partilhar uma gramática visual com o acervo, sem pedir ao gerador que copie literalmente a assinatura de Cristina Malaquias ou de outro ilustrador. A gramática é definida por características observáveis:

- aguarela suave com textura de lápis e papel;
- contornos finos, irregulares e pouco digitais;
- paleta clara, concentrando a cor em personagens e objetos narrativos;
- fundos incompletos e uso generoso de espaço negativo;
- anatomia expressiva e ligeiramente caricatural;
- humor visual delicado e personagens emotivas;
- ausência de acabamento 3D, brilho publicitário, realismo fotográfico ou estética de aplicação infantil genérica.

Cada história começa com uma imagem de abertura. Essa imagem estabelece a aparência das personagens, roupa, objetos recorrentes, ambiente e paleta. As restantes cenas usam a abertura e a ficha visual da história como referências de continuidade.

As imagens novas recebem o crédito “Edição ilustrada contemporânea gerada com IA”. Os materiais recuperados mantêm o crédito original e nunca são atribuídos ao sistema de geração.

## Arquitetura de produção

O processamento ocorre por história e em lotes pequenos. Cada execução é retomável e segue esta sequência:

1. Ler os segmentos de texto da história.
2. Escolher automaticamente entre três e seis momentos visuais, incluindo a abertura.
3. Criar uma ficha visual com personagens, aparência, ambiente, objetos recorrentes, paleta e descrição das cenas.
4. Gerar a abertura.
5. Gerar entre duas e cinco cenas adicionais usando a abertura e a ficha visual como referências.
6. Validar tecnicamente os ficheiros gerados.
7. Pedir à ferramenta de imagem a menor resolução e qualidade que disponibilizar; depois redimensionar os ficheiros válidos para um máximo de 768 px no lado maior e comprimi-los para WebP com qualidade 72 e limite de 200 KB por imagem.
8. Escrever os metadados da edição ilustrada no registo da história.

Os prompts e as fichas visuais são guardados para tornar o processo auditável e permitir regeneração explícita no futuro. Por omissão, um ficheiro existente e tecnicamente válido nunca é gerado novamente.

## Modelo de dados

Cada história recebe uma propriedade `illustratedEdition`:

```json
{
  "illustratedEdition": {
    "status": "complete",
    "credit": "Edição ilustrada contemporânea gerada com IA",
    "artDirectionVersion": "1",
    "planningModel": "gpt-5.6-luna",
    "visualBrief": "/assets/01-01/illustrated/brief.json",
    "scenes": [
      {
        "id": "opening",
        "status": "complete",
        "attempts": 1,
        "after": null,
        "layout": "opening",
        "image": "/assets/01-01/illustrated/opening.webp",
        "alt": "Dois rapazes e os pais encontram-se numa estrada entre farinha e carvão."
      }
    ]
  }
}
```

O `status` da edição aceita `pending`, `planning`, `generating`, `complete` ou `failed`. Uma edição fica `failed` apenas se não for possível produzir o plano ou a abertura; falhas em cenas posteriores não impedem a conclusão da edição.

Cada cena tem um identificador estável, `status` (`pending`, `generating`, `complete` ou `failed`), número de tentativas, ponto de inserção, um dos layouts permitidos, caminho da imagem e texto alternativo conciso. `after` é `null` apenas para a abertura. Nas restantes cenas, é um objeto com os índices de base zero `segment` e `paragraph`, permitindo inserir imagens dentro de histórias recuperadas como um único segmento longo.

Exemplo de ponto de inserção: `"after": { "segment": 0, "paragraph": 2 }` coloca a cena depois do terceiro parágrafo do primeiro segmento.

O ficheiro referido por `visualBrief` contém a ficha de continuidade, descrições das cenas, prompts, identificadores de geração e erros técnicos. Não contém credenciais nem outros dados sensíveis.

## Experiência de leitura

A página da história oferece duas vistas:

- **Edição ilustrada**, selecionada por omissão.
- **Original recuperado**, quando existem materiais históricos.

A edição ilustrada intercala imagens e texto através de quatro composições:

- **Abertura:** título e créditos ao lado da imagem principal.
- **Dupla página:** imagem larga seguida de um bloco narrativo curto.
- **Marginal:** ilustração pequena à esquerda ou à direita de um a três parágrafos.
- **Vinheta:** imagem compacta entre dois momentos da narrativa.

O planeamento associa cada cena a um segmento e guarda o layout no JSON. A renderização não toma decisões criativas adicionais. Em ecrãs largos, texto e imagem podem partilhar uma linha; em ecrãs estreitos, passam para uma coluna e mantêm a ordem narrativa. O texto assenta sempre em superfícies de papel legíveis, nunca diretamente sobre uma zona complexa da imagem.

A narração, o glossário, as atividades e a proveniência continuam disponíveis, mas ficam fora do fluxo narrativo principal. A vista original apresenta os recursos recuperados, os créditos históricos e os estados de proveniência já existentes.

## Falhas e retoma

- Uma cena tem uma tentativa normal e uma segunda tentativa apenas quando ocorre uma falha técnica.
- São falhas técnicas: ausência de ficheiro, ficheiro vazio, formato ilegível, dimensões inválidas ou erro da ferramenta de geração.
- Variações estéticas, pequenas mudanças de continuidade e escolhas visuais discutíveis não provocam regeneração automática.
- Se uma cena falhar duas vezes, é marcada como falhada e omitida do layout; o texto da história continua integralmente disponível.
- Uma história fica `complete` depois de todas as cenas planeadas terminarem como `complete` ou `failed`. Fica `failed` se o planeamento ou a abertura falhar após duas tentativas.
- Interrupções ou limites temporários da conta deixam a história no último estado persistido. Uma execução posterior retoma na primeira cena incompleta.
- O processamento não substitui imagens existentes sem uma opção explícita de regeneração.

## Verificação

Os testes automatizados devem verificar:

- planeamento de três a seis cenas por história;
- presença obrigatória de uma abertura;
- associação das restantes cenas a pares válidos de segmento e parágrafo;
- validação do esquema e dos caminhos de recursos;
- renderização dos quatro layouts;
- ordem narrativa em ecrãs largos e estreitos;
- fallback quando uma imagem ou uma edição inteira está ausente;
- preservação da vista original, créditos e proveniência;
- validação, redimensionamento e compressão dos ficheiros;
- retoma sem duplicação depois de uma interrupção;
- omissão segura de uma cena após duas falhas técnicas.

Antes do lote completo, o fluxo é executado em três histórias com comprimentos e estruturas diferentes:

- `01-01`, uma história média dividida em três segmentos e com ilustração original recuperada;
- `08-20`, uma história longa dividida em vinte segmentos;
- `09-28`, uma história longa recuperada como um único segmento com muitos parágrafos.

Este piloto valida apenas geração, armazenamento, esquema, layout, compressão e retoma. Não introduz uma etapa de seleção estética.

## Critérios de sucesso

- As 366 histórias podem receber uma edição com três a seis ilustrações sem operação manual por cena.
- O leitor apresenta texto real, acessível e selecionável numa sequência que se aproxima de um livro ilustrado.
- As personagens e a paleta mantêm continuidade razoável dentro de cada história através da abertura e da ficha visual.
- Nenhuma falha de imagem impede a leitura do texto, a audição da narração ou o acesso ao arquivo.
- As imagens novas e originais são sempre distinguíveis por vista, crédito e proveniência.
- O processo pode ser interrompido e retomado sem regenerar trabalho válido.

## Fora de âmbito

- Garantia de qualidade artística ou continuidade perfeita sem revisão humana.
- Imitação literal da assinatura visual de uma pessoa específica.
- Alteração dos textos das histórias.
- Substituição ou remoção dos recursos históricos recuperados.
- Impressão, exportação para EPUB ou criação de aplicações nativas.
- Publicação ou deploy em produção.

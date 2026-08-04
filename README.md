🌐 **README:** **Português (BR)** · [English](./README.en.md) · [中文](./README.zh-CN.md)

> Fork pessoal do [yuanbw2025/storyforge](https://github.com/yuanbw2025/storyforge), mantido para uso próprio; a única adição em relação ao original é a camada de internacionalização (pt-BR / zh-CN).

---

# StoryForge · Forja de Histórias

> Oficina de criação literária com IA. Puramente front-end, prioridade local, prompts totalmente transparentes — para que o autor tenha controle total sobre toda a cadeia criativa, da inspiração, ambientação e esboço até o texto final, revisão e exportação.

**Comunicação e tutoriais**

- GitHub: https://github.com/yuanbw2025/storyforge
- Página pessoal do autor original: https://yuanbw.vercel.app/
- Perfil do autor no Zhihu: https://www.zhihu.com/people/dan-ran-xing-yuan-59
- Coluna de documentação no Zhihu: https://zhuanlan.zhihu.com/p/2038714210188780594
- Vídeo explicativo do projeto no Bilibili: https://www.bilibili.com/video/BV1q37j6QExh/
- Grupo de discussão no QQ: 1082374587

---

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-5-brown)
![Dexie](https://img.shields.io/badge/Dexie.js-IndexedDB-orange)
![TipTap](https://img.shields.io/badge/TipTap-Editor-purple)
![PWA](https://img.shields.io/badge/PWA-Offline-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## Resumo (TL;DR)

**StoryForge** é uma oficina de escrita com IA, local-first e baseada no navegador, voltada para ficção longa.

- **Local por padrão**: os dados do manuscrito ficam no IndexedDB do navegador. Chamadas de IA, backup em nuvem ou proxy/base URL personalizados enviam apenas o conteúdo relevante ao serviço de terceiros configurado pelo usuário.
- **Traga sua própria IA**: compatível com diversos provedores no padrão OpenAI, Anthropic Claude, Gemini, modelos locais e endpoints personalizados.
- **Sem caixa-preta**: prompts são visíveis, editáveis, clonáveis, parametrizáveis e reutilizáveis.
- **Feito para histórias longas**: ambientação multi-mundo, arcos narrativos, foreshadowing, cartões de estado, livro de registros de itens, fatos temporais, memória de recuperação, revisão de capítulos, aprendizado de estilo e fluxos de exportação/backup.

```bash
npm install
npm run dev      # http://localhost:1111/storyforge/
npm run ci       # schema checks + AI manual check + architecture check + typecheck + coverage + build
```

Leia [CONTRIBUTING.md](./CONTRIBUTING.md) antes de contribuir.

---

## Índice

- [Posicionamento do projeto](#posicionamento-do-projeto)
- [Capacidades principais](#capacidades-principais)
- [Visão geral das funcionalidades](#visão-geral-das-funcionalidades)
- [IA e sistema de prompts](#ia-e-sistema-de-prompts)
- [Dados e fronteiras de segurança](#dados-e-fronteiras-de-segurança)
- [Arquitetura técnica](#arquitetura-técnica)
- [Início rápido](#início-rápido)
- [Desenvolvimento e validação](#desenvolvimento-e-validação)
- [Para quem é](#para-quem-é)
- [Portal de documentação](#portal-de-documentação)
- [License](#license)
- [Star History](#star-history)

---

## Posicionamento do projeto

O StoryForge não é uma ferramenta de "caixa-preta" que gera um romance completo com um clique, mas sim uma oficina de criação com IA feita para o autor:

| Objetivo | Abordagem do StoryForge |
|---|---|
| Autor no controle da criação | Toda saída da IA passa por pré-visualização, edição e adoção; a IA é assistente, não substitui o autor na finalização |
| Prompts visíveis e editáveis | O System Prompt, o User Template, os parâmetros e os exemplos por trás de cada recurso de IA podem ser inspecionados e clonados |
| Ambientação organizada para obras longas | Mundo, personagens, esboço, foreshadowing, estados, itens, fatos e arcos narrativos vão para um banco de dados local estruturado |
| Referências alimentam a escrita | Referências do projeto, material histórico, aprendizado de estilo e pesquisa de cena podem compor o contexto das próximas chamadas de IA |
| Dados com prioridade local | Sem back-end próprio do StoryForge por padrão; os dados do projeto ficam no IndexedDB do navegador do usuário |

---

## Capacidades principais

### Da inspiração ao projeto

- A página inicial gerencia todos os projetos de romance, com criação, exclusão e restauração a partir de pastas locais.
- As informações do projeto mantêm nome, sinopse, gênero, meta de palavras, status de escrita e o toggle de multi-mundo.
- Inspiração reversa: transforma ideias curtas, trechos e conceitos em estruturas adotáveis como núcleo da história, mundo, personagens e esboço.
- Referências do projeto: aceita referências de história, de estilo, material histórico e análises multidimensionais após upload.

### Biblioteca de ambientação

- Visão geral multi-mundo: gerencia grupos de mundos, relações entre mundos, mundo principal e estruturas entre mundos.
- Real e fantasia: declare por dimensão o que é baseado na realidade e o que admite invenção — útil tanto para pesquisa histórica quanto para criação de mundos fictícios.
- Worldbuilding: origem do mundo, ambiente natural, ambiente cultural, cronologia histórica, mapa-múndi.
- Design de história: logline, conceito da história, tema, conflito central, modo narrativo, trama principal, tramas secundárias.
- Design de personagens: geração de personagens, personagens principais, personagens secundários, NPCs, figurantes, rede de relacionamentos.

### Área de criação

- Regras de criação: estilo de escrita, ponto de vista narrativo, tom, restrições, regras de consistência e injeção de obras de referência.
- Esboço: árvore de volumes/capítulos, geração de volumes por IA, expansão de capítulos, pré-visualização de capítulos.
- Condução por personagens: avança o enredo a partir das motivações, relacionamentos e arcos dos personagens.
- Arcos narrativos: trama principal/secundária, cartões de estágio, progresso e geração por IA.
- Capítulos: lista de capítulos, edição de texto no TipTap, salvamento automático, continuação, polimento, expansão, remoção de "sabor de IA", revisão, anotações.
- Foreshadowing: tipos de foreshadowing, status de plantar/payoff/resolver, urgência, quadro kanban e sugestões de IA.
- Aprendizado de estilo: extrai um perfil a partir de capítulos escritos e de amostras curtas antes/depois validadas pelo autor, e recalibra continuamente a geração seguinte por meio de calibração interativa.
- Locais importantes: árvore de locais, tags, relações hierárquicas e material de referência por local.
- Tabelas de estado: cartões de estado de personagens, locais, itens, facções etc. e linha do tempo de eventos.
- Inventário de itens: registra aquisição, posse, transferência e consumo de itens em forma de livro de registros.
- Biblioteca de fatos: candidatos a fatos temporais extraídos do texto dos capítulos, que podem ser confirmados ou rejeitados para manter a consistência de longo prazo.
- Cronologia da história: registra eventos globais por capítulo e por tempo narrativo.
- Pesquisa de cena: combina worldbuilding, cronologia histórica e regras para verificar detalhes de cenas específicas.

### Biblioteca de prompts e fluxos de trabalho

- Gestão de templates: templates do sistema, templates do usuário, parâmetros, exemplos/anti-exemplos, pré-visualização em tempo real.
- Pacotes de gênero: histórico, xianxia, romance, realismo, suspense/mistério e outros estilos, trocáveis a quente.
- PromptRunPanel: ajuste de parâmetros em tempo de execução, alteração temporária de prompt, saída em streaming, adoção, marcação de bons/maus exemplos.
- Fluxos de trabalho: encadeia múltiplas etapas de IA, com orquestração automática e write-back do núcleo da história para mundo, personagens, esboço e capítulos.

### Importação, exportação e backup

- Análise de documentos: faça upload ou cole texto, que é analisado em blocos e convertido em ambientação do projeto atual ou em referências do projeto.
- Pipeline de documentos grandes: persistência via Blob, retomada a partir de ponto de interrupção, pausa/cancelamento, rastreamento de logs, deduplicação e mesclagem de personagens.
- Gestão de dados: backup completo em JSON, exportação para Markdown/TXT/HTML, backup automático em pasta local, backup em nuvem via GitHub Gist.
- Histórico de versões: snapshots automáticos e manuais; a restauração cria um novo projeto, evitando sobrescrever o manuscrito atual.
- Estatísticas de consumo: visualize chamadas de IA, tokens e custos estimados por projeto ou globalmente.

---

## Visão geral das funcionalidades

A barra lateral atual é composta por 5 módulos de primeiro nível:

| Módulo de 1º nível | Entradas de 2º nível |
|---|---|
| Informações da obra | Visão geral do projeto, Inspiração reversa, Referências do projeto |
| Biblioteca de ambientação | Visão geral dos mundos, Real e fantasia, Origem do mundo, Ambiente natural, Ambiente cultural, Cronologia histórica, Mapa-múndi, Design de história, Geração de personagens, Personagens principais, Personagens secundários, NPCs, Figurantes, Rede de relacionamentos |
| Área de criação | Regras de criação, Esboço, Condução por personagens, Arcos narrativos, Capítulos, Foreshadowing, Aprendizado de estilo, Locais importantes, Tabelas de estado, Inventário de itens, Biblioteca de fatos, Cronologia da história, Pesquisa de cena |
| Biblioteca de prompts | Templates, Pacotes de gênero, Parâmetros, Exemplos/Anti-exemplos, Fluxos de trabalho |
| Área de configurações | Histórico de versões, Análise de documentos, Gestão de dados, Estatísticas de consumo, Configurações |

O guia ilustrado completo para o usuário está em [docs/FEATURE-GUIDE.md](./docs/FEATURE-GUIDE.md). Esse documento detalha cada página e aba de segundo nível, com capturas de tela correspondentes.

---

## IA e sistema de prompts

As capacidades de IA do StoryForge se organizam em três camadas:

1. **Montagem de contexto**: lê informações do projeto, mundo, personagens, esboço, foreshadowing, estados, fatos, referências e demais conteúdos conforme a tarefa atual.
2. **Renderização de prompts**: gera o prompt final usando variáveis de template, blocos condicionais, chaves de parâmetros e exemplos few-shot.
3. **Adoção estruturada**: a saída da IA não vira fato diretamente; só é gravada em campos, coleções ou texto de capítulo após confirmação do usuário.

### Provedores de IA suportados

Os providers integrados na página de configurações incluem:

| Tipo | Provider |
|---|---|
| Internacional/Agregadores | OpenAI, Anthropic Claude, Google Gemini, Poe, NVIDIA NIM |
| Serviços em nuvem da China | DeepSeek, Tongyi Qianwen, Doubao, Zhipu GLM, ERNIE Bot, Kimi, MiniMax, ModelScope, Agnes AI, LongCat, OpenCode Go |
| Local/Personalizado | Ollama, LM Studio e outros serviços locais compatíveis com OpenAI, Base URL personalizado |

Serviços na China ou com restrições de CORS no navegador podem ser encaminhados via proxy local do Vite; qualquer endpoint personalizado compatível com `chat/completions` da OpenAI pode ser integrado.

### Capacidades dos templates de prompt

```ts
renderPrompt(template, context, {
  parameterValues,
  overrides,
})
```

| Capacidade | Descrição |
|---|---|
| `{{var}}` | Substituição de variável de template |
| `{{#if var}}...{{/if}}` | Bloco condicional |
| Controles de parâmetro | select, slider, number, text, boolean |
| Exemplos/Anti-exemplos | Bons e maus exemplos são injetados automaticamente no prompt |
| Clonar e editar | Templates do sistema podem ser clonados como templates do usuário e modificados livremente |
| Write-back de fluxo de trabalho | Resultados de geração em múltiplas etapas podem ser gravados automaticamente em história, personagens, esboço, foreshadowing e outros alvos |

---

## Dados e fronteiras de segurança

O StoryForge é um projeto puramente front-end, sem back-end de aplicação próprio.

| Dado/Ação | Destino |
|---|---|
| Dados do projeto | Salvos por padrão no IndexedDB do navegador |
| Chave de API de IA | sessionStorage por padrão; só vai para localStorage se o usuário marcar explicitamente "lembrar neste computador" |
| PAT do GitHub | sessionStorage por padrão; só vai para localStorage se o usuário marcar explicitamente "lembrar neste computador" |
| Geração por IA | Envia o contexto relevante ao serviço de IA configurado pelo usuário |
| Backup em nuvem via Gist | Faz upload do JSON completo do projeto para um Gist privado do próprio GitHub do usuário |
| Backup em pasta local | Grava no diretório local autorizado pelo usuário via File System Access API do navegador |

Em produção, a ausência de tabelas no schema do IndexedDB não dispara exclusão automática do banco; o reset automático só é permitido em ambiente de desenvolvimento. Na inicialização, o app solicita armazenamento persistente ao navegador para reduzir o risco de o IndexedDB ser limpo.

---

## Arquitetura técnica

### Arquitetura em seis camadas: do armazenamento ao valor para o usuário

O StoryForge se divide em seis camadas, nas quais as capacidades de baixo nível sustentam o valor entregue ao usuário. A UI apenas expressa a intenção e as confirmações do usuário; leitura de IA, escrita de IA e ciclo de vida das tabelas são centralizados em três registros, sem que os painéis formem pipelines paralelos.

[![Arquitetura em seis camadas do StoryForge: do armazenamento ao valor para o usuário](./docs/assets/architecture/storyforge-architecture-overview.png)](./docs/assets/architecture/storyforge-architecture-overview.png)

O diagrama mostra também o mapeamento de código do `PROJECT_TABLES`, os caminhos unificados de leitura e escrita por IA e a distribuição de domínio das 42 tabelas. A implementação correspondente está em [`src/lib/registry`](./src/lib/registry), [`src/lib/db/schema.ts`](./src/lib/db/schema.ts) e [`scripts/check-architecture.mjs`](./scripts/check-architecture.mjs).

### Os três registros

Qualquer extensão do projeto deve ser centralizada em três fontes únicas de verdade:

| Registro | Responsabilidade |
|---|---|
| `CONTEXT_SOURCES` | O que a IA lê e como o contexto é montado |
| `FIELD_REGISTRY` + `ADOPTION_SCHEMAS` | O que a IA escreve e como a adoção valida e deduplica |
| `PROJECT_TABLES` | Ciclo de vida das tabelas, cobertura de exportação/importação/exclusão/migração |

Veja [CLAUDE.md](./CLAUDE.md) e [docs/MASTER-BLUEPRINT.md](./docs/MASTER-BLUEPRINT.md).

---

## Início rápido

### macOS / Linux / Windows em geral

```bash
git clone https://github.com/yuanbw2025/storyforge.git
cd storyforge
npm install
npm run dev
```

Abra:

```text
http://localhost:1111/storyforge/
```

### Usuários iniciantes no Windows

O StoryForge não oferece mais iniciadores `.bat`, `.exe` ou Windows Portable. Usuários de Windows devem baixar o ZIP do código-fonte e iniciar via npm:

1. Baixe o `Source code (zip)` no GitHub Release.
2. Extraia e entre no diretório que contém o `package.json`.
3. Instale o Node.js LTS: https://nodejs.org/
4. Abra o PowerShell na pasta do projeto.
5. Execute `npm install` e `npm run dev`.
6. Abra `http://localhost:1111/storyforge/` no navegador.

Passo a passo ilustrado em [使用npm指令启动项目.md](./使用npm指令启动项目.md).

---

## Desenvolvimento e validação

Comandos mais usados:

```bash
npm run dev
npm run build
npm run test
npm run test:coverage
npm run check:required-tables
npm run check:ai-manual
npm run check:architecture
npm run ci
```

Antes de commitar, recomenda-se rodar ao menos:

```bash
npm run ci
```

Se a mudança for apenas documental, é possível escolher uma validação mais leve conforme o escopo; quando envolver tabelas de dados, leitura/escrita de IA, exportação/importação, exclusão ou migração, a validação completa é obrigatória, respeitando a regra dos três registros do [CLAUDE.md](./CLAUDE.md).

---

## Para quem é

| Indicada para | Não é indicada para |
|---|---|
| Autores que desejam controle total sobre prompts e saídas de IA | Quem só quer gerar um romance completo com um clique |
| Escritores de obras longas, séries, multi-mundo e narrativas de elenco | Quem não quer manter ambientação e esboço |
| Quem deseja consolidar pacotes de gênero, templates de estilo e fluxos de trabalho pessoais | Quem precisa de colaboração em tempo real e permissões de equipe na nuvem |
| Quem quer incorporar referências, pesquisas e obras de referência ao fluxo de escrita | Quem prefere que todos os dados fiquem em um back-end oficial |
| Quem busca prioridade local, troca de modelos e endpoints personalizáveis | Quem não quer configurar nenhuma chave de IA ou modelo local |

---

## Portal de documentação

| Documento | Finalidade |
|---|---|
| [docs/FEATURE-GUIDE.md](./docs/FEATURE-GUIDE.md) | Manual funcional completo voltado ao usuário |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Guia de contribuição |
| [CHANGELOG.md](./CHANGELOG.md) | Registro de mudanças por versão |
| [CLAUDE.md](./CLAUDE.md) | Regras obrigatórias para IA/desenvolvedores que recebem o projeto |
| [docs/MASTER-BLUEPRINT.md](./docs/MASTER-BLUEPRINT.md) | Planta da refatoração e autoridade arquitetural |
| [docs/roadmap/README.md](./docs/roadmap/README.md) | Sistemas de funcionalidades atuais, backlog combinado e ordem de construção |
| [docs/roadmap/CAPABILITY-BASELINE.md](./docs/roadmap/CAPABILITY-BASELINE.md) | Capacidades existentes e fronteiras contra reimplementação |
| [docs/roadmap/COMPLETED.md](./docs/roadmap/COMPLETED.md) | Unidades de desenvolvimento concluídas e ponto de entrada para evidências históricas |
| [docs/AI-FUNCTIONS-MANUAL.generated.md](./docs/AI-FUNCTIONS-MANUAL.generated.md) | Catálogo de funções de IA gerado a partir do código |
| [SECURITY.md](./SECURITY.md) | Reporte de vulnerabilidades, fluxo de resposta e política de versões suportadas |

---

## License

O StoryForge é distribuído como código aberto sob a [MIT License](./LICENSE). Você pode usar, copiar, modificar, distribuir e comercializar o código deste projeto livremente; mantenha os avisos de copyright e de licença originais.

---

## Star History

[![StoryForge Star History](./docs/assets/architecture/storyforge-star-history.svg)](https://star-history.com/#yuanbw2025/storyforge&Date)

O gráfico de linhas é gerado a partir dos dados oficiais de timestamps dos stargazers do GitHub; comando de atualização: `node scripts/generate-star-history.mjs`.

---

## Guia detalhado das funcionalidades

A versão ilustrada completa do manual de funcionalidades está em [docs/FEATURE-GUIDE.md](./docs/FEATURE-GUIDE.md). O documento detalha cada página e aba de segundo nível, com descrições de funcionalidades, explicações da lógica do projeto e capturas de tela correspondentes.

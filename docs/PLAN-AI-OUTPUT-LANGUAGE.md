# Plano de Idioma de Saída da IA (AI Output Language) · Autoridade de Planejamento/Execução

> Criado em 2026-08-15. Este arquivo é o **plano autoritativo** para o sistema de idioma de saída
> da IA no StoryForge. Estilo e disciplina seguem `docs/CODEX-REFACTOR-PLAN.md`.
> **Este documento não altera código, banco, Canon, testes ou qualquer outro arquivo.**
> Toda execução futura acontece em branch `feat/i18n/<fase-ou-unidade>` dedicada, fase a fase,
> com rollback local individual.
> Propostas de API ainda inexistentes estão marcadas como `equivalente a` — nomes definitivos
> só nascem na implementação, nunca são assumidos aqui.

> **Pré-requisito operacional:** ler `docs/FORK-MAINTENANCE.md` antes de cada fase. `origin` é
> `https://github.com/Diogo0Melo/storyforge-multilingue`; `upstream` é
> `https://github.com/yuanbw2025/storyforge` e serve somente para fetch/leitura. Nunca enviar
> push, PR, issue ou dados ao upstream; publicação, quando explicitamente autorizada, é somente
> para origin.

---

## 0. Resumo executivo

O StoryForge já possui um gate de idioma de saída (`applyOutputLanguageGate` em
`src/lib/ai/output-language.ts`) aplicado na borda de rede (`chat()`/`streamChat()` em
`src/lib/ai/client.ts`). Ele resolve o idioma do projeto via IndexedDB e injeta uma restrição
 textual na última mensagem `user`. Evidências de campo (imagens 229–240) mostram que isso é
insuficiente:

- Extração estruturada (`codex.extract`, chamada por `src/components/codex/CodexPanel.tsx` com
  `outputKind: 'functional-structured'`) **não recebe nenhuma restrição de idioma**, e seu
  template seed (`src/lib/ai/prompt-seeds-tools.ts`) é chinês → Codex produziu entradas em chinês
  com UI pt-BR e fonte pt/en.
- Inspiração reversa (`src/hooks/useIncrementalInspiration.ts`,
  `src/lib/agent/inspiration-copilot.ts`) usa `outputKind: 'mixed'` e propagou chinês para o Canon.
- A captura mostrou `contentLanguage` exibido como English, com timing/persistência incertos —
  evidência de que **persistência e leitura de `contentLanguage` não têm barreira de escrita**.
- O guarda anti-dupla-injeção atual (`hasOutputLanguageConstraint`) reconhece qualquer uma das três
  constraints conhecidas, não distinguindo bloco criado pelo StoryForge de texto arbitrário.
- Já existem **materializadores de idioma fora do gate central**: outline resolve o idioma do
  projeto e injeta exemplos/diretiva no próprio prompt; simulation injeta diretiva de idioma em
  mensagens `system` (§4, linhas "Materializadores paralelos"). `chat()`/`streamChat()` são o
  **choke point alvo**, não o único materializador atual — outline/simulation precisam de
  inventário e consolidação para garantir uma única materialização efetiva por rota (I1).

**Direção congelada:** uma única política lógica de idioma, declarada por call site via
`languagePolicy` em `AICallMeta`, resolvida na borda, materializada uma única vez por
rota/adapter conforme capability (nunca por nome de modelo), com escrita de `contentLanguage`
serializada e fail-closed, validação de idioma por papéis de campo no pipeline de parsing
(antes de `adopt()`, nunca dentro), e enforcement promovido gradualmente (shadow → evals → bloqueio).

## 1. Decisões congeladas (não reabrir sem decisão do autor)

| # | Decisão |
|---|---|
| D1 | `outputKind` continua descrevendo **formato/intenção**: `creative`, `functional-prose`, `functional-structured`, `mixed`, `language-neutral`. Não criar dezenas de novos kinds. |
| D2 | Novo campo `languagePolicy: 'project' \| 'ui' \| 'none'` em `AICallMeta` (`src/lib/ai/client.ts`). Call sites declaram política + `projectId`; a borda resolve o idioma. Não passar estado de UI não salvo diretamente. |
| D3 | `Project Store`/IndexedDB é a fonte oficial de `contentLanguage`. A alteração precisa de autosave/ação única e **barreira compartilhada por `projectId`**; writes serializados/ordenados; toda geração aguarda o flush de writes pendentes (`equivalente a flushPendingProjectWrites(projectId)`); falha de write **aborta a geração fail-closed**; mudanças rápidas e gerações concorrentes esperam a mesma fila. |
| D4 | O contrato lógico de idioma é **único**; adapters materializam em `native-system`, `system/developer` ou fallback textual marcado, conforme **capability da rota/adapter** — nunca por nome de modelo, nunca duas representações simultâneas. |
| D5 | Substituir `hasOutputLanguageConstraint()` atual por política StoryForge **autoritativa e idempotente**: detectar/substituir apenas bloco criado pelo StoryForge (marcador versionado, `equivalente a [STORYFORGE_OUTPUT_POLICY]`), nunca instruções arbitrárias do usuário. A posição no fim da mensagem **não** é a única fonte de autoridade. |
| D6 | JSON estruturado também pode ter valores no idioma do projeto; preservar chaves, enums, IDs, nomes próprios, código, citações e fontes marcadas. Validar por **papéis de campo** (`free-text`, `preserve`, `canonical-id` ou vocabulário equivalente) registrados em `FIELD_REGISTRY`/`AdoptionSchema`/schemas existentes — sem registro paralelo. |
| D7 | Sem bloqueio linguístico genérico em `adopt()` (`src/lib/registry/adopt.ts`); validação ocorre no parser/adaptador/candidate pipeline **antes** da adoção, respeitando escrita completa/sem parcialidade. Canon/`assembleContext` não traduz. |
| D8 | Validator inicialmente **shadow/aviso local sem dados sensíveis**; só promover a bloqueio após evals. Retry semântico no máximo 1×, fora do transporte HTTP e fora de `adopt()`, reutilizando budget/generation infrastructure. CJK isolado nunca é critério de bloqueio. |
| D9 | Codex é o primeiro alvo confirmado; reverse inspiration já usa `mixed` e deve receber política `project`; auditar Agents `agent-*`, workflows e demais extraction/user-facing JSON. |
| D10 | Seeds chineses **não** serão globalmente traduzidos nesta primeira execução: templates persistidos exigem migração/reseed/lifecycle e inglês não é neutro; avaliar por família depois (Fase 8). |
| D11 | Não criar regra semântica por provider — apenas capability de materialização/placement. Não adicionar tabela; manter `CONTEXT_SOURCES`, `FIELD_REGISTRY`/`AdoptionSchema`/`adopt`, `PROJECT_TABLES` intactos como fatos únicos. |

## 2. Norte e invariantes

### 2.1 Norte (forma final)

1. Todo texto gerado por IA e voltado ao autor/leitor sai no idioma correto (projeto ou UI,
   conforme política declarada), inclusive JSON com valores legíveis.
2. Uma única política lógica por operação, decidida na borda — sem segunda opinião em
   componentes, adapters ou `adopt()` — e uma única materialização efetiva por rota.
3. Nenhuma geração concorre com escrita não persistida de `contentLanguage`.
4. Nenhum dado legítimo (nome próprio, citação, código, enum, ID, CJK intencional) é bloqueado
   ou "corrigido" por heurística de idioma.

### 2.2 Invariante central — política lógica única / materialização única

> **I1.** Existe exatamente **uma política lógica de idioma por operação** (derivada de
> `languagePolicy` + `outputKind` + estado persistido) e **exatamente uma materialização efetiva
> por rota** no payload final.

Consequências obrigatórias:

- Nenhum call site injeta texto de idioma por conta própria; nenhum adapter adiciona uma segunda
  representação se a borda já materializou.
- Materializadores já existentes fora do gate central (outline/simulation, §4) devem ser
  inventariados e consolidados **antes** de o critério de completude "nenhum caller paralelo de
  materialização" ser declarado (Fase 7). Se, excepcionalmente, o plano aceitar isenção temporária
  para um caminho, ela deve documentar justificativa, fronteira exata e data/critério de remoção;
  a decisão registrada neste plano é **incluir outline e simulation no escopo de auditoria** —
  sem isenção.
- O marcador versionado do bloco StoryForge é o critério de detecção/substituição; a posição
  (fim da última `user`) é conveniência de placement, não autoridade.
- Se a capability da rota não suporta placement nativo, o fallback textual marcado é a **mesma**
  política serializada de outro modo — não uma segunda política.
- Durante as Fases 0–6, I1 é o estado-alvo e não uma declaração de que todo o produto já está
  consolidado: outline/simulation permanecem materializadores conhecidos e explicitamente
  monitorados até a Fase 7. Nenhuma fase intermediária pode ser reportada como fechamento global
  enquanto esses caminhos ainda não tiverem placement único ou isenção documentada.

## 3. Escopo (IN / OUT)

- ✅ IN: contrato `languagePolicy`; barreira de escrita de `contentLanguage`; política
  autoritativa/idempotente na borda; capability matrix de placement; papéis de campo para
  validação de idioma em JSON; Codex como primeiro alvo; reverse inspiration com `project`;
  auditoria Agents/workflows/extraction; validator shadow + evals; retry semântico 1×;
  testes de caracterização e regressão.
- ❌ OUT: tradução global de seeds chineses (Fase 8, futura); novas tabelas; novos `outputKind`;
  regras semânticas por provider/modelo; bloqueio linguístico em `adopt()`; tradução de
  Canon/`assembleContext`; mudanças de layout/UX de design visual.
- 🚫 Nenhuma mudança de código, DB, Canon ou testes acontece **neste** documento/primeira unidade
  de planejamento (ver §16).

### 3.1 Pertencimento ao roadmap (AGENTS.md, task-start #4)

Este plano ainda **não possui sistema/ID registrado** na estrutura vigente de roadmap. A Fase 0
deve: (a) localizar o ponto de registro em `docs/roadmap/README.md` e
`docs/roadmap/CAPABILITY-BASELINE.md`; (b) registrar ali um resumo deste plano com ID/sistema
adequado **ou** registrar formalmente a decisão de não criar novo ID (com justificativa). Nada em
`CLAUDE.md` ou `docs/MASTER-BLUEPRINT.md` é editado sem autorização explícita do autor.

## 4. Estado atual (evidências verificadas em 2026-08-15)

| Área | Evidência |
|---|---|
| Gate de idioma | `src/lib/ai/output-language.ts`: `applyOutputLanguageGate` é chamado por `chat()`/`streamChat()` em `src/lib/ai/client.ts` — o **choke point alvo**, mas não o único materializador atual (ver linhas "Materializadores paralelos"). `functional-structured`/`language-neutral` **não injetam**; `functional-prose` usa idioma da UI; `creative`/`mixed` resolvem `contentLanguage` do projeto via `db.projects.get(meta.projectId)` + `resolveProjectContentLanguage` (`src/lib/ai/content-language.ts`). Sem projeto → fallback uiLocale com `console.debug`. |
| Guarda anti-dupla | `hasOutputLanguageConstraint()` (`output-language.ts`) aceita **qualquer uma** das três constraints (`ALL_OUTPUT_CONSTRAINTS`: zh/pt/en) via `endsWith` na última mensagem `user` — não distingue bloco StoryForge de texto do usuário. |
| Trim/proteção e transporte | `src/lib/ai/client.ts`: `detectInjectedOutputConstraint` + `trimMessagesToFit` (de `src/lib/ai/context-budget.ts`) protegem a constraint injetada; se não preservável, a chamada é rejeitada (coberto por `tests/regression/R-G2A-language-constraint-trim.test.ts`). Body OpenAI-compatible com `messages`; branching por provider em `buildRequest` (poe/deepseek/glm/longcat/default). **Materialização vigente é `textual-fallback`**: `appendOutputLanguageConstraint`/`appendUserConstraint` anexa a constraint à última mensagem `user`; `buildRequest` **não** injeta `system`/`developer` de idioma hoje. Retry HTTP 429/503 existe **somente em `streamChat`** (loop de até 2 retries); `chat()` não possui o mesmo loop — o retry semântico futuro (D8) é mecanismo separado deste. Adapter placement **não** é capability declarativa hoje. |
| Persistência | `src/stores/project.ts`: `createProject` normaliza `contentLanguage` (`normalizeContentLanguage`); `updateProject` é update genérico (`db.projects.update`) sem normalização específica e sem fila/barreira. `src/components/project/ProjectInfoPanel.tsx` salva o formulário no botão Save (chama `updateProject`; lê idioma resolvido via `resolveProjectContentLanguage`). |
| Codex | `src/components/codex/CodexPanel.tsx` (`handleExtractEntries`) chama `chat(buildCodexExtractPrompt(...), aiConfig, { category: 'codex.extract', projectId, outputKind: 'functional-structured' })` → sem restrição de idioma. Template `codex.extract` vem de `usePromptStore` (seed em `src/lib/ai/prompt-seeds-tools.ts`, chinês). Parser `parseCodexEntries` (`src/lib/ai/adapters/structured-extract-adapter.ts`) não valida idioma. |
| Reverse inspiration | `src/hooks/useIncrementalInspiration.ts` usa `outputKind: 'mixed'`, category `inspiration.reverse`; parsers `parseReverseOutput`/`parseReverseMultiWorldOutput` em `src/lib/ai/inspiration-reverse.ts` não validam idioma; `src/lib/agent/inspiration-copilot.ts` reutiliza os mesmos builders. |
| Materializadores paralelos (outline) | `src/lib/outline/generation-plan.ts` (`buildOutlineGenerationPlan`) resolve `contentLanguage` via `resolveProjectContentLanguage` e o passa aos builders de `src/lib/ai/adapters/outline-adapter.ts` (`resolveOutlineTitleExamples` injeta exemplos de título por idioma no prompt). Ao mesmo tempo `src/lib/outline/generation-node.ts` declara `outputKind: 'mixed'` com `projectId` para `outline.volume`/`outline.chapter` → o gate **também** injeta a constraint → **risco de dupla materialização** no payload de outline. |
| Materializadores paralelos (simulation) | `src/components/simulation/SimulationRuntimePanel.tsx` resolve o idioma (`resolveProjectContentLanguage`) e o passa a `src/lib/simulation/ttrpg.ts` e `src/lib/simulation/npc-evolution.ts`, que materializam diretiva narrativa de idioma em mensagens `system` (diretiva de campos narrativos, inclusive em chamadas JSON estrito cujos call sites declaram `language-neutral` para o gate não injetar). Caminho fora do gate central — inventariar/consolidar na Fase 7. |
| adopt() | `src/lib/registry/adopt.ts` tem muitos callers e também recebe dados humanos/importados — **não deve** virar detector global de idioma (D7). Cobertura: `tests/registry/adopt.test.ts`, `tests/registry/adopt-callers.test.ts`. |
| Três registros | `CONTEXT_SOURCES` (`src/lib/registry/context-sources.ts`) e `assembleContext` (`src/lib/registry/assemble-context.ts`) devem continuar preservando conteúdo original (sem tradução); `FIELD_REGISTRY` (`src/lib/registry/field-registry.ts`) e `AdoptionSchema` (`src/lib/registry/adoption-schema.ts`, `ADOPTION_SCHEMAS`/`ADOPTION_EXTENSIONS`) são o lugar dos papéis de campo; `PROJECT_TABLES` (`src/lib/registry/project-tables.ts`) sem tabela nova. |
| Testes | 47 testes direcionados passaram (evidência da tarefa), mas **faltam**: payload final completo, race/pending writes, placement único, semântica de valores JSON e bloqueio/retry. Existentes relevantes: `tests/registry/output-language-gate.test.ts`, `tests/registry/content-language.test.ts`, `tests/registry/parsers.test.ts`, `tests/regression/R-CF20260702-language-guard.test.ts`, `tests/regression/R-AUDIT6-prompt-seed-integrity.test.ts`, `tests/regression/R-G2A-language-constraint-trim.test.ts` (trim protegido + `detectInjectedOutputConstraint`), `tests/regression/R-AUDIT6-outline-generation-plan.test.ts`, `tests/regression/R-PHASE3-outline-title-language.test.ts`, `tests/regression/R-AUDIT6-outline-generation-controller.test.tsx`, `tests/regression/R-AUDIT6-outline-batch-controller.test.tsx`, `tests/regression/R-PIPELINE1-generation-node.test.ts`, `tests/regression/R-I18N-P2-workshop-language-contracts.test.ts` (contrato de idioma de simulation). |
| Campo (imagens 229–240) | Codex produziu chinês com UI pt e fonte pt/en; reverse/Canon propagaram chinês; tela exibiu `contentLanguage` English; timing/persistência da captura incerto. Erro `无效的令牌` (token inválido) é problema upstream separado, fora deste escopo. |
| Git | Branch atual legada `feat/i18n-legacy`, que contém a fonte local do i18n refeito; `vite.config.ts` modificado, `.opencode/` não rastreado e `docs/PLAN-AI-OUTPUT-LANGUAGE.md` não commitado no working tree. O `origin/main` publicado está obsoleto/disponível para substituição e não é base de execução. A primeira execução parte do estado local isolado de `feat/i18n-legacy`, sem tocar mudanças pré-existentes; novas fases usam `feat/i18n/<fase-ou-unidade>`. |

## 5. Matriz de blast radius

| Mudança | Impacto direto | Quem deve ser verificado |
|---|---|---|
| `AICallMeta` + `languagePolicy` (`src/lib/ai/client.ts`) | Todos os call sites de `chat()`/`streamChat()` (campo opcional → compatível) | `tests/registry/output-language-gate.test.ts`; call sites em components/hooks/agent |
| Substituição de `hasOutputLanguageConstraint` | Gate, trim protegido (`detectInjectedOutputConstraint`), testes que referenciam o guarda | `tests/registry/output-language-gate.test.ts`, `tests/regression/R-G2A-language-constraint-trim.test.ts`, `tests/regression/R-AGENT1-readonly-runner.test.ts`, `tests/regression/R-AGENT2-main-orchestrator.test.ts` |
| Barreira de escrita em `updateProject`/autosave | `ProjectInfoPanel.tsx`, `src/pages/ProductHubPage.tsx`, `src/components/cultivation/CultivationProgressPanel.tsx` (callers de `updateProject`) | Testes novos de concorrência + regressões de import/sync (`tests/regression/R-CF20260703-3-import-project-list-sync.test.ts`) |
| Restrição de idioma em `codex.extract` | Payload de extração Codex; template seed persistido; budget de contexto (constraint conta tokens) | `CodexPanel.tsx`, `structured-extract-adapter.ts`, `tests/regression/R-AUDIT6-prompt-seed-integrity.test.ts`, trim (`context-budget.ts`) |
| Papéis de campo (`free-text`/`preserve`/`canonical-id`) | `FIELD_REGISTRY`, `AdoptionSchema`, parsers de extração | `tests/registry/parsers.test.ts`, `tests/registry/adopt.test.ts`, `check:required-tables`, `check:architecture` |
| Validator shadow/retry | Candidate pipeline antes de `adopt()`; budget de geração | `src/lib/generation/generation-node.ts`, `src/lib/agent/team-execution.ts` (`runBudgetedGenerationNode`), `tests/regression/R-AGENT4-team-budget-canon-retry.test.ts` |
| Capability de placement por rota | `buildRequest`/adapters; todos os providers | Testes novos de placement único; `tests/regression/R-CF20260702-ai-config-endpoint.test.ts`, `tests/regression/R-CF20260702-language-guard.test.ts` |
| Consolidação outline (materializador paralelo) | `src/lib/outline/generation-plan.ts`, `src/lib/ai/adapters/outline-adapter.ts`, `src/lib/outline/generation-node.ts`, `src/components/outline/useOutlineGenerationController.ts`, `src/components/outline/useOutlineBatchGeneration.ts` | Existentes: `tests/regression/R-AUDIT6-outline-generation-plan.test.ts`, `tests/regression/R-PHASE3-outline-title-language.test.ts`, `tests/regression/R-AUDIT6-outline-generation-controller.test.tsx`, `tests/regression/R-AUDIT6-outline-batch-controller.test.tsx`, `tests/regression/R-PIPELINE1-generation-node.test.ts`. Futuros (propostos): payload final de outline com materialização única (adapter OU gate, nunca ambos) |
| Consolidação simulation (materializador paralelo) | `src/components/simulation/SimulationRuntimePanel.tsx`, `src/lib/simulation/ttrpg.ts`, `src/lib/simulation/npc-evolution.ts` | Existente: `tests/regression/R-I18N-P2-workshop-language-contracts.test.ts`. Futuros (propostos): diretiva única por sessão ttrpg/npc, sem duplicação com o gate |

## 6. Contrato de `languagePolicy` (precedência e fallback)

Contrato proposto para `AICallMeta` em `src/lib/ai/client.ts` (nome definitivo na implementação):

```
languagePolicy?: 'project' | 'ui' | 'none'   // default efetivo derivado de outputKind (tabela abaixo)
projectId?: number                             // já existe hoje
```

**Precedência de resolução (na borda, dentro do gate):**

1. `languagePolicy === 'none'` → nenhuma restrição de idioma (ex.: `language-neutral`).
2. `languagePolicy === 'ui'` → idioma atual da UI (`getSupportedUiLang()`).
3. `languagePolicy === 'project'` →
   a. aguardar barreira de escrita do projeto (§7); falha de write pendente → **abortar fail-closed**;
   b. ler projeto persistido; resolver via `resolveProjectContentLanguage(project, uiLocale)`;
   c. sem `projectId` ou sem linha de projeto → fallback explícito para uiLocale (reportado, como hoje).
4. `languagePolicy` ausente → default derivado de `outputKind` (compatibilidade com a tabela interina
   `INTERIM_OUTPUT_KIND_BY_TASK_KIND`): `creative`/`mixed` → `project`; `functional-prose` → `ui`;
   `functional-structured`/`language-neutral` → `none` **para o texto livre**, mas com política de
   **valores** definida por call site (D6/D9 — Codex declara `project` para valores).

**Regra de ouro:** call site declara política; a borda resolve idioma; nenhum componente passa
idioma resolvido/estado de UI não persistido como parâmetro de geração.

## 7. Barreira de escrita de `contentLanguage` (modelo de estados)

Fonte oficial: Project Store/IndexedDB (D3). A mudança de `contentLanguage` deixa de ser um
`updateProject` genérico e passa a ter autosave/ação única com fila compartilhada por `projectId`.

### 7.1 Estados

| Estado | Significado |
|---|---|
| `idle` | Nenhum write pendente para o `projectId`. Leituras de geração podem prosseguir. |
| `pending` | Write em andamento (ou enfileirado). Gerações do mesmo `projectId` **aguardam**. |
| `succeeded` | Write persistido e confirmado. Volta a `idle`. |
| `failed` | Write falhou. Geração associada **aborta fail-closed**; erro visível ao autor; nenhuma chamada de provider é disparada. |

### 7.2 Ordenação e concorrência

- Writes de um mesmo `projectId` são **serializados** em fila única; a ordem de chegada define a
  ordem de aplicação. Para mudanças rápidas sucessivas da UI é aceitável colapso
  **latest-write-wins** *dentro da fila* (o último valor enfileirado é o que persiste), mas toda
  geração aguarda o dreno completo da fila — nunca lê estado intermediário.
- Duas mudanças rápidas + geração concorrente → a geração espera a mesma fila e lê o valor final.
- API proposta (na implementação): `equivalente a flushPendingProjectWrites(projectId)` — ponto
  único aguardado por `applyOutputLanguageGate`/bordas de geração antes de resolver idioma.
- Falha de write → estado `failed` → geração aborta antes de qualquer fetch (zero provider calls).

## 8. Capability matrix de placement (rota/adapter)

Materialização é decidida por **capability da rota/adapter**, nunca por nome de modelo (D4/D11).

**Estado atual (verificado):** a única materialização vigente é `textual-fallback` —
`appendOutputLanguageConstraint`/`appendUserConstraint` anexando a constraint à última mensagem
`user`. `buildRequest` **não** injeta mensagem `system`/`developer` de idioma hoje. Os placements
nativos abaixo são **futuros**, habilitados conforme capability declarada da rota/adapter.

| Placement | Descrição | Status |
|---|---|---|
| `textual-fallback` | Bloco marcado versionado (`equivalente a [STORYFORGE_OUTPUT_POLICY]`) anexado à última mensagem `user`; é a mesma política serializada, não uma segunda | **Atual** (hoje ainda sem marcador versionado — introduzido na Fase 1) |
| `system/developer` | Papel `system` (ou `developer` quando a rota expuser) no array `messages` OpenAI-compatible | **Futuro**, habilitado por capability de rota/adapter |
| `native-system` | Instrução em mensagem/campo de sistema nativo da rota (ex.: adapters que já constroem `system` próprio, como simulation hoje) | **Futuro** como capability declarativa — outline/simulation deixam de ser materializadores ad-hoc (Fase 7) |

Regras:

1. A declaração de capability vive na definição da rota/adapter (junto a `resolveRequestConfig`/
   `task-routing.ts`), nunca em `if model === ...`.
2. Placement efetivo por chamada é exatamente um; o gate registra qual foi usado (para diagnóstico
   local sem dados sensíveis).
3. `buildRequest` hoje já trata providers de forma estrutural (`NO_STREAM_OPTIONS` para
   glm/wenxin/poe/gemini/ollama/longcat; casos poe/deepseek/glm/longcat/default) — a capability
   matrix se encaixa nesse padrão existente, sem regra semântica nova por provider.

## 9. Papéis de campo e validação de idioma em JSON estruturado

Papéis (D6): `free-text` (valor deve estar no idioma alvo), `preserve` (valor intocável: chaves,
enums, IDs, código, nomes próprios, citações marcadas), `canonical-id` (valor pertence a
vocabulário/enum fixo). Registro acontece em `FIELD_REGISTRY`/`AdoptionSchema`/schemas existentes —
sem registro paralelo (D11).

Validação por papéis de campo, **não recursão cega**; ocorre no parser/candidate pipeline antes de
`adopt()` (D7), respeitando escrita completa (sem adoção parcial de candidato inválido).

**Ordem obrigatória (M3):** qualquer novo papel linguístico em `FIELD_REGISTRY`/`AdoptionSchema` é
**primeiro** uma alteração de registro acompanhada de testes e guards (`npm run check:architecture`,
`npm run check:required-tables`, testes de registry); somente depois de o registro estar verde
parsers/adapters podem depender do papel. Nunca o inverso.

### 9.1 Exemplos com nomes reais

**Codex** (`parseCodexEntries` / `ExtractedCodexEntry` em `structured-extract-adapter.ts`):

| Campo | Papel | Nota |
|---|---|---|
| `name` | `preserve` | Nome próprio do conceito; não "traduzir", no máximo sinalizar |
| `summary` | `free-text` | Idioma do projeto |
| `description` | `free-text` | Idioma do projeto |
| `fields` (chaves) | `preserve` | Chaves vêm do `fieldSchema` da categoria |
| `fields` (valores) | `free-text` | Idioma do projeto (exceto campos cujo schema declare enum) |
| `tags` | `free-text` | Em `parseLocations` já existe vocabulário fixo (`ALL_LOCATION_TAGS`) → lá o papel é `canonical-id` |
| `icon` | `preserve` | Símbolo, sem idioma |
| `importance` | `preserve` | Número 0–5 |

**Reverse inspiration** (`inspiration-reverse.ts`; resultado com `characters` e demais campos
consumidos por `useIncrementalInspiration.ts`/`inspiration-copilot.ts`): campos de prosa voltada
ao autor → `free-text` no idioma do projeto; nomes de personagens/locais → `preserve`; campos
estruturais/modos → `canonical-id`. Inventário completo dos campos acontece na Fase 4 (auditoria),
não neste plano.

**Agents `agent-*` / workflows**: kinds de agente hoje ficam fora da derivação interina
(`INTERIM_OUTPUT_KIND_BY_TASK_KIND` deixa `agent-*` vazio de propósito); a Fase 4 audita cada
saída user-facing (ex.: `consistency-agent.ts`, `chapter-organization.ts`, copilot nodes em
`src/lib/agent/*.ts`) e atribui papéis apenas onde houver JSON com valores legíveis.

## 10. Fases de execução (independentes, risco crescente)

> Cada fase: objetivo / arquivos prováveis / contrato / mudanças / validação / completude / rollback.
> Antes de cada fase, leia `docs/FORK-MAINTENANCE.md` e preserve o worktree. Toda fase roda em
> `feat/i18n/<fase-ou-unidade>` própria, com testes de contraexemplo e `git diff --check` limpo.
> A Fase 0 parte do estado local isolado da legada `feat/i18n-legacy`, não do `origin/main` obsoleto;
> somente após republicação autorizada a nova `origin/main` vira base das fases seguintes.

### Fase 0 — Caracterização e lacunas de teste (ZERO mudança funcional)

- **Objetivo:** congelar o comportamento atual e cobrir as lacunas listadas em §4, sem alterar produção.
- **Arquivos prováveis:** apenas `tests/**` (novos arquivos; ex.: `tests/registry/output-language-gate.test.ts` expandido ou arquivos irmãos dedicados a payload/barreira/concorrência) + registro em `docs/roadmap/README.md`/`docs/roadmap/CAPABILITY-BASELINE.md` (§3.1) + atualização do inventário neste plano.
- **Contrato:** nenhum arquivo de `src/**` muda; nenhum comportamento muda.
- **Mudanças (testes novos de caracterização + registro em docs):**
  1. Payload final completo por `outputKind`/política (assert do corpo enviado, não só mensagens internas);
  2. Guarda antigo (`hasOutputLanguageConstraint`) — comportamento atual com as três constraints;
  3. Política antiga de injeção (creative/mixed/functional-prose/structured/neutral) como golden tests;
  4. Custom prompt do usuário contendo instrução de idioma própria (hoje pode ser confundida com o guarda);
  5. Write **pendente** de `contentLanguage` + geração concorrente — caracterizar o comportamento atual (hoje não há barreira; a geração não espera o write);
  6. **Falha** de write de `contentLanguage` — caracterizar o comportamento atual: sem barreira, a geração pode prosseguir mesmo com write falho (não existe fail-closed hoje). A asserção fail-closed/zero provider calls **não** pertence à Fase 0; foi movida para a Fase 2 (barreira) e seus critérios de aceitação;
  7. Duas mudanças rápidas de `contentLanguage` (caracterizar última escrita visível);
  8. `contentLanguage` inválido → `resolveProjectContentLanguage` cai em uiLocale (já coberto parcialmente em `tests/registry/content-language.test.ts` — estender);
  9. Dupla materialização de outline — caracterizar o estado atual (adapter injeta exemplos por idioma E gate injeta constraint via `mixed`), como baseline para a Fase 7;
  10. Registro de pertencimento ao roadmap (§3.1): localizar/registrar o resumo deste plano em `docs/roadmap/README.md` e `docs/roadmap/CAPABILITY-BASELINE.md`, ou registrar a decisão de não criar novo ID, com justificativa;
  11. Inventário completo de materializadores de idioma (outline, simulation e auditoria dos demais caminhos), consolidando as linhas "Materializadores paralelos" de §4 e alimentando a Fase 7.
- **Validação:** testes FAST/DOMAIN direcionados (§11) verdes; `tests/regression/R-G2A-language-constraint-trim.test.ts`
  verde e intocado. O `npx tsc --noEmit` completo pertence ao dono GLOBAL/RELEASE na integração,
  não é uma obrigação do worker nesta fase.
- **Completude:** todos os itens existem e passam **caracterizando** o estado atual (inclusive a ausência de fail-closed e a dupla materialização de outline); roadmap registrado; nenhuma diff em `src/`.
- **Rollback:** remover os arquivos de teste novos e reverter o registro no roadmap (docs).

### Fase 1 — Contrato lógico único + política autoritativa (gate)

- **Objetivo:** introduzir `languagePolicy` em `AICallMeta` e substituir o guarda por política StoryForge idempotente com marcador versionado.
- **Arquivos prováveis:** `src/lib/ai/client.ts` (tipo `AICallMeta`), `src/lib/ai/output-language.ts` (guarda/política), `src/lib/ai/adapters/prompt-guards.ts` (forma do bloco marcado), testes.
- **Contrato:** §2.2 (I1) + §6; precedência e fallback explícitos; call sites existentes continuam funcionando via default derivado de `outputKind`.
- **Mudanças:** detecção/substituição apenas de bloco criado pelo StoryForge; idempotência (re-injeção substitui, nunca duplica); instrução de idioma arbitrária do usuário não é tocada; registro local do placement escolhido (sem dados sensíveis).
- **Validação:** testes da Fase 0 continuam verdes (mudança de comportamento apenas onde o plano determina); `tests/regression/R-G2A-language-constraint-trim.test.ts` continua verde (trim protegido reconhece o novo bloco marcado); contraexemplos: prompt customizado intacto, bloco substituído uma única vez, `none` não injeta.
- **Completude:** invariante I1 demonstrável por teste de payload final; `npm run check:architecture` verde.
- **Rollback:** reverter o commit da fase; o guarda antigo volta e os testes de caracterização garantem equivalência.

### Fase 2 — Persistência + barreira de escrita

- **Objetivo:** §7 completo: autosave/ação única para `contentLanguage`, fila serializada por `projectId`, flush aguardado por gerações, fail-closed.
- **Arquivos prováveis:** `src/stores/project.ts` (`updateProject`/ação dedicada), `src/components/project/ProjectInfoPanel.tsx` (Save/autosave), ponto de flush consumido pelo gate (`src/lib/ai/output-language.ts`), testes.
- **Contrato:** máquina de estados idle/pending/succeeded/failed; latest-write-wins dentro da fila; gerações esperam o dreno; falha → aborto fail-closed antes de fetch.
- **Mudanças:** write de `contentLanguage` com normalização (`normalizeContentLanguage`) também no update; fila compartilhada por `projectId`; `equivalente a flushPendingProjectWrites(projectId)`.
- **Validação:** testes de concorrência da Fase 0 viram assertivos (não mais caracterização); **fail-closed: falha de write aborta a geração com zero provider calls** (mock de fetch com contagem — promove o item 6 de caracterização da Fase 0, sem duplicar o teste de write pendente); duas mudanças rápidas → último valor persiste e geração lê o valor final.
- **Completude desta fase (escopo central):** todos os callers migrados para o gate/barreira
  aguardam o flush e um write falho nunca resulta em chamada de provider; regressões de
  import/sync do projeto continuam verdes. Os materializadores outline/simulation já conhecidos
  permanecem explicitamente fora do fechamento global desta fase e só podem ser declarados
  consolidados após a Fase 7; nenhum critério intermediário pode ocultar essa pendência.
- **Rollback:** reverter; `updateProject` genérico volta (testes da Fase 0 documentam o estado anterior).

### Fase 3 — Codex (primeiro alvo funcional)

- **Objetivo:** extração `codex.extract` gera valores no idioma do projeto, com template seed chinês compensado na borda (sem reescrever seeds persistidos agora — D10).
- **Arquivos prováveis:** `src/components/codex/CodexPanel.tsx` (call site declara `languagePolicy: 'project'`), borda/gate (materialização para `functional-structured` com valores), `src/lib/ai/adapters/structured-extract-adapter.ts` (preparação para papéis), testes.
- **Contrato:** §6 (precedência) + §9.1 (papéis Codex); restrição cobre valores `free-text` e preserva `name`/chaves/`importance`/`icon`; uma única materialização (I1).
- **Mudanças:** call site passa `languagePolicy` + `projectId` (já presente); gate materializa política para extração estruturada conforme capability da rota (§8); seed chinês persistido permanece — a política na borda é a correção, não a edição do template.
- **Validação:** teste de payload final para `codex.extract` com projeto pt-BR/en/zh-CN; parser continua aceitando candidatos bem formados; budget de contexto preserva a política (trim protegido).
- **Completude:** reprodução do cenário das imagens 229–240 coberta por teste (fonte pt/en → valores no idioma do projeto).
- **Rollback:** remover declaração de `languagePolicy` do call site → volta ao estado da Fase 1.

### Fase 4 — Papéis de campo no registry + parsers (Codex, reverse, Agents)

- **Objetivo:** registrar papéis (`free-text`/`preserve`/`canonical-id` ou vocabulário equivalente) em `FIELD_REGISTRY`/`AdoptionSchema`/schemas existentes e fazer parsers validarem por papel antes de `adopt()`.
- **Arquivos prováveis:** `src/lib/registry/field-registry.ts`, `src/lib/registry/adoption-schema.ts`, `src/lib/ai/adapters/structured-extract-adapter.ts`, `src/lib/ai/inspiration-reverse.ts`, auditoria de `src/lib/agent/*.ts` e workflows com JSON user-facing, testes (`tests/registry/parsers.test.ts` e novos).
- **Contrato:** §9; validação no candidate pipeline, escrita completa/sem parcialidade; `adopt()` permanece sem detecção de idioma (D7); nenhum registro paralelo (D11). **Ordem M3:** primeiro a alteração de registro (`FIELD_REGISTRY`/`AdoptionSchema`) com testes e guards (`npm run check:architecture`, `npm run check:required-tables`, testes de registry) verdes; só então parsers/adapters passam a depender dos papéis.
- **Mudanças:** papéis por campo nos alvos auditados; parser rejeita candidato com `free-text` em idioma errado apenas quando o validator estiver em modo bloqueio (Fase 6) — nesta fase a estrutura de papéis fica pronta e testada.
- **Validação:** contraexemplos: chave/enum/nome próprio/CJK legítimo preservados; candidato inválido rejeitado inteiro; `check:required-tables` e `check:architecture` verdes.
- **Completude:** Codex, reverse e alvos auditados com papéis registrados e testes verdes.
- **Rollback:** reverter registros de papel; parsers voltam ao estado pré-fase.

### Fase 5 — Validator shadow + evals

- **Objetivo:** ligar validação de idioma em modo **shadow**: aviso local, sem dados sensíveis, sem bloqueio, sem alteração de resultado.
- **Arquivos prováveis:** módulo novo de validator consumido pelo candidate pipeline (antes de `adopt()`), store/diagnóstico local existente, testes.
- **Contrato:** D8 — shadow primeiro; nenhum dado sensível no aviso; CJK isolado nunca é sinal; bloqueio permanece desligado por padrão.
- **Mudanças:** coleta de taxa de falso positivo por família (Codex/reverse/agents); critérios de promoção definidos por eval (conjunto de avaliação versionado no repositório de testes).
- **Validação:** testes de shadow (aviso emitido, dado não alterado, `adopt()` intocado); eval baseline executável localmente.
- **Completude:** evals rodam e produzem métricas; decisão de promoção registrada antes da Fase 6.
- **Rollback:** desligar shadow (flag/config), sem perda de dados.

### Fase 6 — Retry semântico (1×) + enforcement

- **Objetivo:** após evals satisfatórios, promover bloqueio e retry semântico de no máximo 1 tentativa para casos selecionados.
- **Arquivos prováveis:** candidate pipeline, infraestrutura de geração/budget existente (`src/lib/generation/generation-node.ts`, `src/lib/agent/team-execution.ts`), testes.
- **Contrato:** D8 — retry fora do transporte HTTP e fora de `adopt()`, reutilizando budget/generation infrastructure; bloqueio só onde os evals autorizarem; escrita completa (retry substitui o candidato inteiro).
- **Validação:** contraexemplos de falso positivo (§12) como gating; teste de orçamento (retry não estoura budget); nenhum retry em `language-neutral`/`none`.
- **Completude:** bloqueio ativo apenas para famílias aprovadas em eval; shadow mantido como diagnóstico.
- **Rollback:** voltar famílias individuais para shadow (config por família), sem revert code.

### Fase 7 — Inventário final, consolidação de materializadores e capability de placement

- **Objetivo:** consolidar todos os materializadores de idioma (incluindo outline e simulation) e a capability matrix (§8) em todas as rotas/adapters ativos, eliminando colocação ad-hoc e dupla materialização.
- **Etapas:**
  1. **7.1 Inventário final:** fechar o inventário de materializadores (linhas "Materializadores paralelos" de §4): outline (`generation-plan.ts` + `outline-adapter.ts` + `generation-node.ts` com `mixed`), simulation (`SimulationRuntimePanel.tsx` → `ttrpg.ts`/`npc-evolution.ts`) e varredura de caminhos restantes (workflows, agents `agent-*`). Registrar no plano qualquer caminho novo encontrado.
  2. **7.2 Consolidação:** cada rota passa a ter exatamente uma materialização efetiva (I1). Outline: eliminar a duplicação (adapter OU gate materializa, conforme capability — nunca ambos). Simulation: a diretiva `system` existente vira placement `native-system` declarado por capability ou migra para o placement único da rota.
  3. **7.3 Capability matrix:** declaração de capability por rota/adapter em todas as rotas ativas.
- **Arquivos prováveis:** `src/lib/outline/generation-plan.ts`, `src/lib/ai/adapters/outline-adapter.ts`, `src/lib/outline/generation-node.ts`, `src/components/outline/useOutlineGenerationController.ts`, `src/components/outline/useOutlineBatchGeneration.ts`, `src/components/simulation/SimulationRuntimePanel.tsx`, `src/lib/simulation/ttrpg.ts`, `src/lib/simulation/npc-evolution.ts`, `src/lib/ai/client.ts` (`buildRequest`/adapters), definições de rota em `task-routing.ts`, testes de placement único (propostos).
- **Contrato:** I1 em todas as rotas; placement declarado por capability; nenhuma dupla representação; fallback textual marcado é serialização da mesma política. Isenção temporária de um caminho exige justificativa, fronteira exata e data/critério de remoção documentados (decisão vigente: **sem isenção** para outline/simulation).
- **Validação:** teste por rota ativa: exatamente uma materialização efetiva no payload final; testes existentes de outline/simulation verdes (`R-AUDIT6-outline-generation-plan`, `R-PHASE3-outline-title-language`, `R-AUDIT6-outline-generation-controller`, `R-AUDIT6-outline-batch-controller`, `R-PIPELINE1-generation-node`, `R-I18N-P2-workshop-language-contracts`); providers sem canal de sistema caem no fallback marcado.
- **Completude:** **nenhum caller paralelo de materialização de idioma** (inventário 7.1 sem pendências, ou isenções documentadas); matriz §8 coberta por teste para cada rota registrada.
- **Rollback:** por caminho — outline/simulation revertidos ao comportamento pré-consolidação (documentado em §4); capability volta ao placement anterior por rota.

### Fase 8 (futura, fora da primeira execução) — Seed cleanup por família

- **Objetivo:** avaliar seeds chineses persistidos (`src/lib/ai/prompt-seeds-tools.ts` e demais
  `prompt-seeds*.ts`) **por família**, com migração/reseed/lifecycle próprio.
- **Status:** D10 — não executar agora; exige decisão sobre inglês não neutro, migração de
  templates persistidos e integridade de seed (`tests/regression/R-AUDIT6-prompt-seed-integrity.test.ts`).
- **Pré-condição:** Fases 1–7 consolidadas; proposta separada com lifecycle de reseed.

## 11. Testes e tiers de validação (FAST / DOMAIN / GLOBAL / RELEASE)

> Os nomes de tier são convenção deste plano; o repositório não possui scripts com esses nomes.
> Cada tier mapeia para comandos reais de `package.json`/`vitest.config.ts`.

| Tier | O que roda | Comandos | Quem roda |
|---|---|---|---|
| FAST | Teste(s) unitário(s) do arquivo alterado | `npx vitest run tests/registry/output-language-gate.test.ts` (ou arquivo específico) | Worker |
| DOMAIN | Suíte do domínio afetado + diagnósticos direcionados | `npx vitest run tests/registry` e/ou `tests/regression` conforme escopo; diagnósticos locais específicos quando existirem | Worker |
| GLOBAL | Todos os gates: `check:required-tables`, `check:ai-manual`, `check:architecture`, `check:source-reachability`, `check:roadmap`, `check:agent-context`, `check:canon-coverage`, `check:project-metrics`, `check:dependencies`, `lint`, `tsc`, coverage, `build`, bundle-size | `npm run ci` | **Somente orquestrador** |
| RELEASE | GLOBAL + E2E em dados de navegador isolados | `npm run ci` + `npm run ci:e2e` | **Somente orquestrador** |

- **Worker não roda gates globais.** Worker entrega FAST + DOMAIN verdes e reporta; GLOBAL/RELEASE
  são decisão e evidência do orquestrador (resultado parcial nunca é reportado como CI totalmente verde).
- Testes por natureza: unitários (parsers, gate, barreira, papéis) em `tests/registry/`;
  integração/regressão (concorrência, payload final, rotas) em `tests/regression/`; e2e (UI real,
  projeto de preview isolado — nunca o projeto do autor) via Playwright (`playwright.config.ts`).
- Evidência mínima por fase: testes novos FAST/DOMAIN + checks de arquitetura quando houver
  registro afetado + `git diff --check`. O `npx tsc --noEmit` completo, `npm run build` e demais
  gates globais/release ficam exclusivamente com o dono de integração GLOBAL/RELEASE.

## 12. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Falsos positivos do validator (bloquear texto correto) | Shadow antes de bloqueio (Fase 5); evals com critérios registrados; bloqueio por família, reversível individualmente. |
| Nomes próprios/citações/CJK legítimo tratados como erro | Papel `preserve` explícito; CJK isolado nunca é critério (D8); projetos zh-CN têm o idioma como alvo legítimo. |
| Prompts customizados do usuário sobrescritos ou detectados como bloco StoryForge | Política autoritativa só toca bloco com marcador versionado (D5); teste dedicado desde a Fase 0. |
| Templates/seeds persistidos (chinês) | Não mexer agora (D10); correção via política na borda (Fase 3); Fase 8 trata lifecycle. |
| Token budget/trim estourado pela política injetada | Reusar trim protegido existente (`detectInjectedOutputConstraint` + `trimMessagesToFit`); teste de preservação no payload final; placement `native-system` quando disponível alivia o orçamento da última `user`. |
| Provider incompatível com placement escolhido | Capability matrix por rota/adapter (não por modelo); fallback textual marcado como mesma política; testes por rota. |
| Dados locais do autor (IndexedDB é produção, sem staging) | Zero mudança de schema/tabela neste plano; fail-closed protege geração; nenhum write destrutivo; isolamento de projeto de teste em e2e. |
| Corrida entre mudança de `contentLanguage` e geração | Barreira §7 com fila serializada e flush aguardado; testes de concorrência desde a Fase 0. |

## 13. Dependências

- Fase 0 ← nenhuma (só testes).
- Fase 1 ← Fase 0 (golden tests).
- Fase 2 ← Fase 1 (o gate consome o flush).
- Fase 3 ← Fase 1 (política na borda); independente da Fase 2 para a declaração do call site, mas
  o cenário completo exige Fase 2 (barreira).
- Fase 4 ← Fase 3 (papéis validam o que a Fase 3 gera); registry independente.
- Fase 5 ← Fase 4 (validator precisa de papéis).
- Fase 6 ← Fase 5 (evals autorizam bloqueio/retry).
- Fase 7 ← Fase 1 (contrato de materialização) + inventário iniciado na Fase 0; pode correr em paralelo com 4–6, mas o critério global "nenhum caller paralelo" (§14) só fecha após 7.2/7.3.
- Fase 8 ← 1–7 + decisão do autor.

## 14. Critérios de aceitação, stop conditions e perguntas abertas

### Critérios de aceitação (globais)

- [ ] I1 demonstrado por teste: uma política lógica por operação e exatamente uma materialização efetiva por rota.
- [ ] Materializadores outline/simulation consolidados: nenhum caller paralelo de materialização de idioma, ou isenção temporária com justificativa/fronteira/data de remoção documentadas.
- [ ] Codex extrai valores no idioma do projeto (pt-BR/en/zh-CN) preservando `name`/chaves/enums.
- [ ] Reverse inspiration com política `project` sem propagar idioma errado ao Canon.
- [ ] Barreira de escrita: mudanças rápidas e gerações concorrentes convergem; falha aborta com zero provider calls.
- [ ] Nenhum falso positivo bloqueando nomes/citações/CJK legítimo nos conjuntos de eval.
- [ ] Três registros intactos: sem tabela nova, sem registro paralelo, `CONTEXT_SOURCES` preservando conteúdo.
- [ ] GLOBAL (`npm run ci`) verde pelo orquestrador; RELEASE quando houver UI afetada.

### Stop conditions (parar e pedir decisão)

1. Evals indicarem taxa de falso positivo acima do limiar acordado → não promover bloqueio.
2. Qualquer risco de perda/alteração de dado do autor sem caminho de rollback.
3. Provider/rota sem capability mapeável e sem fallback seguro.
4. Conflito entre documentos e código que este plano não resolve.

### Perguntas abertas (decidir antes/durante a implementação, não aqui)

1. Forma exata e versão do marcador do bloco StoryForge (`equivalente a [STORYFORGE_OUTPUT_POLICY]`).
2. Autosave vs. botão Save único em `ProjectInfoPanel` (o contrato §7 vale para ambos).
3. Onde declarar capability de placement: extensão de `task-routing.ts` ou definição de adapter própria.
4. Limiar de falso positivo por família que autoriza promoção de shadow → bloqueio.
5. Famílias de seeds a avaliar na Fase 8 e ordem.

## 15. Arquivos a tocar / proibidos na primeira execução

**Prováveis de tocar (por fase, sempre em branch `feat/i18n/<fase-ou-unidade>`):**

- Pré-requisito de governança, somente leitura: `docs/FORK-MAINTENANCE.md`.

- `src/lib/ai/client.ts` · `src/lib/ai/output-language.ts` · `src/lib/ai/content-language.ts`
- `src/lib/ai/adapters/prompt-guards.ts` · `src/lib/ai/adapters/structured-extract-adapter.ts` · `src/lib/ai/inspiration-reverse.ts`
- `src/stores/project.ts` · `src/components/project/ProjectInfoPanel.tsx`
- `src/components/codex/CodexPanel.tsx` · `src/hooks/useIncrementalInspiration.ts` · `src/lib/agent/inspiration-copilot.ts`
- `src/lib/registry/field-registry.ts` · `src/lib/registry/adoption-schema.ts`
- Outline (Fase 7): `src/lib/outline/generation-plan.ts` · `src/lib/outline/generation-node.ts` · `src/lib/ai/adapters/outline-adapter.ts` · `src/components/outline/useOutlineGenerationController.ts` · `src/components/outline/useOutlineBatchGeneration.ts`
- Simulation (Fase 7): `src/components/simulation/SimulationRuntimePanel.tsx` · `src/lib/simulation/ttrpg.ts` · `src/lib/simulation/npc-evolution.ts`
- Roadmap (Fase 0, registro): `docs/roadmap/README.md` · `docs/roadmap/CAPABILITY-BASELINE.md`
- `tests/registry/**` · `tests/regression/**` (novos e extensões)

**Explicitamente proibidos na primeira execução:**

- `src/lib/ai/prompt-seeds*.ts` (seeds persistidos — Fase 8, D10)
- `src/lib/registry/adopt.ts` (não vira detector de idioma — D7)
- `src/lib/registry/context-sources.ts` / `assembleContext` (não traduz, preserva conteúdo)
- `src/lib/registry/project-tables.ts` (nenhuma tabela nova — D11)
- `src/lib/db/schema.ts` (nenhuma migração de schema)
- `CLAUDE.md`, `AGENTS.md`, `docs/MASTER-BLUEPRINT.md` (constituição/entradas — fora de escopo; nunca editar sem autorização explícita do autor)

## 16. Registro final

- **Nenhuma mudança em código, banco, Canon ou testes é feita por este plano.** Este arquivo é
  exclusivamente planejamento; a primeira unidade de entrega executável é a Fase 0 (apenas testes).
- Toda fase usa **`feat/i18n/<fase-ou-unidade>`**, nunca `main`, e exige leitura prévia de
  `docs/FORK-MAINTENANCE.md`. A branch atual `feat/i18n-legacy` é legada e contém a fonte local do i18n
  refeito; a primeira execução parte dela isolada, preservando `vite.config.ts` modificado,
  `.opencode/` não rastreado e o plano não commitado.
- Commits de fase são locais e não presumem push. Nunca há push, PR, issue ou envio de dados ao
  upstream; publicação, exclusão, force-push, republicação, alteração de remotes e sincronização
  real são operações separadas, somente com autorização explícita, e publicação apenas para origin.
  O rollback deve ser local, reversível e específico da fase antes de qualquer publicação autorizada.
- O `origin/main` atualmente publicado é obsoleto e não é base da primeira execução; após a
  republicação autorizada, a nova `origin/main` passa a ser a base de integração.
- Erro upstream `无效的令牌` observado nas evidências é assunto separado (autenticação/provider),
  fora deste escopo.

## 17. Checklist anti-desvio (antes de cada fase)

- Li `docs/FORK-MAINTENANCE.md` e confirmei `origin`/`upstream` sem alterar remotes?
- A branch é `feat/i18n/<fase-ou-unidade>`? Se estou em `feat/i18n-legacy`, tratei-a como legada e preservei o worktree sujo?
- Estou usando a base correta: estado local isolado na primeira execução ou nova `origin/main` após republicação autorizada?
- Estou implementando exatamente o escopo da fase, sem "aproveitar para"?
- A política de idioma continua única (I1) — sem segundo ponto de decisão e sem segunda materialização efetiva na rota (atenção a outline/simulation)?
- Toquei em `adopt()`, seeds, tabelas ou Canon sem autorização explícita desta fase?
- Os testes da Fase 0 continuam caracterizando/validando o comportamento esperado?
- Worker rodou só FAST/DOMAIN e deixou GLOBAL/RELEASE para o orquestrador?
- Há commit e rollback locais específicos para esta fase, sem presumir publicação?
- Não enviei nem vou enviar push, PR, issue ou dados ao upstream; qualquer publicação está explicitamente autorizada e limitada a origin?

> Qualquer item reprovado → parar e levar ao orquestrador/autor antes de continuar.

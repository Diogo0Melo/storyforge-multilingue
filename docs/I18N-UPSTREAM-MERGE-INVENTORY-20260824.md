# Inventário i18n do merge upstream — 2026-08-24 (pré-implementação)

> **Status**: inventário factual reconciliado, **anterior à implementação**.
> Não afirma migração concluída; delimita fronteira, autoridades, alvos e verificação
> para a fase de adaptação i18n do merge `9223f69`. Revisado após bloqueio Oracle:
> superfícies ausentes, enums canônicos adicionais e a lacuna real de categoria
> `runtime.*` foram incorporados (seções 3–6). Nada do descrito aqui está implementado.

## 1. Fronteira provada

| Papel | Commit | Assunto |
| --- | --- | --- |
| Merge avaliado | `9223f69` | `merge: integrate upstream/main through 2026-08-23` |
| Pai multilíngue (baseline local) | `d351bb7` | `feat(i18n): finalize language placement checkpoint` |
| Pai upstream (contrato aplicado) | `f82278d` | `chore(traffic): 归档 2026-08-23 流量数据` |

- Intervalo de inventário: **`d351bb7...f82278d`** (delta trazido pelo merge).
- **Excluídos** do escopo i18n:
  - `53a108c` e `eebc6ef` — somente dados de tráfego (`data/traffic/*.csv`), sem código,
    schema ou testes;
  - reparos funcionais downstream do Product Hub (`5236cb7`, `beea6a0`, `6caabb7`,
    `b506cf2`) — rastreados em
    [`UPSTREAM-RESYNC-AUDIT-20260824.md`](UPSTREAM-RESYNC-AUDIT-20260824.md), não aqui.

## 2. Autoridades de arquitetura (únicos pontos de entrada)

| Preocupação | Autoridade |
| --- | --- |
| Bootstrap/namespace i18n | `src/i18n/index.ts` |
| Projeção canônico → rótulo localizado | `src/i18n/display-projection.ts` (`projectCanonicalLabel` + mapas por domínio) |
| Idioma de conteúdo (único leitor de `project.contentLanguage`) | `src/lib/ai/content-language.ts` (`resolveProjectContentLanguage`) |
| Idioma de saída / gate do cliente | `src/lib/ai/output-language.ts` + gate em `src/lib/ai/client.ts` |
| Roteamento de tarefas (placement da política de idioma) | `src/lib/ai/task-routing.ts` (`OUTPUT_LANGUAGE_PLACEMENT_BY_CATEGORY`, `resolveOutputLanguagePlacement`) |

Regra: nenhuma projeção nova, leitura de idioma ou placement pode ser criada fora
dessas entradas.

## 3. Inventário UI por prioridade

Contagem ≈ linhas contendo caracteres CJK (sinal de volume, não meta exata).

### P0 — jogáveis/workbenches visíveis no fluxo principal

| Arquivo | Linhas CJK | Âncoras conhecidas |
| --- | --- | --- |
| `src/components/text-game/StoryGamePlayer.tsx` | ~130 | fallback frio de catálogo vazio (linha 313) |
| `src/components/text-game/StoryGameWorkbench.tsx` | ~247 | mapa local `NODE_LABELS` (linha 63) |
| `src/components/text-game/AdventureGamePlayer.tsx` | ~254 | mapas locais `QUEST_STATUS`/`ACTION_KIND` (52–58); journal com ternário de outcome (477) |
| `src/components/text-game/AdventureGameWorkbench.tsx` | ~106 | estados vazios/frios em prosa zh-CN |
| `src/components/text-game/AvgGamePlayer.tsx` | ~115 | rótulos de beat hardcoded `'旁白'`/`'未知角色'` (237) |
| `src/components/text-game/AvgGameWorkbench.tsx` | ~70 | opções cruas de `AvgMediaKind` (linha 32) |
| `src/components/text-game/NarrativeSimulationPlayer.tsx` | ~61 | — |
| `src/components/text-game/NarrativeSimulationWorkbench.tsx` | ~115 | — |
| `src/components/text-game/TextOpenWorldPlayer.tsx` | ~52 | — |
| `src/components/text-game/TextOpenWorldWorkbench.tsx` | ~42 | — |
| `src/components/world-engine/WorldEngineWorkspace.tsx` | ~83 | — |
| `src/components/world-engine/WorldNarrativeReleasePanel.tsx` | ~187 | `KIND_LABELS` (64), `INSTANCE_KINDS` (72) |

Classificação dos acrescidos: os quatro novos arquivos entram em **P0** por
consistência com seus pares — jogadores (`AdventureGamePlayer`, `AvgGamePlayer`,
`NarrativeSimulationPlayer`) acompanham os workbenches P0 dos respectivos jogos, e
`TextOpenWorldWorkbench` acompanha o par player/workbench P0 da família text-game
(mesmo critério que já pôs `StoryGameWorkbench` em P0).

### P1 — painéis de gestão/autoría

| Arquivo | Linhas CJK | Âncoras conhecidas |
| --- | --- | --- |
| `src/components/world-engine/WorldWorkManager.tsx` | ~21 | ternário `work.status === 'drafting' ? '创作中' : work.status` (linha 83) |
| `src/components/character-interaction/InteractionGameWorkbench.tsx` | ~107 | — |
| `src/components/worldview/WorldviewAgentControls.tsx` | ~19 | — |
| `src/components/editor/EmotionBeatCard.tsx` | ~33 | — |

### P2 — configurações

| Arquivo | Linhas CJK |
| --- | --- |
| `src/components/settings/ProjectStorageWorkspacePanel.tsx` | ~39 |

### Fallbacks frios (StoryGame / Adventure / Narrative Simulation / Open World)

Componentes de jogo renderizam prosa zh-CN fixa em estado frio (sem snapshot/publicação),
ex.: `StoryGamePlayer.tsx:313`
("还没有可游玩的分支叙事，请先在作者工作台完成发布。"). Esses textos devem virar chaves
resolvidas via `useDomainT` no primeiro render, senão o cold mount exibe chinês em
qualquer locale — mesma classe de bug que `tests/e2e/workspace-cold-i18n.spec.ts`
já cobre para a sidebar. A cobertura de cold mount deve se estender
obrigatoriamente aos players de **Narrative Simulation** e **Open World**
(`NarrativeSimulationPlayer.tsx`, `TextOpenWorldPlayer.tsx`), além dos players
StoryGame/Adventure/Avg já listados.

## 4. Projeções canônicas necessárias (adições em `display-projection.ts`)

Valores persistidos permanecem canônicos no storage; apenas o rótulo é projetado.

| Enum | Valores canônicos | Alvos de render direto confirmados |
| --- | --- | --- |
| `Work.status` (= `ProjectStatus`) | `drafting`, `ongoing`, `paused`, `completed` | `WorldWorkManager.tsx:83` |
| `NarrativeModule.kind` | `main`, `side`, `quest`, `opening`, `free` | `WorldNarrativeReleasePanel.tsx` (`KIND_LABELS`: 64, 221, 434, 456, 458, 527, 546) |
| `NarrativeNode.kind` | `entry`, `scene`, `choice`, `ending` | `StoryGameWorkbench.tsx` (`NODE_LABELS`: 63, 362, 365, 373) |
| `AvgMediaKind` | `background`, `character-pose`, `character-expression`, `cg`, `ui`, `bgm`, `ambience`, `sfx`, `voice` | `AvgGameWorkbench.tsx:32` (`<option>{value}</option>` cru) e lista de assets |
| `SimulationSessionKind` | `sandbox`, `npc-evolution`, `ttrpg`, `chatgame`, `storygame`, `textadventure`, `avg`, `textsimulation`, `textworld` | `WorldNarrativeReleasePanel.tsx` (`INSTANCE_KINDS`: 72, 524); `SimulationRuntimePanel.tsx:62–71` já tem `KIND_LABEL_KEYS`/`KIND_FALLBACK_LABELS` — absorver em `display-projection.ts`, não duplicar |
| `NarrativeBeatKind` | `narration`, `dialogue`, `action`, `system` | `StoryGameWorkbench.tsx` (`BEAT_LABELS`: ~89–115, 366, 377); `StoryGamePlayer.tsx` (`displayBeat`: 99–106, rótulos fixos `'行动'`/`'系统'`); `AvgGamePlayer.tsx:237` (`'旁白'`/`'未知角色'`) |
| `AdventureQuestStatus` | `locked`, `available`, `active`, `completed`, `failed` | `AdventureGamePlayer.tsx:52–53` (mapa local `QUEST_STATUS`; renders 278 e 476) |
| `AdventureActionKind` | `look`, `move`, `talk`, `take`, `give`, `use`, `inspect`, `attempt`, `rest`, `quest-action` | `AdventureGamePlayer.tsx:57–58` (mapa local `ACTION_KIND`; render 477) |
| `AdventureCheckOutcome` | `success`, `costly-success`, `failure`, `not-attempted` | `AdventureGamePlayer.tsx:477` (ternário parcial `=== 'success' ? '成功' : item.outcome` — cai cru para os demais valores) |

Direção das projeções acrescidas: storage permanece canônico; cada enum ganha **um
mapa compartilhado** em `display-projection.ts`, consumido pelas duas pontas
(workbench de autoria e player), eliminando os mapas locais duplicados hoje
espelhados entre workbench e player.

**Preservados como canônicos (intencionais, não classificar como pendência):**
valores persistidos fora do conjunto canônico caem crus por design (contrato do
cabeçalho de `display-projection.ts`); `LocationTag` permanece chinês canônico no
storage; nenhum valor canônico vaza chave i18n crua (fallback = valor persistido).

**Rótulos de eval do Harness são intencionais:** fixtures/rótulos dentro dos caminhos
de avaliação do AI Harness não são UI de autor; permanecem neutros e devem ser
classificados INTENTIONAL, não migrados.

## 5. Superfície AI — lacuna real de categoria `runtime.*` (não corrigida)

**Achado Oracle confirmado no código:** os quatro caminhos de Harness de runtime emitem
categoria dinâmica `` `runtime.${input.skillId}` `` —
`src/lib/adventure/harness.ts:246`,
`src/lib/narrative-simulation/harness.ts:247`,
`src/lib/character-interaction/harness.ts:397`,
`src/lib/open-world/harness.ts:139`. Nenhum prefixo `runtime` está registrado em
`classifyAITask` (`task-routing.ts:62–138`) nem em
`OUTPUT_LANGUAGE_PLACEMENT_BY_CATEGORY`; logo essas chamadas caem fora de todos os
buckets → `taskKind = null` (ficam no modelo global, sem rota dedicada) e placement
não registrado → `'textual-fallback'` genérico, sem contrato explícito.

O restante da superfície auditada segue válido:

- As demais chamadas passam pelo gate do cliente (`client.ts`) + placement de
  `task-routing.ts`; nenhuma lê `project.contentLanguage` diretamente (únicos
  toques: normalização na escrita em `stores/project.ts` e o resolvedor
  `content-language.ts`).
- Caminhos estruturados/eval recebem intencionalmente nenhuma restrição de idioma
  criativo (neutros por design); a matriz existente está travada por
  `tests/regression/R-I18N-P7-placement.test.ts`.

**Remediação de Fase 2 — central e estreita (ainda por fazer; nada foi corrigido):**

1. Registrar as categorias `runtime.*` centralmente nos metadados de roteamento
   (`task-routing.ts`) e no gate do cliente (`client.ts`), com placement explícito —
   sem tocar nos quatro harnesses individualmente.
2. Uma regressão focada de `project.contentLanguage` cobrindo os caminhos de runtime
   (adventure, narrative simulation, character interaction, open world), provando que
   a política resolvida chega ao prompt pelo caminho central.

### Política central de runtime-skill (verificada na pesquisa; não implementada)

Os 11 skill ids abaixo existem em `src/lib/agent/skill-registry.ts` e são consumidos
pelos quatro harnesses via `` category: `runtime.${skillId}` ``. O registro central
deve implementar exatamente esta tabela:

| Categoria completa | Bucket / placement | Política de idioma | Verificado em |
| --- | --- | --- | --- |
| `runtime.prose.adventure-intent-parser` | functional-structured | none (sem restrição de idioma) | `skill-registry.ts:2314`, `adventure/harness.ts` |
| `runtime.prose.interaction-scene-director` | functional-structured | none | `skill-registry.ts:2274`, `character-interaction/harness.ts` |
| `runtime.character.interaction-memory-curator` | functional-structured | none | `skill-registry.ts:2294`, `character-interaction/harness.ts` |
| `runtime.prose.adventure-result-narrator` | creative | project (`contentLanguage` resolvido) | `skill-registry.ts:2354`, `adventure/harness.ts` |
| `runtime.character.interaction-reply` | creative | project | `skill-registry.ts:2254`, `character-interaction/harness.ts` |
| `runtime.prose.simulation-turn-briefing` | creative | project | `skill-registry.ts:2374`, `narrative-simulation/harness.ts` |
| `runtime.prose.simulation-advisor-performance` | creative | project | `skill-registry.ts`, `narrative-simulation/harness.ts` |
| `runtime.prose.simulation-outcome-narrator` | creative | project | `skill-registry.ts`, `narrative-simulation/harness.ts` |
| `runtime.prose.simulation-actor-action-suggestion` | creative | project | `skill-registry.ts`, `narrative-simulation/harness.ts` |
| `runtime.prose.open-world-quest-expression` | creative | project | `skill-registry.ts:2454`, `open-world/harness.ts` |
| `runtime.prose.open-world-scene-narration` | creative | project | `skill-registry.ts:2474`, `open-world/harness.ts` |

**Regras de registro exato e fechamento (obrigatórias no roteamento central):**

- O roteamento central registra **exatamente as 11 categorias completas aprovadas da
  tabela acima** — ou uma allowlist igualmente fechada, validada antes do roteamento.
  Somente entradas exatas: sem fallback genérico e sem correspondência por prefixo
  (`runtime.prose.*`, `runtime.character.*` ou qualquer outro).
- Não existe recomendação ou tolerância a prefixo criativo `runtime.prose.*` nesta
  especificação: os 8 casos criativos são entradas individuais completas, não um
  namespace com política própria.
- **Nenhuma política genérica ou de prefixo `runtime.*` é válida**: categoria
  `runtime.*` desconhecida continua falhando fechado (sem rota dedicada, sem política
  herdada), nunca silenciosamente aceita por catch-all ou por herança de namespace.
- A listagem das entradas estruturadas antes das criativas permanece apenas como
  clareza de leitura; com registro somente-exato ela não produz nenhum efeito de
  correspondência.

Proibido: consertar por chamada (bypass por harness), injetar idioma localmente em
qualquer Harness ou espalhar injeção de idioma fora das autoridades da seção 2.

## 6. Matriz proposta de escrita/teste (lanes ordenadas, sem expansão de escopo)

**Lane A — autoridade AI (independente, primeiro):**
1. Registrar em `task-routing.ts`/`client.ts` (metadados centrais) **exatamente as
   11 categorias completas da tabela da seção 5** — ou allowlist igualmente fechada,
   validada antes do roteamento; somente entradas exatas, sem fallback genérico ou
   por prefixo `runtime.*`. A ordem estruturadas→criativas é apenas clareza de
   leitura e não implica correspondência por prefixo.
2. Contrato de teste da lane: exercitar **as 11 categorias pelo caminho real de
   metadados `chat(..., { category, projectId })`** (não por helpers internos
   chamados diretamente), provando que:
   - as 8 criativas resolvem e injetam o `project.contentLanguage` do projeto no
     prompt;
   - as 3 estruturadas não adicionam nenhuma restrição de idioma;
   - categorias falsas **`runtime.unknown.fake-skill`** e **`runtime.prose.unknown`**
     falham fechado em produção através dos metadados reais do cliente — nenhuma das
     duas herda a política creative/project, pula silenciosamente o gate ou cai no
     modelo global sem contrato.
3. Regressão focada de `project.contentLanguage` nos quatro caminhos de runtime.
4. Reexecutar `tests/regression/R-I18N-P7-placement.test.ts` estendido às novas
   categorias; gates existentes (`tests/registry/i18n-ns-usage.test.ts`,
   `i18n-values.test.ts`) continuam valendo.

**Lane B — projeção compartilhada + contrato de locales (serial, após A):**
4. Adicionar os nove mapas da seção 4 em `display-projection.ts` e estender
   `tests/regression/R-i18n-display-projections.test.ts` (presença nos 3 locales +
   fallback de valor canônico), absorvendo os mapas locais duplicados
   (`KIND_LABELS`, `NODE_LABELS`, `BEAT_LABELS`, `QUEST_STATUS`, `ACTION_KIND`,
   `INSTANCE_KINDS`).

**Lane C — consumidores (paralelizável por tier, após B):**
5. Migrar os componentes P0 → P1 → P2 para `useDomainT` + mapas compartilhados;
   regressão direcionada nova por lote.
6. Estender o padrão de `tests/e2e/workspace-cold-i18n.spec.ts` para cold mounts de
   StoryGamePlayer/Adventure/Avg **e Narrative Simulation/Open World** (zero chave
   crua em estado frio).

**Guarda:** nenhuma lane expande para schema, `PROJECT_TABLES`, `FIELD_REGISTRY` ou
`CONTEXT_SOURCES`; o inventário não cria tabelas nem campos novos — só leitura de
valores já persistidos e metadados de roteamento.

## 7. Remanescentes da segunda auditoria

Todo remanescente apontado pela segunda auditoria (string CJK ainda presente após
P0–P2) precisa ser classificado **FIXED** (vira chave/projeção) ou **INTENTIONAL**
(com razão de uma linha — dado canônico, eval do Harness etc.) antes do fechamento.
Nenhum remanescente pode ficar sem classificação.

## 8. Guarda de escopo

Este documento é inventário pré-implementação. Não afirma trabalho concluído, não
substitui os reparos do Product Hub (ver
[`UPSTREAM-RESYNC-AUDIT-20260824.md`](UPSTREAM-RESYNC-AUDIT-20260824.md)) e não
autoriza alterações fora das autoridades da seção 2.

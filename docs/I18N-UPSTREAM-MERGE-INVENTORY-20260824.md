# Inventário i18n do merge upstream — 2026-08-24 (pré-implementação)

> **Status**: inventário factual reconciliado, **anterior à implementação**.
> Não afirma migração concluída; delimita fronteira, autoridades, alvos e verificação
> para a fase de adaptação i18n do merge `9223f69`.

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
| `src/components/text-game/AdventureGameWorkbench.tsx` | ~106 | estados vazios/frios em prosa zh-CN |
| `src/components/text-game/AvgGameWorkbench.tsx` | ~70 | opções cruas de `AvgMediaKind` (linha 32) |
| `src/components/text-game/NarrativeSimulationWorkbench.tsx` | ~115 | — |
| `src/components/text-game/TextOpenWorldPlayer.tsx` | ~52 | — |
| `src/components/world-engine/WorldEngineWorkspace.tsx` | ~83 | — |
| `src/components/world-engine/WorldNarrativeReleasePanel.tsx` | ~187 | `KIND_LABELS` (64), `INSTANCE_KINDS` (72) |

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

### Fallbacks frios (StoryGame / Adventure)

Componentes de jogo renderizam prosa zh-CN fixa em estado frio (sem snapshot/publicação),
ex.: `StoryGamePlayer.tsx:313`
("还没有可游玩的分支叙事，请先在作者工作台完成发布。"). Esses textos devem virar chaves
resolvidas via `useDomainT` no primeiro render, senão o cold mount exibe chinês em
qualquer locale — mesma classe de bug que `tests/e2e/workspace-cold-i18n.spec.ts`
já cobre para a sidebar.

## 4. Projeções canônicas necessárias (adições em `display-projection.ts`)

Valores persistidos permanecem canônicos no storage; apenas o rótulo é projetado.

| Enum | Valores canônicos | Alvos de render direto confirmados |
| --- | --- | --- |
| `Work.status` (= `ProjectStatus`) | `drafting`, `ongoing`, `paused`, `completed` | `WorldWorkManager.tsx:83` |
| `NarrativeModule.kind` | `main`, `side`, `quest`, `opening`, `free` | `WorldNarrativeReleasePanel.tsx` (`KIND_LABELS`: 64, 221, 434, 456, 458, 527, 546) |
| `NarrativeNode.kind` | `entry`, `scene`, `choice`, `ending` | `StoryGameWorkbench.tsx` (`NODE_LABELS`: 63, 362, 365, 373) |
| `AvgMediaKind` | `background`, `character-pose`, `character-expression`, `cg`, `ui`, `bgm`, `ambience`, `sfx`, `voice` | `AvgGameWorkbench.tsx:32` (`<option>{value}</option>` cru) e lista de assets |
| `SimulationSessionKind` | `sandbox`, `npc-evolution`, `ttrpg`, `chatgame`, `storygame`, `textadventure`, `avg`, `textsimulation`, `textworld` | `WorldNarrativeReleasePanel.tsx` (`INSTANCE_KINDS`: 72, 524); `SimulationRuntimePanel.tsx:62–71` já tem `KIND_LABEL_KEYS`/`KIND_FALLBACK_LABELS` — absorver em `display-projection.ts`, não duplicar |

**Preservados como canônicos (intencionais, não classificar como pendência):**
valores persistidos fora do conjunto canônico caem crus por design (contrato do
cabeçalho de `display-projection.ts`); `LocationTag` permanece chinês canônico no
storage; nenhum valor canônico vaza chave i18n crua (fallback = valor persistido).

**Rótulos de eval do Harness são intencionais:** fixtures/rótulos dentro dos caminhos
de avaliação do AI Harness não são UI de autor; permanecem neutros e devem ser
classificados INTENTIONAL, não migrados.

## 5. Superfície AI — sem adaptação necessária

- Todas as chamadas auditadas passam pelo gate do cliente (`client.ts`) + placement
  de `task-routing.ts`; nenhuma lê `project.contentLanguage` diretamente (únicos
  toques: normalização na escrita em `stores/project.ts` e o resolvedor
  `content-language.ts`).
- Caminhos estruturados/eval recebem intencionalmente nenhuma restrição de idioma
  criativo (neutros por design); a matriz está travada por
  `tests/regression/R-I18N-P7-placement.test.ts`.
- Consequência: fase 1 não exige mudança em `src/lib/ai/**` além do que as
  autoridades já fornecem.

## 6. Verificação planejada (reuso primeiro)

1. Estender `tests/regression/R-i18n-display-projections.test.ts` com os cinco mapas
   novos (presença nos 3 locales + fallback de valor canônico).
2. Manter gates existentes: `tests/registry/i18n-ns-usage.test.ts`,
   `tests/registry/i18n-values.test.ts` (disciplina de namespace/valores das chaves novas).
3. Estender o padrão de `tests/e2e/workspace-cold-i18n.spec.ts` para cold mounts de
   StoryGamePlayer/Adventure/Avg (zero chave crua em estado frio).
4. Reexecutar `tests/regression/R-I18N-P7-placement.test.ts` como prova de que a
   superfície AI não mudou.
5. Regressão direcionada nova por tier (P0/P1/P2) conforme cada lote pousar.

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

# Contrato de chaves — i18n residual pós-merge upstream

> Contrato de implementação da Fase 1 de `docs/I18N-UPSTREAM-MERGE-PLAN.md`.
> Este arquivo define ownership, classificação e evidência esperada; não é um
> inventário de textos traduzidos nem autoriza mudanças de dados persistidos.

## Estado e limites

- Worktree: `.slim/worktrees/upstream-integration`, branch `sync/upstream/2026-08-23`.
- Baseline funcional: `97078f7`; revisão de plano Oracle 1/4 aprovada em `a950adc`.
- A Fase 1 não altera componentes, locale JSON, schemas, registries de dados ou
  contratos de IA. Os writers da Fase 2 só começam após Oracle 2/4.
- A revisão read-only do Designer foi tentada duas vezes (`des-1`, `des-2`),
  mas o provedor do modelo estava indisponível. O Orchestrator fez a revisão
  conservadora de copy/acessibilidade abaixo; nenhuma decisão visual muda o
  layout ou a interação existentes.

## Owners e regras de namespace

| Área | Componentes | Owner de tradução | Namespace | Arquivos de locale | Guard/test owner |
|---|---|---|---|---|---|
| Simulation | `ChatGamePanel.tsx` | Lane A | `simulation.chatGame.*` | `simulation.json` (3 locales) | `R-CHATGAME2BC-ui.test.tsx` + projection guard |
| Storage | `ProjectStorageFolderField.tsx` | Lane B | `settings.projectStorage.*` | `settings.json` (3 locales) | `R-PROJECT-STORAGE-FOLDER-i18n.test.tsx` |
| Editor | `ChapterEditorToolbar.tsx` | Lane C | `editor.chapterEditorToolbar.*` | `editor.json` (3 locales) | `R-AUDIT6-chapter-editor-toolbar.test.tsx` |
| Editor lifecycle | trecho de `ChapterEditor.tsx` | Lane C | `editor.chapterEditor.*` | `editor.json` (3 locales) | `R-I18N-CHAPTER-POST-ADOPTION.test.tsx` |

`ProjectStorageFolderField` é um componente em `components/shared`, mas o
contrato aprovado reutiliza a semântica e o bundle já usado pelo painel de
settings. Portanto, a chamada `useDomainT('settings')` será uma entrada
explícita em `CROSS_NS_ALLOWLIST` para
`components/shared/ProjectStorageFolderField.tsx`, com comentário justificando
que a criação do projeto precisa carregar `settings.projectStorage` a frio.
Não será criado `shared.projectStorageField` nem um resolver cross-namespace.

## Convenções de copy, placeholders e dados

1. Toda ocorrência abaixo classificada como **FIXED** deve usar `t()` do owner
   namespace. Isso inclui texto de botão, estado vazio, erro visível,
   `placeholder`, `title`, `aria-label` e `sr-only`.
2. Placeholders são contratos exatos. Os nomes não podem variar entre
   `pt-BR`, `en` e `zh-CN`; valores dinâmicos entram como interpolação e nunca
   são traduzidos.
3. IDs, hashes, receipts, protocol badges (`CHATGAME-*`, `H57`, `Run #id`),
   nomes de tabela/policy, conteúdo de autor, títulos de release/sessão,
   razões escritas pelo autor, textos de ação e choices permanecem dinâmicos
   ou canônicos. Somente o label ao redor deles é localizado.
4. `InteractionMemoryKind` é canônico. Sua exibição usará o mapa compartilhado
   `INTERACTION_MEMORY_KIND_LABEL_KEYS` em `display-projection.ts` e chaves
   `simulation.chatGame.memoryKind.*`; nunca um dicionário local no componente.
5. Erros operacionais (`store.error`, `item.error`, `transitionError` e
   `impact*Error`) serão apresentados como mensagem estável/localizada no
   boundary de UI. O detalhe cru pode permanecer em diagnóstico de developer,
   mas não será interpolado como copy visível sem classificação explícita.
6. Listas de nomes/sequências não usarão `join('、')`. O formatter de lista
   existente será a autoridade; quando uma frase exigir interpolação, a lista
   formatada será o valor de `{{participants}}` ou `{{sources}}`.
7. Labels podem ser mais longos em inglês/português. O writer deve preservar
   `min-w-0`, truncamento, flex wrapping e controles existentes; não reduzir
   copy removendo contexto de segurança para caber visualmente.

## Manifesto de chaves — Simulation

Todas as chaves deste bloco pertencem a `simulation.chatGame`. Chaves já
existentes (`newSession`, `regenerate`, `messagePlaceholder`, `stopStreaming`,
`send`, `checkpointHeading`, `checkpointPlaceholder`, `saveCheckpoint`,
`branchHeading`, `branchPlaceholder` e `branchAction`) são reutilizadas sem
renomear.

| Ocorrência/estado | Chave nova ou reutilizada | Placeholders | Classificação/nota |
|---|---|---|---|
| scope não pronto | `scopeNotReadyTitle`, `scopeNotReadyDesc` | — | FIXED; empty state |
| sidebar de releases | `releasesSidebarHeading`, `releasesSidebarDesc` | — | FIXED; badges `CHATGAME-1` permanecem literais |
| metadados do release | `releaseMetaLine` | `version`, `profiles`, `scenes` | FIXED + números |
| erro do release | `releaseLoadError` | — | FIXED; detalhe cru apenas diagnóstico ou mensagem estável |
| lista vazia de releases | `noReleasesHint` | — | FIXED |
| heading de sessões | `savedSessionsHeading` | — | FIXED |
| sessão legacy | `legacyReadOnlyTag`, `sessionEventsLine`, `sessionResumable` | `seq` | FIXED; título da sessão é autoral |
| apagar sessão | `deleteSessionAria` | — | FIXED; `aria-label` |
| workspace sem sessão | `emptyTitle`, `emptyDescription` | — | FIXED |
| legacy kicker/cena | `legacyKicker`, `sceneEventMetaLine`, `legacyConversationHeading` | `scene`, `seq`, `name` | FIXED + nomes dinâmicos |
| speaker/meta de mensagem | `rolePlayer`, `messageMetaLine` | `speaker`, `seq` | FIXED + speaker dinâmico |
| aviso de replay legacy | `legacyNoticeBanner` | — | FIXED; contrato de segurança |
| release kicker/cena encerrada | `releaseKicker`, `sceneEnded`, `finishSceneAction`, `selectNextSceneHeading` | — | FIXED; release/game labels técnicos preservados |
| participantes da cena | `activeParticipantsLine` | `participants` | FIXED; valor usa formatter de lista |
| orçamento/turnos | `directorBudgetTurnLine` | `budget`, `turns`, `maxTurns` | FIXED |
| geração e início de interação | `generatingCandidates`, `emptyInteractionHint` | — | FIXED |
| hints de AI | `aiConnectedHint`, `noAiConfiguredHint` | — | FIXED; não altera policy de AI |
| salvar sem AI | `saveMessageOnly` | — | FIXED |
| relações | `relationshipHeading`, `relationshipEvidenceLine` | `before`, `after`, `reason`, `seq` | FIXED + reason autoral/dinâmica |
| memórias | `memoriesHeading`, `memorySourcesLine`, `adoptMemoryAction`, `rejectMemoryAction`, `emptyMemoriesHint` | `sources` | FIXED; fontes formatadas |
| memória canônica | `memoryKind.sceneSummary`, `memoryKind.keyMemory`, `memoryKind.commitment`, `memoryKind.secret`, `memoryKind.conflict`, `memoryKind.gift` | — | projection; valores persistidos nunca mudam |
| Narrative Choice | `narrativeChoicesHeading` | — | FIXED; `choice.text` é conteúdo/runtime |
| checkpoint em lista | `checkpointForkLine` | `name`, `seq` | FIXED + nome autoral |
| runs recuperáveis | `recoverableRunsHeading`, `recoverableRunsDesc`, `resumeRunAction` | `runId` | FIXED + ID literal |

`item.manifest.definition.title`, `item.release.label`, `session.title`,
`legacyChat.scene.description`, `rule.reason`, `rule.playerText`, `choice.text`,
`relationship.reason` e `memory.content` são conteúdo dinâmico e não recebem
chaves de tradução.

## Manifesto de chaves — Project storage

As chaves novas ficam dentro de `settings.projectStorage.folderField.*`, no
mesmo namespace e bundle do painel existente. As chaves já existentes do painel
(`title`, `description`, `unsupported`, `btnChoose`, `btnChange` e mensagens de
notice) devem ser reutilizadas quando a semântica for idêntica; o writer deve
evitar duplicatas semânticas.

| Ocorrência/estado | Chave | Placeholders | Classificação/nota |
|---|---|---|---|
| label do campo | `folderField.label` | — | FIXED |
| pasta selecionada | `folderField.selected` | `name` | FIXED + `FileSystemDirectoryHandle.name` dinâmico |
| sem pasta, browser suportado | `folderField.emptySupported` | — | FIXED |
| browser sem FSA | `folderField.unsupported` | — | FIXED |
| escolher/trocar pasta | `folderField.btnChoose`, `folderField.btnChange` | — | FIXED |
| helper de criação | `folderField.hint` | — | FIXED; preservar confirmação manual |
| permissão recusada | `folderField.errorPermissionDenied` | — | FIXED; `role=alert`/boundary visível |
| operação ocupada | `folderField.btnChoose`/`btnChange` + `folderField.busyAria` | — | `aria-busy` e nome acessível; não criar estado persistido |

O nome da pasta pode conter espaços, unicode e caracteres especiais; deve ser
interpolado, não concatenado em copy localizada. Cancelar o picker mantém o
valor anterior e não é erro. O teste deve preservar callback, disabled/busy e
unsupported behavior.

## Manifesto de chaves — Editor toolbar

As chaves pertencem a `editor.chapterEditorToolbar.*`. Os cinco botões base e
seus títulos já localizados permanecem intactos. A seguir estão as famílias
completas que o writer deve materializar; cada família inclui todas as suas
variantes de busy/empty/confirm/reject quando listadas.

| Família | Chaves/variantes obrigatórias | Placeholders | Limite de dados |
|---|---|---|---|
| dismiss e plano | `ariaDismissImpact`, `planTotalCount`, `planDeterministicCount`, `planAuthorReviewCount`, `planHashLabel` | `count`, `current`, `total`, `hash` | hash é literal |
| rebuild/replan | `btnRunDeterministicRebuild`, `btnRunDeterministicRebuildBusy`, `btnRunDeterministicRebuildTitle`, `btnReplan`, `btnReplanTitle` | — | safety copy localizada |
| H57 schedule | `h57DownstreamScheduleAria`, `h57DownstreamProgress`, `h57StatusReady`, `h57StatusAwaitingConfirmation`, `h57StatusBlocked`, `h57StatusNeedsManualAction`, `h57ScheduleSettled`, `h57ScheduleHash`, `h57CurrentPolicyAria`, `h57PolicySummary`, `h57PolicyManualModule` | `completed`, `total`, `count`, `hash`, `policyId`, `policyReason`, `module` | IDs/status/policy permanecem canônicos |
| revisão do autor | `authorReviewBannerNotice`, `authorReviewItemLabel`, `authorReviewItemSelectPlaceholder`, `authorReviewActionReviewed`, `authorReviewDecisionGroupAria`, `authorReviewDecisionAcknowledged`, `authorReviewDecisionNeedsManualAction`, `authorReviewNoteAria`, `authorReviewNotePlaceholder`, `authorReviewSubmitBtn`, `authorReviewSubmitBtnBusy`, `authorReviewSubmitBtnTitle`, `authorReviewLatestDecision`, `authorReviewReceiptHash`, `authorReviewOpenManualEntry`, `authorReviewOpenManualEntryTitle`, `authorReviewReceiptBanner` | `decision`, `hash` | decision code/receipt literal; note é author input |
| outline child Run | `h57OutlineRegenBannerNotice`, `h57OutlineRegenTargetLabel`, `h57OutlineRegenTargetSelectPlaceholder`, `h57OutlineRegenEmptySummary`, `h57OutlineRegenTriggerBtn`, `h57OutlineRegenTriggerBtnBusy`, `h57OutlineRegenTriggerBtnTitle`, `h57OutlineRegenCandidateNotice`, `h57OutlineRegenCandidateReason`, `h57OutlineRegenCandidateEvidence`, `h57OutlineRegenConfirmBtn`, `h57OutlineRegenRejectBtn`, `h57OutlineRegenChildHash`, `h57OutlineRegenReceiptBanner` | `reason`, `refs`, `hash` | candidate summary/title/reason são dados |
| timeline child Run | `h57TimelineRegenBannerNotice`, `h57TimelineRegenTargetLabel`, `h57TimelineRegenTargetSelectPlaceholder`, `h57TimelineRegenEventItem`, `h57TimelineRegenTriggerBtn`, `h57TimelineRegenTriggerBtnBusy`, `h57TimelineRegenTriggerBtnTitle`, `h57TimelineRegenCandidateNotice`, `h57TimelineRegenCurrentVal`, `h57TimelineRegenCandidateVal`, `h57TimelineRegenTimeLabel`, `h57TimelineRegenTimeUnset`, `h57TimelineRegenImportanceLabel`, `h57TimelineRegenEmptyDesc`, `h57TimelineRegenConfirmBtn`, `h57TimelineRegenRejectBtn`, `h57TimelineRegenChildHash`, `h57TimelineRegenReceiptBanner` | `title`, `id`, `time`, `importance`, `hash` | event ID/candidate data literal |
| manual patch | `impactPatchTargetLabel`, `impactPatchTargetSelectPlaceholder`, `impactPatchSummaryAria`, `impactPatchSummaryPlaceholder`, `impactPatchReasonAria`, `impactPatchReasonPlaceholder`, `impactPatchGenerateBtn`, `impactPatchGenerateBtnBusy`, `impactPatchGenerateBtnTitle`, `impactPatchCandidateNotice`, `impactPatchConfirmBtn`, `impactPatchRejectBtn`, `impactPatchEvidenceHash`, `impactRemediationReceiptBanner` | `hash` | entered summary/reason remain author content |
| perspective | `perspectiveCharacterLabel`, `perspectiveCharacterDefault` | — | character names are dynamic |

`IMPACT_REVIEW_ACTION_LABELS` será convertido em lookup por `t()` para as seis
ações aprovadas (`review-source`, `review-fact`, `review-source-record`,
`review-derived-state`, `review-outline`, `review-downstream-chapter`). As
chaves dos labels devem ser estáveis e o action code não será traduzido.

## Manifesto de chaves — Editor lifecycle

O parent usa `useDomainT('editor')` e reaproveita o grupo existente
`editor.chapterEditor.*`; não será criado namespace novo.

| Ocorrência | Chave | Placeholders | Classificação |
|---|---|---|---|
| banner de post-adoption | `postAdoptionRunBanner` | `runId` | FIXED + Run ID |
| prefixo/valores do estado da cadeia | `postAdoptionChainLabel`, `postAdoptionChainState.*` | — | FIXED; state code canônico |
| organização pendente | `postAdoptionPendingConfirmation` | — | FIXED; safety copy |
| candidatos de transição | `postAdoptionTransitionCandidates` | `count` | FIXED |
| erro de transição | `postAdoptionError` | — | mensagem estável; detalhe cru só diagnóstico |
| retomada | `postAdoptionResume` | — | FIXED; preserva callback e disabled state |

O mapa de estados deve cobrir explicitamente `downstream-completed`,
`downstream-awaiting-confirmation`, `downstream-failed`, `upstream-invalid`,
`prose-completed`, `legacy-unlinked` e o estado de execução observado, sem
persistir texto localizado.

## Evidência obrigatória antes da Fase 2

- `git diff --check` sem alterações de componentes/locale nesta fase.
- Manifesto revisado: nenhuma ocorrência visível omitida; cada placeholder tem
  o mesmo nome/cardinalidade nas três locales.
- Ownership sem conflito: locale JSON, projection map e registry guard têm um
  único owner por onda.
- Guardas selecionados passam no baseline atual:
  `i18n.test.ts`, `i18n-values.test.ts`, `i18n-ns-usage.test.ts` e
  `i18n-backend.test.ts`.
- Os testes da Fase 2 ficam definidos, mas não são falsamente marcados como
  passando antes de existirem: ChatGame, storage, toolbar e lifecycle.
- Nenhuma mudança em `CONTEXT_SOURCES`, `FIELD_REGISTRY`/`AdoptionSchema`,
  `PROJECT_TABLES`, schema, storage, AI routing ou `contentLanguage`.

## Próximo gate

Após a documentação deste contrato e os checks DOMAIN selecionados, o
Orchestrator fará o commit atômico da Fase 1. Em seguida, o Oracle 2/4 deverá
responder se este contrato evita conflito de namespace, drift de placeholders,
fallback silencioso e tradução de dado canônico. Só uma decisão **GO** libera
as lanes de implementação da Fase 2.

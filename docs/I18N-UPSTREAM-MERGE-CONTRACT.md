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

### Matriz normativa única de ownership e validação

Esta é a única matriz de ownership da Fase 1/2; as tabelas de chaves abaixo
detalham somente o conteúdo de cada owner.

| Owner | Escrita permitida | Validação sob sua responsabilidade |
|---|---|---|
| Orchestrator | `docs/*`, a entrada explícita de `components/shared/ProjectStorageFolderField.tsx` em `tests/registry/i18n-ns-usage.test.ts` e nenhuma locale/component concorrente | executar/aceitar a prova de cold mount (`R-PROJECT-STORAGE-FOLDER-i18n.test.tsx` + `tests/e2e/workspace-cold-i18n.spec.ts`) e integrar todos os gates |
| Lane A | `ChatGamePanel.tsx`, três `simulation.json`, `R-CHATGAME2BC-ui.test.tsx`; antes disso, serialmente `display-projection.ts` e `R-i18n-display-projections.test.ts` | projection exaustiva dos seis memory kinds, Simulation UI e listas |
| Lane B | `ProjectStorageFolderField.tsx`, três `settings.json`, `R-PROJECT-STORAGE-FOLDER-i18n.test.tsx` | cenários do field e evidência de cold mount para o Orchestrator; não edita o namespace guard |
| Lane C | `ChapterEditorToolbar.tsx`, todos os produtores/lifecycle visíveis de `ChapterEditor.tsx`, três `editor.json`, `R-AUDIT6-chapter-editor-toolbar.test.tsx`, `R-I18N-CHAPTER-POST-ADOPTION.test.tsx` | todos os banners/H57/erros, troca de idioma após alertas, placeholders, aria/title/sr-only e listas |

O Orchestrator é, portanto, o único owner da **prova/aceitação** de cold
mount; Lane B é apenas o owner da implementação do caso de teste e fornece a
evidência. Não existe decisão condicional ou ownership concorrente.

## Regras de namespace (resumo)

O ownership normativo está exclusivamente na matriz acima. Tecnicamente,
`ChatGamePanel` usa `simulation`, `ProjectStorageFolderField` usa
`settings` por exceção explícita, e toolbar/lifecycle usam `editor`; nenhum
resolver cross-namespace oculto será introduzido.

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
| escolher/trocar pasta | reutilizar `projectStorage.btnChoose`, `projectStorage.btnChange` | — | FIXED |
| helper de criação | `folderField.hint` | — | FIXED; preservar confirmação manual |
| permissão recusada | reutilizar `projectStorage.noticePermissionDenied` | — | FIXED; `role=alert`/boundary visível |
| operação ocupada | reutilizar botão escolhido + `folderField.busyAria` | — | `aria-busy` e nome acessível; não criar estado persistido |

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

## Remediation Oracle 2/4 — regras normativas corrigidas

> Esta seção substitui qualquer tabela anterior que agregue placeholders por
> família ou deixe ownership implícito. O contrato abaixo é a fonte normativa
> para os writers e foi acrescentado após o Oracle 2/4 retornar NO-GO em
> `8ca0529`.

### 1. Editor: todos os produtores visíveis pertencem à Lane C

Lane C não se limita ao JSX do toolbar e ao banner de post-adoption. Ela também
é dona dos produtores em `ChapterEditor.tsx` que alimentam `impactInfo`,
`impactRemediationError`, `impactReviewError`, `impactPatchError`,
`impactOutlineRegenerationError` e `impactStoryTimelineRegenerationError`, nos
trechos de recuperação (`503`, `527–553`), análise (`1947–1961`), dismiss e
operações H57 (`1969–2357`), além dos banners de qualidade e revisão explícita
(`3328–3338`). Nenhum desses textos pode permanecer como literal de UI.

| Fonte/estado | Chave normativa em `editor.chapterEditor.*` | Placeholder exato | Regra |
|---|---|---|---|
| H57 schedule indisponível | `impactRecoveryScheduleUnavailable` | nenhum | mensagem estável; raw detail só console |
| candidato de timeline recuperado | `impactRecoveryTimelineCandidate` | nenhum | FIXED |
| candidato de outline recuperado | `impactRecoveryOutlineCandidate` | nenhum | FIXED |
| dependência aguardando revisão | `impactRecoveryWaitingDependency` | `reason` | `reason` é diagnóstico/dado da revisão, não ID traduzido |
| plano corrigido recuperado | `impactRecoveryPlanSummary` | `resolved`, `remaining`, `new` | contagens numéricas |
| revisões restauradas | `impactRecoveryReviewsRestored` | `count` | contagem numérica |
| candidato de patch encontrado | `impactRecoveryPatchCandidate` | nenhum | FIXED |
| resumo da análise de impacto | `impactGraphSummary` | `facts`, `demoted`, `downstream`, `nodes`, `edges`, `stale`, `summaries`, `deterministic`, `authorConfirmed`, `hash` | cada segmento tem chave própria ou assinatura documentada; não montar literal misto |
| facts/estado/evidência do resumo | `impactFactsFromChapter`, `impactDemoted`, `impactEvidenceValid`, `impactDownstream`, `impactGraphGenerated`, `impactStaleEvidence`, `impactSummaryNodes`, `impactDeterministicPlan`, `impactAuthorPlan`, `impactGraphHash` | respectivamente `count`; `count`; nenhum; `count`; `nodes`,`edges`; `count`; `count`; `count`; `count`; `hash` | valores canônicos/contagens não são traduzidos |
| análise falhou | `impactAnalysisFailed` | nenhum | substitui raw exception |
| candidate já pendente impede dismiss | `impactPatchPendingDismiss`, `impactOutlinePendingDismiss`, `impactTimelinePendingDismiss` | nenhum | mensagem estável |
| patch criado | `impactPatchCreated` | nenhum | FIXED; receipt separado |
| outline criado | `impactOutlineCreated` | `hash` | receipt/hash literal |
| outline confirmado | `impactOutlineConfirmed` | `hash` | receipt/hash literal |
| outline rejeitado | `impactOutlineRejected` | nenhum | FIXED |
| timeline criado | `impactTimelineCreated` | nenhum | FIXED |
| timeline confirmado | `impactTimelineConfirmed` | `hash` | receipt/hash literal |
| timeline rejeitado | `impactTimelineRejected` | nenhum | FIXED |
| remediation concluída/reutilizada | `impactRemediationReused`, `impactRemediationCompleted` | `hash`, `retrievalCount` (apenas completed) | receipt e contagem permanecem literais/dinâmicos |
| plano atualizado | `impactPlanChanged`, `impactPlanUnchanged` | `previousHash`, `newHash` ou `hash` | hashes canônicos |
| revisão registrada/reutilizada | `impactReviewReused`, `impactReviewRecorded` | `hash` | receipt/hash canônico |
| manual entry inválida/erro de handoff | `impactManualEntryUnavailable`, `impactManualHandoffFailed` | nenhum | mensagem estável |
| erro operacional de cada campo | `impactReviewErrorGeneric`, `impactPatchErrorGeneric`, `impactOutlineRegenerationErrorGeneric`, `impactStoryTimelineRegenerationErrorGeneric`, `impactRemediationErrorGeneric` | nenhum | raw `Error.message` não é renderizado |
| quality gate do candidato de texto | `proseGenerationQualityGate` | nenhum | substitui `proseGenerationError` cru |
| aviso de revisão explícita | `proseCandidateExplicitReviewNotice` | nenhum | FIXED; preserva autorização explícita e custo |
| edição local adotada com fatos rebaixados | `localEditCommittedWithDemotions` | `count` | `ChapterEditor.tsx:3505–3507`; `count` numérico |
| edição local adotada sem fatos rebaixados | `localEditCommitted` | nenhum | `ChapterEditor.tsx:3505–3507`; mensagem estável |

Os nomes acima são presentation codes/chaves de renderização; não devem ser
persistidos nos contratos durable. O estado React pode guardar um union finito
de código + payload, traduzido no render, para que trocar o idioma após um
alerta não deixe texto no idioma anterior. O payload nunca inclui exception
raw em texto visível.

### 2. Assinaturas exatas de Simulation

Além das chaves já existentes, as seguintes assinaturas são obrigatórias e
substituem a tabela agregada anterior:

| Chave | Assinatura de interpolação |
|---|---|
| `chatGame.releaseMetaLine` | `version`, `profiles`, `scenes` |
| `chatGame.legacySceneEventMetaLine` | `scene`, `seq` |
| `chatGame.sceneMetaLine` | `title`, `location`, `time`, `seq` |
| `chatGame.activeParticipantsLine` | `participants` |
| `chatGame.messagePlaceholder` (existente) | `character` |
| `chatGame.messageMetaLine` | `speaker`, `seq` |
| `chatGame.relationshipEvidenceLine` | `before`, `after`, `reason`, `seq` |
| `chatGame.memorySourcesLine` | `sources` |
| `chatGame.checkpointForkLine` | `name`, `seq` |
| `chatGame.resumeRunAction` | `runId` |
| `chatGame.rolePlayer` | nenhum |
| todas as headings, badges, empty states, buttons e hints restantes de `chatGame` | nenhum |

`participants` e `sources` já chegam formatados por `Intl.ListFormat`/helper de
locale; não são separados por `join('、')`. `sceneMetaLine` inclui título,
local, hora e sequência do release ativo; `legacySceneEventMetaLine` fica
exclusivo do replay legacy. `item.manifest.definition.title`, labels de
release/sessão, rules, choices, reasons e conteúdo de memória continuam raw
author/runtime data.

### 3. Assinaturas exatas de Editor toolbar

Para cada chave sem placeholder da tabela original, a cardinalidade é zero.
As exceções e chaves que antes estavam agregadas são:

| Chave | Assinatura |
|---|---|
| `planTotalCount`, `planDeterministicCount` | `count` |
| `planAuthorReviewCount` | `current`, `total` |
| `planHashLabel`, `h57ScheduleHash`, `authorReviewReceiptHash`, `authorReviewReceiptBanner`, `h57OutlineRegenChildHash`, `h57OutlineRegenReceiptBanner`, `h57TimelineRegenChildHash`, `h57TimelineRegenReceiptBanner`, `impactPatchEvidenceHash`, `impactRemediationReceiptBanner` | `hash` |
| `h57DownstreamProgress` | `completed`, `total` |
| `h57StatusReady`, `h57StatusAwaitingConfirmation`, `h57StatusBlocked`, `h57StatusNeedsManualAction` | `count` |
| `h57ScheduleSettled` | nenhum |
| `h57ScheduleHash` | `hash` |
| `h57PolicyManualModule` | `module` |
| `authorReviewLatestDecision` | `decision` |
| `h57OutlineRegenCandidateReason`, `h57OutlineRegenCandidateEvidence` | `reason` / `refs` |
| `h57OutlineRegenTargetOption` | `title`, `summary` |
| `h57TimelineRegenEventItem` | `title`, `id` |
| `h57TimelineRegenCandidateNotice` | `title` |
| `h57TimelineRegenTimeLabel`, `h57TimelineRegenImportanceLabel` | `time` / `importance` |
| `h57TimelineRegenCandidateReason`, `h57TimelineRegenCandidateEvidence` | `reason` / `refs` |
| `impactPatchCandidateNotice` | nenhum |
| `impactPatchEvidenceHash` | `hash` |
| `authorReviewItemOption` | `action`, `table`, `recordId`, `reviewed` |
| `h57TimelineRegenTargetOption` | `title`, `id` |
| `h57PolicySummary` | `policyId`, `policyReason` |

`refs` é uma lista já formatada; `recordId`, `id`, `policyId`, `table`, hashes,
decision codes, status codes e module IDs não são traduzidos. Labels em torno
deles são. `reason`, `summary`, `title`, `note`, `time` e `importance` são
dados de candidato/autor e só recebem interpolação controlada, sem alterar o
valor.

### 4. Erros, troca de idioma e teste de apresentação

Todos os campos de erro visíveis têm owner explícito:

| Campo atual | Presentation key | Raw detail |
|---|---|---|
| `store.error`/`run` em `ChatGamePanel` | `chatGame.operationError` | console/diagnóstico; nunca texto raw |
| `item.error` ao carregar release | `chatGame.releaseUnavailable` | console/diagnóstico |
| `impactReviewError` | `chapterEditor.impactReviewErrorGeneric` | console/diagnóstico |
| `impactPatchError` | `chapterEditor.impactPatchErrorGeneric` | console/diagnóstico |
| `impactOutlineRegenerationError` | `chapterEditor.impactOutlineRegenerationErrorGeneric` | console/diagnóstico |
| `impactStoryTimelineRegenerationError` | `chapterEditor.impactStoryTimelineRegenerationErrorGeneric` | console/diagnóstico |
| `impactRemediationError` | `chapterEditor.impactRemediationErrorGeneric` | console/diagnóstico |
| `transitionError` | `chapterEditor.postAdoptionError` | console/diagnóstico |
| `proseGenerationError` | `chapterEditor.proseGenerationQualityGate` | console/diagnóstico |

Os regressions precisam criar um erro/status, mudar `en → pt-BR` (ou
`pt-BR → zh-CN`) sem remontar o componente e provar que a mensagem visível
acompanha o idioma, que a exceção raw não aparece e que o recovery callback
continua disponível. A mesma bateria cobre `impactInfo`, banners e listas.

### 5. Storage: decisão folha a folha

Não há fallback para decisão do writer:

| Necessidade do field | Decisão vinculante |
|---|---|
| choose button | reutilizar `settings.projectStorage.btnChoose` |
| change button | reutilizar `settings.projectStorage.btnChange` |
| permission error | reutilizar `settings.projectStorage.noticePermissionDenied` |
| field label | criar `settings.projectStorage.folderField.label` |
| selected | criar `settings.projectStorage.folderField.selected` com `name` |
| supported empty | criar `settings.projectStorage.folderField.emptySupported` |
| unsupported inline state | criar `settings.projectStorage.folderField.unsupported`; não reutilizar o texto longo do painel |
| creation helper | criar `settings.projectStorage.folderField.hint` |
| busy accessible name | criar `settings.projectStorage.folderField.busyAria` |

O writer não pode criar `shared.json` para este campo nem duplicar as duas
folhas de botão/permission. O Orchestrator é owner serial de
`tests/registry/i18n-ns-usage.test.ts`: adicionará a exceção explícita para
`components/shared/ProjectStorageFolderField.tsx` e seu motivo. Lane B não
edita o guard. Lane B adiciona o caso de teste de cold mount; o Orchestrator
executa e aceita a prova antes de abrir a página de settings. `PRELOAD_NS` não
muda.

### 6. Projection e post-adoption: união fechada

O passo de projection de Lane A é **obrigatório e serial**, antes das outras
lanes. O owner adicionará `INTERACTION_MEMORY_KIND_LABEL_KEYS` a
`src/i18n/display-projection.ts` para exatamente:

`scene-summary`, `key-memory`, `commitment`, `secret`, `conflict`, `gift`.

O teste `R-i18n-display-projections.test.ts` deve verificar os seis valores em
`pt-BR`, `en` e `zh-CN`, fallback canônico para valor desconhecido e ausência
de alteração no storage.

`chapterPostAdoptionChainStateV1()` tem a união fechada e as chaves abaixo:

| Estado canônico | Chave `chapterEditor.postAdoptionChainState.*` |
|---|---|
| `downstream-processing` | `downstreamProcessing` |
| `downstream-completed` | `downstreamCompleted` |
| `downstream-awaiting-confirmation` | `downstreamAwaitingConfirmation` |
| `downstream-failed` | `downstreamFailed` |
| `upstream-invalid` | `upstreamInvalid` |
| `prose-completed` | `proseCompleted` |
| `legacy-unlinked` | `legacyUnlinked` |

O banner usa `postAdoptionRunBanner(runId)`,
`postAdoptionPendingConfirmation()`, `postAdoptionTransitionCandidates(count)`,
`postAdoptionError()` e `postAdoptionResume()`. Run ID, state code, receipt,
hash, policy, table, author content e candidate content permanecem canônicos.

### 7. Test ownership corrigido e waiver do Designer

- Orchestrator: conforme a matriz normativa, editar serialmente
  `i18n-ns-usage.test.ts` e executar/aceitar a prova de cold mount; manter a
  única autoridade da projection-map/shared guard.
- Lane A: `R-CHATGAME2BC-ui.test.tsx`, `R-i18n-display-projections.test.ts`;
  incluir erro, troca de idioma, `messagePlaceholder`, scene metadata,
  memory-kind e list formatting.
- Lane B: criar `R-PROJECT-STORAGE-FOLDER-i18n.test.tsx`; incluir null,
  selected, unsupported, permission denied, busy/disabled, callback e o caso
  de cold mount da própria tela, fornecendo evidência ao Orchestrator. O
  Orchestrator executa/aceita a prova E2E `workspace-cold-i18n.spec.ts`.
- Lane C: atualizar `R-AUDIT6-chapter-editor-toolbar.test.tsx` e criar
  `R-I18N-CHAPTER-POST-ADOPTION.test.tsx`; incluir todos os produtores H57,
  quality-gate/explicit-review banners, erro raw suppression, troca de idioma
  após status/alerta, placeholders, aria/title/sr-only e list formatting.
- Os testes durable `R-HARNESS20`, `R-HARNESS41` e `R-HARNESS42` permanecem
  sem alteração sem necessidade; continuam prova de lifecycle, não substituem
  a regressão de presentation.
- Waiver de uma onda: devido às duas falhas do provedor Designer, o
  Orchestrator assume temporariamente ownership de copy e acessibilidade
  percebida para esta onda. Fixers só podem fazer wiring mecânico que preserve
  a hierarquia, spacing, wrapping, affordances e layout existentes. Se o
  provedor voltar, uma revisão read-only é bem-vinda, mas não é prerequisite;
  qualquer mudança visual substantiva exige nova decisão e não pode ser
  introduzida silenciosamente.

## Oracle 2/4 — second remediation pending validation

O segundo NO-GO do Oracle 2/4 foi agrupado nesta única remediation documental.
Ela inclui o produtor local de `ChapterEditor.tsx:3505–3507` e torna o
Orchestrator o único owner da execução/aceitação de cold mount, enquanto Lane B
somente escreve o caso de teste e fornece evidência. A matriz normativa única
reduz a duplicidade de ownership. Ainda não houve alteração de componente, locale, guard,
projection ou teste. Após esta atualização, executar somente os quatro guards
selecionados e `git diff --check`, commitar os dois documentos em um checkpoint
separado e solicitar a re-revisão 2/4. A Fase 2 continua bloqueada até
**GO**.

# Plano de conclusão — i18n pós-merge upstream

## Status e objetivo

- **Estado:** Fase 1 de contrato concluída; aguardando Oracle 2/4 antes da implementação dos writers.
- **Branch/worktree:** `sync/upstream/2026-08-23` em `.slim/worktrees/upstream-integration`.
- **Checkpoint preservado:** `97078f7` — `feat(i18n-upstream): checkpoint phase 3 UI migration (198 tests)`.
- **Objetivo:** eliminar toda UI hard-coded introduzida ou alcançada pelo upstream que ainda esteja fora da arquitetura i18n, sem traduzir dados canônicos, sem alterar contratos persistidos e sem reabrir a migração já validada fora dos quatro grupos atualmente conhecidos. A segunda auditoria pode ampliar esse escopo se encontrar outro defeito upstream-visível.
- **Resultado esperado:** todos os textos de UI, labels, placeholders, `title`, `aria-label`, estados, erros, empty states, avisos e controles dos grupos conhecidos passam pelos namespaces existentes em `pt-BR`, `en` e `zh-CN`, com regressões que impeçam o retorno do problema.

## Referências normativas

1. `AGENTS.md`: autoridade do repositório para registries, segurança de dados, commits e gates.
2. `.slim/deepwork/Migração i18n completa após merge upstream — StoryForge Multilíngue.md`: brief original copiado para referência local; suas regras de investigação, testes progressivos, auditoria final e critérios de conclusão são obrigatórias.
3. `.slim/deepwork/i18n-post-upstream-merge.md`: estado persistente, decisões Oracle anteriores, inventário upstream, evidências e este plano resumido.
4. `docs/I18N-UPSTREAM-MERGE-CONTRACT.md`: manifesto de ocorrências, ownership, placeholders, limites canônicos e evidência da Fase 1.
5. `docs/CONTEXT-ROUTING.md`: somente os trechos incidentes sobre i18n, UI, AI e testes devem ser consultados durante execução.
6. `package.json`: scripts canônicos (`ci`, `ci:e2e`, `check:*`, `lint`, `build`, Vitest e Playwright).

Não há necessidade de introduzir nova biblioteca ou buscar uma API externa: o risco é de integração com a arquitetura i18n local. A pesquisa foi feita sobre o brief, histórico Git, componentes, namespaces, call sites e testes do próprio projeto.

## Baseline confirmado

- O worktree estava limpo após o checkpoint `97078f7`; não há alteração de usuário para preservar além do escopo i18n já commitado.
- `.gitignore` já contém `.slim/deepwork/`; `.ignore` já contém `!.slim/deepwork/` e `!.slim/deepwork/**`. Não foram adicionadas duplicatas.
- Os arquivos em `.slim/deepwork/` são estado local e não fazem parte dos commits de código/documentação.
- O checkpoint anterior contém a onda i18n já validada, mas **não representa conclusão da missão**: a segunda auditoria encontrou quatro grupos Category 1.
- Não há alteração de schema, migration, table registry, `CONTEXT_SOURCES`, `FIELD_REGISTRY`, `AdoptionSchema`, `adopt()` ou contrato de IA prevista nesta retomada. Se a execução revelar uma dessas necessidades, a fase deve parar e registrar a decisão antes de editar.

## Escopo confirmado pela auditoria independente

### Category 1 — implementação obrigatória

| Domínio | Arquivo(s) | Escopo visível | Namespace/ownership planejado |
|---|---|---|---|
| Simulation / Character Game | `src/components/simulation/ChatGamePanel.tsx` (`ChatGamePanel`) | empty states, release/session labels, legacy notice, scene controls, budget/turns, memory/relationship sections, candidate/recovery actions, `aria-label`, operational errors and canonical memory-kind display | Reutilizar `simulation.chatGame`; adicionar chaves simétricas nos três `simulation.json`; usar display projection para `InteractionMemoryKind` |
| Project storage | `src/components/shared/ProjectStorageFolderField.tsx` (`ProjectStorageFolderField`) | permission error, field label, selected/unsupported states, choose/change button, helper text | Reutilizar `settings.projectStorage.*`, já usado por `ProjectStorageWorkspacePanel`; não criar namespace paralelo |
| Editor impact/H57 | `src/components/editor/ChapterEditorToolbar.tsx` (`ChapterEditorToolbar`) | action map, titles, labels, status counters, `aria-label`, placeholders, candidate diff, receipts, review controls, dynamic errors and evidence separators | Reutilizar `editor.chapterEditorToolbar.*` e ampliar o namespace `editor` nos três locales |
| Editor post-adoption | `src/components/editor/ChapterEditor.tsx` (`ChapterEditor`) | run status, candidate banners, continuation action, inline lifecycle notices and dynamic transition/impact errors | Tratar junto com o domínio Editor; usar grupo existente apropriado em `editor`, confirmado no contrato de chaves |

### Strings que não devem ser traduzidas

Continuam fora de i18n quando não são UI chrome, mas devem ser classificados na auditoria:

- identificadores de protocolo e versão (`CHATGAME-1`, `CHATGAME-2`, `vX`, `#id` e hashes) permanecem literais; labels, verbos e o texto ao redor de `Run #id` passam por i18n;
- conteúdo escrito pelo projeto/autor, títulos de demo, seed data, razões, nomes de personagem e valores armazenados;
- chaves de dados, valores de enum, métricas (`trust`, `closeness`) e payloads de protocolo permanecem canônicos no storage; qualquer enum/status apresentado ao usuário precisa de display projection;
- logs, erros internos e prefixos de integridade de store que não chegam ao usuário;
- exemplos/fixtures cujo propósito é verificar `zh-CN` ou compatibilidade histórica.

Cada ocorrência mantida precisa aparecer na auditoria final como `INTENTIONAL + motivo`; nenhuma string pode ser deixada sem classificação.

### Classificações adicionais obrigatórias

- `InteractionMemoryKind` (`scene-summary`, `commitment` e valores futuros) permanece canônico, mas sua renderização deve usar a autoridade de projeção existente ou um mapa de domínio explicitamente registrado.
- Erros operacionais visíveis em `ChatGamePanel` e `transitionError`/`impact*Error` no Editor não são automaticamente conteúdo dinâmico seguro: a UI deve mostrar mensagem estável/localizada e manter detalhes crus somente no diagnóstico de desenvolvedor.
- Separadores culturais como `join('、')` não podem permanecer hard-coded em uma string visível; usar formatter/contrato de locale existente ou chave localizada equivalente.

## Invariantes de arquitetura

1. **UI locale não é `contentLanguage`:** esta retomada não adiciona prompt, metadata, `category`, `outputKind`, `languagePolicy` ou leitura direta de `project.contentLanguage`.
2. **Um único namespace por domínio:** `simulation`, `settings` e `editor`; sem resolver cross-namespace oculto e sem namespace neutro novo.
3. **Paridade exata:** toda chave nova existe nos três locales, com placeholders idênticos, valores não vazios e sem fallback silencioso para chinês em `pt-BR`/`en`.
4. **Acessibilidade também é i18n:** todo `aria-label`, texto `sr-only`, `title`, placeholder e nome de botão entra no contrato de locale.
5. **Dados canônicos permanecem canônicos:** nenhum texto de autor, identificador, receipt, hash, enum ou storage é traduzido para parecer UI localizada; valores canônicos visíveis recebem display projection no render.
6. **Lazy/cold mount:** os namespaces existentes devem permanecer carregáveis pelo caminho atual; não aumentar `PRELOAD_NS` sem prova de necessidade.
7. **Sem bypass de registries:** se a alteração se revelar além de apresentação, parar e reavaliar `CONTEXT_SOURCES`, `FIELD_REGISTRY`/`AdoptionSchema`/`adopt()` e `PROJECT_TABLES` antes de continuar.
8. **Sem relaxar testes:** não remover assertions, não aceitar regex bilíngue permissiva e não silenciar falhas de locale para fazer a suíte passar.

## Grafo de execução e ownership

### Fase 0 — Reconhecimento, baseline e plano (concluída)

**Objetivo:** confirmar a fronteira real, proteger o estado existente e produzir este plano antes de qualquer writer.

- Inspecionar `.gitignore`, `.ignore`, `git status`, histórico e diff.
- Confirmar o checkpoint `97078f7` e deixar o worktree limpo antes da próxima onda.
- Executar três pesquisas independentes:
  - `ses_fc419877fffei9RpXD80fhUwqF`: census de `ChatGamePanel` e contrato `simulation.chatGame`;
  - `ses_fc419875dffewuTugk5OiyMEc7`: census do storage/editor e testes existentes;
  - `ses_fc4198737ffehL9Hns9WILHR2D`: matriz de testes do brief e discrepâncias das alegações anteriores.
- Reconciliar os resultados com `AGENTS.md`, o brief copiado, `package.json`, namespaces e call paths.
- **Commit encerrado:** `97078f7` preserva o código anterior; este plano será o próximo deliverable documentado.
- **Revisão Oracle 1/4:** revisar a completude do escopo e o plano antes de iniciar writers. Razão: a falha anterior foi uma auditoria final incompleta.

### Fase 1 — Contrato de chaves, ownership e guards

**Dependência:** começa somente após Oracle 1/4 aprovar o escopo.

**Objetivo:** fechar o contrato compartilhado antes de qualquer edição paralela de componente.

1. Montar uma tabela de chaves por ocorrência, com tipo de texto, placeholders, contexto, locale e classificação `FIXED`/`INTENTIONAL`; incluir `InteractionMemoryKind`, erros operacionais, `transitionError`/`impact*Error` e separadores de lista.
2. Confirmar no código os owners:
   - `simulation.chatGame.*` para `ChatGamePanel`;
   - `settings.projectStorage.*` para `ProjectStorageFolderField`, reutilizando as chaves do painel de settings quando a semântica for a mesma;
   - `editor.chapterEditorToolbar.*` para toolbar e um grupo `editor` já existente/aprovado para o lifecycle parent, sem inventar um namespace;
   - `i18n-ns-usage` somente se a regra de namespace exigir uma entrada nova.
3. Definir placeholders com nomes e cardinalidades exatas (`{{characters}}`, `{{scenes}}`, `{{budget}}`, `{{turns}}`, `{{max}}`, `{{count}}`, `{{hash}}`, `{{id}}`, etc.) e decidir para cada lista se o formatter atual ou uma chave de separador é a autoridade.
4. Verificar que identificadores técnicos (`CHATGAME-*`, hashes, IDs e conteúdo dinâmico) não sejam encapsulados em traduções que alterem seus valores, mas que seus labels/ações ao redor sejam localizados.
5. Definir casos de teste por domínio antes da implementação, incluindo `en`/`pt-BR` para detectar vazamento de `zh-CN` e `zh-CN` para preservar o comportamento original.
6. Registrar no plano a matriz de arquivos permitidos por writer. Arquivos compartilhados de locale e registry têm um único owner por onda.
7. A projeção de `InteractionMemoryKind` é obrigatória: executar primeiro um passo serial de Lane A com `src/i18n/display-projection.ts` e `tests/regression/R-i18n-display-projections.test.ts`; somente depois liberar as lanes B/C.
8. O Orchestrator é owner serial de `tests/registry/i18n-ns-usage.test.ts` para a exceção `shared → settings` e da prova de cold mount; Lane B não edita o guard.
9. Designar desde já a criação/manutenção de `tests/regression/R-PROJECT-STORAGE-FOLDER-i18n.test.tsx` ao Owner B e de `tests/regression/R-I18N-CHAPTER-POST-ADOPTION.test.tsx` ao Owner C, evitando comandos condicionais na fase final.

**Ownership:** Orchestrator integra o contrato; o Designer foi tentado como revisão **read-only**, mas o provedor indisponível foi registrado como waiver de uma onda. Nesta retomada o Orchestrator assume copy/acessibilidade percebida sem alterar layout; nenhum fixer edita código durante esta fase. Na Fase 2 os Fixers só fazem wiring mecânico que preserve a intenção visual existente.

**Gate DOMAIN:** manifesto de chaves, paridade estrutural inicial, ownership sem conflito e testes de registry selecionados. Razão: uma chave mal alocada cria fallback, conflito ou bypass difícil de detectar depois.

**Commit planejado:** `docs(i18n-upstream): define residual hardcode contract`; somente usar `test(...)` nesta fase se houver guards executáveis novos, passando e staged no mesmo escopo.

**Revisão Oracle 2/4:** aprovar contrato, semântica de copy e limites de dados antes da implementação. Razão: confirmar que os três writers não disputarão JSON/registry e que nenhum canonical foi classificado como UI.

**Entrega da Fase 1:** `docs/I18N-UPSTREAM-MERGE-CONTRACT.md` fecha o manifesto por ocorrência, os owners `simulation`/`settings`/`editor`, os placeholders, os limites de conteúdo canônico, a projeção de `InteractionMemoryKind`, os erros/separadores e os testes de cada writer. O Designer não pôde executar a revisão read-only após duas tentativas por indisponibilidade do provedor; o Orchestrator registrou a revisão conservadora e não alterou layout ou interação. Os guards existentes permanecem como baseline; nenhuma alteração de componente/locale foi feita nesta fase.

**Oracle 2/4 — NO-GO:** a revisão identificou lacunas nos produtores H57/Editor, assinaturas de placeholders, ownership do allowlist, decisão folha a folha do storage, projection obrigatória, estados post-adoption e contradição sobre o waiver do Designer. A remediation é documental e única; nenhum writer de UI é liberado até a re-revisão.

**Remediation em curso:** o contrato foi ampliado para incluir todos os produtores visíveis de `ChapterEditor`, códigos de apresentação de erro traduzidos no render, assinaturas individuais, cold mount, guard serial do Orchestrator, seis valores de `InteractionMemoryKind`, `downstream-processing` e o waiver explícito do Designer para esta onda.

**Oracle 2/4 — segunda revisão NO-GO:** o cold mount ainda tinha ownership divergente entre o plano e o contrato, e o produtor de `ChapterEditor.tsx:3505–3507` não estava no inventário. A remediation atual torna o Orchestrator o único owner da prova/aceitação de cold mount (Lane B apenas escreve o caso de teste) e inclui as duas chaves de edição local adotada (`count` quando fatos são rebaixados, sem placeholder quando não são).

### Fase 2 — Implementação por domínio, em paralelo seguro

**Dependência:** começa após o gate e Oracle 2/4. Os lanes abaixo não compartilham write targets.

#### Lane A — Simulation

- **Owner:** Fixer A, após o passo serial obrigatório de projection; o waiver do Designer está registrado no contrato e o Orchestrator é owner de copy/acessibilidade percebida nesta onda.
- **Arquivos permitidos:** `ChatGamePanel.tsx`, os três `simulation.json` na seção `chatGame`, o teste `R-CHATGAME2BC-ui.test.tsx`, `display-projection.ts` e `R-i18n-display-projections.test.ts` no passo serial obrigatório de projection.
- **Não tocar:** stores de interaction, `ProductHubPage`, `client.ts`, runtime, schemas e outros blocos de `simulation.json` fora do contrato.
- **Implementação:** substituir somente UI hard-coded por `t('chatGame.*')`; projetar `InteractionMemoryKind`; classificar os erros operacionais e renderizar mensagem estável/localizada; substituir separadores visíveis por formatter/locale; preservar protocol badges, conteúdo dinâmico, sequence/run IDs, callbacks, estados e layout.
- **Regressão:** estender `tests/regression/R-CHATGAME2BC-ui.test.tsx` com casos explícitos `en`, `pt-BR` e `zh-CN`; verificar memory-kind projection, erro localizado, legacy state, empty state, acessibilidade, interpolations e comportamento. Não criar um segundo teste se o harness existente suportar esses casos.

#### Lane B — Project storage

- **Owner:** Fixer B, após o guard/cold-mount serial do Orchestrator; o waiver do Designer está registrado no contrato.
- **Arquivos permitidos:** `ProjectStorageFolderField.tsx`, os três `settings.json` em `projectStorage` e `tests/regression/R-PROJECT-STORAGE-FOLDER-i18n.test.tsx` (owner definido; criar se ainda não existir). O guard `tests/registry/i18n-ns-usage.test.ts` pertence somente ao Orchestrator.
- **Não tocar:** `folder-backup`, persistência, `ProjectStorageWorkspacePanel`, callers ou lifecycle de storage.
- **Implementação:** adicionar `useDomainT('settings')`; reutilizar a semântica já usada por `ProjectStorageWorkspacePanel`; traduzir erro, estados supported/unsupported, choose/change, helper e qualquer `aria-label`/tooltip necessário; preservar `FileSystemDirectoryHandle.name` como dado dinâmico.
- **Regressão:** em `R-PROJECT-STORAGE-FOLDER-i18n.test.tsx`, renderizar `null`, folder selected, unsupported browser e permission denied nos três locales; conferir labels, helper, error, callback e disabled/busy state.

#### Lane C — Editor toolbar + post-adoption lifecycle

- **Owner:** Fixer C único para manter a unidade acoplada, após o waiver do Designer registrado no contrato; o Orchestrator mantém a revisão de copy/acessibilidade percebida.
- **Arquivos permitidos:** `ChapterEditorToolbar.tsx`, todos os produtores visíveis e o lifecycle nos trechos permitidos de `ChapterEditor.tsx`, os três `editor.json`, `R-AUDIT6-chapter-editor-toolbar.test.tsx` e `R-I18N-CHAPTER-POST-ADOPTION.test.tsx`/regressões post-adoption relacionadas.
- **Não tocar:** hooks de estado, runtime de capítulo, Candidate/Adoption, persistência, AI routing ou contratos de dados.
- **Implementação:** converter action map, contadores, status H57, labels de grupos, selects, placeholders, `aria-label`, `sr-only`, titles, buttons, candidate diff e receipts; localizar labels em torno de `impactInfo`, `policyId`, `policyReason`, hashes e conteúdos de candidato; classificar `transitionError`/`impact*Error` como mensagens estáveis ou diagnóstico, e substituir separadores culturais.
- **Regressão:** atualizar `R-AUDIT6-chapter-editor-toolbar.test.tsx` para inicializar locale e consultar chave traduzida/role quando apropriado, sem relaxar assertions; criar `R-I18N-CHAPTER-POST-ADOPTION.test.tsx` para `ChapterEditor` lifecycle; cobrir `busy`, settled/blocked, review decisions, candidate confirm/reject, receipt, banners e erros.

**Paralelismo:** após o passo serial obrigatório de projection de Lane A e o guard/cold-mount serial do Orchestrator para Lane B, A, B e C podem rodar simultaneamente porque seus componentes e locale files são distintos. O registry compartilhado e qualquer geração de documentação ficam bloqueados para o Orchestrator até todas as lanes terminarem. O waiver de uma onda substitui a revisão Designer indisponível; não há edição simultânea Designer/Fixer.

**Gate FAST por lane:** Vitest da lane, `git diff --check` e locale key/placeholder check da área.

**Gate DOMAIN após integração:** usar a **Matriz de Verificação autoritativa** abaixo: registry, regressões dos três domínios, checks arquiteturais, TypeScript e build. Não duplicar ou alterar a ordem dos comandos fora de uma decisão registrada.

**Commit plan:** cada lane fecha somente após reconciliação, em commits atômicos:

1. `fix(i18n-upstream): localize chat game panel residual UI`;
2. `fix(i18n-upstream): localize project storage folder field`;
3. `fix(i18n-upstream): localize chapter editor review flows`.

Nenhum fixer commita ou altera outra lane. O Orchestrator revisa `git diff`, testes e arquivos staged antes de cada commit.

**Revisão Oracle 3/4:** revisar a implementação integrada e o risco de regressão. Razão: confirmar que a conversão não alterou storage, AI, Candidate/Adoption, layout ou acessibilidade.

### Fase 3 — Segunda auditoria, browser e release closure

**Dependência:** começa somente após todas as lanes da Fase 2 estarem reconciliadas, committed e sem alterações inesperadas.

1. **Auditoria de candidatos hard-code do zero:** repetir busca independente nos arquivos upstream-tocados e nos caminhos alcançados por eles em `src/components/**`, `src/pages/**`, `src/hooks/**`, `src/stores/**`, `src/lib/**`; procurar JSX text, `placeholder`, `title`, `aria-label`, `label`, `description`, `message`, toasts, errors, status, prompts, projeções ausentes, separadores culturais e caracteres chineses.
2. Comparar o novo resultado contra o inventário inicial sem reutilizá-lo como prova; cada candidato restante recebe `FIXED` ou `INTENTIONAL + motivo + arquivo/linha`, e qualquer novo Category 1 reabre o escopo.
3. **Auditoria de locale:** rodar paridade de keys, valores não vazios, placeholders, namespace usage, lazy loading e raw-key leakage em todos os três locales.
4. **Auditoria de arquitetura:** confirmar que nenhum novo `project.contentLanguage` direto, prompt local, category AI, table list, registry bypass ou persistência de UI locale entrou na onda.
5. **Browser smoke isolado:** executar explicitamente `tests/e2e/workspace-cold-i18n.spec.ts` e `tests/e2e/language-switch.spec.ts`, além dos specs direcionados que alcancem Product Hub, Chapter Editor e project storage, em dados de navegador isolados; visitar os caminhos novos em `pt-BR`, `en` e `zh-CN`; verificar cold mount, troca `pt-BR → en → zh-CN → pt-BR`, labels, raw keys, truncamento e dropdowns canônicos.
6. **Gates GLOBAL/RELEASE, uma única vez e serialmente:** `npm run ci`, depois `npm run ci:e2e`, e `git diff --check`. O resultado deve registrar comando, timestamp, commit SHA, quantidade de testes, falhas/avisos e bloqueios externos.
7. Regenerar somente artefatos exigidos pelos checks (`npm run gen:ai-manual`, `npm run gen:project-metrics` quando aplicável), revisar o diff e commitá-los com a onda que os alterou.

**Gate final:** todos os critérios do brief original, especialmente sections 20–23, precisam de evidência. CI verde não substitui auditoria hard-code nem browser smoke.

**Commit planejado:** `docs(i18n-upstream): record residual hardcode closure evidence`, incluindo este plano atualizado e artefatos de entrega pertinentes; o plano untracked deve ser commitado depois da aprovação Oracle 1/4; não criar commit vazio.

**Revisão Oracle 4/4:** revisão final de release e da lista `INTENTIONAL`. Razão: impedir que texto visível, fallback ou dívida não classificada seja declarado concluído.

## Regras de teste adotadas do brief antigo

### Durante implementação

- Não executar `npm ci`, `npm run ci`, `npm run ci:e2e`, coverage completa ou build completo após cada pequena edição.
- Usar o ciclo: teste específico → corrigir → repetir o mesmo teste → avançar.
- Vitest direcionado: `npx vitest run <arquivos>`.
- Playwright direcionado: `npx playwright test <spec-específico>`.
- Não rodar gates pesados concorrentes no mesmo worktree.
- Não modificar o projeto real do autor; usar browser/dados isolados.

### Baterias progressivas

#### Registry e contrato

```bash
npx vitest run \
  tests/registry/i18n.test.ts \
  tests/registry/i18n-values.test.ts \
  tests/registry/i18n-ns-usage.test.ts \
  tests/registry/i18n-backend.test.ts
```

#### Domínios residuais

```bash
npx vitest run \
  tests/regression/R-CHATGAME2BC-ui.test.tsx \
  tests/regression/R-PROJECT-STORAGE-FOLDER-i18n.test.tsx \
  tests/regression/R-AUDIT6-chapter-editor-toolbar.test.tsx \
  tests/regression/R-EDITOR3-compare-polish.test.ts \
  tests/regression/R-HARNESS20-chapter-post-adoption-durable.test.ts \
  tests/regression/R-HARNESS41-consistency-post-adoption.test.ts \
  tests/regression/R-HARNESS42-post-adoption-resume-plan.test.ts \
  tests/regression/R-I18N-CHAPTER-POST-ADOPTION.test.tsx
```

`R-HARNESS20`, `R-HARNESS41` e `R-HARNESS42` cobrem comportamento durable/resume; `R-I18N-CHAPTER-POST-ADOPTION.test.tsx` cobre especificamente os banners e mensagens de UI. `R-PROJECT-STORAGE-FOLDER-i18n.test.tsx` é owner definido da Fase 2 e deve existir antes da bateria integrada.

#### Regressão integrada

Adicionar os domínios residuais à bateria existente do checkpoint, mantendo também as regressões já verdes:

```bash
npx vitest run \
  tests/registry/i18n.test.ts \
  tests/registry/i18n-values.test.ts \
  tests/registry/i18n-ns-usage.test.ts \
  tests/registry/i18n-backend.test.ts \
  tests/regression/R-i18n-display-projections.test.ts \
  tests/regression/R-TEXTSIM1-ui.test.tsx \
  tests/regression/R-TEXTWORLD1-ui.test.tsx \
  tests/regression/R-CHATGAME2BC-ui.test.tsx \
  tests/regression/R-HARNESS32-worldview-panels-ui.test.tsx \
  tests/regression/R-I18N1-emotion-beat.test.tsx \
  tests/regression/R-PRODUCT-HUB-world-engine-flow.test.tsx \
  tests/regression/R-SIM1-runtime-ui.test.tsx \
  tests/regression/R-WORLDNARR1-ui.test.tsx \
  tests/regression/R-AUDIT6-chapter-editor-toolbar.test.tsx \
  tests/regression/R-PROJECT-STORAGE-FOLDER-i18n.test.tsx \
  tests/regression/R-I18N-CHAPTER-POST-ADOPTION.test.tsx
```

O número final deve ser registrado pelo comando real, não assumido como `198+`.

#### Checks DOMAIN e RELEASE

```bash
npm run check:architecture
npm run check:required-tables
npm run check:ai-manual
npm run check:ai-entry-registry
npm run check:source-reachability
npm run check:agent-context
npm run check:agent-freshness
npm run check:canon-coverage
npm run check:project-metrics
npx tsc --noEmit
npm run build
```

No fechamento, executar serialmente:

```bash
npm run ci
npm run ci:e2e
git diff --check
```

`npm run ci` inclui lint, TypeScript, coverage, build, bundle-size e os checks de dependência/arquitetura definidos em `package.json`; `npm run ci:e2e` é o alias canônico do Playwright completo.

## Protocolo de revisão Oracle

| Revisão | Momento | Material obrigatório | Decisão que deve responder |
|---|---|---|---|
| Oracle 1/4 | após Fase 0/plano | inventário, quatro Category 1, baseline `97078f7`, regra de commit | escopo está completo e a missão pode iniciar? |
| Oracle 2/4 | após Fase 1 | manifesto de chaves, namespaces, placeholders, ownership e testes | contrato evita conflito, fallback e tradução de dado canônico? |
| Oracle 3/4 | após Fase 2 | diff integrado, regressões, checks DOMAIN, typecheck/build | implementação preserva comportamento, UX, acessibilidade e storage? |
| Oracle 4/4 | após Fase 3 | segunda auditoria, browser smoke, CI/E2E, diff/commit final | critérios do brief foram realmente cumpridos? |

Achados Oracle serão agrupados por risco em **uma** remediation bounded. Só haverá re-review adicional se a remediation mudar a decisão/risco analisado ou se a evidência original continuar insuficiente. Feedback de simplificação/readability entra no mesmo lote e não será aplicado de forma a apagar a intenção visual do Designer.

## Segurança de paralelismo e commits

- Writers nunca compartilham o mesmo locale JSON, componente, registry ou teste.
- Se uma chave cruzar domínios, o Orchestrator cria/integrará a chave uma única vez antes da próxima wave; não haverá edição concorrente.
- Designer é owner de copy, acessibilidade percebida, hierarquia, comprimento e preservação do componente; Fixer só faz wiring mecânico, testes e correções que preservem essa intenção.
- O Orchestrator é o único owner de integração, staging, commits, checks globais e reconciliação de diffs.
- Antes de cada commit: `git status`, `git diff`, `git diff --check`, revisão de arquivos staged, testes da wave e inspeção de `git log`.
- Nunca usar amend, reset destrutivo, force-push, `npm audit fix --force` ou alterar mudanças não relacionadas.
- Nenhum push será feito sem autorização explícita.

## Definition of Done e reverificações

Só marcar o Deepwork como concluído quando todos os itens forem verdadeiros:

- [ ] As quatro áreas Category 1 estão mapeadas e sem hardcode UI residual.
- [ ] A segunda auditoria do zero classifica cada ocorrência restante como `FIXED` ou `INTENTIONAL + motivo`.
- [ ] `simulation.chatGame`, `settings.projectStorage` e `editor` têm paridade `pt-BR`/`en`/`zh-CN`.
- [ ] Placeholders, `aria-label`, `title`, `sr-only`, empty states, erros e busy states foram verificados.
- [ ] Conteúdo de autor, IDs, hashes, receipts, enums, seeds e storage não foi traduzido ou alterado.
- [ ] Nenhuma chamada AI, registry, table lifecycle ou `contentLanguage` foi desnecessariamente tocada.
- [ ] Testes direcionados dos três domínios passam.
- [ ] Registry, architecture, required tables, AI manual/entry, source reachability, agent context/freshness, canon e metrics passam.
- [ ] TypeScript e build passam após a integração.
- [ ] Browser smoke isolado cobre `pt-BR`, `en`, `zh-CN`, cold mount e language switch.
- [ ] `npm run ci` e depois `npm run ci:e2e` passam no mesmo estado estável.
- [ ] `git diff --check` passa.
- [ ] O último commit contém somente o escopo reconciliado e o worktree fica limpo.
- [ ] O Oracle 4/4 aprova; o arquivo Deepwork e este documento têm o mesmo estado final.

## Estado atual e próximo passo

- **Concluído:** recon, auditoria residual, matriz de testes, checkpoint de código e plano inicial.
- **Concluído nesta etapa:** remediation documental aplicada, Oracle 1/4 re-review retornou GO e este plano foi commitado em `ca05503`. Próximo passo é iniciar a Fase 1 de contratos e, somente após seus gates, os writers da Fase 2.
- **Remediation atual:** Fase 1 recebeu o NO-GO do Oracle 2/4 e a documentação está sendo corrigida em um único lote. O gate dos guards e o commit da remediation precedem a re-revisão Oracle 2/4.
- **Próximo passo:** executar novamente os quatro guards selecionados, `git diff --check`, commitar somente os dois documentos reconciliados e solicitar Oracle 2/4 re-review.
- **Não fazer ainda:** traduzir componentes, editar locales ou rodar gates RELEASE antes da aprovação do contrato e do Oracle 2/4 re-review.

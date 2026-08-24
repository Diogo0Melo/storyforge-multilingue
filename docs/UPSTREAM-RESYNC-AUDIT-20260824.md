# Auditoria de ressincronização upstream — 2026-08-24

## Escopo e referências

Esta auditoria compara o baseline local `d351bb7`, o contrato de aplicação do
upstream `f82278d` e o merge atual `HEAD` (`9223f69`). O objetivo é restaurar
paridade de comportamento sem remover o i18n local ou alterar dados do autor.

## Regressões confirmadas

1. **CTA de escrita removido.** O cartão do World Engine no upstream sempre
   oferece “continuar escrita passo a passo”. No merge, esse CTA foi trocado
   pela ramificação local de migração `enableMultiWorld`, ficando oculto em
   projetos multiworld.
2. **Contrato do painel alterado.** O upstream monta `WorldEngineWorkspace`
   diretamente em `#world-engine-editor`. O merge inseriu o painel legado
   `WorldGroupOverview` nesse alvo e moveu o workspace, alterando o fluxo e o
   destino do CTA de gerenciamento.
3. **Escopo TTRPG perdido.** `TtrpgPage` deixou de repassar `workspaceScope`
   para `SimulationRuntimePanel`, embora o painel use esse escopo para carregar
   e persistir sessões com `projectId`, `worldId` e `workId`.

## Comportamento preservado

Home, Workspace, rotas de `App` e a navegação lateral preservam os fluxos
upstream não relacionados ao Product Hub. As matrizes completas de chat e jogos
de texto também permanecem presentes.

## Evidência e cobertura necessária

`tests/regression/R-PRODUCT-HUB-world-identity.test.ts` passou com 5 testes,
mas só valida identidade/criação. A correção deve adicionar uma regressão
focada que exija os dois CTAs do cartão e `WorldEngineWorkspace` dentro de
`#world-engine-editor`; o TTRPG precisa de uma asserção de repasse de escopo.
Depois, a evidência inclui navegador com perfil/IndexedDB isolado e os gates
globais finais.

## Estado do upstream

Após fetch, `upstream/main` está em `eebc6ef`: 20 linhas novas somente em
`data/traffic/{clones,release-assets,views}.csv`, sem código, schema ou testes.
Esse delta será integrado somente após o reparo funcional e não haverá push.

## Não escopo

Esta operação não limpa cache, não altera projetos no navegador e não envia
alterações a `origin` nem a `upstream`.

# Fork maintenance policy

Política curta para republicar o fork com o i18n local e, depois, receber
sincronizações do upstream.

## Identidade e limites dos remotes

- `origin` é exclusivamente o fork gravável:
  `https://github.com/Diogo0Melo/storyforge-multilingue`.
- `upstream` é exclusivamente a fonte original de leitura e sincronização:
  `https://github.com/yuanbw2025/storyforge`.
- Push é permitido somente para `origin`, quando explicitamente autorizado;
  nunca faça `git push upstream`. É proibido abrir PR, issue ou enviar qualquer
  dado ao repositório original.
- O conteúdo atualmente publicado no fork do autor está obsoleto e não é fonte
  de verdade. A branch local `feat/i18n`, com o i18n refeito, é a fonte para a
  futura republicação.

## Bootstrap e republicação do fork

1. Preserve e verifique a branch local `feat/i18n` e o worktree. Não use o
   `origin/main` obsoleto como base, nem renomeie automaticamente branch ou
   worktree suja.
2. A substituição do conteúdo ocorre somente no fork `origin` e somente após
   ação explícita do autor. Não apague, force-pushe, republique nem altere
   remotes automaticamente.
3. Depois da republicação autorizada, faça `git fetch origin` e trate a nova
   `origin/main` como base de integração.

O assistente não executa exclusão, force-push, republicação, alteração de
remotes ou qualquer envio ao GitHub sem autorização específica do autor.

## Sincronização futura

Antes de operar, confira `git status --short --branch` e `git remote -v`;
preserve alterações locais. Se os remotes não corresponderem às identidades
acima, pare e peça confirmação das URLs, sem alterar a configuração.

O fluxo normativo é:

1. Faça `git fetch origin` e `git fetch upstream`; `upstream` permanece apenas
   para fetch/leitura.
2. A partir da nova `origin/main`, crie `sync/upstream/<id>` e integre nela
   `upstream/main`, nunca trabalhando diretamente em `upstream/main`.
3. Valide com `npm run ci` e abra/use PR somente para atualizar `origin/main` do
   fork.
4. Só depois atualize a feature por REBASE explícito de
   `feat/i18n/<fase-ou-unidade>` sobre a nova `origin/main`, preservando commits
   i18n e sem misturar alterações locais não relacionadas.

`docs/I18N.md` prevalece sobre referências históricas no Blueprint, no roadmap
legado e em guias antigos; documentos históricos não devem ser reescritos.
Conflitos devem preservar as regras do upstream e a política do fork.
`docs/COLLAB-LOG.md` é histórico de integração append-only, não obrigação de
cada branch de feature.

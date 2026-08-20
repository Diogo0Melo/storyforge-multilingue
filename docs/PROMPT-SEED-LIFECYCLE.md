# Fase 8 — inventário e ciclo de vida seguro dos Prompt Seeds

Este documento registra o entregável seguro da Fase 8. Ele descreve o inventário e
um manifesto determinístico para auditoria; **não implementa reseed, mutação ou
reconciliação de seeds**.

## Inventário confirmado

O preload atual contém **206 seeds**:

| Família | Quantidade | Ordem |
| --- | ---: | --- |
| core | 17 | primeiro |
| tools | 22 | segundo |
| genre-base | 31 | terceiro |
| genre-extended | 18 | quarto |
| **principais** | **88** | core + tools + genre-base + genre-extended |
| novel | 118 | depois dos 88 principais |

O digest legado dos 88 seeds principais, calculado sobre a serialização histórica
do array principal, é:

```text
ecadb0be270b13bc871e54ca81032c2f8a06a71bc9d67c8330447a1f82768251
```

## Identidade documental proposta

A identidade documental v1 proposta para auditoria é:

```text
prompt-seed/v1/core/<moduleKey>
prompt-seed/v1/tools/<moduleKey>
prompt-seed/v1/genre-base/<genreSlug>/<moduleKey>
prompt-seed/v1/genre-extended/<genreSlug>/<moduleKey>
prompt-seed/v1/novel/<assetId>
```

Para os 88 seeds principais, essa identidade é **proposta documental** e não é
um campo persistido. Para seeds de gênero, `genreSlug` vem da seleção de gênero
do próprio seed; para seeds novel, `assetId` é a identidade do asset.

Nomes não são identidade. A colisão conhecida de nome
`历史包-章节正文` entre os namespaces `genre-base` e `genre-extended` permanece
explícita e não deve ser deduplicada.

## Digest canônico combinado

O digest canônico do preload combinado usa a ordem efetiva de preload — os 88
principais seguidos dos 118 novel — e SHA-256 sobre UTF-8. Cada entrada contém
identidade documental, família, ordem e todos os campos do `PromptSeed`.

Na canonicalização, as chaves de objetos são ordenadas recursivamente. Arrays
mantêm sua ordem e strings são preservadas. Excluem-se somente `id`, `createdAt`
e `updatedAt`; nenhum outro campo é descartado.

O valor fixado pelo teste de regressão é:

```text
bc35903cd454c44338279df807b13abcc042c0526eb3873a74f6d878790f2499
```

Uma projeção separada de preview pode apresentar todos os entries como
`isActive: false`, sem alterar os valores dos arrays reais e sem persistir a
projeção.

## Limites de segurança e escopo

- O ciclo de vida futuro é exclusivamente **preview → confirmação opt-in por
  família/seed → snapshot → aplicação atômica → rollback**.
- Nunca aplicar por startup ou por mismatch de digest.
- Seeds órfãos nunca são apagados automaticamente.
- `scope=user`, clones, `parentId`, `isActive` e a seleção de gênero permanecem
  intocáveis.
- `seed-i18n`/`names` e payloads chineses não são traduzidos nesta fase.
- `promptTemplates` é global e não exportável por projeto.

## Stop conditions e decisão pendente

Qualquer reseed real permanece bloqueado até decisão explícita sobre o contrato
de aplicação, o snapshot/rollback, a confirmação por família/seed, a política de
órfãos e a validação em dados reais isolados. Em particular, um mismatch do
digest, um startup ou a ausência de uma identidade não autoriza mutação.

Portanto, a Fase 8 entrega apenas inventário, identidade documental proposta,
digest e evidência de projeção pura. A aplicação continua sem qualquer seed
mutation ou reseed automático.

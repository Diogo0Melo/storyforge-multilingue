import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, RotateCcw, Trash2, Wand2, X } from 'lucide-react'
import {
  parseCharacterSupplementCandidateDraftV1,
  serializeCharacterSupplementCandidateV1,
  type CharacterSupplementCandidateV1,
} from '../../lib/agent/character-supplement-copilot'
import {
  CHARACTER_DIMENSIONS,
  filledDimensions,
  getDimensionLabel,
  type CharacterDimensionKey,
} from '../../lib/character/character-dimensions'
import type { Character, Project } from '../../lib/types'
import { useMasterCopilot, type PendingMasterCandidate } from '../agent/useMasterCopilot'
import { CTextarea } from '../shared/CompositionInput'
import CharacterDimensionPicker from './CharacterDimensionPicker'
import { useDomainT } from '../../i18n'

interface Props {
  character: Character
  project: Project
  worldGroupId?: number | null
  onDone?: () => void
  compact?: boolean
}

function initialDimensions(character: Character): Set<CharacterDimensionKey> {
  const filled = new Set(filledDimensions(character))
  const empty = CHARACTER_DIMENSIONS.map(dimension => dimension.key).filter(key => !filled.has(key))
  return new Set(empty.length ? empty : CHARACTER_DIMENSIONS.map(dimension => dimension.key))
}

export default function CharacterSupplementAction({
  character,
  project,
  worldGroupId,
  onDone,
  compact,
}: Props) {
  const { t } = useDomainT('character')
  const [open, setOpen] = useState(false)
  const empties = CHARACTER_DIMENSIONS
    .map(dimension => dimension.key)
    .filter(key => !new Set(filledDimensions(character)).has(key)).length

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(value => !value)}
        className={compact
          ? 'p-1 text-text-muted hover:text-accent flex-shrink-0'
          : 'flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-accent border border-border rounded hover:border-accent/50 transition-colors'}
        title={empties ? t('supplement.buttonTitleMissing', { count: empties }) : t('supplement.buttonTitle')}
      >
        <Wand2 className="w-4 h-4" />
        {!compact && <span>{t('supplement.buttonLabel')}{empties > 0 && <span className="text-accent ml-0.5">{t('supplement.missingIndicator', { count: empties })}</span>}</span>}
      </button>

      {open && (
        <CharacterSupplementDialog
          character={character}
          project={project}
          worldGroupId={worldGroupId ?? null}
          onClose={() => setOpen(false)}
          onDone={onDone}
        />
      )}
    </div>
  )
}

function CharacterSupplementDialog({
  character,
  project,
  worldGroupId,
  onClose,
  onDone,
}: {
  character: Character
  project: Project
  worldGroupId: number | null
  onClose: () => void
  onDone?: () => void
}) {
  const { t } = useDomainT('character')
  const copilot = useMasterCopilot({ project, worldGroupId })
  const [selected, setSelected] = useState<Set<CharacterDimensionKey>>(() => initialDimensions(character))
  const [useEvidence, setUseEvidence] = useState(false)
  const candidate = copilot.pendingCandidates.find(item => (
    item.payload.skillId === 'character.supplement'
    && item.payload.characterSupplementRequest?.characterId === character.id
  ))
  const hasOtherPendingCandidate = copilot.pendingCandidates.some(item => item !== candidate)
  const parsedCandidate = useMemo(() => parseCandidate(candidate), [candidate])

  useEffect(() => {
    const request = candidate?.payload.characterSupplementRequest
    if (!request) return
    setSelected(new Set(request.dimensions))
    setUseEvidence(request.useEvidence)
  }, [candidate])

  const run = async () => {
    if (character.id == null || selected.size === 0) return
    const dimensions = CHARACTER_DIMENSIONS
      .map(dimension => dimension.key)
      .filter(key => selected.has(key))
    await copilot.submitTargetedRequest(
      `补全角色“${character.name || '未命名'}”的 ${dimensions.length} 个选中字段。只生成候选，等待作者确认后写入。`,
      {
        id: `character-supplement-${character.id}`,
        agentId: 'character',
        skillId: 'character.supplement',
        instruction: `严格依据当前角色与正式设定补全“${character.name || '未命名'}”的选中字段。`,
        characterSupplementRequest: {
          characterId: character.id,
          dimensions,
          useEvidence,
        },
      },
    )
  }

  const updateField = async (key: CharacterDimensionKey, value: string) => {
    if (!candidate || !parsedCandidate || !candidate.payload.characterSupplementRequest) return
    const next: CharacterSupplementCandidateV1 = {
      version: 1,
      patch: { ...parsedCandidate.patch, [key]: value },
    }
    await copilot.updateCandidate(
      candidate.event.id!,
      serializeCharacterSupplementCandidateV1(next, candidate.payload.characterSupplementRequest),
    )
  }

  const adoptCandidate = async () => {
    if (!candidate) return
    const adopted = await copilot.adoptCandidate(candidate)
    if (!adopted) return
    onDone?.()
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full right-0 mt-1 z-50 bg-bg-surface border border-border rounded-lg shadow-lg p-3 w-[min(520px,calc(100vw-2rem))] max-h-[min(720px,calc(100vh-4rem))] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-text-primary">
            {t('supplement.dialogTitle', { name: character.name || t('supplement.unnamed') })}
          </div>
          <button onClick={onClose} className="p-0.5 text-text-muted hover:text-text-primary" aria-label={t('supplement.closeAria')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {!candidate && (
          <>
            <p className="text-[11px] text-text-muted mb-2">
              {t('supplement.dialogDescription')}
            </p>
            <CharacterDimensionPicker selected={selected} onChange={setSelected} />
            <label className="mt-2 flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useEvidence}
                onChange={event => setUseEvidence(event.target.checked)}
                className="mt-0.5 accent-accent"
              />
              <span className="text-[11px] text-text-secondary leading-snug">
                {t('supplement.evidenceLabel')}
                <span className="block text-text-muted">{t('supplement.evidenceDescription')}</span>
              </span>
            </label>
          </>
        )}

        {copilot.error && (
          <div className="mt-2 rounded border border-error/30 bg-error/5 px-2 py-1.5 text-xs text-error">
            {copilot.error}
          </div>
        )}

        {hasOtherPendingCandidate && !candidate && (
          <div className="mt-2 rounded border border-warning/30 bg-warning/5 px-2 py-1.5 text-xs text-text-secondary">
            {t('supplement.otherPending')}
          </div>
        )}

        {candidate && parsedCandidate && candidate.payload.characterSupplementRequest && (
          <section className="mt-3 space-y-3" aria-label={t('supplement.candidateAria')}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-text-primary">{t('supplement.candidateTitle')}</span>
              <span className="text-[11px] text-text-muted">
                {candidate.payload.contextEvidence
                  ? t('supplement.contextTokens', { count: candidate.payload.contextEvidence.estimatedInputTokens.toLocaleString() })
                  : t('supplement.contextSources', { count: candidate.payload.contextSources.length })}
              </span>
            </div>
            {candidate.payload.characterSupplementRequest.dimensions.map(key => {
              const dimension = CHARACTER_DIMENSIONS.find(item => item.key === key)!
              const label = getDimensionLabel(dimension.key)
              return (
                <label key={key} className="block">
                  <span className="mb-1 block text-[11px] text-text-secondary">{label}</span>
                  <CTextarea
                    aria-label={t('supplement.candidateFieldAria', { label })}
                    value={parsedCandidate.patch[key] ?? ''}
                    disabled={copilot.busy}
                    rows={Math.max(2, dimension.rows)}
                    onChange={event => { void updateField(key, event.target.value) }}
                    className="w-full resize-y text-xs leading-5"
                  />
                </label>
              )
            })}
            {candidate.payload.contextEvidence && (
              <details className="border border-border/60 bg-bg-base px-3 py-2 text-[11px] text-text-muted rounded">
                <summary className="cursor-pointer text-text-secondary">{t('supplement.inputEvidence')}</summary>
                <p className="mt-2 break-words">{t('supplement.evidenceIncluded', { items: candidate.payload.contextEvidence.included.join('、') || t('supplement.none') })}</p>
                {candidate.payload.contextEvidence.trimmed.length > 0 && (
                  <p className="mt-1 text-warning">{t('supplement.evidenceTrimmed', { items: candidate.payload.contextEvidence.trimmed.join('、') })}</p>
                )}
              </details>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={copilot.busy}
                onClick={() => { void copilot.rejectCandidate(candidate) }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary rounded disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> {t('supplement.reject')}
              </button>
              <button
                type="button"
                disabled={copilot.busy}
                onClick={() => { void adoptCandidate() }}
                className="flex items-center gap-1 bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90 rounded disabled:opacity-50"
              >
                {copilot.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {t('supplement.confirmWrite')}
              </button>
            </div>
          </section>
        )}

        {candidate && !parsedCandidate && (
          <div className="mt-3 rounded border border-error/30 bg-error/5 px-2 py-2 text-xs text-error">
            {t('supplement.invalidCandidate')}
          </div>
        )}

        {!candidate && (
          <div className="mt-3 flex gap-2">
            {copilot.recoveryAvailable && (
              <button
                type="button"
                onClick={() => { void copilot.resume() }}
                disabled={copilot.loading || copilot.busy}
                className="flex items-center justify-center gap-1.5 px-3 py-2 border border-border text-text-secondary text-sm rounded disabled:opacity-40 hover:text-accent"
              >
                <RotateCcw className="w-4 h-4" /> {t('supplement.resume')}
              </button>
            )}
            <button
              onClick={() => { void run() }}
              disabled={copilot.loading || copilot.busy || selected.size === 0 || hasOtherPendingCandidate}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-accent text-white text-sm rounded disabled:opacity-40 hover:bg-accent-hover"
            >
              {copilot.busy
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('supplement.running')}</>
                : <><Wand2 className="w-4 h-4" /> {t('supplement.generateCandidate', { count: selected.size })}</>}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function parseCandidate(candidate?: PendingMasterCandidate): CharacterSupplementCandidateV1 | null {
  if (!candidate?.payload.characterSupplementRequest) return null
  try {
    return parseCharacterSupplementCandidateDraftV1(
      candidate.event.content,
      candidate.payload.characterSupplementRequest,
    )
  } catch {
    return null
  }
}

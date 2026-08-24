import { CTextarea } from '../shared/CompositionInput'
import { useState, useEffect, useCallback } from 'react'
import { Check, Loader2, Microscope, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import { useCreativeRulesStore } from '../../stores/project-singletons'
import { useWorldGroupStore } from '../../stores/world-group'
import { useReferenceStore } from '../../stores/reference'
import {
  formatCreativeRulesGenerationRequestV1,
  parseCreativeRulesCandidateDraftV1,
  type CreativeRulesField,
} from '../../lib/agent/creative-rules-copilot'
import { useMasterCopilot, type PendingMasterCandidate } from '../agent/useMasterCopilot'
import i18n, { useDomainT } from '../../i18n'
import type { Project, NarrativePOV } from '../../lib/types'
import {
  INITIAL_RECORD_TARGET_CLASS,
  initialRecordTargetAttributes,
  useInitialRecordTarget,
} from '../shared/initial-record-target'

const POV_KEYS = {
  'first-person':      { label: 'pov.firstPerson',      desc: 'pov.firstPersonDesc' },
  'third-limited':     { label: 'pov.thirdLimited',     desc: 'pov.thirdLimitedDesc' },
  'third-omniscient':  { label: 'pov.thirdOmniscient',  desc: 'pov.thirdOmniscientDesc' },
  'multi-pov':         { label: 'pov.multiPov',         desc: 'pov.multiPovDesc' },
} as const satisfies Record<NarrativePOV, { label: string; desc: string }>

interface Props {
  project: Project
  initialRulesId?: number | null
}

export default function CreativeRulesPanel({ project, initialRulesId }: Props) {
  const { t } = useDomainT('rules')
  const [, setAgentNamespaceReady] = useState(false)
  const { creativeRules, loadAll, save } = useCreativeRulesStore()
  const { references, loadAll: loadRefs } = useReferenceStore()
  const activeGroupId = useWorldGroupStore(state => state.activeGroupId)
  const copilot = useMasterCopilot({
    project,
    worldGroupId: project.enableMultiWorld ? activeGroupId : null,
  })
  const [writingStyle, setWritingStyle] = useState('')
  const [narrativePOV, setNarrativePOV] = useState<NarrativePOV>('third-limited')
  const [toneAndMood, setToneAndMood] = useState('')
  const [prohibitions, setProhibitions] = useState<string[]>([])
  const [consistencyRules, setConsistencyRules] = useState<string[]>([])
  const [specialRequirements, setSpecialRequirements] = useState('')
  const [referenceWorks, setReferenceWorks] = useState<string[]>([])
  const [citedRefIds, setCitedRefIds] = useState<number[]>([])
  useInitialRecordTarget(initialRulesId, creativeRules?.id === initialRulesId)

  useEffect(() => {
    let active = true
    void i18n.loadNamespaces('agent').then(() => {
      if (active) setAgentNamespaceReady(true)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    loadAll(project.id!)
    loadRefs(project.id!)
  }, [project.id, loadAll, loadRefs])

  useEffect(() => {
    if (creativeRules) {
      setWritingStyle(creativeRules.writingStyle || '')
      setNarrativePOV(creativeRules.narrativePOV || 'third-limited')
      setToneAndMood(creativeRules.atmosphere || creativeRules.toneAndMood || '')
      setSpecialRequirements(creativeRules.specialRequirements || '')
      try { setProhibitions(JSON.parse(creativeRules.prohibitions || '[]')) } catch { setProhibitions([]) }
      try { setConsistencyRules(JSON.parse(creativeRules.consistencyRules || '[]')) } catch { setConsistencyRules([]) }
      try { setReferenceWorks(JSON.parse(creativeRules.referenceWorks || '[]')) } catch { setReferenceWorks([]) }
      try { setCitedRefIds(JSON.parse(creativeRules.citedReferenceIds || '[]')) } catch { setCitedRefIds([]) }
    }
  }, [creativeRules])

  const saveField = useCallback(async (data: Record<string, unknown>) => {
    await save({ projectId: project.id!, ...data })
  }, [project.id, save])

  const pendingRulesCandidates = copilot.pendingCandidates.filter(candidate => (
    candidate.payload.skillId === 'world-origin.creative-rules'
  ))
  const hasOtherPendingCandidates = copilot.pendingCandidates.some(candidate => (
    candidate.payload.skillId !== 'world-origin.creative-rules'
  ))
  const generationBlocked = copilot.loading
    || copilot.busy
    || copilot.pendingCandidates.length > 0
    || (project.enableMultiWorld === true && activeGroupId == null)

  const generateField = async (target: CreativeRulesField) => {
    const instruction = formatCreativeRulesGenerationRequestV1({ field: target })
    await copilot.submitTargetedRequest(
      `${instruction} 为“${project.name}”提供可执行建议。`,
      {
        id: `creative-rules-${target}`,
        agentId: 'world-origin',
        skillId: 'world-origin.creative-rules',
        instruction,
      },
    )
  }

  const candidateFor = (field: CreativeRulesField) => pendingRulesCandidates.find(candidate => (
    candidate.payload.creativeRulesField === field
  ))

  const adoptCandidate = async (candidate: PendingMasterCandidate) => {
    const adopted = await copilot.adoptCandidate(candidate)
    if (adopted) await loadAll(project.id!)
  }

  /* ---- 列表操作通用 ---- */
  const handleAddToList = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    field: string,
  ) => {
    const updated = [...list, '']
    setList(updated)
    saveField({ [field]: JSON.stringify(updated) })
  }

  const handleUpdateListItem = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    _field: string,
    index: number,
    value: string,
  ) => {
    const updated = [...list]
    updated[index] = value
    setList(updated)
    // 仅 blur 时保存，这里先更新本地
  }

  const handleBlurListItem = (
    list: string[],
    field: string,
  ) => {
    saveField({ [field]: JSON.stringify(list) })
  }

  const handleRemoveListItem = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    field: string,
    index: number,
  ) => {
    const updated = list.filter((_, i) => i !== index)
    setList(updated)
    saveField({ [field]: JSON.stringify(updated) })
  }

  /* ---- 列表渲染 ---- */
  const renderList = (
    titleKey: string,
    placeholderKey: string,
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    field: string,
  ) => (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-text-secondary">{t(titleKey as never)} ({list.length})</label>
        <button
          onClick={() => handleAddToList(list, setList, field)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('listActions.add')}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-text-muted text-xs py-3 text-center border border-dashed border-border rounded-lg">{t('listActions.empty')}</p>
      ) : (
        <div className="space-y-1.5">
          {list.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                value={item}
                onChange={e => handleUpdateListItem(list, setList, field, idx, e.target.value)}
                onBlur={() => handleBlurListItem(list, field)}
                placeholder={t(placeholderKey as never)}
                className="flex-1 px-2 py-1.5 bg-bg-surface border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => handleRemoveListItem(list, setList, field, idx)}
                className="p-1 text-text-muted hover:text-red-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div
      {...initialRecordTargetAttributes(creativeRules?.id === initialRulesId, creativeRules?.id)}
      className={`max-w-4xl rounded-xl ${
        creativeRules?.id === initialRulesId ? INITIAL_RECORD_TARGET_CLASS : ''
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-text-primary">{t('panel.title')}</h2>
        {copilot.recoveryAvailable && pendingRulesCandidates.length === 0 && (
          <button
            type="button"
            onClick={() => { void copilot.resume() }}
            disabled={copilot.loading || copilot.busy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-text-secondary text-xs rounded disabled:opacity-40 hover:text-accent"
          >
            <RotateCcw className="w-3.5 h-3.5" /> {t('agent:chat.resumeButton')}
          </button>
        )}
      </div>

      {copilot.error && (
        <p className="mb-4 rounded border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
          {copilot.error}
        </p>
      )}

      {hasOtherPendingCandidates && (
        <p className="mb-4 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">
          {t('agent:candidate.dependsOnWarning', { ids: t('agent:chat.candidateFallbackLabel') })}
        </p>
      )}

      {/* 写作风格 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-text-secondary">{t('writingStyle.label')}</label>
          <button
            onClick={() => generateField('writingStyle')}
            disabled={generationBlocked}
            className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3 h-3" /> {t('writingStyle.aiSuggest')}
          </button>
        </div>
        <CTextarea
          value={writingStyle}
          onChange={e => setWritingStyle(e.target.value)}
          onBlur={() => saveField({ writingStyle })}
          placeholder={t('writingStyle.placeholder')}
          className="w-full h-24 p-3 bg-bg-surface border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
        />
        <CreativeRulesCandidate
          candidate={candidateFor('writingStyle')}
          copilot={copilot}
          onAdopt={adoptCandidate}
        />
      </div>

      {/* 叙事视角 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-text-secondary mb-2">{t('pov.label')}</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(POV_KEYS) as NarrativePOV[]).map(povValue => {
            const keys = POV_KEYS[povValue]
            return (
              <button
                key={povValue}
                onClick={() => {
                  setNarrativePOV(povValue)
                  saveField({ narrativePOV: povValue })
                }}
                className={`p-3 rounded-lg border text-left transition-all ${
                  narrativePOV === povValue
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-bg-surface hover:border-text-muted'
                }`}
              >
                <div className="text-sm font-medium text-text-primary">{t(keys.label as never)}</div>
                <div className="text-xs text-text-muted mt-0.5">{t(keys.desc as never)}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 基调和氛围 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-text-secondary">{t('toneAndMood.label')}</label>
          <button
            onClick={() => { void generateField('atmosphere') }}
            disabled={generationBlocked}
            className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3 h-3" /> {t('toneAndMood.aiSuggest')}
          </button>
        </div>
        <CTextarea
          value={toneAndMood}
          onChange={e => setToneAndMood(e.target.value)}
          onBlur={() => saveField({ atmosphere: toneAndMood })}
          placeholder={t('toneAndMood.placeholder')}
          className="w-full h-20 p-3 bg-bg-surface border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
        />
        <CreativeRulesCandidate
          candidate={candidateFor('atmosphere')}
          copilot={copilot}
          onAdopt={adoptCandidate}
        />
      </div>

      {/* 禁止事项 */}
      {renderList('prohibitions.title', 'prohibitions.placeholder', prohibitions, setProhibitions, 'prohibitions')}

      {/* 一致性规则 */}
      {renderList('consistencyRules.title', 'consistencyRules.placeholder', consistencyRules, setConsistencyRules, 'consistencyRules')}

      {/* 参考作品 */}
      {renderList('referenceWorks.title', 'referenceWorks.placeholder', referenceWorks, setReferenceWorks, 'referenceWorks')}

      {/* 引用手法 —— Phase 20 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
            <Microscope className="w-3.5 h-3.5 text-accent" />
            {t('citedTechniques.title')}
          </label>
          <span className="text-[10px] text-text-muted">
            {t('citedTechniques.desc')}
          </span>
        </div>
        {(() => {
          const analyzedRefs = references.filter(r => r.analysisStatus === 'done')
          if (analyzedRefs.length === 0) {
            return (
              <p className="text-text-muted text-xs py-3 text-center border border-dashed border-border rounded-lg">
                {t('citedTechniques.noAnalyzedRefs')}
              </p>
            )
          }
          return (
            <div className="space-y-1">
              {analyzedRefs.map(ref => {
                const checked = citedRefIds.includes(ref.id!)
                return (
                  <button
                    key={ref.id}
                    onClick={() => {
                      const next = checked
                        ? citedRefIds.filter(id => id !== ref.id!)
                        : [...citedRefIds, ref.id!]
                      setCitedRefIds(next)
                      saveField({ citedReferenceIds: JSON.stringify(next) })
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all border ${
                      checked
                        ? 'border-accent/40 bg-accent/8'
                        : 'border-border hover:border-text-muted bg-bg-surface'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                      checked ? 'bg-accent border-accent' : 'border-border'
                    }`}>
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-text-primary">{ref.title}</span>
                      {ref.author && <span className="text-xs text-text-muted ml-1.5">— {ref.author}</span>}
                    </div>
                    {ref.totalChars && (
                      <span className="text-[10px] text-text-muted shrink-0">
                        {t('citedTechniques.wordCount', { count: (ref.totalChars / 10000).toFixed(1) })}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* 特殊创作要求 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-text-secondary">{t('specialRequirements.label')}</label>
          <button
            onClick={() => generateField('specialRequirements')}
            disabled={generationBlocked}
            className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3 h-3" /> {t('specialRequirements.aiSuggest')}
          </button>
        </div>
        <CTextarea
          value={specialRequirements}
          onChange={e => setSpecialRequirements(e.target.value)}
          onBlur={() => saveField({ specialRequirements })}
          placeholder={t('specialRequirements.placeholder')}
          className="w-full h-24 p-3 bg-bg-surface border border-border rounded-lg text-text-primary text-sm resize-y focus:outline-none focus:border-accent"
        />
        <CreativeRulesCandidate
          candidate={candidateFor('specialRequirements')}
          copilot={copilot}
          onAdopt={adoptCandidate}
        />
      </div>
    </div>
  )
}

function CreativeRulesCandidate({
  candidate,
  copilot,
  onAdopt,
}: {
  candidate?: PendingMasterCandidate
  copilot: ReturnType<typeof useMasterCopilot>
  onAdopt: (candidate: PendingMasterCandidate) => Promise<void>
}) {
  const { t } = useDomainT('rules')
  if (!candidate) return null
  const fieldLabelKey: Record<CreativeRulesField, string> = {
    writingStyle: 'writingStyle.label',
    atmosphere: 'toneAndMood.label',
    specialRequirements: 'specialRequirements.label',
  }
  const candidateField = candidate.payload.creativeRulesField
  const candidateLabel = candidateField
    ? t(fieldLabelKey[candidateField] as never)
    : candidate.payload.label
  let parsed: ReturnType<typeof parseCreativeRulesCandidateDraftV1> | null = null
  try {
    parsed = parseCreativeRulesCandidateDraftV1(candidate.event.content)
  } catch {
    // Keep the raw editor available so a malformed restored candidate can be repaired or rejected.
  }
  const updateValue = (value: string) => {
    if (!candidate.payload.creativeRulesField) return
    void copilot.updateCandidate(candidate.event.id!, JSON.stringify({
      field: candidate.payload.creativeRulesField,
      value,
    }, null, 2))
  }
  return (
    <section className="mt-2 border border-accent/30 bg-bg-surface p-3 rounded-lg">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-text-primary">{t('agent:candidate.pendingPrefix', { label: candidateLabel })}</span>
        <span className="text-[11px] text-text-muted">
          {candidate.payload.contextEvidence
            ? t('agent:candidate.inputTokenCount', { count: candidate.payload.contextEvidence.estimatedInputTokens.toLocaleString() })
            : t('agent:candidate.inputSources', { count: candidate.payload.contextSources.length })}
        </span>
      </div>
      {parsed ? (
        <CTextarea
          aria-label={t('agent:candidate.contentAria', { label: candidateLabel })}
          value={parsed.value}
          disabled={copilot.busy}
          onChange={event => updateValue(event.target.value)}
          className="min-h-28 w-full resize-y text-sm leading-5"
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-error">{t('agent:candidate.quarantinedReason', { reason: t('agent:artifact.status.unknown') })}</p>
          <CTextarea
            aria-label={t('agent:candidate.contentAria', { label: candidateLabel })}
            value={candidate.event.content}
            disabled={copilot.busy}
            onChange={event => { void copilot.updateCandidate(candidate.event.id!, event.target.value) }}
            className="min-h-32 w-full resize-y font-mono text-xs leading-5"
          />
        </>
      )}
      {candidate.payload.contextEvidence && (
        <details className="mt-2 border border-border/60 bg-bg-base px-3 py-2 text-[11px] text-text-muted rounded">
          <summary className="cursor-pointer text-text-secondary">{t('agent:candidate.evidenceSummary', { count: candidate.payload.contextEvidence.included.length })}</summary>
          <p className="mt-2 break-words">
            {t('agent:candidate.includedLine', { items: candidate.payload.contextEvidence.included.join('、') || t('agent:candidate.includedEmpty') })}
          </p>
          {candidate.payload.contextEvidence.trimmed.length > 0 && (
            <p className="mt-1 text-warning">
              {t('agent:candidate.trimmedLine', { items: candidate.payload.contextEvidence.trimmed.join('、') })}
            </p>
          )}
        </details>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={copilot.busy}
          onClick={() => { void copilot.rejectCandidate(candidate) }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary rounded disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> {t('agent:candidate.rejectButton')}
        </button>
        <button
          type="button"
          disabled={copilot.busy || !parsed}
          onClick={() => { void onAdopt(candidate) }}
          className="flex items-center gap-1 bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90 rounded disabled:opacity-50"
        >
          {copilot.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {t('agent:candidate.adoptButton')}
        </button>
      </div>
    </section>
  )
}

import { useMemo, useState } from 'react'
import { Check, Loader2, Sparkles, Trash2 } from 'lucide-react'
import type { PendingMasterCandidate } from '../agent/useMasterCopilot'
import { useMasterCopilot } from '../agent/useMasterCopilot'
import AIFieldModeTabs from '../shared/AIFieldModeTabs'
import { CTextarea } from '../shared/CompositionInput'
import PromptRunPanel from '../shared/PromptRunPanel'
import { useDomainT } from '../../i18n'
import {
  formatWorldviewFieldGenerationRequestV1,
  type WorldviewAgentField,
} from '../../lib/agent/worldview-field-copilot'
import type { FieldGenerationMode } from '../../lib/ai/field-generation-context'
import type { Project } from '../../lib/types'

export default function WorldviewAgentControls({
  field,
  project,
  activeGroupId,
  copilot,
  candidate,
  otherPendingWorldviewLabel,
  hasOtherPendingCandidates,
  onRunningChange,
  onAdopted,
  buttonLabel,
}: {
  field: WorldviewAgentField
  project: Project
  activeGroupId: number | null
  copilot: ReturnType<typeof useMasterCopilot>
  candidate?: PendingMasterCandidate
  otherPendingWorldviewLabel?: string
  hasOtherPendingCandidates: boolean
  onRunningChange: (running: boolean) => void
  onAdopted: (candidate: PendingMasterCandidate) => Promise<void>
  buttonLabel?: string
}) {
  const { t, lang } = useDomainT('worldview')
  const [hint, setHint] = useState('')
  const [parameterValues, setParameterValues] = useState<Record<string, unknown>>({})
  const [systemOverride, setSystemOverride] = useState<string | null>(null)
  const [userOverride, setUserOverride] = useState<string | null>(null)
  const [mode, setMode] = useState<FieldGenerationMode>('expand')
  // 输入来源列表是登记表数据键（如 worldview、storyCore），只做本地化连接格式化，不做翻译。
  const listFormat = useMemo(() => new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }), [lang])

  const handleGenerate = async () => {
    onRunningChange(true)
    try {
      await copilot.submitRequest(formatWorldviewFieldGenerationRequestV1({
        field,
        mode,
        hint,
        parameterValues: Object.keys(parameterValues).length ? parameterValues : undefined,
        systemOverride,
        userOverride,
      }))
    } finally {
      onRunningChange(false)
    }
  }

  const blocked = copilot.loading
    || copilot.busy
    || copilot.pendingCandidates.length > 0
    || (project.enableMultiWorld === true && activeGroupId == null)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AIFieldModeTabs value={mode} onChange={setMode} />
        <input
          value={hint}
          onChange={event => setHint(event.target.value)}
          placeholder={t('agentControls.hintPlaceholder')}
          className="flex-1 px-2 py-1.5 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={blocked}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded disabled:opacity-50 shrink-0 bg-accent/10 text-accent hover:bg-accent/20"
        >
          {copilot.busy
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Sparkles className="w-3.5 h-3.5" />}
          {buttonLabel ?? t('agentControls.generateDefault')}
        </button>
      </div>

      <PromptRunPanel
        moduleKey="worldview.dimension"
        parameterValues={parameterValues}
        onParamChange={setParameterValues}
        systemOverride={systemOverride}
        onSystemOverrideChange={setSystemOverride}
        userOverride={userOverride}
        onUserOverrideChange={setUserOverride}
      />

      {copilot.error && (
        <p className="rounded border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
          {copilot.error}
        </p>
      )}

      {hasOtherPendingCandidates && (
        <p className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">
          {t('agentControls.otherPendingNotice')}
        </p>
      )}

      {!candidate && otherPendingWorldviewLabel && (
        <p className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">
          {t('agentControls.fieldPendingNotice', { label: otherPendingWorldviewLabel })}
        </p>
      )}

      {candidate && (
        <section className="border border-accent/30 bg-bg-surface p-4 rounded-lg">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary">{t('agentControls.pendingTitle', { label: candidate.payload.label })}</h3>
            <span className="text-[11px] text-text-muted">
              {candidate.payload.contextEvidence
                ? t('agentControls.evidenceTokens', { count: candidate.payload.contextEvidence.estimatedInputTokens.toLocaleString() })
                : t('agentControls.evidenceSources', { count: candidate.payload.contextSources.length })}
            </span>
          </div>
          <CTextarea
            aria-label={t('agentControls.candidateContentAria', { label: candidate.payload.label })}
            value={candidate.event.content}
            disabled={copilot.busy}
            onChange={event => {
              void copilot.updateCandidate(candidate.event.id!, event.target.value)
            }}
            className="min-h-48 w-full resize-y font-mono text-xs leading-5"
          />
          {candidate.payload.contextEvidence && (
            <details className="mt-2 border border-border/60 bg-bg-base px-3 py-2 text-[11px] text-text-muted rounded">
              <summary className="cursor-pointer text-text-secondary">{t('agentControls.evidenceSummary')}</summary>
              <p className="mt-2 break-words">
                {t('agentControls.evidenceIncluded', {
                  list: candidate.payload.contextEvidence.included.length > 0
                    ? listFormat.format(candidate.payload.contextEvidence.included)
                    : t('agentControls.evidenceIncludedEmpty'),
                })}
              </p>
              {candidate.payload.contextEvidence.trimmed.length > 0 && (
                <p className="mt-1 text-warning">
                  {t('agentControls.evidenceTrimmed', { list: listFormat.format(candidate.payload.contextEvidence.trimmed) })}
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
              <Trash2 className="h-3.5 w-3.5" />
              {t('agentControls.btnReject')}
            </button>
            <button
              type="button"
              disabled={copilot.busy}
              onClick={() => { void onAdopted(candidate) }}
              className="flex items-center gap-1 bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90 rounded disabled:opacity-50"
            >
              {copilot.busy
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Check className="h-3.5 w-3.5" />}
              {t('agentControls.btnAdopt')}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

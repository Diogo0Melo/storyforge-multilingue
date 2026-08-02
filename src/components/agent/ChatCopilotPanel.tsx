import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Project } from '../../lib/types'
import { parseAgentEventPayload } from '../../lib/types'
import { useMasterCopilot } from './useMasterCopilot'
import { formatNumber } from '../../i18n/format'

interface Props {
  project: Project
  worldGroupId: number | null
  worldName: string
  onClose: () => void
}

export default function ChatCopilotPanel({
  project,
  worldGroupId,
  worldName,
  onClose,
}: Props) {
  const { t } = useTranslation('panels')
  const copilot = useMasterCopilot({ project, worldGroupId })
  const [showDetails, setShowDetails] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const messages = copilot.events.filter(event => event.kind === 'message')
  const taskEvents = copilot.events.filter(event => event.kind === 'task')
  const latestTasks = useMemo(() => {
    const result = new Map<string, {
      taskId: string
      agentId: string
      status: string
      error?: string
    }>()
    taskEvents.forEach(event => {
      const payload = parseAgentEventPayload<{
        taskId?: string
        agentId?: string
        status?: string
        error?: string
      }>(event, {})
      if (payload.taskId) result.set(payload.taskId, {
        taskId: payload.taskId,
        agentId: payload.agentId ?? 'domain',
        status: payload.status ?? 'unknown',
        error: payload.error,
      })
    })
    return [...result.values()]
  }, [taskEvents])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [copilot.events.length, copilot.pendingCandidates.length])

  return (
    <aside
      aria-label={t('agent.chat.ariaLabel')}
      className="fixed inset-y-0 right-0 z-30 flex h-full w-[min(28rem,calc(100vw-2rem))] shrink-0 flex-col border-l border-border bg-bg-surface shadow-xl lg:static lg:z-auto lg:w-[28rem] lg:shadow-none"
    >
      <header className="border-b border-border/70 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Bot className="h-4 w-4 text-accent" />
              {t('agent.chat.title')}
              <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                {t('agent.chat.singleEntry')}
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] text-text-muted" title={`${project.name} · ${worldName}`}>
              {project.name} · {worldName}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('agent.chat.closeAria')}
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-accent/20 bg-accent/5 p-2 text-[11px] leading-4 text-text-secondary">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          {t('agent.chat.banner')}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {copilot.loading && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('agent.chat.restoring')}
          </div>
        )}

        {messages.map(message => (
          <div
            key={message.id}
            className={`max-w-[92%] rounded-lg px-3 py-2 text-xs leading-5 ${
              message.role === 'user'
                ? 'ml-auto bg-accent text-white'
                : 'border border-border/70 bg-bg-base text-text-secondary'
            }`}
          >
            {message.content}
          </div>
        ))}

        {(latestTasks.length > 0 || copilot.busy) && (
          <section className="rounded-lg border border-border/70 bg-bg-base">
            <button
              type="button"
              aria-expanded={showDetails}
              onClick={() => setShowDetails(value => !value)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <span className="flex items-center gap-2 text-xs font-medium text-text-primary">
                {copilot.busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
                {t('agent.chat.backgroundExec')}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-text-muted">
                {latestTasks.filter(task => task.status === 'completed').length}/{latestTasks.length || '…'}
                {showDetails
                  ? <ChevronDown className="h-3.5 w-3.5" />
                  : <ChevronRight className="h-3.5 w-3.5" />}
              </span>
            </button>
            {showDetails && (
              <div className="space-y-1 border-t border-border/60 px-3 py-2">
                {latestTasks.length === 0 && (
                  <p className="text-[10px] text-text-muted">{t('agent.chat.understanding')}</p>
                )}
                {latestTasks.map(task => (
                  <div key={task.taskId} className="flex items-start justify-between gap-2 text-[10px]">
                    <span className="text-text-secondary">{task.agentId}</span>
                    <span className={
                      task.status === 'completed'
                        ? 'text-success'
                        : task.status === 'failed'
                          ? 'text-error'
                          : 'text-accent'
                    }>
                      {task.status === 'completed' ? t('agent.chat.completed') : task.status === 'failed' ? task.error || t('agent.chat.failed') : t('agent.chat.running')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {copilot.pendingCandidates.map(candidate => (
          <section
            key={candidate.event.id}
            className="rounded-lg border border-accent/30 bg-bg-base p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text-primary">
                {t('agent.chat.pendingConfirm', { label: candidate.payload.label })}
              </span>
              <span
                className="max-w-[45%] truncate text-[10px] text-text-muted"
                title={candidate.payload.contextSources.join('、')}
              >
                {candidate.payload.contextEvidence
                  ? `${t(`agent.context${candidate.payload.contextEvidence.profile.charAt(0).toUpperCase() + candidate.payload.contextEvidence.profile.slice(1)}` as any)} · ≈${formatNumber(candidate.payload.contextEvidence.estimatedInputTokens)} tokens`
                  : t('agent.chat.inputSources', { count: candidate.payload.contextSources.length })}
              </span>
            </div>
            <textarea
              aria-label={t('agent.chat.candidateAria', { label: candidate.payload.label })}
              value={candidate.event.content}
              disabled={copilot.busy}
              onChange={event => {
                void copilot.updateCandidate(candidate.event.id!, event.target.value)
              }}
              className={`h-64 w-full resize-y rounded border border-border bg-bg-surface p-2 text-[11px] leading-5 text-text-primary outline-none focus:border-accent disabled:opacity-60 ${
                candidate.payload.agentId === 'world-origin' ? '' : 'font-mono'
              }`}
            />
            <p className="mt-1 text-[10px] text-text-muted">
              {t('agent.chat.realOutput')}
            </p>
            {candidate.payload.contextEvidence && (
              <details className="mt-2 rounded border border-border/60 bg-bg-surface px-2 py-1.5 text-[10px] text-text-muted">
                <summary className="cursor-pointer text-text-secondary">
                  {t('agent.chat.viewEvidence', { count: candidate.payload.contextEvidence.included.length })}
                </summary>
                <div className="mt-2 space-y-1 break-words">
                  <p>
                    {t('agent.chat.contextEstimate', { estimate: formatNumber(candidate.payload.contextEvidence.estimatedInputTokens), budget: formatNumber(candidate.payload.contextEvidence.inputBudgetTokens) })}
                  </p>
                  <p>{t('agent.chat.included', { items: candidate.payload.contextEvidence.included.join('、') || t('agent.chat.none') })}</p>
                  {candidate.payload.contextEvidence.trimmed.length > 0 && (
                    <p className="text-warning">{t('agent.chat.trimmed', { items: candidate.payload.contextEvidence.trimmed.join('、') })}</p>
                  )}
                  {candidate.payload.contextEvidence.omitted.length > 0 && (
                    <p>{t('agent.chat.omitted', { items: candidate.payload.contextEvidence.omitted.join('、') })}</p>
                  )}
                </div>
              </details>
            )}
            {candidate.payload.teamBudgetEvidence && (
              <p className="mt-2 rounded border border-border/60 bg-bg-surface px-2 py-1.5 text-[10px] text-text-muted">
                {t('agent.chat.teamBudget', { used: formatNumber(candidate.payload.teamBudgetEvidence.usedTokens), max: formatNumber(candidate.payload.teamBudgetEvidence.maxTokens), calls: candidate.payload.teamBudgetEvidence.calls, maxCalls: candidate.payload.teamBudgetEvidence.maxCalls, retries: candidate.payload.teamBudgetEvidence.canonRetries, maxRetries: candidate.payload.teamBudgetEvidence.maxCanonRetries })}
              </p>
            )}
            {(candidate.payload.dependsOnTaskIds?.length ?? 0) > 0 && (
              <p className="mt-1 text-[10px] text-warning">
                {t('agent.chat.adoptUpstreamFirst', { tasks: candidate.payload.dependsOnTaskIds!.join('、') })}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={copilot.busy}
                onClick={() => { void copilot.rejectCandidate(candidate) }}
                className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('agent.chat.reject')}
              </button>
              <button
                type="button"
                disabled={copilot.busy}
                onClick={() => { void copilot.adoptCandidate(candidate) }}
                className="flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
              >
                {copilot.busy
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Check className="h-3.5 w-3.5" />}
                {t('agent.chat.adopt')}
              </button>
            </div>
          </section>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-border/70 p-3"
        onSubmit={event => {
          event.preventDefault()
          void copilot.submit()
        }}
      >
        <textarea
          aria-label={t('agent.chat.tellGoal')}
          value={copilot.authorRequest}
          disabled={copilot.loading || copilot.busy || copilot.pendingCandidates.length > 0}
          maxLength={2000}
          rows={4}
          onChange={event => copilot.setAuthorRequest(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void copilot.submit()
            }
          }}
          placeholder={copilot.pendingCandidates.length
            ? t('agent.chat.placeholderPending')
            : t('agent.chat.placeholder')}
          className="w-full resize-none rounded-md border border-border bg-bg-base px-3 py-2 text-xs leading-5 text-text-primary outline-none focus:border-accent disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-text-muted">{t('agent.chat.enterToSend')}</span>
          {copilot.busy ? (
            <button
              type="button"
              onClick={copilot.stop}
              className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover"
            >
              <Square className="h-3.5 w-3.5" />
              {t('agent.chat.stop')}
            </button>
          ) : (
            <button
              type="submit"
              disabled={
                copilot.loading
                || !copilot.authorRequest.trim()
                || copilot.pendingCandidates.length > 0
              }
              className="flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
              {t('agent.chat.submitToAgent')}
            </button>
          )}
        </div>
      </form>
    </aside>
  )
}

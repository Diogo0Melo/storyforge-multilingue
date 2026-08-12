import type { PromptWorkflow } from '../../../lib/types/workflow'
import {
  WORKFLOW_NODE_HEIGHT,
  WORKFLOW_NODE_WIDTH,
  workflowGraphFor,
} from '../../../lib/workflow/graph'
import type { StepResult } from './WorkflowStepCard'
import { useDomainT } from '../../../i18n'

interface Props {
  workflow: PromptWorkflow
  results: Map<string, StepResult>
}

type StatusKey = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

const STATUS_CLASS_MAP: Record<StatusKey, string> = {
  pending: 'border-border text-text-muted',
  running: 'border-accent bg-accent/10 text-accent',
  done: 'border-success/70 bg-success/10 text-success',
  failed: 'border-error/70 bg-error/10 text-error',
  skipped: 'border-warning/70 bg-warning/10 text-warning',
}

export default function WorkflowExecutionGraph({ workflow, results }: Props) {
  const { t } = useDomainT('settings')

  const statusLabels: Record<StatusKey, string> = {
    pending: t('workflow.statusPending'),
    running: t('workflow.statusRunning'),
    done: t('workflow.statusDone'),
    failed: t('workflow.statusFailed'),
    skipped: t('workflow.statusSkipped'),
  }

  const graph = workflowGraphFor(workflow)
  const stepById = new Map(workflow.steps.map(step => [step.stepId, step]))
  const maxX = Math.max(920, ...graph.nodes.map(node => node.x + WORKFLOW_NODE_WIDTH + 80))
  const maxY = Math.max(340, ...graph.nodes.map(node => node.y + WORKFLOW_NODE_HEIGHT + 60))

  return (
    <section className="rounded-xl border border-border bg-bg-base">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <h3 className="text-xs font-medium text-text-primary">{t('workflow.title')}</h3>
          <p className="text-[10px] text-text-muted">{t('workflow.subtitle')}</p>
        </div>
        <span className="text-[10px] text-text-muted">{t('workflow.stats', { nodes: graph.nodes.length, edges: graph.edges.length })}</span>
      </div>
      <div className="max-h-[360px] overflow-auto">
        <div className="relative origin-top-left" style={{ width: maxX, height: maxY }}>
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            {graph.edges.map(edge => {
              const source = graph.nodes.find(node => node.stepId === edge.sourceStepId)
              const target = graph.nodes.find(node => node.stepId === edge.targetStepId)
              if (!source || !target) return null
              const x1 = source.x + WORKFLOW_NODE_WIDTH
              const y1 = source.y + WORKFLOW_NODE_HEIGHT / 2
              const x2 = target.x
              const y2 = target.y + WORKFLOW_NODE_HEIGHT / 2
              const bend = Math.max(72, Math.abs(x2 - x1) * 0.45)
              return (
                <path
                  key={edge.edgeId}
                  d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-accent/55"
                />
              )
            })}
          </svg>
          {graph.nodes.map(node => {
            const step = stepById.get(node.stepId)
            if (!step) return null
            const result = results.get(step.stepId) ?? {
              stepId: step.stepId,
              output: '',
              status: 'pending' as const,
            }
            const statusKey = result.status as StatusKey
            const statusLabel = statusLabels[statusKey]
            const className = STATUS_CLASS_MAP[statusKey]
            return (
              <div
                key={step.stepId}
                data-testid={`workflow-run-node-${step.stepId}`}
                className={`absolute rounded-xl border-2 bg-bg-surface p-3 shadow ${className}`}
                style={{
                  left: node.x,
                  top: node.y,
                  width: WORKFLOW_NODE_WIDTH,
                  height: WORKFLOW_NODE_HEIGHT,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-text-primary">{step.label}</span>
                  <span className="flex-shrink-0 rounded bg-bg-base px-1.5 py-0.5 text-[9px]">{statusLabel}</span>
                </div>
                <div className="mt-2 truncate rounded bg-bg-base px-2 py-1 text-[10px] text-text-secondary">
                  {step.promptModuleKey}
                </div>
                <p className="mt-2 line-clamp-3 text-[10px] text-text-muted">
                  {result.error || result.output || t('workflow.noCandidateYet')}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

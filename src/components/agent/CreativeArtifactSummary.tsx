import { useDomainT } from '../../i18n'
import type {
  CreativeArtifactStatusV1,
  CreativeArtifactV1,
  CreativeRepairEvidenceV1,
} from '../../lib/agent/creative-reliability'
import type { NarrativeBriefV1 } from '../../lib/agent/narrative-brief'

const STATUS_VIEW = {
  ready: {
    labelKey: 'artifact.status.ready',
    className: 'border-success/30 bg-success/5 text-success',
  },
  'usable-with-warnings': {
    labelKey: 'artifact.status.usableWithWarnings',
    className: 'border-warning/40 bg-warning/5 text-warning',
  },
  'manual-repair': {
    labelKey: 'artifact.status.manualRepair',
    className: 'border-warning/40 bg-warning/5 text-warning',
  },
  blocked: {
    labelKey: 'artifact.status.blocked',
    className: 'border-error/40 bg-error/5 text-error',
  },
} as const satisfies Record<CreativeArtifactStatusV1, {
  labelKey: string
  className: string
}>

const UNKNOWN_STATUS_VIEW = {
  labelKey: 'artifact.status.unknown',
  className: 'border-warning/40 bg-warning/5 text-warning',
}

const REPAIR_LABEL_KEYS = {
  repaired: 'artifact.repair.repaired',
  partial: 'artifact.repair.partial',
  failed: 'artifact.repair.failed',
} as const satisfies Record<CreativeRepairEvidenceV1['result'], string>

const BRIEF_FIELDS = [
  ['creativeGoal', 'artifact.brief.creativeGoal'],
  ['entryState', 'artifact.brief.entryState'],
  ['protagonistDesire', 'artifact.brief.protagonistDesire'],
  ['obstacle', 'artifact.brief.obstacle'],
  ['requiredChoice', 'artifact.brief.requiredChoice'],
  ['stakes', 'artifact.brief.stakes'],
  ['exitChange', 'artifact.brief.exitChange'],
  ['nextPressure', 'artifact.brief.nextPressure'],
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function listValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function displayValue(value: unknown, unavailable: string): string {
  if (typeof value === 'string') return value.trim() || unavailable
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value == null) return unavailable
  try {
    const serialized = JSON.stringify(value)
    return typeof serialized === 'string' ? serialized : unavailable
  } catch {
    return unavailable
  }
}

function metricValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function sumMetric(values: readonly unknown[], field: string): number {
  return values.reduce<number>((sum: number, value: unknown) => {
    const metric = isRecord(value) ? metricValue(value[field]) : null
    return sum + (metric ?? 0)
  }, 0)
}

function completeMetricEvidence(values: readonly unknown[], field: string): boolean {
  return values.length > 0 && values.every(value => (
    isRecord(value) && metricValue(value[field]) != null
  ))
}

export default function CreativeArtifactSummary({
  artifact,
  narrativeBrief,
}: {
  artifact: CreativeArtifactV1
  narrativeBrief?: NarrativeBriefV1
}) {
  const { t, lang } = useDomainT('agent')
  const artifactRecord: Record<string, unknown> = isRecord(artifact)
    ? artifact as Record<string, unknown>
    : {}
  const status = typeof artifactRecord.status === 'string'
    && Object.prototype.hasOwnProperty.call(STATUS_VIEW, artifactRecord.status)
    ? artifactRecord.status as CreativeArtifactStatusV1
    : null
  const view = status ? STATUS_VIEW[status] : UNKNOWN_STATUS_VIEW
  const callEvidence = listValue(artifactRecord.callEvidence)
  const validFragments = listValue(artifactRecord.validFragments)
  const rejectedFragments = listValue(artifactRecord.rejectedFragments)
  const assumptions = listValue(artifactRecord.assumptions)
  const issues = listValue(artifactRecord.issues)
  const totalTokens = sumMetric(callEvidence, 'totalTokens')
  const tokenEvidenceComplete = completeMetricEvidence(callEvidence, 'totalTokens')
  const totalLatencyMs = sumMetric(callEvidence, 'latencyMs')
  const latencyEvidenceComplete = completeMetricEvidence(callEvidence, 'latencyMs')
  const totalCostUsd = sumMetric(callEvidence, 'estimatedCostUsd')
  const costEvidenceComplete = completeMetricEvidence(callEvidence, 'estimatedCostUsd')
  const repairValue = artifactRecord.repair
  const repair = isRecord(repairValue) ? repairValue : null
  const repairResult = repair?.result
  const narrative = isRecord(narrativeBrief) ? narrativeBrief : null
  const mustHonor = narrative ? listValue(narrative.mustHonor) : []
  const unavailable = t('artifact.valueUnavailable')

  return (
    <section
      aria-label={t('artifact.ariaLabel')}
      className={`mt-2 rounded border px-2.5 py-2 text-[10px] ${view.className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-[11px]">{t(view.labelKey, { defaultValue: view.labelKey })}</strong>
        <span>
          {t('artifact.callCount', { count: callEvidence.length })}
          {' · '}
          {tokenEvidenceComplete
            ? t('artifact.tokens', { count: totalTokens.toLocaleString(lang) })
            : t('artifact.tokensIncomplete')}
        </span>
      </div>
      <p className="mt-1">
        {costEvidenceComplete
          ? t('artifact.estimatedCost', { amount: totalCostUsd.toFixed(6) })
          : t('artifact.costUnavailable')}
        {' · '}
        {latencyEvidenceComplete
          ? t('artifact.modelTime', { amount: totalLatencyMs.toLocaleString(lang) })
          : t('artifact.latencyIncomplete')}
      </p>
      {repairValue != null && (
        <p className="mt-1">
          {typeof repairResult === 'string'
            && Object.prototype.hasOwnProperty.call(REPAIR_LABEL_KEYS, repairResult)
            ? t(REPAIR_LABEL_KEYS[repairResult as CreativeRepairEvidenceV1['result']], {
                defaultValue: REPAIR_LABEL_KEYS[repairResult as CreativeRepairEvidenceV1['result']],
              })
            : t('artifact.repair.unavailable')}
        </p>
      )}
      {validFragments.length > 0 && rejectedFragments.length > 0 && (
        <p className="mt-1">
          {t('artifact.fragments', {
            valid: validFragments.length,
            rejected: rejectedFragments.length,
          })}
        </p>
      )}
      {narrative && (
        <details className="mt-1.5">
          <summary className="cursor-pointer">{t('artifact.briefSummary')}</summary>
          <div className="mt-1 space-y-0.5">
            {BRIEF_FIELDS.map(([field, labelKey]) => (
              <p key={field}>
                {t(labelKey, {
                  value: displayValue(narrative[field], unavailable),
                  defaultValue: labelKey,
                })}
              </p>
            ))}
            {mustHonor.length > 0 && (
              <div className="pt-0.5">
                <p>{t('artifact.brief.mustHonor')}</p>
                <ul className="list-disc pl-4">
                  {mustHonor.slice(0, 8).map((item, index) => (
                    <li key={`${index}:${displayValue(item, unavailable)}`}>
                      {displayValue(item, unavailable)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
      {assumptions.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer">
            {t('artifact.assumptionsSummary', { count: assumptions.length })}
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {assumptions.slice(0, 12).map((assumption, index) => {
              const record = isRecord(assumption) ? assumption : null
              const text = displayValue(record?.text ?? assumption, unavailable)
              const id = displayValue(record?.id, String(index))
              return <li key={`${id}:${index}`}>{text}</li>
            })}
          </ul>
        </details>
      )}
      {issues.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer">
            {t('artifact.issuesSummary', { count: issues.length })}
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {issues.slice(0, 8).map((issue, index) => {
              const record = isRecord(issue) ? issue : null
              const code = displayValue(record?.code, 'issue')
              const path = displayValue(record?.path, '?')
              const message = displayValue(record?.message ?? issue, unavailable)
              return <li key={`${code}:${path}:${index}`}>{message}</li>
            })}
          </ul>
        </details>
      )}
    </section>
  )
}

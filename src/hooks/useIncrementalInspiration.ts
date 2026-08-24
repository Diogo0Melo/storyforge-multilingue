import { useEffect, useMemo, useRef, useState } from 'react'
import { getSupportedUiLang, getT } from '../i18n'
import { useAIStream } from './useAIStream'
import { createAISessionKey } from '../stores/ai-generation-session'
import { useMasterCopilot } from '../components/agent/useMasterCopilot'
import { useInspirationWorkspaceStore } from '../stores/inspiration-workspace'
import {
  buildInspirationReverseMultiWorldPrompt,
  buildInspirationReversePrompt,
  parseReverseMultiWorldOutput,
  parseReverseOutput,
  type ReverseMultiWorldResult,
  type ReverseResult,
} from '../lib/ai/inspiration-reverse'
import {
  diffInspirationResults,
  latestInspirationVersion,
  MAX_INSPIRATION_FRAGMENT_CHARS,
  type InspirationResultDiff,
} from '../lib/inspiration/workspace'
import { assembleContext } from '../lib/registry/assemble-context'
import { resolveProjectContentLanguage } from '../lib/ai/content-language'
import { projectReverseShadowFields } from '../lib/ai/language-shadow-projections'
import { runLanguageShadow } from '../lib/ai/language-shadow-runner'
import type { Project } from '../lib/types'
import type { WorkspaceScope } from '../lib/types/world-ownership'
import type {
  InspirationResultMode,
  InspirationSourceKind,
} from '../lib/types/inspiration-workspace'

export function useIncrementalInspiration(
  project: Project,
  onGenerationStarted: () => void,
) {
  const t = getT()
  const isMultiWorld = !!project.enableMultiWorld
  const mode: InspirationResultMode = isMultiWorld ? 'multiworld' : 'single'
  const ai = useAIStream(createAISessionKey(project.id!, 'inspiration.reverse'))
  const workspaceScope = useMemo<WorkspaceScope | undefined>(() => (
    project.id != null && project.activeWorldId != null && project.activeWorkId != null
      ? { projectId: project.id, worldId: project.activeWorldId, workId: project.activeWorkId }
      : undefined
  ), [project.activeWorkId, project.activeWorldId, project.id])
  const scopeInput = workspaceScope ?? project.id!
  const scopeKey = `${project.activeWorldId ?? 'legacy'}:${project.activeWorkId ?? 'legacy'}`
  const copilot = useMasterCopilot({ project, worldGroupId: null })
  const workspace = useInspirationWorkspaceStore()
  const draftKey = `sf-inspiration-draft-${project.id}-${scopeKey}`
  const draftLoaded = useRef(false)

  // Keep the legacy stream transport available for an explicitly unsupported
  // Master controller, but never let that path write a project version. The
  // governed path below always hands the request to Master first.
  const startLocalDirectStream = (messages: ReturnType<typeof buildInspirationReversePrompt>) => (
    ai.start(messages, undefined, {
      category: 'inspiration.reverse',
      projectId: project.id!,
      // WS-3B: structured envelope, reader-facing values; keep the mixed intent.
      outputKind: 'mixed',
    })
  )

  const displayAi = useMemo(() => ({
    isStreaming: ai.isStreaming || copilot.busy,
    output: ai.output,
    error: ai.error ?? copilot.error,
    tokenUsage: ai.tokenUsage,
    stop: () => {
      ai.stop()
      copilot.stop()
    },
  }), [ai, copilot])

  const [inspiration, setInspiration] = useState('')
  const [userHint, setUserHint] = useState('')
  const [result, setResult] = useState<ReverseResult | null>(null)
  const [mwResult, setMwResult] = useState<ReverseMultiWorldResult | null>(null)
  const [mwAdopted, setMwAdopted] = useState(false)
  const [selectedChars, setSelectedChars] = useState<Set<number>>(new Set())
  const [fragmentLabel, setFragmentLabel] = useState('')
  const [sourceKind, setSourceKind] = useState<InspirationSourceKind>('author')
  const [selectedFragmentIds, setSelectedFragmentIds] = useState<Set<string>>(new Set())
  const [pendingDiff, setPendingDiff] = useState<InspirationResultDiff[] | null>(null)
  const [confirmingFusion, setConfirmingFusion] = useState(false)
  const [fusionError, setFusionError] = useState('')

  const pendingCandidate = useMemo(() => copilot.pendingCandidates.find(candidate => (
    candidate.payload.agentId === 'inspiration'
      && candidate.payload.skillId === 'inspiration.reverse'
      && (candidate.payload.mode ?? mode) === mode
  )) ?? null, [copilot.pendingCandidates, mode])

  const quarantinedCandidate = useMemo(() => copilot.quarantinedCandidates.find(candidate => (
    candidate.event.id != null
  )) ?? null, [copilot.quarantinedCandidates])
  const candidateUpdateStatus = pendingCandidate?.event.id == null
    ? undefined
    : copilot.candidateUpdateState[pendingCandidate.event.id]

  const applyResult = (parsed: ReverseResult | ReverseMultiWorldResult, targetMode = mode) => {
    if (targetMode === 'multiworld') {
      setMwResult(parsed as ReverseMultiWorldResult)
      setResult(null)
      return
    }
    const single = parsed as ReverseResult
    setResult(single)
    setMwResult(null)
    setSelectedChars(new Set(single.characters.map((_, index) => index)))
  }

  useEffect(() => {
    let active = true
    setResult(null)
    setMwResult(null)
    setMwAdopted(false)
    setPendingDiff(null)
    setFusionError('')
    void workspace.load(scopeInput).then(() => {
      if (!active) return
      const state = useInspirationWorkspaceStore.getState()
      setSelectedFragmentIds(new Set(state.fragments.map(fragment => fragment.id)))
      const latest = latestInspirationVersion(state.versions, mode)
      if (!latest) return
      try { applyResult(JSON.parse(latest.resultJson), mode) } catch { /* ignore invalid legacy data */ }
    })
    return () => { active = false }
  // Store methods are stable Zustand actions; mode changes reload the matching latest version.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, mode, scopeInput])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey)
      if (saved) {
        const draft = JSON.parse(saved)
        setInspiration(draft.inspiration || '')
        setUserHint(draft.userHint || '')
        if (draft.result) applyResult(draft.result, 'single')
        if (draft.mwResult) {
          applyResult(draft.mwResult, 'multiworld')
          setMwAdopted(!!draft.mwAdopted)
        }
      }
    } catch { /* ignore */ }
    draftLoaded.current = true
  // applyResult is a state-only helper and intentionally not a hook dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  useEffect(() => {
    if (!draftLoaded.current) return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          inspiration,
          userHint,
          result,
          mwResult,
          mwAdopted,
        }))
      } catch { /* ignore */ }
    }, 500)
    return () => clearTimeout(timer)
  }, [draftKey, inspiration, userHint, result, mwResult, mwAdopted])

  const acceptGeneratedResult = (output: string) => {
    const latest = latestInspirationVersion(
      useInspirationWorkspaceStore.getState().versions,
      mode,
    )
    let previous: unknown = {}
    if (latest) {
      try { previous = JSON.parse(latest.resultJson) } catch { previous = {} }
    }
    const parsed = isMultiWorld
      ? parseReverseMultiWorldOutput(output)
      : parseReverseOutput(output)
    if (!parsed) {
      throw new Error(t('errors:inspiration.parseFailed'))
    }
    setFusionError('')
    applyResult(parsed)
    setPendingDiff(diffInspirationResults(previous, parsed))
  }

  useEffect(() => {
    if (!pendingCandidate || pendingCandidate.event.id == null) return
    try {
      acceptGeneratedResult(pendingCandidate.event.content)
      setFusionError('')
    } catch (error) {
      setResult(null)
      setMwResult(null)
      setPendingDiff(null)
      setFusionError(error instanceof Error
        ? error.message
        : t('errors:inspiration.parseFailed'))
    }
  // Candidate event content is the source of truth for generated and edited drafts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCandidate?.event.content, pendingCandidate?.event.id, mode])

  useEffect(() => {
    if (!quarantinedCandidate) return
    setResult(null)
    setMwResult(null)
    setPendingDiff(null)
    setFusionError(t('agent:candidate.quarantinedReason', {
      reason: quarantinedCandidate.reason,
    }))
  }, [quarantinedCandidate, quarantinedCandidate?.event.id, quarantinedCandidate?.reason, t])

  const addCurrentFragment = async () => {
    if (inspiration.trim().length > MAX_INSPIRATION_FRAGMENT_CHARS) {
      setFusionError(t('errors:inspiration.fragmentTooLong', { limit: MAX_INSPIRATION_FRAGMENT_CHARS }))
      return null
    }
    try {
      const fragment = await workspace.addFragment(scopeInput, {
        text: inspiration,
        label: fragmentLabel,
        sourceKind,
      })
      if (!fragment) return null
      setFusionError('')
      setSelectedFragmentIds(current => new Set(current).add(fragment.id))
      return fragment
    } catch (error) {
      setFusionError(error instanceof Error ? error.message : t('errors:inspiration.fragmentSaveFailed'))
      return null
    }
  }

  const generate = async () => {
    if (
      copilot.loading
      || copilot.busy
      || copilot.pendingCandidates.length > 0
      || copilot.quarantinedCandidates.length > 0
    ) return
    if (inspiration.trim().length > MAX_INSPIRATION_FRAGMENT_CHARS) {
      setFusionError(t('errors:inspiration.fragmentTooLong', { limit: MAX_INSPIRATION_FRAGMENT_CHARS }))
      return
    }
    const selectedIds = new Set(selectedFragmentIds)
    if (inspiration.trim()) {
      const fragment = await addCurrentFragment()
      if (fragment) selectedIds.add(fragment.id)
    }
    if (selectedIds.size === 0) return

    const genres = project.genres?.join('/') || project.genre || ''
    let assembled: Awaited<ReturnType<typeof assembleContext>>
    try {
      // This is a read-only preflight. The Master Skill repeats the same
      // registered read from its frozen scope and fragment ids.
      assembled = await assembleContext({
        projectId: project.id!,
        scope: workspaceScope,
        sourceKeys: ['inspirationWorkspace'],
        inspirationFragmentIds: [...selectedIds],
        inspirationMode: mode,
      })
    } catch (error) {
      setFusionError(error instanceof Error
        ? error.message
        : t('agent:copilot.inspiration.noUsableContext'))
      return
    }
    if (!assembled.text.trim()) {
      setFusionError(t('agent:copilot.inspiration.noUsableContext'))
      return
    }

    setResult(null)
    setMwResult(null)
    setMwAdopted(false)
    setPendingDiff(null)
    setFusionError('')
    onGenerationStarted()

    ai.reset()
    const messages = isMultiWorld
      ? buildInspirationReverseMultiWorldPrompt(project.name, genres, assembled.text, userHint || undefined)
      : buildInspirationReversePrompt(project.name, genres, assembled.text, userHint || undefined)
    const request = [
      '基于作者选择的灵感碎片生成结构化灵感反推候选。',
      userHint.trim() ? '作者补充要求：' + userHint.trim() : '',
    ].filter(Boolean).join('\n')
    if (typeof copilot.submitTargetedRequest !== 'function') {
      // Compatibility-only escape hatch for an older controller. It is
      // intentionally preview-only: no local stream can call saveVersion.
      await startLocalDirectStream(messages)
      setFusionError(t('agent:errors.operationFailed'))
      return
    }
    await copilot.submitTargetedRequest(request, {
      agentId: 'inspiration',
      skillId: 'inspiration.reverse',
      instruction: request,
      inspirationFragmentIds: [...selectedIds],
    })
  }

  const confirmFusion = async () => {
    const pendingResult = mode === 'multiworld' ? mwResult : result
    if (!pendingResult || pendingDiff === null || !pendingCandidate) return
    if (copilot.busy) {
      setFusionError(t('agent:errors.operationFailed'))
      return
    }
    if (quarantinedCandidate) {
      setFusionError(t('agent:candidate.quarantinedRecovery'))
      return
    }
    if (candidateUpdateStatus === 'updating') {
      setFusionError(t('agent:errors.candidateTextPersistencePending'))
      return
    }
    if (candidateUpdateStatus === 'failed') {
      setFusionError(t('agent:errors.candidateTextPersistenceFailed'))
      return
    }
    setConfirmingFusion(true)
    try {
      runLanguageShadow({
        family: 'reverse',
        targetLanguage: resolveProjectContentLanguage(project, getSupportedUiLang()),
        fields: projectReverseShadowFields(pendingResult),
      })
      const before = latestInspirationVersion(
        useInspirationWorkspaceStore.getState().versions,
        mode,
      )?.id ?? null
      const adopted = await copilot.adoptCandidate(pendingCandidate)
      await workspace.load(scopeInput)
      const after = latestInspirationVersion(
        useInspirationWorkspaceStore.getState().versions,
        mode,
      )?.id ?? null
      if (!adopted && after === before) {
        throw new Error(t('agent:errors.operationFailed'))
      }
      if (after === before) {
        throw new Error(t('errors:inspiration.fusionSaveFailed'))
      }
      setPendingDiff(null)
      setFusionError('')
    } catch (error) {
      setFusionError(error instanceof Error ? error.message : t('errors:inspiration.fusionSaveFailed'))
    } finally {
      setConfirmingFusion(false)
    }
  }

  const discardFusion = async () => {
    if (copilot.busy) {
      setFusionError(t('agent:errors.operationFailed'))
      return
    }
    if (quarantinedCandidate) {
      setFusionError(t('agent:candidate.quarantinedRecovery'))
      return
    }
    if (candidateUpdateStatus === 'updating') {
      setFusionError(t('agent:errors.candidateTextPersistencePending'))
      return
    }
    if (candidateUpdateStatus === 'failed') {
      setFusionError(t('agent:errors.candidateTextPersistenceFailed'))
      return
    }
    if (pendingCandidate && !await copilot.rejectCandidate(pendingCandidate)) {
      setFusionError(t('agent:errors.operationFailed'))
      return
    }
    try {
      await workspace.load(scopeInput)
      const latest = latestInspirationVersion(useInspirationWorkspaceStore.getState().versions, mode)
      if (latest) applyResult(JSON.parse(latest.resultJson), mode)
      else {
        setResult(null)
        setMwResult(null)
      }
    } catch (error) {
      setResult(null)
      setMwResult(null)
      setFusionError(error instanceof Error ? error.message : t('errors:inspiration.fusionSaveFailed'))
      return
    }
    setPendingDiff(null)
    setFusionError('')
  }

  const removeFragment = async (fragmentId: string) => {
    try {
      await workspace.removeFragment(scopeInput, fragmentId)
      setFusionError('')
      setSelectedFragmentIds(current => {
        const next = new Set(current)
        next.delete(fragmentId)
        return next
      })
    } catch (error) {
      setFusionError(error instanceof Error ? error.message : t('errors:inspiration.fragmentDeleteFailed'))
    }
  }

  return {
    ai: displayAi,
    copilot,
    isMultiWorld,
    mode,
    workspace,
    inspiration,
    setInspiration,
    userHint,
    setUserHint,
    result,
    mwResult,
    mwAdopted,
    setMwAdopted,
    selectedChars,
    setSelectedChars,
    fragmentLabel,
    setFragmentLabel,
    sourceKind,
    setSourceKind,
    selectedFragmentIds,
    setSelectedFragmentIds,
    pendingDiff,
    confirmingFusion,
    fusionError,
    addCurrentFragment,
    generate,
    confirmFusion,
    discardFusion,
    removeFragment,
    pendingCandidate,
  }
}

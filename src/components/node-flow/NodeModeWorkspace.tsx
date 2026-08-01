import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n/i18n'
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleStop,
  Database,
  History,
  Loader2,
  Plus,
  Save,
  Trash2,
  Workflow,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { nanoid } from 'nanoid'
import type { Project, NodeFlow, NodeFlowGraph, NodeFlowKind, NodeFlowNode, NodeRunRecord } from '../../lib/types'
import { EMPTY_NODE_FLOW_GRAPH, parseNodeFlowGraph, NodeFlowGraphError } from '../../lib/types'
import {
  adoptNodeRunOutput,
  runNodeFlow,
  updateNodeRunOutput,
  type NodeExecutionResultMap,
  type NodeInputSnapshotMap,
} from '../../lib/node-flow/executor'
import {
  addNodeEdge,
  NODE_KIND_BY_ID,
  NODE_KIND_DEFINITIONS,
  removeNodeFromGraph,
  validateNodeFlowGraph,
} from '../../lib/node-flow/graph'
import { useNodeFlowStore } from '../../stores/node-flow'
import { useCharacterStore } from '../../stores/character'
import { useWorldviewStore } from '../../stores/worldview'
import { useDialog } from '../shared/Dialog'
import { useToast } from '../shared/Toast'
import NodeFlowCanvas from './NodeFlowCanvas'
import NodeInspector from './NodeInspector'

function defaultNode(kind: NodeFlowKind, index: number): NodeFlowNode {
  const definition = NODE_KIND_BY_ID.get(kind)!
  const base = {
    id: nanoid(),
    kind,
    title: definition.labelKey ? (i18n.t(`panels:${definition.labelKey}` as 'panels:nodeFlow.kind.inputText') as string) : definition.label,
    x: 100 + (index % 4) * 330,
    y: 90 + Math.floor(index / 4) * 250,
  }
  if (kind === 'input.text') return { ...base, config: { text: '' }, inputSlots: [] }
  if (kind === 'source.context') {
    return {
      ...base,
      config: {
        selectionMode: 'exact',
        ragEntryKeys: [],
        sourceKeys: [],
        inputBudgetTokens: 12_000,
        chapterId: 0,
        include: '',
        exclude: '',
      },
      inputSlots: [],
    }
  }
  const slot = {
    id: nanoid(),
    label: i18n.t('panels:nodeFlow.creationMaterial') as string,
    type: 'any' as const,
    required: kind !== 'transform.compose',
    priority: 100,
    maxTokens: 12_000,
  }
  if (kind === 'transform.compose') {
    return { ...base, config: { template: '' }, inputSlots: [{ ...slot, required: false }] }
  }
  if (kind === 'generation.freeform') {
    return {
      ...base,
      config: { instruction: '', systemPrompt: '', maxTokens: 6000 },
      inputSlots: [slot],
    }
  }
  if (kind === 'validation.required') {
    return {
      ...base,
      config: { requiredTerms: '', forbiddenTerms: '' },
      inputSlots: [{ ...slot,   label: i18n.t('panels:nodeFlow.pendingSave') as string, type: 'candidate' }],
    }
  }
  return {
    ...base,
    config: { adoptTarget: 'none' },
    inputSlots: [{ ...slot,   label: i18n.t('panels:nodeFlow.finalContent') as string }],
  }
}

function parseRunData(run: NodeRunRecord | null): {
  snapshots: NodeInputSnapshotMap
  results: NodeExecutionResultMap
} {
  if (!run) return { snapshots: {}, results: {} }
  try {
    return {
      snapshots: JSON.parse(run.inputSnapshotsJson || '{}') as NodeInputSnapshotMap,
      results: JSON.parse(run.nodeResultsJson || '{}') as NodeExecutionResultMap,
    }
  } catch {
    return { snapshots: {}, results: {} }
  }
}

export default function NodeModeWorkspace(props: {
  project: Project
  worldGroupId: number | null
}) {
  const { t } = useTranslation('panels')
  const projectId = props.project.id!
  const toast = useToast()
  const dialog = useDialog()
  const flows = useNodeFlowStore(state => state.flows)
  const runs = useNodeFlowStore(state => state.runs)
  const loading = useNodeFlowStore(state => state.loading)
  const [selectedFlowId, setSelectedFlowId] = useState<number | null>(null)
  const [draft, setDraft] = useState<NodeFlow | null>(null)
  const [graph, setGraph] = useState<NodeFlowGraph>(structuredClone(EMPTY_NODE_FLOW_GRAPH))
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [run, setRun] = useState<NodeRunRecord | null>(null)
  const [snapshots, setSnapshots] = useState<NodeInputSnapshotMap>({})
  const [results, setResults] = useState<NodeExecutionResultMap>({})
  const [showRunDetails, setShowRunDetails] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    void useNodeFlowStore.getState().load(projectId)
  }, [projectId])

  useEffect(() => {
    if (selectedFlowId == null && flows.length) setSelectedFlowId(flows[0].id!)
  }, [flows, selectedFlowId])

  useEffect(() => {
    if (selectedFlowId == null) {
      setDraft(null)
      setGraph(structuredClone(EMPTY_NODE_FLOW_GRAPH))
      return
    }
    let active = true
    void (async () => {
      const flow = flows.find(item => item.id === selectedFlowId)
      if (!flow || !active) return
      setDraft(flow)
      try {
        setGraph(parseNodeFlowGraph(flow.graphJson))
      } catch (error) {
        if (error instanceof NodeFlowGraphError) {
          toast.error(i18n.t(`errors:${error.error.code}` as 'errors:workflow.unsupportedVersion', error.error.params))
        } else {
          toast.error(i18n.t('panels:nodeFlow.loadFailed', { error: error instanceof Error ? error.message : String(error) }))
        }
        setGraph(structuredClone(EMPTY_NODE_FLOW_GRAPH))
      }
      setSelectedNodeId(null)
      setConnectingFrom(null)
      setDirty(false)
      await useNodeFlowStore.getState().loadRuns(projectId, selectedFlowId)
    })()
    return () => { active = false }
    // Deliberately reload only when the selected identity changes. Store refreshes after
    // autosave must not replace newer local edits with the just-returned row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFlowId, projectId])

  useEffect(() => {
    const latest = runs.find(item => item.flowId === selectedFlowId) ?? null
    setRun(latest)
    const parsed = parseRunData(latest)
    setSnapshots(parsed.snapshots)
    setResults(parsed.results)
  }, [runs, selectedFlowId])

  const save = async (notify = false): Promise<NodeFlow | null> => {
    if (!draft) return null
    setSaving(true)
    try {
      const next: NodeFlow = { ...draft, graphJson: JSON.stringify(graph), updatedAt: Date.now() }
      const id = await useNodeFlowStore.getState().saveFlow(next)
      const saved = { ...next, id }
      setDraft(saved)
      setDirty(false)
      if (notify) toast.success(t('nodeFlow.nodeGraphSaved'))
      return saved
    } catch (error) {
      toast.error(t('nodeFlow.saveFailed', { error: error instanceof Error ? error.message : String(error) }))
      return null
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!dirty || !draft) return
    const timer = window.setTimeout(() => { void save(false) }, 700)
    return () => window.clearTimeout(timer)
    // save is intentionally captured as the current draft snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, draft?.name, draft?.description, graph])

  const changeGraph = (next: NodeFlowGraph) => {
    setGraph(next)
    setDirty(true)
  }

  const createFlow = async () => {
    const id = await useNodeFlowStore.getState().createFlow(projectId, props.worldGroupId)
    setSelectedFlowId(id)
  }

  const removeFlow = async () => {
    if (!draft?.id) return
    const confirmed = await dialog.confirm({
      title: t('nodeFlow.deleteGraphTitle', { name: draft.name }),
      message: t('nodeFlow.deleteGraphMessage'),
      confirmText: t('nodeFlow.deleteButton'),
      tone: 'danger',
    })
    if (!confirmed) return
    await useNodeFlowStore.getState().removeFlow(draft.id)
    setSelectedFlowId(null)
    setDraft(null)
    setRun(null)
    setSnapshots({})
    setResults({})
    toast.success(t('nodeFlow.graphDeleted'))
  }

  const runGraph = async (targetNodeId?: string) => {
    if (abortRef.current) return
    const issues = validateNodeFlowGraph(graph)
    if (issues.length) {
      toast.error(issues[0].message)
      return
    }
    const saved = await save(false)
    if (!saved?.id) return
    const controller = new AbortController()
    abortRef.current = controller
    setShowRunDetails(true)
    try {
      const outcome = await runNodeFlow({
        flow: saved,
        targetNodeId,
        signal: controller.signal,
        onUpdate: (nextRun, nextSnapshots, nextResults) => {
          setRun(nextRun)
          setSnapshots({ ...nextSnapshots })
          setResults({ ...nextResults })
        },
      })
      if (outcome.run.status === 'completed') toast.success(t('nodeFlow.runCompleted'))
      else if (outcome.run.status === 'cancelled') toast.info(t('nodeFlow.runCancelled'))
      else toast.error(t('nodeFlow.runFailed'))
      await useNodeFlowStore.getState().loadRuns(projectId, saved.id)
    } finally {
      abortRef.current = null
    }
  }

  const selectedNode = graph.nodes.find(node => node.id === selectedNodeId) ?? null
  const selectedSnapshot = selectedNodeId ? snapshots[selectedNodeId] : undefined
  const selectedResult = selectedNodeId ? results[selectedNodeId] : undefined
  const runningNodeId = useMemo(() => (
    Object.keys(snapshots).find(nodeId => !results[nodeId]) ?? null
  ), [snapshots, results])

  const finishConnection = (targetNodeId: string, targetSlotId: string) => {
    if (!connectingFrom) {
      toast.info(t('nodeFlow.clickUpstreamOutput'))
      return
    }
    const edgeId = nanoid()
    const next = addNodeEdge(graph, {
      id: edgeId,
      sourceNodeId: connectingFrom,
      targetNodeId,
      targetSlotId,
    })
    const hardIssue = validateNodeFlowGraph(next).find(issue => (
      issue.edgeId === edgeId || issue.code === 'cycle'
    ))
    if (hardIssue) {
      toast.error(hardIssue.message)
      return
    }
    changeGraph(next)
    setConnectingFrom(null)
  }

  if (loading && !flows.length) {
    return <div className="flex h-full items-center justify-center text-sm text-text-muted"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('nodeFlow.loadingNodeGraphs')}</div>
  }

  if (!draft) {
    return (
      <div className="flex h-full min-h-[720px] items-center justify-center bg-[radial-gradient(circle,var(--border-subtle)_1px,transparent_1px)] [background-size:28px_28px]">
        <div className="max-w-lg rounded-2xl border border-border bg-bg-surface p-8 text-center shadow-xl">
          <Workflow className="mx-auto mb-4 h-10 w-10 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">{t('nodeFlow.independentNodeMode')}</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {t('nodeFlow.independentNodeDescription')}
          </p>
          <button type="button" onClick={() => void createFlow()} className="mt-5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover">
            {t('nodeFlow.createFirstGraph')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[720px] flex-col overflow-hidden bg-bg-base">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-bg-surface px-3">
        <Workflow className="h-4 w-4 text-accent" />
        <input
          aria-label={t('nodeFlow.nodeGraphName')}
          value={draft.name}
          onChange={event => {
            setDraft({ ...draft, name: event.target.value })
            setDirty(true)
          }}
          className="w-56 rounded border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-text-primary hover:border-border focus:border-accent focus:outline-none"
        />
        <span className="text-[10px] text-text-muted">
          {saving ? t('nodeFlow.saving') : dirty ? t('nodeFlow.pendingSave') : t('nodeFlow.savedLocally')}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" title={t('nodeFlow.zoomOut')} onClick={() => changeGraph({ ...graph, viewport: { ...graph.viewport, zoom: Math.max(0.5, graph.viewport.zoom - 0.1) } })} className="rounded p-1.5 text-text-muted hover:bg-bg-hover"><ZoomOut className="h-4 w-4" /></button>
          <span className="w-10 text-center text-[10px] text-text-muted">{Math.round(graph.viewport.zoom * 100)}%</span>
          <button type="button" title={t('nodeFlow.zoomIn')} onClick={() => changeGraph({ ...graph, viewport: { ...graph.viewport, zoom: Math.min(1.5, graph.viewport.zoom + 0.1) } })} className="rounded p-1.5 text-text-muted hover:bg-bg-hover"><ZoomIn className="h-4 w-4" /></button>
          <button type="button" onClick={() => void save(true)} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-text-secondary hover:bg-bg-hover"><Save className="h-3.5 w-3.5" />{t('nodeFlow.saveButton')}</button>
          {abortRef.current ? (
            <button type="button" onClick={() => abortRef.current?.abort()} className="flex items-center gap-1 rounded bg-error/10 px-3 py-1.5 text-xs text-error"><CircleStop className="h-3.5 w-3.5" />{t('nodeFlow.stop')}</button>
          ) : (
            <button type="button" onClick={() => void runGraph()} className="flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"><Workflow className="h-3.5 w-3.5" />{t('nodeFlow.runAll')}</button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-52 shrink-0 overflow-y-auto border-r border-border bg-bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{t('nodeFlow.nodeGraph')}</p>
            <button type="button" aria-label={t('nodeFlow.newNodeGraph')} onClick={() => void createFlow()} className="rounded p-1 text-accent hover:bg-accent/10"><Plus className="h-3.5 w-3.5" /></button>
          </div>
          <div className="space-y-1">
            {flows.map(flow => (
              <button
                key={flow.id}
                type="button"
                onClick={() => setSelectedFlowId(flow.id!)}
                className={`w-full truncate rounded px-2 py-1.5 text-left text-[11px] ${flow.id === selectedFlowId ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-bg-hover'}`}
              >
                {flow.name}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void removeFlow()} className="mt-2 flex w-full items-center gap-1 rounded px-2 py-1.5 text-[10px] text-text-muted hover:bg-error/10 hover:text-error"><Trash2 className="h-3 w-3" />{t('nodeFlow.deleteCurrentGraph')}</button>

          <div className="mb-2 mt-6 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{t('nodeFlow.addNode')}</p>
            <Plus className="h-3 w-3 text-text-muted" />
          </div>
          <div className="space-y-1.5">
            {NODE_KIND_DEFINITIONS.map(definition => (
              <button
                key={definition.kind}
                type="button"
                onClick={() => {
                  const node = defaultNode(definition.kind, graph.nodes.length)
                  changeGraph({ ...graph, nodes: [...graph.nodes, node] })
                  setSelectedNodeId(node.id)
                }}
                className="w-full rounded border border-border bg-bg-base p-2 text-left hover:border-accent hover:bg-bg-hover"
              >
                <span className="block text-[11px] font-medium text-text-primary">
                  {definition.labelKey ? t(definition.labelKey, definition.label) : definition.label}
                </span>
                <span className="mt-0.5 block text-[9px] leading-3 text-text-muted">
                  {definition.descriptionKey ? t(definition.descriptionKey, definition.description) : definition.description}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <NodeFlowCanvas
            graph={graph}
            selectedNodeId={selectedNodeId}
            connectingFrom={connectingFrom}
            results={results}
            runningNodeId={runningNodeId}
            onSelectNode={setSelectedNodeId}
            onMoveNode={(nodeId, x, y) => changeGraph({
              ...graph,
              nodes: graph.nodes.map(node => node.id === nodeId ? { ...node, x, y } : node),
            })}
            onStartConnection={nodeId => setConnectingFrom(current => current === nodeId ? null : nodeId)}
            onFinishConnection={finishConnection}
            onRemoveNode={nodeId => {
              changeGraph(removeNodeFromGraph(graph, nodeId))
              if (selectedNodeId === nodeId) setSelectedNodeId(null)
            }}
            onRunNode={nodeId => void runGraph(nodeId)}
          />
        </section>

        <div className="w-80 shrink-0">
          <NodeInspector
            projectId={projectId}
            worldGroupId={props.worldGroupId}
            graph={graph}
            node={selectedNode}
            onGraphChange={changeGraph}
          />
        </div>
      </div>

      <section className="shrink-0 border-t border-border bg-bg-surface">
        <button type="button" onClick={() => setShowRunDetails(value => !value)} className="flex h-9 w-full items-center gap-2 px-4 text-left text-[11px] text-text-secondary hover:bg-bg-hover">
          <History className="h-3.5 w-3.5" />
          {t('nodeFlow.executionHistory')}
          <span className="text-text-muted">{run ? `${run.status} · ${new Date(run.startedAt).toLocaleString()}` : t('nodeFlow.notRunYet')}</span>
          <span className="ml-auto">{showRunDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}</span>
        </button>
        {showRunDetails && (
          <div className="grid max-h-64 grid-cols-2 gap-0 overflow-y-auto border-t border-border">
            <div className="border-r border-border p-3">
              <div className="mb-2 flex items-center gap-1 text-[10px] font-semibold text-text-secondary"><Database className="h-3 w-3" />{t('nodeFlow.actualInputSnapshot')}</div>
              {!selectedSnapshot ? (
                <p className="text-[10px] text-text-muted">{t('nodeFlow.selectNodeToViewInput')}</p>
              ) : (
                <div className="space-y-2 text-[10px] text-text-secondary">
                  <p>{t('nodeFlow.estimatedInput', { tokens: selectedSnapshot.totalTokens.toLocaleString() })}</p>
                  {selectedSnapshot.inputs.map(item => (
                    <details key={`${item.sourceNodeId}:${item.targetSlotId}`} className="rounded border border-border bg-bg-base p-2">
                      <summary className="cursor-pointer">{item.targetSlotLabel} ← {item.sourceTitle} · {item.tokens} tokens</summary>
                      <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-[9px] text-text-muted">{item.content}</pre>
                    </details>
                  ))}
                  {selectedSnapshot.sourceEvidence && (
                    <div className="rounded border border-border bg-bg-base p-2">
                      <p>{t('nodeFlow.included', { items: selectedSnapshot.sourceEvidence.included.join('、') || t('nodeFlow.none') })}</p>
                      <p>{t('nodeFlow.omitted', { items: selectedSnapshot.sourceEvidence.omitted.join('、') || t('nodeFlow.none') })}</p>
                      <p>{t('nodeFlow.trimmed', { items: selectedSnapshot.sourceEvidence.trimmed.join('、') || t('nodeFlow.none') })}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-text-secondary">{t('nodeFlow.nodeOutput')}</span>
                {selectedResult?.adoptedAt && (
                  <span className="flex items-center gap-1 text-[9px] text-success"><Check className="h-3 w-3" />{t('nodeFlow.adopted', { time: new Date(selectedResult.adoptedAt).toLocaleString() })}</span>
                )}
              </div>
              {!selectedResult ? (
                <p className="text-[10px] text-text-muted">{t('nodeFlow.selectNodeToViewOutput')}</p>
              ) : (
                <>
                  {selectedResult.error && <p className="mb-2 rounded bg-error/10 p-2 text-[10px] text-error">{selectedResult.error}</p>}
                  <textarea
                    aria-label={t('nodeFlow.nodeOutputContent')}
                    value={selectedResult.output}
                    onChange={event => setResults({
                      ...results,
                      [selectedResult.nodeId]: { ...selectedResult, output: event.target.value, adoptedAt: undefined, adoptionTarget: undefined },
                    })}
                    onBlur={() => {
                      if (run?.id) void updateNodeRunOutput({
                        runId: run.id,
                        nodeId: selectedResult.nodeId,
                        output: results[selectedResult.nodeId].output,
                      }).catch(error => toast.error(error instanceof Error ? error.message : String(error)))
                    }}
                    className="h-28 w-full resize-y rounded border border-border bg-bg-base p-2 text-[10px] leading-4 text-text-primary outline-none focus:border-accent"
                  />
                  {selectedNode?.kind === 'output.preview' && selectedNode.config.adoptTarget !== 'none' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!run?.id) return
                        void adoptNodeRunOutput({
                          runId: run.id,
                          nodeId: selectedResult.nodeId,
                          output: results[selectedResult.nodeId].output,
                        }).then(async outcome => {
                          setResults(outcome.results)
                          await Promise.all([
                            useWorldviewStore.getState().loadAll(projectId, props.worldGroupId),
                            useCharacterStore.getState().loadAll(projectId),
                          ])
                          toast.success(outcome.message)
                        }).catch(error => toast.error(error instanceof Error ? error.message : String(error)))
                      }}
                      className="mt-2 rounded bg-accent px-3 py-1.5 text-[10px] font-medium text-white hover:bg-accent-hover"
                    >
                      {t('nodeFlow.confirmAdoptToProject')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

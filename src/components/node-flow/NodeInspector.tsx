import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { nanoid } from 'nanoid'
import { CONTEXT_SOURCES } from '../../lib/registry/context-sources'
import type { NodeFlowGraph, NodeFlowNode, NodeValueType } from '../../lib/types'
import { removeSlotFromGraph } from '../../lib/node-flow/graph'
import RagEntrySelector from '../retrieval/RagEntrySelector'

const VALUE_TYPES: NodeValueType[] = ['any', 'text', 'context', 'json', 'candidate']

function TextArea(props: {
  label: string
  value: string
  rows?: number
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium text-text-secondary">{props.label}</span>
      <textarea
        value={props.value}
        rows={props.rows ?? 4}
        onChange={event => props.onChange(event.target.value)}
        className="w-full resize-y rounded border border-border bg-bg-base px-2 py-1.5 text-[11px] leading-4 text-text-primary outline-none focus:border-accent"
      />
    </label>
  )
}

export default function NodeInspector(props: {
  projectId: number
  worldGroupId: number | null
  graph: NodeFlowGraph
  node: NodeFlowNode | null
  onGraphChange: (graph: NodeFlowGraph) => void
}) {
  const { t } = useTranslation('panels')
  const { node } = props
  if (!node) {
    return (
      <aside className="flex h-full items-center justify-center border-l border-border bg-bg-surface p-6 text-center text-xs text-text-muted">
        {t('nodeFlow.inspectorEmpty')}
      </aside>
    )
  }

  const updateNode = (patch: Partial<NodeFlowNode>) => {
    props.onGraphChange({
      ...props.graph,
      nodes: props.graph.nodes.map(item => item.id === node.id ? { ...item, ...patch } : item),
    })
  }
  const updateConfig = (key: string, value: unknown) => {
    updateNode({ config: { ...node.config, [key]: value } })
  }
  const sourceKeys = Array.isArray(node.config.sourceKeys)
    ? node.config.sourceKeys.filter((value): value is string => typeof value === 'string')
    : []
  const ragEntryKeys = Array.isArray(node.config.ragEntryKeys)
    ? node.config.ragEntryKeys.filter((value): value is string => typeof value === 'string')
    : []
  const selectionMode = node.config.selectionMode === 'registered'
    || (node.config.selectionMode == null && sourceKeys.length > 0)
    ? 'registered'
    : 'exact'

  return (
    <aside className="h-full overflow-y-auto border-l border-border bg-bg-surface p-4">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-text-secondary">{t('nodeFlow.nodeName')}</span>
          <input
            value={node.title}
            onChange={event => updateNode({ title: event.target.value })}
            className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
          />
        </label>

        {node.kind === 'input.text' && (
          <TextArea
            label={t('nodeFlow.authorInput')}
            value={String(node.config.text ?? '')}
            rows={10}
            onChange={value => updateConfig('text', value)}
          />
        )}

        {node.kind === 'source.context' && (
          <>
            <div className="grid grid-cols-2 rounded border border-border bg-bg-base p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => updateConfig('selectionMode', 'exact')}
                className={`rounded px-2 py-1 ${selectionMode === 'exact' ? 'bg-accent text-white' : 'text-text-muted hover:bg-bg-hover'}`}
              >
                {t('nodeFlow.exactData')}
              </button>
              <button
                type="button"
                onClick={() => updateConfig('selectionMode', 'registered')}
                className={`rounded px-2 py-1 ${selectionMode === 'registered' ? 'bg-accent text-white' : 'text-text-muted hover:bg-bg-hover'}`}
              >
                {t('nodeFlow.registeredSources')}
              </button>
            </div>
            {selectionMode === 'exact' ? (
              <RagEntrySelector
                projectId={props.projectId}
                worldGroupId={props.worldGroupId}
                selectedKeys={ragEntryKeys}
                onChange={keys => updateConfig('ragEntryKeys', keys)}
              />
            ) : <section>
              <div className="mb-2">
                <p className="text-[10px] font-medium text-text-secondary">{t('nodeFlow.projectElementSources')}</p>
                <p className="text-[9px] leading-4 text-text-muted">
                  {t('nodeFlow.projectElementDescription')}
                </p>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded border border-border bg-bg-base p-2">
                {CONTEXT_SOURCES.filter(source => source.key !== 'ragSelection').map(source => (
                  <label key={source.key} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-bg-hover">
                    <input
                      type="checkbox"
                      checked={sourceKeys.includes(source.key)}
                      onChange={() => {
                        updateConfig(
                          'sourceKeys',
                          sourceKeys.includes(source.key)
                            ? sourceKeys.filter(key => key !== source.key)
                            : [...sourceKeys, source.key],
                        )
                      }}
                      className="mt-0.5 accent-[var(--color-accent)]"
                    />
                    <span>
                      <span className="block text-[10px] text-text-secondary">{source.label}</span>
                      <span className="block text-[9px] text-text-muted">{source.key} · {source.scope}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>}
            <div className={selectionMode === 'registered' ? 'grid grid-cols-2 gap-2' : ''}>
              {selectionMode === 'registered' && (
                <label>
                  <span className="mb-1 block text-[10px] text-text-secondary">{t('nodeFlow.chapterId')}</span>
                  <input
                    type="number"
                    min={0}
                    value={Number(node.config.chapterId ?? 0)}
                    onChange={event => updateConfig('chapterId', Number(event.target.value) || 0)}
                    className="w-full rounded border border-border bg-bg-base px-2 py-1 text-[11px]"
                  />
                </label>
              )}
              <label>
                <span className="mb-1 block text-[10px] text-text-secondary">{t('nodeFlow.tokenLimit')}</span>
                <input
                  type="number"
                  min={100}
                  value={Number(node.config.inputBudgetTokens ?? 12000)}
                  onChange={event => updateConfig('inputBudgetTokens', Number(event.target.value) || 12000)}
                  className="w-full rounded border border-border bg-bg-base px-2 py-1 text-[11px]"
                />
              </label>
            </div>
            {selectionMode === 'registered' && (
              <>
                <TextArea
                  label={t('nodeFlow.includeKeywords')}
                  value={String(node.config.include ?? '')}
                  rows={3}
                  onChange={value => updateConfig('include', value)}
                />
                <TextArea
                  label={t('nodeFlow.excludeKeywords')}
                  value={String(node.config.exclude ?? '')}
                  rows={2}
                  onChange={value => updateConfig('exclude', value)}
                />
              </>
            )}
          </>
        )}

        {node.kind === 'transform.compose' && (
          <TextArea
            label={t('nodeFlow.composeTemplate')}
            value={String(node.config.template ?? '')}
            rows={9}
            onChange={value => updateConfig('template', value)}
          />
        )}

        {node.kind === 'generation.freeform' && (
          <>
            <TextArea
              label={t('nodeFlow.creationInstruction')}
              value={String(node.config.instruction ?? '')}
              rows={7}
              onChange={value => updateConfig('instruction', value)}
            />
            <TextArea
              label={t('nodeFlow.nodeSystemConstraint')}
              value={String(node.config.systemPrompt ?? '')}
              rows={5}
              onChange={value => updateConfig('systemPrompt', value)}
            />
            <label className="block">
              <span className="mb-1 block text-[10px] text-text-secondary">{t('nodeFlow.maxOutputTokens')}</span>
              <input
                type="number"
                min={100}
                value={Number(node.config.maxTokens ?? 6000)}
                onChange={event => updateConfig('maxTokens', Number(event.target.value) || 6000)}
                className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-[11px]"
              />
            </label>
          </>
        )}

        {node.kind === 'validation.required' && (
          <>
            <TextArea
              label={t('nodeFlow.requiredContent')}
              value={String(node.config.requiredTerms ?? '')}
              rows={3}
              onChange={value => updateConfig('requiredTerms', value)}
            />
            <TextArea
              label={t('nodeFlow.forbiddenContent')}
              value={String(node.config.forbiddenTerms ?? '')}
              rows={3}
              onChange={value => updateConfig('forbiddenTerms', value)}
            />
          </>
        )}

        {node.kind === 'output.preview' && (
          <label className="block">
            <span className="mb-1 block text-[10px] text-text-secondary">{t('nodeFlow.confirmWriteTarget')}</span>
            <select
              value={String(node.config.adoptTarget ?? 'none')}
              onChange={event => updateConfig('adoptTarget', event.target.value)}
              className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-[11px]"
            >
              <option value="none">{t('nodeFlow.saveAsNodeOutput')}</option>
              <option value="world-origin">{t('nodeFlow.worldOrigin')}</option>
              <option value="create-character">{t('nodeFlow.createCharacter')}</option>
            </select>
          </label>
        )}

        {node.inputSlots.length > 0 || node.kind !== 'input.text' && node.kind !== 'source.context' ? (
          <section className="border-t border-border/70 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-text-secondary">{t('nodeFlow.dynamicInputSlots')}</p>
                <p className="text-[9px] text-text-muted">{t('nodeFlow.dynamicSlotDescription')}</p>
              </div>
              <button
                type="button"
                onClick={() => updateNode({
                  inputSlots: [...node.inputSlots, {
                    id: nanoid(),
                    label: t('nodeFlow.inputSlot', { index: node.inputSlots.length + 1 }),
                    type: 'any',
                    required: false,
                    priority: 50,
                    maxTokens: 6000,
                  }],
                })}
                className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-accent hover:bg-accent/10"
              >
                <Plus className="h-3 w-3" /> {t('nodeFlow.add')}
              </button>
            </div>
            <div className="space-y-2">
              {node.inputSlots.map(slot => (
                <div key={slot.id} className="rounded border border-border bg-bg-base p-2">
                  <div className="flex gap-1">
                    <input
                      value={slot.label}
                      onChange={event => updateNode({
                        inputSlots: node.inputSlots.map(item => item.id === slot.id
                          ? { ...item, label: event.target.value }
                          : item),
                      })}
                      className="min-w-0 flex-1 rounded border border-border bg-bg-surface px-1.5 py-1 text-[10px]"
                    />
                    <button
                      type="button"
                      aria-label={t('nodeFlow.deleteSlot', { label: slot.label })}
                      onClick={() => props.onGraphChange(removeSlotFromGraph(props.graph, node.id, slot.id))}
                      className="rounded p-1 text-text-muted hover:text-error"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    <select
                      value={slot.type}
                      onChange={event => updateNode({
                        inputSlots: node.inputSlots.map(item => item.id === slot.id
                          ? { ...item, type: event.target.value as NodeValueType }
                          : item),
                      })}
                      className="rounded border border-border bg-bg-surface px-1 py-1 text-[9px]"
                    >
                      {VALUE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <input
                      type="number"
                      title={t('nodeFlow.priority')}
                      value={slot.priority}
                      onChange={event => updateNode({
                        inputSlots: node.inputSlots.map(item => item.id === slot.id
                          ? { ...item, priority: Number(event.target.value) || 0 }
                          : item),
                      })}
                      className="rounded border border-border bg-bg-surface px-1 py-1 text-[9px]"
                    />
                    <input
                      type="number"
                      title={t('nodeFlow.tokenLimit')}
                      value={slot.maxTokens ?? 0}
                      onChange={event => updateNode({
                        inputSlots: node.inputSlots.map(item => item.id === slot.id
                          ? { ...item, maxTokens: Number(event.target.value) || undefined }
                          : item),
                      })}
                      className="rounded border border-border bg-bg-surface px-1 py-1 text-[9px]"
                    />
                  </div>
                  <label className="mt-1 flex items-center gap-1 text-[9px] text-text-muted">
                    <input
                      type="checkbox"
                      checked={slot.required}
                      onChange={event => updateNode({
                        inputSlots: node.inputSlots.map(item => item.id === slot.id
                          ? { ...item, required: event.target.checked }
                          : item),
                      })}
                    />
                    {t('nodeFlow.runtimeRequired')}
                  </label>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="border-t border-border/70 pt-3">
          <p className="text-[10px] font-medium text-text-secondary">{t('nodeFlow.currentConnections')}</p>
          <div className="mt-1 space-y-1">
            {props.graph.edges.filter(edge => edge.targetNodeId === node.id).map(edge => {
              const source = props.graph.nodes.find(item => item.id === edge.sourceNodeId)
              const slot = node.inputSlots.find(item => item.id === edge.targetSlotId)
              return (
                <div key={edge.id} className="flex items-center justify-between gap-2 rounded bg-bg-base px-2 py-1 text-[9px]">
                  <span className="truncate">{source?.title ?? edge.sourceNodeId} → {slot?.label ?? edge.targetSlotId}</span>
                  <button
                    type="button"
                    aria-label={t('nodeFlow.deleteConnection')}
                    onClick={() => props.onGraphChange({
                      ...props.graph,
                      edges: props.graph.edges.filter(item => item.id !== edge.id),
                    })}
                    className="text-text-muted hover:text-error"
                  >
                    ×
                  </button>
                </div>
              )
            })}
            {!props.graph.edges.some(edge => edge.targetNodeId === node.id) && (
              <p className="text-[9px] text-text-muted">{t('nodeFlow.noInputConnections')}</p>
            )}
          </div>
        </section>
      </div>
    </aside>
  )
}

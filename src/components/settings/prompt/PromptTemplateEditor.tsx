import { useState, useEffect, useMemo } from 'react'
import {
  Save, Trash2, Copy, Download, CheckCircle2, Lock, Plus, X,
} from 'lucide-react'
import { usePromptStore } from '../../../stores/prompt'
import { renderPrompt } from '../../../lib/ai/prompt-engine'
import { PREVIEW_VARS } from '../../../lib/ai/prompt-preview-vars'
import type { PromptTemplate, PromptModuleKey, PromptParameter } from '../../../lib/types/prompt'
import PromptParametersEditor from './PromptParametersEditor'
import PromptExamplesEditor from './PromptExamplesEditor'
import { useDialog } from '../../shared/Dialog'
import { useToast } from '../../shared/Toast'
import { useDomainT } from '../../../i18n'
import { toCamelLabelKey, resolveSystemSeedDisplay } from '../../../lib/ai/seed-i18n'

const ALL_MODULE_KEY_VALUES: PromptModuleKey[] = [
  'worldview.dimension', 'worldview.generate', 'worldview.worldbuilding',
  'character.generate', 'character.dimension', 'character.design',
  'story.generate', 'story.brief', 'story.ideation', 'story.positioning',
  'story.core', 'story.packaging', 'rules.generate', 'research.method',
  'prompt.operations', 'outline.volume', 'outline.chapter', 'outline.plot',
  'outline.structure', 'outline.long-form', 'outline.short-story',
  'outline.serialization', 'detail.scene', 'detail.chapter-planning',
  'chapter.content', 'chapter.continue', 'chapter.drafting',
  'chapter.continuity', 'chapter.line-editing', 'chapter.memory',
  'chapter.polish', 'chapter.expand', 'chapter.de-ai',
  'review.developmental', 'review.line-editing', 'review.reader-validation',
  'foreshadow.generate', 'geography.concept-map', 'geography.image-map-prompt',
  'import.parse-all', 'import.parse-character', 'import.parse-worldview',
  'import.parse-outline', 'style.learn', 'style.calibrate',
]

interface Props {
  template: PromptTemplate | null
  onChanged: () => void
  onDeleted: () => void
}

export default function PromptTemplateEditor({ template, onChanged, onDeleted }: Props) {
  const { t } = useDomainT('settings')
  const dialog = useDialog()
  const toast = useToast()
  const saveTemplate = usePromptStore(s => s.saveTemplate)
  const cloneTemplate = usePromptStore(s => s.cloneTemplate)
  const setActive = usePromptStore(s => s.setActive)
  const deleteTemplate = usePromptStore(s => s.deleteTemplate)

  const [draft, setDraft] = useState<PromptTemplate | null>(template)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setDraft(template)
    setDirty(false)
  }, [template?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => {
    if (!draft) return null
    try {
      const previewVars = { ...PREVIEW_VARS }
      for (const binding of draft.variableBindings ?? []) {
        if (previewVars[binding.variable] == null || previewVars[binding.variable] === '') {
          previewVars[binding.variable] = `(Example: ${binding.label})`
        }
      }
      return renderPrompt(draft, previewVars)
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [draft])

  if (!template || !draft) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        {t('promptEditor.selectPrompt')}
      </div>
    )
  }

  const isSystem = draft.scope === 'system'
  // 系统种子显示名/描述经 settings ns（promptTemplates.*）解析；用户模板与
  // 未登记种子保留原文（resolveSystemSeedDisplay 内部以原文作 defaultValue）。
  const display = resolveSystemSeedDisplay(t, 'prompt', draft)

  const update = (patch: Partial<PromptTemplate>) => {
    setDraft({ ...draft, ...patch })
    setDirty(true)
  }

  const handleSave = async () => {
    if (!draft.id) return
    await saveTemplate(draft)
    setDirty(false)
    onChanged()
  }

  const handleClone = async () => {
    if (!draft.id) return
    const newId = await cloneTemplate(draft.id)
    onChanged()
    toast.success(t('promptEditor.cloneSuccess', { id: newId }))
  }

  const handleSetActive = async () => {
    if (!draft.id) return
    await setActive(draft.id)
    onChanged()
  }

  const handleDelete = async () => {
    if (!draft.id) return
    const ok = await dialog.confirm({
      title: t('promptEditor.deleteTitle', { name: draft.name }),
      message: t('promptEditor.deleteMessage'),
      confirmText: t('common:delete'),
      tone: 'danger',
    })
    if (!ok) return
    await deleteTemplate(draft.id)
    onDeleted()
    onChanged()
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${draft.name.replace(/\s+/g, '_')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const addVariable = async () => {
    const name = (await dialog.prompt({
      title: t('promptEditor.newVariableTitle'),
      message: t('promptEditor.newVariableMessage'),
      placeholder: 'variable_name',
    }))?.trim()
    if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) return
    if (draft.variables.includes(name)) return
    update({ variables: [...draft.variables, name] })
  }
  const removeVariable = (name: string) => {
    update({ variables: draft.variables.filter(v => v !== name) })
  }

  // P1-5:locale 登记的整键标签块是 promptModuleKeys.*（'import.parse-all' →
  // 'importParseAll'）；旧前缀 moduleKey.* 无对应键、kebab 原文也查不中。
  // 派生处归一化，键缺失时回退原 moduleKey。
  const moduleKeyLabel = (mk: string) => t(`promptModuleKeys.${toCamelLabelKey(mk)}` as any, mk) || mk

  return (
    <div className="p-5 space-y-4">
      <div className="bg-bg-surface border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {isSystem ? (
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-text-muted" />
                <h3 className="text-base font-semibold text-text-primary truncate">{display.name}</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning">{t('promptEditor.systemBadge')}</span>
                {draft.isDefault && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">{t('promptEditor.defaultBadge')}</span>
                )}
                {draft.isActive && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success">{t('promptEditor.activeBadge')}</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draft.name}
                  onChange={e => update({ name: e.target.value })}
                  className="flex-1 px-2 py-1 bg-bg-base border border-border rounded text-base font-semibold text-text-primary focus:outline-none focus:border-accent"
                />
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/15 text-info">{t('promptEditor.userBadge')}</span>
                {draft.isActive && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success">{t('promptEditor.activeBadge')}</span>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-text-secondary">
              {isSystem ? display.description : (
                <input
                  type="text"
                  value={draft.description}
                  onChange={e => update({ description: e.target.value })}
                  placeholder={t('promptEditor.descriptionPlaceholder')}
                  className="w-full px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                />
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label className="text-text-secondary flex-shrink-0">{t('promptEditor.moduleLabel')}</label>
          {isSystem ? (
            <span className="text-text-primary">{moduleKeyLabel(draft.moduleKey)}</span>
          ) : (
            <select
              value={draft.moduleKey}
              onChange={e => update({ moduleKey: e.target.value as PromptModuleKey })}
              className="flex-1 px-2 py-1 bg-bg-base border border-border rounded text-text-primary focus:outline-none focus:border-accent"
            >
              {ALL_MODULE_KEY_VALUES.map(mk => (
                <option key={mk} value={mk}>{moduleKeyLabel(mk)}</option>
              ))}
            </select>
          )}
        </div>

        {(draft.moduleKey === 'chapter.content' || draft.moduleKey === 'chapter.continue') && (
          <div className="flex items-center gap-2 text-xs">
            <label className="text-text-secondary flex-shrink-0">{t('promptEditor.continuityLabel')}</label>
            <select
              value={draft.continuityMode ?? 'inherit'}
              onChange={e => update({
                continuityMode: e.target.value as PromptTemplate['continuityMode'],
              })}
              disabled={isSystem}
              className="flex-1 px-2 py-1 bg-bg-base border border-border rounded text-text-primary disabled:opacity-60"
            >
              <option value="inherit">{t('promptEditor.continuityInherit')}</option>
              <option value="required">{t('promptEditor.continuityRequired')}</option>
              <option value="off">{t('promptEditor.continuityOff')}</option>
            </select>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {!isSystem && (
            <button
              onClick={handleSave}
              disabled={!dirty}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-bg-base text-sm rounded hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" /> {t('common:save')}{dirty && ' *'}
            </button>
          )}
          {!draft.isActive && (
            <button
              onClick={handleSetActive}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 text-success text-sm rounded hover:bg-success/20"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> {t('promptEditor.setActive')}
            </button>
          )}
          <button
            onClick={handleClone}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-hover text-text-primary text-sm rounded hover:bg-bg-elevated"
          >
            <Copy className="w-3.5 h-3.5" /> {t('promptEditor.clone')}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-hover text-text-primary text-sm rounded hover:bg-bg-elevated"
          >
            <Download className="w-3.5 h-3.5" /> {t('promptEditor.export')}
          </button>
          {!isSystem && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-error/10 text-error text-sm rounded hover:bg-error/20 ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" /> {t('common:delete')}
            </button>
          )}
        </div>
      </div>

      <div className="bg-bg-surface border border-border rounded-xl p-4">
        <label className="block text-sm font-medium text-text-primary mb-2">System Prompt</label>
        <textarea
          value={draft.systemPrompt}
          onChange={e => update({ systemPrompt: e.target.value })}
          readOnly={isSystem}
          rows={8}
          className={`w-full px-3 py-2 bg-bg-base border border-border rounded text-sm text-text-primary font-mono focus:outline-none focus:border-accent resize-y ${
            isSystem ? 'opacity-70 cursor-not-allowed' : ''
          }`}
        />
      </div>

      <div className="bg-bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-primary">{t('promptEditor.userPromptTemplateLabel')}</label>
          <span className="text-xs text-text-muted">
            <span dangerouslySetInnerHTML={{ __html: t('promptEditor.templateSyntaxHint') }} />
          </span>
        </div>
        <textarea
          value={draft.userPromptTemplate}
          onChange={e => update({ userPromptTemplate: e.target.value })}
          readOnly={isSystem}
          rows={12}
          className={`w-full px-3 py-2 bg-bg-base border border-border rounded text-sm text-text-primary font-mono focus:outline-none focus:border-accent resize-y ${
            isSystem ? 'opacity-70 cursor-not-allowed' : ''
          }`}
        />
      </div>

      <PromptParametersEditor
        parameters={draft.parameters || []}
        onChange={(params: PromptParameter[]) => update({ parameters: params })}
        readOnly={isSystem}
      />

      <PromptExamplesEditor
        template={draft}
        onChange={(examples) => update({ examples })}
        readOnly={isSystem}
      />

      <div className="bg-bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-primary">{t('promptEditor.variablesTitle')}</label>
          {!isSystem && (
            <button
              onClick={addVariable}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-bg-hover text-text-primary rounded hover:bg-bg-elevated"
            >
              <Plus className="w-3 h-3" /> {t('promptEditor.addVariable')}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {draft.variables.length === 0 && (
            <span className="text-xs text-text-muted">{t('promptEditor.noVariables')}</span>
          )}
          {draft.variables.map(v => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-accent/10 text-accent rounded"
            >
              {v}
              {!isSystem && (
                <button onClick={() => removeVariable(v)} className="hover:text-error">
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {draft.variableBindings?.length ? (
        <div className="bg-bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-text-primary">{t('promptEditor.variableBindingsTitle')}</label>
            {draft.assetId && <span className="text-xs font-mono text-accent">{draft.assetId}</span>}
          </div>
          <div className="space-y-2">
            {draft.variableBindings.map(binding => (
              <div key={binding.variable} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <code className="text-accent">{binding.variable}</code>
                  <span className="text-text-primary">{binding.label}</span>
                  {binding.required && <span className="text-error">{t('promptEditor.bindingRequired')}</span>}
                  {binding.manual && <span className="text-text-muted">{t('promptEditor.bindingManual')}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-text-secondary">
                  {binding.projectField && (
                    <span className="px-1.5 py-0.5 bg-bg-base rounded">{t('promptEditor.bindingProjectField', { field: binding.projectField })}</span>
                  )}
                  {binding.sourceKeys?.map(sourceKey => (
                    <span key={sourceKey} className="px-1.5 py-0.5 bg-bg-base rounded">{t('promptEditor.bindingSourceKey', { key: sourceKey })}</span>
                  ))}
                  {!binding.projectField && !binding.sourceKeys?.length && (
                    <span className="px-1.5 py-0.5 bg-bg-base rounded">{t('promptEditor.bindingManualInput')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="bg-bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-primary">{t('promptEditor.previewTitle')}</label>
          <span className="text-xs text-text-muted">{t('promptEditor.previewHint')}</span>
        </div>
        {preview && 'error' in preview ? (
          <div className="text-error text-sm">{t('promptEditor.renderError', { error: preview.error })}</div>
        ) : preview ? (
          <div className="space-y-2">
            {preview.messages.map((m, i) => (
              <div key={i} className="border border-border rounded">
                <div className="px-3 py-1 bg-bg-base text-xs text-text-secondary border-b border-border">
                  {m.role === 'system' ? '🛠 SYSTEM' : '💬 USER'}
                </div>
                <pre className="px-3 py-2 text-xs text-text-primary whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                  {m.content}
                </pre>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

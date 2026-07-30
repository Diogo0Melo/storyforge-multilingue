import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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

const MODULE_KEY_VALUES: PromptModuleKey[] = [
  'worldview.dimension', 'worldview.generate', 'worldview.worldbuilding',
  'character.generate', 'character.dimension', 'character.design',
  'story.generate', 'story.brief', 'story.ideation', 'story.positioning', 'story.core', 'story.packaging',
  'rules.generate', 'research.method', 'prompt.operations',
  'outline.volume', 'outline.chapter', 'outline.plot', 'outline.structure',
  'outline.long-form', 'outline.short-story', 'outline.serialization',
  'detail.scene', 'detail.chapter-planning',
  'chapter.content', 'chapter.continue', 'chapter.drafting', 'chapter.continuity',
  'chapter.line-editing', 'chapter.memory', 'chapter.polish', 'chapter.expand', 'chapter.de-ai',
  'review.developmental', 'review.line-editing', 'review.reader-validation',
  'foreshadow.generate',
  'geography.concept-map', 'geography.image-map-prompt',
  'import.parse-all', 'import.parse-character', 'import.parse-worldview', 'import.parse-outline',
  'style.learn', 'style.calibrate',
]

function useModuleKeys() {
  const { t } = useTranslation('settings')
  return MODULE_KEY_VALUES.map(value => ({
    value,
    label: (t as any)(`prompt.templateEditor.moduleKeys.${value}`),
  }))
}

interface Props {
  template: PromptTemplate | null
  onChanged: () => void
  onDeleted: () => void
}

export default function PromptTemplateEditor({ template, onChanged, onDeleted }: Props) {
  const { t } = useTranslation('settings')
  const dialog = useDialog()
  const toast = useToast()
  const ALL_MODULE_KEYS = useModuleKeys()
  const saveTemplate = usePromptStore(s => s.saveTemplate)
  const cloneTemplate = usePromptStore(s => s.cloneTemplate)
  const setActive = usePromptStore(s => s.setActive)
  const deleteTemplate = usePromptStore(s => s.deleteTemplate)

  // 本地编辑状态（draft），只在选中模板变化时同步
  const [draft, setDraft] = useState<PromptTemplate | null>(template)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setDraft(template)
    setDirty(false)
  }, [template?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- 只在切换模板时重建草稿，外部同模板刷新不能覆盖未保存编辑

  // 实时预览（draft 即使没保存也能看效果）
  const preview = useMemo(() => {
    if (!draft) return null
    try {
      const previewVars = { ...PREVIEW_VARS }
      for (const binding of draft.variableBindings ?? []) {
        if (previewVars[binding.variable] == null || previewVars[binding.variable] === '') {
          previewVars[binding.variable] = t('prompt.templateEditor.previewExample', { label: binding.label })
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
        {t('prompt.templateEditor.emptyState')}
      </div>
    )
  }

  const isSystem = draft.scope === 'system'

  /** 字段更新 helper */
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
    toast.success(t('prompt.templateEditor.cloneSuccess', { id: newId }))
  }

  const handleSetActive = async () => {
    if (!draft.id) return
    await setActive(draft.id)
    onChanged()
  }

  const handleDelete = async () => {
    if (!draft.id) return
    const ok = await dialog.confirm({
      title: t('prompt.templateEditor.deleteTitle', { name: draft.name }),
      message: t('prompt.templateEditor.deleteMessage'),
      confirmText: t('prompt.templateEditor.delete'),
      tone: 'danger',
    })
    if (!ok) return
    await deleteTemplate(draft.id)  // Phase 3.3: 走 store action,不直接 db.delete
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

  /** 变量列表的增删 */
  const addVariable = async () => {
    const name = (await dialog.prompt({
      title: t('prompt.templateEditor.addVariableTitle'),
      message: t('prompt.templateEditor.addVariableMessage'),
      placeholder: t('prompt.templateEditor.addVariablePlaceholder'),
    }))?.trim()
    if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) return
    if (draft.variables.includes(name)) return
    update({ variables: [...draft.variables, name] })
  }
  const removeVariable = (name: string) => {
    update({ variables: draft.variables.filter(v => v !== name) })
  }

  return (
    <div className="p-5 space-y-4">
      {/* Meta + 操作 */}
      <div className="bg-bg-surface border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {isSystem ? (
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-text-muted" />
                <h3 className="text-base font-semibold text-text-primary truncate">{draft.name}</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning">{t('prompt.templateEditor.systemBadge')}</span>
                {draft.isDefault && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">{t('prompt.templateEditor.defaultBadge')}</span>
                )}
                {draft.isActive && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success">{t('prompt.templateEditor.activeBadge')}</span>
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
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/15 text-info">{t('prompt.templateEditor.userBadge')}</span>
                {draft.isActive && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success">{t('prompt.templateEditor.activeBadge')}</span>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-text-secondary">
              {isSystem ? draft.description : (
                <input
                  type="text"
                  value={draft.description}
                  onChange={e => update({ description: e.target.value })}
                  placeholder={t('prompt.templateEditor.descriptionPlaceholder')}
                  className="w-full px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary focus:outline-none focus:border-accent"
                />
              )}
            </p>
          </div>
        </div>

        {/* moduleKey 选择 */}
        <div className="flex items-center gap-2 text-xs">
          <label className="text-text-secondary flex-shrink-0">{t('prompt.templateEditor.moduleKeyLabel')}</label>
          {isSystem ? (
            <span className="text-text-primary">{ALL_MODULE_KEYS.find(o => o.value === draft.moduleKey)?.label || draft.moduleKey}</span>
          ) : (
            <select
              value={draft.moduleKey}
              onChange={e => update({ moduleKey: e.target.value as PromptModuleKey })}
              className="flex-1 px-2 py-1 bg-bg-base border border-border rounded text-text-primary focus:outline-none focus:border-accent"
            >
              {ALL_MODULE_KEYS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        </div>

        {(draft.moduleKey === 'chapter.content' || draft.moduleKey === 'chapter.continue') && (
          <div className="flex items-center gap-2 text-xs">
            <label className="text-text-secondary flex-shrink-0">{t('prompt.templateEditor.continuityLabel')}</label>
            <select
              value={draft.continuityMode ?? 'inherit'}
              onChange={e => update({
                continuityMode: e.target.value as PromptTemplate['continuityMode'],
              })}
              disabled={isSystem}
              className="flex-1 px-2 py-1 bg-bg-base border border-border rounded text-text-primary disabled:opacity-60"
            >
              <option value="inherit">{t('prompt.templateEditor.continuityInherit')}</option>
              <option value="required">{t('prompt.templateEditor.continuityRequired')}</option>
              <option value="off">{t('prompt.templateEditor.continuityOff')}</option>
            </select>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex flex-wrap gap-2 pt-1">
          {!isSystem && (
            <button
              onClick={handleSave}
              disabled={!dirty}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-bg-base text-sm rounded hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" /> {t('prompt.templateEditor.save')}{dirty && ' *'}
            </button>
          )}
          {!draft.isActive && (
            <button
              onClick={handleSetActive}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 text-success text-sm rounded hover:bg-success/20"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> {t('prompt.templateEditor.setActive')}
            </button>
          )}
          <button
            onClick={handleClone}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-hover text-text-primary text-sm rounded hover:bg-bg-elevated"
          >
            <Copy className="w-3.5 h-3.5" /> {t('prompt.templateEditor.clone')}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-hover text-text-primary text-sm rounded hover:bg-bg-elevated"
          >
            <Download className="w-3.5 h-3.5" /> {t('prompt.templateEditor.export')}
          </button>
          {!isSystem && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-error/10 text-error text-sm rounded hover:bg-error/20 ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" /> {t('prompt.templateEditor.delete')}
            </button>
          )}
        </div>
      </div>

      {/* System Prompt */}
      <div className="bg-bg-surface border border-border rounded-xl p-4">
        <label className="block text-sm font-medium text-text-primary mb-2">{t('prompt.templateEditor.systemPromptLabel')}</label>
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

      {/* User Prompt Template */}
      <div className="bg-bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-primary">{t('prompt.templateEditor.userPromptLabel')}</label>
          <span className="text-xs text-text-muted">
            {t('prompt.templateEditor.userPromptHint')}
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

      {/* 可调参数 */}
      <PromptParametersEditor
        parameters={draft.parameters || []}
        onChange={(params: PromptParameter[]) => update({ parameters: params })}
        readOnly={isSystem}
      />

      {/* 示例 / 反例 (P15) */}
      <PromptExamplesEditor
        template={draft}
        onChange={(examples) => update({ examples })}
        readOnly={isSystem}
      />

      {/* 变量列表 */}
      <div className="bg-bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-primary">{t('prompt.templateEditor.variablesLabel')}</label>
          {!isSystem && (
            <button
              onClick={addVariable}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-bg-hover text-text-primary rounded hover:bg-bg-elevated"
            >
              <Plus className="w-3 h-3" /> {t('prompt.templateEditor.variablesAdd')}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {draft.variables.length === 0 && (
            <span className="text-xs text-text-muted">{t('prompt.templateEditor.variablesEmpty')}</span>
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
            <label className="text-sm font-medium text-text-primary">{t('prompt.templateEditor.bindingsLabel')}</label>
            {draft.assetId && <span className="text-xs font-mono text-accent">{draft.assetId}</span>}
          </div>
          <div className="space-y-2">
            {draft.variableBindings.map(binding => (
              <div key={binding.variable} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <code className="text-accent">{binding.variable}</code>
                  <span className="text-text-primary">{binding.label}</span>
                  {binding.required && <span className="text-error">{t('prompt.templateEditor.bindingRequired')}</span>}
                  {binding.manual && <span className="text-text-muted">{t('prompt.templateEditor.bindingManual')}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-text-secondary">
                  {binding.projectField && (
                    <span className="px-1.5 py-0.5 bg-bg-base rounded">{t('prompt.templateEditor.bindingProjectField', { field: binding.projectField })}</span>
                  )}
                  {binding.sourceKeys?.map(sourceKey => (
                    <span key={sourceKey} className="px-1.5 py-0.5 bg-bg-base rounded">{t('prompt.templateEditor.bindingSourceKey', { key: sourceKey })}</span>
                  ))}
                  {!binding.projectField && !binding.sourceKeys?.length && (
                    <span className="px-1.5 py-0.5 bg-bg-base rounded">{t('prompt.templateEditor.bindingManualInput')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 实时预览 */}
      <div className="bg-bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-primary">{t('prompt.templateEditor.previewLabel')}</label>
          <span className="text-xs text-text-muted">{t('prompt.templateEditor.previewHint')}</span>
        </div>
        {preview && 'error' in preview ? (
          <div className="text-error text-sm">{t('prompt.templateEditor.previewError', { error: preview.error })}</div>
        ) : preview ? (
          <div className="space-y-2">
            {preview.messages.map((m, i) => (
              <div key={i} className="border border-border rounded">
                <div className="px-3 py-1 bg-bg-base text-xs text-text-secondary border-b border-border">
                  {m.role === 'system' ? t('prompt.templateEditor.previewSystem') : t('prompt.templateEditor.previewUser')}
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

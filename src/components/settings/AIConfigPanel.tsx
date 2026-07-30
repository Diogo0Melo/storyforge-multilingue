import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, CheckCircle, RotateCcw, RefreshCw } from 'lucide-react'
import { useAIConfigStore, type TestResult } from '../../stores/ai-config'
import EmbeddingConfigCard from './EmbeddingConfigCard'
import type { AIProvider } from '../../lib/types'
import { PROVIDER_MODELS } from '../../lib/types'
import { isAIConfigReady } from '../../lib/ai/config-readiness'
import { getLogs, subscribeLogs, clearLogs } from '../../lib/ai/logger'
import { applyStoryForgeTheme, resolveStoryForgeTheme, type StoryForgeTheme } from '../../lib/theme'
import { useDialog } from '../shared/Dialog'
import { parseContextWindowInput } from '../../lib/ai/context-window-input'
import { fetchOpenAIModels } from '../../lib/ai/model-list'
import { normalizeOpenAIBaseUrl } from '../../lib/ai/openai-endpoint'
import { AI_PROXY_ENDPOINTS } from '../../lib/ai/proxy-endpoints'
import AIConfigPresetSection from './AIConfigPresetSection'
import AITaskRoutingSection from './AITaskRoutingSection'
import AIConnectionLogPanel from './AIConnectionLogPanel'
import AIConnectionTestSection from './AIConnectionTestSection'
import ThemeSelector from './ThemeSelector'

const PROVIDER_IDS: AIProvider[] = [
  'deepseek', 'qwen', 'doubao', 'minimax', 'glm', 'wenxin',
  'gemini', 'poe', 'openai', 'kimi', 'claude', 'nvidia',
  'modelscope', 'agnes', 'longcat', 'opencode', 'ollama', 'custom',
]
const PROVIDER_CORS: Record<AIProvider, boolean> = {
  deepseek: false, qwen: true, doubao: false, minimax: true, glm: true, wenxin: true,
  gemini: true, poe: true, openai: false, kimi: false, claude: false, nvidia: false,
  modelscope: true, agnes: true, longcat: false, opencode: false, ollama: true, custom: true,
}

export function getProviderOptions(t: (key: string, options?: Record<string, unknown>) => string): { value: AIProvider; label: string; cors: boolean; hint: string }[] {
  return PROVIDER_IDS.map(id => ({
    value: id,
    label: t(`providers.${id}`),
    cors: PROVIDER_CORS[id],
    hint: t(`providerHints.${id}`),
  }))
}

/** @deprecated Use getProviderOptions(t) instead. Kept for backward compat with tests. */
export const PROVIDER_OPTIONS: { value: AIProvider; label: string; cors: boolean; hint: string }[] =
  PROVIDER_IDS.map(id => ({
    value: id,
    label: id,
    cors: PROVIDER_CORS[id],
    hint: '',
  }))

export default function AIConfigPanel() {
  const { t } = useTranslation('settings')
  const { config, setConfig, switchProvider, testConnection,
    rememberApiKey, setRememberApiKey,
    presets, taskRoutes, agentContextProfiles, agentTeamBudgetProfile,
    setTaskRoute, setAgentContextProfile, setAgentTeamBudgetProfile,
    activePresetId, editingPresetId, saveAsPreset, applyPreset, updatePresetFromCurrent,
    renamePreset, deletePreset } = useAIConfigStore()
  const dialog = useDialog()
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [contextWindowDraft, setContextWindowDraft] = useState(() => config.contextWindow ? String(config.contextWindow) : '')
  const [contextWindowError, setContextWindowError] = useState('')
  const [fetchedModels, setFetchedModels] = useState<string[]>([])
  const [refreshingModels, setRefreshingModels] = useState(false)
  const [modelListError, setModelListError] = useState('')
  const submittedContextWindowRef = useRef(config.contextWindow)
  const [currentTheme, setCurrentTheme] = useState<StoryForgeTheme>(() =>
    resolveStoryForgeTheme(localStorage.getItem('storyforge-theme')),
  )

  const handleSavePreset = () => {
    if (!presetName.trim()) return
    saveAsPreset(presetName.trim())
    setPresetName('')
    setSavingPreset(false)
  }

  // 订阅日志变化
  const logs = useSyncExternalStore(subscribeLogs, getLogs)

  const providerOptions = getProviderOptions(t as (key: string, options?: Record<string, unknown>) => string)
  const currentProviderInfo = providerOptions.find((p) => p.value === config.provider)
  const editingPreset = editingPresetId ? presets.find(p => p.id === editingPresetId) : null

  useEffect(() => {
    if (config.contextWindow === submittedContextWindowRef.current) return
    submittedContextWindowRef.current = config.contextWindow
    setContextWindowDraft(config.contextWindow ? String(config.contextWindow) : '')
    setContextWindowError('')
  }, [config.contextWindow])

  const handleContextWindowChange = (raw: string) => {
    setContextWindowDraft(raw)
    const parsed = parseContextWindowInput(raw)
    if (parsed.kind === 'invalid') {
      setContextWindowError(parsed.message)
      return
    }

    const next = parsed.kind === 'valid' ? parsed.value : undefined
    setContextWindowError('')
    submittedContextWindowRef.current = next
    setConfig({ contextWindow: next })
  }

  const handleRefreshModels = async () => {
    setRefreshingModels(true)
    setModelListError('')
    try {
      const normalized = normalizeOpenAIBaseUrl(config.baseUrl)
      if (normalized.changed) setConfig({ baseUrl: normalized.baseUrl })
      const models = await fetchOpenAIModels({
        baseUrl: normalized.baseUrl,
        apiKey: config.apiKey,
      })
      setFetchedModels(models)
      if (models.length === 0) setModelListError(t('aiConfig.emptyModelList'))
    } catch (error) {
      setFetchedModels([])
      setModelListError(error instanceof Error ? error.message : t('aiConfig.refreshFailed'))
    } finally {
      setRefreshingModels(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testConnection()
      setTestResult(result)
    } finally {
      setTesting(false)
    }
  }

  const handleThemeChange = (theme: StoryForgeTheme) => {
    setCurrentTheme(theme)
    applyStoryForgeTheme(theme)
  }

  const handleRenamePreset = async (id: string, currentName: string) => {
    const name = await dialog.prompt({
      title: t('presets.renameTitle'),
      defaultValue: currentName,
      placeholder: t('presets.renamePlaceholder'),
    })
    if (name?.trim()) renamePreset(id, name.trim())
  }

  const handleDeletePreset = async (id: string, name: string) => {
    const ok = await dialog.confirm({
      title: t('presets.deleteTitle', { name }),
      message: t('presets.deleteMessage'),
      confirmText: t('presets.delete'),
      tone: 'danger',
    })
    if (ok) deletePreset(id)
  }

  // 切换 provider 时清空测试结果
  useEffect(() => {
    setTestResult(null)
  }, [config.provider])

  useEffect(() => {
    setFetchedModels([])
    setModelListError('')
  }, [config.baseUrl, config.provider])

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold text-text-primary mb-6">{t('title')}</h2>

      {/* AI 配置 */}
      <div className="bg-bg-surface border border-border rounded-xl p-5 mb-6">
        <h3 className="text-base font-semibold text-text-primary mb-4">{t('aiConfig.title')}</h3>
        <p className="text-[11px] text-text-muted mb-4 rounded-lg border border-border bg-bg-base px-3 py-2">
          {t('aiConfig.description')}
        </p>

        <AIConfigPresetSection
          presets={presets}
          activePresetId={activePresetId}
          editingPreset={editingPreset ?? null}
          savingPreset={savingPreset}
          presetName={presetName}
          onPresetNameChange={setPresetName}
          onStartSaving={() => setSavingPreset(true)}
          onCancelSaving={() => setSavingPreset(false)}
          onSavePreset={handleSavePreset}
          onApplyPreset={applyPreset}
          onUpdatePreset={updatePresetFromCurrent}
          onRenamePreset={(id, name) => { void handleRenamePreset(id, name) }}
          onDeletePreset={(id, name) => { void handleDeletePreset(id, name) }}
        />

        <AITaskRoutingSection
          presets={presets}
          routes={taskRoutes}
          contextProfiles={agentContextProfiles}
          teamBudgetProfile={agentTeamBudgetProfile}
          onSetRoute={setTaskRoute}
          onSetContextProfile={setAgentContextProfile}
          onSetTeamBudgetProfile={setAgentTeamBudgetProfile}
        />

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">{t('aiConfig.provider')}</label>
            <select
              value={config.provider}
              onChange={(e) => switchProvider(e.target.value as AIProvider)}
              className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent transition-colors"
            >
              {providerOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}{!opt.cors ? ' ⚠️' : ''}
                </option>
              ))}
            </select>
            {/* 配置提示 */}
            {currentProviderInfo && (
              <p className={`mt-1.5 text-xs ${currentProviderInfo.cors ? 'text-text-muted' : 'text-amber-500'}`}>
                {currentProviderInfo.hint}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">{t('aiConfig.apiKey')}</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => setConfig({ apiKey: e.target.value })}
                placeholder={config.provider === 'ollama' ? t('aiConfig.apiKeyPlaceholderOllama') : t('aiConfig.apiKeyPlaceholder')}
                className="w-full px-3 py-2 pr-10 bg-bg-base border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-secondary"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <label className="mt-2 flex items-start gap-2 text-[11px] text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={rememberApiKey}
                onChange={e => setRememberApiKey(e.target.checked)}
                className="mt-0.5 accent-accent"
              />
              <span>
                {t('aiConfig.rememberApiKey')}
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">{t('aiConfig.baseUrl')}</label>
              <input
                type="text"
                value={config.baseUrl}
                onChange={(e) => setConfig({ baseUrl: e.target.value })}
                className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
              />
              {['custom', 'ollama'].includes(config.provider) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setConfig({ provider: 'custom', baseUrl: 'http://localhost:1234/v1', apiKey: config.apiKey || 'lm-studio', model: 'qwen3-14b' })}
                    className="text-xs px-2 py-1 rounded bg-bg-elevated text-text-secondary border border-border hover:text-accent hover:border-accent/50 transition-colors"
                  >
                    LM Studio
                  </button>
                  <button
                    onClick={() => setConfig({ provider: 'ollama', baseUrl: 'http://localhost:11434/v1', apiKey: config.apiKey || 'ollama', model: 'qwen2.5:7b' })}
                    className="text-xs px-2 py-1 rounded bg-bg-elevated text-text-secondary border border-border hover:text-accent hover:border-accent/50 transition-colors"
                  >
                    {t('aiConfig.localOllama')}
                  </button>
                </div>
              )}
              {['custom', 'ollama'].includes(config.provider) && (
                <p className="mt-1 text-[11px] text-text-muted">
                  {t('aiConfig.localModelHint')}
                </p>
              )}
              {(() => {
                const pm = AI_PROXY_ENDPOINTS[config.provider]
                if (!pm) return null
                const isProxy = config.baseUrl.startsWith('/' + config.provider)
                return (
                  <div className="mt-1.5 flex gap-2">
                    {!isProxy ? (
                      <button
                        onClick={() => setConfig({ baseUrl: pm.proxy })}
                        className="text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                      >
                        {t('aiConfig.switchToLocalProxy')}
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfig({ baseUrl: pm.direct })}
                        className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                      >
                        {t('aiConfig.restoreDirect')}
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="block text-sm text-text-secondary">{t('aiConfig.model')}</label>
                {['custom', 'ollama'].includes(config.provider) && (
                  <button
                    type="button"
                    onClick={() => { void handleRefreshModels() }}
                    disabled={refreshingModels || !config.baseUrl.trim()}
                    title={t('aiConfig.refreshModelsTitle')}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshingModels ? 'animate-spin' : ''}`} />
                    {refreshingModels ? t('aiConfig.refreshing') : t('aiConfig.refreshModels')}
                  </button>
                )}
              </div>
              {['custom', 'ollama'].includes(config.provider) && fetchedModels.length > 0 && (
                <select
                  value={fetchedModels.includes(config.model) ? config.model : ''}
                  onChange={(e) => { if (e.target.value) setConfig({ model: e.target.value }) }}
                  aria-label={t('aiConfig.selectModel', { count: fetchedModels.length })}
                  className="mb-1.5 w-full rounded-lg border border-border bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                >
                  <option value="">{t('aiConfig.selectModel', { count: fetchedModels.length })}</option>
                  {fetchedModels.map(model => <option key={model} value={model}>{model}</option>)}
                </select>
              )}
              {PROVIDER_MODELS[config.provider] ? (
                <>
                  <select
                    value={config.model}
                    onChange={(e) => setConfig({ model: e.target.value })}
                    className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                  >
                    {PROVIDER_MODELS[config.provider].map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.value}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const selected = PROVIDER_MODELS[config.provider]?.find((m) => m.value === config.model)
                    return selected?.desc ? (
                      <p className="mt-1 text-xs text-text-muted">{selected.desc}</p>
                    ) : null
                  })()}
                  {/* 自定义模型名：列表里没有的模型可手动输入 */}
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => setConfig({ model: e.target.value })}
                    placeholder={t('aiConfig.manualModelPlaceholder')}
                    className="mt-1.5 w-full px-3 py-1.5 bg-bg-base border border-border rounded-lg text-text-primary text-xs focus:outline-none focus:border-accent transition-colors"
                  />
                </>
              ) : (
                <input
                  type="text"
                  value={config.model}
                  onChange={(e) => setConfig({ model: e.target.value })}
                  placeholder={t('aiConfig.manualModelPlaceholderSimple')}
                  className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                />
              )}
              {modelListError && <p className="mt-1 text-[11px] text-amber-400">{modelListError}</p>}
              {config.provider === 'ollama' && (
                <p className="mt-1 text-[11px] text-text-muted">{t('aiConfig.ollamaInstallHint')}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t('aiConfig.temperature')}: {config.temperature}
              </label>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={config.temperature}
                onChange={(e) => setConfig({ temperature: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                {t('aiConfig.maxTokens')}:
                {config.maxTokens === 0
                  ? <span className="text-accent font-normal ml-1">{t('aiConfig.unlimited')}</span>
                  : <><span className="ml-1">{config.maxTokens}</span><span className="text-text-muted font-normal ml-1">{t('aiConfig.charEstimate', { count: Math.round(config.maxTokens * 0.6) })}</span></>
                }
              </label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-text-secondary whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.maxTokens === 0}
                    onChange={(e) => setConfig({ maxTokens: e.target.checked ? 0 : 8192 })}
                    className="accent-accent"
                  />
                  {t('aiConfig.unlimitedShort')}
                </label>
                {config.maxTokens > 0 && (
                  <input
                    type="range"
                    min={1024}
                    max={65536}
                    step={1024}
                    value={config.maxTokens}
                    onChange={(e) => setConfig({ maxTokens: Number(e.target.value) })}
                    className="w-full accent-accent"
                  />
                )}
              </div>
              {config.maxTokens > 0 && (
                <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                  <span>1K</span><span>16K</span><span>32K</span><span>64K</span>
                </div>
              )}
            </div>
          </div>

          {/* FB-8: 上下文窗口(高级·可选) — 本地/自定义模型按实际填写,修"误报超出窗口" */}
          <div className="mb-4">
            <label className="block text-sm text-text-secondary mb-1.5">
              {t('aiConfig.contextWindow')} <span className="text-text-muted font-normal">({t('aiConfig.advancedOptional')})</span>
              {config.contextWindow
                ? <span className="text-accent ml-1">{config.contextWindow.toLocaleString()} token</span>
                : <span className="text-text-muted ml-1">{t('aiConfig.contextWindowPreset')}</span>}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={contextWindowDraft}
                onChange={(e) => handleContextWindowChange(e.target.value)}
                aria-invalid={Boolean(contextWindowError)}
                placeholder={t('aiConfig.contextWindowPlaceholder')}
                className={`min-w-0 flex-1 px-3 py-2 bg-bg-base border rounded text-sm text-text-primary focus:outline-none ${contextWindowError ? 'border-red-400 focus:border-red-400' : 'border-border focus:border-accent'}`}
              />
              <button
                type="button"
                onClick={() => handleContextWindowChange('')}
                disabled={!contextWindowDraft && !contextWindowError}
                title={t('aiConfig.resetContextWindow')}
                aria-label={t('aiConfig.contextWindowResetTitle')}
                className="p-2 rounded border border-border text-text-muted hover:text-accent hover:border-accent/50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            {contextWindowError ? (
              <p className="mt-1 text-[11px] text-red-400">{t('aiConfig.contextWindowError', { error: contextWindowError })}</p>
            ) : (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-green-400/80">
                <CheckCircle className="w-3 h-3" />
                {editingPreset && activePresetId === null
                  ? t('aiConfig.contextWindowSavedToPreset', { name: editingPreset.name })
                  : t('aiConfig.contextWindowSaved')}
              </p>
            )}
            <p className="text-[11px] text-text-muted mt-1">
              {t('aiConfig.contextWindowHint')}
            </p>
          </div>

          {/* 测试连接 */}
          <AIConnectionTestSection
            testing={testing}
            result={testResult}
            configReady={isAIConfigReady(config)}
            provider={config.provider}
            logCount={logs.length}
            showLogs={showLogs}
            isDevelopment={import.meta.env.DEV}
            onTest={() => { void handleTest() }}
            onToggleLogs={() => setShowLogs(!showLogs)}
          />
        </div>
      </div>

      {/* NS-5 · 语义检索(embedding) 配置卡 */}
      <EmbeddingConfigCard />

      {/* 日志面板 */}
      {showLogs && <AIConnectionLogPanel logs={logs} onClear={clearLogs} />}

      {/* 主题切换 */}
      <ThemeSelector value={currentTheme} onChange={handleThemeChange} />
    </div>
  )
}

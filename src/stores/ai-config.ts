import { create } from 'zustand'
import type { AIConfig, AIProvider, AIConfigPreset, EmbeddingConfig } from '../lib/types'
import { PROVIDER_PRESETS } from '../lib/types'
import { createLog, updateLog } from '../lib/ai/logger'
import { nanoid } from '../lib/utils/id'
import { buildOpenAIEndpoint, normalizeOpenAIBaseUrl } from '../lib/ai/openai-endpoint'
import {
  sanitizeAITaskRoutes,
  type AITaskKind,
  type AITaskRoutes,
} from '../lib/ai/task-routing'
import {
  sanitizeAgentContextProfiles,
  type AgentContextProfile,
  type AgentContextProfiles,
  type AgentContextTaskKind,
} from '../lib/agent/context-policy'
import {
  sanitizeAgentTeamBudgetProfile,
  type AgentTeamBudgetProfile,
} from '../lib/agent/team-budget'
import i18n from '../i18n/i18n'

const STORAGE_KEY = 'storyforge-ai-config'
const PRESETS_KEY = 'storyforge-ai-presets'
const SESSION_API_KEY = 'storyforge-ai-api-key-session'
const REMEMBER_API_KEY = 'storyforge-ai-api-key-remember'
const EMBEDDING_KEY = 'storyforge-embedding-config'
const EMBEDDING_SESSION_KEY = 'storyforge-embedding-key-session'
export const TASK_ROUTES_KEY = 'storyforge-ai-task-routes'
export const AGENT_CONTEXT_PROFILES_KEY = 'storyforge-agent-context-profiles'
export const AGENT_TEAM_BUDGET_PROFILE_KEY = 'storyforge-agent-team-budget-profile'

const DEFAULT_CONFIG: AIConfig = {
  provider: 'deepseek',
  apiKey: '',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com/v1',
  temperature: 0.7,
  maxTokens: 0,
}

/** NS-5 默认：关闭；隐私首选本地 Ollama + bge-m3（手稿不出本机）。 */
const DEFAULT_EMBEDDING: EmbeddingConfig = {
  enabled: false,
  provider: 'ollama',
  apiKey: '',
  baseUrl: 'http://localhost:11434/v1',
  model: 'bge-m3',
}

/** embedding 配置加载：key 复用与聊天 key 相同的「记住」开关（不记住→sessionStorage）。 */
function loadEmbeddingConfig(rememberApiKey: boolean): EmbeddingConfig {
  let saved: Partial<EmbeddingConfig> = {}
  try { const raw = localStorage.getItem(EMBEDDING_KEY); if (raw) saved = JSON.parse(raw) } catch { /* ignore */ }
  const sessionKey = sessionStorage.getItem(EMBEDDING_SESSION_KEY) || ''
  return { ...DEFAULT_EMBEDDING, ...saved, apiKey: rememberApiKey ? (saved.apiKey || '') : sessionKey }
}

function persistEmbeddingConfig(cfg: EmbeddingConfig, rememberApiKey: boolean): void {
  const persisted: EmbeddingConfig = rememberApiKey ? cfg : { ...cfg, apiKey: '' }
  localStorage.setItem(EMBEDDING_KEY, JSON.stringify(persisted))
  if (rememberApiKey) sessionStorage.removeItem(EMBEDDING_SESSION_KEY)
  else if (cfg.apiKey) sessionStorage.setItem(EMBEDDING_SESSION_KEY, cfg.apiKey)
  else sessionStorage.removeItem(EMBEDDING_SESSION_KEY)
}

/** 从 localStorage 加载预设列表 */
function loadPresets(): AIConfigPreset[] {
  try {
    const saved = localStorage.getItem(PRESETS_KEY)
    if (saved) {
      const arr = JSON.parse(saved)
      if (Array.isArray(arr)) return arr
    }
  } catch { /* ignore */ }
  return []
}

function savePresets(presets: AIConfigPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets))
}

function loadTaskRoutes(): AITaskRoutes {
  try {
    const saved = localStorage.getItem(TASK_ROUTES_KEY)
    return saved ? sanitizeAITaskRoutes(JSON.parse(saved)) : {}
  } catch {
    return {}
  }
}

function saveTaskRoutes(routes: AITaskRoutes): void {
  localStorage.setItem(TASK_ROUTES_KEY, JSON.stringify(routes))
}

function loadAgentContextProfiles(): AgentContextProfiles {
  try {
    const saved = localStorage.getItem(AGENT_CONTEXT_PROFILES_KEY)
    return sanitizeAgentContextProfiles(saved ? JSON.parse(saved) : {})
  } catch {
    return sanitizeAgentContextProfiles({})
  }
}

function saveAgentContextProfiles(profiles: AgentContextProfiles): void {
  localStorage.setItem(AGENT_CONTEXT_PROFILES_KEY, JSON.stringify(profiles))
}

function loadAgentTeamBudgetProfile(): AgentTeamBudgetProfile {
  return sanitizeAgentTeamBudgetProfile(localStorage.getItem(AGENT_TEAM_BUDGET_PROFILE_KEY))
}

function saveAgentTeamBudgetProfile(profile: AgentTeamBudgetProfile): void {
  localStorage.setItem(AGENT_TEAM_BUDGET_PROFILE_KEY, profile)
}

/** 根据 HTTP 状态码和英文错误信息，返回翻译后的解释 */
function getErrorExplanation(status: number, msg: string): string {
  const t = i18n.t.bind(i18n)
  const lower = msg.toLowerCase()

  // 按 HTTP 状态码
  if (status === 401) return t('errors.ai.http401')
  if (status === 402) return t('errors.ai.http402')
  if (status === 403) return t('errors.ai.http403')
  if (status === 404) return t('errors.ai.http404')
  if (status === 429) return t('errors.ai.http429')
  if (status === 500) return t('errors.ai.http500')
  if (status === 502) return t('errors.ai.http502')
  if (status === 503) return t('errors.ai.http503')

  // 按错误信息关键词匹配
  if (lower.includes('insufficient balance') || lower.includes('insufficient_balance'))
    return t('errors.ai.insufficientBalance')
  if (lower.includes('invalid api key') || lower.includes('invalid_api_key'))
    return t('errors.ai.invalidApiKey')
  if (lower.includes('authentication') || lower.includes('unauthorized'))
    return t('errors.ai.authFailed')
  if (lower.includes('rate limit') || lower.includes('rate_limit'))
    return t('errors.ai.rateLimit')
  if (lower.includes('model not found') || lower.includes('model_not_found'))
    return t('errors.ai.modelNotFound')
  if (lower.includes('context length') || lower.includes('context_length'))
    return t('errors.ai.contextLength')
  if (lower.includes('quota exceeded') || lower.includes('quota_exceeded'))
    return t('errors.ai.quotaExceeded')
  if (lower.includes('server error') || lower.includes('internal error'))
    return t('errors.ai.serverError')
  if (lower.includes('timeout'))
    return t('errors.ai.timeout')
  if (lower.includes('bad request'))
    return t('errors.ai.badRequest')
  if (lower.includes('not found'))
    return t('errors.ai.endpointNotFound')
  if (lower.includes('permission denied'))
    return t('errors.ai.permissionDenied')
  if (lower.includes('billing') || lower.includes('payment'))
    return t('errors.ai.billingIssue')
  if (lower.includes('overloaded') || lower.includes('capacity'))
    return t('errors.ai.serviceOverloaded')
  if (lower.includes('thinking') && lower.includes('budget'))
    return t('errors.ai.thinkingBudgetConflict')

  return ''
}

/** 从 localStorage 加载配置 */
function loadInitialConfig(): { config: AIConfig; rememberApiKey: boolean } {
  let savedConfig: Partial<AIConfig> = {}
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) savedConfig = JSON.parse(saved)
  } catch { /* ignore */ }

  const rememberRaw = localStorage.getItem(REMEMBER_API_KEY)
  const legacyHasLocalKey = typeof savedConfig.apiKey === 'string' && savedConfig.apiKey.length > 0
  const rememberApiKey = rememberRaw == null ? legacyHasLocalKey : rememberRaw === 'true'
  const sessionKey = sessionStorage.getItem(SESSION_API_KEY) || ''

  return {
    config: {
      ...DEFAULT_CONFIG,
      ...savedConfig,
      apiKey: rememberApiKey ? (savedConfig.apiKey || '') : sessionKey,
    },
    rememberApiKey,
  }
}

function persistConfig(config: AIConfig, rememberApiKey: boolean): void {
  const persisted: AIConfig = rememberApiKey ? config : { ...config, apiKey: '' }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  localStorage.setItem(REMEMBER_API_KEY, String(rememberApiKey))
  if (rememberApiKey) {
    sessionStorage.removeItem(SESSION_API_KEY)
  } else if (config.apiKey) {
    sessionStorage.setItem(SESSION_API_KEY, config.apiKey)
  } else {
    sessionStorage.removeItem(SESSION_API_KEY)
  }
}

function presetConfig(config: AIConfig, rememberApiKey: boolean): AIConfig {
  return rememberApiKey ? { ...config } : { ...config, apiKey: '' }
}

export interface TestResult {
  ok: boolean
  message: string
  statusCode?: number
  duration?: number
}

interface AIConfigStore {
  config: AIConfig
  rememberApiKey: boolean
  presets: AIConfigPreset[]
  taskRoutes: AITaskRoutes
  agentContextProfiles: AgentContextProfiles
  agentTeamBudgetProfile: AgentTeamBudgetProfile
  /** 当前生效的预设 id（null = 未对应任何预设/已改动） */
  activePresetId: string | null
  /** 最近一次应用/保存的预设 id；表单改动后仍保留,用于显式覆盖当前预设。 */
  editingPresetId: string | null
  /** NS-5 语义检索（embedding）配置 */
  embedding: EmbeddingConfig
  setEmbeddingConfig: (partial: Partial<EmbeddingConfig>) => void
  setConfig: (config: Partial<AIConfig>) => void
  setRememberApiKey: (remember: boolean) => void
  switchProvider: (provider: AIProvider) => void
  testConnection: () => Promise<TestResult>
  // ── 预设管理 ──
  saveAsPreset: (name: string) => string
  applyPreset: (id: string) => void
  updatePresetFromCurrent: (id: string) => void
  renamePreset: (id: string, name: string) => void
  deletePreset: (id: string) => void
  setTaskRoute: (taskKind: AITaskKind, presetId: string | null) => void
  setAgentContextProfile: (taskKind: AgentContextTaskKind, profile: AgentContextProfile) => void
  setAgentTeamBudgetProfile: (profile: AgentTeamBudgetProfile) => void
}

const initial = loadInitialConfig()

export const useAIConfigStore = create<AIConfigStore>((set, get) => ({
  config: initial.config,
  rememberApiKey: initial.rememberApiKey,
  presets: loadPresets(),
  taskRoutes: loadTaskRoutes(),
  agentContextProfiles: loadAgentContextProfiles(),
  agentTeamBudgetProfile: loadAgentTeamBudgetProfile(),
  activePresetId: null,
  editingPresetId: null,
  embedding: loadEmbeddingConfig(initial.rememberApiKey),

  setEmbeddingConfig: (partial: Partial<EmbeddingConfig>) => {
    const next = { ...get().embedding, ...partial }
    persistEmbeddingConfig(next, get().rememberApiKey)
    set({ embedding: next })
  },

  setConfig: (partial: Partial<AIConfig>) => {
    const newConfig = { ...get().config, ...partial }
    persistConfig(newConfig, get().rememberApiKey)
    // 手动改动配置后，与已选预设脱钩（除非改动等于该预设）
    set({ config: newConfig, activePresetId: null })
  },

  setRememberApiKey: (remember: boolean) => {
    persistConfig(get().config, remember)
    persistEmbeddingConfig(get().embedding, remember)
    set({ rememberApiKey: remember })
  },

  saveAsPreset: (name: string) => {
    const id = nanoid()
    const preset: AIConfigPreset = {
      id,
      name: name.trim() || '未命名配置',
      config: presetConfig(get().config, get().rememberApiKey),
    }
    const presets = [...get().presets, preset]
    savePresets(presets)
    set({ presets, activePresetId: id, editingPresetId: id })
    return id
  },

  applyPreset: (id: string) => {
    const preset = get().presets.find(p => p.id === id)
    if (!preset) return
    const newConfig = { ...preset.config, apiKey: preset.config.apiKey || get().config.apiKey }
    persistConfig(newConfig, get().rememberApiKey)
    set({ config: newConfig, activePresetId: id, editingPresetId: id })
  },

  updatePresetFromCurrent: (id: string) => {
    const presets = get().presets.map(p => p.id === id ? {
      ...p,
      config: presetConfig(get().config, get().rememberApiKey),
    } : p)
    savePresets(presets)
    set({ presets, activePresetId: id, editingPresetId: id })
  },

  renamePreset: (id: string, name: string) => {
    const presets = get().presets.map(p => p.id === id ? { ...p, name: name.trim() || p.name } : p)
    savePresets(presets)
    set({ presets })
  },

  deletePreset: (id: string) => {
    const presets = get().presets.filter(p => p.id !== id)
    const taskRoutes = Object.fromEntries(
      Object.entries(get().taskRoutes).filter(([, presetId]) => presetId !== id),
    ) as AITaskRoutes
    savePresets(presets)
    saveTaskRoutes(taskRoutes)
    set({
      presets,
      taskRoutes,
      activePresetId: get().activePresetId === id ? null : get().activePresetId,
      editingPresetId: get().editingPresetId === id ? null : get().editingPresetId,
    })
  },

  setTaskRoute: (taskKind, presetId) => {
    const taskRoutes = { ...get().taskRoutes }
    if (presetId && get().presets.some(preset => preset.id === presetId)) {
      taskRoutes[taskKind] = presetId
    } else {
      delete taskRoutes[taskKind]
    }
    saveTaskRoutes(taskRoutes)
    set({ taskRoutes })
  },

  setAgentContextProfile: (taskKind, profile) => {
    const agentContextProfiles = sanitizeAgentContextProfiles({
      ...get().agentContextProfiles,
      [taskKind]: profile,
    })
    saveAgentContextProfiles(agentContextProfiles)
    set({ agentContextProfiles })
  },

  setAgentTeamBudgetProfile: profile => {
    const agentTeamBudgetProfile = sanitizeAgentTeamBudgetProfile(profile)
    saveAgentTeamBudgetProfile(agentTeamBudgetProfile)
    set({ agentTeamBudgetProfile })
  },

  switchProvider: (provider: AIProvider) => {
    const preset = PROVIDER_PRESETS[provider] || {}
    const newConfig: AIConfig = {
      ...get().config,
      provider,
      ...preset,
      apiKey: provider === get().config.provider ? get().config.apiKey : (preset.apiKey || ''),
    }
    persistConfig(newConfig, get().rememberApiKey)
    set({ config: newConfig, activePresetId: null, editingPresetId: null })
  },

  testConnection: async (): Promise<TestResult> => {
    const { config } = get()
    const normalized = normalizeOpenAIBaseUrl(config.baseUrl)
    if (normalized.changed) {
      const newConfig = { ...config, baseUrl: normalized.baseUrl }
      persistConfig(newConfig, get().rememberApiKey)
      set({ config: newConfig, activePresetId: null })
    }
    const url = buildOpenAIEndpoint(normalized.baseUrl, 'chat/completions')
    const startTime = Date.now()
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000)

    // 创建日志
    const log = createLog({
      type: 'test',
      provider: config.provider,
      url,
      model: config.model,
      status: 'pending',
    })

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: '请回复"连接成功"' }],
        }),
      })

      const duration = Date.now() - startTime
      const bodyText = await response.text()

      if (response.ok) {
        updateLog(log.id, { status: 'success', statusCode: response.status, duration, responseBody: bodyText.slice(0, 200) })
        const prefix = normalized.warnings.length ? `${normalized.warnings.join(' ')} ` : ''
        return { ok: true, message: `✅ ${prefix}连接成功`, statusCode: response.status, duration }
      }

      // 解析错误信息
      let rawErrorMsg = `HTTP ${response.status}`
      try {
        const errJson = JSON.parse(bodyText)
        if (errJson.error?.message) rawErrorMsg = errJson.error.message
        else if (errJson.message) rawErrorMsg = errJson.message
        else if (errJson.error_msg) rawErrorMsg = errJson.error_msg
      } catch {
        if (bodyText.length < 200) rawErrorMsg += ': ' + bodyText
      }

      // 常见英文错误 → 翻译映射
      const cnExplanation = getErrorExplanation(response.status, rawErrorMsg)

      // HTTP 402 = 余额不足，但说明连接和认证都成功了
      if (response.status === 402) {
        const msg = `${rawErrorMsg}（${cnExplanation}）`
        updateLog(log.id, { status: 'success', statusCode: response.status, duration, responseBody: bodyText.slice(0, 200) })
        const prefix = normalized.warnings.length ? `${normalized.warnings.join(' ')} ` : ''
        return { ok: true, message: `✅ ${prefix}连接成功 — ${msg}`, statusCode: response.status, duration }
      }

      const urlHint = normalized.warnings.length
        ? `；${normalized.warnings.join(' ')}`
        : ''
      const localHint = ['custom', 'ollama'].includes(config.provider)
        ? i18n.t('errors.ai.localProviderHint')
        : ''
      const errorMsg = `${cnExplanation ? `${rawErrorMsg}（${cnExplanation}）` : rawErrorMsg}${urlHint}${localHint}`

      updateLog(log.id, { status: 'error', statusCode: response.status, duration, errorMessage: errorMsg, responseBody: bodyText.slice(0, 500) })
      return { ok: false, message: `❌ ${errorMsg}`, statusCode: response.status, duration }

    } catch (err: unknown) {
      const duration = Date.now() - startTime
      const error = err as Error
      let errorMsg: string

      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        errorMsg = i18n.t('errors.ai.networkError')
      } else if (error.name === 'AbortError') {
        errorMsg = i18n.t('errors.ai.timeout')
      } else {
        errorMsg = error.message || i18n.t('errors.ai.unknown')
      }

      updateLog(log.id, { status: 'error', duration, errorMessage: errorMsg })
      return { ok: false, message: `❌ ${errorMsg}`, duration }
    } finally {
      window.clearTimeout(timeoutId)
    }
  },
}))

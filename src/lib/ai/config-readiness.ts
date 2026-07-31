import type { AIConfig, AIProvider } from '../types'
import i18n from '../../i18n/i18n'

const EMPTY_KEY_COMPATIBLE_PROVIDERS = new Set<AIProvider>(['ollama', 'custom'])

export function aiProviderAllowsEmptyKey(provider: AIProvider): boolean {
  return EMPTY_KEY_COMPATIBLE_PROVIDERS.has(provider)
}

export function isAIConfigReady(config: Pick<AIConfig, 'apiKey' | 'provider'>): boolean {
  return Boolean(config.apiKey || aiProviderAllowsEmptyKey(config.provider))
}

export function getAIConfigRequiredMessage(config: Pick<AIConfig, 'provider'>): string {
  return aiProviderAllowsEmptyKey(config.provider)
    ? i18n.t('errors.ai.configureLocalModel')
    : i18n.t('errors.ai.configureApiKey')
}

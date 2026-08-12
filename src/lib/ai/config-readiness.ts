import type { AIConfig, AIProvider } from '../types'
import { getT } from '../../i18n'

const EMPTY_KEY_COMPATIBLE_PROVIDERS = new Set<AIProvider>(['ollama', 'custom'])

export function aiProviderAllowsEmptyKey(provider: AIProvider): boolean {
  return EMPTY_KEY_COMPATIBLE_PROVIDERS.has(provider)
}

export function isAIConfigReady(config: Pick<AIConfig, 'apiKey' | 'provider'>): boolean {
  return Boolean(config.apiKey || aiProviderAllowsEmptyKey(config.provider))
}

export function getAIConfigRequiredMessage(config: Pick<AIConfig, 'provider'>): string {
  const t = getT()
  return aiProviderAllowsEmptyKey(config.provider)
    ? t('errors-lib:ai.configRequiredEndpoint')
    : t('errors-lib:ai.configRequiredApiKey')
}

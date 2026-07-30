import { buildOpenAIEndpoint } from './openai-endpoint'
import i18n from '../../i18n/i18n'

interface FetchOpenAIModelsOptions {
  baseUrl: string
  apiKey?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export async function fetchOpenAIModels({
  baseUrl,
  apiKey = '',
  timeoutMs = 10_000,
  fetchImpl = fetch,
}: FetchOpenAIModelsOptions): Promise<string[]> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(buildOpenAIEndpoint(baseUrl, 'models'), {
      method: 'GET',
      signal: controller.signal,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    })

    if (!response.ok) {
      throw new Error(i18n.t('common:errors.ai.modelListRequestFailed', { status: response.status }))
    }

    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || !Array.isArray((body as { data?: unknown }).data)) {
      throw new Error(i18n.t('common:errors.ai.modelListFormatInvalid'))
    }

    const models = (body as { data: unknown[] }).data
      .map(item => item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map(id => id.trim())

    return [...new Set(models)].sort((left, right) => left.localeCompare(right))
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(i18n.t('common:errors.ai.modelListTimeout'))
    }
    if (error instanceof TypeError) {
      throw new Error(i18n.t('common:errors.ai.modelListConnectionFailed'))
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}


/**
 * QUICKWIN-1 · 本地模型入口文案。
 * 守卫：设置页不再只写 Ollama，而是明确支持 Ollama / LM Studio 等 OpenAI-compatible /v1 本地服务。
 *
 * provider label 通过 i18n（settings.providerLabels.ollama）渲染；hint 来自
 * aiConfig.localModelHint（settings.json）。本测试直接断言 zh-CN locale JSON。
 */
import { describe, expect, it } from 'vitest'
import { PROVIDER_OPTION_VALUES } from '../../src/components/settings/AIConfigPanel'
import zhSettings from '../../src/i18n/locales/zh-CN/settings.json'

describe('QUICKWIN-1 · 本地模型 provider 文案', () => {
  it('ollama provider 作为"本地模型"入口呈现，并提示 LM Studio /v1 地址', () => {
    // Verify the provider option exists with correct key reference
    const option = PROVIDER_OPTION_VALUES.find(item => item.value === 'ollama')
    expect(option).toBeDefined()
    expect(option?.labelKey).toBe('providerLabels.ollama')

    // Assert actual zh-CN label text from locale JSON
    const label = zhSettings.providerLabels.ollama
    expect(label).toContain('本地模型')
    expect(label).toContain('Ollama')
    expect(label).toContain('LM Studio')

    // Hint lives in settings.aiConfig.localModelHint; keep original port/path assertions.
    const hint = zhSettings.aiConfig.localModelHint
    expect(hint).toContain('/v1')
    expect(hint).toContain('11434')
    expect(hint).toContain('1234')
  })
})

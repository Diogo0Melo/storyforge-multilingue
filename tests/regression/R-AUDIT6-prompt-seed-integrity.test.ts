import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SYSTEM_PROMPT_SEEDS } from '../../src/lib/ai/prompt-seeds'

function seedDigest(): string {
  return createHash('sha256').update(JSON.stringify(SYSTEM_PROMPT_SEEDS)).digest('hex')
}

describe('AUDIT-6 · 提示词领域拆分完整性', () => {
  it('聚合后的模板数量、顺序和内容保持逐字段一致', () => {
    expect(SYSTEM_PROMPT_SEEDS).toHaveLength(88)
    // WORLD-1 导入分类、STORY-1 中途重规划、FB-5 互动校准与 CM-1
    // 增量融合边界都属于有序系统模板契约。
    // 2026-08-08 i18n Phase 7 R2：新增 nameKey/descriptionKey/labelKey/optionLabelKeys
    // 展示元数据字段（pt-BR 本地化），systemPrompt/userPromptTemplate 正文逐字未变。
    // 2026-08-10 i18n residual campaign W-seeds：seed-i18n 扩展到全部 内置-* seeds +
    // genre-packs 展示元数据（3 locales 显示提取）；prompt 正文仍逐字未变（diff 验证）。
    // 2026-08-14 Phase 3: core outline title examples became runtime language-aware.
    expect(seedDigest()).toBe('ecadb0be270b13bc871e54ca81032c2f8a06a71bc9d67c8330447a1f82768251')
  })

  it('分块导入把固定分类目录放在变化的块序号和滚动上下文之前，保留可缓存前缀', () => {
    const template = SYSTEM_PROMPT_SEEDS.find(seed => seed.moduleKey === 'import.parse-chunk')!
    const catalogAt = template.systemPrompt.indexOf('{{codexCategoryCatalog}}')
    const chunkAt = template.systemPrompt.indexOf('{{chunkIndex}}')
    const contextAt = template.systemPrompt.indexOf('{{knownContext}}')
    expect(catalogAt).toBeGreaterThan(0)
    expect(catalogAt).toBeLessThan(chunkAt)
    expect(catalogAt).toBeLessThan(contextAt)
  })
})

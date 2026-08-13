/**
 * WS-3B Phase 2 lane P2-A · WorkflowEditor 输出意图选项集等价守卫。
 *
 * WorkflowEditor 下拉的显式意图值（不含 Auto）必须与共享运行时事实源
 * `OUTPUT_KIND_VALUES` 集合等价且无重复；Auto（值 ''）必须固定为首项。
 * UI 展示顺序本身是产品决策，由 R-WS3B UI 测试的顺序断言锁定，此处只守集合。
 */
import { describe, expect, it } from 'vitest'
import { OUTPUT_INTENT_OPTIONS } from '../../src/components/settings/prompt/WorkflowEditor'
import { OUTPUT_KIND_VALUES } from '../../src/lib/ai/output-language'

describe('R-WS3B · 输出意图选项集与 OUTPUT_KIND_VALUES 等价', () => {
  it('首项为 Auto，其余选项与五个 OutputKind 集合等价且无重复', () => {
    expect(OUTPUT_INTENT_OPTIONS[0]?.value).toBe('')

    const explicitValues = OUTPUT_INTENT_OPTIONS.slice(1).map(option => option.value)
    expect(explicitValues).toHaveLength(OUTPUT_KIND_VALUES.length)
    expect(new Set(explicitValues)).toEqual(new Set<string>(OUTPUT_KIND_VALUES))

    // 含 Auto 在内全部选项值唯一
    const allValues = OUTPUT_INTENT_OPTIONS.map(option => option.value)
    expect(new Set(allValues).size).toBe(allValues.length)
  })
})

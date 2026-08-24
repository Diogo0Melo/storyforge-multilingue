/**
 * i18n Phase 4 · R-PHASE4 · AI receiver 通用调用点扫描器
 *
 * 背景:AI manual(Phase 3.1)与架构守卫 ④ 曾只识别字面量 ai.start/chat/streamChat;
 * 模拟面板与章节编辑器引入命名空间 receiver(npcAI/ttrpgAI/encounterAI/stateAI/
 * memoryAI/enhanceAI)后,这些调用点对消耗统计、AI manual 与 category 守卫不可见。
 * 本切片把检测统一到 scripts/ai-call-scanner.mjs,并断言:
 *   ① 正向:命名空间 receiver xxAI.start(...) 与旧字面量入口 ai.start/chat/streamChat 均命中。
 *   ② 负向:注释、字符串、模板文本中的"调用"与同名函数声明不误报;非 AI receiver 不误报。
 *   ③ 去重:同一调用被多条规则命中只报一次。
 *   ④ 豁免:client.ts 实现侧与 AI_META_FORWARDERS meta 转发与旧行为一致。
 *   ⑤ manual 集成:category 字面量/动态/未分类归类语义不变,命名空间调用进入 category 表。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AI_CLIENT_FILE,
  AI_META_FORWARDERS,
  scanAiCallSites,
} from '../../scripts/ai-call-scanner.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const readSrc = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

/** 与 generate-ai-manual.mjs extractAiCalls 一致的 category 归类 */
function classify(src: string, rel: string) {
  const byCategory: Record<string, string[]> = {}
  const dynamic: string[] = []
  const uncategorized: string[] = []
  for (const call of scanAiCallSites(src, rel)) {
    const literal = call.text.match(/category:\s*'([a-zA-Z0-9._-]+)'/)
    if (literal) {
      const key = literal[1]
      if (!byCategory[key]) byCategory[key] = []
      byCategory[key].push(`${rel}:${call.line}`)
    } else if (/\bcategory\s*:/.test(call.text)) {
      dynamic.push(`${rel}:${call.line} · ${call.callee}`)
    } else {
      uncategorized.push(`${rel}:${call.line} · ${call.callee}`)
    }
  }
  return { byCategory, dynamic, uncategorized }
}

describe('R-PHASE4 · AI receiver 通用调用点扫描器', () => {
  it('命中命名空间 receiver(npcAI/ttrpgAI/stateAI.start)并可提取 category', () => {
    const src = [
      "const npcAI = useAIStream('k1')",
      'const ttrpgAI = useAIStream()',
      'const stateAI = useAIStream()',
      "await npcAI.start(buildPrompt({ a: 1 }), undefined, { category: 'simulation.npc-evolution', projectId: 1 })",
      "await ttrpgAI.start(messages, undefined, { category: 'simulation.ttrpg-gm' })",
      "const raw = await stateAI.start(messages, undefined, { category: 'state.extract' })",
    ].join('\n')
    const calls = scanAiCallSites(src)
    expect(calls.map(call => call.callee)).toEqual(['npcAI.start', 'ttrpgAI.start', 'stateAI.start'])
    expect(calls.map(call => call.text.match(/category:\s*'([a-zA-Z0-9._-]+)'/)?.[1])).toEqual([
      'simulation.npc-evolution',
      'simulation.ttrpg-gm',
      'state.extract',
    ])
  })

  it('旧字面量入口 ai.start/chat/streamChat 继续命中', () => {
    const src = [
      'ai.start(messages, undefined, meta)',
      'const text = await chat(messages, config, meta)',
      'for await (const chunk of streamChat(messages, config)) { out += chunk }',
    ].join('\n')
    expect(scanAiCallSites(src).map(call => call.callee)).toEqual(['ai.start', 'chat', 'streamChat'])
  })

  it('注释、字符串、模板文本中的调用与非 AI receiver 不误报', () => {
    const src = [
      '// ai.start(commentedOut)',
      '/* npcAI.start(blockComment) */',
      '/**',
      ' * streamChat(jsdocLine)',
      ' */',
      "const note = 'ttrpgAI.start(singleQuotedString)'",
      'const tpl = `stateAI.start(templateText)`',
      'samurai.start(lowercaseAiSuffixIsNotAReceiver)',
      'timer.start(noAiSuffix)',
      'resolveRequestConfig(config, { category: "notAnAiCall" })',
    ].join('\n')
    expect(scanAiCallSites(src)).toEqual([])
  })

  it('模板 ${} 表达式内部是代码,仍然命中', () => {
    const src = 'const s = `${chat(messages, config, meta)}`'
    expect(scanAiCallSites(src).map(call => call.callee)).toEqual(['chat'])
  })

  it('同名函数声明不被当作调用点', () => {
    const src = [
      'export async function chat(messages: unknown[]): Promise<string> { return String(messages) }',
      'export async function* streamChat() { yield "" }',
    ].join('\n')
    expect(scanAiCallSites(src)).toEqual([])
  })

  it('同一调用被多条规则命中只报一次(按 start 去重)', () => {
    const src = [
      "ai.start(messages, undefined, { category: 'x.y' })",
      'chat(messages, config, meta)',
      'ai.start(other, undefined, meta)',
    ].join('\n')
    const calls = scanAiCallSites(src)
    expect(calls).toHaveLength(3)
    const starts = calls.map(call => call.start)
    expect(new Set(starts).size).toBe(starts.length)
    // ai.start 只由 receiver 规则命中一次,不因旧字面量规则重复上报
    expect(calls.filter(call => call.callee === 'ai.start')).toHaveLength(2)
  })

  it('豁免语义与旧行为一致(client.ts 与 meta 转发器)', () => {
    expect(scanAiCallSites('chat(messages, config, meta)', AI_CLIENT_FILE)).toEqual([])
    expect(scanAiCallSites('ai.start(messages, undefined, meta)', AI_CLIENT_FILE)).toEqual([])
    for (const forwarder of AI_META_FORWARDERS) {
      expect(scanAiCallSites('streamChat(messages, config, signal, result, meta)', forwarder)).toEqual([])
      expect(scanAiCallSites("chat(messages, config, { category: 'origin.call' })", forwarder)).toHaveLength(1)
    }
  })

  it('真实代码:模拟面板与章节编辑器的命名空间 receiver 全部可见', () => {
    const panelRel = 'src/components/simulation/SimulationRuntimePanel.tsx'
    const panelCallees = scanAiCallSites(readSrc(panelRel), panelRel).map(call => call.callee)
    expect(panelCallees).toContain('npcAI.start')
    expect(panelCallees).toContain('ttrpgAI.start')
    expect(panelCallees).toContain('encounterAI.start')

    const editorRel = 'src/components/editor/ChapterEditor.tsx'
    const editorCallees = scanAiCallSites(readSrc(editorRel), editorRel).map(call => call.callee)
    expect(editorCallees).toContain('memoryAI.start')
    expect(editorCallees).not.toContain('stateAI.start')
  })

  it('manual 集成:命名空间调用进入 category 表,不产生新的未分类调用', () => {
    const panelRel = 'src/components/simulation/SimulationRuntimePanel.tsx'
    const panel = classify(readSrc(panelRel), panelRel)
    expect(Object.keys(panel.byCategory)).toEqual(expect.arrayContaining([
      'simulation.npc-evolution',
      'simulation.ttrpg-gm',
      'simulation.ttrpg-encounter',
    ]))
    expect(panel.uncategorized).toEqual([])

    const editorRel = 'src/components/editor/ChapterEditor.tsx'
    const editor = classify(readSrc(editorRel), editorRel)
    // State extraction is now part of the durable post-adoption organization
    // run; the legacy direct receiver is intentionally retired. Chapter memory
    // remains a namespaced receiver call.
    expect(editor.byCategory['state.extract']?.length ?? 0).toBe(0)
    expect(editor.byCategory['chapter.memory']?.length ?? 0).toBeGreaterThanOrEqual(1)
  })
})

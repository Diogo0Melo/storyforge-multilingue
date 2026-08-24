/**
 * Phase 1 · outline/timeline i18n 修复 — 聚焦回归覆盖。
 *
 * 覆盖点(对应审计修复):
 * 1. 插值:characterDriven.arcLabel / outline 顶层 metaWrapper /
 *    characterDriven.optionFormat 在三语言下都收到正确插值参数
 *    ({{text}}/{{name}}/{{axes}})。历史 bug:arcLabel 曾传 { arcs },
 *    {{text}} 落空,副标题渲染出空值。
 * 2. 修正的 raw-key 路径:OutlinePreview 的 emotion/pace/foreshadowRole 经显式
 *    previewPanel.* 投影渲染(旧 `preview.*` 前缀属于大纲生成预览对话框键空间,
 *    locales 中从不存在,曾把原始 key 直接渲染给用户)。
 * 3. 命名空间就绪:StoryTimelinePanel(懒加载 timeline ns)ready 前不渲染任何文案;
 *    错误状态只存语义键、渲染期翻译;手动添加的默认标题仍按 A4 模式持久化翻译后的
 *    标题(保留既有持久化语义)。
 * 4. 计算标签:PromptTemplateList 对 plot.character-driven / story-timeline.extract
 *    等 moduleKey 的 group/sub 计算标签解析为本地化标签,不再裸露 camelCase slug。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import i18next from 'i18next'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DialogProvider } from '../../src/components/shared/Dialog'
import OutlinePreview from '../../src/components/outline/OutlinePreview'
import StoryTimelinePanel, { waitForStoryTimelineAsyncWork } from '../../src/components/timeline/StoryTimelinePanel'
import PromptTemplateList from '../../src/components/settings/prompt/PromptTemplateList'
import { db } from '../../src/lib/db/schema'
import { useAIConfigStore } from '../../src/stores/ai-config'
import { useChapterStore } from '../../src/stores/chapter'
import { useDetailedOutlineStore } from '../../src/stores/detailed-outline'
import { useForeshadowStore } from '../../src/stores/foreshadow'
import { useOutlineStore } from '../../src/stores/outline'
import { useStoryTimelineStore } from '../../src/stores/story-timeline'
import type { PromptTemplate, PromptModuleKey } from '../../src/lib/types/prompt'
import type { Project } from '../../src/lib/types'
import zhErrorsLib from '../../src/i18n/locales/zh-CN/errors-lib.json'
import zhOutline from '../../src/i18n/locales/zh-CN/outline.json'
import enOutline from '../../src/i18n/locales/en/outline.json'
import ptOutline from '../../src/i18n/locales/pt-BR/outline.json'
import zhSettings from '../../src/i18n/locales/zh-CN/settings.json'
import zhTimeline from '../../src/i18n/locales/zh-CN/timeline.json'

// 让 react-dom 的 act() 在测试环境生效,避免 stderr 噪音
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function readSource(relPath: string): string {
  return readFileSync(resolve(__dirname, '../../', relPath), 'utf8')
}

/** 独立 i18next 实例做插值验证,不触碰全局实例的语言状态。 */
function makeLangInstance(lng: string, outlineBundle: Record<string, unknown>) {
  const inst = i18next.createInstance()
  void inst.init({
    lng,
    fallbackLng: false,
    initImmediate: false,
    defaultNS: 'outline',
    ns: ['outline'],
    // 与 src/i18n/index.ts 生产配置一致:React 渲染自行转义
    interpolation: { escapeValue: false },
    resources: { [lng]: { outline: outlineBundle } },
  })
  return inst
}

describe('Phase1-i18n · CharacterDrivenPlotPanel 插值参数', () => {
  it.each([
    ['zh-CN', zhOutline],
    ['en', enOutline],
    ['pt-BR', ptOutline],
  ] as const)('arcLabel/metaWrapper/optionFormat 在 %s 下完成插值,无残留 {{', (lng, bundle) => {
    const inst = makeLangInstance(lng, bundle as Record<string, unknown>)
    const t = (key: string, opts: Record<string, string>) => inst.t(key, opts) as string

    const arc = t('characterDriven.arcLabel', { text: '沈砚:从谋士到守城者' })
    expect(arc).toContain('沈砚:从谋士到守城者')
    expect(arc).not.toContain('{{')

    // metaWrapper 是 outline ns 顶层共享键(CharacterDrivenPlotPanel / OutlineVolumeDetail)
    const wrapped = t('metaWrapper', { text: '第一卷 · 守城' })
    expect(wrapped).toContain('第一卷 · 守城')
    expect(wrapped).not.toContain('{{')

    const option = t('characterDriven.optionFormat', { name: '沈砚', axes: '主角 / 守序善良' })
    expect(option).toContain('沈砚')
    expect(option).toContain('主角 / 守序善良')
    expect(option).not.toContain('{{')
  })

  it('组件源码只向 arcLabel 传 { text },不再传 { arcs }', () => {
    const source = readSource('src/components/outline/CharacterDrivenPlotPanel.tsx')
    expect(source).toContain("t('characterDriven.arcLabel', { text: vol.characterArcs })")
    expect(source).not.toContain('arcLabel\', { arcs')
  })
})

describe('Phase1-i18n · OutlinePreview 计算标签投影', () => {
  it('源码不再使用 preview.emotion/pace/foreshadowRole 动态前缀,改为显式投影', () => {
    const source = readSource('src/components/outline/OutlinePreview.tsx')
    expect(source).not.toContain('preview.emotion.')
    expect(source).not.toContain('preview.pace.')
    expect(source).not.toContain('preview.foreshadowRole.')
    expect(source).toContain('EMOTION_LABEL_KEYS')
    expect(source).toContain('PACE_LABEL_KEYS')
    expect(source).toContain('FORESHADOW_ROLE_LABEL_KEYS')
    // 投影目标是注册的 previewPanel.* 键组(与 i18n-computed-keys 门一致)
    expect(source).toContain('previewPanel.emotion.rising')
    expect(source).toContain('previewPanel.pace.climax')
    expect(source).toContain('previewPanel.foreshadowRole.plant')
  })

  it('渲染细纲时显示 previewPanel 本地化标签,不泄漏原始 key', async () => {
    const now = Date.now()
    useOutlineStore.setState({
      nodes: [{
        id: 99, projectId: 1, parentId: null, type: 'chapter', title: '第1章',
        summary: '守城第一夜', order: 0, createdAt: now, updatedAt: now,
      } as never],
    })
    useDetailedOutlineStore.setState({
      detailedOutlines: [{
        projectId: 1, outlineNodeId: 99,
        scenes: [{
          sceneId: 's1', title: '城头对峙', summary: '概', characterIds: [],
          location: '城楼', conflict: '敌军压境', pace: 'climax', estimatedWords: 100, notes: '',
        }],
        emotionArc: 'rising', foreshadowIds: [7], createdAt: now, updatedAt: now,
      } as never],
    })
    useForeshadowStore.setState({
      foreshadows: [{
        id: 7, projectId: 1, name: '远方来信', type: 'prophecy', status: 'planted',
        description: '一封没有署名的信', plantChapterId: 5, echoChapterIds: '[]',
        resolveChapterId: null, notes: '', createdAt: now, updatedAt: now,
      } as never],
    })
    useChapterStore.setState({
      chapters: [{
        id: 5, projectId: 1, outlineNodeId: 99, title: '第1章', content: '',
        wordCount: 0, status: 'outline', order: 0, notes: '', createdAt: now, updatedAt: now,
      } as never],
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    let root: Root | undefined
    try {
      await act(async () => {
        root = createRoot(container)
        root.render(createElement(OutlinePreview, { outlineNodeId: 99, onClose: () => {} }))
      })
      const text = container.textContent ?? ''
      expect(text).toContain(zhOutline.previewPanel.emotion.rising)
      expect(text).toContain(zhOutline.previewPanel.pace.climax)
      expect(text).toContain(zhOutline.previewPanel.foreshadowRole.plant)
      // 原始 key 不得出现在作者可见文本中
      expect(text).not.toContain('preview.')
      expect(text).not.toContain('previewPanel.')
    } finally {
      await act(async () => { root?.unmount() })
      container.remove()
      useOutlineStore.setState({ nodes: [] })
      useDetailedOutlineStore.setState({ detailedOutlines: [] })
      useForeshadowStore.setState({ foreshadows: [] })
      useChapterStore.setState({ chapters: [] })
    }
  })
})

describe('Phase1-i18n · StoryTimelinePanel 命名空间就绪与语义错误状态', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    // Unmounts cancel state publication, while this await lets every tracked
    // lifecycle read settle before the shared Dexie instance is closed. Any
    // rejection is deliberately propagated by the helper.
    await waitForStoryTimelineAsyncWork()
    db.close()
    useStoryTimelineStore.setState({ events: [], loading: false })
  })

  it('源码:ready 门禁 + 语义键错误状态 + A4 默认标题持久化语义保留', () => {
    const source = readSource('src/components/timeline/StoryTimelinePanel.tsx')
    // timeline 懒加载 ns:ready 前不渲染、不触发任何会翻译的动作
    expect(source).toContain('const { t, ready } = useDomainT(\'timeline\')')
    expect(source).toContain('if (!ready) return null')
    // 错误状态存语义键,不再把解析后的翻译冻进 state
    expect(source).not.toContain('setError(t(')
    expect(source).toContain("setError({ key: 'errors.noWrittenChapters' })")
    // A4 模式保留:手动添加的默认标题在创建时翻译并持久化(此时 ready 已成立)
    expect(source).toContain("title: t('actions.newEventTitle')")
  })

  it('手动添加把翻译后的默认标题持久化为事件标题(A4),不泄漏 key', async () => {
    const projectId = await db.projects.add({
      name: '年表测试', genre: 'xuanhuan', genres: ['xuanhuan'], status: 'ongoing',
      description: '', targetWordCount: 100_000, createdAt: 1, updatedAt: 1,
    } as never)
    const worldId = await db.worlds.add({
      projectId, code: 'timeline-world', name: '年表世界', description: '',
      currentVersion: 1, createdAt: 1, updatedAt: 1,
    } as never) as number
    const workId = await db.works.add({
      projectId, worldId, title: '年表作品', description: '', genres: ['xuanhuan'],
      status: 'drafting', targetWordCount: 100_000, createdAt: 1, updatedAt: 1,
    } as never) as number
    await db.projects.update(projectId, {
      activeWorldId: worldId, activeWorkId: workId, ownershipSchemaVersion: 1,
      worldCode: 'timeline-world', worldVersion: 1,
    })
    const project = {
      id: projectId, name: '年表测试', genre: 'xuanhuan', genres: ['xuanhuan'],
      status: 'ongoing', description: '', targetWordCount: 100_000,
      activeWorldId: worldId, activeWorkId: workId, ownershipSchemaVersion: 1,
      worldCode: 'timeline-world', worldVersion: 1,
      createdAt: 1, updatedAt: 1,
    } as unknown as Project

    const container = document.createElement('div')
    document.body.appendChild(container)
    let root: Root | undefined
    try {
      await act(async () => {
        root = createRoot(container)
        root.render(createElement(DialogProvider, null,
          createElement(StoryTimelinePanel, { project, onOpenChapter: () => {} }),
        ))
      })
      await act(async () => { })

      const buttons = [...container.querySelectorAll('button')]
      const addBtn = buttons.find(b => b.textContent?.includes(zhTimeline.actions.manualAdd))
      expect(addBtn, '手动添加按钮应已渲染').toBeTruthy()
      await act(async () => {
        addBtn!.click()
        // 等 db.add + store 更新的微任务链在 act 内收敛,避免 act 警告
        await new Promise(r => setTimeout(r, 20))
      })

      const rows = await db.storyTimelineEvents.where('projectId').equals(projectId).toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0].title).toBe(zhTimeline.actions.newEventTitle)
      expect(rows[0].title).not.toContain(':')
    } finally {
      await act(async () => { root?.unmount() })
      container.remove()
    }
  })

  it('AI 未配置时提取显示预加载 errors-lib 文案;配置就绪但无正文时显示语义键翻译', async () => {
    const projectId = await db.projects.add({
      name: '年表测试2', genre: 'xuanhuan', genres: ['xuanhuan'], status: 'ongoing',
      description: '', targetWordCount: 100_000, createdAt: 1, updatedAt: 1,
    } as never)
    const project = {
      id: projectId, name: '年表测试2', genre: 'xuanhuan', genres: ['xuanhuan'],
      status: 'ongoing', description: '', targetWordCount: 100_000,
      createdAt: 1, updatedAt: 1,
    } as unknown as Project

    const container = document.createElement('div')
    document.body.appendChild(container)
    let root: Root | undefined
    try {
      await act(async () => {
        root = createRoot(container)
        root.render(createElement(DialogProvider, null,
          createElement(StoryTimelinePanel, { project, onOpenChapter: () => {} }),
        ))
      })
      await act(async () => { })

      const clickExtract = () => {
        const btn = [...container.querySelectorAll('button')]
          .find(b => b.textContent?.includes(zhTimeline.actions.extractFromText))
        expect(btn, '提取按钮应已渲染').toBeTruthy()
        btn!.click()
      }

      // 场景一:未配置 AI → 显示 errors-lib(预加载 ns)的本地化消息
      await act(async () => {
        useAIConfigStore.getState().setConfig({ provider: 'openai', apiKey: '' })
      })
      await act(async () => {
        clickExtract()
        await new Promise(r => setTimeout(r, 20))
      })
      expect(container.textContent).toContain(zhErrorsLib.ai.configRequiredApiKey)

      // 场景二:ollama 免密钥视为就绪,但没有已写正文 → 语义键在渲染期翻译
      await act(async () => {
        useAIConfigStore.getState().setConfig({ provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'test-model' })
      })
      await act(async () => {
        clickExtract()
        await new Promise(r => setTimeout(r, 20))
      })
      const text = container.textContent ?? ''
      expect(text).toContain(zhTimeline.errors.noWrittenChapters)
      // 不允许把语义键原文渲染给用户
      expect(text).not.toContain('errors.noWrittenChapters')
    } finally {
      await act(async () => { root?.unmount() })
      container.remove()
    }
  })
})

describe('Phase1-i18n · PromptTemplateList 计算标签', () => {
  function template(id: number, moduleKey: PromptModuleKey, name: string): PromptTemplate {
    return {
      id, scope: 'user', moduleKey, promptType: 'system', name, description: '',
      systemPrompt: '', userPromptTemplate: '', variables: [], isActive: true,
      isBuiltin: false, createdAt: 1, updatedAt: 1,
    } as PromptTemplate
  }

  it('新增 group/sub 标签解析为本地化文案,不裸露 camelCase slug', async () => {
    const templates = [
      template(1, 'plot.character-driven', '角色驱动剧情模板'),
      template(2, 'story-timeline.extract', '年表提取模板'),
    ]

    const container = document.createElement('div')
    document.body.appendChild(container)
    let root: Root | undefined
    try {
      await act(async () => {
        root = createRoot(container)
        root.render(createElement(PromptTemplateList, {
          templates, selectedId: null, onSelect: () => {},
        }))
      })
      const text = container.textContent ?? ''
      // group 标签
      expect(text).toContain(zhSettings.promptGroupLabels.plot)
      expect(text).toContain(zhSettings.promptGroupLabels.storyTimeline)
      // sub 标签
      expect(text).toContain(zhSettings.promptSubLabels.characterDriven)
      expect(text).toContain(zhSettings.promptSubLabels.extract)
      // 计算出的 camelCase slug 不得直接可见
      expect(text).not.toContain('characterDriven')
      expect(text).not.toContain('storyTimeline')
      expect(text).not.toContain('plot.character-driven')
    } finally {
      await act(async () => { root?.unmount() })
      container.remove()
    }
  })
})

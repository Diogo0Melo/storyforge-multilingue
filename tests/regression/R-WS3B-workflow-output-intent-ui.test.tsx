/**
 * R-WS3B · WorkflowEditor 输出意图选择器（UI lane）
 *
 * WS-3B Phase 1 契约：`PromptWorkflowStep.outputKind?: OutputKind`。
 * 编辑器节点检查器应暴露 Auto + 五种 OutputKind；Auto ↔ undefined，
 * 显式选择经既有保存链路（useWorkflowStore.save → db.promptWorkflows）持久化。
 *
 * 字段由工作流类型 lane 登记进 types/workflow.ts；登记落地前本测试与
 * WorkflowEditor 同样通过桥接类型（StepWithOutputIntent）读写。
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import type { PromptWorkflow, PromptWorkflowStep } from '../../src/lib/types/workflow'
import type { OutputKind } from '../../src/lib/ai/output-language'
import { DialogProvider } from '../../src/components/shared/Dialog'
import { ToastProvider } from '../../src/components/shared/Toast'
import WorkflowEditor from '../../src/components/settings/prompt/WorkflowEditor'
import { useWorkflowStore } from '../../src/stores/workflow'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type StepWithOutputIntent = PromptWorkflowStep & { outputKind?: OutputKind }

function baseWorkflow(): PromptWorkflow {
  return {
    id: 93001,
    scope: 'user',
    name: '输出意图 UI 测试',
    description: '',
    steps: [
      {
        stepId: 'seed',
        label: '故事种子',
        promptModuleKey: 'story.generate',
        userConfirmRequired: true,
      },
      {
        stepId: 'chapter',
        label: '章节正文',
        promptModuleKey: 'chapter.content',
        userConfirmRequired: true,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  }
}

async function mount(workflow = baseWorkflow()) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      createElement(DialogProvider, null,
        createElement(ToastProvider, null,
          createElement(WorkflowEditor, { workflow, onClose: () => undefined }),
        ),
      ),
    )
  })
  return { host, root }
}

/** 输出意图下拉是检查器里唯一带 OutputKind 选项值的 select。 */
function intentSelect(host: HTMLElement): HTMLSelectElement {
  const select = Array.from(host.querySelectorAll('select'))
    .find(el => Array.from(el.options).some(option => option.value === 'creative'))
  if (!select) throw new Error('missing output intent select in inspector')
  return select
}

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function clickSave(host: HTMLElement) {
  const save = Array.from(host.querySelectorAll('button'))
    .find(button => button.textContent?.includes('保存')) as HTMLButtonElement | undefined
  if (!save || save.disabled) throw new Error('save button unavailable')
  await act(async () => save.click())
}

async function unmount(mounted: { host: HTMLElement; root: ReturnType<typeof createRoot> }) {
  await act(async () => mounted.root.unmount())
  mounted.host.remove()
}

describe('R-WS3B · 节点检查器输出意图选择器', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    useWorkflowStore.setState({ workflows: [], loaded: false })
  })

  it('渲染 Auto + 五种输出意图，显式选择经保存持久化', async () => {
    await db.promptWorkflows.put(baseWorkflow())
    const mounted = await mount()

    const select = intentSelect(mounted.host)
    // Auto 缺省：未显式声明时呈现 Auto（值 ''，对应 outputKind undefined）
    expect(select.value).toBe('')
    expect(Array.from(select.options).map(option => option.value)).toEqual([
      '', 'creative', 'mixed', 'functional-prose', 'functional-structured', 'language-neutral',
    ])
    // 三语 key 已登记；测试环境 zh-CN 显示源语言文案。
    expect(mounted.host.textContent).toContain('输出意图')
    expect(mounted.host.textContent).toContain('创作文本')

    await choose(select, 'creative')
    await clickSave(mounted.host)

    const stored = await db.promptWorkflows.get(93001)
    expect((stored?.steps[0] as StepWithOutputIntent).outputKind).toBe('creative')
    // 未触碰的步骤保持 undefined
    expect((stored?.steps[1] as StepWithOutputIntent).outputKind).toBeUndefined()

    await unmount(mounted)
  })

  it('回到 Auto 写回 undefined，其余步骤字段不丢失', async () => {
    const workflow = baseWorkflow()
    ;(workflow.steps[0] as StepWithOutputIntent).outputKind = 'mixed'
    await db.promptWorkflows.put(workflow)

    const mounted = await mount(workflow)
    const select = intentSelect(mounted.host)
    expect(select.value).toBe('mixed')

    await choose(select, '')
    await clickSave(mounted.host)

    const stored = await db.promptWorkflows.get(93001)
    expect((stored?.steps[0] as StepWithOutputIntent).outputKind).toBeUndefined()
    expect(stored?.steps[0]?.label).toBe('故事种子')
    expect(stored?.steps).toHaveLength(2)

    await unmount(mounted)
  })
})

/**
 * i18n 生产加载路径回归测试(Gate 2 BLOCK 修复守护)
 *
 * 背景:曾把命名空间误配到 i18next 的 `preload`(那是【语言】列表),导致 init
 * 时没有任何命名空间被真正载入,而注入 eager resources 的单测掩盖了该缺陷。
 * 本测试不走 eager 注入,直接用真实懒加载 backend(与生产同源)构造全新实例,
 * 断言 `ns` 预加载 + fallback 链确实把资源载入。
 *
 * 覆盖:
 * ① init 后,preload 组命名空间在【当前语言】与【fallback 语言(zh-CN)】都驻留
 * ② zh-CN 的 common 资源非空(源文案真实可达)
 * ③ 未预载的领域命名空间在 init 后不驻留(确认 ns 只含预载组,领域走懒加载)
 */
import { describe, it, expect } from 'vitest'
import { createBackendInstance, PRELOAD_NS } from '../../src/i18n'

describe('i18n production backend loading', () => {
  it('init 通过真实 backend 预载 preload 命名空间(含 fallback 链)', async () => {
    const inst = await createBackendInstance({ lng: 'pt-BR' })

    for (const ns of PRELOAD_NS) {
      expect(inst.hasResourceBundle('pt-BR', ns), `pt-BR/${ns} 应在 init 后驻留`).toBe(true)
      expect(inst.hasResourceBundle('zh-CN', ns), `zh-CN/${ns}(fallback)应在 init 后驻留`).toBe(true)
    }

    // zh-CN 源文案真实可达
    const zhCommon = inst.getResourceBundle('zh-CN', 'common')
    expect(zhCommon).toBeTruthy()
    expect(zhCommon.save).toBe('保存')

    // 当前语言文案可达(证明不是空壳)
    const ptCommon = inst.getResourceBundle('pt-BR', 'common')
    expect(ptCommon.save).toBe('Salvar')
  })

  it('未预载的领域命名空间 init 后不驻留(走懒加载)', async () => {
    const inst = await createBackendInstance({ lng: 'pt-BR' })
    // editor 不在 preload 组,init 后应为空(组件首次 useDomainT('editor') 时才载入)
    expect(inst.hasResourceBundle('pt-BR', 'editor')).toBe(false)
  })

  it('zh-CN 作为源语言无 fallback,缺失 key 原样返回', async () => {
    const inst = await createBackendInstance({ lng: 'zh-CN' })
    expect(inst.hasResourceBundle('zh-CN', 'common')).toBe(true)
    // common 里不存在的 key:zh-CN 无 fallback,应原样返回 key(i18next 缺失时去掉 ns 前缀)
    expect(inst.t('common:__definitely_missing__')).toBe('__definitely_missing__')
  })
})

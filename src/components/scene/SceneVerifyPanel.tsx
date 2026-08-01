/**
 * 场景考证 — Phase 27.2a
 *
 * 写作/构思时一键考证：用户描述当前场景，AI 结合本作品的
 * 世界观 + 历史年表 + 真实与幻想规则，给出符合背景的细节、
 * 设定校验与情节灵感。
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ScanSearch, Sparkles, Loader2 } from 'lucide-react'
import { useWorldGroupStore } from '../../stores/world-group'
import { useAIStream } from '../../hooks/useAIStream'
import { createAISessionKey } from '../../stores/ai-generation-session'
import { assembleContext } from '../../lib/registry/assemble-context'
import { buildSceneVerifyPrompt } from '../../lib/ai/adapters/scene-verify-adapter'
import AIStreamOutput from '../shared/AIStreamOutput'
import AutoResizeTextarea from '../shared/AutoResizeTextarea'
import { CInput } from '../shared/CompositionInput'
import WorldGroupSwitcher from '../world-group/WorldGroupSwitcher'
import type { Project } from '../../lib/types'

interface Props {
  project: Project
}

export default function SceneVerifyPanel({ project }: Props) {
  const { t } = useTranslation('panels')
  const activeGroupId = useWorldGroupStore(s => s.activeGroupId)
  const ai = useAIStream(createAISessionKey(
    project.id!,
    'scene.verify',
    project.enableMultiWorld ? activeGroupId ?? 'global' : 'project',
  ))

  const draftKey = `sf-scene-verify-${project.id}`
  const [scene, setScene] = useState('')
  const [sceneEra, setSceneEra] = useState('')
  const [sceneLocation, setSceneLocation] = useState('')
  const [building, setBuilding] = useState(false)

  // 草稿持久化
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey)
      if (saved) {
        const d = JSON.parse(saved)
        setScene(d.scene || ''); setSceneEra(d.sceneEra || ''); setSceneLocation(d.sceneLocation || '')
      }
    } catch { /* ignore */ }
  }, [draftKey])
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify({ scene, sceneEra, sceneLocation })) } catch { /* ignore */ }
    }, 500)
    return () => clearTimeout(t)
  }, [draftKey, scene, sceneEra, sceneLocation])

  const handleVerify = async () => {
    if (!scene.trim()) return
    setBuilding(true)
    try {
      const assembled = await assembleContext({
        projectId: project.id!,
        worldGroupId: project.enableMultiWorld ? activeGroupId ?? null : null,
        sourceKeys: ['canonAssertions', 'worldview', 'storyCore', 'powerSystem', 'codex', 'historical', 'worldRules', 'locations'],
      })
      const part = (key: string) => {
        const idx = assembled.included.indexOf(key)
        return idx >= 0 ? assembled.segments[idx]?.content ?? '' : ''
      }
      const worldContext = assembled.text
      const historyContext = part('historical')
      const worldRulesContext = part('worldRules')
      setBuilding(false)
      const messages = buildSceneVerifyPrompt({
        worldContext,
        historyContext,
        worldRulesContext,
        scene,
        sceneEra: sceneEra || undefined,
        sceneLocation: sceneLocation || undefined,
      })
      await ai.start(messages, undefined, { category: 'scene.verify', projectId: project.id! })
    } finally {
      setBuilding(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* 顶部 */}
      <div className="pb-4 border-b border-border/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <ScanSearch className="w-5 h-5" /> {t('scene.verify.title')}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {t('scene.verify.subtitle')}
            </p>
          </div>
          {project.enableMultiWorld && <WorldGroupSwitcher />}
        </div>
      </div>

      {/* 场景输入 */}
      <section>
        <label className="block text-sm font-medium text-text-primary mb-2">{t('scene.verify.currentScene')}</label>
        <AutoResizeTextarea
          value={scene}
          onChange={e => setScene(e.target.value)}
          placeholder={t('scene.verify.scenePlaceholder')}
          className="w-full text-sm bg-bg-base border border-border rounded-lg px-4 py-3 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent"
          minRows={4}
        />
      </section>

      {/* 时代 / 地点（可选） */}
      <section className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1">{t('scene.verify.eraLabel')}</label>
          <CInput
            value={sceneEra}
            onChange={e => setSceneEra(e.target.value)}
            placeholder={t('scene.verify.eraPlaceholder')}
            className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">{t('scene.verify.locationLabel')}</label>
          <CInput
            value={sceneLocation}
            onChange={e => setSceneLocation(e.target.value)}
            placeholder={t('scene.verify.locationPlaceholder')}
            className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
      </section>

      {/* 考证按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleVerify}
          disabled={!scene.trim() || ai.isStreaming || building}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {building || ai.isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {building ? t('scene.verify.readingSettings') : ai.isStreaming ? t('scene.verify.verifying') : t('scene.verify.verify')}
        </button>
        {ai.isStreaming && (
          <button onClick={ai.stop} className="text-xs text-text-muted hover:text-red-500 transition-colors">{t('scene.verify.stop')}</button>
        )}
      </div>

      {/* AI 输出（考证结果是 Markdown 散文，直接展示） */}
      {(ai.output || ai.isStreaming || ai.error) && (
        <AIStreamOutput
          output={ai.output}
          isStreaming={ai.isStreaming}
          error={ai.error}
          tokenUsage={ai.tokenUsage}
          onStop={ai.stop}
          onAccept={() => { /* 考证结果供参考，无需写入数据，采纳=无操作 */ }}
          onRetry={handleVerify}
          placeholder={t('scene.verify.resultPlaceholder')}
          moduleKey="scene.verify"
        />
      )}
    </div>
  )
}

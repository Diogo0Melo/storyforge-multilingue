/**
 * Phase 26.4 — 灵感反推面板
 *
 * 用户写碎片灵感 → AI 反向生成世界观草稿 + 故事核心 + 初始角色卡 → 选择性采纳
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Lightbulb, Sparkles, Loader2, Download, Plus,
} from 'lucide-react'
import { useWorldGroupStore } from '../../stores/world-group'
import { adopt } from '../../lib/registry/adopt'
import { CHARACTER_DIMENSIONS } from '../../lib/character/character-dimensions'
import AIStreamOutput from '../shared/AIStreamOutput'
import AutoResizeTextarea from '../shared/AutoResizeTextarea'
import type { Project } from '../../lib/types'
import { characterAxesLabel } from '../../lib/character/character-axes'
import InspirationMultiWorldResult from './InspirationMultiWorldResult'
import InspirationSingleResult from './InspirationSingleResult'
import InspirationFusionReview from './InspirationFusionReview'
import type { InspirationSourceKind } from '../../lib/types/inspiration-workspace'
import { useIncrementalInspiration } from '../../hooks/useIncrementalInspiration'
import { MAX_INSPIRATION_FRAGMENT_CHARS } from '../../lib/inspiration/workspace'

interface Props {
  project: Project
}

export default function InspirationPanel({ project }: Props) {
  const { t } = useTranslation('project')
  const wgStore = useWorldGroupStore()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['worldview', 'storyCore', 'characters']))
  const [adoptedSections, setAdoptedSections] = useState<Set<string>>(new Set())
  const [adopting, setAdopting] = useState(false)
  const fusion = useIncrementalInspiration(project, () => setAdoptedSections(new Set()))
  const {
    ai,
    isMultiWorld: isMW,
    mode,
    workspace: inspirationWorkspace,
    inspiration,
    setInspiration,
    userHint,
    setUserHint,
    result,
    mwResult,
    mwAdopted,
    setMwAdopted,
    selectedChars,
    setSelectedChars,
    fragmentLabel,
    setFragmentLabel,
    sourceKind,
    setSourceKind,
    selectedFragmentIds,
    setSelectedFragmentIds,
    pendingDiff,
    confirmingFusion,
    fusionError,
    addCurrentFragment,
    generate: handleGenerate,
    confirmFusion: handleConfirmFusion,
    discardFusion: handleDiscardFusion,
    removeFragment: handleRemoveFragment,
  } = fusion

  // ── 多世界：一键采纳（创建世界组 + 各世界世界观 + 故事核心 + 角色归属）──
  const handleAdoptMultiWorld = async () => {
    if (!mwResult || mwAdopted) return
    setAdopting(true)
    try {
      // 确保多世界已开启 + 主世界组存在
      await wgStore.migrateToMultiWorld(project.id!)

      // 1. 故事核心（项目级）
      const sc = mwResult.storyCore
      await adopt({
        projectId: project.id!,
        target: 'storyCores',
        mode: 'replace',
        data: {
          theme: sc.theme || undefined,
          centralConflict: sc.centralConflict || undefined,
          plotPattern: sc.plotPattern || undefined,
          mainPlot: sc.mainPlot || undefined,
          logline: sc.logline || undefined,
        },
      })

      // 2. 逐个世界：创建世界组 + 写入该世界的世界观（字段严格对齐 Worldview）
      const nameToGroupId = new Map<string, number>()
      // 已有主世界组（migrate 创建）：复用给输出中的 primary 世界（读最新 store 状态）
      const primaryGroupId = useWorldGroupStore.getState().groups.find(g => g.type === 'primary')?.id ?? null
      let primaryClaimed = false
      for (let i = 0; i < mwResult.worlds.length; i++) {
        const w = mwResult.worlds[i]
        let groupId: number
        if (w.type === 'primary' && primaryGroupId != null && !primaryClaimed) {
          groupId = primaryGroupId
          primaryClaimed = true
          await wgStore.updateGroup(groupId, {
            name: w.name, description: w.worldOrigin?.slice(0, 100) || '',
          })
        } else {
          groupId = await wgStore.createGroup({
            projectId: project.id!,
            name: w.name,
            description: w.worldOrigin?.slice(0, 100) || '',
            type: w.type,
            icon: '🌐',
            order: i,
            entryCondition: w.entryCondition || undefined,
            powerRestriction: w.powerRestriction || undefined,
          })
        }
        nameToGroupId.set(w.name, groupId)
        await adopt({
          projectId: project.id!,
          worldGroupId: groupId,
          target: 'worldviews',
          mode: 'replace',
          data: {
            worldOrigin: w.worldOrigin || '',
            powerHierarchy: w.powerHierarchy || '',
            continentLayout: w.continentLayout || '',
            climateByRegion: w.climateByRegion || '',
            historyLine: w.historyLine || '',
            races: w.races || '',
            factionLayout: w.factionLayout || '',
          },
        })
      }

      // 3. 角色：按 homeWorld 归属，跨世界角色标记
      for (const c of mwResult.characters) {
        if (!c.name) continue
        const homeGroupId = c.isCrossWorld ? null : (nameToGroupId.get(c.homeWorld) ?? null)
        await adopt({
          projectId: project.id!,
          worldGroupId: homeGroupId,
          target: 'characters',
          mode: 'add',
          data: {
            name: c.name,
            roleWeight: c.roleWeight,
            moralAxis: c.moralAxis,
            orderAxis: c.orderAxis,
            isCrossWorld: c.isCrossWorld,
            // 维度字段从 CHARACTER_DIMENSIONS 单源派生：解析对象带什么就写什么，
            // 不硬编码字段表(空值由 adopt 跳过；缺的维度用户可后续 C1 补全)。
            ...Object.fromEntries(
              CHARACTER_DIMENSIONS
                .map(d => [d.key, (c as unknown as Record<string, unknown>)[d.key]])
                .filter(([, v]) => typeof v === 'string' && v),
            ),
          },
        })
      }

      // 刷新世界组 store
      await wgStore.loadAll(project.id!)
      setMwAdopted(true)
    } finally {
      setAdopting(false)
    }
  }

  // 导出反推结果为 Markdown 文件
  const handleExportResult = () => {
    const lines: string[] = [`# ${project.name} — ${t('inspiration.exportTitle')}\n`]
    if (inspiration.trim()) lines.push(`## ${t('inspiration.exportOriginal')}\n${inspiration}\n`)
    if (mwResult) {
      const sc = mwResult.storyCore
      lines.push(`## ${t('inspiration.exportStoryMain')}`)
      if (sc.logline) lines.push(`- ${t('inspiration.exportLogline')}：${sc.logline}`)
      if (sc.theme) lines.push(`- ${t('inspiration.exportTheme')}：${sc.theme}`)
      if (sc.centralConflict) lines.push(`- ${t('inspiration.exportConflict')}：${sc.centralConflict}`)
      if (sc.mainPlot) lines.push(`- ${t('inspiration.exportMainPlot')}：${sc.mainPlot}`)
      lines.push('')
      mwResult.worlds.forEach((w, i) => {
        lines.push(`## ${t('inspiration.exportWorld')} ${i + 1}：${w.name}（${w.type}）`)
        if (w.worldOrigin) lines.push(`- ${t('inspiration.exportWorldOrigin')}：${w.worldOrigin}`)
        if (w.powerHierarchy) lines.push(`- ${t('inspiration.exportPowerSystem')}：${w.powerHierarchy}`)
        if (w.continentLayout) lines.push(`- ${t('inspiration.exportGeography')}：${w.continentLayout}`)
        if (w.historyLine) lines.push(`- ${t('inspiration.exportHistory')}：${w.historyLine}`)
        if (w.factionLayout) lines.push(`- ${t('inspiration.exportFactions')}：${w.factionLayout}`)
        if (w.entryCondition) lines.push(`- ${t('inspiration.exportEntryCondition')}：${w.entryCondition}`)
        if (w.powerRestriction) lines.push(`- ${t('inspiration.exportPowerRestriction')}：${w.powerRestriction}`)
        lines.push('')
      })
      if (mwResult.characters.length) {
        lines.push(`## ${t('inspiration.exportInitialChars')}`)
        mwResult.characters.forEach(c => {
          const home = c.isCrossWorld ? t('inspiration.exportCrossWorld') : (c.homeWorld || '')
          lines.push(`- **${c.name}**（${characterAxesLabel(c)}${home ? ` · ${home}` : ''}）：${c.shortDescription}`)
        })
      }
    } else if (result) {
      const wv = result.worldview, sc = result.storyCore
      lines.push(`## ${t('inspiration.exportWorldview')}`)
      if (wv.worldOrigin) lines.push(`- ${t('inspiration.exportWorldOrigin')}：${wv.worldOrigin}`)
      if (wv.powerHierarchy) lines.push(`- ${t('inspiration.exportPowerSystem')}：${wv.powerHierarchy}`)
      if (wv.continentLayout) lines.push(`- ${t('inspiration.exportGeography')}：${wv.continentLayout}`)
      if (wv.historyLine) lines.push(`- ${t('inspiration.exportHistory')}：${wv.historyLine}`)
      if (wv.factionLayout) lines.push(`- ${t('inspiration.exportFactions')}：${wv.factionLayout}`)
      lines.push(`\n## ${t('inspiration.exportStoryCore')}`)
      if (sc.logline) lines.push(`- ${t('inspiration.exportLogline')}：${sc.logline}`)
      if (sc.theme) lines.push(`- ${t('inspiration.exportTheme')}：${sc.theme}`)
      if (sc.centralConflict) lines.push(`- ${t('inspiration.exportConflict')}：${sc.centralConflict}`)
      if (sc.mainPlot) lines.push(`- ${t('inspiration.exportMainPlot')}：${sc.mainPlot}`)
      if (result.characters.length) {
        lines.push(`\n## ${t('inspiration.exportInitialChars')}`)
        result.characters.forEach(c => lines.push(`- **${c.name}**（${characterAxesLabel(c)}）：${c.shortDescription}`))
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name}-灵感反推.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleChar = (idx: number) => {
    setSelectedChars(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // ── 采纳世界观 ─────────────────────────────────
  const handleAdoptWorldview = async () => {
    if (!result || adoptedSections.has('worldview')) return
    setAdopting(true)
    const wv = result.worldview
    await adopt({
      projectId: project.id!,
      target: 'worldviews',
      mode: 'replace',
      data: {
        worldOrigin: wv.worldOrigin || undefined,
        powerHierarchy: wv.powerHierarchy || undefined,
        continentLayout: wv.continentLayout || undefined,
        climateByRegion: wv.climateByRegion || undefined,
        historyLine: wv.historyLine || undefined,
        races: wv.races || undefined,
        factionLayout: wv.factionLayout || undefined,
      },
    })
    setAdoptedSections(prev => new Set(prev).add('worldview'))
    setAdopting(false)
  }

  // ── 采纳故事核心 ─────────────────────────────────
  const handleAdoptStoryCore = async () => {
    if (!result || adoptedSections.has('storyCore')) return
    setAdopting(true)
    const sc = result.storyCore
    await adopt({
      projectId: project.id!,
      target: 'storyCores',
      mode: 'replace',
      data: {
        theme: sc.theme || undefined,
        centralConflict: sc.centralConflict || undefined,
        plotPattern: sc.plotPattern || undefined,
        mainPlot: sc.mainPlot || undefined,
        logline: sc.logline || undefined,
      },
    })
    setAdoptedSections(prev => new Set(prev).add('storyCore'))
    setAdopting(false)
  }

  // ── 采纳角色 ─────────────────────────────────────
  const handleAdoptCharacters = async () => {
    if (!result || adoptedSections.has('characters')) return
    setAdopting(true)
    for (const idx of Array.from(selectedChars).sort()) {
      const c = result.characters[idx]
      if (!c || !c.name) continue
      await adopt({
        projectId: project.id!,
        target: 'characters',
        mode: 'add',
        data: {
          name: c.name,
          roleWeight: c.roleWeight,
          moralAxis: c.moralAxis,
          orderAxis: c.orderAxis,
          // 维度字段从 CHARACTER_DIMENSIONS 单源派生（同上：不硬编码字段表）
          ...Object.fromEntries(
            CHARACTER_DIMENSIONS
              .map(d => [d.key, (c as unknown as Record<string, unknown>)[d.key]])
              .filter(([, v]) => typeof v === 'string' && v),
          ),
        },
      })
    }
    setAdoptedSections(prev => new Set(prev).add('characters'))
    setAdopting(false)
  }

  // ── 一键全部采纳 ─────────────────────────────────
  const handleAdoptAll = async () => {
    if (!result) return
    setAdopting(true)
    if (!adoptedSections.has('worldview')) await handleAdoptWorldview()
    if (!adoptedSections.has('storyCore')) await handleAdoptStoryCore()
    if (!adoptedSections.has('characters')) await handleAdoptCharacters()
    setAdopting(false)
  }

  const placeholderText = `${t('inspiration.placeholder1')}\n\n${t('inspiration.placeholder2')}\n- ${t('inspiration.placeholder3')}\n- ${t('inspiration.placeholder4')}\n- ${t('inspiration.placeholder5')}\n- ${t('inspiration.placeholder6')}`

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 顶部标题 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-bg-surface">
        <Lightbulb className="w-5 h-5 text-yellow-500" />
        <h2 className="text-lg font-semibold text-text-primary">{t('inspiration.title')}</h2>
        <span className="text-xs text-text-muted ml-2">{t('inspiration.subtitle')}</span>
        {(result || mwResult) && (
          <button
            onClick={handleExportResult}
            className="ml-auto flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-bg-elevated text-text-secondary border border-border hover:text-accent hover:border-accent/50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> {t('inspiration.export')}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* ── 灵感输入 ────────────────────────────── */}
        <section>
          <label className="block text-sm font-medium text-text-primary mb-1">
            {t('inspiration.writeLabel')}
          </label>
          {/* CF-5: 明确适用边界，避免用户误把长篇正文粘进来 */}
          <p className="text-xs text-text-muted mb-2" dangerouslySetInnerHTML={{ __html: t('inspiration.writeHelper') }} />
          <AutoResizeTextarea
            value={inspiration}
            onChange={e => setInspiration(e.target.value)}
            placeholder={placeholderText}
            className="w-full text-sm bg-bg-base border border-border rounded-lg px-4 py-3 text-text-primary placeholder:text-text-muted resize-none"
            minRows={5}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={sourceKind}
              onChange={event => setSourceKind(event.target.value as InspirationSourceKind)}
              className="rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-secondary"
              aria-label={t('inspiration.sourceLabel')}
            >
              <option value="author">{t('inspiration.sourceAuthor')}</option>
              <option value="reference">{t('inspiration.sourceReference')}</option>
              <option value="research">{t('inspiration.sourceResearch')}</option>
              <option value="other">{t('inspiration.sourceOther')}</option>
            </select>
            <input
              value={fragmentLabel}
              onChange={event => setFragmentLabel(event.target.value)}
              maxLength={80}
              placeholder={t('inspiration.fragmentTitle')}
              className="min-w-44 flex-1 rounded border border-border bg-bg-elevated px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted"
            />
            <button
              onClick={() => { void addCurrentFragment() }}
              disabled={!inspiration.trim() || inspiration.trim().length > MAX_INSPIRATION_FRAGMENT_CHARS}
              className="flex items-center gap-1 rounded border border-accent/40 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> {t('inspiration.addToLibrary')}
            </button>
          </div>
          {/* CF-5: 超长非阻断提示——不静默截断，明确告知只适合短文本 */}
          {inspiration.trim().length > 1500 && (
            <p className={`mt-1.5 text-xs ${
              inspiration.trim().length > MAX_INSPIRATION_FRAGMENT_CHARS ? 'text-red-400' : 'text-warning'
            }`}>
              {inspiration.trim().length > MAX_INSPIRATION_FRAGMENT_CHARS
                ? t('inspiration.lengthWarning', { count: inspiration.trim().length, max: MAX_INSPIRATION_FRAGMENT_CHARS })
                : t('inspiration.lengthCaution', { count: inspiration.trim().length })}
            </p>
          )}
        </section>

        {fusionError && (
          <p role="alert" className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
            {fusionError}
          </p>
        )}

        <InspirationFusionReview
          fragments={inspirationWorkspace.fragments}
          versions={inspirationWorkspace.versions}
          selectedIds={selectedFragmentIds}
          mode={mode}
          pendingDiff={pendingDiff}
          confirming={confirmingFusion}
          onToggle={fragmentId => {
            setSelectedFragmentIds(current => {
              const next = new Set(current)
              if (next.has(fragmentId)) next.delete(fragmentId)
              else next.add(fragmentId)
              return next
            })
          }}
          onRemove={fragmentId => { void handleRemoveFragment(fragmentId) }}
          onConfirm={() => { void handleConfirmFusion() }}
          onDiscard={handleDiscardFusion}
        />

        {/* ── 补充说明 ────────────────────────────── */}
        <section>
          <label className="block text-xs text-text-muted mb-1">{t('inspiration.notesLabel')}</label>
          <AutoResizeTextarea
            value={userHint}
            onChange={e => setUserHint(e.target.value)}
            placeholder={t('inspiration.notesPlaceholder')}
            className="w-full text-sm bg-bg-base border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-muted resize-none"
            minRows={2}
          />
        </section>

        {/* ── 生成按钮 ────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={
              (!inspiration.trim() && selectedFragmentIds.size === 0)
              || inspiration.trim().length > MAX_INSPIRATION_FRAGMENT_CHARS
              || ai.isStreaming
            }
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {ai.isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {ai.isStreaming ? t('inspiration.fusing') : inspirationWorkspace.versions.some(version => version.mode === mode) ? t('inspiration.fuseAndUpdate') : t('inspiration.startReverse')}
          </button>
          {ai.isStreaming && (
            <button onClick={ai.stop} className="text-xs text-text-muted hover:text-red-500 transition-colors">
              {t('inspiration.stop')}
            </button>
          )}
        </div>

        {/* ── AI 流式输出 ────────────────────────── */}
        {(ai.output || ai.isStreaming || ai.error) && (
          <AIStreamOutput
            output={ai.output}
            isStreaming={ai.isStreaming}
            error={ai.error}
            tokenUsage={ai.tokenUsage}
            onStop={ai.stop}
            onRetry={handleGenerate}
            placeholder={t('inspiration.waitingResult')}
            moduleKey={isMW ? 'inspiration.reverse.multiworld' : 'inspiration.reverse'}
          />
        )}

        {/* ── 多世界反推结果预览 ─────────────────────── */}
        {isMW && mwResult && !ai.isStreaming && (
          <InspirationMultiWorldResult
            result={mwResult}
            adopted={mwAdopted}
            adopting={adopting}
            adoptionLocked={pendingDiff !== null}
            onAdopt={handleAdoptMultiWorld}
          />
        )}

        {/* ── 结构化结果预览 ─────────────────────── */}
        {result && !ai.isStreaming && (
          <InspirationSingleResult
            result={result}
            expandedSections={expandedSections}
            adoptedSections={adoptedSections}
            selectedChars={selectedChars}
            adopting={adopting}
            adoptionLocked={pendingDiff !== null}
            onToggleSection={toggleSection}
            onToggleCharacter={toggleChar}
            onAdoptWorldview={handleAdoptWorldview}
            onAdoptStoryCore={handleAdoptStoryCore}
            onAdoptCharacters={handleAdoptCharacters}
            onAdoptAll={handleAdoptAll}
          />
        )}
      </div>
    </div>
  )
}

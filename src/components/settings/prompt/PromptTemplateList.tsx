import { useState } from 'react'
import { ChevronRight, ChevronDown, Star, User } from 'lucide-react'
import type { PromptTemplate } from '../../../lib/types/prompt'
import { resolveSystemSeedDisplay, toCamelLabelKey } from '../../../lib/ai/seed-i18n'
import { useDomainT, type DomainTFunction } from '../../../i18n'

const GROUP_EMOJIS: Record<string, string> = {
  worldview: '🌍', research: '🔎', character: '🧙', outline: '🗂',
  chapter: '✏️', detail: '📝', review: '🧭', foreshadow: '🎯',
  geography: '🗺', story: '📖', rules: '📐', prompt: '⚙️', import: '📥',
  relation: '💞', plot: '🧩', inspiration: '💡', 'world-group': '🌐',
  inventory: '🎒', codex: '📚', location: '📍', 'story-timeline': '🕰️',
  scene: '🎬', history: '🏛️', style: '🖋️',
}

const GROUP_ORDERS: Record<string, number> = {
  worldview: 1, research: 2, character: 3, outline: 4, chapter: 5,
  detail: 6, review: 7, foreshadow: 8, geography: 9, story: 10,
  rules: 11, prompt: 12, import: 13, relation: 14, plot: 15,
  inspiration: 16, 'world-group': 17, inventory: 18, codex: 19,
  location: 20, 'story-timeline': 21, scene: 22, history: 23, style: 24,
}

interface Props {
  templates: PromptTemplate[]
  selectedId: number | null
  onSelect: (id: number) => void
}

export default function PromptTemplateList({ templates, selectedId, onSelect }: Props) {
  const { t } = useDomainT('settings')

  const groups = new Map<string, PromptTemplate[]>()
  for (const tpl of templates) {
    const groupKey = tpl.moduleKey.split('.')[0]
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey)!.push(tpl)
  }

  const sortedGroups = [...groups.entries()].sort((a, b) => {
    const oa = GROUP_ORDERS[a[0]] ?? 99
    const ob = GROUP_ORDERS[b[0]] ?? 99
    return oa - ob
  })

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (k: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  if (templates.length === 0) {
    return (
      <div className="p-6 text-center text-text-muted text-sm">
        {t('promptManager.emptyFilter')}
      </div>
    )
  }

  return (
    <div className="py-2">
      {sortedGroups.map(([groupKey, items]) => {
        const emoji = GROUP_EMOJIS[groupKey] || '📁'
        // P1-5:groupKey 可能带 kebab('world-group');键形归一后再查,缺失回退原文
        const label = t(`promptGroupLabels.${toCamelLabelKey(groupKey)}` as any, groupKey) || groupKey
        const isCollapsed = collapsed.has(groupKey)
        return (
          <div key={groupKey} className="mb-1">
            <button
              onClick={() => toggle(groupKey)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover"
            >
              {isCollapsed
                ? <ChevronRight className="w-3 h-3" />
                : <ChevronDown className="w-3 h-3" />}
              <span className="text-base">{emoji}</span>
              <span className="font-medium">{label}</span>
              <span className="ml-auto text-text-muted">{items.length}</span>
            </button>

            {!isCollapsed && (
              <div>
                {items
                  .sort((a, b) => (a.scope === 'system' ? -1 : 1) - (b.scope === 'system' ? -1 : 1) || a.id! - b.id!)
                  .map(tpl => (
                    <TemplateRow
                      key={tpl.id}
                      template={tpl}
                      selected={tpl.id === selectedId}
                      onClick={() => onSelect(tpl.id!)}
                      t={t}
                    />
                  ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TemplateRow({
  template, selected, onClick, t,
}: { template: PromptTemplate; selected: boolean; onClick: () => void; t: DomainTFunction }) {
  const subKey = template.moduleKey.split('.').slice(1).join('.')
  // P1-5:subKey 为 kebab('parse-character'),而 locale 只登记 camelCase 孪生键
  // (promptSubLabels.parseCharacter 等);派生处归一化,键缺失时回退原 subKey。
  const subLabel = t(`promptSubLabels.${toCamelLabelKey(subKey)}` as any, subKey) || subKey
  // System seed names resolve via settings ns (promptTemplates.*); user templates keep raw names.
  const display = resolveSystemSeedDisplay(t, 'prompt', template)

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-2 pl-8 pr-3 py-1.5 text-left text-sm border-l-2 transition-colors ${
        selected
          ? 'border-accent bg-accent/10 text-text-primary'
          : 'border-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      }`}
    >
      {template.scope === 'system'
        ? <Star className="w-3.5 h-3.5 mt-0.5 text-warning flex-shrink-0" />
        : <User className="w-3.5 h-3.5 mt-0.5 text-info flex-shrink-0" />}

      <div className="flex-1 min-w-0">
        <div className="truncate flex items-center gap-1.5">
          <span className="text-xs text-text-muted">[{subLabel}]</span>
          <span className="truncate">{display.name}</span>
        </div>
      </div>

      {template.isDefault && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning flex-shrink-0">
          {t('promptEditor.defaultBadge')}
        </span>
      )}
      {template.isActive && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success flex-shrink-0">
          {t('promptEditor.activeBadge')}
        </span>
      )}
    </button>
  )
}

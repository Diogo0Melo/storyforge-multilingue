import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown, Star, User } from 'lucide-react'
import type { PromptTemplate } from '../../../lib/types/prompt'

const GROUP_EMOJIS: Record<string, string> = {
  worldview: '🌍', research: '🔎', character: '🧙', outline: '🗂', chapter: '✏️',
  detail: '📝', review: '🧭', foreshadow: '🎯', geography: '🗺', story: '📖',
  rules: '📐', prompt: '⚙️', import: '📥',
}

const GROUP_ORDER: Record<string, number> = {
  worldview: 1, research: 2, character: 3, outline: 4, chapter: 5, detail: 6,
  review: 7, foreshadow: 8, geography: 9, story: 10, rules: 11, prompt: 12, import: 13,
}

interface Props {
  templates: PromptTemplate[]
  selectedId: number | null
  onSelect: (id: number) => void
}

export default function PromptTemplateList({ templates, selectedId, onSelect }: Props) {
  const { t } = useTranslation('settings')
  
  // 按 moduleKey 第一段分组
  const groups = new Map<string, PromptTemplate[]>()
  for (const template of templates) {
    const groupKey = template.moduleKey.split('.')[0]
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey)!.push(template)
  }

  // 排序后转数组
  const sortedGroups = [...groups.entries()].sort((a, b) => {
    const oa = GROUP_ORDER[a[0]] ?? 99
    const ob = GROUP_ORDER[b[0]] ?? 99
    return oa - ob
  })

  // 折叠状态：默认全部展开
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
        {t('prompt.noTemplates')}
      </div>
    )
  }

  return (
    <div className="py-2">
      {sortedGroups.map(([groupKey, items]) => {
        const emoji = GROUP_EMOJIS[groupKey] || '📁'
        const label = (t as (key: string) => string)(`prompt.groups.${groupKey}`) || groupKey
        const isCollapsed = collapsed.has(groupKey)
        return (
          <div key={groupKey} className="mb-1">
            {/* 分组头 */}
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

            {/* 模板项 */}
            {!isCollapsed && (
              <div>
                {items
                  .sort((a, b) => (a.scope === 'system' ? -1 : 1) - (b.scope === 'system' ? -1 : 1) || a.id! - b.id!)
                  .map(template => (
                    <TemplateRow
                      key={template.id}
                      template={template}
                      selected={template.id === selectedId}
                      onClick={() => onSelect(template.id!)}
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
  template, selected, onClick,
}: { 
  template: PromptTemplate; 
  selected: boolean; 
  onClick: () => void;
}) {
  const { t } = useTranslation('settings')
  const subKey = template.moduleKey.split('.').slice(1).join('.')
  const subLabel = (t as (key: string) => string)(`prompt.subLabels.${subKey}`) || subKey

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-2 pl-8 pr-3 py-1.5 text-left text-sm border-l-2 transition-colors ${
        selected
          ? 'border-accent bg-accent/10 text-text-primary'
          : 'border-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      }`}
    >
      {/* scope 图标 */}
      {template.scope === 'system'
        ? <Star className="w-3.5 h-3.5 mt-0.5 text-warning flex-shrink-0" />
        : <User className="w-3.5 h-3.5 mt-0.5 text-info flex-shrink-0" />}

      <div className="flex-1 min-w-0">
        <div className="truncate flex items-center gap-1.5">
          <span className="text-xs text-text-muted">[{subLabel}]</span>
          <span className="truncate">{template.nameKey ? t(template.nameKey, { defaultValue: template.name }) : template.name}</span>
        </div>
      </div>

      {template.isDefault && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning flex-shrink-0">
          {t('prompt.default')}
        </span>
      )}
      {template.isActive && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success flex-shrink-0">
          {t('prompt.active')}
        </span>
      )}
    </button>
  )
}

import { CheckSquare, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { OutlineNode, StateCard } from '../../lib/types'
import { STATE_CATEGORY_LABELS } from '../../lib/types/state-card'

const CATEGORY_STYLES: Record<StateCard['category'], string> = {
  character: 'bg-blue-500/10 text-blue-400',
  location: 'bg-green-500/10 text-green-400',
  item: 'bg-yellow-500/10 text-yellow-400',
  faction: 'bg-purple-500/10 text-purple-400',
  event: 'bg-red-500/10 text-red-400',
}

interface Props {
  worldContext: string
  characterContext: string
  outlineNode?: Pick<OutlineNode, 'title' | 'summary'>
  stateCards: StateCard[]
  matchedIds: number[]
  allIds: number[]
  extraIds: number[]
  stateListExpanded: boolean
  onToggleStateList: () => void
  onToggleStateCard: (cardId: number) => void
}

export default function ChapterContextPreview({
  worldContext,
  characterContext,
  outlineNode,
  stateCards,
  matchedIds,
  allIds,
  extraIds,
  stateListExpanded,
  onToggleStateList,
  onToggleStateCard,
}: Props) {
  const { t } = useTranslation('editor')
  return (
    <div className="mx-6 mb-3 max-h-64 overflow-y-auto rounded-xl border border-border bg-bg-elevated p-3 text-xs text-text-muted shadow-theme-sm">
      <p className="font-medium text-text-secondary mb-1">{t('context.title')}</p>
      <div className="whitespace-pre-wrap">
        {worldContext && <p>{t('context.worldview')}{worldContext.slice(0, 500)}...</p>}
        {characterContext && <p>{t('context.character')}{characterContext.slice(0, 300)}...</p>}
        {outlineNode && <p>{t('context.outline')}{outlineNode.title}：{outlineNode.summary}</p>}
      </div>

      {stateCards.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium text-text-secondary">
              {t('context.stateInjection', { matched: matchedIds.length, total: allIds.length })}
            </p>
            <button
              type="button"
              onClick={onToggleStateList}
              className="text-accent hover:text-accent-hover text-xs"
            >
              {stateListExpanded ? t('context.collapse') : t('context.expandAdjust')}
            </button>
          </div>
          {stateListExpanded && (
            <div className="space-y-1 mt-1">
              {stateCards.map(card => {
                const cardId = card.id!
                const isMatched = matchedIds.includes(cardId)
                const isExtra = extraIds.includes(cardId)
                return (
                  <div key={cardId} className="flex items-center gap-1.5 cursor-pointer hover:bg-bg-hover rounded px-1 py-0.5">
                    <button
                      type="button"
                      aria-label={t('context.stateCardLabel', { name: card.entityName })}
                      onClick={() => onToggleStateCard(cardId)}
                      className="flex-shrink-0"
                    >
                      {isMatched || isExtra
                        ? <CheckSquare className="w-3.5 h-3.5 text-accent" />
                        : <Square className="w-3.5 h-3.5 text-text-muted" />}
                    </button>
                    <span className={`px-1 py-0.5 rounded text-[10px] ${CATEGORY_STYLES[card.category]}`}>
                      {STATE_CATEGORY_LABELS[card.category]}
                    </span>
                    <span className={isMatched || isExtra ? 'text-text-primary' : 'text-text-muted'}>
                      {card.entityName}
                    </span>
                    {isMatched && !isExtra && <span className="text-[10px] text-accent/60">{t('context.autoMatched')}</span>}
                    {isExtra && <span className="text-[10px] text-warning">{t('context.manualAdded')}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { Braces, CheckSquare, ChevronDown, ChevronUp, Info, Square } from 'lucide-react'
import type { OutlineNode, StateCard } from '../../lib/types'
import { STATE_CATEGORY_LABEL_KEYS } from '../../lib/types/state-card'
import { useDomainT } from '../../i18n'

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
  const { t } = useDomainT('editor')
  return (
    <div className="mx-6 mb-3 max-h-64 overflow-y-auto rounded-xl border border-border bg-bg-elevated p-3 text-xs text-text-muted shadow-theme-sm">
      <div className="mb-1 flex items-center gap-1.5">
        <Braces className="h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden="true" />
        <p className="font-medium text-text-secondary">{t('contextPreview.title')}</p>
        <span className="ml-auto rounded border border-border bg-bg-base px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">
          {t('contextPreview.payloadBadge')}
        </span>
      </div>
      <p className="mb-1.5 flex items-start gap-1 text-[11px] leading-snug text-text-muted">
        <Info className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
        <span>{t('contextPreview.disclosure')}</span>
      </p>
      <div className="space-y-1 whitespace-pre-wrap break-words rounded-lg border border-border-subtle bg-bg-base px-2 py-1.5 font-mono text-[11px] leading-relaxed">
        {worldContext && (
          <p>
            <span className="text-text-secondary">{t('contextPreview.worldSection')}</span>
            {worldContext.slice(0, 500)}...
          </p>
        )}
        {characterContext && (
          <p>
            <span className="text-text-secondary">{t('contextPreview.characterSection')}</span>
            {characterContext.slice(0, 300)}...
          </p>
        )}
        {outlineNode && (
          <p>
            <span className="text-text-secondary">{t('contextPreview.outlineSection')}</span>
            {outlineNode.title}：{outlineNode.summary}
          </p>
        )}
      </div>

      {stateCards.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium text-text-secondary">
              {t('contextPreview.stateCardsTitle', { matched: matchedIds.length, total: allIds.length })}
            </p>
            <button
              type="button"
              onClick={onToggleStateList}
              className="flex items-center gap-0.5 text-accent hover:text-accent-hover text-xs"
            >
              {stateListExpanded ? t('contextPreview.btnCollapse') : t('contextPreview.btnExpand')}
              {stateListExpanded
                ? <ChevronUp className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                : <ChevronDown className="h-3 w-3 flex-shrink-0" aria-hidden="true" />}
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
                      aria-label={`${t('contextPreview.stateCardAriaLabel')}${card.entityName}`}
                      onClick={() => onToggleStateCard(cardId)}
                      className="flex-shrink-0"
                    >
                      {isMatched || isExtra
                        ? <CheckSquare className="w-3.5 h-3.5 text-accent" />
                        : <Square className="w-3.5 h-3.5 text-text-muted" />}
                    </button>
                    <span className={`px-1 py-0.5 rounded text-[10px] ${CATEGORY_STYLES[card.category]}`}>
                      {t(STATE_CATEGORY_LABEL_KEYS[card.category])}
                    </span>
                    <span className={isMatched || isExtra ? 'text-text-primary' : 'text-text-muted'}>
                      {card.entityName}
                    </span>
                    {isMatched && !isExtra && <span className="text-[10px] text-accent/60">{t('contextPreview.autoMatched')}</span>}
                    {isExtra && <span className="text-[10px] text-warning">{t('contextPreview.manualAdded')}</span>}
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

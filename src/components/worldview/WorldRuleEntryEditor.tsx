import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  CONFLICT_PRIORITY_LABELS,
  CONFLICT_PRIORITY_LABEL_KEYS,
  isEntryEmpty,
} from '../../lib/types/world-rules'
import type { ConflictPriority, WorldRuleEntry } from '../../lib/types/world-rules'

interface Props {
  selectedNode: string | null
  currentLabel: string
  currentHints: string[]
  currentEntry: WorldRuleEntry
  isCustomNode: boolean
  onFieldChange: (field: keyof WorldRuleEntry, value: string | ConflictPriority) => void
  onDeleteNode: () => void
  onClearEntry: () => void
}

export default function WorldRuleEntryEditor({
  selectedNode,
  currentLabel,
  currentHints,
  currentEntry,
  isCustomNode,
  onFieldChange,
  onDeleteNode,
  onClearEntry,
}: Props) {
  const { t } = useTranslation('worlds')
  return (
    <div className="flex-1 overflow-y-auto p-5">
      {selectedNode ? (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-text-primary">{currentLabel}</h3>
            <div className="flex items-center gap-2">
              {isCustomNode && (
                <button onClick={onDeleteNode} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> {t('ruleEditor.deleteNode')}
                </button>
              )}
              {!isEntryEmpty(currentEntry) && (
                <button onClick={onClearEntry} className="text-xs text-text-muted hover:text-red-400 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> {t('ruleEditor.clearEntry')}
                </button>
              )}
            </div>
          </div>

          {currentHints.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {currentHints.map(hint => (
                <span key={hint} className="text-xs px-2 py-0.5 rounded-full bg-bg-elevated text-text-muted border border-border">
                  {hint}
                </span>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              {t('ruleEditor.realAnchor')}
            </label>
            <textarea
              value={currentEntry.historicalAnchors}
              onChange={event => onFieldChange('historicalAnchors', event.target.value)}
              placeholder={t('ruleEditor.realAnchorPlaceholder')}
              rows={5}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-base text-text-primary placeholder:text-text-muted/50 focus:ring-1 focus:ring-accent focus:border-accent resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              {t('ruleEditor.fictionAnchor')}
            </label>
            <textarea
              value={currentEntry.fictionalAdaptations}
              onChange={event => onFieldChange('fictionalAdaptations', event.target.value)}
              placeholder={t('ruleEditor.fictionAnchorPlaceholder')}
              rows={5}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg-base text-text-primary placeholder:text-text-muted/50 focus:ring-1 focus:ring-accent focus:border-accent resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">{t('ruleEditor.conflictRule')}</label>
            <div className="flex gap-2">
              {(Object.entries(CONFLICT_PRIORITY_LABELS) as [ConflictPriority, string][]).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => onFieldChange('priority', value)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    currentEntry.priority === value
                      ? value === 'historical'
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                        : value === 'fictional'
                          ? 'bg-purple-500/20 border-purple-500/40 text-purple-400'
                          : 'bg-accent/20 border-accent/40 text-accent'
                      : 'border-border text-text-muted hover:border-text-muted'
                  }`}
                >
                  {value === 'historical' ? '📜 ' : value === 'fictional' ? '✨ ' : '⚖️ '}
                  {t(CONFLICT_PRIORITY_LABEL_KEYS[value], label)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-text-muted">
          <span className="text-4xl mb-3">⚖️</span>
          <p className="text-sm">{t('ruleEditor.emptyState')}</p>
          <p className="text-xs mt-1">{t('ruleEditor.emptyStateHint')}</p>
        </div>
      )}
    </div>
  )
}

import type { MouseEventHandler } from 'react'
import { useDomainT } from '../../i18n'
import {
  Bold as BoldIcon,
  Heading2,
  Heading3,
  Italic as ItalicIcon,
  List as ListIcon,
  ListOrdered,
  Minus,
  PaintBucket,
  Palette,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react'
import type { EditorTypography } from '../../lib/editor-typography'

const FONT_FAMILY_VALUES = [
  { key: 'defaultBody', value: '', preview: 'var(--font-serif)' },
  { key: 'songti', value: '"SimSun", "Songti SC", "Noto Serif CJK SC", serif', preview: '"SimSun", "Songti SC", serif' },
  { key: 'heiti', value: '"SimHei", "Microsoft YaHei", "PingFang SC", "Heiti SC", sans-serif', preview: '"SimHei", "Microsoft YaHei", sans-serif' },
  { key: 'fangsong', value: '"FangSong", "FangSong_GB2312", "STFangsong", serif', preview: '"FangSong", "STFangsong", serif' },
  { key: 'kaiti', value: '"KaiTi", "Kaiti SC", "STKaiti", serif', preview: '"KaiTi", "Kaiti SC", serif' },
  { key: 'microsoftYahei', value: '"Microsoft YaHei", "PingFang SC", sans-serif', preview: '"Microsoft YaHei", "PingFang SC", sans-serif' },
] as const

const FONT_FAMILY_LABEL_KEYS = {
  defaultBody: 'toolbar.fontDefaultBody',
  songti: 'toolbar.fontSongti',
  heiti: 'toolbar.fontHeiti',
  fangsong: 'toolbar.fontFangsong',
  kaiti: 'toolbar.fontKaiti',
  microsoftYahei: 'toolbar.fontMicrosoftYahei',
} as const satisfies Record<typeof FONT_FAMILY_VALUES[number]['key'], string>

const FONT_SIZE_OPTIONS = ['12px', '14px', '16px', '18px', '20px', '22px', '24px', '28px', '32px'] as const
const LINE_HEIGHT_OPTIONS = [
  { key: 'default', value: '' },
  { key: '1', value: '1' },
  { key: '1.15', value: '1.15' },
  { key: '1.5', value: '1.5' },
  { key: '2', value: '2' },
  { key: '2.5', value: '2.5' },
  { key: '3', value: '3' },
] as const
const LINE_HEIGHT_LABEL_KEYS = {
  default: 'toolbar.lineHeightDefault',
  '1': 'toolbar.lineHeightValue1',
  '1.15': 'toolbar.lineHeightValue115',
  '1.5': 'toolbar.lineHeightValue15',
  '2': 'toolbar.lineHeightValue2',
  '2.5': 'toolbar.lineHeightValue25',
  '3': 'toolbar.lineHeightValue3',
} as const satisfies Record<typeof LINE_HEIGHT_OPTIONS[number]['key'], string>
const PARAGRAPH_SPACING_OPTIONS = [
  { key: 'default', value: '' },
  { key: 'none', value: '0' },
  { key: 'halfLine', value: '0.5em' },
  { key: 'oneLine', value: '1em' },
  { key: 'oneAndHalfLines', value: '1.5em' },
  { key: 'twoLines', value: '2em' },
] as const
const PARAGRAPH_SPACING_LABEL_KEYS = {
  default: 'toolbar.paragraphSpacingDefault',
  none: 'toolbar.paragraphSpacingNone',
  halfLine: 'toolbar.paragraphSpacingHalfLine',
  oneLine: 'toolbar.paragraphSpacingOneLine',
  oneAndHalfLines: 'toolbar.paragraphSpacingOneAndHalfLines',
  twoLines: 'toolbar.paragraphSpacingTwoLines',
} as const satisfies Record<typeof PARAGRAPH_SPACING_OPTIONS[number]['key'], string>

const TEXT_COLOR_PRESETS = [
  { key: 'body', value: 'var(--editor-ink-primary)' },
  { key: 'strong', value: 'var(--editor-ink-strong)' },
  { key: 'warmBrown', value: 'var(--editor-ink-cream)' },
  { key: 'gold', value: 'var(--editor-ink-gold)' },
  { key: 'orangeRed', value: 'var(--editor-ink-orange)' },
  { key: 'blue', value: 'var(--editor-ink-blue)' },
  { key: 'green', value: 'var(--editor-ink-green)' },
  { key: 'red', value: 'var(--editor-ink-red)' },
  { key: 'purple', value: 'var(--editor-ink-purple)' },
] as const
const TEXT_COLOR_LABEL_KEYS = {
  body: 'toolbar.colorBody',
  strong: 'toolbar.colorStrong',
  warmBrown: 'toolbar.colorWarmBrown',
  gold: 'toolbar.colorGold',
  orangeRed: 'toolbar.colorOrangeRed',
  blue: 'toolbar.colorBlue',
  green: 'toolbar.colorGreen',
  red: 'toolbar.colorRed',
  purple: 'toolbar.colorPurple',
} as const satisfies Record<typeof TEXT_COLOR_PRESETS[number]['key'], string>
const BACKGROUND_COLOR_PRESETS = [
  { key: 'clear', value: '#00000000' },
  { key: 'yellow', value: 'var(--editor-mark-yellow)' },
  { key: 'red', value: 'var(--editor-mark-red)' },
  { key: 'blue', value: 'var(--editor-mark-blue)' },
  { key: 'green', value: 'var(--editor-mark-green)' },
  { key: 'purple', value: 'var(--editor-mark-purple)' },
  { key: 'brown', value: 'var(--editor-mark-brown)' },
  { key: 'ink', value: 'var(--editor-mark-ink)' },
] as const
const BACKGROUND_COLOR_LABEL_KEYS = {
  clear: 'toolbar.bgClear',
  yellow: 'toolbar.bgYellow',
  red: 'toolbar.bgRed',
  blue: 'toolbar.bgBlue',
  green: 'toolbar.bgGreen',
  purple: 'toolbar.bgPurple',
  brown: 'toolbar.bgBrown',
  ink: 'toolbar.bgInk',
} as const satisfies Record<typeof BACKGROUND_COLOR_PRESETS[number]['key'], string>

interface Props {
  typography: EditorTypography
  colorInputValue: string
  backgroundColorInputValue: string
  wordCount: number
  active: {
    bold: boolean
    italic: boolean
    strike: boolean
    heading2: boolean
    heading3: boolean
    bulletList: boolean
    orderedList: boolean
    blockquote: boolean
  }
  canUndo: boolean
  canRedo: boolean
  onMouseDownCapture: MouseEventHandler<HTMLDivElement>
  onTypographyChange: (patch: Partial<EditorTypography>) => void
  onTextColorChange: (color: string) => void
  onClearTextColor: () => void
  onBackgroundColorChange: (color: string) => void
  onBold: () => void
  onItalic: () => void
  onStrike: () => void
  onHeading2: () => void
  onHeading3: () => void
  onBulletList: () => void
  onOrderedList: () => void
  onBlockquote: () => void
  onHorizontalRule: () => void
  onUndo: () => void
  onRedo: () => void
}

export default function RichEditorToolbar({
  typography,
  colorInputValue,
  backgroundColorInputValue,
  wordCount,
  active,
  canUndo,
  canRedo,
  onMouseDownCapture,
  onTypographyChange,
  onTextColorChange,
  onClearTextColor,
  onBackgroundColorChange,
  onBold,
  onItalic,
  onStrike,
  onHeading2,
  onHeading3,
  onBulletList,
  onOrderedList,
  onBlockquote,
  onHorizontalRule,
  onUndo,
  onRedo,
}: Props) {
  const { t } = useDomainT('editor')
  const selectCls = 'h-8 rounded-md border border-border bg-bg-surface px-2 text-xs text-text-secondary outline-none transition-colors hover:text-text-primary focus:border-accent'
  const buttonClass = (isActive: boolean) =>
    `p-1.5 rounded text-xs transition-colors ${isActive
      ? 'bg-accent/20 text-accent'
      : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'}`

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-2 border-b border-border bg-bg-elevated flex-wrap"
      onMouseDownCapture={onMouseDownCapture}
    >
      <select aria-label={t('toolbar.fontFamily')} value={typography.fontFamily}
        onChange={event => onTypographyChange({ fontFamily: event.target.value })}
        className={`${selectCls} w-32`} title={t('toolbar.fontFamilyTitle')}>
        {FONT_FAMILY_VALUES.map(option => (
          <option key={option.key} value={option.value} style={{ fontFamily: option.preview }}>{t(FONT_FAMILY_LABEL_KEYS[option.key])}</option>
        ))}
      </select>
      <select aria-label={t('toolbar.fontSize')} value={typography.fontSize}
        onChange={event => onTypographyChange({ fontSize: event.target.value })}
        className={`${selectCls} w-20`} title={t('toolbar.fontSizeTitle')}>
        <option value="">{t('toolbar.fontSizeDefaultOption')}</option>
        {FONT_SIZE_OPTIONS.map(size => <option key={size} value={size}>{Number.parseInt(size, 10)}</option>)}
      </select>
      <select aria-label={t('toolbar.lineHeight')} value={typography.lineHeight}
        onChange={event => onTypographyChange({ lineHeight: event.target.value })}
        className={`${selectCls} w-24`} title={t('toolbar.lineHeightTitle')}>
        {LINE_HEIGHT_OPTIONS.map(option => <option key={option.key} value={option.value}>{t(LINE_HEIGHT_LABEL_KEYS[option.key])}</option>)}
      </select>
      <select aria-label={t('toolbar.paragraphSpacing')} value={typography.paragraphSpacing}
        onChange={event => onTypographyChange({ paragraphSpacing: event.target.value })}
        className={`${selectCls} w-24`} title={t('toolbar.paragraphSpacingTitle')}>
        {PARAGRAPH_SPACING_OPTIONS.map(option => <option key={option.key} value={option.value}>{t(PARAGRAPH_SPACING_LABEL_KEYS[option.key])}</option>)}
      </select>
      <div className="flex items-center gap-1 rounded-md border border-border bg-bg-surface px-1.5 py-1" title={t('toolbar.textColor')}>
        <Palette className="h-3.5 w-3.5 text-text-muted" />
        <input aria-label={t('toolbar.textColor')} type="color" value={colorInputValue}
          onChange={event => onTextColorChange(event.target.value)}
          className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" />
        <div className="hidden items-center gap-0.5 md:flex">
          {TEXT_COLOR_PRESETS.map(color => {
            const label = t(TEXT_COLOR_LABEL_KEYS[color.key])
            return (
              <button key={color.key} type="button" aria-label={`${t('toolbar.textColor')} ${label}`}
                onClick={() => onTextColorChange(color.value)}
                className="h-4 w-4 rounded border border-border hover:border-accent"
                style={{ backgroundColor: color.value }} />
            )
          })}
        </div>
        <button type="button" onClick={onClearTextColor}
          className="px-1 text-[10px] text-text-muted hover:text-text-primary">{t('toolbar.textColorClear')}</button>
      </div>
      <div className="flex items-center gap-1 rounded-md border border-border bg-bg-surface px-1.5 py-1" title={t('toolbar.bgColor')}>
        <PaintBucket className="h-3.5 w-3.5 text-text-muted" />
        <input aria-label={t('toolbar.bgColor')} type="color" value={backgroundColorInputValue}
          onChange={event => onBackgroundColorChange(event.target.value)}
          className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" />
        <div className="hidden items-center gap-0.5 md:flex">
          {BACKGROUND_COLOR_PRESETS.map(color => {
            const label = t(BACKGROUND_COLOR_LABEL_KEYS[color.key])
            return (
              <button key={color.key} type="button" aria-label={label}
                onClick={() => onBackgroundColorChange(color.value)}
                className="h-4 w-4 rounded border border-border hover:border-accent"
                style={{
                  backgroundColor: color.value === '#00000000' ? 'transparent' : color.value,
                  backgroundImage: color.value === '#00000000'
                    ? 'linear-gradient(135deg, transparent 45%, var(--error) 46%, var(--error) 54%, transparent 55%)'
                    : undefined,
                }} />
            )
          })}
        </div>
      </div>
      <div className="w-px h-5 bg-border mx-0.5" />
      <button type="button" onClick={onBold} className={buttonClass(active.bold)} title={t('toolbar.bold')}><BoldIcon className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={onItalic} className={buttonClass(active.italic)} title={t('toolbar.italic')}><ItalicIcon className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={onStrike} className={buttonClass(active.strike)} title={t('toolbar.strike')}><Strikethrough className="w-3.5 h-3.5" /></button>
      <div className="w-px h-4 bg-border mx-1" />
      <button type="button" onClick={onHeading2} className={buttonClass(active.heading2)} title={t('toolbar.heading2')}><Heading2 className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={onHeading3} className={buttonClass(active.heading3)} title={t('toolbar.heading3')}><Heading3 className="w-3.5 h-3.5" /></button>
      <div className="w-px h-4 bg-border mx-1" />
      <button type="button" onClick={onBulletList} className={buttonClass(active.bulletList)} title={t('toolbar.bulletList')}><ListIcon className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={onOrderedList} className={buttonClass(active.orderedList)} title={t('toolbar.orderedList')}><ListOrdered className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={onBlockquote} className={buttonClass(active.blockquote)} title={t('toolbar.blockquote')}><Quote className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={onHorizontalRule} className={buttonClass(false)} title={t('toolbar.horizontalRule')}><Minus className="w-3.5 h-3.5" /></button>
      <div className="flex-1" />
      <span className="text-[11px] text-text-muted font-mono px-1.5 tabular-nums select-none" title={t('toolbar.wordCountTitle')}>
        {t('toolbar.wordCountSuffix', { count: wordCount.toLocaleString() })}
      </span>
      <div className="w-px h-4 bg-border mx-1" />
      <button type="button" onClick={onUndo} className={buttonClass(false)} title={t('toolbar.undo')} disabled={!canUndo}><Undo2 className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={onRedo} className={buttonClass(false)} title={t('toolbar.redo')} disabled={!canRedo}><Redo2 className="w-3.5 h-3.5" /></button>
    </div>
  )
}

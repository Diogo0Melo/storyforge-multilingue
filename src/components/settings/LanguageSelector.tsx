import { useId } from 'react'
import { SUPPORTED_LANGS, useDomainT } from '../../i18n'

/**
 * 语言切换(设置页「其他」分区的一行)。
 *
 * 形态:三段式分段控件(segmented control),沿用 product-hub `.sf-subnav`
 * 的既有语言——凹陷轨道(bg-base + border),选中项抬升为 bg-elevated 圆角胶囊
 * 并带 shadow-theme-sm。三选项内联全显,当前语言一眼可读,无需展开下拉。
 *
 * 交互与可达性:内部是原生 radio(视觉隐藏),方向键循环切换、Tab 落在选中项,
 * 容器 role="radiogroup" 并以可见行标签作为组名(aria-labelledby)。
 *
 * 文案规则:每个选项永远显示该语言的自称(common:languageName.<code>),
 * 不随当前界面语言翻译;行标签取 common:language。
 *
 * 持久化无需自理:i18next detector 已写 localStorage(sf_lang)。
 */
export default function LanguageSelector() {
  const { t, ready, lang, changeLanguage } = useDomainT('common')
  const labelId = useId()

  // i18n 就绪前或语言码落在支持集之外时,回退默认语言,保证单选组始终有选中项。
  const activeCode = SUPPORTED_LANGS.some(item => item.code === lang)
    ? lang
    : SUPPORTED_LANGS[0].code

  return (
    <div
      className={`flex items-center justify-between gap-4 transition-opacity duration-200 ${
        ready ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <p id={labelId} className="text-sm text-text-secondary">
        {t('common:language')}
      </p>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-bg-base p-0.5"
      >
        {SUPPORTED_LANGS.map(({ code }) => {
          const selected = code === activeCode
          return (
            <label
              key={code}
              className={`flex cursor-pointer select-none items-center rounded-md px-3 py-1.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-accent-muted ${
                selected
                  ? 'bg-bg-elevated font-medium text-text-primary shadow-theme-sm'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
              }`}
            >
              <input
                type="radio"
                name="storyforge-language"
                value={code}
                checked={selected}
                onChange={() => { void changeLanguage(code) }}
                className="sr-only"
              />
              {t(`common:languageName.${code}`)}
            </label>
          )
        })}
      </div>
    </div>
  )
}

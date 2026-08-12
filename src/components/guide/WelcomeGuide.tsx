/**
 * 新手引导组件 — 首次使用时展示分步引导
 * 步骤：1.欢迎 → 2.配置AI → 3.创建项目 → 4.功能导览
 * 使用 localStorage 记录是否已完成引导
 */
import { useState, useEffect } from 'react'
import { Flame, Settings, BookOpen, Sparkles, ChevronRight, ChevronLeft, X, Check } from 'lucide-react'
import { useDomainT } from '../../i18n'

const GUIDE_KEY = 'storyforge_guide_completed'

interface Props {
  onGoSettings?: () => void
  onDismiss?: () => void
}

const STEP_KEYS = ['welcome', 'configAi', 'createProject', 'features'] as const
type StepKey = typeof STEP_KEYS[number]

const STEP_META: Record<StepKey, { icon: typeof Flame; color: string }> = {
  welcome:       { icon: Flame,     color: 'text-accent' },
  configAi:      { icon: Settings,  color: 'text-yellow-400' },
  createProject: { icon: BookOpen,  color: 'text-green-400' },
  features:      { icon: Sparkles,  color: 'text-pink-400' },
}

export default function WelcomeGuide({ onGoSettings, onDismiss }: Props) {
  const { t } = useDomainT('guide')
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    try {
      const completed = localStorage.getItem(GUIDE_KEY)
      if (!completed) {
        setVisible(true)
        console.log('[WelcomeGuide] 首次访问，展示引导')
      }
    } catch (err) {
      console.error('[WelcomeGuide] 读取引导状态失败:', err)
    }
  }, [])

  const handleComplete = () => {
    try {
      localStorage.setItem(GUIDE_KEY, String(Date.now()))
      console.log('[WelcomeGuide] 引导完成')
    } catch (err) {
      console.error('[WelcomeGuide] 写入引导状态失败:', err)
    }
    setVisible(false)
    onDismiss?.()
  }

  const handleSkip = () => {
    handleComplete()
  }

  if (!visible) return null

  const stepKey = STEP_KEYS[step]
  const meta = STEP_META[stepKey]
  const Icon = meta.icon
  const isLast = step === STEP_KEYS.length - 1

  // Static key maps — all values are literal types so t() accepts them
  const CONTENT_KEYS = {
    welcome:       ['welcome.content1', 'welcome.content2', 'welcome.content3'],
    configAi:      ['configAi.content1', 'configAi.content2', 'configAi.content3', 'configAi.content4'],
    createProject: ['createProject.content1', 'createProject.content2', 'createProject.content3'],
    features:      ['features.content1', 'features.content2', 'features.content3', 'features.content4', 'features.content5', 'features.content6'],
  } as const satisfies Record<StepKey, readonly string[]>

  const TITLE_KEYS = {
    welcome:       'welcome.title',
    configAi:      'configAi.title',
    createProject: 'createProject.title',
    features:      'features.title',
  } as const satisfies Record<StepKey, string>

  const TIP_KEYS = {
    configAi: 'configAi.tip',
    features: 'features.tip',
  } as const satisfies Partial<Record<StepKey, string>>

  const CREATE_PROJECT_STEPS = [
    'createProject.step1',
    'createProject.step2',
    'createProject.step3',
    'createProject.step4',
    'createProject.step5',
  ] as const

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && handleSkip()}>
      <div className="bg-bg-surface border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* 进度条 */}
        <div className="h-1 bg-bg-elevated">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${((step + 1) / STEP_KEYS.length) * 100}%` }}
          />
        </div>

        {/* 头部 */}
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-bg-elevated ${meta.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">{t(TITLE_KEYS[stepKey])}</h2>
              <span className="text-[10px] text-text-muted">
                {step + 1} / {STEP_KEYS.length}
              </span>
            </div>
          </div>
          <button onClick={handleSkip}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            title={t('skipGuide')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4 space-y-3 min-h-[200px]">
          {CONTENT_KEYS[stepKey].map(key => (
            <p key={key} className="text-sm text-text-secondary leading-relaxed">{t(key)}</p>
          ))}

          {stepKey === 'createProject' && (
            <ol className="space-y-1.5 pl-1">
              {CREATE_PROJECT_STEPS.map((key, idx) => (
                <li key={key} className="flex items-start gap-2 text-sm text-text-secondary">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/15 text-accent text-[10px] flex items-center justify-center mt-0.5 font-bold">
                    {idx + 1}
                  </span>
                  {t(key)}
                </li>
              ))}
            </ol>
          )}

          {(stepKey === 'configAi' || stepKey === 'features') && (
            <div className="mt-3 p-3 bg-warning/5 border border-warning/20 rounded-lg text-xs text-warning">
              💡 {t(TIP_KEYS[stepKey])}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            {t('skipGuide')}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> {t('prevStep')}
              </button>
            )}
            {step === 1 && onGoSettings && (
              <button
                onClick={() => { handleComplete(); onGoSettings() }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-yellow-500/10 text-yellow-400 rounded-lg hover:bg-yellow-500/20 transition-colors"
              >
                <Settings className="w-3.5 h-3.5" /> {t('goSettings')}
              </button>
            )}
            <button
              onClick={() => isLast ? handleComplete() : setStep(step + 1)}
              className="flex items-center gap-1 px-4 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium"
            >
              {isLast ? (
                <><Check className="w-3.5 h-3.5" /> {t('startCreating')}</>
              ) : (
                <>{t('nextStep')} <ChevronRight className="w-3.5 h-3.5" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 重置引导状态（供设置页面使用） */
export function resetWelcomeGuide() {
  try {
    localStorage.removeItem(GUIDE_KEY)
    console.log('[WelcomeGuide] 引导状态已重置')
  } catch (err) {
    console.error('[WelcomeGuide] 重置失败:', err)
  }
}

/** 检查是否已完成引导 */
export function isGuideCompleted(): boolean {
  try {
    return !!localStorage.getItem(GUIDE_KEY)
  } catch {
    return false
  }
}

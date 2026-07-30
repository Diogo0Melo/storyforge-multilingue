/**
 * 新手引导组件 — 首次使用时展示分步引导
 * 步骤：1.欢迎 → 2.配置AI → 3.创建项目 → 4.功能导览
 * 使用 localStorage 记录是否已完成引导
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Flame, Settings, BookOpen, Sparkles, ChevronRight, ChevronLeft, X, Check } from 'lucide-react'

const GUIDE_KEY = 'storyforge_guide_completed'

interface Props {
  onGoSettings?: () => void
  onDismiss?: () => void
}

const STEPS = [
  {
    icon: Flame,
    titleKey: 'guide.welcomeTitle',
    color: 'text-accent',
    contentKeys: [
      'guide.welcomeContent1',
      'guide.welcomeContent2',
      'guide.welcomeContent3',
    ],
  },
  {
    icon: Settings,
    titleKey: 'guide.step1Title',
    color: 'text-yellow-400',
    contentKeys: [
      'guide.step1Content1',
      'guide.step1Content2',
      'guide.step1Content3',
      'guide.step1Content4',
    ],
    tipKey: 'guide.step1Tip',
  },
  {
    icon: BookOpen,
    titleKey: 'guide.step2Title',
    color: 'text-green-400',
    contentKeys: [
      'guide.step2Content1',
      'guide.step2Content2',
      'guide.step2Content3',
    ],
    stepKeys: [
      'guide.step2Substep1',
      'guide.step2Substep2',
      'guide.step2Substep3',
      'guide.step2Substep4',
      'guide.step2Substep5',
    ],
  },
  {
    icon: Sparkles,
    titleKey: 'guide.step3Title',
    color: 'text-pink-400',
    contentKeys: [
      'guide.step3Content1',
      'guide.step3Content2',
      'guide.step3Content3',
      'guide.step3Content4',
      'guide.step3Content5',
      'guide.step3Content6',
    ],
    tipKey: 'guide.step3Tip',
  },
]

export default function WelcomeGuide({ onGoSettings, onDismiss }: Props) {
  const { t } = useTranslation('panels')
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

  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && handleSkip()}>
      <div className="bg-bg-surface border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* 进度条 */}
        <div className="h-1 bg-bg-elevated">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* 头部 */}
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-bg-elevated ${current.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">{t(current.titleKey as any)}</h2>
              <span className="text-[10px] text-text-muted">
                {step + 1} / {STEPS.length}
              </span>
            </div>
          </div>
          <button onClick={handleSkip}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            title={t('guide.skip')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4 space-y-3 min-h-[200px]">
          {current.contentKeys.map((key, idx) => (
            <p key={idx} className="text-sm text-text-secondary leading-relaxed">{t(key as any)}</p>
          ))}

          {current.stepKeys && (
            <ol className="space-y-1.5 pl-1">
              {current.stepKeys.map((key, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-text-secondary">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/15 text-accent text-[10px] flex items-center justify-center mt-0.5 font-bold">
                    {idx + 1}
                  </span>
                  {t(key as any)}
                </li>
              ))}
            </ol>
          )}

          {current.tipKey && (
            <div className="mt-3 p-3 bg-warning/5 border border-warning/20 rounded-lg text-xs text-warning">
              💡 {t(current.tipKey as any)}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            {t('guide.skipGuide')}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> {t('guide.previousStep')}
              </button>
            )}
            {step === 1 && onGoSettings && (
              <button
                onClick={() => { handleComplete(); onGoSettings() }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-yellow-500/10 text-yellow-400 rounded-lg hover:bg-yellow-500/20 transition-colors"
              >
                <Settings className="w-3.5 h-3.5" /> {t('guide.goToSettings')}
              </button>
            )}
            <button
              onClick={() => isLast ? handleComplete() : setStep(step + 1)}
              className="flex items-center gap-1 px-4 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium"
            >
              {isLast ? (
                <><Check className="w-3.5 h-3.5" /> {t('guide.startCreating')}</>
              ) : (
                <>{t('guide.nextStep')} <ChevronRight className="w-3.5 h-3.5" /></>
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

import i18n from '../i18n/i18n'

export const DEFAULT_THEME = 'warm'

export const THEME_OPTIONS = [
  { value: 'warm', label: i18n.t('common:theme.warm.label' as any), emoji: '☕', desc: i18n.t('common:theme.warm.desc' as any), swatches: ['#F4EFE7', '#965A3A', '#2B2620'] },
  { value: 'jade', label: i18n.t('common:theme.jade.label' as any), emoji: '墨', desc: i18n.t('common:theme.jade.desc' as any), swatches: ['#101A17', '#65BFA8', '#F7F1E5'] },
  { value: 'slate', label: i18n.t('common:theme.slate.label' as any), emoji: '◈', desc: i18n.t('common:theme.slate.desc' as any), swatches: ['#EEF2F6', '#3F6F96', '#172033'] },
  { value: 'forge', label: i18n.t('common:theme.forge.label' as any), emoji: '🔥', desc: i18n.t('common:theme.forge.desc' as any), swatches: ['#1A0F0A', '#D97757', '#C8A155'] },
  { value: 'scroll', label: i18n.t('common:theme.scroll.label' as any), emoji: '📜', desc: i18n.t('common:theme.scroll.desc' as any), swatches: ['#E5D5A8', '#7B3A1A', '#8B5E1A'] },
  { value: 'paper', label: i18n.t('common:theme.paper.label' as any), emoji: '🖊', desc: i18n.t('common:theme.paper.desc' as any), swatches: ['#FAF7F0', '#A04E35', '#8A7E6A'] },
] as const

export type StoryForgeTheme = typeof THEME_OPTIONS[number]['value']

const THEME_VALUES = new Set<string>(THEME_OPTIONS.map(theme => theme.value))

const THEME_MIGRATE: Record<string, StoryForgeTheme> = {
  work: 'forge',
  midnight: 'forge',
  ocean: 'forge',
  graphite: 'forge',
  mist: 'paper',
  parchment: 'paper',
}

export function resolveStoryForgeTheme(savedTheme: string | null): StoryForgeTheme {
  if (!savedTheme) return DEFAULT_THEME
  const migrated = THEME_MIGRATE[savedTheme]
  if (migrated) return migrated
  if (THEME_VALUES.has(savedTheme)) return savedTheme as StoryForgeTheme
  return DEFAULT_THEME
}

export function applyStoryForgeTheme(theme: StoryForgeTheme) {
  localStorage.setItem('storyforge-theme', theme)
  document.documentElement.setAttribute('data-theme', theme)
  window.dispatchEvent(new Event('themechange'))
}

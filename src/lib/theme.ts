export const DEFAULT_THEME = 'warm'

export const THEME_OPTIONS = [
  { value: 'warm', label: 'Warm White Studio', emoji: '☕', desc: 'Long-form writing · Clear hierarchy · Default recommendation', swatches: ['#F4EFE7', '#965A3A', '#2B2620'] },
  { value: 'jade', label: 'Ink Jade', emoji: '🌑', desc: 'Dark immersive · Green study · White text body', swatches: ['#101A17', '#65BFA8', '#F7F1E5'] },
  { value: 'slate', label: 'Cool Slate Blue', emoji: '◈', desc: 'Productivity management · Calm and clear · Best for settings library', swatches: ['#EEF2F6', '#3F6F96', '#172033'] },
  { value: 'forge', label: 'Forge', emoji: '🔥', desc: 'Night amber · Fire embers', swatches: ['#1A0F0A', '#D97757', '#C8A155'] },
  { value: 'scroll', label: 'Ancient Scroll', emoji: '📜', desc: 'Yellowed paper · Iron gall ink', swatches: ['#E5D5A8', '#7B3A1A', '#8B5E1A'] },
  { value: 'paper', label: 'Paper & Ink', emoji: '🖊', desc: 'Snow-white paper · Crisp ink strokes', swatches: ['#FAF7F0', '#A04E35', '#8A7E6A'] },
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

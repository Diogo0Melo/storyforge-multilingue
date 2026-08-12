import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Trans } from 'react-i18next'
import { Flame, Github, X, ChevronDown, ChevronRight, FolderOpen, Loader2 } from 'lucide-react'
import { useProjectStore } from '../stores/project'
import WelcomeGuide from '../components/guide/WelcomeGuide'
import {
  isFSASupported, pickFolder, ensureFolderPermission, readStoryforgeBackups,
} from '../lib/storage/folder-backup'
import { importProjectJSON } from '../lib/export/json-export'
import { APP_BUILD_ID } from '../lib/version'
import {
  GENRE_OPTIONS,
  type ProjectStatus, type CreateProjectInput,
} from '../lib/types'
import { useDomainT } from '../i18n'

// 按 group 分组
const GENRE_GROUPS = Array.from(
  GENRE_OPTIONS.reduce((map, opt) => {
    if (!map.has(opt.group)) map.set(opt.group, [])
    map.get(opt.group)!.push(opt)
    return map
  }, new Map<string, typeof GENRE_OPTIONS[number][]>())
)

const EMPTY_FORM = {
  name: '',
  genre: '',
  genres: [] as string[],
  status: 'drafting' as ProjectStatus,
  description: '',
  targetWordCount: 500000,
}

// 取书名首字作为大字标识
function getGlyph(name: string, fallback: string) {
  return name.replace(/[《》【】「」\s]/g, '').charAt(0) || fallback
}

// 获取字数友好展示
function formatWords(words: number, unit: string) {
  if (words >= 10000) return `${(words / 10000).toFixed(1)} ${unit}`
  return `${words.toLocaleString()}`
}

export default function HomePage() {
  const navigate = useNavigate()
  const { projects, loading, loadProjects, createProject, deleteProject } = useProjectStore()
  const { t, lang } = useDomainT('pages')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [showGenreDropdown, setShowGenreDropdown] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null)

  const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
    { value: 'drafting',  label: t('home.statusDrafting') },
    { value: 'ongoing',   label: t('home.statusOngoing') },
    { value: 'paused',    label: t('home.statusPaused') },
    { value: 'completed', label: t('home.statusCompleted') },
  ]

  useEffect(() => { loadProjects() }, [loadProjects])

  // 从本地文件夹恢复：读回文件夹里所有 storyforge-*.json，各自导入成新项目（不覆盖现有）
  const handleRestoreFromFolder = async () => {
    if (!isFSASupported()) { setRestoreMsg(t('home.restoreUnsupported')) ; return }
    const h = await pickFolder()
    if (!h) return
    setRestoring(true); setRestoreMsg(t('home.restoreReading'))
    try {
      if (!(await ensureFolderPermission(h, false))) { setRestoreMsg(t('home.restoreNoPermission')); return }
      const files = await readStoryforgeBackups(h)
      if (files.length === 0) { setRestoreMsg(t('home.restoreNoFiles')); return }
      let ok = 0
      for (const f of files) {
        try { await importProjectJSON(f.data); ok++ } catch (e) { console.error('[restore] 导入失败', f.name, e) }
      }
      await loadProjects()
      setRestoreMsg(t('home.restoreSuccess', { ok, total: files.length }))
    } catch (e) {
      setRestoreMsg(t('home.restoreFailed', { error: (e as Error).message }))
    } finally {
      setRestoring(false)
    }
  }

  const handleCreate = async () => {
    if (!form.name.trim()) return
    const selectedGenres = form.genres.length > 0 ? form.genres : ['other']
    const id = await createProject({
      name: form.name,
      genre: selectedGenres[0],
      genres: selectedGenres,
      status: form.status,
      description: form.description,
      targetWordCount: form.targetWordCount,
    } as CreateProjectInput)
    setShowCreate(false)
    setForm({ ...EMPTY_FORM })
    navigate(`/workspace/${id}`)
  }

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (deleteConfirm === id) {
      await deleteProject(id)
      setDeleteConfirm(null)
    } else {
      setDeleteConfirm(id)
      // 3 秒后取消
      setTimeout(() => setDeleteConfirm(c => c === id ? null : c), 3000)
    }
  }

  const toggleGenre = (value: string) => {
    setForm(f => ({
      ...f,
      genres: f.genres.includes(value)
        ? f.genres.filter(g => g !== value)
        : [...f.genres, value],
    }))
  }

  const getGenreLabels = (genres: string[]) => {
    if (!genres || genres.length === 0) return t('home.uncategorized')
    return genres
      .slice(0, 3)
      .map(v => {
        const opt = GENRE_OPTIONS.find(o => o.value === v)
        return opt ? t(`project:${opt.labelKey}`) : v
      })
      .join(' · ') + (genres.length > 3 ? ` +${genres.length - 3}` : '')
  }

  const totalWords = projects.reduce((sum, p) => sum + (p.currentWordCount ?? 0), 0)

  return (
    <div className="min-h-screen bg-bg-base" onClick={() => setDeleteConfirm(null)}>
      {/* 新手引导 */}
      <WelcomeGuide onGoSettings={() => navigate('/settings')} />

      {/* ── 顶栏 ──────────────────────────────────────── */}
      <header className="border-b border-border px-8 py-4 flex items-center sticky top-0 bg-bg-base/90 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3">
          {/* 品牌 Flame 图标 */}
          <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
            <Flame className="w-4 h-4 text-accent" />
          </div>
          {/* 衬线斜体 wordmark */}
          <div>
            <span
              className="text-text-primary leading-none"
              style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontStyle: 'italic', letterSpacing: -0.3 }}
            >
              storyforge
            </span>
            <span
              className="text-text-muted ml-2"
              style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', fontStyle: 'normal', fontFamily: 'var(--font-sans)' }}
            >
              {t('home.brandSubtitle')}
            </span>
            <span
              className="ml-2 px-1.5 py-0.5 rounded text-text-muted bg-bg-hover/60"
              style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)' }}
              title={t('home.versionTitle')}
            >
              {APP_BUILD_ID}
            </span>
          </div>
        </div>

        <a
          href="https://github.com/yuanbw2025/storyforge"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors ml-auto"
          title="GitHub"
        >
          <Github className="w-4 h-4" />
        </a>
      </header>

      {/* ── 主体 ──────────────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-8 py-12">
        {/* Hero */}
        <div className="mb-8">
          <div className="sec-eye mb-2">
            {new Date().getFullYear()}{t('home.heroYearSuffix')}
          </div>
          <h1
            className="text-text-primary mb-3"
            style={{ fontFamily: 'var(--font-serif)', fontSize: 40, fontWeight: 400, letterSpacing: -0.6, lineHeight: 1.15 }}
          >
            {projects.length > 0
              ? <Trans i18nKey="home.heroCount" ns="pages" values={{ count: projects.length }} components={{ 1: <strong /> }} />
              : <Trans i18nKey="home.heroFirst" ns="pages" components={{ 1: <strong /> }} />
            }
          </h1>
          {/* 金色分隔线 */}
          <hr className="sf-rule my-4" />
          <div className="flex items-center justify-between">
            <p className="text-text-secondary text-sm">
              {projects.length > 0
                ? t('home.statsWithProjects', { projects: projects.length, words: formatWords(totalWords, t('home.wordUnit')) })
                : t('home.statsEmpty')
              }
            </p>
            <div className="flex items-center gap-2">
              {isFSASupported() && (
                <button
                  onClick={handleRestoreFromFolder}
                  disabled={restoring}
                  title={t('home.restoreButtonTitle')}
                  className="px-3 py-2 border border-border text-text-secondary rounded-lg hover:bg-bg-hover hover:text-text-primary transition-colors text-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
                  {t('home.restoreButton')}
                </button>
              )}
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium flex items-center gap-1.5"
              >
                {t('home.createButton')}
              </button>
            </div>
          </div>
          {restoreMsg && (
            <p className="text-xs text-text-muted mt-2 text-right">{restoreMsg}</p>
          )}
        </div>

        {/* ── 项目列表 ───────────────────────────────── */}
        <div>
          {loading ? (
            <div className="py-16 text-center text-text-muted text-sm">{t('home.loading')}</div>
          ) : projects.length === 0 ? (
            <div
              className="py-16 text-center border border-dashed border-border rounded-xl cursor-pointer hover:border-accent/50 transition-colors group"
              onClick={() => setShowCreate(true)}
            >
              <div className="text-text-muted group-hover:text-accent transition-colors"
                   style={{ fontFamily: 'var(--font-serif)', fontSize: 40, fontWeight: 400, marginBottom: 8 }}>
                +
              </div>
              <p className="text-text-secondary text-sm">{t('home.emptyCreateHint')}</p>
            </div>
          ) : (
            <>
              {projects.map((project) => {
                const glyph = getGlyph(project.name, t('home.defaultGlyph'))
                const genres = project.genres?.length ? project.genres : project.genre ? [project.genre] : ['other']
                const isDeleting = deleteConfirm === project.id
                return (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/workspace/${project.id}`)}
                    className="flex items-center gap-5 py-5 border-b border-border cursor-pointer group transition-all hover:px-2 hover:rounded-lg hover:border-transparent hover:bg-bg-hover"
                    style={{ marginLeft: -8, marginRight: -8, paddingLeft: 8, paddingRight: 8 }}
                  >
                    {/* 首字大字 */}
                    <div
                      className="flex-shrink-0 text-text-muted group-hover:text-accent transition-colors"
                      style={{ fontFamily: 'var(--font-serif)', fontSize: 34, fontWeight: 400, width: 44, textAlign: 'center', lineHeight: 1 }}
                    >
                      {glyph}
                    </div>

                    {/* 主信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="text-text-primary font-medium"
                          style={{ fontFamily: 'var(--font-serif)', fontSize: 17 }}
                        >
                          {project.name}
                        </span>
                        {project.status && project.status !== 'drafting' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-text-muted">
                            {STATUS_OPTIONS.find(o => o.value === project.status)?.label ?? project.status}
                          </span>
                        )}
                      </div>
                      <div className="text-text-muted text-xs">
                        {genres.slice(0, 2).map(g => {
                          const opt = GENRE_OPTIONS.find(o => o.value === g)
                          return opt ? t(`project:${opt.labelKey}`) : g
                        }).join(' · ')}
                        {project.description && <> · <span className="truncate">{project.description.slice(0, 30)}</span></>}
                      </div>
                    </div>

                    {/* 字数 */}
                    <div className="text-right flex-shrink-0">
                      <div
                        className="text-text-primary"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontFeatureSettings: '"tnum"' }}
                      >
                        {formatWords(project.currentWordCount ?? 0, t('home.wordUnit'))}
                      </div>
                      <div className="text-text-muted text-xs mt-0.5">
                        {new Date(project.updatedAt).toLocaleDateString(lang, { month: 'short', day: 'numeric' })}
                      </div>
                    </div>

                    {/* 删除按钮 */}
                    <button
                      onClick={(e) => handleDelete(e, project.id!)}
                      className={`flex-shrink-0 px-2.5 py-1 rounded text-xs transition-all ${
                        isDeleting
                          ? 'bg-error/20 text-error opacity-100'
                          : 'opacity-0 group-hover:opacity-100 text-text-muted hover:text-error'
                      }`}
                      title={isDeleting ? t('home.deleteConfirmTitle') : t('home.deleteTitle')}
                    >
                      {isDeleting ? t('home.deleteConfirmLabel') : t('home.deleteLabel')}
                    </button>

                    <ChevronRight className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                  </div>
                )
              })}

              {/* 新建行 */}
              <div
                className="flex items-center gap-5 py-4 text-text-muted cursor-pointer group hover:text-accent transition-colors"
                onClick={() => setShowCreate(true)}
              >
                <div className="w-11 h-8 flex items-center justify-center border border-dashed border-border rounded group-hover:border-accent transition-colors" style={{ fontSize: 18 }}>
                  +
                </div>
                <span className="text-sm">{t('home.newRowLabel')}</span>
              </div>
            </>
          )}
        </div>
      </main>

      {/* ── 创建项目对话框 ──── */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-bg-surface border border-border rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3
                className="text-text-primary"
                style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 400, letterSpacing: -0.3 }}
              >
                {t('home.createDialogTitle')}
              </h3>
              <button onClick={() => setShowCreate(false)} className="p-1 text-text-muted hover:text-text-primary rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 书名 */}
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">{t('home.nameLabel')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder={t('home.namePlaceholder')}
                  className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors text-sm"
                  autoFocus
                />
              </div>

              {/* 流派（多选） */}
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">
                  {t('home.genreLabel')}
                  {form.genres.length > 0 && <span className="ml-1.5 text-accent">{' '}{t('home.genreSelected', { count: form.genres.length })}</span>}
                </label>
                {form.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {form.genres.map(g => {
                      const opt = GENRE_OPTIONS.find(o => o.value === g)
                      return (
                        <span key={g} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                          {opt?.label ?? g}
                          <button onClick={() => toggleGenre(g)} className="hover:text-error"><X className="w-2.5 h-2.5" /></button>
                        </span>
                      )
                    })}
                  </div>
                )}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowGenreDropdown(!showGenreDropdown)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text-secondary hover:border-accent/50 focus:outline-none transition-colors"
                  >
                    <span>{form.genres.length > 0 ? getGenreLabels(form.genres) : t('home.genreSelectPlaceholder')}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showGenreDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showGenreDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-bg-surface border border-border rounded-lg shadow-lg z-30 max-h-60 overflow-y-auto">
                      {GENRE_GROUPS.map(([group, opts]) => (
                        <div key={group}>
                          <div className="px-3 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-bg-elevated border-b border-border/50">{t(`project:${opts[0]?.groupKey ?? ''}`) || group}</div>
                          <div className="flex flex-wrap gap-1 p-2">
                            {opts.map(opt => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => toggleGenre(opt.value)}
                                className={`text-xs px-2 py-1 rounded transition-colors ${
                                  form.genres.includes(opt.value)
                                    ? 'bg-accent text-white'
                                    : 'bg-bg-base text-text-secondary hover:bg-bg-hover'
                                }`}
                              >
                                {t(`project:${opt.labelKey}`)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 写作状态 */}
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">{t('home.statusLabel')}</label>
                <div className="flex gap-2 flex-wrap">
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, status: opt.value }))}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors border ${
                        form.status === opt.value
                          ? 'bg-accent/10 text-accent border-accent/40'
                          : 'border-border text-text-muted hover:border-border-hover'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 简介 */}
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">{t('home.descriptionLabel')}</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder={t('home.descriptionPlaceholder')}
                  rows={2}
                  className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors resize-none text-sm"
                />
              </div>

              {/* 目标字数 */}
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">
                  {t('home.targetWordsLabel', { value: (form.targetWordCount / 10000).toFixed(0) })}
                </label>
                <input
                  type="range" min={100000} max={5000000} step={100000}
                  value={form.targetWordCount}
                  onChange={e => setForm({ ...form, targetWordCount: Number(e.target.value) })}
                  className="w-full accent-accent"
                />
                <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                  <span>{t('home.rangeMin')}</span><span>{t('home.rangeMid')}</span><span>{t('home.rangeMax')}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors text-sm"
              >
                {t('home.cancel')}
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.name.trim()}
                className="px-5 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium text-sm"
              >
                {t('home.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { BookOpenText, Check, Plus, Trash2, X } from 'lucide-react'
import type { Work } from '../../lib/types/world-ownership'
import { createWorldWork, listWorldWorks, switchActiveWork } from '../../lib/world-engine/works'
import { deleteWork } from '../../lib/world-engine/lifecycle'
import { useDialog } from '../shared/Dialog'
import { useDomainT } from '../../i18n'
import { projectCanonicalLabel } from '../../i18n/display-projection'

interface Props {
  projectId: number
  activeWorkId?: number | null
  onChanged: () => Promise<void> | void
}

/**
 * worldWork.* 只准备了 drafting 的显示键；其余历史状态按 display-projection 的
 * ora-2 契约原样展示持久化值，绝不泄漏原始 i18n key。
 */
const WORLD_WORK_STATUS_LABEL_KEYS: Record<string, string> = {
  drafting: 'worldWork.statusDrafting',
}

export default function WorldWorkManager({ projectId, activeWorkId, onChanged }: Props) {
  const dialog = useDialog()
  const { t } = useDomainT('worldview')
  const [works, setWorks] = useState<Work[]>([])
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setWorks(await listWorldWorks(projectId))
  }, [projectId])

  useEffect(() => { void reload() }, [reload])

  const choose = async (workId: number) => {
    if (workId === activeWorkId || busy) return
    setBusy(true); setError('')
    try {
      await switchActiveWork(projectId, workId)
      await onChanged()
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('worldWork.switchFailedError'))
    } finally { setBusy(false) }
  }

  const create = async () => {
    if (!title.trim() || busy) return
    setBusy(true); setError('')
    try {
      const work = await createWorldWork(projectId, { title })
      await switchActiveWork(projectId, work.id!)
      setTitle(''); setCreating(false)
      await onChanged()
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('worldWork.createFailedError'))
    } finally { setBusy(false) }
  }

  const remove = async (work: Work) => {
    if (!work.id || works.length <= 1 || busy) return
    const confirmed = await dialog.confirm({
      title: t('worldWork.deleteConfirmTitle', { title: work.title }),
      message: t('worldWork.deleteConfirmMessage'),
      confirmText: t('common:delete'),
      tone: 'danger',
    })
    if (!confirmed) return
    setBusy(true); setError('')
    try {
      await deleteWork(work.id)
      await onChanged()
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('worldWork.deleteFailedError'))
    } finally { setBusy(false) }
  }

  return (
    <section className="sf-world-work-manager" aria-label={t('worldWork.ariaLabel')}>
      <div className="sf-world-work-heading">
        <div><span className="sf-card-kicker"><BookOpenText className="h-4 w-4" /> {t('worldWork.heading')}</span><h3>{t('worldWork.subtitle')}</h3></div>
        <button className="sf-icon-button" onClick={() => setCreating(value => !value)} title={creating ? t('worldWork.cancelCreate') : t('worldWork.create')} aria-label={creating ? t('worldWork.cancelCreate') : t('worldWork.create')}>
          {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
      {creating && <div className="sf-world-work-create"><input value={title} onChange={event => setTitle(event.target.value)} placeholder={t('worldWork.namePlaceholder')} autoFocus onKeyDown={event => { if (event.key === 'Enter') void create() }} /><button className="sf-icon-button" onClick={() => void create()} disabled={!title.trim() || busy} title={t('worldWork.createAndSwitch')} aria-label={t('worldWork.createAndSwitch')}><Check className="h-4 w-4" /></button></div>}
      <div className="sf-world-work-list">
        {works.map(work => <div key={work.id} className={`sf-world-work-row ${work.id === activeWorkId ? 'active' : ''}`}><button onClick={() => void choose(work.id!)} disabled={busy}><span><strong>{work.title}</strong><small>{projectCanonicalLabel(t, WORLD_WORK_STATUS_LABEL_KEYS, work.status)}</small></span>{work.id === activeWorkId && <Check className="h-4 w-4" />}</button><button className="sf-icon-button" onClick={() => void remove(work)} disabled={busy || works.length <= 1} title={t('worldWork.deleteButtonTitle')} aria-label={t('worldWork.deleteAria', { title: work.title })}><Trash2 className="h-3.5 w-3.5" /></button></div>)}
      </div>
      {error && <p className="sf-world-work-error">{error}</p>}
    </section>
  )
}

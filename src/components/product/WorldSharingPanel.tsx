import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Download, FileJson, Loader2, ShieldCheck, Share2, Upload,
} from 'lucide-react'
import type { CommunityWorldLicense, Project, WorldRelease } from '../../lib/types'
import {
  createWorldPackage,
  createWorldPackageV2,
  downloadWorldPackage,
  importWorldPackage,
  inspectWorldPackage,
  type WorldPackageTrustReport,
  type WorldPackageUse,
} from '../../lib/product/world-package'
import { useDomainT } from '../../i18n'
import { resolveWorkspaceScope } from '../../lib/world-engine/ownership'
import { listWorldReleases } from '../../lib/world-engine/releases'

const LICENSE_KEY_BY_VALUE = {
  'CC-BY-4.0': 'license.ccBy4',
  'CC-BY-SA-4.0': 'license.ccBySa4',
  'CC-BY-NC-4.0': 'license.ccByNc4',
  'ALL-RIGHTS-RESERVED': 'license.allRightsReserved',
} as const satisfies Record<CommunityWorldLicense, string>

const USE_KEY_BY_ID = {
  writing: 'use.writing',
  ttrpg: 'use.ttrpg',
  characterChat: 'use.characterChat',
  textGame: 'use.textGame',
} as const satisfies Record<WorldPackageUse, string>

interface Props {
  project?: Project
  onImported?: (projectId: number) => void
}

type Preview = { input: unknown; report: WorldPackageTrustReport }

export default function WorldSharingPanel({ project, onImported }: Props) {
  const { t, lang } = useDomainT('product')
  const fileRef = useRef<HTMLInputElement>(null)
  const [authorName, setAuthorName] = useState('')
  const [license, setLicense] = useState<CommunityWorldLicense>('CC-BY-4.0')
  const [allowedUses, setAllowedUses] = useState<Record<WorldPackageUse, boolean>>({
    writing: true, ttrpg: true, characterChat: true, textGame: true,
  })
  const [warnings, setWarnings] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [latestRelease, setLatestRelease] = useState<WorldRelease | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!project?.id) {
      setLatestRelease(null)
      return
    }
    void resolveWorkspaceScope(project.id)
      .then(scope => listWorldReleases(scope))
      .then(releases => { if (!cancelled) setLatestRelease(releases[0] ?? null) })
      .catch(() => { if (!cancelled) setLatestRelease(null) })
    return () => { cancelled = true }
  }, [project?.id, project?.worldVersion, project?.activeWorldId, project?.activeWorkId])

  const licenseOptions = [
    { value: 'CC-BY-4.0' as const, label: t(LICENSE_KEY_BY_VALUE['CC-BY-4.0']) },
    { value: 'CC-BY-SA-4.0' as const, label: t(LICENSE_KEY_BY_VALUE['CC-BY-SA-4.0']) },
    { value: 'CC-BY-NC-4.0' as const, label: t(LICENSE_KEY_BY_VALUE['CC-BY-NC-4.0']) },
    { value: 'ALL-RIGHTS-RESERVED' as const, label: t(LICENSE_KEY_BY_VALUE['ALL-RIGHTS-RESERVED']) },
  ]

  const useOptions = [
    { id: 'writing' as const, label: t(USE_KEY_BY_ID.writing) },
    { id: 'ttrpg' as const, label: t(USE_KEY_BY_ID.ttrpg) },
    { id: 'characterChat' as const, label: t(USE_KEY_BY_ID.characterChat) },
    { id: 'textGame' as const, label: t(USE_KEY_BY_ID.textGame) },
  ]

  const publish = async () => {
    if (!project?.id) return
    setBusy(true); setMessage(null)
    try {
      const options = {
        authorName,
        license,
        allowedUses,
        contentWarnings: warnings.split(/[，,\n]/),
      }
      const pkg = latestRelease?.id
        ? await createWorldPackageV2(latestRelease.id, options)
        : await createWorldPackage(project.id, options)
      downloadWorldPackage(pkg, `storyforge-world-${pkg.manifest.sourceWorldCode}-v${pkg.manifest.sourceWorldVersion}.json`)
      setMessage(t('publish.successMessage'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('publish.generateFailed'))
    } finally { setBusy(false) }
  }

  const choosePackage = async (file: File) => {
    setBusy(true); setMessage(null)
    try {
      const input: unknown = JSON.parse(await file.text())
      const report = await inspectWorldPackage(input)
      setPreview({ input, report })
      if (!report.valid) setMessage(new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }).format(report.errors))
    } catch (error) {
      setPreview(null)
      const reason = error instanceof Error ? error.message : t('inspect.jsonFormatError')
      setMessage(t('inspect.readFailed', { message: reason }))
    } finally { setBusy(false) }
  }

  const importPackage = async () => {
    if (!preview?.report.valid) return
    setBusy(true); setMessage(null)
    try {
      const id = await importWorldPackage(preview.input)
      setMessage(t('import.successMessage'))
      onImported?.(id)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('import.failed'))
    } finally { setBusy(false) }
  }

  return (
    <section className="sf-world-sharing" aria-label={t('panel.ariaLabel')}>
      <div className="sf-section-header">
        <div>
          <div className="sf-eyebrow">LOCAL PUBLISHING</div>
          <h2>{t('panel.title')}</h2>
        </div>
        <span className="sf-product-status-chip"><ShieldCheck className="h-3.5 w-3.5" />{t('panel.statusChip')}</span>
      </div>
      <div className="sf-sharing-grid">
        <div className="sf-sharing-column">
          <div className="sf-sharing-title"><Share2 className="h-4 w-4" /><strong>{t('panel.exportTitle')}</strong></div>
          <p>{t('panel.exportDesc')}</p>
          <label className="sf-sharing-label">{t('panel.authorLabel')}<input value={authorName} onChange={event => setAuthorName(event.target.value)} placeholder={t('panel.authorPlaceholder')} /></label>
          <label className="sf-sharing-label">{t('panel.licenseLabel')}<select value={license} onChange={event => setLicense(event.target.value as CommunityWorldLicense)}>{licenseOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <fieldset className="sf-sharing-fieldset"><legend>{t('panel.allowedUsesLegend')}</legend><div className="sf-sharing-checks">{useOptions.map(option => <label key={option.id}><input type="checkbox" checked={allowedUses[option.id]} onChange={event => setAllowedUses(previous => ({ ...previous, [option.id]: event.target.checked }))} />{option.label}</label>)}</div></fieldset>
          <label className="sf-sharing-label">{t('panel.warningsLabel')}<input value={warnings} onChange={event => setWarnings(event.target.value)} placeholder={t('panel.warningsPlaceholder')} /></label>
          <button className="sf-button sf-button-primary" onClick={() => void publish()} disabled={busy || !project?.id || !authorName.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{t('panel.downloadButton')}
          </button>
        </div>
        <div className="sf-sharing-column sf-sharing-import">
          <div className="sf-sharing-title"><FileJson className="h-4 w-4" /><strong>{t('panel.importTitle')}</strong></div>
          <p>{t('panel.importDesc')}</p>
          <button className="sf-button sf-button-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="h-4 w-4" />{t('panel.chooseButton')}
          </button>
          <input ref={fileRef} className="sf-sharing-file" type="file" accept="application/json,.json" aria-label={t('panel.chooseFileAria')} onChange={event => { const file = event.target.files?.[0]; if (file) void choosePackage(file); event.target.value = '' }} />
          {preview && <WorldPackagePreview preview={preview} busy={busy} onImport={() => void importPackage()} useOptions={useOptions} />}
        </div>
      </div>
      {message && <p className="sf-product-message" role="status">{message}</p>}
    </section>
  )
}

function WorldPackagePreview({ preview, busy, onImport, useOptions }: { preview: Preview; busy: boolean; onImport: () => void; useOptions: Array<{ id: WorldPackageUse; label: string }> }) {
  const { t, lang } = useDomainT('product')
  const listFormat = useMemo(() => new Intl.ListFormat(lang, { type: 'conjunction', style: 'short' }), [lang])
  const { report } = preview
  const manifest = report.manifest
  return (
    <div className={`sf-sharing-preview ${report.valid ? 'sf-sharing-preview-valid' : 'sf-sharing-preview-invalid'}`} data-testid="world-package-preview">
      <div className="sf-sharing-preview-heading">{report.valid ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}<strong>{report.valid ? t('preview.passed') : t('preview.failed')}</strong></div>
      {manifest && <div className="sf-sharing-preview-meta"><strong>{manifest.name}</strong><span>{manifest.sourceWorldCode} · v{manifest.sourceWorldVersion}</span><span>{t('preview.author', { name: manifest.authorName, license: manifest.license })}</span><span>{t('preview.uses', { uses: listFormat.format(useOptions.filter(option => manifest.allowedUses[option.id]).map(option => option.label)) })}</span>{manifest.contentWarnings.length > 0 && <span>{t('preview.warnings', { warnings: listFormat.format(manifest.contentWarnings) })}</span>}</div>}
      {report.errors.map(error => <p key={error} className="sf-sharing-error">{error}</p>)}
      {report.warnings.map(warning => <p key={warning} className="sf-sharing-warning">{warning}</p>)}
      {report.valid && <button className="sf-button sf-button-primary" onClick={onImport} disabled={busy}><ShieldCheck className="h-4 w-4" />{t('preview.confirmImport')}</button>}
    </div>
  )
}

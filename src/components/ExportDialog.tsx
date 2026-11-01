import { useEffect, useMemo, useRef, useState } from 'react'
import { parseWeldJob } from '../export/fromWeldJob'
import type { WeldJob } from '../export/schema'
import { formatJob, toWeldJob } from '../export/toWeldJob'
import { validateJob, type Issue } from '../export/validate'
import { useStore } from '../store/useStore'
import { formatDuration, formatLength } from '../ui/format'

const PREVIEW_CHARS = 200_000

const docStamp = (d = new Date()) => `DOC . ${String(d.getDate()).padStart(2, '0')} . ${String(d.getMonth() + 1).padStart(2, '0')} . ${String(d.getFullYear()).slice(2)}`

export default function ExportDialog() {
  const dialog = useRef<HTMLDialogElement>(null)
  const part = useStore((s) => s.part)
  const seams = useStore((s) => s.seams)
  const job = useStore((s) => s.job)
  const { setExportOpen, setJob, selectSeam, importJob } = useStore.getState()
  const [copied, setCopied] = useState(false)
  const [importState, setImportState] = useState<{ message: string; job?: WeldJob } | null>(null)

  // No close() on cleanup: it fires `close`, whose handler would flip exportOpen back off
  // (StrictMode re-runs effects). Unmounting an open <dialog> already leaves the top layer.
  useEffect(() => {
    const d = dialog.current!
    if (!d.open) d.showModal()
  }, [])

  const weldJob = useMemo(() => (part ? toWeldJob({ part, seams, job }) : null), [part, seams, job])
  const issues = useMemo(() => (weldJob && part ? validateJob(weldJob, { units: part.units, nonManifold: part.nonManifold }) : []), [weldJob, part])
  const json = useMemo(() => (weldJob ? formatJob(weldJob) : ''), [weldJob])
  if (!part || !weldJob) return null

  const errors = issues.filter((i) => i.level === 'error')
  const fileName = `${weldJob.name.replace(/[^\w.-]+/g, '-') || 'weld'}-weldjob.json`

  const close = () => {
    setExportOpen(false)
    requestAnimationFrame(() => document.getElementById('export-btn')?.focus())
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // no clipboard permission (or plain http): select the preview so Ctrl+C works
      const pre = dialog.current?.querySelector('pre')
      if (pre) getSelection()?.selectAllChildren(pre)
    }
  }
  const goTo = (issue: Issue) => {
    close()
    if (issue.seamId) selectSeam(issue.seamId)
    setTimeout(() => document.getElementById(`f-${issue.field ?? 'name'}`)?.focus(), 60)
  }
  const runImport = (job: WeldJob, force = false) => {
    const r = importJob(job, force)
    if (r.ok) close()
    else setImportState({ message: r.error, job: r.mismatch ? job : undefined })
  }
  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    try {
      runImport(parseWeldJob(await file.text()))
    } catch (e) {
      setImportState({ message: `Could not import ${file.name}. ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  return (
    <dialog ref={dialog} className="export-dialog" aria-labelledby="export-title" onClose={close} onCancel={close}>
      <header className="dialog-head">
        <h2 id="export-title" className="panel-title">
          Export weld job
        </h2>
        <span className="doc-stamp">{docStamp()}</span>
        <button type="button" className="icon-btn" onClick={close} aria-label="Close">
          ×
        </button>
      </header>

      <div className="job-fields">
        <label className="field">
          <span className="field-label">Job name</span>
          <input value={job.name} placeholder={part.name.replace(/\.stl$/i, '')} onChange={(e) => setJob({ name: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Operator</span>
          <input value={job.operator} placeholder="Who prepared it" onChange={(e) => setJob({ operator: e.target.value })} />
        </label>
        <label className="field field-wide">
          <span className="field-label">Job notes</span>
          <input value={job.notes} placeholder="Fixture, material, anything the cell needs to know" onChange={(e) => setJob({ notes: e.target.value })} />
        </label>
      </div>

      <p className="job-summary">
        {weldJob.summary.seamCount} {weldJob.summary.seamCount === 1 ? 'seam' : 'seams'} · {formatLength(weldJob.summary.totalLengthMm, 'mm')}
        {weldJob.summary.seamCount > 1 && ` · air ${formatLength(weldJob.summary.airTravelMm, 'mm')}`} · est.{' '}
        {formatDuration(weldJob.summary.estimatedTimeS)} · coordinates in mm, part frame, Z up
      </p>

      {issues.length > 0 && (
        <ul className="issues" aria-label="Validation">
          {issues.map((issue, i) => (
            <li key={i} className={`issue is-${issue.level}`}>
              <button type="button" className="issue-btn" onClick={() => goTo(issue)} disabled={!issue.seamId && !issue.field && issue.level === 'warning'}>
                <span className="issue-level">{issue.level === 'error' ? 'Error' : 'Warning'}</span> {issue.message}
              </button>
            </li>
          ))}
        </ul>
      )}

      <pre className="json-preview" tabIndex={0} aria-label="JSON preview">
        {json.length > PREVIEW_CHARS ? `${json.slice(0, PREVIEW_CHARS)}\n… preview truncated; the download has everything` : json}
      </pre>

      {importState && (
        <div className="import-msg" role="alert">
          <span>{importState.message}</span>
          {importState.job && (
            <button type="button" className="btn-ghost btn-small" onClick={() => runImport(importState.job!, true)}>
              Import anyway
            </button>
          )}
        </div>
      )}

      <footer className="dialog-actions">
        <label className="btn-ghost btn-small file-btn" title="Load a weld job exported earlier for this part">
          Import…
          <input
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            onChange={(e) => {
              void onImportFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        <span className="dialog-spacer" />
        {errors.length > 0 && (
          <span className="block-reason">
            {errors.length} {errors.length === 1 ? 'error blocks' : 'errors block'} the download
          </span>
        )}
        <button type="button" className="btn-ghost btn-small" onClick={copy}>
          {copied ? 'Copied' : 'Copy JSON'}
        </button>
        <button type="button" className="btn-primary" onClick={download} disabled={errors.length > 0} title={`Download ${fileName}`}>
          <span className="btn-label">Download {fileName}</span> <span aria-hidden="true">→</span>
        </button>
      </footer>
    </dialog>
  )
}

import { useState } from 'react'
import type { PlanDocument } from '../storage/types'

const README = 'https://github.com/arnavXgupta/Armatrix'

type Props = {
  onFile: (file: File) => void
  error?: string | null
  busy?: boolean
  savedPlan?: PlanDocument | null
  onDiscardSaved?: () => void
}

export default function DropZone({ onFile, error, busy, savedPlan, onDiscardSaved }: Props) {
  const [over, setOver] = useState(false)
  const seams = savedPlan?.job.seams.length ?? 0

  return (
    <label
      className={['dropzone', over && 'is-over', busy && 'is-busy'].filter(Boolean).join(' ')}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault() // also tells the window-level drop guard this drop is handled
        setOver(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      <input
        type="file"
        accept=".stl"
        className="visually-hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = '' // let the same file be picked again
        }}
      />
      <span className="dropzone-body">
        <img src="/brand/logo-mark-sand.svg" alt="" width={88} />
        {savedPlan ? (
          <>
            <span className="dropzone-cta">Drop {savedPlan.job.part.fileName} again</span>
            <span className="dropzone-hint">
              Your plan ({seams} {seams === 1 ? 'seam' : 'seams'}, saved {new Date(savedPlan.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })})
              is here, but this browser no longer has the part file. Drop the same .stl to restore it.
            </span>
            <button
              type="button"
              className="link-btn dropzone-discard"
              onClick={(e) => {
                e.preventDefault() // a click inside the label would otherwise open the file picker
                onDiscardSaved?.()
              }}
            >
              Discard the saved plan
            </button>
          </>
        ) : (
          <>
            <span className="dropzone-cta">Drop an .stl or click to browse</span>
            <span className="dropzone-hint">Binary or ASCII, up to 250 MB. Read in your browser; nothing is uploaded.</span>
            <span className="dropzone-hint dropzone-links">
              <a href={`${README}#how-seam-detection-works`} target="_blank" rel="noreferrer">
                How it works
              </a>
              {' · '}
              <a href={`${README}#weld-job-json`} target="_blank" rel="noreferrer">
                Export schema
              </a>
            </span>
          </>
        )}
        {error && (
          <span className="dropzone-error" role="alert">
            {error}
          </span>
        )}
      </span>
    </label>
  )
}

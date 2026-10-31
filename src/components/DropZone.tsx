import { useState } from 'react'

type Props = { onFile: (file: File) => void; error?: string | null; busy?: boolean }

export default function DropZone({ onFile, error, busy }: Props) {
  const [over, setOver] = useState(false)

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
        <span className="dropzone-cta">Drop an .stl or click to browse</span>
        <span className="dropzone-hint">Binary or ASCII, up to 250 MB. Read in your browser; nothing is uploaded.</span>
        {error && (
          <span className="dropzone-error" role="alert">
            {error}
          </span>
        )}
      </span>
    </label>
  )
}

import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'

const KEYS: [string, string][] = [
  ['Click', 'Add the edge under the pointer as a seam, or select its seam'],
  ['Shift + click', 'Join an edge onto the selected seam'],
  ['M', 'Switch between picking edges and drawing a manual seam'],
  ['Enter · double-click', 'Finish the manual seam'],
  ['Backspace', 'Remove the last manual point'],
  ['Esc', 'Cancel the manual seam, the prompt, or the selection'],
  ['↑ ↓', 'Select the previous or next seam'],
  ['Shift + ↑ ↓', 'Move the selected seam earlier or later in the weld order'],
  ['F', 'Flip the selected seam’s direction'],
  ['Del', 'Delete the selected seam'],
  ['R', 'Fit the part in view'],
  ['F2 · double-click', 'Rename a seam in the list'],
  ['Drag · right-drag · wheel', 'Orbit · pan · zoom'],
  ['?', 'This list'],
]

export default function ShortcutsHelp() {
  const open = useStore((s) => s.helpOpen)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialog.current!
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={dialog} className="help-dialog" aria-labelledby="help-title" onClose={() => setHelpOpen(false)}>
      <header className="dialog-head">
        <h2 id="help-title" className="panel-title">
          Keyboard and mouse
        </h2>
        <button type="button" className="icon-btn" onClick={() => setHelpOpen(false)} aria-label="Close">
          ×
        </button>
      </header>
      <dl className="keys">
        {KEYS.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  )
}

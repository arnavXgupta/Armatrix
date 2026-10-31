import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'

/** Inline yes/no for actions that would discard seams. "Keep" (the safe answer) takes focus. */
export default function ConfirmBar() {
  const pending = useStore((s) => s.pending)
  const keep = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (pending) keep.current?.focus()
  }, [pending])
  if (!pending) return null
  const { confirmPending, cancelPending } = useStore.getState()
  return (
    <div className="confirm-bar" role="alertdialog" aria-labelledby="confirm-text">
      <p id="confirm-text">{pending.message}</p>
      <button type="button" className="btn-primary btn-small" onClick={confirmPending}>
        {pending.confirm}
      </button>
      <button type="button" ref={keep} className="btn-ghost btn-small" onClick={cancelPending}>
        Keep
      </button>
    </div>
  )
}

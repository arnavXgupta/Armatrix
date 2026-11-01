import { useEffect, useRef, useState } from 'react'
import { seamTimeS } from '../export/toWeldJob'
import type { Units } from '../geometry/parseStl'
import type { Seam } from '../store/seams'
import { airTravel } from '../store/sequence'
import { useStore } from '../store/useStore'
import { formatDuration, formatLength } from '../ui/format'

const known = (u: Units | undefined): u is 'mm' | 'in' | 'm' => u !== undefined && u !== 'unknown'

/** Brand spec card: the plan's totals, under the list header. Times need known units, as in the status bar. */
function Totals({ seams, units }: { seams: Seam[]; units: Units | undefined }) {
  const weld = seams.reduce((t, s) => t + seamTimeS(s, units ?? 'unknown'), 0)
  const rows = [
    ['seams', 'Seams', String(seams.length)],
    ['length', 'Length', formatLength(seams.reduce((t, s) => t + s.length, 0), units)],
    ['weld', 'Weld time', known(units) ? formatDuration(weld) : '—'],
    ['air', 'Air travel', seams.length > 1 ? formatLength(airTravel(seams), units) : '—'],
  ]
  return (
    <section className="totals" aria-label="Plan totals" title="Weld time: arc time plus a start/stop allowance per seam. The status bar's estimate adds the air moves.">
      <p className="totals-head">
        <span className="totals-index">/TOTALS</span>
        <span className="totals-tag">Weld job</span>
      </p>
      <dl className="totals-grid">
        {rows.map(([k, label, value]) => (
          <div key={k} data-total={k}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default function SeamList() {
  const seams = useStore((s) => s.seams)
  const selected = useStore((s) => s.selectedSeamId)
  const units = useStore((s) => s.part?.units)
  const hasPart = useStore((s) => s.part !== null)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const { selectSeam, renameSeam, moveSeam, removeSeam, undo, redo, orderByNearest } = useStore.getState()
  const [editing, setEditing] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null)
  const dragId = useRef<string | null>(null) // synchronous copy: drag events can outrun a re-render
  const list = useRef<HTMLOListElement>(null)

  // Bring the selected row into view inside the panel only. scrollIntoView would also scroll the page on
  // stacked (tablet/phone) layouts, moving the canvas away from a seam the user just tapped in it.
  useEffect(() => {
    const row = list.current?.querySelector('.is-selected')
    const panel = row?.closest('.panel')
    if (!row || !panel || panel.scrollHeight <= panel.clientHeight) return
    const r = row.getBoundingClientRect(), p = panel.getBoundingClientRect()
    if (r.top < p.top) panel.scrollTop -= p.top - r.top
    else if (r.bottom > p.bottom) panel.scrollTop += r.bottom - p.bottom
  }, [selected])

  return (
    <aside className="panel seams" aria-labelledby="seams-title">
      <div className="panel-head">
        <h2 id="seams-title" className="panel-title">
          Seams {seams.length > 0 && <span className="panel-count">{seams.length}</span>}
        </h2>
        {hasPart && (
          <span className="history-btns">
            <button type="button" className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" aria-keyshortcuts="Control+Z">
              ↶
            </button>
            <button type="button" className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" aria-keyshortcuts="Control+Shift+Z Control+Y">
              ↷
            </button>
          </span>
        )}
      </div>
      {seams.length > 0 && <Totals seams={seams} units={units} />}
      {seams.length === 0 ? (
        <p className="panel-empty">
          {hasPart
            ? 'No seams yet. Click a dark edge in the view to add it, or press M to draw one point by point. List order is weld order.'
            : 'Load a part, then click a detected edge to add it. List order is weld order.'}
        </p>
      ) : (
        <ol ref={list} className="seam-list" aria-label="Weld order">
          {seams.map((s, i) => {
            const cls = ['seam-row', s.id === selected && 'is-selected', drag?.id === s.id && 'is-dragging', drag && drag.over === i && drag.id !== s.id && 'is-drop']
            return (
              <li
                key={s.id}
                className={cls.filter(Boolean).join(' ')}
                draggable={editing !== s.id}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', s.id)
                  e.dataTransfer.effectAllowed = 'move'
                  dragId.current = s.id
                  setDrag({ id: s.id, over: i })
                }}
                onDragOver={(e) => {
                  if (!dragId.current) return // not a row drag (e.g. a file): let the window handle it
                  e.preventDefault()
                  if (drag?.over !== i) setDrag({ id: dragId.current, over: i })
                }}
                onDrop={(e) => {
                  if (!dragId.current) return
                  e.preventDefault() // also keeps the window-level file drop from firing
                  moveSeam(dragId.current, i)
                  dragId.current = null
                  setDrag(null)
                }}
                onDragEnd={() => {
                  dragId.current = null
                  setDrag(null)
                }}
              >
                <span className="seam-grip" aria-hidden="true" />
                {editing === s.id ? (
                  <input
                    className="seam-rename"
                    defaultValue={s.name}
                    aria-label={`Rename ${s.name}`}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => {
                      renameSeam(s.id, e.target.value)
                      setEditing(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') {
                        e.currentTarget.value = s.name
                        e.currentTarget.blur()
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="seam-main"
                    aria-current={s.id === selected ? 'true' : undefined}
                    onClick={() => selectSeam(s.id === selected ? null : s.id)}
                    onDoubleClick={() => setEditing(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'F2') {
                        e.preventDefault()
                        setEditing(s.id)
                      }
                    }}
                    title={`${s.source === 'auto' ? 'Detected edge' : 'Drawn by hand'} · click to select · double-click or F2 to rename · drag to reorder`}
                  >
                    <span className="seam-index">/{String(i + 1).padStart(3, '0')}</span>
                    <span className="seam-name">{s.name}</span>
                    <span className="seam-meta">
                      <span className="seam-spec">
                        {formatLength(s.length, units)} · {s.params.weldType}
                        <span className="seam-proc"> · {s.params.process}</span>
                        {known(units) && ` · ${formatDuration(seamTimeS(s, units))}`}
                      </span>
                      {s.closed && <span className="seam-src">LOOP</span>}
                    </span>
                  </button>
                )}
                <span className="seam-actions">
                  <button type="button" className="icon-btn" onClick={() => moveSeam(s.id, i - 1)} disabled={i === 0} title="Weld earlier (Shift+↑)" aria-label={`Move ${s.name} up`}>
                    ↑
                  </button>
                  <button type="button" className="icon-btn" onClick={() => moveSeam(s.id, i + 1)} disabled={i === seams.length - 1} title="Weld later (Shift+↓)" aria-label={`Move ${s.name} down`}>
                    ↓
                  </button>
                  <button type="button" className="icon-btn" onClick={() => removeSeam(s.id)} title="Delete (Del)" aria-label={`Delete ${s.name}`}>
                    ×
                  </button>
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {seams.length > 1 && (
        <button type="button" className="btn-ghost btn-small order-btn" onClick={orderByNearest} title="Reorder so each seam starts near where the previous one ends; may reverse seams. Ctrl+Z undoes it.">
          Order by nearest
        </button>
      )}
    </aside>
  )
}

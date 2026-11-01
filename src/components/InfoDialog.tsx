import { useEffect, useRef } from 'react'
import { SCHEMA_VERSION } from '../export/schema'
import { SCHEMA_ROWS } from '../export/schemaRows'
import { useStore } from '../store/useStore'

const STEPS: [string, string][] = [
  ['Load a part.', 'Drop an .stl or click to browse. Binary and ASCII both work, up to 250 MB, read in your browser. Check the units in the toolbar: a dashed outline means the app guessed.'],
  ['Find seams.', 'Dark lines on the part are candidate seams: edges sharper than the angle slider, plus every open edge. Lower the angle to see more edges, raise it to see fewer.'],
  ['Pick seams.', 'Hover a line to see its angle and length, click to add it. Shift-click a touching line to extend the selected seam. Where no line fits, press M and click points on the part, then Enter.'],
  ['Set the order.', 'The list is the weld order: drag rows or press Shift + ↑/↓. Numbered chips mark each start; dashed lines show the torch moving between seams, and "Order by nearest" shortens them. F flips a seam, Ctrl + Z undoes.'],
  ['Set parameters.', 'Select a seam to set its weld type, process, speeds, angles, weave and arc settings. "Apply to all fillet seams" copies them to every seam of that type.'],
  ['Export.', 'Open Export, fix any errors it lists, then download the JSON job. Import loads a saved job back onto the same part. The plan autosaves; reload the tab and it is back.'],
]

const DETECTION: [string, string][] = [
  ['Weld vertices.', 'STL repeats every corner per triangle. Corners are snapped to a fine grid so shared corners become one vertex; collapsed and duplicate triangles are dropped.'],
  ['Measure every edge.', 'Each unique edge records the two triangles beside it and the angle between their normals: 0° on a flat area, 90° at a square corner, 180° for an open edge with one triangle.'],
  ['Fix flipped triangles.', 'One triangle wound the wrong way would read as a 180° crease on a flat face. Winding is checked per edge and the normal corrected before measuring.'],
  ['Chain into candidates.', 'Edges at or above the slider angle, plus open edges, are joined into polylines that break at junctions, so a box rim splits at its corners. Chains under 0.5 % of the part diagonal are dropped.'],
  ['Torch direction.', 'Each waypoint gets the bisector of its two face normals, pointing out of the part. Where separate bodies touch, the other body’s surface is used, so the torch never points into a plate.'],
  ['Limits.', 'Scans and smooth parts have no crisp creases, so low angles show facet noise. Manual mode covers seams across a flat face or on a scan.'],
]

const GUARANTEES: [string, string][] = [
  ['Units are always mm,', 'whatever unit the STL was drawn in. part.sourceUnits records the original; inches scale by 25.4, metres by 1000.'],
  ['Coordinates are in the part’s own frame,', 'as in the STL, with no re-centring.'],
  ['Seams are in weld order.', 'order is 1-based and matches the array position.'],
  ['Every waypoint has a direction.', 'n is a unit vector pointing away from the part, for torch approach.'],
  ['The job is tied to its part.', 'part.sha256 is the hash of the exact uploaded bytes; import refuses a different part unless forced.'],
  [`Version ${SCHEMA_VERSION}.`, 'Readers accept any 1.x. A new major version means a breaking change and is refused on import.'],
  ['Rounding.', 'Coordinates and lengths to 0.001 mm, finer for parts under about 100 mm across; normals to 6 decimals.'],
]

const Steps = ({ items }: { items: [string, string][] }) => (
  <ol className="info-steps">
    {items.map(([b, t]) => (
      <li key={b}>
        <b>{b}</b> {t}
      </li>
    ))}
  </ol>
)

/** The two cards behind the drop zone's "How it works · Export schema". Content mirrors README. */
export default function InfoDialog() {
  const info = useStore((s) => s.infoOpen)
  const setInfoOpen = useStore((s) => s.setInfoOpen)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dialog.current!
    if (info && !d.open) d.showModal()
    if (!info && d.open) d.close()
    if (info) d.querySelector('.info-body')?.scrollTo(0, 0)
  }, [info])

  return (
    <dialog ref={dialog} className="info-dialog" aria-labelledby="info-title" onClose={() => setInfoOpen(null)}>
      <header className="dialog-head">
        <h2 id="info-title" className="panel-title">
          {info === 'schema' ? 'Export schema' : 'How it works'}
        </h2>
        <button type="button" className="icon-btn" onClick={() => setInfoOpen(null)} aria-label="Close">
          ×
        </button>
      </header>
      <div className="info-body">
        {info === 'schema' ? (
          <>
            <p>
              One JSON file per job, written for a robot controller. Every field is listed below, generated from the
              same definitions the app exports with.
            </p>
            <h3>What a reader can rely on</h3>
            <ul className="info-list">
              {GUARANTEES.map(([b, t]) => (
                <li key={b}>
                  <b>{b}</b> {t}
                </li>
              ))}
            </ul>
            <h3>Fields</h3>
            <table className="schema-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>Unit</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {SCHEMA_ROWS.map((r) => (
                  <tr key={r.path}>
                    <td>
                      <code>
                        {r.path}
                        {r.opt ? '?' : ''}
                      </code>
                    </td>
                    <td>
                      <code>{r.type}</code>
                    </td>
                    <td>{r.unit}</td>
                    <td>{r.doc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <h3>The workflow</h3>
            <Steps items={STEPS} />
            <h3>How seams are detected</h3>
            <Steps items={DETECTION} />
            <p style={{ marginTop: 12 }}>Press ? in the app for every keyboard and mouse control.</p>
          </>
        )}
      </div>
    </dialog>
  )
}

export default function SeamList() {
  return (
    <aside className="panel seams" aria-labelledby="seams-title">
      <h2 id="seams-title" className="panel-title">Seams</h2>
      <p className="panel-empty">
        No seams yet. Load a part, then click a detected edge to add it. List order is weld order.
      </p>
    </aside>
  )
}

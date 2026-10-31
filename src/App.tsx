import { useEffect } from 'react'
import './App.css'
import DropZone from './components/DropZone'
import SeamDetail from './components/SeamDetail'
import SeamList from './components/SeamList'
import StatusBar from './components/StatusBar'
import Toolbar from './components/Toolbar'
import { useStore } from './store/useStore'
import Viewport from './viewport/Viewport'

export default function App() {
  const part = useStore((s) => s.part)
  const status = useStore((s) => s.status)
  const loadFile = useStore((s) => s.loadFile)
  const loading = status.kind === 'loading'

  useEffect(() => {
    // A file dropped anywhere must never make the browser navigate away from the plan.
    // Outside the drop zone it loads as the new part.
    const over = (e: DragEvent) => e.preventDefault()
    const drop = (e: DragEvent) => {
      if (e.defaultPrevented) return // the drop zone already handled it
      e.preventDefault()
      const file = e.dataTransfer?.files[0]
      if (file) void loadFile(file)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [loadFile])

  return (
    <div className="app">
      <Toolbar />
      <SeamList />
      <main className={loading ? 'viewport is-loading' : 'viewport'} aria-label="3D viewport" aria-busy={loading}>
        {part ? (
          <Viewport />
        ) : (
          <DropZone onFile={(f) => void loadFile(f)} error={status.kind === 'error' ? status.message : null} busy={loading} />
        )}
        {loading && (
          <div className="progress" role="progressbar" aria-valuenow={Math.round((status.progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ transform: `scaleX(${status.progress ?? 0})` }} />
          </div>
        )}
      </main>
      <SeamDetail />
      <StatusBar />
    </div>
  )
}

import { useEffect } from 'react'
import './App.css'
import './seams.css'
import ConfirmBar from './components/ConfirmBar'
import DropZone from './components/DropZone'
import ExportDialog from './components/ExportDialog'
import SeamDetail from './components/SeamDetail'
import SeamList from './components/SeamList'
import ShortcutsHelp from './components/ShortcutsHelp'
import StatusBar from './components/StatusBar'
import Toolbar from './components/Toolbar'
import { storage } from './storage'
import { useStore } from './store/useStore'
import { isTyping } from './ui/typing'
import Viewport from './viewport/Viewport'

export default function App() {
  const part = useStore((s) => s.part)
  const status = useStore((s) => s.status)
  const savedPlan = useStore((s) => s.savedPlan)
  const exportOpen = useStore((s) => s.exportOpen)
  const loadFile = useStore((s) => s.loadFile)
  const loading = status.kind === 'loading'

  useEffect(() => {
    document.title = part ? `${part.name} · Weld Seam Planner` : 'Weld Seam Planner · Armatrix'
  }, [part])

  useEffect(() => {
    // A file dropped anywhere must never make the browser navigate away from the plan.
    // Outside the drop zone it loads as the new part (asking first if seams would be lost).
    const over = (e: DragEvent) => e.preventDefault()
    const drop = (e: DragEvent) => {
      if (e.defaultPrevented) return // the drop zone or the seam list already handled it
      e.preventDefault()
      const file = e.dataTransfer?.files[0]
      if (file) void loadFile(file)
    }
    // ? opens the shortcut list from anywhere except text fields.
    const key = (e: KeyboardEvent) => {
      if (e.key === '?' && !isTyping(e.target)) {
        e.preventDefault()
        useStore.getState().setHelpOpen(!useStore.getState().helpOpen)
      }
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
      window.removeEventListener('keydown', key)
    }
  }, [loadFile])

  const discardSaved = () => {
    useStore.setState({ savedPlan: null })
    void storage.clearPlan()
    void storage.clearFiles()
  }

  return (
    <div className="app">
      <Toolbar />
      <SeamList />
      <main className={loading ? 'viewport is-loading' : 'viewport'} aria-label="3D viewport" aria-busy={loading}>
        {part ? (
          <Viewport />
        ) : (
          <DropZone
            onFile={(f) => void loadFile(f)}
            error={status.kind === 'error' ? status.message : null}
            busy={loading}
            savedPlan={savedPlan}
            onDiscardSaved={discardSaved}
          />
        )}
        {loading && (
          <div className="progress" role="progressbar" aria-valuenow={Math.round((status.progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ transform: `scaleX(${status.progress ?? 0})` }} />
          </div>
        )}
        <ConfirmBar />
      </main>
      <SeamDetail />
      <StatusBar />
      {exportOpen && <ExportDialog />}
      <ShortcutsHelp />
    </div>
  )
}

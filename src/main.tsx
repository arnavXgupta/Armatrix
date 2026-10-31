import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { restoreOnBoot, startAutosave } from './store/persist'
import { useStore } from './store/useStore'

// Errors outside React rendering (event handlers, promises) become a status-bar line, not a dead page.
const report = (message: string) => {
  if (/ResizeObserver loop/.test(message)) return // benign browser notice
  useStore.getState().setNotice(`Something went wrong: ${message}. Your plan is saved.`)
}
window.addEventListener('error', (e) => report(e.error instanceof Error ? e.error.message : e.message))
window.addEventListener('unhandledrejection', (e) => report(e.reason instanceof Error ? e.reason.message : String(e.reason)))

startAutosave()
void restoreOnBoot()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

import { Component, type ReactNode } from 'react'
import { formatJob } from '../export/toWeldJob'
import { PLAN_KEY } from '../storage/local'

/** A render crash shows this instead of a blank page, and the autosaved plan can still be downloaded. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  downloadPlan = () => {
    let text: string | null = null
    try {
      text = localStorage.getItem(PLAN_KEY)
    } catch {
      /* storage blocked */
    }
    if (!text) return alert('No autosaved plan was found.')
    const job = (JSON.parse(text) as { job: unknown }).job
    const url = URL.createObjectURL(new Blob([formatJob(job)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: 'recovered-weldjob.json' }).click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash" role="alert">
        <img src="/brand/logo-mark-sand.svg" alt="Armatrix" width={72} />
        <h1 className="panel-title">Something broke</h1>
        <p>{this.state.error.message}</p>
        <p className="crash-hint">Your plan was autosaved. Reload to pick up where you left off, or download it first.</p>
        <div className="crash-actions">
          <button type="button" className="btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button type="button" className="btn-ghost" onClick={this.downloadPlan}>
            Download plan JSON
          </button>
        </div>
      </div>
    )
  }
}

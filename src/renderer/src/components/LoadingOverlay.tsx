import { useAppStore } from '../store/useAppStore'

export function LoadingOverlay(): React.JSX.Element | null {
  const busy = useAppStore((s) => s.busy)
  const status = useAppStore((s) => s.status)
  if (!busy) return null

  return (
    <div className="load-veil" role="status" aria-live="polite" aria-busy="true">
      <div className="load-plate">
        <span className="stamp">Working</span>
        <div className="load-tape" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <h2>Winding the tape</h2>
        <p>{status}</p>
      </div>
    </div>
  )
}

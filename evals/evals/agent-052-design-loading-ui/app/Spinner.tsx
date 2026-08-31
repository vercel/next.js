export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      {label ? <p>{label}</p> : null}
    </div>
  )
}

export function LayoutSpinner() {
  return (
    <div className="layout-spinner">
      <Spinner label="Loading..." />
    </div>
  )
}

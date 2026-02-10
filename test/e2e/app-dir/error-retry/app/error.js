'use client'

export default function Error({
  error,
  reset,
  retry,
  componentStack,
  ownerStack,
}) {
  return (
    <div>
      <p id="error-message">{error.message}</p>
      <div id="component-stack">{componentStack}</div>
      <div id="owner-stack">{ownerStack}</div>
      <button id="btn-reset" onClick={() => reset()}>
        Reset
      </button>
      <button id="btn-retry" onClick={() => (retry ? retry() : null)}>
        Retry
      </button>
    </div>
  )
}

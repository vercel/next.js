export type ErrorType =
  | 'Build Error'
  | `Runtime ${string}`
  | `Console ${string}`
  | `Recoverable ${string}`
  | 'Blocking Route'
  | 'Ambiguous Metadata'
  | 'Metadata Blocks Loading'
  | 'Viewport Blocks Loading'
  | 'Non-deterministic API'

type ErrorTypeLabelProps = {
  errorType: ErrorType
}

export function ErrorTypeLabel({ errorType }: ErrorTypeLabelProps) {
  return (
    <span
      id="nextjs__container_errors_label"
      className={`nextjs__container_errors_label ${errorType === 'Blocking Route' || errorType === 'Ambiguous Metadata' || errorType === 'Metadata Blocks Loading' || errorType === 'Viewport Blocks Loading' || errorType === 'Non-deterministic API' ? 'nextjs__container_errors_label_blocking_page' : ''}`}
    >
      {errorType}
    </span>
  )
}

export const styles = `
  .nextjs__container_errors_label {
    padding: 2px 6px;
    margin: 0;
    border-radius: var(--rounded-md-2);
    background: var(--color-red-100);
    font-weight: 600;
    font-size: var(--size-12);
    color: var(--color-red-900);
    font-family: var(--font-stack-monospace);
    line-height: var(--size-20);
  }

  .nextjs__container_errors_label_blocking_page {
    background: var(--color-blue-100);
    color: var(--color-blue-900);
  }
`

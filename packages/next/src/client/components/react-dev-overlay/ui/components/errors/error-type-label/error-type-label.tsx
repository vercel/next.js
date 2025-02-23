export type ErrorType =
  | 'Build Error'
  | 'Runtime Error'
  | 'Console Error'
  | 'Unhandled Runtime Error'
  | 'Missing Required HTML Tag'

type ErrorTypeLabelProps = {
  errorType: ErrorType
}

export function ErrorTypeLabel({ errorType }: ErrorTypeLabelProps) {
  return (
    <span
      id="nextjs__container_errors_label"
      className="nextjs__container_errors_label"
    >
      {errorType}
    </span>
  )
}

export const styles = `
  .nextjs__container_errors_label {
    padding: var(--rem-px-2) var(--rem-px-6);
    margin: 0;
    /* used --size instead of --rounded because --rounded is missing 6px */
    border-radius: var(--rem-px-6);
    background: var(--color-red-100);
    font-weight: 600;
    font-size: var(--size-font-11);
    color: var(--color-red-900);
    font-family: var(--font-stack-monospace);
    line-height: var(--rem-px-20);
  }
`

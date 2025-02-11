import { noop as css } from '../../../helpers/noop-template'

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

export const styles = css`
  .nextjs__container_errors_label {
    padding: 2px 6px;
    margin: 0;
    border-radius: 6px;
    background: var(--color-red-100);
    font-weight: 600;
    font-size: var(--size-12px);
    color: var(--color-red-900);
    font-family: var(--font-stack-monospace);
    line-height: var(--size-20px);
  }
`

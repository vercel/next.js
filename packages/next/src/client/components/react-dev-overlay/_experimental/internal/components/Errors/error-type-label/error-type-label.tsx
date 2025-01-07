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
    <h1
      id="nextjs__container_errors_label"
      className="nextjs__container_errors_label"
    >
      {errorType}
    </h1>
  )
}

export const styles = css`
  .nextjs__container_errors_label {
    padding: var(--size-1_5);
    margin: var(--size-gap-double) 0;
    border-radius: var(--rounded-lg);
    background: var(--color-red-100);
    font-weight: 600;
    font-size: var(--size-3);
    color: var(--color-red-900);
    font-family: var(--font-stack-monospace);
    line-height: var(--size-5);
  }
`

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
    padding: var(--size-0_5) var(--size-1_5);
    margin: 0;
    /* used --size instead of --rounded because --rounded is missing 6px */
    border-radius: var(--size-1_5);
    background: var(--color-red-100);
    font-weight: 600;
    font-size: var(--size-font-11);
    color: var(--color-red-900);
    font-family: var(--font-stack-monospace);
    line-height: var(--size-5);
  }
`

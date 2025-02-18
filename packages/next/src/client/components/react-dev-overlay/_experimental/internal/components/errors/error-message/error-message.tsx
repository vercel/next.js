import { noop as css } from '../../../helpers/noop-template'

export type ErrorMessageType = React.ReactNode

type ErrorMessageProps = {
  errorMessage: ErrorMessageType
}

export function ErrorMessage({ errorMessage }: ErrorMessageProps) {
  return (
    <p
      id="nextjs__container_errors_desc"
      className="nextjs__container_errors_desc"
    >
      {errorMessage}
    </p>
  )
}

export const styles = css`
  .nextjs__container_errors_desc {
    margin: 0;
    margin-left: var(--size-1);
    color: var(--color-red-900);
    font-weight: 500;
    font-size: var(--size-font);
    letter-spacing: -0.32px;
    line-height: var(--size-6);
    white-space: pre-wrap;
  }
`

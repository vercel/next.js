import { CopyButton } from '../copy-button'

export function CopyCallStackButton({ error }: { error: Error | undefined }) {
  return (
    <CopyButton
      data-nextjs-data-runtime-error-copy-stack
      actionLabel="Copy error stack"
      successLabel="Copied"
      content={error?.stack || ''}
      disabled={!error?.stack}
    />
  )
}

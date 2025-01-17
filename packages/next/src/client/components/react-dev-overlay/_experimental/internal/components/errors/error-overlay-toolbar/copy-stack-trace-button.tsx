import { CopyButton } from '../../copy-button'

export function CopyStackTraceButton({ error }: { error: Error | undefined }) {
  return (
    <CopyButton
      data-nextjs-data-runtime-error-copy-stack
      className="copy-stack-trace-button"
      actionLabel="Copy Stack Trace"
      successLabel="Stack Trace Copied"
      content={error?.stack || ''}
      disabled={!error?.stack}
    />
  )
}

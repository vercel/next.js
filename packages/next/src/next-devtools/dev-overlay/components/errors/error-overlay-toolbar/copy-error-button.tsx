import { CopyButton } from '../../copy-button'

export function CopyErrorButton({
  error,
  generateErrorInfo,
}: {
  error: Error
  generateErrorInfo: () => Promise<string>
}) {
  return (
    <CopyButton
      data-nextjs-data-runtime-error-copy-stack
      className="copy-error-button"
      actionLabel="Copy Error Info"
      successLabel="Error Info Copied"
      getContent={generateErrorInfo}
      disabled={!error}
    />
  )
}

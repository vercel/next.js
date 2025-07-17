import { CopyButton } from '../../copy-button'

export function CopyErrorButton({
  error,
  generateAIPrompt,
}: {
  error: Error
  generateAIPrompt: () => string
}) {
  return (
    <CopyButton
      data-nextjs-data-runtime-error-copy-stack
      className="copy-error-button"
      actionLabel="Copy AI Debug Prompt"
      successLabel="AI Debug Prompt Copied"
      getContent={generateAIPrompt}
      disabled={!error}
    />
  )
}

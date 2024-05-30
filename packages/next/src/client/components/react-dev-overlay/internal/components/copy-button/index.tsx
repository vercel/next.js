import { useState } from 'react'

enum CopyState {
  Initial = 'initial',
  Success = 'success',
  Pending = 'pending',
  Error = 'error',
}

export function CopyButton({
  label,
  successLabel,
  content,
  ...props
}: React.HTMLProps<HTMLButtonElement> & {
  label: string
  successLabel: string
  content: string
}) {
  const [copyState, setCopyState] = useState(CopyState.Initial)
  const isDisabled = copyState === CopyState.Error
  const title = isDisabled
    ? ''
    : copyState === CopyState.Success
      ? successLabel
      : label
  return (
    <button
      {...props}
      type="button"
      title={title}
      aria-label={title}
      disabled={isDisabled}
      data-nextjs-data-runtime-error-copy-stack
      className={`nextjs-data-runtime-error-copy-stack nextjs-data-runtime-error-copy-stack--${copyState}`}
      onClick={() => {
        if (isDisabled || copyState === CopyState.Pending) return
        if (!navigator.clipboard) {
          setCopyState(CopyState.Error)
          setTimeout(() => setCopyState(CopyState.Initial), 2000)
          return
        }
        setCopyState(CopyState.Pending)
        navigator.clipboard.writeText(content).then(() => {
          setCopyState(CopyState.Success)
          setTimeout(() => setCopyState(CopyState.Initial), 2000)
        })
      }}
    >
      {copyState === CopyState.Success ? <CopySuccessIcon /> : <CopyIcon />}
    </button>
  )
}

function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="transparent"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  )
}

function CopySuccessIcon() {
  return (
    <svg
      height="16"
      xlinkTitle="copied"
      viewBox="0 0 16 16"
      width="16"
      stroke="currentColor"
      fill="currentColor"
    >
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
    </svg>
  )
}

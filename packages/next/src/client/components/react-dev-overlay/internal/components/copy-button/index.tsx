import { useState } from 'react'

export function CopyButton({
  label,
  successLabel,
  content,
  ...props
}: React.HTMLProps<HTMLSpanElement> & {
  label: string
  successLabel: string
  content: string
}) {
  // copied: 0 = not copied, 1 = copied, 2 = error
  const [copied, setCopied] = useState(0)
  const isDisabled = copied === 2
  const title = isDisabled ? '' : copied ? successLabel : label
  return (
    <span
      {...props}
      title={title}
      aria-label={title}
      aria-disabled={isDisabled}
      role="button"
      onClick={() => {
        if (isDisabled) return
        if (!navigator.clipboard) {
          setCopied(2)
          return
        }
        navigator.clipboard.writeText(content).then(() => {
          if (copied) return
          setCopied(1)
          setTimeout(() => setCopied(0), 2000)
        })
      }}
    >
      {copied ? <CopySuccessIcon /> : <CopyIcon />}
    </span>
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
      data-nextjs-data-runtime-error-copy-stack-success
    >
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
    </svg>
  )
}

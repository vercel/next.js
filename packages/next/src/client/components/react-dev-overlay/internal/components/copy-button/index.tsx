export function CopyButton({
  label,
  content,
  ...props
}: React.HTMLProps<HTMLSpanElement> & {
  label?: string
  content: string
}) {
  return (
    <span
      {...props}
      title={label}
      aria-label={label}
      role="button"
      onClick={() => {
        if (!navigator.clipboard) {
          window.console.error(
            'Next.js dev overlay: Clipboard API not available'
          )
          return
        }
        navigator.clipboard.writeText(content)
      }}
    >
      <CopyIcon />
    </span>
  )
}

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
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

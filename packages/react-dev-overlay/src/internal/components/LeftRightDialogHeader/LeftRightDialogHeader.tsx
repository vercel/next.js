import * as React from 'react'

export type LeftRightDialogHeaderProps = {
  className?: string
  previous: () => void | null
  next: () => void | null
  close: () => void
}

const LeftRightDialogHeader: React.FC<LeftRightDialogHeaderProps> = function LeftRightDialogHeader({
  children,
  className,
  previous,
  next,
  close,
}) {
  return (
    <div data-nextjs-dialog-left-right className={className}>
      <nav>
        <button
          type="button"
          disabled={previous == null}
          onClick={previous ?? undefined}
        >
          &larr;
        </button>
        <button
          type="button"
          disabled={next == null}
          onClick={next ?? undefined}
        >
          &rarr;
        </button>
        &nbsp;
        {children}
      </nav>
      <button type="button" onClick={close}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  )
}

export { LeftRightDialogHeader }

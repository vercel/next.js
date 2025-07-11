import React from 'react'

interface DevToolsHeaderProps {
  title: React.ReactNode
  onBack: () => void
  children?: React.ReactNode
}
export function DevToolsHeader({
  title,
  onBack,
  children,
  ref,
}: DevToolsHeaderProps & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div className="dev-tools-info-header" ref={ref}>
      <button
        className="dev-tools-info-close-button"
        onClick={onBack}
        aria-label="Go back"
      >
        <IconChevronLeft />
      </button>
      <h3 className="dev-tools-info-title" style={{ margin: 0 }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function IconChevronLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5.14645 8.70703C4.75595 8.31651 4.75595 7.68349 5.14645 7.29297L10.5 1.93945L11.5605 3L6.56051 8L11.5605 13L10.5 14.0605L5.14645 8.70703Z"
        fill="currentColor"
      />
    </svg>
  )
}

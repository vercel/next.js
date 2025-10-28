import React, { useLayoutEffect, useRef } from 'react'
import { usePanelRouterContext } from '../../../../menu/context'
import { css } from '../../../../utils/css'

interface DevToolsHeaderProps {
  title: React.ReactNode
  children?: React.ReactNode
}
export function DevToolsHeader({
  title,
  children,
  ref,
}: DevToolsHeaderProps & { ref?: React.Ref<HTMLDivElement> }) {
  const { setPanel } = usePanelRouterContext()
  const buttonRef = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    buttonRef.current?.focus()
  }, [])

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 20px',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        borderBottom: '1px solid var(--color-gray-alpha-400)',
      }}
      ref={ref}
    >
      <h3
        style={{
          margin: 0,
          fontSize: '14px',
          color: 'var(--color-text-primary)',
          fontWeight: 'normal',
        }}
      >
        {title}
      </h3>
      {children}
      <button
        ref={buttonRef}
        id="_next-devtools-panel-close"
        className="dev-tools-info-close-button"
        onClick={() => {
          setPanel('panel-selector')
        }}
        aria-label="Close devtools panel"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          color: 'var(--color-gray-900)',
        }}
      >
        <XIcon />
      </button>
      <style>{css`
        .dev-tools-info-close-button:focus-visible {
          outline: var(--focus-ring);
        }
      `}</style>
    </div>
  )
}

function XIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

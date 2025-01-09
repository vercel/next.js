import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'
import { Toast } from '../../Toast'
import React, { useState } from 'react'

// TODO: move away from inline styles, support dark mode, use CSS variables
// TODO: add more comments (to props)
// TODO: test a11y
// TODO: add E2E tests to cover different scenarios

export function DevToolsIndicator({
  hasStaticIndicator,
  readyErrors,
  fullscreen,
  hide,
}: {
  readyErrors: ReadyRuntimeError[]
  fullscreen: () => void
  hide: () => void
  hasStaticIndicator?: boolean
}) {
  return (
    <DevToolsPopover
      onIssuesClick={fullscreen}
      issueCount={readyErrors.length}
      isStaticRoute={hasStaticIndicator === true}
      hide={hide}
    />
  )
}

const DevToolsPopover = ({
  onIssuesClick,
  issueCount,
  isStaticRoute,
  hide,
}: {
  onIssuesClick: () => void
  issueCount: number
  isStaticRoute: boolean
  hide: () => void
}) => {
  // TODO: close when clicking outside

  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const togglePopover = () => setIsPopoverOpen((prev) => !prev)
  return (
    <Toast style={{ boxShadow: 'none' }}>
      <button
        onClick={togglePopover}
        aria-haspopup="true"
        aria-expanded={isPopoverOpen}
        aria-controls="dev-tools-popover"
        style={{
          height: '40px',
          width: '40px',
          backgroundColor: '#18181b',
          overflow: 'hidden',
          color: 'white',
          borderRadius: '50%',
          border: '1px solid transparent',
          padding: 0,
          fontSize: '16px',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
        }}
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#27272a')}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#18181b')}
      >
        N
      </button>
      {isPopoverOpen && (
        <div
          id="dev-tools-popover"
          role="dialog"
          aria-labelledby="dev-tools-title"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '0px',
            width: '260px',
            background: '#FFFFFF',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            boxShadow:
              '0px 1px 1px rgba(0, 0, 0, 0.02), 0px 4px 8px -4px rgba(0, 0, 0, 0.04), 0px 16px 24px -8px rgba(0, 0, 0, 0.06)',
            borderRadius: '12px',
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: 0,
            zIndex: 1000,
            overflow: 'hidden',
          }}
          tabIndex={-1}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '6px',
              width: '260px',
              background: '#FFFFFF',
            }}
          >
            <h2 id="dev-tools-title" style={{ display: 'none' }}>
              Dev Tools Options
            </h2>

            <IndicatorRow
              label="Hide Dev Tools"
              value={
                // TODO: replace with cmd+.for mac, ctrl+. for windows & implement hiding + unhiding logic
                null
              }
              onClick={hide}
            />
            <IndicatorRow
              label="Route"
              value={isStaticRoute ? 'Static' : 'Dynamic'}
            />
            <IndicatorRow
              label="Issues"
              value={<IssueCount count={issueCount} />}
              onClick={issueCount > 0 ? onIssuesClick : undefined}
            />
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '6px',
              gap: '10px',
              width: '260px',
              background: '#FAFAFA',
              borderTop: '1px solid #EBEBEB',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '8px 6px',
                width: '248px',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontFamily: 'Geist Mono',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '11px',
                  lineHeight: '16px',
                  color: '#666666',
                }}
              >
                {/* TODO: replace hardcoded text */}
                Next.js 14.0.1
              </p>
              <p
                style={{
                  margin: 0,
                  fontFamily: 'Geist Mono',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '11px',
                  lineHeight: '16px',
                  color: '#666666',
                }}
              >
                {/* TODO: replace hardcoded text */}
                Turbopack enabled
              </p>
            </div>
          </div>
        </div>
      )}
    </Toast>
  )
}

const IndicatorRow = ({
  label,
  value,
  onClick,
}: {
  label: string
  value: React.ReactNode
  onClick?: () => void
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '8px 6px',
        gap: '8px',
        width: '248px',
        height: '36px',
        borderRadius: '6px',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
      onMouseOver={(e) => {
        if (onClick) {
          e.currentTarget.style.backgroundColor = '#F5F5F5'
        }
      }}
      onMouseOut={(e) => {
        if (onClick) {
          e.currentTarget.style.backgroundColor = 'transparent'
        }
      }}
    >
      <span
        style={{
          fontFamily: 'Geist',
          fontStyle: 'normal',
          fontWeight: 400,
          fontSize: '14px',
          lineHeight: '20px',
          color: '#171717',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'Geist',
          fontStyle: 'normal',
          fontWeight: 400,
          fontSize: '14px',
          lineHeight: '20px',
          color: '#666666',
          marginLeft: 'auto',
          padding: '0 2px',
        }}
      >
        {value}
      </span>
    </div>
  )
}

const IssueCount = ({ count }: { count: number }) => {
  return (
    <span
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        width: '20px',
        height: '20px',
        background: '#E6E6E6',
        borderRadius: '128px',
      }}
    >
      <span
        style={{
          fontFamily: 'Geist',
          fontStyle: 'normal',
          fontWeight: 500,
          fontSize: '11px',
          lineHeight: '16px',
          textAlign: 'center',
          color: count > 0 ? 'var(--color-red-900)' : '#171717',
        }}
      >
        {count}
      </span>
    </span>
  )
}

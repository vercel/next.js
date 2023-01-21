import React from 'react'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import {
  getFrameSource,
  type OriginalStackFrame,
} from '../../helpers/stack-frame'

export const CallStackFrame: React.FC<{ frame: OriginalStackFrame }> =
  function CallStackFrame({ frame }) {
    // TODO: ability to expand resolved frames
    // TODO: render error or external indicator

    const f: StackFrame = frame.originalStackFrame ?? frame.sourceStackFrame
    const hasSource = Boolean(frame.originalCodeFrame)

    const open = React.useCallback(() => {
      if (!hasSource) return

      const params = new URLSearchParams()
      for (const key in f) {
        params.append(key, ((f as any)[key] ?? '').toString())
      }

      self
        .fetch(
          `${
            process.env.__NEXT_ROUTER_BASEPATH || ''
          }/__nextjs_launch-editor?${params.toString()}`
        )
        .then(
          () => {},
          () => {
            console.error(
              'There was an issue opening this code in your editor.'
            )
          }
        )
    }, [hasSource, f])

    return (
      <div data-nextjs-call-stack-frame>
        <h6 data-nextjs-frame-expanded={Boolean(frame.expanded)}>
          {f.methodName}
        </h6>
        <div
          data-has-source={hasSource ? 'true' : undefined}
          tabIndex={hasSource ? 10 : undefined}
          role={hasSource ? 'link' : undefined}
          onClick={open}
          title={hasSource ? 'Click to open in your editor' : undefined}
        >
          <span>{getFrameSource(f)}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </div>
      </div>
    )
  }

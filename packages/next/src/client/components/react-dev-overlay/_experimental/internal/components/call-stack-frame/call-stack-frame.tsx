import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import type { OriginalStackFrame } from '../../helpers/stack-frame'

import { HotlinkedText } from '../hot-linked-text'
import { ExternalIcon } from '../../icons/external'
import { getFrameSource } from '../../helpers/stack-frame'
import { useOpenInEditor } from '../../helpers/use-open-in-editor'
import { noop as css } from '../../helpers/noop-template'

export const CallStackFrame: React.FC<{
  frame: OriginalStackFrame
  index: number
}> = function CallStackFrame({ frame, index }) {
  // TODO: ability to expand resolved frames
  // TODO: render error or external indicator

  const f: StackFrame = frame.originalStackFrame ?? frame.sourceStackFrame
  const hasSource = Boolean(frame.originalCodeFrame)
  const open = useOpenInEditor(
    hasSource
      ? {
          file: f.file,
          lineNumber: f.lineNumber,
          column: f.column,
        }
      : undefined
  )

  // Format method to strip out the webpack layer prefix.
  // e.g. (app-pages-browser)/./app/page.tsx -> ./app/page.tsx
  const formattedMethod = f.methodName.replace(/^\([\w-]+\)\//, '')

  // Formatted file source could be empty. e.g. <anonymous> will be formatted to empty string,
  // we'll skip rendering the frame in this case.
  const fileSource = getFrameSource(f)

  if (!fileSource) {
    return null
  }

  return (
    <div
      data-nextjs-call-stack-frame
      data-nextjs-call-stack-frame-ignored={!hasSource}
      style={
        {
          '--index': index,
        } as React.CSSProperties
      }
    >
      <div
        data-nextjs-frame-expanded={!frame.ignored}
        className="call-stack-frame-method-name"
      >
        <HotlinkedText text={formattedMethod} />
        {hasSource && (
          <button onClick={open} className="open-in-editor-button">
            <ExternalIcon width={16} height={16} />
          </button>
        )}
      </div>
      <span
        className="call-stack-frame-file-source"
        data-has-source={hasSource}
      >
        {fileSource}
      </span>
    </div>
  )
}

export const CALL_STACK_FRAME_STYLES = css`
  [data-nextjs-call-stack-frame-ignored] {
    padding: var(--size-1_5) var(--size-2);
    margin-bottom: var(--size-1);

    border-radius: var(--rounded-lg);
  }

  [data-nextjs-call-stack-frame-ignored]:last-child {
    margin-bottom: 0;
  }

  [data-nextjs-call-stack-frame] {
    user-select: text;
    display: block;
    box-sizing: border-box;

    user-select: text;
    -webkit-user-select: text;
    -moz-user-select: text;
    -ms-user-select: text;

    padding: 6px 8px;

    border-radius: var(--rounded-lg);
  }

  .call-stack-frame-method-name {
    display: flex;
    align-items: center;
    gap: var(--size-1);

    margin-bottom: var(--size-1);
    font-family: var(--font-stack-monospace);

    color: var(--color-gray-1000);
    font-size: var(--size-font-small);
    font-weight: 500;
    line-height: var(--size-5);
  }

  .open-in-editor-button {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--rounded-full);
    padding: 4px;
    color: var(--color-font);

    &:focus-visible {
      outline: var(--focus-ring);
      outline-offset: -2px;
    }

    &:hover {
      background: var(--color-gray-100);
    }
  }

  .call-stack-frame-file-source {
    color: var(--color-gray-900);
    font-size: var(--size-font-small);
    line-height: var(--size-5);
  }
`

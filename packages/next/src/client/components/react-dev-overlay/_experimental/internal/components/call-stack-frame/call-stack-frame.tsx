import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import type { OriginalStackFrame } from '../../helpers/stack-frame'

import { HotlinkedText } from '../hot-linked-text'
import { getFrameSource } from '../../helpers/stack-frame'
import { useOpenInEditor } from '../../helpers/use-open-in-editor'
import { noop as css } from '../../helpers/noop-template'

export const CallStackFrame: React.FC<{
  frame: OriginalStackFrame
}> = function CallStackFrame({ frame }) {
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

  const Comp = hasSource ? 'button' : 'div'

  return (
    <Comp
      data-nextjs-call-stack-frame
      onClick={hasSource ? open : undefined}
      disabled={!hasSource}
      title={hasSource ? 'Click to open in your editor' : undefined}
    >
      <span
        data-nextjs-frame-expanded={!frame.ignored}
        className="call-stack-frame-method-name"
      >
        <HotlinkedText text={formattedMethod} />
        {hasSource && <External />}
      </span>
      <span
        className="call-stack-frame-file-source"
        data-has-source={hasSource}
      >
        {fileSource}
      </span>
    </Comp>
  )
}

function External() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.5 9.75V11.25C11.5 11.3881 11.3881 11.5 11.25 11.5H4.75C4.61193 11.5 4.5 11.3881 4.5 11.25L4.5 4.75C4.5 4.61193 4.61193 4.5 4.75 4.5H6.25H7V3H6.25H4.75C3.7835 3 3 3.7835 3 4.75V11.25C3 12.2165 3.7835 13 4.75 13H11.25C12.2165 13 13 12.2165 13 11.25V9.75V9H11.5V9.75ZM8.5 3H9.25H12.2495C12.6637 3 12.9995 3.33579 12.9995 3.75V6.75V7.5H11.4995V6.75V5.56066L8.53033 8.52978L8 9.06011L6.93934 7.99945L7.46967 7.46912L10.4388 4.5H9.25H8.5V3Z"
        fill="currentColor"
      />
    </svg>
  )
}

export const CALL_STACK_FRAME_STYLES = css`
  div[data-nextjs-call-stack-frame] {
    padding: var(--size-1_5) var(--size-2);
    margin-bottom: var(--size-1);

    border-radius: var(--rounded-lg);
  }

  button[data-nextjs-call-stack-frame] {
    all: unset;
    display: block;
    box-sizing: border-box;
    width: 100%;

    user-select: text;
    -webkit-user-select: text;
    -moz-user-select: text;
    -ms-user-select: text;

    padding: var(--size-1_5) var(--size-2);
    margin-bottom: var(--size-1);

    border-radius: var(--rounded-lg);

    &:not(:disabled):hover {
      background: var(--color-gray-alpha-100);
      cursor: pointer;
    }

    &:not(:disabled):active {
      background: var(--color-gray-alpha-200);
    }

    &:focus {
      outline: none;
    }
  }

  .call-stack-frame-method-name {
    display: flex;
    align-items: center;
    gap: var(--size-1);

    margin-bottom: var(--size-1);

    color: var(--color-gray-1000);
    font-size: var(--size-font-small);
    font-weight: 500;
    line-height: var(--size-5);
  }

  .call-stack-frame-file-source {
    color: var(--color-gray-900);
    font-size: var(--size-font-small);
    line-height: var(--size-5);
  }
`

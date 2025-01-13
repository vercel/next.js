import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import type { OriginalStackFrame } from '../../helpers/stack-frame'

import { HotlinkedText } from '../hot-linked-text'
import { ExternalIcon } from '../../icons/external'
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

  return (
    <div
      data-nextjs-call-stack-frame
      data-nextjs-call-stack-frame-ignored={!hasSource}
      onClick={hasSource ? open : undefined}
      role="button"
      tabIndex={0}
      aria-label={hasSource ? 'Click to open in your editor' : undefined}
      title={hasSource ? 'Click to open in your editor' : undefined}
    >
      <span
        data-nextjs-frame-expanded={!frame.ignored}
        className="call-stack-frame-method-name"
      >
        <HotlinkedText text={formattedMethod} />
        {hasSource && <ExternalIcon width={16} height={16} />}
      </span>
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

  [data-nextjs-call-stack-frame] {
    user-select: text;
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

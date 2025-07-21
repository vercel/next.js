import type { OriginalStackFrame } from '../../../shared/stack-frame'

import { HotlinkedText } from '../hot-linked-text'
import { ExternalIcon, SourceMappingErrorIcon } from '../../icons/external'
import { getFrameSource } from '../../../shared/stack-frame'
import { useOpenInEditor } from '../../utils/use-open-in-editor'

export const CallStackFrame: React.FC<{
  frame: OriginalStackFrame
}> = function CallStackFrame({ frame }) {
  // TODO: ability to expand resolved frames

  const f = frame.originalStackFrame ?? frame.sourceStackFrame
  const hasSource = Boolean(frame.originalCodeFrame)
  const open = useOpenInEditor(
    hasSource
      ? {
          file: f.file,
          line1: f.line1 ?? 1,
          column1: f.column1 ?? 1,
        }
      : undefined
  )

  // Formatted file source could be empty. e.g. <anonymous> will be formatted to empty string,
  // we'll skip rendering the frame in this case.
  const fileSource = getFrameSource(f)

  if (!fileSource) {
    return null
  }

  return (
    <div
      data-nextjs-call-stack-frame
      data-nextjs-call-stack-frame-no-source={!hasSource}
      data-nextjs-call-stack-frame-ignored={frame.ignored}
    >
      <div className="call-stack-frame-method-name">
        <HotlinkedText text={f.methodName} />
        {hasSource && (
          <button
            onClick={open}
            className="open-in-editor-button"
            aria-label={`Open ${f.methodName} in editor`}
          >
            <ExternalIcon width={16} height={16} />
          </button>
        )}
        {frame.error ? (
          <button
            className="source-mapping-error-button"
            onClick={() => console.error(frame.reason)}
            title="Sourcemapping failed. Click to log cause of error."
          >
            <SourceMappingErrorIcon width={16} height={16} />
          </button>
        ) : null}
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

export const CALL_STACK_FRAME_STYLES = `
  [data-nextjs-call-stack-frame-no-source] {
    padding: 6px 8px;
    margin-bottom: 4px;

    border-radius: var(--rounded-lg);
  }

  [data-nextjs-call-stack-frame-no-source]:last-child {
    margin-bottom: 0;
  }

  [data-nextjs-call-stack-frame-ignored="true"] {
    opacity: 0.6;
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
    gap: 4px;

    margin-bottom: 4px;
    font-family: var(--font-stack-monospace);

    color: var(--color-gray-1000);
    font-size: var(--size-14);
    font-weight: 500;
    line-height: var(--size-20);

    svg {
      width: var(--size-16px);
      height: var(--size-16px);
    }
  }

  .open-in-editor-button, .source-mapping-error-button {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--rounded-full);
    padding: 4px;
    color: var(--color-font);

    svg {
      width: var(--size-16);
      height: var(--size-16);
    }

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
    font-size: var(--size-14);
    line-height: var(--size-20);
  }
`

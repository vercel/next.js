import type { OriginalStackFrame } from '../../../shared/stack-frame'

import { useCallback } from 'react'
import { HotlinkedText } from '../hot-linked-text'
import { ExternalIcon, SourceMappingErrorIcon } from '../../icons/external'
import { getStackFrameFile } from '../../../shared/stack-frame'
import { useOpenInEditor } from '../../utils/use-open-in-editor'

export function CallStackFrame({
  frame,
  index,
  isSelected,
  onSelect,
  tabGroupId,
}: {
  frame: OriginalStackFrame
  index: number
  isSelected: boolean
  onSelect?: (index: number) => void
  tabGroupId: string
}) {
  // TODO: ability to expand resolved frames

  const f = frame.originalStackFrame ?? frame.sourceStackFrame
  const hasSource = Boolean(frame.originalCodeFrame)
  const isSelectable = Boolean(onSelect)
  const open = useOpenInEditor(
    hasSource
      ? {
          file: f.file,
          line1: f.line1 ?? 1,
          column1: f.column1 ?? 1,
        }
      : undefined
  )

  const handleSelect = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (event.metaKey) {
        open()
      } else if (onSelect) {
        onSelect(index)
      }
    },
    [onSelect, index, open]
  )

  // Formatted file source could be empty. e.g. <anonymous> will be formatted to empty string,
  // we'll skip rendering the frame in this case.
  const stackFrameFile = getStackFrameFile(f)

  if (!stackFrameFile) {
    return null
  }

  const tabPanelId = `${tabGroupId}-panel-${index}`
  const tabId = `${tabGroupId}-tab-${index}`
  const describedById = `${tabGroupId}-tab-${index}-label`
  const labelledById = `${tabGroupId}-tab-${index}-description`

  // Using the "faux nested interactive controls" pattern:
  // https://piccalil.li/blog/accessible-faux-nested-interactive-controls/
  // The main button uses a ::after pseudo-element to cover the whole frame area.
  // Other buttons are positioned with higher z-index to be clickable above it.
  return (
    <div
      data-nextjs-call-stack-frame
      data-nextjs-call-stack-frame-index={index}
      data-nextjs-call-stack-frame-no-source={!hasSource}
      data-nextjs-call-stack-frame-ignored={frame.ignored}
      data-nextjs-call-stack-frame-selectable={isSelectable}
      role="tab"
      id={tabId}
      aria-controls={tabPanelId}
      aria-describedby={describedById}
      aria-labelledby={labelledById}
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
    >
      <div className="call-stack-frame-method-name">
        {isSelectable ? (
          <button
            type="button"
            onClick={handleSelect}
            className="call-stack-frame-select-button"
            id={labelledById}
            tabIndex={-1}
          >
            <HotlinkedText text={f.methodName} />
          </button>
        ) : (
          <span>
            <HotlinkedText text={f.methodName} />
          </span>
        )}
        {hasSource && (
          <button
            type="button"
            onClick={open}
            className="call-stack-frame-action-button open-in-editor-button"
            aria-label={`Open ${f.methodName} in editor`}
            tabIndex={-1}
          >
            <ExternalIcon width={16} height={16} />
          </button>
        )}
        {frame.error ? (
          <button
            type="button"
            className="call-stack-frame-action-button source-mapping-error-button"
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
        id={describedById}
      >
        {stackFrameFile}
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

  /* Container for the faux nested interactive controls pattern */
  [data-nextjs-call-stack-frame] {
    position: relative;
    display: block;
    box-sizing: border-box;

    user-select: text;
    -webkit-user-select: text;
    -moz-user-select: text;
    -ms-user-select: text;

    padding: 6px 8px;

    border-radius: var(--rounded-lg);
    transition: background-color 150ms ease;
  }

  [data-nextjs-call-stack-frame]:focus-visible {
    outline: var(--focus-ring);
    /* offset --focus-right width. Chrome's default choice to restrict the childs outline by the parent looks bad. */
    outline-offset: -2px;
  }

  [data-nextjs-call-stack-frame-selectable="true"]:hover {
    background-color: var(--color-gray-100);
  }

  [data-nextjs-call-stack-frame][aria-selected="true"] {
    background-color: var(--color-gray-200);
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

  /* Main select button with ::after covering the whole frame */
  .call-stack-frame-select-button {
    all: unset;
    cursor: pointer;
    text-align: left;
  }

  /* The ::after pseudo-element covers the whole frame area */
  .call-stack-frame-select-button::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  .call-stack-frame-select-button:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
    border-radius: 2px;
  }

  /* Action buttons positioned above the select button's ::after */
  .call-stack-frame-action-button {
    position: relative;
    z-index: 1;
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
      /* 
       * if we're hovering the secondary actions, we're also hovering the parent.
       * Invert back to create sufficient contrast against the parent's hover background color.
       */
      background: var(--color-background-100);
      outline: 1px solid var(--color-font);
    }
  }

  .call-stack-frame-file-source {
    display: block;
    color: var(--color-gray-900);
    font-size: var(--size-14);
    line-height: var(--size-20);
  }
`

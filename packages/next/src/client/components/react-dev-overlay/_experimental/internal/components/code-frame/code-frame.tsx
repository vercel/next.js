import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'

import Anser from 'next/dist/compiled/anser'
import stripAnsi from 'next/dist/compiled/strip-ansi'

import { useMemo } from 'react'
import { HotlinkedText } from '../hot-linked-text'
import { getFrameSource } from '../../../../internal/helpers/stack-frame'
import { useOpenInEditor } from '../../helpers/use-open-in-editor'
import { noop as css } from '../../helpers/noop-template'
import { ExternalIcon } from '../../icons/external'
import { FileIcon } from '../../icons/file'

export type CodeFrameProps = { stackFrame: StackFrame; codeFrame: string }

export function CodeFrame({ stackFrame, codeFrame }: CodeFrameProps) {
  // Strip leading spaces out of the code frame:
  const formattedFrame = useMemo<string>(() => {
    const lines = codeFrame.split(/\r?\n/g)

    // Find the minimum length of leading spaces after `|` in the code frame
    const miniLeadingSpacesLength = lines
      .map((line) =>
        /^>? +\d+ +\| [ ]+/.exec(stripAnsi(line)) === null
          ? null
          : /^>? +\d+ +\| ( *)/.exec(stripAnsi(line))
      )
      .filter(Boolean)
      .map((v) => v!.pop()!)
      .reduce((c, n) => (isNaN(c) ? n.length : Math.min(c, n.length)), NaN)

    // When the minimum length of leading spaces is greater than 1, remove them
    // from the code frame to help the indentation looks better when there's a lot leading spaces.
    if (miniLeadingSpacesLength > 1) {
      return lines
        .map((line, a) =>
          ~(a = line.indexOf('|'))
            ? line.substring(0, a) +
              line.substring(a).replace(`^\\ {${miniLeadingSpacesLength}}`, '')
            : line
        )
        .join('\n')
    }
    return lines.join('\n')
  }, [codeFrame])

  const decoded = useMemo(() => {
    return Anser.ansiToJson(formattedFrame, {
      json: true,
      use_classes: true,
      remove_empty: true,
    })
  }, [formattedFrame])

  const open = useOpenInEditor({
    file: stackFrame.file,
    lineNumber: stackFrame.lineNumber,
    column: stackFrame.column,
  })

  const fileExtension = stackFrame?.file?.split('.').pop()

  // TODO: make the caret absolute
  return (
    <div data-nextjs-codeframe>
      <button
        aria-label="Open error location in editor"
        className="code-frame-header"
        onClick={open}
      >
        <p className="code-frame-link">
          <span className="code-frame-icon">
            <FileIcon lang={fileExtension} />
            {getFrameSource(stackFrame)} @{' '}
            <HotlinkedText text={stackFrame.methodName} />
          </span>
          <ExternalIcon width={16} height={16} />
        </p>
      </button>
      <pre className="code-frame-pre">
        {decoded.map((entry, index) => (
          <span
            key={`frame-${index}`}
            style={{
              color: entry.fg ? `var(--color-${entry.fg})` : undefined,
              ...(entry.decoration === 'bold'
                ? // TODO(jiwon): This used to be 800, but the symbols like `─┬─` are
                  // having longer width than expected on Geist Mono font-weight
                  // above 600, hence a temporary fix is to use 500 for bold.
                  { fontWeight: 500 }
                : entry.decoration === 'italic'
                  ? { fontStyle: 'italic' }
                  : undefined),
            }}
          >
            {entry.content}
          </span>
        ))}
      </pre>
    </div>
  )
}

export const CODE_FRAME_STYLES = css`
  [data-nextjs-codeframe] {
    background-color: var(--color-background-200);
    overflow: hidden;
    color: var(--color-gray-1000);
    text-overflow: ellipsis;
    border: 1px solid var(--color-gray-400);
    border-radius: 8px;
    font-family: var(--font-stack-monospace);
    font-size: 12px;
    line-height: 16px;
    margin: var(--size-2) 0;
  }

  .code-frame-link,
  .code-frame-pre {
    padding: 12px;
  }

  .code-frame-pre {
    white-space: pre-wrap;
  }

  .code-frame-header {
    width: 100%;
    cursor: pointer;
    transition: background 100ms ease-out;
    border-radius: 8px 8px 0 0;
    border-bottom: 1px solid var(--color-gray-400);

    &:focus-visible {
      outline: var(--focus-ring);
      outline-offset: -2px;
    }

    &:hover {
      background: var(--color-gray-100);
    }
  }

  .code-frame-icon {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  [data-nextjs-codeframe]::selection,
  [data-nextjs-codeframe] *::selection {
    background-color: var(--color-ansi-selection);
  }

  [data-nextjs-codeframe] * {
    color: inherit;
    background-color: transparent;
    font-family: var(--font-stack-monospace);
  }

  [data-nextjs-codeframe] > * {
    margin: 0;
  }

  .code-frame-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0;
    outline: 0;
  }

  [data-nextjs-codeframe] div > pre {
    overflow: hidden;
    display: inline-block;
  }

  [data-nextjs-codeframe] svg {
    color: var(--color-gray-900);
  }
`

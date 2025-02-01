import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'

import Anser from 'next/dist/compiled/anser'
import stripAnsi from 'next/dist/compiled/strip-ansi'

import { useMemo } from 'react'
import { HotlinkedText } from '../hot-linked-text'
import { getFrameSource } from '../../helpers/stack-frame'
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

  // TODO: make the caret absolute
  return (
    <div data-nextjs-codeframe>
      <div className="code-frame-header">
        <p
          role="link"
          onClick={open}
          tabIndex={1}
          title="Click to open in your editor"
        >
          <span>
            <FileIcon />
            {getFrameSource(stackFrame)} @{' '}
            <HotlinkedText text={stackFrame.methodName} />
          </span>
          <ExternalIcon width={16} height={16} />
        </p>
      </div>
      <pre>
        {decoded.map((entry, index) => (
          <span
            key={`frame-${index}`}
            style={{
              color: entry.fg ? `var(--color-${entry.fg})` : undefined,
              ...(entry.decoration === 'bold'
                ? { fontWeight: 800 }
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
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    flex: 1 0 0;

    background-color: var(--color-background-200);
    overflow: hidden;
    color: var(--color-gray-1000);
    text-overflow: ellipsis;
    font-family: var(--font-stack-monospace);
    font-size: 12px;
    line-height: 16px;
  }

  .code-frame-header {
    border-top: 1px solid var(--color-gray-400);
    border-bottom: 1px solid var(--color-gray-400);
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
    padding: calc(var(--size-gap) + var(--size-gap-half))
      calc(var(--size-gap-double) + var(--size-gap-half));
  }

  [data-nextjs-codeframe] > div > p {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    margin: 0;
  }
  [data-nextjs-codeframe] > div > p:hover {
    text-decoration: underline dotted;
  }
  [data-nextjs-codeframe] div > pre {
    overflow: hidden;
    display: inline-block;
  }

  [data-nextjs-codeframe] svg {
    color: var(--color-gray-900);
    margin-right: 6px;
  }
`

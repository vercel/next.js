import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'

import Anser from 'next/dist/compiled/anser'
import stripAnsi from 'next/dist/compiled/strip-ansi'

import { useMemo } from 'react'
import { HotlinkedText } from '../hot-linked-text'
import { getFrameSource } from '../../helpers/stack-frame'
import { useOpenInEditor } from '../../helpers/use-open-in-editor'
import { noop as css } from '../../helpers/noop-template'

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
      <div>
        <p
          role="link"
          onClick={open}
          tabIndex={1}
          title="Click to open in your editor"
        >
          <span>
            {getFrameSource(stackFrame)} @{' '}
            <HotlinkedText text={stackFrame.methodName} />
          </span>
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
    overflow: auto;
    border-radius: var(--size-gap-half);
    background-color: var(--color-ansi-bg);
    color: var(--color-ansi-fg);
    margin-bottom: var(--size-gap-double);
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
  [data-nextjs-codeframe] > div {
    display: inline-block;
    width: auto;
    min-width: 100%;
    border-bottom: 1px solid var(--color-ansi-bright-black);
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
  [data-nextjs-codeframe] div > p > svg {
    width: auto;
    height: 1em;
    margin-left: 8px;
  }
  [data-nextjs-codeframe] div > pre {
    overflow: hidden;
    display: inline-block;
  }
`

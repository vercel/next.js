import Anser from 'next/dist/compiled/anser'
import * as React from 'react'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { getFrameSource } from '../../helpers/stack-frame'
import { useOpenInEditor } from '../../helpers/use-open-in-editor'
import { HotlinkedText } from '../hot-linked-text'

export type CodeFrameProps = { stackFrame: StackFrame; codeFrame: string }

export const CodeFrame: React.FC<CodeFrameProps> = function CodeFrame({
  stackFrame,
  codeFrame,
}) {
  // Strip leading spaces out of the code frame:
  const formattedFrame = React.useMemo<string>(() => {
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

  const decoded = React.useMemo(() => {
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

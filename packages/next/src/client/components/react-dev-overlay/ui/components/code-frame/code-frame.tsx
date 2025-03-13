import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import { useMemo } from 'react'
import { HotlinkedText } from '../hot-linked-text'
import { getFrameSource } from '../../../utils/stack-frame'
import { useOpenInEditor } from '../../utils/use-open-in-editor'
import { ExternalIcon } from '../../icons/external'
import { FileIcon } from '../../icons/file'
import {
  formatCodeFrame,
  groupCodeFrameLines,
  parseLineNumberFromCodeFrameLine,
} from './parse-code-frame'

export type CodeFrameProps = { stackFrame: StackFrame; codeFrame: string }

export function CodeFrame({ stackFrame, codeFrame }: CodeFrameProps) {
  const formattedFrame = useMemo<string>(
    () => formatCodeFrame(codeFrame),
    [codeFrame]
  )
  const decodedLines = useMemo(
    () => groupCodeFrameLines(formattedFrame),
    [formattedFrame]
  )

  const open = useOpenInEditor({
    file: stackFrame.file,
    lineNumber: stackFrame.lineNumber,
    column: stackFrame.column,
  })

  const fileExtension = stackFrame?.file?.split('.').pop()

  // TODO: make the caret absolute
  return (
    <div data-nextjs-codeframe>
      <div className="code-frame-header">
        {/* TODO: This is <div> in `Terminal` component.
        Changing now will require multiple test snapshots updates.
        Leaving as <div> as is trivial and does not affect the UI.
        Change when the new redbox matcher `toDisplayRedbox` is used.
        */}
        <p className="code-frame-link">
          <span className="code-frame-icon">
            <FileIcon lang={fileExtension} />
          </span>
          <span data-text>
            {getFrameSource(stackFrame)} @{' '}
            <HotlinkedText text={stackFrame.methodName} />
          </span>
          <button
            aria-label="Open in editor"
            data-with-open-in-editor-link-source-file
            onClick={open}
          >
            <span className="code-frame-icon" data-icon="right">
              <ExternalIcon width={16} height={16} />
            </span>
          </button>
        </p>
      </div>
      <pre className="code-frame-pre">
        {decodedLines.map((line, lineIndex) => {
          const { lineNumber, isErroredLine } =
            parseLineNumberFromCodeFrameLine(line, stackFrame)

          const lineNumberProps: Record<string, string | boolean> = {}
          if (lineNumber) {
            lineNumberProps['data-nextjs-codeframe-line'] = lineNumber
          }
          if (isErroredLine) {
            lineNumberProps['data-nextjs-codeframe-line--errored'] = true
          }

          return (
            <div key={`line-${lineIndex}`} {...lineNumberProps}>
              {line.map((entry, entryIndex) => (
                <span
                  key={`frame-${entryIndex}`}
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
            </div>
          )
        })}
      </pre>
    </div>
  )
}

export const CODE_FRAME_STYLES = `
  [data-nextjs-codeframe] {
    background-color: var(--color-background-200);
    overflow: hidden;
    color: var(--color-gray-1000);
    text-overflow: ellipsis;
    border: 1px solid var(--color-gray-400);
    border-radius: 8px;
    font-family: var(--font-stack-monospace);
    font-size: var(--size-12);
    line-height: var(--size-16);
    margin: 8px 0;

    svg {
      width: var(--size-16);
      height: var(--size-16);
    }
  }

  .code-frame-link,
  .code-frame-pre {
    padding: 12px;
  }

  .code-frame-link svg {
    flex-shrink: 0;
  }

  .code-frame-link [data-text] {
    display: inline-flex;
    text-align: left;
    margin: auto 6px;
  }

  .code-frame-pre {
    white-space: pre-wrap;
  }

  .code-frame-header {
    width: 100%;
    transition: background 100ms ease-out;
    border-radius: 8px 8px 0 0;
    border-bottom: 1px solid var(--color-gray-400);
  }

  [data-with-open-in-editor-link-source-file] {
    padding: 4px;
    margin: -4px 0 -4px auto;
    border-radius: var(--rounded-full);
    margin-left: auto;

    &:focus-visible {
      outline: var(--focus-ring);
      outline-offset: -2px;
    }

    &:hover {
      background: var(--color-gray-100);
    }
  }

  [data-nextjs-codeframe]::selection,
  [data-nextjs-codeframe] *::selection {
    background-color: var(--color-ansi-selection);
  }

  [data-nextjs-codeframe] *:not(a) {
    color: inherit;
    background-color: transparent;
    font-family: var(--font-stack-monospace);
  }

  [data-nextjs-codeframe] > * {
    margin: 0;
  }

  .code-frame-link {
    display: flex;
    margin: 0;
    outline: 0;
  }
  .code-frame-link [data-icon='right'] {
    margin-left: auto;
  }

  [data-nextjs-codeframe] div > pre {
    overflow: hidden;
    display: inline-block;
  }

  [data-nextjs-codeframe] svg {
    color: var(--color-gray-900);
  }
`

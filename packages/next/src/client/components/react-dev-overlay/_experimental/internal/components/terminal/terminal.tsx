import Anser from 'next/dist/compiled/anser'
import * as React from 'react'
import { HotlinkedText } from '../hot-linked-text'
import { EditorLink } from './editor-link'
import { ExternalIcon } from '../../icons/external'
import { noop as css } from '../../helpers/noop-template'
import { getFrameSource } from '../../helpers/stack-frame'
import { useOpenInEditor } from '../../helpers/use-open-in-editor'
import { FileIcon } from '../../icons/file'

export type TerminalProps = { content: string }

function getFile(lines: string[]) {
  const contentFileName = lines.shift()
  if (!contentFileName) return null
  const [fileName, line, column] = contentFileName.split(':', 3)

  const parsedLine = Number(line)
  const parsedColumn = Number(column)
  const hasLocation = !Number.isNaN(parsedLine) && !Number.isNaN(parsedColumn)

  return {
    fileName: hasLocation ? fileName : contentFileName,
    location: hasLocation
      ? {
          line: parsedLine,
          column: parsedColumn,
        }
      : undefined,
  }
}

function getImportTraceFiles(lines: string[]) {
  if (
    lines.some((line) => /ReactServerComponentsError:/.test(line)) ||
    lines.some((line) => /Import trace for requested module:/.test(line))
  ) {
    // Grab the lines at the end containing the files
    const files = []
    while (
      /.+\..+/.test(lines[lines.length - 1]) &&
      !lines[lines.length - 1].includes(':')
    ) {
      const file = lines.pop()!.trim()
      files.unshift(file)
    }

    return files
  }

  return []
}

function getEditorLinks(content: string) {
  const lines = content.split('\n')
  const file = getFile(lines)
  const importTraceFiles = getImportTraceFiles(lines)

  return { file, source: lines.join('\n'), importTraceFiles }
}

export const Terminal: React.FC<TerminalProps> = function Terminal({
  content,
}) {
  const { file, source, importTraceFiles } = React.useMemo(
    () => getEditorLinks(content),
    [content]
  )

  const decoded = React.useMemo(() => {
    return Anser.ansiToJson(source, {
      json: true,
      use_classes: true,
      remove_empty: true,
    })
  }, [source])

  const open = useOpenInEditor({
    file: file?.fileName,
    lineNumber: file?.location?.line,
    column: file?.location?.column,
  })

  const stackFrame = {
    file: file?.fileName ?? null,
    methodName: '',
    arguments: [],
    lineNumber: file?.location?.line ?? null,
    column: file?.location?.column ?? null,
  }

  return (
    <div data-nextjs-terminal>
      <div className="terminal-header">
        <p
          role="link"
          onClick={open}
          tabIndex={1}
          title="Click to open in your editor"
        >
          <span>
            <FileIcon />
            {getFrameSource(stackFrame)}
            {/* TODO: Unlike the CodeFrame component, the `methodName` is unavailable. */}
          </span>
          <ExternalIcon width={16} height={16} />
        </p>
      </div>
      <pre>
        {decoded.map((entry, index) => (
          <span
            key={`terminal-entry-${index}`}
            style={{
              color: entry.fg ? `var(--color-${entry.fg})` : undefined,
              ...(entry.decoration === 'bold'
                ? { fontWeight: 800 }
                : entry.decoration === 'italic'
                  ? { fontStyle: 'italic' }
                  : undefined),
            }}
          >
            <HotlinkedText text={entry.content} />
          </span>
        ))}
        {importTraceFiles.map((importTraceFile) => (
          <EditorLink
            isSourceFile={false}
            key={importTraceFile}
            file={importTraceFile}
          />
        ))}
      </pre>
    </div>
  )
}

export const TERMINAL_STYLES = css`
  [data-nextjs-terminal] {
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

  .terminal-header {
    border-top: 1px solid var(--color-gray-400);
    border-bottom: 1px solid var(--color-gray-400);
  }

  [data-nextjs-terminal]::selection,
  [data-nextjs-terminal] *::selection {
    background-color: var(--color-ansi-selection);
  }

  [data-nextjs-terminal] * {
    color: inherit;
    background-color: transparent;
    font-family: var(--font-stack-monospace);
  }

  [data-nextjs-terminal] > * {
    margin: 0;
    padding: calc(var(--size-gap) + var(--size-gap-half))
      calc(var(--size-gap-double) + var(--size-gap-half));
  }

  [data-nextjs-terminal] > div > p {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    margin: 0;
  }
  [data-nextjs-terminal] > div > p:hover {
    text-decoration: underline dotted;
  }
  [data-nextjs-terminal] div > pre {
    overflow: hidden;
    display: inline-block;
  }

  [data-nextjs-terminal] svg {
    color: var(--color-gray-900);
    margin-right: 6px;
  }
`

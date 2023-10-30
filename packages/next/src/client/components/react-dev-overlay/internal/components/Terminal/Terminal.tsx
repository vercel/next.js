import Anser from 'next/dist/compiled/anser'
import * as React from 'react'
import { HotlinkedText } from '../hot-linked-text'
import { EditorLink } from './EditorLink'

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

  return (
    <div data-nextjs-terminal>
      {file && (
        <EditorLink
          isSourceFile
          key={file.fileName}
          file={file.fileName}
          location={file.location}
        />
      )}
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

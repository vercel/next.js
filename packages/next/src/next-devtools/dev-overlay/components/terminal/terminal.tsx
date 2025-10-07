import Anser from 'next/dist/compiled/anser'
import * as React from 'react'
import { HotlinkedText } from '../hot-linked-text'
import { EditorLink } from './editor-link'
import { ExternalIcon } from '../../icons/external'
import { getFrameSource, type StackFrame } from '../../../shared/stack-frame'
import { useOpenInEditor } from '../../utils/use-open-in-editor'
import { FileIcon } from '../../icons/file'

type TerminalProps = { content: string }

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
          line1: parsedLine,
          column1: parsedColumn,
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
    line1: file?.location?.line1 ?? 1,
    column1: file?.location?.column1 ?? 1,
  })

  const stackFrame: StackFrame = {
    file: file?.fileName ?? null,
    methodName: '',
    arguments: [],
    line1: file?.location?.line1 ?? null,
    column1: file?.location?.column1 ?? null,
  }

  const fileExtension = stackFrame?.file?.split('.').pop()

  return (
    <div data-nextjs-codeframe>
      <div className="code-frame-header">
        <div className="code-frame-link">
          <span className="code-frame-icon">
            <FileIcon lang={fileExtension} />
          </span>
          <span data-text>
            {/* TODO: Unlike the CodeFrame component, the `methodName` is unavailable. */}
            {getFrameSource(stackFrame)}
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
        </div>
      </div>
      <pre className="code-frame-pre">
        <div className="code-frame-lines">
          {decoded.map((entry, index) => (
            <span
              key={`terminal-entry-${index}`}
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
        </div>
      </pre>
    </div>
  )
}

export const TERMINAL_STYLES = `
  [data-nextjs-terminal]::selection,
  [data-nextjs-terminal] *::selection {
    background-color: var(--color-ansi-selection);
  }

  [data-nextjs-terminal] * {
    color: inherit;
    background-color: transparent;
    font-family: var(--font-stack-monospace);
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
`

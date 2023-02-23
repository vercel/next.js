import Anser from 'next/dist/compiled/anser'
import * as React from 'react'
import { HotlinkedText } from '../hot-linked-text'
import { EditorLink } from './EditorLink'

export type TerminalProps = { content: string }

function getImportTraceFiles(content: string): [string, string[]] {
  if (
    /ReactServerComponentsError:/.test(content) ||
    /Import trace for requested module:/.test(content)
  ) {
    // It's an RSC Build Error
    const lines = content.split('\n')

    // Grab the lines at the end containing the files
    const files = []
    while (
      /.+\..+/.test(lines[lines.length - 1]) &&
      !lines[lines.length - 1].includes(':')
    ) {
      const file = lines.pop()!.trim()
      files.unshift(file)
    }

    return [lines.join('\n'), files]
  }

  return [content, []]
}

export const Terminal: React.FC<TerminalProps> = function Terminal({
  content,
}) {
  const [source, editorLinks] = React.useMemo(
    () => getImportTraceFiles(content),
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
        {editorLinks.map((file) => (
          <EditorLink key={file} file={file} />
        ))}
      </pre>
    </div>
  )
}

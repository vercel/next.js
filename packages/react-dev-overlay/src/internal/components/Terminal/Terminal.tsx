import Anser from 'anser'
import * as React from 'react'

export type TerminalProps = { content: string }

export const Terminal: React.FC<TerminalProps> = function Terminal({
  content,
}) {
  const decoded = React.useMemo(() => {
    return Anser.ansiToJson(content, {
      json: true,
      use_classes: true,
      remove_empty: true,
    })
  }, [content])

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
            {entry.content}
          </span>
        ))}
      </pre>
    </div>
  )
}

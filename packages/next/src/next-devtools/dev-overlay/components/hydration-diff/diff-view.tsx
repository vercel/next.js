import { useMemo } from 'react'

function getRenderedTreeExcerpt(lines: string[], signs: Set<string>) {
  const firstHighlightedLine = lines.findIndex((line) => signs.has(line[0]))

  if (firstHighlightedLine === -1) {
    return lines
  }

  const highlightedLines = lines.filter((line) => signs.has(line[0]))
  let parentLine: string | undefined

  for (let index = firstHighlightedLine - 1; index >= 0; index--) {
    const line = lines[index]
    const trimmedLine = line.trim()

    if (trimmedLine !== '' && trimmedLine !== '...') {
      parentLine = line
      break
    }
  }

  let lastHighlightedLine = -1
  for (let index = lines.length - 1; index >= 0; index--) {
    if (signs.has(lines[index][0])) {
      lastHighlightedLine = index
      break
    }
  }
  const possibleClosingLine = lines[lastHighlightedLine + 1]
  const closingLine = /^\s*\/?>(?:\s*)$/.test(possibleClosingLine ?? '')
    ? possibleClosingLine
    : undefined
  const excerpt = [parentLine, ...highlightedLines, closingLine].filter(
    (line): line is string => line !== undefined
  )
  const minimumIndent = Math.min(
    ...excerpt.map((line) => {
      const content = signs.has(line[0]) ? line.slice(1) : line
      return content.length - content.trimStart().length
    })
  )

  return excerpt.map((line) => {
    if (signs.has(line[0])) {
      return `${line[0]}${line.slice(1 + minimumIndent)}`
    }

    return line.slice(minimumIndent)
  })
}
/**
 *
 * Format component stack into pseudo HTML
 * component stack is an array of strings, e.g.: ['p', 'p', 'Page', ...]
 *
 * For html tags mismatch, it will render it for the code block
 *
 * ```
 * <pre>
 *  <code>{`
 *    <Page>
 *       <p red>
 *         <p red>
 *  `}</code>
 * </pre>
 * ```
 *
 * For text mismatch, it will render it for the code block
 *
 * ```
 * <pre>
 * <code>{`
 *   <Page>
 *     <p>
 *       "Server Text" (green)
 *       "Client Text" (red)
 *     </p>
 *   </Page>
 * `}</code>
 * ```
 *
 * For bad text under a tag it will render it for the code block,
 * e.g. "Mismatched Text" under <p>
 *
 * ```
 * <pre>
 * <code>{`
 *   <Page>
 *     <div>
 *       <p>
 *         "Mismatched Text" (red)
 *      </p>
 *     </div>
 *   </Page>
 * `}</code>
 * ```
 *
 */
export function PseudoHtmlDiff({
  reactOutputComponentDiff,
}: {
  reactOutputComponentDiff: string
}) {
  const { hasClientServerDiff, htmlComponents } = useMemo(() => {
    const componentStacks: React.ReactNode[] = []
    const reactComponentDiffLines = reactOutputComponentDiff.split('\n')
    const containsClientServerDiff = reactComponentDiffLines.some(
      (line) => line[0] === '+' || line[0] === '-'
    )
    const displayedLines = getRenderedTreeExcerpt(
      reactComponentDiffLines,
      new Set(containsClientServerDiff ? ['+', '-'] : ['>'])
    )

    displayedLines.forEach((line, index) => {
      const isDiffLine = line[0] === '+' || line[0] === '-'
      const isHighlightedLine = line[0] === '>'
      const hasSign = isDiffLine || isHighlightedLine
      const sign = hasSign ? line[0] : ''
      const signIndex = hasSign ? line.indexOf(sign) : -1
      const [prefix, suffix] = hasSign
        ? [line.slice(0, signIndex), line.slice(signIndex + 1)]
        : [line, '']

      if (isDiffLine) {
        componentStacks.push(
          <span
            key={'comp-diff' + index}
            data-nextjs-container-errors-pseudo-html-line
            data-nextjs-container-errors-pseudo-html--diff={
              sign === '+' ? 'add' : 'remove'
            }
          >
            <span>
              {/* Slice 2 spaces for the icon */}
              {prefix}
              <span data-nextjs-container-errors-pseudo-html-line-sign>
                {sign}
              </span>
              {suffix}
              {'\n'}
            </span>
          </span>
        )
      } else {
        // In general, if it's not collapsed, show the whole diff
        componentStacks.push(
          <span
            data-nextjs-container-errors-pseudo-html-line
            key={'comp-diff' + index}
            {...(isHighlightedLine
              ? {
                  'data-nextjs-container-errors-pseudo-html--diff': 'error',
                }
              : undefined)}
          >
            {prefix}
            <span data-nextjs-container-errors-pseudo-html-line-sign>
              {sign}
            </span>
            {suffix}
            {'\n'}
          </span>
        )
      }
    })
    return {
      hasClientServerDiff: containsClientServerDiff,
      htmlComponents: componentStacks,
    }
  }, [reactOutputComponentDiff])

  return (
    <div
      data-nextjs-container-errors-pseudo-html
      data-nextjs-hydration-diff-type={
        hasClientServerDiff ? 'client-server' : 'invalid-html'
      }
    >
      <div data-nextjs-hydration-diff-header>
        <div data-nextjs-hydration-diff-title>Rendered tree</div>
        {hasClientServerDiff && (
          <div data-nextjs-hydration-diff-badge>
            <span data-nextjs-hydration-diff-badge-item="client">
              <span>+</span> Client
            </span>
            <span data-nextjs-hydration-diff-badge-item="server">
              <span>-</span> Server
            </span>
          </div>
        )}
      </div>
      <pre className="nextjs__container_errors__component-stack">
        <code>{htmlComponents}</code>
      </pre>
    </div>
  )
}

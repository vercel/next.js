import { useMemo, useState } from 'react'

import { CollapseIcon } from '../../icons/collapse-icon'

// Keep the nearest relevant user component, the affected rows, and a closing
// delimiter. Unrelated ancestors and internal framework frames are omitted.
function getRenderedTreeExcerpt(lines: string[], signs: Set<string>) {
  const isRelevantLine = (line: string) =>
    !line.includes('<Next.js Internal Component>')
  const isHighlightedLine = (line: string) =>
    signs.has(line[0]) && isRelevantLine(line)
  const contextLineLimit = signs.has('+') ? 3 : 1
  const contextLines: string[] = []
  const excerpt: string[] = []
  let foundHighlightedLine = false
  let lastHighlightedLine = -1

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]

    if (isHighlightedLine(line)) {
      if (!foundHighlightedLine) {
        for (const contextLine of contextLines) {
          excerpt.push(contextLine)
        }
        foundHighlightedLine = true
      }

      excerpt.push(line)
      lastHighlightedLine = index
      continue
    }

    if (foundHighlightedLine) {
      continue
    }

    const trimmedLine = line.trim()

    if (trimmedLine !== '' && trimmedLine !== '...' && isRelevantLine(line)) {
      if (/^\s*<[A-Z]/.test(line)) {
        contextLines.length = 0
      }

      contextLines.push(line)
      if (contextLines.length > contextLineLimit) {
        contextLines.shift()
      }
    }
  }

  if (!foundHighlightedLine) {
    return lines
  }

  const possibleClosingLine = lines[lastHighlightedLine + 1]
  if (/^\s*\/?>(?:\s*)$/.test(possibleClosingLine ?? '')) {
    excerpt.push(possibleClosingLine)
  }

  let minimumIndent = Infinity
  for (const line of excerpt) {
    const content = signs.has(line[0]) ? line.slice(1) : line
    const indent = content.length - content.trimStart().length
    if (indent < minimumIndent) {
      minimumIndent = indent
    }
  }

  return excerpt.map((line) => {
    if (signs.has(line[0])) {
      return `${line[0]}${line.slice(1 + minimumIndent)}`
    }

    return line.slice(minimumIndent)
  })
}

function renderDiffLines(lines: string[]) {
  return lines.map((line, index) => {
    const isDiffLine = line[0] === '+' || line[0] === '-'
    const isHighlightedLine = line[0] === '>'
    const hasSign = isDiffLine || isHighlightedLine
    const sign = hasSign ? line[0] : ''
    const signIndex = hasSign ? line.indexOf(sign) : -1
    const [prefix, suffix] = hasSign
      ? [line.slice(0, signIndex), line.slice(signIndex + 1)]
      : [line, '']

    if (isDiffLine) {
      return (
        <span
          key={'comp-diff' + index}
          data-nextjs-container-errors-pseudo-html-line
          data-nextjs-container-errors-pseudo-html--diff={
            sign === '+' ? 'add' : 'remove'
          }
        >
          <span>
            {prefix}
            <span data-nextjs-container-errors-pseudo-html-line-sign>
              {sign}
            </span>
            {suffix}
            {'\n'}
          </span>
        </span>
      )
    }

    return (
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
        <span data-nextjs-container-errors-pseudo-html-line-sign>{sign}</span>
        {suffix}
        {'\n'}
      </span>
    )
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
  const [isExpanded, setIsExpanded] = useState(false)
  const { hasClientServerDiff, excerptComponents, fullComponents } =
    useMemo(() => {
      const reactComponentDiffLines = reactOutputComponentDiff.split('\n')
      let containsClientServerDiff = false
      for (const line of reactComponentDiffLines) {
        if (line[0] === '+' || line[0] === '-') {
          containsClientServerDiff = true
          break
        }
      }
      const displayedLines = getRenderedTreeExcerpt(
        reactComponentDiffLines,
        new Set(containsClientServerDiff ? ['+', '-'] : ['>'])
      )

      return {
        hasClientServerDiff: containsClientServerDiff,
        excerptComponents: renderDiffLines(displayedLines),
        fullComponents: renderDiffLines(reactComponentDiffLines),
      }
    }, [reactOutputComponentDiff])

  const title = hasClientServerDiff ? 'client/server diff' : 'Rendered tree'

  return (
    <div
      data-nextjs-container-errors-pseudo-html
      data-nextjs-hydration-diff-type={
        hasClientServerDiff ? 'client-server' : 'invalid-html'
      }
    >
      <div data-nextjs-hydration-diff-header>
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${title}`}
          data-nextjs-container-errors-pseudo-html-collapse-button
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          <CollapseIcon collapsed={!isExpanded} />
          <span data-nextjs-hydration-diff-title>{title}</span>
        </button>
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
        <code>{isExpanded ? fullComponents : excerptComponents}</code>
      </pre>
    </div>
  )
}

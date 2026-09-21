import { useMemo, useState } from 'react'
import { CollapseIcon } from '../../icons/collapse-icon'

function getInvalidHtmlExcerpt(lines: string[]) {
  const firstHighlightedLine = lines.findIndex((line) => line[0] === '>')

  if (firstHighlightedLine === -1) {
    return lines
  }

  const highlightedLines = lines.filter((line) => line[0] === '>')
  let parentLine: string | undefined

  for (let index = firstHighlightedLine - 1; index >= 0; index--) {
    const line = lines[index]
    const trimmedLine = line.trim()

    if (trimmedLine !== '' && trimmedLine !== '...') {
      parentLine = line
      break
    }
  }

  const excerpt = parentLine
    ? [parentLine, ...highlightedLines]
    : highlightedLines
  const minimumIndent = Math.min(
    ...excerpt.map((line) => {
      const content = line[0] === '>' ? line.slice(1) : line
      return content.length - content.trimStart().length
    })
  )

  return excerpt.map((line) => {
    if (line[0] === '>') {
      return `>${line.slice(1 + minimumIndent)}`
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
  const [isDiffCollapsed, toggleCollapseHtml] = useState(true)

  const { hasClientServerDiff, htmlComponents } = useMemo(() => {
    const componentStacks: React.ReactNode[] = []
    const reactComponentDiffLines = reactOutputComponentDiff.split('\n')
    const containsClientServerDiff = reactComponentDiffLines.some(
      (line) => line[0] === '+' || line[0] === '-'
    )
    const displayedLines = containsClientServerDiff
      ? reactComponentDiffLines
      : getInvalidHtmlExcerpt(reactComponentDiffLines)

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
      data-nextjs-container-errors-pseudo-html-collapse={
        hasClientServerDiff && isDiffCollapsed
      }
      data-nextjs-hydration-diff-type={
        hasClientServerDiff ? 'client-server' : 'invalid-html'
      }
    >
      <div data-nextjs-hydration-diff-header>
        {hasClientServerDiff ? (
          <>
            <button
              aria-expanded={!isDiffCollapsed}
              aria-label={`${isDiffCollapsed ? 'Expand' : 'Collapse'} component stack`}
              data-nextjs-container-errors-pseudo-html-collapse-button
              onClick={() => toggleCollapseHtml(!isDiffCollapsed)}
            >
              <CollapseIcon collapsed={isDiffCollapsed} />
            </button>
            <div data-nextjs-hydration-diff-badge>
              <span data-nextjs-hydration-diff-badge-item="client">
                <span>+</span> Client
              </span>
              <span data-nextjs-hydration-diff-badge-item="server">
                <span>-</span> Server
              </span>
            </div>
          </>
        ) : (
          <div data-nextjs-hydration-diff-title>Component stack</div>
        )}
      </div>
      <pre className="nextjs__container_errors__component-stack">
        <code>{htmlComponents}</code>
      </pre>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { CollapseIcon } from '../internal/icons/CollapseIcon'

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
  firstContent,
  secondContent,
  hydrationMismatchType,
  reactOutputComponentDiff,
  ...props
}: {
  firstContent: string
  secondContent: string
  reactOutputComponentDiff: string
  hydrationMismatchType: 'tag' | 'text' | 'text-in-tag'
} & React.HTMLAttributes<HTMLPreElement>) {
  const [isDiffCollapsed, toggleCollapseHtml] = useState(true)

  const htmlComponents = useMemo(() => {
    const componentStacks: React.ReactNode[] = []
    const reactComponentDiffLines = reactOutputComponentDiff!.split('\n')
    reactComponentDiffLines.forEach((line, index) => {
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
    return componentStacks
  }, [reactOutputComponentDiff])

  return (
    <div
      data-nextjs-container-errors-pseudo-html
      data-nextjs-container-errors-pseudo-html-collapse={isDiffCollapsed}
    >
      <button
        tabIndex={10} // match CallStackFrame
        data-nextjs-container-errors-pseudo-html-collapse-button
        onClick={() => toggleCollapseHtml(!isDiffCollapsed)}
      >
        <CollapseIcon collapsed={isDiffCollapsed} />
      </button>
      <pre {...props}>
        <code>{htmlComponents}</code>
      </pre>
    </div>
  )
}

import { useMemo, useState } from 'react'
import type { ComponentStackFrame } from '../internal/helpers/parse-component-stack'
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
  componentStackFrames,
  firstContent,
  secondContent,
  hydrationMismatchType,
  reactOutputComponentDiff,
  ...props
}: {
  componentStackFrames: ComponentStackFrame[]
  firstContent: string
  secondContent: string
  reactOutputComponentDiff: string
  hydrationMismatchType: 'tag' | 'text' | 'text-in-tag'
} & React.HTMLAttributes<HTMLPreElement>) {
  const [isDiffCollapsed, toggleCollapseHtml] = useState(true)

  const htmlComponents = useMemo(() => {
    const componentStacks: React.ReactNode[] = []
    let currentComponentIndex = componentStackFrames.length - 1
    const reactComponentDiffLines = reactOutputComponentDiff!.split('\n')
    reactComponentDiffLines.forEach((line, index) => {
      let trimmedLine = line.trim()
      const isDiffLine = trimmedLine[0] === '+' || trimmedLine[0] === '-'
      const isHighlightedLine = trimmedLine[0] === '>'
      const spaces = ' '.repeat(
        line.length - trimmedLine.slice(1).trim().length
      )
      if (isHighlightedLine) {
        trimmedLine = trimmedLine.slice(2).trim() // trim spaces after sign
      }

      if (isDiffLine) {
        const sign = trimmedLine[0]
        trimmedLine = trimmedLine.slice(1).trim() // trim spaces after sign
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
              {spaces}
              {trimmedLine}
              {'\n'}
            </span>
          </span>
        )
      } else if (currentComponentIndex >= 0) {
        const isUserLandComponent = trimmedLine.startsWith(
          '<' + componentStackFrames[currentComponentIndex].component
        )
        // If it's matched userland component or it's ... we will keep the component stack in diff
        if (isUserLandComponent || trimmedLine === '...') {
          currentComponentIndex--
          componentStacks.push(
            <span
              data-nextjs-container-errors-pseudo-html-line
              key={'comp-diff' + index}
              {...(isHighlightedLine
                ? {
                    'data-nextjs-container-errors-pseudo-html-line--error':
                      true,
                  }
                : undefined)}
            >
              {spaces}
              {trimmedLine}
              {'\n'}
            </span>
          )
        } else {
          componentStacks.push(
            <span
              data-nextjs-container-errors-pseudo-html-line
              key={'comp-diff' + index}
              {...(isHighlightedLine
                ? {
                    'data-nextjs-container-errors-pseudo-html-line--error':
                      true,
                  }
                : undefined)}
            >
              {spaces}
              {trimmedLine}
              {'\n'}
            </span>
          )
        }
      } else {
        // In general, if it's not collapsed, show the whole diff
        componentStacks.push(
          <span
            data-nextjs-container-errors-pseudo-html-line
            key={'comp-diff' + index}
          >
            {spaces}
            {trimmedLine}
            {'\n'}
          </span>
        )
      }
    })
    return componentStacks
  }, [componentStackFrames, reactOutputComponentDiff])

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

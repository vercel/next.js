import { useMemo, Fragment, useState } from 'react'
import type { ComponentStackFrame } from '../../helpers/parse-component-stack'
import { CollapseIcon } from '../../icons/CollapseIcon'

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
 *       <p>
 *       ^^^
 *         <p>
 *         ^^^
 *  `}</code>
 * </pre>
 * ```
 *
 * For text mismatch, it will render it for the code block
 *
 * ```diff
 * <pre>
 * <code>{`
 *   <Page>
 *     <p>
 * -     "Server Text"
 * +     "Client Text"
 *     </p>
 *   </Page>
 * `}</code>
 * ```
 */
export function PseudoHtmlDiff({
  componentStackFrames,
  serverContent,
  clientContent,
  hydrationMismatchType,
  ...props
}: {
  componentStackFrames: ComponentStackFrame[]
  serverContent: string
  clientContent: string
  hydrationMismatchType: 'tag' | 'text'
} & React.HTMLAttributes<HTMLPreElement>) {
  const isHtmlTagsWarning = hydrationMismatchType === 'tag'
  // For text mismatch, mismatched text will take 2 rows, so we display 4 rows of component stack
  const MAX_NON_COLLAPSED_FRAMES = isHtmlTagsWarning ? 6 : 4
  const shouldCollapse = componentStackFrames.length > MAX_NON_COLLAPSED_FRAMES
  const [isHtmlCollapsed, toggleCollapseHtml] = useState(shouldCollapse)

  const htmlComponents = useMemo(() => {
    const tagNames = isHtmlTagsWarning ? [serverContent, clientContent] : []
    const nestedHtmlStack: React.ReactNode[] = []
    let lastText = ''

    componentStackFrames
      .map((frame) => frame.component)
      .reverse()
      .forEach((component, index, componentList) => {
        const spaces = ' '.repeat(nestedHtmlStack.length * 2)
        const prevComponent = componentList[index - 1]
        const nextComponent = componentList[index + 1]
        // When component is the server or client tag name, highlight it

        const isHighlightedTag = tagNames.includes(component)
        const isRelatedTag =
          isHighlightedTag ||
          tagNames.includes(prevComponent) ||
          tagNames.includes(nextComponent)

        const isLastFewFrames =
          !isHtmlTagsWarning && index >= componentList.length - 6

        if ((isHtmlTagsWarning && isRelatedTag) || isLastFewFrames) {
          const codeLine = (
            <span>
              {spaces}
              <span
                {...(isHighlightedTag
                  ? {
                      'data-nextjs-container-errors-pseudo-html--tag-error':
                        true,
                    }
                  : undefined)}
              >
                {`<${component}>\n`}
              </span>
            </span>
          )
          lastText = component

          const wrappedCodeLine = (
            <Fragment key={nestedHtmlStack.length}>
              {codeLine}
              {/* Add ^^^^ to the target tags */}
              {isHighlightedTag && (
                <span>{spaces + '^'.repeat(component.length + 2) + '\n'}</span>
              )}
            </Fragment>
          )
          nestedHtmlStack.push(wrappedCodeLine)
        } else {
          if (
            nestedHtmlStack.length >= MAX_NON_COLLAPSED_FRAMES &&
            isHtmlCollapsed
          ) {
            return
          }

          if (!isHtmlCollapsed || isLastFewFrames) {
            nestedHtmlStack.push(
              <span key={nestedHtmlStack.length}>
                {spaces}
                {'<' + component + '>\n'}
              </span>
            )
          } else if (isHtmlCollapsed && lastText !== '...') {
            lastText = '...'
            nestedHtmlStack.push(
              <span key={nestedHtmlStack.length}>
                {spaces}
                {'...\n'}
              </span>
            )
          }
        }
      })

    if (hydrationMismatchType === 'text') {
      const spaces = ' '.repeat(nestedHtmlStack.length * 2)
      const wrappedCodeLine = (
        <Fragment key={nestedHtmlStack.length}>
          <span data-nextjs-container-errors-pseudo-html--diff-remove>
            {spaces + `"${serverContent}"\n`}
          </span>
          <span data-nextjs-container-errors-pseudo-html--diff-add>
            {spaces + `"${clientContent}"\n`}
          </span>
        </Fragment>
      )
      nestedHtmlStack.push(wrappedCodeLine)
    }

    return nestedHtmlStack
  }, [
    componentStackFrames,
    isHtmlCollapsed,
    clientContent,
    serverContent,
    isHtmlTagsWarning,
    hydrationMismatchType,
    MAX_NON_COLLAPSED_FRAMES,
  ])

  return (
    <div data-nextjs-container-errors-pseudo-html>
      <button
        tabIndex={10} // match CallStackFrame
        data-nextjs-container-errors-pseudo-html-collapse
        onClick={() => toggleCollapseHtml(!isHtmlCollapsed)}
      >
        <CollapseIcon collapsed={isHtmlCollapsed} />
      </button>
      <pre {...props}>
        <code>{htmlComponents}</code>
      </pre>
    </div>
  )
}

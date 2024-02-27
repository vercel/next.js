import { useMemo, Fragment, useState } from 'react'
import type { ComponentStackFrame } from '../../helpers/parse-component-stack'
import { CollapseIcon } from './GroupedStackFrames'

const MAX_NON_COLLAPSED_FRAMES = 6

/**
 *
 * Format component stack into pseudo HTML
 * component stack is an array of strings, e.g.: ['p', 'p', 'Page', ...]
 *
 * Will render it for the code block
 *
 * <pre>
 *  <code>{`
 *    <Page>
 *       <p>
 *       ^^^^
 *         <p>
 *         ^^^^
 *  `}</code>
 * </pre>
 *
 */
export function PseudoHtml({
  componentStackFrames,
  serverTagName,
  clientTagName,
  ...props
}: {
  componentStackFrames: ComponentStackFrame[]
  serverTagName?: string
  clientTagName?: string
  [prop: string]: any
}) {
  const isHtmlTagsWarning = serverTagName || clientTagName
  const shouldCollapse = componentStackFrames.length > MAX_NON_COLLAPSED_FRAMES
  const [isHtmlCollapsed, toggleCollapseHtml] = useState(shouldCollapse)

  const htmlComponents = useMemo(() => {
    let collectedComponents = 0
    const tagNames = [serverTagName, clientTagName]
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

        if (
          nestedHtmlStack.length >= MAX_NON_COLLAPSED_FRAMES &&
          isHtmlCollapsed
        ) {
          return
        }
        if (isRelatedTag) {
          const TextWrap = isHighlightedTag ? 'b' : Fragment
          collectedComponents++
          const codeLine = (
            <span>
              <span>{spaces}</span>
              <TextWrap>
                {'<'}
                {component}
                {'>'}
                {'\n'}
              </TextWrap>
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
          if (!isHtmlCollapsed || !isHtmlTagsWarning) {
            nestedHtmlStack.push(
              <span key={nestedHtmlStack.length}>
                {spaces}
                {'<' + component + '>' + '\n'}
              </span>
            )
          } else if (lastText !== '...') {
            lastText = '...'
            nestedHtmlStack.push(
              <span key={nestedHtmlStack.length}>
                {spaces}
                {'...'}
                {'\n'}
              </span>
            )
          }
        }
      })

    return nestedHtmlStack
  }, [
    componentStackFrames,
    isHtmlCollapsed,
    clientTagName,
    serverTagName,
    isHtmlTagsWarning,
  ])

  return (
    <div data-nextjs-container-errors-pseudo-html>
      <span
        data-nextjs-container-errors-pseudo-html-collapse
        onClick={() => toggleCollapseHtml(!isHtmlCollapsed)}
      >
        <CollapseIcon collapsed={isHtmlCollapsed} />
      </span>
      <pre {...props}>
        <code>{htmlComponents}</code>
      </pre>
    </div>
  )
}

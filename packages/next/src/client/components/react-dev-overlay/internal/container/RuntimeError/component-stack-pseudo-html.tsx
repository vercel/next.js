import { useMemo, Fragment } from 'react'
import type { ComponentStackFrame } from '../../helpers/parse-component-stack'

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
  componentStackFrames: ComponentStackFrame[] | undefined
  serverTagName?: string
  clientTagName?: string
  [prop: string]: any
}) {
  if (!componentStackFrames || !serverTagName || !clientTagName) return null

  const htmlComponents = useMemo(() => {
    const shouldCollapse = componentStackFrames.length > 6
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
        if (!shouldCollapse || isRelatedTag) {
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
          if (isHighlightedTag) {
            nestedHtmlStack.push(
              // Add ^^^^ to the target tags
              <>
                {codeLine}
                <span>{spaces + '^'.repeat(component.length + 2) + '\n'}</span>
              </>
            )
          } else {
            nestedHtmlStack.push(codeLine)
          }
        } else {
          if (lastText !== '...') {
            lastText = '...'
            nestedHtmlStack.push(
              <span>
                {spaces}
                {'...'}
                {'\n'}
              </span>
            )
          }
        }
      })

    return nestedHtmlStack
  }, [componentStackFrames])

  return (
    <pre {...props}>
      <code>{htmlComponents}</code>
    </pre>
  )
}

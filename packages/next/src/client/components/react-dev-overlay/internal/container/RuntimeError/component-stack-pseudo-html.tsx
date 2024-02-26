import { useMemo } from 'react'
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
 *         <p>
 *         ^^^^
 *  `}</code>
 * </pre>
 *
 */
export function PseudoHtml({
  componentStackFrames,
  ...props
}: {
  componentStackFrames: ComponentStackFrame[] | undefined
  [prop: string]: any
}) {
  if (!componentStackFrames) return null
  const htmlString = useMemo(() => {
    const nestedHtmlStack = componentStackFrames
      .map((frame) => frame.component)
      .reverse()
      .map((component, index) => {
        const spaces = ' '.repeat(index * 2)
        return `${spaces}<${component}>\n`
      })
    if (componentStackFrames.length) {
      // Add ^^^^ to the last line
      nestedHtmlStack.push(
        ' '.repeat((componentStackFrames.length - 1) * 2) + '^^^^\n'
      )
    }

    return nestedHtmlStack.join('')
  }, [componentStackFrames])

  return (
    <pre {...props}>
      <code>{htmlString}</code>
    </pre>
  )
}

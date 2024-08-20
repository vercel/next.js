import { useMemo, Fragment, useState } from 'react'
import type { ComponentStackFrame } from '../../helpers/parse-component-stack'
import { CollapseIcon } from '../../icons/CollapseIcon'

function getAdjacentProps(isAdj: boolean) {
  return { 'data-nextjs-container-errors-pseudo-html--tag-adjacent': isAdj }
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
  reactOutputComponentDiff: string | undefined
  hydrationMismatchType: 'tag' | 'text'
} & React.HTMLAttributes<HTMLPreElement>) {
  const isHtmlTagsWarning = hydrationMismatchType === 'tag'
  const isReactHydrationDiff = !!reactOutputComponentDiff

  // For text mismatch, mismatched text will take 2 rows, so we display 4 rows of component stack
  const MAX_NON_COLLAPSED_FRAMES = isHtmlTagsWarning ? 6 : 4
  const [isHtmlCollapsed, toggleCollapseHtml] = useState(true)

  const htmlComponents = useMemo(() => {
    const componentStacks: React.ReactNode[] = []
    // React 19 unified mismatch
    if (isReactHydrationDiff) {
      let currentComponentIndex = componentStackFrames.length - 1
      const reactComponentDiffLines = reactOutputComponentDiff.split('\n')
      const diffHtmlStack: React.ReactNode[] = []
      reactComponentDiffLines.forEach((line, index) => {
        let trimmedLine = line.trim()
        const isDiffLine = trimmedLine[0] === '+' || trimmedLine[0] === '-'
        const spaces = ' '.repeat(componentStacks.length * 2)

        if (isDiffLine) {
          const sign = trimmedLine[0]
          trimmedLine = trimmedLine.slice(1).trim() // trim spaces after sign
          diffHtmlStack.push(
            <span
              key={'comp-diff' + index}
              data-nextjs-container-errors-pseudo-html--diff={
                sign === '+' ? 'add' : 'remove'
              }
            >
              {sign}
              {spaces}
              {trimmedLine}
              {'\n'}
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
              <span key={'comp-diff' + index}>
                {spaces}
                {trimmedLine}
                {'\n'}
              </span>
            )
          } else if (!isHtmlCollapsed) {
            componentStacks.push(
              <span key={'comp-diff' + index}>
                {spaces}
                {trimmedLine}
                {'\n'}
              </span>
            )
          }
        }
      })
      return componentStacks.concat(diffHtmlStack)
    }

    const nestedHtmlStack: React.ReactNode[] = []
    const tagNames = isHtmlTagsWarning
      ? // tags could have < or > in the name, so we always remove them to match
        [firstContent.replace(/<|>/g, ''), secondContent.replace(/<|>/g, '')]
      : []

    let lastText = ''

    const componentStack = componentStackFrames
      .map((frame) => frame.component)
      .reverse()

    // [child index, parent index]
    const matchedIndex = [-1, -1]
    if (isHtmlTagsWarning) {
      // Reverse search for the child tag
      for (let i = componentStack.length - 1; i >= 0; i--) {
        if (componentStack[i] === tagNames[0]) {
          matchedIndex[0] = i
          break
        }
      }
      // Start searching parent tag from child tag above
      for (let i = matchedIndex[0] - 1; i >= 0; i--) {
        if (componentStack[i] === tagNames[1]) {
          matchedIndex[1] = i
          break
        }
      }
    }

    componentStack.forEach((component, index, componentList) => {
      const spaces = ' '.repeat(nestedHtmlStack.length * 2)

      // When component is the server or client tag name, highlight it
      const isHighlightedTag = isHtmlTagsWarning
        ? index === matchedIndex[0] || index === matchedIndex[1]
        : tagNames.includes(component)
      const isAdjacentTag =
        isHighlightedTag ||
        Math.abs(index - matchedIndex[0]) <= 1 ||
        Math.abs(index - matchedIndex[1]) <= 1

      const isLastFewFrames =
        !isHtmlTagsWarning && index >= componentList.length - 6

      const adjProps = getAdjacentProps(isAdjacentTag)

      if ((isHtmlTagsWarning && isAdjacentTag) || isLastFewFrames) {
        const codeLine = (
          <span>
            {spaces}
            <span
              {...adjProps}
              {...{
                ...(isHighlightedTag
                  ? {
                      'data-nextjs-container-errors-pseudo-html--tag-error':
                        true,
                    }
                  : undefined),
              }}
            >
              {`<${component}>\n`}
            </span>
          </span>
        )
        lastText = component

        const wrappedCodeLine = (
          <Fragment key={nestedHtmlStack.length}>
            {codeLine}
            {/* Add ^^^^ to the target tags used for snapshots but not displayed for users */}
            {isHighlightedTag && (
              <span data-nextjs-container-errors-pseudo-html--hint>
                {spaces + '^'.repeat(component.length + 2) + '\n'}
              </span>
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
            <span {...adjProps} key={nestedHtmlStack.length}>
              {spaces}
              {'<' + component + '>\n'}
            </span>
          )
        } else if (isHtmlCollapsed && lastText !== '...') {
          lastText = '...'
          nestedHtmlStack.push(
            <span {...adjProps} key={nestedHtmlStack.length}>
              {spaces}
              {'...\n'}
            </span>
          )
        }
      }
    })
    // Hydration mismatch: text or text-tag
    if (!isHtmlTagsWarning) {
      const spaces = ' '.repeat(nestedHtmlStack.length * 2)
      let wrappedCodeLine
      if (hydrationMismatchType === 'text') {
        // hydration type is "text", represent [server content, client content]
        wrappedCodeLine = (
          <Fragment key={nestedHtmlStack.length}>
            <span data-nextjs-container-errors-pseudo-html--diff="remove">
              {spaces + `"${firstContent}"\n`}
            </span>
            <span data-nextjs-container-errors-pseudo-html--diff="add">
              {spaces + `"${secondContent}"\n`}
            </span>
          </Fragment>
        )
      } else if (hydrationMismatchType === 'text-in-tag') {
        // hydration type is "text-in-tag", represent [parent tag, mismatch content]
        wrappedCodeLine = (
          <Fragment key={nestedHtmlStack.length}>
            <span data-nextjs-container-errors-pseudo-html--tag-adjacent>
              {spaces + `<${secondContent}>\n`}
            </span>
            <span data-nextjs-container-errors-pseudo-html--diff="remove">
              {spaces + `  "${firstContent}"\n`}
            </span>
          </Fragment>
        )
      }
      nestedHtmlStack.push(wrappedCodeLine)
    }

    return nestedHtmlStack
  }, [
    componentStackFrames,
    isHtmlCollapsed,
    firstContent,
    secondContent,
    isHtmlTagsWarning,
    hydrationMismatchType,
    MAX_NON_COLLAPSED_FRAMES,
    isReactHydrationDiff,
    reactOutputComponentDiff,
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

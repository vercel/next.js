import { useMemo, Fragment, useState } from 'react'
import type { ComponentStackFrame } from '../../helpers/parse-component-stack'
import { CollapseIcon } from '../../icons/CollapseIcon'
import { noop as css } from '../../helpers/noop-template'

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
  hydrationMismatchType: 'tag' | 'text' | 'text-in-tag'
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
        const spaces = ' '.repeat(Math.max(componentStacks.length * 2, 1))

        if (isDiffLine) {
          const sign = trimmedLine[0]
          trimmedLine = trimmedLine.slice(1).trim() // trim spaces after sign
          diffHtmlStack.push(
            <div
              key={'comp-diff' + index}
              data-nextjs-container-errors-pseudo-html--diff={
                sign === '+' ? 'add' : 'remove'
              }
            >
              <span
                className={
                  isHtmlCollapsed
                    ? 'error-overlay-hydration-error-collapsed'
                    : ''
                }
              >
                {spaces}
                {trimmedLine}
                {'\n'}
              </span>
            </div>
          )
        } else if (currentComponentIndex >= 0) {
          const isUserLandComponent = trimmedLine.startsWith(
            '<' + componentStackFrames[currentComponentIndex].component
          )
          // If it's matched userland component or it's ... we will keep the component stack in diff
          if (isUserLandComponent || trimmedLine === '...') {
            currentComponentIndex--
            componentStacks.push(
              <div key={'comp-diff' + index}>
                {spaces}
                {trimmedLine}
                {'\n'}
              </div>
            )
          } else if (!isHtmlCollapsed) {
            componentStacks.push(
              <div key={'comp-diff' + index}>
                {spaces}
                {trimmedLine}
                {'\n'}
              </div>
            )
          }
        } else if (!isHtmlCollapsed) {
          // In general, if it's not collapsed, show the whole diff
          componentStacks.push(
            <div key={'comp-diff' + index}>
              {spaces}
              {trimmedLine}
              {'\n'}
            </div>
          )
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
          <div>
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
          </div>
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
            <div data-nextjs-container-errors-pseudo-html--diff="remove">
              {spaces + `"${firstContent}"\n`}
            </div>
            <div data-nextjs-container-errors-pseudo-html--diff="add">
              {spaces + `"${secondContent}"\n`}
            </div>
          </Fragment>
        )
      } else if (hydrationMismatchType === 'text-in-tag') {
        // hydration type is "text-in-tag", represent [parent tag, mismatch content]
        wrappedCodeLine = (
          <Fragment key={nestedHtmlStack.length}>
            <div data-nextjs-container-errors-pseudo-html--tag-adjacent>
              {spaces + `<${secondContent}>\n`}
            </div>
            <div data-nextjs-container-errors-pseudo-html--diff="remove">
              {spaces + `  "${firstContent}"\n`}
            </div>
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

export const PSEUDO_HTML_DIFF_STYLES = css`
  .nextjs__container_errors__component-stack {
    margin: 0;
    background: var(--color-background-200);
  }
  [data-nextjs-container-errors-pseudo-html] {
    border-top: 1px solid var(--color-gray-400);

    color: var(--color-syntax-constant);

    font-family: var(--font-stack-monospace);
    font-size: var(--size-font-smaller);
    line-height: var(--size-4);
  }
  /* TODO(jiwon): Style when we have a design */
  [data-nextjs-container-errors-pseudo-html-collapse] {
    all: unset;

    &:focus {
      outline: none;
    }
  }
  [data-nextjs-container-errors-pseudo-html--diff='add'] {
    background: var(--color-green-300);
  }
  [data-nextjs-container-errors-pseudo-html--diff='remove'] {
    background: var(--color-red-300);
  }
  .error-overlay-hydration-error-collapsed {
    padding-left: var(--size-4);
  }
  [data-nextjs-container-errors-pseudo-html--tag-error] {
    background: var(--color-red-300);
    font-weight: bold;
  }
  /* hide but text are still accessible in DOM */
  [data-nextjs-container-errors-pseudo-html--hint] {
    display: inline-block;
    font-size: 0;
  }
  [data-nextjs-container-errors-pseudo-html--tag-adjacent='false'] {
    color: var(--color-accents-1);
  }
`

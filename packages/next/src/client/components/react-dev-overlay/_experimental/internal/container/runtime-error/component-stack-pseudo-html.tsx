import { useMemo, Fragment, useState } from 'react'
import type { ComponentStackFrame } from '../../helpers/parse-component-stack'
import { CollapseIcon } from '../../icons/collapse-icon'
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

  const hasCollapsableFrames =
    (isReactHydrationDiff
      ? reactOutputComponentDiff?.split('\n')
      : componentStackFrames
    ).length > MAX_NON_COLLAPSED_FRAMES

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
            <span
              key={'comp-diff' + index}
              data-nextjs-container-errors-pseudo-html-line
              data-nextjs-container-errors-pseudo-html--diff={
                sign === '+' ? 'add' : 'remove'
              }
            >
              <span>
                {/* Slice 2 spaces for the icon */}
                {spaces.slice(2)}
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
              >
                {spaces}
                {trimmedLine}
                {'\n'}
              </span>
            )
          } else if (!isHtmlCollapsed || !hasCollapsableFrames) {
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
        } else if (!isHtmlCollapsed) {
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
        !isHtmlTagsWarning && index >= componentList.length - 4

      const adjProps = getAdjacentProps(isAdjacentTag)

      if ((isHtmlTagsWarning && isAdjacentTag) || isLastFewFrames) {
        const codeLine = (
          <span
            data-nextjs-container-errors-pseudo-html-line
            {...(isHighlightedTag
              ? {
                  'data-nextjs-container-errors-pseudo-html-line--error': true,
                }
              : undefined)}
          >
            {spaces}
            <span {...adjProps}>{`<${component}>\n`}</span>
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
            <span
              {...adjProps}
              key={nestedHtmlStack.length}
              data-nextjs-container-errors-pseudo-html-line
            >
              {spaces}
              {'<' + component + '>\n'}
            </span>
          )
        } else if (isHtmlCollapsed && lastText !== '...') {
          lastText = '...'
          nestedHtmlStack.push(
            <span
              {...adjProps}
              key={nestedHtmlStack.length}
              data-nextjs-container-errors-pseudo-html-line
            >
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
            <span
              data-nextjs-container-errors-pseudo-html-line
              data-nextjs-container-errors-pseudo-html--diff="remove"
            >
              {spaces + `"${firstContent}"\n`}
            </span>
            <span
              data-nextjs-container-errors-pseudo-html-line
              data-nextjs-container-errors-pseudo-html--diff="add"
            >
              {spaces + `"${secondContent}"\n`}
            </span>
          </Fragment>
        )
      } else if (hydrationMismatchType === 'text-in-tag') {
        // hydration type is "text-in-tag", represent [parent tag, mismatch content]
        wrappedCodeLine = (
          <Fragment key={nestedHtmlStack.length}>
            <span
              data-nextjs-container-errors-pseudo-html-line
              data-nextjs-container-errors-pseudo-html--tag-adjacent
            >
              {spaces + `<${secondContent}>\n`}
            </span>
            <span
              data-nextjs-container-errors-pseudo-html-line
              data-nextjs-container-errors-pseudo-html--diff="remove"
            >
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
    hasCollapsableFrames,
  ])

  return (
    <div data-nextjs-container-errors-pseudo-html>
      {hasCollapsableFrames && (
        <button
          tabIndex={10} // match CallStackFrame
          data-nextjs-container-errors-pseudo-html-collapse
          onClick={() => toggleCollapseHtml(!isHtmlCollapsed)}
        >
          <CollapseIcon collapsed={isHtmlCollapsed} />
        </button>
      )}
      <pre className="nextjs__container_errors__component-stack" {...props}>
        <code>{htmlComponents}</code>
      </pre>
    </div>
  )
}

export const PSEUDO_HTML_DIFF_STYLES = css`
  [data-nextjs-container-errors-pseudo-html] {
    padding: var(--size-3) 0;
    margin: var(--size-2) var(--size-4) var(--size-4);
    border: 1px solid var(--color-gray-400);
    background: var(--color-background-200);
    color: var(--color-syntax-constant);
    font-family: var(--font-stack-monospace);
    font-size: var(--size-font-smaller);
    line-height: var(--size-4);
    border-radius: var(--size-2);
  }
  [data-nextjs-container-errors-pseudo-html-line] {
    display: inline-block;
    width: 100%;
    padding-left: var(--size-10);
    line-height: calc(5 / 3);
  }
  [data-nextjs-container-errors-pseudo-html-line--error] {
    background: var(--color-amber-300);
    font-weight: bold;
  }
  [data-nextjs-container-errors-pseudo-html-line--error]::before {
    content: '>';
    color: var(--color-red-900);
    float: left;
    width: 0;
    margin-left: calc(var(--size-6) * -1);
    margin-right: var(--size-8);
  }

  [data-nextjs-container-errors-pseudo-html-collapse] {
    all: unset;
    margin-left: var(--size-3);
    &:focus {
      outline: none;
    }
  }
  [data-nextjs-container-errors-pseudo-html--diff='add'] {
    background: var(--color-green-300);
  }
  [data-nextjs-container-errors-pseudo-html--diff='add']::before {
    content: '+';
    color: var(--color-green-900);
    float: left;
    width: 0;
    margin-left: calc(var(--size-6) * -1);
    margin-right: var(--size-8);
  }
  [data-nextjs-container-errors-pseudo-html--diff='remove'] {
    background: var(--color-red-300);
  }
  [data-nextjs-container-errors-pseudo-html--diff='remove']::before {
    content: '-';
    color: var(--color-red-900);
    float: left;
    width: 0;
    margin-left: calc(var(--size-6) * -1);
    margin-right: var(--size-8);
  }
  ${/* hide but text are still accessible in DOM */ ''}
  [data-nextjs-container-errors-pseudo-html--hint] {
    display: inline-block;
    font-size: 0;
    height: 0;
  }
  [data-nextjs-container-errors-pseudo-html--tag-adjacent='false'] {
    color: var(--color-accents-1);
  }
  .nextjs__container_errors__component-stack {
    margin: 0;
  }
  .nextjs__container_errors__component-stack code {
    display: block;
    width: 100%;
    white-space: pre-wrap;
  }
  .error-overlay-hydration-error-diff-plus-icon {
    color: var(--color-green-900);
  }
  .error-overlay-hydration-error-diff-minus-icon {
    color: var(--color-red-900);
  }
`

import {
  getHydrationWarningType,
  isHydrationError as isReact18HydrationError,
  isHydrationWarning as isReact18HydrationWarning,
} from '../../shared/react-18-hydration-error'
import {
  isHydrationError as isReact19HydrationError,
  isErrorMessageWithComponentStackDiff as isReact19HydrationWarning,
} from '../../shared/react-19-hydration-error'
import type { HydrationErrorState } from '../../shared/hydration-error'

// We only need this for React 18 or hydration console errors in React 19.
// Once we surface console.error in the dev overlay in pages router, we should only
// use this for React 18.
let hydrationErrorState: HydrationErrorState = {}

const squashedHydrationErrorDetails = new WeakMap<Error, HydrationErrorState>()

export function getSquashedHydrationErrorDetails(
  error: Error
): HydrationErrorState | null {
  return squashedHydrationErrorDetails.has(error)
    ? squashedHydrationErrorDetails.get(error)!
    : null
}

export function attachHydrationErrorState(error: Error) {
  if (!isReact18HydrationError(error) && !isReact19HydrationError(error)) {
    return
  }

  let parsedHydrationErrorState: typeof hydrationErrorState = {}

  // If there's any extra information in the error message to display,
  // append it to the error message details property
  if (hydrationErrorState.warning) {
    // The patched console.error found hydration errors logged by React
    // Append the logged warning to the error message
    parsedHydrationErrorState = {
      // It contains the warning, component stack, server and client tag names
      ...hydrationErrorState,
    }

    // Consume the cached hydration diff.
    // This is only required for now when we still squashed the hydration diff log into hydration error.
    // Once the all error is logged to dev overlay in order, this will go away.
    if (hydrationErrorState.reactOutputComponentDiff) {
      parsedHydrationErrorState.reactOutputComponentDiff =
        hydrationErrorState.reactOutputComponentDiff
    }

    squashedHydrationErrorDetails.set(error, parsedHydrationErrorState)
  }
}

// TODO: Only handle React 18. Once we surface console.error in the dev overlay in pages router,
// we can use the same behavior as App Router.
export function storeHydrationErrorStateFromConsoleArgs(...args: any[]) {
  let [message, firstContent, secondContent, ...rest] = args
  if (isReact18HydrationWarning(message)) {
    // Some hydration warnings has 4 arguments, some has 3, fallback to the last argument
    // when the 3rd argument is not the component stack but an empty string
    // For some warnings, there's only 1 argument for template.
    // The second argument is the diff or component stack.
    if (args.length === 3) {
      secondContent = ''
    }

    const warning = message
      .replace(/Warning: /, '')
      .replace('%s', firstContent)
      .replace('%s', secondContent)
      // remove the last %s from the message
      .replace(/%s/g, '')

    const lastArg = (rest[rest.length - 1] || '').trim()

    hydrationErrorState.reactOutputComponentDiff = generateHydrationDiffReact18(
      message,
      firstContent,
      secondContent,
      lastArg
    )

    hydrationErrorState.warning = warning
  } else if (isReact19HydrationWarning(message)) {
    // Some hydration warnings has 4 arguments, some has 3, fallback to the last argument
    // when the 3rd argument is not the component stack but an empty string
    // For some warnings, there's only 1 argument for template.
    // The second argument is the diff or component stack.
    if (args.length === 3) {
      secondContent = ''
    }

    const warning = message
      .replace('%s', firstContent)
      .replace('%s', secondContent)
      // remove the last %s from the message
      .replace(/%s/g, '')

    const lastArg = (args[args.length - 1] || '').trim()

    hydrationErrorState.reactOutputComponentDiff = lastArg
    hydrationErrorState.warning = warning
  }
}

/*
 * Some hydration errors in React 18 does not have the diff in the error message.
 * Instead it has the error stack trace which is component stack that we can leverage.
 * Will parse the diff from the error stack trace
 *  e.g.
 *  Warning: Expected server HTML to contain a matching <div> in <p>.
 *    at div
 *    at p
 *    at div
 *    at div
 *    at Page
 *  output:
 *    <Page>
 *      <div>
 *        <p>
 *  >       <div>
 *
 */
function generateHydrationDiffReact18(
  message: string,
  firstContent: string,
  secondContent: string,
  lastArg: string
) {
  const componentStack = lastArg
  let firstIndex = -1
  let secondIndex = -1
  const hydrationWarningType = getHydrationWarningType(message)

  // at div\n at Foo\n at Bar (....)\n -> [div, Foo]
  const components = componentStack
    .split('\n')
    // .reverse()
    .map((line: string, index: number) => {
      // `<space>at <component> (<location>)` -> `at <component> (<location>)`
      line = line.trim()
      // extract `<space>at <component>` to `<<component>>`
      // e.g. `  at Foo` -> `<Foo>`
      const [, component, location] = /at (\w+)( \((.*)\))?/.exec(line) || []
      // If there's no location then it's user-land stack frame
      if (!location) {
        if (component === firstContent && firstIndex === -1) {
          firstIndex = index
        } else if (component === secondContent && secondIndex === -1) {
          secondIndex = index
        }
      }
      return location ? '' : component
    })
    .filter(Boolean)
    .reverse()

  let diff = ''
  for (let i = 0; i < components.length; i++) {
    const component = components[i]
    const matchFirstContent =
      hydrationWarningType === 'tag' && i === components.length - firstIndex - 1
    const matchSecondContent =
      hydrationWarningType === 'tag' &&
      i === components.length - secondIndex - 1
    if (matchFirstContent || matchSecondContent) {
      const spaces = ' '.repeat(Math.max(i * 2 - 2, 0) + 2)
      diff += `> ${spaces}<${component}>\n`
    } else {
      const spaces = ' '.repeat(i * 2 + 2)
      diff += `${spaces}<${component}>\n`
    }
  }
  if (hydrationWarningType === 'text') {
    const spaces = ' '.repeat(components.length * 2)
    diff += `+ ${spaces}"${firstContent}"\n`
    diff += `- ${spaces}"${secondContent}"\n`
  } else if (hydrationWarningType === 'text-in-tag') {
    const spaces = ' '.repeat(components.length * 2)
    diff += `> ${spaces}<${secondContent}>\n`
    diff += `>   ${spaces}"${firstContent}"\n`
  }
  return diff
}

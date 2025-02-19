import {
  getHydrationErrorStackInfo,
  testReactHydrationWarning,
} from '../is-hydration-error'

export type HydrationErrorState = {
  // Hydration warning template format: <message> <serverContent> <clientContent>
  warning?: [string, string, string]
  componentStack?: string
  serverContent?: string
  clientContent?: string
  // React 19 hydration diff format: <notes> <link> <component diff?>
  notes?: string
  reactOutputComponentDiff?: string
}

type NullableText = string | null | undefined

export const hydrationErrorState: HydrationErrorState = {}

// https://github.com/facebook/react/blob/main/packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js used as a reference
const htmlTagsWarnings = new Set([
  'Warning: In HTML, %s cannot be a child of <%s>.%s\nThis will cause a hydration error.%s',
  'Warning: In HTML, %s cannot be a descendant of <%s>.\nThis will cause a hydration error.%s',
  'Warning: In HTML, text nodes cannot be a child of <%s>.\nThis will cause a hydration error.',
  "Warning: In HTML, whitespace text nodes cannot be a child of <%s>. Make sure you don't have any extra whitespace between tags on each line of your source code.\nThis will cause a hydration error.",
  'Warning: Expected server HTML to contain a matching <%s> in <%s>.%s',
  'Warning: Did not expect server HTML to contain a <%s> in <%s>.%s',
])
const textAndTagsMismatchWarnings = new Set([
  'Warning: Expected server HTML to contain a matching text node for "%s" in <%s>.%s',
  'Warning: Did not expect server HTML to contain the text node "%s" in <%s>.%s',
])

export const getHydrationWarningType = (
  message: NullableText
): 'tag' | 'text' | 'text-in-tag' => {
  if (typeof message !== 'string') {
    // TODO: Doesn't make sense to treat no message as a hydration error message.
    // We should bail out somewhere earlier.
    return 'text'
  }

  const normalizedMessage = message.startsWith('Warning: ')
    ? message
    : `Warning: ${message}`

  if (isHtmlTagsWarning(normalizedMessage)) return 'tag'
  if (isTextInTagsMismatchWarning(normalizedMessage)) return 'text-in-tag'

  return 'text'
}

const isHtmlTagsWarning = (message: string) => htmlTagsWarnings.has(message)

const isTextInTagsMismatchWarning = (msg: string) =>
  textAndTagsMismatchWarnings.has(msg)

export const getReactHydrationDiffSegments = (msg: NullableText) => {
  if (msg) {
    const { message, diff } = getHydrationErrorStackInfo(msg)
    if (message) return [message, diff]
  }
  return undefined
}

/**
 * Patch console.error to capture hydration errors.
 * If any of the knownHydrationWarnings are logged, store the message and component stack.
 * When the hydration runtime error is thrown, the message and component stack are added to the error.
 * This results in a more helpful error message in the error overlay.
 */

export function storeHydrationErrorStateFromConsoleArgs(...args: any[]) {
  let [msg, firstContent, secondContent, ...rest] = args
  if (testReactHydrationWarning(msg)) {
    // Some hydration warnings has 4 arguments, some has 3, fallback to the last argument
    // when the 3rd argument is not the component stack but an empty string
    const isReact18 = msg.startsWith('Warning: ')

    // For some warnings, there's only 1 argument for template.
    // The second argument is the diff or component stack.
    if (args.length === 3) {
      secondContent = ''
    }

    const warning: [string, string, string] = [
      // remove the last %s from the message
      msg,
      firstContent,
      secondContent,
    ]

    const lastArg = (rest[rest.length - 1] || '').trim()
    if (!isReact18) {
      hydrationErrorState.reactOutputComponentDiff = lastArg
    } else {
      hydrationErrorState.reactOutputComponentDiff =
        generateHydrationDiffReact18(msg, firstContent, secondContent, lastArg)
    }

    hydrationErrorState.warning = warning
    hydrationErrorState.serverContent = firstContent
    hydrationErrorState.clientContent = secondContent
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

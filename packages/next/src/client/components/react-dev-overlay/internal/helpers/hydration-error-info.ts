export let hydrationErrorWarning: string | undefined
export let hydrationErrorComponentStack: string | undefined

// https://github.com/facebook/react/blob/main/packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js used as a reference
const knownHydrationWarnings = new Set([
  'Warning: Text content did not match. Server: "%s" Client: "%s"%s',
  'Warning: Expected server HTML to contain a matching <%s> in <%s>.%s',
  'Warning: Expected server HTML to contain a matching text node for "%s" in <%s>.%s',
  'Warning: Did not expect server HTML to contain a <%s> in <%s>.%s',
  'Warning: Did not expect server HTML to contain the text node "%s" in <%s>.%s',
])

/**
 * Patch console.error to capture hydration errors.
 * If any of the knownHydrationWarnings are logged, store the message and component stack.
 * When the hydration runtime error is thrown, the message and component stack are added to the error.
 * This results in a more helpful error message in the error overlay.
 */
export function patchConsoleError() {
  const prev = console.error
  console.error = function (msg, serverContent, clientContent, componentStack) {
    if (knownHydrationWarnings.has(msg)) {
      hydrationErrorWarning = msg
        .replace('%s', serverContent)
        .replace('%s', clientContent)
        .replace('%s', '')
      hydrationErrorComponentStack = componentStack
    }

    // @ts-expect-error argument is defined
    prev.apply(console, arguments)
  }
}

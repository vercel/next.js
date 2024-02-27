export type HydrationErrorState = {
  // [message, serverTagName, clientTagName]
  warning?: [string, string, string]
  componentStack?: string
  serverTagName?: string
  clientTagName?: string
}

export const hydrationErrorState: HydrationErrorState = {}

// export let hydrationErrorWarning: string | undefined
// export let hydrationErrorComponentStack: string | undefined

// https://github.com/facebook/react/blob/main/packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js used as a reference
const knownHydrationWarnings = new Set([
  'Warning: In HTML, %s cannot be a descendant of <%s>.\nThis will cause a hydration error.%s',
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
  console.error = function (msg, serverTagName, clientTagName, componentStack) {
    if (knownHydrationWarnings.has(msg)) {
      hydrationErrorState.warning = [
        // remove the last %s from the message
        msg.slice(0, msg.lastIndexOf('%s')),
        serverTagName,
        clientTagName,
      ]
      hydrationErrorState.componentStack = componentStack
      hydrationErrorState.serverTagName = serverTagName
      hydrationErrorState.clientTagName = clientTagName
    }

    // @ts-expect-error argument is defined
    prev.apply(console, arguments)
  }
}

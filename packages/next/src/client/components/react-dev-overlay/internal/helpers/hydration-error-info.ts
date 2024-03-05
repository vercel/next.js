export type HydrationErrorState = {
  // [message, serverContent, clientContent]
  warning?: [string, string, string]
  componentStack?: string
  serverContent?: string
  clientContent?: string
}

type NullableText = string | null | undefined

export const isHtmlTagsWarning = (msg: NullableText) =>
  Boolean(msg && htmlTagsWarnings.has(msg))

export const isTextMismatchWarning = (msg: NullableText) =>
  Boolean(msg && textMismatchWarnings.has(msg))

const isKnownHydrationWarning = (msg: NullableText) =>
  isHtmlTagsWarning(msg) || isTextMismatchWarning(msg)

export const hydrationErrorState: HydrationErrorState = {}

// https://github.com/facebook/react/blob/main/packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js used as a reference
const htmlTagsWarnings = new Set([
  'Warning: In HTML, %s cannot be a descendant of <%s>.\nThis will cause a hydration error.%s',
  'Warning: Expected server HTML to contain a matching <%s> in <%s>.%s',
  'Warning: Did not expect server HTML to contain a <%s> in <%s>.%s',
])
const textMismatchWarnings = new Set([
  'Warning: Text content did not match. Server: "%s" Client: "%s"%s',
  'Warning: Expected server HTML to contain a matching text node for "%s" in <%s>.%s',
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
    if (isKnownHydrationWarning(msg)) {
      hydrationErrorState.warning = [
        // remove the last %s from the message
        msg,
        serverContent,
        clientContent,
      ]
      hydrationErrorState.componentStack = componentStack
      hydrationErrorState.serverContent = serverContent
      hydrationErrorState.clientContent = clientContent
    }

    // @ts-expect-error argument is defined
    prev.apply(console, arguments)
  }
}

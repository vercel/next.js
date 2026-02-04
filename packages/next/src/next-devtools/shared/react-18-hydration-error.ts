import isError from '../../lib/is-error'

export function isHydrationError(error: unknown): boolean {
  return (
    isError(error) &&
    (error.message ===
      'Hydration failed because the initial UI does not match what was rendered on the server.' ||
      error.message === 'Text content does not match server-rendered HTML.')
  )
}

export function isHydrationWarning(message: unknown): message is string {
  return (
    isHtmlTagsWarning(message) ||
    isTextInTagsMismatchWarning(message) ||
    isTextWarning(message)
  )
}

type NullableText = string | null | undefined

// https://github.com/facebook/react/blob/main/packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js used as a reference
const htmlTagsWarnings = new Set([
  'Warning: Expected server HTML to contain a matching <%s> in <%s>.%s',
  'Warning: Did not expect server HTML to contain a <%s> in <%s>.%s',
])
const textAndTagsMismatchWarnings = new Set([
  'Warning: Expected server HTML to contain a matching text node for "%s" in <%s>.%s',
  'Warning: Did not expect server HTML to contain the text node "%s" in <%s>.%s',
])
const textWarnings = new Set([
  'Warning: Text content did not match. Server: "%s" Client: "%s"%s',
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

const isHtmlTagsWarning = (message: unknown) =>
  typeof message === 'string' && htmlTagsWarnings.has(message)

const isTextInTagsMismatchWarning = (msg: unknown) =>
  typeof msg === 'string' && textAndTagsMismatchWarnings.has(msg)

const isTextWarning = (msg: unknown) =>
  typeof msg === 'string' && textWarnings.has(msg)

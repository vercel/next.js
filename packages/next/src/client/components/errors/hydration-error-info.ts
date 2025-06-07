type NullableText = string | null | undefined

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

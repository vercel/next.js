export const REACT_HYDRATION_ERROR_LINK =
  'https://react.dev/link/hydration-mismatch'
export const NEXTJS_HYDRATION_ERROR_LINK =
  'https://nextjs.org/docs/messages/react-hydration-error'

/**
 * Only React 19+ contains component stack diff in the error message
 */
const errorMessagesWithComponentStackDiff = [
  /^In HTML, (.+?) cannot be a child of <(.+?)>\.(.*)\nThis will cause a hydration error\.(.*)/,
  /^In HTML, (.+?) cannot be a descendant of <(.+?)>\.\nThis will cause a hydration error\.(.*)/,
  /^In HTML, text nodes cannot be a child of <(.+?)>\.\nThis will cause a hydration error\./,
  /^In HTML, whitespace text nodes cannot be a child of <(.+?)>\. Make sure you don't have any extra whitespace between tags on each line of your source code\.\nThis will cause a hydration error\./,
]

export function isHydrationError(error: Error): boolean {
  return (
    isErrorMessageWithComponentStackDiff(error.message) ||
    /Hydration failed because the server rendered (text|HTML) didn't match the client\./.test(
      error.message
    ) ||
    /A tree hydrated but some attributes of the server rendered HTML didn't match the client properties./.test(
      error.message
    )
  )
}

export function isErrorMessageWithComponentStackDiff(msg: string): boolean {
  return errorMessagesWithComponentStackDiff.some((regex) => regex.test(msg))
}

export function getHydrationErrorStackInfo(error: Error): {
  message: string | null
  notes: string | null
  diff: string | null
} {
  const errorMessage = error.message
  if (isErrorMessageWithComponentStackDiff(errorMessage)) {
    const [message, diffLog = ''] = errorMessage.split('\n\n')
    const diff = diffLog.trim()
    return {
      message: diff === '' ? errorMessage.trim() : message.trim(),
      diff,
      notes: null,
    }
  }

  const [message, maybeComponentStackDiff] = errorMessage.split(
    `${REACT_HYDRATION_ERROR_LINK}`
  )
  const trimmedMessage = message.trim()
  // React built-in hydration diff starts with a newline
  if (
    maybeComponentStackDiff !== undefined &&
    maybeComponentStackDiff.length > 1
  ) {
    const diffs: string[] = []
    maybeComponentStackDiff.split('\n').forEach((line) => {
      if (line.trim() === '') return
      if (!line.trim().startsWith('at ')) {
        diffs.push(line)
      }
    })

    const [displayedMessage, ...notes] = trimmedMessage.split('\n\n')
    return {
      message: displayedMessage,
      diff: diffs.join('\n'),
      notes: notes.join('\n\n') || null,
    }
  } else {
    const [displayedMessage, ...notes] = trimmedMessage.split('\n\n')
    return {
      message: displayedMessage,
      diff: null,
      notes: notes.join('\n\n'),
    }
  }
}

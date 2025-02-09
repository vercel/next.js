import isError from '../../lib/is-error'

const hydrationErrorRegex =
  /hydration failed|while hydrating|content does not match|did not match|HTML didn't match/i

const reactUnifiedMismatchWarning = `Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:`

const reactHydrationStartMessages = [
  reactUnifiedMismatchWarning,
  `A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:`,
]

const reactHydrationErrorDocLink = 'https://react.dev/link/hydration-mismatch'

export const getDefaultHydrationErrorMessage = () => {
  return reactUnifiedMismatchWarning
}

export function isHydrationError(error: unknown): boolean {
  return isError(error) && hydrationErrorRegex.test(error.message)
}

export function isReactHydrationErrorMessage(msg: string): boolean {
  return reactHydrationStartMessages.some((prefix) => msg.startsWith(prefix))
}

const hydrationWarningRegexes = [
  /^In HTML, (.+?) cannot be a child of <(.+?)>\.(.*)\nThis will cause a hydration error\.(.*)/,
  /^In HTML, (.+?) cannot be a descendant of <(.+?)>\.\nThis will cause a hydration error\.(.*)/,
  /^In HTML, text nodes cannot be a child of <(.+?)>\.\nThis will cause a hydration error\./,
  /^In HTML, whitespace text nodes cannot be a child of <(.+?)>\. Make sure you don't have any extra whitespace between tags on each line of your source code\.\nThis will cause a hydration error\./,
  /^Expected server HTML to contain a matching <(.+?)> in <(.+?)>\.(.*)/,
  /^Did not expect server HTML to contain a <(.+?)> in <(.+?)>\.(.*)/,
  /^Expected server HTML to contain a matching text node for "(.+?)" in <(.+?)>\.(.*)/,
  /^Did not expect server HTML to contain the text node "(.+?)" in <(.+?)>\.(.*)/,
  /^Text content did not match\. Server: "(.+?)" Client: "(.+?)"(.*)/,
]

export function testReactHydrationWarning(msg: string): boolean {
  if (typeof msg !== 'string' || !msg) return false
  // React 18 has the `Warning: ` prefix.
  // React 19 does not.
  if (msg.startsWith('Warning: ')) {
    msg = msg.slice('Warning: '.length)
  }
  return hydrationWarningRegexes.some((regex) => regex.test(msg))
}

export function getHydrationErrorStackInfo(rawMessage: string): {
  message: string | null
  link?: string
  stack?: string
  diff?: string
} {
  rawMessage = rawMessage.replace(/^Error: /, '')
  rawMessage = rawMessage.replace('Warning: ', '')
  const isReactHydrationWarning = testReactHydrationWarning(rawMessage)

  if (!isReactHydrationErrorMessage(rawMessage) && !isReactHydrationWarning) {
    return {
      message: null,
      link: '',
      stack: rawMessage,
      diff: '',
    }
  }

  if (isReactHydrationWarning) {
    const [message, diffLog] = rawMessage.split('\n\n')
    return {
      message: message.trim(),
      link: reactHydrationErrorDocLink,
      stack: '',
      diff: (diffLog || '').trim(),
    }
  }

  const firstLineBreak = rawMessage.indexOf('\n')
  rawMessage = rawMessage.slice(firstLineBreak + 1).trim()

  const [message, trailing] = rawMessage.split(`${reactHydrationErrorDocLink}`)
  const trimmedMessage = message.trim()
  // React built-in hydration diff starts with a newline, checking if length is > 1
  if (trailing && trailing.length > 1) {
    const stacks: string[] = []
    const diffs: string[] = []
    trailing.split('\n').forEach((line) => {
      if (line.trim() === '') return
      if (line.trim().startsWith('at ')) {
        stacks.push(line)
      } else {
        diffs.push(line)
      }
    })

    return {
      message: trimmedMessage,
      link: reactHydrationErrorDocLink,
      diff: diffs.join('\n'),
      stack: stacks.join('\n'),
    }
  } else {
    return {
      message: trimmedMessage,
      link: reactHydrationErrorDocLink,
      stack: trailing, // without hydration diff
    }
  }
}

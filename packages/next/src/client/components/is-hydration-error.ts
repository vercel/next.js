import isError from '../../lib/is-error'

const hydrationErrorRegex =
  /hydration failed|while hydrating|content does not match|did not match|HTML didn't match/i

const reactUnifiedMismatchWarning = `Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used`

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

export function getHydrationErrorStackInfo(rawMessage: string): {
  message: string | null
  link?: string
  stack?: string
  diff?: string
} {
  rawMessage = rawMessage.replace(/^Error: /, '')
  if (!isReactHydrationErrorMessage(rawMessage)) {
    return { message: null }
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

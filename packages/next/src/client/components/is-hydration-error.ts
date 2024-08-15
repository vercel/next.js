import isError from '../../lib/is-error'

const hydrationErrorRegex =
  /hydration failed|while hydrating|content does not match|did not match/i

const reactUnifiedMismatchWarning = `Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used`

const reactHydrationErrorDocLink = 'https://react.dev/link/hydration-mismatch'

export const getDefaultHydrationErrorMessage = () => {
  return (
    reactUnifiedMismatchWarning +
    '\nSee more info here: https://nextjs.org/docs/messages/react-hydration-error'
  )
}

export function isHydrationError(error: unknown): boolean {
  return isError(error) && hydrationErrorRegex.test(error.message)
}

export function isReactHydrationErrorStack(stack: string): boolean {
  return stack.startsWith(reactUnifiedMismatchWarning)
}

export function getHydrationErrorStackInfo(rawMessage: string): {
  message: string | null
  link?: string
  stack?: string
  diff?: string
} {
  rawMessage = rawMessage.replace(/^Error: /, '')
  if (!isReactHydrationErrorStack(rawMessage)) {
    return { message: null }
  }
  rawMessage = rawMessage.slice(reactUnifiedMismatchWarning.length + 1).trim()
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

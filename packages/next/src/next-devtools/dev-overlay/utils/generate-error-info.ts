import { formatCodeFrame } from '../components/code-frame/parse-code-frame'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import type { ReadyRuntimeError } from './get-error-by-type'

export async function generateErrorInfo({
  activeError,
  errorType,
  versionInfo,
  bundler,
}: {
  activeError: ReadyRuntimeError | null
  errorType: string | null
  versionInfo: string
  bundler: string
}): Promise<string> {
  if (!activeError) return ''

  const parts: string[] = []

  if (errorType) {
    parts.push(`## Error Type\n${errorType}`)
  }

  const error = activeError.error
  let message = error.message
  if ('environmentName' in error && error.environmentName) {
    const envPrefix = `[ ${error.environmentName} ] `
    if (message.startsWith(envPrefix)) {
      message = message.slice(envPrefix.length)
    }
  }
  if (message) {
    parts.push(`## Error Message\n${message}`)
  }

  const frames = await Promise.race([
    activeError.frames(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
  ])

  if (frames === null) {
    parts.push(
      'Unable to retrieve stack frames for this error. Falling back to unsourcemapped stack\n\n' +
        error.stack
    )
  } else {
    if (frames.length > 0) {
      const visibleFrames = frames.filter((frame) => !frame.ignored)
      if (visibleFrames.length > 0) {
        const stackLines = visibleFrames
          .map((frame) => {
            if (frame.originalStackFrame) {
              const { methodName, file, line1, column1 } =
                frame.originalStackFrame
              return `    at ${methodName} (${file}:${line1}:${column1})`
            } else if (frame.sourceStackFrame) {
              const { methodName, file, line1, column1 } =
                frame.sourceStackFrame
              return `    at ${methodName} (${file}:${line1}:${column1})`
            }
            return ''
          })
          .filter(Boolean)

        if (stackLines.length > 0) {
          parts.push(`\n${stackLines.join('\n')}`)
        }
      }
    }

    const firstFirstPartyFrameIndex = frames.findIndex(
      (entry) =>
        !entry.ignored &&
        Boolean(entry.originalCodeFrame) &&
        Boolean(entry.originalStackFrame)
    )

    const firstFrame = frames[firstFirstPartyFrameIndex] ?? null
    if (firstFrame?.originalCodeFrame) {
      const decodedCodeFrame = stripAnsi(
        formatCodeFrame(firstFrame.originalCodeFrame)
      )
      parts.push(`## Code Frame\n${decodedCodeFrame}`)
    }
  }

  return `${parts.join('\n\n')}

Next.js version: ${versionInfo} (${bundler})\n`
}

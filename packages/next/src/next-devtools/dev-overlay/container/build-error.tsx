import React, { useCallback, useMemo } from 'react'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { Terminal } from '../components/terminal'
import { ErrorOverlayLayout } from '../components/errors/error-overlay-layout/error-overlay-layout'
import type { ErrorBaseProps } from '../components/errors/error-overlay/error-overlay'

interface BuildErrorProps extends ErrorBaseProps {
  message: string
}

const getErrorTextFromBuildErrorMessage = (multiLineMessage: string) => {
  const lines = multiLineMessage.split('\n')
  // The multi-line build error message looks like:
  // <file path>:<line number>:<column number>
  // <error message>
  // <error code frame of compiler or bundler>
  // e.g.
  // ./path/to/file.js:1:1
  // SyntaxError: ...
  // > 1 | con st foo =
  // ...
  return (
    stripAnsi(lines[1] || '')
      // label will already say that it's an error
      .replace(/^Error: /, '')
  )
}

export const BuildError: React.FC<BuildErrorProps> = function BuildError({
  message,
  ...props
}) {
  const noop = useCallback(() => {}, [])
  const error = new Error(message)
  const formattedMessage = useMemo(
    () => getErrorTextFromBuildErrorMessage(message) || 'Failed to compile',
    [message]
  )

  const generateErrorInfo = useCallback(() => {
    const parts: string[] = []

    // 1. Error Type
    parts.push(`## Error Type\nBuild Error`)

    // 2. Error Message
    if (formattedMessage) {
      parts.push(`## Error Message\n${formattedMessage}`)
    }

    // 3. Build Output (decoded stderr)
    if (message) {
      const decodedOutput = stripAnsi(message)
      parts.push(`## Build Output\n${decodedOutput}`)
    }

    // Format as AI prompt
    const errorInfo = `${parts.join('\n\n')}

Next.js version: ${props.versionInfo.installed} (${process.env.__NEXT_BUNDLER})\n`

    return errorInfo
  }, [message, formattedMessage, props.versionInfo])

  return (
    <ErrorOverlayLayout
      errorType="Build Error"
      errorMessage={formattedMessage}
      onClose={noop}
      error={error}
      generateErrorInfo={generateErrorInfo}
      {...props}
    >
      <Terminal content={message} />
    </ErrorOverlayLayout>
  )
}

export const styles = ``

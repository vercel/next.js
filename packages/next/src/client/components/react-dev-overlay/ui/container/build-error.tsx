import React, { useCallback, useMemo } from 'react'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import { Terminal } from '../components/terminal'
import { ErrorOverlayLayout } from '../components/errors/error-overlay-layout/error-overlay-layout'
import type { ErrorBaseProps } from '../components/errors/error-overlay/error-overlay'

export interface BuildErrorProps extends ErrorBaseProps {
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
  return stripAnsi(lines[1] || '')
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

  return (
    <ErrorOverlayLayout
      errorType="Build Error"
      errorMessage={formattedMessage}
      onClose={noop}
      error={error}
      footerMessage="This error occurred during the build process and can only be dismissed by fixing the error."
      {...props}
    >
      <Terminal content={message} />
    </ErrorOverlayLayout>
  )
}

export const styles = ``

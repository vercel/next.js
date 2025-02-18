import * as React from 'react'
import { Terminal } from '../components/terminal'
import { noop as css } from '../helpers/noop-template'
import { ErrorOverlayLayout } from '../components/errors/error-overlay-layout/error-overlay-layout'
import type { ErrorBaseProps } from '../components/errors/error-overlay/error-overlay'

export interface BuildErrorProps extends ErrorBaseProps {
  message: string
}

export const BuildError: React.FC<BuildErrorProps> = function BuildError({
  message,
  ...props
}) {
  const noop = React.useCallback(() => {}, [])
  const error = new Error(message)
  return (
    <ErrorOverlayLayout
      errorType="Build Error"
      errorMessage="Failed to compile"
      onClose={noop}
      error={error}
      footerMessage="This error occurred during the build process and can only be dismissed by fixing the error."
      {...props}
    >
      <Terminal content={error.message} />
    </ErrorOverlayLayout>
  )
}

export const styles = css``

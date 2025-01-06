import * as React from 'react'
import type { VersionInfo } from '../../../../../../server/dev/parse-version-info'
import { Terminal } from '../components/Terminal'
import { noop as css } from '../helpers/noop-template'
import { ErrorOverlayLayout } from '../components/Errors/ErrorOverlayLayout/ErrorOverlayLayout'

export type BuildErrorProps = { message: string; versionInfo?: VersionInfo }

export const BuildError: React.FC<BuildErrorProps> = function BuildError({
  message,
  versionInfo,
}) {
  const noop = React.useCallback(() => {}, [])
  return (
    <ErrorOverlayLayout
      errorType="Build Error"
      errorMessage="Failed to compile"
      onClose={noop}
      versionInfo={versionInfo}
      footerMessage="This error occurred during the build process and can only be dismissed by fixing the error."
    >
      <Terminal content={message} />
    </ErrorOverlayLayout>
  )
}

export const styles = css`
  h1.nextjs__container_errors_label {
    font-size: var(--size-font-big);
    line-height: var(--size-font-bigger);
    font-weight: bold;
    margin: var(--size-gap-double) 0;
  }
  .nextjs-container-errors-body footer {
    margin-top: var(--size-gap);
  }
  .nextjs-container-errors-body footer p {
    margin: 0;
  }

  .nextjs-container-errors-body small {
    color: var(--color-font);
  }
`

import { useState, useMemo, useEffect, useRef, Suspense } from 'react'
import type { DebugInfo } from '../../../types'
import { Overlay } from '../components/overlay'
import { noop as css } from '../helpers/noop-template'
import { RuntimeError } from './runtime-error'
import { getErrorSource } from '../../../../../../shared/lib/error-source'
import { HotlinkedText } from '../components/hot-linked-text'
import { PseudoHtmlDiff } from './runtime-error/component-stack-pseudo-html'
import {
  type HydrationErrorState,
  getHydrationWarningType,
} from '../../../../errors/hydration-error-info'
import {
  getUnhandledErrorType,
  isUnhandledConsoleOrRejection,
} from '../../../../errors/console-error'
import { extractNextErrorCode } from '../../../../../../lib/error-telemetry-utils'
import { ErrorOverlayLayout } from '../components/errors/error-overlay-layout/error-overlay-layout'
import type { ReadyRuntimeError } from '../../../internal/helpers/get-error-by-type'
import type { ErrorBaseProps } from '../components/errors/error-overlay/error-overlay'

export interface ErrorsProps extends ErrorBaseProps {
  readyErrors: ReadyRuntimeError[]
  debugInfo: DebugInfo
  onClose: () => void
}

type ReadyErrorEvent = ReadyRuntimeError

function isNextjsLink(text: string): boolean {
  return text.startsWith('https://nextjs.org')
}

function ErrorDescription({
  error,
  hydrationWarning,
}: {
  error: Error
  hydrationWarning: string | null
}) {
  const isUnhandledOrReplayError = isUnhandledConsoleOrRejection(error)
  const unhandledErrorType = isUnhandledOrReplayError
    ? getUnhandledErrorType(error)
    : null
  const isConsoleErrorStringMessage = unhandledErrorType === 'string'
  // If the error is:
  // - hydration warning
  // - captured console error or unhandled rejection
  // skip displaying the error name
  const title =
    (isUnhandledOrReplayError && isConsoleErrorStringMessage) ||
    hydrationWarning
      ? ''
      : error.name + ': '

  // If it's replayed error, display the environment name
  const environmentName =
    'environmentName' in error ? error['environmentName'] : ''
  const envPrefix = environmentName ? `[ ${environmentName} ] ` : ''
  return (
    <>
      {envPrefix}
      {title}
      <HotlinkedText
        text={hydrationWarning || error.message}
        matcher={isNextjsLink}
      />
    </>
  )
}

export function Errors({
  readyErrors,
  debugInfo,
  onClose,
  ...props
}: ErrorsProps) {
  const dialogResizerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Close the error overlay when pressing escape
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const isLoading = useMemo<boolean>(() => {
    return readyErrors.length < 1
  }, [readyErrors.length])

  const [activeIdx, setActiveIndex] = useState<number>(0)

  const activeError = useMemo<ReadyErrorEvent | null>(
    () => readyErrors[activeIdx] ?? null,
    [activeIdx, readyErrors]
  )

  if (isLoading) {
    // TODO: better loading state
    return <Overlay />
  }

  if (!activeError) {
    return null
  }

  const error = activeError.error
  const isServerError = ['server', 'edge-server'].includes(
    getErrorSource(error) || ''
  )
  const isUnhandledError = isUnhandledConsoleOrRejection(error)
  const errorDetails: HydrationErrorState = (error as any).details || {}
  const notes = errorDetails.notes || ''
  const [warningTemplate, serverContent, clientContent] =
    errorDetails.warning || [null, '', '']

  const hydrationErrorType = getHydrationWarningType(warningTemplate)
  const hydrationWarning = warningTemplate
    ? warningTemplate
        .replace('%s', serverContent)
        .replace('%s', clientContent)
        .replace('%s', '') // remove the %s for stack
        .replace(/%s$/, '') // If there's still a %s at the end, remove it
        .replace(/^Warning: /, '')
        .replace(/^Error: /, '')
    : null

  const errorCode = extractNextErrorCode(error)

  const footerMessage = isServerError
    ? 'This error happened while generating the page. Any console logs will be displayed in the terminal window.'
    : undefined

  return (
    <ErrorOverlayLayout
      errorCode={errorCode}
      errorType={
        isServerError
          ? 'Runtime Error'
          : isUnhandledError
            ? 'Console Error'
            : 'Unhandled Runtime Error'
      }
      errorMessage={
        <ErrorDescription error={error} hydrationWarning={hydrationWarning} />
      }
      onClose={isServerError ? undefined : onClose}
      debugInfo={debugInfo}
      error={error}
      readyErrors={readyErrors}
      activeIdx={activeIdx}
      setActiveIndex={setActiveIndex}
      footerMessage={footerMessage}
      dialogResizerRef={dialogResizerRef}
      {...props}
    >
      <div className="error-overlay-notes-container">
        {notes ? (
          <>
            <p
              id="nextjs__container_errors__notes"
              className="nextjs__container_errors__notes"
            >
              {notes}
            </p>
          </>
        ) : null}
        {hydrationWarning ? (
          <p
            id="nextjs__container_errors__link"
            className="nextjs__container_errors__link"
          >
            <HotlinkedText text="See more info here: https://nextjs.org/docs/messages/react-hydration-error" />
          </p>
        ) : null}
      </div>

      {hydrationWarning &&
      (activeError.componentStackFrames?.length ||
        !!errorDetails.reactOutputComponentDiff) ? (
        <PseudoHtmlDiff
          className="nextjs__container_errors__component-stack"
          hydrationMismatchType={hydrationErrorType}
          firstContent={serverContent}
          secondContent={clientContent}
          reactOutputComponentDiff={errorDetails.reactOutputComponentDiff || ''}
        />
      ) : null}
      <Suspense fallback={<div data-nextjs-error-suspended />}>
        <RuntimeError
          key={activeError.id.toString()}
          error={activeError}
          dialogResizerRef={dialogResizerRef}
        />
      </Suspense>
    </ErrorOverlayLayout>
  )
}

export const styles = css`
  .nextjs-error-with-static {
    bottom: calc(var(--size-gap-double) * 4.5);
  }
  p.nextjs__container_errors__link {
    font-size: 14px;
  }
  p.nextjs__container_errors__notes {
    color: var(--color-stack-notes);
    font-size: 14px;
    line-height: 1.5;
  }
  .nextjs-container-errors-body > h2:not(:first-child) {
    margin-top: calc(var(--size-gap-double) + var(--size-gap));
  }
  .nextjs-container-errors-body > h2 {
    color: var(--color-title-color);
    margin-bottom: var(--size-gap);
    font-size: var(--size-font-big);
  }
  .nextjs-toast-errors-parent {
    cursor: pointer;
    transition: transform 0.2s ease;
  }
  .nextjs-toast-errors-parent:hover {
    transform: scale(1.1);
  }
  .nextjs-toast-errors {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }
  .nextjs-toast-errors > svg {
    margin-right: var(--size-gap);
  }
  .nextjs-toast-hide-button {
    margin-left: var(--size-gap-triple);
    border: none;
    background: none;
    color: var(--color-ansi-bright-white);
    padding: 0;
    transition: opacity 0.25s ease;
    opacity: 0.7;
  }
  .nextjs-toast-hide-button:hover {
    opacity: 1;
  }
  .nextjs__container_errors_inspect_copy_button {
    cursor: pointer;
    background: none;
    border: none;
    color: var(--color-ansi-bright-white);
    font-size: 1.5rem;
    padding: 0;
    margin: 0;
    margin-left: var(--size-gap);
    transition: opacity 0.25s ease;
  }
  .nextjs__container_errors__error_title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--size-3);
  }
  .error-overlay-notes-container {
    padding: 0 var(--size-4);
  }
  .error-overlay-notes-container p {
    white-space: pre-wrap;
  }
`

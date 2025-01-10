import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
  type UnhandledErrorAction,
  type UnhandledRejectionAction,
} from '../../../shared'
import type { DebugInfo } from '../../../types'
import { Overlay } from '../components/Overlay'
import { getErrorByType } from '../helpers/get-error-by-type'
import type { ReadyRuntimeError } from '../helpers/get-error-by-type'
import { noop as css } from '../helpers/noop-template'
import { RuntimeError } from './RuntimeError'
import type { VersionInfo } from '../../../../../../server/dev/parse-version-info'
import { getErrorSource } from '../../../../../../shared/lib/error-source'
import { HotlinkedText } from '../components/hot-linked-text'
import { PseudoHtmlDiff } from './RuntimeError/component-stack-pseudo-html'
import {
  type HydrationErrorState,
  getHydrationWarningType,
} from '../../../../errors/hydration-error-info'
import {
  getUnhandledErrorType,
  isUnhandledConsoleOrRejection,
} from '../../../../errors/console-error'
import { extractNextErrorCode } from '../../../../../../lib/error-telemetry-utils'
import { DevToolsIndicator } from '../components/Errors/dev-tools-indicator/dev-tools-indicator'
import { ErrorOverlayLayout } from '../components/Errors/error-overlay-layout/error-overlay-layout'

export type SupportedErrorEvent = {
  id: number
  event: UnhandledErrorAction | UnhandledRejectionAction
}
export type ErrorsProps = {
  isAppDir: boolean
  errors: SupportedErrorEvent[]
  initialDisplayState: DisplayState
  versionInfo?: VersionInfo
  hasStaticIndicator?: boolean
  debugInfo?: DebugInfo
  isTurbopackEnabled: boolean
}

type ReadyErrorEvent = ReadyRuntimeError

type DisplayState = 'minimized' | 'fullscreen' | 'hidden'

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

function getErrorSignature(ev: SupportedErrorEvent): string {
  const { event } = ev
  switch (event.type) {
    case ACTION_UNHANDLED_ERROR:
    case ACTION_UNHANDLED_REJECTION: {
      return `${event.reason.name}::${event.reason.message}::${event.reason.stack}`
    }
    default: {
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _: never = event as never
  return ''
}

export function Errors({
  isAppDir,
  errors,
  initialDisplayState,
  hasStaticIndicator,
  debugInfo,
  versionInfo,
  isTurbopackEnabled,
}: ErrorsProps) {
  const [lookups, setLookups] = useState(
    {} as { [eventId: string]: ReadyErrorEvent }
  )

  const [readyErrors, nextError] = useMemo<
    [ReadyErrorEvent[], SupportedErrorEvent | null]
  >(() => {
    let ready: ReadyErrorEvent[] = []
    let next: SupportedErrorEvent | null = null

    // Ensure errors are displayed in the order they occurred in:
    for (let idx = 0; idx < errors.length; ++idx) {
      const e = errors[idx]
      const { id } = e
      if (id in lookups) {
        ready.push(lookups[id])
        continue
      }

      // Check for duplicate errors
      if (idx > 0) {
        const prev = errors[idx - 1]
        if (getErrorSignature(prev) === getErrorSignature(e)) {
          continue
        }
      }

      next = e
      break
    }

    return [ready, next]
  }, [errors, lookups])

  const isLoading = useMemo<boolean>(() => {
    return readyErrors.length < 1 && Boolean(errors.length)
  }, [errors.length, readyErrors.length])

  useEffect(() => {
    if (nextError == null) {
      return
    }
    let mounted = true

    getErrorByType(nextError, isAppDir).then(
      (resolved) => {
        // We don't care if the desired error changed while we were resolving,
        // thus we're not tracking it using a ref. Once the work has been done,
        // we'll store it.
        if (mounted) {
          setLookups((m) => ({ ...m, [resolved.id]: resolved }))
        }
      },
      () => {
        // TODO: handle this, though an edge case
      }
    )

    return () => {
      mounted = false
    }
  }, [nextError, isAppDir])

  const [displayState, setDisplayState] =
    useState<DisplayState>(initialDisplayState)
  const [activeIdx, setActiveIndex] = useState<number>(0)

  const activeError = useMemo<ReadyErrorEvent | null>(
    () => readyErrors[activeIdx] ?? null,
    [activeIdx, readyErrors]
  )

  const minimize = useCallback(() => setDisplayState('minimized'), [])

  // Reset component state when there are no errors to be displayed.
  // Note: We show the dev tools indicator in minimized state even with no errors
  // as it serves as a persistent development tools access point
  useEffect(() => {
    if (errors.length < 1) {
      setLookups({})
      minimize()
      setActiveIndex(0)
    }
  }, [errors.length, minimize])

  const hide = useCallback(() => setDisplayState('hidden'), [])
  const fullscreen = useCallback(() => setDisplayState('fullscreen'), [])

  if (displayState === 'hidden') {
    return null
  }

  const noIssues = errors.length < 1 || activeError == null

  if (noIssues || displayState === 'minimized') {
    return (
      <DevToolsIndicator
        hasStaticIndicator={hasStaticIndicator}
        readyErrors={readyErrors}
        fullscreen={fullscreen}
        hide={hide}
        versionInfo={versionInfo}
        isTurbopackEnabled={isTurbopackEnabled}
      />
    )
  }

  if (isLoading) {
    // TODO: better loading state
    return <Overlay />
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
      onClose={isServerError ? undefined : minimize}
      debugInfo={debugInfo}
      error={error}
      readyErrors={readyErrors}
      activeIdx={activeIdx}
      setActiveIndex={setActiveIndex}
      footerMessage={footerMessage}
      versionInfo={versionInfo}
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
          componentStackFrames={activeError.componentStackFrames || []}
          firstContent={serverContent}
          secondContent={clientContent}
          reactOutputComponentDiff={errorDetails.reactOutputComponentDiff}
        />
      ) : null}
      <RuntimeError key={activeError.id.toString()} error={activeError} />
    </ErrorOverlayLayout>
  )
}

export const styles = css`
  .nextjs-error-with-static {
    bottom: calc(var(--size-gap-double) * 4.5);
  }
  p.nextjs__container_errors__link {
    color: var(--color-text-color-red-1);
    font-weight: 600;
    font-size: 15px;
  }
  p.nextjs__container_errors__notes {
    color: var(--color-stack-notes);
    font-weight: 600;
    font-size: 15px;
  }
  .nextjs-container-errors-body > h2:not(:first-child) {
    margin-top: calc(var(--size-gap-double) + var(--size-gap));
  }
  .nextjs-container-errors-body > h2 {
    color: var(--color-title-color);
    margin-bottom: var(--size-gap);
    font-size: var(--size-font-big);
  }
  .nextjs__container_errors__component-stack {
    margin: 0;
    padding: 12px 32px;
    color: var(--color-ansi-fg);
    background: var(--color-ansi-bg);
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
    padding: 0 var (--size-4);
  }
`
